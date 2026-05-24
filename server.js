'use strict';

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const STATE_FILE = path.join(ROOT, 'game-state.json');
const STATE_VERSION = 10;
const MAX_LOG_ITEMS = 180;
const MOVE_STEP_MS = 560;
const MIN_TEAMS = 2;
const MAX_TEAMS = 10;

const TEAM_PALETTE = [
  '#FF6900', // 1 Vivid Orange
  '#2E844A', // 2 Green
  '#7F4ACB', // 3 Purple
  '#FF80AB', // 4 Light Pink
  '#EA001E', // 5 Red
  '#F5B800', // 6 Golden Yellow
  '#00BCD4', // 7 Cyan
  '#1B2A6B', // 8 Dark Navy
  '#8BC34A', // 9 Lime
  '#795548'  // 10 Brown
];

function defaultTeamAt(index) {
  const id = `team-${String(index + 1).padStart(2, '0')}`;
  const num = String(index + 1);
  return {
    id,
    name: `Team #${num}`,
    shortName: num,
    color: TEAM_PALETTE[index] || '#64748B'
  };
}

const DEFAULT_TEAM_COUNT = 6;

const DEFAULT_BOARD = [
  { id: 'start', type: 'start', name: 'START', label: 'START' },                                                                                                                                       // 0
  // 🔴 HIGH right at start (HQ) — unreachable from START with 2 dice
  { id: 'san-francisco', type: 'city', name: 'San Francisco', label: 'San Francisco', subtitle: '샌프란시스코, 미국', tier: 'high', tag: 'HQ', cost: 10, fee: 8, image: '/assets/cities/san-francisco.webp' },  // 1
  { id: 'singapore', type: 'city', name: 'Singapore', label: 'Singapore', subtitle: '싱가포르', tier: 'low', cost: 4, fee: 3, image: '/assets/cities/singapore.webp' },                                  // 2
  { id: 'mini-1', type: 'mini', name: 'Mini Game', label: 'Mini Game' },                                                                                                                                // 3
  { id: 'london', type: 'city', name: 'London', label: 'London', subtitle: '런던, 영국', tier: 'mid', tag: 'Tower', cost: 6, fee: 5, image: '/assets/cities/london.webp' },                            // 4
  { id: 'dubai', type: 'city', name: 'Dubai', label: 'Dubai', subtitle: '두바이, 아랍에미리트', tier: 'mid', cost: 6, fee: 5, image: '/assets/cities/dubai.webp' },                                    // 5 corner
  { id: 'paris', type: 'city', name: 'Paris', label: 'Paris', subtitle: '파리, 프랑스', tier: 'low', cost: 4, fee: 3, image: '/assets/cities/paris.webp' },                                            // 6
  { id: 'sydney', type: 'city', name: 'Sydney', label: 'Sydney', subtitle: '시드니, 호주', tier: 'mid', tag: 'Tower', cost: 6, fee: 5, image: '/assets/cities/sydney.webp' },                          // 7
  { id: 'mini-2', type: 'mini', name: 'Mini Game', label: 'Mini Game' },                                                                                                                                // 8
  { id: 'barcelona', type: 'city', name: 'Barcelona', label: 'Barcelona', subtitle: '바르셀로나, 스페인', tier: 'low', cost: 4, fee: 3, image: '/assets/cities/barcelona.webp' },                       // 9
  { id: 'taipei', type: 'city', name: 'Taipei', label: 'Taipei', subtitle: '타이페이, 대만', tier: 'mid', cost: 6, fee: 5, image: '/assets/cities/taipei.webp' },                                      // 10 corner
  { id: 'toronto', type: 'city', name: 'Toronto', label: 'Toronto', subtitle: '토론토, 캐나다', tier: 'low', cost: 4, fee: 3, image: '/assets/cities/toronto.webp' },                                   // 11
  { id: 'new-york', type: 'city', name: 'New York', label: 'New York', subtitle: '뉴욕, 미국', tier: 'mid', tag: 'Tower', cost: 6, fee: 5, image: '/assets/cities/new-york.webp' },                  // 12
  { id: 'berlin', type: 'city', name: 'Berlin', label: 'Berlin', subtitle: '베를린, 독일', tier: 'low', cost: 4, fee: 3, image: '/assets/cities/berlin.webp' },                                         // 13
  { id: 'mini-3', type: 'mini', name: 'Mini Game', label: 'Mini Game' },                                                                                                                                // 14
  { id: 'chicago', type: 'city', name: 'Chicago', label: 'Chicago', subtitle: '시카고, 미국', tier: 'low', cost: 4, fee: 3, image: '/assets/cities/chicago.webp' },                                     // 15 corner
  // 🔴 HIGH gauntlet at end
  { id: 'tokyo', type: 'city', name: 'Tokyo', label: 'Tokyo', subtitle: '도쿄, 일본', tier: 'high', tag: 'Tower', cost: 10, fee: 8, image: '/assets/cities/tokyo.webp' },                              // 16
  { id: 'dublin', type: 'city', name: 'Dublin', label: 'Dublin', subtitle: '더블린, 아일랜드', tier: 'high', cost: 10, fee: 8, image: '/assets/cities/dublin.webp' },                                  // 17
  { id: 'mini-4', type: 'mini', name: 'Mini Game', label: 'Mini Game' },                                                                                                                                // 18
  { id: 'seoul', type: 'city', name: 'Seoul', label: 'Seoul', subtitle: '서울, 대한민국', tier: 'high', tag: 'Hometown', cost: 10, fee: 8, image: '/assets/cities/seoul.webp' }                        // 19
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

let state = loadState();
let moveLock = false;

function now() { return new Date().toISOString(); }
function newId(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function bad(message, status = 400) { const e = new Error(message); e.status = status; return e; }

function makeInitialTeams(count) {
  const n = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, Number(count) || DEFAULT_TEAM_COUNT));
  return Array.from({ length: n }, (_, index) => ({
    ...defaultTeamAt(index),
    points: 5,
    position: 0,
    previousPosition: 0
  }));
}

