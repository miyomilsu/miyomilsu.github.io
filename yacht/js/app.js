/**
 * 요트 다이스 웹 UI
 */

import * as Game from './game.js';

const DICE_DOTS = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'];
const DICE_EMOJI = ['', '1', '2', '3', '4', '5', '6'];

let game = null;
let phase = 'menu';
let selectedDice = new Set();

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
  renderGame();
}

// ── 렌더링 ──

function renderGame() {
  const m = Game.MODE[game.mode];
  const catNames = m.scoring.CATEGORY_NAMES;

  // 헤더
  $('game-mode').textContent = game.mode === 'trickal' ? 'Trickal' : 'Yacht Dice';
  $('round-info').textContent = `라운드 ${game.round}/${m.rounds}`;
  $('reroll-info').textContent = `리롤 ${game.rerolls}회 남음`;

  // AI 로그
  renderAILog();

  // 주사위
  renderDice();

  // 버튼 상태
  $('btn-reroll').disabled = game.rerolls <= 0 || phase === 'assigning';
  $('btn-assign').disabled = phase === 'assigning';
  $('btn-reroll').classList.toggle('hidden', phase === 'assigning');
  $('btn-assign').classList.toggle('hidden', phase === 'assigning');

  // 족보 선택 UI
  renderCategorySelect();

  // 스코어보드
  renderScoreboard();
}

function renderDice() {
  const container = $('dice-container');
  container.innerHTML = '';
  const m = Game.MODE[game.mode];

  game.dice.forEach((val, i) => {
    const die = document.createElement('div');
    die.className = 'die' + (selectedDice.has(i) ? ' selected' : '');
    die.textContent = DICE_DOTS[val];
    die.dataset.index = i;
    if (phase === 'rolling' && game.rerolls > 0) {
      die.addEventListener('click', () => toggleDie(i));
    } else {
      die.classList.add('locked');
    }
    container.appendChild(die);
  });

  if (m.hasSpecial) {
    const sp = document.createElement('div');
    const isWild = game.specialDie === 0;
    sp.className = 'die special' + (selectedDice.has(4) ? ' selected' : '');
    sp.textContent = isWild ? 'W' : DICE_DOTS[game.specialDie];
    sp.dataset.index = 4;
    if (phase === 'rolling' && game.rerolls > 0) {
      sp.addEventListener('click', () => toggleDie(4));
    } else {
      sp.classList.add('locked');
    }
    container.appendChild(sp);
  }
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
      parts.push(`${from}${sp} keep ${kept}${keptSp || (kept ? '' : 'none')}`);
    } else {
      const d = e.dice.map(d => dieSpan(d, 'ai-kept')).join('');
      const sp = e.special != null ? spSpan(e.special) : '';
      if (!parts.length) parts.push(`${d}${sp}`);
      parts.push(`\u2192 <strong>${catNames[e.cat]}</strong> ${e.score}pts`);
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
  addScoreRow(tbody, 'Bonus', pB, aB, true);

  // 하체
  for (let c = m.upperCount; c < m.numCat; c++) {
    addScoreRow(tbody, catNames[c], game.pScores[c], game.aScores[c]);
  }

  // 총점
  const { pT, aT } = Game.calcTotal(game);
  addScoreRow(tbody, 'Total', pT, aT, true);
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
  selectedDice.clear();
  renderGame();
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
  Game.nextRound(game);

  if (Game.isGameOver(game)) {
    showGameOver();
  } else {
    phase = 'rolling';
    selectedDice.clear();
    renderGame();
  }
}

// ── 게임 종료 ──

function showGameOver() {
  const { pT, aT } = Game.calcTotal(game);
  const record = Game.recordResult(pT, aT);
  Game.saveGameHistory(game);

  showScreen('over');

  const result = pT > aT ? 'WIN' : pT < aT ? 'LOSE' : 'DRAW';
  const resultEmoji = pT > aT ? '\uD83C\uDF89' : pT < aT ? '\uD83D\uDE22' : '\uD83E\uDD1D';

  $('result-title').textContent = `${resultEmoji} ${result}`;
  $('result-title').className = 'result-' + result.toLowerCase();
  $('result-score').textContent = `${pT} vs ${aT}`;
  $('result-record').textContent = `${record.wins}W ${record.losses}L ${record.draws}D | Best: ${record.highScore}`;

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
  addScoreRow(tbody, 'Bonus', pB, aB, true);
  for (let c = m.upperCount; c < m.numCat; c++) {
    addScoreRow(tbody, catNames[c], game.pScores[c], game.aScores[c]);
  }
  const { pT, aT } = Game.calcTotal(game);
  addScoreRow(tbody, 'Total', pT, aT, true);
}

