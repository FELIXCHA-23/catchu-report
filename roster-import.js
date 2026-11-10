/* ================= 구글 시트 / 엑셀 / csv 로 학생 명단 올리기 =================
 * - 구글 스프레드시트는 "파일 → 다운로드 → 엑셀(.xlsx)" 또는 csv 로 받아서 올리거나, 시트의 칸을 복사해서 붙여넣으면 됨
 * - 첫 줄에 이름/학교/학년/반/담당/상태(또는 비고) 같은 제목이 있으면 그 칸을 찾아서 읽고, 제목이 없으면 이름·학교·학년·반·담당 순서로 읽음
 * - 새 학생은 추가하고, 이미 있는 학생(이름+반이 같거나, 이름이 하나뿐일 때)은 정보를 갱신함. "퇴원" 표시가 있으면 숨김 처리함
 * - 올리기 전에 미리보기로 무엇이 바뀌는지 먼저 보여줌 (파일 읽기 도구는 textbook.js 의 것을 같이 씀)
 */
const rsState = { pending: null };

function rsNorm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function rsLevelOfSchool(name) {
  const t = rsNorm(name);
  if (/초(등학교)?$/.test(t)) return '초';
  if (/중(학교)?$/.test(t)) return '중';
  if (/고(등학교)?$/.test(t)) return '고';
  return '';
}
// "중2", "중학교 2학년", "2학년(학교가 한빛중)" 같은 표기를 "중2" 로 통일
function rsGrade(raw, school) {
  const t = rsNorm(raw);
  if (!t) return '';
  let m = /^(초|중|고)\D{0,4}([1-6])/.exec(t);
  if (m) return m[1] + m[2];
  m = /([1-6])\s*학년/.exec(t) || /^([1-6])$/.exec(t);
  const lv = rsLevelOfSchool(school);
  if (m && lv) return lv + m[1];
  return t; // 알아볼 수 없으면 적힌 그대로 둠 (미리보기에서 확인)
}

const RS_HEADERS = [
  ['name', /이름|성명|학생/],
  ['school', /학교/],
  ['grade', /학년/],
  ['class', /^반$|반명|^반\s|클래스|class/i],
  ['teacher', /담당|담임|선생/],
  ['status', /상태|비고|구분|재원|퇴원/],
];
function rsDetectColumns(rows) {
  const first = (rows.find(r => (r || []).some(c => rsNorm(c))) || []).map(rsNorm);
  const map = {};
  first.forEach((cell, i) => { for (const [k, re] of RS_HEADERS) if (!(k in map) && re.test(cell)) { map[k] = i; break; } });
  const hasHeader = 'name' in map && Object.keys(map).length >= 2;
  if (hasHeader) return { map, headerRow: rows.indexOf(rows.find(r => (r || []).some(c => rsNorm(c)))) };
  return { map: { name: 0, school: 1, grade: 2, class: 3, teacher: 4, status: 5 }, headerRow: -1 };
}

function rsParseRows(rows) {
  const { map, headerRow } = rsDetectColumns(rows);
  const out = [];
  rows.forEach((row, idx) => {
    if (idx <= headerRow) return;
    const cells = (row || []).map(rsNorm);
    const name = cells[map.name] || '';
    if (!name || /^(이름|성명|합계|총계)$/.test(name)) return;
    if (!/[가-힣A-Za-z]/.test(name) || name.length > 12) return;
    const school = 'school' in map ? (cells[map.school] || '') : '';
    const statusText = 'status' in map ? (cells[map.status] || '') : '';
    out.push({
      name,
      school,
      grade: rsGrade('grade' in map ? cells[map.grade] : '', school),
      class: 'class' in map ? (cells[map.class] || '') : '',
      teacher: 'teacher' in map ? (cells[map.teacher] || '') : '',
      status: /퇴원|퇴실|퇴교|휴원\s*종료/.test(statusText) ? 'out' : (/재원|등원/.test(statusText) ? 'in' : ''),
    });
  });
  return out;
}