function createInitialState(teamCount = DEFAULT_TEAM_COUNT) {
  const teams = makeInitialTeams(teamCount);
  const board = DEFAULT_BOARD.map((space, index) => ({ ...space, index, ownerTeamId: null }));
  return {
    version: STATE_VERSION,
    title: 'Ohana Monopoly',
    createdAt: now(),
    updatedAt: now(),
    settings: { startPoints: 5, passStartPoints: 5, miniGameAwards: [20, 10, 5], moveStepMs: MOVE_STEP_MS, maxRounds: 3 },
    game: { status: 'ready', round: 1, currentTurnIndex: 0, turnsPlayed: 0, lastDice: null, lastLanding: null, spotlight: null, activeMiniGame: null, moving: null, startedAt: null, endedAt: null, laps: {} },
    teams,
    board,
    pendingFees: [],
    log: [{ id: newId('log'), at: now(), type: 'system', message: `게임이 생성되었습니다. ${teams.length}개 팀이 각 20포인트로 시작합니다.` }]
  };
}

function normalizeLoadedBoard(board) {
  if (!Array.isArray(board) || board.length !== DEFAULT_BOARD.length) {
    return DEFAULT_BOARD.map((space, index) => ({ ...space, index, ownerTeamId: null }));
  }
  return board.map((space, index) => ({ ...DEFAULT_BOARD[index], ownerTeamId: space.ownerTeamId || null, index }));
}

function normalizeLoadedTeams(teams) {
  if (!Array.isArray(teams) || teams.length < MIN_TEAMS) return makeInitialTeams(DEFAULT_TEAM_COUNT);
  const trimmed = teams.slice(0, MAX_TEAMS);
  return trimmed.map((team, index) => {
    const fallback = defaultTeamAt(index);
    return {
      id: typeof team.id === 'string' && team.id ? team.id : fallback.id,
      name: typeof team.name === 'string' && team.name.trim() ? team.name.trim().slice(0, 40) : fallback.name,
      shortName: typeof team.shortName === 'string' && team.shortName.trim() ? team.shortName.trim().slice(0, 2).toUpperCase() : fallback.shortName,
      color: typeof team.color === 'string' && team.color ? team.color : fallback.color,
      points: Number.isFinite(Number(team.points)) ? Math.floor(Number(team.points)) : 20,
      position: Number.isInteger(Number(team.position)) ? Number(team.position) % DEFAULT_BOARD.length : 0,
      previousPosition: Number.isInteger(Number(team.previousPosition)) ? Number(team.previousPosition) % DEFAULT_BOARD.length : 0
    };
  });
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return createInitialState();
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (parsed.version !== STATE_VERSION) return createInitialState();
    const fresh = createInitialState(parsed.teams?.length || DEFAULT_TEAM_COUNT);
    return {
      ...fresh,
      ...parsed,
      version: STATE_VERSION,
      title: 'Ohana Monopoly',
      settings: { ...fresh.settings, ...(parsed.settings || {}), moveStepMs: MOVE_STEP_MS },
      game: { ...fresh.game, ...(parsed.game || {}), moving: null },
      board: normalizeLoadedBoard(parsed.board),
      teams: normalizeLoadedTeams(parsed.teams),
      pendingFees: [],
      log: Array.isArray(parsed.log) ? parsed.log.slice(0, MAX_LOG_ITEMS) : fresh.log
    };
  } catch (error) {
    console.error('game-state.json 로드 실패. 새로 시작합니다.', error);
    return createInitialState();
  }
}

