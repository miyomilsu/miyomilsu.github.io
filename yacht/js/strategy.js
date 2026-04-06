/**
 * 전략 엔진 (Standard) — 브라우저 버전
 * turnStartEV를 fetch로 로드, 나머지는 on-the-fly 계산
 */

import { COMBOS, COMBO_COUNT, COMBO_PROBS, precomputeTransitions, keepToMask } from './dice.js';
import { scoreCategory, NUM_CATEGORIES, UPPER_BONUS_THRESHOLD } from './scoring.js';

const NUM_UPPER_STATES = 64;
const ACTION_KEEP_BASE = 12;

let turnStartEV = null;
let transitions = null;
let scores = null;

export async function load() {
  if (turnStartEV) return;

  const resp = await fetch('./data/turnstart-ev.bin.gz');
  const ds = new DecompressionStream('gzip');
  const decompressed = resp.body.pipeThrough(ds);
  const reader = decompressed.getReader();
  const chunks = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.byteLength;
  }
  const raw = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.byteLength;
  }
  turnStartEV = new Float64Array(raw.buffer, raw.byteOffset, raw.byteLength / 8);

  transitions = precomputeTransitions();

  scores = new Array(COMBO_COUNT);
  for (let di = 0; di < COMBO_COUNT; di++) {
    scores[di] = new Int16Array(NUM_CATEGORIES);
    for (let c = 0; c < NUM_CATEGORIES; c++) {
      scores[di][c] = scoreCategory(COMBOS[di], c);
    }
  }

  console.log(`Standard 전략 엔진 로드 (turnStartEV ${(totalLen / 1024).toFixed(0)} KB)`);
}

// ── 턴 내부 DP ──

let _cacheKey = -1;
let _cacheDp = null;
let _cacheAct = null;

export function computeTurnDP(mask, upper) {
  const key = mask * NUM_UPPER_STATES + upper;
  if (key === _cacheKey) return { dp: _cacheDp, act: _cacheAct };

  const available = [];
  for (let c = 0; c < NUM_CATEGORIES; c++) {
    if (!(mask & (1 << c))) available.push(c);
  }

  const dp0 = new Float64Array(COMBO_COUNT);
  const dp1 = new Float64Array(COMBO_COUNT);
  const dp2 = new Float64Array(COMBO_COUNT);
  const act0 = new Uint8Array(COMBO_COUNT);
  const act1 = new Uint8Array(COMBO_COUNT);
  const act2 = new Uint8Array(COMBO_COUNT);

  for (let di = 0; di < COMBO_COUNT; di++) {
    let bestEV = -Infinity, bestAct = 0;
    for (const c of available) {
      const score = scores[di][c];
      const newUpper = c < 6 ? Math.min(upper + score, UPPER_BONUS_THRESHOLD) : upper;
      const ev = score + turnStartEV[(mask | (1 << c)) * NUM_UPPER_STATES + newUpper];
      if (ev > bestEV) { bestEV = ev; bestAct = c; }
    }
    dp0[di] = bestEV;
    act0[di] = bestAct;
  }

  for (let di = 0; di < COMBO_COUNT; di++) {
    let bestEV = dp0[di], bestAct = act0[di];
    for (const { keepMask, indices, probs } of transitions[di]) {
      let ev = 0;
      for (let t = 0; t < indices.length; t++) ev += probs[t] * dp0[indices[t]];
      if (ev > bestEV) { bestEV = ev; bestAct = ACTION_KEEP_BASE + keepMask; }
    }
    dp1[di] = bestEV;
    act1[di] = bestAct;
  }

  for (let di = 0; di < COMBO_COUNT; di++) {
    let bestEV = dp0[di], bestAct = act0[di];
    for (const { keepMask, indices, probs } of transitions[di]) {
      let ev = 0;
      for (let t = 0; t < indices.length; t++) ev += probs[t] * dp1[indices[t]];
      if (ev > bestEV) { bestEV = ev; bestAct = ACTION_KEEP_BASE + keepMask; }
    }
    dp2[di] = bestEV;
    act2[di] = bestAct;
  }

  _cacheDp = [dp0, dp1, dp2];
  _cacheAct = [act0, act1, act2];
  _cacheKey = key;
  return { dp: _cacheDp, act: _cacheAct };
}

export function getAction(mask, upper, rerolls, diceIdx) {
  return computeTurnDP(mask, upper).act[rerolls][diceIdx];
}

export function getEV(mask, upper, rerolls, diceIdx) {
  return computeTurnDP(mask, upper).dp[rerolls][diceIdx];
}

