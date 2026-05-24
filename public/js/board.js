(() => {
  const {
    $,
    api,
    getState,
    subscribe,
    escapeHtml,
    teamById,
    spaceByIndex,
    renderBoard,
    renderTutorialOverlay,
    formatPosition,
    showToast,
    gameStatusLabel
  } = window.Ohana;

  // === Sound Effects (Web Audio API) ===
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  document.addEventListener('click', () => { getAudioCtx(); }, { once: true });
  document.addEventListener('keydown', () => { getAudioCtx(); }, { once: true });

  function playTone(freq, duration, type = 'sine', volume = 0.3) {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function sfxMove() {
    playTone(880, 0.08, 'square', 0.15);
  }

  function sfxToll() {
    playTone(220, 0.15, 'sawtooth', 0.25);
    setTimeout(() => playTone(180, 0.2, 'sawtooth', 0.2), 100);
  }

  function sfxMiniGame() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.15, 'square', 0.2), i * 100);
    });
  }

  function sfxBuild() {
    playTone(440, 0.1, 'triangle', 0.25);
    setTimeout(() => playTone(660, 0.1, 'triangle', 0.25), 80);
    setTimeout(() => playTone(880, 0.15, 'triangle', 0.3), 160);
  }

  function sfxStart() {
    [523, 659, 784].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.12, 'sine', 0.2), i * 80);
    });
  }

  function sfxGameStart() {
    [440, 554, 659, 880].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.2, 'square', 0.2), i * 150);
    });
  }

  function sfxGameEnd() {
    [880, 784, 659, 523].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.3, 'triangle', 0.25), i * 200);
    });
  }

  function sfxTurnChange() {
    playTone(660, 0.1, 'sine', 0.15);
    setTimeout(() => playTone(880, 0.12, 'sine', 0.15), 80);
  }
  // === End Sound Effects ===

  let prevStatus = null;
  let prevSpotlight = null;
  let prevBoardOwners = null;
  let prevTeamPoints = null;
  let prevTurnIndex = null;
  let prevMovingStep = null;
  const trendMap = {}; // { teamId: { direction: 'up'|'down', at: timestamp } }

  // Game timer state
  let gameTimerInterval = null;
  let gameTimerEndAt = null;
  let gameTimerExpired = false;

  function updateGameTimer() {
    const display = $('gameTimerDisplay');
    if (!display || !gameTimerEndAt) return;
    const remaining = Math.max(0, Math.ceil((new Date(gameTimerEndAt).getTime() - Date.now()) / 1000));
    if (remaining <= 0 && !gameTimerExpired) {
      gameTimerExpired = true;
      display.textContent = "TIME OVER";
      display.classList.add('game-timer-expired');
      clearInterval(gameTimerInterval);
      gameTimerInterval = null;
      api('/api/admin/time-over').catch(() => {});
      return;
    }
    if (remaining > 0) {
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      display.textContent = `⏱ ${mins}:${String(secs).padStart(2, '0')}`;
      display.classList.remove('game-timer-expired');
      display.classList.toggle('game-timer-warn', remaining <= 300 && remaining > 60);
      display.classList.toggle('game-timer-critical', remaining <= 60);
    }
  }

  function syncGameTimer(gameState) {
    const display = $('gameTimerDisplay');
    if (!display) return;
    const gameTimer = gameState.game?.gameTimer;
    if (gameTimer && gameTimer.endAt && gameState.game.status === 'active') {
      display.classList.remove('hidden');
      if (gameTimerEndAt !== gameTimer.endAt) {
        gameTimerEndAt = gameTimer.endAt;
        gameTimerExpired = false;
        if (gameTimerInterval) clearInterval(gameTimerInterval);
        gameTimerInterval = setInterval(updateGameTimer, 1000);
        updateGameTimer();
      }
    } else {
      display.classList.add('hidden');
      if (gameTimerInterval) { clearInterval(gameTimerInterval); gameTimerInterval = null; }
      gameTimerEndAt = null;
      gameTimerExpired = false;
    }
  }

  function render(gameState) {
    const isActive = gameState.game.status === 'active';
    const activeTeam = isActive ? gameState.teams[gameState.game.currentTurnIndex] : null;
    renderRoundDisplay(gameState, activeTeam);
    renderRanking(gameState, activeTeam);
    renderBoard({ gameState, layerId: 'tilesLayer', centerId: 'centerSpotlight' });
    renderTutorialOverlay(gameState);
    syncGameTimer(gameState);

    if (prevStatus && prevStatus !== 'active' && gameState.game.status === 'active') {
      showGameStartOverlay();
      sfxGameStart();
    }
    if (prevStatus && prevStatus !== 'ended' && gameState.game.status === 'ended') {
      showGameEndOverlay();
      sfxGameEnd();
    }

    const spotlight = gameState.game?.spotlight;
    const spotlightKey = spotlight ? `${spotlight.type}-${spotlight.at}` : null;
    const prevKey = prevSpotlight ? `${prevSpotlight.type}-${prevSpotlight.at}` : null;
    if (spotlight && spotlightKey !== prevKey) {
      if (spotlight.type === 'fee_warning') {
        showDramaticFlash('danger');
        sfxToll();
      } else if (spotlight.type === 'mini') {
        showAnnounceBanner('MINI GAME!', 'mini');
        sfxMiniGame();
      } else if (spotlight.type === 'start') {
        sfxStart();
      }
    }

    const currentOwners = gameState.board.map((s) => s.ownerTeamId || null);
    if (prevBoardOwners) {
      for (let i = 0; i < currentOwners.length; i++) {
        if (!prevBoardOwners[i] && currentOwners[i]) {
          launchMiniConfetti();
          sfxBuild();
          break;
        }
      }
    }
    prevBoardOwners = currentOwners;

    const currentPoints = {};
    gameState.teams.forEach((t) => { currentPoints[t.id] = t.points; });
    if (prevTeamPoints) {
      gameState.teams.forEach((t) => {
        const prev = prevTeamPoints[t.id];
        if (prev != null && t.points !== prev) {
          const delta = t.points - prev;
          showPointsChangeAtTeam(t.id, delta > 0 ? `+${delta}pts` : `${delta}pts`, delta > 0);
          trendMap[t.id] = { direction: delta > 0 ? 'up' : 'down', at: Date.now() };
        }
      });
    }
    prevTeamPoints = currentPoints;

    const currentTurnIndex = gameState.game.currentTurnIndex;
    const movingStep = gameState.game?.moving?.step || null;
    if (movingStep && movingStep !== prevMovingStep) {
      sfxMove();
    }
    prevMovingStep = movingStep;

    if (prevTurnIndex != null && currentTurnIndex !== prevTurnIndex && gameState.game.status === 'active') {
      const team = gameState.teams[currentTurnIndex];
      if (team) {
        showTurnBanner(team.name, team.color);
        sfxTurnChange();
      }
    }
    prevTurnIndex = currentTurnIndex;

    prevStatus = gameState.game.status;
    prevSpotlight = spotlight;
  }

  function showGameStartOverlay() {
    const overlay = $('gameStartOverlay');
    if (!overlay) return;
    overlay.querySelector('.game-start-title').textContent = 'Game Start!';
    overlay.classList.remove('hidden');
    overlay.style.animation = 'none';
    overlay.offsetHeight;
    overlay.style.animation = '';
    setTimeout(() => overlay.classList.add('hidden'), 3000);
  }

  function showGameEndOverlay() {
    const overlay = $('gameStartOverlay');
    if (!overlay) return;
    overlay.querySelector('.game-start-title').textContent = 'Game Over!';
    overlay.classList.remove('hidden');
    overlay.style.animation = 'none';
    overlay.offsetHeight;
    overlay.style.animation = '';
    setTimeout(() => {
      overlay.classList.add('hidden');
      launchConfetti();
    }, 3000);
  }

  function showDramaticFlash(type) {
    const el = document.createElement('div');
    el.className = `dramatic-flash dramatic-flash-${type}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 600);
  }

  function showAnnounceBanner(text, type) {
    const el = document.createElement('div');
    el.className = `announce-banner announce-banner-${type}`;
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  function showTurnBanner(teamName, teamColor) {
    const el = document.createElement('div');
    el.className = 'turn-banner';
    el.style.setProperty('--banner-color', teamColor || '#0176d3');
    el.textContent = `${teamName}'s Turn!`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  function showFloatingPoints(text) {
    const el = document.createElement('div');
    el.className = 'floating-points';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  function showPointsChangeAtTeam(teamId, text, isPositive) {
    const row = document.querySelector(`.rank-row[data-team-id="${teamId}"]`);
    if (row) {
      spawnFloatingAtElement(row, text, isPositive);
    }
  }

  function spawnFloatingAtElement(element, text, isPositive) {
    const rect = element.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `floating-points-inline ${isPositive ? 'floating-points-gain' : 'floating-points-loss'}`;
    el.textContent = text;
    el.style.top = `${rect.top}px`;
    el.style.left = `${rect.right + 8}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  function launchMiniConfetti() {
    const container = $('confettiContainer');
    if (!container) return;
    container.classList.remove('hidden');
    container.innerHTML = '';
    const colors = ['#0176d3', '#ffab00', '#2e844a', '#9050e9'];
    for (let i = 0; i < 40; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.setProperty('--x', `${30 + Math.random() * 40}vw`);
      piece.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
      piece.style.setProperty('--d', `${Math.random() * 1.5 + 1.5}s`);
      piece.style.setProperty('--delay', `${Math.random() * 0.5}s`);
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      container.appendChild(piece);
    }
    setTimeout(() => {
      container.classList.add('hidden');
      container.innerHTML = '';
    }, 3000);
  }

  function launchConfetti() {
    const container = $('confettiContainer');
    if (!container) return;
    container.classList.remove('hidden');
    container.innerHTML = '';
    const colors = ['#0176d3', '#ff5d2d', '#ffab00', '#2e844a', '#ea001e', '#9050e9'];
    for (let i = 0; i < 120; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.setProperty('--x', `${Math.random() * 100}vw`);
      piece.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
      piece.style.setProperty('--d', `${Math.random() * 2 + 2}s`);
      piece.style.setProperty('--delay', `${Math.random() * 1.5}s`);
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      container.appendChild(piece);
    }
    setTimeout(() => {
      container.classList.add('hidden');
      container.innerHTML = '';
    }, 5000);
  }

  function ordinal(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    switch (n % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  }

  function renderRoundDisplay(gameState, activeTeam) {
    const maxRounds = gameState.settings?.maxRounds || 3;
    if (!activeTeam) {
      $('roundDisplay').innerHTML = `<div class="round-label">ROUND</div>
        <div class="round-progress-bar"><div class="round-progress-fill" style="width:0%"></div></div>
        <div class="round-nums">— / ${maxRounds}</div>`;
      return;
    }
    const currentLap = Math.min((gameState.game?.laps?.[activeTeam?.id] || 0) + 1, maxRounds);
    const pct = Math.round((currentLap / maxRounds) * 100);
    $('roundDisplay').innerHTML = `<div class="round-label">ROUND</div>
      <div class="round-progress-bar"><div class="round-progress-fill" style="width:${pct}%"></div></div>
      <div class="round-nums"><span class="round-current">${currentLap}</span> / ${maxRounds}</div>`;
  }

  function renderRanking(gameState, activeTeam) {
    // Sort teams by points descending; preserve team order as tiebreak
    const ranked = [...gameState.teams]
      .map((team, originalIdx) => ({ team, originalIdx }))
      .sort((a, b) => b.team.points - a.team.points || a.originalIdx - b.originalIdx);

    const finished = gameState.game?.finished || [];
    const ranks = [];
    for (let i = 0; i < ranked.length; i++) {
      ranks[i] = (i === 0 || ranked[i].team.points !== ranked[i - 1].team.points) ? i + 1 : ranks[i - 1];
    }
    const now = Date.now();
    $('rankingList').innerHTML = ranked.map(({ team }, idx) => {
      const isCurrent = activeTeam?.id === team.id;
      const isFinished = finished.includes(team.id);
      const towers = gameState.board.filter((s) => s.type === 'city' && s.ownerTeamId === team.id).length;
      const rankLabel = ordinal(ranks[idx]);
      const rowClass = isFinished ? 'is-finished' : isCurrent ? 'is-current' : '';
      const trend = trendMap[team.id];
      const trendHtml = (trend && now - trend.at < 3000)
        ? `<span class="rank-trend rank-trend-${trend.direction}">${trend.direction === 'up' ? '▲' : '▼'}</span>`
        : '';
      return `<div class="rank-row ${rowClass}" data-team-id="${escapeHtml(team.id)}" style="--team-color:${escapeHtml(team.color)}">
        <div class="rank-badge">${rankLabel}</div>
        <div class="rank-team">
          <strong>${escapeHtml(team.name)}</strong>
          <span>${towers} tower${towers !== 1 ? 's' : ''}</span>
        </div>
        ${isCurrent ? '<img src="/assets/astro.png" alt="" class="rank-astro" />' : ''}
        <div class="rank-points"><strong>${team.points}</strong><span>pts</span>${trendHtml}</div>
      </div>`;
    }).join('');
  }

  getState().then(render).catch((error) => showToast(error.message));
  subscribe(render);
})();