// 이미 있는 학생 찾기: 이름+반이 같으면 같은 학생, 반이 달라도 같은 이름이 한 명뿐이면 그 학생(반이 바뀐 경우)
function rsFindExisting(e) {
  const byNameClass = state.students.find(s => s.name === e.name && (s.class || '') === (e.class || ''));
  if (byNameClass) return byNameClass;
  const byName = state.students.filter(s => s.name === e.name);
  return byName.length === 1 ? byName[0] : null;
}
function rsPlan(entries) {
  return entries.map(e => {
    const teacher = e.teacher || (e.class && typeof CLASS_TEACHER_MAP !== 'undefined' ? CLASS_TEACHER_MAP[e.class] : '') || '';
    const want = { name: e.name, school: e.school, grade: e.grade, class: e.class, teacher };
    const ex = rsFindExisting(e);
    if (!ex) return { kind: 'new', want, status: e.status, changes: [] };
    const changes = [];
    [['school', '학교'], ['grade', '학년'], ['class', '반'], ['teacher', '담당']].forEach(([k, label]) => {
      if (want[k] && (ex[k] || '') !== want[k]) changes.push(`${label}: ${ex[k] || '-'} → ${want[k]}`);
    });
    if (e.status === 'out' && !ex.hidden) changes.push('숨김(퇴원) 처리');
    if (e.status === 'in' && ex.hidden) changes.push('다시 보이게 하기');
    return { kind: changes.length ? 'update' : 'same', existing: ex, want, status: e.status, changes };
  });
}

function rsRenderPreview() {
  const box = document.getElementById('rsPreview');
  const p = rsState.pending;
  if (!p) { box.innerHTML = ''; return; }
  const plan = p.plan;
  const cnt = k => plan.filter(x => x.kind === k).length;
  const label = { new: '새 학생', update: '정보 갱신', same: '변경 없음' };
  const rows = plan.map(x => `<tr${x.kind === 'same' ? ' style="opacity:0.5;"' : ''}>
      <td>${label[x.kind]}</td><td>${escapeHtml(x.want.name)}${x.status === 'out' ? ' <span class="badge watch" style="font-size:11px;">퇴원</span>' : ''}</td>
      <td>${escapeHtml(x.want.school || '-')}</td><td>${escapeHtml(x.want.grade || '-')}</td><td>${escapeHtml(x.want.class || '-')}</td><td>${escapeHtml(x.want.teacher || '-')}</td>
      <td style="font-size:12px;">${x.kind === 'update' ? escapeHtml(x.changes.join(' · ')) : (x.kind === 'new' && x.status === 'out' ? '퇴원생이라 숨김으로 추가' : '')}</td></tr>`).join('');
  box.innerHTML = `
    <p class="field-hint" style="margin-top:10px;">${escapeHtml(p.source)} · 새 학생 ${cnt('new')}명 · 정보 갱신 ${cnt('update')}명 · 변경 없음 ${cnt('same')}명</p>
    <div class="table-wrap" style="max-height:420px; overflow:auto;">
      <table class="report-table"><thead><tr><th>구분</th><th>이름</th><th>학교</th><th>학년</th><th>반</th><th>담당</th><th>바뀌는 내용</th></tr></thead><tbody>${rows || '<tr><td colspan="7">읽어낸 학생이 없어요. 제목 줄(이름·학교·학년·반·담당)이 맞는지 확인해주세요.</td></tr>'}</tbody></table>
    </div>
    ${plan.length ? `<div class="inline-form" style="margin-top:10px;">
      <button type="button" class="btn primary" id="rsApplyBtn">이대로 반영하기</button>
      <label class="field-hint" style="display:inline-flex; align-items:center; gap:4px;"><input type="checkbox" id="rsUpdateExisting" checked> 기존 학생 정보도 갱신</label>
      <button type="button" class="btn ghost" id="rsCancelBtn">취소</button>
      <span class="field-hint">시트에 없는 기존 학생은 유지됨.</span>
    </div>` : ''}`;
  const apply = document.getElementById('rsApplyBtn');
  if (apply) {
    apply.addEventListener('click', rsApply);
    document.getElementById('rsCancelBtn').addEventListener('click', () => { rsState.pending = null; rsRenderPreview(); });
  }
}

