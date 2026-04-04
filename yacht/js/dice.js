/**
 * 주사위 조합 열거, 인덱싱, 확률, 전이 테이블 유틸리티
 * 5개 주사위(1~6)의 정렬된 조합 = 중복조합 6H5 = C(10,5) = 252가지
 */

export const FACES = 6;
export const NUM_DICE = 5;

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function generateCombos(n) {
  if (n === 0) return [[]];
  const result = [];
  function gen(pos, minVal, current) {
    if (pos === n) { result.push(current.slice()); return; }
    for (let v = minVal; v <= FACES; v++) {
      current[pos] = v;
      gen(pos + 1, v, current);
    }
  }
  gen(0, 1, new Array(n));
  return result;
}

export const COMBOS = generateCombos(NUM_DICE);
export const COMBO_COUNT = COMBOS.length;

const comboIndexMap = new Map();
COMBOS.forEach((c, i) => comboIndexMap.set(c.join(','), i));

export function comboToIndex(combo) {
  return comboIndexMap.get(combo.join(','));
}

export function multiplicity(combo) {
  const counts = new Array(FACES + 1).fill(0);
  for (const v of combo) counts[v]++;
  let denom = 1;
  for (let i = 1; i <= FACES; i++) denom *= factorial(counts[i]);
  return factorial(combo.length) / denom;
}

export const COMBO_PROBS = new Float64Array(COMBO_COUNT);
{
  const total = Math.pow(FACES, NUM_DICE);
  for (let i = 0; i < COMBO_COUNT; i++) {
    COMBO_PROBS[i] = multiplicity(COMBOS[i]) / total;
  }
}

export function faceCounts(combo) {
  const counts = new Array(FACES + 1).fill(0);
  for (const v of combo) counts[v]++;
  return counts;
}

function enumSubMultisets(combo) {
  const faces = [], maxCounts = [];
  let prev = -1;
  for (const v of combo) {
    if (v !== prev) { faces.push(v); maxCounts.push(1); prev = v; }
    else maxCounts[maxCounts.length - 1]++;
  }
  const results = [];
  function gen(fi, current) {
    if (fi === faces.length) { results.push(current.slice()); return; }
    const before = current.length;
    for (let k = 0; k <= maxCounts[fi]; k++) {
      gen(fi + 1, current);
      current.push(faces[fi]);
    }
    current.length = before;
  }
  gen(0, []);
  return results;
}

export function keepToMask(combo, kept) {
  const used = new Array(NUM_DICE).fill(false);
  let mask = 0;
  for (const v of kept) {
    for (let i = 0; i < NUM_DICE; i++) {
      if (!used[i] && combo[i] === v) {
        used[i] = true;
        mask |= (1 << i);
        break;
      }
    }
  }
  return mask;
}

export function precomputeTransitions() {
  const combosBySize = {};
  for (let n = 0; n <= NUM_DICE; n++) {
    const combos = generateCombos(n);
    const total = Math.pow(FACES, n) || 1;
    combosBySize[n] = combos.map(c => ({
      combo: c,
      prob: multiplicity(c) / total,
    }));
  }

  const allTransitions = new Array(COMBO_COUNT);

  for (let di = 0; di < COMBO_COUNT; di++) {
    const dice = COMBOS[di];
    const subsets = enumSubMultisets(dice);
    const entries = [];

    for (const kept of subsets) {
      if (kept.length === NUM_DICE) continue;
      const keepMask = keepToMask(dice, kept);
      const numReroll = NUM_DICE - kept.length;
      const outcomes = combosBySize[numReroll];
      const dist = new Float64Array(COMBO_COUNT);

      for (const { combo: rolled, prob } of outcomes) {
        const merged = new Array(NUM_DICE);
        let ki = 0, ri = 0, mi = 0;
        while (ki < kept.length && ri < rolled.length) {
          if (kept[ki] <= rolled[ri]) merged[mi++] = kept[ki++];
          else merged[mi++] = rolled[ri++];
        }
        while (ki < kept.length) merged[mi++] = kept[ki++];
        while (ri < rolled.length) merged[mi++] = rolled[ri++];
        dist[comboIndexMap.get(merged.join(','))] += prob;
      }

      let nnz = 0;
      for (let i = 0; i < COMBO_COUNT; i++) if (dist[i] > 0) nnz++;
      const indices = new Uint16Array(nnz);
      const probs = new Float64Array(nnz);
      let idx = 0;
      for (let i = 0; i < COMBO_COUNT; i++) {
        if (dist[i] > 0) { indices[idx] = i; probs[idx] = dist[i]; idx++; }
      }
      entries.push({ keepMask, indices, probs });
    }

    allTransitions[di] = entries;
  }

  return allTransitions;
}
