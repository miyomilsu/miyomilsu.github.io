/**
 * 트릭컬 요트 다이스 점수 계산
 *
 * 상체 (0~4): Twos, Threes, Fours, Fives, Sixes
 * 상체 보너스: 합계 >= 55이면 +40
 *
 * 하체 (5~7):
 *   5: Full House  - 3+2이면 주사위 합계, 아니면 0
 *   6: Straight    - 5연속이면 30, 아니면 0
 *   7: Yacht       - 5개 같으면 50, 아니면 0
 *
 * 에르핀 눈(W): 점수 계산 시 최적 값으로 자동 배정
 */

export const NUM_CATEGORIES = 8;
export const UPPER_COUNT = 5;
export const UPPER_BONUS_THRESHOLD = 55;
export const UPPER_BONUS = 40;

export const CATEGORY_NAMES = [
  'Twos', 'Threes', 'Fours', 'Fives', 'Sixes',
  'Full House', 'Straight', 'Yacht',
];

export const WILD = 0;

function scoreRaw(dice, category) {
  const counts = new Array(7).fill(0);
  let sum = 0;
  for (const d of dice) { counts[d]++; sum += d; }

  switch (category) {
    case 0: return counts[2] * 2;
    case 1: return counts[3] * 3;
    case 2: return counts[4] * 4;
    case 3: return counts[5] * 5;
    case 4: return counts[6] * 6;
    case 5: {
      let has3 = false, has2 = false;
      for (let i = 1; i <= 6; i++) {
        if (counts[i] === 3) has3 = true;
        if (counts[i] === 2) has2 = true;
      }
      return (has3 && has2) ? sum : 0;
    }
    case 6: {
      const a = counts[1] >= 1 && counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 && counts[5] >= 1;
      const b = counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 && counts[5] >= 1 && counts[6] >= 1;
      return (a || b) ? 30 : 0;
    }
    case 7: {
      for (let i = 1; i <= 6; i++) if (counts[i] === 5) return 50;
      return 0;
    }
    default: return 0;
  }
}

function mergeOne(sorted4, val) {
  const r = new Array(5);
  let i = 0, j = 0;
  while (i < 4 && sorted4[i] <= val) r[j++] = sorted4[i++];
  r[j++] = val;
  while (i < 4) r[j++] = sorted4[i++];
  return r;
}

export function scoreCategory(normalDice, special, category) {
  if (special === WILD) {
    let best = 0;
    for (let v = 1; v <= 6; v++) {
      best = Math.max(best, scoreRaw(mergeOne(normalDice, v), category));
    }
    return best;
  }
  return scoreRaw(mergeOne(normalDice, special), category);
}
