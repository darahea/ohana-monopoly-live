window.Ohana = (() => {
  const state = { value: null, socket: null };

  // 7x7 grid path (49 cells total, but we use only 24 perimeter cells; board has 20 tiles
  // so we map them onto a 6x6 perimeter starting from top-left, going right then down then left then up)
  // We keep the original layout from v2: top row, right column, bottom row reversed, left column reversed.
  const GRID_POSITIONS = [
    [1,6], [2,6], [3,6], [4,6], [5,6], [6,6],
    [6,5], [6,4], [6,3], [6,2], [6,1],
    [5,1], [4,1], [3,1], [2,1], [1,1],
    [1,2], [1,3], [1,4], [1,5]
  ];

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function api(path, payload = {}) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `요청 실패: ${response.status}`);
    return data;
  }

  async function getState() {
    const response = await fetch('/api/state');
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || '상태를 불러올 수 없습니다.');
    state.value = data.state;
    return data.state;
  }

  function subscribe(onUpdate) {
    if (!window.io) {
      setInterval(() => getState().then(onUpdate).catch(() => {}), 1500);
      return;
    }
    if (state.socket) state.socket.disconnect();
    state.socket = window.io();
    state.socket.on('state', (nextState) => {
      state.value = nextState;
      onUpdate(nextState);
    });
  }

  const teamById = (gameState, teamId) => (gameState?.teams || []).find((t) => t.id === teamId) || null;
  const spaceByIndex = (gameState, index) => (gameState?.board || [])[Number(index)] || null;
  const teamsOnSpace = (gameState, index) => (gameState?.teams || []).filter((team) => Number(team.position) === Number(index));
  const gridPosition = (index) => GRID_POSITIONS[Number(index)] || [1, 1];

  function isLightTeamColor(hex) {
    if (!hex) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.75;
  }

  function gameStatusLabel(status) {
    if (status === 'active') return '진행 중';
    if (status === 'ended') return '종료';
    return '준비';
  }

  function formatTime(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatPosition(gameState, index) {
    const space = spaceByIndex(gameState, index);
    if (!space) return '—';
    return space.label || space.name;
  }

  function tierTagText(tier) {
    if (tier === 'high') return 'High';
    if (tier === 'mid') return 'Mid';
    return 'Low';
  }

  function renderBoard({ gameState, layerId = 'tilesLayer', centerId = 'centerSpotlight', mini = false }) {
    const layer = $(layerId);
    if (!layer || !gameState) return;
    const board = gameState.board || [];
    const lastLandingIndex = gameState.game?.lastLanding?.spaceIndex;
    const movingIndex = gameState.game?.moving?.current;
    layer.innerHTML = board.map((space, index) => renderTile({ gameState, space, index, lastLandingIndex, movingIndex, mini })).join('');
    if (centerId) renderSpotlight(gameState, centerId);
  }

  function renderTile({ gameState, space, index, lastLandingIndex, movingIndex, mini }) {
    const [col, row] = gridPosition(index);
    const owner = space.ownerTeamId ? teamById(gameState, space.ownerTeamId) : null;
    const teams = teamsOnSpace(gameState, index);
    const movingTeamId = gameState.game?.moving?.teamId;

    const currentTeamId = gameState.game?.status === 'active' ? gameState.teams[gameState.game?.currentTurnIndex]?.id : null;
    const tokenHtml = teams.map((team) => {
      const isMoving = movingTeamId === team.id;
      const isActive = !isMoving && team.id === currentTeamId;
      const cls = isMoving ? 'is-moving-token' : isActive ? 'is-active-token' : '';
      return `<span class="token-dot ${cls}" title="${escapeHtml(team.name)}" style="--team-color:${escapeHtml(team.color)}">${escapeHtml(team.shortName || team.name.slice(0, 1))}</span>`;
    }).join('');

    const tileTypeClass = `tile-${space.type}`;
    const tierClass = space.type === 'city' ? `tile-tier-${space.tier || 'low'}` : '';
    const isLightColor = owner && isLightTeamColor(owner.color);
    const classes = [
      'tile',
      tileTypeClass,
      tierClass,
      owner ? 'tile-owned' : '',
      isLightColor ? 'tile-owner-light' : '',
      Number(lastLandingIndex) === index ? 'is-landing' : '',
      Number(movingIndex) === index ? 'is-moving' : '',
      mini ? 'mini-tile' : ''
    ].filter(Boolean).join(' ');

    const ownerBadge = owner
      ? `<div class="tile-owner-badge"><span class="check" style="--owner-color:${escapeHtml(owner.color)}">✓</span><span class="owner-label">${escapeHtml(owner.name)}</span></div>`
      : '';

    const ownerStyle = owner ? `;--owner-color:${escapeHtml(owner.color)}` : '';

    let body = '';
    if (space.type === 'city') {
      const tierDollars = space.tier === 'high' ? '$$$' : space.tier === 'mid' ? '$$' : '$';
      body = `
        <div class="tile-body">
          <div class="tile-name">${escapeHtml(space.label || space.name)}</div>
          <div class="tile-subtitle">${escapeHtml(space.subtitle || '')}</div>
          <div class="tile-tier-label">${tierDollars}</div>
        </div>`;
    } else if (space.type === 'mini') {
      body = `
        <div class="tile-body tile-body-mini">
          <div class="tile-name mini-name">Mini<br/>Game</div>
          <img class="mini-icon" src="/assets/minigame-icon.png" alt="" aria-hidden="true" />
        </div>`;
    } else if (space.type === 'start') {
      body = `
        <div class="tile-body">
          <div class="tile-name">START</div>
          <div class="tile-subtitle">+${gameState.settings.passStartPoints}pts</div>
        </div>`;
    } else if (space.type === 'empty') {
      body = `
        <div class="tile-body tile-body-empty">
          <div class="empty-placeholder">도시 추가<br/>예정</div>
        </div>`;
    }

    return `<article class="${classes}" style="grid-column:${col};grid-row:${row}${ownerStyle}" title="${escapeHtml(space.name)}">
      ${ownerBadge}
      ${body}
      <div class="tile-shelf">
        <div class="token-row">${tokenHtml}</div>
      </div>
    </article>`;
  }

  const TUTORIAL_SLIDES = [
    { type: 'cover', title: 'Tutorial', image: '/assets/brand/ohana-monopoly-badge.png' },
    { title: 'How to Win', body: '**Buy** cities\n**Collect** tolls from others\n**Most points** at the end wins!', bodyKo: '도시를 **구매**하고\n다른 팀에게 **통행료**를 받고\n가장 많은 **포인트** = 우승!' },
    { title: 'Your Turn', body: '🎲 Roll **a die, twice**\nAdd the two numbers\nMove that many spaces', bodyKo: '🎲 주사위 **두 번** 굴려서\n두 숫자를 더한 만큼\n말을 이동합니다' },
    { title: 'Cities', sub: '(서울을 제외한 😢) 보드 위 모든 도시는\nSalesforce Tower가 있는 도시입니다', body: 'Empty city → **Buy** it!\nOther team\'s city → **Pay toll**!', bodyKo: '빈 도시 → **구매** 가능!\n다른 팀 도시 → **통행료** 지불!' },
    { title: 'City Pricing', sub: '도시 등급이 높을수록 투자 대비 수익이 큽니다', body: 'Cities have **3 tiers**\nHigher cost = Higher toll income!', bodySmall: '$ Low — Buy 4 / Toll 8\n$$ Mid — Buy 6 / Toll 12\n$$$ High — Buy 10 / Toll 20', bodyKo: '도시는 **3단계** 등급\n비쌀수록 통행료 수입이 높다!', bodyKoSmall: '$ 저가 — 구매 4 / 통행료 8\n$$ 중가 — 구매 6 / 통행료 12\n$$$ 고가 — 구매 10 / 통행료 20' },
    { title: '✨ Seoul Special ✨', sub: '서울에만 Salesforce Tower가 없지만\n여러분이 세울 수 있어요!', body: 'Buy Seoul → Pay **5pts** more\n→ Build **Salesforce Tower**!\nToll jumps to **20pts**', bodyKo: '서울 구매 후 → **5pts** 추가 투자\n→ **Salesforce Tower** 건설!\n통행료 **20pts**로 대폭 상승' },
    { title: 'Selling Towers', sub: '포인트가 부족할 때 전략적으로 활용하세요', body: 'Your turn → **Sell** your tower\nGet back **half** the cost', bodyKo: '자기 턴에 타워 **판매** 가능\n구매가의 **절반** 환불' },
    { title: 'Mini Games', sub: '누가 밟든 전원 참여! 역전의 기회입니다', body: 'Land here → **Everyone** plays!', bodySmall: '🥇 1st +20pts  🥈 2nd +10pts  🥉 3rd +5pts', bodyKo: '이 칸에 도착 → **전원** 참여!', bodyKoSmall: '🥇 1등 +20pts  🥈 2등 +10pts  🥉 3등 +5pts' },
    { title: 'START', sub: '보드를 한 바퀴 돌 때마다 보너스를 받습니다', body: 'Pass or land on **START**\n→ **+5pts** every time!', bodyKo: '**START**를 지나거나 도착\n→ 매번 **+5pts** 획득!' },
    { title: '🏆 Winning', sub: '라운드 완료 또는 제한시간 종료 시 게임이 끝납니다', body: 'All rounds complete **OR** time runs out\n→ **Most points** wins!', bodyKo: '모든 라운드 완료 **또는** 제한시간 종료\n→ **최다 포인트** 팀 우승!' }
  ];

  function renderTutorialOverlay(gameState) {
    const overlay = $('tutorialOverlay');
    if (!overlay) return;
    const tutorial = gameState.game?.tutorial;
    if (!tutorial) {
      overlay.classList.add('hidden');
      return;
    }
    overlay.classList.remove('hidden');
    const slide = TUTORIAL_SLIDES[tutorial.slide];
    if (!slide) {
      overlay.classList.add('hidden');
      return;
    }
    const contentSlides = TUTORIAL_SLIDES.filter((s) => s.type !== 'cover');
    if (slide.type === 'cover') {
      overlay.innerHTML = `<div class="tutorial-overlay-card tutorial-cover">
        <img src="${slide.image}" alt="Ohana Monopoly" class="tutorial-cover-img" />
        <h1 class="tutorial-cover-title">${escapeHtml(slide.title)}</h1>
      </div>`;
    } else {
      const pageNum = contentSlides.indexOf(slide) + 1;
      const fmt = (text) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(\$+)/g, '<span class="tutorial-dollar">$1</span>').replace(/\n/g, '<br>');
      const smallBlock = slide.bodySmall
        ? `<p class="tutorial-body tutorial-body-small">${fmt(slide.bodySmall)}</p>`
        : '';
      const koBlock = slide.bodyKo
        ? `<p class="tutorial-body tutorial-body-ko">${fmt(slide.bodyKo)}</p>`
        : '';
      const koSmallBlock = slide.bodyKoSmall
        ? `<p class="tutorial-body tutorial-body-ko tutorial-body-small">${fmt(slide.bodyKoSmall)}</p>`
        : '';
      const subLine = slide.sub ? `<p class="tutorial-sub">${escapeHtml(slide.sub).replace(/\n/g, '<br>')}</p>` : '';
      overlay.innerHTML = `<div class="tutorial-overlay-card">
        <img src="/assets/astro.png" alt="" class="tutorial-astro" />
        <h2 class="tutorial-title">${fmt(slide.title)}</h2>
        ${subLine}
        <p class="tutorial-body">${fmt(slide.body)}</p>
        ${smallBlock}
        ${koBlock}
        ${koSmallBlock}
        <p class="tutorial-page">${pageNum} / ${contentSlides.length}</p>
      </div>`;
    }
  }

  function renderSpotlight(gameState, centerId) {
    const center = $(centerId);
    if (!center) return;

    const spotlight = gameState.game?.spotlight;
    const activeMiniGame = gameState.game?.activeMiniGame;
    const moving = gameState.game?.moving;

    if (moving && spotlight?.type !== 'start') {
      const team = teamById(gameState, moving.teamId);
      const space = spaceByIndex(gameState, moving.current);
      const dice = gameState.game?.lastDice;
      const diceDisplay = (dice?.dice1 != null && dice?.dice2 != null)
        ? `<span class="moving-dice-face">${dice.dice1}</span><span class="moving-dice-op">+</span><span class="moving-dice-face">${dice.dice2}</span><span class="moving-dice-op">=</span><span class="moving-dice-total">${dice.value}</span>`
        : `<span class="moving-dice-total">${dice?.value ?? '—'}</span>`;
      center.innerHTML = `<div class="center-moving" style="--team-color:${escapeHtml(team?.color || '#0176d3')}">
        <div class="moving-team-name">${escapeHtml(team?.name || 'Team')}</div>
        <div class="moving-dice-row">${diceDisplay}</div>
        <div class="moving-step">Step ${moving.step} / ${moving.total} · ${escapeHtml(space?.label || space?.name || '')}</div>
      </div>`;
      return;
    }

    if (gameState.game?.status === 'ended') {
      const sorted = [...(gameState.teams || [])].sort((a, b) => b.points - a.points);
      const winner = sorted[0];
      const maxPts = Math.max(sorted[0]?.points || 1, 1);
      const minPts = Math.min(...sorted.map((t) => t.points));
      const range = maxPts - Math.min(minPts, 0) || 1;
      const maxBarPx = 240;
      const minBarPx = 120;
      const statsRows = sorted.map((t, i) => {
        const isTop3 = i < 3;
        const trophy = i === 0 ? '<span class="stats-trophy">🏆</span>' : '<span class="stats-trophy"></span>';
        const barPx = Math.max(minBarPx, Math.round(((t.points - Math.min(minPts, 0)) / range) * maxBarPx));
        return `<div class="game-end-stats-row ${isTop3 ? 'stats-row-top' : 'stats-row-rest'}">
          ${trophy}<span class="fee-team-chip stats-bar" style="--team-color:${escapeHtml(t.color || '#0176d3')};width:${barPx}px">${escapeHtml(t.name)}</span>
          <span class="game-end-stats-pts">${t.points}pts</span>
        </div>`;
      }).join('');
      center.innerHTML = `<div class="center-ended">
        <h2 class="game-end-title">Game Complete</h2>
        <div class="game-end-stats">
          ${statsRows}
        </div>
      </div>`;
      return;
    }

    if (spotlight?.type === 'team_finished') {
      const team = teamById(gameState, spotlight.teamId);
      center.innerHTML = `<div class="center-roll" style="--team-color:${escapeHtml(team?.color || '#0176d3')}">
        <div class="start-pass-banner">
          <span class="fee-team-chip" style="--team-color:${escapeHtml(team?.color || '#0176d3')}">${escapeHtml(team?.name || 'Team')}</span>
          <span class="start-pass-text">finished all rounds!</span>
        </div>
      </div>`;
      return;
    }

    if (spotlight?.type === 'start') {
      const team = teamById(gameState, spotlight.teamId);
      const laps = gameState.game?.laps?.[team?.id] || 0;
      center.innerHTML = `<div class="center-start-pass">
        <img src="/assets/astro.png" alt="Astro" class="start-pass-astro" />
        <div class="start-pass-banner">
          <span class="fee-team-chip" style="--team-color:${escapeHtml(team?.color || '#0176d3')}">${escapeHtml(team?.name || 'Team')}</span>
          <span class="start-pass-text">completed Round ${laps}</span>
          <span class="start-pass-bonus">+${gameState.settings.passStartPoints}pts</span>
        </div>
      </div>`;
      return;
    }

    if (spotlight?.type === 'tower_sold') {
      const team = teamById(gameState, spotlight.teamId);
      const city = spaceByIndex(gameState, spotlight.spaceIndex);
      center.innerHTML = `<div class="center-city">
        <div class="city-hero-wrap">
          ${city?.image ? `<img class="city-hero" src="${escapeHtml(city.image)}" alt="" />` : ''}
          <div class="city-hero-title">
            <h2>${escapeHtml(spotlight.cityLabel || '')}</h2>
          </div>
          <div class="fee-warning-banner" style="background:rgba(0,0,0,0.75)">
            <div class="fee-warning-banner-text">
              <span class="fee-team-chip" style="--team-color:${escapeHtml(team?.color || '#999')}">${escapeHtml(team?.name || 'Team')}</span>
              <span style="color:#fff">sold tower for</span> <span class="fee-amount-highlight">+${spotlight.refund}pts</span>
            </div>
          </div>
        </div>
      </div>`;
      return;
    }

    if (spotlight?.type === 'fee_warning') {
      const payer = teamById(gameState, spotlight.teamId);
      const owner = teamById(gameState, spotlight.ownerTeamId);
      const city = spaceByIndex(gameState, spotlight.spaceIndex);
      center.innerHTML = `<div class="center-city">
        <div class="city-hero-wrap">
          ${city?.image ? `<img class="city-hero" src="${escapeHtml(city.image)}" alt="" />` : ''}
          <div class="city-hero-title">
            <h2>${escapeHtml(spotlight.cityLabel || '')}</h2>
          </div>
          <div class="fee-warning-banner">
            <img class="fee-warning-banner-icon" src="/assets/warning-icon.png" alt="Warning" />
            <div class="fee-warning-banner-text">
              <span class="fee-team-chip" style="--team-color:${escapeHtml(payer?.color || '#999')}">${escapeHtml(payer?.name || 'Team')}</span>
              pays <span class="fee-amount-highlight">${spotlight.feeAmount}pts</span> to
              <span class="fee-team-chip" style="--team-color:${escapeHtml(owner?.color || '#999')}">${escapeHtml(owner?.name || 'Team')}</span>
            </div>
          </div>
        </div>
        <div class="city-stats-bar">
          <div class="city-stat-pill">
            <span class="stat-icon">💰</span>
            <div class="city-stat-label"><span class="lbl-en">TOLL</span><span class="lbl-ko">통행료</span></div>
            <div class="city-stat-value">${spotlight.feeAmount}</div>
          </div>
          <div class="city-stat-pill">
            <span class="stat-icon">🏢</span>
            <div class="city-stat-label"><span class="lbl-en">OWNER</span><span class="lbl-ko">소유팀</span></div>
            <div class="city-stat-value"><span class="fee-team-chip" style="--team-color:${escapeHtml(owner?.color || '#0176d3')};font-size:16px">${escapeHtml(owner?.name || '—')}</span></div>
          </div>
        </div>
      </div>`;
      return;
    }

    if (activeMiniGame || spotlight?.type === 'mini') {
      const trigger = teamById(gameState, activeMiniGame?.triggeredByTeamId || spotlight?.teamId);
      center.innerHTML = `<div class="center-mini-static">
        <img class="mini-spotlight-icon" src="/assets/minigame-icon.png" alt="Mini Game" />
        <h2 class="mini-spotlight-title">Mini Game</h2>
        <p class="mini-spotlight-sub">${trigger ? `Triggered by ${escapeHtml(trigger.name)}` : 'All teams play'}</p>
        <div class="mini-medals">
          <div class="medal-pill"><span class="medal-place">1st</span><span class="medal-pts">+20</span></div>
          <div class="medal-pill"><span class="medal-place">2nd</span><span class="medal-pts">+10</span></div>
          <div class="medal-pill"><span class="medal-place">3rd</span><span class="medal-pts">+5</span></div>
        </div>
      </div>`;
      return;
    }

    if (spotlight?.type === 'city') {
      const city = spaceByIndex(gameState, spotlight.spaceIndex);
      const landingTeam = teamById(gameState, spotlight.teamId);
      if (city) {
        const owner = city.ownerTeamId ? teamById(gameState, city.ownerTeamId) : null;
        center.innerHTML = `<div class="center-city">
          <div class="city-hero-wrap">
            <img class="city-hero" src="${escapeHtml(city.image)}" alt="${escapeHtml(city.name)} office spotlight" />
            <div class="city-hero-title">
              <h2>${escapeHtml(city.label || city.name)}</h2>
              <p class="city-hero-sub">${escapeHtml(city.subtitle || '')}</p>
            </div>
            <div class="city-afford-overlay">
              ${landingTeam && !owner
                ? `<p class="center-sub city-afford ${landingTeam.points >= city.cost ? 'can-buy' : 'not-enough'}"><span class="fee-team-chip" style="--team-color:${escapeHtml(landingTeam.color)}">${escapeHtml(landingTeam.name)}</span> ${landingTeam.points >= city.cost ? `has <span class="fee-amount-highlight">${landingTeam.points}pts</span> · Buy?` : `Can't afford`}</p>`
                : landingTeam && owner
                  ? `<p class="center-sub city-afford" style="background:rgba(0,0,0,0.7);color:#fff">Tower owned by <span class="fee-team-chip" style="--team-color:${escapeHtml(owner.color)}">${escapeHtml(owner.name)}</span></p>`
                  : ''}
            </div>
          </div>
          <div class="city-stats-bar">
            <div class="city-stat-pill">
              <span class="stat-icon">🏗️</span>
              <div class="city-stat-label"><span class="lbl-en">COST</span><span class="lbl-ko">건설비용</span></div>
              <div class="city-stat-value">${city.cost}</div>
            </div>
            <div class="city-stat-pill">
              <span class="stat-icon">💰</span>
              <div class="city-stat-label"><span class="lbl-en">TOLL</span><span class="lbl-ko">통행료</span></div>
              <div class="city-stat-value">${city.fee}</div>
            </div>
          </div>
        </div>`;
        return;
      }
    }

    if (gameState.game?.status === 'active') {
      const activeTeam = gameState.teams[gameState.game.currentTurnIndex];
      const finished = gameState.game?.finished || [];
      if (activeTeam && !finished.includes(activeTeam.id)) {
        center.innerHTML = `<div class="center-roll" style="--team-color:${escapeHtml(activeTeam?.color || '#0176d3')}">
          <div class="roll-team-dot"></div>
          <h2 class="roll-team-name">${escapeHtml(activeTeam?.name || 'Team')}</h2>
          <p class="roll-subtitle">Roll the Dice!</p>
        </div>`;
        return;
      }
    }

    center.innerHTML = `<div class="center-default">
      <div>
        <img src="/assets/brand/ohana-monopoly-badge.png" alt="Ohana Monopoly" class="center-default-logo" />
        <div class="workshop-title center-sub">FY27 SE Workshop</div>
      </div>
    </div>`;
  }

  function showToast(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add('hidden'), 3200);
  }

  return {
    $,
    api,
    getState,
    subscribe,
    escapeHtml,
    teamById,
    spaceByIndex,
    teamsOnSpace,
    gridPosition,
    renderBoard,
    renderSpotlight,
    renderTutorialOverlay,
    formatTime,
    formatPosition,
    showToast,
    gameStatusLabel
  };
})();
