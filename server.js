// ============================================================
// AQL DAFTARI — Matematika test ilovasi
// ============================================================

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.disableVerticalSwipes(); } catch(e){}
  try { tg.setHeaderColor('#f7f4ec'); } catch(e){}
  try { tg.setBackgroundColor('#f7f4ec'); } catch(e){}
}

const TEST_DURATION_SEC = 150 * 60; // 150 daqiqa
const MCQ_COUNT = 40;
const OPEN_COUNT = 15;

// ---------- BAHOLASH JADVALI (rasm asosida: ball/65*100, max ball 75) ----------
function gradeBand(ball) {
  if (ball >= 70) return "A+";
  if (ball >= 65) return "A";
  if (ball >= 60) return "B+";
  if (ball >= 55) return "B";
  if (ball >= 50) return "C+";
  if (ball >= 45) return "C";
  if (ball >= 40) return "D+";
  if (ball >= 35) return "D";
  return "NC";
}
function gradeColor(g) {
  return {
    "A+": "#2f5d4f", "A": "#46596b", "B+": "#7d4f73", "B": "#b5746a",
    "C+": "#c07a2e", "C": "#c6a93a", "D+": "#9a7a3a", "D": "#8a6a3a", "NC": "#b5402f"
  }[g] || "#46596b";
}
function gradeLabel(g) {
  return {
    "A+": "A'lo darajadan yuqori", "A": "A'lo", "B+": "Yaxshi darajadan yuqori",
    "B": "Yaxshi", "C+": "Qoniqarli darajadan yuqori", "C": "Qoniqarli",
    "D+": "O'rtacha", "D": "Past", "NC": "Yetarli emas"
  }[g] || "";
}
function computeScale(ball) {
  let pct = (ball / 65) * 100;
  if (pct > 100) pct = 100;
  pct = Math.round(pct * 100) / 100;
  return { pct };
}
function rawToBall(correctCount, total) {
  return (correctCount / total) * 75;
}

// ---------- STATE ----------
let state = {
  screen: 'screen-home',
  materialFilter: 'all',
  testQuestions: [],
  testAnswers: {},
  currentIndex: 0,
  timeLeft: TEST_DURATION_SEC,
  timerInterval: null,
  testStarted: false,
  testFinished: false,
  studentName: '',
};

// ---------- HELPERS ----------
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
function showScreen(id) {
  $all('.screen').forEach(s => s.classList.remove('active'));
  $('#' + id).classList.add('active');
  state.screen = id;
  window.scrollTo(0,0);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function shuffleOptions(q) {
  if (q.type !== 'mcq') return q;
  const opts = q.options.map((text, i) => ({ text, isCorrect: text === q.answer }));
  const shuffled = shuffle(opts);
  return Object.assign({}, q, {
    shuffledOptions: shuffled.map(o => o.text),
    correctShuffledIndex: shuffled.findIndex(o => o.isCorrect),
  });
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h,m,s].map(v => String(v).padStart(2,'0')).join(':');
}
function haptic(type) {
  try {
    if (tg?.HapticFeedback) {
      if (type === 'select') tg.HapticFeedback.selectionChanged();
      else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'warn') tg.HapticFeedback.notificationOccurred('warning');
      else tg.HapticFeedback.impactOccurred('light');
    }
  } catch(e){}
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// HOME → MATERIAL
// ============================================================
const TOPICS = [...new Set(QUESTION_BANK.map(q => q.topic))];

function renderMaterialFilters() {
  const wrap = $('#topic-filter');
  wrap.innerHTML = '';
  const allChip = document.createElement('div');
  allChip.className = 'chip active';
  allChip.textContent = "Hammasi";
  allChip.dataset.topic = 'all';
  wrap.appendChild(allChip);
  TOPICS.forEach(t => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = t;
    chip.dataset.topic = t;
    wrap.appendChild(chip);
  });
  wrap.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $all('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.materialFilter = chip.dataset.topic;
    renderMaterialList();
    haptic('select');
  });
}

