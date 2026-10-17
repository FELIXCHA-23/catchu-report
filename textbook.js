/* ================= 교재 채점 및 분석 =================
 * - 교재 정보(문제 번호 → 유형)는 books-shared.json 에서 읽어옴 (모든 선생님 공통, 교재가 늘어나면 이 파일에 추가)
 * - 학생별로 틀린 번호만 계속 쌓아둠: state.textbook.results = [{ id, studentId, bookId, wrong: [번호...] }]
 * - 정답률은 분석할 때 "몇 번 ~ 몇 번" 범위를 지정해서 계산 (범위 안의 문제는 모두 푼 것으로 봄)
 * - 파일(txt·csv·xlsx 등)이나 붙여넣은 표에서 틀린 번호를 한꺼번에 읽어올 수 있음
 * 나중에 보고서에서 캐치유 오답과 합칠 때는 유형의 unit("대단원 - 중단원 - 소단원")의 앞 두 단계로 묶으면 됨
 */

let TB_BOOKS = [];
const tbState = { bookId: '', studentId: '', pending: null };

async function loadTextbooks() {
  try {
    const res = await fetch('books-shared.json', { cache: 'no-store' });
    if (res.ok) { const d = await res.json(); TB_BOOKS = Array.isArray(d.books) ? d.books : []; }
  } catch (e) { /* 파일이 없거나 오프라인이면 교재 없이 동작 */ }
}

function tbBook() { return TB_BOOKS.find(b => b.id === tbState.bookId) || null; }
function tbStudents() {
  return filterByCurrentTeacher(state.students).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
}
// 문제 번호 → 유형 (교재마다 한 번만 계산해서 보관)
function tbTypeMap(book) {
  if (!book._map) {
    book._map = new Map();
    book.types.forEach(t => t.problems.forEach(p => book._map.set(p, t)));
    const nums = Array.from(book._map.keys());
    book._min = Math.min(...nums); book._max = Math.max(...nums);
  }
  return book._map;
}
function tbNum(n) { return String(n).padStart(4, '0'); }
function tbRecord(studentId, bookId, create) {
  if (!state.textbook) state.textbook = { books: [], results: [] };
  let rec = state.textbook.results.find(r => r.studentId === studentId && r.bookId === bookId);
  if (!rec && create) { rec = { id: uid(), studentId, bookId, wrong: [] }; state.textbook.results.push(rec); }
  return rec || null;
}

/* ---------- 번호 읽기: "12, 15, 20~25", "0014 0016", "30-33" 같은 글에서 번호 목록을 뽑음 ---------- */
function tbParseNumbers(text) {
  let s = String(text == null ? '' : text)
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\d+\.\d+/g, ' ')
    .replace(/\d+\s*(반|학년|학기|주차|명)/g, ' '); // "3반", "중1학년" 같은 숫자는 문제 번호가 아니므로 뺌
  const nums = [];
  s = s.replace(/(\d{1,4})\s*[~∼～\-–—]\s*(\d{1,4})/g, (m, a, b) => {
    a = +a; b = +b;
    if (a <= b && b - a <= 300) for (let i = a; i <= b; i++) nums.push(i);
    return ' ';
  });
  (s.match(/\d{1,4}/g) || []).forEach(x => nums.push(+x));
  return Array.from(new Set(nums.filter(n => n > 0))).sort((a, b) => a - b);
}

/* ---------- 파일 읽기 ---------- */
function tbCsvToRows(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function tbTextToRows(text, isCsv) {
  if (isCsv) return tbCsvToRows(text);
  return text.split(/\r?\n/).map(line => (line.includes('\t') ? line.split('\t') : [line]));
}
function tbDecode(buf) {
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) { try { text = new TextDecoder('euc-kr').decode(buf); } catch (e) {} }
  return text.replace(/^﻿/, '');
}
async function tbFileToRows(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const buf = await file.arrayBuffer();
  if (['xlsx', 'xls', 'xlsm', 'ods'].includes(ext)) {
    if (typeof XLSX === 'undefined') throw new Error('엑셀 읽기 기능을 불러오지 못했어요 (인터넷 연결을 확인해주세요).');
    const wb = XLSX.read(buf, { type: 'array' });
    const rows = [];
    wb.SheetNames.forEach(n => {
      XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }).forEach(r => rows.push(r));
      rows.push([]);
    });
    return rows;
  }
  return tbTextToRows(tbDecode(buf), ext === 'csv');
}

