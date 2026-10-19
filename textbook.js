/* ================= 교재 채점 및 분석 =================
 * - 교재 정보(문제 번호 → 유형)는 books-shared.json 에서 읽어옴 (모든 선생님 공통, 교재가 늘어나면 이 파일에 추가)
 * - 학생별로 틀린 번호만 계속 쌓아둠: state.textbook.results = [{ id, studentId, bookId, wrong: [번호...] }]
 * - 정답률은 분석할 때 "몇 번 ~ 몇 번" 범위를 지정해서 계산 (범위 안의 문제는 모두 푼 것으로 봄)
 * - 파일(txt·csv·xlsx 등)이나 붙여넣은 표에서 틀린 번호를 한꺼번에 읽어올 수 있음
 * 나중에 보고서에서 캐치유 오답과 합칠 때는 유형의 unit("대단원 - 중단원 - 소단원")의 앞 두 단계로 묶으면 됨
 */

let TB_BOOKS = [];
const tbState = { school: '', grade: '', bookId: '', studentId: '', tab: 'score', pending: null };

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

/* ---------- 올린 파일/붙여넣은 내용 미리보기와 반영 ---------- */
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
      <span class="field-hint">${escapeHtml(p.source)} 기준</span>
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

/* ---------- 화면 ---------- */
const TB_SCHOOLS = { '초등': ['초3', '초4', '초5', '초6'], '중등': ['중1', '중2', '중3'], '고등': ['고1', '고2', '고3'] };
const tbOpenChapters = new Set();      // 펼쳐 둔 중단원 (처음에는 모두 접힘)
const tbRange = { bookId: '', from: '', to: '' };

function tbSchoolOf(b) { return b.school || (/^초/.test(b.grade) ? '초등' : /^중/.test(b.grade) ? '중등' : '고등'); }
function tbBooksFor(school, grade) { return TB_BOOKS.filter(b => tbSchoolOf(b) === school && b.grade === grade); }
function tbSelectBook(book) {
  if (!book) { tbState.bookId = ''; return; }
  tbState.bookId = book.id; tbState.school = tbSchoolOf(book); tbState.grade = book.grade;
}
function tbChapters(book) {
  const map = new Map();
  (book.chapters || []).forEach(c => map.set(c.ch, { ch: c.ch, title: c.title, types: [] }));
  book.types.forEach(t => { if (!map.has(t.ch)) map.set(t.ch, { ch: t.ch, title: t.ch, types: [] }); map.get(t.ch).types.push(t); });
  return Array.from(map.values());
}
function tbChapKey(book, ch) { return book.id + '|' + ch; }
function tbBar(pct, color) { return typeof buildBarRow === 'function' ? buildBarRow(pct, color) : ''; }
function tbPctColor(pct) { return pct < 70 ? 'var(--warn-dot)' : 'var(--data)'; }

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
function tbRangeOf(book) {
  if (tbRange.bookId !== book.id) { tbRange.bookId = book.id; tbRange.from = book._min; tbRange.to = book._max; }
  const f = parseInt(tbRange.from, 10), t = parseInt(tbRange.to, 10);
  const from = Number.isFinite(f) ? f : book._min, to = Number.isFinite(t) ? t : book._max;
  return { lo: Math.min(from, to), hi: Math.max(from, to) };
}
function tbChapterRows(book, rows) {
  return tbChapters(book).map(c => {
    const rs = rows.filter(r => r.t.ch === c.ch);
    const n = rs.reduce((a, r) => a + r.n, 0), w = rs.reduce((a, r) => a + r.w, 0);
    return { c, rs, n, w, pct: n ? Math.round(((n - w) / n) * 100) : 0 };
  }).filter(x => x.n > 0);
}
function tbCurrent() {
  const book = tbBook();
  const students = tbStudents();
  const student = students.find(s => s.id === tbState.studentId) || null;
  const rec = student && book ? tbRecord(student.id, book.id, false) : null;
  return { book, students, student, rec, wrong: rec ? rec.wrong : [] };
}

