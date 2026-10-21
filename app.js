/* 캐치유테스트 리포트 — 로컬 저장(localStorage) 기반, 서버/로그인 불필요 */

const STORAGE_KEY = 'catchu_v1';
const TYPE_COLORS = ['#3a3a3a', '#c8102e', '#1e7a3c', '#1f4e8c', '#8a5a00', '#6b6b6b', '#7b2d8b', '#b36b00'];
const COMPETENCY_LABELS = { '문제해결': '문제해결역량', '추론': '추론역량', '의사소통': '의사소통역량', '연결': '연결역량', '정보처리': '정보처리역량' };
// 2022 개정 수학과 교육과정의 '교수·학습 방법'에서 각 역량을 기르는 방법으로 제시한 내용을 바탕으로 요약함
const COMPETENCY_DESCRIPTIONS = {
  '문제해결': '풀이법이나 답이 하나로 정해지지 않은 문제를 통해\n조건 분석 → 계획 → 실행 → 반성의 과정으로 풀어보며 기르는 능력',
  '추론': '규칙을 찾고 "왜", "어떻게"를 따져 수학적 사실을 논리적으로 정당화하고 그 과정을 되돌아보며 기르는 능력',
  '의사소통': '수학 용어·기호·표·그래프를 정확히 쓰고\n자신의 생각과 풀이 전략을 수학적 표현으로 나타내며 기르는 능력',
  '연결': '영역·학년군 안팎의 개념을 유기적으로 연계해 새 지식을 만들고\n실생활·타 교과와 이어 수학의 쓸모를 깨달으며 기르는 능력',
  '정보처리': '실생활·수학적 상황의 자료를 탐색·수집·처리해 합리적으로 판단하고, 교구·공학 도구로 추상적 내용을 시각화해 직관적으로 이해하며 기르는 능력',
};
// 시험지 파일은 두 가지로 다룸:
// - 분석용(AI에 보내기): 최대 20MB까지 받음. 큰 사진은 자동으로 줄여서(AI가 받는 이미지 한도 5MB 이내) 씀
// - 보관용(이 컴퓨터 저장공간에 남기기): 1MB 이하일 때만. 브라우저 저장공간이 총 5MB 정도라, 큰 파일을 남기면 학생·채점 기록 저장이 실패함
const MAX_ANALYZE_FILE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_FOR_AI_BYTES = 3.5 * 1024 * 1024;
const MAX_EXAM_FILE_BYTES = 1 * 1024 * 1024;
const STANDARD_CLASSES = ['MM1-BETA','MM2-GAMMA','MM3-BETA','MH1-GAMMA','MH2-ALPHA','MH2-GAMMA','MH3-정시','TM1-GAMMA','TM2-GAMMA','TM3-GAMMA','TH1-BETA','TH2-BETA','TH1-ALPHA','SH2-ALPHA','SH2-기하','MP-INDV1','MP-INDV2','TP-INDV1','TP-INDV2','입학테스트'];
const TEACHER_OPTIONS = ['차성빈','방희진','문태민','목윤재','오민경'];
const CLASS_TEACHER_MAP = {
  'MM1-BETA': '문태민', 'MM2-GAMMA': '문태민', 'TM1-GAMMA': '문태민', 'TM2-GAMMA': '문태민',
  'MP-INDV1': '문태민', 'TP-INDV1': '문태민', 'MP-INDV2': '오민경', 'TP-INDV2': '오민경',
  'MH1-GAMMA': '목윤재', 'TH1-BETA': '목윤재', 'MM3-BETA': '목윤재', 'TM3-GAMMA': '목윤재',
  'MH2-GAMMA': '방희진', 'TH2-BETA': '방희진',
  'MH2-ALPHA': '차성빈', 'TH1-ALPHA': '차성빈', 'SH2-ALPHA': '차성빈',
  'MH3-정시': '방희진', 'SH2-기하': '목윤재',
};
function teacherTitle(name) { return name === '차성빈' ? '원장' : '선생님'; }

// 학부모용 화면·PDF에 선생님 이름을 영어 이름과 함께 "차성빈(Felix)" 형식으로 보여줌
const TEACHER_ENGLISH_NAME = { '차성빈': 'Felix', '문태민': 'Lucas', '방희진': 'Celina', '목윤재': 'Dave', '오민경': 'Lia' };
function teacherDisplayName(name) {
  const en = TEACHER_ENGLISH_NAME[name];
  return en ? `${name}(${en})` : name;
}

// 이 컴퓨터에서 로그인한 선생님이 누구인지 (계산기록/백업 파일에는 안 들어가고, 이 브라우저에만 저장됨)
const CURRENT_TEACHER_KEY = 'catchu_current_teacher';
// 로그인한 선생님(서버 계정의 이름)이 곧 담당 선생님 — 로그인돼 있으면 그 선생님으로 고정되고 선택칸에서 바꿀 수 없음
function lockedTeacher() { return (window.KMMS && window.KMMS.teacherName) || ''; }
function getCurrentTeacher() { return lockedTeacher() || localStorage.getItem(CURRENT_TEACHER_KEY) || ''; }
function teacherSelectHtml() {
  const lt = lockedTeacher();
  return lt ? `<option value="${lt}">${lt}</option>`
    : '<option value="">담당 선생님 선택 (전체 보기)</option>' + TEACHER_OPTIONS.map(t => `<option value="${t}">${t}</option>`).join('');
}
function refreshTeacherSelects() {
  const lt = lockedTeacher();
  if (lt) setCurrentTeacher(lt);
  ['landingTeacherSel', 'currentTeacherSel', 'textbookTeacherSel', 'studentsTeacherSel'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = teacherSelectHtml();
    el.disabled = !!lt;
    el.title = lt ? '로그인한 선생님이 담당 선생님으로 고정돼요' : '';
    el.value = getCurrentTeacher();
  });
}
function setCurrentTeacher(t) {
  if (t) localStorage.setItem(CURRENT_TEACHER_KEY, t);
  else localStorage.removeItem(CURRENT_TEACHER_KEY);
}
// 원장님처럼 모든 학년·모든 학생을 채점/조회해야 하는 선생님 — 이 선생님을 고르면 담당 학생 제한 없이 전체가 다 보임
const ALL_ACCESS_TEACHERS = ['차성빈'];
function hasAllAccess() { return ALL_ACCESS_TEACHERS.includes(getCurrentTeacher()); }
// 담당 선생님이 선택되어 있으면 그 선생님 학생만 남기고, 선택 안 했거나 전체 권한 선생님이면 그대로 반환
// 지금 화면이 어떤 범위의 데이터를 보여줘야 하는지: 입학테스트 화면은 'entrance', 학생 관리·대문은 'all'(전부), 나머지(캐치유테스트·교재)는 'regular'(입학테스트 제외)
function appScope() {
  const cl = document.body.classList;
  if (cl.contains('view-entrance')) return 'entrance';
  if (cl.contains('view-students') || cl.contains('view-landing')) return 'all';
  return 'regular';
}
let studentsShowHidden = false;   // 학생 관리 화면에서만 켜지는 "숨긴 학생도 보기"
function inStudentScope(st) {
  const sc = appScope();
  if (st.hidden && !(sc === 'all' && studentsShowHidden)) return false;
  if (sc === 'all') return true;
  return sc === 'entrance' ? isEntranceStudent(st) : !isEntranceStudent(st);
}
function inRoundScope(r) {
  const sc = appScope();
  if (sc === 'all') return true;
  return sc === 'entrance' ? isEntranceRound(r) : !isEntranceRound(r);
}
function scopedRounds() { return state.rounds.filter(inRoundScope); }
function filterByCurrentTeacher(students) {
  const t = getCurrentTeacher();
  const scoped = students.filter(inStudentScope);
  return t && !hasAllAccess() ? scoped.filter(s => s.teacher === t) : scoped;
}
// 드롭다운용: 담당 선생님을 고르면 그 선생님 학생이 맨 위, 다른 선생님 반 학생은 아래에 따로 묶여서 함께 보임
// (숨기지 않아서 다른 반 학생도 바로 채점·조회할 수 있음). 담당 선생님을 안 고르면 전부 한 줄로.
function splitMineAndOthers(students) {
  const scoped = students.filter(inStudentScope);
  const t = getCurrentTeacher();
  if (!t) return { mine: scoped, others: [], t };
  return { mine: scoped.filter(s => s.teacher === t), others: scoped.filter(s => s.teacher !== t), t };
}
function groupedOptions(mine, others, t, optFn) {
  if (mine.length && others.length) {
    return `<optgroup label="내 반 · ${escapeHtml(t)}">${mine.map(optFn).join('')}</optgroup><optgroup label="다른 반">${others.map(optFn).join('')}</optgroup>`;
  }
  return mine.concat(others).map(optFn).join('');
}

// 정답률 기준 난이도 6단계 (문항 하나 또는 시험지 전체 정답률에 공통으로 사용)
// 구간을 5%p씩 위로 옮겨서(예전 기준보다 높은 정답률이어야 "쉬움"으로 분류됨), 같은 정답률이라도
// 난이도 숫자가 예전보다 대략 0.4~0.6 정도 더 높게 나오도록 조정함
function difficultyTierByAccuracy(pct) {
  if (pct >= 95) return { n: 1, label: '하' };
  if (pct >= 85) return { n: 2, label: '중하' };
  if (pct >= 70) return { n: 3, label: '중' };
  if (pct >= 60) return { n: 4, label: '중상' };
  if (pct >= 50) return { n: 5, label: '상' };
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

// effort: 모델이 답하기 전에 "생각"하는 깊이(low/medium/high). 이 모델은 생각에 쓴 토큰도 max_tokens에서 같이 깎이므로,
// 단순 분류·글쓰기에는 낮춰야 생각만 하다가 한도가 차서 답이 잘리는 일이 없음
async function callClaudeAPI({ content, maxTokens = 16000, effort = 'medium' }) {
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
      output_config: { effort },
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    let msg = res.status + ' ' + res.statusText;
    try { const body = await res.json(); if (body?.error?.message) msg = body.error.message; } catch (e) {}
    throw new Error(msg);
  }
  const data = await res.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text || '').join('');
  return { text, stopReason: data.stop_reason, usage: data.usage || null };
}

// 사용량(토큰)과 예상 비용 표시 — 모델 단가(100만 토큰당 입력 $2, 출력 $10)와 환율(1달러=1,400원 가정) 기준의 어림값.
// 출력 토큰에는 AI가 "생각"하는 데 쓴 토큰도 포함되어 있음(같은 단가로 청구됨)
const API_PRICE_USD_PER_MTOK = { input: 2, output: 10 };
const KRW_PER_USD = 1400;
function addUsage(a, b) {
  return { input_tokens: (a?.input_tokens || 0) + (b?.input_tokens || 0), output_tokens: (a?.output_tokens || 0) + (b?.output_tokens || 0) };
}
function usageCostText(u) {
  if (!u) return '';
  const inTok = u.input_tokens || 0, outTok = u.output_tokens || 0;
  const won = (inTok * API_PRICE_USD_PER_MTOK.input + outTok * API_PRICE_USD_PER_MTOK.output) / 1e6 * KRW_PER_USD;
  const wonTxt = won < 1 ? '1원 미만' : `약 ${Math.round(won).toLocaleString('ko-KR')}원`;
  return ` · 사용량: 입력 ${inTok.toLocaleString('ko-KR')} + 출력 ${outTok.toLocaleString('ko-KR')} 토큰, ${wonTxt}`;
}

function extractJson(text, stopReason) {
  let t = (text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch (err) {
    if (stopReason === 'max_tokens') throw new Error('AI가 분석하다가 길이 한도에 걸려 답이 잘렸어요. 다시 한 번 눌러주세요.');
    throw new Error('AI 응답을 이해하지 못했어요. 다시 시도해주세요.');
  }
}

// 이 학년에서 이미 등록된 시험지가 쓰고 있는 "대단원 - 중단원" 이름 목록 — 같은 단원은 항상 같은 이름으로 쓰게 해서
// 보고서 카드가 이름 차이(띄어쓰기·표현) 때문에 쪼개지지 않게 함
function knownUnitsForGrade(grade) {
  if (!grade) return [];
  const set = new Set();
  state.rounds.filter(r => r.grade === grade).forEach(r => (r.types || []).forEach(t => {
    const parts = (t.unit || '').split(' - ').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) set.add(parts.slice(0, 2).join(' - '));
  }));
  return Array.from(set).sort().slice(0, 60);
}

const EXAM_ANALYSIS_PROMPT_TEMPLATE = (total, knownUnits = [], grade = '') => `다음은 초·중·고 수학 시험지 이미지입니다. 이 시험지는 총 ${total}문항입니다.
시험지에 표시된 유형(또는 단원) 구분을 참고하여 문항 번호를 유형별로 묶고, 각 유형이 대한민국 2022 개정 수학과 교육과정의 어떤 단원에 해당하는지 "대단원 - 중단원 - 소단원" 3단계로 판단해주세요 (예: "도함수의 활용 - 접선의 방정식과 평균값 정리 - 접선의 기울기"). 대단원·중단원은 교과서의 큰 챕터/절 단위로 크게 잡고, 소단원에 문항의 구체적인 개념을 적으세요.
유형명(name)은 시험지에 문항마다 인쇄된 유형 이름이 있으면 그 이름을 그대로 쓰세요. 이름이 같거나 "(1)", "(2)", "①"처럼 번호만 다른 것은 하나의 유형으로 합쳐서 문항 번호를 한데 묶으세요 (예: "원의 접선의 방정식(1)", "(2)", "(3)" → "원의 접선의 방정식" 하나). 인쇄된 유형 이름이 없을 때만 직접 굵직하게 묶어주세요 (같은 단원 안에서 유형이 2~3개를 넘지 않게).${knownUnits.length ? `
같은 단원은 항상 같은 이름으로 써야 합니다. 이 학년(${grade})에서 이미 쓰고 있는 "대단원 - 중단원" 목록이에요. 문항이 이 중 어느 단원에 해당하면 철자와 띄어쓰기까지 목록의 이름을 글자 그대로 쓰고, 어느 것에도 맞지 않는 새 단원일 때만 새 이름을 만드세요:
${knownUnits.map(u => '- ' + u).join('\n')}` : ''}
또한 문항 하나하나마다(전체 문항 각각에 대해) 다음 두 가지를 판단해주세요:
- 난이도: 문항별 정답률이 시험지에 표시되어 있다면 그 정답률을 기준으로 아래 표에 따라 매겨주세요. 정답률 정보가 없다면(신규 시험지 등) 문제 내용을 보고 합리적으로 추정해주세요.
  95% 이상 → 1(하) · 85~95% → 2(중하) · 70~85% → 3(중) · 60~70% → 4(중상) · 50~60% → 5(상) · 50% 미만 → 6(최상)
- 핵심역량: 문제해결/추론/의사소통/연결/정보처리 중 그 문항을 푸는 데 "주로 요구되는 사고 과정"이 무엇인지 하나를 판단해주세요. 객관식/단답형이라도 상관없어요 — 서술형인지 여부가 아니라, 문제를 푸는 데 어떤 역량이 핵심인지로 판단하세요. 같은 유형 안에서도 문항마다 다를 수 있으니 문항별로 판단하고, 아래 기준을 참고해 다섯 역량이 실제 문항 성격에 맞게 고루 나오도록 해주세요 (문제해결/추론 두 가지로만 쏠리지 않게 주의):
  - 문제해결: 여러 단계의 풀이 전략을 세워야 답이 나오는 복합적인 문제, 배운 개념을 낯선 상황에 응용해야 하는 문제
  - 추론: 주어진 조건에서 논리적으로 결론을 이끌어내거나 성질·공식이 성립하는 이유를 따져야 하는 문제
  - 의사소통: 그래프·표·도형 등 수학적 표현을 읽고 해석하는 문제, 식↔그래프↔표 사이를 변환하는 문제 (서술형이 아니라 객관식이어도 해당됩니다)
  - 연결: 실생활 소재의 문장제(word problem)처럼 수학을 현실 상황과 이어서 푸는 문제, 서로 다른 단원·영역의 개념이 한 문제에 함께 쓰이는 융합 문제(예: 함수+도형, 방정식+통계), 배운 개념을 다른 단원 개념과 연결지어야 하는 문제는 모두 연결로 판단하세요
  - 정보처리: 표·통계·여러 조건 등 주어진 자료를 정리·계산해서 처리하는 문제, 공식에 값을 대입해 기계적으로 계산하는 문제

시험지 맨 위 제목에 "9월 5주차"처럼 주차가 인쇄돼 있으면, 그 주차를 week에 "9-5" 형식(월-주차 숫자)으로, 시험지에 인쇄된 제목을 printedTitle에 그대로 적어주세요. 주차가 인쇄돼 있지 않으면 week는 빈 문자열("")로 두세요 (파일 이름이나 추측으로 채우지 마세요).

아래 JSON 형식으로만 응답하세요. 다른 설명이나 마크다운 없이 JSON 객체만 출력하세요:
{
  "week": "9-5",
  "printedTitle": "[캐치유] 9월 5주차",
  "total": ${total},
  "types": [
    { "name": "유형명", "unit": "대단원 - 중단원 - 소단원", "questions": [1,2,3] }
  ],
  "difficulty": { "1": 2, "2": 3 },
  "competency": { "1": "문제해결", "2": "추론" }
}`;

// "9-5주차" 같은 표기에 해당하는 금요일을 날짜 목록에서 찾음. 주차에는 연도가 없어서 같은 표기가 다른 해에도 있으므로,
// 오늘 기준 최근 10주 ~ 앞으로 5주 안에서 오늘과 가장 가까운 금요일만 고름 (엉뚱하게 먼 날짜로 맞추는 실수를 막기 위함)
function findFridayOptionForWeek(dateSel, label) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const DAY = 86400000;
  const candidates = Array.from(dateSel.options).filter(o => {
    if (dateToWeekLabel(o.value) !== label) return false;
    const diffDays = (new Date(o.value + 'T00:00:00') - today) / DAY;
    return diffDays >= -70 && diffDays <= 35;
  });
  candidates.sort((a, b) => Math.abs(new Date(a.value + 'T00:00:00') - today) - Math.abs(new Date(b.value + 'T00:00:00') - today));
  return candidates[0] || null;
}

// AI가 시험지에서 읽은 주차(week "9-5")로 날짜를 그 주 금요일에 맞추고, 제목에 주차가 없으면 시험지에 인쇄된 제목을 넣음.
// 파일 이름 등으로 이미 들어간 제목의 주차와 시험지에 인쇄된 주차가 다르면 인쇄된 쪽을 따르고 경고 문구를 돌려줌.
function applyPrintedWeek(json) {
  if (editingRoundId) return '';
  if (isElementaryGrade(document.getElementById('roundGrade').value)) return ' (초등은 날짜별 회차라서 날짜를 직접 골라주세요)';
  const wk = String(json.week || '').match(/^\s*(\d{1,2})\s*[-월]\s*(\d)/);
  if (!wk) return ' (시험지에 주차가 안 보여서 날짜는 직접 확인해주세요)';
  const label = `${parseInt(wk[1], 10)}-${wk[2]}주차`;
  const titleInput = document.getElementById('roundTitle');
  const weekRe = /(\d{1,2})\s*(?:월|-)\s*(\d)\s*주\s*차/;
  let note = '';
  const typed = titleInput.value.match(weekRe);
  const typedLabel = typed ? `${parseInt(typed[1], 10)}-${typed[2]}주차` : '';
  if (typedLabel && typedLabel !== label) note = ` ⚠ 제목(${typedLabel})과 시험지에 적힌 주차(${label})가 달라요. 시험지 기준으로 맞췄으니 확인해주세요.`;
  const printed = String(json.printedTitle || '').trim();
  const dateSel = document.getElementById('roundDate');
  const opt = findFridayOptionForWeek(dateSel, label);
  // 날짜를 못 찾았으면 제목도 바꾸지 않음 (제목과 날짜가 서로 다른 주차를 가리키는 일이 없도록)
  if (!opt) return ` (시험지의 ${label}에 맞는 최근 날짜를 못 찾았어요. 날짜를 직접 골라주세요)`;
  if ((!typedLabel || typedLabel !== label) && printed && weekRe.test(printed)) titleInput.value = printed;
  setRoundDate(opt.value);
  return ` · 시험지에 적힌 ${label}에 맞춰 날짜를 ${opt.textContent}로 선택했어요.` + note;
}

// 분석이 끝나면 (새 시험지이고 학년·날짜가 정해져 있으면) 항상 회차로 자동 저장함
function maybeAutoSaveRound(status) {
  if (editingRoundId) return false;
  if (!document.getElementById('roundGrade').value || !document.getElementById('roundDate').value) {
    status.textContent += ' · 학년을 고른 뒤 "회차 저장"을 눌러주세요.';
    return false;
  }
  document.getElementById('roundForm').requestSubmit();
  return true;
}