function renderMaterialList() {
  const list = $('#material-list');
  list.innerHTML = '';
  const filtered = state.materialFilter === 'all'
    ? QUESTION_BANK
    : QUESTION_BANK.filter(q => q.topic === state.materialFilter);

  $('#material-count').textContent = filtered.length + " ta misol";

  const frag = document.createDocumentFragment();
  filtered.forEach(q => {
    const item = document.createElement('div');
    item.className = 'mat-item' + (q.type === 'open' ? ' open-type' : '');
    item.innerHTML = `
      <div class="mat-item-head">
        <span class="mat-item-num">#${q.id}</span>
        <span class="mat-item-tag">${q.topic} ${q.type === 'open' ? '&middot; ochiq' : '&middot; test'}</span>
      </div>
      <div class="mat-q">${escapeHtml(q.q)}</div>
      <div class="mat-a">${escapeHtml(q.answer)}</div>
    `;
    frag.appendChild(item);
  });
  list.appendChild(frag);
}

// ============================================================
// TEST GENERATION
// ============================================================
function generateTest() {
  const mcqPool = QUESTION_BANK.filter(q => q.type === 'mcq');
  const openPool = QUESTION_BANK.filter(q => q.type === 'open');
  const mcqPicked = shuffle(mcqPool).slice(0, MCQ_COUNT).map(shuffleOptions);
  const openPicked = shuffle(openPool).slice(0, OPEN_COUNT);
  return shuffle([...mcqPicked, ...openPicked]);
}

// ============================================================
// TEST INTRO → START
// ============================================================
$('#btn-start-test').addEventListener('click', () => {
  const nameInput = $('#student-name');
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    nameInput.style.borderColor = 'var(--rust)';
    toast("Iltimos, ismingizni kiriting");
    haptic('warn');
    return;
  }
  state.studentName = name;
  startTest();
});

function startTest() {
  state.testQuestions = generateTest();
  state.testAnswers = {};
  state.currentIndex = 0;
  state.timeLeft = TEST_DURATION_SEC;
  state.testStarted = true;
  state.testFinished = false;

  renderQNav();
  renderQuestion();
  startTimer();
  showScreen('screen-test-run');
  enableGuard();
}

function startTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    updateTimerDisplay();
    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      finishTest(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  $('#timer-val').textContent = fmtTime(Math.max(0,state.timeLeft));
  const dot = $('#timer-dot');
  const val = $('#timer-val');
  dot.classList.remove('warn','danger');
  val.classList.remove('danger');
  if (state.timeLeft <= 300) { dot.classList.add('danger'); val.classList.add('danger'); }
  else if (state.timeLeft <= 900) { dot.classList.add('warn'); }
}

// ============================================================
// QUESTION RENDER
// ============================================================
function renderQNav() {
  const strip = $('#q-nav-strip');
  strip.innerHTML = '';
  state.testQuestions.forEach((q, i) => {
    const dot = document.createElement('div');
    dot.className = 'q-dot' + (q.type === 'open' ? ' open' : '');
    dot.textContent = i + 1;
    dot.dataset.index = i;
    strip.appendChild(dot);
  });
  strip.addEventListener('click', (e) => {
    const dot = e.target.closest('.q-dot');
    if (!dot) return;
    state.currentIndex = parseInt(dot.dataset.index, 10);
    renderQuestion();
  });
}

function updateQNav() {
  $all('.q-dot').forEach((dot, i) => {
    const q = state.testQuestions[i];
    dot.classList.toggle('current', i === state.currentIndex);
    const ans = state.testAnswers[q.id];
    const answered = q.type === 'mcq' ? (ans !== undefined && ans !== null) : (ans && ans.trim().length > 0);
    dot.classList.toggle('answered', !!answered);
  });
  const cur = $('.q-dot.current');
  if (cur) cur.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
}

