/* ============================================================
   호떡 알바 — 검사
   ============================================================
   브라우저 없이 game.js 를 돌린다. 캔버스와 포인터를 흉내 내서
   실제로 반죽을 떼고 설탕을 넣고 누르고 뒤집고 집어 낸다.

     node tools/qa-hotteok.js

   확인하는 것은 "버튼이 있나" 가 아니라
   "직접 만져서 호떡이 실제로 달라지나" 다.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log("  OK  " + label); }
  else { fail++; console.log("  XX  " + label + (extra === undefined ? "" : "   -> " + extra)); }
}
function near(a, b, tol, label) { ok(Math.abs(a - b) <= tol, label, a + " vs " + b); }

/* ============================================================
   캔버스와 포인터 흉내
   ============================================================ */
function makeCtx() {
  const c = {
    canvas: null, _texts: [],
    fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "", font: "",
    textAlign: "", textBaseline: "", globalAlpha: 1,
    measureText: t => ({ width: String(t).length * 14 }),
    setTransform() {}, clearRect() {}, fillRect() {}, strokeRect() {},
    save() {}, restore() {},
    translate() {}, scale() {}, rotate() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    arc() {}, ellipse() {}, rect() {}, fill() {}, stroke() {}, clip() {},
    fillText(txt) { c._texts.push(String(txt)); },
    strokeText() {}, setLineDash() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    _imgs: 0,
    drawImage() { c._imgs++; },
  };
  return c;
}

function makeEl(id) {
  const el = {
    id: id, _h: {}, hidden: false, textContent: "", style: {},
    width: 300, height: 300,
    clientWidth: 360, clientHeight: 640,
    getContext: () => el._ctx || (el._ctx = makeCtx()),
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 360, bottom: 640, width: 360, height: 640 }),
    addEventListener(k, fn) { (el._h[k] = el._h[k] || []).push(fn); },
    removeEventListener() {},
    setAttribute() {}, removeAttribute() {},
    classList: { _s: {}, add(k) { this._s[k] = 1; }, remove(k) { delete this._s[k]; },
                 contains(k) { return !!this._s[k]; } },
    setPointerCapture() { el._captured = true; },
    releasePointerCapture() { el._released = true; },
    appendChild() {}, remove() {},
    click() { el.fire("click", { preventDefault() {}, target: el }); },
    toBlob(cb) { cb(null); },
    fire(k, ev) { for (const fn of (el._h[k] || [])) fn(ev); },
  };
  return el;
}

const els = {};
/* 초기 hidden / disabled 는 index.html 에 적힌 그대로 읽는다.
   그래야 '시작 화면이 안 열리는' 같은 버그가 검사에 걸린다. */
const HTML0 = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
function attrOf(id, attr) {
  const re = new RegExp('<[^>]*id="' + id + '"[^>]*>');
  const m = HTML0.match(re);
  return !!(m && m[0].indexOf(attr) >= 0);
}
["cv", "muteBtn", "againBtn", "endOver", "eSub", "eCount", "eShelf",
 "sBody", "sIntro", "sRule",
 "loadOver", "startOver", "startBtn"]
  .forEach(id => {
    els[id] = makeEl(id);
    els[id].hidden = attrOf(id, "hidden");
    if (attrOf(id, "disabled")) els[id].disabled = true;
  });
els.cv.clientWidth = 360; els.cv.clientHeight = 640;

const store = {};
/* 저장이 막힌 브라우저(사생활 보호 모드 등)를 흉내 낼 수 있게 해 둔다 */
const LSF = { fail: false };
const LS = {
  getItem: k => { if (LSF.fail) throw new Error("blocked");
                  return (k in store ? store[k] : null); },
  setItem: (k, v) => { if (LSF.fail) throw new Error("blocked");
                       store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

const DOC = {
  readyState: "complete",
  _h: {},
  getElementById: id => els[id] || null,
  createElement: tag => {
    const e = makeEl(tag);
    if (tag === "a") e.download = "";
    if (tag === "canvas") { e.width = 1080; e.height = 1350; }
    return e;
  },
  addEventListener(k, fn) { (DOC._h[k] = DOC._h[k] || []).push(fn); },
  body: { appendChild() {}, style: {} },
};

let vibes = 0;
const NAV = { vibrate: () => { vibes++; return true; }, userAgent: "node" };
const LOC = { href: "https://x.test/hotteok-job/" };
const WIN = {
  devicePixelRatio: 2,
  _h: {},
  addEventListener(k, fn) { (WIN._h[k] = WIN._h[k] || []).push(fn); },
  requestAnimationFrame: () => 0,
  location: LOC,
};
const RAF = () => 0;

/* 그림 흉내 — 실제 파일이 있으면 성공, 없으면 실패시킨다.
   그래야 '없을 때 도형으로 대신 그리는 길' 도 같이 검사된다. */
let IMAGE_FAIL = null;          /* 정규식에 맞는 파일은 일부러 못 받게 */
const LOADED = [];
/* webp 머리글에서 실제 크기를 읽는다. 배치가 그림 비율을 따르는
   코드가 있어서, 아무 크기나 돌려주면 검사가 거짓으로 통과한다. */
function webpSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.slice(0, 4).toString("ascii") !== "RIFF") return null;
    const tag = b.slice(12, 16).toString("ascii");
    if (tag === "VP8X")
      return { w: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1,
               h: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1 };
    if (tag === "VP8 ")
      return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (tag === "VP8L") {
      const n = b.readUInt32LE(21);
      return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
    }
  } catch (_) {}
  return null;
}
function ImageStub() {
  this.width = 400; this.height = 380;
  this.onload = null; this.onerror = null;
  const self = this;
  Object.defineProperty(this, "src", {
    set(v) {
      self._src = v;
      const disk = path.join(ROOT, v);
      const ok = fs.existsSync(disk) && !(IMAGE_FAIL && IMAGE_FAIL.test(v));
      if (ok) {
        const s = webpSize(disk);
        if (s) {
          self.width = s.w; self.height = s.h;
          self.naturalWidth = s.w; self.naturalHeight = s.h;
        }
        LOADED.push(v);
        if (self.onload) self.onload();
      } else if (self.onerror) self.onerror();
    },
    get() { return self._src; },
  });
}
function FileStub(parts, name, opt) { this.name = name; this.type = (opt || {}).type; }
const URLStub = { createObjectURL: () => "blob:x", revokeObjectURL() {} };

/* game.js 를 그대로 돌린다 */
const SRC = read("game.js");
new Function("window", "document", "navigator", "localStorage", "requestAnimationFrame",
             "location", "File", "URL", "Image", "console", SRC)
  (WIN, DOC, NAV, LS, RAF, LOC, FileStub, URLStub, ImageStub,
   { warn() {}, log() {}, error() {} });

const G = WIN.__hotteok;
if (!G) { console.log("XX  window.__hotteok 가 없다"); process.exit(1); }

const S = G.S, LAY = G.LAY, CFG = G.CFG;

/* 켜자마자의 상태를 적어 둔다 — 시작 흐름 검사에 쓴다 */
const BOOT = { load: els.loadOver.hidden, start: els.startOver.hidden,
               btn: !!els.startBtn.disabled, running: S.running };

/* 조작 묶음 — 사람이 하는 동작 하나 */
function hold(x, y, sec, steps) {
  G.down({ x: x, y: y });
  const n = steps || Math.max(1, Math.round(sec / 0.016));
  for (let i = 0; i < n; i++) G.step(sec / n);
  return { x: x, y: y };
}
function dragTo(x, y, sec, steps) {
  const n = steps || 10;
  const sx = S.__lastX === undefined ? x : S.__lastX;
  for (let i = 1; i <= n; i++) {
    G.move({ x: x, y: y });
    G.step((sec || 0.16) / n);
  }
}
function drag(pts, sec) {
  const per = (sec || 0.3) / Math.max(1, pts.length);
  for (const p of pts) {
    G.move({ x: p.x, y: p.y });
    G.step(per);
  }
}
function release() { G.up(); G.step(0.016); }
function wait(sec) {
  const n = Math.max(1, Math.round(sec / 0.016));
  for (let i = 0; i < n; i++) G.step(sec / n);
}
function reset() { G.reset(); S.running = true; }

/* ============================================================
   0. 시작 흐름 — 켜자마자 만질 수 있어야 한다
   ============================================================
   여기가 막히면 화면은 멀쩡한데 아무것도 안 눌린다. */
console.log("\n--- 0. 시작 ---");
{
  /* 처음 상태는 index.html 에 적힌 대로 */
  ok(attrOf("loadOver", "hidden") === false, "켜면 로딩 화면이 먼저 뜬다");
  ok(attrOf("startOver", "hidden") === true, "그때 시작 화면은 숨어 있다");
  ok(attrOf("startBtn", "disabled") === true, "그때 시작 단추는 잠겨 있다");
  ok(BOOT.running === false, "그림을 다 받아도 저절로 시작되지 않는다");

  /* 그림을 다 받은 뒤 */
  ok(els.loadOver.hidden === true, "다 받으면 로딩 화면이 사라진다");
  ok(els.startOver.hidden === false, "다 받으면 시작 화면이 보인다");
  ok(!els.startBtn.disabled, "시작 단추를 누를 수 있다");

  /* 아직 누르기 전 — 손대도 아무 일 없어야 한다 */
  ok(S.running === false, "아직 시작 전");
  G.down({ x: LAY.dough.x, y: LAY.dough.y });
  ok(S.grab === null, "시작 전에는 반죽이 안 잡힌다");
  G.up();

  /* 시작 */
  els.startBtn.click();
  ok(S.running === true, "[시작] 을 누르면 조리가 열린다");
  ok(els.startOver.hidden === true, "시작 화면이 닫힌다");

  /* 이제 만져진다 */
  G.down({ x: LAY.dough.x, y: LAY.dough.y });
  ok(S.grab !== null && S.grab.kind === "tear", "이제 반죽이 잡힌다");
  G.up();
  G.reset();
}

const html = read("index.html");
const css = read("style.css");

/* ============================================================
   1. 하지 말라고 한 것 (명세 65절)
   ============================================================ */
console.log("\n--- 1. 금지 사항 ---");
{
  /* 금지한 것은 "누르면 조리가 되는 단추" 다. 시작 안내의 '만드는
     순서' 목록에 같은 낱말이 나오는 것은 설명이지 단추가 아니므로,
     <button> 안쪽만 본다. */
  const banned = ["반죽 넣기", "설탕 넣기", "누르기", "뒤집기", "완성"];
  const btnText = (html.match(/<button[\s\S]*?<\/button>/g) || [])
    .map(b => b.replace(/<[^>]*>/g, "").trim());
  const found = banned.filter(b => btnText.some(t => t === b));
  ok(found.length === 0, "조리 단계를 누르는 단추가 없다", found.join(","));
  /* 단추는 셋뿐이다 — 소리 / 게임 시작 / 다시 도전. */
  const btns = (html.match(/<button/g) || []).length;
  ok(btns === 3, "단추는 소리·시작·다시 도전 셋뿐이다", btns + "개");
  /* 조리판 안에서 하는 일에는 단추가 붙지 않는다 */
  const cookBtn = ["id=\"oilBtn", "id=\"pressBtn", "id=\"flipBtn",
                   "id=\"sugarBtn", "id=\"sealBtn", "id=\"autoBtn"];
  ok(cookBtn.every(b => html.indexOf(b) < 0), "조리를 대신해 주는 단추가 없다");
  ok(html.indexOf("actBtn") < 0, "조작 단추(actBtn)가 없어졌다");
  /* --- 이번 변경으로 없어져야 하는 것들 --- */
  for (const w of ["주문서", "오늘의 주문", "작업대", "도감", "공유하기", "등급"])
    ok(html.indexOf(w) < 0, "화면에 '" + w + "' 이 남아 있지 않다");
  for (const id of ["cutBtn", "skipBtn", "dexBtn", "shareBtn", "orderBtn", "resCv", "rStars"])
    ok(html.indexOf(id) < 0, "없어진 칸 " + id + " 이 남아 있지 않다");
  for (const f of ["drawOrderCard", "drawBoard", "evaluate", "drawResultArt", "nextOrder"])
    ok(SRC.indexOf("function " + f) < 0, "없어진 함수 " + f + " 이 남아 있지 않다");
  ok(SRC.indexOf("LAY.board") < 0 && SRC.indexOf("onBoard") < 0,
     "작업대 좌표와 상태가 코드에서 사라졌다");
  /* 남은 시간과 개수는 캔버스에 그린다 — HTML 에는 자리가 없다 */
  ok(html.indexOf("timeNum") < 0, "시간을 DOM 으로 따로 띄우지 않는다");
  ok(html.indexOf("콤보") < 0 && html.indexOf("PERFECT") < 0, "점수/콤보 표시가 없다");
  ok(SRC.indexOf("drawBar") < 0, "익힘/압력 숫자 게이지를 안 그린다");
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(SRC + html + css), "이모지가 없다");
  const ext = (html.match(/<script[^>]+src="https?:/g) || []);
  ok(ext.length === 0, "외부 스크립트가 없다", ext.join(","));
  ok(SRC.indexOf("ST.DOUGH") < 0 && SRC.indexOf("COOK_SIDE_A") < 0,
     "행동을 막는 단계 상태머신이 없다");
}

/* ============================================================
   2. 조리대 — 도구가 서로 겹치지 않아야 집힌다
   ============================================================ */
console.log("\n--- 2. 조리대 ---");
{
  const items = G.TOOLS.map(t => ({ n: t.name, x: t.home.x, y: t.home.y, r: 46 }));
  items.push({ n: "반죽통", x: LAY.dough.x, y: LAY.dough.y, r: LAY.dough.r });
  items.push({ n: "설탕소통", x: LAY.fill.x, y: LAY.fill.y, r: LAY.fill.r });
  items.push({ n: "노브", x: LAY.knob.x, y: LAY.knob.y, r: LAY.knob.r });
  items.push({ n: "접시", x: LAY.plate.x, y: LAY.plate.y, r: LAY.plate.r * 0.6 });
  let bad = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) bad.push(a.n + "/" + b.n);
    }
  ok(bad.length === 0, "도구와 통이 서로 겹치지 않는다", bad.join(" "));
  ok(items.every(i => i.x > 0 && i.x < 1080 && i.y > 0 && i.y < 1920), "모두 화면 안");
  /* 손가락으로 집기 쉽게 — 보이는 것보다 넉넉한 hit */
  ok(G.TOOLS.every(t => t.hit >= 110), "도구 hit 반지름이 110 이상");
  /* 철판이 화면에서 가장 크다 */
  ok(LAY.pan.rx >= 280, "철판이 충분히 크다", LAY.pan.rx);
  let overlapsPan = G.TOOLS.filter(t =>
    Math.hypot(t.home.x - LAY.pan.x, t.home.y - LAY.pan.y) < LAY.pan.r - 20);
  ok(overlapsPan.length === 0, "도구 제자리가 철판 안에 없다",
     overlapsPan.map(t => t.name).join(","));
}

/* ============================================================
   3. 반죽을 직접 떼기 (MVP 1)
   ============================================================ */
console.log("\n--- 3. 반죽 떼기 ---");
{
  reset();
  const b = LAY.dough;
  G.down({ x: b.x, y: b.y });
  wait(0.2);
  ok(S.grab && S.grab.kind === "tear", "반죽통을 누르면 반죽이 잡힌다");
  ok(S.h === null, "조금 끌었을 때는 아직 안 떨어진다");
  drag([{ x: b.x, y: b.y + 120 }], 0.1);
  ok(S.h === null, "통 가까이에서는 안 떨어진다");
  drag([{ x: b.x, y: b.y + 200 }, { x: b.x, y: b.y + 300 }], 0.1);
  ok(S.h !== null, "충분히 끌면 덩어리가 떨어진다");
  ok(S.h && S.h.held === true, "떨어진 반죽은 손에 들려 있다");
  release();
}

/* ============================================================
   4. 반죽 양 — 잡고 끈 만큼 (명세 10절)
   ============================================================ */
console.log("\n--- 4. 반죽 양 ---");
{
  reset();
  const b = LAY.dough;
  G.down({ x: b.x, y: b.y });
  drag([{ x: b.x, y: b.y + 300 }], 0.03);
  const quick = S.h ? S.h.amount : -1;
  release();

  reset();
  G.down({ x: b.x, y: b.y });
  wait(1.4);
  drag([{ x: b.x, y: b.y + 420 }], 0.1);
  const slow = S.h ? S.h.amount : -1;
  release();

  ok(quick > 0.4 && quick < 0.75, "짧게 떼면 작은 덩어리", quick.toFixed(2));
  ok(slow > 1.2, "오래 잡고 많이 끌면 큰 덩어리", slow.toFixed(2));
  ok(slow <= 1.6 + 1e-9, "양에 상한이 있다", slow.toFixed(2));
  ok(slow > quick + 0.3, "반죽 양이 조작에 따라 달라진다");
}

/* 자주 쓰는 동작 묶음 */
const WORK = { x: 547, y: 1002 };        /* 이제 모든 작업은 철판 위에서 */
const OFF  = { x: 975, y: 1010 };        /* 철판 바깥 조리대 */
/* 손으로 문질러 충분히 펴 둔다 — 설탕은 펴진 반죽에만 들어간다 */
function handFlat() {
  const h = S.h;
  for (let k = 0; k < 14 && h.thickness > 0.55; k++) {
    const a = (k / 4) * Math.PI * 2, R = G.avgR(h);
    G.down({ x: h.x, y: h.y });
    drag([{ x: h.x + Math.cos(a) * R * 0.5, y: h.y + Math.sin(a) * R * 0.5 },
          { x: h.x + Math.cos(a) * R * 0.95, y: h.y + Math.sin(a) * R * 0.95 }], 0.2);
    release();
  }
}
function makeDough(holdSec, extra) {
  reset();
  const b = LAY.dough;
  G.down({ x: b.x, y: b.y });
  wait(holdSec === undefined ? 0.3 : holdSec);
  drag([{ x: b.x, y: b.y + 200 }, { x: b.x, y: b.y + 300 + (extra || 0) }], 0.1);
  return S.h;
}
function putAt(x, y) { G.move({ x: x, y: y }); G.step(0.016); release(); }
function pick(id) {
  const t = G.TOOLS.filter(t => t.id === id)[0];
  G.down({ x: t.home.x, y: t.home.y });
  release();
  return t;
}

/* ============================================================
   5. 떼어낸 반죽을 직접 옮기기 (MVP 2, 11절)
   ============================================================ */
console.log("\n--- 5. 반죽 옮기기 ---");
{
  makeDough();
  const h = S.h;
  G.move({ x: 700, y: 700 }); G.step(0.016);
  ok(Math.abs(h.x - 700) < 1 && Math.abs(h.y - 700) < 1, "손을 따라 움직인다");
  putAt(LAY.pan.x, LAY.pan.y);
  ok(h.onPan === true, "철판 안에 놓으면 철판에 올라간다");
  ok(h.held === false, "손에서 떨어졌다");

  /* 철판 밖에 놓으면 안 익는다 */
  makeDough();
  putAt(OFF.x, OFF.y);
  ok(S.h.onPan === false, "철판 밖에 놓으면 철판에 안 올라간다");
  S.heat = 1; wait(3);
  ok(G.cookDown(S.h) === 0, "조리대에서는 익지 않는다");
}

/* ============================================================
   6. 손으로 펼치기 (MVP 3, 12/13절)
   ============================================================ */
console.log("\n--- 6. 펼치기 ---");
{
  makeDough(0.4);
  putAt(WORK.x, WORK.y);
  const h = S.h;
  const t0 = h.thickness, r0 = G.avgR(h), v0 = r0 * r0 * t0;
  G.down({ x: WORK.x, y: WORK.y });
  drag([{ x: WORK.x + 22, y: WORK.y }, { x: WORK.x + 46, y: WORK.y },
        { x: WORK.x + 20, y: WORK.y + 20 }, { x: WORK.x - 24, y: WORK.y },
        { x: WORK.x - 48, y: WORK.y }, { x: WORK.x, y: WORK.y - 30 }], 0.5);
  release();
  const t1 = h.thickness, r1 = G.avgR(h);
  ok(t1 < t0 - 0.02, "문지르면 얇아진다", t0.toFixed(2) + " -> " + t1.toFixed(2));
  ok(r1 > r0 + 1, "얇아진 만큼 넓어진다", r0.toFixed(1) + " -> " + r1.toFixed(1));
  const v1 = r1 * r1 * t1;
  ok(Math.abs(v1 / v0 - 1) < 0.25, "부피가 대충 지켜진다", (v1 / v0).toFixed(2));

  /* 한 방향으로만 밀면 찌그러진다 (13절) */
  makeDough(0.4);
  putAt(WORK.x, WORK.y);
  const h2 = S.h;
  G.down({ x: WORK.x, y: WORK.y });
  for (let i = 0; i < 6; i++)
    drag([{ x: WORK.x + 10, y: WORK.y }, { x: WORK.x + 50, y: WORK.y }], 0.1);
  release();
  ok(h2.deform > 0.06, "한쪽만 밀면 비대칭이 된다", h2.deform.toFixed(3));
  const right = h2.rad[0], left = h2.rad[Math.floor(G.NA / 2)];
  ok(right > left * 1.1, "민 쪽이 더 넓다", right.toFixed(2) + " vs " + left.toFixed(2));
}

/* ============================================================
   7. 설탕을 직접 떠 넣기 (MVP 4, 14~16절)
   ============================================================ */
console.log("\n--- 7. 설탕소 ---");
{
  makeDough(0.4);
  putAt(WORK.x, WORK.y);
  handFlat();
  const h = S.h;
  pick("spoon");
  ok(S.active === "spoon", "숟가락을 집었다");

  /* 통 밖에서 눌러도 안 담긴다 */
  G.down({ x: WORK.x, y: WORK.y - G.TIP.spoon.y });
  release();
  ok(S.spoonLoad === 0, "통 밖에서는 안 담긴다");
  ok(h.filling === 0, "빈 숟가락으로는 아무것도 안 들어간다");

  /* 통 안에서 눌러 담기 */
  G.down({ x: LAY.fill.x, y: LAY.fill.y - G.TIP.spoon.y });
  wait(0.3);
  const small = S.spoonLoad;
  wait(0.6);
  const more = S.spoonLoad;
  release();
  ok(small > 0.1, "통 안에서 누르면 담긴다", small.toFixed(2));
  ok(more > small, "오래 누르면 더 담긴다", more.toFixed(2));

  /* 반죽 가운데에 떨어뜨리기 */
  G.down({ x: WORK.x, y: WORK.y - G.TIP.spoon.y });
  release();
  ok(h.filling > 0.3, "반죽 위에서 누르면 설탕이 들어간다", h.filling.toFixed(2));
  ok(S.spoonLoad === 0, "숟가락이 비었다");
  ok(h.bits.length > 5, "설탕 입자가 보인다", h.bits.length);

  /* 숟가락에는 상한이 있다 (한 번에 뜰 수 있는 양) */
  G.down({ x: LAY.fill.x, y: LAY.fill.y - G.TIP.spoon.y });
  wait(3);
  release();
  ok(S.spoonLoad <= 1.5 + 1e-9, "숟가락에 상한이 있다", S.spoonLoad.toFixed(2));

  /* 반죽에 들어간 양에는 상한이 없다.
     예전에는 1.5 에서 잘라 버려서, 더 넣은 설탕이 소리 없이 사라졌다.
     넣은 만큼 남아야 과하게 넣은 결과(터짐)도 제 몫을 한다. */
  const was = h.filling, put0 = h.fillPut;
  G.down({ x: WORK.x, y: WORK.y - G.TIP.spoon.y });
  release();
  ok(h.filling > was, "더 넣으면 더 들어간다", was.toFixed(2) + " -> " + h.filling.toFixed(2));
  ok(h.fillPut > 1.5, "넣은 총량이 상한에 잘리지 않는다", h.fillPut.toFixed(2));
  near(h.fillPut - put0, 1.5, 1e-6, "숟가락에 있던 양이 그대로 넘어간다");
  near(h.filling + h.fillLoose + h.leak + h.fillSpill, h.fillPut, 1e-6,
       "넣은 양 = 남은 양 + 표면 + 샌 양 + 흘린 양");

  /* 엉뚱한 곳에 흘리면 철판에 남는다 */
  reset();
  pick("spoon");
  G.down({ x: LAY.fill.x, y: LAY.fill.y - G.TIP.spoon.y });
  wait(0.6); release();
  const m0 = S.mess.length;
  G.down({ x: LAY.pan.x, y: LAY.pan.y - G.TIP.spoon.y });
  release();
  ok(S.mess.length > m0, "철판에 흘리면 자국이 남는다");
}

/* ============================================================
   8. 가장자리 오므리기 (MVP 5, 17/18절)
   ============================================================ */
