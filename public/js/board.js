(() => {
  const {
    $,
    getState,
    subscribe,
    escapeHtml,
    teamById,
    spaceByIndex,
    renderBoard,
    formatPosition,
    showToast,
    gameStatusLabel
  } = window.Ohana;

  function render(gameState) {
    const isActive = gameState.game.status === 'active';
    const activeTeam = isActive ? gameState.teams[gameState.game.currentTurnIndex] : null;
    renderCurrentTurnCard(gameState, activeTeam);
    renderRanking(gameState, activeTeam);
    renderBoard({ gameState, layerId: 'tilesLayer', centerId: 'centerSpotlight' });
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
      $('currentTurnCard').innerHTML = '';
      return;
    }

    const dice = gameState.game.lastDice;
    const position = formatPosition(gameState, activeTeam?.position || 0);
    const moving = gameState.game.moving;

    const diceDisplay = dice
      ? (dice.dice1 != null && dice.dice2 != null
          ? `<span class="dice-face">${dice.dice1}</span><span class="dice-plus">+</span><span class="dice-face">${dice.dice2}</span><span class="dice-eq">=</span><span class="dice-total">${dice.value}</span>`
          : `<span class="dice-total">${dice.value}</span>`)
      : '<span class="dice-placeholder">—</span>';

    const subtitle = moving
      ? `이동 중 · ${moving.step}/${moving.total}`
      : position;

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
      <div class="ct-dice">${diceDisplay}</div>
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
          <span>${towers}개 타워${isFinished ? ' · 완료' : ''}</span>
        </div>
        <div class="rank-points"><strong>${team.points}</strong><span>pts</span></div>
      </div>`;
    }).join('');
  }

  getState().then(render).catch((error) => showToast(error.message));
  subscribe(render);
})();
