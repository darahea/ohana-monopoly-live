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

  let prevStatus = null;

  function render(gameState) {
    const isActive = gameState.game.status === 'active';
    const activeTeam = isActive ? gameState.teams[gameState.game.currentTurnIndex] : null;
    renderCurrentTurnCard(gameState, activeTeam);
    renderRanking(gameState, activeTeam);
    renderBoard({ gameState, layerId: 'tilesLayer', centerId: 'centerSpotlight' });
    renderTutorialOverlay(gameState);

    if (prevStatus && prevStatus !== 'active' && gameState.game.status === 'active') {
      showGameStartOverlay();
    }
    if (prevStatus && prevStatus !== 'ended' && gameState.game.status === 'ended') {
      showGameEndOverlay();
    }
    prevStatus = gameState.game.status;
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
      : `${towers} towers · ${activeTeam.points} pt · Now ${ordinal(rank)}`;

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
    $('rankingList').innerHTML = ranked.map(({ team }, rank) => {
      const isCurrent = activeTeam?.id === team.id;
      const isFinished = finished.includes(team.id);
      const towers = gameState.board.filter((s) => s.type === 'city' && s.ownerTeamId === team.id).length;
      const rankLabel = ordinal(rank + 1);
      const rowClass = isFinished ? 'is-finished' : isCurrent ? 'is-current' : '';
      return `<div class="rank-row ${rowClass}" style="--team-color:${escapeHtml(team.color)}">
        <div class="rank-badge">${rankLabel}</div>
        <div class="rank-team">
          <strong>${escapeHtml(team.name)}</strong>
          <span>${towers} tower${towers !== 1 ? 's' : ''}${isFinished ? ' · Done' : ''}</span>
        </div>
        ${isCurrent ? '<img src="/assets/astro.png" alt="" class="rank-astro" />' : ''}
        <div class="rank-points"><strong>${team.points}</strong><span>pts</span></div>
      </div>`;
    }).join('');
  }

  getState().then(render).catch((error) => showToast(error.message));
  subscribe(render);
})();
