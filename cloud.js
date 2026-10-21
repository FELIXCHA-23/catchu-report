/* KMMS 서버 연동 (Supabase) — 로그인 · 선생님 승인 · 자동 동기화 · 시험지 PDF 비공개 저장
   앱은 예전처럼 state 객체와 saveState()를 그대로 쓰고, 이 파일이 바뀐 항목만 서버(records 표)에 올리고
   다른 선생님이 올린 변경을 받아온다. 항목 하나(학생 1명, 결과 1건…) 단위라서 동시에 써도 서로 안 덮어씀.
   서버에 지우는 것도 실제 삭제가 아니라 deleted 표시(복구 가능). */
(function () {
  'use strict';

  const SB_URL = 'https://fyutcmvzlardpanxibti.supabase.co';
  const SB_KEY = 'sb_publishable_GxTI8etlbaReB0pMqX8jsw_iE5_6VGU'; // 공개용 키 — 접근은 로그인 + 서버 규칙(RLS)이 막음
  const LS_SYNC = 'kmms_sync_v1';          // 이 컴퓨터가 서버와 맞춘 항목 지문(해시) 목록과 마지막으로 받은 시각
  const POLL_MS = 30000;
  const PUSH_DELAY_MS = 700;
  const BULK_DELETE_CONFIRM = 20;           // 한 번에 이 개수 이상 지우면 확인을 받음

  // 서버로 동기화하는 항목. 배열은 항목마다 id로, 객체는 키마다 한 줄로 저장함.
  const ARRAYS = [['students'], ['rounds'], ['results'], ['retests'], ['reportLog'], ['textbook', 'results'], ['examUploads']];
  const MAPS = [['teacherNotes'], ['gradeOverrides'], ['difficultyOverrides'], ['reportHidden'], ['studentDone'], ['studentMemo'], ['studentMemoRetest'],
    ['textbook', 'notes'], ['textbook', 'hidden'], ['textbook', 'ai']];

  let sb = null;
  let session = null;
  let staff = null;
  let synced = {};        // key -> hash (서버와 같다고 확인된 상태)
  let since = '';         // 서버에서 마지막으로 받은 변경 시각
  let pushTimer = null;
  let pushing = false;
  let pollTimer = null;
  let ready = false;      // 로그인 + 승인 + 첫 동기화 끝
  let statusText = '';
  let pendingChanges = false;

  /* ---------- 유틸 ---------- */

  function cyrb53(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  // 키 순서가 달라도 같은 내용이면 같은 문자열이 되게 함 (서버 jsonb가 키 순서를 바꿔 저장하므로)
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    }
    const j = JSON.stringify(v);
    return j === undefined ? 'null' : j;
  }
  function walk(path, create) {
    let o = state;
    for (const k of path) {
      if (o[k] == null) { if (!create) return undefined; o[k] = {}; }
      o = o[k];
    }
    return o;
  }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const KEY_SEP = '\u0001';
  const mkKey = (col, id) => col + KEY_SEP + id;
  const splitKey = key => { const i = key.indexOf(KEY_SEP); return [key.slice(0, i), key.slice(i + 1)]; };

  // 현재 state를 { 키: 저장할 값(JSON 문자열) } 로 펼침
  function flatten() {
    const out = {};
    ARRAYS.forEach(path => {
      const col = path.join('.');
      const arr = walk(path);
      if (!Array.isArray(arr)) return;
      arr.forEach(item => {
        if (!item || item.id == null) return;
        let data = item;
        if (col === 'rounds') { const { examFile, ...rest } = item; data = rest; } // 시험지 파일 내용은 이 컴퓨터 전용
        out[mkKey(col, String(item.id))] = canon(data);
      });
    });
    MAPS.forEach(path => {
      const col = path.join('.');
      const obj = walk(path);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
      Object.keys(obj).forEach(k => { if (obj[k] !== undefined) out[mkKey(col, k)] = canon({ v: obj[k] }); });
    });
    return out;
  }

  function hashes(flat) {
    const h = {};
    Object.keys(flat).forEach(k => { h[k] = cyrb53(flat[k]); });
    return h;
  }

  function loadSyncMeta() {
    try {
      const m = JSON.parse(localStorage.getItem(LS_SYNC) || 'null');
      if (m && m.uid === (session && session.user.id)) { synced = m.hashes || {}; since = m.since || ''; return true; }
    } catch (e) {}
    synced = {}; since = '';
    return false;
  }
  function saveSyncMeta() {
    try { localStorage.setItem(LS_SYNC, JSON.stringify({ uid: session.user.id, hashes: synced, since })); } catch (e) {}
  }

  function writeLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 저장공간 부족은 앱이 따로 알림 */ }
  }

  /* ---------- 상태 표시 ---------- */

  function setStatus(t) { statusText = t; renderChip(); }
  function renderChip() {
    let chip = document.getElementById('kmmsChip');
    if (!session || !staff || !staff.approved) { if (chip) chip.remove(); return; }
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'kmmsChip';
      document.body.appendChild(chip);
    }
    const who = staff.name || shownId(staff.email);
    chip.innerHTML = `<span class="kc-stat">☁ ${esc(statusText)}</span><span class="kc-who">${esc(who)}${staff.role === 'admin' ? ' (관리자)' : ''}</span>` +
      (staff.role === 'admin' ? '<button type="button" id="kmmsAdminBtn">계정 관리</button>' : '') +
      '<button type="button" id="kmmsLogoutBtn">로그아웃</button>';
    chip.querySelector('#kmmsLogoutBtn').onclick = logout;
    const ab = chip.querySelector('#kmmsAdminBtn');
    if (ab) ab.onclick = openAdminPanel;
  }

  /* ---------- 서버로 올리기 ---------- */

  function schedulePush() {
    if (!ready) return;
    pendingChanges = true;
    setStatus('저장 중…');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, PUSH_DELAY_MS);
  }

  async function push() {
    if (!ready || pushing) { if (pushing) pushTimer = setTimeout(push, 500); return; }
    pushing = true;
    try {
      const flat = flatten();
      const cur = hashes(flat);
      const up = [], del = [];
      Object.keys(cur).forEach(k => { if (synced[k] !== cur[k]) up.push(k); });
      Object.keys(synced).forEach(k => { if (!(k in cur)) del.push(k); });

      if (del.length >= BULK_DELETE_CONFIRM) {
        const ok = confirm(`한 번에 ${del.length}개 항목이 지워졌어요. 이대로 서버에도 반영하면 모든 선생님 화면에서 사라져요.\n\n반영할까요? (취소하면 서버에 있는 데이터로 이 컴퓨터를 되돌려요)`);
        if (!ok) { pushing = false; await restoreFromServer(); return; }
      }

      const rows = [];
      up.forEach(k => { const [c, id] = splitKey(k); rows.push({ collection: c, id, data: JSON.parse(flat[k]), deleted: false }); });
      del.forEach(k => { const [c, id] = splitKey(k); rows.push({ collection: c, id, data: null, deleted: true }); });

      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await sb.from('records').upsert(chunk, { onConflict: 'collection,id' });
        if (error) throw error;
        chunk.forEach(r => {
          const k = mkKey(r.collection, r.id);
          if (r.deleted) delete synced[k]; else synced[k] = cur[k];
        });
      }
      saveSyncMeta();
      pendingChanges = false;
      setStatus('저장됨');
    } catch (e) {
      console.warn('push failed', e);
      setStatus('저장 실패 · 다시 시도 중');
      pushTimer = setTimeout(push, 8000);
    } finally {
      pushing = false;
    }
  }

  /* ---------- 서버에서 받기 ---------- */

  function applyRow(row, flatNow, serverWins) {
    const col = row.collection, id = row.id, key = mkKey(col, id);
    // 이 컴퓨터에서 아직 못 올린 수정이 있으면 그쪽이 곧 올라가서 덮어씀 — 받은 값으로 덮지 않음
    // (처음 연결해서 합칠 때만 serverWins: 같은 항목이 양쪽에 있으면 서버 것을 남김)
    const mine = flatNow[key] !== undefined ? cyrb53(flatNow[key]) : undefined;
    if (!serverWins && mine !== synced[key] && !(mine === undefined && synced[key] === undefined)) return false;

    const isArr = ARRAYS.some(p => p.join('.') === col);
    const isMap = MAPS.some(p => p.join('.') === col);
    if (!isArr && !isMap) return false;
    const path = col.split('.');
    const container = walk(path, true);

    if (isArr) {
      if (!Array.isArray(walk(path))) { const parent = walk(path.slice(0, -1), true); parent[path[path.length - 1]] = []; }
      const arr = walk(path);
      const idx = arr.findIndex(x => String(x.id) === id);
      if (row.deleted) {
        if (idx === -1) { delete synced[key]; return false; }
        arr.splice(idx, 1); delete synced[key]; return true;
      }
      const data = row.data;
      const h = cyrb53(canon(data));
      if (idx !== -1 && mine === h) { synced[key] = h; return false; } // 이미 같은 내용
      if (idx === -1) arr.push(data);
      else {
        const keep = col === 'rounds' ? { examFile: arr[idx].examFile } : {};
        arr[idx] = { ...data, ...keep };
      }
      synced[key] = h;
      return true;
    }
    // 객체형
    if (row.deleted) {
      if (!(id in container)) { delete synced[key]; return false; }
      delete container[id]; delete synced[key]; return true;
    }
    const h2 = cyrb53(canon(row.data));
    if (id in container && mine === h2) { synced[key] = h2; return false; }
    container[id] = row.data ? row.data.v : undefined;
    synced[key] = h2;
    return true;
  }

  async function pull(full, serverWins) {
    let changed = 0;
    let latest = since;
    let from = 0;
    const startFrom = full ? '' : since;
    const flatNow = flatten();
    for (;;) {
      let q = sb.from('records').select('collection,id,data,deleted,updated_at').order('updated_at', { ascending: true }).order('collection').order('id').range(from, from + 999);
      if (startFrom) {
        const d = new Date(new Date(startFrom).getTime() - 5000).toISOString(); // 5초 겹쳐서 받아 놓치는 변경이 없게 함
        q = q.gte('updated_at', d);
      }
      const { data, error } = await q;
      if (error) throw error;
      if (!data || !data.length) break;
      data.forEach(row => {
        if (applyRow(row, flatNow, serverWins)) changed++;
        if (row.updated_at > latest) latest = row.updated_at;
      });
      if (data.length < 1000) break;
      from += 1000;
    }
    since = latest;
    saveSyncMeta();
    if (changed) writeLocal();
    return changed;
  }

  async function restoreFromServer() {
    // 서버에 있는 상태로 이 컴퓨터를 되돌림 (지운 항목이 서버에서 되살아남)
    synced = {}; since = '';
    const flat = flatten();
    // 이 컴퓨터에만 있는 항목은 서버에 없을 것이므로 그대로 두고, 서버 것을 전부 덮어씀
    const changed = await pull(true);
    writeLocal();
    if (typeof renderAll === 'function') renderAll();
    toast(`서버 데이터로 되돌렸어요 (${changed}개 항목).`);
    saveSyncMeta();
    setStatus('저장됨');
  }

  let pollBusy = false;
  async function poll() {
    if (!ready || pollBusy || pushing) return;
    pollBusy = true;
    try {
      const n = await pull(false);
      if (n > 0) showUpdateBanner(n);
      if (!pendingChanges) setStatus('저장됨');
    } catch (e) {
      setStatus('오프라인 · 연결되면 자동 저장');
    } finally { pollBusy = false; }
  }

  function showUpdateBanner() {
    let b = document.getElementById('kmmsBanner');
    if (b) return;
    b = document.createElement('div');
    b.id = 'kmmsBanner';
    b.innerHTML = '다른 선생님이 바꾼 내용이 있어요. <button type="button">화면에 반영</button>';
    b.querySelector('button').onclick = () => { b.remove(); if (typeof renderAll === 'function') renderAll(); };
    document.body.appendChild(b);
  }

  /* ---------- 첫 연결(이 컴퓨터의 기존 데이터를 어떻게 할지) ---------- */

  function localHasData() {
    return Object.keys(flatten()).length > 0;
  }

  async function firstLink() {
    // 서버 데이터 전부 받기
    const { count } = await sb.from('records').select('collection', { count: 'exact', head: true });
    const serverEmpty = !count;
    const localFlat = flatten();
    const localKeys = Object.keys(localFlat);

    if (serverEmpty) {
      // 서버가 비어 있으면 이 컴퓨터의 데이터가 서버의 첫 데이터가 됨
      synced = {}; since = ''; saveSyncMeta();
      if (localKeys.length) { ready = true; await push(); ready = false; toast(`이 컴퓨터의 데이터 ${localKeys.length}개 항목을 서버에 올렸어요.`); }
      return;
    }
    // 서버에 이미 데이터가 있음 — 이 컴퓨터 데이터는 만일을 위해 백업 파일로 내려받고,
    // 서버 데이터와 이 컴퓨터 데이터를 합집합으로 합침: 서버에 없는 것은 서버에 올리고, 같은 항목이 겹치면 서버 것을 남김
    if (localKeys.length) {
      try {
        const name = `캐슬백업_서버연결전_${new Date().toISOString().slice(0, 10)}.json`;
        if (typeof downloadTextFile === 'function') downloadTextFile(JSON.stringify(state, null, 2), name);
      } catch (e) {}
    }
    synced = {}; since = '';
    await pull(true, true);
    const h = hashes(flatten());
    const toUpload = Object.keys(h).filter(k => synced[k] !== h[k]).length; // 서버에 없어서 올릴 것들(onSession 끝에서 올라감)
    writeLocal();
    saveSyncMeta();
    if (localKeys.length) toast(toUpload ? `이 컴퓨터에만 있던 데이터 ${toUpload}개 항목을 서버에 합쳐서 올려요. (백업 파일도 내려받았어요)` : '이 컴퓨터의 데이터는 이미 서버에 모두 있어요.');
  }

  /* ---------- 로그인 화면 ---------- */

  function injectStyle() {
    if (document.getElementById('kmmsStyle')) return;
    const s = document.createElement('style');
    s.id = 'kmmsStyle';
    s.textContent = `
#kmmsGate{position:fixed;inset:0;z-index:99999;background:#f4f2ee;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;font-family:'Noto Sans KR',sans-serif}
#kmmsGate .kg-box{background:#fff;border:1px solid #d9d4ca;border-radius:14px;padding:28px 26px;width:100%;max-width:380px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
#kmmsGate h1{font-size:19px;margin:0 0 4px;color:#222;letter-spacing:.3px}
#kmmsGate .kg-sub{color:#777;font-size:13px;margin:0 0 18px}
#kmmsGate label{display:block;font-size:12px;color:#555;margin:10px 0 4px}
#kmmsGate input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid #cfc9bd;border-radius:8px;font-size:14px}
#kmmsGate button.kg-main{width:100%;margin-top:16px;padding:11px;border:0;border-radius:8px;background:#222;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
#kmmsGate button.kg-link{background:none;border:0;color:#1f4e8c;font-size:13px;cursor:pointer;margin-top:12px;padding:0}
#kmmsGate .kg-msg{font-size:13px;margin-top:12px;color:#c8102e;white-space:pre-line}
#kmmsGate .kg-msg.ok{color:#1e7a3c}
#kmmsChip{position:fixed;right:10px;bottom:10px;z-index:9000;display:flex;gap:8px;align-items:center;background:rgba(255,255,255,.96);border:1px solid #d9d4ca;border-radius:20px;padding:5px 10px;font-size:12px;color:#444;box-shadow:0 2px 8px rgba(0,0,0,.1)}
#kmmsChip button{border:1px solid #cfc9bd;background:#fff;border-radius:12px;padding:2px 8px;font-size:12px;cursor:pointer}
#kmmsBanner{position:fixed;left:50%;transform:translateX(-50%);bottom:56px;z-index:9001;background:#222;color:#fff;border-radius:10px;padding:9px 14px;font-size:13px}
#kmmsBanner button{margin-left:8px;border:0;border-radius:6px;padding:3px 9px;cursor:pointer}
#kmmsAdmin{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:16px}
#kmmsAdmin .ka-box{background:#fff;border-radius:12px;padding:20px;width:100%;max-width:720px;max-height:86vh;overflow:auto}
#kmmsAdmin table{width:100%;border-collapse:collapse;font-size:13px}
#kmmsAdmin th,#kmmsAdmin td{border-bottom:1px solid #eee;padding:7px 6px;text-align:left}
#kmmsAdmin button{border:1px solid #cfc9bd;background:#fff;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;margin-right:4px}
`;
    document.head.appendChild(s);
  }

  function gate(html) {
    injectStyle();
    let g = document.getElementById('kmmsGate');
    if (!g) { g = document.createElement('div'); g.id = 'kmmsGate'; document.body.appendChild(g); }
    g.innerHTML = `<div class="kg-box">${html}</div>`;
    return g;
  }
  function closeGate() { const g = document.getElementById('kmmsGate'); if (g) g.remove(); }

  function showLogin(mode, msg, ok) {
    const signup = mode === 'signup';
    const g = gate(`
      <h1>KASTLEMATH MANAGEMENT SYSTEM</h1>
      <p class="kg-sub">${signup ? '선생님 계정 만들기 (원장 승인 후 사용 가능)' : '선생님 로그인'}</p>
      ${signup ? '<label>이름 (예: 차성빈)</label><input id="kgName" autocomplete="name">' : ''}
      <label>아이디</label><input id="kgEmail" type="text" autocomplete="username" autocapitalize="none" spellcheck="false">
      <label>비밀번호${signup ? ' (6자 이상)' : ''}</label><input id="kgPw" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}">
      <button type="button" class="kg-main" id="kgGo">${signup ? '계정 만들기' : '로그인'}</button>
      <div class="kg-msg ${ok ? 'ok' : ''}" id="kgMsg">${esc(msg || '')}</div>
      ${signup ? '<button type="button" class="kg-link" id="kgSwitch">로그인으로 돌아가기</button>' : '<p class="kg-sub" style="margin:14px 0 0">계정이 없으면 원장님께 요청하세요.</p>'}`);
    const go = async () => {
      const rawId = g.querySelector('#kgEmail').value.trim();
      const email = toLoginEmail(rawId);
      const pw = g.querySelector('#kgPw').value;
      const name = signup ? g.querySelector('#kgName').value.trim() : '';
      const m = g.querySelector('#kgMsg');
      m.className = 'kg-msg'; m.textContent = '';
      if (!rawId || !pw) { m.textContent = '아이디와 비밀번호를 입력해주세요.'; return; }
      if (!email) { m.textContent = '아이디는 영문·숫자로만 입력해주세요. (예: lucas)'; return; }
      if (signup && !name) { m.textContent = '이름을 입력해주세요.'; return; }
      g.querySelector('#kgGo').disabled = true;
      try {
        if (signup) {
          const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { name } } });
          if (error) throw error;
          if (!data.session) { showLogin('login', '가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인하세요.\n그 다음 원장님이 승인하면 사용할 수 있어요.', true); return; }
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password: pw });
          if (error) throw error;
        }
      } catch (e) {
        m.textContent = friendlyAuthError(e);
        g.querySelector('#kgGo').disabled = false;
      }
    };
    g.querySelector('#kgGo').onclick = go;
    g.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
    const sw = g.querySelector('#kgSwitch');
    if (sw) sw.onclick = () => showLogin('login');
  }

  // 아이디만 입력하면 뒤에 내부용 주소를 붙여 로그인 계정(이메일 형식)으로 씀. 이메일을 그대로 입력해도 됨.
  const ID_DOMAIN = '@kastlemath.local';
  function toLoginEmail(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.includes('@')) return s;
    return /^[A-Za-z0-9._-]+$/.test(s) ? s.toLowerCase() + ID_DOMAIN : '';
  }
  const shownId = email => String(email || '').endsWith(ID_DOMAIN) ? email.slice(0, -ID_DOMAIN.length) : email;

  function friendlyAuthError(e) {
    const m = String((e && e.message) || e);
    if (/Invalid login credentials/i.test(m)) return '아이디 또는 비밀번호가 맞지 않아요.';
    if (/Email not confirmed/i.test(m)) return '가입 확인 메일의 링크를 먼저 눌러주세요.';
    if (/already registered/i.test(m)) return '이미 가입된 이메일이에요. 로그인해주세요.';
    if (/Password should be/i.test(m)) return '비밀번호는 6자 이상으로 해주세요.';
    if (/rate limit/i.test(m)) return '잠시 후 다시 시도해주세요. (요청이 너무 많아요)';
    return '문제가 생겼어요: ' + m;
  }

  function showWaiting() {
    const g = gate(`
      <h1>승인 대기 중</h1>
      <p class="kg-sub">${esc(staff.name || shownId(staff.email))} 계정은 아직 원장님 승인 전이에요.<br>승인되면 바로 사용할 수 있어요.</p>
      <button type="button" class="kg-main" id="kgRecheck">승인 여부 다시 확인</button>
      <button type="button" class="kg-link" id="kgOut">로그아웃</button>`);
    g.querySelector('#kgRecheck').onclick = () => onSession(session);
    g.querySelector('#kgOut').onclick = logout;
  }

  /* ---------- 세션 / 시작 ---------- */

  async function loadStaff() {
    const { data, error } = await sb.from('staff').select('*').eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function onSession(s) {
    session = s;
    ready = false;
    clearInterval(pollTimer);
    if (!session) { staff = null; renderChip(); showLogin('login'); return; }
    try {
      staff = await loadStaff();
      if (!staff) { // 가입 직후 반영 지연
        await new Promise(r => setTimeout(r, 800));
        staff = await loadStaff();
      }
    } catch (e) {
      gate(`<h1>연결 실패</h1><p class="kg-sub">서버에 연결하지 못했어요. 인터넷을 확인하고 새로고침해주세요.</p>`);
      return;
    }
    if (!staff || !staff.approved) { renderChip(); showWaiting(); return; }

    gate('<h1>데이터 불러오는 중…</h1><p class="kg-sub">잠시만 기다려주세요.</p>');
    try {
      const had = loadSyncMeta();
      if (!had) await firstLink(); else await pull(false);
      // 담당 선생님 기본값: 이름이 선생님 목록에 있으면 처음 한 번 자동 선택
      try {
        if (!getCurrentTeacher() && TEACHER_OPTIONS.includes(staff.name)) { setCurrentTeacher(staff.name); }
      } catch (e) {}
      ready = true;
      closeGate();
      setStatus('저장됨');
      if (typeof syncTeacherSelects === 'function') syncTeacherSelects();
      if (typeof renderAll === 'function') renderAll();
      pollTimer = setInterval(poll, POLL_MS);
      schedulePush(); // 시작 전에 생긴 로컬 변경(공용 시험지 반영 등) 올리기
    } catch (e) {
      console.error(e);
      gate(`<h1>불러오기 실패</h1><p class="kg-sub">${esc(e.message || e)}</p><button type="button" class="kg-main" onclick="location.reload()">새로고침</button>`);
    }
  }

  async function logout() {
    try {
      if (ready && pendingChanges) { clearTimeout(pushTimer); await push(); }
    } catch (e) {}
    ready = false;
    try { await sb.auth.signOut(); } catch (e) {}
    // 공용 컴퓨터에 학생 정보가 남지 않게 이 컴퓨터의 저장본 삭제
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LS_SYNC); } catch (e) {}
    location.reload();
  }

  /* ---------- 계정 관리(관리자) ---------- */

  async function openAdminPanel() {
    let wrap = document.getElementById('kmmsAdmin');
    if (wrap) wrap.remove();
    wrap = document.createElement('div');
    wrap.id = 'kmmsAdmin';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    const draw = async () => {
      const { data, error } = await sb.from('staff').select('*').order('created_at');
      if (error) { wrap.innerHTML = `<div class="ka-box">불러오지 못했어요: ${esc(error.message)}</div>`; return; }
      const rows = data.map(s => `
        <tr>
          <td>${esc(s.name || '(이름 없음)')}</td>
          <td>${esc(shownId(s.email))}</td>
          <td>${s.role === 'admin' ? '관리자' : '선생님'}</td>
          <td>${s.approved ? '승인됨' : '<b style="color:#c8102e">승인 대기</b>'}</td>
          <td>${s.user_id === session.user.id ? '(나)' : `
            <button data-a="${s.approved ? 'unapprove' : 'approve'}" data-id="${s.user_id}">${s.approved ? '승인 취소' : '승인'}</button>
            <button data-a="${s.role === 'admin' ? 'teacher' : 'admin'}" data-id="${s.user_id}">${s.role === 'admin' ? '관리자 해제' : '관리자로'}</button>
            <button data-a="rename" data-id="${s.user_id}" data-name="${esc(s.name)}">이름 수정</button>
            <button data-a="remove" data-id="${s.user_id}">삭제</button>`}</td>
        </tr>`).join('');
      wrap.innerHTML = `<div class="ka-box"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b style="font-size:16px">계정 관리</b><button id="kaClose">닫기</button></div>
        <table><thead><tr><th>이름</th><th>이메일</th><th>권한</th><th>상태</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        <p style="font-size:12px;color:#777;margin-top:10px">새로 가입한 선생님은 여기서 "승인"해야 데이터가 보여요.</p></div>`;
      wrap.querySelector('#kaClose').onclick = () => wrap.remove();
      wrap.querySelectorAll('button[data-a]').forEach(b => b.onclick = async () => {
        const id = b.dataset.id, a = b.dataset.a;
        let res;
        if (a === 'approve') res = await sb.from('staff').update({ approved: true }).eq('user_id', id);
        else if (a === 'unapprove') res = await sb.from('staff').update({ approved: false }).eq('user_id', id);
        else if (a === 'admin') res = await sb.from('staff').update({ role: 'admin' }).eq('user_id', id);
        else if (a === 'teacher') res = await sb.from('staff').update({ role: 'teacher' }).eq('user_id', id);
        else if (a === 'rename') { const nm = prompt('선생님 이름 (예: 문태민)', b.dataset.name || ''); if (nm == null) return; res = await sb.from('staff').update({ name: nm.trim() }).eq('user_id', id); }
        else if (a === 'remove') { if (!confirm('이 계정을 목록에서 삭제할까요? (로그인 계정 자체는 Supabase에서 따로 지워야 완전히 없어져요)')) return; res = await sb.from('staff').delete().eq('user_id', id); }
        if (res && res.error) { toast('실패: ' + res.error.message); return; }
        draw();
      });
    };
    draw();
  }

  /* ---------- 시험지 PDF (비공개 저장소) ---------- */

  // 사진(이미지)으로 올라온 시험지는 PDF 한 장으로 바꿔서 보관. PDF는 그대로.
  async function toPdfBlob(file) {
    if (/^data:image\//.test(file.dataUrl || '') && window.jspdf) {
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = file.dataUrl; });
        const scale = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale);
        const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        const w = 210, h = Math.round((210 * cv.height / cv.width) * 100) / 100;
        const pdf = new window.jspdf.jsPDF({ unit: 'mm', orientation: h >= w ? 'portrait' : 'landscape', format: [Math.min(w, h), Math.max(w, h)] });
        pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
        return { blob: pdf.output('blob'), ext: 'pdf' };
      } catch (e) { console.warn('image to pdf failed', e); }
    }
    const blob = await (await fetch(file.dataUrl)).blob();
    return { blob, ext: (file.name.match(/\.([A-Za-z0-9]+)$/) || [, 'bin'])[1].toLowerCase() };
  }

  // 분석을 요청하며 올린 시험지를 바로 보관함(requests/)에 저장하고 목록(examUploads)에 남김. 회차를 저장하면 그 회차에 연결됨.
  async function stageExam(file) {
    if (!ready || !file || !file.dataUrl) return null;
    try {
      const { blob, ext } = await toPdfBlob(file);
      const path = `requests/${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await sb.storage.from('exams').upload(path, blob, { contentType: blob.type || undefined, upsert: false });
      if (error) throw error;
      const rec = { id: 'eu_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: file.name, path, by: (staff && (staff.name || shownId(staff.email))) || '', at: Date.now(), roundId: '' };
      if (!Array.isArray(state.examUploads)) state.examUploads = [];
      state.examUploads.push(rec);
      saveState();
      renderUploads();
      return rec;
    } catch (e) {
      console.warn('stage failed', e);
      return null;
    }
  }
  function attachStaged(round, rec) {
    round.examPath = rec.path; round.examName = rec.name;
    const u = (state.examUploads || []).find(x => x.id === rec.id);
    if (u) u.roundId = round.id;
    saveState();
    if (typeof renderRounds === 'function') renderRounds();
  }

  async function uploadExam(round, file) {
    // file: { name, dataUrl } — 시험지 파일을 비공개 저장소에 올림 (사진은 PDF로 바꿔서)
    if (!ready || !round || !file || !file.dataUrl) return false;
    try {
      const { blob, ext } = await toPdfBlob(file);
      const path = `rounds/${round.id}/${Date.now()}.${ext}`;
      const { error } = await sb.storage.from('exams').upload(path, blob, { contentType: blob.type || undefined, upsert: false });
      if (error) throw error;
      const old = round.examPath;
      round.examPath = path;
      round.examName = file.name;
      if (old) sb.storage.from('exams').remove([old]).catch(() => {});
      saveState();
      toast('시험지를 서버에 안전하게 올렸어요.');
      if (typeof renderRounds === 'function') renderRounds();
      return true;
    } catch (e) {
      console.warn('exam upload failed', e);
      toast('시험지 서버 업로드 실패: ' + (e.message || e));
      return false;
    }
  }

  // 시험지 탭 안에서 바로 보여줌: 비공개 저장소에서 파일을 받아(로그인 권한으로) 화면에 띄움
  const examUrls = {};   // 경로 -> blob 주소 (같은 시험지는 다시 받지 않음)
  let viewingUrl = '';
  function viewExam(roundId) {
    const r = state.rounds.find(x => x.id === roundId);
    if (!r || !r.examPath) return;
    return viewPath(r.examPath, r.title || r.examName || '');
  }
  async function viewPath(path, title) {
    const card = document.getElementById('examViewerCard');
    if (!card || !path) return;
    const body = document.getElementById('examViewerBody');
    document.getElementById('examViewerTitle').textContent = '시험지 보기 · ' + title;
    card.style.display = '';
    body.innerHTML = '<div class="field-hint">시험지를 불러오는 중…</div>';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      let url = examUrls[path];
      if (!url) {
        const { data, error } = await sb.storage.from('exams').download(path);
        if (error) throw error;
        const isPdf = /\.pdf$/i.test(path);
        url = URL.createObjectURL(isPdf ? new Blob([data], { type: 'application/pdf' }) : data);
        examUrls[path] = url;
      }
      viewingUrl = url;
      body.innerHTML = /\.pdf$/i.test(path)
        ? `<iframe src="${url}" title="시험지" style="width:100%; height:80vh; border:1px solid var(--border); border-radius:2px;"></iframe>`
        : `<img src="${url}" alt="시험지" style="max-width:100%; border:1px solid var(--border);">`;
    } catch (e) {
      body.innerHTML = `<div class="field-hint">시험지를 열지 못했어요: ${esc(e.message || e)}</div>`;
    }
  }
  // 분석 요청으로 올라왔지만 아직 회차에 연결되지 않은 시험지 목록
  function renderUploads() {
    const card = document.getElementById('examUploadsCard');
    const list = document.getElementById('examUploadsList');
    if (!card || !list) return;
    const items = (state.examUploads || []).filter(u => !u.roundId).sort((a, b) => b.at - a.at);
    if (!items.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    list.innerHTML = items.map(u => {
      const d = new Date(u.at);
      const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return `<div class="inline-form" style="margin-bottom:6px;"><span>${esc(u.name)}</span><span class="field-hint">${esc(u.by || '')} · ${when}</span><a href="#" data-upload-open="${esc(u.id)}">시험지 보기</a></div>`;
    }).join('');
  }
  function closeExamViewer() {
    const card = document.getElementById('examViewerCard');
    if (card) card.style.display = 'none';
    const body = document.getElementById('examViewerBody');
    if (body) body.innerHTML = '';
    viewingUrl = '';
  }

  // 이미 만든 회차에 시험지(PDF·이미지)를 올리거나 교체
  const MAX_EXAM_UPLOAD = 20 * 1024 * 1024;
  function pickExamFile(roundId) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/pdf,image/*';
    input.onchange = () => {
      const f = input.files[0];
      if (!f) return;
      if (f.size > MAX_EXAM_UPLOAD) { toast(`파일이 너무 커요 (${(f.size / 1024 / 1024).toFixed(1)}MB). 20MB 이하로 올려주세요.`); return; }
      const fr = new FileReader();
      fr.onload = async () => {
        const r = state.rounds.find(x => x.id === roundId);
        if (!r) return;
        toast('시험지를 올리는 중…');
        if (await uploadExam(r, { name: f.name, dataUrl: fr.result })) viewExam(roundId);
      };
      fr.readAsDataURL(f);
    };
    input.click();
  }

  document.addEventListener('click', e => {
    const t = e.target.closest ? e.target : null;
    if (!t) return;
    const a = t.closest('[data-exam-open]');
    if (a) { e.preventDefault(); viewExam(a.dataset.examOpen); return; }
    const u = t.closest('[data-exam-upload]');
    if (u) { e.preventDefault(); pickExamFile(u.dataset.examUpload); return; }
    const up = t.closest('[data-upload-open]');
    if (up) {
      e.preventDefault();
      const rec = (state.examUploads || []).find(x => x.id === up.dataset.uploadOpen);
      if (rec) viewPath(rec.path, rec.name);
      return;
    }
    if (t.closest('#examViewerClose')) { closeExamViewer(); return; }
    if (t.closest('#examViewerNewTab')) { if (viewingUrl) window.open(viewingUrl, '_blank'); }
  });

  /* ---------- 시작 ---------- */

  function hookSave() {
    if (typeof saveState !== 'function' || saveState.__kmms) return;
    const orig = saveState;
    const wrapped = function () { orig.apply(this, arguments); schedulePush(); };
    wrapped.__kmms = true;
    saveState = wrapped; // eslint-disable-line no-global-assign
    if (typeof renderRounds === 'function') {
      const origRender = renderRounds;
      renderRounds = function () { origRender.apply(this, arguments); renderUploads(); }; // eslint-disable-line no-global-assign
    }
  }

  function start() {
    if (!window.supabase || !window.supabase.createClient) {
      injectStyle();
      gate('<h1>연결 실패</h1><p class="kg-sub">서버 연결 도구를 불러오지 못했어요. 인터넷을 확인하고 새로고침해주세요.</p>');
      return;
    }
    sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'kmms_auth' } });
    hookSave();
    injectStyle();
    gate('<h1>KASTLEMATH MANAGEMENT SYSTEM</h1><p class="kg-sub">확인 중…</p>');
    let first = true;
    sb.auth.onAuthStateChange((evt, s) => {
      if (evt === 'TOKEN_REFRESHED') { session = s; return; }
      if (evt === 'INITIAL_SESSION' || evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') {
        if (evt === 'SIGNED_IN' && !first && ready && session && s && s.user.id === session.user.id) return; // 탭 전환 시 중복 로그인 이벤트 무시
        first = false;
        setTimeout(() => onSession(s), 0);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { if (ready && pendingChanges) { clearTimeout(pushTimer); push(); } }
      else poll();
    });
    window.addEventListener('online', () => { if (ready) { push(); poll(); } });
    window.addEventListener('beforeunload', e => { if (ready && pendingChanges) { e.preventDefault(); e.returnValue = ''; } });
  }

  window.KMMS = { uploadExam, stageExam, attachStaged, viewExam, get ready() { return ready; }, get staff() { return staff; }, push, poll };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