function renderAnalysis() {
  const container = $('analysis');
  const { playScore, evLoss, mistakes } = Game.getAnalysis(game);
  const m = Game.MODE[game.mode];
  const catNames = m.scoring.CATEGORY_NAMES;

  let html = `<div class="play-score">Play Score: <strong>${playScore}/100</strong> (EV Loss: ${evLoss})</div>`;

  if (mistakes.length === 0) {
    html += '<div class="perfect">Perfect play!</div>';
  } else {
    html += '<div class="mistakes">';
    const shown = mistakes.slice(0, 8);
    for (const h of shown) {
      const dice = h.dice.map(d => DICE_DOTS[d]).join('');
      const sp = h.special != null ? (h.special === 0 ? ' +W' : ' +' + DICE_DOTS[h.special]) : '';
      const playerStr = fmtAction(h.player, h.playerScore, catNames, h.dice, h.special, m);
      const optStr = fmtAction(h.optimal, h.optimalScore, catNames, h.dice, h.special, m);
      html += `<div class="mistake">`;
      html += `<div class="mistake-header">R${h.round} ${dice}${sp} reroll${h.rerolls} \u2014 <strong>#${h.rank}/${h.totalActions}</strong> (EV <strong>-${h.evDiff.toFixed(1)}</strong>)</div>`;
      html += `<div class="mistake-detail">${playerStr} \u2192 optimal: ${optStr}</div>`;
      html += `</div>`;
    }
    if (mistakes.length > 8) html += `<div class="more">...and ${mistakes.length - 8} more</div>`;
    html += '</div>';
  }

  container.innerHTML = html;
}

function fmtAction(action, score, catNames, dice, special, m) {
  if (action.type === 'assign') {
    return `${catNames[action.category]} ${score != null ? score + 'pts' : ''}`;
  }
  if (m.hasSpecial) {
    const nk = [];
    for (let i = 0; i < 4; i++) if (action.normalKeepMask & (1 << i)) nk.push(dice[i]);
    const kept = nk.map(d => DICE_DOTS[d]).join('') || '';
    const sp = action.keepSpecial ? (special === 0 ? 'W' : DICE_DOTS[special]) : '';
    return `keep ${kept}${sp || (kept ? '' : 'none')} reroll`;
  }
  const kept = action.keptValues.length ? action.keptValues.map(d => DICE_DOTS[d]).join('') : 'none';
  return `keep ${kept} reroll`;
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
    el.textContent = `${r.wins}W ${r.losses}L ${r.draws}D | Best: ${r.highScore}`;
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
    container.innerHTML = '<div class="history-empty">No games played yet.</div>';
    return;
  }

  for (const g of list) {
    const item = document.createElement('div');
    item.className = 'history-item';
    const result = g.playerTotal > g.aiTotal ? 'W' : g.playerTotal < g.aiTotal ? 'L' : 'D';
    const resultClass = result === 'W' ? 'win' : result === 'L' ? 'lose' : 'draw';
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
  const result = record.playerTotal > record.aiTotal ? 'WIN' : record.playerTotal < record.aiTotal ? 'LOSE' : 'DRAW';
  $('detail-title').textContent = `${record.mode === 'trickal' ? 'Trickal' : 'Standard'} - ${result}`;
  $('detail-title').className = 'result-' + result.toLowerCase();
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
  addScoreRow(tbody, 'Bonus', pB, aB, true);
  for (let c = m.upperCount; c < m.numCat; c++) {
    addScoreRow(tbody, catNames[c], record.playerScores[c], record.aiScores[c]);
  }
  addScoreRow(tbody, 'Total', record.playerTotal, record.aiTotal, true);

  // 분석 요약
  const analysisEl = $('detail-analysis');
  if (record.playScore != null) {
    let html = `<div class="play-score">Play Score: <strong>${record.playScore}/100</strong> (EV Loss: ${record.evLoss.toFixed(1)})</div>`;
    if (record.mistakes && record.mistakes.length > 0) {
      html += '<div class="mistakes">';
      for (const h of record.mistakes.slice(0, 5)) {
        const dice = h.dice.map(d => DICE_DOTS[d]).join('');
        const sp = h.special != null ? (h.special === 0 ? ' +W' : ' +' + DICE_DOTS[h.special]) : '';
        const playerStr = fmtAction(h.player, h.playerScore, catNames, h.dice, h.special, m);
        const optStr = fmtAction(h.optimal, h.optimalScore, catNames, h.dice, h.special, m);
        html += `<div class="mistake"><div class="mistake-header">R${h.round} ${dice}${sp} reroll${h.rerolls} \u2014 <strong>#${h.rank}/${h.totalActions}</strong> (EV <strong>-${h.evDiff.toFixed(1)}</strong>)</div><div class="mistake-detail">${playerStr} \u2192 optimal: ${optStr}</div></div>`;
      }
      if (record.mistakes.length > 5) html += `<div class="more">...and ${record.mistakes.length - 5} more</div>`;
      html += '</div>';
    } else {
      html += '<div class="perfect">Perfect play!</div>';
    }
    analysisEl.innerHTML = html;
  } else {
    analysisEl.innerHTML = '';
  }

  // 라운드 분석 버튼
  const roundsEl = $('detail-rounds');
  if (record.moves && record.moves.length > 0) {
    roundsEl.innerHTML = `<button id="btn-round-analysis" class="menu-btn standard" style="margin-top:12px;width:100%">Round Analysis</button>`;
    $('btn-round-analysis').addEventListener('click', () => openRoundAnalysis(record));
  } else {
    roundsEl.innerHTML = '<div class="play-score">Round data not available for this game.</div>';
  }
}