function rsApply() {
  const p = rsState.pending;
  if (!p) return;
  const updateExisting = document.getElementById('rsUpdateExisting').checked;
  let added = 0, updated = 0, hid = 0;
  rsPlan(p.entries).forEach(x => {
    if (x.kind === 'new') {
      const s = { id: uid(), name: x.want.name, grade: x.want.grade || '', class: x.want.class || '', teacher: x.want.teacher || '', school: x.want.school || '' };
      if (x.status === 'out') { s.hidden = true; hid++; }
      state.students.push(s); added++;
    } else if (x.kind === 'update' && updateExisting) {
      const ex = x.existing;
      ['school', 'grade', 'class', 'teacher'].forEach(k => { if (x.want[k]) ex[k] = x.want[k]; });
      if (x.status === 'out' && !ex.hidden) { ex.hidden = true; hid++; }
      if (x.status === 'in' && ex.hidden) delete ex.hidden;
      updated++;
    }
  });
  saveState();
  rsState.pending = null;
  document.getElementById('rsPaste').value = '';
  renderAll();
  rsRenderPreview();
  toast(`학생 명단을 반영했어요 (새 ${added}명 · 갱신 ${updated}명${hid ? ' · 숨김 ' + hid + '명' : ''}).`);
}

async function rsHandleFile(file) {
  try {
    const rows = await tbFileToRows(file);
    const entries = rsParseRows(rows);
    rsState.pending = { source: file.name, entries, plan: rsPlan(entries) };
    rsRenderPreview();
  } catch (e) { console.error(e); toast('파일을 읽지 못했어요: ' + e.message); }
}
function rsHandlePaste() {
  const text = document.getElementById('rsPaste').value;
  if (!text.trim()) { toast('붙여넣은 내용이 없어요.'); return; }
  const entries = rsParseRows(tbTextToRows(text, false));
  rsState.pending = { source: '붙여넣은 내용', entries, plan: rsPlan(entries) };
  rsRenderPreview();
}

document.addEventListener('DOMContentLoaded', () => {
  const drop = document.getElementById('rsDrop'), fileInput = document.getElementById('rsFile');
  if (!drop) return;
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { const f = fileInput.files[0]; fileInput.value = ''; if (f) rsHandleFile(f); });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag-over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) rsHandleFile(f); });
  document.getElementById('rsParseBtn').addEventListener('click', rsHandlePaste);
});


/* ================= 구글 시트 자동 동기화 =================
 * 학원 전체 인원 시트의 "이번 달 탭"(예: 2611월)을 읽어서 학생 명단(학교·학년·반·담당·퇴원)을 맞춤.
 * - 시트는 "링크가 있는 모든 사용자 보기"로 공유돼 있어야 하고, 주소는 이 컴퓨터(브라우저)에만 저장함 (공개 저장소 코드에는 넣지 않음)
 * - 원장(관리자) 계정으로 KMMS를 열면 자동으로 맞춤. 변경이 많으면 자동으로 반영하지 않고 "지금 동기화"에서 확인 후 반영
 * - 수업을 2개 듣는 학생(시트에 같은 이름이 둘 이상)은 건드리지 않고, "등원 예정" 칸은 읽지 않음. 시험 학년(examGrade)은 바꾸지 않음
 */
const RS_TEACHER_EN = { FELIX: '차성빈', LUCAS: '문태민', DAVE: '목윤재', CELINA: '방희진', LIA: '오민경' };
const RS_SHEET_URL_KEY = 'kmms_sheet_url', RS_SHEET_AUTO_KEY = 'kmms_sheet_auto', RS_SHEET_LAST_KEY = 'kmms_sheet_last';
function rsSheetUrl() { try { return localStorage.getItem(RS_SHEET_URL_KEY) || ''; } catch (e) { return ''; } }
function rsSheetId(url) { const m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(String(url || '')); return m ? m[1] : ''; }
function rsMonthTab(d) { d = d || new Date(); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + '월'; }