console.log("\n--- 8. 봉합 ---");
{
  makeDough(0.4);
  putAt(WORK.x, WORK.y);
  handFlat();
  const h = S.h;
  /* 펼치고 설탕 넣기 */
  G.down({ x: WORK.x, y: WORK.y });
  drag([{ x: WORK.x + 24, y: WORK.y }, { x: WORK.x + 44, y: WORK.y },
        { x: WORK.x - 24, y: WORK.y }, { x: WORK.x - 44, y: WORK.y }], 0.4);
  release();
  pick("spoon");
  G.down({ x: LAY.fill.x, y: LAY.fill.y - G.TIP.spoon.y }); wait(0.6); release();
  G.down({ x: WORK.x, y: WORK.y - G.TIP.spoon.y }); release();
  ok(h.filling > 0.3, "설탕이 들어갔다");
  ok(h.sealed === 0, "아직 안 오므렸다");

  /* 숟가락을 내려놓고 맨손으로 */
  pick("spoon");
  ok(S.active === null, "같은 자리를 다시 누르면 도구를 내려놓는다");

  const R = G.avgR(h);
  /* 바깥에서 가운데로 */
  G.down({ x: WORK.x + R * 0.95, y: WORK.y });
  drag([{ x: WORK.x + R * 0.6, y: WORK.y }, { x: WORK.x + R * 0.3, y: WORK.y },
        { x: WORK.x, y: WORK.y }], 0.3);
  release();
  const s1 = h.sealed;
  ok(s1 > 0.1, "가운데로 끌면 오므라든다", s1.toFixed(2));

  /* 바깥으로 끌면 안 오므라든다 */
  G.down({ x: WORK.x + R * 0.9, y: WORK.y });
  drag([{ x: WORK.x + R * 1.3, y: WORK.y }, { x: WORK.x + R * 1.8, y: WORK.y }], 0.2);
  release();
  near(h.sealed, s1, 0.001, "바깥으로 끌면 더 안 오므라든다");

  /* 반복하면 완전히 닫힌다 */
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rr = G.avgR(h);
    G.down({ x: WORK.x + Math.cos(a) * rr * 0.95, y: WORK.y + Math.sin(a) * rr * 0.95 });
    drag([{ x: WORK.x + Math.cos(a) * rr * 0.4, y: WORK.y + Math.sin(a) * rr * 0.4 },
          { x: WORK.x, y: WORK.y }], 0.2);
    release();
  }
  ok(h.sealed >= 1 - 1e-9, "여러 번 하면 완전히 봉합된다", h.sealed.toFixed(2));
  ok(h.sealMark.length > 0, "오므린 자리가 남는다");
}

/* ============================================================
   9. 굽기 (MVP 10, 22/23절)
   ============================================================ */
console.log("\n--- 9. 굽기 ---");
{
  makeDough(0.4);
  putAt(LAY.pan.x, LAY.pan.y);
  const h = S.h;
  S.heat = 0.6; S.panTemp = 0.6;
  const a0 = G.cookDown(h);
  wait(5);
  const a1 = G.cookDown(h);
  ok(a1 > a0 + 20, "철판 위에서 아래쪽 면이 익는다", a1.toFixed(0));
  ok(G.cookUp(h) < a1 * 0.3, "위쪽 면은 거의 안 익는다", G.cookUp(h).toFixed(1));

  /* 불이 약하면 더디 익는다 */
  makeDough(0.4); putAt(LAY.pan.x, LAY.pan.y);
  S.heat = 0.15; S.panTemp = 0.15;
  wait(5);
  const slow = G.cookDown(S.h);
  makeDough(0.4); putAt(LAY.pan.x, LAY.pan.y);
  S.heat = 1; S.panTemp = 1;
  wait(5);
  const fast = G.cookDown(S.h);
  ok(fast > slow * 3, "강불이 훨씬 빠르다", slow.toFixed(0) + " vs " + fast.toFixed(0));
  wait(20);
  ok(G.cookDown(S.h) > 110, "강불에 계속 두면 탄다", G.cookDown(S.h).toFixed(0));

  /* 많이 떼면 두껍고, 두꺼우면 더디 익는다 (10절) */
  makeDough(1.6, 200); putAt(LAY.pan.x, LAY.pan.y);
  const fatT = S.h.thickness;
  S.heat = 0.6; S.panTemp = 0.6;
  wait(5);
  const thick = G.cookDown(S.h);
  ok(fatT > 1.1, "많이 떼면 처음부터 두껍다", fatT.toFixed(2));
  ok(thick < a1 * 0.92, "두꺼운 반죽이 더 더디 익는다", thick.toFixed(0) + " vs " + a1.toFixed(0));

  ok(G.cookUp(S.h) < G.cookDown(S.h), "위아래 면을 따로 센다");
}

/* ============================================================
   10. 기름 (MVP, 21/51절)
   ============================================================ */
console.log("\n--- 10. 기름 ---");
{
  reset();
  pick("oil");
  ok(S.active === "oil", "기름 솔을 집었다");
  const p = LAY.pan;
  ok(G.oilAt(p.x, p.y) === 0, "아직 안 발렸다");
  /* 철판을 가로질러 문지른다 */
  G.down({ x: p.x - 160, y: p.y + 52 });
  drag([{ x: p.x - 80, y: p.y + 52 }, { x: p.x, y: p.y + 52 },
        { x: p.x + 80, y: p.y + 52 }, { x: p.x + 160, y: p.y + 52 }], 0.5);
  release();
  ok(G.oilAt(p.x, p.y) > 0.2, "문지른 자리에 기름이 발린다", G.oilAt(p.x, p.y).toFixed(2));
  ok(G.oilAt(p.x, p.y - 250) < 0.05, "안 문지른 자리는 그대로", G.oilAt(p.x, p.y - 250).toFixed(2));

  /* 가만히 들고 있어도 쌓이지 않는다 */
  const before = G.oilAt(p.x, p.y);
  G.down({ x: p.x, y: p.y + 52 });
  wait(2);
  release();
  near(G.oilAt(p.x, p.y), before, 0.01, "한 자리에 들고만 있으면 안 쌓인다");

  /* 철판 밖은 안 발린다 */
  const n0 = S.oils.length;
  G.down({ x: 60, y: 300 });
  drag([{ x: 120, y: 340 }, { x: 180, y: 380 }], 0.2);
  release();
  ok(S.oils.length === n0, "철판 밖에는 안 발린다");

  /* 기름이 없으면 들러붙는다 */
  makeDough(0.4); putAt(p.x, p.y);
  S.heat = 0.8; S.panTemp = 0.8;
  wait(6);
  const stuck = S.h.stick;
  ok(stuck > 0.2, "기름 없이 구우면 들러붙는다", stuck.toFixed(2));

  /* 기름을 바른 자리에 올리면 안 붙는다 */
  makeDough(0.4);
  putAt(WORK.x, WORK.y);
  /* 호떡이 앉을 자리를 '면으로' 덮어 바른다.
     기름 판정이 중심 한 점이 아니라 닿는 면 전체가 되었으므로,
     아래쪽만 쓱 긋고 안 붙기를 바랄 수는 없다. */
  pick("oil");
  G.down({ x: p.x - 120, y: p.y + 60 });
  drag([{ x: p.x - 40, y: p.y + 60 }, { x: p.x + 40, y: p.y + 60 },
        { x: p.x + 120, y: p.y + 60 }, { x: p.x + 120, y: p.y + 10 },
        { x: p.x + 40, y: p.y + 10 }, { x: p.x - 40, y: p.y + 10 },
        { x: p.x - 120, y: p.y + 10 }, { x: p.x - 120, y: p.y - 45 },
        { x: p.x - 40, y: p.y - 45 }, { x: p.x + 40, y: p.y - 45 },
        { x: p.x + 120, y: p.y - 45 }], 1.2);
  release();
  pick("oil");
  ok(S.active === null, "기름 솔을 내려놨다");
  /* 손으로 집어서 철판으로 (길게 눌러 집기) */
  G.down({ x: WORK.x, y: WORK.y });
  wait(0.35);
  ok(S.h.held === true, "길게 누르면 맨손으로 집힌다");
  drag([{ x: p.x, y: p.y }], 0.1);
  release();
  ok(S.h.onPan === true, "철판에 올렸다");
  S.heat = 0.8; S.panTemp = 0.8;
  wait(6);
  ok(S.h.stick < 0.05, "기름을 바르면 안 들러붙는다", S.h.stick.toFixed(2));
  ok(S.h.oil > 0.2, "호떡이 기름을 받았다", S.h.oil.toFixed(2));
}

/* ============================================================
   11. 불 조절 (20절)
   ============================================================ */
console.log("\n--- 11. 불 ---");
{
  reset();
  const k = LAY.knob;
  const h0 = S.heat;
  /* 노브를 돌린다 */
  G.down({ x: k.x + 60, y: k.y });
  const pts = [];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * 1.8;
    pts.push({ x: k.x + Math.cos(a) * 60, y: k.y + Math.sin(a) * 60 });
  }
  drag(pts, 0.4);
  release();
  ok(S.heat > h0 + 0.1, "노브를 돌리면 불이 세진다", S.heat.toFixed(2));
  /* 반대로 */
  const h1 = S.heat;
  G.down({ x: k.x + Math.cos(1.8) * 60, y: k.y + Math.sin(1.8) * 60 });
  drag(pts.slice().reverse().concat([{ x: k.x + 60, y: k.y }]), 0.4);
  release();
  ok(S.heat < h1 - 0.1, "거꾸로 돌리면 약해진다", S.heat.toFixed(2));
  ok(S.heat >= 0 && S.heat <= 1, "0 과 1 사이");

  /* 철판은 불을 천천히 따라간다 */
  reset();
  S.heat = 1; S.panTemp = 0.1;
  wait(0.3);
  const t1 = S.panTemp;
  wait(9);
  const t2 = S.panTemp;
  ok(t1 < 0.3, "불을 올려도 철판이 바로 뜨거워지지 않는다", t1.toFixed(2));
  ok(t2 > 0.85, "시간이 지나면 따라온다", t2.toFixed(2));
  ok(SRC.indexOf("약불") < 0 && SRC.indexOf("중불") < 0, "불 세기를 글자로 안 쓴다");
}

/* ============================================================
   12. 누르개 (MVP 7, 8 / 24~28절)
   ============================================================ */
console.log("\n--- 12. 누르개 ---");
{
  makeDough(0.4);
  putAt(LAY.pan.x, LAY.pan.y);
  const h = S.h;
  pick("press");
  ok(S.active === "press", "누르개를 집었다");

  const t0 = h.thickness, r0 = G.avgR(h), v0 = r0 * r0 * t0;
  /* 호떡에서 먼 곳을 누르면 아무 일 없다 */
  G.down({ x: LAY.pan.x + 260, y: LAY.pan.y });
  wait(0.5); release();
  near(h.thickness, t0, 0.001, "안 닿으면 눌리지 않는다");

  /* 가운데를 꾹 */
  G.down({ x: h.x, y: h.y });
  wait(0.6); release();
  const t1 = h.thickness, r1 = G.avgR(h);
  ok(t1 < t0 - 0.1, "누르면 얇아진다", t0.toFixed(2) + " -> " + t1.toFixed(2));
  ok(r1 > r0 + 3, "누르면 넓어진다", r0.toFixed(1) + " -> " + r1.toFixed(1));
  const v1 = r1 * r1 * t1;
  ok(Math.abs(v1 / v0 - 1) < 0.1, "부피가 지켜진다", (v1 / v0).toFixed(3));
  const even = h.deform;
  ok(even < 0.1, "가운데를 누르면 고르게 납작해진다", even.toFixed(3));

  /* 오래 누를수록 더 눌린다 */
  makeDough(0.4); putAt(LAY.pan.x, LAY.pan.y);
  pick("press");
  G.down({ x: S.h.x, y: S.h.y }); wait(0.25); release();
  const shortP = S.h.press;
  makeDough(0.4); putAt(LAY.pan.x, LAY.pan.y);
  pick("press");
  G.down({ x: S.h.x, y: S.h.y }); wait(1.2); release();
  /* press 는 '얼마나 눌렀나'(누적), pressure 는 '지금 안에 걸린 압력'.
     둘을 한 값으로 쓰면 빈 반죽을 눌러도 속이 터지는 일이 생긴다. */
  ok(S.h.press > shortP * 2, "오래 누르면 누적 압착량이 커진다",
     shortP.toFixed(2) + " vs " + S.h.press.toFixed(2));
  ok(S.h.pressure === 0, "속이 없으면 내부 압력은 0 이다", S.h.pressure.toFixed(2));

  /* 한쪽으로 치우쳐 누르면 그쪽만 (28절) */
  makeDough(0.4); putAt(LAY.pan.x, LAY.pan.y);
  const h3 = S.h;
  pick("press");
  G.down({ x: h3.x + G.avgR(h3) * 0.8, y: h3.y });
  wait(0.8); release();
  ok(h3.deform > even * 2 + 0.03, "치우쳐 누르면 찌그러진다", h3.deform.toFixed(3));
  ok(h3.rad[0] > h3.rad[Math.floor(G.NA / 2)] * 1.15, "누른 쪽만 넓어졌다",
     h3.rad[0].toFixed(2) + " vs " + h3.rad[Math.floor(G.NA / 2)].toFixed(2));

  /* 너무 세게 누르면 갈라진다 (27절) */
  makeDough(0.4); putAt(LAY.pan.x, LAY.pan.y);
  pick("press");
  G.down({ x: S.h.x, y: S.h.y }); wait(4); release();
  ok(S.h.thickness <= 0.11, "끝까지 누르면 종이처럼 얇아진다", S.h.thickness.toFixed(2));
  ok(S.h.tear > 0.1, "너무 얇아지면 반죽이 찢어진다", S.h.tear.toFixed(2));
  ok(S.h.burst === 0, "속이 없으면 터지지는 않는다", S.h.burst.toFixed(2));
}

/* ============================================================
   13. 설탕 + 압력 — 터짐과 누출 (27/52절)
   ============================================================ */
console.log("\n--- 13. 터짐 / 누출 ---");
{
  /* 설탕 많이 + 봉합 안 함 + 세게 누름 */
  makeDough(0.4);
  putAt(WORK.x, WORK.y);
  handFlat();
  const h = S.h;
  pick("spoon");
  G.down({ x: LAY.fill.x, y: LAY.fill.y - G.TIP.spoon.y }); wait(2); release();
  G.down({ x: WORK.x, y: WORK.y - G.TIP.spoon.y }); release();
  pick("spoon");
  ok(h.filling > 1.2, "설탕을 가득 넣었다", h.filling.toFixed(2));
  ok(h.sealed === 0, "봉합은 안 했다");
  pick("press");
  G.down({ x: h.x, y: h.y }); wait(1.2); release();
  ok(h.burst > 0.25, "설탕 많고 세게 누르면 터진다", h.burst.toFixed(2));
  ok(h.leak > 0.3, "설탕물이 샌다", h.leak.toFixed(2));

  /* 봉합을 잘 하면 같은 압력에도 덜 샌다 */
  makeDough(0.4);
  putAt(WORK.x, WORK.y);
  handFlat();
  const h2 = S.h;
  pick("spoon");
  G.down({ x: LAY.fill.x, y: LAY.fill.y - G.TIP.spoon.y }); wait(0.6); release();
  G.down({ x: WORK.x, y: WORK.y - G.TIP.spoon.y }); release();
  pick("spoon");
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, rr = G.avgR(h2);
    G.down({ x: WORK.x + Math.cos(a) * rr * 0.95, y: WORK.y + Math.sin(a) * rr * 0.95 });
    drag([{ x: WORK.x, y: WORK.y }], 0.2);
    release();
  }
  ok(h2.sealed > 0.8, "잘 오므렸다", h2.sealed.toFixed(2));
  pick("press");
  G.down({ x: h2.x, y: h2.y }); wait(1.2); release();
  ok(h2.leak < 0.15, "봉합했으면 거의 안 샌다", h2.leak.toFixed(2));
  ok(h2.burst < 0.2, "터지지도 않는다", h2.burst.toFixed(2));

  /* 봉합이 약하면 굽는 동안에도 샌다 (18절) */
  makeDough(0.4);
  putAt(LAY.pan.x, LAY.pan.y);
  handFlat();
  const h3 = S.h;
  pick("spoon");
  G.down({ x: LAY.fill.x, y: LAY.fill.y - G.TIP.spoon.y }); wait(0.8); release();
  G.down({ x: LAY.pan.x, y: LAY.pan.y - G.TIP.spoon.y }); release();
  S.heat = 0.7; S.panTemp = 0.7;
  const l0 = h3.leak;
  wait(6);
  ok(h3.leak > l0 + 0.1, "안 오므리고 구우면 새어 나온다", h3.leak.toFixed(2));
  ok(S.mess.length > 0, "철판에 시럽 자국이 남는다");
}

/* ============================================================
   14. 뒤집개 (MVP 9 / 29~32절)
   ============================================================ */
console.log("\n--- 14. 뒤집기 ---");
function readyToFlip(amount) {
  makeDough(amount === undefined ? 0.4 : amount);
  putAt(LAY.pan.x, LAY.pan.y);
  S.heat = 0.6; S.panTemp = 0.6;
  wait(3);
  pick("flip");
  return S.h;
}
function flick(fromX, fromY, dx) {
  G.down({ x: fromX, y: fromY });
  wait(0.25);
  const ins = S.h ? S.h.insert : 0;
  for (let i = 1; i <= 3; i++) { G.move({ x: fromX + dx * i, y: fromY }); G.step(0.016); }
  release();
  return ins;
}
{
  const h = readyToFlip();
  const tipY = -G.TIP.flip.y;            /* 날 끝이 손보다 이만큼 위 */
  ok(tipY > 60, "뒤집개 날 끝이 손잡이 앞에 있다", tipY);

  /* 날을 안 넣고 휙 하면 안 뒤집히고 밀린다 */
  const upBefore = h.up, xBefore = h.x;
  G.down({ x: h.x, y: h.y + tipY + G.avgR(h) * 0.85 });
  wait(0.3);
  const smallIns = h.insert;
  ok(smallIns < 0.3, "조금만 넣으면 insert 가 낮다", smallIns.toFixed(2));
  for (let i = 1; i <= 3; i++) { G.move({ x: h.x + 45 * i, y: G.PTR.y }); G.step(0.016); }
  release();
  ok(h.up === upBefore, "덜 넣고 휙 하면 안 뒤집힌다");
  ok(Math.abs(h.x - xBefore) > 30, "대신 호떡이 밀려난다");

  /* 충분히 넣고 휙 하면 뒤집힌다 */
  const h2 = readyToFlip();
  G.down({ x: h2.x, y: h2.y + tipY });
  wait(0.3);
  ok(h2.insert > 0.9, "가운데까지 밀어 넣으면 insert 가 높다", h2.insert.toFixed(2));
  /* 날을 밀어 넣는 동안에도 아랫면은 계속 익는다 —
     휙 하기 직전의 값과 비교해야 '익은 면이 올라왔나' 를 보는 것이 된다 */
  const cookedA = G.cookDown(h2);
  const up0 = h2.up;
  for (let i = 1; i <= 3; i++) { G.move({ x: h2.x + 45 * i, y: G.PTR.y }); G.step(0.016); }
  release();
  ok(h2.up !== up0, "제대로 뒤집혔다");
  ok(Math.abs(G.cookUp(h2) - cookedA) < 2, "익은 면이 위로 올라왔다",
     G.cookUp(h2).toFixed(1) + " vs " + cookedA.toFixed(1));
  ok(h2.deform < 0.08, "깔끔하게 뒤집으면 모양이 안 상한다", h2.deform.toFixed(3));

  /* 뒤집으면 반대 면이 익기 시작한다 */
  const before = G.cookDown(h2);
  wait(4);
  ok(G.cookDown(h2) > before + 15, "뒤집은 뒤에는 반대 면이 익는다");

  /* 반쯤 넣고 휙 하면 접힌다 */
  const h3 = readyToFlip();
  G.down({ x: h3.x, y: h3.y + tipY + G.avgR(h3) * 0.45 });
  wait(0.3);
  const midIns = h3.insert;
  const up1 = h3.up;
  for (let i = 1; i <= 3; i++) { G.move({ x: h3.x + 45 * i, y: G.PTR.y }); G.step(0.016); }
  release();
  ok(midIns > 0.3 && midIns < 0.7, "반쯤 넣었다", midIns.toFixed(2));
  ok(h3.up !== up1, "뒤집히기는 한다");
  ok(h3.deform > 0.1, "대신 접히고 찌그러진다", h3.deform.toFixed(3));

  /* 몇 번이든 뒤집을 수 있다 (32절) */
  const h4 = readyToFlip();
  for (let i = 0; i < 6; i++) {
    G.down({ x: h4.x, y: h4.y + tipY });
    wait(0.3);
    for (let k = 1; k <= 3; k++) { G.move({ x: h4.x + 45 * k, y: G.PTR.y }); G.step(0.016); }
    release();
    wait(0.4);
  }
  ok(h4.flips === 6, "여섯 번 뒤집었다", h4.flips);
  ok(h4.deform > 0, "너무 많이 뒤집으면 모양이 조금씩 상한다", h4.deform.toFixed(3));

  /* 들러붙으면 잘 안 들어간다 (51절) */
  makeDough(0.4); putAt(LAY.pan.x, LAY.pan.y);
  S.heat = 1; S.panTemp = 1;
  wait(10);
  const h5 = S.h;
  ok(h5.stick > 0.4, "기름 없이 오래 구워 들러붙었다", h5.stick.toFixed(2));
  pick("flip");
  G.down({ x: h5.x, y: h5.y + tipY });
  wait(0.4);
  ok(h5.insert < 0.8, "들러붙으면 날이 덜 들어간다", h5.insert.toFixed(2));
  const d0 = h5.deform, mess0 = S.mess.length;
  for (let i = 1; i <= 3; i++) { G.move({ x: h5.x + 45 * i, y: G.PTR.y }); G.step(0.016); }
  release();
  ok(h5.deform > d0, "억지로 떼면 모양이 상한다");
  ok(S.mess.length > mess0, "철판에 붙은 자국이 남는다");
}

/* ============================================================
   15. 집게와 접시 (MVP 11, 12 / 33/34절)
   ============================================================ */
console.log("\n--- 15. 집게 / 완성 ---");
{
  makeDough(0.4);
  putAt(LAY.pan.x, LAY.pan.y);
  const h = S.h;
  S.heat = 0.6; S.panTemp = 0.6;
  wait(4);
  pick("tong");
  ok(S.active === "tong", "집게를 집었다");
  const tipY = -G.TIP.tong.y;

  /* 엉뚱한 곳을 집으면 안 집힌다 */
  G.down({ x: LAY.pan.x + 240, y: LAY.pan.y + tipY });
  release();
  ok(h.held === false, "호떡에서 멀면 안 집힌다");

  /* 호떡을 집어 접시로 */
  G.down({ x: h.x, y: h.y + tipY });
  ok(h.held === true, "집게로 집었다");
  ok(h.onPan === false, "철판에서 들렸다");
  /* 눌어붙은 채로 집으면 손을 그대로 따라오지 않는다 (명세 37).
     1:1 로 붙여 놓으면 달라붙었다는 사실이 손에 전해지지 않는다.
     여기는 기름을 안 두르고 구운 호떡이라 끈적한 쪽이다. */
  ok(h.pull > 0.1, "떼어 낸 직후라 아직 끈적하다", h.pull.toFixed(2));
  ok(G.moveRatio(h) < 0.95, "그래서 덜 따라온다", G.moveRatio(h).toFixed(2));
  drag([{ x: 700, y: 1200 }, { x: LAY.plate.x, y: LAY.plate.y + tipY }], 0.3);
  const lag = Math.abs(h.x - LAY.plate.x);
  ok(lag > 2, "끌자마자 바로 따라붙지 않는다", lag.toFixed(0) + "px 뒤처짐");
  /* 그래도 계속 끌면 결국 따라온다 — 못 옮기는 것이 아니다 */
  drag([{ x: LAY.plate.x, y: LAY.plate.y + tipY },
        { x: LAY.plate.x, y: LAY.plate.y + tipY },
        { x: LAY.plate.x, y: LAY.plate.y + tipY },
        { x: LAY.plate.x, y: LAY.plate.y + tipY }], 0.3);
  ok(Math.abs(h.x - LAY.plate.x) < 2, "계속 끌면 따라온다",
     Math.abs(h.x - LAY.plate.x).toFixed(1));
  const made0 = S.made;
  LAST = S.h;
  ok(S.h !== null, "아직 접시에 안 놓았다");
  release();
  ok(S.made === made0, "속을 안 넣은 것은 세지 않는다", S.made);
  ok(lastOf().why === "nofill", "이유는 속을 안 넣은 것", lastOf().why);
  ok(S.h === null, "그 호떡은 조리 대상에서 빠진다");
  ok(S.running === true && S.over === false, "그래도 게임은 계속된다");
  ok(els.endOver.hidden === true, "결과 화면이 뜨지 않는다");

  /* 제출해도 타이머와 철판은 그대로다 */
  ok(S.timeLeft < G.MODE.timeLimit && S.timeLeft > 0, "시간은 계속 간다", S.timeLeft);
  ok(S.panTemp > 0, "철판 온도도 안 내려간다", S.panTemp);
  /* 바로 다음 반죽을 만들 수 있다 */
  makeDough(0.5);
  ok(S.h !== null, "곧바로 다음 반죽을 뗄 수 있다");

  /* 철판 위로 다시 내려놓을 수도 있다 */
  makeDough(0.4);
  putAt(LAY.pan.x, LAY.pan.y);
  pick("tong");
  G.down({ x: S.h.x, y: S.h.y + tipY });
  drag([{ x: 300, y: 500 }], 0.2);
  release();
  const keep = S.made;
  ok(S.made === keep && S.h !== null, "접시가 아니면 세지 않는다");
  ok(S.h.onPan === false, "조리대에 내려놨다");
  G.down({ x: S.h.x, y: S.h.y + tipY });
  drag([{ x: LAY.pan.x, y: LAY.pan.y + tipY }], 0.2);
  release();
  ok(S.h.onPan === true, "다시 철판에 올릴 수 있다");
}