/* ----- 위쪽 선택 칸 (초·중·고 → 학년 → 교재 → 학생) ----- */
function tbRenderSelectors() {
  const $ = id => document.getElementById(id);
  $('tbSchoolSel').innerHTML = Object.keys(TB_SCHOOLS).map(s => `<option value="${s}">${s}</option>`).join('');
  $('tbSchoolSel').value = tbState.school;
  $('tbGradeSel').innerHTML = TB_SCHOOLS[tbState.school].map(g => `<option value="${g}">${g}${tbBooksFor(tbState.school, g).length ? '' : ' (교재 없음)'}</option>`).join('');
  $('tbGradeSel').value = tbState.grade;
  const books = tbBooksFor(tbState.school, tbState.grade);
  $('tbBookSel').innerHTML = books.length ? books.map(b => `<option value="${b.id}">${escapeHtml(b.title)}</option>`).join('') : '<option value="">이 학년에는 교재가 아직 없어요</option>';
  $('tbBookSel').value = books.some(b => b.id === tbState.bookId) ? tbState.bookId : '';
  // 학생 칸에는 고른 학년과 같은 학교급(초등/중등/고등) 학생만, 그중에서도 고른 학년에서 위아래 2개 학년 안의 학생만 보여줌
  const gradeInfo = g => { const m = /^(초|중|고)(\d)/.exec(g || ''); return m ? { level: m[1], n: +m[2] } : null; };
  const cur = gradeInfo(tbState.grade);
  const students = tbStudents().filter(s => {
    const gi = gradeInfo(s.examGrade || s.grade);
    return gi && cur && gi.level === cur.level && Math.abs(gi.n - cur.n) <= 2;
  });
  const same = students.filter(s => (s.examGrade || s.grade) === tbState.grade), other = students.filter(s => (s.examGrade || s.grade) !== tbState.grade);
  const opt = s => `<option value="${s.id}">${escapeHtml(s.name)}${s.class ? ' · ' + escapeHtml(s.class) : ''}${s.grade ? ' · ' + escapeHtml(s.grade) : ''}</option>`;
  $('tbStudentSel').innerHTML = students.length
    ? (same.length ? `<optgroup label="${tbState.grade} 학생">${same.map(opt).join('')}</optgroup>` : '') + (other.length ? `<optgroup label="가까운 학년 학생">${other.map(opt).join('')}</optgroup>` : '')
    : `<option value="">${getCurrentTeacher() ? escapeHtml(getCurrentTeacher()) + ' 선생님의 ' + escapeHtml(tbState.school) + ' 학생이 없어요' : escapeHtml(tbState.school) + ' 학생이 없어요'}</option>`;
  if (!students.some(s => s.id === tbState.studentId)) tbState.studentId = (same[0] || other[0] || {}).id || '';
  $('tbStudentSel').value = tbState.studentId;
}

/* ----- 왼쪽: 학년별 교재 목록 ----- */
function tbRenderSide() {
  const side = document.getElementById('tbSide');
  side.innerHTML = '<h3 class="tb-side-title">교재 목록</h3>' + Object.entries(TB_SCHOOLS).map(([school, grades]) => `
    <div class="tb-side-school"><div class="tb-side-school-name">${school}</div>
    ${grades.map(g => {
      const bs = tbBooksFor(school, g);
      return `<div class="tb-side-grade"><div class="tb-side-grade-name">${g}</div>${bs.length ? bs.map(b => {
        tbTypeMap(b);
        return `<button type="button" class="tb-side-book${b.id === tbState.bookId ? ' active' : ''}" data-book="${b.id}">${escapeHtml(b.title)}<span>유형 ${b.types.length}개 · 문제 ${b._map.size}개</span></button>`;
      }).join('') : '<div class="tb-side-empty">아직 올라온 교재가 없어요</div>'}</div>`;
    }).join('')}</div>`).join('');
  side.querySelectorAll('.tb-side-book').forEach(b => b.addEventListener('click', () => {
    tbSelectBook(TB_BOOKS.find(x => x.id === b.dataset.book)); tbState.pending = null; renderTextbook();
  }));
}

