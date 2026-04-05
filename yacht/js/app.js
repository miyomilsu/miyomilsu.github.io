/**
 * 요트 다이스 웹 UI
 */

import * as Game from './game.js';

const DICE_DOTS = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'];
const DICE_EMOJI = ['', '1', '2', '3', '4', '5', '6'];

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

// ── 초기화 ──

export async function init() {
  $('btn-standard').addEventListener('click', () => startGame('standard'));
  $('btn-trickal').addEventListener('click', () => startGame('trickal'));
  $('btn-history').addEventListener('click', showHistory);
  $('btn-reroll').addEventListener('click', doReroll);
  $('btn-assign').addEventListener('click', showAssignUI);
  $('btn-new-game').addEventListener('click', backToMenu);
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
    die.textContent = DICE_DOTS[val];
    die.dataset.index = i;
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
    const sp = document.createElement('div');
    const isWild = game.specialDie === 0;
    const isRolled = rollIndices && rollIndices.has(4);
    sp.className = 'die special' + (selectedDice.has(4) ? ' selected' : '');
    if (showCup && isRolled) sp.classList.add('tumble');
    sp.style.animationDelay = isRolled ? `${0.15 + 4 * 0.08}s` : '0s';
    sp.textContent = isWild ? 'W' : DICE_DOTS[game.specialDie];
    sp.dataset.index = 4;
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
    const dice = container.querySelectorAll('.die:not(.special)');
    dice.forEach((el, i) => {
      if (rolledIndices.has(i)) {
        if (frame < totalFrames) {
          el.textContent = DICE_DOTS[Math.floor(Math.random() * 6) + 1];
        } else {
          el.textContent = DICE_DOTS[finalDice[i]];
        }
      }
    });

    if (m.hasSpecial && rolledIndices.has(4)) {
      const spEl = container.querySelector('.die.special');
      if (spEl) {
        if (frame < totalFrames) {
          const rv = SPECIAL_VALS[Math.floor(Math.random() * 6)];
          spEl.textContent = rv === 0 ? 'W' : DICE_DOTS[rv];
        } else {
          spEl.textContent = finalSpecial === 0 ? 'W' : DICE_DOTS[finalSpecial];
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
  return `<span class="ai-die${cls ? ' ' + cls : ''}">${DICE_DOTS[val]}</span>`;
}

function spSpan(special) {
  if (special == null) return '';
  return special === 0
    ? '<span class="ai-die ai-sp">W</span>'
    : `<span class="ai-die ai-sp">${DICE_DOTS[special]}</span>`;
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

  for (const c of available) {
    const score = Game.getScore(game, c, sorted);
    const btn = document.createElement('button');
    btn.className = 'category-btn' + (score === 0 ? ' zero' : '');
    btn.innerHTML = `<span class="cat-name">${catNames[c]}</span><span class="cat-score">${score}</span>`;
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
  const tbody = $('scoreboard-body');
  tbody.innerHTML = '';

  // 상체
  for (let c = 0; c < m.upperCount; c++) {
    addScoreRow(tbody, catNames[c], game.pScores[c], game.aScores[c]);
  }

  // 상체 소계 + 보너스
  const pUS = game.pScores.slice(0, m.upperCount).reduce((a, s) => a + (s >= 0 ? s : 0), 0);
  const aUS = game.aScores.slice(0, m.upperCount).reduce((a, s) => a + (s >= 0 ? s : 0), 0);
  const pB = game.pUpper >= m.upperThreshold ? `+${m.upperBonus}` : `${pUS}/${m.upperThreshold}`;
  const aB = game.aUpper >= m.upperThreshold ? `+${m.upperBonus}` : `${aUS}/${m.upperThreshold}`;
  addScoreRow(tbody, '보너스', pB, aB, true);

  // 하체
  for (let c = m.upperCount; c < m.numCat; c++) {
    addScoreRow(tbody, catNames[c], game.pScores[c], game.aScores[c]);
  }

  // 총점
  const { pT, aT } = Game.calcTotal(game);
  addScoreRow(tbody, '합계', pT, aT, true);
}

function addScoreRow(tbody, name, pVal, aVal, isSpecial = false) {
  const tr = document.createElement('tr');
  if (isSpecial) tr.className = 'special-row';
  const fmtP = typeof pVal === 'string' ? pVal : (pVal < 0 ? '-' : pVal);
  const fmtA = typeof aVal === 'string' ? aVal : (aVal < 0 ? '-' : aVal);
  tr.innerHTML = `<td>${name}</td><td>${fmtP}</td><td>${fmtA}</td>`;
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

/** AI 턴을 주사위 애니메이션으로 단계별 재생 */
function animateAITurn(aiLog, callback) {
  const m = Game.MODE[game.mode];
  const catNames = m.scoring.CATEGORY_NAMES;
  const aiTurn = $('ai-turn');
  aiTurn.classList.remove('hidden');
  aiTurn.innerHTML = '<div class="ai-turn-label">\uD83E\uDD16 AI 턴</div><div id="ai-dice-area" class="ai-dice-area"></div><div id="ai-step-text" class="ai-step-text"></div>';

  const diceArea = $('ai-dice-area');
  const stepText = $('ai-step-text');
  let stepIdx = 0;

  function showStep() {
    if (stepIdx >= aiLog.length) {
      setTimeout(callback, 300);
      return;
    }

    const entry = aiLog[stepIdx];

    if (entry.type === 'reroll') {
      // 초기 주사위 보여주기
      renderAIDice(diceArea, entry.from, entry.special, m);
      stepText.textContent = '';

      setTimeout(() => {
        // 킵 표시 — 충분히 오래 보여줌
        highlightKept(diceArea, entry.from, entry.kept, m);
        const keptStr = entry.kept.length ? entry.kept.map(d => DICE_DOTS[d]).join('') : '없음';
        stepText.textContent = `킵 ${keptStr} → 리롤`;

        setTimeout(() => {
          // 스크램블은 짧게, 결과 보여주는 시간 길게
          const resultDice = entry.to;
          scrambleAIDice(diceArea, entry.kept, resultDice, entry.special, m, () => {
            stepIdx++;
            setTimeout(showStep, 800);
          });
        }, 700);
      }, 600);

    } else if (entry.type === 'assign') {
      // 최종 주사위 + 배정 — 결과를 충분히 보여줌
      renderAIDice(diceArea, entry.dice, entry.special, m);

      setTimeout(() => {
        stepText.innerHTML = `\u2192 <strong>${catNames[entry.cat]}</strong> ${entry.score}점`;
        stepIdx++;
        setTimeout(showStep, 1000);
      }, 400);
    }
  }

  showStep();
}

function renderAIDice(container, dice, special, m) {
  container.innerHTML = '';
  dice.forEach(val => {
    const die = document.createElement('div');
    die.className = 'die ai-anim-die';
    die.textContent = DICE_DOTS[val];
    container.appendChild(die);
  });
  if (m.hasSpecial && special != null) {
    const sp = document.createElement('div');
    sp.className = 'die ai-anim-die special';
    sp.textContent = special === 0 ? 'W' : DICE_DOTS[special];
    container.appendChild(sp);
  }
}

function highlightKept(container, from, kept, m) {
  const dice = container.querySelectorAll('.ai-anim-die:not(.special)');
  const usedKept = new Array(kept.length).fill(false);
  dice.forEach((el, i) => {
    let isKept = false;
    for (let k = 0; k < kept.length; k++) {
      if (!usedKept[k] && kept[k] === from[i]) {
        usedKept[k] = true;
        isKept = true;
        break;
      }
    }
    el.classList.toggle('ai-kept-die', isKept);
    el.classList.toggle('ai-reroll-die', !isKept);
  });
}

function scrambleAIDice(container, kept, resultDice, special, m, callback) {
  const dice = container.querySelectorAll('.ai-anim-die:not(.special)');

  // ai-reroll-die는 highlightKept에서 이미 설정됨
  dice.forEach(el => {
    if (el.classList.contains('ai-reroll-die')) {
      el.classList.remove('ai-reroll-die');
      el.classList.add('tumble');
      el.style.opacity = '1';
    }
  });

  let frame = 0;
  const totalFrames = 6;
  const interval = setInterval(() => {
    frame++;
    dice.forEach((el, i) => {
      if (el.classList.contains('tumble')) {
        if (frame < totalFrames) {
          el.textContent = DICE_DOTS[Math.floor(Math.random() * 6) + 1];
        } else {
          el.textContent = DICE_DOTS[resultDice[i]];
          el.classList.remove('tumble', 'ai-kept-die');
        }
      }
    });
    if (frame >= totalFrames) {
      clearInterval(interval);
      callback();
    }
  }, 40);
}

// ── 게임 종료 ──

function showGameOver() {
  const { pT, aT } = Game.calcTotal(game);
  const record = Game.recordResult(pT, aT);
  Game.saveGameHistory(game);

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
  renderAnalysis();
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

function renderAnalysis() {
  const container = $('analysis');
  const { playScore, evLoss, mistakes } = Game.getAnalysis(game);
  const m = Game.MODE[game.mode];
  const catNames = m.scoring.CATEGORY_NAMES;

  let html = `<div class="play-score">플레이 점수: <strong>${playScore}/100</strong> (EV 손실: ${evLoss})</div>`;

  if (mistakes.length === 0) {
    html += '<div class="perfect">완벽한 플레이!</div>';
  } else {
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
  const el = $('menu-records');
  if (r.gamesPlayed > 0) {
    el.textContent = `${r.wins}승 ${r.losses}패 ${r.draws}무 | 최고: ${r.highScore}`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
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
    let html = `<div class="play-score">플레이 점수: <strong>${record.playScore}/100</strong> (EV 손실: ${record.evLoss.toFixed(1)})</div>`;
    if (record.mistakes && record.mistakes.length > 0) {
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

  for (let dpIdx = 0; dpIdx < decisionPoints.length; dpIdx++) {
    const pt = decisionPoints[dpIdx];
    const diceIdx = Game.computeDiceIdx(pt.dice, pt.specialDie, record.mode);
    const r = pt.rerolls;

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
    const diceHtml = pt.dice.map(d => `<span class="ra-die">${DICE_DOTS[d]}</span>`).join('');
    const spHtml = m.hasSpecial && pt.specialDie != null
      ? `<span class="ra-die ra-sp">${pt.specialDie === 0 ? 'W' : DICE_DOTS[pt.specialDie]}</span>` : '';

    let html = `<div class="ra-panel-header">리롤 ${r}</div>`;
    html += `<div class="ra-dice">${diceHtml}${spHtml}</div>`;

    // 전체 행동 리스트
    html += `<div class="ra-top-header">전체 선택지 (${allActions.length}) <span class="ra-help" title="Placeholder">?</span></div>`;
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
  html += '<div class="ra-target-row"><span class="ra-target-label">확률순</span><span class="ra-target-items">';
  for (const e of probEntries.slice(0, 5)) {
    html += `<span class="ra-target-item">${e.name} <strong>${(e.val * 100).toFixed(0)}%</strong></span>`;
  }
  html += '</span></div>';

  // 점수 top5
  html += '<div class="ra-target-row"><span class="ra-target-label">점수순</span><span class="ra-target-items">';
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
    const kept = act.keptNormal.map(i => `<span class="ra-die-sm">${DICE_DOTS[sorted[i]]}</span>`).join('');
    const sp = act.keepSpecial ? `<span class="ra-die-sm ra-sp">${pt.specialDie === 0 ? 'W' : DICE_DOTS[pt.specialDie]}</span>` : '';
    const keptStr = kept || sp ? `${kept}${sp}` : '없음';
    return `킵 ${keptStr}`;
  }
  const kept = act.keptIndices.map(i => `<span class="ra-die-sm">${DICE_DOTS[sorted[i]]}</span>`).join('');
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