function renderQuestion() {
  const q = state.testQuestions[state.currentIndex];
  $('#q-topic-tag').textContent = q.topic + (q.type === 'open' ? ' · Ochiq savol' : ' · Test (A,B,C,D)');
  $('#q-text').textContent = q.q;
  $('#q-current').textContent = state.currentIndex + 1;
  $('#progress-fill').style.width = (((state.currentIndex+1)/state.testQuestions.length)*100) + '%';

  const area = $('#q-answer-area');
  area.innerHTML = '';

  if (q.type === 'mcq') {
    const letters = ['A','B','C','D'];
    const list = document.createElement('div');
    list.className = 'opt-list';
    q.shuffledOptions.forEach((optText, idx) => {
      const opt = document.createElement('div');
      const selected = state.testAnswers[q.id] === idx;
      opt.className = 'opt' + (selected ? ' selected' : '');
      opt.innerHTML = `<div class="opt-letter">${letters[idx]}</div><div class="opt-text">${escapeHtml(optText)}</div>`;
      opt.addEventListener('click', () => {
        state.testAnswers[q.id] = idx;
        renderQuestion();
        updateQNav();
        haptic('select');
      });
      list.appendChild(opt);
    });
    area.appendChild(list);
  } else {
    const box = document.createElement('div');
    box.className = 'open-answer-box';
    const existing = state.testAnswers[q.id] || '';
    box.innerHTML = `<textarea placeholder="Javobingizni shu yerga yozing... (masalan: x=5 yoki x^2/2+C)">${escapeHtml(existing)}</textarea>
      <div class="open-hint">Belgilar: ^ daraja uchun (x^2). Maxsus belgilar o'rniga oddiy matn yozing: sqrt, pi, +- va h.k.</div>`;
    const ta = box.querySelector('textarea');
    ta.addEventListener('input', () => {
      state.testAnswers[q.id] = ta.value;
      updateQNav();
    });
    area.appendChild(box);
  }

  $('#btn-prev').disabled = state.currentIndex === 0;
  $('#btn-next').textContent = state.currentIndex === state.testQuestions.length - 1 ? "Yakunlash ✓" : "Keyingi →";
  updateQNav();
}

$('#btn-prev').addEventListener('click', () => {
  if (state.currentIndex > 0) { state.currentIndex--; renderQuestion(); haptic(); }
});
$('#btn-next').addEventListener('click', () => {
  if (state.currentIndex < state.testQuestions.length - 1) {
    state.currentIndex++;
    renderQuestion();
    haptic();
  } else {
    openConfirmModal(
      "Sinovni yakunlash",
      "Siz oxirgi savolga yetdingiz. Javoblaringizni yuborishni tasdiqlaysizmi? Bu amalni qaytarib bo'lmaydi.",
      () => finishTest(false)
    );
  }
});

// ============================================================
// MODAL
// ============================================================
let modalConfirmCb = null;
function openConfirmModal(title, text, onConfirm) {
  $('#modal-title').textContent = title;
  $('#modal-text').textContent = text;
  modalConfirmCb = onConfirm;
  $('#modal-confirm').classList.add('show');
}
$('#modal-cancel').addEventListener('click', () => $('#modal-confirm').classList.remove('show'));
$('#modal-confirm-btn').addEventListener('click', () => {
  $('#modal-confirm').classList.remove('show');
  if (modalConfirmCb) modalConfirmCb();
});