async function analyzeExamWithAI() {
  const btn = document.getElementById('aiAnalyzeBtn');
  const status = document.getElementById('aiAnalyzeStatus');
  if (!pendingExamFile || !pendingExamFile.dataUrl) {
    status.textContent = '먼저 시험지를 업로드해주세요 (이미지나 PDF, 20MB 이하).';
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
  let usage = null;
  try {
    const examGrade = document.getElementById('roundGrade').value;
    const analysisContent = [fileBlock, { type: 'text', text: EXAM_ANALYSIS_PROMPT_TEMPLATE(total, knownUnitsForGrade(examGrade), examGrade) }];
    let { text, stopReason, usage: u1 } = await callClaudeAPI({ content: analysisContent, maxTokens: 16000, effort: 'medium' });
    usage = u1;
    if (stopReason === 'max_tokens') {
      // 생각에 토큰을 다 써서 답이 잘린 경우 — 생각을 줄이고 한도를 늘려 자동으로 한 번 더 시도함
      status.textContent = '분석이 길어져서 한 번 더 시도하고 있어요...';
      const retry = await callClaudeAPI({ content: analysisContent, maxTokens: 24000, effort: 'low' });
      text = retry.text; stopReason = retry.stopReason;
      usage = addUsage(usage, retry.usage); // 재시도분까지 합산
    }
    const json = extractJson(text, stopReason);
    if (!Array.isArray(json.types) || !json.types.length) throw new Error('분석 결과가 비어있어요. 시험지 사진이 잘 보이는지 확인해주세요.');
    document.getElementById('typeRows').innerHTML = '';
    json.types.forEach(t => addTypeRow(t.name || '', rangeToString(t.questions || []), t.unit || ''));
    if (json.total) document.getElementById('roundTotal').value = json.total;
    pendingDifficulty = (json.difficulty && typeof json.difficulty === 'object') ? json.difficulty : null;
    pendingCompetency = (json.competency && typeof json.competency === 'object') ? json.competency : null;
    updateCoverageHint();
    let weekNote = applyPrintedWeek(json);
    if (isElementaryGrade(document.getElementById('roundGrade').value)) {
      pendingDifficulty = elementaryFixedDifficulty(parseInt(document.getElementById('roundTotal').value, 10) || total);
      weekNote += ' · 초등 시험지라 난이도는 "중하"로 고정했어요.';
    }
    document.getElementById('manualFallback').open = true;
    status.style.color = weekNote.includes('⚠') || weekNote.includes('직접') ? 'var(--warn-ink)' : 'var(--good)';
    status.textContent = '분석 완료! 아래에서 내용을 확인하고 회차를 저장하세요.' + weekNote + usageCostText(usage);
    toast('AI 분석이 끝났어요.');
    // 분석 결과를 바로 회차로 저장 (잘못됐으면 목록의 "수정"으로 고치면 됨)
    if (maybeAutoSaveRound(status)) {
      status.style.color = 'var(--good)';
      status.textContent = '분석 완료! 회차로 자동 저장했어요.' + weekNote + usageCostText(usage) + ' (고칠 곳은 아래 목록에서 "수정")';
    }
  } catch (err) {
    console.error(err);
    status.style.color = 'var(--critical)';
    status.textContent = '분석 실패: ' + err.message + usageCostText(usage);
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

/* ---------- 시험지 자동 공유 (저장하면 GitHub 공용 파일에 바로 올림) ---------- */

const SHARE_REPO = 'FELIXCHA-23/catchu-report';
const SHARE_PATH = 'rounds-shared.json';
const SHARE_BRANCH = 'main';
const GH_TOKEN_STORAGE = 'catchu_gh_token'; // 백업 파일(state)에는 절대 포함하지 않음
function getGhToken() { try { return localStorage.getItem(GH_TOKEN_STORAGE) || ''; } catch (e) { return ''; } }
function setGhToken(t) { try { if (t) localStorage.setItem(GH_TOKEN_STORAGE, t); else localStorage.removeItem(GH_TOKEN_STORAGE); } catch (e) {} }

function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// 공용 파일에 올릴 회차 내용 — 시험지 원본(examFile)과 이 컴퓨터 학생 연결(studentId)은 빼고,
// 이름 전체가 들어간 예전 방식 개별시험지는 개인정보라서 아예 올리지 않음(null)
function sharedRoundPayload(r) {
  if (r.studentName && !r.individual) return null;
  const { examFile, studentId, examPath, examName, ...rest } = r;
  return rest;
}

function ghFetch(url, token, opts = {}) {
  return fetch(url, {
    cache: 'no-store',
    ...opts,
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token, ...(opts.headers || {}) },
  });
}

async function ghErrorMessage(res) {
  let detail = '';
  try { detail = (await res.json()).message || ''; } catch (e) {}
  if (res.status === 401) return '토큰이 올바르지 않거나 만료됐어요. 데이터 관리 탭에서 토큰을 다시 넣어주세요.';
  if (res.status === 403 || res.status === 404) return '이 저장소에 쓸 권한이 없어요. 토큰 권한(Contents: Read and write)을 확인해주세요.';
  return `${res.status} ${detail || res.statusText}`;
}

// 공용 파일을 받아 이 회차를 추가/갱신해서 다시 올림. 다른 선생님이 동시에 올려서 충돌하면 다시 받아서 합쳐 재시도함.
async function publishRoundToShared(round) {
  const token = getGhToken();
  if (!token) throw new Error('GitHub 토큰이 없어요.');
  const payload = sharedRoundPayload(round);
  if (!payload) throw new Error('이름이 들어간 예전 방식 개별시험지는 공용으로 올릴 수 없어요.');
  const url = `https://api.github.com/repos/${SHARE_REPO}/contents/${SHARE_PATH}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const getRes = await ghFetch(`${url}?ref=${SHARE_BRANCH}`, token);
    if (!getRes.ok) throw new Error(await ghErrorMessage(getRes));
    const meta = await getRes.json();
    let text;
    if (meta.content && meta.encoding === 'base64') {
      text = b64ToUtf8(meta.content);
    } else {
      const rawRes = await ghFetch(`${url}?ref=${SHARE_BRANCH}`, token, { headers: { Accept: 'application/vnd.github.raw+json' } });
      if (!rawRes.ok) throw new Error(await ghErrorMessage(rawRes));
      text = await rawRes.text();
    }
    const list = JSON.parse(text);
    if (!Array.isArray(list)) throw new Error('공용 파일 형식이 올바르지 않아요.');
    const idx = list.findIndex(x => x.id === payload.id);
    if (idx === -1) list.push(payload); else list[idx] = payload;
    const putRes = await ghFetch(url, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `시험지 공유: ${payload.title || (payload.grade + ' ' + payload.date)}`,
        content: utf8ToB64(JSON.stringify(list, null, 2)),
        sha: meta.sha,
        branch: SHARE_BRANCH,
      }),
    });
    if (putRes.ok) return;
    if (putRes.status === 409) continue;
    if (putRes.status === 422) {
      let msg = '';
      try { msg = (await putRes.clone().json()).message || ''; } catch (e) {}
      if (/sha|match/i.test(msg)) continue;
    }
    throw new Error(await ghErrorMessage(putRes));
  }
  throw new Error('다른 선생님이 동시에 올리는 중이라 실패했어요. 잠시 후 다시 저장해주세요.');
}

// 회차를 저장한 직후 호출 — 토큰이 있으면 자동으로 공용 파일에 올림(없으면 예전처럼 이 컴퓨터에만 저장).
// 저장 자체는 이미 끝난 뒤라서, 공유가 실패해도 선생님 화면의 회차는 그대로 남음
async function shareRoundToGitHub(round) {
  if (!getGhToken() || !round) return;
  toast('모든 선생님이 쓸 수 있게 공유하는 중이에요...');
  try {
    await publishRoundToShared(round);
    toast('공유 완료! 1~2분 뒤 모든 선생님 화면에 나타나요.');
  } catch (err) {
    console.error(err);
    alert('시험지는 이 컴퓨터에 저장됐지만, 다른 선생님께 공유하지 못했어요.\n\n' + err.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('ghTokenInput');
  const status = document.getElementById('ghTokenStatus');
  const btn = document.getElementById('saveGhTokenBtn');
  if (!input || !btn) return;
  input.value = getGhToken();
  if (getGhToken()) status.textContent = '저장된 토큰이 있어요.';
  btn.addEventListener('click', async () => {
    const t = input.value.trim();
    setGhToken(t);
    if (!t) { status.style.color = 'var(--muted)'; status.textContent = '토큰을 지웠어요.'; return; }
    status.style.color = 'var(--muted)';
    status.textContent = '연결 확인 중...';
    try {
      const res = await ghFetch(`https://api.github.com/repos/${SHARE_REPO}/contents/${SHARE_PATH}?ref=${SHARE_BRANCH}`, t);
      if (!res.ok) throw new Error(await ghErrorMessage(res));
      status.style.color = 'var(--good)';
      status.textContent = '연결됐어요! 이제 시험지를 저장하면 자동으로 공유돼요.';
    } catch (err) {
      status.style.color = 'var(--critical)';
      status.textContent = '연결 실패: ' + err.message;
    }
  });
});

let state = loadState();
let editingRoundId = null;
let editingStudentId = null;
let pendingExamFile = null;
let pendingDifficulty = null;
let pendingCompetency = null;
// 채점 입력에서 마지막으로 저장한 학생 — 재시험 탭으로 넘어갔을 때 그 학생이 바로 선택되어 있게 씀
let lastScoredStudentId = null;

// 보고서 탭의 "기간" 드롭다운 기본값 — 이번 배포 기준 보고서 발행 기간(8-3주차~9-3주차)을 고정으로 기본 설정함.
// 다음 달 배치에는 이 두 날짜만 그때 기간의 시작/끝 회차 날짜로 바꿔주면 됨.
const DEFAULT_REPORT_FROM_DATE = '2026-08-21'; // 8-3주차
const DEFAULT_REPORT_TO_DATE = '2026-09-18'; // 9-3주차
// 보고서 탭에서 마지막으로 기간을 세팅해준 학생 — 같은 학생이면 선생님이 고른 기간을 유지하고,
// 다른 학생으로 바뀌면 항상 위 기본 기간으로 다시 리셋되게 함
let lastReportRangeStudentId = undefined;

/* ---------- state ---------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (!data.teacherNotes) data.teacherNotes = {};
      if (!data.retests) data.retests = [];
      if (!data.gradeOverrides) data.gradeOverrides = {};
      if (!data.difficultyOverrides) data.difficultyOverrides = {};
      if (!data.reportHidden) data.reportHidden = {};
      if (!data.textbook) data.textbook = { books: [], results: [] };
      if (!Array.isArray(data.textbook.results)) data.textbook.results = [];
      if (!data.sharedRoundIds) data.sharedRoundIds = [];
      if (!data.studentDone) data.studentDone = {};
      if (!data.studentMemo) data.studentMemo = {};
      if (!data.studentMemoRetest) data.studentMemoRetest = {};
      if (!Array.isArray(data.reportLog)) data.reportLog = [];
      return data;
    }
  } catch (e) { console.warn('load failed', e); }
  return { students: [], rounds: [], results: [], teacherNotes: {}, retests: [], gradeOverrides: {}, difficultyOverrides: {}, reportHidden: {}, textbook: { books: [], results: [] }, sharedRoundIds: [], studentDone: {}, studentMemo: {}, studentMemoRetest: {} };
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

// 학교명 끝의 초/중/고와 학년 앞의 초/중/고가 겹치면(예: "도담초"+"초5") 하나로 합침 — "도담초5"
function schoolGradeText(school, grade) {
  school = String(school || '').trim();
  grade = String(grade || '').trim();
  if (!school) return grade || '-';
  if (!grade) return school;
  if (['초', '중', '고'].includes(school.slice(-1)) && school.slice(-1) === grade.slice(0, 1)) {
    return school + grade.slice(1);
  }
  return school + grade;
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
    // 월/일을 항상 2자리로 맞춰서(예: 09월 05일) 글자 수가 날짜마다 달라도 (금) 위치가 흔들리지 않게 함
    return `<option value="${iso}">${String(d.getMonth() + 1).padStart(2, '0')}월 ${String(d.getDate()).padStart(2, '0')}일 (금)</option>`;
  });
  // 기존 데이터의 날짜가 금요일이 아니거나 목록 범위 밖이면(과거 회차 등) 선택 유지를 위해 추가해둠
  if (keepValue && !fridays.some(d => toISODate(d) === keepValue)) {
    options.unshift(`<option value="${keepValue}">${keepValue} (금요일 아님)</option>`);
  }
  selectEl.innerHTML = options.join('');
  if (keepValue) selectEl.value = keepValue;
  else selectEl.value = toISODate(nearestFriday);
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
function weekdayKo(iso) { return WEEKDAY_KO[new Date(iso + 'T00:00:00').getDay()]; }
// 초등은 금요일 주간 시험이 아니라 등원하는 날마다 시험을 보므로 회차를 날짜(요일)로 지정함
function isElementaryGrade(g) { return /^초/.test(g || ''); }
const ELEMENTARY_DAILY_UNTIL = '2026-12-18'; // 이 날짜까지는 등원일마다 시험
// 초등 시험지의 문항별 난이도는 전부 2("중하")로 고정
function elementaryFixedDifficulty(total) {
  const d = {};
  for (let q = 1; q <= (total || 30); q++) d[q] = 2;
  return d;
}

// 초등: 월~금 모든 평일을 고를 수 있는 목록 (지난 30일 ~ 12월 18일, 그 뒤여도 최소 2주 앞까지). 기본 선택은 오늘(평일이 아니면 다음 평일)
function populateDailySelect(selectEl, keepValue) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(today.getDate() - 30);
  const minEnd = new Date(today); minEnd.setDate(today.getDate() + 14);
  const until = new Date(ELEMENTARY_DAILY_UNTIL + 'T00:00:00');
  const end = until > minEnd ? until : minEnd;
  const days = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() >= 1 && d.getDay() <= 5) days.push(new Date(d));
  }
  const options = days.map(d => `<option value="${toISODate(d)}">${String(d.getMonth() + 1).padStart(2, '0')}월 ${String(d.getDate()).padStart(2, '0')}일 (${WEEKDAY_KO[d.getDay()]})</option>`);
  if (keepValue && !days.some(d => toISODate(d) === keepValue)) {
    options.unshift(`<option value="${keepValue}">${keepValue} (${weekdayKo(keepValue)})</option>`);
  }
  selectEl.innerHTML = options.join('');
  const def = new Date(today);
  while (def.getDay() === 0 || def.getDay() === 6) def.setDate(def.getDate() + 1);
  selectEl.value = keepValue || toISODate(def);
}

// 학년에 맞는 날짜 목록: 초등은 요일별(매일), 그 외는 금요일만
function populateRoundDateSelect(selectEl, grade, keepValue) {
  const daily = isElementaryGrade(grade);
  if (daily) populateDailySelect(selectEl, keepValue);
  else populateFridaySelect(selectEl, keepValue);
  selectEl.dataset.mode = daily ? 'daily' : 'friday';
  if (selectEl.id === 'roundDate') updateRoundDateUI();
}

// 회차 날짜는 "몇월 몇주차" 드롭다운과 날짜 직접 선택(아무 날짜나 가능) 두 가지로 고름.
// 실제 값은 숨겨진 목록(roundDate)이 들고 있고, 아래 두 함수가 세 칸을 항상 같은 날짜로 맞춤
function updateRoundDateUI() {
  const sel = document.getElementById('roundDate'), wk = document.getElementById('roundWeek'), dp = document.getElementById('roundDatePick');
  if (!sel || !wk || !dp) return;
  wk.style.display = appScope() === 'entrance' ? 'none' : ''; // 입학테스트는 주차 없이 날짜만 씀
  const cur = sel.value;
  const dates = Array.from(sel.options).map(o => o.value).filter(Boolean);
  if (cur && !dates.includes(cur)) dates.push(cur);
  dates.sort();
  const labels = [];
  dates.forEach(d => { const l = dateToWeekLabel(d); if (!labels.includes(l)) labels.push(l); });
  wk.innerHTML = labels.map(l => `<option value="${l}">${l}</option>`).join('');
  if (cur) wk.value = dateToWeekLabel(cur);
  dp.value = cur || '';
}
function setRoundDate(iso) {
  const sel = document.getElementById('roundDate');
  if (!sel || !iso) return;
  if (!Array.from(sel.options).some(o => o.value === iso)) {
    const opt = document.createElement('option');
    opt.value = iso; opt.textContent = `${iso} (${weekdayKo(iso)})`;
    sel.insertBefore(opt, Array.from(sel.options).find(o => o.value > iso) || null); // 날짜순 자리에 끼워 넣음
  }
  sel.value = iso;
  updateRoundDateUI();
}
document.addEventListener('DOMContentLoaded', () => {
  const wk = document.getElementById('roundWeek'), dp = document.getElementById('roundDatePick');
  if (wk) wk.addEventListener('change', () => {
    // 고른 주차의 날짜: 금요일이 있으면 금요일, 없으면 그 주차의 첫 날짜
    const sel = document.getElementById('roundDate');
    const cands = Array.from(sel.options).map(o => o.value).filter(d => d && dateToWeekLabel(d) === wk.value);
    if (!cands.length) return;
    setRoundDate(cands.find(d => new Date(d + 'T00:00:00').getDay() === 5) || cands[0]);
  });
  if (dp) dp.addEventListener('change', () => { if (dp.value) setRoundDate(dp.value); });
});

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
  // 예시보고서는 별도 패널 없이 보고서 패널을 그대로 재사용 — 포맷이 바뀌어도 항상 실제 보고서와 동일하게 유지됨
  const panelId = name === 'example' ? 'report' : name;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + panelId));
  if (name === 'score') renderScoreTab();
  if (name === 'retest') renderRetestTab();
  if (name === 'report') renderReportTab();
  if (name === 'example') openExampleReport();
}

// 어느 브라우저에서 열어도 항상 같은 모습으로 보이는 고정 예시 학생 — 실제 학생이 아니라 코드에 박아둔
// 가상의 데이터라서 localStorage 용량을 전혀 쓰지 않고, 학생목록·채점입력 등 실제 데이터 화면에는 나타나지 않음
const EXAMPLE_STUDENT_ID = 'ex_student_hong';
const EXAMPLE_STUDENT = { id: EXAMPLE_STUDENT_ID, name: '차캐슬', grade: '중2', class: '', teacher: '차성빈', school: '' };
const EXAMPLE_TYPES = [
  { name: '부등식의 해', unit: '일차부등식 - 일차부등식의 풀이 - 부등식의 해와 성질', questions: [1, 2, 3, 4] },
  { name: '연립방정식의 풀이', unit: '연립일차방정식 - 연립방정식의 풀이 - 가감법과 대입법', questions: [5, 6, 7, 8] },
  { name: '일차함수의 그래프', unit: '일차함수와 그래프 - 일차함수의 그래프 - 그래프의 절편과 기울기', questions: [9, 10, 11, 12] },
  { name: '도형의 닮음', unit: '도형의 닮음 - 닮은 도형의 성질 - 삼각형의 닮음 조건', questions: [13, 14, 15, 16] },
  { name: '자료의 정리와 해석', unit: '확률과 통계 - 자료의 정리와 해석 - 도수분포표와 히스토그램', questions: [17, 18, 19, 20] },
];
const EXAMPLE_DIFFICULTY = { 1: 2, 2: 3, 3: 2, 4: 4, 5: 3, 6: 4, 7: 2, 8: 3, 9: 2, 10: 3, 11: 4, 12: 3, 13: 3, 14: 2, 15: 4, 16: 3, 17: 2, 18: 3, 19: 3, 20: 4 };
const EXAMPLE_COMPETENCY = { 1: '문제해결', 2: '문제해결', 3: '문제해결', 4: '문제해결', 5: '추론', 6: '추론', 7: '추론', 8: '추론', 9: '의사소통', 10: '의사소통', 11: '의사소통', 12: '의사소통', 13: '연결', 14: '연결', 15: '연결', 16: '연결', 17: '정보처리', 18: '정보처리', 19: '정보처리', 20: '정보처리' };
// 기간 누적으로 실력이 느는 흐름(특히 "도형의 닮음"은 처음엔 약했다가 강점으로)과, 끝까지 보완이 필요한
// "자료의 정리와 해석"을 함께 보여주도록 오답을 일부러 짜 넣음 — 날짜는 보고서 기본 기간 안에 들어오게 맞춤
const EXAMPLE_ROUND_DEFS = [
  { id: 'ex_r1', date: '2026-08-21', title: '8월3주차 중2(예시)', wrong: [3, 6, 8, 14, 15, 16, 18, 19] },
  { id: 'ex_r2', date: '2026-08-28', title: '8월4주차 중2(예시)', wrong: [3, 8, 14, 15, 18, 19] },
  { id: 'ex_r3', date: '2026-09-04', title: '9월1주차 중2(예시)', wrong: [8, 14, 19, 20] },
  { id: 'ex_r4', date: '2026-09-11', title: '9월2주차 중2(예시)', wrong: [6, 19, 20] },
  { id: 'ex_r5', date: '2026-09-18', title: '9월3주차 중2(예시)', wrong: [8, 19, 20] },
];
const EXAMPLE_ROUNDS = EXAMPLE_ROUND_DEFS.map(r => ({
  id: r.id, date: r.date, title: r.title, grade: EXAMPLE_STUDENT.grade, total: 20,
  types: EXAMPLE_TYPES, difficulty: EXAMPLE_DIFFICULTY, competency: EXAMPLE_COMPETENCY,
}));
const EXAMPLE_RESULTS = EXAMPLE_ROUND_DEFS.map(r => ({ id: 'ex_res_' + r.id, studentId: EXAMPLE_STUDENT_ID, roundId: r.id, wrong: r.wrong }));

// 예시보고서 탭 전용 — 고정 예시 학생을 보고서 선택창에 골라두기만 하면, 나머지는 실제 보고서와 완전히 동일한
// 경로(renderReportTab)로 그려짐
function openExampleReport() {
  document.getElementById('reportStudentSel').value = EXAMPLE_STUDENT_ID;
  renderReportTab();
}

/* ================= 학생 관리 ================= */