function saveState() {
  const safe = JSON.parse(JSON.stringify(state));
  safe.updatedAt = now();
  fs.writeFileSync(STATE_FILE, JSON.stringify(safe, null, 2), 'utf8');
}

function addLog(message, type = 'info') {
  state.log.unshift({ id: newId('log'), at: now(), type, message });
  state.log = state.log.slice(0, MAX_LOG_ITEMS);
}

function getTeam(teamId) { return state.teams.find((t) => t.id === teamId) || null; }
function getBoardSpace(index) {
  const n = state.board.length;
  return state.board[((Number(index) % n) + n) % n] || null;
}
function currentTeam() { return state.teams[state.game.currentTurnIndex] || state.teams[0]; }

function visibleState() {
  const teams = state.teams.map((team) => ({
    ...team,
    towersBuilt: state.board.filter((space) => space.type === 'city' && space.ownerTeamId === team.id).length
  }));
  return {
    version: state.version,
    title: state.title,
    updatedAt: state.updatedAt,
    settings: state.settings,
    game: state.game,
    board: state.board,
    teams,
    pendingFees: state.pendingFees,
    log: state.log.slice(0, 120),
    limits: { minTeams: MIN_TEAMS, maxTeams: MAX_TEAMS }
  };
}

function broadcast() { io.emit('state', visibleState()); }
function ok(res, payload = {}) { res.json({ ok: true, ...payload }); }
function errorResponse(res, error) {
  res.status(error.status || 400).json({ ok: false, error: error.message || '오류가 발생했습니다.' });
}

function mutate(res, fn) {
  try {
    const result = fn();
    state.updatedAt = now();
    saveState();
    broadcast();
    ok(res, { state: visibleState(), ...(result || {}) });
  } catch (error) {
    errorResponse(res, error);
  }
}

function emitAndSave() {
  state.updatedAt = now();
  saveState();
  broadcast();
}

// Team rotation: each round starts with a different team to mitigate first-mover advantage.
// turnsPlayed counts total turns since game start (0-indexed). For team count n:
//   round = floor(turnsPlayed / n) + 1
//   currentTurnIndex = (turnsPlayed + floor(turnsPlayed / n)) % n
// This yields:
//   Round 1: 0, 1, 2, ..., n-1
//   Round 2: 1, 2, 3, ..., n-1, 0
//   Round 3: 2, 3, ..., n-1, 0, 1
//   ...
function applyTurnFromCounter() {
  const n = state.teams.length;
  const T = state.game.turnsPlayed;
  state.game.currentTurnIndex = T % n;
  state.game.round = Math.floor(T / n) + 1;
}

function isTeamFinished(teamId) {
  return Array.isArray(state.game.finished) && state.game.finished.includes(teamId);
}

function advanceTurn({ clearSpotlight = true, force = false } = {}) {
  if (state.game.moving) throw bad('팀이 이동 중입니다. 이동이 끝난 후 다시 시도해 주세요.');
  if (!force && state.game.activeMiniGame) throw bad('진행 중인 미니게임을 먼저 처리해 주세요.');
  cancelAutoAdvance();
  const oldTeam = currentTeam();
  let attempts = 0;
  do {
    state.game.turnsPlayed = (state.game.turnsPlayed || 0) + 1;
    applyTurnFromCounter();
    attempts++;
  } while (isTeamFinished(currentTeam().id) && attempts < state.teams.length);
  state.game.lastDice = null;
  state.game.lastLanding = null;
  state.game.activeMiniGame = force ? null : state.game.activeMiniGame;
  if (clearSpotlight) state.game.spotlight = null;
  addLog(`턴 전환: ${oldTeam.name} → ${currentTeam().name}. (라운드 ${state.game.round})`, 'turn');
}

