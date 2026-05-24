(() => {
  const {
    $,
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

  // Timer state
  let timerInterval = null;
  let timerEndAt = null;

  function updateTimerDisplay() {
    const display = $('timerDisplay');
    if (!display) return;
    if (!timerEndAt) {
      display.classList.add('hidden');
      return;
    }
    const remaining = Math.max(0, Math.ceil((new Date(timerEndAt).getTime() - Date.now()) / 1000));
    if (remaining <= 0) {
      display.textContent = "TIME'S UP!";
      display.classList.remove('hidden');
      display.classList.add('timer-expired');
      clearInterval(timerInterval);
      timerInterval = null;
      setTimeout(() => {
        display.classList.add('hidden');
        display.classList.remove('timer-expired');
        timerEndAt = null;
      }, 3000);
      return;
    }
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    display.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
    display.classList.remove('hidden', 'timer-expired');
  }

  function syncTimer(gameState) {
    const timer = gameState.game?.timer;
    const display = $('timerDisplay');
    if (!display) return;

    if (timer && timer.paused) {
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      timerEndAt = null;
      const minutes = Math.floor(timer.remaining / 60);
      const seconds = timer.remaining % 60;
      display.textContent = `⏸ ${minutes}:${String(seconds).padStart(2, '0')}`;
      display.classList.remove('hidden', 'timer-expired');
    } else if (timer && timer.endAt) {
      if (timerEndAt !== timer.endAt) {
        timerEndAt = timer.endAt;
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(updateTimerDisplay, 200);
        updateTimerDisplay();
      }
    } else {
      if (timerEndAt) {
        timerEndAt = null;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        display.classList.add('hidden');
        display.classList.remove('timer-expired');
      }
    }
  }

  function render(gameState) {
    const isActive = gameState.game.status === 'active';
    const activeTeam = isActive ? gameState.teams[gameState.game.currentTurnIndex] : null;
    renderCurrentTurnCard(gameState, activeTeam);
    renderRanking(gameState, activeTeam);
    renderBoard({ gameState, layerId: 'tilesLayer', centerId: 'centerSpotlight' });
    renderTutorialOverlay(gameState);
    syncTimer(gameState);

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

  function renderCurrentTurnCard(gameState, activeTeam) {
    const maxRounds = gameState.settings?.maxRounds || '—';

    if (!activeTeam) {
      $('roundDisplay').innerHTML = `Round — / ${maxRounds}`;
      $('currentTurnCard').innerHTML = `
        <div class="ct-main">
          <div class="ct-text"><div class="ct-name">Are you ready?</div></div>
        </div>`;
      return;
    }

    const dice = gameState.game.lastDice;
    const position = formatPosition(gameState, activeTeam?.position || 0);
    const moving = gameState.game.moving;

    const isCurrentDice = dice && dice.teamId === activeTeam?.id;
    const diceDisplay = isCurrentDice
      ? (dice.dice1 != null && dice.dice2 != null
          ? `<span class="dice-face">${dice.dice1}</span><span class="dice-plus">+</span><span class="dice-face">${dice.dice2}</span><span class="dice-eq">=</span><span class="dice-total">${dice.value}</span>`
          : `<span class="dice-total">${dice.value}</span>`)
      : '';

    const towers = gameState.board.filter((s) => s.type === 'city' && s.ownerTeamId === activeTeam.id).length;
    const rank = [...gameState.teams].sort((a, b) => b.points - a.points).findIndex((t) => t.id === activeTeam.id) + 1;
    const subtitle = moving
      ? `이동 중 · ${moving.step}/${moving.total}`
      : `${towers} towers · ${activeTeam.points}pts · Now ${ordinal(rank)}`;

    const currentLap = (gameState.game?.laps?.[activeTeam?.id] || 0) + 1;
    $('roundDisplay').innerHTML = `Round ${currentLap} / ${maxRounds}`;
    $('currentTurnCard').innerHTML = `
      <div class="ct-main">
        <span class="ct-dot" style="--team-color:${escapeHtml(activeTeam?.color || '#0176d3')}"></span>
        <div class="ct-text">
          <div class="ct-name">${escapeHtml(activeTeam?.name || '—')}</div>
          <div class="ct-sub">${escapeHtml(subtitle)}</div>
        </div>
      </div>
    `;
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
