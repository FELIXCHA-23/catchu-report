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
      <label class="field-hint" style="display:inline-flex; align-items:center; gap:4px;"><input type="checkbox" id="rsUpdateExisting" checked> 이미 있는 학생도 정보 갱신</label>
      <button type="button" class="btn ghost" id="rsCancelBtn">취소</button>
      <span class="field-hint">시트에 없는 기존 학생은 그대로 두고 지우지 않아요.</span>
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