/* ----- 채점 입력 탭: 틀린 번호 목록 (중단원별로 접어둠) ----- */
function tbRenderChips() {
  const { book, student, wrong } = tbCurrent();
  const chips = document.getElementById('tbChips');
  document.getElementById('tbWrongSummary').textContent = student && book ? `${student.name} · ${book.title} · 모아둔 틀린 문제 ${wrong.length}개` : '';
  if (!book) { chips.innerHTML = '<div class="empty">교재를 먼저 고르세요.</div>'; return; }
  if (!student) { chips.innerHTML = '<div class="empty">학생을 먼저 고르세요.</div>'; return; }
  if (!wrong.length) { chips.innerHTML = '<div class="empty">아직 입력된 틀린 번호가 없어요.</div>'; return; }
  const map = tbTypeMap(book);
  const byType = new Map();
  wrong.forEach(n => { const t = map.get(n); if (!t) return; if (!byType.has(t)) byType.set(t, []); byType.get(t).push(n); });
  const chaps = tbChapters(book).map(c => ({ c, ts: c.types.filter(t => byType.has(t)) })).filter(x => x.ts.length);
  chips.innerHTML = `<div class="inline-form" style="margin-bottom:8px;"><button type="button" class="btn ghost" id="tbOpenAll">모두 펼치기</button><button type="button" class="btn ghost" id="tbCloseAll">모두 접기</button><span class="field-hint">단원을 누르면 유형별로 펼쳐져요</span></div>` +
    chaps.map(({ c, ts }) => {
      const cnt = ts.reduce((a, t) => a + byType.get(t).length, 0);
      return `<details class="tb-chap" data-ck="${tbChapKey(book, c.ch)}"${tbOpenChapters.has(tbChapKey(book, c.ch)) ? ' open' : ''}>
        <summary><span class="tb-chap-name">${escapeHtml(c.title)}</span><span class="field-hint">틀린 문제 ${cnt}개 · 유형 ${ts.length}개</span></summary>
        <div class="tb-chap-body">${ts.map(t => `<div class="tb-group"><div class="tb-group-title"><b>${escapeHtml(t.label)}</b> ${escapeHtml(t.name)} <span class="field-hint">${byType.get(t).length}개</span></div>
          ${byType.get(t).map(n => `<button type="button" class="tb-chip" data-n="${n}" title="누르면 지워져요">${tbNum(n)} ✕</button>`).join('')}</div>`).join('')}</div></details>`;
    }).join('');
  chips.querySelectorAll('.tb-chip').forEach(b => b.addEventListener('click', () => {
    const r = tbRecord(student.id, book.id, false);
    if (!r) return;
    r.wrong = r.wrong.filter(n => n !== +b.dataset.n);
    saveState(); renderTextbook();
  }));
  tbBindDetails(chips);
  document.getElementById('tbOpenAll').addEventListener('click', () => { chaps.forEach(x => tbOpenChapters.add(tbChapKey(book, x.c.ch))); tbRenderChips(); });
  document.getElementById('tbCloseAll').addEventListener('click', () => { chaps.forEach(x => tbOpenChapters.delete(tbChapKey(book, x.c.ch))); tbRenderChips(); });
}
function tbBindDetails(root) {
  root.querySelectorAll('details.tb-chap').forEach(d => d.addEventListener('toggle', () => {
    if (d.open) tbOpenChapters.add(d.dataset.ck); else tbOpenChapters.delete(d.dataset.ck);
  }));
}

