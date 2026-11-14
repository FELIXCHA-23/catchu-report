/* KMMS 저장소 — 큰 앱 데이터(학생·채점·회차 등)를 브라우저의 IndexedDB에 저장함.
   예전에는 localStorage(브라우저당 약 5MB)에 저장해서 데이터가 커지면 "저장공간이 가득 찼어요" 오류가 났음.
   IndexedDB는 컴퓨터 디스크 여유 공간의 상당 부분까지 쓸 수 있어서 이 한도가 사실상 사라짐.

   - 앱 코드는 예전처럼 동기식으로 읽고 씀: 페이지를 열 때 IndexedDB의 내용을 메모리에 한 번 다 읽어 두고(boot),
     KMMSStore.getItem/setItem/removeItem 은 메모리에서 바로 처리한 뒤 IndexedDB에는 뒤에서 차례로 기록함.
   - 그래서 앱 스크립트(app.js 등)는 이 읽기가 끝난 뒤에 불러옴 (index.html 맨 아래 KMMSStore.boot 참고).
   - 처음 한 번: localStorage에 있던 데이터를 IndexedDB로 옮기고, 옮긴 내용을 다시 읽어 똑같은지 확인한 뒤에만
     localStorage 원본을 지움. 옮기기에 실패하면 원본은 그대로 두고 이번에는 예전처럼 localStorage를 씀(다음에 다시 시도).
   - IndexedDB를 못 쓰는 브라우저(일부 사생활 보호 모드 등)에서도 예전처럼 localStorage로 동작함. */
