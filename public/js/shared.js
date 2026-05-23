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

    const tokenHtml = teams.map((team) => {
      const isMoving = movingTeamId === team.id;
      return `<span class="token-dot ${isMoving ? 'is-moving-token' : ''}" title="${escapeHtml(team.name)}" style="--team-color:${escapeHtml(team.color)}">${escapeHtml(team.shortName || team.name.slice(0, 1))}</span>`;
    }).join('');

    const tileTypeClass = `tile-${space.type}`;
    const tierClass = space.type === 'city' ? `tile-tier-${space.tier || 'low'}` : '';
    const classes = [
      'tile',
      tileTypeClass,
      tierClass,
      owner ? 'tile-owned' : '',
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
      body = `
        <div class="tile-body">
          <div class="tile-name">${escapeHtml(space.label || space.name)}</div>
          <div class="tile-subtitle">${escapeHtml(space.subtitle || '')}</div>
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
          <div class="tile-subtitle">+${gameState.settings.passStartPoints} points</div>
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

  function renderSpotlight(gameState, centerId) {
    const center = $(centerId);
    if (!center) return;

    const spotlight = gameState.game?.spotlight;
    const activeMiniGame = gameState.game?.activeMiniGame;
    const moving = gameState.game?.moving;

    if (moving) {
      const team = teamById(gameState, moving.teamId);
      const space = spaceByIndex(gameState, moving.current);
      center.innerHTML = `<div class="center-default">
        <div>
          <div class="center-title"><span class="script">Moving</span><span class="banner-word">${escapeHtml(team?.shortName || 'Team')}</span></div>
          <div class="center-sub">${escapeHtml(team?.name || 'Team')} · Step ${moving.step} of ${moving.total} · ${escapeHtml(space?.label || space?.name || '')}</div>
          <img src="/assets/astro.png" alt="Astro mascot" class="astro" />
        </div>
      </div>`;
      return;
    }

    if (gameState.game?.status === 'ended') {
      const winner = [...(gameState.teams || [])].sort((a, b) => b.points - a.points)[0];
      center.innerHTML = `<div class="center-ended">
        <div class="game-end-trophy">🏆</div>
        <h2 class="game-end-title">Game Complete</h2>
        <p class="center-sub">${winner ? `${escapeHtml(winner.name)} leads with ${winner.points} points.` : 'Thanks for playing Ohana Monopoly.'}</p>
      </div>`;
      return;
    }

    if (spotlight?.type === 'fee_warning') {
      const payer = teamById(gameState, spotlight.teamId);
      const owner = teamById(gameState, spotlight.ownerTeamId);
      center.innerHTML = `<div class="center-fee-warning">
        <img class="fee-warning-icon" src="/assets/warning-icon.png" alt="Warning" />
        <div class="fee-warning-headline">WARNING!</div>
        <div class="fee-warning-body">
          <div class="fee-warning-line">
            <span class="fee-team-chip" style="--team-color:${escapeHtml(payer?.color || '#999')}">${escapeHtml(payer?.name || 'Team')}</span>
            이(가) 도착했습니다
          </div>
          <div class="fee-warning-city">${escapeHtml(spotlight.cityLabel || '')}</div>
          <div class="fee-warning-line">
            소유:
            <span class="fee-team-chip" style="--team-color:${escapeHtml(owner?.color || '#999')}">${escapeHtml(owner?.name || 'Team')}</span>
          </div>
        </div>
        <div class="fee-warning-amount">
          <span class="fee-amount-label">통행료</span>
          <span class="fee-amount-value">${spotlight.feeAmount} pts</span>
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
        const tierClass = `tier-${city.tier || 'low'}`;
        center.innerHTML = `<div class="center-city ${tierClass}">
          <div class="city-hero-wrap">
            <img class="city-hero" src="${escapeHtml(city.image)}" alt="${escapeHtml(city.name)} office spotlight" />
            <div class="city-hero-title">
              <div class="status-label">City Spotlight · ${escapeHtml(tierTagText(city.tier))}</div>
              <h2>${escapeHtml(city.label || city.name)}</h2>
              <p class="city-hero-sub">${escapeHtml(city.subtitle || '')}</p>
            </div>
          </div>
          <div class="city-copy">
            <div class="city-stats-row">
              <div class="city-stat big"><span>COST</span><strong>${city.cost}</strong></div>
              <div class="city-stat big"><span>FEE</span><strong>${city.fee}</strong></div>
            </div>
            <div class="city-meta-row">
              <p class="center-sub">${landingTeam ? `${escapeHtml(landingTeam.name)} arrived here.` : 'A team arrived here.'}</p>
              ${owner
                ? `<span class="owner-line"><span class="owner-dot" style="--team-color:${escapeHtml(owner.color)}"></span>Tower owned by ${escapeHtml(owner.name)}</span>`
                : '<span class="owner-line">No tower yet.</span>'}
            </div>
          </div>
        </div>`;
        return;
      }
    }

    center.innerHTML = `<div class="center-default">
      <div>
        <div class="center-title"><span class="script">Ohana</span><span class="banner-word">MONOPOLY</span></div>
        <div class="center-sub">Live board for the workshop</div>
        <img src="/assets/astro.png" alt="Astro mascot" class="astro" />
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
    formatTime,
    formatPosition,
    showToast,
    gameStatusLabel
  };
})();