// 한글 음절에서 초성만 뽑아냄 (완성형 한글이 아닌 글자는 그대로 둠) — "최유빈" → "ㅊㅇㅂ"
const CHOSEONG_LIST = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function toChoseong(str) {
  return Array.from(str).map(ch => {
    const code = ch.charCodeAt(0);
    return (code >= 0xAC00 && code <= 0xD7A3) ? CHOSEONG_LIST[Math.floor((code - 0xAC00) / 588)] : ch;
  }).join('');
}
// 검색어가 전부 초성 자음이면(예: "ㅊㅇㅎ") 이름의 초성끼리 비교하고, 아니면 이름에 그대로 포함되는지 봄
function studentMatchesSearch(name, query) {
  const q = query.trim();
  if (!q) return true;
  if (name.includes(q)) return true;
  if (/^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]+$/.test(q)) return toChoseong(name).includes(q);
  return false;
}

function renderStudents() {
  const wrap = document.getElementById('studentListWrap');
  const searchInput = document.getElementById('studentSearchInput');
  const query = searchInput ? searchInput.value : '';
  const showHiddenBox = document.getElementById('studentShowHidden');
  studentsShowHidden = !!(showHiddenBox && showHiddenBox.checked);
  const hiddenCount = state.students.filter(s => s.hidden).length;
  const hiddenLabel = document.getElementById('studentHiddenCount');
  if (hiddenLabel) hiddenLabel.textContent = hiddenCount ? `(숨긴 학생 ${hiddenCount}명)` : '';
  const filtered = filterByCurrentTeacher(state.students).filter(s => studentMatchesSearch(s.name, query));
  if (!state.students.length) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 학생이 없어요. 위에서 학생을 추가해보세요.</div>';
  } else if (!filtered.length) {
    wrap.innerHTML = `<div class="empty-state">${query.trim() ? '검색 결과가 없어요.' : '해당 선생님 담당 학생이 없어요.'}</div>`;
  } else {
    const rows = filtered.map(s => `
      <tr${s.hidden ? ' style="opacity:0.55;"' : ''}>
        <td>${escapeHtml(s.name)}${s.hidden ? ' <span class="badge watch" style="font-size:11px;">숨김(퇴원)</span>' : ''}${s.school ? `<br><span class="type-unit-caption">${escapeHtml(s.school)}</span>` : ''}</td>
        <td>${escapeHtml(s.grade || '-')}${s.examGrade ? `<br><span class="type-unit-caption">시험 ${escapeHtml(s.examGrade)}</span>` : ''}</td>
        <td>${escapeHtml(s.class || '-')}</td>
        <td>${escapeHtml(s.teacher || '-')}</td>
        <td class="row-actions">
          <button class="icon-btn" data-report="${s.id}">보고서</button>
          <button class="icon-btn" data-edit-student="${s.id}">수정</button>
          ${s.hidden ? `<button class="icon-btn" data-unhide-student="${s.id}">복구</button>` : `<button class="icon-btn" data-hide-student="${s.id}" title="퇴원생 등을 목록에서 숨겨요 (기록은 그대로 남아요)">숨김</button>`}
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
  wrap.querySelectorAll('[data-hide-student]').forEach(b => b.addEventListener('click', () => {
    const s = state.students.find(x => x.id === b.dataset.hideStudent);
    if (!s) return;
    if (!confirm(`"${s.name}" 학생을 숨길까요?\n(퇴원생 처리 — 목록과 선택 칸에서 사라지고, 채점 기록은 그대로 남아요. 나중에 "숨긴 학생도 보기"에서 복구할 수 있어요)`)) return;
    s.hidden = true;
    saveState(); renderAll();
    toast(`"${s.name}" 학생을 숨겼어요.`);
  }));
  wrap.querySelectorAll('[data-unhide-student]').forEach(b => b.addEventListener('click', () => {
    const s = state.students.find(x => x.id === b.dataset.unhideStudent);
    if (!s) return;
    delete s.hidden;
    saveState(); renderAll();
    toast(`"${s.name}" 학생을 다시 보이게 했어요.`);
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
          // 담당 선생님을 안 적어서 가져와도, 반 이름이 매칭표에 있으면 그 자리에서 바로 채워줌 (버튼을 따로 안 눌러도 되게)
          const teacher = s.teacher || CLASS_TEACHER_MAP[s.class] || '';
          state.students.push({ id: uid(), name: s.name, grade: s.grade || '', class: s.class || '', teacher, school: s.school || '' });
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

// 핵심역량은 문항별로 AI가 정한 값(round.competency)을 그대로 쓰고, 유형 줄에서 따로 고르지 않음
function addTypeRow(name = '', range = '', unit = '') {
  const wrap = document.getElementById('typeRows');
  const idx = wrap.children.length;
  const row = document.createElement('div');
  row.className = 'type-row';
  row.innerHTML = `
    <span class="type-swatch" style="background:${TYPE_COLORS[idx % TYPE_COLORS.length]}"></span>
    <input type="text" class="type-name" placeholder="유형명 (예: 도형)" value="${escapeHtml(name)}">
    <input type="text" class="type-range" placeholder="문항 번호 (예: 7-12)" value="${escapeHtml(range)}">
    <input type="text" class="type-unit" placeholder="교육과정 단원 (선택, 예: 분수의 덧셈과 뺄셈)" value="${escapeHtml(unit)}">
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
    return { name, questions, unit, color: TYPE_COLORS[i % TYPE_COLORS.length] };
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

function readFileAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

// 사진을 AI가 받는 한도(이미지 5MB) 안으로 줄임 — 긴 변 2400px부터 시작해 용량이 안 들어오면 더 줄임. 글자·수식이 읽히는 선에서 멈춤
async function shrinkImageForAI(file) {
  const bitmap = await createImageBitmap(file);
  let maxSide = 2400, quality = 0.85, blob = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_IMAGE_FOR_AI_BYTES) break;
    maxSide = Math.round(maxSide * 0.8);
    quality = Math.max(0.7, quality - 0.05);
  }
  if (bitmap.close) bitmap.close();
  return blob;
}

// 올린 파일을 분석에 쓸 수 있는 형태로 준비함. 큰 사진은 줄이고, PDF는 그대로 둠(20MB 이하만 여기까지 옴)
async function prepareExamFileForAI(file) {
  const isImage = (file.type || '').startsWith('image/');
  if (isImage && file.size > MAX_IMAGE_FOR_AI_BYTES) {
    const blob = await shrinkImageForAI(file);
    if (!blob || blob.size > 5 * 1024 * 1024) throw new Error('image too large');
    return { name: file.name, dataUrl: await readFileAsDataUrl(blob), size: blob.size, resized: true, originalSize: file.size };
  }
  return { name: file.name, dataUrl: await readFileAsDataUrl(file), size: file.size };
}

// 이 컴퓨터에 남겨둘 시험지 정보 — 작은 파일만 내용까지 보관하고, 큰 파일은 이름·용량만 남김(저장공간 보호)
function storableExamFile(f) {
  if (!f) return null;
  if (f.dataUrl && f.size <= MAX_EXAM_FILE_BYTES) return { name: f.name, dataUrl: f.dataUrl, size: f.size };
  return { name: f.name, dataUrl: null, size: f.originalSize || f.size };
}

function renderExamFileInfo() {
  const info = document.getElementById('examFileInfo');
  const thumb = document.getElementById('examThumb');
  if (!pendingExamFile) {
    info.textContent = '아직 업로드된 시험지가 없어요. 위 버튼을 누르거나, 파일을 이 상자 위로 끌어다 놓아도 돼요.';
    thumb.style.display = 'none';
    return;
  }
  const sizeTxt = (pendingExamFile.size / 1024 / 1024).toFixed(1) + 'MB';
  const bigNote = pendingExamFile.size > MAX_EXAM_FILE_BYTES ? ' · AI 분석에는 쓸 수 있고, 용량이 커서 이 컴퓨터에는 저장하지 않아요' : '';
  if (pendingExamFile.dataUrl && pendingExamFile.dataUrl.startsWith('data:image')) {
    thumb.src = pendingExamFile.dataUrl;
    thumb.style.display = 'block';
    const resizedNote = pendingExamFile.resized ? ` (원본 ${(pendingExamFile.originalSize / 1024 / 1024).toFixed(1)}MB를 줄임)` : '';
    info.textContent = `${pendingExamFile.name} (${sizeTxt})${resizedNote}${bigNote}`;
  } else if (pendingExamFile.dataUrl) {
    thumb.style.display = 'none';
    info.textContent = `${pendingExamFile.name} (${sizeTxt}) · PDF 첨부됨${bigNote}`;
  } else {
    thumb.style.display = 'none';
    info.textContent = `${pendingExamFile.name} (${sizeTxt}) · 용량이 커서 파일 내용은 저장하지 않았어요 (이름만 기록)`;
  }
}

function resetRoundForm() {
  editingRoundId = null;
  pendingExamFile = null;
  pendingDifficulty = null;
  pendingCompetency = null;
  document.getElementById('roundForm').reset();
  populateRoundDateSelect(document.getElementById('roundDate'), '');
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
  // 입학테스트는 주차 없이 당일 날짜만 씀
  if (typeof appScope === 'function' && appScope() === 'entrance') return `${d.getMonth() + 1}/${d.getDate()}`;
  // 월~일을 한 주로 보고 그 주 수요일이 속한 달·주차로 표기 — 10월 첫 금요일(10/2)이 "10-1"이 아니라 "9-5주차"로 이어지게 함
  const mondayIdx = (d.getDay() + 6) % 7;
  const wed = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayIdx + 2);
  return `${wed.getMonth() + 1}-${Math.ceil(wed.getDate() / 7)}주차`;
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
  if (round.individual) return ' · 개별(미지정)';
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
  const grades = Array.from(new Set(scopedRounds().map(r => r.grade).filter(Boolean)));
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

// 시험지 칸: 서버(비공개 저장소)에 올라간 시험지는 이 화면 안에서 바로 열고, 없으면 올리기 버튼을 보여줌
function examCellHtml(r) {
  const up = window.KMMS ? `<button class="icon-btn" data-exam-upload="${r.id}">${r.examPath ? '교체' : '올리기'}</button>` : '';
  if (r.examPath) return `<a href="#" data-exam-open="${r.id}">시험지 보기</a> ${up}`;
  const local = r.examFile ? (r.examFile.dataUrl ? `<a href="${r.examFile.dataUrl}" target="_blank" rel="noopener">시험지 보기</a>` : escapeHtml(r.examFile.name)) : '—';
  return `${local} ${up}`;
}

function renderRounds() {
  const wrap = document.getElementById('roundListWrap');
  populateRoundGradeFilter();
  const gradeFilter = document.getElementById('roundGradeFilter')?.value || '';
  const sorted = [...scopedRounds()].sort((a, b) => a.date.localeCompare(b.date));
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
        <td>${examCellHtml(r)}</td>
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
    populateRoundDateSelect(document.getElementById('roundDate'), r.grade, r.date);
    document.getElementById('roundGrade').value = r.grade || '';
    document.getElementById('roundTotal').value = r.total;
    document.getElementById('roundTitle').value = r.title || '';
    document.getElementById('typeRows').innerHTML = '';
    r.types.forEach(t => addTypeRow(t.name, rangeToString(t.questions), t.unit || ''));
    updateCoverageHint();
    renderExamFileInfo();
    document.getElementById('manualFallback').open = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}

// 시험지 제목에 "9월5주차", "[9-5주차]" 같은 주차가 적혀 있으면 날짜를 그 주 금요일로 자동 선택함 —
// 날짜 목록은 오늘 기준 "다가오는 금요일"이 기본이라, 지난 금요일 시험지를 올릴 때 날짜를 잘못 두는 일을 막기 위함.
// 새 회차를 만들 때만 적용하고(수정 중인 회차의 날짜는 건드리지 않음), 목록에서 찾지 못하면 아무것도 바꾸지 않음
function syncRoundDateFromTitle() {
  if (editingRoundId) return;
  if (isElementaryGrade(document.getElementById('roundGrade').value)) return; // 초등은 금요일 주간 시험이 아니라 날짜별 회차
  const title = document.getElementById('roundTitle').value;
  const m = title.match(/(\d{1,2})\s*(?:월|-)\s*(\d)\s*주\s*차/);
  if (!m) return;
  const label = `${parseInt(m[1], 10)}-${m[2]}주차`;
  const dateSel = document.getElementById('roundDate');
  const opt = findFridayOptionForWeek(dateSel, label);
  if (!opt || dateSel.value === opt.value) return;
  setRoundDate(opt.value);
  toast(`제목의 ${label}에 맞춰 날짜를 ${opt.textContent}로 선택했어요.`);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('addTypeRowBtn').addEventListener('click', () => addTypeRow());
  document.getElementById('roundTotal').addEventListener('input', updateCoverageHint);
  document.getElementById('roundGradeFilter').addEventListener('change', renderRounds);
  document.getElementById('roundTitle').addEventListener('change', syncRoundDateFromTitle);
  // 학년을 바꾸면 날짜 목록도 바뀜 (초등: 매일 / 그 외: 금요일만).
  // 같은 종류끼리(초등→초등, 금요일 목록→금요일 목록) 바꿀 땐 고른 날짜를 유지하고,
  // 종류가 바뀔 땐 새 목록의 기본값(초등은 오늘, 그 외는 가까운 금요일)으로 시작함
  document.getElementById('roundGrade').addEventListener('change', () => {
    const dateSel = document.getElementById('roundDate');
    const grade = document.getElementById('roundGrade').value;
    const wasDaily = dateSel.dataset.mode === 'daily';
    const willBeDaily = isElementaryGrade(grade);
    populateRoundDateSelect(dateSel, grade, wasDaily === willBeDaily ? dateSel.value : undefined);
    syncRoundDateFromTitle();
  });

  // 파일을 마우스로 끌어다 놓기 — 업로드 상자 위에 놓으면 "파일 선택"과 똑같이 처리됨(같은 입력칸에 넣고 change 이벤트 전달).
  // 상자를 놓치면 브라우저가 파일을 열어버려서 작업 중이던 화면이 사라지므로, 파일을 끄는 동안에는 페이지 전체에서 기본 동작을 막음
  const dropBox = document.querySelector('#panel-rounds .upload-box');
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  ['dragover', 'drop'].forEach(type => window.addEventListener(type, e => { if (hasFiles(e)) e.preventDefault(); }));
  if (dropBox) {
    ['dragenter', 'dragover'].forEach(type => dropBox.addEventListener(type, e => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dropBox.classList.add('drag-over');
    }));
    dropBox.addEventListener('dragleave', e => {
      if (!dropBox.contains(e.relatedTarget)) dropBox.classList.remove('drag-over');
    });
    dropBox.addEventListener('drop', e => {
      dropBox.classList.remove('drag-over');
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) return;
      const file = files.find(f => f.type === 'application/pdf' || (f.type || '').startsWith('image/'));
      if (!file) { toast('이미지(JPG·PNG)나 PDF 파일만 올릴 수 있어요.'); return; }
      if (files.length > 1) toast('시험지는 한 번에 한 개씩만 올릴 수 있어서 첫 파일만 넣었어요.');
      const input = document.getElementById('examFileInput');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  document.getElementById('examFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const titleInput = document.getElementById('roundTitle');
    if (titleInput && !titleInput.value.trim()) { titleInput.value = file.name.replace(/\.[^.]+$/, ''); syncRoundDateFromTitle(); }
    if (file.size > MAX_ANALYZE_FILE_BYTES) {
      pendingExamFile = null;
      renderExamFileInfo();
      toast(`파일이 너무 커요 (${(file.size / 1024 / 1024).toFixed(1)}MB). 20MB 이하로 올려주세요. 사진이면 해상도를 낮춰 다시 찍거나, PDF면 용량을 줄여주세요.`);
      return;
    }
    prepareExamFileForAI(file).then(prepared => {
      prepared.fresh = true;
      // 분석 요청으로 올린 시험지는 고르는 즉시 서버 보관함에 PDF로 저장 (회차를 저장하지 않아도 남음)
      if (window.KMMS) prepared.stagedPromise = window.KMMS.stageExam(prepared);
      pendingExamFile = prepared;
      renderExamFileInfo();
      if (prepared.resized) toast(`사진이 커서 AI 분석용으로 ${(prepared.size / 1024 / 1024).toFixed(1)}MB로 줄였어요.`);
    }).catch(err => {
      console.error(err);
      pendingExamFile = null;
      renderExamFileInfo();
      toast('파일을 읽지 못했어요. 다른 파일로 다시 시도해주세요.');
    });
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
    let title = document.getElementById('roundTitle').value.trim();
    if (!date) { toast('날짜를 선택해주세요.'); return; }
    if (!grade) { toast('학년을 선택해주세요.'); return; }
    const ENTRANCE_TITLE = /입학\s*(테스트|TEST)/i;
    if (appScope() === 'entrance' && !ENTRANCE_TITLE.test(title)) title = title ? '입학테스트 ' + title : grade + ' 입학테스트';
    else if (appScope() === 'regular' && ENTRANCE_TITLE.test(title)) toast('제목에 "입학테스트"가 들어 있어서 입학테스트 탭의 시험지로 분류돼요. 캐치유테스트에서는 보이지 않아요.');
    const types = readTypeRows();
    if (!types.length) { toast('유형을 최소 1개 이상 입력해주세요.'); return; }
    const covered = new Set();
    types.forEach(t => t.questions.forEach(q => covered.add(q)));
    if (covered.size !== total) toast(`참고: ${covered.size}/${total} 문항만 유형에 배정되었어요.`);

    // 문항별 역량은 AI/JSON이 정한 값을 그대로 저장 (수정할 때 새로 분석하지 않으면 기존 값 유지)
    const mergedCompetency = pendingCompetency || null;

    // 초등 시험지는 문항별 난이도를 따로 매기지 않고 전부 "중하"(2)로 고정함
    const finalDifficulty = isElementaryGrade(grade) ? elementaryFixedDifficulty(total) : pendingDifficulty;

    let savedRound;
    if (editingRoundId) {
      const r = state.rounds.find(x => x.id === editingRoundId);
      r.date = date; r.grade = grade; r.total = total; r.types = types; r.examFile = storableExamFile(pendingExamFile); r.title = title || undefined;
      if (finalDifficulty) r.difficulty = finalDifficulty;
      if (mergedCompetency) r.competency = mergedCompetency;
      savedRound = r;
    } else {
      savedRound = { id: uid(), date, grade, total, types, title: title || undefined, examFile: storableExamFile(pendingExamFile), difficulty: finalDifficulty || undefined, competency: mergedCompetency || undefined };
      state.rounds.push(savedRound);
    }
    saveState();
    // 새로 고른 시험지 파일은 서버의 비공개 저장소에도 올림 (로그인한 선생님만 볼 수 있음)
    // 파일을 고른 순간 이미 보관함에 올려 두었으면(stagedPromise) 그 파일을 회차에 연결하고, 못 올렸으면 지금 올림
    const examToUpload = pendingExamFile && pendingExamFile.fresh ? pendingExamFile : null;
    if (examToUpload && window.KMMS) {
      Promise.resolve(examToUpload.stagedPromise).then(rec => rec ? window.KMMS.attachStaged(savedRound, rec) : window.KMMS.uploadExam(savedRound, examToUpload));
    }
    pendingDifficulty = null;
    pendingCompetency = null;
    resetRoundForm();
    renderRounds(); populateSelects();
    toast('회차를 저장했어요.');
    shareRoundToGitHub(savedRound);
  });
});

/* ================= 채점 입력 ================= */

function populateSelects() {
  populateReportStudentSel();
  populateScoreGradeSel();
  populateResetPanelDateSel();
}

// 학생별 채점 현황 위의 "OO부터 OO까지" 드롭다운 — 회차가 계속 쌓여도 보고 싶은 기간만 골라서 볼 수 있게 함.
// 선택값은 다시 그려도 유지되고, 기본값은 전체 기간(가장 이른 회차 ~ 가장 늦은 회차)임
function populateResetPanelDateSel() {
  const fromSel = document.getElementById('resetPanelFromSel');
  const toSel = document.getElementById('resetPanelToSel');
  if (!fromSel || !toSel) return;
  const dates = Array.from(new Set(scopedRounds().map(r => r.date))).sort();
  const prevFrom = fromSel.value, prevTo = toSel.value;
  const opts = dates.map(d => `<option value="${d}">${escapeHtml(dateToWeekLabel(d))} (${shortDate(d)})</option>`).join('');
  fromSel.innerHTML = opts || '<option value="">회차가 없어요</option>';
  toSel.innerHTML = opts || '<option value="">회차가 없어요</option>';
  fromSel.value = dates.includes(prevFrom) ? prevFrom : (dates[0] || '');
  toSel.value = dates.includes(prevTo) ? prevTo : (dates[dates.length - 1] || '');
}

// 상단에서 고른 담당 선생님 학생만 남김 (선택 안 하면 전체 보기)
function populateReportStudentSel() {
  const sel = document.getElementById('reportStudentSel');
  const prev = sel.value;
  // 채점 입력 탭에서 "완료" 표시해둔 학생을 목록 맨 위로 올리고 "(완)"을 붙여서, 다 끝난 학생 보고서를
  // 바로 찾을 수 있게 함 (정렬은 안정 정렬이라 완료 여부 말고는 원래 순서 그대로 유지됨)
  // 선택한 담당 선생님의 학생이 맨 위, 다른 반 학생은 아래에 함께 보임. 각 묶음 안에서는 "완료" 학생이 위로 감
  const sp = splitMineAndOthers(state.students);
  const doneFirst = (a, b) => (state.studentDone[b.id] ? 1 : 0) - (state.studentDone[a.id] ? 1 : 0);
  const mine = sp.mine.slice().sort(doneFirst), others = sp.others.slice().sort(doneFirst);
  const eligible = mine.concat(others);
  const realOptionsHtml = eligible.length
    ? groupedOptions(mine, others, sp.t, s => `<option value="${s.id}">${escapeHtml(s.name)}${s.grade ? ' · ' + escapeHtml(s.grade) : ''}${state.studentDone[s.id] ? ' (완)' : ''}</option>`)
    : `<option value="">${getCurrentTeacher() ? escapeHtml(getCurrentTeacher()) + ' 선생님 학생이 없어요' : '학생을 먼저 등록하세요'}</option>`;
  // 실제 학생이 없어도 예시보고서는 항상 고를 수 있도록 고정 옵션을 하나 더 붙여둠
  sel.innerHTML = realOptionsHtml + (appScope() === 'entrance' ? '' : `<option value="${EXAMPLE_STUDENT_ID}">${escapeHtml(EXAMPLE_STUDENT.name)} (예시보고서 샘플)</option>`);
  if (eligible.some(s => s.id === prev) || prev === EXAMPLE_STUDENT_ID) sel.value = prev;
}