/* ---------- 표/글에서 "누가 어떤 번호를 틀렸는지" 읽어내기 ----------
 * 지원하는 모양: ①한 줄에 한 학생(이름 + 번호들, 칸이 나뉘어도 되고 "이름: 12, 15"처럼 한 칸이어도 됨)
 *               ②첫 줄에 학생 이름이 가로로 있고 그 아래로 번호가 세로로 있는 표
 */
function tbParseRows(rows, students, book) {
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, '');
  const sorted = students.slice().sort((a, b) => norm(b.name).length - norm(a.name).length);
  const map = tbTypeMap(book);
  const found = new Map();      // studentId → { student, nums:Set }
  const unmatched = new Map();  // 이름 → Set
  const ambiguous = new Set();
  const add = (student, nums) => {
    if (!nums.length) return;
    if (!found.has(student.id)) found.set(student.id, { student, nums: new Set() });
    nums.forEach(n => found.get(student.id).nums.add(n));
  };
  const hitCell = cell => {
    const t = norm(cell);
    if (!t) return null;
    for (const s of sorted) {
      const nm = norm(s.name);
      if (!nm || !t.startsWith(nm)) continue;
      // 번호 사이의 띄어쓰기가 유지되도록, 공백을 없앤 글이 아니라 원래 글에서 이름 뒷부분을 잘라냄
      const re = new RegExp('^\\s*' + Array.from(nm).map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'));
      const rest = String(cell).replace(re, '').trim();
      if (rest === '' || !/^[가-힣]/.test(rest)) {
        if (sorted.filter(x => norm(x.name) === nm).length > 1) ambiguous.add(s.name);
        return { student: s, rest };
      }
    }
    return null;
  };

  let colHeaders = null;
  rows.forEach(row => {
    const cells = (row || []).map(c => String(c == null ? '' : c).trim());
    if (cells.every(c => !c)) return;
    const hits = cells.map(hitCell);
    const pure = hits.filter(h => h && h.rest === '');
    const othersHaveNoDigits = cells.every((c, i) => (hits[i] && hits[i].rest === '') || !/\d/.test(c));
    if (pure.length >= 2 && othersHaveNoDigits) { colHeaders = hits.map(h => (h && h.rest === '' ? h.student : null)); return; }

    const first = hits.findIndex(h => h);
    if (first !== -1) {
      colHeaders = null;
      const nums = tbParseNumbers(hits[first].rest);
      cells.forEach((c, i) => { if (i !== first) tbParseNumbers(c).forEach(n => nums.push(n)); });
      add(hits[first].student, Array.from(new Set(nums)));
      return;
    }
    if (colHeaders) {
      cells.forEach((c, j) => { if (colHeaders[j]) add(colHeaders[j], tbParseNumbers(c)); });
      return;
    }
    // 등록되지 않은 이름으로 보이는 줄
    let nm = null, numsText = '';
    if (/^[가-힣]{2,4}$/.test(cells[0]) && cells.slice(1).some(c => /\d/.test(c))) { nm = cells[0]; numsText = cells.slice(1).join(' '); }
    else { const m = /^([가-힣]{2,4})\s*[:：\-]?\s*(.*\d.*)$/.exec(cells.join(' ')); if (m) { nm = m[1]; numsText = m[2]; } }
    if (nm) { if (!unmatched.has(nm)) unmatched.set(nm, new Set()); tbParseNumbers(numsText).forEach(n => unmatched.get(nm).add(n)); }
  });

  const entries = Array.from(found.values()).map(({ student, nums }) => {
    const all = Array.from(nums).sort((a, b) => a - b);
    return { student, valid: all.filter(n => map.has(n)), invalid: all.filter(n => !map.has(n)) };
  });
  return { entries, unmatched, ambiguous: Array.from(ambiguous) };
}

