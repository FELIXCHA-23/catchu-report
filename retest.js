/* 재시험지 자동 생성 — 회차에 미리 올려 둔 "재시험지 PDF"에서, 학생이 틀린 번호의 문제만 잘라 모아
   그 학생 전용 재시험지(PDF)를 만든다. 문제는 한 장에 4문제씩 2단(시험지 모양)으로 배치하고,
   재시험지 PDF 맨 뒤의 빠른정답 쪽(또는 예전 방식으로 따로 올린 빠른정답 PDF)에서 같은 번호의 정답만 잘라 끝에 붙인다.
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
  // 한 쪽은 2단(왼쪽 열 / 오른쪽 열)이고, 문제는 번호표 위치부터 같은 열의 다음 문제 직전까지임.
  // 문제 위에는 "| 유형명 | 정답률 64%" 와 "[유사] 출처" 두 줄(머리글)이 붙어 있는데, 재시험지에는 필요 없으므로
  //  - 위쪽: 이 문제의 머리글 바로 아래부터 자르고
  //  - 아래쪽: 다음 문제의 머리글이 시작하는 곳 직전에서 끊음 (다음 문제의 유형명이 딸려 들어오지 않게)
  // 번호표(01 같은 큰 숫자)는 나중에 1번부터 다시 그리도록 위치를 같이 기록함.
  async function scanProblems(pdf) {
    const found = {};
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      if (tc.items.some(it => it.str.trim() === '해설')) continue;
      const half = vp.width / 2;
      const colOf = x => (x < half ? 0 : 1);
      // 모든 글자 조각의 위치 (위에서부터 y, 글자 크기, 아랫선)
      const items = tc.items.filter(it => it.str && it.str.trim()).map(it => {
        const size = Math.hypot(it.transform[0], it.transform[1]);
        const base = vp.height - it.transform[5];
        return { str: it.str.trim(), x: it.transform[4], w: it.width || 0, size, base, top: base - size * 0.8 };
      });
      const marks = [];
      // 번호표 자리: 왼쪽 열은 왼쪽 가장자리, 오른쪽 열은 가운데선 바로 오른쪽 (제목·머리말에 들어 있는 큰 숫자를 번호로 잘못 읽지 않게)
      const nearColLeft = x => (x >= 14 && x <= 70) || (x >= half + 2 && x <= half + 50);
      items.forEach(it => {
        if (!/^(0\d|[1-9]\d)$/.test(it.str) || it.size < 15 || !nearColLeft(it.x)) return;      // 큰 번호표만 (쪽 번호·본문 숫자는 작음)
        marks.push({ num: parseInt(it.str, 10), x: it.x, w: it.w, size: it.size, base: it.base, y: it.top });
      });
      // 각 문제의 머리글: 번호표 위쪽 가까이에서 "|" 로 시작하는 줄부터 번호표 위까지
      marks.forEach(m => {
        const pipes = items.filter(it => it.str.startsWith('|') && Math.abs(it.x - m.x) < 14 && it.top < m.y - 4 && m.y - it.top < 70);
        if (!pipes.length) { m.headTop = null; m.headBottom = null; return; }
        m.headTop = Math.min(...pipes.map(it => it.top)) - 2;
        const lines = items.filter(it => it.top >= m.headTop + 1 && it.top < m.y - 1 && it.x >= (colOf(m.x) === 0 ? 0 : half) && it.x < (colOf(m.x) === 0 ? half : vp.width));
        m.headBottom = Math.max(...lines.map(it => it.base)) + 3;
      });
      marks.forEach(m => {
        const col = colOf(m.x);
        const same = marks.filter(o => colOf(o.x) === col && o.y > m.y + 10).sort((a, b) => a.y - b.y);
        const next = same[0];
        const bottom = next ? (next.headTop != null ? next.headTop - 2 : next.y - 6) : vp.height - FOOTER_PT;
        if (found[m.num]) return;                               // 같은 번호가 또 나오면 처음 것만
        const top = Math.max(0, m.headBottom != null ? Math.max(m.headBottom, m.y - 6) : m.y - 6);
        found[m.num] = {
          page: p, top, bottom,
          left: col === 0 ? 24 : half + 4, right: col === 0 ? half - 4 : vp.width - 24,
          mark: { left: m.x - 1.5, right: m.x + m.w + 2, top: m.y - 1, bottom: m.base + 2, base: m.base, size: m.size },
          align: true,   // 번호 높이를 맞춰 붙이기 위해 위·옆 여백을 자르지 않음
          headTop: m.headTop,
        };
      });
    }
    return found;
  }

  // 빠른정답: 번호표(두 자리 숫자)가 표 모양으로 늘어서 있음. 각 번호의 칸 = 번호 오른쪽 ~ 다음 열 번호 앞, 위아래는 이웃 행과의 가운데까지.
  async function scanAnswers(pdf, pageNo) {
    pageNo = pageNo || 1;
    const found = {};
    const page = await pdf.getPage(pageNo);
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
      marks.push({ num: parseInt(s, 10), x: it.transform[4], y: top + size / 2, w: it.width || size * 1.2, size, base: vp.height - it.transform[5] });
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
        found[m.num] = { page: pageNo, top: r.y - up, bottom: r.y + down, left: m.x - 4, right: ci + 1 < arr.length ? arr[ci + 1].x - 6 : m.x + colGap - 6,
          mark: { left: m.x - 1, right: m.x + m.w + 1.5, top: m.base - m.size * 0.85, bottom: m.base + m.size * 0.25, base: m.base, size: m.size } };
      });
    });
    return found;
  }

  // 해설 쪽에서 정답만 따오기: 재시험지 끝에 빠른정답 표가 없고 "정답 ⑤ + 해설"만 붙어 있을 때,
  // 각 문제의 첫 줄(번호표 + "정답 ⑤")만 잘라서 빠른정답으로 씀
  async function scanExplanations(pdf) {
    const found = {};
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      if (!tc.items.some(it => it.str.trim() === '해설')) continue;
      const half = vp.width / 2;
      const items = tc.items.filter(it => it.str && it.str.trim()).map(it => {
        const size = Math.hypot(it.transform[0], it.transform[1]);
        const base = vp.height - it.transform[5];
        return { str: it.str.trim(), x: it.transform[4], w: it.width || 0, size, base, top: base - size * 0.8 };
      });
      items.filter(it => /^(0\d|[1-9]\d)$/.test(it.str) && it.size >= 15 && ((it.x >= 14 && it.x <= 70) || (it.x >= half + 2 && it.x <= half + 50))).forEach(m => {
        const num = parseInt(m.str, 10);
        if (found[num]) return;
        const col = m.x < half ? 0 : 1;
        // 번호표와 같은 줄(번호표보다 작은 글자)
        const row = items.filter(it => it !== m && it.x > m.x + m.w - 1 && (col === 1 || it.x < half) && it.top < m.base - 1 && it.base > m.top + 2 && it.size < m.size);
        if (!row.some(it => /정답/.test(it.str))) return;
        // 보기 번호(①~⑤)는 글자가 아니라 그림이라서 글자 위치로는 안 잡힘 — "정답" 글자 끝에서 오른쪽으로 넉넉히 잡음
        const right = Math.max(...row.map(it => it.x + it.w)) + 90;
        found[num] = {
          // 아래 가로줄은 빼고 번호줄까지만 자름
          page: p, top: Math.max(0, m.top - 3), bottom: m.base + 1,
          left: m.x - 4, right: Math.min(right, col === 0 ? half - 4 : vp.width - 24),
          mark: { left: m.x - 1.5, right: m.x + m.w + 2, top: m.top - 1, bottom: m.base + 2, base: m.base, size: m.size },
        };
      });
    }
    return found;
  }

  // 재시험지 PDF 맨 뒤에 빠른정답 표가 붙어 있음 — 뒤쪽 쪽부터 거슬러 올라가며 "정답"이라는 글자가 있고
  // 번호표가 여러 개 늘어선 쪽을 찾음 (못 찾으면 null)
  async function findAnswerPage(pdf) {
    for (let p = pdf.numPages; p >= 1 && p > pdf.numPages - 4; p--) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      if (!tc.items.some(it => /정답/.test(it.str))) continue;
      if (tc.items.some(it => it.str.trim() === '해설')) continue;   // 해설 쪽은 빠른정답 표가 아님
      const spots = await scanAnswers(pdf, p);
      if (Object.keys(spots).length >= 5) return { page: p, spots };
    }
    return null;
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

  // 아래쪽의 흰 여백만 줄임 (위·옆은 그대로 둠)
  function trimBottom(cv, pad) {
    const ctx = cv.getContext('2d');
    const { width: w, height: h } = cv;
    const d = ctx.getImageData(0, 0, w, h).data;
    let y1 = -1;
    for (let y = h - 1; y >= 0 && y1 < 0; y--) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] > 10 && (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235)) { y1 = y; break; }
      }
    }
    if (y1 < 0) return cv;
    const nh = Math.min(h, y1 + 1 + pad);
    const out = document.createElement('canvas');
    out.width = w; out.height = nh;
    const octx = out.getContext('2d');
    octx.fillStyle = '#fff'; octx.fillRect(0, 0, w, nh);
    octx.drawImage(cv, 0, 0, w, nh, 0, 0, w, nh);
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
      if (!(w > 0 && h > 0)) console.warn('crop 영역이 이상해요', JSON.stringify({ spec: { ...spec, mark: undefined }, x, y, w, h, sw: src.width, sh: src.height }));
      const out = document.createElement('canvas');
      out.width = Math.max(1, w); out.height = Math.max(1, h);
      const octx = out.getContext('2d');
      octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(src, x, y, w, h, 0, 0, w, h);
      if (spec.mark && spec.label) {
        // 원래 번호표(03 같은 숫자)를 지우고, 같은 자리·같은 색으로 재시험지 번호(1, 2, 3…)를 다시 씀
        const mk = spec.mark;
        const mx = Math.floor(mk.left * S), my = Math.floor(mk.top * S), mw = Math.ceil((mk.right - mk.left) * S), mh = Math.ceil((mk.bottom - mk.top) * S);
        let best = null, bestC = 40;
        try {
          const d = src.getContext('2d').getImageData(Math.max(0, mx), Math.max(0, my), Math.max(1, mw), Math.max(1, mh)).data;
          for (let k = 0; k < d.length; k += 4) { const c = Math.max(d[k], d[k + 1], d[k + 2]) - Math.min(d[k], d[k + 1], d[k + 2]); if (c > bestC) { bestC = c; best = [d[k], d[k + 1], d[k + 2]]; } }
        } catch (e) { /* 색을 못 읽으면 검정 */ }
        const ox = mx - x, oy = my - y;
        octx.fillStyle = '#fff'; octx.fillRect(ox - 2, oy - 2, mw + 6, mh + 4);
        octx.fillStyle = best ? `rgb(${best[0]},${best[1]},${best[2]})` : '#111';
        octx.font = `900 ${Math.round(mk.size * S * 0.98)}px ${FONT}`;
        octx.textBaseline = 'alphabetic'; octx.textAlign = 'left';
        octx.fillText(spec.label, ox, Math.round(mk.base * S) - y);
      }
      if (spec.align) {
        // 문제 칸: 아래 빈 곳만 줄이고, 번호 윗선이 칸 위에서 몇 px 떨어져 있는지 기록 (붙일 때 번호 높이를 똑같이 맞추는 데 씀)
        const o = trimBottom(out, 10);
        o.markTopPx = spec.mark ? Math.max(0, spec.mark.top * S - y) : 0;
        return o;
      }
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

  // 재시험지 PDF 하나에서 틀린 번호의 문제(와 정답)를 잘라 옴. startNo: 앞에서 이미 쓴 문항 수 — 번호를 이어서 1, 2, 3… 으로 다시 씀
  async function collectSource(src, startNo) {
    const nums = Array.from(new Set((src.nums || []).map(Number))).filter(n => n > 0).sort((a, b) => a - b);
    const paper = await openPdf(src.paperBuf);
    const spots = await scanProblems(paper);
    const crop = makeCropper(paper);
    const found = nums.filter(n => spots[n]), missing = nums.filter(n => !spots[n]);
    const crops = [];
    for (let k = 0; k < found.length; k++) crops.push({ n: found[k], img: await crop({ ...spots[found[k]], label: String(startNo + k + 1) }) });

    // 빠른정답: 따로 올린 빠른정답 PDF(예전 방식)가 있으면 그것을, 없으면 재시험지 PDF 맨 뒤의 정답 쪽에서 같은 번호의 정답 칸만 잘라 둠
    const acs = [];
    try {
      const ans = src.ansBuf ? await openPdf(src.ansBuf) : paper;
      let aspots;
      if (src.ansBuf) aspots = await scanAnswers(ans, 1);
      else {
        const f = await findAnswerPage(ans);
        aspots = f ? f.spots : {};
        if (!Object.keys(aspots).length) aspots = await scanExplanations(paper);   // 빠른정답 표가 없으면 해설 쪽의 "정답"에서 따옴
      }
      const acrop = makeCropper(ans);
      for (let k = 0; k < found.length; k++) { const n = found[k]; if (aspots[n]) acs.push({ n, img: await acrop({ ...aspots[n], label: String(startNo + k + 1) }) }); }
    } catch (e) { console.warn('빠른정답을 붙이지 못했어요', e && (e.stack || e.message || String(e)), e && e.name); }
    return { crops, acs, found, missing };
  }

  /**
   * 한 회차: opts = { paperBuf: ArrayBuffer(재시험지 PDF), ansBuf?: ArrayBuffer(빠른정답 PDF), nums: [틀린 번호], title, studentName, dateText }
   * 여러 회차를 한 장으로 모을 때(오답 모음): opts.sources = [{ paperBuf, ansBuf?, nums, label }] 를 순서대로 이어 붙임 (opts.onProgress(i, total) 가능)
   * 돌려주는 값: { blob, pageCount, problemPages, answerPages, found: [번호], missing: [번호 또는 "라벨 번호"], answersFound: [번호], previews: [canvas] }
   */
  async function build(opts) {
    const sources = opts.sources && opts.sources.length ? opts.sources : [{ paperBuf: opts.paperBuf, ansBuf: opts.ansBuf, nums: opts.nums }];
    if (!sources.some(s => (s.nums || []).length)) throw new Error('틀린 번호가 없어요.');
    await ensureFont();
    const logo = await loadLogo();
    const crops = [], acs = [], found = [], missing = [];
    for (let si = 0; si < sources.length; si++) {
      const src = sources[si];
      if (!(src.nums || []).length) continue;
      if (opts.onProgress) opts.onProgress(si, sources.length);
      let r;
      try { r = await collectSource(src, crops.length); }
      catch (e) { if (sources.length === 1) throw e; missing.push(...(src.nums || []).map(n => `${src.label || ''} ${n}번`.trim())); continue; }
      crops.push(...r.crops); acs.push(...r.acs); found.push(...r.found);
      missing.push(...r.missing.map(n => (src.label ? `${src.label} ${n}번` : n)));
    }
    if (!crops.length) throw new Error('재시험지에서 해당 번호의 문제를 찾지 못했어요. 재시험지 PDF가 맞는지 확인해주세요.');
    const answersFound = acs.map(a => a.n);

    // 문제 쪽: 한 쪽에 4문제, 왼쪽 열 위→아래, 오른쪽 열 위→아래 순서 (시험지와 같은 배치)
    // 첫 쪽에만 머릿말(로고·제목·이름·날짜)을 두고, 2쪽부터는 머릿말을 빼고 그만큼 위로 당겨서 문제를 배치함
    const pages = [];
    const L = 90, R = PAGE_W - 90, TOP = 420, TOP_NEXT = 150, BOT = PAGE_H - 110, GAP = 34;
    const colW = (R - L - 2 * GAP) / 2;
    const totalProblemPages = Math.ceil(crops.length / 4);
    const hasAns = acs.length > 0;
    const blankPages = 0;   // 정답은 문제 쪽 바로 뒤에 붙임
    const totalPages = totalProblemPages + blankPages + (hasAns ? 1 : 0);
    const metaTitle = opts.title || '';
    // 모든 문제를 같은 배율로 붙여서 글자·번호 크기가 문제마다 달라지지 않게 함 (칸보다 긴 문제만 그 칸에 맞게 줄임)
    const baseScale = Math.min(1.6, ...crops.map(c => colW / c.img.width));
    for (let pi = 0; pi < totalProblemPages; pi++) {
      const { cv, ctx } = newPage();
      const top = pi === 0 ? TOP : TOP_NEXT;
      const cellH = (BOT - top - GAP) / 2;
      if (pi === 0) drawHeader(ctx, { kind: '캐치유 재시험', title: metaTitle, studentName: opts.studentName, dateText: opts.dateText, logo });
      ctx.strokeStyle = '#999'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAGE_W / 2, top - 10); ctx.lineTo(PAGE_W / 2, BOT); ctx.stroke();
      crops.slice(pi * 4, pi * 4 + 4).forEach((c, k) => {
        const col = k < 2 ? 0 : 1, row = k % 2;
        const x = col === 0 ? L : PAGE_W / 2 + GAP / 2;
        const sc = Math.min(baseScale, (cellH + (c.img.markTopPx || 0) * baseScale) / c.img.height);
        const y = top + row * (cellH + GAP) - (c.img.markTopPx || 0) * sc;   // 번호 윗선이 칸 맨 위에 오도록
        ctx.drawImage(c.img, x, y, c.img.width * sc, c.img.height * sc);
      });
      drawFooter(ctx, `재시험 ${opts.studentName || ''} · ${pi + 1}/${totalPages}`);
      pages.push(cv);
    }
    if (blankPages) pages.push(newPage().cv);   // 양면 인쇄용 빈 쪽 (아무것도 그리지 않음)

    // 빠른정답 쪽: 같은 번호의 정답 칸만 모아 붙임 (정답은 따로 한 장으로 나가므로 머릿말을 둠)
    if (hasAns) {
      const { cv, ctx } = newPage();
      drawHeader(ctx, { kind: '캐치유 재시험 · 빠른 정답', title: metaTitle, studentName: opts.studentName, dateText: opts.dateText, logo });
      // 빠른정답은 작게, 번호 순서가 위→아래로 이어지는 세로 정렬(왼쪽 열을 먼저 채우고 다음 열로)
      const N = acs.length, cols = N > 12 ? 4 : 3, rows = Math.ceil(N / cols);
      const gapX = 26, cw = (R - L - (cols - 1) * gapX) / cols, rowH = 92;
      acs.forEach((a, i) => {
        const c = Math.floor(i / rows), r = i % rows;
        const x = L + c * (cw + gapX), y = TOP + 10 + r * rowH;
        if (y + rowH > BOT) return;
        ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2; ctx.strokeRect(x - 8, y - 8, cw + 16, rowH - 14);
        fitImage(ctx, a.img, x, y + 2, cw, rowH - 34, 1.0);
      });
      drawFooter(ctx, `빠른 정답 ${opts.studentName || ''} · ${pages.length + 1}/${totalPages}`);
      pages.push(cv);
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    pages.forEach((cv, i) => { if (i) pdf.addPage(); pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297); });
    return { blob: pdf.output('blob'), pageCount: pages.length, problemPages: totalProblemPages, answerPages: hasAns ? 1 : 0, found, missing, answersFound, previews: pages };
  }

  // 재시험지(또는 본시험지) PDF에서 "어떤 시험인지" 알 수 있는 정보를 읽음: 제목 · 범위(부제) · 문항 번호별 유형명.
  // 문제마다 번호표 위에 "| 유형명 | 정답률 64%" 줄이 있으므로, 그 유형명을 번호대로 모아 둠 (본시험지의 문항별 유형과 맞춰 볼 때 씀)
  async function describePaper(paperBuf) {
    const pdf = await openPdf(paperBuf);
    const types = {};
    let title = '', range = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      if (tc.items.some(it => it.str.trim() === '해설')) continue;
      const half = vp.width / 2;
      const items = tc.items.filter(it => it.str && it.str.trim()).map(it => {
        const size = Math.hypot(it.transform[0], it.transform[1]);
        const base = vp.height - it.transform[5];
        return { str: it.str.trim(), x: it.transform[4], w: it.width || 0, size, base, top: base - size * 0.8 };
      });
      if (p === 1) {
        // 맨 위 두 줄: 제목(큰 글씨)과 범위(부제)
        const head = items.filter(it => it.top < 95).sort((a, b) => a.top - b.top || a.x - b.x);
        const lines = [];
        head.forEach(it => { const l = lines.find(l => Math.abs(l.top - it.top) < 4); if (l) l.items.push(it); else lines.push({ top: it.top, items: [it] }); });
        lines.sort((a, b) => a.top - b.top);
        const txt = l => l ? l.items.sort((a, b) => a.x - b.x).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim() : '';
        title = txt(lines[0]); range = txt(lines[1]);
      }
      const nearColLeft = x => (x >= 14 && x <= 70) || (x >= half + 2 && x <= half + 50);
      items.filter(it => /^(0\d|[1-9]\d)$/.test(it.str) && it.size >= 15 && nearColLeft(it.x)).forEach(m => {
        const num = parseInt(m.str, 10);
        if (types[num]) return;
        const pipes = items.filter(it => it.str.startsWith('|') && Math.abs(it.x - m.x) < 14 && it.top < m.top - 4 && m.top - it.top < 70);
        if (!pipes.length) return;
        const first = pipes.sort((a, b) => a.top - b.top)[0];
        const line = items.filter(it => Math.abs(it.top - first.top) < 4 && it.x >= first.x - 1 && (m.x < half ? it.x < half : true)).sort((a, b) => a.x - b.x).map(it => it.str).join(' ');
        const mm = /^\|\s*(.*?)\s*(?:\||정답률|$)/.exec(line);
        const name = (mm ? mm[1] : '').replace(/\s+/g, ' ').trim();
        if (name) types[num] = name;
      });
    }
    return { title, range, types };
  }

  // 시험지 PDF에서 한 문제를 그림으로 뽑음 (유형명 머리글 포함, 번호는 그대로) — 오답 순위에서 문항을 눌러 볼 때 씀. 못 찾으면 null
  async function renderProblem(paperBuf, num) {
    const pdf = await openPdf(paperBuf);
    const spots = await scanProblems(pdf);
    const sp = spots[num];
    if (!sp) return null;
    const crop = makeCropper(pdf);
    return crop({ ...sp, align: false, mark: undefined, label: undefined, top: sp.headTop != null ? Math.max(0, sp.headTop) : sp.top });
  }

  // 올려 둔 재시험지에서 찾을 수 있는 문제 번호 목록(검사용)
  async function listProblemNumbers(paperBuf) {
    const pdf = await openPdf(paperBuf);
    return Object.keys(await scanProblems(pdf)).map(Number).sort((a, b) => a - b);
  }

  window.RETEST = { build, listProblemNumbers, describePaper, renderProblem, loadPdfJs };
})();
