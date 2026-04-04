/**
 * 트릭컬 전략 엔진 — 브라우저 버전
 */

import {
  FACES, NUM_NORMAL, SPECIAL_COUNT,
  NORMAL_COMBOS, NORMAL_COUNT, DICE_STATE_COUNT,
  diceStateIdx, idxToSpecial,
  precomputeNormalTransitions,
} from './dice-trickal.js';

import {
  NUM_CATEGORIES, UPPER_COUNT, UPPER_BONUS_THRESHOLD,
  scoreCategory,
} from './scoring-trickal.js';

const NUM_UPPER_STATES = UPPER_BONUS_THRESHOLD + 1;
const KEEP_ALL_NORMAL = (1 << NUM_NORMAL) - 1;
const ACTION_KEEP_BASE = NUM_CATEGORIES;

let turnStartEV = null;
let normalTrans = null;
let scores = null;

export async function load() {
  if (turnStartEV) return;

  const resp = await fetch('./data/turnstart-ev-trickal.bin.gz');
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

  normalTrans = precomputeNormalTransitions();

  scores = new Array(DICE_STATE_COUNT);
  for (let ni = 0; ni < NORMAL_COUNT; ni++) {
    for (let si = 0; si < SPECIAL_COUNT; si++) {
      const di = diceStateIdx(ni, si);
      scores[di] = new Int16Array(NUM_CATEGORIES);
      const special = idxToSpecial(si);
      for (let c = 0; c < NUM_CATEGORIES; c++) {
        scores[di][c] = scoreCategory(NORMAL_COMBOS[ni], special, c);
      }
    }
  }

  console.log(`Trickal 전략 엔진 로드 (turnStartEV ${(totalLen / 1024).toFixed(0)} KB)`);
}