/* ---------- 화면 ---------- */
function tbRenderPreview() {
  const box = document.getElementById('tbPreview');
  const p = tbState.pending;
  if (!p) { box.innerHTML = ''; return; }
  const book = tbBook();
  const rowsHtml = p.result.entries.map(e => {
    const rec = tbRecord(e.student.id, book.id, false);
    const had = new Set(rec ? rec.wrong : []);
    const fresh = e.valid.filter(n => !had.has(n));
    return `<tr>
      <td>${escapeHtml(e.student.name)}</td>
      <td class="tnum">${e.valid.length}개</td>
      <td class="tnum">${fresh.length}개</td>
      <td style="font-size:12px;">${e.valid.map(tbNum).join(', ') || '—'}</td>
      <td style="font-size:12px; color:var(--critical);">${e.invalid.length ? '책에 없는 번호: ' + e.invalid.join(', ') : ''}</td>
    </tr>`;
  }).join('');
  const un = Array.from(p.result.unmatched.entries());
  box.innerHTML = `
    <div class="table-wrap" style="margin-top:12px;">
      <table class="report-table">
        <thead><tr><th>학생</th><th>읽은 번호</th><th>새로 추가</th><th>번호</th><th></th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="5">읽어낸 학생이 없어요. 이름이 학생 관리에 등록된 이름과 같은지 확인해주세요.</td></tr>'}</tbody>
      </table>
    </div>
    ${un.length ? `<p class="field-hint" style="color:var(--critical); margin-top:8px;">등록된 학생을 찾지 못한 이름: ${un.map(([n, s]) => escapeHtml(n) + '(' + s.size + '개)').join(', ')} — 학생 관리에서 먼저 등록하거나 이름을 맞춰주세요. (현재 담당 선생님 학생만 읽어요)</p>` : ''}
    ${p.result.ambiguous.length ? `<p class="field-hint" style="color:var(--critical);">이름이 같은 학생이 여러 명이에요: ${p.result.ambiguous.map(escapeHtml).join(', ')} — 첫 번째 학생으로 읽었어요. 학생 선택 칸에서 직접 입력하는 게 안전해요.</p>` : ''}
    ${p.result.entries.length ? `<div class="inline-form" style="margin-top:10px;">
      <button type="button" class="btn primary" id="tbApplyAdd">기존 기록에 추가하기</button>
      <button type="button" class="btn ghost" id="tbApplyReplace">이 학생들의 기록을 이 내용으로 바꾸기</button>
      <button type="button" class="btn ghost" id="tbCancelPending">취소</button>
      <span class="field-hint">${escapeHtml(p.source)}에서 읽었어요</span>
    </div>` : ''}`;
  const addBtn = document.getElementById('tbApplyAdd');
  if (addBtn) {
    addBtn.addEventListener('click', () => tbApply(false));
    document.getElementById('tbApplyReplace').addEventListener('click', () => tbApply(true));
    document.getElementById('tbCancelPending').addEventListener('click', () => { tbState.pending = null; tbRenderPreview(); });
  }
}
function tbApply(replace) {
  const p = tbState.pending; const book = tbBook();
  if (!p || !book) return;
  let students = 0, added = 0;
  p.result.entries.forEach(e => {
    const rec = tbRecord(e.student.id, book.id, true);
    const before = new Set(rec.wrong);
    rec.wrong = replace ? e.valid.slice() : Array.from(new Set([...rec.wrong, ...e.valid])).sort((a, b) => a - b);
    students++; added += e.valid.filter(n => !before.has(n)).length;
  });
  saveState();
  tbState.pending = null;
  document.getElementById('tbPaste').value = '';
  renderTextbook();
  toast(`${students}명의 틀린 번호를 반영했어요 (새로 ${added}개).`);
}
async function tbHandleFile(file) {
  const book = tbBook();
  if (!book) { toast('교재를 먼저 골라주세요.'); return; }
  try {
    const rows = await tbFileToRows(file);
    tbState.pending = { source: file.name, result: tbParseRows(rows, tbStudents(), book) };
    tbRenderPreview();
  } catch (e) { console.error(e); toast('파일을 읽지 못했어요: ' + e.message); }
}
function tbHandlePaste() {
  const book = tbBook();
  const text = document.getElementById('tbPaste').value;
  if (!book) { toast('교재를 먼저 골라주세요.'); return; }
  if (!text.trim()) { toast('붙여넣은 내용이 없어요.'); return; }
  tbState.pending = { source: '붙여넣은 내용', result: tbParseRows(tbTextToRows(text, false), tbStudents(), book) };
  tbRenderPreview();
}

function tbAnalysis(book, rec, from, to) {
  const wrong = new Set(rec ? rec.wrong : []);
  const rows = [];
  book.types.forEach(t => {
    const inRange = t.problems.filter(p => p >= from && p <= to);
    if (!inRange.length) return;
    const w = inRange.filter(p => wrong.has(p)).length;
    rows.push({ t, n: inRange.length, w, pct: Math.round(((inRange.length - w) / inRange.length) * 100) });
  });
  return rows;
}