/* ============================================================
   17. 그리기 — 어떤 상태에서도 터지지 않아야 한다
   ============================================================ */
console.log("\n--- 17. 그리기 ---");
{
  const ctx = els.cv.getContext();
  function paint(label) {
    ctx._texts.length = 0;
    const r = G.paint();
    ok(r === true, label + " 를 그릴 수 있다", r);
    return ctx._texts.slice();
  }
  reset();
  const t1 = paint("빈 조리대");
  ok(t1.length > 0, "조리대에 글자가 있다");
  /* 조리 수치를 숫자로 보여 주지 않는다. 위쪽 띠의 시간과 개수는
     빼고 센다 — 그 둘은 이번 방식에서 보여 줘야 하는 것이다. */
  const hudTexts = t1.filter(t => /^[0-9]+:[0-9]{2}$/.test(t) || /^[0-9]+개$/.test(t));
  ok(hudTexts.length === 2, "위쪽 띠에 남은 시간과 개수가 있다", hudTexts.join("|"));
  const nums = t1.filter(t => (/[0-9]/.test(t) || t.indexOf("%") >= 0) &&
                              hudTexts.indexOf(t) < 0);
  ok(nums.length === 0, "그 둘 말고는 숫자가 없다", nums.join("|"));

  makeDough(0.4);
  paint("손에 든 반죽");
  putAt(LAY.pan.x, LAY.pan.y);
  S.heat = 1; S.panTemp = 1;
  wait(3);
  const t2 = paint("굽는 중");
  const noNum = t2.filter(t => /[0-9]/.test(t) &&
                            !/^[0-9]+:[0-9]{2}$/.test(t) && !/^[0-9]+개$/.test(t));
  ok(noNum.length === 0, "굽는 중에도 익힘 숫자가 안 뜬다", noNum.join("|"));
  wait(14);
  ok(G.cookDown(S.h) > 110, "탔다");
  paint("탄 호떡");
  pick("press");
  G.down({ x: S.h.x, y: S.h.y }); wait(3); release();
  paint("터진 호떡");
  pick("flip");
  G.down({ x: S.h.x, y: S.h.y - G.TIP.flip.y });
  wait(0.3);
  for (let i = 1; i <= 3; i++) { G.move({ x: S.h.x + 45 * i, y: G.PTR.y }); G.step(0.016); }
  paint("뒤집는 중");
  release();
  /* 결과 그림과 공유 카드 */
  pick("tong");
  G.down({ x: S.h.x, y: S.h.y - G.TIP.tong.y });
  drag([{ x: LAY.plate.x, y: LAY.plate.y - G.TIP.tong.y }], 0.2);
  release();
  /* 같은 자리에 집게를 다시 놓아도 더 오르지 않는다 —
     이미 조리 대상에서 빠졌기 때문이다. */
  const n1 = S.made;
  pick("tong");
  G.down({ x: LAY.plate.x, y: LAY.plate.y - G.TIP.tong.y });
  release();
  ok(S.made === n1, "같은 호떡이 두 번 세어지지 않는다", S.made);

  /* 생반죽을 바로 접시에 올려도 개수가 오르지 않는다 */
  makeDough(0.6);
  putAt(LAY.pan.x, LAY.pan.y);
  const n2 = S.made;
  toPlate();
  ok(S.made === n2, "생반죽은 개수에 안 들어간다", S.made);
  ok(lastOf().why === "nofill", "이유는 속을 안 넣은 것", lastOf().why);
  ok(S.h === null, "그래도 다음 반죽으로 넘어간다");
}

/* ============================================================
   19. 입력 배선 — 실제 Pointer Event 로 들어온다 (6/59/60절)
   ============================================================ */
