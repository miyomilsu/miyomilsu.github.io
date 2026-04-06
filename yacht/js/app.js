/**
 * 요트 다이스 웹 UI
 */

import * as Game from './game.js';

// 주사위 눈 pip 위치 (3x3 그리드: tl tc tr / ml mc mr / bl bc br)
const PIP_LAYOUTS = {
  1: ['mc'],
  2: ['tr', 'bl'],
  3: ['tr', 'mc', 'bl'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'mc', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};

/** 주사위 pip HTML 생성 (die 내부에 들어갈 내용) */
function pipHTML(val) {
  const pips = PIP_LAYOUTS[val];
  if (!pips) return '';
  return pips.map(p => `<span class="pip ${p}"></span>`).join('');
}

/** 와일드 주사위 내부 HTML */
function wildHTML() {
  return '<img src="./img/erpin.png" alt="W">';
}

/** 에르핀 특수 주사위 내부 HTML */
function specialPipHTML(val) {
  if (val === 0) return wildHTML();
  return pipHTML(val);
}

// 이전 호환용 (텍스트 전용 컨텍스트)
const DICE_DOTS = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'];

// ── 툴팁 텍스트 ──

const TIP_PLAY_SCORE = 'EV(기대값)는 특정 선택을 했을 때 게임 끝까지 최적으로 플레이하면 얻을 수 있는 평균 점수입니다. EV 손실은 플레이어의 선택과 최적 선택 사이의 EV 차이 합계입니다. 플레이 점수는 EV 손실이 적을수록 100에 가까워집니다.';

const TIP_MISTAKE = '#순위는 플레이어의 선택이 가능한 모든 선택지 중 몇 번째로 좋은 선택이었는지를 나타냅니다. EV 차이는 최적 선택 대비 손해본 기대 점수입니다.';

const TIP_ALL_ACTIONS = '현재 주사위 상태에서 가능한 모든 선택지를 EV(기대값) 순으로 정렬한 것입니다. 숫자가 높을수록 게임 끝까지의 기대 점수가 높은 선택입니다. 1위와의 EV 차이가 작을수록 좋은 선택입니다.';

const TIP_TARGET_PROB = '이 시점에서 최적으로 플레이할 경우 최종적으로 배정하게 될 족보의 확률 분포입니다.';
const TIP_TARGET_SCORE = '해당 족보에 배정했을 때의 기대 점수입니다. (해당 족보로 배정될 때의 조건부 평균)';

function helpSpan(tip) {
  return `<span class="has-tooltip ra-help-wrap"><span class="ra-help">?</span><span class="tooltip tooltip-wide">${tip}</span></span>`;
}

// 족보 한줄 설명 (tooltip)
const CAT_TIPS = {
  standard: [
    '1의 눈 합산', '2의 눈 합산', '3의 눈 합산',
    '4의 눈 합산', '5의 눈 합산', '6의 눈 합산',
    '주사위 합계 (제한 없음)',
    '같은 눈 4개 이상 → 합계',
    '3개+2개 (또는 5개 동일) → 합계',
    '연속 4개 → 15점',
    '연속 5개 → 30점',
    '5개 모두 동일 → 50점',
  ],
  trickal: [
    '2의 눈 합산', '3의 눈 합산', '4의 눈 합산',
    '5의 눈 합산', '6의 눈 합산',
    '3개+2개 → 합계 (5개 동일 불인정)',
    '연속 5개 → 30점',
    '5개 모두 동일 → 50점',
  ],
};

let game = null;
let phase = 'menu';
let selectedDice = new Set();
let animPlayer = localStorage.getItem('yacht-anim-player') !== 'off';
let animAI = localStorage.getItem('yacht-anim-ai') !== 'off';
let animating = false;

// ── DOM refs ──
const $ = id => document.getElementById(id);

const menuScreen = $('menu-screen');
const gameScreen = $('game-screen');
const overScreen = $('over-screen');
const loadingScreen = $('loading-screen');
const historyScreen = $('history-screen');
const detailScreen = $('detail-screen');
const roundAnalysisScreen = $('round-analysis-screen');
const rulesScreen = $('rules-screen');

// ── 초기화 ──

export async function init() {
  $('btn-standard').addEventListener('click', () => startGame('standard'));
  $('btn-trickal').addEventListener('click', () => startGame('trickal'));
  $('btn-history').addEventListener('click', showHistory);
  $('btn-reroll').addEventListener('click', doReroll);
  $('btn-assign').addEventListener('click', showAssignUI);
  $('btn-new-game').addEventListener('click', backToMenu);
  $('btn-rules').addEventListener('click', showRules);
  $('btn-rules-back').addEventListener('click', backToMenu);
  $('btn-history-back').addEventListener('click', backToMenu);
  $('btn-detail-back').addEventListener('click', showHistory);
  $('btn-ra-back').addEventListener('click', () => { if (currentRecord) showDetail(currentRecord.id); });
  $('btn-anim-player').addEventListener('click', () => toggleAnim('player'));
  $('btn-anim-ai').addEventListener('click', () => toggleAnim('ai'));
  updateAnimBtns();
  updateRecords();
}

function showScreen(name) {
  menuScreen.classList.toggle('hidden', name !== 'menu');
  gameScreen.classList.toggle('hidden', name !== 'game');
  overScreen.classList.toggle('hidden', name !== 'over');
  loadingScreen.classList.toggle('hidden', name !== 'loading');
  rulesScreen.classList.toggle('hidden', name !== 'rules');
  historyScreen.classList.toggle('hidden', name !== 'history');
  detailScreen.classList.toggle('hidden', name !== 'detail');
  roundAnalysisScreen.classList.toggle('hidden', name !== 'round-analysis');
}

// ── 게임 시작 ──

async function startGame(mode) {
  showScreen('loading');
  $('loading-text').textContent = '전략 엔진 로딩 중...';

  await Game.MODE[mode].strategy.load();

  game = Game.createGame(mode);
  phase = 'rolling';
  selectedDice.clear();
  showScreen('game');
  // 첫 굴림은 전체 주사위 애니메이션
  const m = Game.MODE[mode];
  const allIndices = new Set(m.hasSpecial ? [0,1,2,3,4] : [0,1,2,3,4]);
  renderGame(allIndices);
  animateRoll(allIndices, () => renderGame());
}

// ── 렌더링 ──

function renderGame(rollIndices) {
  const m = Game.MODE[game.mode];
  const catNames = m.scoring.CATEGORY_NAMES;

  // 헤더
  $('game-mode').textContent = game.mode === 'trickal' ? 'Trickal' : 'Yacht Dice';
  $('round-info').textContent = `라운드 ${game.round}/${m.rounds}`;
  $('reroll-info').textContent = `리롤 ${game.rerolls}회 남음`;

  // AI 로그
  renderAILog();

  // 주사위
  renderDice(rollIndices);

  // 버튼 상태
  const locked = phase === 'assigning' || animating;
  $('btn-reroll').disabled = game.rerolls <= 0 || locked;
  $('btn-assign').disabled = locked;
  $('btn-reroll').classList.toggle('hidden', phase === 'assigning');
  $('btn-assign').classList.toggle('hidden', phase === 'assigning');

  // 족보 선택 UI
  renderCategorySelect();

  // 스코어보드
  renderScoreboard();
}

function toggleAnim(who) {
  if (who === 'player') {
    animPlayer = !animPlayer;
    localStorage.setItem('yacht-anim-player', animPlayer ? 'on' : 'off');
  } else {
    animAI = !animAI;
    localStorage.setItem('yacht-anim-ai', animAI ? 'on' : 'off');
  }
  updateAnimBtns();
}

function updateAnimBtns() {
  const p = $('btn-anim-player');
  const a = $('btn-anim-ai');
  p.textContent = `🎬나 ${animPlayer ? 'ON' : 'OFF'}`;
  a.textContent = `🤖AI ${animAI ? 'ON' : 'OFF'}`;
  p.classList.toggle('anim-off', !animPlayer);
  a.classList.toggle('anim-off', !animAI);
}

function renderDice(rollIndices) {
  const container = $('dice-container');
  container.innerHTML = '';
  const m = Game.MODE[game.mode];

  // 컵 (애니메이션 시에만)
  const showCup = animPlayer && rollIndices && rollIndices.size > 0;
  if (showCup) {
    const cup = document.createElement('div');
    cup.className = 'dice-cup tipping';
    cup.innerHTML = '<div class="cup-body"></div>';
    container.appendChild(cup);
  }

  game.dice.forEach((val, i) => {
    const die = document.createElement('div');
    const isRolled = rollIndices && rollIndices.has(i);
    die.className = 'die' + (selectedDice.has(i) ? ' selected' : '');
    if (showCup && isRolled) die.classList.add('tumble');
    die.style.animationDelay = isRolled ? `${0.15 + i * 0.08}s` : '0s';
    die.innerHTML = pipHTML(val);
    die.dataset.index = i;
    die.dataset.val = val;
    if (phase === 'rolling' && game.rerolls > 0 && !animating) {
      die.addEventListener('click', () => toggleDie(i));
    } else if (animating) {
      die.classList.add('locked');
    } else {
      die.classList.add('locked');
    }
    container.appendChild(die);
  });

  if (m.hasSpecial) {
    const isWild = game.specialDie === 0;
    const isRolled = rollIndices && rollIndices.has(4);
    const sp = document.createElement('div');
    sp.className = 'die' + (isWild ? ' wild-die' : ' special') + (selectedDice.has(4) ? ' selected' : '');
    if (showCup && isRolled) sp.classList.add('tumble');
    sp.style.animationDelay = isRolled ? `${0.15 + 4 * 0.08}s` : '0s';
    sp.innerHTML = specialPipHTML(game.specialDie);
    sp.dataset.index = 4;
    sp.dataset.val = game.specialDie;
    if (phase === 'rolling' && game.rerolls > 0 && !animating) {
      sp.addEventListener('click', () => toggleDie(4));
    } else {
      sp.classList.add('locked');
    }
    container.appendChild(sp);
  }
}

/** 주사위 값 빠르게 바꾸다 최종값으로 정착하는 애니메이션 */
function animateRoll(rolledIndices, callback) {
  if (!animPlayer || rolledIndices.size === 0) {
    callback();
    return;
  }

  animating = true;
  const m = Game.MODE[game.mode];
  const finalDice = [...game.dice];
  const finalSpecial = m.hasSpecial ? game.specialDie : null;
  const container = $('dice-container');
  const SPECIAL_VALS = [0, 2, 3, 4, 5, 6];

  let frame = 0;
  const totalFrames = 6;
  const interval = setInterval(() => {
    frame++;
    const normalDice = container.querySelectorAll('.die:not(.special):not(.wild-die)');
    normalDice.forEach((el, i) => {
      if (rolledIndices.has(i)) {
        el.innerHTML = frame < totalFrames
          ? pipHTML(Math.floor(Math.random() * 6) + 1)
          : pipHTML(finalDice[i]);
      }
    });

    if (m.hasSpecial && rolledIndices.has(4)) {
      const spEl = container.querySelector('.die.special, .die.wild-die');
      if (spEl) {
        if (frame < totalFrames) {
          const rv = SPECIAL_VALS[Math.floor(Math.random() * 6)];
          spEl.className = 'die special tumble';
          spEl.innerHTML = pipHTML(rv === 0 ? 1 : rv);
        } else {
          spEl.className = finalSpecial === 0 ? 'die wild-die' : 'die special';
          spEl.innerHTML = specialPipHTML(finalSpecial);
        }
      }
    }

    if (frame >= totalFrames) {
      clearInterval(interval);
      animating = false;
      callback();
    }
  }, 40);
}

function toggleDie(index) {
  if (selectedDice.has(index)) selectedDice.delete(index);
  else selectedDice.add(index);
  renderDice();
}

function dieSpan(val, cls) {
  return `<span class="ai-die${cls ? ' ' + cls : ''}">${pipHTML(val)}</span>`;
}

function spSpan(special) {
  if (special == null) return '';
  if (special === 0) return '<span class="ai-die ai-wild"><img src="./img/erpin.png" alt="W"></span>';
  return `<span class="ai-die ai-sp">${pipHTML(special)}</span>`;
}

function renderAILog() {
  const el = $('ai-log');
  if (!game.aiLog || !game.aiLog.length) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  const m = Game.MODE[game.mode];
  const catNames = m.scoring.CATEGORY_NAMES;
  const parts = [];

  for (const e of game.aiLog) {
    if (e.type === 'reroll') {
      const from = e.from.map(d => dieSpan(d, 'ai-dim')).join('');
      const sp = e.special != null ? spSpan(e.special) : '';
      const kept = e.kept.length ? e.kept.map(d => dieSpan(d, 'ai-kept')).join('') : '';
      const keptSp = e.keepSpecial ? sp : '';
      parts.push(`${from}${sp} 킵 ${kept}${keptSp || (kept ? '' : '없음')}`);
    } else {
      const d = e.dice.map(d => dieSpan(d, 'ai-kept')).join('');
      const sp = e.special != null ? spSpan(e.special) : '';
      if (!parts.length) parts.push(`${d}${sp}`);
      parts.push(`\u2192 <strong>${catNames[e.cat]}</strong> ${e.score}점`);
    }
  }
  el.innerHTML = '\uD83E\uDD16 ' + parts.join(' ');
}

function renderCategorySelect() {
  const container = $('category-select');
  container.innerHTML = '';

  if (phase !== 'assigning') {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  const m = Game.MODE[game.mode];
  const catNames = m.scoring.CATEGORY_NAMES;
  const available = Game.getAvailable(game);
  const { sorted } = Game.getDiceIdx(game);

  const tips = CAT_TIPS[game.mode] || CAT_TIPS.standard;
  for (const c of available) {
    const score = Game.getScore(game, c, sorted);
    const btn = document.createElement('button');
    btn.className = 'category-btn has-tooltip' + (score === 0 ? ' zero' : '');
    btn.innerHTML = `<span class="cat-name">${catNames[c]}</span><span class="cat-score">${score}</span><span class="tooltip">${tips[c]}</span>`;
    btn.addEventListener('click', () => doAssign(c));
    container.appendChild(btn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'category-btn cancel';
  cancelBtn.textContent = '\u21A9 돌아가기';
  cancelBtn.addEventListener('click', () => {
    phase = 'rolling';
    renderGame();
  });
  container.appendChild(cancelBtn);
}

function renderScoreboard() {
  const m = Game.MODE[game.mode];
  const catNames = m.scoring.CATEGORY_NAMES;
  const tips = CAT_TIPS[game.mode] || CAT_TIPS.standard;
  const tbody = $('scoreboard-body');
  tbody.innerHTML = '';

  for (let c = 0; c < m.upperCount; c++) {
    addScoreRow(tbody, catNames[c], game.pScores[c], game.aScores[c], false, tips[c]);
  }

  const pUS = game.pScores.slice(0, m.upperCount).reduce((a, s) => a + (s >= 0 ? s : 0), 0);
  const aUS = game.aScores.slice(0, m.upperCount).reduce((a, s) => a + (s >= 0 ? s : 0), 0);
  const pB = game.pUpper >= m.upperThreshold ? `+${m.upperBonus}` : `${pUS}/${m.upperThreshold}`;
  const aB = game.aUpper >= m.upperThreshold ? `+${m.upperBonus}` : `${aUS}/${m.upperThreshold}`;
  addScoreRow(tbody, '보너스', pB, aB, true);

  for (let c = m.upperCount; c < m.numCat; c++) {
    addScoreRow(tbody, catNames[c], game.pScores[c], game.aScores[c], false, tips[c]);
  }

  const { pT, aT } = Game.calcTotal(game);
  addScoreRow(tbody, '합계', pT, aT, true);
}

function addScoreRow(tbody, name, pVal, aVal, isSpecial = false, tip = null) {
  const tr = document.createElement('tr');
  if (isSpecial) tr.className = 'special-row';
  if (tip) tr.className = (tr.className ? tr.className + ' ' : '') + 'has-tooltip';
  const fmtP = typeof pVal === 'string' ? pVal : (pVal < 0 ? '-' : pVal);
  const fmtA = typeof aVal === 'string' ? aVal : (aVal < 0 ? '-' : aVal);
  const tipHtml = tip ? `<span class="tooltip">${tip}</span>` : '';
  tr.innerHTML = `<td>${name}${tipHtml}</td><td>${fmtP}</td><td>${fmtA}</td>`;
  tbody.appendChild(tr);
}

// ── 액션 ──

function doReroll() {
  if (selectedDice.size === 0) return;

  const m = Game.MODE[game.mode];

  // 전략 분석 기록
  if (m.hasSpecial) {
    const sortedNormal = game.dice.slice().sort((a, b) => a - b);
    const normalKept = [];
    for (let i = 0; i < 4; i++) {
      if (!selectedDice.has(i)) normalKept.push(game.dice[i]);
    }
    normalKept.sort((a, b) => a - b);
    const normalKeepMask = m.diceTk.keepToMask(sortedNormal, normalKept);
    const keepSpecial = !selectedDice.has(4);
    Game.recordDecision(game, { type: 'reroll', normalKeepMask, keepSpecial });

    for (let i = 0; i < 4; i++) {
      if (selectedDice.has(i)) game.dice[i] = Math.floor(Math.random() * 6) + 1;
    }
    if (selectedDice.has(4)) game.specialDie = Game.rollSpecial();
  } else {
    const keptValues = [];
    for (let i = 0; i < 5; i++) {
      if (!selectedDice.has(i)) keptValues.push(game.dice[i]);
    }
    keptValues.sort((a, b) => a - b);
    Game.recordDecision(game, { type: 'reroll', keptValues });

    for (const i of selectedDice) {
      game.dice[i] = Math.floor(Math.random() * 6) + 1;
    }
  }

  game.rerolls--;
  Game.logReroll(game, [...selectedDice]);
  const rolledSet = new Set(selectedDice);
  selectedDice.clear();
  renderGame(rolledSet);
  animateRoll(rolledSet, () => renderGame());
}

function showAssignUI() {
  phase = 'assigning';
  selectedDice.clear();
  renderGame();
}

function doAssign(cat) {
  Game.recordDecision(game, { type: 'assign', category: cat });
  const score = Game.assignPlayer(game, cat);
  Game.logAssign(game, cat, score);
  Game.playAI(game);
  Game.logAI(game);

  // AI 턴 애니메이션
  if (animAI && game.aiLog && game.aiLog.length > 0) {
    phase = 'ai-playing';
    animating = true;
    renderScoreboard(); // 플레이어 배정 즉시 반영
    animateAITurn(game.aiLog, () => {
      Game.nextRound(game);
      finishRound();
    });
  } else {
    Game.nextRound(game);
    finishRound();
  }
}

function finishRound() {
  animating = false;
  $('ai-turn').classList.add('hidden');
  if (Game.isGameOver(game)) {
    showGameOver();
  } else {
    phase = 'rolling';
    selectedDice.clear();
    const m = Game.MODE[game.mode];
    const allIndices = new Set(m.hasSpecial ? [0,1,2,3,4] : [0,1,2,3,4]);
    renderGame(allIndices);
    animateRoll(allIndices, () => renderGame());
  }
}

/**
 * AI 턴을 주사위 애니메이션으로 단계별 재생
 * 핵심: 주사위 DOM 요소를 한 번만 생성하고, 위치는 고정한 채 값만 업데이트
 */
function animateAITurn(aiLog, callback) {
  const m = Game.MODE[game.mode];
  const catNames = m.scoring.CATEGORY_NAMES;
  const numDice = m.hasSpecial ? 4 : 5;
  const aiTurn = $('ai-turn');
  aiTurn.classList.remove('hidden');
  aiTurn.innerHTML = '<div class="ai-turn-label">\uD83E\uDD16 AI 턴</div><div id="ai-dice-area" class="ai-dice-area"></div><div id="ai-step-text" class="ai-step-text"></div>';

  const diceArea = $('ai-dice-area');
  const stepText = $('ai-step-text');

  // 주사위 DOM 한 번만 생성 — 위치 고정
  const diceEls = [];
  for (let i = 0; i < numDice; i++) {
    const die = document.createElement('div');
    die.className = 'die ai-anim-die';
    diceArea.appendChild(die);
    diceEls.push(die);
  }
  let spEl = null;
  if (m.hasSpecial) {
    spEl = document.createElement('div');
    spEl.className = 'die ai-anim-die special';
    diceArea.appendChild(spEl);
  }

  function updateDieEl(el, val, isSpecial) {
    if (isSpecial && val === 0) {
      el.className = 'die ai-anim-die wild-die';
      el.innerHTML = wildHTML();
    } else if (isSpecial) {
      el.className = 'die ai-anim-die special';
      el.innerHTML = pipHTML(val);
    } else {
      el.innerHTML = pipHTML(val);
    }
  }

  // 현재 위치별 주사위 값 (정렬 안 된 상태로 유지)
  // 첫 from(정렬됨)으로 초기화, 이후 리롤 시 해당 위치만 교체
  const slots = new Array(numDice).fill(0);
  let specialVal = null;

  let stepIdx = 0;

  function setSlotValues(sortedDice, special) {
    for (let i = 0; i < numDice; i++) {
      slots[i] = sortedDice[i];
      updateDieEl(diceEls[i], sortedDice[i], false);
    }
    if (spEl && special != null) {
      specialVal = special;
      updateDieEl(spEl, special, true);
    }
  }

  function showStep() {
    if (stepIdx >= aiLog.length) {
      setTimeout(callback, 300);
      return;
    }

    const entry = aiLog[stepIdx];

    if (entry.type === 'reroll') {
      // 첫 단계면 초기값 세팅
      if (stepIdx === 0) setSlotValues(entry.from, entry.special);
      stepText.textContent = '';

      // 킵 여부를 위치(인덱스) 기준으로 계산
      const keptPositions = new Set();
      const usedKept = new Array(entry.kept.length).fill(false);
      for (let i = 0; i < numDice; i++) {
        for (let k = 0; k < entry.kept.length; k++) {
          if (!usedKept[k] && entry.kept[k] === slots[i]) {
            usedKept[k] = true;
            keptPositions.add(i);
            break;
          }
        }
      }

      // 에르핀 특수 주사위 킵 여부
      const rerollSpecial = spEl && entry.keepSpecial != null && !entry.keepSpecial;

      setTimeout(() => {
        // 킵/리롤 하이라이트 — 일반 주사위
        for (let i = 0; i < numDice; i++) {
          diceEls[i].classList.toggle('ai-kept-die', keptPositions.has(i));
          diceEls[i].classList.toggle('ai-reroll-die', !keptPositions.has(i));
        }
        // 에르핀 주사위 하이라이트
        if (spEl) {
          spEl.classList.toggle('ai-kept-die', !rerollSpecial);
          spEl.classList.toggle('ai-reroll-die', rerollSpecial);
        }

        const keptStr = entry.kept.length ? entry.kept.map(d => DICE_DOTS[d]).join('') : '없음';
        stepText.textContent = `킵 ${keptStr}${spEl && !rerollSpecial ? '+sp' : ''} → 리롤`;

        setTimeout(() => {
          // 리롤된 위치의 최종값 계산
          const nextSorted = entry.to.slice().sort((a, b) => a - b);
          const newValsForRerolled = [];
          const nextUsed = new Array(nextSorted.length).fill(false);
          for (const pos of keptPositions) {
            for (let j = 0; j < nextSorted.length; j++) {
              if (!nextUsed[j] && nextSorted[j] === slots[pos]) {
                nextUsed[j] = true;
                break;
              }
            }
          }
          for (let j = 0; j < nextSorted.length; j++) {
            if (!nextUsed[j]) newValsForRerolled.push(nextSorted[j]);
          }

          const rerollPositions = [];
          for (let i = 0; i < numDice; i++) {
            if (!keptPositions.has(i)) rerollPositions.push(i);
          }

          // 스크램블 시작 — 일반 주사위
          for (const pos of rerollPositions) {
            diceEls[pos].classList.remove('ai-reroll-die');
            diceEls[pos].classList.add('tumble');
          }
          // 에르핀 주사위 스크램블
          if (spEl && rerollSpecial) {
            spEl.classList.remove('ai-reroll-die');
            spEl.classList.add('tumble');
          }

          const SPECIAL_VALS = [0, 2, 3, 4, 5, 6];
          const finalSpecialVal = entry.special;
          let frame = 0;
          const totalFrames = 6;
          const interval = setInterval(() => {
            frame++;
            let ri = 0;
            for (const pos of rerollPositions) {
              if (frame < totalFrames) {
                diceEls[pos].innerHTML = pipHTML(Math.floor(Math.random() * 6) + 1);
              } else {
                const newVal = newValsForRerolled[ri];
                slots[pos] = newVal;
                updateDieEl(diceEls[pos], newVal, false);
                diceEls[pos].classList.remove('tumble', 'ai-kept-die');
              }
              ri++;
            }
            // 에르핀 주사위 스크램블
            if (spEl && rerollSpecial) {
              if (frame < totalFrames) {
                const rv = SPECIAL_VALS[Math.floor(Math.random() * 6)];
                spEl.className = 'die ai-anim-die special tumble';
                spEl.innerHTML = pipHTML(rv === 0 ? 1 : rv);
              } else {
                specialVal = finalSpecialVal;
                updateDieEl(spEl, finalSpecialVal, true);
                spEl.classList.remove('tumble');
              }
            }
            if (frame >= totalFrames) {
              for (const pos of keptPositions) {
                diceEls[pos].classList.remove('ai-kept-die');
              }
              if (spEl) spEl.classList.remove('ai-kept-die');
              clearInterval(interval);
              stepIdx++;
              setTimeout(showStep, 800);
            }
          }, 40);
        }, 700);
      }, 600);

    } else if (entry.type === 'assign') {
      // 배정: 첫 단계가 바로 assign이면 값 세팅
      if (stepIdx === 0) setSlotValues(entry.dice, entry.special);
      // 이미 slots에 현재 값이 있으므로 그대로 유지

      setTimeout(() => {
        stepText.innerHTML = `\u2192 <strong>${catNames[entry.cat]}</strong> ${entry.score}점`;
        stepIdx++;
        setTimeout(showStep, 1000);
      }, 400);
    }
  }

  showStep();
}

// ── 게임 종료 ──

function showGameOver() {
  const { pT, aT } = Game.calcTotal(game);
  const record = Game.recordResult(pT, aT);

  // 운 계산 (전략 엔진이 이미 로드되어 있음)
  // 임시 record 형태로 만들어서 computeGameLuck 호출
  const tempRecord = {
    mode: game.mode,
    moves: game.moves || [],
    playerScores: [...game.pScores],
    aiScores: [...game.aScores],
    playerUpper: game.pUpper,
    aiUpper: game.aUpper,
    playerTotal: pT,
    aiTotal: aT,
  };
  let luckData = null;
  try { luckData = Game.computeGameLuck(tempRecord); } catch(e) { console.warn('luck calc failed', e); }

  Game.saveGameHistory(game, luckData);

  showScreen('over');

  const result = pT > aT ? '승리' : pT < aT ? '패배' : '무승부';
  const resultCls = pT > aT ? 'win' : pT < aT ? 'lose' : 'draw';
  const resultEmoji = pT > aT ? '\uD83C\uDF89' : pT < aT ? '\uD83D\uDE22' : '\uD83E\uDD1D';

  $('result-title').textContent = `${resultEmoji} ${result}`;
  $('result-title').className = 'result-' + resultCls;
  $('result-score').textContent = `${pT} vs ${aT}`;
  $('result-record').textContent = `${record.wins}승 ${record.losses}패 ${record.draws}무 | 최고: ${record.highScore}`;

  // 최종 스코어보드
  renderFinalScoreboard();

  // 전략 분석
  renderAnalysis(luckData);
}

function renderFinalScoreboard() {
  const m = Game.MODE[game.mode];
  const catNames = m.scoring.CATEGORY_NAMES;
  const tbody = $('final-scoreboard-body');
  tbody.innerHTML = '';

  for (let c = 0; c < m.upperCount; c++) {
    addScoreRow(tbody, catNames[c], game.pScores[c], game.aScores[c]);
  }
  const pUS = game.pScores.slice(0, m.upperCount).reduce((a, s) => a + (s >= 0 ? s : 0), 0);
  const aUS = game.aScores.slice(0, m.upperCount).reduce((a, s) => a + (s >= 0 ? s : 0), 0);
  const pB = game.pUpper >= m.upperThreshold ? `+${m.upperBonus}` : `${pUS}/${m.upperThreshold}`;
  const aB = game.aUpper >= m.upperThreshold ? `+${m.upperBonus}` : `${aUS}/${m.upperThreshold}`;
  addScoreRow(tbody, '보너스', pB, aB, true);
  for (let c = m.upperCount; c < m.numCat; c++) {
    addScoreRow(tbody, catNames[c], game.pScores[c], game.aScores[c]);
  }
  const { pT, aT } = Game.calcTotal(game);
  addScoreRow(tbody, '합계', pT, aT, true);
}

const TIP_LUCK = '주사위 운은 각 굴림에서 실제 결과의 EV와 기대 EV의 차이를 합산한 것입니다. 양수면 평균보다 운이 좋았고, 음수면 나빴습니다. ±σ는 이 정도 편차가 일반적인 범위인지 가늠하는 기준입니다.';

function renderAnalysis(luckData) {
  const container = $('analysis');
  const { playScore, evLoss, mistakes } = Game.getAnalysis(game);
  const m = Game.MODE[game.mode];
  const catNames = m.scoring.CATEGORY_NAMES;

  let html = `<div class="play-score">플레이 점수: <strong>${playScore}/100</strong> (EV 손실: ${evLoss}) ${helpSpan(TIP_PLAY_SCORE)}</div>`;

  if (luckData) {
    const luckSign = luckData.totalLuck >= 0 ? '+' : '';
    const luckClass = luckData.totalLuck >= 0 ? 'luck-good' : 'luck-bad';
    html += `<div class="luck-score ${luckClass}">주사위 운: <strong>${luckSign}${luckData.totalLuck.toFixed(1)}</strong>점 (\u00B1${luckData.sigma.toFixed(1)}) ${helpSpan(TIP_LUCK)}</div>`;
  }

  if (mistakes.length === 0) {
    html += '<div class="perfect">완벽한 플레이!</div>';
  } else {
    html += `<div class="mistakes-header">주요 실수 ${helpSpan(TIP_MISTAKE)}</div>`;
    html += '<div class="mistakes">';
    const shown = mistakes.slice(0, 8);
    for (const h of shown) {
      const dice = h.dice.map(d => DICE_DOTS[d]).join('');
      const sp = h.special != null ? (h.special === 0 ? ' +W' : ' +' + DICE_DOTS[h.special]) : '';
      const playerStr = fmtAction(h.player, h.playerScore, catNames, h.dice, h.special, m);
      const optStr = fmtAction(h.optimal, h.optimalScore, catNames, h.dice, h.special, m);
      html += `<div class="mistake">`;
      html += `<div class="mistake-header">R${h.round} ${dice}${sp} 리롤${h.rerolls} \u2014 <strong>#${h.rank}/${h.totalActions}</strong> (EV <strong>-${h.evDiff.toFixed(1)}</strong>)</div>`;
      html += `<div class="mistake-detail">${playerStr} \u2192 최적: ${optStr}</div>`;
      html += `</div>`;
    }
    if (mistakes.length > 8) html += `<div class="more">...외 ${mistakes.length - 8}개</div>`;
    html += '</div>';
  }

  container.innerHTML = html;
}

function fmtAction(action, score, catNames, dice, special, m) {
  if (action.type === 'assign') {
    return `${catNames[action.category]} ${score != null ? score + '점' : ''}`;
  }
  if (m.hasSpecial) {
    const nk = [];
    for (let i = 0; i < 4; i++) if (action.normalKeepMask & (1 << i)) nk.push(dice[i]);
    const kept = nk.map(d => DICE_DOTS[d]).join('') || '';
    const sp = action.keepSpecial ? (special === 0 ? 'W' : DICE_DOTS[special]) : '';
    return `킵 ${kept}${sp || (kept ? '' : '없음')} 리롤`;
  }
  const kept = action.keptValues.length ? action.keptValues.map(d => DICE_DOTS[d]).join('') : '없음';
  return `킵 ${kept} 리롤`;
}

function backToMenu() {
  game = null;
  phase = 'menu';
  showScreen('menu');
  updateRecords();
}

function updateRecords() {
  const r = Game.getRecords();
  const sub = $('menu-records-sub');
  if (r.gamesPlayed > 0) {
    sub.textContent = `${r.wins}승 ${r.losses}패 ${r.draws}무 | 최고: ${r.highScore}`;
  } else {
    sub.textContent = '';
  }
}

// ── 규칙 ──

function showRules() {
  showScreen('rules');
  const tabs = document.querySelectorAll('.rules-tab');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $('rules-std').classList.toggle('hidden', tab.dataset.tab !== 'std');
      $('rules-tk').classList.toggle('hidden', tab.dataset.tab !== 'tk');
    };
  });
}

// ── 히스토리 ──

function showHistory() {
  showScreen('history');
  const list = Game.getGameHistoryList();
  const container = $('history-list');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<div class="history-empty">플레이 기록이 없습니다.</div>';
    return;
  }

  for (const g of list) {
    const item = document.createElement('div');
    item.className = 'history-item';
    const result = g.playerTotal > g.aiTotal ? '승' : g.playerTotal < g.aiTotal ? '패' : '무';
    const resultClass = result === '승' ? 'win' : result === '패' ? 'lose' : 'draw';
    const mode = g.mode === 'trickal' ? 'TK' : 'STD';
    const date = new Date(g.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const ps = g.playScore != null ? `${g.playScore}/100` : '-';

    item.innerHTML = `
      <div class="history-main">
        <span class="history-result result-${resultClass}">${result}</span>
        <span class="history-mode">${mode}</span>
        <span class="history-scores">${g.playerTotal} vs ${g.aiTotal}</span>
        <span class="history-play-score">PS ${ps}</span>
      </div>
      <div class="history-sub">
        <span class="history-date">${date}</span>
        <span class="history-id">${g.id}</span>
      </div>`;
    item.addEventListener('click', () => showDetail(g.id));
    container.appendChild(item);
  }
}

// ── 상세 보기 (요약) ──

let currentRecord = null;
let currentRoundNum = 1;

function showDetail(gameId) {
  const record = Game.getGameRecord(gameId);
  if (!record) return;
  currentRecord = record;

  showScreen('detail');
  const m = Game.MODE[record.mode];
  const catNames = m.scoring.CATEGORY_NAMES;

  // 헤더
  const result = record.playerTotal > record.aiTotal ? '승리' : record.playerTotal < record.aiTotal ? '패배' : '무승부';
  const detailCls = record.playerTotal > record.aiTotal ? 'win' : record.playerTotal < record.aiTotal ? 'lose' : 'draw';
  $('detail-title').textContent = `${record.mode === 'trickal' ? 'Trickal' : 'Standard'} - ${result}`;
  $('detail-title').className = 'result-' + detailCls;
  $('detail-scores').textContent = `${record.playerTotal} vs ${record.aiTotal}`;
  $('detail-date').textContent = new Date(record.date).toLocaleString('ko-KR');

  // 스코어보드
  const tbody = $('detail-scoreboard-body');
  tbody.innerHTML = '';
  for (let c = 0; c < m.upperCount; c++) {
    addScoreRow(tbody, catNames[c], record.playerScores[c], record.aiScores[c]);
  }
  const pUS = record.playerScores.slice(0, m.upperCount).reduce((a, s) => a + (s >= 0 ? s : 0), 0);
  const aUS = record.aiScores.slice(0, m.upperCount).reduce((a, s) => a + (s >= 0 ? s : 0), 0);
  const pB = record.playerUpper >= m.upperThreshold ? `+${m.upperBonus}` : `${pUS}/${m.upperThreshold}`;
  const aB = record.aiUpper >= m.upperThreshold ? `+${m.upperBonus}` : `${aUS}/${m.upperThreshold}`;
  addScoreRow(tbody, '보너스', pB, aB, true);
  for (let c = m.upperCount; c < m.numCat; c++) {
    addScoreRow(tbody, catNames[c], record.playerScores[c], record.aiScores[c]);
  }
  addScoreRow(tbody, '합계', record.playerTotal, record.aiTotal, true);

  // 분석 요약
  const analysisEl = $('detail-analysis');
  if (record.playScore != null) {
    let html = `<div class="play-score">플레이 점수: <strong>${record.playScore}/100</strong> (EV 손실: ${record.evLoss.toFixed(1)}) ${helpSpan(TIP_PLAY_SCORE)}</div>`;
    if (record.luck) {
      const luckSign = record.luck.total >= 0 ? '+' : '';
      const luckClass = record.luck.total >= 0 ? 'luck-good' : 'luck-bad';
      html += `<div class="luck-score ${luckClass}">주사위 운: <strong>${luckSign}${record.luck.total.toFixed(1)}</strong>점 (\u00B1${record.luck.sigma.toFixed(1)}) ${helpSpan(TIP_LUCK)}</div>`;
    } else if (record.moves && record.moves.length > 0) {
      html += `<div class="luck-score"><button id="btn-calc-luck" class="calc-luck-btn">주사위 운 계산</button></div>`;
    }
    if (record.mistakes && record.mistakes.length > 0) {
      html += `<div class="mistakes-header">주요 실수 ${helpSpan(TIP_MISTAKE)}</div>`;
      html += '<div class="mistakes">';
      for (const h of record.mistakes.slice(0, 5)) {
        const dice = h.dice.map(d => DICE_DOTS[d]).join('');
        const sp = h.special != null ? (h.special === 0 ? ' +W' : ' +' + DICE_DOTS[h.special]) : '';
        const playerStr = fmtAction(h.player, h.playerScore, catNames, h.dice, h.special, m);
        const optStr = fmtAction(h.optimal, h.optimalScore, catNames, h.dice, h.special, m);
        html += `<div class="mistake"><div class="mistake-header">R${h.round} ${dice}${sp} 리롤${h.rerolls} \u2014 <strong>#${h.rank}/${h.totalActions}</strong> (EV <strong>-${h.evDiff.toFixed(1)}</strong>)</div><div class="mistake-detail">${playerStr} \u2192 최적: ${optStr}</div></div>`;
      }
      if (record.mistakes.length > 5) html += `<div class="more">...외 ${record.mistakes.length - 5}개</div>`;
      html += '</div>';
    } else {
      html += '<div class="perfect">완벽한 플레이!</div>';
    }
    analysisEl.innerHTML = html;
    // 운 계산 버튼 바인딩
    const calcBtn = $('btn-calc-luck');
    if (calcBtn) {
      calcBtn.addEventListener('click', async () => {
        calcBtn.textContent = '계산 중...';
        calcBtn.disabled = true;
        await Game.MODE[record.mode].strategy.load();
        const luckData = Game.computeGameLuck(record);
        // localStorage에 저장
        Game.updateGameLuck(record.id, luckData);
        record.luck = { total: luckData.totalLuck, sigma: luckData.sigma };
        // 다시 렌더링
        showDetail(record.id);
      });
    }
  } else {
    analysisEl.innerHTML = '';
  }

  // 라운드 분석 버튼
  const roundsEl = $('detail-rounds');
  if (record.moves && record.moves.length > 0) {
    roundsEl.innerHTML = `<button id="btn-round-analysis" class="menu-btn standard" style="margin-top:12px;width:100%">라운드 분석</button>`;
    $('btn-round-analysis').addEventListener('click', () => openRoundAnalysis(record));
  } else {
    roundsEl.innerHTML = '<div class="play-score">라운드 데이터가 없습니다.</div>';
  }
}

// ── 라운드별 상세 분석 ──

async function openRoundAnalysis(record) {
  showScreen('loading');
  $('loading-text').textContent = '전략 엔진 로딩 중...';
  await Game.MODE[record.mode].strategy.load();
  currentRoundNum = 1;
  showScreen('round-analysis');
  renderRoundAnalysis(record, 1);
}

function renderRoundAnalysis(record, roundNum) {
  const m = Game.MODE[record.mode];
  const strat = m.strategy;
  const catNames = m.scoring.CATEGORY_NAMES;
  const rounds = Game.extractRounds(record);
  const rd = rounds[roundNum - 1];
  const maxRound = m.rounds;

  // 헤더
  $('ra-title').textContent = `라운드 ${roundNum} / ${maxRound}`;
  $('ra-score-summary').textContent = `${record.playerTotal} vs ${record.aiTotal}`;

  // 네비게이션
  $('ra-prev').disabled = roundNum <= 1;
  $('ra-next').disabled = roundNum >= maxRound;
  $('ra-prev').onclick = () => { currentRoundNum--; renderRoundAnalysis(record, currentRoundNum); };
  $('ra-next').onclick = () => { currentRoundNum++; renderRoundAnalysis(record, currentRoundNum); };

  const container = $('ra-panels');
  container.innerHTML = '';

  if (!rd) {
    container.innerHTML = '<div class="ra-empty">이 라운드의 데이터가 없습니다.</div>';
    return;
  }

  const { pMask, pUpper } = Game.replayState(record, roundNum);

  // 각 결정 포인트를 구성
  const decisionPoints = [];
  let dice = rd.roll.dice;
  let specialDie = rd.roll.specialDie;
  decisionPoints.push({ dice: [...dice], specialDie, rerolls: 2 });
  for (const rr of rd.rerolls) {
    dice = rr.dice;
    specialDie = rr.specialDie;
    decisionPoints.push({ dice: [...dice], specialDie, rerolls: rr.rerolls });
  }

  // 이전 상태 추적 (리롤 운 계산용)
  let prevDice = null, prevSpecial = null;

  for (let dpIdx = 0; dpIdx < decisionPoints.length; dpIdx++) {
    const pt = decisionPoints[dpIdx];
    const diceIdx = Game.computeDiceIdx(pt.dice, pt.specialDie, record.mode);
    const r = pt.rerolls;

    // 이 주사위 결과의 운 계산
    let rollLuck = null;
    if (dpIdx === 0) {
      // 첫 굴림
      rollLuck = strat.computeInitialRollLuck(pMask, pUpper, diceIdx);
    } else {
      // 리롤 결과 — 이전 상태에서 플레이어의 킵 선택 기반
      const rr = rd.rerolls[dpIdx - 1];
      const rerolled = new Set(rr.selected);
      const prevIdx = Game.computeDiceIdx(prevDice, prevSpecial, record.mode);
      if (m.hasSpecial) {
        const tk = m.diceTk;
        const sorted = prevDice.slice().sort((a, b) => a - b);
        const normalKept = [];
        for (let i = 0; i < prevDice.length; i++) {
          if (!rerolled.has(i)) normalKept.push(prevDice[i]);
        }
        normalKept.sort((a, b) => a - b);
        const nkm = tk.keepToMask(sorted, normalKept);
        const ks = !rerolled.has(prevDice.length);
        rollLuck = strat.computeRerollLuck(pMask, pUpper, r + 1, prevIdx, nkm, ks, diceIdx);
      } else {
        const sorted = prevDice.slice().sort((a, b) => a - b);
        const keptValues = [];
        for (let i = 0; i < 5; i++) {
          if (!rerolled.has(i)) keptValues.push(prevDice[i]);
        }
        keptValues.sort((a, b) => a - b);
        const km = m.dice.keepToMask(sorted, keptValues);
        rollLuck = strat.computeRerollLuck(pMask, pUpper, r + 1, prevIdx, km, diceIdx);
      }
    }
    prevDice = pt.dice;
    prevSpecial = pt.specialDie;

    // 전체 행동 목록
    const allActions = strat.enumerateActions(pMask, pUpper, r, diceIdx);
    const top5 = allActions.slice(0, 5);
    const topEV = top5[0]?.ev || 0;

    // 플레이어 실제 행동 파악
    let playerAction = null;
    if (dpIdx < rd.rerolls.length) {
      // 플레이어가 리롤함
      const rr = rd.rerolls[dpIdx];
      const rerolled = new Set(rr.selected);
      playerAction = { type: 'reroll', rerolled };
    } else if (dpIdx === rd.rerolls.length && rd.assign) {
      // 이 시점에서 배정
      playerAction = { type: 'assign', category: rd.assign.category, score: rd.assign.score };
    }

    // 패널 렌더링
    const panel = document.createElement('div');
    panel.className = 'ra-panel';

    // 주사위 표시
    const diceHtml = pt.dice.map(d => `<span class="ra-die">${pipHTML(d)}</span>`).join('');
    const spHtml = m.hasSpecial && pt.specialDie != null
      ? (pt.specialDie === 0
        ? `<span class="ra-die ra-wild">${wildHTML()}</span>`
        : `<span class="ra-die ra-sp">${pipHTML(pt.specialDie)}</span>`) : '';

    let html = `<div class="ra-panel-header">리롤 ${r}</div>`;
    html += `<div class="ra-dice">${diceHtml}${spHtml}</div>`;

    // 이 굴림의 운
    if (rollLuck) {
      const luckSign = rollLuck.luck >= 0 ? '+' : '';
      const luckCls = rollLuck.luck >= 0 ? 'luck-good' : 'luck-bad';
      const pctStr = `상위 ${((1 - rollLuck.percentile) * 100).toFixed(0)}%`;
      const sigmaStr = `${rollLuck.zSigma >= 0 ? '+' : ''}${rollLuck.zSigma.toFixed(1)}\u03C3`;
      html += `<div class="ra-roll-luck ${luckCls}">${dpIdx === 0 ? '첫 굴림' : '리롤 결과'}: ${luckSign}${rollLuck.luck.toFixed(1)}점 (${pctStr}, ${sigmaStr})</div>`;
    }

    // 전체 행동 리스트
    html += `<div class="ra-top-header">전체 선택지 (${allActions.length}) ${helpSpan(TIP_ALL_ACTIONS)}</div>`;
    html += `<div class="ra-actions">`;

    for (let i = 0; i < allActions.length; i++) {
      const act = allActions[i];
      const evDiff = topEV - act.ev;
      const isPlayerChoice = isActionMatch(act, playerAction, pt, m);
      const cls = i === 0 ? 'ra-action ra-optimal' : (isPlayerChoice ? 'ra-action ra-player' : 'ra-action');
      const desc = formatActionDesc(act, catNames, pt, m);
      const evStr = act.ev.toFixed(1);
      const diffStr = i === 0 ? '' : `<span class="ra-ev-diff">-${evDiff.toFixed(1)}</span>`;
      const playerMark = isPlayerChoice ? '<span class="ra-you">나</span>' : '';

      html += `<div class="${cls}">`;
      html += `<span class="ra-rank">#${i + 1}</span>`;
      html += `<span class="ra-desc">${desc}</span>`;
      html += `<span class="ra-ev">${evStr}${diffStr}</span>`;
      html += playerMark;
      html += `</div>`;
    }

    html += `</div>`; // ra-actions

    // 목표 분포 (최적 행동이 리롤일 때)
    const optAction = strat.getAction(pMask, pUpper, r, diceIdx);
    if (r > 0 && optAction >= m.numCat) {
      const { dist, scoreAccum } = strat.traceTargetDist(pMask, pUpper, r, diceIdx);
      html += renderTargetDist(dist, scoreAccum, catNames);
    }

    // 이 시점에서 배정 안 했으면 (아직 도달 안 함) 표시
    if (!playerAction) {
      html += `<div class="ra-no-action">미도달</div>`;
    }

    panel.innerHTML = html;
    container.appendChild(panel);
  }

  // 최종 배정 + AI 요약
  let footerHtml = '';
  if (rd.assign) {
    footerHtml += `<div class="ra-assign-result">배정: <strong>${catNames[rd.assign.category]}</strong> ${rd.assign.score}점</div>`;
  }
  if (rd.ai && rd.ai.log.length) {
    const aiAssign = rd.ai.log.find(e => e.type === 'assign');
    if (aiAssign) {
      footerHtml += `<div class="ra-ai-result">AI: <strong>${catNames[aiAssign.cat]}</strong> ${aiAssign.score}점</div>`;
    }
  }
  if (footerHtml) {
    const footer = document.createElement('div');
    footer.className = 'ra-footer';
    footer.innerHTML = footerHtml;
    container.appendChild(footer);
  }
}

// ── 목표 분포 ──

function renderTargetDist(dist, scoreAccum, catNames) {
  // 확률 top 5
  const probEntries = [];
  const scoreEntries = [];
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] > 0.005) {
      probEntries.push({ name: catNames[i], val: dist[i] });
      scoreEntries.push({ name: catNames[i], val: scoreAccum[i] / dist[i] });
    }
  }
  probEntries.sort((a, b) => b.val - a.val);
  scoreEntries.sort((a, b) => b.val - a.val);

  let html = '<div class="ra-target">';
  html += '<div class="ra-target-header">목표 분포 (최적 플레이)</div>';

  // 확률 top5
  html += `<div class="ra-target-row"><span class="ra-target-label">확률순 ${helpSpan(TIP_TARGET_PROB)}</span><span class="ra-target-items">`;
  for (const e of probEntries.slice(0, 5)) {
    html += `<span class="ra-target-item">${e.name} <strong>${(e.val * 100).toFixed(0)}%</strong></span>`;
  }
  html += '</span></div>';

  // 점수 top5
  html += `<div class="ra-target-row"><span class="ra-target-label">점수순 ${helpSpan(TIP_TARGET_SCORE)}</span><span class="ra-target-items">`;
  for (const e of scoreEntries.slice(0, 5)) {
    html += `<span class="ra-target-item">${e.name} <strong>${e.val.toFixed(1)}</strong></span>`;
  }
  html += '</span></div>';

  html += '</div>';
  return html;
}