function renderTextbook() {
  const root = document.getElementById('tbBody');
  if (!root) return;
  // 선택 칸 채우기
  const bookSel = document.getElementById('tbBookSel');
  if (!TB_BOOKS.length) {
    bookSel.innerHTML = '<option value="">등록된 교재가 없어요</option>';
    root.classList.add('tb-empty');
    return;
  }
  root.classList.remove('tb-empty');
  if (!TB_BOOKS.some(b => b.id === tbState.bookId)) tbState.bookId = TB_BOOKS[0].id;
  bookSel.innerHTML = TB_BOOKS.map(b => `<option value="${b.id}">${escapeHtml(b.title)}</option>`).join('');
  bookSel.value = tbState.bookId;
  const book = tbBook();
  tbTypeMap(book);

  const students = tbStudents();
  const stuSel = document.getElementById('tbStudentSel');
  if (!students.some(s => s.id === tbState.studentId)) tbState.studentId = students[0] ? students[0].id : '';
  stuSel.innerHTML = students.length
    ? students.map(s => `<option value="${s.id}">${escapeHtml(s.name)}${s.grade ? ' · ' + escapeHtml(s.grade) : ''}${s.class ? ' · ' + escapeHtml(s.class) : ''}</option>`).join('')
    : `<option value="">${getCurrentTeacher() ? escapeHtml(getCurrentTeacher()) + ' 선생님 학생이 없어요' : '학생을 먼저 등록하세요'}</option>`;
  stuSel.value = tbState.studentId;
  document.getElementById('tbBookNote').textContent = book.note || '';

  const student = students.find(s => s.id === tbState.studentId) || null;
  const rec = student ? tbRecord(student.id, book.id, false) : null;
  const wrong = rec ? rec.wrong : [];

  // 틀린 번호 목록 (유형별로 묶어서 표시, 누르면 지워짐)
  const chips = document.getElementById('tbChips');
  if (!student) chips.innerHTML = '<div class="empty">학생을 먼저 고르세요.</div>';
  else if (!wrong.length) chips.innerHTML = '<div class="empty">아직 입력된 틀린 번호가 없어요.</div>';
  else {
    const byType = new Map();
    wrong.forEach(n => { const t = book._map.get(n); if (!t) return; if (!byType.has(t)) byType.set(t, []); byType.get(t).push(n); });
    chips.innerHTML = book.types.filter(t => byType.has(t)).map(t => `
      <div class="tb-group"><div class="tb-group-title"><b>${escapeHtml(t.label)}</b> ${escapeHtml(t.name)} <span class="field-hint">${byType.get(t).length}개</span></div>
      ${byType.get(t).map(n => `<button type="button" class="tb-chip" data-n="${n}" title="누르면 지워져요">${tbNum(n)} ✕</button>`).join('')}</div>`).join('');
    chips.querySelectorAll('.tb-chip').forEach(b => b.addEventListener('click', () => {
      const r = tbRecord(student.id, book.id, false);
      if (!r) return;
      r.wrong = r.wrong.filter(n => n !== +b.dataset.n);
      saveState(); renderTextbook();
    }));
  }
  document.getElementById('tbWrongSummary').textContent = student ? `${student.name} · 지금까지 모아둔 틀린 문제 ${wrong.length}개` : '';

  // 분석
  const fromEl = document.getElementById('tbFrom'), toEl = document.getElementById('tbTo');
  if (!fromEl.value) fromEl.value = book._min;
  if (!toEl.value) toEl.value = book._max;
  const from = parseInt(fromEl.value, 10) || book._min, to = parseInt(toEl.value, 10) || book._max;
  const lo = Math.min(from, to), hi = Math.max(from, to);
  const out = document.getElementById('tbAnalysis');
  if (!student) { out.innerHTML = ''; return; }
  const rows = tbAnalysis(book, rec, lo, hi);
  const totalN = rows.reduce((a, r) => a + r.n, 0), totalW = rows.reduce((a, r) => a + r.w, 0);
  if (!rows.length) { out.innerHTML = '<div class="empty">이 범위에 해당하는 문제가 없어요.</div>'; return; }
  const totalPct = totalN ? Math.round(((totalN - totalW) / totalN) * 100) : 0;
  const bar = (pct, color) => (typeof buildBarRow === 'function' ? buildBarRow(pct, color) : '');
  const weak = rows.filter(r => r.w > 0).sort((a, b) => a.pct - b.pct || b.w - a.w).slice(0, 3);
  const unitMap = new Map();
  rows.forEach(r => {
    const key = r.t.unit.split(' - ').slice(0, 2).join(' - ');
    const u = unitMap.get(key) || { n: 0, w: 0 }; u.n += r.n; u.w += r.w; unitMap.set(key, u);
  });
  out.innerHTML = `
    <div class="pill-row" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); margin-bottom:12px;">
      <div class="pill-tile"><span class="pill-tag" style="background:var(--good)">교재 정답률</span><div class="pill-value tnum">${totalPct}%</div><div class="pill-compare">${tbNum(lo)}~${tbNum(hi)}번 (${totalN}문제)</div></div>
      <div class="pill-tile"><span class="pill-tag" style="background:var(--critical)">틀린 문제</span><div class="pill-value tnum">${totalW}개</div><div class="pill-compare">범위 안에서</div></div>
    </div>
    ${weak.length ? `<p class="comment" style="margin:0 0 10px;">많이 틀린 유형: ${weak.map(r => `<b>${escapeHtml(r.t.label)} ${escapeHtml(r.t.name)}</b> (${r.pct}%)`).join(' · ')}</p>` : '<p class="comment" style="margin:0 0 10px;">이 범위에서는 틀린 문제가 없어요.</p>'}
    <h3 class="reset-class-title">단원별 합계 <span class="field-hint">(캐치유 단원과 같은 이름이라 보고서에서 합칠 수 있어요)</span></h3>
    ${Array.from(unitMap.entries()).map(([k, u]) => { const pct = Math.round(((u.n - u.w) / u.n) * 100); return `
      <div class="unit-row"><div class="unit-name">${escapeHtml(k)}</div><div class="unit-count">${u.n}문제</div>
      <div class="unit-bar-wrap">${bar(pct, pct < 70 ? 'var(--warn-dot)' : 'var(--accent)')}</div><div class="unit-pct tnum">${pct}%</div></div>`; }).join('')}
    <h3 class="reset-class-title" style="margin-top:14px;">유형별 정답률</h3>
    ${rows.map(r => `
      <div class="unit-row"><div class="unit-name"><b>${escapeHtml(r.t.label)}</b> ${escapeHtml(r.t.name)}</div><div class="unit-count">${r.w}/${r.n} 오답</div>
      <div class="unit-bar-wrap">${bar(r.pct, r.pct < 70 ? 'var(--warn-dot)' : 'var(--accent)')}</div><div class="unit-pct tnum">${r.pct}%</div></div>`).join('')}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadTextbooks();
  const $ = id => document.getElementById(id);
  if (!$('tbBody')) return;

  $('tbBookSel').addEventListener('change', e => { tbState.bookId = e.target.value; tbState.pending = null; $('tbFrom').value = ''; $('tbTo').value = ''; renderTextbook(); tbRenderPreview(); });
  $('tbStudentSel').addEventListener('change', e => { tbState.studentId = e.target.value; renderTextbook(); });
  $('tbFrom').addEventListener('input', renderTextbook);
  $('tbTo').addEventListener('input', renderTextbook);

  const addFromInput = () => {
    const book = tbBook(); const input = $('tbWrongInput');
    if (!book || !tbState.studentId) { toast('교재와 학생을 먼저 골라주세요.'); return; }
    const nums = tbParseNumbers(input.value);
    if (!nums.length) { toast('번호를 입력해주세요. (예: 14, 20~25)'); return; }
    const map = tbTypeMap(book);
    const ok = nums.filter(n => map.has(n)), bad = nums.filter(n => !map.has(n));
    const rec = tbRecord(tbState.studentId, book.id, true);
    rec.wrong = Array.from(new Set([...rec.wrong, ...ok])).sort((a, b) => a - b);
    saveState();
    input.value = '';
    renderTextbook();
    toast(bad.length ? `${ok.length}개 추가 · 책에 없는 번호는 뺐어요: ${bad.join(', ')}` : `${ok.length}개 추가했어요.`);
  };
  $('tbWrongInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addFromInput(); } });
  $('tbAddBtn').addEventListener('click', addFromInput);
  $('tbClearBtn').addEventListener('click', () => {
    const book = tbBook(); const rec = tbRecord(tbState.studentId, book ? book.id : '', false);
    if (!rec || !rec.wrong.length) return;
    if (!confirm('이 학생의 이 교재 틀린 번호를 모두 지울까요?')) return;
    rec.wrong = []; saveState(); renderTextbook();
  });

  // 파일 올리기 (클릭 또는 끌어다 놓기)
  const drop = $('tbDrop'), fileInput = $('tbFile');
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { const f = fileInput.files[0]; fileInput.value = ''; if (f) tbHandleFile(f); });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag-over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) tbHandleFile(f); });
  $('tbParseBtn').addEventListener('click', tbHandlePaste);

  renderTextbook();
});