// ============================================================
// SCORING
// ============================================================
function normalizeOpenAnswer(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\\sqrt/g, 'sqrt')
    .replace(/√/g, 'sqrt')
    .replace(/±/g, '+-')
    .replace(/\u2212/g, '-')
    .replace(/infin|infty|∞/g, 'inf')
    .replace(/π/g, 'pi')
    .replace(/,/g, ';')
    .replace(/o'/g,'o')
    .replace(/['ʻʼ`]/g,'');
}
function checkOpenAnswer(userAns, correctAns) {
  const u = normalizeOpenAnswer(userAns);
  const c = normalizeOpenAnswer(correctAns);
  if (!u) return false;
  if (u === c) return true;
  const splitc = c.split(';').filter(Boolean).sort();
  const splitu = u.split(/[;,]/).filter(Boolean).sort();
  if (splitc.length > 1 && splitu.length === splitc.length) {
    if (splitc.every((v,i) => v === splitu[i])) return true;
  }
  return false;
}

function finishTest(timeUp) {
  if (state.testFinished) return;
  state.testFinished = true;
  if (state.timerInterval) clearInterval(state.timerInterval);
  disableGuard();

  let mcqCorrect = 0, mcqTotal = 0, openCorrect = 0, openTotal = 0;
  const openReview = [];

  state.testQuestions.forEach(q => {
    if (q.type === 'mcq') {
      mcqTotal++;
      const ans = state.testAnswers[q.id];
      if (ans !== undefined && ans === q.correctShuffledIndex) mcqCorrect++;
    } else {
      openTotal++;
      const userAns = state.testAnswers[q.id] || '';
      const isCorrect = checkOpenAnswer(userAns, q.answer);
      if (isCorrect) openCorrect++;
      openReview.push({ q, userAns, isCorrect });
    }
  });

  const totalCorrect = mcqCorrect + openCorrect;
  const totalQ = mcqTotal + openTotal;
  const ball = rawToBall(totalCorrect, totalQ);
  const ballRounded = Math.round(ball * 100) / 100;
  const ballInt = Math.round(ball);
  const grade = gradeBand(ballInt);
  const scale = computeScale(ballInt);

  renderResult({
    mcqCorrect, mcqTotal, openCorrect, openTotal, totalCorrect, totalQ,
    ballRounded, ballInt, grade, scale, openReview, timeUp,
  });

  showScreen('screen-result');
  haptic(grade === 'NC' ? 'warn' : 'success');
}

// ============================================================
// RESULT RENDER
// ============================================================
function renderResult(r) {
  const wrap = $('#result-wrap');
  const gColor = gradeColor(r.grade);

  let html = `
    <div class="result-eyebrow">${r.timeUp ? "Vaqt tugadi · Avtomatik yakunlandi" : "Sinov yakunlandi"}</div>
    <div class="grade-disc" style="color:${gColor}; border-color:${gColor};">
      <div class="grade-letter" style="color:${gColor};">${r.grade}</div>
      <div class="grade-ball">${r.ballRounded} / 75 ball</div>
    </div>
    <div class="result-name">${escapeHtml(state.studentName || "Talaba")}</div>
    <div class="result-pct">${gradeLabel(r.grade)} &middot; ${r.scale.pct}%</div>

    <div class="score-grid">
      <div class="score-cell"><div class="score-cell-num">${r.totalCorrect}/${r.totalQ}</div><div class="score-cell-label">To'g'ri</div></div>
      <div class="score-cell"><div class="score-cell-num">${r.mcqCorrect}/${r.mcqTotal}</div><div class="score-cell-label">Test</div></div>
      <div class="score-cell"><div class="score-cell-num">${r.openCorrect}/${r.openTotal}</div><div class="score-cell-label">Ochiq</div></div>
    </div>

    <div class="scale-table">
      <div class="scale-row" style="font-weight:700; background:var(--paper-2);">
        <div class="scale-cell daraja">Daraja</div><div class="scale-cell">Ball</div><div class="scale-cell">Foiz</div>
      </div>
      ${renderScaleRows(r.ballInt, r.grade)}
    </div>

    <div class="open-review">
      <div class="open-review-title">Ochiq savollar &mdash; ko'rib chiqish (${r.openCorrect}/${r.openTotal} to'g'ri)</div>
      ${r.openReview.map(item => `
        <div class="open-review-item">
          <div class="open-review-q">#${item.q.id} &middot; ${escapeHtml(item.q.q)}</div>
          <div class="open-review-ans">
            <div class="you">Sizning javobingiz: ${item.userAns ? escapeHtml(item.userAns) : "<i>(bo'sh qoldirilgan)</i>"} ${item.isCorrect ? '<span class="tag-correct">&#10003; to\'g\'ri</span>' : '<span class="tag-wrong">&#10007; xato</span>'}</div>
            ${!item.isCorrect ? `<div class="correct">To'g'ri javob: ${escapeHtml(item.q.answer)}</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="result-actions">
      <button class="btn btn-primary" id="btn-retry">Qaytadan urinish</button>
      <button class="btn btn-ghost" id="btn-home">Bosh sahifaga qaytish</button>
    </div>
  `;
  wrap.innerHTML = html;

  $('#btn-retry').addEventListener('click', () => {
    showScreen('screen-test-intro');
  });
  $('#btn-home').addEventListener('click', () => {
    showScreen('screen-home');
  });
}

function renderScaleRows(myBall, myGrade) {
  const bands = [
    {lo:70,hi:75,g:"A+"},{lo:65,hi:69,g:"A"},{lo:60,hi:64,g:"B+"},{lo:55,hi:59,g:"B"},
    {lo:50,hi:54,g:"C+"},{lo:45,hi:49,g:"C"},{lo:40,hi:44,g:"D+"},{lo:35,hi:39,g:"D"},{lo:0,hi:34,g:"NC"}
  ];
  return bands.map(b => {
    const isMe = myGrade === b.g;
    const midBall = Math.round((b.lo+b.hi)/2);
    const sc = computeScale(midBall);
    return `<div class="scale-row ${isMe ? 'me':''}">
      <div class="scale-cell daraja">${b.g}</div>
      <div class="scale-cell">${b.lo}&ndash;${b.hi}</div>
      <div class="scale-cell">${sc.pct}%</div>
    </div>`;
  }).join('');
}

// ============================================================
// NAVIGATION
// ============================================================
$('#card-material').addEventListener('click', () => {
  renderMaterialList();
  showScreen('screen-material');
  haptic();
});
$('#card-test').addEventListener('click', () => {
  showScreen('screen-test-intro');
  haptic();
});
$all('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (state.testStarted && !state.testFinished && state.screen === 'screen-test-run') {
      openConfirmModal("Sinovni tark etish", "Sinov hali tugamagan. Chiqsangiz, joriy holatingiz yo'qoladi.", () => {
        clearInterval(state.timerInterval);
        state.testStarted = false;
        disableGuard();
        showScreen('screen-home');
      });
      return;
    }
    showScreen(btn.dataset.back);
  });
});