function rewindTurn() {
  if (state.game.moving) throw bad('팀이 이동 중입니다. 이동이 끝난 후 다시 시도해 주세요.');
  if (state.game.activeMiniGame) throw bad('진행 중인 미니게임을 먼저 처리해 주세요.');
  if ((state.game.turnsPlayed || 0) <= 0) throw bad('첫 번째 턴에서는 더 되돌릴 수 없습니다.');
  cancelAutoAdvance();
  const oldTeam = currentTeam();
  state.game.turnsPlayed -= 1;
  applyTurnFromCounter();
  state.game.lastDice = null;
  state.game.lastLanding = null;
  state.game.spotlight = null;
  addLog(`이전 팀으로 되돌림: ${oldTeam.name} → ${currentTeam().name}. (라운드 ${state.game.round})`, 'turn');
}

function collectFee(payer, ownerTeamId, city) {
  const owner = getTeam(ownerTeamId);
  if (!owner || owner.id === payer.id) return;
  const amount = Number(city.fee || 0);
  if (amount <= 0) return;
  payer.points -= amount;
  owner.points += amount;
  const balanceNote = payer.points < 0 ? ` ${payer.name}의 잔액이 ${payer.points}포인트로 떨어졌습니다.` : '';
  addLog(`${payer.name}이(가) ${city.label || city.name}에 착지하여 ${owner.name}에게 ${amount}포인트를 지불했습니다.${balanceNote}`, 'fee');
}

function setLandingSpotlight(team, landing, newPosition) {
  state.game.lastLanding = { teamId: team.id, spaceIndex: newPosition, spaceName: landing.name, type: landing.type, at: now() };

  if (landing.type === 'city') {
    if (!landing.ownerTeamId) {
      state.game.spotlight = { type: 'city', spaceIndex: newPosition, teamId: team.id, at: now() };
      addLog(`${team.name}이(가) ${landing.label}에 착지했습니다. ${landing.cost}포인트로 타워를 구매할 수 있습니다.`, 'city');
    } else if (landing.ownerTeamId === team.id) {
      state.game.spotlight = { type: 'city', spaceIndex: newPosition, teamId: team.id, at: now() };
      addLog(`${team.name}이(가) 자신의 타워가 있는 ${landing.label}에 착지했습니다.`, 'city');
    } else {
      const owner = getTeam(landing.ownerTeamId);
      addLog(`${team.name}이(가) ${owner?.name || '다른 팀'} 소유의 ${landing.label}에 착지했습니다.`, 'city');
      collectFee(team, landing.ownerTeamId, landing);
      // Fee warning spotlight (not "city" — different rendering)
      state.game.spotlight = {
        type: 'fee_warning',
        spaceIndex: newPosition,
        teamId: team.id,
        ownerTeamId: landing.ownerTeamId,
        cityLabel: landing.label,
        feeAmount: landing.fee,
        at: now()
      };
    }
    return;
  }

  if (landing.type === 'mini') {
    state.game.activeMiniGame = { id: newId('mini'), spaceIndex: newPosition, name: 'Mini Game', triggeredByTeamId: team.id, startedAt: now() };
    state.game.spotlight = { type: 'mini', spaceIndex: newPosition, teamId: team.id, at: now() };
    addLog(`${team.name}이(가) 미니게임 칸에 착지했습니다. 모든 팀이 참여합니다.`, 'mini');
    return;
  }

  if (landing.type === 'start') {
    if (!state.game.spotlight || state.game.spotlight.type !== 'start') {
      state.game.spotlight = { type: 'start', teamId: team.id, at: now() };
    }
    addLog(`${team.name}이(가) START에 착지했습니다.`, 'start');
  }

  if (landing.type === 'empty') {
    state.game.spotlight = null;
    addLog(`${team.name}이(가) 빈 칸(${landing.label})에 착지했습니다. 액션 없음.`, 'info');
  }
}

// Pre-move snapshot for "한 턴 리셋" (Reset Current Turn)
let preMoveSnapshot = null;

function captureSnapshot() {
  // Deep clone state for restoration
  preMoveSnapshot = JSON.parse(JSON.stringify({
    teams: state.teams,
    board: state.board,
    game: state.game,
    log: state.log,
  }));
}

function restoreSnapshot() {
  if (!preMoveSnapshot) throw bad('되돌릴 수 있는 직전 턴이 없습니다.');
  state.teams = preMoveSnapshot.teams;
  state.board = preMoveSnapshot.board;
  state.game = preMoveSnapshot.game;
  state.log = preMoveSnapshot.log;
  preMoveSnapshot = null;
  addLog('현재 턴이 리셋되었습니다. (주사위 입력 직전 상태로 복원)', 'system');
}

