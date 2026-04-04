/**
 * 게임 상태 관리 — 브라우저 버전 (localStorage)
 */

import { comboToIndex } from './dice.js';
import * as scoringStd from './scoring.js';
import * as scoringTk from './scoring-trickal.js';
import * as strategyStd from './strategy.js';
import * as strategyTk from './strategy-trickal.js';
import * as diceStd from './dice.js';
import * as diceTk from './dice-trickal.js';

// ── 모드별 설정 ──

export const MODE = {
  standard: {
    scoring: scoringStd,
    strategy: strategyStd,
    dice: diceStd,
    numCat: 12, upperCount: 6, upperThreshold: 63, upperBonus: 35,
    rounds: 12, hasSpecial: false,
  },
  trickal: {
    scoring: scoringTk,
    strategy: strategyTk,
    diceTk: diceTk,
    numCat: 8, upperCount: 5, upperThreshold: 55, upperBonus: 40,
    rounds: 8, hasSpecial: true,
  },
};

function M(game) { return MODE[game.mode] || MODE.standard; }

// ── localStorage 헬퍼 ──

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; }
  catch { return {}; }
}
function saveJSON(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

const RECORDS_KEY = 'yacht-records';
const HISTORY_KEY = 'yacht-history';

// ── 전적 ──

export function getRecords() {
  const r = loadJSON(RECORDS_KEY);
  return r.data || { wins: 0, losses: 0, draws: 0, highScore: 0, gamesPlayed: 0 };
}

export function recordResult(pTotal, aTotal) {
  const r = getRecords();
  r.gamesPlayed++;
  if (pTotal > aTotal) r.wins++;
  else if (pTotal < aTotal) r.losses++;
  else r.draws++;
  if (pTotal > r.highScore) r.highScore = pTotal;
  saveJSON(RECORDS_KEY, { data: r });
  return r;
}

// ── 유틸 ──

function rollN(n) { return Array.from({ length: n }, () => Math.floor(Math.random() * 6) + 1); }

export function rollSpecial() {
  const r = Math.floor(Math.random() * 6);
  return r === 0 ? 0 : r + 1;
}

function sortedCombo(dice) {
  const sorted = dice.slice().sort((a, b) => a - b);
  return { sorted, idx: comboToIndex(sorted) };
}

// ── 게임 생성 ──

export function createGame(mode = 'standard') {
  const m = MODE[mode];
  const game = {
    mode, round: 1,
    pMask: 0, pUpper: 0, pScores: new Array(m.numCat).fill(-1),
    rerolls: 2,
    aMask: 0, aUpper: 0, aScores: new Array(m.numCat).fill(-1),
    aiLog: null, history: [], totalEVLoss: 0, totalDecisions: 0,
    moves: [],
  };
  if (m.hasSpecial) {
    game.dice = rollN(4);
    game.specialDie = rollSpecial();
  } else {
    game.dice = rollN(5);
  }
  logRoll(game);
  return game;
}

// ── 수 기록 ──

function diceSnapshot(game) {
  const snap = { dice: [...game.dice] };
  if (M(game).hasSpecial) snap.specialDie = game.specialDie;
  return snap;
}

function logRoll(game) {
  game.moves.push({ type: 'roll', round: game.round, rerolls: game.rerolls, ...diceSnapshot(game) });
}

export function logReroll(game, rerolledIndices) {
  game.moves.push({ type: 'reroll', round: game.round, rerolls: game.rerolls, selected: rerolledIndices, ...diceSnapshot(game) });
}

export function logAssign(game, cat, score) {
  game.moves.push({ type: 'assign', round: game.round, category: cat, score, ...diceSnapshot(game) });
}

export function logAI(game) {
  game.moves.push({ type: 'ai', round: game.round, log: game.aiLog ? [...game.aiLog] : [] });
}

// ── 조회 ──

export function getAvailable(game) {
  const cats = [];
  for (let c = 0; c < M(game).numCat; c++) {
    if (!(game.pMask & (1 << c))) cats.push(c);
  }
  return cats;
}

export function getDiceIdx(game) {
  const m = M(game);
  if (m.hasSpecial) {
    const tk = m.diceTk;
    const sorted = game.dice.slice().sort((a, b) => a - b);
    const ni = tk.normalToIndex(sorted);
    const si = tk.specialToIdx(game.specialDie);
    return { diceIdx: tk.diceStateIdx(ni, si), sorted };
  }
  const { sorted, idx } = sortedCombo(game.dice);
  return { diceIdx: idx, sorted };
}

export function getScore(game, category, sorted) {
  const m = M(game);
  if (m.hasSpecial) {
    return m.scoring.scoreCategory(sorted || game.dice.slice().sort((a, b) => a - b), game.specialDie, category);
  }
  return m.scoring.scoreCategory(sorted || game.dice.slice().sort((a, b) => a - b), category);
}

// ── 플레이어 배정 ──

export function assignPlayer(game, cat) {
  const m = M(game);
  const { sorted } = getDiceIdx(game);
  const score = getScore(game, cat, sorted);
  game.pScores[cat] = score;
  game.pMask |= (1 << cat);
  if (cat < m.upperCount) game.pUpper = Math.min(game.pUpper + score, m.upperThreshold);
  return score;
}

// ── AI 턴 ──

export function playAI(game) {
  const m = M(game);
  if (m.hasSpecial) playAITrickal(game, m);
  else playAIStandard(game, m);
}

function playAIStandard(game, m) {
  let dice = rollN(5);
  const log = [];
  for (let rerolls = 2; rerolls >= 0; rerolls--) {
    const sorted = dice.slice().sort((a, b) => a - b);
    const idx = comboToIndex(sorted);
    const action = m.strategy.getAction(game.aMask, game.aUpper, rerolls, idx);
    if (action < m.numCat) {
      const cat = action;
      const score = m.scoring.scoreCategory(sorted, cat);
      game.aScores[cat] = score;
      game.aMask |= (1 << cat);
      if (cat < m.upperCount) game.aUpper = Math.min(game.aUpper + score, m.upperThreshold);
      log.push({ type: 'assign', dice: sorted, cat, score });
      break;
    }
    const keepMask = action - m.numCat;
    const kept = [];
    for (let i = 0; i < 5; i++) if (keepMask & (1 << i)) kept.push(sorted[i]);
    dice = [...kept, ...rollN(5 - kept.length)];
    log.push({ type: 'reroll', from: sorted, kept, to: [...dice] });
  }
  game.aiLog = log;
}

function playAITrickal(game, m) {
  const tk = m.diceTk;
  let normalDice = rollN(4);
  let specialDie = rollSpecial();
  const log = [];

  for (let rerolls = 2; rerolls >= 0; rerolls--) {
    const sorted = normalDice.slice().sort((a, b) => a - b);
    const ni = tk.normalToIndex(sorted);
    const si = tk.specialToIdx(specialDie);
    const di = tk.diceStateIdx(ni, si);
    const action = m.strategy.getAction(game.aMask, game.aUpper, rerolls, di);

    if (action < m.numCat) {
      const cat = action;
      const score = m.scoring.scoreCategory(sorted, specialDie, cat);
      game.aScores[cat] = score;
      game.aMask |= (1 << cat);
      if (cat < m.upperCount) game.aUpper = Math.min(game.aUpper + score, m.upperThreshold);
      log.push({ type: 'assign', dice: sorted, special: specialDie, cat, score });
      break;
    }

    const keepBits = action - m.numCat;
    const normalKeepMask = keepBits >> 1;
    const keepSpecial = keepBits & 1;
    const kept = [];
    for (let i = 0; i < 4; i++) if (normalKeepMask & (1 << i)) kept.push(sorted[i]);
    normalDice = [...kept, ...rollN(4 - kept.length)];
    if (!keepSpecial) specialDie = rollSpecial();
    log.push({ type: 'reroll', from: sorted, kept, special: specialDie, keepSpecial: !!keepSpecial, to: [...normalDice] });
  }
  game.aiLog = log;
}

// ── 전략 분석 ──

export function recordDecision(game, playerAction) {
  const m = M(game);
  if (!game.history) game.history = [];
  if (!game.totalDecisions) game.totalDecisions = 0;
  if (!game.totalEVLoss) game.totalEVLoss = 0;
  game.totalDecisions++;

  const { diceIdx, sorted } = getDiceIdx(game);
  const result = m.strategy.analyzeAction(game.pMask, game.pUpper, game.rerolls, diceIdx, playerAction);
  game.totalEVLoss += result.evDiff;
  if (result.evDiff < 0.01) return;

  const optAction = m.strategy.getAction(game.pMask, game.pUpper, game.rerolls, diceIdx);
  let optimal;
  if (optAction < m.numCat) {
    optimal = { type: 'assign', category: optAction };
  } else if (m.hasSpecial) {
    const keepBits = optAction - m.numCat;
    optimal = { type: 'reroll', normalKeepMask: keepBits >> 1, keepSpecial: !!(keepBits & 1) };
  } else {
    const keepMask = optAction - m.numCat;
    const keptValues = [];
    for (let i = 0; i < 5; i++) if (keepMask & (1 << i)) keptValues.push(sorted[i]);
    optimal = { type: 'reroll', keptValues };
  }

  const catNames = m.scoring.CATEGORY_NAMES;
  game.history.push({
    round: game.round, rerolls: game.rerolls, dice: [...sorted],
    special: m.hasSpecial ? game.specialDie : undefined,
    player: playerAction, optimal,
    playerScore: playerAction.type === 'assign' ? getScore(game, playerAction.category, sorted) : undefined,
    optimalScore: optimal.type === 'assign' ? getScore(game, optimal.category, sorted) : undefined,
    rank: result.rank, totalActions: result.totalActions,
    evDiff: Math.round(result.evDiff * 100) / 100,
  });
}

// ── 라운드 진행 ──

export function nextRound(game) {
  const m = M(game);
  game.round++;
  if (game.round <= m.rounds) {
    if (m.hasSpecial) {
      game.dice = rollN(4);
      game.specialDie = rollSpecial();
    } else {
      game.dice = rollN(5);
    }
    game.rerolls = 2;
    logRoll(game);
  }
}

export function calcTotal(game) {
  const m = M(game);
  const calc = (scores, upper) => {
    let t = 0;
    for (const s of scores) if (s >= 0) t += s;
    if (upper >= m.upperThreshold) t += m.upperBonus;
    return t;
  };
  return { pT: calc(game.pScores, game.pUpper), aT: calc(game.aScores, game.aUpper) };
}

export function isGameOver(game) { return game.round > M(game).rounds; }

// ── 분석 포맷 ──

export function getAnalysis(game) {
  const m = M(game);
  const evLoss = game.totalEVLoss || 0;
  const expectedScore = m.strategy.getExpectedScore();
  const A = expectedScore / 8;
  const playScore = Math.round(100 / Math.pow(1 + evLoss / A, 2));

  return {
    playScore,
    evLoss: evLoss.toFixed(1),
    mistakes: game.history ? [...game.history].sort((a, b) => b.evDiff - a.evDiff) : [],
  };
}

// ── 게임 히스토리 저장 ──

function generateGameId(mode) {
  const prefix = mode === 'trickal' ? 'tk' : 'std';
  const d = new Date();
  const date = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${date}_${rand}`;
}

export function saveGameHistory(game) {
  const all = loadJSON(HISTORY_KEY);
  const { pT, aT } = calcTotal(game);
  const m = M(game);
  const analysis = getAnalysis(game);
  const gameId = generateGameId(game.mode);
  all[gameId] = {
    date: new Date().toISOString(),
    mode: game.mode,
    playerScores: [...game.pScores],
    aiScores: [...game.aScores],
    playerUpper: game.pUpper,
    aiUpper: game.aUpper,
    playerTotal: pT,
    aiTotal: aT,
    moves: game.moves || [],
    playScore: analysis.playScore,
    evLoss: parseFloat(analysis.evLoss),
    mistakes: analysis.mistakes,
  };
  // 최근 30개만 유지 (상세 데이터가 크므로)
  const entries = Object.entries(all).sort(([,a],[,b]) => b.date.localeCompare(a.date));
  const trimmed = Object.fromEntries(entries.slice(0, 30));
  saveJSON(HISTORY_KEY, trimmed);
  return gameId;
}

export function getGameRecord(gameId) {
  const all = loadJSON(HISTORY_KEY);
  const g = all[gameId];
  return g ? { id: gameId, ...g } : null;
}

/** moves 배열에서 라운드별 데이터 추출 */
export function extractRounds(record) {
  const rounds = [];
  let cur = null;
  for (const mv of (record.moves || [])) {
    if (mv.type === 'roll') {
      cur = { round: mv.round, roll: mv, rerolls: [], assign: null, ai: null };
    } else if (mv.type === 'reroll' && cur) {
      cur.rerolls.push(mv);
    } else if (mv.type === 'assign' && cur) {
      cur.assign = mv;
    } else if (mv.type === 'ai' && cur) {
      cur.ai = mv;
      rounds.push(cur);
      cur = null;
    }
  }
  return rounds;
}

/** 라운드 N 직전까지의 플레이어 mask/upper 복원 */
export function replayState(record, beforeRound) {
  const m = MODE[record.mode];
  let pMask = 0, pUpper = 0;
  for (const rd of extractRounds(record)) {
    if (rd.round >= beforeRound) break;
    if (rd.assign) {
      const cat = rd.assign.category;
      pMask |= (1 << cat);
      if (cat < m.upperCount) pUpper = Math.min(pUpper + rd.assign.score, m.upperThreshold);
    }
  }
  return { pMask, pUpper };
}

/** 주사위 상태 → diceIdx 변환 */
export function computeDiceIdx(dice, specialDie, mode) {
  const m = MODE[mode];
  if (m.hasSpecial) {
    const tk = m.diceTk;
    const sorted = dice.slice().sort((a, b) => a - b);
    return tk.diceStateIdx(tk.normalToIndex(sorted), tk.specialToIdx(specialDie));
  }
  const sorted = dice.slice().sort((a, b) => a - b);
  return m.dice.comboToIndex(sorted);
}

export function getGameHistoryList() {
  const all = loadJSON(HISTORY_KEY);
  return Object.entries(all)
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
