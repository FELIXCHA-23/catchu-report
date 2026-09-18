/* 캐치유테스트 리포트 — 로컬 저장(localStorage) 기반, 서버/로그인 불필요 */

const STORAGE_KEY = 'catchu_v1';
const TYPE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7', '#e87ba4', '#008300', '#e34948', '#eda100'];
const COMPETENCY_LABELS = { '문제해결': '문제해결역량', '추론': '추론역량', '의사소통': '의사소통역량', '연결': '연결역량', '정보처리': '정보처리역량' };
// 2022 개정 수학과 교육과정의 '교수·학습 방법'에서 각 역량을 기르는 방법으로 제시한 내용을 바탕으로 요약함
const COMPETENCY_DESCRIPTIONS = {
  '문제해결': '풀이법이나 답이 하나로 정해지지 않은 문제를 통해\n조건 분석 → 계획 → 실행 → 반성의 과정으로 풀어보며 기르는 능력',
  '추론': '규칙을 찾고 "왜", "어떻게"를 따져 수학적 사실을 논리적으로 정당화하고 그 과정을 되돌아보며 기르는 능력',
  '의사소통': '수학 용어·기호·표·그래프를 정확히 쓰고\n자신의 생각과 풀이 전략을 수학적 표현으로 나타내며 기르는 능력',
  '연결': '영역·학년군 안팎의 개념을 유기적으로 연계해 새 지식을 만들고\n실생활·타 교과와 이어 수학의 쓸모를 깨달으며 기르는 능력',
  '정보처리': '실생활·수학적 상황의 자료를 탐색·수집·처리해 합리적으로 판단하고, 교구·공학 도구로 추상적 내용을 시각화해 직관적으로 이해하며 기르는 능력',
};
const MAX_EXAM_FILE_BYTES = 4 * 1024 * 1024;
const STANDARD_CLASSES = ['MM1-BETA','MM2-GAMMA','MM3-BETA','MH1-GAMMA','MH2-ALPHA','MH2-GAMMA','TM1-GAMMA','TM2-GAMMA','TM3-GAMMA','TH1-BETA','TH2-BETA','TH1-ALPHA','SH2-ALPHA','ME-INDV'];
const TEACHER_OPTIONS = ['차성빈','방희진','문태민','목윤재','오민경'];
const CLASS_TEACHER_MAP = {
  'MM1-BETA': '문태민', 'MM2-GAMMA': '문태민', 'TM1-GAMMA': '문태민', 'TM2-GAMMA': '문태민', 'ME-INDV': '문태민',
  'MH1-GAMMA': '목윤재', 'TH1-BETA': '목윤재', 'MM3-BETA': '목윤재', 'TM3-GAMMA': '목윤재',
  'MH2-GAMMA': '방희진', 'TH2-BETA': '방희진',
  'MH2-ALPHA': '차성빈', 'TH1-ALPHA': '차성빈', 'SH2-ALPHA': '차성빈',
};
function teacherTitle(name) { return name === '차성빈' ? '원장' : '선생님'; }

// 이 컴퓨터에서 로그인한 선생님이 누구인지 (계산기록/백업 파일에는 안 들어가고, 이 브라우저에만 저장됨)
const CURRENT_TEACHER_KEY = 'catchu_current_teacher';
function getCurrentTeacher() { return localStorage.getItem(CURRENT_TEACHER_KEY) || ''; }
function setCurrentTeacher(t) {
  if (t) localStorage.setItem(CURRENT_TEACHER_KEY, t);
  else localStorage.removeItem(CURRENT_TEACHER_KEY);
}
// 담당 선생님이 선택되어 있으면 그 선생님 학생만 남기고, 선택 안 했으면(전체 보기) 그대로 반환
function filterByCurrentTeacher(students) {
  const t = getCurrentTeacher();
  return t ? students.filter(s => s.teacher === t) : students;
}

// 정답률 기준 난이도 6단계 (문항 하나 또는 시험지 전체 정답률에 공통으로 사용)
function difficultyTierByAccuracy(pct) {
  if (pct >= 90) return { n: 1, label: '하' };
  if (pct >= 80) return { n: 2, label: '중하' };
  if (pct >= 65) return { n: 3, label: '중' };
  if (pct >= 55) return { n: 4, label: '중상' };
  if (pct >= 45) return { n: 5, label: '상' };
  return { n: 6, label: '최상' };
}

// 난이도 숫자(1~6)를 라벨로 — 문항별 태그된 난이도 평균처럼 "정답률 기반"이 아닌 값을 표시할 때 씀
const DIFFICULTY_LABELS_BY_N = ['하', '중하', '중', '중상', '상', '최상'];
function difficultyLabelByN(n) { return DIFFICULTY_LABELS_BY_N[Math.round(n) - 1] || ''; }

// 회차(시험지) 전체의 정답률을 계산해 난이도로 환산 — 그 회차를 본 모든 학생의 실제 채점 결과 기반
function computeRoundOverallDifficulty(roundId) {
  const round = state.rounds.find(r => r.id === roundId);
  if (!round) return null;
  let correct = 0, total = 0;
  state.results.filter(r => r.roundId === roundId).forEach(r => {
    correct += round.total - new Set(r.wrong).size;
    total += round.total;
  });
  if (!total) return null;
  const pct = Math.round((correct / total) * 100);
  const tier = difficultyTierByAccuracy(pct);
  return { pct, ...tier };
}

function logoBlock() { return `<div class="logo-mark"><img src="logo.png" alt="KASTLE MATH" class="logo-icon"><span class="wordmark">KASTLE MATH</span></div>`; }

/* ---------- AI 연동 (Anthropic API, 브라우저에서 직접 호출) ---------- */

const API_KEY_STORAGE = 'catchu_api_key'; // 별도 저장 — 백업 파일(state)에는 절대 포함하지 않음

function getApiKey() { try { return localStorage.getItem(API_KEY_STORAGE) || ''; } catch (e) { return ''; } }
function setApiKey(key) { try { localStorage.setItem(API_KEY_STORAGE, key); } catch (e) {} }

async function callClaudeAPI({ content, maxTokens = 2000 }) {
  const key = getApiKey();
  if (!key) throw new Error('API 키가 설정되지 않았어요. "API 키 설정"에서 먼저 입력해주세요.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    let msg = res.status + ' ' + res.statusText;
    try { const body = await res.json(); if (body?.error?.message) msg = body.error.message; } catch (e) {}
    throw new Error(msg);
  }
  const data = await res.json();
  const text = (data.content || []).map(c => c.text || '').join('');
  return { text, stopReason: data.stop_reason };
}

function extractJson(text, stopReason) {
  let t = (text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch (err) {
    if (stopReason === 'max_tokens') throw new Error('응답이 길어서 도중에 잘렸어요. 문항 수가 많은 시험지라 그래요 — 다시 시도해보세요.');
    throw new Error('AI 응답을 이해하지 못했어요. 다시 시도해주세요.');
  }
}

const EXAM_ANALYSIS_PROMPT_TEMPLATE = total => `다음은 초·중·고 수학 시험지 이미지입니다. 이 시험지는 총 ${total}문항입니다.
시험지에 표시된 유형(또는 단원) 구분을 참고하여 문항 번호를 유형별로 묶고, 각 유형이 대한민국 2022 개정 수학과 교육과정의 어떤 단원에 해당하는지 "대단원 - 중단원 - 소단원" 3단계로 판단해주세요 (예: "도함수의 활용 - 접선의 방정식과 평균값 정리 - 접선의 기울기"). 대단원·중단원은 교과서의 큰 챕터/절 단위로 크게 잡고, 소단원에 문항의 구체적인 개념을 적으세요.
유형은 너무 잘게 쪼개지 말고 굵직하게 묶어주세요 — 같은 단원 안에서는 유형이 2~3개를 넘지 않도록 통합해주세요 (예: "원의 접선의 방정식(1)", "(2)", "(3)"처럼 세분화된 소유형들은 "원의 접선의 방정식" 하나로 합치는 식).
또한 문항 하나하나마다(전체 문항 각각에 대해) 다음 두 가지를 판단해주세요:
- 난이도: 문항별 정답률이 시험지에 표시되어 있다면 그 정답률을 기준으로 아래 표에 따라 매겨주세요. 정답률 정보가 없다면(신규 시험지 등) 문제 내용을 보고 합리적으로 추정해주세요.
  90% 이상 → 1(하) · 80~90% → 2(중하) · 65~80% → 3(중) · 55~65% → 4(중상) · 45~55% → 5(상) · 45% 미만 → 6(최상)
- 핵심역량: 문제해결/추론/의사소통/연결/정보처리 중 그 문항을 푸는 데 "주로 요구되는 사고 과정"이 무엇인지 하나를 판단해주세요. 객관식/단답형이라도 상관없어요 — 서술형인지 여부가 아니라, 문제를 푸는 데 어떤 역량이 핵심인지로 판단하세요. 같은 유형 안에서도 문항마다 다를 수 있으니 문항별로 판단하고, 아래 기준을 참고해 다섯 역량이 실제 문항 성격에 맞게 고루 나오도록 해주세요 (문제해결/추론 두 가지로만 쏠리지 않게 주의):
  - 문제해결: 여러 단계의 풀이 전략을 세워야 답이 나오는 복합적인 문제, 배운 개념을 낯선 상황에 응용해야 하는 문제
  - 추론: 주어진 조건에서 논리적으로 결론을 이끌어내거나 성질·공식이 성립하는 이유를 따져야 하는 문제
  - 의사소통: 그래프·표·도형 등 수학적 표현을 읽고 해석하는 문제, 문장제(word problem)를 식으로 옮기거나 식↔그래프↔표 사이를 변환하는 문제 (서술형이 아니라 객관식이어도 해당됩니다)
  - 연결: 배운 개념을 다른 단원 개념이나 실생활 상황과 연결지어야 하는 문제, 두 개 이상의 개념을 함께 써야 하는 문제
  - 정보처리: 표·통계·여러 조건 등 주어진 자료를 정리·계산해서 처리하는 문제, 공식에 값을 대입해 기계적으로 계산하는 문제

아래 JSON 형식으로만 응답하세요. 다른 설명이나 마크다운 없이 JSON 객체만 출력하세요:
{
  "total": ${total},
  "types": [
    { "name": "유형명", "unit": "대단원 - 중단원 - 소단원", "questions": [1,2,3] }
  ],
  "difficulty": { "1": 2, "2": 3 },
  "competency": { "1": "문제해결", "2": "추론" }
}`;

async function analyzeExamWithAI() {
  const btn = document.getElementById('aiAnalyzeBtn');
  const status = document.getElementById('aiAnalyzeStatus');
  if (!pendingExamFile || !pendingExamFile.dataUrl) {
    status.textContent = '먼저 시험지를 업로드해주세요 (4MB 이하 이미지를 권장해요).';
    status.style.color = 'var(--critical)';
    return;
  }
  const total = parseInt(document.getElementById('roundTotal').value, 10) || 30;
  const mediaMatch = pendingExamFile.dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!mediaMatch) { status.textContent = '시험지 파일을 읽을 수 없어요.'; return; }
  const [, mediaType, base64] = mediaMatch;
  const isPdf = mediaType === 'application/pdf';
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

  btn.disabled = true;
  status.style.color = 'var(--muted)';
  status.textContent = '분석 중이에요... (몇 초에서 1분 정도 걸려요)';
  try {
    const { text, stopReason } = await callClaudeAPI({
      content: [fileBlock, { type: 'text', text: EXAM_ANALYSIS_PROMPT_TEMPLATE(total) }],
      maxTokens: 8000,
    });
    const json = extractJson(text, stopReason);
    if (!Array.isArray(json.types) || !json.types.length) throw new Error('분석 결과가 비어있어요. 시험지 사진이 잘 보이는지 확인해주세요.');
    document.getElementById('typeRows').innerHTML = '';
    json.types.forEach(t => addTypeRow(t.name || '', rangeToString(t.questions || []), t.unit || ''));
    if (json.total) document.getElementById('roundTotal').value = json.total;
    pendingDifficulty = (json.difficulty && typeof json.difficulty === 'object') ? json.difficulty : null;
    pendingCompetency = (json.competency && typeof json.competency === 'object') ? json.competency : null;
    updateCoverageHint();
    document.getElementById('manualFallback').open = true;
    status.style.color = 'var(--good)';
    status.textContent = '분석 완료! 아래에서 내용을 확인하고 회차를 저장하세요.';
    toast('AI 분석이 끝났어요.');
  } catch (err) {
    console.error(err);
    status.style.color = 'var(--critical)';
    status.textContent = '분석 실패: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const keyInput = document.getElementById('apiKeyInput');
  const keyStatus = document.getElementById('apiKeyStatus');
  if (keyInput) {
    keyInput.value = getApiKey();
    if (getApiKey()) keyStatus.textContent = '저장된 키가 있어요.';
    document.getElementById('saveApiKeyBtn').addEventListener('click', () => {
      setApiKey(keyInput.value.trim());
      keyStatus.textContent = '저장했어요.';
      toast('API 키를 저장했어요.');
    });
  }
  const analyzeBtn = document.getElementById('aiAnalyzeBtn');
  if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeExamWithAI);
});

let state = loadState();
let editingRoundId = null;
let editingStudentId = null;
let pendingExamFile = null;
let pendingDifficulty = null;
let pendingCompetency = null;

/* ---------- state ---------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (!data.teacherNotes) data.teacherNotes = {};
      if (!data.retests) data.retests = [];
      if (!data.gradeOverrides) data.gradeOverrides = {};
      if (!data.sharedRoundIds) data.sharedRoundIds = [];
      if (!data.studentDone) data.studentDone = {};
      return data;
    }
  } catch (e) { console.warn('load failed', e); }
  return { students: [], rounds: [], results: [], teacherNotes: {}, retests: [], gradeOverrides: {}, sharedRoundIds: [], studentDone: {} };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('저장 실패: 브라우저 저장공간을 확인해주세요.');
  }
}

/* ---------- utils ---------- */

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 동명이인 구분용으로 이름 뒤에 붙인 숫자(예: "황서윤2")는 학원 관리 화면에서만 필요하고
// 학부모에게 나가는 리포트/PDF에는 보이면 안 되므로, 리포트를 만들 때만 이 함수로 떼어내서 씀
function displayName(name) {
  return String(name || '').replace(/\d+$/, '');
}

function hasBatchim(str) {
  const c = String(str).trim().slice(-1).charCodeAt(0);
  if (c < 0xAC00 || c > 0xD7A3) return false;
  return (c - 0xAC00) % 28 !== 0;
}
function josa(word, withB, withoutB) { return escapeHtml(word) + (hasBatchim(word) ? withB : withoutB); }

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return (d.getMonth() + 1) + '.' + d.getDate();
}

function toISODate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 캐치유테스트는 매주 금요일만 봄 — 금요일만 고를 수 있는 선택지를 만들어줌 (지난 8주 ~ 앞으로 26주)
function populateFridaySelect(selectEl, keepValue) {
  const today = new Date();
  const day = today.getDay(); // 0=일 ... 5=금 ... 6=토
  const diffToFriday = (5 - day + 7) % 7;
  const nearestFriday = new Date(today);
  nearestFriday.setDate(today.getDate() + diffToFriday);

  const fridays = [];
  for (let i = -8; i <= 26; i++) {
    const d = new Date(nearestFriday);
    d.setDate(nearestFriday.getDate() + i * 7);
    fridays.push(d);
  }
  const options = fridays.map(d => {
    const iso = toISODate(d);
    return `<option value="${iso}">${d.getMonth() + 1}월 ${d.getDate()}일 (금)</option>`;
  });
  // 기존 데이터의 날짜가 금요일이 아니거나 목록 범위 밖이면(과거 회차 등) 선택 유지를 위해 추가해둠
  if (keepValue && !fridays.some(d => toISODate(d) === keepValue)) {
    options.unshift(`<option value="${keepValue}">${keepValue} (금요일 아님)</option>`);
  }
  selectEl.innerHTML = options.join('');
  if (keepValue) selectEl.value = keepValue;
  else selectEl.value = toISODate(nearestFriday);
}

function parseRange(str) {
  const set = new Set();
  String(str || '').split(',').map(s => s.trim()).filter(Boolean).forEach(tok => {
    const m = tok.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) set.add(i);
    } else if (/^\d+$/.test(tok)) {
      set.add(parseInt(tok, 10));
    }
  });
  return Array.from(set).sort((a, b) => a - b);
}

function rangeToString(arr) {
  if (!arr || !arr.length) return '';
  const sorted = [...new Set(arr)].sort((a, b) => a - b);
  const parts = [];
  let start = sorted[0], prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) { prev = cur; continue; }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = cur;
  }
  return parts.join(',');
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- tabs ---------- */

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  if (name === 'score') renderScoreTab();
  if (name === 'retest') renderRetestTab();
  if (name === 'report') renderReportTab();
}

/* ================= 학생 관리 ================= */