function rsCsvRows(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// 시트의 반 칸(3칸씩: 이름 | 학교+학년 | 날짜)을 읽어 { active: [...], gone: [...] } 로 돌려줌
function rsSheetParse(rows) {
  const cell = (r, c) => String((rows[r] || [])[c] == null ? '' : (rows[r] || [])[c]).trim();
  const isHead = r => { let n = 0; for (let c = 1; c <= 34; c += 3) if (/^(FELIX|LUCAS|DAVE|CELINA|LIA)\b/i.test(cell(r, c))) n++; return n >= 4; };
  const heads = []; rows.forEach((_, r) => { if (isHead(r)) heads.push(r); });
  if (heads.length < 2) throw new Error('시트 모양이 달라요 (선생님 줄을 못 찾았어요). 이번 달 탭인지 확인해 주세요.');
  const groups = h => { const g = []; for (let c = 1; c <= 34; c += 3) { const t = (cell(h, c).match(/[A-Za-z]+/) || [''])[0].toUpperCase(); if (RS_TEACHER_EN[t]) g.push({ c, cls: cell(h + 1, c), teacher: RS_TEACHER_EN[t] }); } return g; };
  const person = (r, c) => {
    const name = cell(r, c), sg = cell(r, c + 1);
    if (!name || !sg || name.length > 8 || !/[가-힣]/.test(name)) return null;
    if (sg === '예비고1') return { name, school: '', grade: '고1' };
    const m = /^(.*?)(초|중|고)(\d)$/.exec(sg);
    return m ? { name, school: m[1] + m[2], grade: m[2] + m[3] } : null;
  };
  const active = [], gone = [];
  let lastEnd = 0;
  heads.slice(0, 2).forEach(h => {
    const g = groups(h);
    let r = h + 2;
    for (; r < rows.length && !/^현행/.test(cell(r, 1)); r++) {
      g.forEach(x => { const p = person(r, x.c); if (p) active.push({ ...p, class: x.cls, teacher: x.teacher, status: 'in' }); });
    }
    lastEnd = r;
  });
  // 퇴원생: 두 번째 블록 아래쪽의 번호 없는 줄들 (같은 칸 배치)
  // (재원 총인원 숫자만 덩그러니 있는 줄 아래부터가 퇴원생 — "등원 예정·미정" 칸의 학생은 퇴원생이 아니므로 건너뜀. 못 찾으면 8줄 아래부터)
  let leaverStart = lastEnd + 8;
  for (let r = lastEnd + 1; r < rows.length; r++) {
    const filled = (rows[r] || []).filter(x => String(x).trim()).length;
    if (filled === 1 && /^\d{2,3}$/.test(cell(r, 1))) { leaverStart = r + 1; break; }
  }
  for (let r = leaverStart; r < rows.length; r++) {
    const c0 = cell(r, 0);
    if (/^\d+$/.test(c0) || /^등원/.test(c0)) continue;
    for (let c = 1; c <= 34; c += 3) { const p = person(r, c); if (p) gone.push({ ...p, class: '', teacher: '', status: 'out' }); }
  }
  return { active, gone };
}

async function rsSheetFetch() {
  const id = rsSheetId(rsSheetUrl());
  if (!id) throw new Error('시트 주소가 없어요.');
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(rsMonthTab())}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('시트를 읽지 못했어요 (' + res.status + '). 공유가 "링크가 있는 모든 사용자 보기"인지 확인해 주세요.');
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error('시트를 읽지 못했어요. 공유 설정(링크가 있는 모든 사용자 보기)을 확인해 주세요.');
  const parsed = rsSheetParse(rsCsvRows(text));
  if (parsed.active.length < 30) throw new Error(`이번 달(${rsMonthTab()}) 탭에서 재원생을 ${parsed.active.length}명밖에 못 읽었어요. 시트 모양이 바뀌었는지 확인해 주세요.`);
  return parsed;
}