// 학년 안에서 날짜별로 회차를 묶음 (같은 날짜에 진도가 달라 시험지가 여러 개여도 "N-M주차"는 하나로 묶여요)
function scoreRoundGroups(grade) {
  const rounds = scopedRounds().filter(r => r.grade === grade);
  const dates = Array.from(new Set(rounds.map(r => r.date))).sort((a, b) => a.localeCompare(b));
  return dates.map(date => ({ date, label: dateToWeekLabel(date), rounds: rounds.filter(r => r.date === date) }));
}

// 담당 학생이 아직 없는 학년이라도 초등 학년은 항상 다 열어두는 선생님 — 신입생 입학테스트를
// 학년 상관없이 바로바로 채점해야 해서, 학생이 배정되기 전에도 학년 선택지가 미리 떠 있어야 함
const ELEMENTARY_GRADES = ['초3', '초4', '초5', '초6'];
const ELEMENTARY_ALL_ACCESS_TEACHERS = ['문태민', '오민경'];
// 초3~고3 전체 — 전체 권한 선생님(차성빈)은 아직 등록된 시험지가 하나도 없는 학년도 다 보이게 함
const ALL_GRADES = ['초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3'];

function populateScoreGradeSel() {
  const sel = document.getElementById('scoreGradeSel');
  const prev = sel.value;
  const order = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3'];
  const roundGrades = Array.from(new Set(scopedRounds().map(r => r.grade).filter(Boolean)));
  // 담당 선생님이 선택돼 있으면, 그 선생님 학생이 있는 학년을 맨 위(내 반)에 두고 나머지 학년은 그 아래(다른 반)에 함께 보여줌
  // (시험 응시 학년이 따로 설정된 학생은 examGrade 기준으로 매칭 — 위 채점 대상 매칭 로직과 동일)
  const myStudents = filterByCurrentTeacher(state.students);
  let grades = roundGrades;
  if (hasAllAccess()) {
    // 전체 권한 선생님은 학년 전부(초3~고3)를 항상 열어둠 — 시험지가 아직 없는 학년도 미리 보여야 함
    grades = Array.from(new Set([...grades, ...ALL_GRADES]));
  } else if (ELEMENTARY_ALL_ACCESS_TEACHERS.includes(getCurrentTeacher())) {
    // 그 학년에 아직 등록된 시험지(회차)가 없어도 학년 자체는 미리 열어둠 — 학생이 들어오면 바로 쓸 수 있게
    grades = Array.from(new Set([...grades, ...ELEMENTARY_GRADES]));
  }
  grades.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const mineGrades = getCurrentTeacher() && !hasAllAccess() ? grades.filter(g => myStudents.some(s => (s.examGrade || s.grade) === g)) : [];
  const otherGrades = grades.filter(g => !mineGrades.includes(g));
  const gradeOpt = g => `<option value="${g}">${g}</option>`;
  sel.innerHTML = grades.length
    ? (mineGrades.length && otherGrades.length
      ? `<optgroup label="내 반 · ${escapeHtml(getCurrentTeacher())}">${mineGrades.map(gradeOpt).join('')}</optgroup><optgroup label="다른 반">${otherGrades.map(gradeOpt).join('')}</optgroup>`
      : grades.map(gradeOpt).join(''))
    : '<option value="">회차를 먼저 등록하세요</option>';
  if (grades.includes(prev)) sel.value = prev;
  populateScoreRoundGroupSel();
}

// 주차 드롭다운(몇월 몇주차) + 달력(날짜)로 회차를 고름. 실제 값은 숨은 입력(scoreRoundGroupSel)에 날짜로 저장됨.
// requested: 선택하고 싶은 날짜 — 그 날 시험이 없으면 같은 주차에서 가장 가까운 시험일로 맞추고 안내함
function populateScoreRoundGroupSel(requested) {
  const grade = document.getElementById('scoreGradeSel').value;
  const hidden = document.getElementById('scoreRoundGroupSel');
  const weekSel = document.getElementById('scoreWeekSel');
  const dateInp = document.getElementById('scoreDateInput');
  const hint = document.getElementById('scoreDateHint');
  const groups = grade ? scoreRoundGroups(grade) : [];
  const dayTxt = d => `${shortDate(d)}(${weekdayKo(d)})`;

  const weeks = [];
  [...groups].reverse().forEach(g => { if (!weeks.includes(g.label)) weeks.push(g.label); });
  weekSel.innerHTML = weeks.length
    ? weeks.map(w => `<option value="${w}">${w}</option>`).join('')
    : '<option value="">회차가 없어요</option>';

  // 학년을 바꿔서 이전 선택 날짜가 이 학년에 없을 때는 "없다"고 하지 않고 가장 최근 시험으로 자연스럽게 이동함
  let want = requested || hidden.value;
  let use = '', note = '';
  if (groups.length) {
    if (want && groups.some(g => g.date === want)) use = want;
    else if (want && requested) {
      const sameWeek = groups.filter(g => g.label === dateToWeekLabel(want));
      if (sameWeek.length) {
        const t = new Date(want + 'T00:00:00').getTime();
        use = sameWeek.reduce((a, b) => Math.abs(new Date(a.date + 'T00:00:00') - t) <= Math.abs(new Date(b.date + 'T00:00:00') - t) ? a : b).date;
        note = `${dayTxt(want)}에는 시험이 없어서, 같은 주차의 ${dayTxt(use)} 시험을 보여드려요.`;
      } else {
        note = appScope() === 'entrance' ? `${dayTxt(want)}에는 등록된 시험지가 없어요.` : `${dateToWeekLabel(want)}(${dayTxt(want)})에는 등록된 시험지가 없어요.`;
      }
    } else use = groups[groups.length - 1].date;
  }
  hidden.value = use;
  if (use) {
    weekSel.value = dateToWeekLabel(use);
    dateInp.value = use;
  } else {
    dateInp.value = want || '';
  }
  const weekDates = use ? groups.filter(g => g.label === dateToWeekLabel(use)).map(g => dayTxt(g.date)) : [];
  hint.textContent = note || (appScope() === 'entrance' ? '' : weekDates.length ? `이 주차 시험일: ${weekDates.join(' · ')}` : (groups.length ? '' : '이 학년은 아직 등록된 시험지가 없어요.'));
  populateScoreExamSel();
}

// 같은 회차(날짜)에 시험지가 여러 개인 경우(진도가 다른 반) 어떤 시험지인지 고름
function populateScoreExamSel() {
  const grade = document.getElementById('scoreGradeSel').value;
  const date = document.getElementById('scoreRoundGroupSel').value;
  const sel = document.getElementById('scoreRoundSel');
  const prev = sel.value;
  // 입학테스트 화면은 학년·날짜와 상관없이 등록된 입학테스트 시험지를 전부 고를 수 있음 (최신순)
  const entranceAll = appScope() === 'entrance';
  const rounds = entranceAll
    ? scopedRounds().slice().sort((x, y) => (y.date || '').localeCompare(x.date || '') || (x.grade || '').localeCompare(y.grade || ''))
    : scopedRounds().filter(r => r.grade === grade && r.date === date);
  sel.innerHTML = rounds.length
    ? rounds.map(r => `<option value="${r.id}">${entranceAll ? escapeHtml((r.grade || '') + ' · ' + shortDate(r.date) + ' · ') : ''}${r.title ? escapeHtml(r.title) : escapeHtml(r.types[0] ? r.types[0].name : '시험지') + (r.types.length > 1 ? ' 외' : '')}${roundStudentTag(r)}</option>`).join('')
    : '<option value="">시험지를 먼저 등록하세요</option>';
  if (entranceAll && !rounds.some(r => r.id === prev)) { const m = rounds.find(r => r.grade === grade && r.date === date); if (m) sel.value = m.id; }
  if (rounds.some(r => r.id === prev)) sel.value = prev;
  populateScoreStudentSelect();
}

const ENTRANCE_CLASS = '입학테스트';
function isEntranceRound(r) { return /입학\s*(테스트|TEST)/i.test(r.title || ''); }
function isEntranceStudent(s) { return !!s && s.class === ENTRANCE_CLASS; }

// 회차에 등록된 학년과 같은 학년의 학생만 채점 대상으로 보여줌 (학년별로 시험지가 다르므로 잘못 매칭되지 않게)
// 개별시험지(studentId 지정된 회차)는 그 학생 한 명만 보여줌
function populateScoreStudentSelect() {
  const round = state.rounds.find(r => r.id === document.getElementById('scoreRoundSel').value);
  const sel = document.getElementById('scoreStudentSel');
  const prev = sel.value;
  // 개별시험지도 한번 배정됐다고 그 학생 하나로 고정해버리지 않고 같은 학년 학생을 전부 보여줌 —
  // 실수로 잘못 배정했을 때 여기서 바로 다른 학생으로 바꿀 수 있게 함(배정된 학생이 기본 선택값)
  // 시험 응시 학년(examGrade)이 따로 설정된 학생은(예: 중3인데 고1 시험지를 보는 경우) 그 학년 기준으로 매칭
  let eligible = round && round.grade ? state.students.filter(s => (s.examGrade || s.grade) === round.grade) : state.students;
  const entrance = !!round && isEntranceRound(round);
  // 입학테스트는 학년이 달라도 입학테스트 반 학생을 전부 보여줌 (학년 등록이 시험지와 달라도 바로 고를 수 있게)
  if (entrance) eligible = state.students;
  // 입학테스트 시험지는 "입학테스트" 반 학생에게만 보임
  if (entrance) eligible = eligible.filter(s => s.class === ENTRANCE_CLASS);
  // 초등 날짜별 회차: M으로 시작하는 반(월수반)은 월·수 시험지에만, T로 시작하는 반(화목반)은 화·목 시험지에만 열림.
  // 반이 M/T로 시작하지 않는 학생과 개별시험지·입학테스트, 그리고 월수/화목이 아닌 날(금 등)의 시험지는 제한하지 않음
  if (round && isElementaryGrade(round.grade) && !round.individual && !entrance) {
    const wd = new Date(round.date + 'T00:00:00').getDay();
    if (wd === 1 || wd === 3) eligible = eligible.filter(s => !/^T/i.test(s.class || ''));
    else if (wd === 2 || wd === 4) eligible = eligible.filter(s => !/^M/i.test(s.class || ''));
  }
  // 선택한 담당 선생님의 학생이 맨 위, 다른 선생님 반 학생은 그 아래 "다른 반"에 함께 보임 (숨기지 않음)
  const sp = splitMineAndOthers(eligible);
  eligible = sp.mine.concat(sp.others);
  sel.innerHTML = eligible.length
    ? groupedOptions(sp.mine, sp.others, sp.t, s => `<option value="${s.id}">${escapeHtml(s.name)}${s.class ? ' · ' + escapeHtml(s.class) : ''}</option>`)
    : `<option value="">${round && round.grade ? (entrance ? ENTRANCE_CLASS + ' 반 ' : '') + escapeHtml(round.grade) + ' 학생이 없어요' : '학생을 먼저 등록하세요'}</option>`;
  // 시험지에 학생 힌트(이름 한 글자)가 있으면, 후보 중 그 글자가 이름에 들어간 학생이 딱 한 명일 때 그 학생을 기본으로 골라줌
  // (공용 파일에는 이름 전체를 올리지 않으므로 힌트만 담김. 틀리면 선생님이 바로 다른 학생을 고르면 됨)
  const hint = round ? (round.hintName || (round.individual && !round.studentId ? round.studentName : '')) : '';
  const hinted = hint ? eligible.filter(s => (s.name || '').includes(hint)) : [];
  if (round && round.individual && round.studentId && eligible.some(s => s.id === round.studentId)) sel.value = round.studentId;
  else if (hinted.length === 1) sel.value = hinted[0].id;
  else if (eligible.some(s => s.id === prev)) sel.value = prev;
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

  // 채점을 한 번도 안 한 학생도 반에 있으면 "0개 회차 채점됨"으로 그대로 보여줘서, 진행중 목록만 봐도
  // 그 반 학생이 전부 다 있는지(아직 손도 안 댄 학생이 누군지) 알 수 있게 함
  // 전체 권한 선생님(차성빈)은 여기서만 예외 — 다른 선생님 담당으로 이미 정해진 학생은 안 보이게 하고,
  // 담당이 아직 없는 학생과 본인 담당 학생만 보여줌 (다른 선생님 현황까지 여기 다 뒤섞이지 않게)
  const studentsForPanel = hasAllAccess()
    ? state.students.filter(inStudentScope).filter(s => !s.teacher || s.teacher === getCurrentTeacher())
    : filterByCurrentTeacher(state.students);
  const allStudents = studentsForPanel
    .sort((a, b) => classSortKey(a.class) - classSortKey(b.class) || (a.class || '').localeCompare(b.class || '') || a.name.localeCompare(b.name, 'ko'));

  if (!allStudents.length) {
    wrap.innerHTML = `<div class="empty-state">${getCurrentTeacher() ? escapeHtml(getCurrentTeacher()) + ' 선생님 담당 학생이 없어요.' : '학생을 먼저 등록하세요.'}</div>`;
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

  // 위 "OO부터 OO까지" 드롭다운으로 고른 기간 — 계속 쌓이는 회차 중 이 기간에 속하는 것만 학생 카드에 보여줌
  if (!state.studentMemo) state.studentMemo = {};
  const fromRaw = document.getElementById('resetPanelFromSel')?.value || '';
  const toRaw = document.getElementById('resetPanelToSel')?.value || '';
  const rangeStart = fromRaw && toRaw && fromRaw > toRaw ? toRaw : fromRaw;
  const rangeEnd = fromRaw && toRaw && fromRaw > toRaw ? fromRaw : toRaw;
  const inRange = date => !rangeStart || !rangeEnd || (date >= rangeStart && date <= rangeEnd);

  const studentCardHTML = (student, done) => {
    const allMyResults = state.results.filter(r => r.studentId === student.id);
    const myResults = allMyResults
      .map(r => ({ result: r, round: state.rounds.find(x => x.id === r.roundId) }))
      .filter(({ round }) => !round || inRange(round.date))
      .sort((a, b) => (a.round?.date || '').localeCompare(b.round?.date || ''));
    const rows = myResults.length ? myResults.map(({ result, round }) => {
      const label = round ? `${escapeHtml(round.grade || '')} ${roundLabel(round)}${roundTopicHint(round)}` : '(삭제된 회차)';
      const wrongTxt = result.wrong.length ? `오답 ${result.wrong.length}개 (${escapeHtml(rangeToString(result.wrong))})` : '전부 정답';
      return `<tr>
        <td>${label}</td>
        <td>${wrongTxt}</td>
        <td class="row-actions"><button class="icon-btn" data-clear-result="${result.id}" data-owner="${student.id}">취소</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="3">${allMyResults.length ? '이 기간엔 채점 기록이 없어요.' : '아직 채점 기록이 없어요.'}</td></tr>`;
    const memo = state.studentMemo[student.id] || '';
    return `<details class="manual-fallback${done ? ' is-done' : ''}">
      <summary>
        <span class="reset-summary-text">${done ? '✅ ' : ''}${escapeHtml(student.name)}${student.grade ? ' · ' + escapeHtml(student.grade) : ''} (${myResults.length}개 회차 채점됨)</span>
        <input type="text" class="student-memo no-print" data-memo="${student.id}" placeholder="메모 한 줄" maxlength="60" value="${escapeHtml(memo)}">
        <button type="button" class="btn-done-toggle no-print${done ? ' is-done' : ''}" data-toggle-done="${student.id}">${done ? '✅ 완료' : '완료'}</button>
      </summary>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>회차</th><th>채점(오답 문항)</th><th>관리</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${myResults.length ? `<div class="inline-form" style="margin:10px 0;">
        <button type="button" class="btn danger" data-clear-all="${student.id}">${escapeHtml(student.name)} 학생 채점 초기화 (위 기간만, ${myResults.length}건)</button>
      </div>` : ''}
    </details>`;
  };

  const activeStudents = allStudents.filter(s => !state.studentDone[s.id]);
  const doneStudents = allStudents.filter(s => state.studentDone[s.id]);

  // 담당 선생님(위 상단에서 고른 선생님) 기준으로, 완료/미완료 학생 이름을 한눈에 볼 수 있는 명단 줄
  const totalDoneCount = Object.keys(state.studentDone).filter(id => state.studentDone[id]).length;
  const rosterHTML = `<div class="reset-roster-bar">
    <div class="reset-roster-group todo"><b>진행중 ${activeStudents.length}명</b><span>${activeStudents.length ? activeStudents.map(s => escapeHtml(s.name)).join(', ') : '없음'}</span></div>
    <div class="reset-roster-group done"><b>완료 ${doneStudents.length}명</b><span>${doneStudents.length ? doneStudents.map(s => escapeHtml(s.name)).join(', ') : '없음'}</span></div>
    ${totalDoneCount ? `<button type="button" class="btn danger no-print" id="resetAllDoneBtn" style="margin-top:8px; align-self:flex-start;">전체완료해제 (${totalDoneCount}명)</button>` : ''}
  </div>`;

  const activeHTML = groupByClass(activeStudents).map(g => `
    <div class="reset-class-group">
      <h3 class="reset-class-title">${escapeHtml(g.cls)}</h3>
      ${g.students.map(s => studentCardHTML(s, false)).join('')}
    </div>`).join('') || '<div class="empty-state">진행 중인 학생이 없어요 — 전부 완료 표시됐어요.</div>';

  const doneHTML = doneStudents.length ? `
    <div class="reset-done-section">
      <h3 class="reset-class-title reset-done-title">완료 (${doneStudents.length}명)</h3>
      ${groupByClass(doneStudents).map(g => `
        <div class="reset-class-group">
          <h3 class="reset-class-title">${escapeHtml(g.cls)}</h3>
          ${g.students.map(s => studentCardHTML(s, true)).join('')}
        </div>`).join('')}
    </div>` : '';

  wrap.innerHTML = rosterHTML + activeHTML + doneHTML;

  // 새 기간(다음 달 등) 데이터를 다시 모으기 시작할 때, 지난번에 표시해둔 완료를 한 번에 다 풀 수 있게 함 —
  // 지금 선택된 선생님 필터와 무관하게 이 컴퓨터에 있는 완료를 다 풀어줌 (선생님마다 컴퓨터가 따로라 "전체"라고 안 써도 됨)
  const resetAllDoneBtn = document.getElementById('resetAllDoneBtn');
  if (resetAllDoneBtn) {
    resetAllDoneBtn.addEventListener('click', () => {
      if (!confirm(`완료 표시 ${totalDoneCount}명을 모두 진행중으로 되돌릴까요? (되돌릴 수 없어요)`)) return;
      state.studentDone = {};
      saveState();
      renderStudentResetPanel();
      populateReportStudentSel();
      toast(`완료 표시 ${totalDoneCount}명을 모두 풀었어요.`);
    });
  }

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

  // 회차가 계속 누적될 거라, "전체 초기화"가 이전 달까지 다 날려버리지 않도록 위 "OO부터 OO까지" 필터에
  // 걸리는 기록만 지움 — 화면에 지금 보이는 회차만 정확히 지워지고, 필터 밖(이전에 쌓아둔) 기록은 안전함
  wrap.querySelectorAll('[data-clear-all]').forEach(b => b.addEventListener('click', () => {
    const student = state.students.find(s => s.id === b.dataset.clearAll);
    if (!student) return;
    const idsToDelete = state.results
      .filter(r => r.studentId === student.id)
      .filter(r => { const round = state.rounds.find(x => x.id === r.roundId); return !round || inRange(round.date); })
      .map(r => r.id);
    if (!idsToDelete.length) return;
    const periodTxt = (rangeStart && rangeEnd) ? `${rangeStart} ~ ${rangeEnd} 기간의 ` : '';
    if (!confirm(`${student.name} 학생의 ${periodTxt}채점 기록(${idsToDelete.length}건)을 지울까요? 되돌릴 수 없어요.`)) return;
    const idSet = new Set(idsToDelete);
    const roundIdsToDelete = new Set(state.results.filter(r => idSet.has(r.id)).map(r => r.roundId));
    state.results = state.results.filter(r => !idSet.has(r.id));
    state.retests = state.retests.filter(rt => !(rt.studentId === student.id && roundIdsToDelete.has(rt.roundId)));
    saveState();
    renderScoreTab();
    toast(`${student.name} 학생의 채점 기록 ${idsToDelete.length}건을 지웠어요.`);
  }));

  wrap.querySelectorAll('[data-toggle-done]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    e.preventDefault();
    const id = b.dataset.toggleDone;
    const student = state.students.find(s => s.id === id);
    if (!student) return;
    state.studentDone[id] = !state.studentDone[id];
    saveState();
    renderStudentResetPanel();
    // 보고서 탭 학생 드롭다운의 "(완)" 표시·정렬도 바로 반영되게 함(안 하면 채점 등 다른 동작을 해야만 갱신됐음)
    populateReportStudentSel();
    toast(state.studentDone[id] ? `${student.name} 학생을 완료로 표시했어요.` : `${student.name} 학생을 다시 진행중으로 옮겼어요.`);
  }));

  // 메모는 한 글자 칠 때마다 바로 저장(자동저장) — 채점 중엔 번호를 누를 때마다 이 패널 전체가
  // 다시 그려지므로, blur까지 기다리면 그 사이에 타이핑한 내용이 다시 그려지며 날아갈 수 있어서
  // 클릭으로 details가 접히거나 펼쳐지지 않도록 클릭 전파는 막아둠
  wrap.querySelectorAll('.student-memo').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('input', () => {
      state.studentMemo[inp.dataset.memo] = inp.value;
      saveState();
    });
    // Enter 누르면 그냥 저장(이미 input에서 저장 중)하고 커서만 빠져나가게 함
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      inp.blur();
    });
  });
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
  const wrong = Array.from(document.querySelectorAll('#scoreGridWrap .qbtn.wrong')).map(b => parseInt(b.dataset.q, 10));
  document.getElementById('quickWrongInput').value = rangeToString(wrong);
}