(function () {
  'use strict';

  const DB_NAME = 'kmms';
  const DB_VERSION = 1;
  const OS = 'kv';
  // IndexedDB로 옮길(=더 이상 localStorage에 두지 않을) 키 — 크기가 큰 것들
  const MANAGED = ['catchu_v1', 'kmms_sync_v1'];
  const OPEN_TIMEOUT_MS = 8000;

  let db = null;
  let mode = 'local';          // 'idb' = IndexedDB 사용, 'local' = 예전처럼 localStorage 사용
  const cache = new Map();     // key -> 문자열 (IndexedDB 모드에서 메모리 사본)
  const pending = new Map();   // key -> 문자열 또는 null(삭제) — 아직 IndexedDB에 기록하지 않은 변경
  let writing = null;          // 진행 중인 기록 Promise
  let errorShown = false;
  const isManaged = k => MANAGED.indexOf(k) !== -1;

  function ls() { try { return window.localStorage; } catch (e) { return null; } }

  function reqP(req) {
    return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  }
  function txDone(tx) {
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error || new Error('IndexedDB 기록 실패'));
      tx.onabort = () => rej(tx.error || new Error('IndexedDB 기록 취소됨'));
    });
  }

  function openDb() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('IndexedDB 없음')); return; }
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; rej(new Error('IndexedDB 열기 시간 초과')); } }, OPEN_TIMEOUT_MS);
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { clearTimeout(timer); rej(e); return; }
      req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(OS)) d.createObjectStore(OS); };
      req.onsuccess = () => {
        const d = req.result;
        if (done) { try { d.close(); } catch (e) {} return; }
        done = true; clearTimeout(timer);
        d.onversionchange = () => { try { d.close(); } catch (e) {} };
        res(d);
      };
      req.onerror = () => { if (done) return; done = true; clearTimeout(timer); rej(req.error || new Error('IndexedDB 열기 실패')); };
      req.onblocked = () => { /* 다른 탭이 옛 버전을 열고 있음 — 시간 초과 처리에 맡김 */ };
    });
  }

  async function readAll() {
    const tx = db.transaction(OS, 'readonly');
    const store = tx.objectStore(OS);
    const [keys, vals] = await Promise.all([reqP(store.getAllKeys()), reqP(store.getAll())]);
    const out = new Map();
    keys.forEach((k, i) => out.set(String(k), vals[i]));
    return out;
  }

  // 처음 한 번: localStorage → IndexedDB. 기록 후 다시 읽어서 똑같을 때만 localStorage 원본을 지움.
  async function migrate(existing) {
    const L = ls();
    if (!L) return;
    const moving = {};
    MANAGED.forEach(k => {
      if (existing.has(k)) return;   // 이미 옮겨져 있음 — IndexedDB 쪽이 기준
      let v = null;
      try { v = L.getItem(k); } catch (e) {}
      if (v != null) moving[k] = v;
    });
    const keys = Object.keys(moving);
    if (!keys.length) return;
    const tx = db.transaction(OS, 'readwrite');
    const store = tx.objectStore(OS);
    keys.forEach(k => store.put(moving[k], k));
    await txDone(tx);
    const check = await readAll();
    const ok = keys.every(k => check.get(k) === moving[k]);
    if (!ok) throw new Error('옮긴 데이터 확인 실패');
    keys.forEach(k => { existing.set(k, moving[k]); try { L.removeItem(k); } catch (e) {} });
    console.info('[KMMS] 이 컴퓨터의 데이터를 IndexedDB로 옮겼어요:', keys.join(', '));
  }

  async function init() {
    try {
      db = await openDb();
      const all = await readAll();
      await migrate(all);
      all.forEach((v, k) => { if (typeof v === 'string') cache.set(k, v); });
      mode = 'idb';
      // 저장공간이 부족할 때 브라우저가 이 사이트 데이터를 함부로 지우지 않게 요청 (허락 창은 뜨지 않음)
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
    } catch (e) {
      console.warn('[KMMS] IndexedDB를 쓸 수 없어 이번에는 예전처럼 localStorage에 저장해요.', e);
      mode = 'local';
      cache.clear();
      if (db) { try { db.close(); } catch (e2) {} db = null; }
    }
  }

  function reportError(e) {
    console.error('[KMMS] 저장 실패', e);
    if (errorShown) return;
    errorShown = true;
    setTimeout(() => { errorShown = false; }, 10000);
    try { if (typeof api.onError === 'function') api.onError(e); } catch (e2) {}
  }

  // 쌓인 변경을 한 번에 IndexedDB에 기록 (기록 중에 새 변경이 오면 끝난 뒤 이어서 한 번 더)
  function flush() {
    if (mode !== 'idb') return Promise.resolve();
    if (writing) return writing;
    if (!pending.size) return Promise.resolve();
    writing = (async () => {
      while (pending.size) {
        const batch = new Map(pending);
        pending.clear();
        try {
          const tx = db.transaction(OS, 'readwrite');
          const store = tx.objectStore(OS);
          batch.forEach((v, k) => { if (v === null) store.delete(k); else store.put(v, k); });
          await txDone(tx);
        } catch (e) {
          // 실패한 변경은 (그 사이 더 새 변경이 없으면) 다시 기록 대기열에 넣고, 다음 저장 때 다시 시도
          batch.forEach((v, k) => { if (!pending.has(k)) pending.set(k, v); });
          reportError(e);
          break;
        }
      }
    })().finally(() => { writing = null; });
    return writing;
  }

  const api = {
    get mode() { return mode; },
    booting: false,
    onError: null,
    getItem(k) {
      if (mode === 'idb' && isManaged(k)) return cache.has(k) ? cache.get(k) : null;
      const L = ls(); return L ? L.getItem(k) : null;
    },
    // localStorage와 달리 IndexedDB 모드에서는 저장공간 부족으로 바로 예외가 나지 않음 (실패하면 onError로 알림)
    setItem(k, v) {
      v = String(v);
      if (mode === 'idb' && isManaged(k)) { cache.set(k, v); pending.set(k, v); flush(); return; }
      const L = ls(); if (L) L.setItem(k, v);
    },
    // 지우기 — localStorage에 남아 있을 수 있는 예전 사본도 같이 지움. 기록이 끝나면 풀리는 Promise를 돌려줌.
    removeItem(k) {
      try { const L = ls(); if (L) L.removeItem(k); } catch (e) {}
      if (mode === 'idb' && isManaged(k)) { cache.delete(k); pending.set(k, null); return flush(); }
      return Promise.resolve();
    },
    flush,
    // 저장소를 준비한 뒤 앱 스크립트를 순서대로 불러옴.
    // 앱 스크립트는 DOMContentLoaded 때 화면을 꾸미는데, 이 시점엔 그 이벤트가 이미 지나갔을 수 있으므로
    // 불러오는 동안 등록된 DOMContentLoaded 처리 함수를 모아 두었다가, 다 불러온 뒤 등록 순서대로 실행함.
    async boot(scripts) {
      api.booting = true;
      try { await init(); } catch (e) { console.error(e); }
      const queued = [];
      const origAdd = document.addEventListener;
      document.addEventListener = function (type, fn, opts) {
        if (type === 'DOMContentLoaded' && api.booting) { queued.push(fn); return; }
        return origAdd.call(this, type, fn, opts);
      };
      for (const src of scripts) {
        await new Promise(res => {
          const s = document.createElement('script');
          s.src = src;
          s.async = false;
          s.onload = res;
          s.onerror = () => { console.error('[KMMS] 스크립트를 불러오지 못함:', src); res(); };
          document.body.appendChild(s);
        });
      }
      if (document.readyState === 'loading') await new Promise(r => origAdd.call(document, 'DOMContentLoaded', r, { once: true }));
      document.addEventListener = origAdd;
      api.booting = false;
      const ev = new Event('DOMContentLoaded');
      queued.forEach(fn => {
        try {
          const r = typeof fn === 'function' ? fn.call(document, ev) : (fn && fn.handleEvent ? fn.handleEvent(ev) : null);
          if (r && typeof r.catch === 'function') r.catch(e => console.error(e));
        } catch (e) { setTimeout(() => { throw e; }); }
      });
    },
  };

  window.KMMSStore = api;
})();
