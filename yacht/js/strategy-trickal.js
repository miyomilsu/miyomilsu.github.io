/**
 * 트릭컬 전략 엔진 — 브라우저 버전
 */

import {
  FACES, NUM_NORMAL, SPECIAL_COUNT,
  NORMAL_COMBOS, NORMAL_COUNT, DICE_STATE_COUNT, DICE_STATE_PROBS,
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

/**
 * 주어진 상태에서 가능한 모든 행동을 EV 내림차순으로 반환
 */
export function enumerateActions(mask, upper, rerolls, diceIdx) {
  const { dp } = computeTurnDP(mask, upper);
  const ni = Math.floor(diceIdx / SPECIAL_COUNT);
  const si = diceIdx % SPECIAL_COUNT;
  const results = [];

  // 배정 행동
  for (let c = 0; c < NUM_CATEGORIES; c++) {
    if (mask & (1 << c)) continue;
    const score = scores[diceIdx][c];
    const newUpper = c < UPPER_COUNT ? Math.min(upper + score, UPPER_BONUS_THRESHOLD) : upper;
    const ev = score + turnStartEV[(mask | (1 << c)) * NUM_UPPER_STATES + newUpper];
    results.push({ type: 'assign', action: c, ev, category: c, score });
  }

  // 리롤 행동
  if (rerolls > 0) {
    const prevDP = dp[rerolls - 1];
    const avgPrev = new Float64Array(NORMAL_COUNT);
    for (let nni = 0; nni < NORMAL_COUNT; nni++) {
      let s = 0;
      for (let ssi = 0; ssi < SPECIAL_COUNT; ssi++) s += prevDP[nni * SPECIAL_COUNT + ssi];
      avgPrev[nni] = s / FACES;
    }

    const KEEP_ALL = (1 << NUM_NORMAL) - 1;
    for (const { normalKeepMask, indices, probs } of normalTrans[ni]) {
      // keepSpecial = true (일반 주사위 전부 킵이 아닌 경우만)
      if (normalKeepMask !== KEEP_ALL) {
        let ev = 0;
        for (let t = 0; t < indices.length; t++) ev += probs[t] * prevDP[indices[t] * SPECIAL_COUNT + si];
        const keptNormal = [];
        for (let i = 0; i < NUM_NORMAL; i++) if (normalKeepMask & (1 << i)) keptNormal.push(i);
        results.push({ type: 'reroll', ev, normalKeepMask, keepSpecial: true, keptNormal });
      }

      // keepSpecial = false
      {
        let ev = 0;
        for (let t = 0; t < indices.length; t++) ev += probs[t] * avgPrev[indices[t]];
        const keptNormal = [];
        for (let i = 0; i < NUM_NORMAL; i++) if (normalKeepMask & (1 << i)) keptNormal.push(i);
        results.push({ type: 'reroll', ev, normalKeepMask, keepSpecial: false, keptNormal });
      }
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

/**
 * 리롤 결과의 운 계산
 * @param normalKeepMask 일반 주사위 킵 비트마스크
 * @param keepSpecial 에르핀 킵 여부
 * @param actualResultIdx 리롤 후 실제 결과 diceStateIdx
 */
export function computeRerollLuck(mask, upper, rerolls, diceIdx, normalKeepMask, keepSpecial, actualResultIdx) {
  const { dp } = computeTurnDP(mask, upper);
  const prevDP = dp[rerolls - 1];
  const ni = Math.floor(diceIdx / SPECIAL_COUNT);
  const si = diceIdx % SPECIAL_COUNT;

  // avgPrev: 에르핀 리롤 시 사용할 평균 (에르핀 전 값에 대해 평균)
  const avgPrev = new Float64Array(NORMAL_COUNT);
  const avgPrevSq = new Float64Array(NORMAL_COUNT);
  for (let nni = 0; nni < NORMAL_COUNT; nni++) {
    let s = 0, sq = 0;
    for (let ssi = 0; ssi < SPECIAL_COUNT; ssi++) {
      const ev = prevDP[nni * SPECIAL_COUNT + ssi];
      s += ev;
      sq += ev * ev;
    }
    avgPrev[nni] = s / FACES;
    avgPrevSq[nni] = sq / FACES;
  }

  for (const { normalKeepMask: nkm, indices, probs } of normalTrans[ni]) {
    if (nkm !== normalKeepMask) continue;

    let mean = 0, meanSq = 0;
    const actualEV = prevDP[actualResultIdx];

    if (keepSpecial) {
      let pBelow = 0, pEqual = 0;
      for (let t = 0; t < indices.length; t++) {
        const ev = prevDP[indices[t] * SPECIAL_COUNT + si];
        mean += probs[t] * ev;
        meanSq += probs[t] * ev * ev;
        if (ev < actualEV - 1e-9) pBelow += probs[t];
        else if (ev < actualEV + 1e-9) pEqual += probs[t];
      }
      const variance = meanSq - mean * mean;
      const sigma = Math.sqrt(variance);
      const zSigma = sigma > 1e-9 ? (actualEV - mean) / sigma : 0;
      const percentile = pBelow + pEqual * 0.5;
      return { expectedEV: mean, variance, actualEV, luck: actualEV - mean, zSigma, percentile };
    } else {
      // 에르핀도 리롤: 결합 분포에서 percentile 계산
      let pBelow = 0, pEqual = 0;
      for (let t = 0; t < indices.length; t++) {
        mean += probs[t] * avgPrev[indices[t]];
        meanSq += probs[t] * avgPrevSq[indices[t]];
        // 개별 에르핀 결과별로 비교
        for (let ssi = 0; ssi < SPECIAL_COUNT; ssi++) {
          const ev = prevDP[indices[t] * SPECIAL_COUNT + ssi];
          const p = probs[t] / FACES;
          if (ev < actualEV - 1e-9) pBelow += p;
          else if (ev < actualEV + 1e-9) pEqual += p;
        }
      }
      const variance = meanSq - mean * mean;
      const sigma = Math.sqrt(variance);
      const zSigma = sigma > 1e-9 ? (actualEV - mean) / sigma : 0;
      const percentile = pBelow + pEqual * 0.5;
      return { expectedEV: mean, variance, actualEV, luck: actualEV - mean, zSigma, percentile };
    }
  }
  return null;
}

export function computeInitialRollLuck(mask, upper, actualDiceIdx) {
  const { dp } = computeTurnDP(mask, upper);
  const dp2 = dp[2];
  let mean = 0, meanSq = 0;
  const actualEV = dp2[actualDiceIdx];
  let pBelow = 0, pEqual = 0;
  for (let i = 0; i < DICE_STATE_COUNT; i++) {
    const ev = dp2[i];
    const p = DICE_STATE_PROBS[i];
    mean += p * ev;
    meanSq += p * ev * ev;
    if (ev < actualEV - 1e-9) pBelow += p;
    else if (ev < actualEV + 1e-9) pEqual += p;
  }
  const variance = meanSq - mean * mean;
  const sigma = Math.sqrt(variance);
  const zSigma = sigma > 1e-9 ? (actualEV - mean) / sigma : 0;
  const percentile = pBelow + pEqual * 0.5;
  return { expectedEV: mean, variance, actualEV, luck: actualEV - mean, zSigma, percentile };
}

export { NUM_CATEGORIES, SPECIAL_COUNT, NORMAL_COUNT, DICE_STATE_COUNT };