export function analyzeAction(mask, upper, rerolls, diceIdx, playerAction) {
  const { dp } = computeTurnDP(mask, upper);
  const optimalEV = dp[rerolls][diceIdx];
  const allEVs = [];

  for (let c = 0; c < NUM_CATEGORIES; c++) {
    if (mask & (1 << c)) continue;
    const score = scores[diceIdx][c];
    const newUpper = c < 6 ? Math.min(upper + score, UPPER_BONUS_THRESHOLD) : upper;
    allEVs.push(score + turnStartEV[(mask | (1 << c)) * NUM_UPPER_STATES + newUpper]);
  }

  if (rerolls > 0) {
    const prevDP = dp[rerolls - 1];
    for (const { indices, probs } of transitions[diceIdx]) {
      let ev = 0;
      for (let t = 0; t < indices.length; t++) ev += probs[t] * prevDP[indices[t]];
      allEVs.push(ev);
    }
  }

  let playerEV;
  if (playerAction.type === 'assign') {
    const c = playerAction.category;
    const score = scores[diceIdx][c];
    const newUpper = c < 6 ? Math.min(upper + score, UPPER_BONUS_THRESHOLD) : upper;
    playerEV = score + turnStartEV[(mask | (1 << c)) * NUM_UPPER_STATES + newUpper];
  } else {
    const sorted = COMBOS[diceIdx];
    const km = keepToMask(sorted, playerAction.keptValues);
    const prevDP = dp[rerolls - 1];
    playerEV = optimalEV;
    for (const { keepMask, indices, probs } of transitions[diceIdx]) {
      if (keepMask === km) {
        playerEV = 0;
        for (let t = 0; t < indices.length; t++) playerEV += probs[t] * prevDP[indices[t]];
        break;
      }
    }
  }

  const rank = allEVs.filter(ev => ev > playerEV + 1e-9).length + 1;
  return { rank, totalActions: allEVs.length, playerEV, optimalEV, evDiff: optimalEV - playerEV };
}

/**
 * 주어진 상태에서 가능한 모든 행동을 EV 내림차순으로 반환
 * @returns Array<{ type, action, ev, desc, keepMask?, category?, keptIndices? }>
 */
export function enumerateActions(mask, upper, rerolls, diceIdx) {
  const { dp } = computeTurnDP(mask, upper);
  const sorted = COMBOS[diceIdx];
  const results = [];

  // 배정 행동
  for (let c = 0; c < NUM_CATEGORIES; c++) {
    if (mask & (1 << c)) continue;
    const score = scores[diceIdx][c];
    const newUpper = c < 6 ? Math.min(upper + score, UPPER_BONUS_THRESHOLD) : upper;
    const ev = score + turnStartEV[(mask | (1 << c)) * NUM_UPPER_STATES + newUpper];
    results.push({ type: 'assign', action: c, ev, category: c, score });
  }

  // 리롤 행동
  if (rerolls > 0) {
    const prevDP = dp[rerolls - 1];
    for (const { keepMask, indices, probs } of transitions[diceIdx]) {
      let ev = 0;
      for (let t = 0; t < indices.length; t++) ev += probs[t] * prevDP[indices[t]];
      const keptIndices = [];
      for (let i = 0; i < 5; i++) if (keepMask & (1 << i)) keptIndices.push(i);
      results.push({ type: 'reroll', action: NUM_CATEGORIES + keepMask, ev, keepMask, keptIndices, keptValues: keptIndices.map(i => sorted[i]) });
    }
  }

  results.sort((a, b) => b.ev - a.ev);
  return results;
}

export function getTurnStartEV(mask, upper) {
  return turnStartEV[mask * NUM_UPPER_STATES + upper];
}

export function getExpectedScore() {
  return turnStartEV[0];
}

export function traceTargetDist(mask, upper, rerolls, diceIdx) {
  const { act } = computeTurnDP(mask, upper);
  const dist = new Float64Array(NUM_CATEGORIES);
  const scoreAccum = new Float64Array(NUM_CATEGORIES);

  function trace(r, di, prob) {
    const a = act[r][di];
    if (a < NUM_CATEGORIES) {
      dist[a] += prob;
      scoreAccum[a] += prob * scores[di][a];
      return;
    }
    const km = a - NUM_CATEGORIES;
    for (const { keepMask, indices, probs } of transitions[di]) {
      if (keepMask === km) {
        for (let t = 0; t < indices.length; t++) trace(r - 1, indices[t], prob * probs[t]);
        return;
      }
    }
  }

  trace(rerolls, diceIdx, 1.0);
  return { dist, scoreAccum };
}

/**
 * 리롤 결과의 운 계산
 * @param keepMask 킵한 주사위 비트마스크 (transitions 키)
 * @param actualResultIdx 리롤 후 실제 결과 diceIdx
 * @returns { expectedEV, variance, actualEV, luck }
 */
export function computeRerollLuck(mask, upper, rerolls, diceIdx, keepMask, actualResultIdx) {
  const { dp } = computeTurnDP(mask, upper);
  const prevDP = dp[rerolls - 1];

  for (const { keepMask: km, indices, probs } of transitions[diceIdx]) {
    if (km !== keepMask) continue;
    let mean = 0, meanSq = 0;
    for (let t = 0; t < indices.length; t++) {
      const ev = prevDP[indices[t]];
      mean += probs[t] * ev;
      meanSq += probs[t] * ev * ev;
    }
    const variance = meanSq - mean * mean;
    const actualEV = prevDP[actualResultIdx];
    return { expectedEV: mean, variance, actualEV, luck: actualEV - mean };
  }
  return null;
}

/**
 * 첫 굴림(라운드 시작)의 운 계산
 * @returns { expectedEV, variance, actualEV, luck }
 */
export function computeInitialRollLuck(mask, upper, actualDiceIdx) {
  const { dp } = computeTurnDP(mask, upper);
  const dp2 = dp[2];
  let mean = 0, meanSq = 0;
  for (let i = 0; i < COMBO_COUNT; i++) {
    const ev = dp2[i];
    const p = COMBO_PROBS[i];
    mean += p * ev;
    meanSq += p * ev * ev;
  }
  const variance = meanSq - mean * mean;
  const actualEV = dp2[actualDiceIdx];
  return { expectedEV: mean, variance, actualEV, luck: actualEV - mean };
}