function renderStudents() {
  const wrap = document.getElementById('studentListWrap');
  const filtered = filterByCurrentTeacher(state.students);
  if (!state.students.length) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 학생이 없어요. 위에서 학생을 추가해보세요.</div>';
  } else if (!filtered.length) {
    wrap.innerHTML = '<div class="empty-state">해당 선생님 담당 학생이 없어요.</div>';
  } else {
    const rows = filtered.map(s => `
      <tr>
        <td>${escapeHtml(s.name)}${s.school ? `<br><span class="type-unit-caption">${escapeHtml(s.school)}</span>` : ''}</td>
        <td>${escapeHtml(s.grade || '-')}${s.examGrade ? `<br><span class="type-unit-caption">시험 ${escapeHtml(s.examGrade)}</span>` : ''}</td>
        <td>${escapeHtml(s.class || '-')}</td>
        <td>${escapeHtml(s.teacher || '-')}</td>
        <td class="row-actions">
          <button class="icon-btn" data-report="${s.id}">보고서</button>
          <button class="icon-btn" data-edit-student="${s.id}">수정</button>
          <button class="icon-btn" data-del-student="${s.id}">삭제</button>
        </td>
      </tr>`).join('');
    wrap.innerHTML = `<table class="data-table"><thead><tr><th>이름</th><th>학년</th><th>반</th><th>담당 선생님</th><th>관리</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  wrap.querySelectorAll('[data-del-student]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.delStudent;
    const s = state.students.find(x => x.id === id);
    if (!confirm(`"${s.name}" 학생과 채점 기록을 모두 삭제할까요?`)) return;
    state.students = state.students.filter(x => x.id !== id);
    state.results = state.results.filter(r => r.studentId !== id);
    if (editingStudentId === id) resetStudentForm();
    saveState(); renderStudents(); populateSelects();
    toast('학생을 삭제했어요.');
  }));
  wrap.querySelectorAll('[data-report]').forEach(b => b.addEventListener('click', () => {
    switchTab('report');
    document.getElementById('reportStudentSel').value = b.dataset.report;
    renderReportTab();
  }));
  wrap.querySelectorAll('[data-edit-student]').forEach(b => b.addEventListener('click', () => {
    const s = state.students.find(x => x.id === b.dataset.editStudent);
    if (!s) return;
    editingStudentId = s.id;
    document.getElementById('stuName').value = s.name;
    document.getElementById('stuGrade').value = s.grade || '';
    document.getElementById('stuClass').value = s.class || '';
    document.getElementById('stuTeacher').value = s.teacher || '';
    document.getElementById('stuSchool').value = s.school || '';
    document.getElementById('stuExamGrade').value = s.examGrade || '';
    document.getElementById('stuSubmitBtn').textContent = '학생 수정 저장';
    document.getElementById('stuCancelBtn').style.display = '';
    document.getElementById('stuName').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}

function resetStudentForm() {
  editingStudentId = null;
  document.getElementById('studentForm').reset();
  document.getElementById('stuSubmitBtn').textContent = '학생 추가';
  document.getElementById('stuCancelBtn').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  const classSel = document.getElementById('stuClass');
  STANDARD_CLASSES.forEach(c => classSel.insertAdjacentHTML('beforeend', `<option value="${c}">${c}</option>`));
  const teacherSel = document.getElementById('stuTeacher');
  TEACHER_OPTIONS.forEach(t => teacherSel.insertAdjacentHTML('beforeend', `<option value="${t}">${t}</option>`));
  classSel.addEventListener('change', () => {
    if (CLASS_TEACHER_MAP[classSel.value]) teacherSel.value = CLASS_TEACHER_MAP[classSel.value];
  });

  document.getElementById('studentForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('stuName').value.trim();
    if (!name) return;
    const grade = document.getElementById('stuGrade').value.trim();
    const cls = document.getElementById('stuClass').value.trim();
    const teacher = document.getElementById('stuTeacher').value.trim();
    const school = document.getElementById('stuSchool').value.trim();
    const examGrade = document.getElementById('stuExamGrade').value.trim();
    if (editingStudentId) {
      const s = state.students.find(x => x.id === editingStudentId);
      s.name = name; s.grade = grade; s.class = cls; s.teacher = teacher; s.school = school; s.examGrade = examGrade || undefined;
      toast('학생 정보를 수정했어요.');
    } else {
      state.students.push({ id: uid(), name, grade, class: cls, teacher, school, examGrade: examGrade || undefined });
      toast('학생을 추가했어요.');
    }
    saveState();
    resetStudentForm();
    renderStudents(); populateSelects();
  });
  document.getElementById('stuCancelBtn').addEventListener('click', resetStudentForm);

  document.getElementById('importRosterFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const list = JSON.parse(reader.result);
        if (!Array.isArray(list)) throw new Error('형식 오류');
        let added = 0, skipped = 0;
        list.forEach(s => {
          if (!s.name) return;
          const exists = state.students.some(x => x.name === s.name && x.class === s.class);
          if (exists) { skipped++; return; }
          state.students.push({ id: uid(), name: s.name, grade: s.grade || '', class: s.class || '', teacher: s.teacher || '', school: s.school || '' });
          added++;
        });
        saveState();
        renderStudents(); populateSelects();
        toast(`학생 ${added}명 추가했어요${skipped ? ` (중복 ${skipped}명 건너뜀)` : ''}.`);
      } catch (err) {
        alert('올바른 명단 파일이 아니에요.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('applyClassTeacherBtn').addEventListener('click', () => {
    let changed = 0;
    state.students.forEach(s => {
      const t = CLASS_TEACHER_MAP[s.class];
      if (t && s.teacher !== t) { s.teacher = t; changed++; }
    });
    if (!changed) { toast('이미 다 적용되어 있거나, 매핑된 반의 학생이 없어요.'); return; }
    saveState(); renderStudents(); populateSelects();
    toast(`${changed}명의 담당 선생님을 반 기준으로 일괄 적용했어요.`);
  });
});

/* ================= 회차 · 시험지 ================= */

const COMPETENCY_OPTIONS = ['', '문제해결', '추론', '의사소통', '연결', '정보처리'];

// 문항별 역량 맵에서, 이 유형에 속한 문항들이 가장 많이 갖는 역량을 보여줌(수정 화면 프리필용, 편집 시 참고만)
function majorityCompetency(round, type) {
  if (!round.competency) return '';
  const counts = {};
  type.questions.forEach(q => {
    const c = round.competency[q] ?? round.competency[String(q)];
    if (c) counts[c] = (counts[c] || 0) + 1;
  });
  const entries = Object.entries(counts);
  if (!entries.length) return '';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][1] === type.questions.length ? entries[0][0] : '';
}

function addTypeRow(name = '', range = '', unit = '', competency = '') {
  const wrap = document.getElementById('typeRows');
  const idx = wrap.children.length;
  const row = document.createElement('div');
  row.className = 'type-row';
  const compOptions = COMPETENCY_OPTIONS.map(c => `<option value="${c}"${c === competency ? ' selected' : ''}>${c ? COMPETENCY_LABELS[c] : '역량 일괄지정(선택)'}</option>`).join('');
  row.innerHTML = `
    <span class="type-swatch" style="background:${TYPE_COLORS[idx % TYPE_COLORS.length]}"></span>
    <input type="text" class="type-name" placeholder="유형명 (예: 도형)" value="${escapeHtml(name)}">
    <input type="text" class="type-range" placeholder="문항 번호 (예: 7-12)" value="${escapeHtml(range)}">
    <input type="text" class="type-unit" placeholder="교육과정 단원 (선택, 예: 분수의 덧셈과 뺄셈)" value="${escapeHtml(unit)}">
    <select class="type-competency">${compOptions}</select>
    <button type="button" class="icon-btn" data-remove-type>✕</button>
  `;
  row.querySelector('[data-remove-type]').addEventListener('click', () => { row.remove(); updateCoverageHint(); });
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', updateCoverageHint));
  wrap.appendChild(row);
  updateCoverageHint();
}

function readTypeRows() {
  return Array.from(document.querySelectorAll('#typeRows .type-row')).map((row, i) => {
    const name = row.querySelector('.type-name').value.trim();
    const questions = parseRange(row.querySelector('.type-range').value);
    const unit = row.querySelector('.type-unit').value.trim();
    const competency = row.querySelector('.type-competency').value;
    return { name, questions, unit, competency, color: TYPE_COLORS[i % TYPE_COLORS.length] };
  }).filter(t => t.name && t.questions.length);
}

function updateCoverageHint() {
  const total = parseInt(document.getElementById('roundTotal').value, 10) || 0;
  const types = readTypeRows();
  const covered = new Set();
  types.forEach(t => t.questions.forEach(q => covered.add(q)));
  const hint = document.getElementById('coverageHint');
  hint.textContent = `${covered.size} / ${total} 문항 배정됨`;
  hint.style.color = covered.size === total && total > 0 ? 'var(--good)' : 'var(--warn-ink)';
}

function renderExamFileInfo() {
  const info = document.getElementById('examFileInfo');
  const thumb = document.getElementById('examThumb');
  if (!pendingExamFile) {
    info.textContent = '아직 업로드된 시험지가 없어요.';
    thumb.style.display = 'none';
    return;
  }
  const sizeTxt = (pendingExamFile.size / 1024 / 1024).toFixed(1) + 'MB';
  if (pendingExamFile.dataUrl && pendingExamFile.dataUrl.startsWith('data:image')) {
    thumb.src = pendingExamFile.dataUrl;
    thumb.style.display = 'block';
    info.textContent = `${pendingExamFile.name} (${sizeTxt})`;
  } else if (pendingExamFile.dataUrl) {
    thumb.style.display = 'none';
    info.textContent = `${pendingExamFile.name} (${sizeTxt}) · PDF 첨부됨`;
  } else {
    thumb.style.display = 'none';
    info.textContent = `${pendingExamFile.name} (${sizeTxt}) · 용량이 커서 미리보기는 생략했어요`;
  }
}

function resetRoundForm() {
  editingRoundId = null;
  pendingExamFile = null;
  pendingDifficulty = null;
  pendingCompetency = null;
  document.getElementById('roundForm').reset();
  populateFridaySelect(document.getElementById('roundDate'));
  document.getElementById('roundGrade').value = '';
  document.getElementById('roundTotal').value = 30;
  document.getElementById('roundTitle').value = '';
  document.getElementById('typeRows').innerHTML = '';
  updateCoverageHint();
  renderExamFileInfo();
  const details = document.getElementById('manualFallback');
  if (details) details.open = false;
}

// "1회차, 2회차..." 순번 대신, 시험지에 인쇄된 것과 같은 "월-주차"로 표기 (그 달의 몇 번째 금요일인지로 계산)
function dateToWeekLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const weekOfMonth = Math.ceil(d.getDate() / 7);
  return `${month}-${weekOfMonth}주차`;
}

function roundLabel(round) {
  return dateToWeekLabel(round.date);
}

// 개별시험지(그 학생 전용 회차)는 이름을 같이 표시. 아직 학생이 배정 안 됐으면(공용으로 막 들어온 경우) "미지정"으로 표시
function roundStudentTag(round) {
  if (round.studentId) {
    const s = state.students.find(x => x.id === round.studentId);
    return s ? ` · ${escapeHtml(s.name)} 개별` : ' · 개별(학생 삭제됨)';
  }
  if (round.individual) return ' · 개별시험지 (학생 미지정 — 채점할 때 선택)';
  return round.studentName ? ` · ${escapeHtml(round.studentName)} 개별` : '';
}

// 같은 날짜·학년에 진도가 다른 시험지가 여러 개일 수 있어, 이름(또는 첫 유형명)을 같이 보여줘 구분되게 함
function roundTopicHint(round) {
  if (round.title) return ` · ${escapeHtml(round.title)}`;
  if (!round.types || !round.types.length) return '';
  return ` · ${escapeHtml(round.types[0].name)}${round.types.length > 1 ? ' 외' : ''}`;
}

function populateRoundGradeFilter() {
  const sel = document.getElementById('roundGradeFilter');
  if (!sel) return;
  const prev = sel.value;
  const grades = Array.from(new Set(state.rounds.map(r => r.grade).filter(Boolean)));
  const order = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3'];
  grades.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  sel.innerHTML = '<option value="">학년 전체</option>' + grades.map(g => `<option value="${g}">${g}</option>`).join('');
  if (grades.includes(prev)) sel.value = prev;
}

// 유형 목록을 대단원별로 묶어서 대단원명은 한 번만 보여주고, 그 아래 유형들만 나열 (같은 단원 반복 표기 방지)
function renderTypesByUnit(types) {
  const groups = [];
  (types || []).forEach(t => {
    const major = t.unit ? t.unit.split(' - ')[0].trim() : '(단원 미지정)';
    let g = groups.find(g => g.major === major);
    if (!g) { g = { major, names: [] }; groups.push(g); }
    g.names.push(t.name);
  });
  return groups.map(g => `<div class="unit-group"><b>${escapeHtml(g.major)}</b><br>${g.names.map(escapeHtml).join(', ')}</div>`).join('');
}

function renderRounds() {
  const wrap = document.getElementById('roundListWrap');
  populateRoundGradeFilter();
  const gradeFilter = document.getElementById('roundGradeFilter')?.value || '';
  const sorted = [...state.rounds].sort((a, b) => a.date.localeCompare(b.date));
  const filtered = gradeFilter ? sorted.filter(r => r.grade === gradeFilter) : sorted;
  if (!filtered.length) {
    wrap.innerHTML = '<div class="empty-state">해당하는 회차가 없어요.</div>';
  } else {
    const rows = [...filtered].reverse().map(r => {
      const diff = computeRoundOverallDifficulty(r.id);
      const diffBadge = diff ? `<span class="badge ${diff.n >= 5 ? 'watch' : 'good'}"><span class="dot"></span>${diff.label}(${diff.n}) · 정답률 ${diff.pct}%</span>` : '<span class="field-hint">채점 전</span>';
      return `
      <tr>
        <td>${escapeHtml(r.grade || '-')} ${roundLabel(r)}${roundStudentTag(r)}</td>
        <td>${r.title ? escapeHtml(r.title) : '<span class="field-hint">—</span>'}</td>
        <td>${shortDate(r.date)}</td>
        <td>${r.total}문항</td>
        <td>${diffBadge}</td>
        <td>${renderTypesByUnit(r.types)}</td>
        <td>${r.examFile ? (r.examFile.dataUrl ? `<a href="${r.examFile.dataUrl}" target="_blank" rel="noopener">시험지 보기</a>` : escapeHtml(r.examFile.name)) : '—'}</td>
        <td class="row-actions">
          <button class="icon-btn" data-edit-round="${r.id}">수정</button>
          <button class="icon-btn" data-del-round="${r.id}">삭제</button>
        </td>
      </tr>`;
    }).join('');
    wrap.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>학년·회차</th><th>이름</th><th>날짜</th><th>문항수</th><th>전체 난이도</th><th>유형</th><th>시험지</th><th>관리</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  wrap.querySelectorAll('[data-del-round]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.delRound;
    if (!confirm('이 회차와 관련된 채점 기록도 함께 삭제됩니다. 계속할까요?')) return;
    state.rounds = state.rounds.filter(r => r.id !== id);
    state.results = state.results.filter(r => r.roundId !== id);
    saveState(); renderRounds(); populateSelects();
    toast('회차를 삭제했어요.');
  }));
  wrap.querySelectorAll('[data-edit-round]').forEach(b => b.addEventListener('click', () => {
    const r = state.rounds.find(x => x.id === b.dataset.editRound);
    if (!r) return;
    editingRoundId = r.id;
    pendingExamFile = r.examFile || null;
    populateFridaySelect(document.getElementById('roundDate'), r.date);
    document.getElementById('roundGrade').value = r.grade || '';
    document.getElementById('roundTotal').value = r.total;
    document.getElementById('roundTitle').value = r.title || '';
    document.getElementById('typeRows').innerHTML = '';
    r.types.forEach(t => addTypeRow(t.name, rangeToString(t.questions), t.unit || '', majorityCompetency(r, t)));
    updateCoverageHint();
    renderExamFileInfo();
    document.getElementById('manualFallback').open = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('addTypeRowBtn').addEventListener('click', () => addTypeRow());
  document.getElementById('roundTotal').addEventListener('input', updateCoverageHint);
  document.getElementById('roundGradeFilter').addEventListener('change', renderRounds);

  document.getElementById('examFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const titleInput = document.getElementById('roundTitle');
    if (titleInput && !titleInput.value.trim()) titleInput.value = file.name.replace(/\.[^.]+$/, '');
    if (file.size > MAX_EXAM_FILE_BYTES) {
      pendingExamFile = { name: file.name, dataUrl: null, size: file.size };
      renderExamFileInfo();
      toast('파일이 너무 커서 미리보기 저장은 생략했어요 (기록용으로 이름만 남겨요).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingExamFile = { name: file.name, dataUrl: reader.result, size: file.size };
      renderExamFileInfo();
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('mappingFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.types) || !data.types.length) throw new Error('형식 오류');
        if (data.date && !document.getElementById('roundDate').value) document.getElementById('roundDate').value = data.date;
        if (data.total) document.getElementById('roundTotal').value = data.total;
        document.getElementById('typeRows').innerHTML = '';
        data.types.forEach(t => addTypeRow(t.name || '', rangeToString(t.questions || []), t.unit || ''));
        pendingDifficulty = (data.difficulty && typeof data.difficulty === 'object') ? data.difficulty : null;
        pendingCompetency = (data.competency && typeof data.competency === 'object') ? data.competency : null;
        updateCoverageHint();
        document.getElementById('manualFallback').open = true;
        toast('AI 분석 결과를 불러왔어요. 확인 후 회차를 저장하세요.');
      } catch (err) {
        alert('올바른 유형 매핑 파일이 아니에요.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('roundForm').addEventListener('submit', e => {
    e.preventDefault();
    const date = document.getElementById('roundDate').value;
    const grade = document.getElementById('roundGrade').value;
    const total = parseInt(document.getElementById('roundTotal').value, 10) || 30;
    const title = document.getElementById('roundTitle').value.trim();
    if (!date) { toast('날짜를 선택해주세요.'); return; }
    if (!grade) { toast('학년을 선택해주세요.'); return; }
    const types = readTypeRows();
    if (!types.length) { toast('유형을 최소 1개 이상 입력해주세요.'); return; }
    const covered = new Set();
    types.forEach(t => t.questions.forEach(q => covered.add(q)));
    if (covered.size !== total) toast(`참고: ${covered.size}/${total} 문항만 유형에 배정되었어요.`);

    // 문항별 역량: AI/JSON이 준 값을 기본으로, 유형 행에서 직접 고른 값이 있으면 그 유형의 문항들에 덮어씀
    const rowOverrides = {};
    let hasRowOverride = false;
    types.forEach(t => { if (t.competency) { hasRowOverride = true; t.questions.forEach(q => { rowOverrides[q] = t.competency; }); } });
    const mergedCompetency = (pendingCompetency || hasRowOverride) ? { ...(pendingCompetency || {}), ...rowOverrides } : null;

    if (editingRoundId) {
      const r = state.rounds.find(x => x.id === editingRoundId);
      r.date = date; r.grade = grade; r.total = total; r.types = types; r.examFile = pendingExamFile || null; r.title = title || undefined;
      if (pendingDifficulty) r.difficulty = pendingDifficulty;
      if (mergedCompetency) r.competency = mergedCompetency;
    } else {
      state.rounds.push({ id: uid(), date, grade, total, types, title: title || undefined, examFile: pendingExamFile || null, difficulty: pendingDifficulty || undefined, competency: mergedCompetency || undefined });
    }
    saveState();
    pendingDifficulty = null;
    pendingCompetency = null;
    resetRoundForm();
    renderRounds(); populateSelects();
    toast('회차를 저장했어요.');
  });
});

/* ================= 채점 입력 ================= */

function populateSelects() {
  populateReportStudentSel();
  populateScoreGradeSel();
}

// 상단에서 고른 담당 선생님 학생만 남김 (선택 안 하면 전체 보기)
function populateReportStudentSel() {
  const sel = document.getElementById('reportStudentSel');
  const prev = sel.value;
  const eligible = filterByCurrentTeacher(state.students);
  sel.innerHTML = eligible.length
    ? eligible.map(s => `<option value="${s.id}">${escapeHtml(s.name)}${s.grade ? ' · ' + escapeHtml(s.grade) : ''}</option>`).join('')
    : `<option value="">${getCurrentTeacher() ? escapeHtml(getCurrentTeacher()) + ' 선생님 학생이 없어요' : '학생을 먼저 등록하세요'}</option>`;
  if (eligible.some(s => s.id === prev)) sel.value = prev;
}

// 학년 안에서 날짜별로 회차를 묶음 (같은 날짜에 진도가 달라 시험지가 여러 개여도 "N-M주차"는 하나로 묶여요)
function scoreRoundGroups(grade) {
  const rounds = state.rounds.filter(r => r.grade === grade);
  const dates = Array.from(new Set(rounds.map(r => r.date))).sort((a, b) => a.localeCompare(b));
  return dates.map(date => ({ date, label: dateToWeekLabel(date), rounds: rounds.filter(r => r.date === date) }));
}

function populateScoreGradeSel() {
  const sel = document.getElementById('scoreGradeSel');
  const prev = sel.value;
  const order = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3'];
  const roundGrades = Array.from(new Set(state.rounds.map(r => r.grade).filter(Boolean)));
  // 담당 선생님이 선택돼 있으면, 그 선생님 학생 중 아무도 없는 학년은 다운드롭에서 아예 뺌
  // (시험 응시 학년이 따로 설정된 학생은 examGrade 기준으로 매칭 — 위 채점 대상 매칭 로직과 동일)
  const myStudents = filterByCurrentTeacher(state.students);
  const grades = getCurrentTeacher()
    ? roundGrades.filter(g => myStudents.some(s => (s.examGrade || s.grade) === g))
    : roundGrades;
  grades.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  sel.innerHTML = grades.length
    ? grades.map(g => `<option value="${g}">${g}</option>`).join('')
    : '<option value="">회차를 먼저 등록하세요</option>';
  if (grades.includes(prev)) sel.value = prev;
  populateScoreRoundGroupSel();
}

function populateScoreRoundGroupSel() {
  const grade = document.getElementById('scoreGradeSel').value;
  const sel = document.getElementById('scoreRoundGroupSel');
  const prev = sel.value;
  const groups = grade ? scoreRoundGroups(grade) : [];
  sel.innerHTML = groups.length
    ? [...groups].reverse().map(g => `<option value="${g.date}">${g.label} (${shortDate(g.date)})</option>`).join('')
    : '<option value="">회차가 없어요</option>';
  if (groups.some(g => g.date === prev)) sel.value = prev;
  populateScoreExamSel();
}

// 같은 회차(날짜)에 시험지가 여러 개인 경우(진도가 다른 반) 어떤 시험지인지 고름
function populateScoreExamSel() {
  const grade = document.getElementById('scoreGradeSel').value;
  const date = document.getElementById('scoreRoundGroupSel').value;
  const sel = document.getElementById('scoreRoundSel');
  const prev = sel.value;
  const rounds = state.rounds.filter(r => r.grade === grade && r.date === date);
  sel.innerHTML = rounds.length
    ? rounds.map(r => `<option value="${r.id}">${r.title ? escapeHtml(r.title) : escapeHtml(r.types[0] ? r.types[0].name : '시험지') + (r.types.length > 1 ? ' 외' : '')}${roundStudentTag(r)}</option>`).join('')
    : '<option value="">시험지를 먼저 등록하세요</option>';
  if (rounds.some(r => r.id === prev)) sel.value = prev;
  populateScoreStudentSelect();
}

// 회차에 등록된 학년과 같은 학년의 학생만 채점 대상으로 보여줌 (학년별로 시험지가 다르므로 잘못 매칭되지 않게)
// 개별시험지(studentId 지정된 회차)는 그 학생 한 명만 보여줌
function populateScoreStudentSelect() {
  const round = state.rounds.find(r => r.id === document.getElementById('scoreRoundSel').value);
  const sel = document.getElementById('scoreStudentSel');
  const prev = sel.value;
  let eligible;
  if (round && round.studentId) {
    eligible = state.students.filter(s => s.id === round.studentId);
  } else {
    // 시험 응시 학년(examGrade)이 따로 설정된 학생은(예: 중3인데 고1 시험지를 보는 경우) 그 학년 기준으로 매칭
    eligible = round && round.grade ? state.students.filter(s => (s.examGrade || s.grade) === round.grade) : state.students;
  }
  eligible = filterByCurrentTeacher(eligible);
  sel.innerHTML = eligible.length
    ? eligible.map(s => `<option value="${s.id}">${escapeHtml(s.name)}${s.class ? ' · ' + escapeHtml(s.class) : ''}</option>`).join('')
    : `<option value="">${round && round.grade ? escapeHtml(round.grade) + ' 학생이 없어요' : '학생을 먼저 등록하세요'}</option>`;
  if (eligible.some(s => s.id === prev)) sel.value = prev;
}

function currentScoreRound() { return state.rounds.find(r => r.id === document.getElementById('scoreRoundSel').value); }
function currentScoreStudent() { return state.students.find(s => s.id === document.getElementById('scoreStudentSel').value); }

function typeForQuestion(round, q) {
  for (let i = 0; i < round.types.length; i++) if (round.types[i].questions.includes(q)) return { ...round.types[i], idx: i };
  return null;
}

// 반 정렬 순서 — STANDARD_CLASSES에 정의된 순서를 그대로 씀(대략 학년 진행 순서를 따름).
// 목록에 없는 반(개별시험지 등)은 맨 뒤로 보냄
function classSortKey(cls) {
  const idx = STANDARD_CLASSES.indexOf(cls);
  return idx === -1 ? STANDARD_CLASSES.length : idx;
}

// 학생별로 지금까지 채점된 시험지 현황을 보여주고, 회차별로(또는 학생 전체) 지울 수 있는 패널.
// 위에서 채점을 저장하면 그 학생이 자동으로 여기 나타남(따로 고를 필요 없음) — 반 순서대로 묶어서 보여줌.
// "완료" 버튼을 누른 학생은 진행중 목록에서 빠져서 맨 아래 완료 섹션으로 따로 모여, 아직 관리가
// 안 끝난 학생과 한눈에 구분됨(state.studentDone에 학생 id별로 표시 여부를 저장 — 회차와 무관한 수동 플래그).
function renderStudentResetPanel() {
  const wrap = document.getElementById('studentResetWrap');
  if (!wrap) return;
  if (!state.studentDone) state.studentDone = {};

  const scoredStudentIds = new Set(state.results.map(r => r.studentId));
  const allStudents = filterByCurrentTeacher(state.students)
    .filter(s => scoredStudentIds.has(s.id))
    .sort((a, b) => classSortKey(a.class) - classSortKey(b.class) || (a.class || '').localeCompare(b.class || '') || a.name.localeCompare(b.name, 'ko'));

  if (!allStudents.length) {
    wrap.innerHTML = '<div class="empty-state">위에서 채점을 저장하면 여기에 자동으로 나타나요.</div>';
    return;
  }

  const groupByClass = list => {
    const groups = [];
    list.forEach(s => {
      const cls = s.class || '(반 미지정)';
      let g = groups.find(g => g.cls === cls);
      if (!g) { g = { cls, students: [] }; groups.push(g); }
      g.students.push(s);
    });
    return groups;
  };

  const studentCardHTML = (student, done) => {
    const myResults = state.results
      .filter(r => r.studentId === student.id)
      .map(r => ({ result: r, round: state.rounds.find(x => x.id === r.roundId) }))
      .sort((a, b) => (a.round?.date || '').localeCompare(b.round?.date || ''));
    const rows = myResults.length ? myResults.map(({ result, round }) => {
      const label = round ? `${escapeHtml(round.grade || '')} ${roundLabel(round)}${roundTopicHint(round)}` : '(삭제된 회차)';
      const wrongTxt = result.wrong.length ? `오답 ${result.wrong.length}개 (${escapeHtml(rangeToString(result.wrong))})` : '전부 정답';
      return `<tr>
        <td>${label}</td>
        <td>${wrongTxt}</td>
        <td class="row-actions"><button class="icon-btn" data-clear-result="${result.id}" data-owner="${student.id}">취소</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="3">채점 기록이 없어요.</td></tr>`;
    return `<details class="manual-fallback${done ? ' is-done' : ''}">
      <summary>${done ? '✅ ' : ''}${escapeHtml(student.name)}${student.grade ? ' · ' + escapeHtml(student.grade) : ''} (${myResults.length}개 회차 채점됨)</summary>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>회차</th><th>채점(오답 문항)</th><th>관리</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="inline-form" style="margin:10px 0;">
        ${myResults.length ? `<button type="button" class="btn danger" data-clear-all="${student.id}">${escapeHtml(student.name)} 학생 전체 채점 초기화</button>` : ''}
        <button type="button" class="btn ${done ? 'ghost' : 'primary'}" data-toggle-done="${student.id}">${done ? '완료 취소' : '완료 표시'}</button>
      </div>
    </details>`;
  };

  const activeStudents = allStudents.filter(s => !state.studentDone[s.id]);
  const doneStudents = allStudents.filter(s => state.studentDone[s.id]);

  const activeHTML = groupByClass(activeStudents).map(g => `
    <div class="reset-class-group">
      <h3 class="reset-class-title">${escapeHtml(g.cls)}</h3>
      ${g.students.map(s => studentCardHTML(s, false)).join('')}
    </div>`).join('') || '<div class="empty-state">진행 중인 학생이 없어요 — 전부 완료 표시됐어요.</div>';

  const doneHTML = doneStudents.length ? `
    <div class="reset-done-section">
      <h3 class="reset-class-title reset-done-title">완료 (${doneStudents.length}명)</h3>
      ${doneStudents.map(s => studentCardHTML(s, true)).join('')}
    </div>` : '';

  wrap.innerHTML = activeHTML + doneHTML;

  wrap.querySelectorAll('[data-clear-result]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.clearResult;
    const student = state.students.find(s => s.id === b.dataset.owner);
    const result = state.results.find(r => r.id === id);
    if (!result || !student) return;
    const round = state.rounds.find(x => x.id === result.roundId);
    if (!confirm(`${student.name} 학생의 ${round ? roundLabel(round) : '이'} 채점 기록을 지울까요?`)) return;
    state.results = state.results.filter(r => r.id !== id);
    state.retests = state.retests.filter(rt => !(rt.studentId === student.id && rt.roundId === result.roundId));
    saveState();
    renderScoreTab();
    toast('채점 기록을 지웠어요.');
  }));

  wrap.querySelectorAll('[data-clear-all]').forEach(b => b.addEventListener('click', () => {
    const student = state.students.find(s => s.id === b.dataset.clearAll);
    if (!student) return;
    if (!confirm(`${student.name} 학생의 채점 기록을 전부 지울까요? 되돌릴 수 없어요.`)) return;
    state.results = state.results.filter(r => r.studentId !== student.id);
    state.retests = state.retests.filter(rt => rt.studentId !== student.id);
    saveState();
    renderScoreTab();
    toast('전체 채점 기록을 지웠어요.');
  }));

  wrap.querySelectorAll('[data-toggle-done]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.toggleDone;
    const student = state.students.find(s => s.id === id);
    if (!student) return;
    state.studentDone[id] = !state.studentDone[id];
    saveState();
    renderStudentResetPanel();
    toast(state.studentDone[id] ? `${student.name} 학생을 완료로 표시했어요.` : `${student.name} 학생을 다시 진행중으로 옮겼어요.`);
  }));
}

function renderScoreTab() {
  renderStudentResetPanel();
  const round = currentScoreRound();
  const wrap = document.getElementById('scoreGridWrap');
  if (!round) {
    wrap.innerHTML = '<div class="empty-state">회차와 학생을 먼저 선택하세요.</div>';
    return;
  }
  const student = currentScoreStudent();
  const existing = student ? state.results.find(r => r.studentId === student.id && r.roundId === round.id) : null;
  const wrongSet = new Set(existing ? existing.wrong : []);

  let btns = '';
  for (let q = 1; q <= round.total; q++) {
    const t = typeForQuestion(round, q);
    const style = t ? `box-shadow: inset 3px 0 0 ${t.color};` : '';
    btns += `<button type="button" class="qbtn${wrongSet.has(q) ? ' wrong' : ''}" style="${style}" data-q="${q}">${q}</button>`;
  }
  const legend = round.types.map((t, i) => `<span class="legend-item"><span class="type-swatch" style="background:${TYPE_COLORS[i % TYPE_COLORS.length]}"></span>${escapeHtml(t.name)}</span>`).join('');

  wrap.innerHTML = `<div class="score-grid">${btns}</div><div class="type-legend">${legend}</div>`;
  // "채점 저장" 버튼을 안 눌러도, 번호 하나 클릭할 때마다 바로바로 저장해서 다른 회차/학생으로
  // 넘어가도 방금 클릭한 게 날아가지 않게 함(빠른입력 Enter 저장과 동일한 방식)
  wrap.querySelectorAll('.qbtn').forEach(b => b.addEventListener('click', () => {
    b.classList.toggle('wrong');
    syncQuickInputFromGrid();
    updateScoreSummary();
    saveCurrentScore(true);
  }));
  document.getElementById('quickWrongInput').value = rangeToString(Array.from(wrongSet));
  updateScoreSummary();
}

function syncQuickInputFromGrid() {
  const wrong = Array.from(document.querySelectorAll('.qbtn.wrong')).map(b => parseInt(b.dataset.q, 10));
  document.getElementById('quickWrongInput').value = rangeToString(wrong);
}

function updateScoreSummary() {
  const round = currentScoreRound();
  if (!round) { document.getElementById('scoreSummary').textContent = ''; return; }
  const wrongCount = document.querySelectorAll('.qbtn.wrong').length;
  const correct = round.total - wrongCount;
  const pct = round.total ? Math.round((correct / round.total) * 100) : 0;
  document.getElementById('scoreSummary').textContent = `정답 ${correct} / ${round.total} (${pct}%)`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('scoreGradeSel').addEventListener('change', () => { populateScoreRoundGroupSel(); renderScoreTab(); });
  document.getElementById('scoreRoundGroupSel').addEventListener('change', () => { populateScoreExamSel(); renderScoreTab(); });
  document.getElementById('scoreRoundSel').addEventListener('change', () => { populateScoreStudentSelect(); renderScoreTab(); });
  document.getElementById('scoreStudentSel').addEventListener('change', renderScoreTab);

  // (주의) 예전엔 여기에 'input' 이벤트로 타이핑할 때마다 그리드 전체를 현재 입력값 기준으로
  // 다시 그리는 실시간 미리보기가 있었는데, 그게 "번호 하나 입력 → Enter" 누적 입력과 충돌해서
  // 다음 번호를 타이핑하는 순간 방금 Enter로 찍은 이전 번호가 지워지는 버그가 있었음 — 그래서 제거함.
  // 빠른입력 칸에 문항 번호를 쓰고 Enter를 누르면 그 문항을 바로 오답으로 지정하고 즉시 저장함
  // (Enter마다 저장하는 방식이라 번호 하나만 딱 입력해도 되고, 기존에 표시된 오답은 그대로 유지됨)
  document.getElementById('quickWrongInput').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const round = currentScoreRound(), student = currentScoreStudent();
    if (!round || !student) { toast('학년 · 회차 · 학생을 먼저 선택해주세요.'); return; }
    const nums = parseRange(e.target.value);
    if (!nums.length) { e.target.value = ''; return; }
    nums.forEach(q => {
      if (q < 1 || q > round.total) return;
      const btn = document.querySelector(`#scoreGridWrap .qbtn[data-q="${q}"]`);
      if (btn) btn.classList.add('wrong');
    });
    e.target.value = '';
    updateScoreSummary();
    saveCurrentScore(true);
  });

  document.getElementById('clearScoreBtn').addEventListener('click', () => {
    document.querySelectorAll('.qbtn.wrong').forEach(b => b.classList.remove('wrong'));
    document.getElementById('quickWrongInput').value = '';
    updateScoreSummary();
  });

  document.getElementById('saveScoreBtn').addEventListener('click', () => saveCurrentScore());
});