/* ----- 분석 탭 ----- */
function tbRenderAnalysis() {
  const out = document.getElementById('tbAnalysis');
  const { book, student, rec } = tbCurrent();
  if (!book) { out.innerHTML = '<div class="empty">교재를 먼저 고르세요.</div>'; return; }
  tbTypeMap(book);
  const { lo, hi } = tbRangeOf(book);
  document.getElementById('tbFrom').value = tbRange.from; document.getElementById('tbTo').value = tbRange.to;
  if (!student) { out.innerHTML = '<div class="empty">학생을 먼저 고르세요.</div>'; return; }
  const rows = tbAnalysis(book, rec, lo, hi);
  if (!rows.length) { out.innerHTML = '<div class="empty">이 범위에 해당하는 문제가 없어요.</div>'; return; }
  const totalN = rows.reduce((a, r) => a + r.n, 0), totalW = rows.reduce((a, r) => a + r.w, 0);
  const totalPct = totalN ? Math.round(((totalN - totalW) / totalN) * 100) : 0;
  const weak = rows.filter(r => r.w > 0).sort((a, b) => a.pct - b.pct || b.w - a.w).slice(0, 5);
  const chapRows = tbChapterRows(book, rows);
  out.innerHTML = `
    <div class="pill-row" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); margin-bottom:12px;">
      <div class="pill-tile"><span class="pill-tag" style="background:var(--good)">교재 정답률</span><div class="pill-value tnum">${totalPct}%</div><div class="pill-compare">${tbNum(lo)}~${tbNum(hi)}번 (${totalN}문제)</div></div>
      <div class="pill-tile"><span class="pill-tag" style="background:var(--critical)">틀린 문제</span><div class="pill-value tnum">${totalW}개</div><div class="pill-compare">범위 안에서</div></div>
    </div>
    ${weak.length ? `<p class="comment" style="margin:0 0 12px;">많이 틀린 유형: ${weak.map(r => `<b>${escapeHtml(r.t.label)} ${escapeHtml(r.t.name)}</b> (${r.pct}%)`).join(' · ')}</p>` : '<p class="comment" style="margin:0 0 12px;">이 범위에서는 틀린 문제가 없어요.</p>'}
    <h3 class="reset-class-title">단원별 정답률 <span class="field-hint">(단원 클릭 시 유형 표시 · 캐치유 단원명 기준으로 합산)</span></h3>
    ${chapRows.map(({ c, rs, n, w, pct }) => `
      <details class="tb-chap" data-ck="${tbChapKey(book, c.ch)}"${tbOpenChapters.has(tbChapKey(book, c.ch)) ? ' open' : ''}>
        <summary><div class="unit-row" style="flex:1; margin:0;"><div class="unit-name">${escapeHtml(c.title)}</div><div class="unit-count">${w}/${n} 오답</div>
          <div class="unit-bar-wrap">${tbBar(pct, tbPctColor(pct))}</div><div class="unit-pct tnum">${pct}%</div></div></summary>
        <div class="tb-chap-body">${rs.map(r => `<div class="unit-row"><div class="unit-name"><b>${escapeHtml(r.t.label)}</b> ${escapeHtml(r.t.name)}</div><div class="unit-count">${r.w}/${r.n} 오답</div>
          <div class="unit-bar-wrap">${tbBar(r.pct, tbPctColor(r.pct))}</div><div class="unit-pct tnum">${r.pct}%</div></div>`).join('')}</div>
      </details>`).join('')}`;
  tbBindDetails(out);
}