function updateScoreSummary() {
  const round = currentScoreRound();
  if (!round) { document.getElementById('scoreSummary').textContent = ''; return; }
  const wrongCount = document.querySelectorAll('#scoreGridWrap .qbtn.wrong').length;
  const correct = round.total - wrongCount;
  const pct = round.total ? Math.round((correct / round.total) * 100) : 0;
  document.getElementById('scoreSummary').textContent = `정답 ${correct} / ${round.total} (${pct}%)`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('scoreGradeSel').addEventListener('change', () => { populateScoreRoundGroupSel(); renderScoreTab(); });
  // 주차를 바꾸면 그 주차의 가장 늦은 시험일로, 달력에서 날짜를 고르면 그 날짜로 이동
  document.getElementById('scoreWeekSel').addEventListener('change', () => {
    const grade = document.getElementById('scoreGradeSel').value;
    const label = document.getElementById('scoreWeekSel').value;
    const inWeek = scoreRoundGroups(grade).filter(g => g.label === label);
    if (inWeek.length) populateScoreRoundGroupSel(inWeek[inWeek.length - 1].date);
    renderScoreTab();
  });
  document.getElementById('scoreDateInput').addEventListener('change', () => {
    const v = document.getElementById('scoreDateInput').value;
    if (v) { populateScoreRoundGroupSel(v); renderScoreTab(); }
  });
  document.getElementById('scoreRoundSel').addEventListener('change', () => { populateScoreStudentSelect(); renderScoreTab(); });
  document.getElementById('scoreStudentSel').addEventListener('change', () => {
    // 개별시험지를 실수로 잘못된 학생에게 배정했을 때, 여기서 다른 학생을 고르면 바로 재배정함.
    // 이미 채점해둔 기록이 있으면 지우지 않고 새 학생 쪽으로 그대로 옮겨서 다시 채점할 필요 없게 함
    const round = currentScoreRound();
    const newStudentId = document.getElementById('scoreStudentSel').value;
    if (round && round.individual && round.studentId && newStudentId && round.studentId !== newStudentId) {
      const oldStudentId = round.studentId;
      const newStudent = state.students.find(s => s.id === newStudentId);
      state.results.forEach(r => { if (r.studentId === oldStudentId && r.roundId === round.id) r.studentId = newStudentId; });
      state.retests.forEach(rt => { if (rt.studentId === oldStudentId && rt.roundId === round.id) rt.studentId = newStudentId; });
      round.studentId = newStudentId;
      saveState();
      renderRounds();
      const nameTxt = newStudent ? newStudent.name : '다른 학생';
      toast(`개별시험지를 ${nameTxt}${hasBatchim(nameTxt) ? '으로' : '로'} 다시 배정했어요.`);
    }
    renderScoreTab();
  });
  document.getElementById('resetPanelFromSel').addEventListener('change', renderStudentResetPanel);
  document.getElementById('resetPanelToSel').addEventListener('change', renderStudentResetPanel);

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
    document.querySelectorAll('#scoreGridWrap .qbtn.wrong').forEach(b => b.classList.remove('wrong'));
    document.getElementById('quickWrongInput').value = '';
    updateScoreSummary();
    saveCurrentScore(true);
  });

  document.getElementById('saveScoreBtn').addEventListener('click', () => saveCurrentScore());
});

// 채점 그리드의 현재 상태를 저장 — "채점 저장" 버튼과 빠른입력 Enter 저장이 공용으로 씀.
// silent가 true면 토스트를 안 띄움(Enter를 연달아 눌러도 알림이 스팸처럼 뜨지 않게)
function saveCurrentScore(silent) {
  const round = currentScoreRound(), student = currentScoreStudent();
  if (!round || !student) { if (!silent) toast('회차와 학생을 선택해주세요.'); return false; }
  // 이 학생을 마지막으로 채점한 걸로 기록해둠 — 재시험 탭으로 넘어가면 바로 이 학생이 선택되게 함
  lastScoredStudentId = student.id;
  // 개별시험지인데 아직 이 학생으로 배정되지 않았으면(처음 채점하는 거면) 지금 배정을 확정함
  if (round.individual && !round.studentId) round.studentId = student.id;
  const wrong = [...new Set(Array.from(document.querySelectorAll('#scoreGridWrap .qbtn.wrong')).map(b => parseInt(b.dataset.q, 10)))];
  const existing = state.results.find(r => r.studentId === student.id && r.roundId === round.id);
  if (existing) existing.wrong = wrong;
  else state.results.push({ id: uid(), studentId: student.id, roundId: round.id, wrong });
  saveState();
  renderRounds(); populateSelects();
  // 보고서 탭의 학생 드롭다운도 방금 채점한 학생으로 바로 맞춰둠 (보고서 탭을 열면 이 학생 보고서가 바로 뜸)
  { const rs = document.getElementById('reportStudentSel'); if (rs && [...rs.options].some(o => o.value === student.id)) rs.value = student.id; }
  // 학생별 채점 현황 패널을 바로 갱신해서, 저장 후 시간차 없이 곧바로 반영되게 함
  renderStudentResetPanel();
  if (!silent) toast(`${student.name} 학생의 채점을 저장했어요.`);
  return true;
}

/* ================= 재시험 ================= */

// 재시험은 새 유형표가 필요 없음 — 원래 회차에서 틀린 문항 번호를 그대로 재사용해서
// "쌍둥이문제를 다시 풀었을 때도 틀렸는지"만 기록. 유형·단원·난이도·역량은 원래 회차 것을 그대로 물려받음.

// 채점 입력에서 마지막으로 "새로" 채점한 학생을 재시험 탭에서 한 번 자동 선택해줬는지 추적 — 이걸 안 두면
// 재시험 탭 안에서 선생님이 직접 다른 학생을 골라도, 탭을 오갈 때마다 다시 그 학생으로 튕겨버리게 됨
let lastAppliedRetestStudentId = null;