// 채점 그리드의 현재 상태를 저장 — "채점 저장" 버튼과 빠른입력 Enter 저장이 공용으로 씀.
// silent가 true면 토스트를 안 띄움(Enter를 연달아 눌러도 알림이 스팸처럼 뜨지 않게)
function saveCurrentScore(silent) {
  const round = currentScoreRound(), student = currentScoreStudent();
  if (!round || !student) { if (!silent) toast('회차와 학생을 선택해주세요.'); return false; }
  // 개별시험지인데 아직 이 학생으로 배정되지 않았으면(처음 채점하는 거면) 지금 배정을 확정함
  if (round.individual && !round.studentId) round.studentId = student.id;
  const wrong = [...new Set(Array.from(document.querySelectorAll('.qbtn.wrong')).map(b => parseInt(b.dataset.q, 10)))];
  const existing = state.results.find(r => r.studentId === student.id && r.roundId === round.id);
  if (existing) existing.wrong = wrong;
  else state.results.push({ id: uid(), studentId: student.id, roundId: round.id, wrong });
  saveState();
  renderRounds(); populateSelects();
  // 학생별 채점 현황 패널을 바로 갱신해서, 저장 후 시간차 없이 곧바로 반영되게 함
  renderStudentResetPanel();
  if (!silent) toast(`${student.name} 학생의 채점을 저장했어요.`);
  return true;
}