async function moveActiveTeamAnimated(dice1, dice2) {
  if (moveLock) throw bad('이미 이동이 진행 중입니다.');
  if (state.game.status !== 'active') throw bad('게임을 시작한 후 주사위를 입력해 주세요.');
  if (state.game.activeMiniGame) throw bad('진행 중인 미니게임을 먼저 처리해 주세요.');

  const d1 = Number(dice1);
  const d2 = Number(dice2);
  if (!Number.isInteger(d1) || d1 < 1 || d1 > 6) {
    throw bad('주사위 1의 값은 1에서 6 사이의 정수여야 합니다.');
  }
  if (!Number.isInteger(d2) || d2 < 1 || d2 > 6) {
    throw bad('주사위 2의 값은 1에서 6 사이의 정수여야 합니다.');
  }
  const total = d1 + d2;

  // Capture snapshot BEFORE applying any changes (for reset-current-turn)
  captureSnapshot();

  moveLock = true;
  try {
    const team = currentTeam();
    const oldPosition = team.position || 0;
    const boardLength = state.board.length;
    const path = Array.from({ length: total }, (_, step) => (oldPosition + step + 1) % boardLength);

    team.previousPosition = oldPosition;
    state.game.lastDice = { value: total, dice1: d1, dice2: d2, teamId: team.id, at: now() };
    state.game.lastLanding = null;
    state.game.spotlight = null;
    addLog(`${team.name}이(가) 주사위 ${d1}+${d2}=${total}만큼 이동합니다.`, 'dice');

    for (let step = 1; step <= total; step += 1) {
      const index = path[step - 1];
      team.position = index;
      state.game.moving = { teamId: team.id, from: oldPosition, current: index, step, total, path, at: now() };
      if (index === 0) {
        team.points += state.settings.passStartPoints;
        if (!state.game.laps) state.game.laps = {};
        state.game.laps[team.id] = (state.game.laps[team.id] || 0) + 1;
        addLog(`${team.name}이(가) START를 지나며 ${state.settings.passStartPoints}포인트를 획득했습니다.`, 'start');

        const maxR = state.settings.maxRounds;
        if (maxR && state.game.laps[team.id] >= maxR) {
          if (!state.game.finished) state.game.finished = [];
          if (!state.game.finished.includes(team.id)) state.game.finished.push(team.id);
          team.position = -1;
          state.game.moving = null;
          state.game.spotlight = { type: 'team_finished', teamId: team.id, at: now() };
          addLog(`${team.name}이(가) 모든 라운드를 완료했습니다!`, 'system');
          emitAndSave();
          await delay(3000);
          state.game.spotlight = null;
          emitAndSave();

          const allDone = state.teams.every((t) => (state.game.laps[t.id] || 0) >= maxR);
          if (allDone) {
            state.game.status = 'ended';
            state.game.endedAt = now();
            state.game.activeMiniGame = null;
            state.game.spotlight = null;
            addLog(`모든 팀이 ${maxR}바퀴를 완료하여 게임이 자동 종료되었습니다.`, 'system');
            emitAndSave();
          } else {
            advanceTurn({ clearSpotlight: true, force: true });
            emitAndSave();
          }
          return;
        }

        state.game.spotlight = { type: 'start', teamId: team.id, at: now() };
        emitAndSave();
        await delay(2000);
        if (step < total) {
          state.game.spotlight = null;
        }
      }
      emitAndSave();
      await delay(MOVE_STEP_MS);
    }

    const newPosition = team.position;
    const landing = getBoardSpace(newPosition);
    state.game.moving = null;
    setLandingSpotlight(team, landing, newPosition);
    emitAndSave();

    // Schedule auto-advance based on landing type (per Q2 rules)
    scheduleAutoAdvanceIfNeeded(landing);
  } finally {
    moveLock = false;
  }
}

// Auto-advance handling
let autoAdvanceTimer = null;
function cancelAutoAdvance() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
    if (state.game) state.game.autoAdvanceAt = null;
  }
}

function scheduleAutoAdvance(delayMs, reason) {
  cancelAutoAdvance();
  const triggerAt = Date.now() + delayMs;
  state.game.autoAdvanceAt = triggerAt;
  emitAndSave();
  autoAdvanceTimer = setTimeout(() => {
    autoAdvanceTimer = null;
    try {
      // Only auto-advance if no mini-game is pending and no moving animation
      if (!state.game.activeMiniGame && !state.game.moving && state.game.status === 'active') {
        state.game.autoAdvanceAt = null;
        advanceTurn({ clearSpotlight: true });
        emitAndSave();
      }
    } catch (e) {
      console.error('auto-advance error:', e.message);
    }
  }, delayMs);
}