// ── 라운드별 상세 분석 ──

async function openRoundAnalysis(record) {
  showScreen('loading');
  $('loading-text').textContent = 'Loading strategy engine...';
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
  $('ra-title').textContent = `Round ${roundNum} / ${maxRound}`;
  $('ra-score-summary').textContent = `${record.playerTotal} vs ${record.aiTotal}`;

  // 네비게이션
  $('ra-prev').disabled = roundNum <= 1;
  $('ra-next').disabled = roundNum >= maxRound;
  $('ra-prev').onclick = () => { currentRoundNum--; renderRoundAnalysis(record, currentRoundNum); };
  $('ra-next').onclick = () => { currentRoundNum++; renderRoundAnalysis(record, currentRoundNum); };

  const container = $('ra-panels');
  container.innerHTML = '';

  if (!rd) {
    container.innerHTML = '<div class="ra-empty">No data for this round.</div>';
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

    let html = `<div class="ra-panel-header">Reroll ${r}</div>`;
    html += `<div class="ra-dice">${diceHtml}${spHtml}</div>`;

    // Top 5 리스트
    html += `<div class="ra-top-header">Top 5 <span class="ra-help" title="Placeholder">?</span></div>`;
    html += `<div class="ra-actions">`;

    for (let i = 0; i < top5.length; i++) {
      const act = top5[i];
      const evDiff = topEV - act.ev;
      const isPlayerChoice = isActionMatch(act, playerAction, pt, m);
      const cls = i === 0 ? 'ra-action ra-optimal' : (isPlayerChoice ? 'ra-action ra-player' : 'ra-action');
      const rankLabel = `#${i + 1}`;
      const desc = formatActionDesc(act, catNames, pt, m);
      const evStr = act.ev.toFixed(1);
      const diffStr = evDiff < 0.01 ? '' : `<span class="ra-ev-diff">-${evDiff.toFixed(1)}</span>`;
      const playerMark = isPlayerChoice ? '<span class="ra-you">YOU</span>' : '';

      html += `<div class="${cls}">`;
      html += `<span class="ra-rank">${rankLabel}</span>`;
      html += `<span class="ra-desc">${desc}</span>`;
      html += `<span class="ra-ev">${evStr}${diffStr}</span>`;
      html += playerMark;
      html += `</div>`;
    }

    // 플레이어 선택이 top5 밖이면 별도 표시
    if (playerAction) {
      const inTop5 = top5.some(a => isActionMatch(a, playerAction, pt, m));
      if (!inTop5) {
        const playerRank = findPlayerRank(allActions, playerAction, pt, m);
        const playerEV = playerRank ? playerRank.ev : null;
        const desc = playerAction.type === 'assign'
          ? `${catNames[playerAction.category]} ${playerAction.score}pts`
          : formatPlayerReroll(playerAction, pt, m);
        const evDiff = playerEV != null ? topEV - playerEV : 0;
        html += `<div class="ra-action ra-player ra-out">`;
        html += `<span class="ra-rank">#${playerRank ? playerRank.rank : '?'}</span>`;
        html += `<span class="ra-desc">${desc}</span>`;
        html += `<span class="ra-ev">${playerEV != null ? playerEV.toFixed(1) : '?'}<span class="ra-ev-diff">-${evDiff.toFixed(1)}</span></span>`;
        html += `<span class="ra-you">YOU</span>`;
        html += `</div>`;
      }
    }

    html += `</div>`; // ra-actions

    // 이 시점에서 배정 안 했으면 (리롤 또는 아직 도달 안 함) 표시
    if (!playerAction) {
      html += `<div class="ra-no-action">Not reached</div>`;
    }

    panel.innerHTML = html;
    container.appendChild(panel);
  }

  // 최종 배정 + AI 요약
  let footerHtml = '';
  if (rd.assign) {
    footerHtml += `<div class="ra-assign-result">Assigned: <strong>${catNames[rd.assign.category]}</strong> ${rd.assign.score}pts</div>`;
  }
  if (rd.ai && rd.ai.log.length) {
    const aiAssign = rd.ai.log.find(e => e.type === 'assign');
    if (aiAssign) {
      footerHtml += `<div class="ra-ai-result">AI: <strong>${catNames[aiAssign.cat]}</strong> ${aiAssign.score}pts</div>`;
    }
  }
  if (footerHtml) {
    const footer = document.createElement('div');
    footer.className = 'ra-footer';
    footer.innerHTML = footerHtml;
    container.appendChild(footer);
  }
}