// 어떤 변경이 생기는지 계산 (반영은 rsSheetApply)
function rsSheetPlan(parsed) {
  const regular = state.students.filter(s => !(typeof isEntranceStudent === 'function' && isEntranceStudent(s)));
  const count = new Map(); parsed.active.forEach(e => count.set(e.name, (count.get(e.name) || 0) + 1));
  const activeNames = new Set(parsed.active.map(e => e.name));
  const plan = { add: [], update: [], hide: [], skipped: [] };
  const findOne = (e) => {
    const same = regular.filter(s => s.name === e.name);
    if (!same.length) return null;
    const byClass = same.find(s => (s.class || '') === (e.class || '') && e.class);
    if (byClass) return byClass;
    return same.length === 1 ? same[0] : undefined;   // undefined: 같은 이름이 여러 명이라 어느 학생인지 몰라 건드리지 않음
  };
  parsed.active.forEach(e => {
    if (count.get(e.name) > 1) { if (!plan.skipped.includes(e.name)) plan.skipped.push(e.name); return; }
    const teacher = e.teacher || (typeof CLASS_TEACHER_MAP !== 'undefined' ? CLASS_TEACHER_MAP[e.class] : '') || '';
    const want = { name: e.name, school: e.school, grade: e.grade, class: e.class, teacher };
    const ex = findOne(e);
    if (ex === undefined) { plan.skipped.push(e.name); return; }
    if (!ex) { plan.add.push(want); return; }
    const changes = [];
    [['school', '학교'], ['grade', '학년'], ['class', '반'], ['teacher', '담당']].forEach(([k, label]) => {
      if (want[k] && (ex[k] || '') !== want[k]) changes.push({ k, label, from: ex[k] || '-', to: want[k] });
    });
    if (ex.hidden) changes.push({ k: 'hidden', label: '숨김', from: '숨김', to: '다시 보이게' });
    if (changes.length) plan.update.push({ ex, changes, want });
  });
  parsed.gone.forEach(e => {
    if (activeNames.has(e.name)) return;
    const same = regular.filter(s => s.name === e.name && !s.hidden);
    if (same.length === 1) plan.hide.push(same[0]);
  });
  return plan;
}
function rsSheetApply(plan) {
  plan.add.forEach(w => state.students.push({ id: uid(), name: w.name, grade: w.grade || '', class: w.class || '', teacher: w.teacher || '', school: w.school || '' }));
  plan.update.forEach(u => u.changes.forEach(c => { if (c.k === 'hidden') delete u.ex.hidden; else u.ex[c.k] = c.to; }));
  plan.hide.forEach(s => { s.hidden = true; });
  if (plan.add.length || plan.update.length || plan.hide.length) { saveState(); try { renderAll(); } catch (e) {} }
}
function rsSheetSummary(plan) {
  return `새 학생 ${plan.add.length}명 · 정보 갱신 ${plan.update.length}명 · 퇴원(숨김) ${plan.hide.length}명` + (plan.skipped.length ? ` · 건드리지 않음 ${plan.skipped.length}명(수업 2개 등)` : '');
}
function rsSheetStatus(msg, bad) { const el = document.getElementById('rsSheetStatus'); if (el) { el.textContent = msg; el.style.color = bad ? 'var(--critical)' : ''; } }
function rsSheetDetail(plan) {
  const lines = [];
  plan.add.forEach(w => lines.push(`+ ${w.name} (${w.grade} ${w.class} ${w.teacher})`));
  plan.update.forEach(u => lines.push(`~ ${u.ex.name}: ${u.changes.map(c => `${c.label} ${c.from} → ${c.to}`).join(', ')}`));
  plan.hide.forEach(s => lines.push(`- ${s.name} 퇴원(숨김)`));
  return lines;
}

