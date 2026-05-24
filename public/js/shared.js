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
    { title: 'Game Introduction', body: 'A team-based board game!\nBuy cities, collect tolls, and\naccumulate the most points to win!', bodyKo: '팀 대항 보드게임!\n도시를 사고, 통행료를 받고,\n가장 많은 포인트를 모으면 승리!' },
    { title: 'Basic Rules', body: 'Each team starts with 5pts\nBoard: 20 spaces (15 cities + 4 minigames + 1 START)\nRoll two dice, add the numbers,\nand move that many spaces!', bodyKo: '각 팀 시작 포인트: 5pts\n보드: 20칸 (도시 15 + 미니게임 4 + START 1)\n주사위 2개를 굴려 나온 숫자를 더한 만큼 이동!' },
    { title: 'Cities', body: 'Empty city → Purchase available\nOther team\'s city → Pay toll!', bodySmall: '$ Low: Buy 4pts / Toll 8pts\n$$ Mid: Buy 6pts / Toll 12pts\n$$$ High: Buy 10pts / Toll 20pts', bodyKo: '빈 도시 → 구매 가능\n다른 팀 도시 → 통행료 지불!', bodyKoSmall: '$ 저가: 구매 4pts / 통행료 8pts\n$$ 중가: 구매 6pts / 통행료 12pts\n$$$ 고가: 구매 10pts / 통행료 20pts' },
     { title: 'Selling Towers', body: 'You may sell your tower\nduring your own turn\nfor half the purchase cost', bodyKo: '자기 턴에 보유한 타워를\n절반 가격으로 판매 가능\n(포인트가 부족할 때 활용!)' },
    { title: 'Mini Games', body: 'When any team lands on a Minigame,\nALL teams participate!', bodySmall: '1st place: +20pts\n2nd place: +10pts\n3rd place: +5pts', bodyKo: '미니게임 칸에 도착하면\n모든 팀이 참여!', bodyKoSmall: '1등: +20pts\n2등: +10pts\n3등: +5pts' },
    { title: 'START Space', body: 'Earn +5pts each time\nyou pass or land on START!', bodyKo: 'START를 지나거나 도착할 때마다\n+5pts 획득!' },
    { title: 'Winning', body: 'When all teams finish their rounds\nor time runs out,\nthe team with the most points wins!\n\nGood luck!', bodyKo: '모든 팀이 라운드를 완료하거나\n제한시간이 끝났을 때\n가장 많은 포인트를 가진 팀이 우승!\n\nGood luck!' }
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
      const smallBlock = slide.bodySmall
        ? `<p class="tutorial-body tutorial-body-small">${escapeHtml(slide.bodySmall).replace(/\n/g, '<br>')}</p>`
        : '';
      const koBlock = slide.bodyKo
        ? `<p class="tutorial-body tutorial-body-ko">${escapeHtml(slide.bodyKo).replace(/\n/g, '<br>')}</p>`
        : '';
      const koSmallBlock = slide.bodyKoSmall
        ? `<p class="tutorial-body tutorial-body-ko tutorial-body-small">${escapeHtml(slide.bodyKoSmall).replace(/\n/g, '<br>')}</p>`
        : '';
      overlay.innerHTML = `<div class="tutorial-overlay-card">
        <h2 class="tutorial-title">${escapeHtml(slide.title)}</h2>
        <p class="tutorial-body">${escapeHtml(slide.body).replace(/\n/g, '<br>')}</p>
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