// ============================================================
// SCREENSHOT / SCREEN-RECORDING DETERRENTS
// (To'liq blokirovka veb texnologiyada mumkin emas — faqat qiyinlashtirish)
// ============================================================
function enableGuard() {
  document.addEventListener('contextmenu', preventDefaultHandler);
  document.addEventListener('copy', preventDefaultHandler);
  document.addEventListener('cut', preventDefaultHandler);
  document.addEventListener('keydown', keyGuardHandler);
}
function disableGuard() {
  document.removeEventListener('contextmenu', preventDefaultHandler);
  document.removeEventListener('copy', preventDefaultHandler);
  document.removeEventListener('cut', preventDefaultHandler);
  document.removeEventListener('keydown', keyGuardHandler);
  $('#guard-overlay').classList.remove('show');
}
function preventDefaultHandler(e) { e.preventDefault(); }
function keyGuardHandler(e) {
  if (e.key === 'PrintScreen' || (e.ctrlKey && (e.key === 'p' || e.key === 's' || e.key === 'c'))) {
    e.preventDefault();
    toast("Bu amal sinov vaqtida cheklangan");
  }
}
document.addEventListener('visibilitychange', () => {
  if (!state.testStarted || state.testFinished) return;
  if (document.hidden) {
    $('#guard-overlay').classList.add('show');
  } else {
    $('#guard-overlay').classList.remove('show');
  }
});
window.addEventListener('blur', () => {
  if (state.testStarted && !state.testFinished) $('#guard-overlay').classList.add('show');
});
window.addEventListener('focus', () => {
  $('#guard-overlay').classList.remove('show');
});

if (tg) {
  tg.onEvent('backButtonClicked', () => {
    if (state.screen !== 'screen-home') {
      const backBtn = document.querySelector(`#${state.screen} [data-back]`) || $('.back-btn');
      if (backBtn) backBtn.click();
    }
  });
}

// ============================================================
// INIT
// ============================================================
renderMaterialFilters();
showScreen('screen-home');