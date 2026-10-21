/* 재시험지 자동 생성 — 회차에 미리 올려 둔 "재시험지 PDF"에서, 학생이 틀린 번호의 문제만 잘라 모아
   그 학생 전용 재시험지(PDF)를 만든다. 문제는 한 장에 4문제씩 2단(시험지 모양)으로 배치하고,
   "빠른정답 PDF"가 올라와 있으면 같은 번호의 정답만 잘라 끝에 붙인다.
   - PDF 읽기·자르기: pdf.js (필요할 때만 CDN에서 불러옴), PDF 만들기: jsPDF(이미 페이지에 있음)
   - 한글 글꼴 문제를 피하려고 머리말·배치는 전부 캔버스에 그려서 이미지로 PDF에 넣음 */
(function () {
  'use strict';

  const PDFJS_VER = '3.11.174';
  const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.min.js`;
  const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`;
  const RENDER_SCALE = 2.78;                 // PDF 1pt = 2.78px (200dpi)
  const PAGE_W = 1654, PAGE_H = 2339;        // A4 @200dpi
  const FOOTER_PT = 56;                      // 쪽 아래 여백(pt) — 쪽 번호가 있는 곳은 문제로 안 침

  let pdfjsPromise = null;
  function loadPdfJs() {
    if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return Promise.resolve(window.pdfjsLib); }
    if (!pdfjsPromise) {
      pdfjsPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PDFJS_URL;
        s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; resolve(window.pdfjsLib); };
        s.onerror = () => reject(new Error('PDF 도구(pdf.js)를 불러오지 못했어요. 인터넷을 확인해주세요.'));
        document.head.appendChild(s);
      });
    }
    return pdfjsPromise;
  }

  async function openPdf(buf) {
    const lib = await loadPdfJs();
    return lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;   // 원본이 비워지지 않게 복사본을 넘김
  }

  // 문제지: 쪽마다 "큰 번호표(01, 02…)"를 찾아 각 문제가 차지하는 칸을 계산함. 정답·해설 쪽은 건너뜀.
  // 한 쪽은 2단(왼쪽 열 / 오른쪽 열)이고, 문제는 번호표 위치부터 같은 열의 다음 번호표(없으면 쪽 아래)까지임.
  async function scanProblems(pdf) {
    const found = {};
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      if (tc.items.some(it => it.str.trim() === '해설')) continue;
      const marks = [];
      tc.items.forEach(it => {
        const s = it.str.trim();
        if (!/^\d{1,2}$/.test(s)) return;
        const size = Math.hypot(it.transform[0], it.transform[1]);
        if (size < 15) return;                                  // 큰 번호표만 (쪽 번호·본문 숫자는 작음)
        const top = vp.height - (it.transform[5] + size * 0.8); // 위에서부터의 y(pt)
        marks.push({ num: parseInt(s, 10), x: it.transform[4], y: top });
      });
      const half = vp.width / 2;
      marks.forEach(m => {
        const col = m.x < half ? 0 : 1;
        const same = marks.filter(o => (o.x < half ? 0 : 1) === col && o.y > m.y + 10).sort((a, b) => a.y - b.y);
        const bottom = same.length ? same[0].y - 6 : vp.height - FOOTER_PT;
        if (found[m.num]) return;                               // 같은 번호가 또 나오면 처음 것만
        found[m.num] = {
          page: p, top: Math.max(0, m.y - 8), bottom,
          left: col === 0 ? 24 : half + 4, right: col === 0 ? half - 4 : vp.width - 24,
        };
      });
    }
    return found;
  }

  // 빠른정답: 번호표(두 자리 숫자)가 표 모양으로 늘어서 있음. 각 번호의 칸 = 번호 오른쪽 ~ 다음 열 번호 앞, 위아래는 이웃 행과의 가운데까지.
  async function scanAnswers(pdf) {
    const found = {};
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const marks = [];
    tc.items.forEach(it => {
      const s = it.str.trim();
      if (!/^\d{2}$/.test(s)) return;
      const size = Math.hypot(it.transform[0], it.transform[1]);
      if (size < 7 || size > 14) return;
      const top = vp.height - (it.transform[5] + size * 0.8);
      if (top > vp.height - 70) return;                         // 아래 쪽 번호
      marks.push({ num: parseInt(s, 10), x: it.transform[4], y: top + size / 2 });
    });
    if (!marks.length) return found;
    // 머리말의 "30문제" 같은 숫자를 번호표로 오인하지 않도록, 표가 시작하는 "01"보다 위에 있는 것은 버림
    const firstOne = marks.filter(m => m.num === 1).sort((a, b) => b.y - a.y)[0];
    if (firstOne) { for (let i = marks.length - 1; i >= 0; i--) if (marks[i].y < firstOne.y - 8) marks.splice(i, 1); }
    const rows = []; // 같은 줄끼리 묶음
    marks.slice().sort((a, b) => a.y - b.y).forEach(m => {
      const r = rows.find(r => Math.abs(r.y - m.y) < 6);
      if (r) { r.items.push(m); r.y = (r.y * (r.items.length - 1) + m.y) / r.items.length; } else rows.push({ y: m.y, items: [m] });
    });
    rows.sort((a, b) => a.y - b.y);
    const colXs = Array.from(new Set(marks.map(m => Math.round(m.x / 8) * 8))).sort((a, b) => a - b);
    const colGap = colXs.length > 1 ? (colXs[colXs.length - 1] - colXs[0]) / (colXs.length - 1) : 80;
    rows.forEach((r, ri) => {
      const prev = rows[ri - 1], next = rows[ri + 1];
      // 이웃 줄과의 가운데까지 자르되, 표의 가로줄이 같이 잘려 들어오지 않게 조금 덜 자름
      const up = (prev ? (r.y - prev.y) / 2 : (next ? (next.y - r.y) / 2 : 14)) * 0.82;
      const down = (next ? (next.y - r.y) / 2 : (prev ? (r.y - prev.y) / 2 : 14)) * 0.82;
      r.items.sort((a, b) => a.x - b.x).forEach((m, ci, arr) => {
        if (found[m.num]) return;
        found[m.num] = { page: 1, top: r.y - up, bottom: r.y + down, left: m.x - 4, right: ci + 1 < arr.length ? arr[ci + 1].x - 6 : m.x + colGap - 6 };
      });
    });
    return found;
  }

  // 잘라낸 그림의 흰 여백을 줄임
  function trim(cv, pad) {
    const ctx = cv.getContext('2d');
    const { width: w, height: h } = cv;
    const d = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] > 10 && (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235)) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return cv;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    const octx = out.getContext('2d');
    octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  // PDF 쪽을 한 번만 그려서 재사용하며 영역을 잘라냄
  function makeCropper(pdf) {
    const cache = {};
    return async (spec) => {
      if (!cache[spec.page]) {
        const page = await pdf.getPage(spec.page);
        const vp = page.getViewport({ scale: RENDER_SCALE });
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        cache[spec.page] = cv;
      }
      const src = cache[spec.page], S = RENDER_SCALE;
      const x = Math.max(0, Math.floor(spec.left * S)), y = Math.max(0, Math.floor(spec.top * S));
      const w = Math.min(src.width - x, Math.ceil((spec.right - spec.left) * S)), h = Math.min(src.height - y, Math.ceil((spec.bottom - spec.top) * S));
      const out = document.createElement('canvas');
      out.width = Math.max(1, w); out.height = Math.max(1, h);
      const octx = out.getContext('2d');
      octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(src, x, y, w, h, 0, 0, w, h);
      return trim(out, 6);
    };
  }

  function fitImage(ctx, img, x, y, maxW, maxH, maxScale) {
    const s = Math.min(maxW / img.width, maxH / img.height, maxScale || 1.6);
    const w = img.width * s, h = img.height * s;
    ctx.drawImage(img, x, y, w, h);
    return { w, h };
  }

  async function ensureFont() {
    try { await document.fonts.load('700 40px "Noto Sans KR"'); await document.fonts.load('400 24px "Noto Sans KR"'); } catch (e) { /* 글꼴이 없으면 기본 글꼴로 */ }
  }
  const FONT = '"Noto Sans KR", "Malgun Gothic", sans-serif';

  function newPage() {
    const cv = document.createElement('canvas'); cv.width = PAGE_W; cv.height = PAGE_H;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    return { cv, ctx };
  }

  // 우리 CI(로고 + KASTLE MATH). 흑백 출력용이라 로고는 회색조로 그림
  let logoPromise = null;
  function loadLogo() {
    if (!logoPromise) {
      logoPromise = new Promise(res => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = 'logo.png';
      });
    }
    return logoPromise;
  }

  function drawHeader(ctx, o) {
    const L = 90, R = PAGE_W - 90;
    ctx.fillStyle = '#111'; ctx.textBaseline = 'alphabetic';
    let tx = L;
    if (o.logo) {
      const lh = 78, lw = o.logo.width * (lh / o.logo.height);
      ctx.save();
      ctx.drawImage(o.logo, L, 120 - lh + 14, lw, lh);
      ctx.restore();
      tx = L + lw + 16;
    }
    ctx.font = `900 46px ${FONT}`; ctx.fillStyle = '#111'; ctx.fillText('KASTLE MATH', tx, 120);
    ctx.fillStyle = '#111'; ctx.font = `900 64px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(o.kind, PAGE_W / 2, 215);
    ctx.textAlign = 'left';
    ctx.font = `400 28px ${FONT}`; ctx.fillStyle = '#555';
    ctx.textAlign = 'center'; ctx.fillText(o.title, PAGE_W / 2, 262); ctx.textAlign = 'left';
    // 이름 칸
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
    ctx.strokeRect(L, 290, 330, 70); ctx.strokeRect(L + 330, 290, 470, 70);
    ctx.font = `700 26px ${FONT}`; ctx.fillStyle = '#111'; ctx.fillText('이름', L + 120, 336);
    ctx.font = `500 30px ${FONT}`; ctx.fillText(o.studentName || '', L + 360, 336);
    ctx.strokeRect(R - 520, 290, 200, 70); ctx.strokeRect(R - 320, 290, 320, 70);
    ctx.font = `700 26px ${FONT}`; ctx.fillText('날짜', R - 470, 336);
    ctx.font = `500 26px ${FONT}`; ctx.fillText(o.dateText || '', R - 300, 336);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L, 392); ctx.lineTo(R, 392); ctx.stroke();
  }
  function drawFooter(ctx, text) {
    ctx.fillStyle = '#888'; ctx.font = `400 22px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(text, PAGE_W / 2, PAGE_H - 50); ctx.textAlign = 'left';
  }

  /**
   * opts: { paperBuf: ArrayBuffer(재시험지 PDF), ansBuf?: ArrayBuffer(빠른정답 PDF), nums: [틀린 번호], title, studentName, dateText }
   * 돌려주는 값: { blob, pageCount, found: [번호], missing: [번호], answersFound: [번호], previews: [canvas] }
   */
  async function build(opts) {
    const nums = Array.from(new Set((opts.nums || []).map(Number))).filter(n => n > 0).sort((a, b) => a - b);
    if (!nums.length) throw new Error('틀린 번호가 없어요.');
    await ensureFont();
    const logo = await loadLogo();
    const paper = await openPdf(opts.paperBuf);
    const spots = await scanProblems(paper);
    const crop = makeCropper(paper);
    const found = nums.filter(n => spots[n]), missing = nums.filter(n => !spots[n]);
    if (!found.length) throw new Error('재시험지에서 해당 번호의 문제를 찾지 못했어요. 재시험지 PDF가 맞는지 확인해주세요.');
    const crops = [];
    for (const n of found) crops.push({ n, img: await crop(spots[n]) });

    // 문제 쪽: 한 쪽에 4문제, 왼쪽 열 위→아래, 오른쪽 열 위→아래 순서 (시험지와 같은 배치)
    const pages = [];
    const L = 90, R = PAGE_W - 90, TOP = 420, BOT = PAGE_H - 110, GAP = 34;
    const colW = (R - L - 2 * GAP) / 2, cellH = (BOT - TOP - GAP) / 2;
    const totalProblemPages = Math.ceil(crops.length / 4);
    const metaTitle = opts.title || '';
    for (let pi = 0; pi < totalProblemPages; pi++) {
      const { cv, ctx } = newPage();
      drawHeader(ctx, { kind: '재시험', title: metaTitle, studentName: opts.studentName, dateText: opts.dateText, logo });
      ctx.strokeStyle = '#999'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAGE_W / 2, TOP - 10); ctx.lineTo(PAGE_W / 2, BOT); ctx.stroke();
      crops.slice(pi * 4, pi * 4 + 4).forEach((c, k) => {
        const col = k < 2 ? 0 : 1, row = k % 2;
        const x = col === 0 ? L : PAGE_W / 2 + GAP / 2, y = TOP + row * (cellH + GAP);
        fitImage(ctx, c.img, x, y, colW, cellH, 1.5);
      });
      drawFooter(ctx, `재시험 ${opts.studentName || ''} · ${pi + 1}/${totalProblemPages + (opts.ansBuf ? 1 : 0)}`);
      pages.push(cv);
    }

    // 빠른정답 쪽: 같은 번호의 정답 칸만 모아 붙임
    let answersFound = [];
    if (opts.ansBuf) {
      try {
        const ans = await openPdf(opts.ansBuf);
        const aspots = await scanAnswers(ans);
        const acrop = makeCropper(ans);
        const acs = [];
        for (const n of found) if (aspots[n]) acs.push({ n, img: await acrop(aspots[n]) });
        answersFound = acs.map(a => a.n);
        if (acs.length) {
          const { cv, ctx } = newPage();
          drawHeader(ctx, { kind: '빠른 정답', title: metaTitle, studentName: opts.studentName, dateText: opts.dateText, logo });
          const cols = 3, cw = (R - L - (cols - 1) * 30) / cols, rowH = 150;
          acs.forEach((a, i) => {
            const c = i % cols, r = Math.floor(i / cols);
            const x = L + c * (cw + 30), y = TOP + 10 + r * rowH;
            if (y + rowH > BOT) return;
            ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2; ctx.strokeRect(x - 8, y - 8, cw + 16, rowH - 14);
            fitImage(ctx, a.img, x, y, cw, rowH - 30, 2.2);
          });
          drawFooter(ctx, `빠른 정답 ${opts.studentName || ''} · ${pages.length + 1}/${totalProblemPages + 1}`);
          pages.push(cv);
        }
      } catch (e) { console.warn('빠른정답을 붙이지 못했어요', e); }
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    pages.forEach((cv, i) => { if (i) pdf.addPage(); pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297); });
    return { blob: pdf.output('blob'), pageCount: pages.length, found, missing, answersFound, previews: pages };
  }

  // 올려 둔 재시험지에서 찾을 수 있는 문제 번호 목록(검사용)
  async function listProblemNumbers(paperBuf) {
    const pdf = await openPdf(paperBuf);
    return Object.keys(await scanProblems(pdf)).map(Number).sort((a, b) => a - b);
  }

  window.RETEST = { build, listProblemNumbers, loadPdfJs };
})();