// ── 캐시 ──
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

  const dp0 = new Float64Array(DICE_STATE_COUNT);
  const dp1 = new Float64Array(DICE_STATE_COUNT);
  const dp2 = new Float64Array(DICE_STATE_COUNT);
  const act0 = new Uint8Array(DICE_STATE_COUNT);
  const act1 = new Uint8Array(DICE_STATE_COUNT);
  const act2 = new Uint8Array(DICE_STATE_COUNT);

  for (let di = 0; di < DICE_STATE_COUNT; di++) {
    let bestEV = -Infinity, bestAct = 0;
    for (const c of available) {
      const score = scores[di][c];
      const newUpper = c < UPPER_COUNT ? Math.min(upper + score, UPPER_BONUS_THRESHOLD) : upper;
      const ev = score + turnStartEV[(mask | (1 << c)) * NUM_UPPER_STATES + newUpper];
      if (ev > bestEV) { bestEV = ev; bestAct = c; }
    }
    dp0[di] = bestEV;
    act0[di] = bestAct;
  }

  function computeRerollLevel(prevDP, dpOut, actOut) {
    const avgPrev = new Float64Array(NORMAL_COUNT);
    for (let ni = 0; ni < NORMAL_COUNT; ni++) {
      let s = 0;
      for (let si = 0; si < SPECIAL_COUNT; si++) s += prevDP[ni * SPECIAL_COUNT + si];
      avgPrev[ni] = s / FACES;
    }

    for (let ni = 0; ni < NORMAL_COUNT; ni++) {
      const entries = normalTrans[ni];
      for (let si = 0; si < SPECIAL_COUNT; si++) {
        const di = ni * SPECIAL_COUNT + si;
        let bestEV = dp0[di], bestAct = act0[di];

        for (const { normalKeepMask, indices, probs } of entries) {
          if (normalKeepMask !== KEEP_ALL_NORMAL) {
            let ev = 0;
            for (let t = 0; t < indices.length; t++) {
              ev += probs[t] * prevDP[indices[t] * SPECIAL_COUNT + si];
            }
            if (ev > bestEV) {
              bestEV = ev;
              bestAct = ACTION_KEEP_BASE + normalKeepMask * 2 + 1;
            }
          }
          {
            let ev = 0;
            for (let t = 0; t < indices.length; t++) {
              ev += probs[t] * avgPrev[indices[t]];
            }
            if (ev > bestEV) {
              bestEV = ev;
              bestAct = ACTION_KEEP_BASE + normalKeepMask * 2;
            }
          }
        }

        dpOut[di] = bestEV;
        actOut[di] = bestAct;
      }
    }
  }

  computeRerollLevel(dp0, dp1, act1);
  computeRerollLevel(dp1, dp2, act2);

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
    const newUpper = c < UPPER_COUNT ? Math.min(upper + score, UPPER_BONUS_THRESHOLD) : upper;
    allEVs.push(score + turnStartEV[(mask | (1 << c)) * NUM_UPPER_STATES + newUpper]);
  }

  if (rerolls > 0) {
    const ni = Math.floor(diceIdx / SPECIAL_COUNT);
    const si = diceIdx % SPECIAL_COUNT;
    const prevDP = dp[rerolls - 1];

    const avgPrev = new Float64Array(NORMAL_COUNT);
    for (let nni = 0; nni < NORMAL_COUNT; nni++) {
      let s = 0;
      for (let ssi = 0; ssi < SPECIAL_COUNT; ssi++) s += prevDP[nni * SPECIAL_COUNT + ssi];
      avgPrev[nni] = s / FACES;
    }

    for (const { normalKeepMask, indices, probs } of normalTrans[ni]) {
      if (normalKeepMask !== KEEP_ALL_NORMAL) {
        let ev = 0;
        for (let t = 0; t < indices.length; t++) ev += probs[t] * prevDP[indices[t] * SPECIAL_COUNT + si];
        allEVs.push(ev);
      }
      {
        let ev = 0;
        for (let t = 0; t < indices.length; t++) ev += probs[t] * avgPrev[indices[t]];
        allEVs.push(ev);
      }
    }
  }

  let playerEV;
  if (playerAction.type === 'assign') {
    const c = playerAction.category;
    const score = scores[diceIdx][c];
    const newUpper = c < UPPER_COUNT ? Math.min(upper + score, UPPER_BONUS_THRESHOLD) : upper;
    playerEV = score + turnStartEV[(mask | (1 << c)) * NUM_UPPER_STATES + newUpper];
  } else {
    const { normalKeepMask, keepSpecial } = playerAction;
    const ni = Math.floor(diceIdx / SPECIAL_COUNT);
    const si = diceIdx % SPECIAL_COUNT;
    const prevDP = dp[rerolls - 1];

    playerEV = optimalEV;
    for (const { normalKeepMask: km, indices, probs } of normalTrans[ni]) {
      if (km !== normalKeepMask) continue;
      if (keepSpecial) {
        playerEV = 0;
        for (let t = 0; t < indices.length; t++) playerEV += probs[t] * prevDP[indices[t] * SPECIAL_COUNT + si];
      } else {
        playerEV = 0;
        for (let t = 0; t < indices.length; t++) {
          let s = 0;
          for (let ssi = 0; ssi < SPECIAL_COUNT; ssi++) s += prevDP[indices[t] * SPECIAL_COUNT + ssi];
          playerEV += probs[t] * s / FACES;
        }
      }
      break;
    }
  }

  const rank = allEVs.filter(ev => ev > playerEV + 1e-9).length + 1;
  return { rank, totalActions: allEVs.length, playerEV, optimalEV, evDiff: optimalEV - playerEV };
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
    const keepBits = a - NUM_CATEGORIES;
    const nkm = keepBits >> 1;
    const ks = keepBits & 1;
    const ni = Math.floor(di / SPECIAL_COUNT);
    const si = di % SPECIAL_COUNT;

    for (const { normalKeepMask, indices, probs } of normalTrans[ni]) {
      if (normalKeepMask !== nkm) continue;
      if (ks) {
        for (let t = 0; t < indices.length; t++) trace(r - 1, indices[t] * SPECIAL_COUNT + si, prob * probs[t]);
      } else {
        for (let t = 0; t < indices.length; t++) {
          for (let ns = 0; ns < SPECIAL_COUNT; ns++) {
            trace(r - 1, indices[t] * SPECIAL_COUNT + ns, prob * probs[t] / FACES);
          }
        }
      }
      break;
    }
  }

  trace(rerolls, diceIdx, 1.0);
  return { dist, scoreAccum };
}

export { NUM_CATEGORIES, SPECIAL_COUNT, NORMAL_COUNT, DICE_STATE_COUNT };
