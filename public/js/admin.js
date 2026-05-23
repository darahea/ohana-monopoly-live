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
    showToast,
    gameStatusLabel,
    formatTime,
    formatPosition
  } = window.Ohana;

  let currentState = null;

  async function run(path, payload = {}) {
    const result = await api(path, payload);
    if (result.state) render(result.state);
    return result;
  }

  function render(gameState) {
    currentState = gameState;
    const activeTeam = gameState.teams[gameState.game.currentTurnIndex];
    $('adminStatusPill').textContent = gameStatusLabel(gameState.game.status);
    renderSummary(gameState, activeTeam);
    renderDice(gameState, activeTeam);
    renderTowerControls(gameState, activeTeam);
    renderMiniGame(gameState);
    renderPointsTable(gameState);
    renderTeamSettings(gameState);
    renderCityTable(gameState);
    renderLog(gameState);
    renderBoard({ gameState, layerId: 'adminBoardTiles', centerId: null, mini: true });
  }

  function renderSummary(gameState, activeTeam) {
    const totalPoints = gameState.teams.reduce((sum, team) => sum + Number(team.points || 0), 0);
    const towers = gameState.board.filter((space) => space.type === 'city' && space.ownerTeamId).length;
    const miniGames = gameState.log.filter((item) => item.type === 'mini' && item.message.includes('시상')).length;
    const moving = gameState.game.moving;
    $('adminSummary').innerHTML = `
      <div class="summary-line"><span>상태</span><strong>${moving ? '이동 중' : gameStatusLabel(gameState.game.status)}</strong></div>
      <div class="summary-line"><span>총 라운드</span><strong>${gameState.settings.maxRounds || '—'}</strong></div>
      <div class="summary-line"><span>현재 팀</span><strong>${escapeHtml(activeTeam?.name || '—')}</strong></div>
      <div class="summary-line"><span>위치</span><strong>${escapeHtml(formatPosition(gameState, activeTeam?.position || 0))}</strong></div>
      <div class="summary-line"><span>팀 수</span><strong>${gameState.teams.length}</strong></div>
      <div class="summary-line"><span>건설된 타워</span><strong>${towers}</strong></div>
      <div class="summary-line"><span>완료된 미니게임</span><strong>${miniGames}</strong></div>
      <div class="summary-line"><span>총 포인트</span><strong>${totalPoints}</strong></div>`;
  }

  function renderDice(gameState, activeTeam) {
    const position = formatPosition(gameState, activeTeam?.position || 0);
    $('activeTeamMini').innerHTML = `<span class="team-dot" style="--team-color:${escapeHtml(activeTeam?.color || '#0176d3')}"></span>
      <span>${escapeHtml(activeTeam?.name || '—')} · ${escapeHtml(position)}</span>`;
    const disabled = gameState.game.status !== 'active' || Boolean(gameState.game.activeMiniGame) || Boolean(gameState.game.moving);
    $('diceForm').querySelectorAll('input, button').forEach((control) => { control.disabled = disabled; });
    // Reset turn button: only enabled when there's a snapshot to restore (i.e., a dice was entered)
    const canReset = gameState.game.lastDice !== null && !gameState.game.moving;
    $('resetTurnBtn').disabled = !canReset;
  }

  function renderTowerControls(gameState, activeTeam) {
    const currentSpace = spaceByIndex(gameState, activeTeam?.position || 0);
    const lastLanding = gameState.game.lastLanding;
    const isFreshLanding = lastLanding && lastLanding.teamId === activeTeam?.id && Number(lastLanding.spaceIndex) === Number(activeTeam?.position);
    if (!currentSpace || currentSpace.type !== 'city') {
      $('towerDecision').innerHTML = `<div class="decision-card">
        <strong>타워 구매 불가</strong>
        <span class="muted">${escapeHtml(activeTeam?.name || '현재 팀')}은(는) 지금 ${escapeHtml(currentSpace?.label || currentSpace?.name || '보드')} 위에 있습니다. 타워는 비어 있는 도시에 막 착지했을 때만 구매할 수 있습니다.</span>
      </div>`;
    } else {
      const owner = currentSpace.ownerTeamId ? teamById(gameState, currentSpace.ownerTeamId) : null;
      const canBuild = isFreshLanding && !owner && activeTeam.points >= currentSpace.cost && !gameState.game.moving;
      const ownedByActive = owner?.id === activeTeam?.id;
      const cardClass = !owner && isFreshLanding ? 'positive' : owner && !ownedByActive ? 'warning' : '';
      const action = canBuild
        ? `<button class="primary-button" type="button" data-action="build-current-tower">${currentSpace.cost}포인트로 타워 건설</button>`
        : !owner && isFreshLanding && activeTeam.points < currentSpace.cost
          ? `<span class="muted">포인트가 부족합니다. ${activeTeam.name}에게 ${currentSpace.cost - activeTeam.points}포인트가 더 필요합니다.</span>`
          : !owner
            ? `<span class="muted">현재 팀이 이 칸에 막 착지한 직후에만 타워를 구매할 수 있습니다.</span>`
            : `<span class="muted">타워 소유: ${escapeHtml(owner?.name || '알 수 없음')}</span>`;
      const guidanceText = canBuild
        ? '현재 팀에게 타워 구매 의사를 확인하고, 원하면 아래 버튼을 누르세요.'
        : '';
      $('towerDecision').innerHTML = `<div class="decision-card ${cardClass}">
        <strong>${escapeHtml(currentSpace.label || currentSpace.name)}</strong>
        ${guidanceText ? `<span class="muted">${guidanceText}</span>` : ''}
        <div class="decision-grid">
          <div class="decision-metric"><span>팀 포인트</span><b>${activeTeam.points}</b></div>
          <div class="decision-metric"><span>구매가</span><b>${currentSpace.cost}</b></div>
          <div class="decision-metric"><span>통행료</span><b>${currentSpace.fee}</b></div>
        </div>
        ${action}
      </div>`;
    }

    const ownedCities = gameState.board.filter((space) => space.type === 'city' && space.ownerTeamId === activeTeam?.id);
    const towersHtml = ownedCities.length
      ? `<div class="tower-list">${ownedCities.map((city) => `<div class="tower-item">
          <div><strong>${escapeHtml(city.label || city.name)}</strong><span>구매가 ${city.cost} · 판매 환불 ${Math.floor(city.cost / 2)}포인트</span></div>
          <button class="small-button" type="button" data-action="sell-tower" data-city-index="${city.index}">판매</button>
        </div>`).join('')}</div>`
      : `<div class="decision-card"><strong>${escapeHtml(activeTeam?.name || '현재 팀')}이(가) 소유한 타워 없음</strong><span class="muted">타워는 자기 턴에만 판매할 수 있습니다.</span></div>`;

    $('activeTeamTowers').innerHTML = `<h3 class="section-mini-title">현재 팀이 소유한 타워</h3>${towersHtml}`;
  }

  function renderMiniGame(gameState) {
    const activeMini = gameState.game.activeMiniGame;
    const trigger = activeMini ? teamById(gameState, activeMini.triggeredByTeamId) : null;
    $('miniGameBanner').innerHTML = activeMini
      ? `🎉 미니게임 진행 중 — 모든 팀이 참여합니다. 트리거: ${escapeHtml(trigger?.name || '팀')}`
      : '진행 중인 미니게임이 없습니다.';

    ['firstTeam', 'secondTeam', 'thirdTeam'].forEach((id, index) => {
      const currentValue = $(id).value;
      $(id).innerHTML = gameState.teams.map((team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`).join('');
      if (currentValue && gameState.teams.some((team) => team.id === currentValue)) $(id).value = currentValue;
      else if (gameState.teams[index]) $(id).value = gameState.teams[index].id;
    });

    $('awardForm').querySelectorAll('select, button, input').forEach((control) => {
      control.disabled = !activeMini;
    });
  }

  function renderPointsTable(gameState) {
    const rows = gameState.teams.map((team) => {
      const towers = gameState.board.filter((space) => space.type === 'city' && space.ownerTeamId === team.id).length;
      return `<div class="table-row" data-team-id="${escapeHtml(team.id)}">
        <div class="team-cell"><span class="team-dot" style="--team-color:${escapeHtml(team.color)}"></span><strong>${escapeHtml(team.name)}</strong></div>
        <div>${team.points} pts</div>
        <div>${towers}개 타워</div>
        <div class="point-controls">
          <button class="small-button" type="button" data-action="adjust-points" data-team-id="${escapeHtml(team.id)}" data-delta="-5">−5</button>
          <button class="small-button" type="button" data-action="adjust-points" data-team-id="${escapeHtml(team.id)}" data-delta="5">+5</button>
          <input type="number" value="${team.points}" data-points-input="${escapeHtml(team.id)}" />
          <button class="small-button" type="button" data-action="set-points" data-team-id="${escapeHtml(team.id)}">설정</button>
        </div>
      </div>`;
    }).join('');

    $('pointsTable').innerHTML = `<div class="table-row header"><span>팀</span><span>포인트</span><span>타워</span><span>조정</span></div>${rows}`;
  }

  function renderTeamSettings(gameState) {
    const gameLocked = gameState.game.status === 'active';
    const limits = gameState.limits || { minTeams: 2, maxTeams: 10 };
    const canRemove = !gameLocked && gameState.teams.length > limits.minTeams;
    const canAdd = !gameLocked && gameState.teams.length < limits.maxTeams;

    const addBtn = $('addTeamBtn');
    if (addBtn) {
      addBtn.disabled = !canAdd;
      addBtn.title = !canAdd
        ? (gameLocked ? '게임 진행 중에는 추가할 수 없습니다.' : `최대 ${limits.maxTeams}개 팀까지 가능합니다.`)
        : '';
    }

    $('teamSettings').innerHTML = gameState.teams.map((team) => `<div class="setting-row" data-team-setting="${escapeHtml(team.id)}">
      <span class="team-dot" style="--team-color:${escapeHtml(team.color)}"></span>
      <label>팀 이름<input data-field="name" value="${escapeHtml(team.name)}" /></label>
      <label>토큰<input data-field="shortName" maxlength="2" value="${escapeHtml(team.shortName || '')}" /></label>
      <button class="primary-button" type="button" data-action="save-team" data-team-id="${escapeHtml(team.id)}">저장</button>
      <button class="small-button small-danger" type="button" data-action="remove-team" data-team-id="${escapeHtml(team.id)}" ${canRemove ? '' : 'disabled'} title="${canRemove ? '팀 삭제' : (gameLocked ? '게임 진행 중에는 삭제할 수 없습니다' : `최소 ${limits.minTeams}개 팀이 필요합니다`)}">삭제</button>
    </div>`).join('');
  }

  function renderCityTable(gameState) {
    const rows = gameState.board.filter((space) => space.type === 'city').map((city) => {
      const owner = city.ownerTeamId ? teamById(gameState, city.ownerTeamId) : null;
      return `<div class="city-row">
        <div><strong>${escapeHtml(city.label || city.name)}</strong><div class="muted">${escapeHtml(city.subtitle || '')}</div></div>
        <div>${city.cost}</div>
        <div>${city.fee}</div>
        <div>${owner ? `<span class="team-cell"><span class="team-dot" style="--team-color:${escapeHtml(owner.color)}"></span>${escapeHtml(owner.name)}</span>` : '<span class="muted">타워 없음</span>'}</div>
        <div>${owner ? `<button class="small-button small-danger" type="button" data-action="remove-tower" data-city-index="${city.index}">강제 제거</button>` : ''}</div>
      </div>`;
    }).join('');

    $('cityTable').innerHTML = `<div class="city-row header"><span>도시</span><span>구매가</span><span>통행료</span><span>소유 팀</span><span></span></div>${rows}`;
  }

  function renderLog(gameState) {
    $('adminLog').innerHTML = gameState.log.slice(0, 80).map((item) => `<div class="log-item">
      <strong>${escapeHtml(item.type || 'info')}</strong> <time>${formatTime(item.at)}</time>
      <p>${escapeHtml(item.message)}</p>
    </div>`).join('');
  }

  async function withButton(button, task) {
    const oldText = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = '처리 중...';
    }
    try {
      await task();
    } catch (error) {
      showToast(error.message);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldText;
      }
      if (currentState) render(currentState);
    }
  }

  function initTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((item) => item.classList.add('hidden'));
        tab.classList.add('active');
        document.querySelector(`[data-panel="${tab.dataset.tab}"]`)?.classList.remove('hidden');
      });
    });
  }

  function initButtons() {
    $('setMaxRoundsBtn').addEventListener('click', (event) => withButton(event.currentTarget, async () => {
      await run('/api/admin/set-max-rounds', { maxRounds: Number($('maxRoundsSelect').value) });
      showToast('라운드가 설정되었습니다.');
    }));

    $('startGameBtn').addEventListener('click', (event) => withButton(event.currentTarget, async () => {
      await run('/api/admin/start-game');
      showToast('게임이 시작되었습니다.');
    }));

    $('endGameBtn').addEventListener('click', (event) => withButton(event.currentTarget, async () => {
      await run('/api/admin/end-game');
      showToast('게임이 종료되었습니다.');
    }));

    $('resetGameBtn').addEventListener('click', (event) => withButton(event.currentTarget, async () => {
      if (!confirm('전체 게임을 리셋하시겠습니까? 모든 포인트, 위치, 타워, 로그가 초기화됩니다.')) return;
      await run('/api/admin/reset-game');
      showToast('게임이 리셋되었습니다.');
    }));

    $('nextTurnBtn').addEventListener('click', (event) => withButton(event.currentTarget, async () => {
      await run('/api/admin/next-turn');
      showToast('다음 팀으로 전환했습니다.');
    }));

    $('previousTurnBtn').addEventListener('click', (event) => withButton(event.currentTarget, async () => {
      await run('/api/admin/previous-turn');
      showToast('이전 팀으로 되돌렸습니다.');
    }));

    $('forceNextTurnBtn').addEventListener('click', (event) => withButton(event.currentTarget, async () => {
      if (!confirm('막혀 있는 동작을 무시하고 강제로 다음 팀으로 넘어갈까요?')) return;
      await run('/api/admin/next-turn', { force: true });
      showToast('강제로 다음 팀으로 전환했습니다.');
    }));

    $('clearSpotlightBtn').addEventListener('click', (event) => withButton(event.currentTarget, async () => {
      await run('/api/admin/clear-spotlight');
      showToast('스포트라이트를 제거했습니다.');
    }));

    $('clearMiniGameBtn').addEventListener('click', (event) => withButton(event.currentTarget, async () => {
      await run('/api/admin/clear-mini-game');
      showToast('미니게임을 제거했습니다.');
    }));

    const addTeamBtn = $('addTeamBtn');
    if (addTeamBtn) {
      addTeamBtn.addEventListener('click', (event) => withButton(event.currentTarget, async () => {
        await run('/api/admin/add-team');
        showToast('팀을 추가했습니다.');
      }));
    }
  }

  function initForms() {
    // Update dice total display
    const updateTotal = () => {
      const a = Number($('dice1').value) || 0;
      const b = Number($('dice2').value) || 0;
      $('diceTotal').textContent = a + b;
    };
    $('dice1').addEventListener('input', updateTotal);
    $('dice2').addEventListener('input', updateTotal);
    updateTotal();

    $('diceForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.submitter;
      await withButton(button, async () => {
        await run('/api/admin/enter-dice', {
          dice1: Number($('dice1').value),
          dice2: Number($('dice2').value)
        });
        showToast('이동을 적용했습니다.');
      });
    });

    $('resetTurnBtn').addEventListener('click', (event) => withButton(event.currentTarget, async () => {
      if (!confirm('현재 턴을 리셋하시겠습니까?\n주사위 입력 직전 상태로 완전히 복원됩니다 (이동·통행료·매입 모두 원복).')) return;
      await run('/api/admin/reset-current-turn');
      showToast('현재 턴이 리셋되었습니다.');
    }));

    $('awardForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.submitter;
      await withButton(button, async () => {
        await run('/api/admin/award-mini-game', {
          firstTeamId: $('firstTeam').value,
          secondTeamId: $('secondTeam').value,
          thirdTeamId: $('thirdTeam').value,
          advanceTurn: $('advanceAfterAward').checked
        });
        showToast('미니게임 포인트를 지급했습니다.');
      });
    });
  }

  function initDelegatedActions() {
    $('adminView').addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.dataset.action;

      await withButton(button, async () => {
        if (action === 'build-current-tower') {
          await run('/api/admin/build-current-tower');
          showToast('타워를 건설했습니다.');
        } else if (action === 'sell-tower') {
          await run('/api/admin/sell-tower', { cityIndex: Number(button.dataset.cityIndex) });
          showToast('타워를 판매했습니다.');
        } else if (action === 'remove-tower') {
          if (!confirm('이 타워를 환불 없이 강제 제거할까요?')) return;
          await run('/api/admin/remove-tower', { cityIndex: Number(button.dataset.cityIndex) });
          showToast('타워를 강제 제거했습니다.');
        } else if (action === 'adjust-points') {
          await run('/api/admin/adjust-points', { teamId: button.dataset.teamId, delta: Number(button.dataset.delta) });
          showToast('포인트를 조정했습니다.');
        } else if (action === 'set-points') {
          const input = document.querySelector(`[data-points-input="${CSS.escape(button.dataset.teamId)}"]`);
          await run('/api/admin/set-points', { teamId: button.dataset.teamId, points: Number(input?.value || 0) });
          showToast('포인트를 설정했습니다.');
        } else if (action === 'save-team') {
          const row = document.querySelector(`[data-team-setting="${CSS.escape(button.dataset.teamId)}"]`);
          const name = row?.querySelector('[data-field="name"]')?.value;
          const shortName = row?.querySelector('[data-field="shortName"]')?.value;
          await run('/api/admin/update-team', { teamId: button.dataset.teamId, name, shortName });
          showToast('팀 정보를 업데이트했습니다.');
        } else if (action === 'remove-team') {
          if (!confirm('이 팀을 삭제하시겠습니까? 보유 중인 타워는 모두 해제됩니다.')) return;
          await run('/api/admin/remove-team', { teamId: button.dataset.teamId });
          showToast('팀을 삭제했습니다.');
        }
      });
    });
  }

  initTabs();
  initButtons();
  initForms();
  initDelegatedActions();
  getState().then(render).catch((error) => showToast(error.message));
  subscribe(render);
})();