function scheduleAutoAdvanceIfNeeded(landing) {
  // Only schedule auto-advance for landings that have no further required action
  // - Empty city (waiting for buy decision): NO auto
  // - Mini: NO auto (admin awards after)
  // - Owned city by another team (fee paid): YES, 4 sec
  // - Owned city by self: YES, 3 sec
  // - START: YES, 3 sec
  // - Empty placeholder: YES, 3 sec
  if (!landing) return;
  if (landing.type === 'city') {
    if (!landing.ownerTeamId) return; // empty city, await buy
    const team = currentTeam();
    if (landing.ownerTeamId === team.id) {
      scheduleAutoAdvance(3000, 'own_city');
    } else {
      scheduleAutoAdvance(4500, 'fee_paid');
    }
    return;
  }
  if (landing.type === 'mini') return; // wait for award
  if (landing.type === 'start' || landing.type === 'empty') {
    scheduleAutoAdvance(3000, landing.type);
  }
}

function buildCurrentTower() {
  if (state.game.status !== 'active') throw bad('게임을 시작한 후 타워를 구매할 수 있습니다.');
  if (state.game.moving) throw bad('이동이 끝난 후 다시 시도해 주세요.');
  const team = currentTeam();
  const space = getBoardSpace(team.position);
  const lastLanding = state.game.lastLanding;
  if (!space || space.type !== 'city') throw bad('현재 팀은 도시 칸에 있지 않습니다.');
  if (!lastLanding || lastLanding.teamId !== team.id || Number(lastLanding.spaceIndex) !== Number(team.position)) {
    throw bad('해당 도시에 막 착지했을 때만 타워를 구매할 수 있습니다.');
  }
  if (space.ownerTeamId) throw bad('이 도시에는 이미 타워가 있습니다.');
  if (team.points < space.cost) throw bad(`${team.name}이(가) 타워를 구매하려면 ${space.cost}포인트가 필요합니다.`);
  team.points -= space.cost;
  space.ownerTeamId = team.id;
  addLog(`${team.name}이(가) ${space.label}에 ${space.cost}포인트로 타워를 건설했습니다.`, 'tower');
  // Auto-advance after build (3 sec to see the result)
  scheduleAutoAdvance(3500, 'tower_built');
}

function sellTowerForActiveTeam(cityIndex) {
  if (state.game.status !== 'active') throw bad('게임을 시작한 후 타워를 판매할 수 있습니다.');
  if (state.game.moving) throw bad('이동이 끝난 후 다시 시도해 주세요.');
  const team = currentTeam();
  const index = Number(cityIndex);
  const space = getBoardSpace(index);
  if (!space || space.type !== 'city') throw bad('도시를 찾을 수 없습니다.');
  if (space.ownerTeamId !== team.id) throw bad(`${team.name}은(는) 자기 턴에만 자신의 타워를 판매할 수 있습니다.`);
  const refund = Math.floor(Number(space.cost || 0) / 2);
  space.ownerTeamId = null;
  team.points += refund;
  addLog(`${team.name}이(가) ${space.label} 타워를 ${refund}포인트에 판매했습니다.`, 'tower');
}

function removeTower(cityIndex) {
  const space = getBoardSpace(cityIndex);
  if (!space || space.type !== 'city') throw bad('도시를 찾을 수 없습니다.');
  if (!space.ownerTeamId) throw bad('이 도시에는 타워가 없습니다.');
  const owner = getTeam(space.ownerTeamId);
  space.ownerTeamId = null;
  addLog(`운영자가 ${space.label} 타워를 제거했습니다${owner ? ` (소유: ${owner.name})` : ''}.`, 'tower');
}

function resetGameState(teamCount) {
  const count = Number.isFinite(Number(teamCount))
    ? Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, Number(teamCount)))
    : state.teams.length;
  const prevSettings = { ...state.settings };
  state = createInitialState(count);
  state.settings = prevSettings;
  addLog(`게임이 리셋되었습니다. ${count}개 팀이 START에서 각 20포인트로 시작합니다.`, 'system');
}