// ── 행동 포맷 헬퍼 ──

function formatActionDesc(act, catNames, pt, m) {
  if (act.type === 'assign') {
    return `<span class="ra-cat">${catNames[act.category]}</span> <span class="ra-pts">${act.score}점</span>`;
  }
  // 리롤: 킵한 주사위 표시
  const sorted = pt.dice.slice().sort((a, b) => a - b);
  if (m.hasSpecial) {
    const kept = act.keptNormal.map(i => `<span class="ra-die-sm">${pipHTML(sorted[i])}</span>`).join('');
    const sp = act.keepSpecial
      ? (pt.specialDie === 0
        ? `<span class="ra-die-sm ra-wild">${wildHTML()}</span>`
        : `<span class="ra-die-sm ra-sp">${pipHTML(pt.specialDie)}</span>`)
      : '';
    const keptStr = kept || sp ? `${kept}${sp}` : '없음';
    return `킵 ${keptStr}`;
  }
  const kept = act.keptIndices.map(i => `<span class="ra-die-sm">${pipHTML(sorted[i])}</span>`).join('');
  return `킵 ${kept || '없음'}`;
}

function isActionMatch(act, playerAction, pt, m) {
  if (!playerAction) return false;
  if (act.type !== playerAction.type) return false;

  if (act.type === 'assign') {
    return act.category === playerAction.category;
  }

  // 리롤: 킵한 인덱스 비교
  const rerolled = playerAction.rerolled;
  const sorted = pt.dice.slice().sort((a, b) => a - b);

  if (m.hasSpecial) {
    const normalKept = [];
    for (let i = 0; i < pt.dice.length; i++) {
      if (!rerolled.has(i)) normalKept.push(pt.dice[i]);
    }
    normalKept.sort((a, b) => a - b);
    const playerNKM = m.diceTk.keepToMask(sorted, normalKept);
    const playerKS = !rerolled.has(pt.dice.length);
    return act.normalKeepMask === playerNKM && act.keepSpecial === playerKS;
  }

  const playerKept = [];
  for (let i = 0; i < 5; i++) {
    if (!rerolled.has(i)) playerKept.push(pt.dice[i]);
  }
  playerKept.sort((a, b) => a - b);
  const playerKM = m.dice.keepToMask(sorted, playerKept);
  return act.keepMask === playerKM;
}

// 시작
init();