/* ================= 재시험 ================= */

// 재시험은 새 유형표가 필요 없음 — 원래 회차에서 틀린 문항 번호를 그대로 재사용해서
// "쌍둥이문제를 다시 풀었을 때도 틀렸는지"만 기록. 유형·단원·난이도·역량은 원래 회차 것을 그대로 물려받음.

// 학생을 먼저 고르고, 그 학생이 오답을 가진 회차만 골라서 재시험을 채점하는 흐름 — 이름 가나다순 정렬로
// 목록 순서가 매번 안정적이게 함(<select>는 첫 옵션이 기본 선택되므로 맨 처음 학생이 바로 선택됨)
function populateRetestStudentSelect() {
  const sel = document.getElementById('retestStudentSel');
  const currentTeacher = getCurrentTeacher();
  const studentIdsWithWrong = new Set(state.results.filter(r => r.wrong.length).map(r => r.studentId));
  const students = state.students
    .filter(s => studentIdsWithWrong.has(s.id) && (!currentTeacher || s.teacher === currentTeacher))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  sel.innerHTML = students.length
    ? students.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')
    : '<option value="">오답이 있는 학생이 없어요</option>';
}

// 선택된 학생이 오답을 가진 회차만 최신순으로 보여줌
function populateRetestRoundSelect() {
  const studentId = document.getElementById('retestStudentSel').value;
  const sel = document.getElementById('retestRoundSel');
  const withWrong = state.results
    .filter(r => r.studentId === studentId && r.wrong.length)
    .map(r => ({ r, round: state.rounds.find(x => x.id === r.roundId) }))
    .filter(x => x.round)
    .sort((a, b) => b.round.date.localeCompare(a.round.date));
  sel.innerHTML = withWrong.length
    ? withWrong.map(({ r, round }) => `<option value="${round.id}">${escapeHtml(round.grade || '')} · ${roundLabel(round)} (${shortDate(round.date)}) · 오답 ${r.wrong.length}개</option>`).join('')
    : '<option value="">오답이 있는 회차가 없어요</option>';
}

function currentRetestRound() { return state.rounds.find(r => r.id === document.getElementById('retestRoundSel').value); }
function currentRetestStudent() { return state.students.find(s => s.id === document.getElementById('retestStudentSel').value); }

function renderRetestTab() {
  populateRetestStudentSelect();
  populateRetestRoundSelect();
  populateFridaySelect(document.getElementById('retestDate'), document.getElementById('retestDate').value || undefined);
  renderRetestGrid();
  renderRetestList();
}

function renderRetestGrid() {
  const wrap = document.getElementById('retestGridWrap');
  const round = currentRetestRound();
  const student = currentRetestStudent();
  if (!round || !student) { wrap.innerHTML = '<div class="empty-state">회차와 학생을 선택하세요.</div>'; updateRetestSummary(); return; }
  const result = state.results.find(r => r.studentId === student.id && r.roundId === round.id);
  const originalWrong = result ? [...result.wrong].sort((a, b) => a - b) : [];
  if (!originalWrong.length) { wrap.innerHTML = '<div class="empty-state">이 학생은 이 회차에 틀린 문항이 없어요.</div>'; updateRetestSummary(); return; }
  const legend = round.types.map((t, i) => `<span class="legend-item"><span class="type-swatch" style="background:${TYPE_COLORS[i % TYPE_COLORS.length]}"></span>${escapeHtml(t.name)}</span>`).join('');
  // 재시험지는 오답 문항만 다시 1번부터 순서대로 인쇄되므로, 버튼도 그 순서(1,2,3…)로 크게 보여주고
  // 원본 시험지 문항 번호는 괄호 안에 작게만 곁들임 — 채점할 때 재시험지에 적힌 번호를 그대로 누르면 됨
  const btns = originalWrong.map((q, i) => {
    const t = typeForQuestion(round, q);
    const style = t ? `box-shadow: inset 3px 0 0 ${t.color};` : '';
    return `<button type="button" class="qbtn qbtn-retest" style="${style}" data-q="${q}" data-idx="${i + 1}">${i + 1}<span class="qbtn-orig">(${q})</span></button>`;
  }).join('');
  wrap.innerHTML = `<p class="card-sub" style="margin-top:10px;">원래 오답 ${originalWrong.length}문항 · 번호는 재시험지에 적힌 순서(1,2,3…)예요 — 괄호 안 작은 숫자가 원본 문항 번호. 재시험에서도 틀린 문항만 클릭하세요 (기본값: 전부 정답)</p><div class="score-grid">${btns}</div><div class="type-legend">${legend}</div>`;
  wrap.querySelectorAll('.qbtn').forEach(b => b.addEventListener('click', () => { b.classList.toggle('wrong'); updateRetestSummary(); }));
  updateRetestSummary();
}

function updateRetestSummary() {
  const total = document.querySelectorAll('#retestGridWrap .qbtn').length;
  const stillWrong = document.querySelectorAll('#retestGridWrap .qbtn.wrong').length;
  const summary = document.getElementById('retestSummary');
  if (!total) { summary.textContent = ''; return; }
  const corrected = total - stillWrong;
  summary.textContent = `정답 전환 ${corrected} / ${total} (${Math.round((corrected / total) * 100)}%)`;
}

// 학생별 채점 현황과 같은 형태 — 재시험 기록이 있는 학생을 반 순서대로 묶고, 학생 한 명의 재시험은
// 하나의 접이식 카드 안에 전부 모아서 보여줌 (기록이 여러 회차에 걸쳐 있어도 학생별로 흩어지지 않게)
function renderRetestList() {
  const wrap = document.getElementById('retestListWrap');
  const roundLabelById = id => { const r = state.rounds.find(x => x.id === id); return r ? roundLabel(r) : '(삭제된 회차)'; };

  const retestStudentIds = new Set(state.retests.map(rt => rt.studentId));
  const students = filterByCurrentTeacher(state.students)
    .filter(s => retestStudentIds.has(s.id))
    .sort((a, b) => classSortKey(a.class) - classSortKey(b.class) || (a.class || '').localeCompare(b.class || '') || a.name.localeCompare(b.name, 'ko'));

  if (!students.length) { wrap.innerHTML = '<div class="empty-state">아직 재시험 기록이 없어요.</div>'; return; }

  const groups = [];
  students.forEach(s => {
    const cls = s.class || '(반 미지정)';
    let g = groups.find(g => g.cls === cls);
    if (!g) { g = { cls, students: [] }; groups.push(g); }
    g.students.push(s);
  });

  wrap.innerHTML = groups.map(g => `
    <div class="reset-class-group">
      <h3 class="reset-class-title">${escapeHtml(g.cls)}</h3>
      ${g.students.map(student => {
        const myRetests = state.retests.filter(rt => rt.studentId === student.id).sort((a, b) => b.date.localeCompare(a.date));
        const rows = myRetests.map(rt => {
          const result = state.results.find(r => r.studentId === rt.studentId && r.roundId === rt.roundId);
          const originalCount = result ? result.wrong.length : rt.stillWrong.length;
          const corrected = originalCount - rt.stillWrong.length;
          const pct = originalCount ? Math.round((corrected / originalCount) * 100) : 0;
          const stillWrongTxt = rt.stillWrong.length ? `아직 틀림: ${escapeHtml(rangeToString(rt.stillWrong))}` : '전부 정답 전환';
          return `<tr>
            <td>${roundLabelById(rt.roundId)}</td>
            <td>${shortDate(rt.date)}</td>
            <td class="tnum">${corrected} / ${originalCount} (${pct}%)<br><span class="field-hint">${stillWrongTxt}</span></td>
            <td class="row-actions"><button class="icon-btn" data-del-retest="${rt.id}">삭제</button></td>
          </tr>`;
        }).join('');
        return `<details class="manual-fallback">
          <summary>${escapeHtml(student.name)}${student.grade ? ' · ' + escapeHtml(student.grade) : ''} (재시험 ${myRetests.length}건)</summary>
          <div class="table-wrap"><table class="data-table"><thead><tr><th>회차</th><th>재시험일</th><th>정답 전환</th><th>관리</th></tr></thead><tbody>${rows}</tbody></table></div>
        </details>`;
      }).join('')}
    </div>`).join('');

  wrap.querySelectorAll('[data-del-retest]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('이 재시험 기록을 삭제할까요?')) return;
    state.retests = state.retests.filter(rt => rt.id !== b.dataset.delRetest);
    saveState(); renderRetestList();
    toast('삭제했어요.');
  }));
}

// 재시험 결과 저장 — "재시험 결과 저장" 버튼과 빠른입력 Enter 저장이 공용으로 씀.
// 같은 학생 · 같은 회차 기록이 이미 있으면 새로 쌓지 않고 그 기록을 덮어씀(중복 방지)
function saveCurrentRetest(silent) {
  const round = currentRetestRound(), student = currentRetestStudent();
  if (!round || !student) { if (!silent) toast('회차와 학생을 선택해주세요.'); return false; }
  const stillWrong = [...new Set(Array.from(document.querySelectorAll('#retestGridWrap .qbtn.wrong')).map(b => parseInt(b.dataset.q, 10)))];
  const date = document.getElementById('retestDate').value || new Date().toISOString().slice(0, 10);
  const existing = state.retests.find(rt => rt.studentId === student.id && rt.roundId === round.id);
  if (existing) { existing.date = date; existing.stillWrong = stillWrong; }
  else state.retests.push({ id: uid(), studentId: student.id, roundId: round.id, date, stillWrong });
  saveState();
  renderRetestList();
  if (!silent) toast(`${student.name} 학생의 재시험 결과를 저장했어요.`);
  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('retestStudentSel').addEventListener('change', () => { populateRetestRoundSelect(); renderRetestGrid(); });
  document.getElementById('retestRoundSel').addEventListener('change', renderRetestGrid);
  document.getElementById('saveRetestBtn').addEventListener('click', () => saveCurrentRetest());

  // 여전히 틀린 문항 번호를 쓰고 Enter를 누르면 바로 그 문항을 체크하고 즉시 저장함
  // 버튼이 재시험지 순서(1,2,3…)로 표시되므로, 여기 입력하는 번호도 원본 문항 번호가 아니라 그 순서 번호(data-idx)임
  document.getElementById('retestQuickWrongInput').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const round = currentRetestRound(), student = currentRetestStudent();
    if (!round || !student) { toast('회차와 학생을 먼저 선택해주세요.'); return; }
    const nums = parseRange(e.target.value);
    if (!nums.length) { e.target.value = ''; return; }
    let unknown = [];
    nums.forEach(idx => {
      const btn = document.querySelector(`#retestGridWrap .qbtn[data-idx="${idx}"]`);
      if (btn) btn.classList.add('wrong');
      else unknown.push(idx);
    });
    e.target.value = '';
    updateRetestSummary();
    saveCurrentRetest(true);
    if (unknown.length) toast(`${unknown.join(',')}번은 재시험지 문항 번호 범위를 벗어나서 반영 안 됐어요.`);
  });
});

/* ================= 리포트 ================= */

function gradeTier(pct) {
  if (pct >= 90) return { n: 1, label: '1등급' };
  if (pct >= 80) return { n: 2, label: '2등급' };
  if (pct >= 70) return { n: 3, label: '3등급' };
  if (pct >= 50) return { n: 4, label: '4등급' };
  return { n: 5, label: '5등급' };
}

// 선생님이 예상 등급을 직접 수정해둔 게 있으면 그걸 우선 사용
function displayGradeTier(studentId, pct) {
  const override = state.gradeOverrides[studentId];
  if (override) return { n: override, label: `${override}등급` };
  return gradeTier(pct);
}

// 학생이 실제로 채점 기록을 가진 회차만, 날짜순으로 반환 (리포트 기간 선택 드롭다운에 사용)
function studentScoredRounds(studentId) {
  const ascRounds = [...state.rounds].sort((a, b) => a.date.localeCompare(b.date));
  return ascRounds
    .map(r => ({ round: r, label: roundLabel(r), result: state.results.find(x => x.studentId === studentId && x.roundId === r.id) }))
    .filter(x => x.result);
}

function computeStudentReport(studentId, fromRoundId, toRoundId) {
  const student = state.students.find(s => s.id === studentId);
  if (!student) return null;
  const withResult = studentScoredRounds(studentId);
  let fromIdx = fromRoundId ? withResult.findIndex(x => x.round.id === fromRoundId) : 0;
  let toIdx = toRoundId ? withResult.findIndex(x => x.round.id === toRoundId) : withResult.length - 1;
  if (fromIdx === -1) fromIdx = 0;
  if (toIdx === -1) toIdx = withResult.length - 1;
  if (fromIdx > toIdx) { const t = fromIdx; fromIdx = toIdx; toIdx = t; }
  const windowed = withResult.slice(fromIdx, toIdx + 1);
  const roundIds = windowed.map(x => x.round.id);

  const points = windowed.map(x => {
    const wrongSet = new Set(x.result.wrong);
    const correct = x.round.total - wrongSet.size;
    const pct = x.round.total ? Math.round((correct / x.round.total) * 100) : 0;
    return { label: x.label, date: shortDate(x.round.date), pct, correct, total: x.round.total, roundId: x.round.id };
  });

  // 유형명이 아니라 중단원 기준으로 묶음 (typeGroupKey) — 유형명 그대로 묶으면 주차마다 이름이 조금씩
  // 달라 붙어서 너무 잘게 쪼개지고, 대단원까지만 묶으면 반대로 너무 뭉뚱그려져서 중단원 단위로 묶음
  const groupKeys = [];
  windowed.forEach(x => x.round.types.forEach(t => { const key = typeGroupKey(t); if (!groupKeys.includes(key)) groupKeys.push(key); }));
  // 항상 "단원 순서대로" 보이도록 정렬 — 대단원이 먼저 기준이 되고(같은 대단원끼리는 반드시 붙어서 나오고),
  // 그 안에서는 중단원이 교육과정상 처음 나간 날짜 순. 복습 주차에 새 소단원이 섞여 들어와도 순서가 안 흔들림
  const majorOrder = buildUnitOrderMap(t => t.unit ? t.unit.split(' - ')[0].trim() : null);
  const typeOrder = buildUnitOrderMap(typeGroupKey);
  groupKeys.sort((a, b) => {
    const majorCmp = (majorOrder[a.split(' - ')[0]] || '9999').localeCompare(majorOrder[b.split(' - ')[0]] || '9999');
    if (majorCmp !== 0) return majorCmp;
    return (typeOrder[a] || '9999').localeCompare(typeOrder[b] || '9999');
  });

  const typeStats = groupKeys.map((key, i) => {
    const series = windowed.map(x => {
      const matching = x.round.types.filter(tt => typeGroupKey(tt) === key);
      const questions = matching.flatMap(tt => tt.questions);
      if (!questions.length) return null;
      const wrongSet = new Set(x.result.wrong);
      const wrongInType = questions.filter(q => wrongSet.has(q)).length;
      const pct = Math.round(((questions.length - wrongInType) / questions.length) * 100);
      return pct;
    });
    const vals = series.filter(v => v !== null);
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    const first = vals.length ? vals[0] : null;
    const last = vals.length ? vals[vals.length - 1] : null;
    const delta = (first !== null && last !== null) ? last - first : null;
    const classAvg = computeClassAverageByType(roundIds, key, studentId);
    const { title, caption } = typeGroupLabel(key);
    return { name: title, unit: caption, color: TYPE_COLORS[i % TYPE_COLORS.length], series, avg, first, last, delta, classAvg };
  });

  // weighted overall accuracy across the window (more correct than averaging per-round %)
  const totalCorrect = points.reduce((a, p) => a + p.correct, 0);
  const totalQ = points.reduce((a, p) => a + p.total, 0);
  const overallPct = totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0;
  const classAvgOverall = computeClassAverageOverall(roundIds, studentId);

  // difficulty (optional; only present if the round data was tagged via AI-import)
  const diff = computeDifficultyBreakdown(windowed);

  // curriculum-unit rollup (optional; only present once types carry a `unit`)
  const unitBreakdown = computeUnitBreakdown(windowed);

  // competency rollup — 2022개정 5대 역량 5축 고정. 태그된 적 없는 역량은 value:null("데이터 없음")로 구분함
  const compRaw = computeCompetencyBreakdown(windowed);
  const competencyStats = Object.values(compRaw).map(c => ({ label: COMPETENCY_LABELS[c.competency] || c.competency, value: c.total ? Math.round((c.correct / c.total) * 100) : null }));
  const competencyHasAnyData = competencyStats.some(c => c.value !== null);

  // 재시험 (원래 회차의 오답 문항을 쌍둥이문제로 재검사한 기록) — 메인 정답률과는 별도로 집계
  const retest = computeRetestSummary(studentId, points);

  return { student, points, typeStats, overallPct, classAvgOverall, difficulty: diff, unitBreakdown, competencyStats, competencyHasAnyData, retest };
}