function addTeam() {
  if (state.game.status === 'active') throw bad('게임이 진행 중일 때는 팀을 추가할 수 없습니다.');
  if (state.teams.length >= MAX_TEAMS) throw bad(`최대 ${MAX_TEAMS}개 팀까지만 추가할 수 있습니다.`);
  const index = state.teams.length;
  const newTeam = { ...defaultTeamAt(index), points: 5, position: 0, previousPosition: 0 };
  while (state.teams.some((t) => t.id === newTeam.id)) {
    newTeam.id = `${newTeam.id}-${crypto.randomUUID().slice(0, 4)}`;
  }
  state.teams.push(newTeam);
  addLog(`${newTeam.name}이(가) 추가되었습니다.`, 'system');
}

function removeTeam(teamId) {
  if (state.game.status === 'active') throw bad('게임이 진행 중일 때는 팀을 삭제할 수 없습니다.');
  if (state.teams.length <= MIN_TEAMS) throw bad(`최소 ${MIN_TEAMS}개 팀이 필요합니다.`);
  const idx = state.teams.findIndex((t) => t.id === teamId);
  if (idx === -1) throw bad('팀을 찾을 수 없습니다.');
  const team = state.teams[idx];
  state.board.forEach((space) => {
    if (space.type === 'city' && space.ownerTeamId === team.id) space.ownerTeamId = null;
  });
  state.teams.splice(idx, 1);
  if (state.game.currentTurnIndex >= state.teams.length) state.game.currentTurnIndex = 0;
  addLog(`${team.name}이(가) 삭제되었습니다.`, 'system');
}