let rsSheetBusy = false;
async function rsSheetRun(opt) {
  opt = opt || {};
  if (rsSheetBusy) return;
  rsSheetBusy = true;
  try {
    if (window.KMMS && window.KMMS.demo) throw new Error('체험(guest) 모드에서는 동기화하지 않아요.');
    rsSheetStatus('시트를 읽는 중…');
    const parsed = await rsSheetFetch();
    const plan = rsSheetPlan(parsed);
    const total = plan.add.length + plan.update.length + plan.hide.length;
    const stamp = () => { try { localStorage.setItem(RS_SHEET_LAST_KEY, new Date().toLocaleString('ko-KR')); } catch (e) {} };
    const lastTxt = () => { try { return localStorage.getItem(RS_SHEET_LAST_KEY) || ''; } catch (e) { return ''; } };
    if (!total) { stamp(); rsSheetStatus(`시트(${rsMonthTab()})와 이미 같아요 · 재원 ${parsed.active.length}명 · 마지막 확인 ${lastTxt()}`); if (!opt.auto) toast('시트와 이미 같아요.'); return; }
    if (opt.auto) {
      // 자동 반영은 변경이 작을 때만 — 많으면 직접 확인하게 함
      if (plan.add.length > 10 || plan.hide.length > 15 || plan.update.length > 40) {
        rsSheetStatus(`시트와 차이가 많아요(${rsSheetSummary(plan)}). 아래 "지금 동기화"에서 확인하고 반영해 주세요.`, true);
        toast('시트와 명단 차이가 많아요. 데이터 관리 → 학생 명단에서 확인하고 동기화해 주세요.');
        return;
      }
      rsSheetApply(plan); stamp();
      rsSheetStatus(`자동 동기화 완료 (${rsMonthTab()}): ${rsSheetSummary(plan)} · ${lastTxt()}`);
      toast('시트와 학생 명단을 맞췄어요: ' + rsSheetSummary(plan));
      return;
    }
    const lines = rsSheetDetail(plan);
    const ok = confirm(`시트(${rsMonthTab()})와 비교한 결과예요.\n${rsSheetSummary(plan)}\n\n` + lines.slice(0, 25).join('\n') + (lines.length > 25 ? `\n… 외 ${lines.length - 25}건` : '') + '\n\n이대로 반영할까요?');
    if (!ok) { rsSheetStatus('반영하지 않았어요.'); return; }
    rsSheetApply(plan); stamp();
    rsSheetStatus(`동기화 완료 (${rsMonthTab()}): ${rsSheetSummary(plan)} · ${lastTxt()}`);
    toast('시트와 학생 명단을 맞췄어요.');
  } catch (e) {
    console.warn(e);
    rsSheetStatus('동기화 실패: ' + e.message, true);
    if (!opt.auto) toast('동기화 실패: ' + e.message);
  } finally { rsSheetBusy = false; }
}

document.addEventListener('DOMContentLoaded', () => {
  const url = document.getElementById('rsSheetUrl');
  if (!url) return;
  url.value = rsSheetUrl();
  const auto = document.getElementById('rsSheetAuto');
  auto.checked = (() => { try { return localStorage.getItem(RS_SHEET_AUTO_KEY) !== '0'; } catch (e) { return true; } })();
  auto.addEventListener('change', () => { try { localStorage.setItem(RS_SHEET_AUTO_KEY, auto.checked ? '1' : '0'); } catch (e) {} });
  const save = () => {
    const v = url.value.trim();
    if (v && !rsSheetId(v)) { toast('구글 시트 주소가 아닌 것 같아요. 주소창의 링크를 그대로 붙여넣어 주세요.'); return false; }
    try { localStorage.setItem(RS_SHEET_URL_KEY, v); } catch (e) {}
    return true;
  };
  document.getElementById('rsSheetSave').addEventListener('click', () => { if (save()) rsSheetRun({}); });
  document.getElementById('rsSheetNow').addEventListener('click', () => { if (save()) rsSheetRun({}); });
  rsSheetStatus((() => { try { const l = localStorage.getItem(RS_SHEET_LAST_KEY); return l ? `마지막 동기화 확인: ${l}` : ''; } catch (e) { return ''; } })());
  // 원장(관리자) 계정으로 열렸을 때: 서버 데이터가 다 준비되면 한 번 맞추고, 열어 두는 동안 3시간마다 다시 맞춤
  let tries = 0;
  const timer = setInterval(() => {
    if (++tries > 90) { clearInterval(timer); return; }
    const K = window.KMMS;
    if (!K || K.demo || !K.ready || !K.staff) return;
    clearInterval(timer);
    if (K.staff.role !== 'admin' || !rsSheetUrl() || !auto.checked) return;
    rsSheetRun({ auto: true });
    setInterval(() => { if (rsSheetUrl() && auto.checked) rsSheetRun({ auto: true }); }, 3 * 60 * 60 * 1000);
  }, 4000);
});
