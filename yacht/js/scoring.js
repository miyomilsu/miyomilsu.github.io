/**
 * 요트 다이스 점수 계산 (닌텐도 스위치 51가지 게임 규칙)
 *
 * 상체 (0~5): Aces ~ Sixes (해당 눈 합산)
 * 상체 보너스: 상체 합계 >= 63이면 +35
 *
 * 하체 (6~11):
 *   6: Choice      - 주사위 합계
 *   7: Four of a Kind - 같은 눈 4개 이상이면 주사위 합계, 아니면 0
 *   8: Full House   - 3+2 조합이면 주사위 합계, 아니면 0
 *   9: Small Straight - 연속 4개이면 15, 아니면 0
 *  10: Large Straight - 연속 5개이면 30, 아니면 0
 *  11: Yacht        - 5개 같으면 50, 아니면 0
 */

export const NUM_CATEGORIES = 12;
export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS = 35;
export const UPPER_COUNT = 6;

export const CATEGORY_NAMES = [
  'Aces', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes',
  'Choice', 'Four of a Kind', 'Full House',
  'Small Straight', 'Large Straight', 'Yacht',
];

export function scoreCategory(dice, category) {
  const counts = new Array(7).fill(0);
  let sum = 0;
  for (const d of dice) {
    counts[d]++;
    sum += d;
  }

  switch (category) {
    case 0: case 1: case 2: case 3: case 4: case 5:
      return counts[category + 1] * (category + 1);

    case 6: return sum;

    case 7: {
      let maxCount = 0;
      for (let i = 1; i <= 6; i++) if (counts[i] > maxCount) maxCount = counts[i];
      return maxCount >= 4 ? sum : 0;
    }

    case 8: {
      let has3 = false, has2 = false, has5 = false;
      for (let i = 1; i <= 6; i++) {
        if (counts[i] === 3) has3 = true;
        if (counts[i] === 2) has2 = true;
        if (counts[i] === 5) has5 = true;
      }
      return (has5 || (has3 && has2)) ? sum : 0;
    }

    case 9: {
      for (let start = 1; start <= 3; start++) {
        if (counts[start] >= 1 && counts[start + 1] >= 1 &&
            counts[start + 2] >= 1 && counts[start + 3] >= 1) {
          return 15;
        }
      }
      return 0;
    }

    case 10: {
      const a = counts[1] >= 1 && counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 && counts[5] >= 1;
      const b = counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 && counts[5] >= 1 && counts[6] >= 1;
      return (a || b) ? 30 : 0;
    }

    case 11: {
      for (let i = 1; i <= 6; i++) if (counts[i] === 5) return 50;
      return 0;
    }

    default: return 0;
  }
}