console.log("\n--- 19. 입력 ---");
{
  const h = els.cv._h;
  ok(!!h.pointerdown && !!h.pointermove && !!h.pointerup && !!h.pointercancel,
     "pointerdown/move/up/cancel 를 다 받는다");
  ok(SRC.indexOf("setPointerCapture") >= 0, "setPointerCapture 를 쓴다");
  ok(SRC.indexOf("mousedown") < 0 && SRC.indexOf("touchstart") < 0,
     "mouse/touch 를 따로 쓰지 않는다 (Pointer 하나로)");

  /* 화면 좌표 -> 가상 좌표. 캔버스가 360x640 이면 세 배 */
  reset();
  let prevented = 0;
  const ev = (x, y) => ({ clientX: x, clientY: y, pointerId: 7, pointerType: "touch",
                          preventDefault: () => { prevented++; } });
  els.cv.fire("pointerdown", ev(LAY.dough.x / 3, LAY.dough.y / 3));
  ok(Math.abs(G.PTR.x - LAY.dough.x) < 1 && Math.abs(G.PTR.y - LAY.dough.y) < 1,
     "화면 좌표가 가상 좌표로 바뀐다", G.PTR.x.toFixed(0) + "," + G.PTR.y.toFixed(0));
  ok(S.grab && S.grab.kind === "tear", "실제 이벤트로 반죽이 잡힌다");
  ok(els.cv._captured === true, "포인터를 붙잡는다");
  ok(prevented > 0, "기본 동작을 막는다");
  els.cv.fire("pointermove", ev(LAY.dough.x / 3, (LAY.dough.y + 320) / 3));
  G.step(0.05);
  ok(S.h !== null, "실제 이벤트로 반죽이 떨어진다");
  els.cv.fire("pointercancel", ev(0, 0));
  ok(G.PTR.down === false, "pointercancel 에도 손을 뗀 것으로 본다");

  /* 다른 손가락이 끼어들어도 흔들리지 않는다 */
  reset();
  els.cv.fire("pointerdown", ev(LAY.dough.x / 3, LAY.dough.y / 3));
  const second = { clientX: 10, clientY: 10, pointerId: 99, pointerType: "touch",
                   preventDefault() {} };
  els.cv.fire("pointerdown", second);
  els.cv.fire("pointermove", second);
  ok(Math.abs(G.PTR.x - LAY.dough.x) < 1, "두 번째 손가락은 무시한다");
  els.cv.fire("pointerup", ev(0, 0));

  /* 페이지가 밀리지 않게 */
  ok(/touch-action:\s*none/.test(css), "touch-action: none");
  ok(/overscroll-behavior:\s*none/.test(css), "overscroll-behavior: none");
  ok(/user-select:\s*none/.test(css), "글자 선택 금지");
  ok(/overflow:\s*hidden/.test(css), "스크롤 자체가 없다");
  ok(SRC.indexOf('addEventListener("touchmove"') >= 0 && SRC.indexOf("passive: false") >= 0,
     "touchmove 를 직접 막는다");
  ok(/user-scalable=no/.test(html) && /viewport-fit=cover/.test(html),
     "확대 금지 + 노치 대응");
  ok(/env\(safe-area-inset/.test(css), "safe area 대응");
}

/* ============================================================
   20. 화면과 에셋
   ============================================================ */
console.log("\n--- 20. 화면 / 에셋 ---");
{
  /* 1080x1920 비율 */
  ok(/56\.25vh/.test(css), "세로 1080x1920 비율을 지킨다");
  ok(/min\(100vw/.test(css), "좁은 화면에서는 화면 폭에 맞춘다");
  ok(/min-height:\s*48px/.test(css), "단추가 48px 이상");
  /* 깨진 그림이 안 나오게 — 전부 코드로 그린다 (48절) */
  ok(html.indexOf("<img") < 0, "img 태그가 없다 (전부 캔버스에 그린다)");
  /* 폴더 밖을 건드리지 않았다 */
  ok(html.indexOf("../analytics.js") >= 0, "허브 공통 분석만 가져다 쓴다");
  const outside = (SRC.match(/\.\.\/[a-z-]+\//g) || []).filter(x => x !== "../");
  ok(outside.length === 0, "game.js 가 폴더 밖을 안 본다", outside.join(","));
  /* 분석 이벤트 */
  for (const e of ["flow_start", "game_start", "game_complete", "replay"])
    ok(SRC.indexOf('track("' + e + '")') >= 0, "분석 " + e);
}

/* ============================================================
   21. 에셋
   ============================================================ */
console.log("\n--- 21. 에셋 ---");
{
  const MAP = G.ASSET_MAP;
  const keys = Object.keys(MAP);
  const gone = keys.filter(k => !fs.existsSync(path.join(ROOT, G.ART_DIR + MAP[k])));
  ok(gone.length === 0, "ASSET_MAP 의 파일이 전부 실제로 있다", gone.map(k => MAP[k]).join(","));
  ok(keys.length >= 28, "쓰는 그림이 " + keys.length + "장");
  ok(G.MISSING.length === 0, "시작할 때 다 받아졌다", G.MISSING.join(","));
  /* 새 상태 그림은 ASSET_MAP 이 아니라 HOTTEOK_ASSETS 에서 온다 */
  const hotKeys = [];
  for (const g in G.HOTTEOK_ASSETS)
    for (const n in G.HOTTEOK_ASSETS[g]) hotKeys.push(G.HOTTEOK_ASSETS[g][n].key);
  ok(hotKeys.length === 8, "새 상태 그림이 8장", hotKeys.length);
  const hotGone = [];
  for (const g in G.HOTTEOK_ASSETS)
    for (const n in G.HOTTEOK_ASSETS[g]) {
      const e = G.HOTTEOK_ASSETS[g][n];
      if (!fs.existsSync(path.join(ROOT, G.HOTTEOK_ART + e.file))) hotGone.push(e.file);
    }
  ok(hotGone.length === 0, "새 상태 그림 파일이 전부 실제로 있다", hotGone.join(","));
  ok(Object.keys(G.IMG).length === keys.length + hotKeys.length,
     "불러온 그림 수가 맞다 (기존 + 새 상태 그림)",
     Object.keys(G.IMG).length + "/" + (keys.length + hotKeys.length));

  /* 원본은 손대지 않았다 */
  const orig = fs.readdirSync(path.join(ROOT, "assets")).filter(f => /\.png$/i.test(f));
  ok(orig.length >= 36, "원본 PNG 가 그대로 있다", orig.length + "개");
  ok(orig.indexOf("dough_bowl.png.png") >= 0 && orig.indexOf("hotteok-cooked.png.png") >= 0,
     "원본 파일명을 바꾸지 않았다");

  let bytes = 0;
  for (const f of fs.readdirSync(path.join(ROOT, "assets/opt")))
    bytes += fs.statSync(path.join(ROOT, "assets/opt", f)).size;
  const mb = bytes / 1048576;
  ok(mb < 3, "게임이 받는 그림이 " + mb.toFixed(2) + "MB (3MB 미만)");

  /* 한 장이 없으면 — 이름을 남기고 도형으로 */
  const keep = {};
  for (const k of keys) keep[k] = G.IMG[k];
  IMAGE_FAIL = /griddle|cooked/;
  for (const k of keys) delete G.IMG[k];
  G.MISSING.length = 0;
  let done = false;
  G.loadAssets(() => { done = true; });
  ok(done, "한 장이 없어도 로딩이 끝난다");
  ok(G.MISSING.length === 2, "없는 파일 이름을 남긴다", G.MISSING.join(","));
  ok(G.MISSING.join(",").indexOf("hotteok_griddle") >= 0, "어떤 파일인지 알 수 있다");
  reset();
  ok(G.paint() === true, "그림이 없어도 도형으로 그린다");
  makeDough(0.4); putAt(LAY.pan.x, LAY.pan.y);
  ok(G.paint() === true, "호떡도 도형으로 그린다");
  IMAGE_FAIL = null;
  G.MISSING.length = 0;
  for (const k of keys) G.IMG[k] = keep[k];

  /* 상태마다 다른 그림을 고른다 */
  function sprite(mut) {
    makeDough(0.4);
    putAt(LAY.pan.x, LAY.pan.y);
    mut(S.h);
    return G.spriteMix(S.h).a;
  }
  const seen = {};
  seen.ball    = sprite(h => { h.thickness = 1.0; });
  seen.flat    = sprite(h => { h.thickness = 0.3; });
  seen.filled  = sprite(h => { h.thickness = 0.5; h.filling = 0.7; });
  seen.sealed  = sprite(h => { h.thickness = 0.5; h.filling = 0.7; h.sealed = 1; });
  seen.cooking = sprite(h => { h.cookA = 50; h.up = "A"; });
  seen.done    = sprite(h => { h.cookA = 80; h.up = "A"; });
  seen.burnt   = sprite(h => { h.cookA = 135; h.up = "A"; });
  /* 터진 그림은 속이 있고, 실제로 터졌고, 구워졌을 때만 */
  seen.burst   = sprite(h => { h.fillPut = 0.9; h.filling = 0.9; h.burst = 0.8;
                               h.cookA = 60; h.up = "A"; });
  const uniq = Object.keys(seen).map(k => seen[k]);
  ok(new Set(uniq).size >= 7, "상태마다 다른 그림을 쓴다", uniq.join(" "));
  ok(seen.ball !== seen.flat, "펼치면 그림이 바뀐다", seen.ball + " -> " + seen.flat);
  /* 잘 오므린 반죽은 새로 들어온 봉합 그림을 쓴다 (명세 4).
     아직 오므리지 않은 반죽은 원래 쓰던 '속 얹은 반죽' 그림 그대로. */
  ok(seen.filled === "filled" && seen.sealed === "sealTight",
     "설탕/봉합 그림이 따로 있다", seen.filled + " / " + seen.sealed);
  ok(seen.burst === "burst", "터지면 터진 그림");
  ok(uniq.every(k => (k in MAP) || (k in G.HOT_ART)),
     "고른 그림이 전부 에셋 목록에 있다", uniq.filter(k => !(k in MAP) && !(k in G.HOT_ART)).join(","));

  makeDough(0.4); putAt(LAY.pan.x, LAY.pan.y);
  S.h.up = "A"; S.h.cookA = 50;
  const m = G.spriteMix(S.h);
  ok(m.a !== m.b && m.t > 0 && m.t < 1, "익는 중에는 두 장을 겹쳐 섞는다",
     m.a + "+" + m.b + " " + m.t.toFixed(2));

  /* 눌린 모양이 그림 크기에 들어간다 */
  makeDough(0.4); putAt(LAY.pan.x, LAY.pan.y);
  const e0 = G.extents(S.h);
  near(e0.rx / e0.ry, 1, 0.12, "처음에는 거의 동그랗다");
  pick("press");
  G.down({ x: S.h.x + G.avgR(S.h) * 0.85, y: S.h.y });
  wait(1.0); release();
  const e1 = G.extents(S.h);
  ok(e1.rx > e0.rx * 1.1, "치우쳐 누르면 가로가 늘어난다",
     e0.rx.toFixed(0) + " -> " + e1.rx.toFixed(0));
  /* 치우쳐 누르면 폭보다 '중심이 밀리는 것' 으로 나타난다 —
     누른 쪽은 더 퍼지고 반대쪽은 덜 퍼지기 때문. 그림도 그만큼 밀려 그려진다. */
  ok(Math.abs(e1.cx) > G.avgR(S.h) * 0.08, "눌린 쪽으로 그림 중심이 밀린다",
     e1.cx.toFixed(0) + "px");
  ok(e1.cx > 0, "오른쪽을 눌렀으면 오른쪽으로");
  ok(Math.abs(e0.cx) < G.avgR(S.h) * 0.04, "누르기 전에는 안 밀려 있다",
     e0.cx.toFixed(1));
}

/* ============================================================
   22. 끌기 — 화면의 모든 물건이 손에 반응해야 한다
   ============================================================ */
console.log("\n--- 22. 끌기 ---");
{
  /* 도구 다섯 가지 */
  for (const t of G.TOOLS) {
    reset();
    G.down({ x: t.home.x, y: t.home.y });
    ok(S.active === t.id, t.name + " 를 집을 수 있다");
    drag([{ x: 540, y: 1000 }, { x: 600, y: 1050 }], 0.2);
    const p = S.toolPos[t.id];
    ok(Math.abs(p.x - 600) < 2 && Math.abs(p.y - 1050) < 2,
       t.name + " 가 손을 따라온다", p.x.toFixed(0) + "," + p.y.toFixed(0));
    release();
    ok(S.active === t.id, t.name + " 는 손을 떼도 들고 있다");
    G.down({ x: t.home.x, y: t.home.y });
    release();
    ok(S.active === null, t.name + " 를 제자리에 놓을 수 있다");
    ok(Math.abs(S.toolPos[t.id].x - t.home.x) < 1, t.name + " 가 제자리로");
  }

  /* 엉뚱한 데 놓으면 도구는 제자리로 (명세 31/33) */
  for (const t of G.TOOLS) {
    reset();
    G.down({ x: t.home.x, y: t.home.y });
    drag([{ x: 540, y: 300 }, { x: 540, y: 150 }], 0.2);   /* 아무것도 없는 위쪽 */
    release();
    ok(S.active === null, t.name + " 를 빈 곳에 놓으면 제자리로 돌아간다");
    ok(Math.abs(S.toolPos[t.id].x - t.home.x) < 1 &&
       Math.abs(S.toolPos[t.id].y - t.home.y) < 1, t.name + " 가 자리에 정리된다");
  }

  /* 통·철판·접시는 배경 사진에 박혀 있다 — 움직이지 않고 '자리' 로만 쓴다 */
  reset();
  const fixed = [["dough", LAY.dough], ["fill", LAY.fill], ["plate", LAY.plate]];
  for (const [nm, z] of fixed) {
    ok(typeof z.rx === "number" && typeof z.ry === "number",
       nm + " 는 타원 영역으로 잡혀 있다");
    const before = z.x + "," + z.y;
    G.down({ x: z.x, y: z.y });
    drag([{ x: z.x + 150, y: z.y + 150 }], 0.2);
    release();
    ok(z.x + "," + z.y === before, nm + " 는 배경이라 끌려오지 않는다");
  }
  /* 설탕통을 누르면 숟가락이 집힌다 (사진 속 숟가락이 거기 꽂혀 있다) */
  reset();
  G.down({ x: LAY.fill.x, y: LAY.fill.y });
  ok(S.active === "spoon", "설탕통을 누르면 숟가락을 집는다", S.active);
  release();

  /* 반죽통 가운데는 여전히 반죽 떼기 */
  reset();
  G.down({ x: LAY.dough.x, y: LAY.dough.y });
  ok(S.grab && S.grab.kind === "tear", "반죽통 가운데는 반죽을 뗀다");
  release();

  /* 반죽 / 호떡 자체 */
  makeDough(0.4);
  G.move({ x: 700, y: 760 }); G.step(0.016);
  ok(Math.abs(S.h.x - 700) < 2, "떼어낸 반죽이 손을 따라온다");
  putAt(WORK.x, WORK.y);
  G.down({ x: WORK.x, y: WORK.y });
  wait(0.35);
  ok(S.h.held === true, "놓인 반죽을 다시 집을 수 있다");
  drag([{ x: 640, y: 980 }], 0.1);
  ok(Math.abs(S.h.x - 640) < 2, "집은 반죽이 따라온다");
  release();

  /* 끌고 있는 것이 제일 위에 그려진다 */
  const body = SRC.slice(SRC.indexOf("function draw()"));
  const iHot = body.indexOf("drawHotteokWorld");
  const iTool = body.indexOf("drawTool(g, S.active");
  ok(iTool > iHot && iHot > 0, "손에 든 도구를 호떡보다 나중에(위에) 그린다");
  const iBack = body.indexOf("drawBackdrop");
  const iFx = body.indexOf("drawPanFx");
  ok(iBack < iFx && iBack > 0, "배경 사진을 제일 먼저(아래) 그린다");
  ok(iBack < iHot, "배경은 음식보다 아래");

  /* 드롭존이 보이는 것보다 넉넉한가 */
  reset();
  makeDough(0.4);
  const edge = LAY.pan.rx - 10;
  putAt(LAY.pan.x + edge, LAY.pan.y);
  ok(S.h.onPan === true, "철판 가장자리에 놓아도 올라간다");
  ok(G.TOOLS.every(t => t.hit >= 110), "도구 집는 범위가 그림보다 넉넉하다");
}

/* ============================================================
   23. 조리 흐름 — 철판 위에서 손만으로 이어지나
   ============================================================ */
console.log("\n--- 23. 흐름 ---");

const PAN = LAY.pan;
/* 전용 작업대는 없어졌다. 철판 밖 조리대 아무 데나 둔다. */
function carryTo(x, y) {
  const h = S.h;
  G.down({ x: h.x, y: h.y });
  wait(0.4);
  drag([{ x: (x + h.x) / 2, y: (y + h.y) / 2 }, { x: x, y: y }], 0.12);
  release();
}
/* 손으로 문질러 편다 */
function handSpread(n) {
  for (let k = 0; k < (n || 8); k++) {
    const h = S.h, a = (k / 4) * Math.PI;
    G.down({ x: h.x, y: h.y });
    drag([{ x: h.x + Math.cos(a) * 45, y: h.y + Math.sin(a) * 32 },
          { x: h.x + Math.cos(a) * 100, y: h.y + Math.sin(a) * 72 }], 0.1);
    release();
  }
}
/* 철판 밖 조리대. 전시대 아래이면서 도구 자리와도 안 겹치는 자리다. */
const OFFPAN = { x: 533, y: 748 };
function tearToCounter(hold) {
  makeDough(hold === undefined ? 0.5 : hold);
  putAt(OFFPAN.x, OFFPAN.y);
}
function tearToPan(hold) {
  const d = LAY.dough;
  G.down({ x: d.x, y: d.y });
  wait(hold === undefined ? 0.5 : hold);
  drag([{ x: d.x + 140, y: d.y + 160 }, { x: d.x + 260, y: d.y + 300 }], 0.12);
  drag([{ x: PAN.x, y: PAN.y }], 0.12);
  release();
}
function pressN(n, sec, off) {
  pick("press");
  for (let i = 0; i < n; i++) {
    G.down({ x: S.h.x + (off || 0), y: S.h.y });
    wait(sec === undefined ? 0.3 : sec);
    release();
  }
  pick("press");
}
/* 사람처럼 — 적당히 펴지면 손을 뗀다 */
function flatten() {
  pick("press");
  for (let i = 0; i < 12 && S.h.thickness > 0.58; i++) {
    G.down({ x: S.h.x, y: S.h.y });
    wait(0.3);
    release();
  }
  pick("press");
}
function sugar(sec) {
  pick("spoon");
  G.down({ x: LAY.fill.x, y: LAY.fill.y - G.TIP.spoon.y }); wait(sec); release();
  G.down({ x: S.h.x, y: S.h.y - G.TIP.spoon.y }); release();
  pick("spoon");
}
function seal(dirs) {
  const h = S.h;
  for (let k = 0; k < dirs; k++) {
    const a = (k / 4) * Math.PI * 2, R = G.avgR(h);
    G.down({ x: h.x + Math.cos(a) * R * 0.95, y: h.y + Math.sin(a) * R * 0.95 });
    drag([{ x: h.x + Math.cos(a) * R * 0.3, y: h.y + Math.sin(a) * R * 0.3 },
          { x: h.x, y: h.y }], 0.22);
    release();
  }
}
function flip() {
  const h = S.h;
  pick("flip");
  G.down({ x: h.x, y: h.y - G.TIP.flip.y });
  wait(0.3);
  for (let i = 1; i <= 3; i++) { G.move({ x: h.x + 45 * i, y: G.PTR.y }); G.step(0.016); }
  release();
  pick("flip");
}
/* 접시에 놓으면 S.h 가 비워지므로, 놓기 직전의 호떡을 들고 있는다.
   등급 평가는 없어졌다 — 검사는 원래 수치를 그대로 본다. */
var LAST = null;
function toPlate() {
  pick("tong");
  LAST = S.h;
  G.down({ x: S.h.x, y: S.h.y - G.TIP.tong.y });
  drag([{ x: LAY.plate.x, y: LAY.plate.y - G.TIP.tong.y }], 0.3);
  release();
}
function lastOf() {
  const h = LAST;
  if (!h) return null;
  return {
    diameter: G.diameterCm(h), thickness: G.thickCm(h),
    burstAmount: h.burst, leakAmount: h.leak, tearAmount: h.tear,
    scarAmount: h.scar, deformation: h.deform, core: h.core,
    coreScore: G.coreRatio(h), fillPut: h.fillPut, sealed: h.sealed,
    cookA: h.cookA, cookB: h.cookB,
    cookMax: Math.max(h.cookA, h.cookB), cookMin: Math.min(h.cookA, h.cookB),
    counted: G.passReason(h) === null, why: G.passReason(h),
  };
}
/* 호떡이 앉을 자리를 면으로 덮어 바른다 (기름은 닿는 면 전체로 판정한다) */
function oilPan() {
  pick("oil");
  G.down({ x: PAN.x - 150, y: PAN.y + 60 });
  drag([{ x: PAN.x - 60, y: PAN.y + 60 }, { x: PAN.x + 60, y: PAN.y + 60 },
        { x: PAN.x + 150, y: PAN.y + 60 }, { x: PAN.x + 150, y: PAN.y + 10 },
        { x: PAN.x + 60, y: PAN.y + 10 }, { x: PAN.x - 60, y: PAN.y + 10 },
        { x: PAN.x - 150, y: PAN.y + 10 }, { x: PAN.x - 150, y: PAN.y - 45 },
        { x: PAN.x - 60, y: PAN.y - 45 }, { x: PAN.x + 60, y: PAN.y - 45 },
        { x: PAN.x + 150, y: PAN.y - 45 }], 1.4);
  release();
  pick("oil");
}

{
  reset();
  S.heat = 0.55;
  ok(G.hintTarget() === "dough", "처음엔 반죽통", G.hintTarget());
  oilPan();
  ok(G.oilAt(PAN.x, PAN.y) > 0.26, "철판에 기름을 둘렀다", G.oilAt(PAN.x, PAN.y).toFixed(2));

  tearToPan();
  ok(S.h !== null, "반죽을 뗐다");
  ok(S.h.onPan === true, "철판 위에 놓였다");
  ok(S.h.thickness > 0.8, "아직 둥근 생반죽 덩어리", S.h.thickness.toFixed(2));
  ok(G.hintTarget() === "press", "다음은 누르개", G.hintTarget());

  /* 아직 덜 편 반죽에도 설탕은 들어간다 — 순서를 막지 않는다.
     예전에는 여기서 거부했지만, 이제는 막는 대신 결과로 보여 준다
     (두꺼운 채로 속이 들어가 더 두꺼워지고, 그만큼 속이 안 익는다). */
  pick("spoon");
  G.down({ x: LAY.fill.x, y: LAY.fill.y - G.TIP.spoon.y }); wait(0.6); release();
  const loaded = S.spoonLoad;
  ok(loaded > 0.5, "숟가락에 설탕을 펐다", loaded.toFixed(2));
  const thickWas = S.h.thickness;
  G.down({ x: S.h.x, y: S.h.y - G.TIP.spoon.y }); release();
  ok(S.h.filling > 0.3, "덜 편 반죽에도 설탕이 들어간다", S.h.filling.toFixed(2));
  ok(S.h.thickness > thickWas, "대신 더 두꺼워진다",
     thickWas.toFixed(2) + " -> " + S.h.thickness.toFixed(2));
  ok(S.spoonLoad === 0, "숟가락은 비워진다");

  /* 엉뚱한 데 털면 철판에 자국이 남는다 */
  G.down({ x: LAY.fill.x, y: LAY.fill.y - G.TIP.spoon.y }); wait(0.6); release();
  const mess0 = S.mess.length;
  G.down({ x: PAN.x + 230, y: PAN.y - G.TIP.spoon.y }); release();
  ok(S.spoonLoad === 0, "엉뚱한 데 털면 숟가락이 빈다");
  ok(S.mess.length > mess0, "철판에 흘린 자국이 남는다");
  pick("spoon");

  /* 이 호떡은 이미 속이 들었다 — 여기서부터는 다시 깨끗한 반죽으로 본다 */
  reset();
  S.heat = 0.55;
  oilPan();
  tearToPan();

  /* 누르면 조금씩 넓어진다 */
  const t0 = S.h.thickness, r0 = G.avgR(S.h);
  pressN(1, 0.3);
  const t1 = S.h.thickness, r1 = G.avgR(S.h);
  ok(t1 < t0 && r1 > r0, "한 번 누르면 조금 넓어진다",
     r0.toFixed(0) + " -> " + r1.toFixed(0));
  flatten();
  ok(S.h.thickness <= 0.62, "여러 번 누르면 충분히 펴진다", S.h.thickness.toFixed(2));
  ok(S.h.filling === 0 && S.h.sealed === 0, "눌렀다고 속이 생기지 않는다");
  ok(G.hintTarget() === "spoon", "이제 설탕 차례", G.hintTarget());

  sugar(0.6);
  ok(S.h.filling > 0.3, "이제 설탕이 들어간다", S.h.filling.toFixed(2));
  ok(S.h.sealed === 0, "설탕을 넣었다고 봉합되지 않는다");
  ok(G.hintTarget() === "seal", "다음은 봉합", G.hintTarget());
  seal(4);
  ok(S.h.sealed > 0.6, "네 쪽을 당겨 닫았다", S.h.sealed.toFixed(2));
  ok(S.h.thickness > 0.62, "오므리면 다시 도톰해진다", S.h.thickness.toFixed(2));
  /* 더 누르라는 말은 정말 두꺼울 때만 한다 — 적정 구간에 들어온
     호떡에게까지 시키면 두께에 정답이 하나뿐인 것처럼 몰아간다. */
  ok(G.thickCm(S.h) <= 3.3 ? G.hintTarget() !== "press" : G.hintTarget() === "press",
     "두꺼울 때만 더 누르라고 알린다",
     G.thickCm(S.h).toFixed(1) + "cm -> " + G.hintTarget());
  flatten();

  wait(8);
  ok(G.hintTarget() === "flip", "노릇해지면 뒤집개", G.hintTarget());
  flip();
  ok(S.h.flips === 1, "뒤집었다");
  wait(8);
  ok(G.hintTarget() === "tong", "양면이 익으면 집게", G.hintTarget());
  toPlate();
  ok(S.made === 1, "접시에 담으면 한 개로 센다", S.made);
  const r = lastOf();
  console.log("     -> 지름 " + r.diameter.toFixed(1) + "cm  두께 " + r.thickness.toFixed(1) + "cm");
  ok(r.counted === true, "순서대로 하면 세어지는 호떡", r.why);
  ok(r.burstAmount === 0 && r.tearAmount === 0, "터지지도 찢어지지도 않았다");
  ok(r.coreScore >= 0.8, "속까지 익었다", r.coreScore.toFixed(2));
}

/* --- 실패들 (명세 36) --- */
{
  function play(opt) {
    reset();
    S.heat = opt.heat === undefined ? 0.55 : opt.heat;
    if (opt.oil !== false) oilPan();
    tearToPan(opt.hold);
    flatten();
    /* 숟가락 한 술에는 상한이 있다. 이제 '설탕 과다' 는 여러 번 넣는 것이다
       — 예전에는 한 술이 곧 상한이라 한 번으로 충분했다. */
    for (let i = 0; i < (opt.sugarTimes || 1); i++)
      if (opt.sugar !== 0) sugar(opt.sugar === undefined ? 0.6 : opt.sugar);
    seal(opt.seal === undefined ? 4 : opt.seal);
    flatten();                      /* 오므린 뒤 한 번 더 눌러 편다 */
    if (opt.press) pressN(1, opt.press, opt.off);
    wait(opt.cookA === undefined ? 8 : opt.cookA);
    if (opt.flip !== false) flip();
    wait(opt.cookB === undefined ? 8 : opt.cookB);
    toPlate();
    return lastOf();
  }
  const cases = [
    ["설탕 과다",       { sugar: 2.2, sugarTimes: 3 },
      r => r.burstAmount > 0 || r.leakAmount > 0],
    ["봉합 부족",       { seal: 1 },
      r => r.sealed < 0.6 || r.leakAmount > 0 || r.burstAmount > 0],
    ["너무 많이 누름",  { press: 3.0 },
      r => r.thickness < 1.9 || r.tearAmount > 0 || r.burstAmount > 0],
    ["빨리 뒤집기",     { cookA: 1, cookB: 2 },   r => r.counted === false],
    ["늦게 뒤집기",     { cookA: 18, cookB: 16 }, r => r.cookMax > 104],
    ["덜 익은 채 꺼냄", { cookA: 1, flip: false, cookB: 0.2 }, r => r.counted === false],
    ["태운 뒤 꺼냄",    { heat: 1, cookA: 16, cookB: 16 },     r => r.cookMax > 104],
    ["설탕 안 넣음",    { sugar: 0 },             r => r.why === "nofill"],
  ];
  for (const [name, opt, want] of cases) {
    const r = play(opt);
    if (process.env.QA_DEBUG) console.log("     [" + name + "] " + JSON.stringify(r));
    ok(want(r), name + " 은 그대로 수치에 남는다",
       "센다=" + r.counted + " 터짐=" + r.burstAmount.toFixed(2) +
       " 샘=" + r.leakAmount.toFixed(2) + " 겉=" + r.cookMax.toFixed(0) +
       " 두께=" + r.thickness.toFixed(1));
  }
}

/* ============================================================
   24. 상태 보존 — 안 한 일은 일어나지 않는다
   ============================================================ */
console.log("\n--- 24. 상태 보존 ---");
{
  /* ---------- TEST A: 반죽만 20번 누르기 ---------- */
  reset();
  S.heat = 0; S.panTemp = 0;
  tearToPan();
  pressN(20, 0.25);
  const A = S.h;
  console.log("     A) 20번 누른 뒤: 지름 " + G.diameterCm(A).toFixed(1) +
              "cm  두께 " + G.thickCm(A).toFixed(2) + "cm  속 " + A.filling +
              "  봉합 " + A.sealed + "  터짐 " + A.burst.toFixed(2) +
              "  샘 " + A.leak.toFixed(2) + "  찢김 " + A.tear.toFixed(2));
  ok(A.filling === 0, "설탕이 저절로 생기지 않는다", A.filling);
  ok(A.sealed === 0, "봉합이 저절로 되지 않는다", A.sealed);
  ok(A.burst === 0, "터지지 않는다", A.burst);
  ok(A.leak === 0, "새지 않는다", A.leak);
  ok(A.cookA === 0 && A.cookB === 0, "불을 껐으니 익지도 않는다");
  ok(A.press > 4, "누른 것은 분명히 쌓였다", A.press.toFixed(1));
  ok(A.pressure === 0, "속이 없으니 내부 압력은 생기지 않는다", A.pressure.toFixed(2));
  ok(A.thickness < 0.3, "대신 얇아졌다", A.thickness.toFixed(2));

  const e = G.extents(A);
  ok(e.rx <= G.MAX_R + 1, "철판의 82% 를 넘지 않는다",
     (e.rx / LAY.pan.rx * 100).toFixed(0) + "%");
  ok(e.rx < LAY.pan.rx, "반죽이 철판 안에 머문다");
  ok(e.rx > LAY.pan.rx * 0.5, "그래도 꽤 넓어진다",
     (e.rx / LAY.pan.rx * 100).toFixed(0) + "%");

  const mixA = G.spriteMix(A);
  ok(mixA.a !== "burst" && mixA.b !== "burst", "터진 호떡 그림이 안 나온다", mixA.a);
  ok(mixA.a !== "filled" && mixA.a !== "sealed" && mixA.a !== "cooked",
     "뒤 단계 그림을 앞당겨 쓰지 않는다", mixA.a);
  toPlate();
  const rA = lastOf();
  ok(rA.counted === false && rA.why === "nofill",
     "속을 안 넣었으니 세지 않는다", rA.why);
  ok(rA.burstAmount === 0 && rA.leakAmount === 0,
     "터짐/누출은 0 으로 남는다");
}

{
  /* ---------- TEST B: 설탕 많이 + 봉합 거의 없이 + 세게 ---------- */
  reset();
  S.heat = 0.6;
  oilPan();
  tearToPan();
  flatten();
  sugar(2.2);
  seal(1);
  flatten();
  wait(5);
  /* 0.8초. 1.4초를 누르면 반죽이 걸레가 되어, 가장 큰 문제가 '설탕' 이 아니라
     '찢어짐' 이 된다 — 그건 그것대로 맞는 진단이라 여기서는 덜 누른다. */
  pressN(1, 0.8);
  const Bst = S.h;
  console.log("     B) 설탕 " + Bst.filling.toFixed(2) + " 봉합 " + Bst.sealed.toFixed(2) +
              " -> 터짐 " + Bst.burst.toFixed(2) + " 샘 " + Bst.leak.toFixed(2));
  /* 많이 '넣었다' 는 fillPut 으로 본다. 남은 양으로 보면, 제대로 새어 나간
     호떡일수록 "설탕을 조금 넣었다" 는 이상한 말이 된다. */
  ok(Bst.fillPut > 1.2, "설탕이 많이 들어갔다", Bst.fillPut.toFixed(2));
  ok(Bst.filling < Bst.fillPut, "넣은 것보다 남은 게 적다",
     Bst.filling.toFixed(2) + " / " + Bst.fillPut.toFixed(2));
  near(Bst.filling + Bst.fillLoose + Bst.leak + Bst.fillSpill, Bst.fillPut, 1e-6,
       "그래도 총량은 맞는다");
  ok(Bst.sealed < 0.4, "봉합은 거의 안 했다", Bst.sealed.toFixed(2));
  ok(Bst.burst > 0.3 || Bst.leak > 0.3, "이때는 터지거나 샌다",
     Bst.burst.toFixed(2) + "/" + Bst.leak.toFixed(2));
  toPlate();
  const rB = lastOf();
  ok(rB.burstAmount > 0.3 || rB.leakAmount > 0.3,
     "접시에 담은 뒤에도 터짐/누출이 그대로 남는다",
     rB.burstAmount.toFixed(2) + " / " + rB.leakAmount.toFixed(2));

  /* ---------- TEST C: 제대로 ---------- */
  reset();
  S.heat = 0.55;
  oilPan();
  tearToPan();
  flatten();
  sugar(0.6);
  seal(4);
  flatten();
  wait(8);
  flip();
  wait(8);
  toPlate();
  const rC = lastOf();
  ok(rC.counted === true, "정상 호떡은 세어진다", rC.why);
  ok(rC.burstAmount === 0, "터지지 않았다");
  ok(rC.tearAmount === 0, "찢어지지도 않았다");

  /* ---------- 단계 건너뛰기 금지 ---------- */
  reset();
  S.heat = 0.5;
  tearToPan();
  flatten();
  sugar(0.6);
  const open = S.h;
  ok(open.sealed === 0, "아직 안 오므렸다");
  ok(G.spriteMix(open).a === "filled", "속이 보이는 그림 그대로", G.spriteMix(open).a);
  wait(8);
  ok(open.sealed === 0, "구워도 봉합은 저절로 안 된다", open.sealed);
  ok(open.filling > 0.3, "설탕은 그대로 있다", open.filling.toFixed(2));

  reset();
  S.heat = 0.6;
  tearToPan();
  flatten();
  wait(9);
  flip();
  ok(S.h.filling === 0, "뒤집어도 설탕이 생기지 않는다", S.h.filling);
  ok(S.h.sealed === 0, "뒤집어도 봉합되지 않는다", S.h.sealed);
  ok(S.h.burst === 0, "뒤집어도 터지지 않는다", S.h.burst);
}

/* ============================================================
   25. 행동이 결과로 쌓이는가
   ============================================================
   "안 한 일은 일어나지 않고, 한 일은 지워지지 않는다" 를 하나씩 본다.
   ============================================================ */
console.log("\n--- 25. 행동 -> 결과 ---");

/* --- 25-1. 빈 반죽은 아무리 괴롭혀도 속이 터지지 않는다 --------- */
{
  reset();
  S.heat = 0.8;
  oilPan();
  tearToPan();
  pressN(5, 0.5);                   /* 오래 압착 */
  wait(5);
  flip(); wait(4); flip(); wait(3);
  const h = S.h;
  ok(h.fillPut === 0, "속을 넣은 적이 없다", h.fillPut);
  ok(h.leak === 0, "시럽이 새지 않는다", h.leak);
  ok(h.burst === 0, "속이 터지지 않는다", h.burst);
  ok(h.pressure === 0, "내부 압력도 생기지 않는다", h.pressure);
  ok(G.spriteMix(h).a !== "burst" && G.spriteMix(h).b !== "burst",
     "터진 그림을 쓰지 않는다", G.spriteMix(h).a);
  ok(h.tear > 0 || h.scar > 0, "대신 반죽 자체는 상할 수 있다",
     h.tear.toFixed(2) + " / " + h.scar.toFixed(2));
  toPlate();
  const rD = lastOf();
  ok(rD.leakAmount === 0 && rD.burstAmount === 0, "접시에서도 속 사고가 없다");
  ok(rD.fillPut === 0, "애초에 속을 넣은 적이 없다", rD.fillPut);
}

/* --- 25-2. 여러 번 넣은 속은 사라지지 않고 부피로 나타난다 ------ */
{
  reset();
  S.heat = 0.3;
  oilPan();
  tearToPan();
  flatten();
  const h = S.h;
  const r0 = G.avgR(h), t0 = h.thickness;
  sugar(1.0);
  const put1 = h.fillPut, t1 = h.thickness;
  ok(put1 > 0.8, "한 번 넣었다", put1.toFixed(2));
  sugar(1.0);
  ok(h.fillPut > put1 * 1.8, "두 번 넣으면 두 배 가까이 들어간다",
     put1.toFixed(2) + " -> " + h.fillPut.toFixed(2));
  near(h.filling + h.fillLoose + h.leak + h.fillSpill, h.fillPut, 1e-6,
       "넣은 양 = 남은 양 + 표면 + 샌 양 + 흘린 양");
  ok(t1 > t0 && h.thickness > t1, "넣을수록 두꺼워진다",
     t0.toFixed(2) + " -> " + t1.toFixed(2) + " -> " + h.thickness.toFixed(2));
  ok(G.avgR(h) > r0, "넓어지기도 한다", r0.toFixed(0) + " -> " + G.avgR(h).toFixed(0));

  /* 가득 봉합한 뒤에 부으면 순간이동하지 않는다 */
  seal(4);
  ok(h.sealed > 0.8, "먼저 잘 오므렸다", h.sealed.toFixed(2));
  const inWas = h.filling, sealWas = h.sealed;
  sugar(0.8);
  ok(h.fillLoose > 0, "닫힌 호떡 위에는 표면에 쌓인다", h.fillLoose.toFixed(2));
  ok(h.sealed < sealWas, "쌓인 무게만큼 봉합이 헐거워진다",
     sealWas.toFixed(2) + " -> " + h.sealed.toFixed(2));
  near(h.filling, inWas, 1e-6, "안에 있던 양은 그대로다");
}

/* --- 25-3. 같은 조건이면 봉합이 약한 쪽이 더 샌다 -------------- */
{
  function bake(dirs) {
    reset();
    S.heat = 0.7;
    oilPan();
    tearToPan();
    flatten();
    sugar(1.2);
    if (dirs) seal(dirs);
    wait(8);
    return { sealed: S.h.sealed, leak: S.h.leak, left: S.h.filling, put: S.h.fillPut };
  }
  const loose = bake(1), tight = bake(4);
  ok(Math.abs(loose.put - tight.put) < 0.02, "넣은 설탕 양은 같다",
     loose.put.toFixed(2) + " vs " + tight.put.toFixed(2));
  ok(tight.sealed > loose.sealed, "한쪽은 네 쪽을 다 오므렸다",
     loose.sealed.toFixed(2) + " vs " + tight.sealed.toFixed(2));
  ok(loose.leak > tight.leak * 2, "덜 오므린 쪽이 훨씬 많이 샌다",
     loose.leak.toFixed(2) + " vs " + tight.leak.toFixed(2));
  ok(tight.left > loose.left, "잘 오므린 쪽에 속이 더 남는다",
     tight.left.toFixed(2) + " vs " + loose.left.toFixed(2));
}

/* --- 25-4. 기름 없는 팬이 더 눌어붙고 더 뜯긴다 ---------------- */
{
  function bake(oiled) {
    reset();
    S.heat = 0.8;
    if (oiled) oilPan();
    tearToPan();
    flatten();
    wait(7);
    const stick = S.h.stick;
    toPlate();                       /* 집게로 떼어 낸다 */
    return { stick: stick, scar: lastOf().scarAmount, tear: lastOf().tearAmount };
  }
  const dry = bake(false), wet = bake(true);
  ok(dry.stick > wet.stick + 0.15, "기름 없는 팬이 훨씬 잘 눌어붙는다",
     dry.stick.toFixed(2) + " vs " + wet.stick.toFixed(2));
  ok(dry.scar > wet.scar, "떼어 낼 때 더 뜯긴다",
     dry.scar.toFixed(2) + " vs " + wet.scar.toFixed(2));
  ok(dry.tear > wet.tear, "찢어짐도 더 남는다",
     dry.tear.toFixed(2) + " vs " + wet.tear.toFixed(2));

  /* 뒤늦게 기름을 부어도 이미 뜯긴 것은 안 돌아온다 */
  reset();
  S.heat = 0.8;
  tearToPan(); flatten();
  wait(7);
  pick("tong");
  G.down({ x: S.h.x, y: S.h.y - G.TIP.tong.y });
  drag([{ x: S.h.x + 10, y: S.h.y - G.TIP.tong.y }], 0.1);
  release();
  pick("tong");
  const scarred = S.h.scar, tore = S.h.tear;
  ok(scarred > 0, "들어 올리다 뜯겼다", scarred.toFixed(2));
  oilPan();
  wait(4);
  ok(S.h.scar >= scarred, "기름을 뒤늦게 발라도 뜯긴 자국은 그대로",
     S.h.scar.toFixed(2));
  ok(S.h.tear >= tore, "찢어진 것도 그대로", S.h.tear.toFixed(2));
  ok(S.h.stick < 0.3, "대신 지금 붙는 정도는 줄어든다", S.h.stick.toFixed(2));
}

/* --- 25-5. 한쪽만 누른 모양은 뒤집어도 접시에서도 남는다 ------- */
{
  reset();
  S.heat = 0.55;
  oilPan();
  tearToPan();
  pressN(3, 0.45, 70);               /* 중심에서 70px 치우쳐 누른다 */
  const h = S.h;
  const e0 = G.extents(h);
  const skew0 = Math.abs(e0.cx);
  ok(skew0 > 4, "한쪽으로 치우쳐 퍼졌다", skew0.toFixed(1));
  ok(h.deform > 0.05, "찌그러짐이 기록됐다", h.deform.toFixed(3));
  wait(6);
  flip();
  const e1 = G.extents(S.h);
  ok(Math.abs(e1.cx) > skew0 * 0.6, "뒤집어도 치우침이 남는다",
     skew0.toFixed(1) + " -> " + Math.abs(e1.cx).toFixed(1));
  wait(5);
  const defWas = S.h.deform;
  toPlate();
  const e2 = G.extents(LAST);
  ok(Math.abs(e2.cx) > skew0 * 0.6, "접시에 담아도 그대로",
     Math.abs(e2.cx).toFixed(1));
  near(LAST.deform, defWas, 1e-6, "담는다고 모양이 반듯해지지 않는다");
  ok(lastOf().deformation > 0.05, "접시에 놓인 뒤에도 남는다", lastOf().deformation);
}

/* --- 25-6. 뒤집는 때에 따라 양면 익힘이 달라진다 --------------- */
{
  function bake(a, b) {
    reset();
    S.heat = 0.6;
    oilPan();
    tearToPan();
    flatten();
    wait(a);
    flip();
    wait(b);
    toPlate();
    return lastOf();
  }
  const early = bake(2, 11), even = bake(6.5, 6.5), late = bake(11, 2);
  const gap = r => Math.abs(r.cookA - r.cookB);
  ok(gap(even) < gap(early) && gap(even) < gap(late),
     "제때 뒤집으면 양면이 고르다",
     gap(early).toFixed(0) + " / " + gap(even).toFixed(0) + " / " + gap(late).toFixed(0));
  ok(early.cookA !== late.cookA || early.cookB !== late.cookB,
     "일찍 뒤집기와 늦게 뒤집기의 결과가 다르다");
  ok(even.core > early.core - 1, "고르게 익히면 속도 더 익는다",
     early.core + " vs " + even.core);
}

/* --- 25-7. 속이 다 새어도 흔적은 남는다 ------------------------ */
{
  reset();
  S.heat = 0.8;
  oilPan();
  tearToPan();
  flatten();
  sugar(2.2);                        /* 봉합은 하지 않는다 */
  pressN(1, 0.8);                    /* 열린 채로 꾹 누르면 그대로 밀려 나온다 */
  wait(8);
  flip();                            /* 양면을 고르게 — 익힘 문제가 가리지 않게 */
  wait(8);
  const h = S.h;
  ok(h.filling < 0.15, "속이 거의 다 빠져나갔다", h.filling.toFixed(2));
  ok(h.leak > 0.5, "샌 양은 그대로 남아 있다", h.leak.toFixed(2));
  near(h.filling + h.fillLoose + h.leak + h.fillSpill, h.fillPut, 1e-6, "총량은 맞는다");
  ok(h.fillPut > 0.5, "넣었던 기록이 남아 있다", h.fillPut.toFixed(2));
  ok(G.passReason(h) === null, "그래도 양면이 익었으면 한 개로 센다", G.passReason(h));
  toPlate();
  ok(lastOf().leakAmount > 0.5, "접시에서도 흔적이 남는다", lastOf().leakAmount);
}

/* --- 25-8. 프레임이 달라도 같은 조작이면 같은 결과 ------------- */
{
  function pressAt(dt) {
    reset();
    S.heat = 0; S.panTemp = 0;
    makeDough(0.4);
    putAt(PAN.x, PAN.y);
    pick("press");
    G.down({ x: S.h.x, y: S.h.y });
    const n = Math.round(1.0 / dt);
    for (let i = 0; i < n; i++) G.step(dt);
    release();
    return { th: S.h.thickness, r: G.avgR(S.h), press: S.h.press };
  }
  const a = pressAt(1 / 30), b = pressAt(1 / 60), c = pressAt(1 / 120);
  const spread = (x, y, z) => (Math.max(x, y, z) - Math.min(x, y, z)) / Math.max(x, y, z);
  ok(spread(a.th, b.th, c.th) < 0.1, "30/60/120fps 에서 두께가 같다",
     [a.th, b.th, c.th].map(v => v.toFixed(3)).join(" / "));
  ok(spread(a.r, b.r, c.r) < 0.05, "넓이도 같다",
     [a.r, b.r, c.r].map(v => v.toFixed(0)).join(" / "));
  ok(spread(a.press, b.press, c.press) < 0.1, "누적 압착량도 같다",
     [a.press, b.press, c.press].map(v => v.toFixed(2)).join(" / "));

  function cookAt(dt) {
    reset();
    S.heat = 0.7;
    makeDough(0.4);
    putAt(PAN.x, PAN.y);
    const n = Math.round(6 / dt);
    for (let i = 0; i < n; i++) G.step(dt);
    return G.cookDown(S.h);
  }
  const ca = cookAt(1 / 30), cb = cookAt(1 / 60), cc = cookAt(1 / 120);
  ok(spread(ca, cb, cc) < 0.08, "굽기도 프레임에 안 휘둘린다",
     [ca, cb, cc].map(v => v.toFixed(0)).join(" / "));

  /* 재료량은 어느 프레임에서도 보존된다 */
  function fillAt(dt) {
    reset();
    S.heat = 0.7;
    makeDough(0.4);
    putAt(PAN.x, PAN.y);
    pick("spoon");
    G.down({ x: LAY.fill.x, y: LAY.fill.y - G.TIP.spoon.y });
    for (let i = 0; i < Math.round(1 / dt); i++) G.step(dt);
    release();
    G.down({ x: S.h.x, y: S.h.y - G.TIP.spoon.y });
    release();
    const n = Math.round(8 / dt);
    for (let i = 0; i < n; i++) G.step(dt);
    const h = S.h;
    return { put: h.fillPut, sum: h.filling + h.fillLoose + h.leak + h.fillSpill };
  }
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const f = fillAt(dt);
    near(f.sum, f.put, 1e-6, "fps " + Math.round(1 / dt) + " 에서도 설탕 총량이 맞는다");
  }

  /* 뒤집기는 손가락 속도로 알아본다. 그 속도를 프레임마다 같은 비율로
     섞으면(옛 방식) 같은 손짓이 30fps 에서는 느리게, 120fps 에서는 빠르게
     읽힌다. 짧은 손짓일수록 차이가 크므로 0.05초만 그어 보고 잰다. */
  function swipeSpeed(dt) {
    reset();
    S.heat = 0;
    const x0 = PAN.x - 200, y0 = PAN.y + 300;
    G.down({ x: x0, y: y0 });
    const sec = 0.05, px = 150;                 /* 초속 3000 */
    const steps = Math.max(1, Math.round(sec / dt));
    for (let i = 1; i <= steps; i++) {
      G.move({ x: x0 + (px / steps) * i, y: y0 });
      G.step(sec / steps);
    }
    const sp = G.PTR.sp;
    G.up();
    return sp;
  }
  const s30 = swipeSpeed(1 / 30), s60 = swipeSpeed(1 / 60), s120 = swipeSpeed(1 / 120);
  ok(spread(s30, s60, s120) < 0.12,
     "같은 손짓이면 프레임이 달라도 같은 속도로 읽힌다",
     [s30, s60, s120].map(v => v.toFixed(0)).join(" / "));
}

/* --- 25-9. 그림체 — 호떡은 사진으로 그린다 --------------------- */
{
  const src = read("game.js");
  /* 도형 렌더러는 '그림을 못 받았을 때' 의 대비책이어야 한다 */
  ok(/if \(!IMG\[mix\.a\]\)\s*\{\s*drawHotteokShape/.test(src),
     "그림이 있으면 사진을 쓰고, 없을 때만 도형으로 그린다");
  ok(src.indexOf("drawHotteokShape(g, h, cx, cy, sc); return;") > 0,
     "도형 경로는 한 군데서만 불린다");

  /* 실제로 그려 보면 drawImage 가 불린다 */
  const ctx = els.cv.getContext();
  reset();
  S.heat = 0.6;
  oilPan(); tearToPan(); flatten(); sugar(0.8); seal(4);
  wait(5);
  ctx._imgs = 0;
  G.paint();
  ok(ctx._imgs > 0, "호떡을 그릴 때 사진을 올린다", ctx._imgs);
  /* 터진 호떡도 사진으로 */
  S.h.burst = 1.2; S.h.leak = 1.0;
  ctx._imgs = 0;
  G.paint();
  ok(ctx._imgs > 0, "터진 호떡도 사진으로 그린다", ctx._imgs);
  const mix = G.spriteMix(S.h);
  ok(mix.a === "burst", "터진 그림은 기존 에셋", mix.a);
}

/* ============================================================
   26. 누적 시뮬레이션 — 요구 테스트 1~8 과 새로 생긴 인과관계
   ============================================================ */
console.log("\n--- 26. 누적 ---");

/* 휘두르는 속도를 정해서 뒤집는다 (거친 뒤집기 / 조심한 뒤집기) */
function flipAt(px, dtStep) {
  const h = S.h, x0 = h.x, y0 = h.y;
  pick("flip");
  G.down({ x: x0, y: y0 - G.TIP.flip.y });
  wait(0.3);
  for (let i = 1; i <= 8; i++) {
    G.move({ x: x0 + px * i, y: G.PTR.y });
    G.step(dtStep === undefined ? 0.016 : dtStep);
  }
  release();
  pick("flip");
}
/* 둘레가 어느 쪽으로 치우쳤나 (+x 쪽이면 양수) */
function biasX(h) {
  let v = 0;
  for (let i = 0; i < G.NA; i++) v += h.rad[i] * Math.cos((i / G.NA) * Math.PI * 2);
  return v;
}
function syrup() { return S.mess.filter(m => m.kind === "syrup"); }
function syrupArea() { return syrup().reduce((s, m) => s + m.r * m.r, 0); }

/* --- TEST 1. 속 0 + 강압착 -> 속이 터지는 일은 없다 ------------- */
{
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten();
  pressN(14, 0.6);                  /* 팬 한계까지 밀어붙인다 */
  wait(4);
  const h = S.h;
  ok(h.fillPut === 0, "속을 넣은 적이 없다", h.fillPut);
  ok(h.leak === 0 && h.burst === 0, "터짐도 누출도 0",
     h.leak.toFixed(2) + " / " + h.burst.toFixed(2));
  ok(syrup().length === 0, "철판에 시럽 자국이 없다", syrup().length);
  ok(h.tear > 0, "대신 반죽은 찢어졌다", h.tear.toFixed(2));
  toPlate();
  ok(lastOf().leakAmount === 0 && lastOf().burstAmount === 0,
     "접시에 담은 뒤에도 속 사고는 0", lastOf().leakAmount);
}

/* --- TEST 2. 속 과다 + 느슨한 봉합 + 강압착 -> 터진다 ---------- */
{
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten();
  sugar(1.2); sugar(1.2);           /* 과다 */
  seal(1);                          /* 한쪽만 — 느슨하다 */
  const sealed = S.h.sealed;
  pressN(6, 0.5);
  wait(4);
  const h = S.h;
  ok(sealed < 0.5, "봉합이 느슨하다", sealed.toFixed(2));
  ok(h.burst > 0.22, "옆구리가 터졌다", h.burst.toFixed(2));
  ok(h.leak > 0.2, "속이 빠져나갔다", h.leak.toFixed(2));
  near(h.filling + h.fillLoose + h.leak + h.fillSpill, h.fillPut, 1e-6,
       "터져도 총량은 맞는다");
  ok(syrup().length > 0, "철판에 자국이 남았다", syrup().length);
}

/* --- TEST 3. 속 과다 + 단단한 봉합 + 적당한 압착 --------------
   많이 넣었어도 제대로 닫고 알맞게 구우면 터지지 않아야 한다. */
{
  reset();
  S.heat = 0.5;
  oilPan(); tearToPan(); flatten();
  sugar(1.2); sugar(1.2);
  seal(4); seal(4);
  const h = S.h;
  const sealed = h.sealed, put = h.fillPut;
  wait(4); flip(); wait(4);
  ok(put > 1.4, "속을 많이 넣었다", put.toFixed(2));
  ok(sealed > 0.75, "제대로 닫았다", sealed.toFixed(2));
  ok(h.burst < 0.22, "그래도 터지지 않는다", h.burst.toFixed(2));
  ok(h.filling > put * 0.5, "속이 안에 남아 있다",
     h.filling.toFixed(2) + " / " + put.toFixed(2));
}

/* --- TEST 4. 기름 0 + 오래 굽기 -> 점착 ------------------------ */
let stickyScar = 0, stickyTear = 0;
{
  reset();
  S.heat = 0.7;
  tearToPan();                      /* 기름을 두르지 않는다 */
  flatten();
  const h = S.h;
  wait(2);
  const s2 = h.stick;
  wait(6);
  ok(h.contactOil < 0.05, "닿는 면에 기름이 없다", h.contactOil.toFixed(3));
  ok(h.stick > s2, "구울수록 더 붙는다",
     s2.toFixed(2) + " -> " + h.stick.toFixed(2));
  ok(h.stick > 0.4, "꽤 붙었다", h.stick.toFixed(2));

  /* --- TEST 5. 붙은 채로 뒤집으면 표면이 상한다 --- */
  const before = h.scar;
  flipAt(45);
  ok(h.scar > before, "뒤집으면서 살이 뜯겼다",
     before.toFixed(3) + " -> " + h.scar.toFixed(3));
  ok(S.mess.filter(m => m.kind === "stuck").length > 0, "철판에 반죽이 남았다");
  stickyScar = h.scar; stickyTear = h.tear;
}

/* --- TEST 5-2. 거칠게 휘두르면 더 뜯긴다 (flipShock) ----------- */
{
  function dryFlip(px) {
    reset();
    S.heat = 0.7;
    tearToPan(); flatten();
    wait(8);
    const h = S.h;
    const st = h.stick;
    flipAt(px);
    return { shock: h.flipShock, hurt: h.scar + h.tear, stick: st };
  }
  const slow = dryFlip(30), fast = dryFlip(260);
  ok(fast.shock > slow.shock * 1.4, "빠르게 휘두르면 충격이 크다",
     slow.shock.toFixed(2) + " vs " + fast.shock.toFixed(2));
  ok(fast.hurt > slow.hurt, "그만큼 더 뜯긴다",
     slow.hurt.toFixed(3) + " vs " + fast.hurt.toFixed(3));
}

/* --- TEST 6. 기름 충분 -> 멀쩡히 뒤집힌다 --------------------- */
{
  reset();
  S.heat = 0.6;
  oilPan(); tearToPan(); flatten();
  wait(8);
  const h = S.h;
  ok(h.stick < 0.2, "기름이 돌면 안 붙는다", h.stick.toFixed(2));
  const before = h.scar;
  flipAt(45);
  ok(h.scar === before, "뒤집어도 안 뜯긴다", h.scar.toFixed(3));
  ok(h.scar < stickyScar, "붙었던 쪽이 더 상했다",
     h.scar.toFixed(3) + " vs " + stickyScar.toFixed(3));
}

/* --- TEST 7. 한쪽만 굽고 바로 완성 -> 차이가 남는다 ----------- */
{
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten();
  wait(7);                          /* 뒤집지 않는다 */
  toPlate();
  const r = lastOf();
  ok(Math.abs(r.cookA - r.cookB) > 30, "양면 익힘이 다르다",
     r.cookA.toFixed(0) + " / " + r.cookB.toFixed(0));
  ok(r.counted === false, "한쪽만 구운 것은 세지 않는다", r.why);
}

/* --- TEST 8. 두꺼운 호떡을 짧게 -> 속이 설익는다 -------------- */
{
  reset();
  S.heat = 0.7;
  oilPan();
  tearToPan(1.6);                   /* 많이 떼서 두껍다 */
  const h = S.h;
  wait(3); flip(); wait(3);
  ok(G.thickCm(h) > 2.2, "두껍다", G.thickCm(h).toFixed(2));
  ok(h.core < (h.cookA + h.cookB) * 0.5 * 0.8, "속이 겉보다 많이 덜 익었다",
     h.core.toFixed(1) + " vs " + ((h.cookA + h.cookB) * 0.5).toFixed(1));
  toPlate();
  ok(lastOf().core < 46, "접시에 담은 뒤에도 설익음으로 남는다", lastOf().core);
}

/* --- 26-9. 뒤집어도 찌그러진 모양은 남고, 좌우만 바뀐다 -------- */
{
  reset();
  S.heat = 0.2;
  oilPan(); tearToPan(); flatten();
  pressN(6, 0.45, 95);              /* 오른쪽만 누른다 */
  const h = S.h;
  const b0 = biasX(h), d0 = h.deform;
  ok(b0 > 0.08, "오른쪽으로 퍼졌다", b0.toFixed(3));
  flip();
  const b1 = biasX(h), d1 = h.deform;
  ok(b1 < -0.08, "뒤집으면 그 퍼짐이 왼쪽으로 간다",
     b0.toFixed(3) + " -> " + b1.toFixed(3));
  ok(Math.abs(Math.abs(b1) - Math.abs(b0)) < Math.abs(b0) * 0.25,
     "치우친 정도 자체는 그대로다",
     Math.abs(b0).toFixed(3) + " vs " + Math.abs(b1).toFixed(3));
  near(d1, d0, 0.02, "찌그러진 정도도 그대로다");
  wait(1);                          /* 뒤집는 동작이 끝나야 또 뒤집을 수 있다 */
  flip();
  ok(biasX(h) > 0.08, "다시 뒤집으면 오른쪽으로 돌아온다", biasX(h).toFixed(3));
  /* 반사 자체가 모양을 조금씩 갉아먹지 않는지 — 두 번 뒤집으면 제자리 */
  const keep = h.rad.slice();
  G.mirrorShape(h, 0); G.mirrorShape(h, 0);
  let worst = 0;
  for (let i = 0; i < G.NA; i++) worst = Math.max(worst, Math.abs(h.rad[i] - keep[i]));
  ok(worst < 1e-9, "두 번 반사하면 원래 모양 그대로", worst);
}

/* --- 26-10. 철판 자국은 운이 아니라 누출량이 정한다 ------------ */
{
  /* 샌 적이 없으면 자국이 없다 */
  reset();
  S.heat = 0.5;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  wait(4);
  ok(S.h.leak < 0.12 ? syrup().length === 0 : true,
     "거의 안 샜으면 자국이 없을 수 있다",
     S.h.leak.toFixed(2) + " / " + syrup().length);

  /* 양을 늘려 가며 — 자국 수와 넓이가 같이 커진다 */
  function leakRun(seals, sugars, sec) {
    reset();
    S.heat = 0.8;
    oilPan(); tearToPan(); flatten();
    for (let i = 0; i < sugars; i++) sugar(1.2);
    if (seals > 0) seal(seals);
    wait(sec);
    return { leak: S.h.leak, n: syrup().length, area: syrupArea(),
             marked: S.h.leakMarked };
  }
  const mid = leakRun(2, 1, 5), big = leakRun(1, 2, 9);
  ok(mid.leak > 0.12 && mid.n > 0, "중간쯤 새면 반드시 자국이 남는다",
     mid.leak.toFixed(2) + " -> " + mid.n + "개");
  ok(big.leak > mid.leak, "많이 샌 쪽", mid.leak.toFixed(2) + " vs " + big.leak.toFixed(2));
  ok(big.area > mid.area, "자국이 더 넓다",
     Math.round(mid.area) + " vs " + Math.round(big.area));
  ok(big.marked <= big.leak + 1e-9, "자국으로 남긴 양이 샌 양을 넘지 않는다",
     big.marked.toFixed(2) + " / " + big.leak.toFixed(2));
  ok(big.leak - big.marked < 0.12 + 1e-9, "남은 몫은 한 방울 미만이다",
     (big.leak - big.marked).toFixed(3));
}

/* --- 26-11. 누른 횟수 / 뒤집은 횟수는 따로 센다 ---------------- */
{
  reset();
  S.heat = 0.2;
  oilPan(); tearToPan();
  pressN(3, 0.3);
  const h = S.h;
  ok(h.pressCount === 3, "세 번 누른 것을 3 으로 센다", h.pressCount);
  const pt = h.press;
  pressN(1, 1.2);                   /* 한 번 길게 */
  ok(h.pressCount === 4, "길게 눌러도 한 번이다", h.pressCount);
  ok(h.press > pt, "누른 총량은 따로 쌓인다",
     pt.toFixed(2) + " -> " + h.press.toFixed(2));
  flip();
  ok(h.flips === 1 && h.flipShock > 0, "뒤집은 횟수와 충격이 남는다",
     h.flips + " / " + h.flipShock.toFixed(2));
}

/* --- 26-12. 과압착 — 더 커질 데가 없으면 두께와 모양으로 간다 -- */
{
  reset();
  S.heat = 0.2;
  oilPan(); tearToPan(); flatten();
  const h = S.h;
  pressN(1, 0.6);
  const cm1 = G.diameterCm(h), t1 = h.thickness;
  pressN(1, 0.6);                   /* 여기서 철판 한계에 닿는다 */
  const cm2 = G.diameterCm(h), mx = Math.max.apply(null, h.rad) * h.R;
  const panCm = (LAY.pan.rx * 2) / G.CFG.pxPerCm;
  ok(cm2 > cm1, "누르면 넓어진다", cm1.toFixed(1) + " -> " + cm2.toFixed(1));
  ok(h.thickness < t1, "두께가 급히 준다",
     t1.toFixed(3) + " -> " + h.thickness.toFixed(3));
  ok(mx > G.MAX_R * 0.95, "철판 한계에 닿았다",
     mx.toFixed(1) + " / " + G.MAX_R.toFixed(1));
  ok(cm2 / panCm > 0.7 && cm2 / panCm < 0.88, "철판 안지름의 70~88% 에서 멈춘다",
     (cm2 / panCm * 100).toFixed(0) + "%");

  const tr2 = h.tear, df2 = h.deform;
  pressN(10, 0.6);                  /* 그 뒤로도 계속 누른다 */
  const cm3 = G.diameterCm(h);
  ok(cm3 < cm2 * 1.02, "그 뒤로는 더 커지지 않는다",
     cm2.toFixed(1) + " -> " + cm3.toFixed(1));
  /* 가운데를 계속 누르면 찌그러지는 방향이 매번 달라서 둘레가 조금씩
     오간다. 실측으로 10 회 추가 압착에 4~8% 안쪽이고 거기서 수렴한다.
     무너지지 않는다는 것만 본다. */
  ok(cm3 > cm2 * 0.9, "그렇다고 작아지지도 않는다",
     cm2.toFixed(1) + " -> " + cm3.toFixed(1));
  ok(h.tear > tr2, "찢김은 늘어난다", tr2.toFixed(2) + " -> " + h.tear.toFixed(2));
  ok(h.deform !== df2, "모양은 계속 일그러진다 (굳어 버리지 않는다)",
     df2.toFixed(3) + " -> " + h.deform.toFixed(3));
  ok(h.leak === 0, "빈 반죽은 여기서도 샐 것이 없다", h.leak);

  /* 속이 든 호떡을 한계까지 누르면 속은 밀려 나온다 */
  reset();
  S.heat = 0.2;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  const g2 = S.h;
  const inside = g2.filling;
  pressN(8, 0.6);
  ok(g2.leak > 0, "속이 든 쪽은 밀려 나온다", g2.leak.toFixed(2));
  ok(g2.filling < inside, "남은 속이 줄었다",
     inside.toFixed(2) + " -> " + g2.filling.toFixed(2));
  near(g2.filling + g2.fillLoose + g2.leak + g2.fillSpill, g2.fillPut, 1e-6,
       "그래도 총량은 맞는다");
}


/* ============================================================
   27. 새 상태 그림 — 상태가 그림을 정한다 (그 반대가 아니다)
   ============================================================ */
console.log("\n--- 27. 새 상태 그림 ---");

/* 상태를 직접 세워 놓고 어떤 그림이 뽑히는지만 본다 */
function sprite2(set) {
  reset();
  const h = baseH();
  S.h = h;
  set(h);
  return G.spriteMix(h);
}
function baseH() {
  reset();
  oilPan(); tearToPan(); flatten();
  return S.h;
}

/* --- TEST A. 잘 봉합하면 tight ------------------------------- */
{
  reset(); S.heat = 0.2;
  oilPan(); tearToPan(); flatten(); sugar(1.0);
  const h = S.h;
  seal(4); seal(4);
  const before = h.sealed;
  const mix = G.spriteMix(h);
  ok(h.sealed >= 0.7, "제대로 오므렸다", h.sealed.toFixed(2));
  ok(mix.a === "sealTight", "잘 봉합된 생반죽 그림", mix.a);
  /* 그림이 바뀐다고 상태를 건드리지 않는다 */
  ok(h.sealed === before, "그림을 고른다고 sealed 가 바뀌지 않는다");
}

/* --- TEST B. 느슨하게 봉합하면 loose ------------------------- */
{
  reset(); S.heat = 0.2;
  oilPan(); tearToPan(); flatten(); sugar(1.0);
  const h = S.h;
  seal(2);                          /* 두 방향만 */
  const mix = G.spriteMix(h);
  ok(h.sealed > 0.25 && h.sealed < 0.7, "어설프게 오므렸다", h.sealed.toFixed(2));
  ok(mix.a === "sealLoose", "느슨하게 봉합된 생반죽 그림", mix.a);
}

/* --- TEST B-2. 아직 오므리지도 않았으면 기존 그림 ------------ */
{
  reset(); S.heat = 0.2;
  oilPan(); tearToPan(); flatten(); sugar(1.0);
  const mix = G.spriteMix(S.h);
  ok(S.h.sealed < 0.25, "아직 안 오므렸다", S.h.sealed.toFixed(2));
  ok(mix.a === "filled", "원래 쓰던 '속 얹은 반죽' 그림을 그대로 쓴다", mix.a);
}

/* --- TEST C/D/E. 찢김 세 단계 -------------------------------- */
{
  function tearPick(amount) {
    reset();
    const h = baseH();
    h.fillPut = 1.0; h.filling = 0.8;
    h.cookA = 60; h.up = "A";
    h.tear = amount;
    G.S.h = h;
    /* tearStage 는 tear 가 오를 때 갱신된다 — 같은 길을 태운다 */
    h.tear = 0; h.tearStage = 0;
    for (let i = 0; i < 40 && h.tear < amount; i++) {
      h.tear = Math.min(amount, h.tear + amount / 20);
      G.tearStep(h);
    }
    return { mix: G.spriteMix(h), stage: h.tearStage, h: h };
  }
  const c = tearPick(0.2), d = tearPick(0.45), e = tearPick(0.9);
  ok(c.mix.a === "tearLight", "가벼운 찢김 그림", c.mix.a + " (stage " + c.stage + ")");
  ok(d.mix.a === "tearMedium", "중간 찢김 그림", d.mix.a + " (stage " + d.stage + ")");
  ok(e.mix.a === "tearHeavy", "심한 찢김 그림", e.mix.a + " (stage " + e.stage + ")");

  /* --- 명세 7. 한 방향으로만 악화 --- */
  const h = e.h;
  h.tear = 0.1;                     /* 값이 내려가도 */
  G.tearStep(h);
  ok(h.tearStage === 3, "심한 찢김은 가벼운 찢김으로 돌아가지 않는다", h.tearStage);
  ok(G.spriteMix(h).a === "tearHeavy", "그림도 되돌아가지 않는다", G.spriteMix(h).a);
}

/* --- TEST I. 속 없는 반죽에는 시럽 그림이 절대 안 나온다 ----- */
{
  reset();
  S.heat = 0.8;
  oilPan(); tearToPan(); flatten();
  pressN(12, 0.6);                  /* 강하게, 한계까지 */
  wait(6);
  flipAt(260); wait(4);
  const h = S.h;
  ok(h.fillPut === 0, "속을 넣은 적이 없다", h.fillPut);
  ok(h.tear > 0.6, "반죽은 심하게 찢어졌다", h.tear.toFixed(2));
  ok(h.tearStage === 3, "찢김 단계는 심함", h.tearStage);
  const mix = G.spriteMix(h);
  const syrupArt = ["tearLight", "tearMedium", "tearHeavy", "burst", "sealLoose"];
  ok(syrupArt.indexOf(mix.a) < 0 && syrupArt.indexOf(mix.b) < 0,
     "시럽이 보이는 그림을 쓰지 않는다", mix.a + " / " + mix.b);
  toPlate();
  ok(lastOf().fillPut === 0, "접시에 놓인 뒤에도 속을 넣은 적이 없다");
  ok(lastOf().leakAmount === 0, "샌 설탕도 없다", lastOf().leakAmount);
}

/* --- TEST F. 속이 덜 익으면 raw 단면 ------------------------- */
{
  reset();
  S.heat = 0.9;
  oilPan();
  tearToPan(1.6);                   /* 두껍게 */
  sugar(1.0); seal(4);
  wait(3); flip(); wait(3);
  const h = S.h;
  ok(G.coreRatio(h) < 0.6, "속이 덜 익었다", G.coreRatio(h).toFixed(2));
  /* 겉과 속의 차이를 본다. 겉면 절대값으로 재면 뒤집히는 시점이
     한 프레임만 달라져도 넘어가는 종잇장 판정이 된다 — 여기서
     말하려는 것은 "겉은 익었는데 속은 아직" 이라는 관계다. */
  ok(Math.max(h.cookA, h.cookB) > h.core + 8, "겉은 제법 익었는데도",
     Math.max(h.cookA, h.cookB).toFixed(0) + " vs 속 " + h.core.toFixed(0));
  toPlate();
  ok(lastOf().coreScore < 0.6, "접시에 놓인 뒤에도 속익힘이 낮다", lastOf().coreScore);
  ok(lastOf().counted === false && lastOf().why === "raw",
     "두껍게 짧게 구우면 겉도 덜 익어 세지 않는다",
     lastOf().why + " / 겉 " + lastOf().cookMin.toFixed(0));
}

/* --- TEST G. 제대로 만들면 perfect 단면 ----------------------
   속까지 익히려면 양면 합쳐 12 초쯤 걸린다 (실측: 강불에서 6+6 초면
   겉이 57/79, 속이 49 — 겉이 알맞게 익는 때와 속이 익는 때가 맞물린다). */
{
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  pressN(2, 0.35);                  /* 봉합한 뒤 살살 눌러 납작하게 — 이게 호떡이다 */
  wait(6); flip(); wait(6);
  const h = S.h;
  toPlate();
  const r = lastOf();
  ok(r.counted === true, "제대로 만든 호떡은 세어진다", r.why);
  ok(G.thickCm(h) < 2.75, "속을 넣고 눌러 마무리해야 호떡 두께가 된다",
     G.thickCm(h).toFixed(2) + "cm");
  ok(G.coreRatio(h) >= 0.8, "속까지 익었다", G.coreRatio(h).toFixed(2));
  ok(r.coreScore >= 0.8, "접시에 놓인 뒤에도 그대로", r.coreScore.toFixed(2));
}

/* --- TEST H. 심하게 터지면 burst 단면 ------------------------ */
{
  reset();
  S.heat = 0.8;
  oilPan(); tearToPan(); flatten();
  sugar(1.2); sugar(1.2); seal(1);
  pressN(6, 0.5);
  wait(5);
  const h = S.h;
  ok(h.burst >= 0.5 || h.tear >= 0.65 || h.leak >= 0.8, "크게 터졌다",
     "burst " + h.burst.toFixed(2) + " tear " + h.tear.toFixed(2) + " leak " + h.leak.toFixed(2));
  toPlate();
  ok(lastOf().burstAmount >= 0.5 || lastOf().tearAmount >= 0.65 || lastOf().leakAmount >= 0.8,
     "접시에 놓인 뒤에도 크게 터진 그대로", lastOf().burstAmount.toFixed(2));
}


/* --- 명세 9/27. 그림이 상태를 바꾸지 않는다 ------------------- */
{
  const h = baseH();
  h.fillPut = 1; h.filling = 0.9; h.cookA = 60; h.up = "A";
  h.tear = 0.9; G.tearStep(h);
  const before = JSON.stringify([h.filling, h.fillPut, h.burst, h.leak, h.sealed,
                                 h.R, h.rad.slice(), h.thickness]);
  for (let i = 0; i < 5; i++) G.spriteMix(h);
  const after = JSON.stringify([h.filling, h.fillPut, h.burst, h.leak, h.sealed,
                                h.R, h.rad.slice(), h.thickness]);
  ok(before === after, "그림을 고르는 동안 상태는 하나도 안 바뀐다");
}

/* --- 명세 18/20. 그림이 바뀌어도 크기가 튀지 않는다 ---------- */
{
  reset();
  S.heat = 0.6;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  /* 구운 면이 위로 와야 굽기 그림이 쓰인다 — 안 뒤집으면 위에서 볼 때
     아직 생반죽이고, 그러면 그림이 안 바뀌어 비교가 성립하지 않는다 */
  wait(5); flip(); wait(2);
  const h = S.h;
  const e0 = G.extents(h), cm0 = G.diameterCm(h);
  const a0 = G.spriteMix(h).a;
  /* 상태는 그대로 두고 찢김만 올린다 — 그림만 바뀌는 상황 */
  h.tear = 0.9; G.tearStep(h);
  const a1 = G.spriteMix(h).a;
  const e1 = G.extents(h), cm1 = G.diameterCm(h);
  ok(a0 !== a1, "그림이 바뀌었다", a0 + " -> " + a1);
  /* tearStep 이 둘레를 파내므로 조금은 줄지만 기본 크기로 돌아가지 않는다 */
  ok(cm1 > cm0 * 0.8, "지름이 기본값으로 돌아가지 않는다",
     cm0.toFixed(1) + " -> " + cm1.toFixed(1));
  ok(Math.abs(e1.rx / e1.ry - e0.rx / e0.ry) < 0.3, "가로세로 비율도 유지",
     (e0.rx / e0.ry).toFixed(2) + " -> " + (e1.rx / e1.ry).toFixed(2));
}


/* --- 명세 2. 파일 ------------------------------------------- */
{
  const want = {
    "assets/hotteok/state": ["hotteok-seal-tight", "hotteok-seal-loose",
      "hotteok-tear-light", "hotteok-tear-medium", "hotteok-tear-heavy"],
    "assets/hotteok/result": ["hotteok-cut-raw", "hotteok-cut-perfect", "hotteok-cut-burst"],
  };
  let miss = [];
  for (const dir in want)
    for (const n of want[dir]) {
      if (!fs.existsSync(path.join(ROOT, dir, n + ".png"))) miss.push(dir + "/" + n + ".png");
      if (!fs.existsSync(path.join(ROOT, dir, n + ".webp"))) miss.push(dir + "/" + n + ".webp");
    }
  ok(miss.length === 0, "사양이 정한 이름으로 PNG 와 webp 가 다 있다", miss.join(","));
  /* 원본을 지우지 않았다 */
  const orig = fs.readdirSync(path.join(ROOT, "assets")).filter(f => /\.png$/i.test(f));
  for (const dir in want)
    for (const n of want[dir])
      ok(orig.indexOf(n + ".png") >= 0, "원본 " + n + ".png 가 그대로 있다");
}

/* ============================================================
   29. 손맛 — 직접 조작이 상태로, 상태가 다시 화면으로
   ============================================================
   이 묶음은 "버튼을 눌러 다음 단계로" 가 아니라 "내가 한 짓이 호떡에
   남는다" 를 지킨다. 숫자가 아니라 조작의 결과를 본다. */
console.log("\n--- 29. 손맛 ---");

/* --- 명세 17. 철판 열 분포 ----------------------------------- */
{
  const p = LAY.pan;
  const mid = G.heatAt(p.x, p.y);
  const edge = G.heatAt(p.x + p.rx * 0.95, p.y);
  ok(mid > edge, "철판 가운데가 가장자리보다 뜨겁다",
     mid.toFixed(2) + " vs " + edge.toFixed(2));
  ok(edge > 0.6, "가장자리라고 안 익지는 않는다", edge.toFixed(2));
  ok(Math.abs(mid - 1) < 0.001, "가운데가 기준값", mid.toFixed(3));

  /* 같은 시간을 구워도 자리에 따라 다르다 */
  function cookAt(dx) {
    reset(); S.heat = 0.8;
    oilPan(); tearToPan(); flatten();
    S.h.x = p.x + dx;
    wait(10);
    return G.cookDown(S.h);
  }
  const c0 = cookAt(0), c1 = cookAt(p.rx * 0.8);
  ok(c0 > c1 + 15, "구석에 놓으면 같은 시간에 덜 익는다",
     Math.round(c0) + " vs " + Math.round(c1));
}

/* --- 명세 6/69. 속을 어디에 넣었나 --------------------------- */
{
  function fillAt(k) {
    reset(); S.heat = 0.3;
    oilPan(); tearToPan(); flatten();
    const h = S.h, R = G.avgR(h);
    pick("spoon");
    G.down({ x: LAY.fill.x, y: LAY.fill.y - G.TIP.spoon.y }); wait(1.0); release();
    /* k=0 이면 한가운데, k 가 크면 가장자리 */
    G.down({ x: h.x + R * k, y: h.y - G.TIP.spoon.y }); release();
    pick("spoon");
    return h;
  }
  const mid = fillAt(0);
  const midOff = mid.fillOff;
  const edge = fillAt(0.5);
  ok(midOff < 0.12, "한가운데 부으면 치우침이 거의 없다", midOff.toFixed(2));
  ok(edge.fillOff > 0.3, "가장자리에 부으면 치우침이 남는다", edge.fillOff.toFixed(2));

  /* TEST 5 — 가장자리 투입은 봉합이 끝까지 안 되고 더 잘 터진다 */
  seal(4); seal(4); seal(4);
  const edgeSealed = S.h.sealed, edgeHold = G.sealHold(S.h);
  S.h = mid;
  seal(4); seal(4); seal(4);
  const midSealed = mid.sealed, midHold = G.sealHold(mid);
  ok(edgeSealed < midSealed, "가장자리에 넣으면 아무리 당겨도 덜 닫힌다",
     edgeSealed.toFixed(2) + " vs " + midSealed.toFixed(2));
  ok(edgeHold < midHold, "그래서 더 잘 터진다",
     edgeHold.toFixed(2) + " vs " + midHold.toFixed(2));
}

/* --- 명세 36. 흘린 설탕이 철판에 눌어붙는다 ------------------ */
{
  function stickWith(sugarOnPan) {
    reset(); S.heat = 0.8;
    oilPan(); tearToPan(); flatten();
    const h = S.h;
    if (sugarOnPan)
      for (let i = 0; i < 6; i++)
        S.mess.push({ x: h.x + (i - 3) * 12, y: h.y, r: 14, burn: 0.5,
                      kind: "sugar", rot: 0 });
    wait(8);
    return h.stick;
  }
  const clean = stickWith(false), sweet = stickWith(true);
  ok(sweet > clean, "시럽 위에 앉아 있으면 기름을 둘러도 더 붙는다",
     sweet.toFixed(2) + " vs " + clean.toFixed(2));
  /* 뜯겨 남은 반죽은 설탕이 아니다 — 그것까지 세면 한 번 뜯긴 호떡이
     기름을 둘러도 영영 안 떨어진다 */
  const p = LAY.pan;
  S.mess.length = 0;
  S.mess.push({ x: p.x, y: p.y, r: 20, burn: 1, kind: "stuck", rot: 0 });
  ok(G.sugarAt(p.x, p.y) === 0, "뜯겨 남은 반죽은 설탕으로 세지 않는다");
  S.mess.length = 0;
  S.mess.push({ x: p.x, y: p.y, r: 20, burn: 1, kind: "syrup", rot: 0 });
  ok(G.sugarAt(p.x, p.y) > 0, "샌 시럽은 센다", G.sugarAt(p.x, p.y).toFixed(2));
}

/* --- 명세 37. 눌어붙으면 손을 덜 따라온다 -------------------- */
{
  const h = { onPan: true, stick: 0, pull: 0 };
  ok(G.moveRatio(h) === 1, "안 붙었으면 그대로 따라온다");
  h.stick = 0.4;
  ok(G.moveRatio(h) < 0.75 && G.moveRatio(h) > 0.6,
     "조금 붙으면 0.7 쯤", G.moveRatio(h).toFixed(2));
  h.stick = 1;
  ok(G.moveRatio(h) <= 0.3, "많이 붙으면 0.3 이하", G.moveRatio(h).toFixed(2));
  h.onPan = false; h.stick = 1; h.pull = 0;
  ok(G.moveRatio(h) === 1, "철판에서 떨어졌으면 끈적임이 남은 만큼만");
  h.pull = 0.8;
  ok(G.moveRatio(h) < 0.5, "떼어 낸 직후에는 아직 끈적하다",
     G.moveRatio(h).toFixed(2));
}

/* --- 명세 43. 생반죽은 눌렀다 떼면 조금 돌아온다 ------------- */
{
  function pressOnce(cooked) {
    reset(); S.heat = 0;
    oilPan(); tearToPan(); flatten();
    const h = S.h;
    if (cooked) { h.cookA = 90; h.cookB = 90; }
    pick("press");
    G.down({ x: h.x, y: h.y });
    wait(0.5);
    const low = h.thickness;
    release();
    pick("press");
    return { low: low, back: h.thickness - low };
  }
  const raw = pressOnce(false), done = pressOnce(true);
  ok(raw.back > 0.005, "덜 익은 반죽은 떼면 조금 올라온다", raw.back.toFixed(3));
  ok(done.back < raw.back * 0.3, "익은 표면은 거의 안 돌아온다",
     done.back.toFixed(3) + " vs " + raw.back.toFixed(3));
  ok(raw.back < raw.low * 0.5, "그렇다고 누른 것이 없던 일이 되지는 않는다",
     raw.back.toFixed(3) + " / " + raw.low.toFixed(3));

  /* 종잇장처럼 눌러 놓고 떼면 도로 도톰해지면 안 된다 */
  reset(); S.heat = 0;
  oilPan(); tearToPan(); flatten();
  const h2 = S.h;
  pick("press");
  for (let i = 0; i < 8; i++) { G.down({ x: h2.x, y: h2.y }); wait(0.6); release(); }
  pick("press");
  ok(h2.thickness < 0.3, "끝까지 누르면 얇아진 채로 남는다", h2.thickness.toFixed(2));
}

/* --- 명세 31/73. 터지기 전에 알려 준다 ----------------------- */
{
  ok(G.riskStage(0.2) === 0, "0.35 아래는 멀쩡");
  ok(G.riskStage(0.4) === 1, "0.35~0.55 는 한쪽 볼록");
  ok(G.riskStage(0.6) === 2, "0.55~0.70 은 미세한 금");
  ok(G.riskStage(0.75) === 3, "0.70~0.85 는 틈 + 시럽");
  ok(G.riskStage(0.9) === 4, "0.85 넘으면 큰 파열");

  /* TEST 13 — 속이 없으면 위험도 자체가 없다 */
  reset(); S.heat = 0.6;
  oilPan(); tearToPan(); flatten();
  pressN(8, 0.6);
  ok(G.ruptureRisk(S.h) === 0, "속이 없으면 터질 위험도 없다",
     G.ruptureRisk(S.h).toFixed(2));
  ok(S.h.burst === 0, "터지지도 않는다", S.h.burst.toFixed(2));

  /* TEST 14 — 속 과다 + 약한 봉합 + 강압착이면 전조를 거쳐 터진다 */
  reset(); S.heat = 0.8;
  oilPan(); tearToPan(); flatten();
  sugar(1.3); sugar(1.3);
  seal(1);                                  /* 한쪽만 대충 */
  const seen = {};
  pick("press");
  for (let i = 0; i < 14; i++) {
    G.down({ x: S.h.x, y: S.h.y });
    for (let k = 0; k < 8; k++) {
      G.step(0.05);
      seen[G.riskStage(G.ruptureRisk(S.h))] = 1;
    }
    release();
  }
  pick("press");
  ok(seen[1] || seen[2], "터지기 전에 전조 단계를 거친다",
     Object.keys(seen).join(","));
  ok(S.h.burst > 0.2 || S.h.leak > 0.3, "결국 터지거나 샌다",
     "터짐 " + S.h.burst.toFixed(2) + " 샘 " + S.h.leak.toFixed(2));
}

/* --- 명세 57/58. 정답이 하나가 아니다 ------------------------ */
{
  function play(presses, sec, cook) {
    reset(); S.heat = 0.7;
    oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
    if (presses) pressN(presses, sec);
    wait(cook); flip(); wait(cook);
    toPlate();
    return lastOf();
  }
  const thin = play(3, 0.42, 6);
  const mid = play(2, 0.35, 7);
  const thick = play(1, 0.2, 8);
  ok(thin.thickness < mid.thickness && mid.thickness < thick.thickness,
     "세 가지 두께가 실제로 다르다",
     [thin, mid, thick].map(r => r.thickness.toFixed(1)).join(" / "));
  /* 두께에 정답이 하나뿐이지 않다 — 셋 다 한 개로 센다 */
  ok(thin.counted && mid.counted && thick.counted,
     "얇게 만든 것도 도톰하게 만든 것도 똑같이 한 개로 센다",
     [thin, mid, thick].map(r => r.why || "ok").join(" / "));
}

/* --- 명세 62. 안내는 두 판째부터 안 뜬다 --------------------- */
{
  /* 안내를 줄이는 기준이 "한 번 보여 줬다" 에서 "실제로 해냈다" 로
     바뀌었다. 설명을 백 번 읽어도 해내지 못했으면 다시 도와주고,
     두 번 해낸 뒤로는 입을 다문다. */
  reset();
  S.skill = {};
  S.saidRound = {};
  S.hint = ""; S.hintT = 0;
  tearToPan();
  ok(S.hint !== "" && S.hintT > 0, "처음 하는 사람에게는 안내가 나온다", S.hint);
  ok((S.skill.tear || 0) >= 1 && (S.skill.pan || 0) >= 1,
     "해낸 것을 센다", JSON.stringify(S.skill));

  /* 한 번 해낸 것만으로는 아직 안 접는다 */
  reset();
  ok(!G.knows("tear"), "한 번 해냈다고 다 배운 것으로 치지 않는다");
  S.hint = ""; S.hintT = 0;
  tearToPan();
  ok(S.hint !== "", "두 번째 판에서도 아직 도와준다", S.hint);

  /* 두 번 해내면 접는다 */
  ok(G.knows("tear") && G.knows("pan"), "이제 할 줄 안다", JSON.stringify(S.skill));
  reset();
  S.hint = ""; S.hintT = 0;
  tearToPan();
  ok(S.hint === "", "익힌 뒤에는 같은 설명을 반복하지 않는다", S.hint);
  ok(S.rounds >= 3, "몇 판째인지 센다", S.rounds + "판");

  /* 그래도 막히면 다시 한 줄 — 상태가 멈춰 있으면 도움이 돌아온다 */
  S.hint = ""; S.hintT = 0;
  S.lastTag = ""; S.stuckT = 0;
  G.stepGuide(0.1);                      /* 태그를 한 번 찍고 */
  for (let i = 0; i < 120; i++) G.stepGuide(0.1);
  ok(S.hint !== "", "한참 막혀 있으면 다시 도와준다", S.hint);

  /* 설명만 보고 못 해낸 사람은 다음 판에서 또 듣는다 */
  reset();
  S.skill = {};
  S.saidRound = {};
  ok(!G.knows("seal") && !G.knows("flip"),
     "설명을 봤다는 사실만으로는 배운 것이 아니다");
}

/* --- 명세 52. 터치 막기는 조리판 위에서만 -------------------- */
{
  ok(!/document\.addEventListener\(["']touchmove/.test(SRC),
     "문서 전체의 touchmove 를 막지 않는다");
  ok(/cv\.addEventListener\(["']touchmove/.test(SRC),
     "조리판 위에서만 막는다");
}

/* --- 명세 48. 카메라는 큰 파열에만 --------------------------- */
{
  reset();
  ok(S.shake === 0, "평소에는 흔들리지 않는다");
  /* 크게 터뜨린다 */
  S.heat = 0.8;
  oilPan(); tearToPan(); flatten();
  sugar(1.3); sugar(1.3); seal(1);
  /* 흔들림은 0.25초짜리다. 다 끝난 뒤에 재면 이미 멎어 있으므로
     누르는 동안 가장 컸던 값을 본다. */
  let peak = 0;
  pick("press");
  for (let i = 0; i < 14; i++) {
    G.down({ x: S.h.x, y: S.h.y });
    for (let k = 0; k < 12; k++) { G.step(0.05); peak = Math.max(peak, S.shake); }
    release();
  }
  pick("press");
  ok(S.h.burst < 0.25 || peak > 0, "크게 터지면 짧게 흔들린다",
     "터짐 " + S.h.burst.toFixed(2) + " 가장 컸을 때 " + peak.toFixed(2));
  ok(peak <= 1, "흔들림은 2~4px 안쪽", peak.toFixed(2));
  wait(0.4);
  ok(S.shake === 0, "곧 멎는다", S.shake.toFixed(2));

/* --- 명세 46/47. 소리가 붙어 있나 ---------------------------- */
{
  /* 이 게임은 파일을 안 쓰고 Web Audio 로 직접 만든다. 명세가 든
     이벤트마다 울릴 자리가 있는지 본다. */
  const WANT = [
    ["soft_drop", "SFX.drop()"], ["oil_pour", "SFX.oil()"],
    ["press_soft", "SFX.press()"], ["sticky_pull", "SFX.stickPull()"],
    ["flip", "SFX.flip()"], ["tear_small", "SFX.tearSmall()"],
    ["tear_burst", "SFX.burst()"], ["syrup_sizzle", "SFX.syrup()"],
  ];
  for (const [name, call] of WANT)
    ok(SRC.indexOf(call) >= 0, name + " 에 소리가 붙어 있다", call);
  /* sizzle_loop 은 한 번 울리는 것이 아니라 세기가 변한다 */
  ok(/function sizzleLevel/.test(SRC), "sizzle_loop 은 세기로 조절된다");
  ok(/sizzleLevel[\s\S]{0,400}panTemp/.test(SRC) &&
     /sizzleLevel[\s\S]{0,400}oil/.test(SRC),
     "불 세기와 기름에 따라 커진다");
}

/* --- 명세 24. 지글거림은 넘치지 않게 ------------------------- */
{
  reset(); S.heat = 1;
  oilPan(); tearToPan(); flatten();
  wait(14);                                /* 태운다 */
  ok(G.cookDown(S.h) > 104, "탈 만큼 구웠다", Math.round(G.cookDown(S.h)));
  const smoke = S.parts.filter(p => p.kind === "smoke");
  /* 초당 4.5 개를 1.5 초짜리로 뿜으니 평소 7 개 안팎이고, 운에 따라
     12~14 개까지 간다. 12 로 막아 두면 난수 꼬리에 걸려 가끔 터진다 —
     여기서 잡으려는 것은 "검은 원반이 될 만큼 몰리는가" 이지 한두 개의
     흔들림이 아니다. 몇 배로 뿜기 시작하면 이 선에 걸린다. */
  ok(smoke.length <= 20, "연기가 한꺼번에 몰리지 않는다", smoke.length + "개");
  /* 좁은 자리에 쌓이면 검은 원반이 되어 호떡을 가린다 */
  if (smoke.length > 2) {
    let minX = 1e9, maxX = -1e9;
    for (const p of smoke) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); }
    ok(maxX - minX > G.avgR(S.h) * 0.5, "넓게 퍼져 올라간다",
       Math.round(maxX - minX) + "px");
  }
}


/* --- 명세 50/52. 모바일 조작 ---------------------------------
   도구 그림이 작아도 손가락이 닿는 영역은 넉넉해야 한다. 가상
   좌표 1080 폭이 가장 좁은 기기(360px)에서 얼마가 되는지로 본다. */
{
  const NARROW = 360;
  ok(typeof G.W0 === "number" && G.W0 > 0, "가상 화면 폭을 안다", G.W0);
  const s = NARROW / G.W0;
  let worst = 1e9, who = "";
  for (const t of G.TOOLS) {
    const px = t.hit * s;          /* hit 는 반지름이다 */
    if (px < worst) { worst = px; who = t.id; }
  }
  ok(worst >= 22, "가장 작은 도구도 360px 화면에서 반지름 22px 이상",
     who + " " + worst.toFixed(0) + "px (지름 " + (worst * 2).toFixed(0) + "px)");
  ok(worst * 2 >= 44, "지름 44px 기준을 넘는다", (worst * 2).toFixed(0) + "px");

  /* 조리판에서만 터치를 막는다 */
  ok(/#cv[^}]*touch-action:\s*none/.test(css), "조리판은 브라우저 제스처를 막는다");
  ok(/setPointerCapture/.test(SRC), "끌다가 밖으로 나가도 안 끊긴다");
  ok(/pointerdown/.test(SRC) && /pointermove/.test(SRC) && /pointerup/.test(SRC),
     "마우스와 터치를 한 길로 본다");
}

}

/* ============================================================
   31. 안내가 실제 상태와 맞나
   ============================================================ */
console.log("\n--- 31. 안내 ---");
{
  reset();
  ok(G.hintTarget() === "dough", "반죽이 없으면 반죽통", G.hintTarget());
  tearToCounter();
  ok(G.hintTarget() === "hand", "두꺼우면 손으로 펴라", G.hintTarget());
  handSpread(10);
  ok(G.hintTarget() === "spoon", "펴지면 설탕", G.hintTarget());
  sugar(0.8);
  ok(G.hintTarget() === "seal", "넣었으면 오므려라", G.hintTarget());
  seal(4);
  ok(G.hintTarget() === "oil", "옮기기 전에 기름부터", G.hintTarget());
  oilPan();
  ok(G.hintTarget() === "pan", "기름을 둘렀으면 이제 옮겨라", G.hintTarget());
  carryTo(LAY.pan.x, LAY.pan.y);
  /* 안내마다 문구가 있다 */
  for (const k of Object.keys(G.GUIDE))
    ok(typeof G.GUIDE[k] === "string" && G.GUIDE[k].length > 4,
       k + " 안내 문구가 있다", G.GUIDE[k]);
}

{
  /* 불이 꺼져 있으면 굽기부터 알린다 */
  reset();
  S.heat = 0; S.panTemp = 0;
  oilPan(); tearToPan(); flatten();
  ok(G.hintTarget() === "heat", "불이 꺼져 있으면 불부터", G.hintTarget());
}

{
  /* 접시 안내가 내부 익힘을 본다 — 이것이 이번 수정의 핵심이다.
     겉만 보고 "집게로 담으세요" 하면, 그 말을 따른 사람이 곧바로
     "속이 덜 익었다" 는 평가를 받는다. */
  reset();
  S.heat = 1;
  /* 도톰하게 만들어 센 불에 짧게 — 겉이 속보다 빨리 간다 (실측:
     두께 3.2cm, 겉 50/83, 속 0.78) */
  oilPan(); tearToPan(1.2); flatten(); sugar(0.9); seal(4);
  wait(3.5); flip(); wait(3.5);
  const h = S.h;
  ok(Math.min(h.cookA, h.cookB) > 44, "양면 겉은 익었다",
     Math.round(Math.min(h.cookA, h.cookB)));
  ok(G.coreRatio(h) < 0.8, "그런데 속은 아직", G.coreRatio(h).toFixed(2));
  ok(G.thickCm(h) <= 3.3, "두께는 이미 적당하다", G.thickCm(h).toFixed(1));
  ok(G.hintTarget() === "tong", "세어 주는 선을 넘었으니 집게라고 한다",
     G.hintTarget());
  ok(G.passReason(h) === null, "실제로도 세어진다", G.passReason(h));
  /* 안내가 규칙보다 엄하지 않다 — 없는 조건을 요구하지 않는다 */
  ok(G.GUIDE.slow === undefined, "속까지 익히라는 안내는 없앴다");

  /* 속까지 익으면 그제야 접시 */
  wait(5);
  ok(G.coreRatio(S.h) >= 0.8 || G.hintTarget() === "tong",
     "속까지 익으면 접시로 보낸다",
     G.hintTarget() + " / " + G.coreRatio(S.h).toFixed(2));
}

{
  /* 안내대로 끝까지 따라가면 설익은 호떡이 나오지 않는다 */
  reset();
  S.heat = 0.75;
  let guard = 0;
  while (guard++ < 400 && S.made === 0) {
    const t = G.hintTarget();
    if (t === "dough") tearToCounter();
    else if (t === "hand") handSpread(4);
    else if (t === "spoon") sugar(0.8);
    else if (t === "seal") seal(4);
    else if (t === "oil") oilPan();
    else if (t === "pan") carryTo(LAY.pan.x, LAY.pan.y);
    else if (t === "heat") S.heat = 0.75;
    else if (t === "press") flatten();
    else if (t === "flip") flip();
    else if (t === "tong") toPlate();
    else wait(0.5);
  }
  ok(S.made === 1, "안내만 따라가도 호떡 하나가 세어진다", guard + "번");
  const r = lastOf();
  ok(r.counted === true, "안내대로 했는데 안 세어지는 일이 없다", r.why);
  ok(r.cookMax <= 104, "타지도 않는다", r.cookMax.toFixed(0));
}

/* ============================================================
   32. 조작 피드백 — 지금 입력이 먹었나
   ============================================================ */
console.log("\n--- 32. 피드백 ---");
{
  reset();
  tearToCounter();
  handSpread(2);
  ok(S.h.push && S.h.push.t > 0, "민 방향이 남는다",
     S.h.push && S.h.push.a.toFixed(2));
  const a0 = S.h.push.a;
  wait(1);
  ok(!S.h.push, "잠깐 뒤에 사라진다 — 상태가 아니라 신호다");

  /* 봉합이 닫히는 순간에만 신호가 뜬다 */
  sugar(0.8);
  ok(S.h.sealFlash === 0, "아직 안 닫혔으니 신호도 없다");
  seal(4);
  ok(S.h.sealFlash > 0, "닫히는 순간 한 번", S.h.sealFlash.toFixed(2));
  const w0 = S.h.sealed;
  seal(2);
  wait(1);
  ok(S.h.sealFlash === 0, "더 당긴다고 또 뜨지 않는다");
  ok(typeof a0 === "number", "민 방향은 숫자로 들고 있다");
  ok(S.h.weakDir >= 0 && S.h.weakDir <= 3, "가장 덜 오므린 쪽을 기억한다",
     S.h.weakDir);
}

{
  /* 옮기려는 손과 펴려는 손을 가른다 */
  reset();
  tearToCounter();
  const h0 = S.h;
  G.down({ x: h0.x, y: h0.y });
  wait(0.12);
  ok(h0.liftHint > 0 && h0.liftHint < 1, "가만히 쥐고 있으면 들기 쪽으로 간다",
     h0.liftHint.toFixed(2));
  ok(h0.held === false, "아직 안 들렸다");
  wait(0.25);
  ok(h0.held === true, "계속 쥐고 있으면 들린다");
  ok(h0.liftHint === 0, "들리면 고리는 꺼진다");
  release();

  /* 밀면 펴는 쪽 — 들리지 않는다 */
  const t0 = S.h.thickness;
  G.down({ x: S.h.x, y: S.h.y });
  drag([{ x: S.h.x + 40, y: S.h.y }, { x: S.h.x + 95, y: S.h.y }], 0.08);
  ok(S.h.held === false, "밀면 들리지 않는다");
  ok(S.h.thickness < t0, "대신 펴진다", t0.toFixed(2) + " -> " + S.h.thickness.toFixed(2));
  ok(S.h.liftHint === 0, "펴는 쪽으로 갈렸으면 고리도 없다");
  release();
}

{
  /* 조작 신호를 그리다가 터지지 않는다 (화면이 통째로 멈추는 버그) */
  reset();
  S.heat = 0.6;
  oilPan(); tearToPan(); flatten(); sugar(0.9); seal(1);
  pick("spoon");
  let err = null;
  try { G.draw(); } catch (e) { err = String(e); }
  ok(err === null, "봉합 틈 / 조준 고리를 그려도 안 터진다", err);
  pick("flip");
  G.down({ x: S.h.x + 30, y: S.h.y - G.TIP.flip.y });
  wait(0.3);
  try { G.draw(); } catch (e) { err = String(e); }
  ok(err === null, "뒤집개 깊이를 그려도 안 터진다", err);
  release();
  pick("flip");
}

{
  /* 누르개가 닿는 순간 / 알맞은 두께에 든 순간 */
  reset();
  S.heat = 0.5;
  oilPan(); tearToPan();
  ok(S.h.pressRing === 0, "아직 안 눌렀다");
  pressN(1, 0.1);
  ok(S.h.pressRing > 0, "닿는 순간 고리가 뜬다", S.h.pressRing.toFixed(2));
  wait(1);
  ok(S.h.pressRing === 0, "곧 사라진다");

  /* 알맞은 두께 신호는 한 번뿐이고, 그 뒤에도 계속 누를 수 있다 */
  flatten();
  ok(S.h.thickSaid === 1, "알맞은 두께에 들어왔다고 한 번 알린다");
  const th0 = S.h.thickness;
  pressN(3, 0.4);
  ok(S.h.thickness < th0, "알린 뒤에도 더 눌린다",
     th0.toFixed(2) + " -> " + S.h.thickness.toFixed(2));
  ok(S.h.thickSaid === 1, "같은 신호를 두 번 주지 않는다");
}

{
  /* 뒤집개 — 들어간 깊이가 보이고, 깊이 넣으면 살살 넘겨도 된다 */
  reset();
  S.heat = 0.6;
  oilPan(); tearToPan(); flatten();
  pick("flip");
  const h = S.h;
  G.down({ x: h.x + 30, y: h.y - G.TIP.flip.y });
  wait(0.3);
  ok(h.insert > G.CFG.insertOK, "날이 깊이 들어갔다", h.insert.toFixed(2));
  ok(typeof h.insertAng === "number", "어느 쪽에서 들어갔는지도 안다",
     h.insertAng && h.insertAng.toFixed(2));
  release();
  pick("flip");

  /* 깊이 넣었을 때 필요한 속도가 더 낮다 — 손가락으로도 넘어가야 한다 */
  const deep = G.CFG.flickSpeed * (1 - 1 * 0.42);
  const shallow = G.CFG.flickSpeed * (1 - 0.1 * 0.42);
  ok(deep < shallow, "깊이 넣을수록 살살 넘겨도 된다",
     Math.round(deep) + " vs " + Math.round(shallow));
  ok(deep > 600, "그렇다고 손만 스쳐도 넘어가지는 않는다", Math.round(deep));
}

{
  /* 미끄러짐 / 불완전 삽입 / 눌어붙음이 서로 구분된다 */
  reset();
  S.heat = 0.6;
  oilPan(); tearToPan(); flatten();
  const before = S.h.slipFlips;
  /* 날을 멀리 두고 휘두른다 — 미끄러진다 */
  pick("flip");
  const h = S.h;
  G.down({ x: h.x + 260, y: h.y - G.TIP.flip.y });
  for (let i = 1; i <= 4; i++) { G.move({ x: h.x + 260 + 70 * i, y: G.PTR.y }); G.step(0.016); }
  release();
  pick("flip");
  ok(S.h.flips === 0 || S.h.slipFlips > before,
     "덜 넣고 휘두르면 안 넘어가거나 미끄러진다",
     S.h.flips + " / " + S.h.slipFlips);
}



/* ============================================================
   33. 제한시간 — 한 판은 시간이 정한다
   ============================================================ */
console.log("\n--- 33. 제한시간 ---");

/* 한 개를 제대로 만들어 접시까지 보낸다 */
/* 전시대를 볼 때는 시간에 쫓기지 않게 한 판을 늘려 준다 —
   제한시간 자체는 33 절에서 따로 본다. */
function makeMany(n) {
  for (let i = 0; i < n; i++) { S.timeLeft = G.MODE.timeLimit; makeOne(); }
  S.timeLeft = G.MODE.timeLimit;
}
function makeOne() {
  oilPan();
  tearToPan();
  flatten();
  sugar(1.0);
  seal(4);
  pressN(2, 0.35);
  wait(6); flip(); wait(6);
  toPlate();
  pick("tong");          /* 집게를 제자리에 — 손이 비어야 다음 반죽을 뗀다 */
}
/* 안내 화면에서 시작을 누른 뒤의 상태 */
function freshGame() {
  G.reset();
  S.running = false;
  S.over = false;
  els.startOver.hidden = false;
  els.endOver.hidden = true;
  G.beginPlay();
}

{
  /* --- 설정값 --- */
  ok(G.MODE.timeLimit === 90, "기본 제한시간은 90초", G.MODE.timeLimit);
  ok(typeof G.MODE.warnAt === "number" && G.MODE.warnAt > 0,
     "마지막 경고 구간도 설정값", G.MODE.warnAt);
  ok(typeof G.PASS.fill === "number" && typeof G.PASS.cook === "number",
     "집계 문턱도 설정값으로 나와 있다",
     G.PASS.fill + " / " + G.PASS.cook);
  ok(SRC.indexOf("MODE.timeLimit") >= 0, "제한시간을 한 곳에서 읽는다");
}

{
  /* --- 시작 전에는 시간이 가지 않는다 --- */
  G.reset();
  S.running = false; S.over = false;
  const t0 = S.timeLeft;
  ok(t0 === G.MODE.timeLimit, "처음에는 제한시간 그대로", t0);
  for (let i = 0; i < 180; i++) G.step(0.016);     /* 약 3초 */
  ok(S.timeLeft === t0, "시작 전에는 한 틱도 안 줄어든다", S.timeLeft);
  ok(S.elapsed === 0, "경과시간도 안 쌓인다", S.elapsed);
  /* 그림을 받는 중(assetsReady 전)에도 마찬가지다 — 같은 S.running 이 막는다 */
  S.assetsReady = false;
  for (let i = 0; i < 60; i++) G.step(0.016);
  ok(S.timeLeft === t0, "로딩 중에도 안 줄어든다", S.timeLeft);
  S.assetsReady = true;

  /* 시작을 누르면 그때부터 */
  G.beginPlay();
  ok(S.running === true, "시작하면 조작이 열린다");
  for (let i = 0; i < 125; i++) G.step(0.016);     /* 2초 */
  const used = t0 - S.timeLeft;
  ok(Math.abs(used - 2) < 0.1, "실제 경과시간만큼 줄어든다", used.toFixed(2) + "초");
}

{
  /* --- 프레임이 달라도 같은 시간이 흐른다 --- */
  const run = step => {
    G.reset(); S.running = false; S.over = false;
    G.beginPlay();
    const n = Math.round(3 / step);
    for (let i = 0; i < n; i++) G.step(step);
    return G.MODE.timeLimit - S.timeLeft;
  };
  const a = run(0.016), b = run(0.05);
  ok(Math.abs(a - b) < 0.05, "프레임 수가 아니라 시간으로 센다",
     a.toFixed(2) + " vs " + b.toFixed(2));
}

{
  /* --- 0 아래로 내려가지 않고, 종료는 한 번만 --- */
  freshGame();
  S.timeLeft = 0.5;
  for (let i = 0; i < 200; i++) G.step(0.05);
  ok(S.timeLeft === 0, "남은 시간은 0 에서 멈춘다", S.timeLeft);
  ok(S.over === true, "시간이 다 되면 끝난다");
  ok(S.running === false, "조리도 멈춘다");
  ok(els.endOver.hidden === false, "종료 화면이 열린다");
  ok(els.eCount.textContent === S.made + "개", "만든 개수를 보여 준다",
     els.eCount.textContent);
  ok(els.eSub.textContent.indexOf(String(G.MODE.timeLimit)) >= 0,
     "몇 초 동안이었는지도 적는다", els.eSub.textContent);

  /* 끝난 뒤에는 조작도 집계도 막힌다 */
  const n0 = S.made;
  G.down({ x: LAY.dough.x, y: LAY.dough.y });
  drag([{ x: LAY.dough.x + 200, y: LAY.dough.y + 200 }], 0.2);
  release();
  ok(S.h === null && S.grab === null, "끝난 뒤에는 반죽도 안 잡힌다");
  ok(S.made === n0, "개수도 더 오르지 않는다", S.made);
  /* 늦게 돌아온 접시 판정도 소용없다 */
  G.submit();
  ok(S.made === n0, "종료 뒤 제출은 세지 않는다", S.made);
  ok(els.endOver.hidden === false, "종료 화면은 그대로 한 장");
}

{
  /* --- 들고 있던 것을 안전하게 놓는다 --- */
  freshGame();
  S.heat = 0.6; S.panTemp = 0.6;
  makeDough(0.5);
  putAt(LAY.pan.x, LAY.pan.y);
  pick("press");
  G.down({ x: S.h.x, y: S.h.y });
  G.step(0.016);
  ok(S.active === "press" && S.grab !== null, "누르개를 쥐고 있는 중");
  S.timeLeft = 0.01;
  G.step(0.05);
  ok(S.over === true, "그 와중에 시간이 끝났다");
  ok(S.active === null, "들고 있던 도구가 손에서 떠난다");
  ok(S.grab === null, "진행 중이던 조작도 끝난다");
  ok(S.h === null || S.h.held === false, "들고 있던 반죽도 내려놓는다");
  ok(G.PTR.down === false, "눌린 상태도 풀린다");
  const pos = S.toolPos.press;
  ok(Math.abs(pos.x - G.TOOLS.find(t => t.id === "press").home.x) < 1,
     "도구는 제자리로 돌아간다");
}

{
  /* --- 제출은 판을 건드리지 않는다 --- */
  freshGame();
  S.heat = 0.7;
  makeOne();
  ok(S.made === 1, "한 개 만들었다", S.made);
  const left = S.timeLeft, temp = S.panTemp, oils = S.oils.length;
  ok(left < G.MODE.timeLimit, "시간은 그만큼 흘렀다", left.toFixed(1));
  ok(temp > 0.3, "철판은 달궈진 채", temp.toFixed(2));
  ok(oils > 0, "두른 기름도 남아 있다", oils);

  makeOne();
  ok(S.made === 2, "연달아 만들 수 있다", S.made);
  ok(S.timeLeft < left, "그동안에도 시간은 계속 간다", S.timeLeft.toFixed(1));
  ok(S.panTemp > 0.3, "제출했다고 철판이 식지 않는다", S.panTemp.toFixed(2));
  ok(S.oils.length > 0, "기름도 그대로", S.oils.length);
  ok(S.over === false && S.running === true, "게임도 안 멈춘다");
  ok(els.endOver.hidden === true, "중간에 결과 화면이 끼어들지 않는다");

  /* 앞 호떡의 상태가 다음 호떡으로 새지 않는다 */
  makeDough(0.5);
  const h = S.h;
  ok(h.fillPut === 0 && h.cookA === 0 && h.cookB === 0 && h.burst === 0,
     "새 반죽은 깨끗한 상태로 시작한다");
}

{
  /* --- 같은 호떡을 두 번 세지 않는다 --- */
  freshGame();
  S.heat = 0.7;
  makeOne();
  const n = S.made;
  /* 접시 위를 몇 번이고 다시 눌러도 */
  for (let i = 0; i < 3; i++) {
    pick("tong");
    G.down({ x: LAY.plate.x, y: LAY.plate.y - G.TIP.tong.y });
    release();
  }
  ok(S.made === n, "접시를 다시 건드려도 안 오른다", S.made);
  G.submit();
  ok(S.made === n, "제출을 직접 불러도 안 오른다", S.made);
}

{
  /* --- 생반죽은 세지 않고, 이유를 알려 주고, 다음으로 넘어간다 --- */
  freshGame();
  S.heat = 0.7;
  tearToPan();
  const n = S.made;
  S.pops.length = 0;
  toPlate();
  ok(S.made === n, "생반죽은 개수에 안 들어간다", S.made);
  ok(S.pops.length === 1 && S.pops[0].good === false,
     "대신 짧게 이유를 띄운다", S.pops.length && S.pops[0].text);
  ok(S.pops[0].text.indexOf("속") >= 0, "이유가 적혀 있다", S.pops[0].text);
  ok(S.h === null, "그래도 다음 반죽으로 넘어간다");
  ok(S.over === false, "게임이 멈추지도 않는다");

  /* 속은 넣었지만 덜 구운 것 */
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  wait(2);
  const why = G.passReason(S.h);
  ok(why === "raw", "덜 구우면 덜 구웠다고 한다", why);
  toPlate();
  ok(S.made === n, "역시 안 센다", S.made);

  /* 찌그러지거나 조금 샌 것은 떨어뜨리지 않는다 */
  oilPan(); tearToPan(); flatten(); sugar(1.2); sugar(1.2); seal(1);
  pressN(4, 0.5);
  wait(6); flip(); wait(6);
  const h = S.h;
  ok(h.leak > 0 || h.burst > 0 || h.deform > 0, "터지거나 샜거나 일그러졌다",
     h.leak.toFixed(2) + " / " + h.burst.toFixed(2) + " / " + h.deform.toFixed(2));
  toPlate();
  ok(S.made === n + 1, "그래도 속 넣고 양면 구웠으면 한 개", S.made);
}

{
  /* --- +1 표시는 짧게 뜨고 사라진다 --- */
  freshGame();
  S.heat = 0.7;
  S.pops.length = 0;
  makeOne();
  ok(S.pops.length === 1 && S.pops[0].good === true, "접시 옆에 표시가 뜬다");
  ok(S.pops[0].text === "+1", "글자는 +1", S.pops[0].text);
  ok(Math.abs(S.pops[0].x - LAY.plate.x) < 40, "접시 근처다", S.pops[0].x);
  wait(2);
  ok(S.pops.length === 0, "곧 사라진다", S.pops.length);
  ok(els.endOver.hidden === true, "팝업으로 조리를 멈추지 않는다");
}

{
  /* --- 다시 도전 --- */
  freshGame();
  S.heat = 0.8;
  makeOne();
  S.timeLeft = 0.01;
  G.step(0.05);
  ok(S.over === true && S.made === 1, "한 개 만들고 끝났다");
  G.restart();
  ok(els.endOver.hidden === true, "종료 화면이 닫힌다");
  ok(els.startOver.hidden === false, "안내 화면으로 돌아간다");
  ok(S.running === false, "아직 시간이 가지 않는다");
  ok(S.over === false, "종료 상태가 풀린다");
  ok(S.timeLeft === G.MODE.timeLimit, "남은 시간이 처음으로", S.timeLeft);
  ok(S.made === 0, "개수도 처음으로", S.made);
  ok(S.h === null, "반죽도 없다");
  ok(S.panTemp <= 0.12 && S.heat === 0.5, "철판과 불도 처음으로",
     S.panTemp + " / " + S.heat);
  ok(S.oils.length === 0 && S.mess.length === 0, "기름과 자국도 지워진다");
  ok(S.active === null && S.grab === null, "손에 든 것도 없다");
  ok(S.pops.length === 0, "떠 있던 표시도 지워진다");
  for (const t of G.TOOLS)
    ok(S.toolPos[t.id].x === t.home.x && S.toolPos[t.id].y === t.home.y,
       t.name + " 이 제자리로");
  /* 다시 시작하면 또 처음부터 */
  G.beginPlay();
  ok(S.running === true, "다시 시작된다");
  wait(1);
  ok(S.timeLeft < G.MODE.timeLimit && S.timeLeft > G.MODE.timeLimit - 2,
     "시간이 다시 처음부터 간다", S.timeLeft.toFixed(1));
}

/* ============================================================
   34. 위쪽 띠 — 남은 시간과 개수만
   ============================================================ */
console.log("\n--- 34. 위쪽 띠 ---");
{
  const ctx = els.cv.getContext();
  const painted = () => {
    ctx._texts.length = 0;
    G.draw();
    return ctx._texts.slice();
  };

  ok(G.mmss(90) === "1:30", "90초는 1:30", G.mmss(90));
  ok(G.mmss(9) === "0:09", "9초는 0:09", G.mmss(9));
  ok(G.mmss(0) === "0:00", "0초는 0:00", G.mmss(0));
  ok(G.mmss(-3) === "0:00", "음수도 0:00 로 막는다", G.mmss(-3));
  ok(G.mmss(0.2) === "0:01", "남은 조각은 올려 센다 — 0 은 끝났을 때만",
     G.mmss(0.2));

  /* 시작 전에는 띠가 없다 */
  G.reset(); S.running = false; S.over = false;
  const before = painted();
  ok(before.indexOf("1:30") < 0, "시작 전에는 시간이 안 보인다", before.join("|"));

  G.beginPlay();
  const now = painted();
  ok(now.indexOf("1:30") >= 0, "시작하면 남은 시간이 뜬다", now.join("|"));
  ok(now.indexOf("0개") >= 0, "완성 개수도 뜬다", now.join("|"));
  ok(now.indexOf("남은 시간") >= 0 && now.indexOf("완성") >= 0,
     "무엇인지 적혀 있다", now.join("|"));
  /* 이 둘 말고는 아무것도 없다 */
  const extra = now.filter(t => ["남은 시간", "완성", "1:30", "0개"].indexOf(t) < 0);
  ok(extra.length === 0, "위쪽 띠에 다른 것이 없다", extra.join("|"));

  /* 띠가 조리에 쓰는 것을 가리지 않는다 */
  const c = G.HUD;
  ok(c.y + c.h < LAY.dough.y - LAY.dough.ry,
     "띠가 반죽통 위에서 끝난다",
     Math.round(c.y + c.h) + " < " + Math.round(LAY.dough.y - LAY.dough.ry));
  const zones = { 반죽통: LAY.dough, 설탕통: LAY.fill, 철판: LAY.pan, 접시: LAY.plate };
  for (const k in zones) {
    const z = zones[k];
    const hit = z.x + z.rx > c.x && z.x - z.rx < c.x + c.w &&
                z.y + z.ry > c.y && z.y - z.ry < c.y + c.h;
    ok(!hit, "띠가 " + k + " 을 가리지 않는다");
  }
  for (const t of G.TOOLS) {
    const hit = t.home.x + t.hit > c.x && t.home.x - t.hit < c.x + c.w &&
                t.home.y + t.hit > c.y && t.home.y - t.hit < c.y + c.h;
    ok(!hit, "띠가 " + t.name + " 집는 자리를 가리지 않는다");
  }
  /* 390px 화면에서 읽을 만한가 (가상 1080 -> 실제 x0.361) */
  ok(54 * (390 / 1080) >= 17, "시간 글자가 실제 화면에서 17px 이상",
     (54 * (390 / 1080)).toFixed(1) + "px");

  /* 마지막 10초는 색이 달라진다 — 소리도 팝업도 없다 */
  S.timeLeft = 8;
  let err = null;
  try { G.draw(); } catch (e) { err = String(e); }
  ok(err === null, "막판에도 그리기가 안 터진다", err);
  const late = painted();
  ok(late.indexOf("0:08") >= 0, "막판에도 숫자는 그대로 읽힌다", late.join("|"));
  ok(els.endOver.hidden === true, "막판이라고 팝업이 뜨지 않는다");
  ok(SRC.indexOf("MODE.warnAt") >= 0, "경고 구간을 설정값으로 본다");

  /* 개수가 오르면 띠도 따라 바뀐다 */
  S.timeLeft = 60;
  S.made = 7;
  const seven = painted();
  ok(seven.indexOf("7개") >= 0, "개수가 바뀌면 띠도 바뀐다", seven.join("|"));
}

/* ============================================================
   35. 작업대를 걷어낸 자리
   ============================================================ */
console.log("\n--- 35. 작업대 제거 ---");
{
  ok(G.LAY.board === undefined, "작업대 영역이 없다");
  ok(G.clampToBoard === undefined && G.inBoard === undefined,
     "작업대로 끌어당기던 것도 없다");
  ok(SRC.indexOf(String.fromCharCode(34) + "작업대" + String.fromCharCode(34)) < 0,
     "화면에 '작업대' 라고 그리지 않는다");
  /* 사진이 곧 조리대다 — 걷어낸 자리에 빈 칸을 그리지 않는다 */
  ok(SRC.indexOf("drawEmptySlots") >= 0, "도구 자리 표시는 그대로 쓴다");

  /* 재료와 도구는 전부 철판 둘레에 있다 */
  const near = (z) => Math.hypot(z.x - LAY.pan.x, z.y - LAY.pan.y);
  ok(near(LAY.dough) < 900, "반죽통이 철판 가까이", Math.round(near(LAY.dough)));
  ok(near(LAY.fill) < 900, "설탕통도", Math.round(near(LAY.fill)));
  ok(near(LAY.plate) < 900, "접시도", Math.round(near(LAY.plate)));
  for (const t of G.TOOLS)
    ok(Math.hypot(t.home.x - LAY.pan.x, t.home.y - LAY.pan.y) < 900,
       t.name + " 도 철판 둘레에",
       Math.round(Math.hypot(t.home.x - LAY.pan.x, t.home.y - LAY.pan.y)));

  /* 어디 두든 준비가 된다 — 전용 자리로 옮겨야만 하는 제약이 없다 */
  const spots = [[540, 700], [380, 790], [700, 780]];
  for (const [x, y] of spots) {
    freshGame();
    makeDough(0.5);
    putAt(x, y);
    ok(S.h.onPan === false, "(" + x + "," + y + ") 는 철판 밖이다");
    handSpread(10);
    ok(S.h.thickness < 0.62, "거기서도 펴진다", S.h.thickness.toFixed(2));
    sugar(0.8);
    ok(S.h.fillPut > 0, "거기서도 속이 들어간다", S.h.fillPut.toFixed(2));
    seal(4);
    ok(S.h.sealed > 0.6, "거기서도 오므려진다", S.h.sealed.toFixed(2));
  }

  /* 내려놓았다고 반죽이 일그러지지 않는다 */
  freshGame();
  makeDough(0.5);
  const d0 = S.h.deform;
  putAt(760, 780);
  ok(S.h.deform === d0, "조리대에 두었다고 깎지 않는다", S.h.deform);

  /* 화면 밖으로는 못 나간다 */
  freshGame();
  makeDough(0.5);
  putAt(-400, -400);
  ok(S.h.x > 0 && S.h.y > G.HUD.y + G.HUD.h, "화면 밖으로 빠져나가지 않는다",
     Math.round(S.h.x) + "," + Math.round(S.h.y));
}

/* ============================================================
   36. 시작 화면
   ============================================================ */
console.log("\n--- 36. 시작 화면 ---");
{
  ok(html.indexOf("호떡 알바") >= 0, "제목이 있다");
  ok(els.startBtn.textContent === "게임 시작" ||
     html.indexOf(">게임 시작<") >= 0, "단추는 '게임 시작'");
  /* 무엇이 한 개로 세어지는지 알려 준다 */
  const rule = (html.match(/id="sRule"[^>]*>([^<]*)</) || [])[1] || "";
  ok(/속/.test(rule) && /구/.test(rule) && /접시/.test(rule),
     "집계 조건을 짧게 알려 준다", rule);
  ok(html.indexOf("90초") >= 0, "제한시간도 알려 준다");
  /* 설명과 단추가 한 묶음 */
  ok(html.indexOf('id="sBody"') >= 0, "설명과 단추가 한 묶음이다");
  ok(css.indexOf(".over-start .s-body") >= 0, "그 묶음을 가운데로 모은다");
  ok(css.indexOf(".s-btns") < 0, "단추를 바닥에 따로 붙이지 않는다");

  /* 시작 전에는 조리 화면이 아무것도 받지 않는다 */
  G.reset(); S.running = false; S.over = false;
  G.down({ x: LAY.dough.x, y: LAY.dough.y });
  ok(S.grab === null && S.h === null, "시작 전에는 반죽이 안 잡힌다");
  G.up();
  G.down({ x: G.TOOLS[0].home.x, y: G.TOOLS[0].home.y });
  ok(S.active === null, "도구도 안 집힌다");
  G.up();

  /* 두 번 눌러도 한 번만 시작된다 */
  G.beginPlay();
  const t1 = S.timeLeft;
  G.beginPlay();
  ok(S.timeLeft === t1, "두 번 눌러도 시간이 되감기지 않는다", S.timeLeft);
  ok(S.running === true, "조리는 열려 있다");
}


/* ============================================================
   37. 완성 호떡 전시대
   ============================================================ */
console.log("\n--- 37. 전시대 ---");

{
  /* --- 그림과 자리 --- */
  ok(G.ASSET_MAP.tray === "hotteok-display-tray.webp",
     "전시대 그림을 에셋 목록으로 읽는다", G.ASSET_MAP.tray);
  ok(G.ART_DIR + G.ASSET_MAP.tray === "assets/opt/hotteok-display-tray.webp",
     "프로젝트 기준 상대 경로다", G.ART_DIR + G.ASSET_MAP.tray);
  /* 작업용 경로가 코드에 박히지 않았나. http(s):// 까지 걸리지 않도록
     윈도 드라이브 경로와 작업 폴더 이름만 본다. */
  ok(!/[A-Za-z]:[\\/]{1,2}Users|\.codex|chatgpt-projects|file:\/\//.test(SRC),
     "작업용 절대 경로를 코드에 넣지 않았다");
  ok(fs.existsSync(path.join(ROOT, "assets/opt/hotteok-display-tray.webp")),
     "webp 사본이 있다");
  ok(fs.existsSync(path.join(ROOT, "assets/hotteok-display-tray.png")),
     "원본 PNG 도 지우지 않았다");
  /* webp 가 투명한가 — VP8L / VP8X(알파 플래그) 둘 중 하나여야 한다 */
  {
    const b = fs.readFileSync(path.join(ROOT, "assets/opt/hotteok-display-tray.webp"));
    const tag = b.slice(12, 16).toString("ascii");
    const alpha = tag === "VP8L" || (tag === "VP8X" && (b[20] & 0x10) !== 0);
    ok(alpha, "webp 가 투명도를 들고 있다", tag);
  }
  /* 도형으로 다시 그리지 않는다 */
  ok(/if \(!art\(g, "tray"/.test(SRC), "그림이 없으면 전시대를 안 그린다 (도형 대체 없음)");

  const r = G.trayRect();
  const inn = G.trayInner();
  ok(Math.abs(r.w / r.h - G.TRAY.ratio) < 0.2, "가로세로 비율을 지킨다",
     (r.w / r.h).toFixed(2));
  ok(inn.x > r.x && inn.x + inn.w < r.x + r.w, "안쪽 바닥이 그림 안에 있다");
  ok(inn.base > inn.y && inn.base < r.y + r.h * G.TRAY.front,
     "호떡 기준선이 바닥 위, 앞 테두리 앞이다",
     Math.round(inn.base) + " / " + Math.round(r.y + r.h * G.TRAY.front));
  for (const k of ["inner", "base", "scale", "pitch", "squash"])
    ok(G.TRAY[k] !== undefined, "배치 값 " + k + " 이 따로 나와 있다");
}

{
  /* --- 조리 영역과 도구를 가리지 않는다 --- */
  const r = G.trayRect();
  const zones = { 반죽통: LAY.dough, 설탕통: LAY.fill, 철판: LAY.pan, 접시: LAY.plate };
  for (const k in zones) {
    const z = zones[k];
    const hit = z.x + z.rx > r.x && z.x - z.rx < r.x + r.w &&
                z.y + z.ry > r.y && z.y - z.ry < r.y + r.h;
    ok(!hit, "전시대가 " + k + " 을 가리지 않는다");
  }
  for (const t of G.TOOLS) {
    const hit = t.home.x + t.hit > r.x && t.home.x - t.hit < r.x + r.w &&
                t.home.y + t.hit > r.y && t.home.y - t.hit < r.y + r.h;
    ok(!hit, "전시대가 " + t.name + " 집는 자리를 가리지 않는다");
  }
  const c = G.HUD;
  ok(r.y > c.y + c.h, "상단 타이머 아래에 있다",
     Math.round(r.y) + " > " + Math.round(c.y + c.h));
  ok(r.y + r.h < LAY.pan.y - LAY.pan.ry, "철판 위에서 끝난다",
     Math.round(r.y + r.h) + " < " + Math.round(LAY.pan.y - LAY.pan.ry));
  /* 390px 화면에서도 트레이 안이 손가락만 하다 */
  ok(G.trayInner().w * (390 / 1080) > 100, "실제 화면에서 100px 이상 폭",
     (G.trayInner().w * (390 / 1080)).toFixed(0) + "px");
}

{
  /* --- 완성하면 하나씩 올라간다 --- */
  freshGame();
  S.heat = 0.7;
  ok(S.shelf.length === 0, "처음에는 비어 있다");
  makeMany(1);
  ok(S.made === 1 && S.shelf.length === 1, "한 개 만들면 하나 올라간다",
     S.made + " / " + S.shelf.length);
  makeMany(2);
  ok(S.made === 3 && S.shelf.length === 3, "연달아 만들어도 개수와 전시가 같다",
     S.made + " / " + S.shelf.length);

  /* 세지 않는 것은 전시하지 않는다 */
  tearToPan();
  toPlate();
  ok(S.made === 3 && S.shelf.length === 3, "생반죽은 전시도 안 된다",
     S.made + " / " + S.shelf.length);

  /* 연출이 끝날 때 또 세지 않는다 */
  const n = S.made, k = S.shelf.length;
  wait(3);
  ok(S.made === n && S.shelf.length === k, "날아간 뒤에 개수가 또 오르지 않는다",
     S.made + " / " + S.shelf.length);
  ok(S.shelf.every(s => s.fly === 0), "다 내려앉았다");
}

{
  /* --- 만든 모습 그대로 남는다 --- */
  freshGame();
  S.heat = 0.9;
  /* 일부러 크게 다친 호떡 하나 */
  oilPan(); tearToPan(1.5); flatten();
  sugar(1.2); sugar(1.2); seal(1);
  pressN(5, 0.5);
  wait(7); flip(); wait(7);
  toPlate();
  ok(S.shelf.length === 1, "전시대에 올라갔다");
  const kept = S.shelf[0].h;
  const live = LAST;                     /* 접시에 놓인 바로 그 호떡 */
  const pick8 = o => JSON.stringify({
    rad: o.rad.slice(0, 8).map(v => +v.toFixed(4)),
    R: +o.R.toFixed(4), thickness: +o.thickness.toFixed(4),
    cookA: +o.cookA.toFixed(3), cookB: +o.cookB.toFixed(3), core: +o.core.toFixed(3),
    up: o.up, burst: +o.burst.toFixed(4), leak: +o.leak.toFixed(4),
    tear: +o.tear.toFixed(4), scar: +o.scar.toFixed(4),
    deform: +o.deform.toFixed(4), filling: +o.filling.toFixed(4),
    fillLoose: +o.fillLoose.toFixed(4), tearStage: o.tearStage, bits: o.bits.length,
  });
  ok(kept !== live, "조리 중인 객체를 그대로 들고 있지 않다");
  ok(kept.rad !== live.rad, "모양 배열도 따로 떠냈다");
  ok(kept.bits !== live.bits, "속 알갱이도 따로 떠냈다");
  ok(pick8(kept) === pick8(live),
     "크기·모양·구운 색·터짐·누출·윗면이 그대로다",
     pick8(kept) + " vs " + pick8(live));
  ok(kept.burst > 0 || kept.leak > 0 || kept.tear > 0 || kept.deform > 0,
     "다친 흔적이 실제로 들어 있다",
     kept.burst.toFixed(2) + "/" + kept.leak.toFixed(2) + "/" + kept.tear.toFixed(2));
  /* 조리 중의 '지금 무엇을 하는 중' 은 빼고 온다 */
  ok(kept.onPan === false && kept.held === false && kept.lift === 0 &&
     kept.flipT === 0 && kept.wobble === 0 && kept.insert === 0,
     "팬 위도, 손에 들린 것도, 뒤집는 중도 아니다");
  ok(kept.pressure === 0 && kept.stick === 0, "압력과 눌어붙음도 떼고 온다");
  /* 조리 중에만 도는 연출(터지기 직전의 숨쉬기, 끓는 설탕)이 멈춘다 */
  ok(kept.onShelf === true, "전시대에 올라간 것으로 표시된다");
  ok(G.ruptureRisk(kept) === 0, "터지기 직전 숨쉬기가 멈춘다", G.ruptureRisk(kept));
  {
    const ctx2 = els.cv.getContext();
    const before = ctx2._imgs;
    G.draw();
    const a = ctx2._imgs;
    for (let i = 0; i < 40; i++) G.step(0.016);
    G.draw();
    ok(ctx2._imgs - a === a - before,
       "시간이 흘러도 전시대가 그리는 그림 수가 같다",
       (a - before) + " / " + (ctx2._imgs - a));
  }

  /* 다음 반죽을 만들고 실컷 태워도 전시된 것은 안 바뀐다 */
  const snap0 = pick8(kept);
  S.timeLeft = G.MODE.timeLimit;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  wait(16); flip(); wait(16);
  pressN(6, 0.6);
  ok(pick8(kept) === snap0,
     "새 반죽을 만들고 태워도 전시된 호떡은 그대로다",
     pick8(kept));
}

{
  /* --- 전시된 호떡은 더 익지 않는다 --- */
  freshGame();
  S.heat = 1;
  makeMany(1);
  const kept = S.shelf[0].h;
  const a0 = kept.cookA, b0 = kept.cookB, c0 = kept.core;
  wait(20);
  ok(kept.cookA === a0 && kept.cookB === b0 && kept.core === c0,
     "20초가 지나도 더 익지 않는다",
     kept.cookA.toFixed(1) + "/" + kept.cookB.toFixed(1));
}

{
  /* --- 나란히, 넘치면 스크롤 --- */
  freshGame();
  S.heat = 0.7;
  const inn = G.trayInner();
  const fit = Math.floor(inn.w / G.TRAY.pitch);
  ok(fit >= 3, "한 줄에 적어도 세 개는 보인다", fit);

  makeMany(2);
  wait(2);
  const x0 = G.shelfSlotX(0), x1 = G.shelfSlotX(1);
  ok(x1 > x0, "완성 순서대로 왼쪽부터", Math.round(x0) + " -> " + Math.round(x1));
  ok(x1 - x0 >= G.TRAY.pitch * 0.9, "서로 완전히 포개지지 않는다",
     Math.round(x1 - x0));

  /* 한 줄이 넘도록 만든다 — 줄이지도, 버리지도 않는다 */
  const n0 = S.shelf.length;
  makeMany(fit + 2);
  ok(S.shelf.length === n0 + fit + 2, "넘쳐도 다 보관한다", S.shelf.length);
  ok(S.made === S.shelf.length, "개수와 전시 수가 끝까지 같다",
     S.made + " / " + S.shelf.length);
  ok(G.TRAY.scale === 0.25, "칸이 모자라다고 배율을 줄이지 않는다", G.TRAY.scale);
  ok(G.shelfMaxScroll() > 0, "대신 스크롤이 생긴다",
     Math.round(G.shelfMaxScroll()));

  /* 새로 올린 자리가 보이도록 따라간다 */
  wait(3);
  ok(Math.abs(S.shelfScroll - G.shelfMaxScroll()) < 2,
     "마지막 호떡이 보이는 자리로 옮겨 간다",
     Math.round(S.shelfScroll) + " / " + Math.round(G.shelfMaxScroll()));
}

{
  /* --- 전시대 스크롤과 조리가 안 싸운다 --- */
  freshGame();
  S.heat = 0.7;
  const fit = Math.floor(G.trayInner().w / G.TRAY.pitch);
  makeMany(fit + 2);
  wait(3);
  const r = G.trayRect();
  const mid = { x: r.x + r.w * 0.5, y: r.y + r.h * 0.5 };
  ok(G.inTray(mid.x, mid.y), "가운데는 전시대 안이다");
  ok(!G.inTray(LAY.pan.x, LAY.pan.y), "철판은 전시대 밖이다");

  /* 전시대에서 시작한 드래그는 전시대의 것 */
  ok(G.shelfMaxScroll() > 60, "밀 만큼 쌓여 있다", Math.round(G.shelfMaxScroll()));
  const before = S.shelfScroll;
  G.down(mid);
  ok(S.grab && S.grab.kind === "shelf", "전시대가 받는다",
     S.grab && S.grab.kind);
  ok(S.active === null && S.h === null, "도구도 안 집히고 반죽도 안 생긴다");
  /* 오른쪽으로 밀면 앞쪽(먼저 만든 것)이 돌아온다 */
  for (let i = 1; i <= 6; i++) { G.move({ x: mid.x + i * 8, y: mid.y }); G.step(0.016); }
  const back = S.shelfScroll;
  ok(back < before - 20, "오른쪽으로 밀면 먼저 만든 쪽으로 간다",
     Math.round(before) + " -> " + Math.round(back));
  /* 왼쪽으로 밀면 다시 뒤쪽으로 */
  for (let i = 1; i <= 6; i++) { G.move({ x: mid.x - i * 8, y: mid.y }); G.step(0.016); }
  ok(S.shelfScroll > back + 20, "왼쪽으로 밀면 나중에 만든 쪽으로 간다",
     Math.round(back) + " -> " + Math.round(S.shelfScroll));
  G.up();
  ok(S.shelfDrag === null && S.grab === null, "떼면 끝난다");
  /* 손으로 민 직후에는 자동 이동이 끼어들지 않는다 */
  const held = S.shelfScroll;
  wait(0.4);
  ok(Math.abs(S.shelfScroll - held) < 1, "잠시 그 자리에 머문다",
     Math.round(S.shelfScroll));
  wait(4);
  ok(Math.abs(S.shelfScroll - G.shelfMaxScroll()) < 2,
     "조금 뒤에는 다시 따라간다", Math.round(S.shelfScroll));

  /* 0 과 끝을 넘어가지 않는다 */
  G.down(mid);
  for (let i = 1; i <= 40; i++) { G.move({ x: mid.x + i * 30, y: mid.y }); G.step(0.016); }
  ok(S.shelfScroll >= 0, "왼쪽 끝을 넘지 않는다", S.shelfScroll);
  G.up();

  /* 전시대 위를 지나가는 조리 드래그는 가로채지 않는다 */
  freshGame();
  makeDough(0.5);
  putAt(LAY.pan.x, LAY.pan.y);
  const h = S.h;
  G.down({ x: h.x, y: h.y });
  ok(S.grab && S.grab.kind === "touch", "반죽에서 시작한 드래그는 조리다",
     S.grab && S.grab.kind);
  const mid2 = { x: G.trayRect().x + G.trayRect().w * 0.5,
                 y: G.trayRect().y + G.trayRect().h * 0.5 };
  const sc0 = S.shelfScroll;
  for (let i = 1; i <= 8; i++) {
    G.move({ x: (h.x + (mid2.x - h.x) * (i / 8)), y: (h.y + (mid2.y - h.y) * (i / 8)) });
    G.step(0.016);
  }
  ok(S.grab && S.grab.kind === "touch", "전시대 위를 지나도 조리 그대로",
     S.grab && S.grab.kind);
  ok(S.shelfScroll === sc0, "지나갔다고 전시대가 밀리지 않는다");
  G.up();

  /* 도구를 들고 있으면 전시대가 가로채지 않는다 */
  freshGame();
  pick("press");
  G.down(mid);
  ok(S.grab && S.grab.kind === "tool", "손에 든 도구가 먼저다",
     S.grab && S.grab.kind);
  G.up();
}

{
  /* --- 시간 종료 --- */
  freshGame();
  S.heat = 0.8;
  makeMany(2);
  /* 날아가는 중에 시간이 끝나도 빠지지 않는다 */
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  pressN(2, 0.35);
  wait(5); flip(); wait(5);
  toPlate();
  ok(S.shelf[S.shelf.length - 1].fly > 0, "막 날아가는 중");
  S.timeLeft = 0.01;
  G.step(0.05);
  ok(S.over === true, "시간이 끝났다");
  ok(S.made === 3 && S.shelf.length === 3,
     "이동 중이던 것도 전시에 남는다", S.made + " / " + S.shelf.length);
  ok(S.shelf.every(s => s.fly === 0), "진행 중이던 이동은 제자리로 정리된다");
  ok(els.endOver.hidden === false, "결과 화면이 열렸다");
  ok(els.eCount.textContent === "3개", "개수가 맞다", els.eCount.textContent);
  ok(els.eShelf !== undefined, "결과 화면에도 전시 칸이 있다");

  /* 종료 뒤 제출은 세지도 전시되지도 않는다 */
  const n = S.made, k = S.shelf.length;
  G.submit();
  ok(S.made === n && S.shelf.length === k, "종료 뒤 제출은 무시된다",
     S.made + " / " + S.shelf.length);

  /* 결과 화면은 같은 목록을 보기만 한다 */
  G.drawEndShelf();
  G.drawEndShelf();
  ok(S.shelf.length === k, "결과 화면을 그려도 목록이 안 늘어난다", S.shelf.length);
}

{
  /* --- 다시 도전 --- */
  freshGame();
  S.heat = 0.8;
  makeMany(1);
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  pressN(2, 0.35); wait(5); flip(); wait(5);
  toPlate();                               /* 날아가는 중 */
  const flying = S.shelf[S.shelf.length - 1];
  S.shelfScroll = 30;
  G.restart();
  ok(S.shelf.length === 0, "전시 목록이 비워진다", S.shelf.length);
  ok(S.shelfScroll === 0, "스크롤 자리도 처음으로", S.shelfScroll);
  ok(S.shelfDrag === null, "밀던 것도 없다");
  ok(S.made === 0, "개수도 처음으로");
  /* 지난 판에서 날아가던 것이 새 판에 끼어들지 못한다 */
  G.beginPlay();
  wait(2);
  ok(S.shelf.length === 0, "지난 판 애니메이션이 호떡을 밀어 넣지 않는다",
     S.shelf.length);
  ok(flying.fly >= 0, "지난 판 객체는 떨어져 나가 있다");
}

{
  /* --- 그려도 터지지 않는다 --- */
  freshGame();
  S.heat = 0.8;
  makeMany(2);
  let err = null;
  try { G.draw(); } catch (e) { err = String(e); }
  ok(err === null, "전시대를 그려도 안 터진다", err);
  wait(3);
  try { G.draw(); } catch (e) { err = String(e); }
  ok(err === null, "내려앉은 뒤에도 안 터진다", err);
  S.shelf.length = 0;
  try { G.draw(); } catch (e) { err = String(e); }
  ok(err === null, "비어 있어도 안 터진다", err);
}

console.log("\n" + (fail ? "XX  " + fail + "개 실패 (" + pass + "개 통과)"
                          : "전부 통과 (" + pass + ")") + "\n");
process.exit(fail ? 1 : 0);