app.get('/admin', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('/api/state', (_req, res) => ok(res, { state: visibleState() }));

app.post('/api/admin/set-max-rounds', (req, res) => mutate(res, () => {
  const rounds = Number(req.body.maxRounds);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw bad('라운드 수는 1~10 사이의 정수여야 합니다.');
  state.settings.maxRounds = rounds;
  addLog(`총 라운드가 ${rounds}로 설정되었습니다.`, 'system');
}));

app.post('/api/admin/start-game', (_req, res) => mutate(res, () => {
  if (state.game.status === 'active') throw bad('게임이 이미 진행 중입니다.');
  state.game.status = 'active';
  state.game.startedAt = now();
  state.game.endedAt = null;
  state.game.laps = {};
  addLog(`게임이 시작되었습니다. 총 ${state.settings.maxRounds}라운드, 첫 턴은 ${currentTeam().name}입니다.`, 'system');
}));

app.post('/api/admin/end-game', (_req, res) => mutate(res, () => {
  state.game.status = 'ended';
  state.game.endedAt = now();
  state.game.activeMiniGame = null;
  state.game.spotlight = null;
  state.game.moving = null;
  addLog('운영자가 게임을 종료했습니다.', 'system');
}));

app.post('/api/admin/reset-game', (req, res) => {
  try {
    resetGameState(req.body.teamCount);
    saveState();
    broadcast();
    ok(res, { state: visibleState() });
  } catch (error) { errorResponse(res, error); }
});

app.post('/api/admin/enter-dice', async (req, res) => {
  try {
    await moveActiveTeamAnimated(req.body.dice1, req.body.dice2);
    ok(res, { state: visibleState() });
  } catch (error) { errorResponse(res, error); }
});

app.post('/api/admin/reset-current-turn', (_req, res) => {
  try {
    cancelAutoAdvance();
    restoreSnapshot();
    state.updatedAt = now();
    saveState();
    broadcast();
    ok(res, { state: visibleState() });
  } catch (error) { errorResponse(res, error); }
});

app.post('/api/admin/next-turn', (req, res) => mutate(res, () => {
  advanceTurn({ clearSpotlight: true, force: Boolean(req.body.force) });
}));

app.post('/api/admin/previous-turn', (_req, res) => mutate(res, () => {
  rewindTurn();
}));

app.post('/api/admin/build-current-tower', (_req, res) => mutate(res, () => { buildCurrentTower(); }));
app.post('/api/admin/sell-tower', (req, res) => mutate(res, () => { sellTowerForActiveTeam(req.body.cityIndex); }));
app.post('/api/admin/remove-tower', (req, res) => mutate(res, () => { removeTower(req.body.cityIndex); }));

app.post('/api/admin/award-mini-game', (req, res) => mutate(res, () => {
  if (!state.game.activeMiniGame) throw bad('진행 중인 미니게임이 없습니다.');
  const places = [req.body.firstTeamId, req.body.secondTeamId, req.body.thirdTeamId].filter(Boolean);
  if (places.length !== 3 || new Set(places).size !== 3) throw bad('1등, 2등, 3등에 서로 다른 팀을 선택해 주세요.');
  const awards = state.settings.miniGameAwards;
  places.forEach((teamId, index) => {
    const team = getTeam(teamId);
    if (!team) throw bad('선택한 팀 중 일부가 존재하지 않습니다.');
    team.points += awards[index];
  });
  const summary = places.map((teamId, index) => `${index + 1}등 ${getTeam(teamId).name} +${awards[index]}`).join(' / ');
  addLog(`미니게임 시상: ${summary}`, 'mini');
  state.game.activeMiniGame = null;
  state.game.spotlight = null;
  state.game.lastLanding = null;
  if (req.body.advanceTurn !== false) advanceTurn({ clearSpotlight: true, force: true });
}));

app.post('/api/admin/clear-mini-game', (_req, res) => mutate(res, () => {
  state.game.activeMiniGame = null;
  state.game.spotlight = null;
  addLog('운영자가 진행 중인 미니게임을 제거했습니다.', 'mini');
}));

app.post('/api/admin/clear-spotlight', (_req, res) => mutate(res, () => {
  state.game.spotlight = null;
  addLog('스포트라이트가 제거되었습니다.', 'system');
}));

const TUTORIAL_SLIDE_COUNT = 8;

app.post('/api/admin/tutorial-start', (_req, res) => mutate(res, () => {
  state.game.tutorial = { slide: 0 };
}));

app.post('/api/admin/tutorial-next', (_req, res) => mutate(res, () => {
  if (!state.game.tutorial) {
    state.game.tutorial = { slide: 0 };
  } else {
    state.game.tutorial.slide = Math.min(state.game.tutorial.slide + 1, TUTORIAL_SLIDE_COUNT - 1);
  }
}));

app.post('/api/admin/tutorial-prev', (_req, res) => mutate(res, () => {
  if (state.game.tutorial) {
    state.game.tutorial.slide = Math.max(state.game.tutorial.slide - 1, 0);
  }
}));

app.post('/api/admin/tutorial-reset', (_req, res) => mutate(res, () => {
  state.game.tutorial = { slide: 0 };
}));

app.post('/api/admin/tutorial-close', (_req, res) => mutate(res, () => {
  state.game.tutorial = null;
}));

app.post('/api/admin/adjust-points', (req, res) => mutate(res, () => {
  const team = getTeam(req.body.teamId);
  if (!team) throw bad('팀을 찾을 수 없습니다.');
  const delta = Number(req.body.delta);
  if (!Number.isFinite(delta)) throw bad('포인트 조정 값은 숫자여야 합니다.');
  team.points = Math.floor(team.points + delta);
  addLog(`운영자가 ${team.name}의 포인트를 ${delta > 0 ? '+' : ''}${delta} 조정했습니다.`, 'points');
}));

app.post('/api/admin/set-points', (req, res) => mutate(res, () => {
  const team = getTeam(req.body.teamId);
  if (!team) throw bad('팀을 찾을 수 없습니다.');
  const points = Number(req.body.points);
  if (!Number.isFinite(points)) throw bad('포인트 값은 숫자여야 합니다.');
  team.points = Math.floor(points);
  addLog(`운영자가 ${team.name}의 포인트를 ${team.points}로 설정했습니다.`, 'points');
}));

app.post('/api/admin/update-team', (req, res) => mutate(res, () => {
  const team = getTeam(req.body.teamId);
  if (!team) throw bad('팀을 찾을 수 없습니다.');
  const previousName = team.name;
  if (typeof req.body.name === 'string' && req.body.name.trim()) team.name = req.body.name.trim().slice(0, 40);
  if (typeof req.body.shortName === 'string' && req.body.shortName.trim()) team.shortName = req.body.shortName.trim().slice(0, 2).toUpperCase();
  addLog(`운영자가 ${previousName}의 정보를 업데이트했습니다.`, 'system');
}));

app.post('/api/admin/add-team', (_req, res) => mutate(res, () => { addTeam(); }));
app.post('/api/admin/remove-team', (req, res) => mutate(res, () => { removeTeam(req.body.teamId); }));

io.on('connection', (socket) => socket.emit('state', visibleState()));

server.listen(PORT, () => {
  console.log(`Ohana Monopoly server running at http://localhost:${PORT}`);
  console.log(`Live Game Board: http://localhost:${PORT}/`);
  console.log(`Admin Console:   http://localhost:${PORT}/admin`);
});
