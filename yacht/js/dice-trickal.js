/**
 * 트릭컬 주사위 유틸리티
 * 일반 주사위 4개 (1~6) + 특수 주사위 1개 (W,2,3,4,5,6)
 * 주사위 상태 = (정렬된 일반 4-튜플 인덱스) x (특수 상태) = 126 x 6 = 756
 */

export const FACES = 6;
export const NUM_NORMAL = 4;
export const WILD = 0;
export const SPECIAL_COUNT = 6;

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function generateCombos(n) {
  if (n === 0) return [[]];
  const result = [];
  function gen(pos, minVal, cur) {
    if (pos === n) { result.push(cur.slice()); return; }
    for (let v = minVal; v <= FACES; v++) {
      cur[pos] = v;
      gen(pos + 1, v, cur);
    }
  }
  gen(0, 1, new Array(n));
  return result;
}

export const NORMAL_COMBOS = generateCombos(NUM_NORMAL);
export const NORMAL_COUNT = NORMAL_COMBOS.length;
export const DICE_STATE_COUNT = NORMAL_COUNT * SPECIAL_COUNT;

const normalComboMap = new Map();
NORMAL_COMBOS.forEach((c, i) => normalComboMap.set(c.join(','), i));

export function normalToIndex(combo) { return normalComboMap.get(combo.join(',')); }
export function diceStateIdx(ni, si) { return ni * SPECIAL_COUNT + si; }
export function specialToIdx(val) { return val === 0 ? 0 : val - 1; }
export function idxToSpecial(idx) { return idx === 0 ? 0 : idx + 1; }

export function multiplicity(combo) {
  const counts = new Array(FACES + 1).fill(0);
  for (const v of combo) counts[v]++;
  let denom = 1;
  for (let i = 1; i <= FACES; i++) denom *= factorial(counts[i]);
  return factorial(combo.length) / denom;
}

export const DICE_STATE_PROBS = new Float64Array(DICE_STATE_COUNT);
{
  const nTotal = Math.pow(FACES, NUM_NORMAL);
  for (let ni = 0; ni < NORMAL_COUNT; ni++) {
    const nProb = multiplicity(NORMAL_COMBOS[ni]) / nTotal;
    for (let si = 0; si < SPECIAL_COUNT; si++) {
      DICE_STATE_PROBS[diceStateIdx(ni, si)] = nProb / FACES;
    }
  }
}

function enumSubMultisets(combo) {
  const faces = [], maxCounts = [];
  let prev = -1;
  for (const v of combo) {
    if (v !== prev) { faces.push(v); maxCounts.push(1); prev = v; }
    else maxCounts[maxCounts.length - 1]++;
  }
  const results = [];
  function gen(fi, cur) {
    if (fi === faces.length) { results.push(cur.slice()); return; }
    const before = cur.length;
    for (let k = 0; k <= maxCounts[fi]; k++) {
      gen(fi + 1, cur);
      cur.push(faces[fi]);
    }
    cur.length = before;
  }
  gen(0, []);
  return results;
}

export function keepToMask(combo, kept) {
  const used = new Array(combo.length).fill(false);
  let mask = 0;
  for (const v of kept) {
    for (let i = 0; i < combo.length; i++) {
      if (!used[i] && combo[i] === v) {
        used[i] = true;
        mask |= (1 << i);
        break;
      }
    }
  }
  return mask;
}

export function precomputeNormalTransitions() {
  const combosBySize = {};
  for (let n = 0; n <= NUM_NORMAL; n++) {
    const combos = generateCombos(n);
    const total = Math.pow(FACES, n) || 1;
    combosBySize[n] = combos.map(c => ({
      combo: c,
      prob: multiplicity(c) / total,
    }));
  }

  const all = new Array(NORMAL_COUNT);

  for (let ni = 0; ni < NORMAL_COUNT; ni++) {
    const dice = NORMAL_COMBOS[ni];
    const subsets = enumSubMultisets(dice);
    const entries = [];

    for (const kept of subsets) {
      const normalKeepMask = keepToMask(dice, kept);
      const numReroll = NUM_NORMAL - kept.length;

      if (numReroll === 0) {
        entries.push({
          normalKeepMask,
          indices: new Uint16Array([ni]),
          probs: new Float64Array([1.0]),
        });
        continue;
      }

      const outcomes = combosBySize[numReroll];
      const dist = new Float64Array(NORMAL_COUNT);

      for (const { combo: rolled, prob } of outcomes) {
        const merged = new Array(NUM_NORMAL);
        let ki = 0, ri = 0, mi = 0;
        while (ki < kept.length && ri < rolled.length) {
          if (kept[ki] <= rolled[ri]) merged[mi++] = kept[ki++];
          else merged[mi++] = rolled[ri++];
        }
        while (ki < kept.length) merged[mi++] = kept[ki++];
        while (ri < rolled.length) merged[mi++] = rolled[ri++];
        dist[normalComboMap.get(merged.join(','))] += prob;
      }

      let nnz = 0;
      for (let i = 0; i < NORMAL_COUNT; i++) if (dist[i] > 0) nnz++;
      const indices = new Uint16Array(nnz);
      const probs = new Float64Array(nnz);
      let idx = 0;
      for (let i = 0; i < NORMAL_COUNT; i++) {
        if (dist[i] > 0) { indices[idx] = i; probs[idx] = dist[i]; idx++; }
      }
      entries.push({ normalKeepMask, indices, probs });
    }

    all[ni] = entries;
  }

  return all;
}