function computeRetestSummary(studentId, points) {
  const items = [];
  let sumOriginal = 0, sumStillWrong = 0;
  points.forEach(p => {
    const result = state.results.find(r => r.studentId === studentId && r.roundId === p.roundId);
    const originalWrong = result ? result.wrong.length : 0;
    if (!originalWrong) return;
    const attempts = state.retests.filter(rt => rt.studentId === studentId && rt.roundId === p.roundId).sort((a, b) => a.date.localeCompare(b.date));
    // 재시험을 따로 채점 안 한(기록이 없는) 회차는 전부 맞은 것으로 자동 처리함
    const auto = !attempts.length;
    const stillWrongCount = auto ? 0 : attempts[attempts.length - 1].stillWrong.length;
    const date = auto ? null : attempts[attempts.length - 1].date;
    const corrected = originalWrong - stillWrongCount;
    sumOriginal += originalWrong;
    sumStillWrong += stillWrongCount;
    items.push({ label: p.label, date, attempts: attempts.length, originalWrong, corrected, stillWrong: stillWrongCount, pct: Math.round((corrected / originalWrong) * 100), auto });
  });
  const overallPct = sumOriginal ? Math.round(((sumOriginal - sumStillWrong) / sumOriginal) * 100) : null;
  return { items, overallPct, sumOriginal, sumCorrected: sumOriginal - sumStillWrong };
}

// 유형(type)을 중단원 단위로 묶기 위한 키 — unit이 "대단원 - 중단원 - 소단원"(3단계)이면 대단원+중단원까지,
// 옛날 방식인 "대단원 - 소단원"(2단계)나 단원 미지정이면 있는 만큼만 씀.
// 소단원(또는 유형명) 그대로 묶으면 주차마다 이름이 조금씩 달라 붙어서(예: "접선의 방정식" / "접선의 기울기와
// 방정식") 카드가 너무 잘게 쪼개지고, 대단원까지만 묶으면 반대로 너무 뭉뚱그려져서 중단원 단위로 묶음
function typeGroupKey(type) {
  if (type.unit) {
    const parts = type.unit.split(' - ').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3) return parts.slice(0, 2).join(' - ');
    if (parts.length >= 1) return parts[0];
  }
  return type.name;
}

// 그룹 키에서 카드 제목(중단원, 없으면 대단원)과 캡션(대단원, 중단원이 있을 때만)을 분리함
function typeGroupLabel(groupKey) {
  const parts = groupKey.split(' - ');
  return parts.length >= 2 ? { title: parts[1], caption: parts[0] } : { title: parts[0], caption: '' };
}

// 이 학원 전체 회차(이 학생 것만이 아니라 전부)를 날짜순으로 훑어서, keyFn으로 묶었을 때 그 묶음이
// "처음 나온 날짜"를 기록함 — 이 날짜 순으로 정렬하면 복습 주차가 있어도 항상 원래 교육과정이 나간
// 순서(단원 순서)대로 보이고, 유형별 정답률 · 단원별 학습성과 · 회차별 상세 기록이 서로 같은 순서를 씀
function buildUnitOrderMap(keyFn) {
  const map = {};
  [...state.rounds].sort((a, b) => a.date.localeCompare(b.date)).forEach(r => {
    r.types.forEach(t => {
      const key = keyFn(t);
      if (key && !(key in map)) map[key] = r.date;
    });
  });
  return map;
}

// 소단원까지 너무 잘게 쪼개지지 않게, 대단원(" - " 앞부분) 기준으로 묶어서 집계
function computeUnitBreakdown(windowed) {
  const map = {};
  windowed.forEach(x => {
    const wrongSet = new Set(x.result.wrong);
    x.round.types.forEach(t => {
      if (!t.unit || !t.questions.length) return;
      const major = t.unit.split(' - ')[0].trim();
      const wrongInType = t.questions.filter(q => wrongSet.has(q)).length;
      if (!map[major]) map[major] = { unit: major, total: 0, correct: 0 };
      map[major].total += t.questions.length;
      map[major].correct += t.questions.length - wrongInType;
    });
  });
  const unitOrder = buildUnitOrderMap(t => t.unit ? t.unit.split(' - ')[0].trim() : null);
  return Object.values(map).map(u => ({ ...u, pct: u.total ? Math.round((u.correct / u.total) * 100) : 0 })).sort((a, b) => (unitOrder[a.unit] || '9999').localeCompare(unitOrder[b.unit] || '9999'));
}

// 역량은 문항 단위(round.competency: {문항번호: 역량})로 집계 — 같은 유형 안에서도 문항마다 다를 수 있음
// 2022개정 5대 역량을 항상 다 보여주되(레이더는 5축 고정), 한 번도 안 태그된 역량은 total=0으로 남겨둬서
// "안 풀어본 것"과 "못 푼 것"을 구분함 (호출부에서 total===0이면 0%가 아니라 "데이터 없음"으로 표시)
function computeCompetencyBreakdown(windowed) {
  const map = {};
  Object.keys(COMPETENCY_LABELS).forEach(c => { map[c] = { competency: c, total: 0, correct: 0 }; });
  windowed.forEach(x => {
    const compMap = x.round.competency;
    if (!compMap) return;
    const wrongSet = new Set(x.result.wrong);
    for (let q = 1; q <= x.round.total; q++) {
      const c = compMap[q] ?? compMap[String(q)];
      if (!c || !map[c]) continue;
      map[c].total += 1;
      if (!wrongSet.has(q)) map[c].correct += 1;
    }
  });
  return map;
}

/* class/원내 comparison — computed from this app's own local data, never invented "national" figures */
function computeClassAverageOverall(roundIds, excludeStudentId) {
  let correct = 0, total = 0;
  state.results.filter(r => roundIds.includes(r.roundId) && r.studentId !== excludeStudentId).forEach(r => {
    const round = state.rounds.find(x => x.id === r.roundId);
    if (!round) return;
    correct += round.total - new Set(r.wrong).size;
    total += round.total;
  });
  return total ? Math.round((correct / total) * 100) : null;
}

function computeClassAverageByType(roundIds, groupKey, excludeStudentId) {
  let correct = 0, total = 0;
  state.results.filter(r => roundIds.includes(r.roundId) && r.studentId !== excludeStudentId).forEach(r => {
    const round = state.rounds.find(x => x.id === r.roundId);
    if (!round) return;
    const questions = round.types.filter(tt => typeGroupKey(tt) === groupKey).flatMap(tt => tt.questions);
    if (!questions.length) return;
    const wrongSet = new Set(r.wrong);
    const wrongInType = questions.filter(q => wrongSet.has(q)).length;
    correct += questions.length - wrongInType;
    total += questions.length;
  });
  return total ? Math.round((correct / total) * 100) : null;
}

function computeDifficultyBreakdown(windowed) {
  let sumAll = 0, cntAll = 0, sumCorrect = 0, cntCorrect = 0, sumWrong = 0, cntWrong = 0;
  windowed.forEach(x => {
    const diffMap = x.round.difficulty;
    if (!diffMap) return;
    const wrongSet = new Set(x.result.wrong);
    for (let q = 1; q <= x.round.total; q++) {
      const d = diffMap[q] ?? diffMap[String(q)];
      if (!d) continue;
      sumAll += d; cntAll++;
      if (wrongSet.has(q)) { sumWrong += d; cntWrong++; } else { sumCorrect += d; cntCorrect++; }
    }
  });
  if (!cntAll) return null;
  return {
    avgAll: +(sumAll / cntAll).toFixed(1),
    avgCorrect: cntCorrect ? +(sumCorrect / cntCorrect).toFixed(1) : null,
    avgWrong: cntWrong ? +(sumWrong / cntWrong).toFixed(1) : null,
  };
}

function mapY(v, top, bottom) { return top + (100 - v) / 100 * (bottom - top); }