/* ----- 보고서 탭 ----- */
const TB_REPORT_PARTS = { head: '제목 영역', pills: '요약 숫자', chap: '단원별 정답률', weak: '많이 틀린 유형', note: '선생님 의견', list: '틀린 문제 목록' };
function tbNoteKey(studentId, bookId) { return studentId + '|' + bookId; }
function tbBuildComment(student, book, rows, lo, hi) {
  const name = displayName(student.name);
  const totalN = rows.reduce((a, r) => a + r.n, 0), totalW = rows.reduce((a, r) => a + r.w, 0);
  const weak = rows.filter(r => r.w > 0).sort((a, b) => a.pct - b.pct || b.w - a.w).slice(0, 3);
  if (!totalW) return `${name} 학생은 ${book.title} ${tbNum(lo)}~${tbNum(hi)}번 범위를 모두 정확하게 풀어냈어요. 지금처럼 꾸준히 이어가면서, 조금 더 어려운 문제에도 도전해 보면 좋겠어요.`;
  return `${name} 학생은 ${book.title} ${tbNum(lo)}~${tbNum(hi)}번 범위에서 ${totalN}문제 중 ${totalW}문제를 틀렸어요. 특히 ${weak.map(r => `'${r.t.name}'`).join(', ')} 유형에서 오답이 모여 있어서, 해당 개념을 한 번 더 정리하고 대표문제부터 차근차근 다시 풀어보면 좋겠어요. 나머지 유형은 안정적으로 풀고 있으니 자신감을 가지고 이어가 봐요.`;
}
function tbRenderReport() {
  const out = document.getElementById('tbReport');
  const { book, student, rec, wrong } = tbCurrent();
  if (!book || !student) { out.innerHTML = '<div class="card empty-state">교재와 학생을 먼저 고르세요.</div>'; return; }
  tbTypeMap(book);
  const { lo, hi } = tbRangeOf(book);
  const rows = tbAnalysis(book, rec, lo, hi);
  if (!rows.length) { out.innerHTML = '<div class="card empty-state">이 범위에 해당하는 문제가 없어요.</div>'; return; }
  const totalN = rows.reduce((a, r) => a + r.n, 0), totalW = rows.reduce((a, r) => a + r.w, 0);
  const totalPct = totalN ? Math.round(((totalN - totalW) / totalN) * 100) : 0;
  const chapRows = tbChapterRows(book, rows);
  const weak = rows.filter(r => r.w > 0).sort((a, b) => a.pct - b.pct || b.w - a.w).slice(0, 8);
  const weakChap = chapRows.filter(x => x.w > 0).sort((a, b) => a.pct - b.pct)[0];
  const key = tbNoteKey(student.id, book.id);
  if (!state.textbook.notes) state.textbook.notes = {};
  const note = state.textbook.notes[key] != null ? state.textbook.notes[key] : tbBuildComment(student, book, rows, lo, hi);
  const inRangeWrong = wrong.filter(n => n >= lo && n <= hi);
  const map = book._map;
  const byType = new Map();
  inRangeWrong.forEach(n => { const t = map.get(n); if (!t) return; if (!byType.has(t)) byType.set(t, []); byType.get(t).push(n); });
  const today = new Date();
  const dateTxt = `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;

  out.innerHTML = `
    <div class="card" data-rkey="head">
      <div class="masthead">
        <div><div class="brand-line">${typeof logoBlock === 'function' ? logoBlock() : ''}</div><h2>교재 분석 보고서</h2></div>
        <div class="meta">
          <div class="student-name-big">${escapeHtml(displayName(student.name))}</div>
          <div>${[student.school, student.grade].filter(Boolean).map(escapeHtml).join(' ')}</div>
          ${student.teacher ? `<div>담임: ${escapeHtml(teacherDisplayName(student.teacher))} ${teacherTitle(student.teacher)}</div>` : ''}
          <div>${escapeHtml(book.title)} · ${tbNum(lo)}~${tbNum(hi)}번</div>
          <div>작성일 ${dateTxt}</div>
        </div>
      </div>
    </div>
    <div class="pill-row" data-rkey="pills" style="grid-template-columns:repeat(4, 1fr);">
      <div class="pill-tile"><span class="pill-tag" style="background:var(--good)">교재 정답률</span><div class="pill-value tnum">${totalPct}%</div></div>
      <div class="pill-tile"><span class="pill-tag" style="background:var(--type-2)">푼 문제</span><div class="pill-value tnum">${totalN}</div><div class="pill-compare">범위 안의 문제 수</div></div>
      <div class="pill-tile"><span class="pill-tag" style="background:var(--critical)">틀린 문제</span><div class="pill-value tnum">${totalW}</div></div>
      <div class="pill-tile"><span class="pill-tag" style="background:var(--warn-dot)">보완이 필요한 단원</span><div class="pill-value" style="font-size:15px; line-height:1.3;">${weakChap ? escapeHtml(weakChap.c.title) : '없음'}</div>${weakChap ? `<div class="pill-compare">정답률 ${weakChap.pct}%</div>` : ''}</div>
    </div>
    <div class="card" data-rkey="chap">
      <h2>단원별 정답률</h2>
      <p class="card-sub">교재 ${tbNum(lo)}~${tbNum(hi)}번 기준</p>
      ${chapRows.map(({ c, n, w, pct }) => `<div class="unit-row"><div class="unit-name">${escapeHtml(c.title)}</div><div class="unit-count">${w}/${n} 오답</div>
        <div class="unit-bar-wrap">${tbBar(pct, tbPctColor(pct))}</div><div class="unit-pct tnum">${pct}%</div></div>`).join('')}
    </div>
    <div class="card" data-rkey="weak">
      <h2>많이 틀린 유형</h2>
      <p class="card-sub">정답률이 낮은 순서</p>
      ${weak.length ? weak.map(r => `<div class="unit-row"><div class="unit-name"><b>${escapeHtml(r.t.label)}</b> ${escapeHtml(r.t.name)}</div><div class="unit-count">${r.w}/${r.n} 오답</div>
        <div class="unit-bar-wrap">${tbBar(r.pct, tbPctColor(r.pct))}</div><div class="unit-pct tnum">${r.pct}%</div></div>`).join('') : '<div class="empty">이 범위에서는 틀린 문제가 없어요.</div>'}
    </div>
    <div class="card" id="tbNoteCard" data-rkey="note">
      <h2>선생님 의견</h2>
      <textarea class="teacher-note no-print" id="tbNoteInput" placeholder="선생님 의견을 입력하세요.">${escapeHtml(note)}</textarea>
      <p class="comment print-only" id="tbNotePrint">${note ? escapeHtml(note).replace(/\n/g, '<br>') : '(작성된 의견이 없어요)'}</p>
    </div>
    <div class="card" data-rkey="list">
      <h2>틀린 문제 목록</h2>
      <p class="card-sub">유형별 정리 · 보충 학습 참고용</p>
      ${byType.size ? book.types.filter(t => byType.has(t)).map(t => `<div class="tb-group"><div class="tb-group-title"><b>${escapeHtml(t.label)}</b> ${escapeHtml(t.name)}</div><div class="tb-numline">${byType.get(t).map(tbNum).join(', ')}</div></div>`).join('') : '<div class="empty">틀린 문제가 없어요.</div>'}
    </div>`;

  const noteInput = document.getElementById('tbNoteInput');
  noteInput.addEventListener('change', () => {
    state.textbook.notes[key] = noteInput.value; saveState();
    document.getElementById('tbNotePrint').innerHTML = noteInput.value ? escapeHtml(noteInput.value).replace(/\n/g, '<br>') : '(작성된 의견이 없어요)';
    toast('선생님 의견을 저장했어요.');
  });
  tbSetupToggles(out, key);
}
// 보고서의 각 요소에 "PDF 포함" 체크박스를 달아서 필요 없는 건 빼고 저장할 수 있게 함 (학생·교재마다 기억)
function tbSetupToggles(out, key) {
  if (!state.textbook.hidden) state.textbook.hidden = {};
  const hiddenList = state.textbook.hidden[key] || [];
  out.querySelectorAll('[data-rkey]').forEach(el => {
    const k = el.dataset.rkey;
    const label = document.createElement('label');
    label.className = 'rk-toggle no-print';
    label.title = (TB_REPORT_PARTS[k] || '') + ' — 체크를 끄면 PDF에서 빠져요';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !hiddenList.includes(k);
    label.appendChild(cb); label.appendChild(document.createTextNode(' PDF 포함'));
    el.appendChild(label);
    el.classList.toggle('rk-off', !cb.checked);
    cb.addEventListener('change', () => {
      const list = (state.textbook.hidden[key] || []).filter(x => x !== k);
      if (!cb.checked) list.push(k);
      if (list.length) state.textbook.hidden[key] = list; else delete state.textbook.hidden[key];
      saveState(); el.classList.toggle('rk-off', !cb.checked);
    });
  });
}
async function tbExportPDF() {
  const status = document.getElementById('tbReportStatus'), btn = document.getElementById('tbPdfBtn');
  const target = document.getElementById('tbReport');
  const { book, student } = tbCurrent();
  if (!book || !student || !target.children.length || target.querySelector('.empty-state')) { status.textContent = '먼저 교재와 학생을 고르세요.'; return; }
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') { status.style.color = 'var(--critical)'; status.textContent = 'PDF 기능을 불러오지 못했어요 (인터넷 연결을 확인해주세요).'; return; }
  btn.disabled = true; status.style.color = 'var(--muted)'; status.textContent = 'PDF 생성 중이에요...';
  document.body.classList.add('exporting-pdf');
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4', true);
    const ctx = { scale: 3, marginX: 10, marginY: 10, gap: 4, contentWidth: 190, contentBottom: 287, pageContentH: 277, y: 10, pageHasContent: false };
    const blocks = Array.from(target.children).filter(el => !el.classList.contains('no-print') && el.offsetHeight > 0);
    for (const b of blocks) await pdfPlaceElement(pdf, b, ctx);
    pdfFlushPage(pdf, ctx, false);
    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) { pdf.setPage(p); pdf.setFontSize(9); pdf.setTextColor(150, 150, 150); pdf.text(`- ${p} -`, 105, 291, { align: 'center' }); }
    pdf.save(`교재분석_${displayName(student.name)}_${book.title.replace(/\s+/g, '')}.pdf`);
    status.style.color = 'var(--good)'; status.textContent = 'PDF를 저장했어요.';
  } catch (err) {
    console.error(err); status.style.color = 'var(--critical)'; status.textContent = 'PDF 생성 실패: ' + err.message;
  } finally {
    document.body.classList.remove('exporting-pdf'); btn.disabled = false;
  }
}

/* ----- 전체 그리기 ----- */
function tbSwitchTab(name) {
  tbState.tab = name;
  document.querySelectorAll('[data-tbtab]').forEach(b => b.classList.toggle('active', b.dataset.tbtab === name));
  document.querySelectorAll('.tb-panel').forEach(p => p.classList.toggle('active', p.id === 'tbPanel-' + name));
  document.getElementById('tbRangeBar').style.display = name === 'score' ? 'none' : '';
  if (name === 'analysis') tbRenderAnalysis();
  if (name === 'report') tbRenderReport();
}
function renderTextbook() {
  if (!document.getElementById('tbBody')) return;
  if (!TB_BOOKS.length) { document.getElementById('tbSide').innerHTML = '<div class="empty">교재 목록을 불러오지 못했어요.</div>'; return; }
  if (!tbBook()) {
    const first = TB_BOOKS.find(b => tbSchoolOf(b) === tbState.school && b.grade === tbState.grade) || TB_BOOKS[0];
    if (tbState.school && tbState.grade && !tbBooksFor(tbState.school, tbState.grade).length) { /* 교재 없는 학년을 직접 고른 경우 그대로 둠 */ } else tbSelectBook(first);
  }
  const b = tbBook(); if (b) tbTypeMap(b);
  tbRenderSelectors();
  tbRenderSide();
  const noBook = !b;
  document.getElementById('tbBody').classList.toggle('tb-nobook', noBook);
  tbRenderChips();
  if (tbState.tab === 'analysis') tbRenderAnalysis();
  if (tbState.tab === 'report') tbRenderReport();
  if (tbState.pending) tbRenderPreview();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadTextbooks();
  const $ = id => document.getElementById(id);
  if (!$('tbBody')) return;
  if (TB_BOOKS.length) tbSelectBook(TB_BOOKS[0]);

  $('tbSchoolSel').addEventListener('change', e => {
    tbState.school = e.target.value;
    const g = TB_SCHOOLS[tbState.school].find(x => tbBooksFor(tbState.school, x).length) || TB_SCHOOLS[tbState.school][0];
    tbState.grade = g; tbState.pending = null; tbSelectBook(tbBooksFor(tbState.school, g)[0] || null);
    if (!tbBook()) tbState.bookId = '';
    renderTextbook();
  });
  $('tbGradeSel').addEventListener('change', e => {
    tbState.grade = e.target.value; tbState.pending = null;
    const b = tbBooksFor(tbState.school, tbState.grade)[0]; if (b) tbSelectBook(b); else tbState.bookId = '';
    renderTextbook();
  });
  $('tbBookSel').addEventListener('change', e => { tbSelectBook(TB_BOOKS.find(b => b.id === e.target.value) || null); tbState.pending = null; renderTextbook(); });
  $('tbStudentSel').addEventListener('change', e => { tbState.studentId = e.target.value; renderTextbook(); });
  document.querySelectorAll('[data-tbtab]').forEach(btn => btn.addEventListener('click', () => tbSwitchTab(btn.dataset.tbtab)));
  const onRange = () => { tbRange.from = $('tbFrom').value; tbRange.to = $('tbTo').value; if (tbState.tab === 'analysis') tbRenderAnalysis(); if (tbState.tab === 'report') tbRenderReport(); };
  $('tbFrom').addEventListener('input', onRange); $('tbTo').addEventListener('input', onRange);
  $('tbPdfBtn').addEventListener('click', tbExportPDF);

  const addFromInput = () => {
    const book = tbBook(); const input = $('tbWrongInput');
    if (!book || !tbState.studentId) { toast('교재와 학생을 먼저 골라주세요.'); return; }
    const nums = tbParseNumbers(input.value);
    if (!nums.length) { toast('번호를 입력해주세요. (예: 14, 20~25)'); return; }
    const map = tbTypeMap(book);
    const ok = nums.filter(n => map.has(n)), bad = nums.filter(n => !map.has(n));
    const rec = tbRecord(tbState.studentId, book.id, true);
    rec.wrong = Array.from(new Set([...rec.wrong, ...ok])).sort((a, b) => a - b);
    saveState(); input.value = ''; renderTextbook();
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

  const drop = $('tbDrop'), fileInput = $('tbFile');
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { const f = fileInput.files[0]; fileInput.value = ''; if (f) tbHandleFile(f); });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag-over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) tbHandleFile(f); });
  $('tbParseBtn').addEventListener('click', tbHandlePaste);

  tbSwitchTab('score');
  renderTextbook();
});