// 학생을 먼저 고르고, 그 학생이 오답을 가진 회차만 골라서 재시험을 채점하는 흐름 — 이름 가나다순 정렬로
// 목록 순서가 매번 안정적이게 함. 채점 입력에서 새로 채점한 학생이 있으면(아직 여기서 안 반영했다면)
// 그 학생을 우선 선택해서 바로 이어서 재시험을 채점할 수 있게 하고, 그 다음엔 기존 선택을 유지함
function populateRetestStudentSelect() {
  const sel = document.getElementById('retestStudentSel');
  const prev = sel.value;
  const currentTeacher = getCurrentTeacher();
  const studentIdsWithWrong = new Set(state.results.filter(r => r.wrong.length).map(r => r.studentId));
  const students = state.students.filter(inStudentScope)
    .filter(s => studentIdsWithWrong.has(s.id) && (!currentTeacher || hasAllAccess() || s.teacher === currentTeacher))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  sel.innerHTML = students.length
    ? students.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')
    : '<option value="">오답이 있는 학생이 없어요</option>';
  const freshFromScoring = lastScoredStudentId && lastScoredStudentId !== lastAppliedRetestStudentId && students.some(s => s.id === lastScoredStudentId);
  if (freshFromScoring) {
    sel.value = lastScoredStudentId;
    lastAppliedRetestStudentId = lastScoredStudentId;
  } else if (students.some(s => s.id === prev)) {
    sel.value = prev;
  }
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
  // 채점 입력과 똑같이, 이미 채점해둔 재시험 기록이 있으면 그 틀린 번호가 다시 봐도 그대로 눌려있게 불러옴
  const existingRetest = state.retests.find(rt => rt.studentId === student.id && rt.roundId === round.id);
  const stillWrongSet = new Set(existingRetest ? existingRetest.stillWrong : []);
  const legend = round.types.map((t, i) => `<span class="legend-item"><span class="type-swatch" style="background:${TYPE_COLORS[i % TYPE_COLORS.length]}"></span>${escapeHtml(t.name)}</span>`).join('');
  // 재시험지는 오답 문항만 다시 1번부터 순서대로 인쇄되므로, 버튼도 그 순서(1,2,3…)로 크게 보여주고
  // 원본 시험지 문항 번호는 괄호 안에 작게만 곁들임 — 채점할 때 재시험지에 적힌 번호를 그대로 누르면 됨
  const btns = originalWrong.map((q, i) => {
    const t = typeForQuestion(round, q);
    const style = t ? `box-shadow: inset 3px 0 0 ${t.color};` : '';
    return `<button type="button" class="qbtn qbtn-retest${stillWrongSet.has(q) ? ' wrong' : ''}" style="${style}" data-q="${q}" data-idx="${i + 1}">${i + 1}<span class="qbtn-orig">(${q})</span></button>`;
  }).join('');
  wrap.innerHTML = `<p class="card-sub" style="margin-top:10px;">원래 오답 ${originalWrong.length}문항 · 번호는 재시험지에 적힌 순서(1,2,3…)예요 — 괄호 안 작은 숫자가 원본 문항 번호. 재시험에서도 틀린 문항만 클릭하세요 (기본값: 전부 정답)</p><div class="score-grid">${btns}</div><div class="type-legend">${legend}</div>`;
  // "재시험 결과 저장" 버튼을 안 눌러도, 번호 하나 클릭할 때마다 바로바로 저장함(채점 입력과 동일한 방식)
  wrap.querySelectorAll('.qbtn').forEach(b => b.addEventListener('click', () => {
    b.classList.toggle('wrong');
    updateRetestSummary();
    saveCurrentRetest(true);
  }));
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
  if (!state.studentMemoRetest) state.studentMemoRetest = {};
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
        const memo = state.studentMemoRetest[student.id] || '';
        return `<details class="manual-fallback">
          <summary>
            <span class="reset-summary-text">${escapeHtml(student.name)}${student.grade ? ' · ' + escapeHtml(student.grade) : ''} (재시험 ${myRetests.length}건)</span>
            <input type="text" class="student-memo no-print" data-memo="${student.id}" placeholder="메모 한 줄" maxlength="60" value="${escapeHtml(memo)}">
          </summary>
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

  // 채점입력 탭의 메모(state.studentMemo)와는 별도 데이터(state.studentMemoRetest) — 재시험 탭 메모는 독립적으로 관리됨
  wrap.querySelectorAll('.student-memo').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('input', () => {
      state.studentMemoRetest[inp.dataset.memo] = inp.value;
      saveState();
    });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      inp.blur();
    });
  });
}

// 재시험 결과 저장 — "재시험 결과 저장" 버튼과 빠른입력 Enter 저장이 공용으로 씀.
// 같은 학생 · 같은 회차 기록이 이미 있으면 새로 쌓지 않고 그 기록을 덮어씀(중복 방지)
function saveCurrentRetest(silent) {
  const round = currentRetestRound(), student = currentRetestStudent();
  if (!round || !student) { if (!silent) toast('회차와 학생을 선택해주세요.'); return false; }
  const stillWrong = [...new Set(Array.from(document.querySelectorAll('#retestGridWrap .qbtn.wrong')).map(b => parseInt(b.dataset.q, 10)))];
  const date = new Date().toISOString().slice(0, 10);
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
  let tier;
  if (pct >= 90) tier = { n: 1, label: '1등급' };
  else if (pct >= 80) tier = { n: 2, label: '2등급' };
  else if (pct >= 70) tier = { n: 3, label: '3등급' };
  else if (pct >= 50) tier = { n: 4, label: '4등급' };
  else tier = { n: 5, label: '5등급' };
  // 등급 경계(90/80/70/50%) 앞뒤 3%p 안이면 한 등급으로 딱 잘라 말하기 어려우니 "1~2등급"처럼 범위로 표시
  const boundary = [[90, 1], [80, 2], [70, 3], [50, 4]].find(([b]) => pct >= b - 3 && pct < b + 3);
  if (boundary) tier.label = `${boundary[1]}~${boundary[1] + 1}등급`;
  return tier;
}

// 선생님이 예상 등급을 직접 수정해둔 게 있으면 그걸 우선 사용
function displayGradeTier(studentId, pct) {
  const override = state.gradeOverrides[studentId];
  // 수정값은 숫자(예: 2) 또는 범위 문자열(예: "1-2")로 저장됨 — 범위는 "1~2등급"으로 표시
  if (override) return { n: override, label: `${String(override).replace('-', '~')}등급` };
  return gradeTier(pct);
}

// 학생이 실제로 채점 기록을 가진 회차만, 날짜순으로 반환 (리포트 기간 선택 드롭다운에 사용)
function studentScoredRounds(studentId) {
  if (studentId === EXAMPLE_STUDENT_ID) {
    return EXAMPLE_ROUNDS.map(r => ({ round: r, label: roundLabel(r), result: EXAMPLE_RESULTS.find(x => x.roundId === r.id) }));
  }
  const ascRounds = [...state.rounds].sort((a, b) => a.date.localeCompare(b.date));
  return ascRounds
    .map(r => ({ round: r, label: roundLabel(r), result: state.results.find(x => x.studentId === studentId && x.roundId === r.id) }))
    .filter(x => x.result);
}

function computeStudentReport(studentId, fromRoundId, toRoundId) {
  const student = studentId === EXAMPLE_STUDENT_ID ? EXAMPLE_STUDENT : state.students.find(s => s.id === studentId);
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
  // 강사가 보고서 화면에서 "평균 난이도"를 직접 정해둔 경우(시험지에 난이도가 없어도) 그 값을 전체 평균으로 씀
  const rawDiff = computeDifficultyBreakdown(windowed);
  const diffOverride = state.difficultyOverrides ? state.difficultyOverrides[studentId] : null;
  const diff = diffOverride ? { avgCorrect: null, avgWrong: null, ...(rawDiff || {}), avgAll: +diffOverride, manual: true } : rawDiff;

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
  const resultsSource = studentId === EXAMPLE_STUDENT_ID ? EXAMPLE_RESULTS : state.results;
  points.forEach(p => {
    const result = resultsSource.find(r => r.studentId === studentId && r.roundId === p.roundId);
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
      <text x="${w/2}" y="100" text-anchor="middle" fill="var(--data)" font-size="34" font-weight="700" font-family="Noto Sans KR">${p.pct}%</text></svg>`;
  }
  const n = points.length;
  const xs = points.map((_, i) => x0 + i * (x1 - x0) / (n - 1));
  const ys = points.map(p => mapY(p.pct, top, bottom));
  const linePts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' L');
  const areaPts = `M${xs[0]},${ys[0]} L${linePts.split('L').slice(1).join('L')} L${xs[n-1]},${bottom} L${xs[0]},${bottom} Z`;

  let dots = '';
  points.forEach((p, i) => {
    const always = ' always';
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
    <line class="gridline" x1="${x0}" y1="${mapY(50,top,bottom)}" x2="${x1}" y2="${mapY(50,top,bottom)}"/><text class="axis-label" x="${x0-6}" y="${mapY(50,top,bottom)+4}" text-anchor="end">50%</text>
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
      : `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--data)"/>`;
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
    <polygon points="${studentPts}" fill="var(--data-fill)" stroke="var(--data)" stroke-width="2"/>
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

// "[수업 태도 · 학습 성향]" 칸에 선생님이 눌러서 고를 수 있는 예시 문장들 — 이 앱은 태도 데이터가 없으므로
// 실제로 관찰하신 내용에 맞는 문장만 선생님이 골라 쓰도록 함 (자동으로 넣지 않음)
const ATTITUDE_HEADING = '[수업 태도 · 학습 성향]';
// text: 처음 넣을 때 쓰는 완결된 문장("-습니다." 등으로 끝남)
// clause: 뒤에 다른 문장을 같은 결로 이어 붙일 때 쓰는 연결형("-고,"로 끝남 — "-습니다/-ㅂ니다"를 떼고 고쳐 씀)
// polarity: 'positive'(강점·장점) / 'caution'(보완이 필요한 부분) — 문장을 이어 붙일 때 결이 바뀌는지 판단하는 데 씀
const ATTITUDE_PHRASES = [
  { cat: '수업 참여', items: [
    { text: '수업 시간에 적극적으로 참여하며 배운 내용을 스스로 정리하려는 모습이 좋습니다.', clause: '수업 시간에 적극적으로 참여하며 배운 내용을 스스로 정리하려는 모습이 좋고,', polarity: 'positive' },
    { text: '모르는 부분이 생기면 주저하지 않고 질문하는 태도가 큰 장점입니다.', clause: '모르는 부분이 생기면 주저하지 않고 질문하는 태도가 큰 장점이고,', polarity: 'positive' },
    { text: '차분하게 수업을 듣고 필기를 성실하게 해 나가고 있습니다.', clause: '차분하게 수업을 듣고 필기를 성실하게 해 나가고 있고,', polarity: 'positive' },
    { text: '처음에는 조용했지만 최근 들어 수업 중 발표와 질문이 눈에 띄게 늘었습니다.', clause: '처음에는 조용했지만 최근 들어 수업 중 발표와 질문이 눈에 띄게 늘었고,', polarity: 'positive' },
    { text: '설명을 들으면 바로 자기 방식으로 다시 풀어보려는 의욕이 느껴집니다.', clause: '설명을 들으면 바로 자기 방식으로 다시 풀어보려는 의욕이 느껴지고,', polarity: 'positive' },
  ]},
  { cat: '집중력', items: [
    { text: '문제를 풀 때 몰입하는 힘이 좋아 어려운 문제에도 끝까지 매달리는 편입니다.', clause: '문제를 풀 때 몰입하는 힘이 좋아 어려운 문제에도 끝까지 매달리는 편이고,', polarity: 'positive' },
    { text: '집중이 잘 되는 날은 실력이 그대로 나오는데, 컨디션에 따라 집중의 폭이 조금 달라지는 편입니다.', clause: '집중이 잘 되는 날은 실력이 그대로 나오는데, 컨디션에 따라 집중의 폭이 조금 달라지는 편이고,', polarity: 'caution' },
    { text: '수업 후반부에 집중력이 조금 흐트러지는 때가 있어 호흡을 나눠 지도하고 있습니다.', clause: '수업 후반부에 집중력이 조금 흐트러지는 때가 있어 호흡을 나눠 지도하고 있고,', polarity: 'caution' },
    { text: '한번 집중하면 주변에 흔들리지 않고 끝까지 풀어내는 힘이 있습니다.', clause: '한번 집중하면 주변에 흔들리지 않고 끝까지 풀어내는 힘이 있고,', polarity: 'positive' },
  ]},
  { cat: '풀이 습관', items: [
    { text: '풀이 과정을 꼼꼼하게 적는 습관이 잡혀 있어 실수가 적은 편입니다.', clause: '풀이 과정을 꼼꼼하게 적는 습관이 잡혀 있어 실수가 적은 편이고,', polarity: 'positive' },
    { text: '이해가 빠른 만큼 서두르다 아는 문제에서 실수하는 경우가 있어, 검산하는 습관을 함께 잡아가고 있습니다.', clause: '이해가 빠른 만큼 서두르다 아는 문제에서 실수하는 경우가 있어, 검산하는 습관을 함께 잡아가고 있고,', polarity: 'caution' },
    { text: '문제를 끝까지 읽고 조건을 정리하는 연습을 하며 눈에 띄게 안정되고 있습니다.', clause: '문제를 끝까지 읽고 조건을 정리하는 연습을 하며 눈에 띄게 안정되고 있고,', polarity: 'positive' },
    { text: '어려운 문제 앞에서 쉽게 포기하지 않고 다른 방법을 시도해 보는 끈기가 있습니다.', clause: '어려운 문제 앞에서 쉽게 포기하지 않고 다른 방법을 시도해 보는 끈기가 있고,', polarity: 'positive' },
    { text: '풀이 과정을 생략하고 답만 적는 경향이 있어, 과정을 차근차근 쓰도록 지도하고 있습니다.', clause: '풀이 과정을 생략하고 답만 적는 경향이 있어, 과정을 차근차근 쓰도록 지도하고 있고,', polarity: 'caution' },
  ]},
  { cat: '과제 · 재시험', items: [
    { text: '과제와 재시험을 빠짐없이 성실하게 해오고 있습니다.', clause: '과제와 재시험을 빠짐없이 성실하게 해오고 있고,', polarity: 'positive' },
    { text: '틀린 문제를 스스로 다시 풀어보며 오답을 바로잡으려는 자세가 좋습니다.', clause: '틀린 문제를 스스로 다시 풀어보며 오답을 바로잡으려는 자세가 좋고,', polarity: 'positive' },
    { text: '재시험에서 이전에 틀렸던 유형을 잘 바로잡는 모습을 보여 주고 있습니다.', clause: '재시험에서 이전에 틀렸던 유형을 잘 바로잡는 모습을 보여 주고 있고,', polarity: 'positive' },
    { text: '과제 수행이 들쑥날쑥한 편이라, 꾸준히 이어갈 수 있도록 함께 관리하고 있습니다.', clause: '과제 수행이 들쑥날쑥한 편이라, 꾸준히 이어갈 수 있도록 함께 관리하고 있고,', polarity: 'caution' },
  ]},
  { cat: '자신감 · 성향', items: [
    { text: '차분하고 신중한 성향으로, 확실히 이해한 뒤에 넘어가는 학습 스타일입니다.', clause: '차분하고 신중한 성향으로, 확실히 이해한 뒤에 넘어가는 학습 스타일이고,', polarity: 'positive' },
    { text: '도전적인 문제를 좋아해서 어려운 문제를 만났을 때 오히려 의욕을 보입니다.', clause: '도전적인 문제를 좋아해서 어려운 문제를 만났을 때 오히려 의욕을 보이고,', polarity: 'positive' },
    { text: '실력에 비해 자신감이 조금 낮은 편이라, 작은 성공 경험을 쌓아 주며 격려하고 있습니다.', clause: '실력에 비해 자신감이 조금 낮은 편이라, 작은 성공 경험을 쌓아 주며 격려하고 있고,', polarity: 'caution' },
    { text: '성취감을 느끼면 더 열심히 하는 성향이라 목표를 작게 나누어 지도하고 있습니다.', clause: '성취감을 느끼면 더 열심히 하는 성향이라 목표를 작게 나누어 지도하고 있고,', polarity: 'positive' },
    { text: '친구들과 함께 풀이를 공유하는 활동에서 특히 이해가 깊어지는 모습을 보입니다.', clause: '친구들과 함께 풀이를 공유하는 활동에서 특히 이해가 깊어지는 모습을 보이고,', polarity: 'positive' },
    { text: '스스로 목표를 세우고 꾸준히 노력하는 모습이 인상적입니다.', clause: '스스로 목표를 세우고 꾸준히 노력하는 모습이 인상적이고,', polarity: 'positive' },
  ]},
];

// 지금 의견 칸 맨 끝에 어떤 예시 문장이 붙어 있는지 찾을 때 씀 (카테고리 구분 없이 평평하게 모음)
const ATTITUDE_PHRASE_LIST = ATTITUDE_PHRASES.flatMap(g => g.items);
// 같은 결(긍정→긍정, 주의→주의)이 이어질 때 쓰는 접속어 — 문장을 그대로 두고 새 문장으로 이어붙일 때만 씀
const ATTITUDE_CONNECTORS_SAME = ['또한 ', '그리고 ', '특히 ', '아울러 '];
// 결이 바뀔 때(강점 다음에 보완할 점 등) 쓰는 역접 접속어
const ATTITUDE_CONNECTORS_CONTRAST = ['다만 ', '그러나 ', '하지만 '];

// 예시 문장을 "[수업 태도 · 학습 성향]" 아래에 이어붙임 — 제목이 없으면 새로 만들고, 처음 들어 있던 안내 문구는 지움.
// 바로 앞에 붙은 문장과 같은 결이면 "-습니다"를 "-고,"로 바꿔 한 문장처럼 이어 붙이고, 결이 바뀌면 새 문장으로
// 끊고 역접 접속어로 시작함. 선생님이 글을 직접 고쳐서 끝 문장을 못 찾으면(패턴이 안 맞으면) 안전하게
// 접속어만 붙여 새 문장으로 추가함.
function insertAttitudePhrase(text, phrase) {
  const idx = text.indexOf(ATTITUDE_HEADING);
  if (idx < 0) return text.replace(/\s+$/, '') + '\n\n' + ATTITUDE_HEADING + '\n' + phrase.text;
  const head = text.slice(0, idx + ATTITUDE_HEADING.length);
  let body = text.slice(idx + ATTITUDE_HEADING.length).trim();
  if (body.startsWith('이 부분은 선생님이 직접 관찰하신')) body = '';
  if (body.includes(phrase.text)) return head + '\n' + body;
  if (!body) return head + '\n' + phrase.text;

  const sentenceCount = (body.match(/[.!?]\s*/g) || []).length;
  const prev = ATTITUDE_PHRASE_LIST.find(p => body.endsWith(p.text));
  if (!prev) {
    const connector = ATTITUDE_CONNECTORS_SAME[sentenceCount % ATTITUDE_CONNECTORS_SAME.length];
    return head + '\n' + body + ' ' + connector + phrase.text;
  }
  if (prev.polarity === phrase.polarity) {
    const merged = body.slice(0, body.length - prev.text.length) + prev.clause;
    return head + '\n' + merged + ' ' + phrase.text;
  }
  const connector = ATTITUDE_CONNECTORS_CONTRAST[sentenceCount % ATTITUDE_CONNECTORS_CONTRAST.length];
  return head + '\n' + body + ' ' + connector + phrase.text;
}

// 선생님 의견 칸의 기본 초안으로 쓰이는 평문 요약 (HTML 태그 없음 — textarea에 직접 들어감)
// 성적 데이터로 판단 가능한 부분(추이·유형·난이도·재시험)은 최대한 구체적으로 자동 작성하고,
// 수업 태도·학습 성향처럼 이 앱에 데이터가 없는 부분은 선생님이 직접 채워 넣도록 빈 자리를 남겨둠
// (실제로 관찰하지 않은 내용을 지어내지 않기 위함)
// 선생님 의견 맨 앞 인사말 — 학생 담당 선생님(없으면 지금 로그인한 선생님)으로 자동 작성.
// 이름은 성을 뺀 이름으로, 받침이 있으면 "이"를 붙임 (예: 민준 → 민준이, 서연 → 서연)
function buildGreeting(student, points) {
  const full = displayName(student.name).trim();
  const given = full.length === 3 ? full.slice(1) : full.length >= 4 ? full.slice(2) : full;
  const nick = given + (hasBatchim(given) ? '이' : '');
  const teacher = student.teacher || getCurrentTeacher();
  const teacherTxt = teacher ? `${teacherDisplayName(teacher)} ${teacherTitle(teacher)}` : '선생님';
  // 입학테스트 반 학생은 아직 다닌 적이 없으므로 "지난 N주간 / 담임" 대신 입학테스트 결과 안내로 시작함
  if (isEntranceStudent(student)) {
    return `안녕하세요! ${given} 학부모님. 캐슬수학${teacher ? ' ' + teacherTxt : ''}입니다.\n${nick}의 입학테스트 결과를 안내드립니다.`;
  }
  const dateOf = p => { const r = state.rounds.find(x => x.id === p.roundId); return r ? new Date(r.date + 'T00:00:00') : null; };
  const d1 = dateOf(points[0]), d2 = dateOf(points[points.length - 1]);
  const weeks = d1 && d2 ? Math.max(1, Math.round((d2 - d1) / (7 * 86400000)) + 1) : points.length;
  return `안녕하세요! ${given} 학부모님. 캐슬수학 ${nick} 담임 ${teacherTxt}입니다.\n${nick}의 지난 ${weeks}주간 캐치유테스트 종합 보고서를 드립니다.`;
}

function buildComment(student, points, typeStats, difficulty, unitBreakdown, retest) {
  const name = displayName(student.name);
  const greeting = buildGreeting(student, points);
  const attitudeNote = '\n\n[수업 태도 · 학습 성향]\n이 부분은 선생님이 직접 관찰하신 내용으로 채워주세요 — 수업 참여도, 질문하는 태도, 과제·재시험 성실도, 성향(꼼꼼함/급함 등) 등을 자유롭게 적어보세요.';
  if (isEntranceStudent(student)) {
    // 입학테스트는 성장 추이가 아니라 "지금 실력의 첫 진단"이므로, 변화·추세 표현 없이 현재 수준과 앞으로의 출발점만 씀
    const overall = Math.round(points.reduce((a, p) => a + p.pct, 0) / points.length);
    const known = typeStats.filter(t => t.last !== null);
    const strong = known.filter(t => t.last >= 90).sort((a, b) => b.last - a.last);
    const weak = known.filter(t => t.last < 70).sort((a, b) => a.last - b.last);
    const nameList = arr => arr.map(t => t.name).join(', ');
    const eParts = [];
    eParts.push(overall >= 90 ? `${josa(name, '은', '는')} 입학테스트에서 전반적으로 탄탄한 기본기를 보여줬어요.`
      : overall >= 75 ? `${josa(name, '은', '는')} 입학테스트에서 대체로 안정적인 기본기를 보여줬어요.`
      : overall >= 60 ? `${josa(name, '은', '는')} 입학테스트에서 기본 개념은 잡혀 있고, 조금 더 다져가면 좋을 부분도 함께 확인됐어요.`
      : `${josa(name, '은', '는')} 입학테스트를 통해 지금 실력의 출발점을 정확히 확인했어요. 기초부터 차근차근 함께 쌓아가면 충분히 좋아질 수 있어요.`);
    if (strong.length) eParts.push(`특히 ${nameList(strong)} 유형은 이미 잘 갖추고 있었어요.`);
    if (weak.length) eParts.push(`${nameList(weak)} 유형은 입학 후 가장 먼저 함께 다져갈 부분으로 보고 있어요.`);
    if (!strong.length && !weak.length) eParts.push('유형별로 크게 두드러지는 부분 없이 고르게 확인됐어요.');
    if (difficulty && difficulty.avgWrong !== null && difficulty.avgCorrect !== null && difficulty.avgWrong > difficulty.avgCorrect + 0.5) {
      eParts.push('어려운 문제에서는 조금 어려워하는 모습이 있어, 그 부분을 단계별로 지도할 계획이에요.');
    }
    eParts.push('이 결과를 바탕으로 학생에게 맞는 수업 계획을 세워 지도하겠습니다.');
    return greeting + '\n\n' + eParts.join(' ');   // 입학테스트는 수업 태도·학습 성향 칸 없음
  }
  if (points.length < 2) {
    return `${greeting}\n\n${josa(name, '은', '는')} 아직 비교할 회차가 부족해요. 다음 회차 결과가 쌓이면 성장 추이를 자동으로 분석해드릴게요.${attitudeNote}`;
  }
  const first = points[0].pct, last = points[points.length - 1].pct;
  // 처음·마지막 두 회차만 비교하면 그 사이 기복에 따라 과장돼 보일 수 있어서,
  // 최근 흐름(최대 최근 3회차의 평균 변화량)도 함께 봐서 추세를 판단함
  const recentPts = points.slice(-4);
  const recentDeltas = [];
  for (let i = 1; i < recentPts.length; i++) recentDeltas.push(recentPts[i].pct - recentPts[i - 1].pct);
  const recentTrend = recentDeltas.length ? recentDeltas.reduce((a, b) => a + b, 0) / recentDeltas.length : (last - first);
  // 숫자·%는 거의 안 쓰고 선생님이 직접 쓴 편지처럼 — 상승폭 크기에 따라 표현 세기만 다르게 함
  const overallVerb = recentTrend > 5 ? '이번 기간 동안 눈에 띄게 좋아지는 모습을 보였어요'
    : recentTrend > 1 ? '이번 기간 동안 조금씩 꾸준히 좋아지고 있어요'
    : recentTrend < -5 ? '이번 기간 동안 조금 주춤하는 모습도 있었지만, 다시 끌어올리는 중이에요'
    : recentTrend < -1 ? '이번 기간 동안 살짝 흔들리는 모습도 있었어요'
    : '이번 기간 동안 비슷한 수준을 꾸준히 유지하고 있어요';

  const withDelta = typeStats.filter(t => t.delta !== null);
  const strengths = withDelta.filter(t => t.last >= 90 && t.delta >= 0).sort((a, b) => b.last - a.last);
  const improving = withDelta.filter(t => t.delta > 0 && !strengths.includes(t)).sort((a, b) => b.delta - a.delta);
  const watch = withDelta.filter(t => t.delta <= 0 && t.avg < 85).sort((a, b) => a.avg - b.avg);

  const nameList = arr => arr.map(t => t.name).join(', ');

  const parts = [];
  parts.push(`${josa(name, '은', '는')} ${overallVerb}.`);
  if (strengths.length) parts.push(`특히 ${nameList(strengths)} 유형은 이제 믿고 맡길 만큼 탄탄해졌어요.`);
  if (improving.length) parts.push(`${nameList(improving)} 유형도 눈에 띄게 좋아지고 있어요.`);
  if (watch.length) parts.push(`다만 ${nameList(watch)} 유형은 다음 학습에서 함께 좀 더 다져가면 좋을 부분이에요.`);
  if (!strengths.length && !improving.length && !watch.length) parts.push('아직 뚜렷한 강점·약점 유형을 판단하기엔 데이터가 조금 더 필요해요.');

  if (difficulty && difficulty.avgWrong !== null && difficulty.avgCorrect !== null) {
    if (difficulty.avgWrong > difficulty.avgCorrect + 0.5) parts.push('어려운 문제에서 막히는 경향이 있어, 심화 개념 보완이 필요해 보여요.');
    else if (difficulty.avgWrong < difficulty.avgCorrect - 0.5) parts.push('오답 중 비교적 쉬운 문제도 섞여 있어, 실수를 줄이는 연습이 도움이 될 수 있어요.');
  }
  if (unitBreakdown && unitBreakdown.length) {
    const weakest = [...unitBreakdown].sort((a, b) => a.pct - b.pct)[0];
    if (weakest.pct < 70) parts.push(`단원 중에서는 ${josa(weakest.unit, '을', '를')} 다음에 함께 좀 더 채워가면 좋겠어요.`);
  }
  if (retest && retest.items.length) {
    const retestPhrase = retest.overallPct >= 90 ? '재시험에서는 틀렸던 문항들을 거의 다 스스로 바로잡아냈어요.'
      : retest.overallPct >= 60 ? '재시험에서는 틀렸던 문항 중 상당수를 스스로 바로잡아냈어요.'
      : '재시험에서는 틀렸던 문항들을 다시 짚어보며 차근차근 보완해가고 있어요.';
    parts.push(retestPhrase);
  }

  return greeting + '\n\n' + parts.join(' ') + attitudeNote;
}

// 선택된 학생이 채점 기록을 가진 회차들로 시작/종료 드롭다운을 채움 (가능하면 기존 선택 유지)
function populateReportRoundSelects() {
  const studentId = document.getElementById('reportStudentSel').value;
  const fromSel = document.getElementById('reportFromSel');
  const toSel = document.getElementById('reportToSel');
  const rounds = studentId ? studentScoredRounds(studentId) : [];
  const opts = rounds.map(x => `<option value="${x.round.id}">${escapeHtml(x.label)} (${shortDate(x.round.date)})</option>`).join('');
  const studentChanged = studentId !== lastReportRangeStudentId;
  lastReportRangeStudentId = studentId;
  const prevFrom = fromSel.value, prevTo = toSel.value;
  fromSel.innerHTML = opts;
  toSel.innerHTML = opts;
  if (!rounds.length) return;
  if (studentChanged) {
    // 학생이 바뀌면 이번 보고서 기본 기간(8-3주차~9-3주차)으로 다시 맞춤 — 그 기간에 있는 회차만 걸러서
    // 처음/끝을 정하므로, 그 학생이 8-3주차나 9-3주차에 채점 기록이 없으면 있는 데이터 선에서 자동으로 줄어듦
    const inWindow = rounds.filter(x => x.round.date >= DEFAULT_REPORT_FROM_DATE && x.round.date <= DEFAULT_REPORT_TO_DATE);
    const fromR = inWindow.length ? inWindow[0] : rounds[0];
    const toR = inWindow.length ? inWindow[inWindow.length - 1] : rounds[rounds.length - 1];
    fromSel.value = fromR.round.id;
    toSel.value = toR.round.id;
  } else {
    fromSel.value = rounds.some(x => x.round.id === prevFrom) ? prevFrom : rounds[0].round.id;
    toSel.value = rounds.some(x => x.round.id === prevTo) ? prevTo : rounds[rounds.length - 1].round.id;
  }
}

// 보고서의 각 요소(카드·타일)마다 "PDF 포함" 체크박스를 달아서, 필요 없는 건 빼고 PDF로 저장할 수 있게 함.
// 체크를 끈 요소는 화면에서 흐리게 보이고 PDF에서 빠짐. 학생마다 따로 기억해둠(state.reportHidden)
const REPORT_PART_NAMES = {
  masthead: '제목 영역', pillGrade: '예상 등급', pillRate: '정답률', pillCount: '채점 문항 수', pillDiff: '시험 난이도', pillDelta: '상승/최고 기록',
  trend: '전체 정답률 추이', note: '선생님 의견', sw: '대표 강점·취약 유형', extend: '추가 추이 그래프', types: '유형별 정답률',
  retest: '재시험 결과', unit: '단원별 학습성과', diff: '난이도 분석', radar: '핵심역량', table: '회차별 상세 기록',
};
function updateReportPillColumns(out) {
  const row = out.querySelector('.pill-row');
  if (!row) return;
  const n = Array.from(row.children).filter(el => !el.classList.contains('rk-off')).length;
  row.style.setProperty('--pill-n', Math.max(1, n));
}
function setupReportPartToggles(out, studentId) {
  const hiddenList = state.reportHidden[studentId] || [];
  out.querySelectorAll('[data-rkey]').forEach(el => {
    const key = el.dataset.rkey;
    const label = document.createElement('label');
    label.className = 'rk-toggle no-print';
    label.title = REPORT_PART_NAMES[key] ? `${REPORT_PART_NAMES[key]} — 체크를 끄면 PDF에서 빠져요` : 'PDF에 포함';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !hiddenList.includes(key);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' PDF 포함'));
    el.appendChild(label);
    el.classList.toggle('rk-off', !cb.checked);
    cb.addEventListener('change', () => {
      const list = (state.reportHidden[studentId] || []).filter(k => k !== key);
      if (!cb.checked) list.push(key);
      if (list.length) state.reportHidden[studentId] = list; else delete state.reportHidden[studentId];
      saveState();
      el.classList.toggle('rk-off', !cb.checked);
      updateReportPillColumns(out);
    });
  });
  updateReportPillColumns(out);

  // 겉표지도 요소 중 하나 — 보고서 생성 카드의 "겉표지 포함" 체크박스로 빼고 넣음
  const coverToggle = document.getElementById('pdfCoverToggle');
  if (coverToggle) {
    coverToggle.checked = !hiddenList.includes('cover');
    coverToggle.onchange = () => {
      const list = (state.reportHidden[studentId] || []).filter(k => k !== 'cover');
      if (!coverToggle.checked) list.push('cover');
      if (list.length) state.reportHidden[studentId] = list; else delete state.reportHidden[studentId];
      saveState();
    };
  }
}