// ── 행동 포맷 헬퍼 ──

function formatActionDesc(act, catNames, pt, m) {
  if (act.type === 'assign') {
    return `<span class="ra-cat">${catNames[act.category]}</span> <span class="ra-pts">${act.score}pts</span>`;
  }
  // 리롤: 킵한 주사위 표시
  const sorted = pt.dice.slice().sort((a, b) => a - b);
  if (m.hasSpecial) {
    const kept = act.keptNormal.map(i => `<span class="ra-die-sm">${DICE_DOTS[sorted[i]]}</span>`).join('');
    const sp = act.keepSpecial ? `<span class="ra-die-sm ra-sp">${pt.specialDie === 0 ? 'W' : DICE_DOTS[pt.specialDie]}</span>` : '';
    const keptStr = kept || sp ? `${kept}${sp}` : 'none';
    return `keep ${keptStr}`;
  }
  const kept = act.keptIndices.map(i => `<span class="ra-die-sm">${DICE_DOTS[sorted[i]]}</span>`).join('');
  return `keep ${kept || 'none'}`;
}

function formatPlayerReroll(playerAction, pt, m) {
  const rerolled = playerAction.rerolled;
  if (m.hasSpecial) {
    const kept = [];
    for (let i = 0; i < pt.dice.length; i++) {
      if (!rerolled.has(i)) kept.push(`<span class="ra-die-sm">${DICE_DOTS[pt.dice[i]]}</span>`);
    }
    if (pt.specialDie != null && !rerolled.has(pt.dice.length)) {
      kept.push(`<span class="ra-die-sm ra-sp">${pt.specialDie === 0 ? 'W' : DICE_DOTS[pt.specialDie]}</span>`);
    }
    return `keep ${kept.join('') || 'none'}`;
  }
  const kept = [];
  for (let i = 0; i < 5; i++) {
    if (!rerolled.has(i)) kept.push(`<span class="ra-die-sm">${DICE_DOTS[pt.dice[i]]}</span>`);
  }
  return `keep ${kept.join('') || 'none'}`;
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

function findPlayerRank(allActions, playerAction, pt, m) {
  for (let i = 0; i < allActions.length; i++) {
    if (isActionMatch(allActions[i], playerAction, pt, m)) {
      return { rank: i + 1, ev: allActions[i].ev };
    }
  }
  return null;
}

// 시작
init();