// plotH: 그래프 그림 영역(0%~100% 축)의 세로 폭. PDF 내보낼 때 선생님 의견 길이에 맞춰
// 이 값을 줄여서 그래프를 플렉서블하게 납작하게 그릴 수 있음 (기본값 194 = 기존과 동일한 모양)
function buildMainChartSVG(points, plotH = 194) {
  const top = 30, bottom = top + plotH, x0 = 44, x1 = 620, w = 640, h = bottom + 38;
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `<svg viewBox="0 0 ${w} 140" role="img"><text x="${w/2}" y="60" text-anchor="middle" class="axis-label" font-size="13">${escapeHtml(p.label)} 정답률</text>
      <text x="${w/2}" y="100" text-anchor="middle" fill="var(--accent)" font-size="34" font-weight="700" font-family="Noto Sans KR">${p.pct}%</text></svg>`;
  }
  const n = points.length;
  const xs = points.map((_, i) => x0 + i * (x1 - x0) / (n - 1));
  const ys = points.map(p => mapY(p.pct, top, bottom));
  const linePts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' L');
  const areaPts = `M${xs[0]},${ys[0]} L${linePts.split('L').slice(1).join('L')} L${xs[n-1]},${bottom} L${xs[0]},${bottom} Z`;

  let dots = '';
  points.forEach((p, i) => {
    const always = (i === 0 || i === n - 1) ? ' always' : '';
    const labelY = ys[i] - 16 < 14 ? ys[i] + 22 : ys[i] - 16;
    dots += `<g class="pt-group">
      <circle class="pt" cx="${xs[i]}" cy="${ys[i]}" r="4"/>
      <circle class="pt-hit" cx="${xs[i]}" cy="${ys[i]}" r="14"/>
      <text class="pt-label${always}" x="${xs[i]}" y="${labelY}" text-anchor="middle">${p.pct}%</text>
    </g>`;
  });

  let weekLabels = '';
  points.forEach((p, i) => {
    weekLabels += `<text class="week-label" x="${xs[i]}" y="${bottom + 22}" text-anchor="middle">${escapeHtml(p.label)}<tspan x="${xs[i]}" dy="13">${escapeHtml(p.date)}</tspan></text>`;
  });

  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="전체 정답률 추이">
    <line class="gridline" x1="${x0}" y1="${mapY(100,top,bottom)}" x2="${x1}" y2="${mapY(100,top,bottom)}"/><text class="axis-label" x="${x0-6}" y="${mapY(100,top,bottom)+4}" text-anchor="end">100%</text>
    <line class="gridline" x1="${x0}" y1="${mapY(75,top,bottom)}" x2="${x1}" y2="${mapY(75,top,bottom)}"/><text class="axis-label" x="${x0-6}" y="${mapY(75,top,bottom)+4}" text-anchor="end">75%</text>
    <line class="gridline" x1="${x0}" y1="${mapY(50,top,bottom)}" x2="${x1}" y2="${mapY(50,top,bottom)}"/><text class="axis-label" x="${x0-6}" y="${mapY(50,top,bottom)+4}" text-anchor="end">50%</text>
    <line class="gridline" x1="${x0}" y1="${mapY(25,top,bottom)}" x2="${x1}" y2="${mapY(25,top,bottom)}"/><text class="axis-label" x="${x0-6}" y="${mapY(25,top,bottom)+4}" text-anchor="end">25%</text>
    <line class="gridline" x1="${x0}" y1="${bottom}" x2="${x1}" y2="${bottom}" stroke="var(--baseline)"/><text class="axis-label" x="${x0-6}" y="${bottom+4}" text-anchor="end">0%</text>
    <path class="area-fill" d="${areaPts}"/>
    <path class="trend-line" d="M${linePts}"/>
    ${dots}
    ${weekLabels}
  </svg>`;
}

function buildBarRow(pct, color) {
  return `<div class="bar-track">
    <div class="bar-fill" style="width:${pct}%; background:${color}"></div>
  </div>`;
}

// items[i].value가 null이면 "그 역량이 태그된 문항이 아직 없다"는 뜻 — 0%(못 품)로 오해되지 않도록
// 폴리곤 정점은 나머지 역량들의 평균 위치에 두고(모양이 이상하게 찌그러지지 않게), 라벨은 %가 아니라 "데이터 없음"으로 표시함
function buildRadarSVG(items, classItems) {
  const n = items.length;
  if (n < 3) return '';
  const cx = 150, cy = 128, R = 66;
  const known = items.filter(it => it.value !== null && it.value !== undefined);
  const fallback = known.length ? Math.round(known.reduce((a, it) => a + it.value, 0) / known.length) : 50;
  const angleFor = i => -Math.PI / 2 + i * (2 * Math.PI / n);
  const pointAt = (i, frac) => {
    const a = angleFor(i);
    return [cx + R * frac * Math.cos(a), cy + R * frac * Math.sin(a)];
  };
  const ringPath = frac => Array.from({ length: n }, (_, i) => pointAt(i, frac)).map(p => p.join(',')).join(' ');
  const rings = [0.25, 0.5, 0.75, 1].map(f => `<polygon points="${ringPath(f)}" fill="none" stroke="var(--line)" stroke-width="1"/>`).join('');
  const axes = Array.from({ length: n }, (_, i) => {
    const [x, y] = pointAt(i, 1);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)" stroke-width="1"/>`;
  }).join('');
  const studentPts = items.map((it, i) => pointAt(i, Math.max(0, Math.min(1, (it.value ?? fallback) / 100))).join(',')).join(' ');
  const classPts = classItems ? classItems.map((it, i) => pointAt(i, Math.max(0, Math.min(1, (it.value ?? fallback) / 100))).join(',')).join(' ') : '';
  const dots = items.map((it, i) => {
    const noData = it.value === null || it.value === undefined;
    const [x, y] = pointAt(i, Math.max(0, Math.min(1, (it.value ?? fallback) / 100)));
    return noData
      ? `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--surface-card)" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="2 1.5"/>`
      : `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--accent)"/>`;
  }).join('');
  const labels = items.map((it, i) => {
    const [x, y] = pointAt(i, 1.32);
    const anchor = Math.abs(x - cx) < 4 ? 'middle' : (x > cx ? 'start' : 'end');
    const shortLabel = (it.label || '').replace(/역량$/, '');
    const valueTxt = (it.value === null || it.value === undefined) ? '데이터 없음' : `${it.value}%`;
    const valueFill = (it.value === null || it.value === undefined) ? 'var(--muted)' : 'var(--ink-soft)';
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="axis-label" font-size="11.5" font-weight="700" fill="var(--ink-soft)">${escapeHtml(shortLabel)}</text>
      <text x="${x}" y="${y + 13}" text-anchor="${anchor}" class="axis-label" font-size="11" fill="${valueFill}">${valueTxt}</text>`;
  }).join('');
  return `<svg viewBox="0 0 300 270" role="img" aria-label="역량별 성취도 레이더 차트">
    ${rings}${axes}
    ${classPts ? `<polygon points="${classPts}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/>` : ''}
    <polygon points="${studentPts}" fill="var(--accent-fill)" stroke="var(--accent)" stroke-width="2"/>
    ${dots}
    ${labels}
  </svg>`;
}

function computeStrengthWatch(typeStats) {
  const known = typeStats.filter(t => t.last !== null);
  const strengths = known.filter(t => t.last >= 90 && (t.delta === null || t.delta >= 0)).sort((a, b) => b.last - a.last).slice(0, 4);
  const watch = known.filter(t => t.last < 70 || (t.delta !== null && t.delta <= 0 && t.avg < 85))
    .sort((a, b) => a.last - b.last).slice(0, 4);
  return { strengths, watch };
}

// 선생님 의견 칸의 기본 초안으로 쓰이는 평문 요약 (HTML 태그 없음 — textarea에 직접 들어감)
// 성적 데이터로 판단 가능한 부분(추이·유형·난이도·재시험)은 최대한 구체적으로 자동 작성하고,
// 수업 태도·학습 성향처럼 이 앱에 데이터가 없는 부분은 선생님이 직접 채워 넣도록 빈 자리를 남겨둠
// (실제로 관찰하지 않은 내용을 지어내지 않기 위함)
function buildComment(student, points, typeStats, difficulty, unitBreakdown, retest) {
  const name = displayName(student.name);
  const attitudeNote = '\n\n[수업 태도 · 학습 성향]\n이 부분은 선생님이 직접 관찰하신 내용으로 채워주세요 — 수업 참여도, 질문하는 태도, 과제·재시험 성실도, 성향(꼼꼼함/급함 등) 등을 자유롭게 적어보세요.';
  if (points.length < 2) {
    return `${josa(name, '은', '는')} 아직 비교할 회차가 부족해요. 다음 회차 결과가 쌓이면 성장 추이를 자동으로 분석해드릴게요.${attitudeNote}`;
  }
  const first = points[0].pct, last = points[points.length - 1].pct;
  // 처음·마지막 두 회차만 비교하면 그 사이 기복에 따라 과장돼 보일 수 있어서,
  // 최근 흐름(최대 최근 3회차의 평균 변화량)도 함께 봐서 추세를 판단함
  const recentPts = points.slice(-4);
  const recentDeltas = [];
  for (let i = 1; i < recentPts.length; i++) recentDeltas.push(recentPts[i].pct - recentPts[i - 1].pct);
  const recentTrend = recentDeltas.length ? recentDeltas.reduce((a, b) => a + b, 0) / recentDeltas.length : (last - first);
  const overallVerb = recentTrend > 1 ? `${first}% → ${last}%로 상승 흐름이에요` : recentTrend < -1 ? `${first}% → ${last}%로 하락 흐름이에요` : `${first}%에서 ${last}%로, 큰 변화 없이 비슷한 수준을 유지하고 있어요`;

  const withDelta = typeStats.filter(t => t.delta !== null);
  const strengths = withDelta.filter(t => t.last >= 90 && t.delta >= 0).sort((a, b) => b.last - a.last);
  const improving = withDelta.filter(t => t.delta > 0 && !strengths.includes(t)).sort((a, b) => b.delta - a.delta);
  const watch = withDelta.filter(t => t.delta <= 0 && t.avg < 85).sort((a, b) => a.avg - b.avg);

  const nameList = arr => arr.map(t => t.name).join(', ');

  const parts = [];
  parts.push(`${josa(name, '은', '는')} ${points.length}회차 동안 전체 정답률이 ${overallVerb}.`);
  if (strengths.length) parts.push(`특히 ${nameList(strengths)} 유형은 ${strengths[0].last}% 수준까지 올라오며 확실히 자리를 잡았습니다.`);
  if (improving.length) parts.push(`${nameList(improving)} 유형도 ${improving.map(t => (t.delta > 0 ? '+' : '') + t.delta + '%p').join(', ')} 상승하며 꾸준히 좋아지는 중이에요.`);
  if (watch.length) parts.push(`다만 ${nameList(watch)} 유형은 ${watch.map(t => t.avg + '%').join(', ')} 수준에서 정체되어 있어, 다음 학습에서 가장 집중적으로 다룰 예정입니다.`);
  if (!strengths.length && !improving.length && !watch.length) parts.push('아직 뚜렷한 강점·약점 유형을 판단하기엔 데이터가 조금 더 필요해요.');

  if (difficulty && difficulty.avgWrong !== null && difficulty.avgCorrect !== null) {
    if (difficulty.avgWrong > difficulty.avgCorrect + 0.5) parts.push('어려운 문제에서 막히는 경향이 있어, 심화 개념 보완이 필요해 보여요.');
    else if (difficulty.avgWrong < difficulty.avgCorrect - 0.5) parts.push('오답 중 비교적 쉬운 문제도 섞여 있어, 실수를 줄이는 연습이 도움이 될 수 있어요.');
  }
  if (unitBreakdown && unitBreakdown.length) {
    const weakest = [...unitBreakdown].sort((a, b) => a.pct - b.pct)[0];
    if (weakest.pct < 70) parts.push(`단원 중에서는 ${weakest.unit}이(가) ${weakest.pct}%로 가장 취약해 보완이 필요해요.`);
  }
  if (retest && retest.items.length) {
    parts.push(`재시험에서는 오답 ${retest.sumOriginal}문항 중 ${retest.sumCorrected}문항을 정답으로 전환했어요.`);
  }

  return parts.join(' ') + attitudeNote;
}

// 선택된 학생이 채점 기록을 가진 회차들로 시작/종료 드롭다운을 채움 (가능하면 기존 선택 유지)
function populateReportRoundSelects() {
  const studentId = document.getElementById('reportStudentSel').value;
  const fromSel = document.getElementById('reportFromSel');
  const toSel = document.getElementById('reportToSel');
  const rounds = studentId ? studentScoredRounds(studentId) : [];
  const opts = rounds.map(x => `<option value="${x.round.id}">${escapeHtml(x.label)} (${shortDate(x.round.date)})</option>`).join('');
  const prevFrom = fromSel.value, prevTo = toSel.value;
  fromSel.innerHTML = opts;
  toSel.innerHTML = opts;
  if (!rounds.length) return;
  fromSel.value = rounds.some(x => x.round.id === prevFrom) ? prevFrom : rounds[0].round.id;
  toSel.value = rounds.some(x => x.round.id === prevTo) ? prevTo : rounds[rounds.length - 1].round.id;
}

function renderReportTab() {
  const out = document.getElementById('reportOutput');
  const studentId = document.getElementById('reportStudentSel').value;
  populateReportRoundSelects();
  if (!studentId) { out.innerHTML = '<div class="card empty-state">학생을 먼저 등록하고 채점을 입력하세요.</div>'; return; }
  const fromRoundId = document.getElementById('reportFromSel').value;
  const toRoundId = document.getElementById('reportToSel').value;

  const data = computeStudentReport(studentId, fromRoundId, toRoundId);
  if (!data || !data.points.length) {
    out.innerHTML = `<div class="card empty-state">${escapeHtml(data ? displayName(data.student.name) : '')} 학생의 채점 기록이 아직 없어요. 채점 입력 탭에서 먼저 입력해주세요.</div>`;
    return;
  }
  const { student, points, typeStats, overallPct, classAvgOverall, difficulty, unitBreakdown, competencyStats, competencyHasAnyData, retest } = data;
  const first = points[0], last = points[points.length - 1];
  const totalQ = points.reduce((a, p) => a + p.total, 0);
  const delta = last.pct - first.pct;
  const grade = displayGradeTier(studentId, overallPct);

  const { strengths, watch } = computeStrengthWatch(typeStats);
  const strengthsHtml = strengths.length
    ? `<ul>${strengths.map(t => `<li>${escapeHtml(t.name)} <span class="tnum">${t.last}%</span></li>`).join('')}</ul>`
    : '<div class="empty">아직 뚜렷한 강점 유형이 없어요</div>';
  const watchHtml = watch.length
    ? `<ul>${watch.map(t => `<li>${escapeHtml(t.name)} <span class="tnum">${t.avg}%</span></li>`).join('')}</ul>`
    : '<div class="empty">대표 취약 유형이 없어요</div>';

  const typeCards = typeStats.map(t => {
    if (t.last === null) return '';
    const isStrength = strengths.includes(t);
    const isWatch = watch.includes(t);
    const badge = isStrength ? `<span class="badge good"><span class="dot"></span>강점 유형</span>`
      : isWatch ? `<span class="badge watch"><span class="dot"></span>집중 필요</span>` : '';
    return `<div class="type-card">
      <div class="type-name">${escapeHtml(t.name)}</div>
      ${t.unit ? `<div class="type-unit">${escapeHtml(t.unit)}</div>` : ''}
      <div class="type-row2"><span class="type-pct tnum">${t.last}%</span></div>
      ${buildBarRow(t.last, isWatch ? 'var(--warn-dot)' : t.color)}
      ${badge}
    </div>`;
  }).join('');

  const tableRows = typeStats.map(t => {
    const cells = points.map((p, i) => {
      const v = t.series[i];
      if (v === null) return '<td>—</td>';
      const watchCell = watch.includes(t) ? ' class="watch-cell"' : '';
      return `<td${watchCell} class="tnum">${v}%</td>`;
    }).join('');
    return `<tr><td>${escapeHtml(t.name)}${t.unit ? `<span class="unit-sub">${escapeHtml(t.unit)}</span>` : ''}</td>${cells}<td class="tnum">${t.avg !== null ? t.avg + '%' : '—'}</td></tr>`;
  }).join('');

  const totalRow = `<tr class="total"><td>전체</td>${points.map(p => `<td class="tnum">${p.pct}%<br>(${p.correct}/${p.total})</td>`).join('')}<td class="tnum">${overallPct}%</td></tr>`;
  const headCells = points.map(p => `<th>${escapeHtml(p.label)}<br>${escapeHtml(p.date)}</th>`).join('');

  const retestSection = retest.items.length ? `
    <div class="card">
      <h2>재시험 결과</h2>
      <p class="card-sub">오답 문항을 쌍둥이문제로 다시 본 기록 · 메인 정답률과 별도로 집계돼요</p>
      <p class="card-sub">재시험에서의 재오답을 포함한 모든 오답 문항은 개별첨삭이 완료되었으며, 끝까지 추적 관리합니다.</p>
      <div class="pill-row" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); margin-bottom:12px;">
        <div class="pill-tile"><span class="pill-tag" style="background:var(--good)">재시험 정답률</span>
          <div class="pill-value tnum">${retest.overallPct}%(${retest.sumCorrected}/${retest.sumOriginal})</div>
        </div>
      </div>
      ${retest.items.map(it => `
        <div class="unit-row">
          <div class="unit-name">${escapeHtml(it.label)}</div>
          <div class="unit-count">오답 ${it.originalWrong}개</div>
          <div class="unit-bar-wrap">${buildBarRow(it.pct, it.pct < 70 ? 'var(--warn-dot)' : 'var(--good)')}</div>
          <div class="unit-pct tnum">${it.corrected}/${it.originalWrong}</div>
        </div>`).join('')}
    </div>` : '';

  const unitSection = unitBreakdown.length ? `
    <div class="card">
      <h2>단원별 학습성과</h2>
      <p class="card-sub">2022 개정 교육과정 단원 기준 · 기간 누적</p>
      ${unitBreakdown.map(u => `
        <div class="unit-row">
          <div class="unit-name">${escapeHtml(u.unit)}</div>
          <div class="unit-count">${u.total}문항</div>
          <div class="unit-bar-wrap">${buildBarRow(u.pct, u.pct < 70 ? 'var(--warn-dot)' : 'var(--accent)')}</div>
          <div class="unit-pct tnum">${u.pct}%</div>
        </div>`).join('')}
    </div>` : '';

  const diffSection = difficulty ? `
    <div class="card">
      <h2>난이도 분석</h2>
      <p class="card-sub no-print">문항별 난이도 1(하)~6(최상) · 시험지 분석 시 태그된 경우에만 표시돼요</p>
      <div class="diff-row">
        <div class="diff-tile"><div class="label">전체 평균 난이도</div><div class="value tnum">${difficulty.avgAll}</div></div>
        <div class="diff-tile"><div class="label">정답 문항 평균 난이도</div><div class="value tnum" style="color:var(--good)">${difficulty.avgCorrect ?? '—'}</div></div>
        <div class="diff-tile"><div class="label">오답 문항 평균 난이도</div><div class="value tnum" style="color:var(--critical)">${difficulty.avgWrong ?? '—'}</div></div>
      </div>
      ${difficulty.avgWrong !== null && difficulty.avgCorrect !== null ? `<p class="comment" style="margin-top:10px;">${
        difficulty.avgWrong > difficulty.avgCorrect + 0.5
          ? '오답 문항의 난이도가 정답 문항보다 뚜렷이 높아요 — 어려운 문제에서 막히는 경향이에요. 심화 개념 보완이 필요해 보여요.'
          : difficulty.avgWrong < difficulty.avgCorrect - 0.5
          ? '오답 문항 중 비교적 쉬운 문제가 섞여 있어요 — 실수(연산 실수, 문제 잘못 읽기 등)를 줄이는 훈련이 도움이 될 수 있어요.'
          : '정답·오답 문항의 난이도 차이가 크지 않아요 — 특정 난이도 구간보다는 유형 자체에 대한 이해를 더 살펴보면 좋겠어요.'
      }</p>` : ''}
    </div>` : '';

  const competencyLegend = `<div class="competency-legend">${Object.keys(COMPETENCY_LABELS).map(c => `
      <div class="competency-legend-item"><b>${escapeHtml(COMPETENCY_LABELS[c])}</b> — ${escapeHtml(COMPETENCY_DESCRIPTIONS[c]).replace(/\n/g, '<br>')}</div>`).join('')}</div>`;
  const radarSection = competencyStats.length >= 3 ? `
    <div class="card">
      <h2>핵심역량</h2>
      <p class="card-sub">2022 개정 수학과목 5대 핵심역량 기준${competencyHasAnyData ? '' : ' · 아직 역량이 태그된 시험지가 없어요'}</p>
      <div class="radar-wrap">${buildRadarSVG(competencyStats)}</div>
      ${competencyLegend}
    </div>` : '';

  const savedNote = state.teacherNotes[studentId] || buildComment(student, points, typeStats, difficulty, unitBreakdown, retest);

  // "전체 정답률 추이" 그래프는 선택한 기간 그대로 항상 보여주고, 체크하면 원하는 기간을 직접 골라
  // 추이 그래프를 하나 더 "추가"로 붙일 수 있게 함 (기존 그래프를 대체하지 않음)
  const allScoredRounds = studentScoredRounds(studentId);
  const prevExtendToggle = document.getElementById('reportExtendTrendToggle');
  const extendChecked = prevExtendToggle ? prevExtendToggle.checked : false;
  let extendPoints = [], extendFromId = null, extendToId = null;
  if (extendChecked && allScoredRounds.length) {
    const prevFromSel = document.getElementById('reportExtendFromSel');
    const prevToSel = document.getElementById('reportExtendToSel');
    extendFromId = (prevFromSel && allScoredRounds.some(x => x.round.id === prevFromSel.value)) ? prevFromSel.value : allScoredRounds[0].round.id;
    extendToId = (prevToSel && allScoredRounds.some(x => x.round.id === prevToSel.value)) ? prevToSel.value : allScoredRounds[allScoredRounds.length - 1].round.id;
    extendPoints = computeStudentReport(studentId, extendFromId, extendToId).points;
  }

  out.innerHTML = `
    <div class="sample-flag no-print">실제 데이터 기반 보고서 미리보기 · 강사용 화면이며 학부모용 PDF에는 이 안내와 일부 내부 설명이 빠져요</div>
    <div class="card">
      <div class="masthead">
        <div>
          <div class="brand-line">${logoBlock()}</div>
          <h2>캐치유테스트 분석보고서</h2>
        </div>
        <div class="meta">
          <div class="student-name-big">${escapeHtml(displayName(student.name))}</div>
          <div>${[student.school, student.grade].filter(Boolean).map(escapeHtml).join(' ')}</div>
          ${student.teacher ? `<div>담임: ${escapeHtml(student.teacher)} ${teacherTitle(student.teacher)}</div>` : ''}
          <div>기간 ${escapeHtml(first.date)} – ${escapeHtml(last.date)} (${points.length}회차)</div>
        </div>
      </div>
    </div>
    <div class="pill-row">
      <div class="pill-tile"><span class="pill-tag" style="background:var(--accent)">예상 등급</span>
        <div class="pill-value tnum" style="font-size:21px;">${grade.n}등급 예상</div>
        <div class="no-print" style="margin-top:8px;">
          <select id="gradeOverrideSel" style="font-size:12px; padding:4px 6px; min-width:auto;">
            <option value="">예상 등급 자동 계산</option>
            <option value="1"${state.gradeOverrides[studentId] === 1 ? ' selected' : ''}>1등급으로 수정</option>
            <option value="2"${state.gradeOverrides[studentId] === 2 ? ' selected' : ''}>2등급으로 수정</option>
            <option value="3"${state.gradeOverrides[studentId] === 3 ? ' selected' : ''}>3등급으로 수정</option>
            <option value="4"${state.gradeOverrides[studentId] === 4 ? ' selected' : ''}>4등급으로 수정</option>
            <option value="5"${state.gradeOverrides[studentId] === 5 ? ' selected' : ''}>5등급으로 수정</option>
          </select>
        </div>
      </div>
      <div class="pill-tile"><span class="pill-tag" style="background:var(--good)">정답률</span>
        <div class="pill-value tnum">${overallPct}%</div>
      </div>
      <div class="pill-tile"><span class="pill-tag" style="background:var(--type-2)">${totalQ}문항 채점</span>
        <div class="pill-value tnum">${totalQ}</div>
        <div class="pill-compare">기간 내 채점된 문항 수</div>
      </div>
      <div class="pill-tile"><span class="pill-tag" style="background:${!difficulty ? 'var(--muted)' : difficulty.avgAll <= 2 ? 'var(--good)' : difficulty.avgAll <= 4 ? 'var(--type-2)' : 'var(--critical)'}">시험 난이도</span>
        <div class="pill-value tnum">${difficulty ? difficultyLabelByN(difficulty.avgAll) : '—'}</div>
        <div class="pill-compare">${difficulty ? `평균 ${difficulty.avgAll} / 6` : '난이도 정보 없음'}</div>
      </div>
      <div class="pill-tile"><span class="pill-tag" style="background:${delta > 0 ? 'var(--good)' : delta < 0 ? 'var(--critical)' : 'var(--muted)'}">${delta > 0 ? '상승' : delta < 0 ? '하락' : '변화 없음'}</span>
        <div class="pill-value tnum ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '+' : ''}${delta}%p</div>
        <div class="pill-compare"><span style="white-space:nowrap;">${first.label} ${first.pct}%</span><br><span style="white-space:nowrap;">→ ${last.label} ${last.pct}%</span></div>
      </div>
    </div>
    <div class="card">
      <h2>대표 강점 · 취약 유형</h2>
      <p class="card-sub">선택한 기간 기준</p>
      <div class="summary-cols">
        <div class="summary-box good"><h3>대표 강점 유형</h3>${strengthsHtml}</div>
        <div class="summary-box watch"><h3>대표 취약 유형</h3>${watchHtml}</div>
      </div>
    </div>
    <div class="card" id="trendChartCard">
      <h2>전체 정답률 추이</h2>
      <p class="card-sub">회차별 ${points[points.length-1].total}문항 기준</p>
      <div class="chart-wrap" id="trendChartWrap">${buildMainChartSVG(points)}</div>
      <label class="no-print" style="display:flex; align-items:center; gap:6px; font-size:12.5px; margin-top:10px;">
        <input type="checkbox" id="reportExtendTrendToggle"${extendChecked ? ' checked' : ''}> 다른 기간의 추이 그래프 추가로 보기
      </label>
    </div>
    <div class="card" id="teacherNoteCard">
      <h2>선생님 의견</h2>
      <p class="card-sub no-print">자동 요약 문장으로 미리 채워져 있어요. 그대로 쓰거나, 자유롭게 고치거나, 버튼을 눌러 AI가 이번 기간 데이터로 새 초안을 쓰게 할 수도 있어요.</p>
      <div class="inline-form no-print" style="margin-bottom:8px;">
        <button type="button" class="btn ghost" id="aiCommentBtn">🪄 AI로 의견 초안 작성</button>
        <span id="aiCommentStatus" class="field-hint"></span>
      </div>
      <textarea class="teacher-note no-print" id="teacherNoteInput" placeholder="선생님 의견을 입력하거나 위 버튼으로 AI 초안을 작성하세요.">${escapeHtml(savedNote)}</textarea>
      <p class="comment print-only">${savedNote ? escapeHtml(savedNote).replace(/\n/g, '<br>') : '(작성된 의견이 없어요)'}</p>
    </div>
    ${extendChecked ? `<div class="card">
      <h2>추가 추이 그래프</h2>
      <p class="card-sub">${extendPoints.length ? `${escapeHtml(extendPoints[0].label)} – ${escapeHtml(extendPoints[extendPoints.length - 1].label)} 기준` : '채점 기록이 없어요'}</p>
      <div class="inline-form no-print" style="margin-bottom:10px;">
        <select id="reportExtendFromSel"></select>
        <span class="field-hint">부터</span>
        <select id="reportExtendToSel"></select>
        <span class="field-hint">까지</span>
      </div>
      <div class="chart-wrap">${buildMainChartSVG(extendPoints)}</div>
    </div>` : ''}
    <div class="card">
      <h2>유형별 정답률</h2>
      <p class="card-sub">최근 정답률</p>
      <div class="type-grid">${typeCards}</div>
    </div>
    ${retestSection}
    ${unitSection}
    ${diffSection}
    ${radarSection}
    <div class="card">
      <h2>회차별 상세 기록</h2>
      <p class="card-sub">유형별 정답률(%)</p>
      <div class="table-wrap">
        <table class="report-table">
          <thead><tr><th>유형</th>${headCells}<th>평균</th></tr></thead>
          <tbody>${totalRow}${tableRows}</tbody>
        </table>
      </div>
    </div>
  `;

  const gradeOverrideSel = document.getElementById('gradeOverrideSel');
  if (gradeOverrideSel) {
    gradeOverrideSel.addEventListener('change', () => {
      const v = gradeOverrideSel.value;
      if (v) state.gradeOverrides[studentId] = parseInt(v, 10);
      else delete state.gradeOverrides[studentId];
      saveState();
      renderReportTab();
    });
  }

  const extendTrendToggle = document.getElementById('reportExtendTrendToggle');
  if (extendTrendToggle) {
    extendTrendToggle.addEventListener('change', renderReportTab);
  }

  const extendFromSel = document.getElementById('reportExtendFromSel');
  const extendToSel = document.getElementById('reportExtendToSel');
  if (extendFromSel && extendToSel) {
    const opts = allScoredRounds.map(x => `<option value="${x.round.id}">${escapeHtml(x.label)} (${shortDate(x.round.date)})</option>`).join('');
    extendFromSel.innerHTML = opts;
    extendToSel.innerHTML = opts;
    extendFromSel.value = extendFromId;
    extendToSel.value = extendToId;
    extendFromSel.addEventListener('change', renderReportTab);
    extendToSel.addEventListener('change', renderReportTab);
  }

  const noteInput = document.getElementById('teacherNoteInput');
  if (noteInput) {
    noteInput.addEventListener('change', () => {
      state.teacherNotes[studentId] = noteInput.value;
      saveState();
      out.querySelector('.print-only').innerHTML = noteInput.value ? escapeHtml(noteInput.value).replace(/\n/g, '<br>') : '(작성된 의견이 없어요)';
      toast('선생님 의견을 저장했어요.');
    });
  }

  const aiCommentBtn = document.getElementById('aiCommentBtn');
  if (aiCommentBtn) {
    aiCommentBtn.addEventListener('click', async () => {
      const status = document.getElementById('aiCommentStatus');
      aiCommentBtn.disabled = true;
      status.style.color = 'var(--muted)';
      status.textContent = '작성 중이에요...';
      try {
        const prompt = buildTeacherCommentPrompt(student, points, typeStats, overallPct, classAvgOverall, strengths, watch, difficulty, retest);
        const { text } = await callClaudeAPI({ content: [{ type: 'text', text: prompt }], maxTokens: 600 });
        noteInput.value = text.trim();
        state.teacherNotes[studentId] = noteInput.value;
        saveState();
        out.querySelector('.print-only').innerHTML = escapeHtml(noteInput.value).replace(/\n/g, '<br>');
        status.style.color = 'var(--good)';
        status.textContent = '작성 완료! 내용을 확인하고 필요하면 수정하세요.';
      } catch (err) {
        console.error(err);
        status.style.color = 'var(--critical)';
        status.textContent = '작성 실패: ' + err.message;
      } finally {
        aiCommentBtn.disabled = false;
      }
    });
  }
}

function buildTeacherCommentPrompt(student, points, typeStats, overallPct, classAvgOverall, strengths, watch, difficulty, retest) {
  const period = `${points[0].date} ~ ${points[points.length - 1].date} (${points.length}회차)`;
  const typeLines = typeStats.filter(t => t.last !== null).map(t => `- ${t.name}${t.unit ? `(${t.unit})` : ''}: 최근 ${t.last}%, 기간평균 ${t.avg}%${t.delta !== null ? `, 변화 ${t.delta > 0 ? '+' : ''}${t.delta}%p` : ''}`).join('\n');
  const difficultyLine = difficulty ? `난이도: 전체 평균 ${difficulty.avgAll}/6, 정답 문항 평균 ${difficulty.avgCorrect ?? '—'}, 오답 문항 평균 ${difficulty.avgWrong ?? '—'}` : '';
  const retestLine = retest && retest.items.length ? `재시험: 오답 ${retest.sumOriginal}문항 중 ${retest.sumCorrected}문항 정답 전환` : '';
  return `다음은 수학학원 캐치유테스트에서 한 학생의 최근 학습 데이터 요약입니다. 이 데이터를 바탕으로 학부모님께 보여드릴 "선생님 의견" 문단을 자연스러운 한국어로 4~6문장 작성해주세요.
- 잘하고 있는 부분과 보완이 필요한 부분을 구체적인 유형명과 수치를 함께 언급하세요.
- 난이도·재시험 데이터가 있으면 그 내용도 자연스럽게 녹여주세요(예: 어려운 문제에서의 경향, 재시험을 통한 보완 정도).
- 앞으로의 지도 계획을 한 문장 포함해주세요.
- 마지막 줄에 "[수업 태도 · 학습 성향]"이라는 제목만 쓰고, 그 내용은 절대 지어내지 마세요 — 선생님이 직접 관찰한 내용을 적을 수 있도록 빈 줄로 남겨두세요. 이 앱은 수업 태도 데이터를 갖고 있지 않으니, 성적만으로 태도나 성향을 추측해서 쓰면 안 됩니다.
- 너무 딱딱하지 않으면서도 전문적인 톤으로 써주세요. 결과는 문단 텍스트만 출력하세요 (따옴표, 마크다운, 제목 없이 — 단, 마지막의 "[수업 태도 · 학습 성향]" 제목 줄은 그대로 출력하세요).

학생: ${displayName(student.name)}
측정 기간: ${period}
전체 정답률: ${overallPct}%
강점 유형: ${strengths.length ? strengths.map(t => `${t.name}(${t.last}%)`).join(', ') : '없음'}
취약 유형: ${watch.length ? watch.map(t => `${t.name}(${t.avg}%)`).join(', ') : '없음'}
${difficultyLine}
${retestLine}

유형별 상세:
${typeLines}`;
}

// 이 요소를 더 쪼갤 수 있으면 쪼갤 자식 목록을 돌려줌 (표는 줄 단위로, 그 외엔 DOM 자식 단위로)
// — 페이지 넘어갈 때 문항/행 중간이 아니라 항상 "항목과 항목 사이"에서만 끊기게 하기 위함
function pdfSplittableChildren(el) {
  if (el.tagName === 'SVG') return [];
  if (el.tagName === 'TABLE') {
    const out = [];
    Array.from(el.children).forEach(c => {
      if (c.tagName === 'TBODY') Array.from(c.children).forEach(tr => out.push(tr));
      else out.push(c); // thead 등은 통째로
    });
    return out.filter(c => c.offsetHeight > 0);
  }
  if (el.classList && el.classList.contains('type-grid')) {
    // 그리드를 카드 한 장씩 쪼개서 캡처하면 좁은 카드 폭이 페이지 폭에 맞춰 억지로 확대돼 이상해 보이므로,
    // 여러 장씩 묶은 임시 그리드로 잘라서 원래처럼 여러 열로 보이게 캡처하고, 다 쓰고 나면 지움(data-pdf-temp로 표시)
    const items = Array.from(el.children).filter(c => c.offsetHeight > 0);
    if (items.length <= 1) return items;
    const width = el.getBoundingClientRect().width;
    const chunkSize = 6;
    const chunks = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      const wrap = document.createElement('div');
      wrap.className = 'type-grid';
      wrap.style.cssText = `position:fixed; left:-99999px; top:0; width:${width}px;`;
      wrap.dataset.pdfTemp = '1';
      items.slice(i, i + chunkSize).forEach(item => wrap.appendChild(item.cloneNode(true)));
      document.body.appendChild(wrap);
      chunks.push(wrap);
    }
    return chunks;
  }
  return Array.from(el.children).filter(c => c.offsetHeight > 0);
}

// el을 캡처해서 ctx(페이지 커서)에 이어붙임. 한 페이지보다 크면 더 잘게 쪼갤 수 있는 만큼 재귀적으로 쪼개서
// 각 조각이 페이지 경계에서만 넘어가도록 함 — 정말 더 쪼갤 수 없는 조각만 최후 수단으로 강제 슬라이스함
async function pdfPlaceElement(pdf, el, ctx) {
  const canvas = await html2canvas(el, { scale: ctx.scale, backgroundColor: '#ffffff', useCORS: true });
  const imgH = canvas.height * ctx.contentWidth / canvas.width;

  if (imgH > ctx.pageContentH) {
    const kids = pdfSplittableChildren(el);
    if (kids.length > 1) {
      for (const kid of kids) {
        await pdfPlaceElement(pdf, kid, ctx);
        if (kid.dataset && kid.dataset.pdfTemp === '1') kid.remove();
      }
      return;
    }
    // 더 쪼갤 수 없는데도 한 페이지보다 큰 경우에만 어쩔 수 없이 이미지째로 슬라이스
    if (ctx.pageHasContent) { pdf.addPage(); ctx.y = ctx.marginY; ctx.pageHasContent = false; }
    let heightLeft = imgH, position = ctx.marginY;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', ctx.marginX, position, ctx.contentWidth, imgH, undefined, 'FAST');
    heightLeft -= ctx.pageContentH;
    while (heightLeft > 0) {
      position -= ctx.pageContentH;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', ctx.marginX, position, ctx.contentWidth, imgH, undefined, 'FAST');
      heightLeft -= ctx.pageContentH;
    }
    ctx.y = Infinity;
    ctx.pageHasContent = true;
    return;
  }

  if (ctx.pageHasContent && ctx.y + imgH > ctx.contentBottom) {
    pdf.addPage();
    ctx.y = ctx.marginY;
    ctx.pageHasContent = false;
  }
  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData, 'JPEG', ctx.marginX, ctx.y, ctx.contentWidth, imgH, undefined, 'FAST');
  ctx.y += imgH + ctx.gap;
  ctx.pageHasContent = true;
}

// 리포트 맨 앞장 — 로고/학원명, 학생 이름, 측정 기간·회차 수, 담당 강사를 보여주는 표지 한 장
// 학원의 상징색인 빨간색 포인트 라인 + 페이지 대부분을 채우는 큰 테두리 박스로 격식있게 구성
async function pdfAddCoverPage(pdf, student, points) {
  const period = points.length ? `${points[0].date} – ${points[points.length - 1].date}` : '';
  const teacherTxt = student.teacher ? escapeHtml(student.teacher) + ' ' + teacherTitle(student.teacher) : '-';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed; left:-99999px; top:0;';
  wrap.innerHTML = `
    <div style="width:794px; height:1123px; box-sizing:border-box; background:#fff; position:relative; font-family:'Noto Sans KR',sans-serif;">
      <div style="position:absolute; top:0; left:0; right:0; height:16px; background:#c8102e;"></div>
      <div style="position:absolute; top:52px; left:52px; right:52px; bottom:52px; border:3px solid #c8102e; box-sizing:border-box;">
        <div style="height:100%; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:60px 48px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <img src="logo.png" style="width:46px;height:46px;object-fit:contain;">
            <span style="font-weight:900; font-size:25px; letter-spacing:0.02em; color:#0b0b0b;">KASTLE MATH</span>
          </div>
          <div style="text-align:center;">
            <div style="width:70px; height:3px; background:#c8102e; margin:0 auto 30px;"></div>
            <div style="font-size:46px; font-weight:800; color:#0b0b0b; margin-bottom:16px;">${escapeHtml(displayName(student.name))}</div>
            <div style="font-family:'Gowun Dodum',sans-serif; font-weight:400; font-size:23px; color:#52514e;">캐치유테스트 분석보고서</div>
            <div style="width:70px; height:3px; background:#c8102e; margin:30px auto 0;"></div>
          </div>
          <div style="width:100%;">
            <div style="border-top:1px solid #ddddd3; margin-bottom:22px;"></div>
            <div style="display:flex; justify-content:center; gap:64px; font-size:14px; color:#3a3a3a; text-align:center;">
              <div><div style="color:#c8102e; font-weight:700; font-size:11.5px; letter-spacing:0.04em; margin-bottom:6px;">측정 기간</div>${escapeHtml(period)} (${points.length}회차)</div>
              <div><div style="color:#c8102e; font-weight:700; font-size:11.5px; letter-spacing:0.04em; margin-bottom:6px;">담임</div>${teacherTxt}</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  try {
    const canvas = await html2canvas(wrap.firstElementChild, { scale: 2.5, backgroundColor: '#ffffff', useCORS: true });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  } finally {
    document.body.removeChild(wrap);
  }
}

