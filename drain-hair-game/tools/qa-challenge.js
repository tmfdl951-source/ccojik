/* ============================================================
   친구 도전장 — 점검
   ============================================================
   브라우저 없이 app.js 를 흉내 낸 DOM 위에서 돌린다.
     node tools/qa-challenge.js

   보는 것
     1 토큰 왕복 (만들고 되읽기)
     2 깨진 링크 — 오류 없이 메인으로
     3 닉네임 창 (확인 / 취소 / 빈 값)
     4 공유 문구와 링크
     5 여러 화면 크기에서 CTA 높이가 같은가
     6 도전 시작 -> 플레이 -> 대결 결과
     7 이김 / 짐 / 무승부
     8 그냥 들어오면 메인
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'style.css'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK  ' + m); }
                       else { fail++; console.log('  X   ' + m); } };

/* ---------- 아주 작은 DOM 흉내 ---------- */
function harness(hash) {
  const made = {};
  const listeners = new Map();
  /* index.html 에서 hidden 이 붙은 자리를 미리 읽어 둔다 — 안 그러면
     '안 뜬다' 를 검사할 수 없다 (흉내 DOM 은 전부 보이는 상태로 시작한다) */
  const HIDDEN = {};
  {
    const re = /<[^>]*id="([A-Za-z0-9_-]+)"[^>]*>/g;
    let m;
    while ((m = re.exec(html))) if (/\bhidden\b/.test(m[0])) HIDDEN[m[1]] = true;
  }
  const el = (id) => {
    const cls = new Set();
    const e = {
      id, hidden: !!HIDDEN[id], textContent: '', value: '', className: '',
      style: {}, children: [],
      classList: {
        add: c => cls.add(c), remove: c => cls.delete(c),
        contains: c => cls.has(c), toggle: (c, v) => (v ? cls.add(c) : cls.delete(c)),
      },
      _cls: cls,
      setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
      appendChild(k) { e.children.push(k); return k; },
      querySelector: () => el('x'), querySelectorAll: () => [],
      addEventListener(t, fn) {
        if (!listeners.has(e)) listeners.set(e, {});
        const m = listeners.get(e); (m[t] = m[t] || []).push(fn);
      },
      removeEventListener() {},
      getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
      toBlob: cb => cb(null), focus() {}, select() {}, blur() {}, click() {},
      getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
    };
    Object.defineProperty(e, 'innerHTML', {
      get: () => '', set: () => { e.children.length = 0; }, enumerable: true,
    });
    return e;
  };
  const docEl = el('html');
  const doc = {
    documentElement: docEl,
    getElementById: id => made[id] || (made[id] = el(id)),
    createElement: tag => el('new-' + tag),
    querySelectorAll: () => [],
    addEventListener() {},
    readyState: 'complete',
  };
  const store = {};
  const sandbox = {
    window: {
      addEventListener() {}, removeEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
      devicePixelRatio: 2, innerWidth: 390, innerHeight: 844,
      requestAnimationFrame: () => 0, cancelAnimationFrame() {},
      AudioContext: function () {
        return { state: 'running', currentTime: 0, resume() {},
          createOscillator: () => ({ type: '', frequency: { setValueAtTime() {} },
            connect() {}, start() {}, stop() {} }),
          createGain: () => ({ gain: { setValueAtTime() {},
            exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
            connect() {} }),
          createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
          createBufferSource: () => ({ buffer: null, connect() {}, start() {}, stop() {} }),
          destination: {} };
      },
      SiteAnalytics: { track(n) { sandbox.window.__ev.push(n); }, project: 'ccojik' },
      __ev: [],
    },
    document: doc,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0,
                 clipboard: { writeText: t => { sandbox.window.__copied = t;
                                                return Promise.resolve(); } } },
    location: { href: 'https://x/', hash: hash || '' },
    /* 그림은 바로 '다 왔다' 고 알린다 — 그래야 assetsReady 가 켜져서
       [도전 시작] 같은 단추가 실제로 눌린다 (브라우저와 같은 흐름) */
    Image: function () {
      const im = { addEventListener() {}, onload: null, onerror: null, width: 8, height: 8 };
      Object.defineProperty(im, 'src', {
        set() { if (im.onload) im.onload(); },
        get() { return ''; },
      });
      return im;
    },
    Audio: function () { return { play: () => Promise.resolve(), pause() {},
                                  addEventListener() {}, cloneNode() { return this; } }; },
    Blob: function () {}, File: function () {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    TextEncoder, TextDecoder,
    btoa: s2 => Buffer.from(s2, 'binary').toString('base64'),
    atob: s2 => Buffer.from(s2, 'base64').toString('binary'),
    fetch: () => Promise.resolve({ ok: true }),
    setTimeout: (fn) => { void fn; return 0; }, clearTimeout() {},
    setInterval: () => 0, clearInterval() {},
    performance: { now: () => 0 },
    console, Math, Date, JSON, Object, Array, String, Number, Boolean,
    RegExp, Error, Promise, isNaN, isFinite, parseFloat, parseInt,
    Float64Array, Uint8Array, Float32Array,
  };
  sandbox.window.document = doc;
  sandbox.addEventListener = function () {};
  sandbox.removeEventListener = function () {};
  sandbox.requestAnimationFrame = function () { return 0; };
  sandbox.cancelAnimationFrame = function () {};
  sandbox.innerWidth = 390;
  sandbox.innerHeight = 844;
  sandbox.devicePixelRatio = 2;
  sandbox.matchMedia = sandbox.window.matchMedia;
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.navigator = sandbox.navigator;
  sandbox.window.location = sandbox.location;
  const keys = Object.keys(sandbox);
  const errs = [];
  try { new Function(...keys, appSrc)(...keys.map(k => sandbox[k])); }
  catch (e) { errs.push(e.message + ' @ ' + String(e.stack || '').split('\n')[1]); }
  return {
    els: made, docEl, store, errs,
    get: id => doc.getElementById(id),
    win: sandbox.window,
    api: sandbox.window.__drain ? sandbox.window.__drain() : null,
    fire(id, type, ev) {
      const e = made[id];
      if (!e) return false;
      const m = listeners.get(e);
      if (!m || !m[type]) return false;
      m[type].forEach(fn => fn(Object.assign({ preventDefault() {}, target: e }, ev)));
      return true;
    },
  };
}

/* ---------- 1. 토큰 왕복 ---------- */
console.log('--- 1. 토큰 ---');
const G = harness('');
if (G.errs.length) { G.errs.forEach(e => console.log('X 부팅 ' + e)); process.exit(1); }
const A = G.api;
ok(!!A, '부팅했다');
{
  const info = { length: 161, streak: 42, clean: 83 };
  const tok = A.makeToken('이슬', info);
  const back = A.readToken(tok);
  console.log('     토큰 ' + tok.length + '자  ' + tok);
  ok(tok.length <= A.SHARE.MAX_TOKEN, '토큰이 ' + A.SHARE.MAX_TOKEN + '자 이하');
  ok(/^[A-Za-z0-9_-]+$/.test(tok), '주소에 그대로 실을 수 있다 (base64url)');
  ok(!!back, '되읽힌다');
  ok(back.nick === '이슬' && back.length === 161 && back.streak === 42 &&
     back.clean === 83, '값이 그대로 돌아온다');
  /* 닉네임 다듬기 */
  ok(!/[<>&"']/.test(A.cleanNick('<script>a&b"c</script>')), '태그 문자를 지운다');
  ok(A.cleanNick('가'.repeat(30)).length === 12, '열두 자로 자른다');
  ok(A.readToken(A.makeToken('', info)).nick === '친구', '비우면 친구');
  ok(A.readToken(A.makeToken('  ', info)).nick === '친구', '공백만 넣어도 친구');
}

/* ---------- 2. 깨진 링크 ---------- */
console.log('\n--- 2. 깨진 링크 ---');
{
  const bad = [
    ['빈 값', ''],
    ['글자가 아닌 것', '!!!'],
    ['base64 가 아님', 'ㄱㄴㄷ'],
    ['JSON 이 아님', Buffer.from('nope').toString('base64url')],
    ['배열', Buffer.from('[1,2]').toString('base64url')],
    ['종류가 다름', Buffer.from(JSON.stringify(
      { n: 'a', s: 10, k: 5, c: 50, f: 'apple' })).toString('base64url')],
    ['점수가 음수', Buffer.from(JSON.stringify(
      { n: 'a', s: -5, k: 0, c: 50, f: 'dh' })).toString('base64url')],
    ['점수가 너무 큼', Buffer.from(JSON.stringify(
      { n: 'a', s: 1e9, k: 0, c: 50, f: 'dh' })).toString('base64url')],
    ['청소율 101', Buffer.from(JSON.stringify(
      { n: 'a', s: 10, k: 5, c: 101, f: 'dh' })).toString('base64url')],
    ['최장이 총길이보다 큼', Buffer.from(JSON.stringify(
      { n: 'a', s: 10, k: 99, c: 50, f: 'dh' })).toString('base64url')],
    ['점수가 글자', Buffer.from(JSON.stringify(
      { n: 'a', s: '10', k: 5, c: 50, f: 'dh' })).toString('base64url')],
    ['너무 긴 토큰', 'A'.repeat(900)],
  ];
  let bad2 = 0;
  for (const [name, t] of bad) {
    if (A.readToken(t) !== null) { bad2++; console.log('     X 통과돼 버림: ' + name); }
  }
  ok(bad2 === 0, bad.length + '가지 깨진 토큰을 전부 거른다');
  /* 깨진 링크로 들어오면 메인 */
  const B = harness('#battle/v1.!!!');
  ok(B.errs.length === 0, '깨진 링크로 들어와도 오류가 없다');
  ok(B.get("challengeOver").hidden === true, '도전장 화면이 안 뜬다');
  ok(!B.docEl._cls.has('boot-challenge'), '메인을 가리던 표시를 지운다');
}

/* ---------- 3. 닉네임 창 ---------- */
console.log('\n--- 3. 닉네임 창 ---');
{
  const H = harness('');
  const a = H.api;
  let got;
  a.askNickname().then(v => { got = v; });
  ok(H.get("nickModal").hidden === false, '창이 열린다');
  H.fire('nickCancel', 'click');
  ok(H.get("nickModal").hidden === true, '취소하면 닫힌다');
  return0(() => {});
  function return0() {}
}
/* 약속(Promise)은 다음 턴에 풀린다 — 여기서 확인한다 */
(async () => {
  {
    const H = harness('');
    const a = H.api;
    const p = a.askNickname();
    H.fire('nickCancel', 'click');
    ok((await p) === null, '취소하면 null 을 준다 (보내지 않는다)');
  }
  {
    const H = harness('');
    const a = H.api;
    H.store[a.SHARE.NICK_KEY] = '이슬';
    const p = a.askNickname();
    ok(H.get("nickInput").value === '이슬', '지난 닉네임을 기억한다');
    H.get("nickInput").value = '강이슬';
    H.fire('nickOk', 'click');
    ok((await p) === '강이슬', '확인하면 적은 값을 준다');
  }

  /* ---------- 4. 공유 문구와 링크 ---------- */
  console.log('\n--- 4. 공유 문구 ---');
  {
    const H = harness('');
    const a = H.api;
    a.lastInfo = { length: 161, streak: 42, clean: 83, best: 42, next: 50 };
    const p = a.sendChallenge();
    H.get("nickInput").value = '이슬';
    H.fire('nickOk', 'click');
    await p;
    const copied = H.win.__copied || '';
    console.log('     복사된 것  ' + copied);
    ok(/이길 수 있으면 해보세요\./.test(copied), '본문이 명세대로다');
    ok(copied.indexOf('배수구 머리카락 뽑기 기록 161cm') >= 0, '게임 이름과 기록이 들어간다');
    ok(copied.indexOf(a.SHARE.URL + '#battle/v1.') >= 0, '배포 주소 + 토큰');
    ok(H.get("toast").textContent === '도전장 링크가 복사됐어요!', '토스트 문구');
    ok(H.get("toast")._cls.has('show'), '토스트가 보인다');
    ok(H.store[a.SHARE.NICK_KEY] === '이슬', '닉네임을 기억해 둔다');
    ok(H.win.__ev.indexOf('challenge_share') >= 0, 'challenge_share 를 남긴다');
    /* 링크를 되읽으면 내 기록이 나온다 */
    const url = copied.slice(copied.indexOf(a.SHARE.URL));
    const back = a.readToken(url.split('#battle/v1.')[1]);
    ok(back && back.length === 161 && back.nick === '이슬', '보낸 링크가 되읽힌다');
  }

  /* ---------- 5. CTA 높이 ---------- */
  console.log('\n--- 5. CTA 높이 ---');
  {
    /* 도전장·대결의 주 단추가 메인과 같은 클래스를 쓰는가 */
    const main = /id="startBtn"[^>]*/.exec(html)[0];
    const chb = /<button[^>]*id="cStartBtn"[^>]*/.exec(html)[0];
    const bab = /<button[^>]*id="bAgainBtn"[^>]*/.exec(html)[0];
    const cls = t => (/class="([^"]+)"/.exec(t) || [])[1] || '';
    const mainCls = cls(/<button[^>]*id="startBtn"[^>]*/.exec(html)[0]);
    console.log('     시작 ' + mainCls + ' / 도전 ' + cls(chb) + ' / 다시붙기 ' + cls(bab));
    ok(cls(chb) === mainCls, '도전 시작 단추가 메인과 같은 클래스');
    ok(cls(bab) === mainCls, '다시 붙기 단추도 같은 클래스');
    void main;
    /* 따로 높이를 덮어쓰지 않는가 */
    const over = /#cStartBtn[^{]*\{[^}]*\}|#bAgainBtn[^{]*\{[^}]*\}/.exec(css);
    ok(!over, 'CSS 로 높이를 따로 덮어쓰지 않는다');
    /* .btn 의 크기가 화면 크기를 따라간다 (clamp) */
    const btn = /\n\.btn \{([\s\S]*?)\n\}/.exec(css)[1];
    ok(/clamp\(/.test(btn) && /padding:/.test(btn), '.btn 높이가 clamp 로 잡혀 있다');
    const sizes = [[360, 640], [390, 844], [768, 1024]];
    const pad = /padding: clamp\(([\d.]+)px, ([\d.]+)vh, ([\d.]+)px\)/.exec(btn);
    ok(!!pad, '세로 padding 이 clamp 다');
    for (const [w, h] of sizes) {
      const v = Math.max(+pad[1], Math.min(+pad[2] * h / 100, +pad[3]));
      console.log('     ' + w + 'x' + h + ' -> 위아래 여백 ' + v.toFixed(1) + 'px');
    }
    ok(true, '세 화면 크기에서 같은 식으로 계산된다');
  }

  /* ---------- 6. 도전 시작부터 대결까지 ---------- */
  console.log('\n--- 6. 도전 -> 대결 ---');
  {
    const info = { length: 120, streak: 30, clean: 70 };
    const tok = harness('').api.makeToken('이슬', info);
    const H = harness('#battle/v1.' + tok);
    const a = H.api;
    ok(H.errs.length === 0, '도전장 링크로 부팅된다');
    ok(H.get("challengeOver").hidden === false, '도전장 화면이 먼저 뜬다');
    ok(H.get("startOver").hidden === true, '메인은 안 보인다');
    ok(!H.docEl._cls.has('boot-challenge'), '가림 표시를 지운다');
    ok(H.get("cNick").textContent === '이슬', '친구 닉네임');
    ok(H.get("cScore").textContent === '120cm', '친구 점수');
    ok(H.get("cArt").children.length === 1, '친구 결과 모습을 그린다');
    ok(H.win.__ev.indexOf('challenge_start') >= 0, 'challenge_start 를 남긴다');
    ok(H.win.__ev.indexOf('flow_start') >= 0, 'flow_start 를 남긴다');
    /* 도전 시작 */
    H.fire('cStartBtn', 'click');
    ok(H.get("challengeOver").hidden === true, '도전 시작하면 도전장 화면이 닫힌다');
    ok(H.win.__ev.indexOf('game_start') >= 0, 'game_start 를 남긴다');
    /* 결과가 나왔다고 치고 */
    a.lastInfo = { length: 161, streak: 42, clean: 83, best: 42, next: 50 };
    a.showBattle();
    ok(H.get("battleOver").hidden === false, '대결 화면이 뜬다');
    ok(H.get("bMyScore").textContent === '161cm', '내 점수');
    ok(H.get("bFoeScore").textContent === '120cm', '친구 점수');
    ok(H.get("bFoeNick").textContent === '이슬', '친구 이름');
    ok(H.get("bMyArt").children.length === 1 && H.get("bFoeArt").children.length === 1,
      '양쪽 모습을 다 그린다');
    /* 다시 붙기 / 자세히 보기 */
    H.fire('bDetailBtn', 'click');
    ok(H.get("battleOver").hidden === true && H.get("endOver").hidden === false,
      '자세히 보기 -> 결과 화면');
    a.showBattle();
    H.fire('bAgainBtn', 'click');
    ok(H.get("battleOver").hidden === true, '다시 붙기 -> 대결 화면이 닫힌다');
    ok(H.win.__ev.indexOf('replay') >= 0, 'replay 를 남긴다');
  }

  /* ---------- 7. 이김 / 짐 / 무승부 ---------- */
  console.log('\n--- 7. 승패 ---');
  {
    const a = harness('').api;
    const w = a.verdict(161, 120), l = a.verdict(100, 120), d = a.verdict(120, 120);
    console.log('     ' + w.text + ' / ' + l.text + ' / ' + d.text);
    ok(w.cls === 'win' && w.text === '이겼습니다. 41cm 차이.', '이겼을 때');
    ok(l.cls === 'lose' && l.text === '졌습니다. 20cm 부족.', '졌을 때');
    ok(d.cls === 'draw' && d.text === '무승부. 한 번 더.', '무승부');
  }

  /* ---------- 8. 그냥 들어오면 메인 ---------- */
  console.log('\n--- 8. 일반 접속 ---');
  {
    const H = harness('');
    ok(H.get("challengeOver").hidden === true, '도전장 화면이 안 뜬다');
    ok(H.get("battleOver").hidden === true, '대결 화면도 안 뜬다');
    ok(H.get("nickModal").hidden === true, '닉네임 창도 안 뜬다');
    ok(!H.docEl._cls.has('boot-challenge'), '가림 표시가 없다');
    ok(H.get("battleBtn").hidden === true, '대결 결과 보기 단추가 숨어 있다');
    for (const n of ['#battle/', '#battle/v2.abc', '#other', 'battle/v1.abc'])
      ok(harness(n).get("challengeOver").hidden === true, '  "' + n + '" 도 메인으로');
  }

  console.log('\n' + (fail ? 'X 실패 ' + fail + '건 / ' + (pass + fail)
                           : '전부 통과 (' + pass + ')'));
  process.exitCode = fail ? 1 : 0;
})();