function renderReportTab() {
  try { renderReportArchive(); } catch (e) { console.warn(e); }
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

  const retestSection = (retest.items.length && !isEntranceStudent(student)) ? `
    <div class="card" data-rkey="retest">
      <h2>재시험 결과</h2>
      <p class="card-sub">오답 문항 쌍둥이문제 재시험 기록 · 메인 정답률과 별도 집계</p>
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
    <div class="card" data-rkey="unit">
      <h2>단원별 학습성과</h2>
      <p class="card-sub">2022 개정 교육과정 단원 기준 · 기간 누적</p>
      ${unitBreakdown.map(u => `
        <div class="unit-row">
          <div class="unit-name">${escapeHtml(u.unit)}</div>
          <div class="unit-count">${u.total}문항</div>
          <div class="unit-bar-wrap">${buildBarRow(u.pct, u.pct < 70 ? 'var(--warn-dot)' : 'var(--data)')}</div>
          <div class="unit-pct tnum">${u.pct}%</div>
        </div>`).join('')}
    </div>` : '';

  const diffSection = difficulty ? `
    <div class="card" data-rkey="diff">
      <h2>난이도 분석</h2>
      <p class="card-sub no-print">문항별 난이도 1(하)~6(최상) · 시험지 분석 시 태그된 경우에만 표시${difficulty.manual ? ' · 전체 평균은 강사 지정값' : ''}</p>
      <div class="diff-row">
        <div class="diff-tile"><div class="label">전체 평균 난이도</div><div class="value tnum">${difficulty.avgAll}</div></div>
        ${difficulty.avgCorrect !== null ? `<div class="diff-tile"><div class="label">정답 문항 평균 난이도</div><div class="value tnum" style="color:var(--good)">${difficulty.avgCorrect}</div></div>` : ''}
        ${difficulty.avgWrong !== null ? `<div class="diff-tile"><div class="label">오답 문항 평균 난이도</div><div class="value tnum" style="color:var(--critical)">${difficulty.avgWrong}</div></div>` : ''}
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
    <div class="card" data-rkey="radar">
      <h2>핵심역량</h2>
      <p class="card-sub">2022 개정 수학과목 5대 핵심역량 기준${competencyHasAnyData ? '' : ' · 역량이 태그된 시험지 없음'}</p>
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

  // 평균 난이도 조절칸 — 1.0(하)~6.0(최상)을 0.5 단위로 고를 수 있음. 비워두면 시험지에 태그된 난이도로 자동 계산
  const diffOverrideVal = state.difficultyOverrides[studentId];
  const diffOptions = Array.from({ length: 11 }, (_, i) => 1 + i * 0.5).map(v => {
    const lo = difficultyLabelByN(Math.floor(v)), hi = difficultyLabelByN(Math.ceil(v));
    return `<option value="${v}"${Number(diffOverrideVal) === v ? ' selected' : ''}>${v.toFixed(1)} · ${lo === hi ? lo : lo + '~' + hi}</option>`;
  }).join('');

  out.innerHTML = `
    <div class="sample-flag no-print">${studentId === EXAMPLE_STUDENT_ID
      ? '예시보고서 · 실제 학생이 아닌 가상의 예시(차캐슬)로 만든 보고서 형식 샘플이에요 · 어느 컴퓨터에서 열어도 항상 똑같이 보여요 · 학부모용 PDF에는 이 안내가 빠져요'
      : '실제 데이터 기반 보고서 미리보기 · 강사용 화면이며 학부모용 PDF에는 이 안내와 일부 내부 설명이 빠져요'}</div>
    <div class="card" data-rkey="masthead">
      <div class="masthead">
        <div>
          <div class="brand-line">${logoBlock()}</div>
          <h2>${isEntranceStudent(student) ? '입학테스트 분석보고서' : '캐치유테스트 분석보고서'}${state.studentDone[studentId] ? '<span class="badge good no-print" style="margin-left:10px; vertical-align:middle;"><span class="dot"></span>채점입력 완료</span>' : ''}</h2>
        </div>
        <div class="meta">
          <div class="student-name-big">${escapeHtml(displayName(student.name))}</div>
          <div>${[student.school, student.grade].filter(Boolean).map(escapeHtml).join(' ')}</div>
          ${student.teacher ? `<div>담임: ${escapeHtml(teacherDisplayName(student.teacher))} ${teacherTitle(student.teacher)}</div>` : ''}
          <div>기간 ${escapeHtml(first.date)} – ${escapeHtml(last.date)} (${points.length}회차)</div>
        </div>
      </div>
    </div>
    <div class="pill-row">
      <div class="pill-tile" data-rkey="pillGrade"><span class="pill-tag" style="background:var(--data)">예상 등급</span>
        <div class="pill-value tnum" style="font-size:${grade.label.includes('~') ? 17 : 21}px; white-space:nowrap;">${grade.label}</div>
        <div class="pill-compare">예상</div>
        <div class="no-print" style="margin-top:8px;">
          <select id="gradeOverrideSel" style="font-size:12px; padding:4px 6px; min-width:auto;">
            <option value="">예상 등급 자동 계산</option>
            ${['1', '2', '3', '4', '5', '1-2', '2-3', '3-4', '4-5'].map(v => `<option value="${v}"${String(state.gradeOverrides[studentId]) === v ? ' selected' : ''}>${v.replace('-', '~')}등급${v.includes('-') ? ' 예상' : '으로 수정'}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="pill-tile" data-rkey="pillRate"><span class="pill-tag" style="background:var(--good)">정답률</span>
        <div class="pill-value tnum">${overallPct}%</div>
      </div>
      <div class="pill-tile" data-rkey="pillCount"><span class="pill-tag" style="background:var(--type-2)">${totalQ}문항 채점</span>
        <div class="pill-value tnum">${totalQ}</div>
        <div class="pill-compare">기간 내 채점된 문항 수</div>
      </div>
      <div class="pill-tile" data-rkey="pillDiff"><span class="pill-tag" style="background:${!difficulty ? 'var(--muted)' : difficulty.avgAll <= 2 ? 'var(--good)' : difficulty.avgAll <= 4 ? 'var(--type-2)' : 'var(--critical)'}">시험 난이도</span>
        <div class="pill-value tnum">${difficulty ? difficultyLabelByN(difficulty.avgAll) : '—'}</div>
        <div class="pill-compare">${difficulty ? `평균 ${difficulty.avgAll} / 6` : '난이도 정보 없음'}</div>
        <div class="no-print" style="margin-top:8px;">
          <select id="difficultyOverrideSel" style="font-size:12px; padding:4px 6px; min-width:auto;">
            <option value="">평균 난이도 자동 계산</option>
            ${diffOptions}
          </select>
        </div>
      </div>
      ${delta <= 0 ? (() => {
        // 오르지 않은 경우(0 이하)엔 변화량 대신 이 기간 최고 기록을 보여줌 (학부모에게 굳이 부담되는 숫자를 앞세우지 않기 위함)
        const best = points.reduce((a, b) => (b.pct > a.pct ? b : a), points[0]);
        return `<div class="pill-tile" data-rkey="pillDelta"><span class="pill-tag" style="background:var(--good)">최고 기록</span>
        <div class="pill-value tnum up">${best.pct}%</div>
        <div class="pill-compare"><span style="white-space:nowrap;">${best.label}</span><br><span style="white-space:nowrap;">이 기간 가장 높은 정답률</span></div>
      </div>`;
      })() : `<div class="pill-tile" data-rkey="pillDelta"><span class="pill-tag" style="background:var(--good)">상승</span>
        <div class="pill-value tnum up">+${delta}%p</div>
        <div class="pill-compare"><span style="white-space:nowrap;">${first.label} ${first.pct}%</span><br><span style="white-space:nowrap;">→ ${last.label} ${last.pct}%</span></div>
      </div>`}
    </div>
    <div class="card" id="trendChartCard" data-rkey="trend">
      <h2>전체 정답률 추이</h2>
      <p class="card-sub">회차별 ${points[points.length-1].total}문항 기준</p>
      <div class="chart-wrap" id="trendChartWrap">${buildMainChartSVG(points)}</div>
      <label class="no-print" style="display:flex; align-items:center; gap:6px; font-size:12.5px; margin-top:10px;">
        <input type="checkbox" id="reportExtendTrendToggle"${extendChecked ? ' checked' : ''}> 다른 기간의 추이 그래프 추가로 보기
      </label>
    </div>
    <div class="card" id="teacherNoteCard" data-rkey="note">
      <h2>선생님 의견</h2>
      <p class="card-sub no-print">자동 요약 문장이 미리 입력되어 있음. 그대로 사용하거나 수정 가능하며, 버튼으로 AI가 이번 기간 데이터로 새 초안을 작성할 수도 있음.</p>
      <div class="inline-form no-print" style="margin-bottom:8px;">
        <button type="button" class="btn ghost" id="aiCommentBtn">AI 의견 초안 작성</button>
        <span id="aiCommentStatus" class="field-hint"></span>
      </div>
      <textarea class="teacher-note no-print" id="teacherNoteInput" placeholder="선생님 의견을 입력하거나 위 버튼으로 AI 초안을 작성하세요.">${escapeHtml(savedNote)}</textarea>
      ${isEntranceStudent(student) ? '' : `<details class="manual-fallback no-print attitude-picker">
        <summary>수업 태도 · 학습 성향 예시 문장 (눌러서 추가, 아래 의견에 그대로 들어가요)</summary>
        <p class="field-hint" style="margin:6px 0;">관찰한 내용과 맞는 문장만 선택. 추가한 뒤에도 수정 가능.</p>
        ${ATTITUDE_PHRASES.map((g, gi) => `<div class="attitude-group"><b>${g.cat}</b>${g.items.map((p, pi) => `<button type="button" class="phrase-chip" data-g="${gi}" data-p="${pi}">${escapeHtml(p.text)}</button>`).join('')}</div>`).join('')}
      </details>`}
      <p class="comment print-only">${savedNote ? escapeHtml(savedNote).replace(/\n/g, '<br>') : '(작성된 의견이 없어요)'}</p>
    </div>
    <div class="card" data-rkey="sw">
      <h2>대표 강점 · 취약 유형</h2>
      <p class="card-sub">선택한 기간 기준</p>
      <div class="summary-cols">
        <div class="summary-box good"><h3>대표 강점 유형</h3>${strengthsHtml}</div>
        <div class="summary-box watch"><h3>대표 취약 유형</h3>${watchHtml}</div>
      </div>
    </div>
    ${extendChecked ? `<div class="card" data-rkey="extend">
      <h2>추가 추이 그래프</h2>
      <p class="card-sub">${extendPoints.length ? `${escapeHtml(extendPoints[0].label)} – ${escapeHtml(extendPoints[extendPoints.length - 1].label)} 기준` : '채점 기록 없음'}</p>
      <div class="inline-form no-print" style="margin-bottom:10px;">
        <select id="reportExtendFromSel"></select>
        <span class="field-hint">부터</span>
        <select id="reportExtendToSel"></select>
        <span class="field-hint">까지</span>
      </div>
      <div class="chart-wrap">${buildMainChartSVG(extendPoints)}</div>
    </div>` : ''}
    <div class="card" data-rkey="types">
      <h2>유형별 정답률</h2>
      <p class="card-sub">최근 정답률</p>
      <div class="type-grid">${typeCards}</div>
    </div>
    ${retestSection}
    ${unitSection}
    ${diffSection}
    ${radarSection}
    <div class="card" data-rkey="table">
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

  const difficultyOverrideSel = document.getElementById('difficultyOverrideSel');
  if (difficultyOverrideSel) {
    difficultyOverrideSel.addEventListener('change', () => {
      const v = difficultyOverrideSel.value;
      if (v) state.difficultyOverrides[studentId] = parseFloat(v);
      else delete state.difficultyOverrides[studentId];
      saveState();
      renderReportTab();
    });
  }

  setupReportPartToggles(out, studentId);

  const gradeOverrideSel = document.getElementById('gradeOverrideSel');
  if (gradeOverrideSel) {
    gradeOverrideSel.addEventListener('change', () => {
      const v = gradeOverrideSel.value;
      if (v) state.gradeOverrides[studentId] = v.includes('-') ? v : parseInt(v, 10);
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

  out.querySelectorAll('.phrase-chip').forEach(chip => chip.addEventListener('click', () => {
    if (!noteInput) return;
    const phrase = ATTITUDE_PHRASES[chip.dataset.g].items[chip.dataset.p];
    noteInput.value = insertAttitudePhrase(noteInput.value, phrase);
    state.teacherNotes[studentId] = noteInput.value;
    saveState();
    out.querySelector('.print-only').innerHTML = escapeHtml(noteInput.value).replace(/\n/g, '<br>');
    chip.classList.add('used');
  }));

  const aiCommentBtn = document.getElementById('aiCommentBtn');
  if (aiCommentBtn) {
    aiCommentBtn.addEventListener('click', async () => {
      const status = document.getElementById('aiCommentStatus');
      aiCommentBtn.disabled = true;
      status.style.color = 'var(--muted)';
      status.textContent = '작성 중이에요...';
      let commentUsageText = '';
      try {
        const prompt = buildTeacherCommentPrompt(student, points, typeStats, overallPct, classAvgOverall, strengths, watch, difficulty, retest);
        const { text, stopReason, usage } = await callClaudeAPI({ content: [{ type: 'text', text: prompt }], maxTokens: 16000, effort: 'low' });
        commentUsageText = usageCostText(usage);
        if (!text.trim()) throw new Error(stopReason === 'max_tokens' ? 'AI가 답을 쓰기 전에 길이 한도에 걸렸어요. 다시 눌러주세요.' : 'AI 응답이 비어 있어요. 다시 눌러주세요.');
        noteInput.value = buildGreeting(student, points) + '\n\n' + text.trim();
        state.teacherNotes[studentId] = noteInput.value;
        saveState();
        out.querySelector('.print-only').innerHTML = escapeHtml(noteInput.value).replace(/\n/g, '<br>');
        status.style.color = 'var(--good)';
        status.textContent = '작성 완료! 내용을 확인하고 필요하면 수정하세요.' + commentUsageText;
      } catch (err) {
        console.error(err);
        status.style.color = 'var(--critical)';
        status.textContent = '작성 실패: ' + err.message + commentUsageText;
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
  if (isEntranceStudent(student)) {
    const entranceTypeLines = typeStats.filter(t => t.last !== null).map(t => `- ${t.name}${t.unit ? `(${t.unit})` : ''}: ${t.avg}%`).join('\n');
    return `당신은 수학학원 선생님입니다. 아래는 아직 학원에 다니지 않은 신입 예정 학생이 본 "입학테스트" 결과예요. 이 결과를 참고해서, 학부모님께 보여드릴 "선생님 의견"을 선생님이 손수 쓴 편지글처럼 4~6문장으로 써주세요.

[가장 중요한 점]
- 이 학생은 지금까지 우리 학원에 다닌 적이 없습니다. "그동안", "지난 몇 주간", "꾸준히 좋아지고 있다", "성장", "향상", "추이", "변화", "이전보다"처럼 다녀온 학생에게 쓰는 표현은 절대 쓰지 마세요. 오직 입학테스트 한 번으로 확인한 "지금의 실력"과 "앞으로 어떻게 시작할지"만 쓰세요.

[문체]
- 인사말("안녕하세요" 등)과 자기소개는 앞에 따로 붙으니 쓰지 말고, 바로 본문부터 시작하세요.
- 따뜻하고 정중한 존댓말("~했어요", "~하고 있습니다", "~해 보려고 합니다")로, 선생님이 직접 쓴 편지처럼 쓰세요.
- 숫자와 퍼센트는 거의 쓰지 마세요. 전체 수준을 말할 때 꼭 필요한 경우에만 한두 개 넣고, 나머지는 말로 풀어주세요. 유형별 퍼센트를 나열하거나 "%p" 표기는 절대 쓰지 마세요.
- "하락", "부진", "취약", "떨어진다" 같은 딱딱하거나 부정적인 단어는 피하고, 보완할 점은 "입학 후 함께 채워갈 부분", "차근차근 다져갈 부분"처럼 앞으로의 과제로 표현하세요. 다만 사실과 다르게 과장하거나 근거 없이 칭찬하지는 마세요.

[내용]
- 입학테스트에서 확인된 현재 수준과 잘 갖추고 있는 부분을 먼저, 그다음 입학 후 먼저 보완할 부분, 마지막에 이 결과를 바탕으로 한 수업 시작 계획을 한 문장으로 쓰세요.
- 데이터에 없는 사실(수업 태도, 숙제, 성격, 과거 학습 이력, 있었던 일 등)은 절대 지어내지 마세요. 이 앱은 그런 정보를 갖고 있지 않습니다.
- 결과는 본문 텍스트만 출력하세요 (따옴표, 마크다운, 별도 제목 없이).

학생: ${displayName(student.name)} (입학테스트 응시)
입학테스트 전체 정답률: ${overallPct}%
잘 갖춘 유형: ${strengths.length ? strengths.map(t => t.name).join(', ') : '없음'}
입학 후 먼저 다질 유형: ${watch.length ? watch.map(t => t.name).join(', ') : '없음'}
${difficultyLine}

유형별 상세:
${entranceTypeLines}`;
  }
  return `당신은 학생을 직접 가르치는 수학학원 담임 선생님입니다. 아래는 캐치유테스트에서 한 학생의 최근 학습 데이터예요. 이 데이터를 참고해서, 학부모님께 보여드릴 "선생님 의견"을 선생님이 손수 쓴 편지글처럼 4~6문장으로 써주세요.

[문체]
- 인사말("안녕하세요" 등)과 자기소개는 앞에 따로 붙으니 쓰지 말고, 바로 본문부터 시작하세요.
- 데이터 리포트가 아니라 학생을 지켜본 선생님의 말투로 쓰세요. "~했어요", "~하고 있습니다", "~해 보려고 합니다"처럼 따뜻하고 정중한 존댓말을 쓰고, 필요하면 "저는", "제가"도 자연스럽게 쓰세요.
- 숫자는 거의 쓰지 마세요. 전체 흐름을 말할 때 꼭 필요한 경우에만 숫자를 한두 개 넣고, 나머지는 말로 풀어주세요 (예: "90%" 대신 "거의 다 맞힐 만큼", "+12%p" 대신 "눈에 띄게 좋아졌어요", "정체" 대신 "조금 더 시간이 필요한"). 유형별 퍼센트를 줄줄이 나열하거나 "%p" 표기는 절대 쓰지 마세요.
- 유형·단원 이름은 그대로 언급해도 좋지만 "OO 유형은 몇 %" 식의 나열이 아니라 "OO은 이제 믿고 맡길 만큼 탄탄해졌어요"처럼 문장 속에 녹여주세요.
- "하락", "떨어졌다", "부진", "취약" 같은 딱딱하거나 부정적인 단어는 피하고, 보완할 점은 "다음에 함께 채워갈 부분", "조금만 더 다듬으면 좋아질 부분"처럼 앞으로의 과제로 표현하세요. 그렇다고 사실과 다르게 과장하거나 근거 없이 칭찬하지는 마세요.

[내용]
- 잘하고 있는 점을 먼저, 그다음 보완할 점, 마지막에 앞으로의 지도 계획을 한 문장으로 쓰세요.
- 난이도·재시험 데이터가 있으면 숫자 대신 경향으로 자연스럽게 녹여주세요 (예: 어려운 문제에서 조금 흔들리는 모습, 재시험에서 틀렸던 문제를 잘 바로잡은 모습).
- 데이터에 없는 사실(수업 태도, 숙제, 성격, 있었던 일 등)은 절대 지어내지 마세요. 이 앱은 그런 정보를 갖고 있지 않습니다.
- 마지막 줄에 "[수업 태도 · 학습 성향]"이라는 제목만 쓰고, 그 아래는 선생님이 직접 채울 수 있도록 비워두세요.
- 결과는 본문 텍스트만 출력하세요 (따옴표, 마크다운, 별도 제목 없이 — 단, 마지막의 "[수업 태도 · 학습 성향]" 제목 줄은 그대로 출력하세요).

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
    pdfFlushPage(pdf, ctx, true);
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
    pdfFlushPage(pdf, ctx, true);
    pdf.addPage();
    ctx.y = ctx.marginY;
    ctx.pageHasContent = false;
  }
  // 바로 그리지 않고 페이지에 모아뒀다가, 페이지가 다 찼을 때 남는 아래 여백을 요소 사이 간격에 나눠서 그림
  (ctx.pageItems = ctx.pageItems || []).push({ imgData: canvas.toDataURL('image/jpeg', 0.95), y: ctx.y, h: imgH });
  ctx.y += imgH + ctx.gap;
  ctx.pageHasContent = true;
}

// 모아둔 요소들을 현재 PDF 페이지에 그림. justify가 켜져 있으면(=다음 페이지로 넘어가는 페이지) 아래에 남은 여백을
// 요소 사이 간격에 골고루 나눠서 아래만 휑하지 않게 함 (간격 하나당 최대 20mm까지만 벌려서 과하게 늘어지지 않게)
function pdfFlushPage(pdf, ctx, justify) {
  const items = ctx.pageItems || [];
  ctx.pageItems = [];
  if (!items.length) return;
  if (justify) {
    const last = items[items.length - 1];
    const leftover = Math.max(0, ctx.contentBottom - (last.y + last.h));
    const gapCount = items.length - 1;
    // 여백을 전부 요소 사이 간격에 몰아 위아래로 꽉 채우면 페이지가 너무 퍼져 보여서, 간격은 조금만
    // 벌리고(최대 10mm) 남는 여백은 블록 전체를 아래로 내려 페이지 가운데 쪽으로 모음
    const gapExtra = gapCount > 0 ? Math.min(leftover / gapCount, 10) : 0;
    const topOffset = (leftover - gapExtra * gapCount) / 2;
    items.forEach((it, i) => { it.y += topOffset + gapExtra * i; });
  }
  items.forEach(it => pdf.addImage(it.imgData, 'JPEG', ctx.marginX, it.y, ctx.contentWidth, it.h, undefined, 'FAST'));
}

// 리포트 맨 앞장 — 로고/학원명, 학생 이름, 측정 기간·회차 수, 담당 강사를 보여주는 표지 한 장
// 학원의 상징색인 빨간색 포인트 라인 + 페이지 대부분을 채우는 큰 테두리 박스로 격식있게 구성
async function pdfAddCoverPage(pdf, student, points) {
  const period = points.length ? `${points[0].date} – ${points[points.length - 1].date}` : '';
  const teacherTxt = student.teacher ? escapeHtml(teacherDisplayName(student.teacher)) + ' ' + teacherTitle(student.teacher) : '-';
  // 입학테스트 반 학생은 "캐치유테스트 분석보고서 / 측정 기간 N회차 / 담임" 대신 입학테스트 결과 표지를 따로 씀
  const entrance = isEntranceStudent(student);
  const fmtFull = iso => { const d = new Date(iso + 'T00:00:00'); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
  const testDates = Array.from(new Set(points.map(p => { const r = state.rounds.find(x => x.id === p.roundId); return r ? r.date : null; }).filter(Boolean))).sort();
  const takenTxt = testDates.length ? (testDates.length === 1 ? fmtFull(testDates[0]) : `${fmtFull(testDates[0])} – ${fmtFull(testDates[testDates.length - 1])}`) : escapeHtml(period);
  const coverTitle = entrance ? '입학테스트 분석보고서' : '캐치유테스트 분석보고서';
  const infoItems = entrance
    ? [['학교/학년', escapeHtml(schoolGradeText(student.school, student.grade))], ['응시일', takenTxt], ['담당', student.teacher ? teacherTxt : '캐슬수학']]
    : [['학교/학년', escapeHtml(schoolGradeText(student.school, student.grade))], ['측정 기간', `${escapeHtml(period)} (${points.length}회차)`], ['담임', teacherTxt]];
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
            <div style="font-weight:700; font-size:22px; color:#444444;">${coverTitle}</div>
            <div style="width:70px; height:3px; background:#c8102e; margin:30px auto 0;"></div>
          </div>
          <div style="width:100%;">
            <div style="border-top:1px solid #ddddd3; margin-bottom:22px;"></div>
            <div style="display:flex; justify-content:center; gap:64px; font-size:14px; color:#3a3a3a; text-align:center;">
              ${infoItems.map(([label, value]) => `<div><div style="color:#c8102e; font-weight:700; font-size:11.5px; letter-spacing:0.04em; margin-bottom:6px;">${label}</div>${value}</div>`).join('')}
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

/* ================= 보고서 모음 (보고서 탭 오른쪽) =================
 * 채점 데이터가 있는 학생을 모아 보여주고, PDF로 저장한 기록(state.reportLog)을 함께 보여줌.
 * 데이터가 남아 있으면 언제든 "보기"로 그 기간 보고서를 다시 열거나 "PDF 뽑기"로 바로 새 PDF를 저장할 수 있음 */
function reportArchiveStudents() {
  const ids = new Set(scopedRounds().map(r => r.id));
  const has = new Set(state.results.filter(x => ids.has(x.roundId)).map(x => x.studentId));
  return filterByCurrentTeacher(state.students).filter(s => has.has(s.id));
}
function renderReportArchive() {
  const box = document.getElementById('reportArchive');
  if (!box) return;
  if (!state.reportLog) state.reportLog = [];
  const q = ((document.getElementById('reportArchiveSearch') || {}).value || '').trim();
  const cur = document.getElementById('reportStudentSel').value;
  const withData = new Set(reportArchiveStudents().map(s => s.id));
  const logsBy = new Map();
  state.reportLog.forEach(l => { if (!logsBy.has(l.studentId)) logsBy.set(l.studentId, []); logsBy.get(l.studentId).push(l); });
  // 오른쪽에는 PDF 저장을 눌러 만든 보고서가 있는 학생만 보여줌 (현재 화면 범위·담당 선생님 기준)
  const students = filterByCurrentTeacher(state.students).filter(s => logsBy.has(s.id));
  const sid = new Set(students.map(s => s.id));
  const lastOf = s => { const a = logsBy.get(s.id); return a && a.length ? a[a.length - 1] : null; };
  const rows = students.filter(s => !q || (s.name || '').includes(q))
    .sort((a, b) => ((lastOf(b) ? lastOf(b).savedAt : 0) - (lastOf(a) ? lastOf(a).savedAt : 0)) || (a.name || '').localeCompare(b.name || '', 'ko'));
  const savedCount = state.reportLog.filter(l => sid.has(l.studentId)).length;
  const fmt = t => { const d = new Date(t); return `${d.getMonth() + 1}.${d.getDate()}`; };
  const rowHtml = s => {
    const l = lastOf(s), n = (logsBy.get(s.id) || []).length;
    const alive = withData.has(s.id);
    return `<div class="ra-row${s.id === cur ? ' active' : ''}" data-sid="${s.id}">
      <div class="ra-name">${escapeHtml(s.name)}<span>${s.class ? escapeHtml(s.class) : escapeHtml(s.grade || '')}</span></div>
      <div class="ra-sub">PDF ${fmt(l.savedAt)} 저장 · ${escapeHtml(l.fromDate || '')}~${escapeHtml(l.toDate || '')}${n > 1 ? ` · ${n}회` : ''}${alive ? '' : ' · 채점 데이터 없음'}</div>
      <div class="ra-actions">${alive ? '<button type="button" class="btn ghost" data-ra="open">보기</button><button type="button" class="btn" data-ra="pdf">PDF 저장</button>' : ''}</div>
    </div>`;
  };
  box.innerHTML = `<h2>보고서 모음</h2>
    <p class="card-sub">PDF 저장한 학생 ${students.length}명 · 저장한 보고서 ${savedCount}개</p>
    <input type="text" id="reportArchiveSearch" placeholder="이름 검색" value="${escapeHtml(q)}" style="width:100%; min-width:0; margin-bottom:8px;">
    <div class="ra-list">${rows.length ? rows.map(rowHtml).join('') : '<div class="empty-state">PDF 저장을 누르면 여기에 쌓여요.</div>'}</div>`;
  const search = document.getElementById('reportArchiveSearch');
  search.addEventListener('input', () => { const p = search.selectionStart; renderReportArchive(); const s2 = document.getElementById('reportArchiveSearch'); s2.focus(); try { s2.setSelectionRange(p, p); } catch (e) {} });
  box.querySelectorAll('.ra-row').forEach(row => {
    const o = row.querySelector('[data-ra=open]'), p = row.querySelector('[data-ra=pdf]');
    if (o) o.addEventListener('click', () => openArchivedReport(row.dataset.sid));
    if (p) p.addEventListener('click', async () => { openArchivedReport(row.dataset.sid); await exportReportPDF(); });
  });
}
// 그 학생의 보고서를 열음 — PDF로 저장했던 기간이 있으면 그 기간으로, 없으면 기본 기간으로
function openArchivedReport(studentId) {
  const rs = document.getElementById('reportStudentSel');
  if (![...rs.options].some(o => o.value === studentId)) { toast('이 학생은 지금 학생 목록에 없어요 (담당 선생님 선택을 확인하세요).'); return; }
  rs.value = studentId;
  populateReportRoundSelects();
  const l = (state.reportLog || []).filter(x => x.studentId === studentId).pop();
  const from = document.getElementById('reportFromSel'), to = document.getElementById('reportToSel');
  if (l && [...from.options].some(o => o.value === l.from) && [...to.options].some(o => o.value === l.to)) { from.value = l.from; to.value = l.to; }
  renderReportTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function logReportPdf(data, fromId, toId) {
  if (!state.reportLog) state.reportLog = [];
  const pts = data.points;
  state.reportLog.push({ id: uid(), studentId: data.student.id, from: fromId, to: toId, fromDate: pts[0] ? pts[0].date : '', toDate: pts.length ? pts[pts.length - 1].date : '', savedAt: Date.now() });
  if (state.reportLog.length > 500) state.reportLog = state.reportLog.slice(-500);
  saveState();
  renderReportArchive();
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

    // "겉표지 포함"을 끄면 겉표지와 뒷면 빈 페이지 없이 본문부터 바로 시작함
    const includeCover = !((state.reportHidden[studentId] || []).includes('cover'));
    if (includeCover) {
      await pdfAddCoverPage(pdf, data.student, data.points);
      pdf.addPage();
      // 겉표지 뒷면이 비도록 빈 페이지를 하나 더 끼워 넣음 — 양면 인쇄해도 겉표지는 단면으로 나오고,
      // 본문은 그다음 용지 앞면부터 시작하게 됨
      pdf.addPage();
    }

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
      const measureOverflowMM = () => {
        let sumMM = 0;
        for (let i = 0; i <= noteIdx; i++) {
          if (i > 0) sumMM += ctx.gap;
          sumMM += blocks[i].getBoundingClientRect().height * mmPerPx;
        }
        return sumMM - ctx.pageContentH + 1; // 1mm 여유
      };
      let overflow = measureOverflowMM();
      if (overflow > 0) {
        const originalPlotH = 194, minPlotH = 30;
        restoreChart = chartWrap.innerHTML;
        // 그래프 카드는 그림 영역(plotH) 말고도 제목·여백·축 글자 높이가 고정이라 한 번에 비율로 계산하면 덜 줄어듦 —
        // 실제로 줄여보고 다시 재서, 한 페이지에 들어올 때까지 몇 번 더 줄임 (SVG 높이는 plotH+68에 비례)
        let plotH = originalPlotH;
        for (let i = 0; i < 8 && overflow > 0 && plotH > minPlotH; i++) {
          const svg = chartWrap.querySelector('svg');
          const pxPerPlotUnit = svg ? svg.getBoundingClientRect().height / (plotH + 68) : 1;
          plotH = Math.max(minPlotH, Math.floor(plotH - (overflow / mmPerPx) / pxPerPlotUnit));
          chartWrap.innerHTML = buildMainChartSVG(data.points, plotH);
          overflow = measureOverflowMM();
        }
        // 그래프를 최소로 줄여도 의견이 첫 페이지에 안 들어가서 어차피 다음 페이지로 넘어가는 경우엔,
        // 그래프를 괜히 납작하게 만들지 않고 원래 크기 그대로 둠
        if (overflow > 0) {
          chartWrap.innerHTML = restoreChart;
          restoreChart = null;
        }
      }
    }

    try {
      for (let i = 0; i < blocks.length; i++) {
        await pdfPlaceElement(pdf, blocks[i], ctx);
        // 선생님 의견 바로 다음 블록(대표 강점·취약 유형)은 여백이 남더라도 항상 새 페이지에서 시작하게 함 —
        // "예상등급~전체 정답률 추이~선생님 의견"까지가 한 페이지, 그다음부터 새 페이지로 딱 나뉘도록
        if (i === noteIdx && i < blocks.length - 1) {
          pdfFlushPage(pdf, ctx, false);
          pdf.addPage();
          ctx.y = ctx.marginY;
          ctx.pageHasContent = false;
        }
      }
      pdfFlushPage(pdf, ctx, false);
    } finally {
      if (restoreChart !== null) chartWrap.innerHTML = restoreChart;
    }

    // 3번째 페이지(겉표지·공백페이지 다음, 본문 시작)부터 페이지 하단 가운데에 쪽번호를 매김 —
    // 겉표지·공백페이지는 숫자를 안 매기므로 본문 기준 1페이지부터 시작함
    const totalPages = pdf.getNumberOfPages();
    const bodyStart = includeCover ? 3 : 1;
    for (let p = bodyStart; p <= totalPages; p++) {
      pdf.setPage(p);
      pdf.setFontSize(9);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`- ${p - bodyStart + 1} -`, 105, 291, { align: 'center' });
    }

    // 파일명 맨 앞에 "발행월"을 붙임 — 리포트에 포함된 마지막 회차가 속한 달 기준
    // (예: 8월4주차~9월4주차 리포트는 9월, 9월3주차~10월3주차 리포트는 10월)
    const lastPoint = data.points[data.points.length - 1];
    const lastRound = lastPoint ? state.rounds.find(r => r.id === lastPoint.roundId) : null;
    const reportMonth = lastRound ? new Date(lastRound.date + 'T00:00:00').getMonth() + 1 : '';
    pdf.save(isEntranceStudent(data.student)
      ? `캐슬수학입학테스트_${displayName(data.student.name)}.pdf`
      : `${reportMonth ? reportMonth + '월' : ''}캐치유분석보고서_${displayName(data.student.name)}.pdf`);
    status.style.color = 'var(--good)';
    status.textContent = 'PDF를 저장했어요.';
    logReportPdf(data, fromRoundId, toRoundId);
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

/* ================= 백업 (캐치유테스트 + 교재 채점이 한 파일) ================= */

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function textbookWrongCount() {
  return (state.textbook && state.textbook.results ? state.textbook.results : []).reduce((a, r) => a + (r.wrong ? r.wrong.length : 0), 0);
}
// "내보내기" 버튼 — 캐치유테스트 화면과 교재 화면 어디서 눌러도 같은 파일(모든 데이터)이 나옴
function exportBackupManual() {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  downloadTextFile(JSON.stringify(state, null, 2), `${stamp}학생누적채점데이터.json`);
  toast(`백업 파일을 내보냈어요 (학생 ${state.students.length}명 · 교재 틀린 문제 ${textbookWrongCount()}개 포함).`);
}
function importBackupFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.students || !data.rounds || !data.results) throw new Error('형식 오류');
      if (!data.teacherNotes) data.teacherNotes = {};
      if (!data.retests) data.retests = [];
      if (!data.gradeOverrides) data.gradeOverrides = {};
      if (!data.difficultyOverrides) data.difficultyOverrides = {};
      if (!data.reportHidden) data.reportHidden = {};
      if (!data.textbook) data.textbook = { books: [], results: [] };
      if (!Array.isArray(data.textbook.results)) data.textbook.results = [];
      if (!data.studentDone) data.studentDone = {};
      if (!data.studentMemo) data.studentMemo = {};
      if (!data.studentMemoRetest) data.studentMemoRetest = {};
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
}

// 자동 백업: 대문에 들어올 때마다 백업 파일을 자동으로 내려받음. 파일 이름은 캐슬백업_0001.json처럼 번호만 올라가고 덮어쓰지 않음
// (번호는 이 컴퓨터 브라우저에 저장된 마지막 번호에서 이어짐)
const AUTO_BACKUP_KEY = 'catchu_auto_backup';
const AUTO_BACKUP_SEQ_KEY = 'catchu_backup_seq';
const AUTO_BACKUP_DATE_KEY = 'catchu_backup_date';
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function autoBackupEnabled() { try { return localStorage.getItem(AUTO_BACKUP_KEY) !== 'off'; } catch (e) { return true; } }
function setAutoBackupEnabled(on) { try { localStorage.setItem(AUTO_BACKUP_KEY, on ? 'on' : 'off'); } catch (e) {} }
function runAutoBackup() {
  if (!autoBackupEnabled()) return false;
  // 아직 아무 데이터도 없을 때는 빈 파일을 쌓지 않음
  if (!state.students.length && !state.results.length && !textbookWrongCount()) return false;
  // 오늘 이미 자동 백업을 했으면 건너뜀 (하루에 한 번만)
  try { if (localStorage.getItem(AUTO_BACKUP_DATE_KEY) === todayKey()) return false; } catch (e) {}
  let seq = 0;
  try { seq = parseInt(localStorage.getItem(AUTO_BACKUP_SEQ_KEY) || '0', 10) || 0; } catch (e) {}
  seq += 1;
  try { localStorage.setItem(AUTO_BACKUP_SEQ_KEY, String(seq)); localStorage.setItem(AUTO_BACKUP_DATE_KEY, todayKey()); } catch (e) {}
  const name = `캐슬백업_${String(seq).padStart(4, '0')}.json`;
  const text = JSON.stringify(state, null, 2);
  downloadTextFile(text, name);
  toast(`자동 백업 파일을 내려받았어요: ${name} (${(text.length / 1024 / 1024).toFixed(1)}MB)`);
  return name;
}

/* ================= 데이터 관리 ================= */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('exportBtn').addEventListener('click', exportBackupManual);

  document.getElementById('exportRosterBtn').addEventListener('click', () => {
    // 채점 기록 없이 이름·학교·학년·반·담당 선생님만 담음 — "학생 명단 가져오기"에 그대로 쓸 수 있는 형식.
    // 상단에 담당 선생님이 선택되어 있어도 그 필터와 무관하게 항상 전체 학생을 내보냄
    const roster = state.students.map(s => ({
      name: s.name, grade: s.grade || '', school: s.school || '', class: s.class || '', teacher: s.teacher || '',
    }));
    const blob = new Blob([JSON.stringify(roster, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    a.href = url; a.download = `${stamp}학생명단_전체.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast(`학생 명단 ${roster.length}명을 내보냈어요.`);
  });

  document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importBackupFromFile(file);
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
    state = { students: [], rounds: [], results: [], teacherNotes: {}, retests: [], gradeOverrides: {}, difficultyOverrides: {}, reportHidden: {}, textbook: { books: [], results: [] }, studentDone: {}, studentMemo: {}, studentMemoRetest: {} };
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
    difficultyOverrides: {},
    reportHidden: {},
    textbook: { books: [], results: [] },
    sharedRoundIds: [],
    studentDone: {},
    studentMemo: {},
    studentMemoRetest: {},
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
  if (typeof renderTextbook === 'function') renderTextbook();
}

function populateCurrentTeacherSel() {
  const sel = document.getElementById('currentTeacherSel');
  sel.innerHTML = teacherSelectHtml();
  sel.value = getCurrentTeacher();
}

/* ================= 대문 / 화면 전환 ================= */

// 화면은 세 가지 — landing(대문), catchu(캐치유테스트 분석: 기존 앱 그대로), textbook(교재 채점 및 분석: 준비 중).
// 새로 들어오면 항상 대문부터 시작하고, 같은 탭에서 새로고침하면 보던 화면을 유지함.
// 나중에 교재 기능이 생기면 state.textbook(books/results)에 교재 오답을 저장하고, 보고서 계산(computeStudentReport)에서
// 캐치유 오답과 합쳐서 보여주면 됨 — 담당 선생님 선택(getCurrentTeacher)은 두 화면이 같이 씀.
const VIEW_KEY = 'catchu_view';
function currentView() {
  try { const v = sessionStorage.getItem(VIEW_KEY); if (v === 'catchu' || v === 'textbook' || v === 'entrance') return v; } catch (e) {}
  return 'landing';
}
function showView(name) {
  document.body.classList.remove('view-landing', 'view-catchu', 'view-textbook', 'view-students', 'view-entrance');
  document.body.classList.add('view-' + name);
  // 학생 관리 전용 화면은 새로고침하면 열려 있던 곳이 아니라 대문으로 돌아가므로 저장하지 않음
  try { if (name === 'landing') sessionStorage.removeItem(VIEW_KEY); else if (name !== 'students') sessionStorage.setItem(VIEW_KEY, name); } catch (e) {}
  window.scrollTo(0, 0);
  if (name === 'textbook' && typeof renderTextbook === 'function') renderTextbook();
  if (name === 'students') renderStudents();
  // 화면마다 보여줄 학생·시험지 범위가 다르므로(입학테스트 / 그 외) 바뀔 때마다 다시 그림
  if (window.__appReady) renderAll();
}
// 학생 관리 화면에서 "돌아가기"를 누르면 열기 전에 있던 화면으로 감
let studentsReturnTo = 'landing';
function openStudentsView() {
  const cl = document.body.classList;
  studentsReturnTo = cl.contains('view-textbook') ? 'textbook' : cl.contains('view-entrance') ? 'entrance' : cl.contains('view-catchu') ? 'catchu' : 'landing';
  showView('students');
}
// 대문과 앱 상단의 담당 선생님 드롭다운을 같은 값으로 맞춤
function syncTeacherSelects() {
  const t = getCurrentTeacher();
  ['landingTeacherSel', 'currentTeacherSel', 'textbookTeacherSel', 'studentsTeacherSel'].forEach(id => { const el = document.getElementById(id); if (el) el.value = t; });
}
function onTeacherChanged(value) {
  setCurrentTeacher(value);
  syncTeacherSelects();
  renderAll();
}

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  populateCurrentTeacherSel();
  const landingSel = document.getElementById('landingTeacherSel');
  landingSel.innerHTML = teacherSelectHtml();
  landingSel.value = getCurrentTeacher();
  landingSel.addEventListener('change', e => onTeacherChanged(e.target.value));
  ['landingLogo', 'textbookLogo'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = logoBlock(); });
  document.getElementById('goCatchuBtn').addEventListener('click', () => showView('catchu'));
  document.getElementById('goEntranceBtn').addEventListener('click', () => showView('entrance'));
  document.getElementById('goTextbookBtn').addEventListener('click', () => showView('textbook'));
  document.querySelectorAll('[data-go-home]').forEach(b => {
    b.addEventListener('click', () => showView('landing'));
    b.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && b.getAttribute('role') === 'button') { e.preventDefault(); showView('landing'); } });
  });
  // 왼쪽 상단 캐슬 배너(로고)를 누르면 대문으로 돌아감
  const topLogo = document.getElementById('topbarLogo');
  topLogo.setAttribute('role', 'button');
  topLogo.setAttribute('tabindex', '0');
  topLogo.title = '첫 화면으로';
  topLogo.addEventListener('click', () => showView('landing'));
  topLogo.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showView('landing'); } });
  showView(currentView());
  document.getElementById('currentTeacherSel').addEventListener('change', e => onTeacherChanged(e.target.value));
  const tbTeacherSel = document.getElementById('textbookTeacherSel');
  tbTeacherSel.innerHTML = teacherSelectHtml();
  tbTeacherSel.value = getCurrentTeacher();
  tbTeacherSel.addEventListener('change', e => onTeacherChanged(e.target.value));
  const stTeacherSel = document.getElementById('studentsTeacherSel');
  stTeacherSel.innerHTML = teacherSelectHtml();
  stTeacherSel.value = getCurrentTeacher();
  stTeacherSel.addEventListener('change', e => onTeacherChanged(e.target.value));
  document.getElementById('goStudentsBtn').addEventListener('click', openStudentsView);
  document.getElementById('tbGoStudentsBtn').addEventListener('click', openStudentsView);
  document.getElementById('studentsLogo').innerHTML = logoBlock();
  document.getElementById('studentsBackBtn').addEventListener('click', () => { showView(studentsReturnTo); renderAll(); });
  document.getElementById('studentSearchInput').addEventListener('input', renderStudents);
  document.getElementById('studentShowHidden').addEventListener('change', () => { renderStudents(); });
  const autoToggle = document.getElementById('autoBackupToggle');
  autoToggle.checked = autoBackupEnabled();
  autoToggle.addEventListener('change', () => setAutoBackupEnabled(autoToggle.checked));
  document.getElementById('tbExportBtn').addEventListener('click', exportBackupManual);
  document.getElementById('catchuGoStudentsBtn').addEventListener('click', openStudentsView);
  document.getElementById('catchuExportBtn').addEventListener('click', exportBackupManual);
  document.getElementById('catchuImportFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackupFromFile(f); });
  document.getElementById('tbImportFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackupFromFile(f); });
  await syncSharedRounds();
  renderAll();
  window.__appReady = true;
  // 대문으로 접속했을 때(새로 열거나 대문에서 새로고침) 자동 백업
  if (document.body.classList.contains('view-landing')) runAutoBackup();
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
        const keepExamPath = state.rounds[idx].examPath, keepExamName = state.rounds[idx].examName;
        state.rounds[idx] = { ...sr, examFile: keepExamFile, studentId: keepStudentId };
        if (keepExamPath) { state.rounds[idx].examPath = keepExamPath; state.rounds[idx].examName = keepExamName; }
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
  // studentId는 이 컴퓨터에서만 의미 있는 값이라 공용 파일에는 빼고, 받는 쪽에서 각자 학생을 고르게 함
  const payload = state.rounds.map(sharedRoundPayload).filter(Boolean);
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