async function exportReportPDF() {
  const btn = document.getElementById('pdfExportBtn');
  const status = document.getElementById('pdfExportStatus');
  const target = document.getElementById('reportOutput');
  if (!target || !target.children.length) { status.textContent = '먼저 보고서를 생성하세요.'; return; }
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    status.style.color = 'var(--critical)';
    status.textContent = 'PDF 기능을 불러오지 못했어요 (인터넷 연결을 확인해주세요).';
    return;
  }
  const studentId = document.getElementById('reportStudentSel').value;
  const fromRoundId = document.getElementById('reportFromSel').value;
  const toRoundId = document.getElementById('reportToSel').value;
  const data = computeStudentReport(studentId, fromRoundId, toRoundId);
  if (!data || !data.points.length) { status.textContent = '먼저 보고서를 생성하세요.'; return; }

  btn.disabled = true;
  status.style.color = 'var(--muted)';
  status.textContent = 'PDF 생성 중이에요...';
  document.body.classList.add('exporting-pdf');
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4', true);
    const marginX = 10, marginY = 10, gap = 4;
    const ctx = {
      scale: 3, marginX, marginY, gap,
      contentWidth: 210 - marginX * 2,
      contentBottom: 297 - marginY,
      pageContentH: 297 - marginY * 2,
      y: marginY, pageHasContent: false,
    };

    await pdfAddCoverPage(pdf, data.student, data.points);
    pdf.addPage();

    // 카드(섹션) 단위로 따로 캡처해서, 한 페이지에 안 들어가면 카드 안의 항목(문항/행) 단위까지
    // 재귀적으로 쪼개 붙여서 어중간하게 잘리는 부분 없이 항상 항목 경계에서만 페이지가 넘어가게 함
    const blocks = Array.from(target.children).filter(el => !el.classList.contains('no-print') && el.offsetHeight > 0);

    // 첫 페이지(마스트헤드~전체 정답률 추이~선생님 의견)가 한 장에 다 들어가도록,
    // 선생님 의견이 길어서 넘칠 것 같으면 그래프(전체 정답률 추이)를 세로로 납작하게 줄여서 맞춤
    const chartCard = target.querySelector('#trendChartCard');
    const chartWrap = target.querySelector('#trendChartWrap');
    const noteCard = target.querySelector('#teacherNoteCard');
    const chartIdx = blocks.indexOf(chartCard);
    const noteIdx = blocks.indexOf(noteCard);
    let restoreChart = null;
    if (chartCard && chartWrap && noteCard && chartIdx !== -1 && noteIdx === chartIdx + 1) {
      const refWidthPx = chartCard.getBoundingClientRect().width || 1;
      const mmPerPx = ctx.contentWidth / refWidthPx;
      let sumMM = 0;
      for (let i = 0; i <= noteIdx; i++) {
        if (i > 0) sumMM += ctx.gap;
        sumMM += blocks[i].getBoundingClientRect().height * mmPerPx;
      }
      const overflow = sumMM - ctx.pageContentH;
      if (overflow > 0) {
        const chartMM = chartCard.getBoundingClientRect().height * mmPerPx;
        const originalPlotH = 194, minPlotH = 70;
        // 그래프 카드 전체 높이(chartMM) 중 overflow만큼 줄여야 하므로, 같은 비율을 그래프의
        // 그림 영역 높이(plotH)에도 적용해서 새 plotH를 구함 — plotH만 바꾸면 카드 높이가 거의 그 비율대로 줄어듦
        const shrinkRatio = Math.max(0, (chartMM - overflow) / chartMM);
        const newPlotH = Math.max(minPlotH, Math.round(originalPlotH * shrinkRatio));
        if (newPlotH < originalPlotH) {
          restoreChart = chartWrap.innerHTML;
          chartWrap.innerHTML = buildMainChartSVG(data.points, newPlotH);
        }
      }
    }

    try {
      for (const el of blocks) await pdfPlaceElement(pdf, el, ctx);
    } finally {
      if (restoreChart !== null) chartWrap.innerHTML = restoreChart;
    }

    // 파일명 맨 앞에 "발행월"을 붙임 — 리포트에 포함된 마지막 회차가 속한 달 기준
    // (예: 8월4주차~9월4주차 리포트는 9월, 9월3주차~10월3주차 리포트는 10월)
    const lastPoint = data.points[data.points.length - 1];
    const lastRound = lastPoint ? state.rounds.find(r => r.id === lastPoint.roundId) : null;
    const reportMonth = lastRound ? new Date(lastRound.date + 'T00:00:00').getMonth() + 1 : '';
    pdf.save(`${reportMonth ? reportMonth + '월' : ''}캐치유분석보고서_${displayName(data.student.name)}.pdf`);
    status.style.color = 'var(--good)';
    status.textContent = 'PDF를 저장했어요.';
  } catch (err) {
    console.error(err);
    status.style.color = 'var(--critical)';
    status.textContent = 'PDF 생성 실패: ' + err.message;
  } finally {
    document.body.classList.remove('exporting-pdf');
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('reportStudentSel').addEventListener('change', renderReportTab);
  document.getElementById('reportFromSel').addEventListener('change', renderReportTab);
  document.getElementById('reportToSel').addEventListener('change', renderReportTab);
  document.getElementById('pdfExportBtn').addEventListener('click', exportReportPDF);
});

/* ================= 데이터 관리 ================= */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    a.href = url; a.download = `${stamp}학생누적채점데이터.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('백업 파일을 내보냈어요.');
  });

  document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.students || !data.rounds || !data.results) throw new Error('형식 오류');
        if (!data.teacherNotes) data.teacherNotes = {};
        if (!data.retests) data.retests = [];
        if (!data.gradeOverrides) data.gradeOverrides = {};
        if (!data.studentDone) data.studentDone = {};
        if (!confirm('현재 데이터를 덮어씁니다. 계속할까요?')) return;
        state = data;
        saveState();
        renderAll();
        toast('데이터를 가져왔어요.');
      } catch (err) {
        alert('올바른 백업 파일이 아니에요.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('seedBtn').addEventListener('click', () => {
    if (!confirm('예시 데이터를 불러올까요? (현재 데이터가 있다면 먼저 백업하세요)')) return;
    seedDemoData();
    renderAll();
    switchTab('report');
    document.getElementById('reportStudentSel').value = state.students[0].id;
    renderReportTab();
    toast('예시 데이터를 불러왔어요.');
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm('모든 데이터를 삭제합니다. 정말 초기화할까요?')) return;
    state = { students: [], rounds: [], results: [], teacherNotes: {}, retests: [], gradeOverrides: {}, studentDone: {} };
    saveState();
    renderAll();
    toast('초기화했어요.');
  });
});

function seedDemoData() {
  const types = [
    { name: '수와 연산', unit: '자연수의 혼합계산', questions: [1,2,3,4,5,6] },
    { name: '도형', unit: '평면도형의 이동', questions: [7,8,9,10,11,12] },
    { name: '측정', unit: '어림하기와 들이·무게', questions: [13,14,15,16,17,18] },
    { name: '규칙성', unit: '규칙과 대응', questions: [19,20,21,22,23,24] },
    { name: '문장제/문제해결', unit: '문제해결 전략', questions: [25,26,27,28,29,30] },
  ].map((t, i) => ({ ...t, color: TYPE_COLORS[i % TYPE_COLORS.length] }));

  const difficulty = {};
  [1,7,13,19,25].forEach(q => difficulty[q] = 1);
  [2,3,8,9,14,15,20,21,26,27].forEach(q => difficulty[q] = 2);
  [4,5,10,11,16,17,22,23,28].forEach(q => difficulty[q] = 3);
  [6,12,18,24,29].forEach(q => difficulty[q] = 4);
  [30].forEach(q => difficulty[q] = 5);

  // 문항별 역량 — 같은 유형 안에서도 문항마다 다를 수 있음을 보여주는 예시
  const competency = {
    1:'문제해결', 2:'문제해결', 3:'추론', 4:'문제해결', 5:'문제해결', 6:'추론',
    7:'추론', 8:'추론', 9:'정보처리', 10:'추론', 11:'추론', 12:'추론',
    13:'정보처리', 14:'정보처리', 15:'정보처리', 16:'연결', 17:'정보처리', 18:'정보처리',
    19:'연결', 20:'연결', 21:'연결', 22:'추론', 23:'연결', 24:'연결',
    25:'의사소통', 26:'의사소통', 27:'의사소통', 28:'문제해결', 29:'의사소통', 30:'의사소통',
  };

  const dates = ['2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04', '2026-09-11']; // 매주 금요일
  const rounds = dates.map(date => ({ id: uid(), date, grade: '초4', total: 30, types, difficulty, competency }));

  const wrongByRound = [
    [2,5, 7,9,11, 14,17, 20,23, 26,29],
    [3, 8,10,12, 15,18, 21, 27,30],
    [4, 9,11, 13,16,18, 22,24, 28,30],
    [7,10, 17, 23, 25,29],
    [12, 18, 26,30],
  ];
  const studentId = uid();
  const student = { id: studentId, name: '김민준', grade: '초4', class: 'A반' };
  const results = rounds.map((r, i) => ({ id: uid(), studentId, roundId: r.id, wrong: wrongByRound[i] }));

  // a couple of classmates on the same rounds, so 반 평균 comparisons have something to show
  const classmateNames = ['이서연', '박도윤'];
  const classmateWrongByRound = [
    [[1,6, 8,10, 15, 21,24, 28], [3, 9, 16,17, 22, 27,29,30], [2, 7,8, 14,16,18, 20, 26], [5, 11, 18, 26,27,28], [9, 16, 24, 28,29,30]],
    [[4, 10,12, 16, 19,20,22, 27], [2,6, 8, 17, 23, 28,29], [1, 8,10, 15,17, 21,23, 27,29], [8, 14, 22, 28], [6,11, 17, 23,25]],
  ];
  const classmates = classmateNames.map((name, ci) => {
    const id = uid();
    return { student: { id, name, grade: '초4', class: 'A반' }, results: rounds.map((r, i) => ({ id: uid(), studentId: id, roundId: r.id, wrong: classmateWrongByRound[ci][i] })) };
  });

  // 1회차 오답([2,5,7,9,11,14,17,20,23,26,29]) 중 대부분을 재시험에서 교정한 예시
  const retests = [
    { id: uid(), studentId, roundId: rounds[0].id, date: '2026-08-17', stillWrong: [9, 26] },
  ];

  state = {
    students: [student, ...classmates.map(c => c.student)],
    rounds,
    results: [...results, ...classmates.flatMap(c => c.results)],
    retests,
    teacherNotes: {
      [studentId]: '민준이는 이번 4주간 차분하게 문제를 풀어가는 흐름을 보였습니다. 수와 연산, 규칙성 유형은 기본기가 탄탄하게 자리 잡았고, 도형과 측정도 꾸준히 좋아지는 중입니다. 다만 문장제·문제해결 유형에서 정체가 이어지고 있어, 다음 학습에서는 문제를 끝까지 읽고 조건을 정리하는 연습을 함께 해보려 합니다.',
    },
    gradeOverrides: {},
    studentDone: {},
  };
  saveState();
}

/* ================= init ================= */

function renderAll() {
  const logoEl = document.getElementById('topbarLogo');
  if (logoEl) logoEl.innerHTML = logoBlock();
  renderStudents();
  resetRoundForm();
  renderRounds();
  populateSelects();
  renderScoreTab();
  renderRetestTab();
  renderReportTab();
}

function populateCurrentTeacherSel() {
  const sel = document.getElementById('currentTeacherSel');
  sel.innerHTML = '<option value="">담당 선생님 선택 (전체 보기)</option>' + TEACHER_OPTIONS.map(t => `<option value="${t}">${t}</option>`).join('');
  sel.value = getCurrentTeacher();
}

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  populateCurrentTeacherSel();
  document.getElementById('currentTeacherSel').addEventListener('change', e => {
    setCurrentTeacher(e.target.value);
    renderAll();
  });
  await syncSharedRounds();
  renderAll();
});

/* ================= 공용 회차 공유 (관리자가 내보내고, 모든 선생님 컴퓨터가 자동으로 읽어옴) ================= */

// 회차 정의(날짜/학년/유형/단원/난이도/역량)만 공유 — 시험지 원본 이미지, 학생·채점 데이터는 이 파일에 안 들어감
// 이 기능(동기화 시 삭제 반영)이 생기기 전에 잘못 등록되어 이미 각자 브라우저에 들어가 있던
// 회차를 한 번만 강제로 정리함. 채점 기록이 있으면(이미 누가 썼으면) 안전하게 건너뜀.
const LEGACY_REMOVED_ROUND_IDS = ['r_er9f44ek6v'];

async function syncSharedRounds() {
  try {
    LEGACY_REMOVED_ROUND_IDS.forEach(id => {
      if (state.results.some(r => r.roundId === id)) return;
      state.rounds = state.rounds.filter(r => r.id !== id);
    });

    const res = await fetch('rounds-shared.json', { cache: 'no-store' });
    if (!res.ok) { saveState(); return; }
    const shared = await res.json();
    if (!Array.isArray(shared)) { saveState(); return; }
    if (!state.sharedRoundIds) state.sharedRoundIds = [];
    const sharedIds = new Set(shared.map(sr => sr.id));

    shared.forEach(sr => {
      const idx = state.rounds.findIndex(r => r.id === sr.id);
      if (idx === -1) {
        state.rounds.push({ ...sr });
      } else {
        // examFile과, 개별시험지를 이 컴퓨터에서 이미 어느 학생에게 배정했는지(studentId)는
        // 이 컴퓨터에서만 의미 있는 정보라 공용 파일 동기화로 덮어쓰지 않고 그대로 유지함
        const keepExamFile = state.rounds[idx].examFile;
        const keepStudentId = state.rounds[idx].studentId;
        state.rounds[idx] = { ...sr, examFile: keepExamFile, studentId: keepStudentId };
      }
      if (!state.sharedRoundIds.includes(sr.id)) state.sharedRoundIds.push(sr.id);
    });

    // 공용 파일에서 빠진(원장님이 지운) 회차는 이 브라우저에서도 같이 지움 — 단, 이미 채점 기록이
    // 있으면 실수로 데이터를 날리지 않도록 지우지 않고 알림만 띄움 (직접 확인 후 지우도록)
    let skippedWithResults = 0;
    state.sharedRoundIds.filter(id => !sharedIds.has(id)).forEach(id => {
      if (state.results.some(r => r.roundId === id)) { skippedWithResults++; return; }
      state.rounds = state.rounds.filter(r => r.id !== id);
    });
    state.sharedRoundIds = state.sharedRoundIds.filter(id => sharedIds.has(id) || state.results.some(r => r.roundId === id));

    saveState();
    if (skippedWithResults > 0) {
      toast(`공용 목록에서 지워진 회차 ${skippedWithResults}개는 채점 기록이 있어 자동으로 지우지 않았어요. 시험지 탭에서 확인해주세요.`);
    }
  } catch (e) {
    // 공용 파일이 아직 없거나(첫 배포) 오프라인인 경우 — 조용히 넘어감
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('importRoundsBatchFile');
  if (btn) btn.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const list = JSON.parse(reader.result);
        if (!Array.isArray(list)) throw new Error('형식 오류');
        let added = 0, updated = 0, unmatchedNames = [];
        list.forEach(r => {
          if (!r.date || !r.grade || !Array.isArray(r.types)) return;
          const topicKey = (r.types || []).map(t => t.name).join('|');
          let idx, studentId;

          if (r.individual) {
            // 개별시험지(학생 맞춤형): 이름 전체를 안 쓰고 성 등 힌트만 있음 — 실제 어느 학생 건지는
            // 선생님이 채점할 때 직접 고름. 한번 배정되면(studentId) 다시 가져와도 배정이 유지됨.
            idx = state.rounds.findIndex(x => x.date === r.date && x.grade === r.grade && x.individual && (x.studentName || '') === (r.studentName || '') && x.title === r.title);
            studentId = idx !== -1 ? state.rounds[idx].studentId : undefined;
          } else if (r.studentName) {
            // (예전 방식 호환) 풀네임이 와 있으면 그대로 자동 매칭
            const matched = state.students.find(s => s.name === r.studentName);
            if (matched) studentId = matched.id;
            else unmatchedNames.push(r.studentName);
            idx = studentId
              ? (() => {
                  const byId = state.rounds.findIndex(x => x.date === r.date && x.grade === r.grade && x.studentId === studentId);
                  if (byId !== -1) return byId;
                  return state.rounds.findIndex(x => x.date === r.date && x.grade === r.grade && !x.studentId && x.studentName === r.studentName);
                })()
              : -1;
          } else {
            // 같은 날짜·학년이어도 진도가 달라 시험지 내용(유형 구성)이 다르면 별개 회차로 취급
            // (같은 파일을 다시 가져올 때만 갱신되도록 유형명 시그니처까지 매칭 키에 포함)
            idx = state.rounds.findIndex(x => x.date === r.date && x.grade === r.grade && !x.studentId && !x.individual && (x.types || []).map(t => t.name).join('|') === topicKey);
          }

          const payload = { date: r.date, grade: r.grade, total: r.total || 30, types: r.types, title: r.title || undefined, difficulty: r.difficulty || undefined, competency: r.competency || undefined, individual: r.individual || undefined, studentId: studentId || undefined, studentName: r.studentName || undefined };
          if (idx === -1) {
            state.rounds.push({ id: uid(), ...payload });
            added++;
          } else {
            state.rounds[idx] = { ...state.rounds[idx], ...payload };
            updated++;
          }
        });
        saveState();
        renderRounds(); populateSelects();
        toast(`시험지 ${added}개 추가, ${updated}개 갱신했어요.${unmatchedNames.length ? ' (학생 미발견: ' + unmatchedNames.join(', ') + ')' : ''}`);
      } catch (err) {
        alert('올바른 시험지 분석 파일이 아니에요.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
});

function exportSharedRounds() {
  if (!state.rounds.length) { toast('내보낼 회차가 없어요.'); return; }
  // 이름 전체가 들어간 예전 방식 개별시험지는 공용(GitHub) 파일에 절대 포함하지 않음 — 개인정보라서
  const legacyFullName = state.rounds.filter(r => r.studentName && !r.individual);
  const payload = state.rounds
    .filter(r => !(r.studentName && !r.individual))
    .map(r => {
      // studentId는 이 컴퓨터에서만 의미 있는 값이라 공용 파일에는 빼고, 받는 쪽에서 각자 학생을 고르게 함
      const { examFile, studentId, ...rest } = r;
      return rest;
    });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'rounds-shared.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast(`공용 회차 파일을 내보냈어요.${legacyFullName.length ? ' (이름 전체가 들어간 개별시험지 ' + legacyFullName.length + '개는 제외됐어요)' : ''} Claude에게 전달해서 GitHub에 반영해달라고 하세요.`);
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('exportRoundsBtn');
  if (btn) btn.addEventListener('click', exportSharedRounds);
});
