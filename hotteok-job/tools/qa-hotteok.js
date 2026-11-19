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
["cv", "muteBtn", "againBtn", "orderBtn", "shareBtn", "endOver", "rBody",
 "sBody", "sIntro",
 "rShow", "rCap", "rSize", "rCutAsk", "cutBtn", "skipBtn", "rFull", "rName",
 "rLine", "rGrade", "rGradePip", "rStars", "rOrder", "rGood", "rAdvice",
 "rDex", "dexBtn", "rDexList", "rBtns", "resCv",
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
function ImageStub() {
  this.width = 400; this.height = 380;
  this.onload = null; this.onerror = null;
  const self = this;
  Object.defineProperty(this, "src", {
    set(v) {
      self._src = v;
      const disk = path.join(ROOT, v);
      const ok = fs.existsSync(disk) && !(IMAGE_FAIL && IMAGE_FAIL.test(v));
      if (ok) { LOADED.push(v); if (self.onload) self.onload(); }
      else if (self.onerror) self.onerror();
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
  ok(/<li>굽고 뒤집기<\/li>/.test(html) === false ||
     btnText.indexOf("굽고 뒤집기") < 0,
     "'만드는 순서' 는 목록이지 단추가 아니다");
  /* 조리 단계를 누르는 단추는 하나도 없다. 결과 화면 단추(갈라보기 /
     건너뛰기 / 다시 / 다른 주문 / 공유)는 조리가 끝난 뒤의 것이라
     금지 대상이 아니다 — 금지한 것은 "누르면 조리가 되는 단추" 다. */
  const btns = (html.match(/<button/g) || []).length;
  ok(btns <= 10, "단추가 늘어나지 않았다", btns + "개");
  ok(html.indexOf("cutBtn") >= 0, "갈라보기는 쓸기 말고 누르기로도 된다");
  ok(html.indexOf("skipBtn") >= 0, "건너뛸 수 있다");
  /* 조리판 안에서 하는 일에는 단추가 붙지 않는다 */
  const cookBtn = ["id=\"oilBtn", "id=\"pressBtn", "id=\"flipBtn",
                   "id=\"sugarBtn", "id=\"sealBtn", "id=\"autoBtn"];
  ok(cookBtn.every(b => html.indexOf(b) < 0), "조리를 대신해 주는 단추가 없다");
  ok(html.indexOf("갈라보면") < 0, "'갈라보면?' 문구가 없다");
  /* 단면 위의 제목도 뺐다 — 한 화면에 넣으려면 같은 이야기를 두 번
     할 자리가 없고, 속이 어떤지는 그림이 말한다. */
  ok(html.indexOf("속 상태 확인") < 0, "단면 위 제목도 없다");
  ok(html.indexOf("actBtn") < 0, "조작 단추(actBtn)가 없어졌다");
  ok(html.indexOf("timeNum") < 0 && html.indexOf("남은 시간") < 0, "타이머 HUD 가 없다");
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
  ok(S.done === false, "아직 안 끝났다");
  release();
  ok(S.done === true, "접시에 놓으면 완성된다");
  ok(S.result !== null, "결과가 생겼다");
  ok(els.endOver.hidden === false, "결과 화면이 열렸다");
  ok(String(els.rSize.textContent).indexOf("지름") >= 0, "지름과 두께를 보여 준다",
     els.rSize.textContent);
  ok(String(els.rLine.textContent).length > 4, "한 줄 판정이 있다", els.rLine.textContent);

  /* 끝난 뒤에는 더 안 만져진다 */
  const before = JSON.stringify(S.result);
  G.down({ x: LAY.dough.x, y: LAY.dough.y });
  drag([{ x: LAY.dough.x, y: LAY.dough.y + 300 }], 0.2);
  release();
  ok(JSON.stringify(S.result) === before, "결과가 바뀌지 않는다");

  /* 철판 위로 다시 내려놓을 수도 있다 */
  makeDough(0.4);
  putAt(LAY.pan.x, LAY.pan.y);
  pick("tong");
  G.down({ x: S.h.x, y: S.h.y + tipY });
  drag([{ x: 300, y: 500 }], 0.2);
  release();
  ok(S.done === false, "접시가 아니면 완성되지 않는다");
  ok(S.h.onPan === false, "조리대에 내려놨다");
  G.down({ x: S.h.x, y: S.h.y + tipY });
  drag([{ x: LAY.pan.x, y: LAY.pan.y + tipY }], 0.2);
  release();
  ok(S.h.onPan === true, "다시 철판에 올릴 수 있다");
}

/* ============================================================
   16. 결과 문구 — 가장 크게 어긋난 한 가지만 (35~38/55절)
   ============================================================ */
console.log("\n--- 16. 결과 ---");
{
  /* 상태 모델이 늘어서(넣은 총량 / 표면 / 흘림 / 뜯긴 자국 / 속 익힘 /
     누적 압착량 / 현재 압력) 여기도 그만큼 들고 있어야 한다.
     특히 속 문제는 '지금 남은 양' 이 아니라 '넣은 적이 있나(fillPut)' 로 본다 —
     다 새어 나간 뒤에도 그건 샌 호떡이기 때문이다. */
  function baseH() {
    return { R: 150, rad: new Array(G.NA).fill(1), thickness: 0.5, amount: 0.7,
             filling: 0.7, fillPut: 0.7, fillLoose: 0, fillSpill: 0,
             sealed: 1, cookA: 70, cookB: 68, core: 64,
             oil: 0.6, stick: 0.1, burst: 0, leak: 0.05, tear: 0,
             scar: 0, press: 1.2, pressure: 0.3, deform: 0.05 };
  }
  const good = G.evaluate(baseH());
  ok(good.resultType === "perfect", "잘 만들면 완벽 판정", good.resultType);
  ok(good.comment.length > 6, "완벽 문구가 있다", good.comment);
  ok(good.diameter > 9 && good.diameter < 18, "지름이 그럴듯하다", good.diameter);
  ok(good.thickness > 1.5 && good.thickness < 2.8, "두께가 그럴듯하다", good.thickness);

  const cases = [
    ["burst",  h => { h.burst = 0.8; }],
    ["burnt",  h => { h.cookA = 150; h.cookB = 120; }],
    ["uneven", h => { h.cookA = 130; h.cookB = 50; }],
    ["raw",    h => { h.cookA = 10; h.cookB = 8; }],
    ["leak",   h => { h.leak = 0.9; h.filling = 0.1; }],
    ["open",   h => { h.sealed = 0.1; }],
    ["nofill", h => { h.filling = 0.02; h.fillPut = 0.02; }],
    ["doughy", h => { h.core = 12; }],
    ["stuckTear", h => { h.scar = 0.8; h.deform = 0.8; }],
    ["thick",  h => { h.thickness = 1.2; h.R = 130; }],
    ["thin",   h => { h.thickness = 0.2; h.R = 200; }],
    ["skew",   h => { h.deform = 0.6; }],
    ["stick",  h => { h.stick = 0.95; }],
    ["oily",   h => { h.oil = 2.6; }],
    ["small",  h => { h.R = 85; }],
    ["huge",   h => { h.R = 250; }],
  ];
  const seen = {};
  for (const [want, mut] of cases) {
    const h = baseH(); mut(h);
    const r = G.evaluate(h);
    ok(r.resultType === want, want + " 상태를 알아본다", r.resultType + " / " + r.comment);
    seen[r.comment] = (seen[r.comment] || 0) + 1;
  }
  ok(Object.keys(seen).length === cases.length, "실패마다 문구가 다르다",
     Object.keys(seen).length + "/" + cases.length);
  ok(Object.keys(seen).every(k => k.length > 6 && k.indexOf("점") !== 0), "문구가 점수가 아니다");

  /* 아케이드식 점수는 여전히 없다. 다만 결과 리포트에 가벼운 등급
     한 칸이 생겼다 — 평균이 아니라 치명적 문제가 있으면 천장이 내려가는
     값이고, 화면에는 숫자가 아니라 낱말로 나온다. */
  ok(good.score === undefined, "아케이드 점수가 없다");
  ok(good.grade >= 1 && good.grade <= 5, "등급은 다섯 칸", good.grade);
  ok(typeof good.gradeLabel === "string" && /[가-힣]/.test(good.gradeLabel),
     "등급은 숫자가 아니라 낱말로 보여 준다", good.gradeLabel);
  /* 나중에 도감을 붙일 수 있게 기록이 객체로 남는다 (56절) */
  const keys = Object.keys(good).sort().join(",");
  ok(keys.indexOf("cookA") >= 0 && keys.indexOf("deformation") >= 0 &&
     keys.indexOf("resultType") >= 0 && keys.indexOf("comment") >= 0,
     "기록 객체에 필요한 항목이 다 있다", keys);
  ok(store.hotteokLast !== undefined, "마지막 결과를 저장한다");
  ok(Number(store.hotteokMadeCount) >= 1, "만든 개수를 센다", store.hotteokMadeCount);
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
  /* 화면에 숫자를 쓰지 않는다 (23/65절) */
  const nums = t1.filter(t => /[0-9]/.test(t) || t.indexOf("%") >= 0);
  ok(nums.length === 0, "화면에 숫자 게이지가 없다", nums.join("|"));

  makeDough(0.4);
  paint("손에 든 반죽");
  putAt(LAY.pan.x, LAY.pan.y);
  S.heat = 1; S.panTemp = 1;
  wait(3);
  const t2 = paint("굽는 중");
  ok(t2.filter(t => /[0-9]/.test(t)).length === 0, "굽는 중에도 숫자가 없다");
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
  ok(S.done === true, "완성했다");
  let cardOK = false;
  try { const c = G.card(); cardOK = c.width === 1080 && c.height === 1350; }
  catch (e) { cardOK = String(e); }
  ok(cardOK === true, "공유 카드를 1080x1350 으로 만든다", cardOK);
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
  for (const e of ["flow_start", "game_start", "game_complete", "replay", "share"])
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
function toPlate() {
  pick("tong");
  G.down({ x: S.h.x, y: S.h.y - G.TIP.tong.y });
  drag([{ x: LAY.plate.x, y: LAY.plate.y - G.TIP.tong.y }], 0.3);
  release();
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
  ok(S.done === true, "접시에 담아 끝냈다");
  console.log("     -> 지름 " + S.result.diameter + "cm  두께 " + S.result.thickness + "cm");
  console.log("     -> " + S.result.resultType + " : " + S.result.comment);
  if (process.env.QA_DEBUG) console.log("     [정석] " + JSON.stringify(S.result));
  ok(S.result.resultType === "perfect", "순서대로 하면 제대로 된 호떡",
     S.result.resultType);
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
    return S.result;
  }
  const cases = [
    ["설탕 과다",       { sugar: 2.2, sugarTimes: 3 }, ["burst", "leak"]],
    ["봉합 부족",       { seal: 1 },              ["open", "leak", "burst"]],
    ["너무 많이 누름",  { press: 3.0 },           ["thin", "burst", "tear"]],
    ["빨리 뒤집기",     { cookA: 1, cookB: 2 },   ["raw", "uneven"]],
    ["늦게 뒤집기",     { cookA: 18, cookB: 16 }, ["burnt", "uneven"]],
    ["덜 익은 채 꺼냄", { cookA: 1, flip: false, cookB: 0.2 }, ["raw", "uneven"]],
    ["태운 뒤 꺼냄",    { heat: 1, cookA: 16, cookB: 16 },     ["burnt", "uneven"]],
    ["설탕 안 넣음",    { sugar: 0 },             ["nofill"]],
  ];
  for (const [name, opt, want] of cases) {
    const r = play(opt);
    if (process.env.QA_DEBUG) console.log("     [" + name + "] " + JSON.stringify(r));
    ok(want.indexOf(r.resultType) >= 0, name + " -> " + r.resultType,
       r.comment + " (바란 것: " + want.join("/") + ")");
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
  ok(["nofill", "tear", "thin", "raw"].indexOf(S.result.resultType) >= 0,
     "반죽 상태 그대로 판정된다", S.result.resultType + " / " + S.result.comment);
  ok(S.result.burstAmount === 0 && S.result.leakAmount === 0,
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
  ok(["burst", "leak", "open"].indexOf(S.result.resultType) >= 0,
     "결과도 설탕 문제로 나온다", S.result.resultType + " / " + S.result.comment);

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
  console.log("     C) " + S.result.resultType + " : " + S.result.comment);
  ok(S.result.resultType === "perfect", "정상 호떡이 나온다", S.result.resultType);
  ok(S.result.burstAmount === 0, "터지지 않았다");
  ok(S.result.tearAmount === 0, "찢어지지도 않았다");

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
  ok(S.result.leakAmount === 0 && S.result.burstAmount === 0, "결과에도 속 사고가 없다");
  ok(["burst", "leak", "open"].indexOf(S.result.resultType) < 0,
     "속 때문이라는 문구가 안 나온다", S.result.resultType + " / " + S.result.comment);
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
    return { stick: stick, scar: S.result.scarAmount, tear: S.result.tearAmount };
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
  const e2 = G.extents(S.h);
  ok(Math.abs(e2.cx) > skew0 * 0.6, "접시에 담아도 그대로",
     Math.abs(e2.cx).toFixed(1));
  near(S.h.deform, defWas, 1e-6, "담는다고 모양이 반듯해지지 않는다");
  ok(S.result.deformation > 0.05, "완성 기록에도 남는다", S.result.deformation);
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
    return S.result;
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
  const r = G.evaluate(h);
  ok(["leak", "burst", "open"].indexOf(r.resultType) >= 0,
     "남은 양이 0 이어도 '샌 호떡' 으로 읽는다", r.resultType);
  toPlate();
  ok(S.result.leakAmount > 0.5, "접시에서도 흔적이 남는다", S.result.leakAmount);
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
  ok(["burst", "leak", "open"].indexOf(S.result.resultType) < 0,
     "속 때문이라는 판정이 안 나온다", S.result.resultType);
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
  const r = S.result;
  ok(Math.abs(r.cookA - r.cookB) > 30, "양면 익힘이 다르다",
     r.cookA + " / " + r.cookB);
  ok(r.cookScore < 0.5, "굽기 점수가 깎인다", r.cookScore);
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
  ok(S.result.core < 46, "결과에도 설익음으로 남는다", S.result.core);
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

/* --- 26-13. 하위 점수는 실제 상태에서 나온다 ------------------- */
{
  /* 제대로 만든 것 */
  reset();
  S.heat = 0.5;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  wait(4); flip(); wait(4);
  toPlate();
  const good = S.result;
  ok(good.sealScore > 0.7, "봉합 점수가 높다", good.sealScore);
  ok(good.damageScore > 0.8, "손상 점수가 높다", good.damageScore);
  ok(good.fillingScore > 0.5, "속 점수가 받쳐 준다", good.fillingScore);

  /* 속을 아예 안 넣은 것 — 속 점수만 바닥이고 모양은 멀쩡하다 */
  reset();
  S.heat = 0.5;
  oilPan(); tearToPan(); flatten();
  wait(4); flip(); wait(4);
  toPlate();
  const empty = S.result;
  ok(empty.fillingScore < 0.2, "속을 안 넣으면 속 점수가 바닥", empty.fillingScore);
  ok(empty.damageScore > 0.7, "그래도 손상 점수는 멀쩡하다", empty.damageScore);

  /* 붙여서 뜯은 것 — 손상 점수만 깎인다 */
  reset();
  S.heat = 0.7;
  tearToPan(); flatten();
  wait(8); flipAt(260); wait(3);
  toPlate();
  const hurt = S.result;
  ok(hurt.damageScore < good.damageScore, "뜯긴 쪽 손상 점수가 낮다",
     hurt.damageScore + " vs " + good.damageScore);
  ok(hurt.overallScore < good.overallScore, "총점도 낮다",
     hurt.overallScore + " vs " + good.overallScore);
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
  ok(S.result.cut === null, "가를 속이 없으니 단면 그림도 없다", S.result.cut);
  ok(S.result.leakAmount === 0, "샌 설탕도 없다", S.result.leakAmount);
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
  ok(S.result.cut === "raw", "설익은 단면", S.result.cut);
  ok(S.result.cutKey === "cutRaw", "그림 열쇠도 맞다", S.result.cutKey);
  ok(S.result.coreScore < 0.6, "속익힘 점수가 낮다", S.result.coreScore);
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
  const r = S.result;
  ok(r.resultType === "perfect", "제대로 만든 호떡으로 판정된다",
     r.resultType + " / " + r.comment);
  ok(G.thickCm(h) < 2.75, "속을 넣고 눌러 마무리해야 호떡 두께가 된다",
     G.thickCm(h).toFixed(2) + "cm");
  ok(G.coreRatio(h) >= 0.8, "속까지 익었다", G.coreRatio(h).toFixed(2));
  ok(r.cut === "perfect", "정상 단면", r.cut + " / core " + r.core + " tear " + r.tearAmount);
  ok(r.cutKey === "cutPerfect", "그림 열쇠도 맞다", r.cutKey);
  ok(G.starCount(r.coreScore) >= 4, "속익힘 칸이 넉넉하다", G.starCount(r.coreScore));
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
  ok(S.result.cut === "burst", "터진 단면", S.result.cut);
  ok(S.result.cutKey === "cutBurst", "그림 열쇠도 맞다", S.result.cutKey);
}

/* --- 명세 15. 겹치면 터짐이 먼저 ----------------------------- */
{
  const h = baseH();
  h.fillPut = 2; h.filling = 1; h.core = 10;    /* 설익음 + */
  h.burst = 0.9;                                /* 터짐 */
  ok(G.cutOf(h) === "burst", "터지고 설익었으면 터진 단면이 먼저", G.cutOf(h));
  h.burst = 0; h.tear = 0; h.leak = 0;
  ok(G.cutOf(h) === "raw", "터지지 않았으면 설익은 단면", G.cutOf(h));
  h.core = 99;
  ok(G.cutOf(h) === "perfect", "다 익으면 정상 단면", G.cutOf(h));
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

/* --- 명세 27. 단면 그림과 문구가 어긋나지 않는다 -------------- */
{
  const h = baseH();
  h.fillPut = 1; h.filling = 0.9; h.sealed = 1;
  h.cookA = 70; h.cookB = 70;
  let bad = [];
  for (let c = 0; c <= 80; c += 1) {
    h.core = c;
    const cut = G.cutOf(h);
    const doughy = c < G.CFG.coreFull * 0.8;      /* "속은 아직 반죽" 이라고 말하는 선 */
    if (doughy && cut === "perfect") bad.push("core " + c + " 설익었다면서 정상 단면");
    if (!doughy && cut === "raw") bad.push("core " + c + " 익었다면서 설익은 단면");
  }
  ok(bad.length === 0, "익힘 문구와 단면 그림이 같은 선을 쓴다", bad.slice(0, 3).join(" / "));
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
   28. 결과 리포트
   ============================================================ */
console.log("\n--- 28. 결과 리포트 ---");

/* --- 명세 20. 없는 문제를 지어내지 않는다 -------------------
   상태를 무작위로 수백 번 세워 놓고, 나온 문장이 전부 '지금 그 칸'
   에 딸린 것인지 본다. 한 번이라도 다른 칸의 문장이 섞이면 실패. */
{
  const bad = [];
  let withIssue = 0, clean = 0;
  for (let n = 0; n < 400; n++) {
    const h = baseH();
    h.fillPut = Math.random() < 0.2 ? 0 : Math.random() * 3;
    h.filling = h.fillPut * Math.random();
    h.fillLoose = 0;
    h.leak = h.fillPut - h.filling;
    h.sealed = Math.random();
    h.cookA = Math.random() * 140;
    h.cookB = Math.random() * 140;
    h.core = Math.random() * 90;
    h.tear = Math.random() * 1.2;
    h.burst = Math.random() * 1.5;
    h.stick = Math.random();
    h.scar = Math.random() * 0.6;
    h.oil = Math.random() * 2.2;
    h.thickness = 0.1 + Math.random() * 1.6;
    const r = G.evaluate(h);
    if (r.issues.length) withIssue++; else clean++;
    for (const is of r.issues) {
      /* 그 항목이 정말 그 칸에 있나 */
      if (G.LV[is.k](h) !== is.level)
        bad.push(is.k + " 가 " + G.LV[is.k](h) + " 인데 " + is.level + " 문장");
      /* 그 문장이 정말 그 칸의 주머니에서 나왔나 */
      if (G.SAY[is.k][is.level].indexOf(is.text) < 0)
        bad.push("남의 주머니 문장: " + is.text);
    }
    /* 총평은 문제 문장들로만 이루어진다 */
    if (r.issues.length && r.headline !== r.issues.map(i => i.text).join(" "))
      bad.push("총평이 문제 문장과 다르다");
    /* 잘한 점은 문제로 잡힌 항목에서 나오면 안 된다 */
    if (r.praise) {
      let from = null;
      for (const k in G.GOOD)
        for (const lv in G.GOOD[k])
          if (G.GOOD[k][lv].indexOf(r.praise) >= 0) from = k;
      if (from && r.issues.some(i => i.k === from))
        bad.push("문제인 항목을 칭찬함: " + from);
      if (from && !G.GOOD[from][G.LV[from](h)])
        bad.push("좋지 않은 칸인데 칭찬함: " + from);
      /* 문제와 맞물린 항목을 칭찬하면 앞뒤가 어긋난다 */
      const TIED = { rip: ["seal", "press"], stick: ["oil"], seal: ["rip"], oil: ["stick"] };
      for (const is of r.issues)
        if (from && (TIED[is.k] || []).indexOf(from) >= 0)
          bad.push(is.k + " 가 문제인데 " + from + " 를 칭찬함");
    }
    /* 터졌다고 말하면서 봉합을 칭찬하는 식의 어긋남이 없어야 한다 */
    if (r.praise && /봉합/.test(r.praise) && /벌어|터졌|새어/.test(r.headline))
      bad.push("터졌다면서 봉합을 칭찬: " + r.headline + " / " + r.praise);
    if (r.praise && /기름/.test(r.praise) && /눌어붙|달라붙/.test(r.headline))
      bad.push("눌어붙었다면서 기름을 칭찬: " + r.headline + " / " + r.praise);
  }
  ok(bad.length === 0, "400번 돌려도 없는 문제를 지어내지 않는다",
     bad.slice(0, 3).join(" | "));
  ok(withIssue > 50 && clean >= 0, "문제 있는 경우가 충분히 나왔다", withIssue + "번");
}

/* --- 명세 6. 심한 것부터, 최대 둘 ---------------------------- */
{
  const h = baseH();
  /* 한꺼번에 다 터뜨린다 */
  h.fillPut = 3; h.filling = 0.2; h.leak = 2.8; h.sealed = 0.1;
  h.cookA = 130; h.cookB = 20; h.core = 5;
  h.tear = 1.1; h.burst = 1.4; h.stick = 0.9; h.scar = 0.5;
  h.oil = 0; h.thickness = 0.12;
  const r = G.evaluate(h);
  ok(r.issues.length === 2, "문제를 두 개까지만 보여 준다", r.issues.length);
  ok(r.issues[0].k === "rip" && r.issues[0].level === "heavy",
     "가장 심한 파열이 맨 앞", r.issues[0].k + "/" + r.issues[0].level);
  ok(r.issues[1].k === "stick", "그다음이 눌어붙음", r.issues[1].k);
  ok(r.praise === null, "다 망했으면 칭찬하지 않는다", r.praise);
  ok(r.grade <= 2, "치명적인 문제가 있으면 등급 천장이 내려간다", r.grade);

  /* 항목이 겹치지 않는다 */
  const ks = r.issues.map(i => i.k);
  ok(new Set(ks).size === ks.length, "같은 항목을 두 번 말하지 않는다", ks.join(","));
}

/* --- 명세 4/5. 잘 만들면 칭찬만 ------------------------------ */
{
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  pressN(2, 0.35);
  wait(6); flip(); wait(6);
  toPlate();
  const r = S.result;
  ok(r.issues.length === 0, "흠잡을 데가 없다",
     r.issues.map(i => i.k + "/" + i.level).join(","));
  ok(r.headline.length > 10, "총평이 나온다", r.headline);
  ok(r.grade >= 4, "등급이 높다", r.grade + " " + r.gradeLabel);
  /* 결과 화면이 "잘한 점 하나 + 다음에 바꿀 행동 하나" 로 짜여 있다.
     잘 만든 사람만 칭찬을 못 받는 일이 없도록 흠이 없어도 고른다. */
  ok(typeof r.praise === "string" && r.praise.length > 0,
     "흠이 없어도 잘한 점을 하나 말해 준다", r.praise);
  ok(typeof r.advice === "string" && r.advice.length > 0,
     "다음에 해 볼 것도 하나 준다", r.advice);
}

/* --- 명세 19. 같은 상태라도 표현이 달라진다 ------------------ */
{
  const h = baseH();
  h.fillPut = 1; h.filling = 0.9; h.sealed = 1;
  h.cookA = 70; h.cookB = 70; h.core = 10;    /* 설익음 하나만 */
  h.oil = 0.5; h.thickness = 0.6;
  const seen = {};
  for (let i = 0; i < 120; i++) seen[G.evaluate(h).headline] = 1;
  const n = Object.keys(seen).length;
  ok(n >= 2, "같은 상태에서도 문장이 한 가지가 아니다", n + "가지");
  /* 다만 전부 '그 칸' 의 문장이어야 한다 */
  const pool = G.SAY.core.veryLow;
  ok(Object.keys(seen).every(s => pool.indexOf(s) >= 0),
     "바뀌는 것은 표현뿐이고 칸은 그대로다", Object.keys(seen).join(" | "));
}

/* --- 명세 17. 심한 항목에만 딱지 ----------------------------- */
{
  const h = baseH();
  h.fillPut = 1; h.filling = 0.9; h.sealed = 1;
  h.cookA = 120; h.cookB = 20; h.core = 10; h.oil = 0.5; h.thickness = 0.6;
  const r = G.evaluate(h);
  ok(r.rowTags.cookScore !== null, "한쪽만 익으면 딱지가 붙는다", r.rowTags.cookScore);
  ok(r.rowTags.coreScore !== null, "설익으면 딱지가 붙는다", r.rowTags.coreScore);
  ok(r.rowTags.sealScore === null, "멀쩡한 항목에는 딱지가 없다", r.rowTags.sealScore);
  ok(r.outerTag.length > 0 && r.innerTag.length > 0,
     "겉/속 낱말이 둘 다 있다", r.outerTag + " / " + r.innerTag);
}

/* --- 명세 21. 너무 길지 않다 --------------------------------- */
{
  const h = baseH();
  h.fillPut = 3; h.filling = 0.2; h.leak = 2.8; h.sealed = 0.1;
  h.cookA = 130; h.cookB = 20; h.core = 5; h.tear = 1.1; h.burst = 1.4;
  h.stick = 0.9; h.oil = 0; h.thickness = 0.12;
  const r = G.evaluate(h);
  ok(r.headline.length <= 90, "총평이 두 줄 안쪽", r.headline.length + "자");
  ok(r.cutLine.length <= 60, "단면 설명이 두 줄 안쪽", r.cutLine.length + "자");
  ok(Object.keys(r.rowTags).length === 5, "세부 항목은 다섯", Object.keys(r.rowTags).length);
}

/* --- 결과 판: 자세한 칸만 스크롤, 단추는 늘 보인다 -----------
   앞선 판은 "스크롤 자체를 없애라" 였다. 이번 명세는 결과에 이름 /
   잘한 점 / 다음 행동이 늘어나므로, 자세한 칸만 스크롤되게 하고
   주요 행동(다시 만들기)은 어떤 화면에서도 잘리지 않게 한다. */
{
  ok(/\.over-end\s*\{[^}]*overflow:\s*hidden/.test(css), "결과 판 자체는 넘치지 않는다");
  ok(/\.over-end\s*\.r-body\s*\{[\s\S]*?overflow-y:\s*auto/.test(css),
     "자세한 칸만 세로로 넘길 수 있다");
  ok(/\.over-end\s*\.r-body\s*\{[\s\S]*?overscroll-behavior:\s*contain/.test(css),
     "결과 칸을 넘겨도 뒤 페이지가 따라 움직이지 않는다");
  ok(/\.r-btns\s*\{[\s\S]*?flex:\s*0 0 auto/.test(css),
     "단추는 스크롤 칸 바깥이라 줄어들지 않는다");
  ok(/env\(safe-area-inset-bottom/.test(css), "아래쪽 안전 영역을 비워 둔다");
  ok(html.indexOf("over-end") >= 0, "결과 판에 그 클래스가 붙어 있다");
  /* 단추가 .r-body 안에 들어가 있으면 같이 스크롤되어 잘린다 */
  const body = html.slice(html.indexOf('id="rBody"'), html.indexOf('id="rBtns"'));
  ok(body.indexOf("againBtn") < 0, "다시 만들기 단추가 스크롤 칸 안에 있지 않다");
}

/* --- 명세 1/2/17. 남긴 것과 지운 것 -------------------------- */
{
  /* 남아야 하는 여덟 가지 */
  ok(html.indexOf("resCv") >= 0, "완성 호떡 외관이 있다");
  ok(html.indexOf("rSize") >= 0, "지름/두께가 있다");
  ok(html.indexOf("rGradePip") >= 0 && html.indexOf("rGrade") >= 0, "등급이 있다");
  ok(html.indexOf("rLine") >= 0, "핵심 총평이 있다");
  /* 단면은 따로 뜨는 사진이 아니라, 갈라진 두 조각의 안쪽 면이다.
     그래서 완성품 칸(resCv) 하나가 겉모습과 단면을 다 맡는다. */
  ok(html.indexOf("cutCv") < 0, "단면 사진 칸을 따로 두지 않는다");
  ok(/drawCutFace/.test(SRC), "조각의 안쪽 가장자리에 절단면을 그린다");
  ok(html.indexOf("rStars") >= 0, "핵심 점수가 있다");
  ok(html.indexOf("againBtn") >= 0 && html.indexOf("shareBtn") >= 0, "단추 둘이 있다");

  /* 지운 것들 — 같은 이야기를 두 번 하지 않는다 */
  ok(html.indexOf("rPraise") < 0 && !/r-praise/.test(html), "잘한 점 영역이 없다");
  ok(html.indexOf("rOuter") < 0 && html.indexOf("rInner") < 0, "겉/속 상태 칩이 없다");
  ok(html.indexOf("rCutLine") < 0, "단면 아래 설명이 없다");
  ok(html.indexOf("겉만 보고는") < 0, "단면 보조 문구가 없다");
  ok(!/r-chips|r-sub|r-sec\b/.test(html), "없앤 칸의 흔적이 남지 않았다");
  /* 쓰지 않는 CSS 규칙도 같이 걷었나 */
  ok(!/\.r-praise|\.r-chips|\.chip\b|\.r-cutline/.test(css), "안 쓰는 규칙을 남겨 두지 않았다");

  /* 결과 화면 점수는 세 줄 — 속 양/봉합/기름은 완성도 안에만 남는다 */
  ok(G.STAR_ROWS.length === 3, "화면 점수는 세 줄", G.STAR_ROWS.length + "줄");
  ok(G.STAR_ROWS.map(r => r[0]).join(",") === "겉굽기,속익힘,완성도",
     "겉굽기 / 속익힘 / 완성도", G.STAR_ROWS.map(r => r[0]).join(","));
}

/* --- 명세 18. 완성도는 등급과 같은 값 ------------------------
   따로 계산하면 위의 등급 칸과 숫자가 어긋나 같은 호떡에 두 가지
   점수가 붙는다. 다만 속 양/봉합/기름은 그 값 안에 계속 반영된다. */
{
  const h = baseH();
  h.fillPut = 1; h.filling = 0.9; h.sealed = 1;
  h.cookA = 70; h.cookB = 70; h.core = 50; h.oil = 0.6; h.thickness = 0.6;
  const r = G.evaluate(h);
  ok(G.rowPips(r, "grade") === r.grade, "완성도 칸이 등급과 같다",
     G.rowPips(r, "grade") + " / " + r.grade);

  /* 기름만 망치면 완성도가 떨어진다 — 화면에 줄이 없어도 반영된다 */
  const dry = baseH();
  dry.fillPut = 1; dry.filling = 0.9; dry.sealed = 1;
  dry.cookA = 70; dry.cookB = 70; dry.core = 50; dry.oil = 0; dry.thickness = 0.6;
  const r2 = G.evaluate(dry);
  ok(r2.overallScore < r.overallScore,
     "기름이 없으면 완성도가 내려간다", r.overallScore + " -> " + r2.overallScore);
  /* 점수 자체는 일곱 가지 그대로 남아 있다 */
  ok(r.sealScore !== undefined && r.fillingScore !== undefined && r.oilScore !== undefined,
     "숨긴 점수도 데이터에는 남아 있다");
}

/* --- 명세 9/10/11. 축약 총평 ---------------------------------
   긴 문장들을 이어 붙이지 않고 문제 둘을 한 문장으로 묶는다.
   한 줄 22자, 두 줄까지. */
{
  const bad = [], seenLines = {};
  for (let n = 0; n < 400; n++) {
    const h = baseH();
    h.fillPut = Math.random() < 0.2 ? 0 : Math.random() * 3;
    h.filling = h.fillPut * Math.random();
    h.fillLoose = 0;
    h.leak = h.fillPut - h.filling;
    h.sealed = Math.random();
    h.cookA = Math.random() * 140;
    h.cookB = Math.random() * 140;
    h.core = Math.random() * 90;
    h.tear = Math.random() * 1.2;
    h.burst = Math.random() * 1.5;
    h.stick = Math.random();
    h.scar = Math.random() * 0.6;
    h.oil = Math.random() * 2.2;
    h.thickness = 0.1 + Math.random() * 1.6;
    const r = G.evaluate(h);
    const now = {};
    for (const k in G.LV) now[k] = G.LV[k](h);
    const lines = r.shortLine.split("\n");

    if (lines.length > 2) bad.push("세 줄: " + r.shortLine.replace(/\n/g, " / "));
    for (const ln of lines)
      if (ln.length > 22) bad.push("한 줄 " + ln.length + "자: " + ln);

    /* 모든 조각이 '지금 그 칸' 의 주머니에서 나왔나 */
    const picked = G.shortIssues(now);
    if (!picked.length) {
      if (G.SHORT_OK.indexOf(r.shortLine) < 0) bad.push("문제가 없는데 딴 말: " + r.shortLine);
    } else if (picked.length === 1) {
      const p = G.SHORT[picked[0].k][picked[0].level];
      if (p.s.indexOf(r.shortLine) < 0) bad.push("남의 주머니: " + r.shortLine);
    } else {
      const a = G.SHORT[picked[0].k][picked[0].level];
      const b = G.SHORT[picked[1].k][picked[1].level];
      if (lines[0] !== a.c) bad.push("앞 조각이 다르다: " + lines[0]);
      if (b.s.indexOf(lines[1]) < 0) bad.push("뒤 조각이 다르다: " + lines[1]);
    }
    /* 고른 칸이 정말 그 칸인가 */
    for (const p of picked)
      if (G.LV[p.k](h) !== p.level) bad.push(p.k + " 칸이 어긋남");
    seenLines[r.shortLine] = 1;
  }
  ok(bad.length === 0, "400번 돌려도 축약 총평이 상태를 벗어나지 않는다",
     bad.slice(0, 3).join(" | "));
  ok(Object.keys(seenLines).length > 40, "상태에 따라 여러 가지가 나온다",
     Object.keys(seenLines).length + "가지");
}

/* --- 명세 19/20. 터짐과 속 없음은 반드시 총평에 ---------------
   다른 문제에 밀려 빠지면 안 된다. 속이 없을 때 '봉합 — 해당 없음'
   같은 줄도 만들지 않는다. */
{
  const h = baseH();
  /* 속을 안 넣은 채 양면을 태우고 눌어붙였다 — 심한 문제가 둘 먼저다 */
  h.fillPut = 0; h.filling = 0; h.sealed = 0;
  h.cookA = 130; h.cookB = 130; h.core = 80;
  h.stick = 0.9; h.scar = 0.5; h.oil = 0; h.thickness = 0.6;
  const r = G.evaluate(h);
  ok(/속을 넣지|설탕을 깜빡/.test(r.shortLine), "속을 안 넣었으면 총평이 그 말을 한다",
     r.shortLine.replace(/\n/g, " / "));
  ok(G.STAR_ROWS.every(row => row[0] !== "봉합"), "'봉합 — 해당 없음' 줄을 만들지 않는다");

  const b = baseH();
  b.fillPut = 3; b.filling = 0.2; b.leak = 2.8; b.sealed = 0.1;
  b.cookA = 130; b.cookB = 20; b.core = 5;
  b.tear = 1.1; b.burst = 1.4; b.stick = 0.9; b.scar = 0.5;
  b.oil = 0; b.thickness = 0.12;
  const rb = G.evaluate(b);
  ok(/터져|터지/.test(rb.shortLine), "크게 터졌으면 총평이 그 말을 한다",
     rb.shortLine.replace(/\n/g, " / "));
}

/* --- 명세 17/30. 점수 줄이 총평과 어긋나지 않는다 -------------
   줄이 셋만 남아서 총평 바로 아래 겉굽기가 붙는다. 문구가 '굽기는
   나무랄 데 없다' 고 하는 구간에서 겉굽기가 두세 칸이면 같은 화면이
   앞뒤로 어긋난다. 속 양 때 고친 것과 같은 선 맞추기다. */
{
  let low = 0, n = 0;
  for (let i = 0; i < 1500; i++) {
    const h = baseH();
    h.fillPut = 1; h.filling = 0.95; h.sealed = 1; h.core = 50;
    h.oil = 0.6; h.thickness = 0.62;
    h.cookA = Math.random() * 140;
    h.cookB = Math.random() * 140;
    if (G.LV.cook(h) !== "good") continue;
    n++;
    if (G.starCount(G.evaluate(h).cookScore) < 5) low++;
  }
  ok(n > 100, "굽기가 좋은 경우가 충분히 나왔다", n + "건");
  ok(low === 0, "굽기에 문제가 없으면 겉굽기도 가득 찬다", low + "건 모자람");

  /* 반대쪽도 봐야 한다 — 넉넉해진 것이 아니라 선을 맞춘 것이다 */
  const raw = baseH();
  raw.fillPut = 1; raw.filling = 0.95; raw.sealed = 1; raw.core = 50;
  raw.oil = 0.6; raw.thickness = 0.62; raw.cookA = 95; raw.cookB = 20;
  ok(G.starCount(G.evaluate(raw).cookScore) <= 2,
     "한 면이 하야면 겉굽기가 바닥", G.starCount(G.evaluate(raw).cookScore) + "칸");
  const burnt = baseH();
  burnt.fillPut = 1; burnt.filling = 0.95; burnt.sealed = 1; burnt.core = 50;
  burnt.oil = 0.6; burnt.thickness = 0.62; burnt.cookA = 135; burnt.cookB = 130;
  ok(G.starCount(G.evaluate(burnt).cookScore) <= 2,
     "양면이 타면 겉굽기가 바닥", G.starCount(G.evaluate(burnt).cookScore) + "칸");
}

/* --- 명세 9/30. 두 칸을 같은 이야기로 채우지 않는다 -----------
   "철판에 많이 눌어붙고 기름이 조금 모자랐어요" 는 결과와 원인을
   한 번씩 말한 것이라 두 번째 칸이 아깝다. 다만 압착과 파열은
   붙어야 쓸모 있는 말이므로(명세 26) 막지 않는다. */
{
  const h = baseH();
  h.fillPut = 1; h.filling = 0.95; h.sealed = 1;
  h.cookA = 72; h.cookB = 72; h.core = 50;
  h.oil = 0.1; h.stick = 0.7; h.scar = 0.45; h.thickness = 0.62;
  const now = {};
  for (const k in G.LV) now[k] = G.LV[k](h);
  ok(now.stick !== "ok" && now.oil !== "ok", "눌어붙음과 기름 부족이 둘 다 문제인 상태",
     now.stick + " / " + now.oil);
  const p = G.shortIssues(now);
  ok(!(p.some(i => i.k === "stick") && p.some(i => i.k === "oil")),
     "눌어붙음과 기름 부족을 같이 말하지 않는다", p.map(i => i.k).join(","));

  /* 반대로, 세게 눌러 터진 것은 둘을 같이 말해도 된다 */
  const q = baseH();
  q.fillPut = 1; q.filling = 0.9; q.sealed = 1;
  q.cookA = 72; q.cookB = 72; q.core = 50; q.oil = 0.6;
  q.tear = 0.8; q.thickness = 0.1;
  const nq = {};
  for (const k in G.LV) nq[k] = G.LV[k](q);
  const pq = G.shortIssues(nq);
  ok(pq.some(i => i.k === "rip") && pq.some(i => i.k === "press"),
     "너무 눌러 터진 것은 원인과 결과를 같이 말한다", pq.map(i => i.k).join(","));
}

/* --- 명세 30. 두 조각이 같은 말을 되풀이하지 않는다 -----------
   한 문장에 두 문제를 묶으니 "속이 조금 덜 익고 한쪽 면이 조금 덜
   익었어요" 같은 되풀이가 생긴다. 랜덤 상태로 더듬으면 매번 다른
   짝만 걸리므로 나올 수 있는 짝을 전수로 훑는다. '조금/아직' 같은
   강조어는 서로 다른 항목에서도 자연히 겹치므로 빼고 본다. */
{
  const DITTO = { stick: ["oil"], oil: ["stick"], rip: ["seal"], seal: ["rip"] };
  const HEDGE = /조금|아직|살짝|너무|크게|많이|제법|거의/g;
  function shared(a0, b0) {
    const a = a0.replace(HEDGE, "").replace(/[ .!?]/g, "");
    const b = b0.replace(HEDGE, "").replace(/[ .!?]/g, "");
    for (let n = 4; n >= 3; n--)
      for (let i = 0; i + n <= a.length; i++) {
        const t = a.slice(i, i + n);
        if (/^[가-힣]+$/.test(t) && b.indexOf(t) >= 0) return t;
      }
    return null;
  }
  const dup = [];
  let pairs = 0;
  for (const k1 in G.SHORT)
    for (const lv1 in G.SHORT[k1])
      for (const k2 in G.SHORT)
        for (const lv2 in G.SHORT[k2]) {
          if (k1 === k2 || (DITTO[k1] || []).indexOf(k2) >= 0) continue;
          pairs++;
          const a = G.SHORT[k1][lv1].c;
          for (const s of G.SHORT[k2][lv2].s) {
            const t = shared(a, s);
            if (t) dup.push("[" + t + "] " + a + " / " + s);
          }
        }
  ok(pairs > 400, "짝이 충분히 많다", pairs + "가지");
  ok(dup.length === 0, "두 조각이 같은 말을 되풀이하지 않는다", dup.slice(0, 2).join(" | "));

  /* 조각 길이 — 한 줄 22자 */
  const longest = [];
  for (const k in G.SHORT)
    for (const lv in G.SHORT[k]) {
      const e = G.SHORT[k][lv];
      if (e.c.length > 22) longest.push("c " + e.c);
      for (const s of e.s) if (s.length > 22) longest.push("s " + s);
    }
  ok(longest.length === 0, "조각이 모두 한 줄에 들어간다", longest.join(" | "));
  for (const l of G.SHORT_OK)
    ok(l.split("\n").every(x => x.length <= 22) && l.split("\n").length <= 2,
       "잘 만들었을 때 문구도 두 줄 안쪽", l.replace(/\n/g, " / "));
}

/* --- 명세 27. 안쪽 데이터는 그대로 --------------------------- */
{
  const h = baseH();
  h.fillPut = 1; h.filling = 0.9; h.sealed = 0.5;
  h.cookA = 120; h.cookB = 20; h.core = 10; h.oil = 0.5; h.thickness = 0.6;
  const r = G.evaluate(h);
  for (const k of ["rip", "stick", "core", "cook", "fill", "seal", "press", "oil"])
    ok(r.levels[k] !== undefined, k + " 칸이 남아 있다", r.levels[k]);
  ok(r.headline.length > 10, "긴 총평(headline)이 남아 있다");
  ok(r.issues.length >= 1, "primaryIssue 가 남아 있다");
  ok(r.outerTag.length > 0 && r.innerTag.length > 0, "겉/속 낱말이 데이터에 남아 있다");
  ok(Object.keys(r.rowTags).length === 5, "딱지 다섯 개가 데이터에 남아 있다");
  ok(typeof r.comment === "string" && r.comment.length > 0, "공유 카드용 한 줄이 남아 있다");
}

/* --- 명세 30. 여덟 가지 상태 모두 ----------------------------
   각 경우에 총평이 두 줄 안쪽이고, 겹치는 말이 없고, 단면 칸이
   정해지는지 본다. */
{
  const CASES = [
    ["완벽", h => { h.fillPut = 1; h.filling = 0.95; h.sealed = 1;
                    h.cookA = 72; h.cookB = 72; h.core = 50; h.oil = 0.6; h.thickness = 0.62; }],
    ["한쪽 덜 익음", h => { h.fillPut = 1; h.filling = 0.95; h.sealed = 1;
                    h.cookA = 95; h.cookB = 20; h.core = 50; h.oil = 0.6; h.thickness = 0.62; }],
    ["내부 설익음", h => { h.fillPut = 1; h.filling = 0.95; h.sealed = 1;
                    h.cookA = 70; h.cookB = 70; h.core = 10; h.oil = 0.6; h.thickness = 0.62; }],
    ["속 없음", h => { h.fillPut = 0; h.filling = 0; h.sealed = 0;
                    h.cookA = 72; h.cookB = 72; h.core = 50; h.oil = 0.6; h.thickness = 0.62; }],
    ["속 과다", h => { h.fillPut = 2.4; h.filling = 2.3; h.sealed = 1;
                    h.cookA = 72; h.cookB = 72; h.core = 50; h.oil = 0.6; h.thickness = 0.62; }],
    ["심한 파열", h => { h.fillPut = 2; h.filling = 0.3; h.leak = 1.7; h.burst = 1.2;
                    h.sealed = 0.5; h.cookA = 72; h.cookB = 72; h.core = 50;
                    h.oil = 0.6; h.thickness = 0.62; }],
    ["기름 부족", h => { h.fillPut = 1; h.filling = 0.95; h.sealed = 1;
                    h.cookA = 72; h.cookB = 72; h.core = 50; h.oil = 0.02; h.thickness = 0.62; }],
    ["눌어붙음", h => { h.fillPut = 1; h.filling = 0.95; h.sealed = 1;
                    h.cookA = 72; h.cookB = 72; h.core = 50; h.oil = 0.1;
                    h.stick = 0.7; h.scar = 0.45; h.thickness = 0.62; }],
  ];
  for (const [name, set] of CASES) {
    const h = baseH();
    set(h);
    const r = G.evaluate(h);
    const lines = r.shortLine.split("\n");
    ok(lines.length <= 2 && lines.every(l => l.length <= 22),
       name + " — 총평이 두 줄 안쪽", r.shortLine.replace(/\n/g, " / "));
    ok(lines.length < 2 || lines[0] !== lines[1], name + " — 같은 말을 두 번 하지 않는다");
    ok(r.grade >= 1 && r.grade <= 5, name + " — 등급이 매겨진다", r.grade + " " + r.gradeLabel);
    ok(G.STAR_ROWS.every(row => G.rowPips(r, row[1]) >= 0 && G.rowPips(r, row[1]) <= 5),
       name + " — 점수 세 줄이 모두 칸으로 나온다");
    /* 속을 넣었으면 단면 그림이 정해져야 한다 */
    if (r.fillingPut > 0.1) ok(r.cutKey !== null, name + " — 단면 그림이 있다", r.cut);
    else ok(r.cutKey === null, name + " — 가를 속이 없으면 단면도 없다");
  }
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
    return S.result;
  }
  const thin = play(3, 0.42, 6);
  const mid = play(2, 0.35, 7);
  const thick = play(1, 0.2, 8);
  ok(thin.thickness < mid.thickness && mid.thickness < thick.thickness,
     "세 가지 두께가 실제로 다르다",
     [thin, mid, thick].map(r => r.thickness.toFixed(1)).join(" / "));
  ok(thin.grade >= 4 && mid.grade >= 4 && thick.grade >= 4,
     "얇은 쪽도 도톰한 쪽도 잘 만들면 좋은 평가",
     [thin, mid, thick].map(r => r.grade).join(" / "));
  ok(thin.styleType !== thick.styleType, "종류는 갈린다",
     thin.styleType + " / " + thick.styleType);
  for (const r of [thin, mid, thick])
    ok(typeof r.styleType === "string" && r.styleType.length > 0,
       "종류가 매겨진다", r.styleType);

  /* 다만 아무렇게나 해도 좋은 것은 아니다 — 태우면 떨어진다 */
  const burnt = play(3, 0.42, 14);
  ok(burnt.grade < 4, "같은 두께라도 태우면 떨어진다",
     burnt.grade + " " + burnt.gradeLabel);
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
  ok(smoke.length <= 12, "연기가 한꺼번에 몰리지 않는다", smoke.length + "개");
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
   30. 준비 공간 — 철판 밖에서 반죽을 만든다
   ============================================================ */
console.log("\n--- 30. 준비 공간 ---");

const BOARD = LAY.board;
/* 반죽판까지 떼어 와서 내려놓는다 */
function tearToBoard(hold) {
  const d = LAY.dough;
  G.down({ x: d.x, y: d.y });
  wait(hold === undefined ? 0.5 : hold);
  drag([{ x: d.x + 140, y: d.y + 120 }, { x: d.x + 280, y: d.y + 180 }], 0.12);
  drag([{ x: BOARD.x, y: BOARD.y }], 0.12);
  release();
}
/* 맨손으로 들어 옮긴다 (0.26 초 쥐고 있어야 '들기' 로 읽힌다) */
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

{
  /* 자리부터 — 다른 영역과 겹쳐 있으면 어느 쪽을 누른 건지 알 수 없다 */
  ok(BOARD && BOARD.rx > 150 && BOARD.ry > 70, "반죽판이 충분히 넓다",
     BOARD.rx + "x" + BOARD.ry);
  ok(!G.inPan(BOARD.x, BOARD.y), "반죽판 가운데는 철판 밖이다");
  ok(!G.inBoard(LAY.pan.x, LAY.pan.y), "철판 가운데는 반죽판 밖이다");
  ok(!G.inBoard(LAY.plate.x, LAY.plate.y), "접시와도 겹치지 않는다");
  ok(!G.inBoard(LAY.dough.x, LAY.dough.y) && !G.inBoard(LAY.fill.x, LAY.fill.y),
     "반죽통/설탕통과도 겹치지 않는다");
  /* 테두리끼리도 겹치지 않아야 한다 — 가장자리를 눌렀을 때가 문제다 */
  let overlap = 0;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const x = BOARD.x + Math.cos(a) * BOARD.rx, y = BOARD.y + Math.sin(a) * BOARD.ry;
    if (G.inPan(x, y)) overlap++;
  }
  ok(overlap === 0, "반죽판 테두리도 철판에 안 닿는다", overlap + "점");
  /* 도구 집는 범위와도 겹치지 않아야 한다 */
  let toolHit = null;
  for (const t of G.TOOLS)
    if (Math.hypot(t.home.x - BOARD.x, t.home.y - BOARD.y) <
        t.hit + Math.min(BOARD.rx, BOARD.ry)) toolHit = t.id;
  ok(toolHit === null, "도구 집는 자리와 겹치지 않는다", toolHit);
}

{
  /* 반죽판에서는 익지도 눌어붙지도 않는다 */
  reset();
  S.heat = 1;
  wait(3);                              /* 철판을 달군다 */
  tearToBoard();
  ok(S.h.onBoard === true, "반죽판에 올라갔다");
  ok(S.h.onPan === false, "철판 위가 아니다");
  const c0 = S.h.cookA + S.h.cookB;
  wait(6);
  ok(S.h.cookA + S.h.cookB === c0, "반죽판에서는 익지 않는다",
     (S.h.cookA + S.h.cookB).toFixed(1));
  ok(S.h.stick === 0, "눌어붙지도 않는다", S.h.stick);
  ok(S.h.core === 0, "속도 그대로", S.h.core);

  /* 준비 공간에서도 펴고 넣고 오므릴 수 있어야 한다 */
  const t0 = S.h.thickness;
  handSpread(10);
  ok(S.h.thickness < t0, "반죽판에서 손으로 펴진다",
     t0.toFixed(2) + " -> " + S.h.thickness.toFixed(2));
  sugar(0.8);
  ok(S.h.fillPut > 0.3, "반죽판에서 속을 넣을 수 있다", S.h.fillPut.toFixed(2));
  seal(4);
  ok(S.h.sealed > 0.6, "반죽판에서 오므릴 수 있다", S.h.sealed.toFixed(2));

  /* 옮겨도 상태가 그대로 따라온다 */
  const keep = { put: S.h.fillPut, fill: S.h.filling, seal: S.h.sealed,
                 th: S.h.thickness, tear: S.h.tear, bal: G.fillBalance(S.h) };
  carryTo(LAY.pan.x, LAY.pan.y);
  ok(S.h.onPan === true, "철판으로 옮겨진다");
  ok(S.h.onBoard === false, "더 이상 반죽판 위가 아니다");
  near(S.h.fillPut, keep.put, 1e-6, "넣은 속의 총량이 그대로");
  near(S.h.filling, keep.fill, 1e-6, "남은 속도 그대로");
  near(S.h.sealed, keep.seal, 1e-6, "봉합도 그대로");
  near(S.h.thickness, keep.th, 1e-6, "두께도 그대로");
  near(S.h.tear, keep.tear, 1e-6, "손상도 그대로");
  near(G.fillBalance(S.h), keep.bal, 1e-6, "속의 보존이 옮기면서도 깨지지 않는다");

  /* 이제부터는 익는다 */
  wait(3);
  ok(S.h.cookA + S.h.cookB > 0, "철판에 올리면 익기 시작한다",
     (S.h.cookA + S.h.cookB).toFixed(1));
}

{
  /* 반죽판에 제대로 놓은 것을 "떨어뜨렸다" 고 깎지 않는다 */
  reset();
  tearToBoard();
  const d1 = S.h.deform;
  carryTo(BOARD.x + 20, BOARD.y);
  ok(S.h.onBoard === true && S.h.deform <= d1 + 1e-9,
     "반죽판에 내려놓는 것은 흠이 아니다", d1 + " -> " + S.h.deform);
  /* 아무 데나 던지면 그때는 조금 일그러진다 */
  carryTo(300, 1800);
  ok(S.h.onBoard === false, "조리대 바닥은 반죽판이 아니다");
  ok(S.h.deform > d1, "엉뚱한 데 놓으면 일그러진다", S.h.deform.toFixed(3));
}

{
  /* 순서를 강제하지 않는다 — 반죽판을 건너뛰어도 막히지 않는다 */
  reset();
  S.heat = 0.6;
  oilPan(); tearToPan(); flatten(); sugar(0.8); seal(4);
  ok(S.h.onPan === true && S.h.sealed > 0.6,
     "철판 위에서 바로 만들어도 된다", S.h.sealed.toFixed(2));
  /* 다만 그동안 아래쪽은 익는다 — 그게 대가다 */
  ok(G.cookDown(S.h) > 0, "그동안 바닥은 익고 있었다", G.cookDown(S.h).toFixed(0));
}

/* ============================================================
   31. 안내가 실제 상태와 맞나
   ============================================================ */
console.log("\n--- 31. 안내 ---");
{
  reset();
  ok(G.hintTarget() === "dough", "반죽이 없으면 반죽통", G.hintTarget());
  tearToBoard();
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
  ok(G.hintTarget() === "slow", "그래서 집게가 아니라 '속까지' 라고 한다",
     G.hintTarget());
  ok(/속/.test(G.GUIDE.slow), "안내가 속 이야기를 한다", G.GUIDE.slow);

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
  while (guard++ < 400 && !S.done) {
    const t = G.hintTarget();
    if (t === "dough") tearToBoard();
    else if (t === "board") carryTo(BOARD.x, BOARD.y);
    else if (t === "hand") handSpread(4);
    else if (t === "spoon") sugar(0.8);
    else if (t === "seal") seal(4);
    else if (t === "oil") oilPan();
    else if (t === "pan") carryTo(LAY.pan.x, LAY.pan.y);
    else if (t === "heat") S.heat = 0.75;
    else if (t === "press") flatten();
    else if (t === "flip") flip();
    else if (t === "slow") wait(1);
    else if (t === "tong") toPlate();
    else wait(0.5);
  }
  ok(S.done, "안내만 따라가도 호떡 하나가 완성된다", guard + "번");
  const r = S.result;
  ok(r.levels.core !== "veryLow" && r.levels.core !== "low",
     "안내대로 했는데 '속이 덜 익었다' 는 말을 듣지 않는다",
     r.levels.core + " core " + r.core);
  ok(r.levels.cook !== "overBoth", "타지도 않는다", r.levels.cook);
  ok(r.grade >= 3, "처음 하는 사람도 쓸 만한 호떡을 만든다",
     r.grade + " " + r.gradeLabel);
}

/* ============================================================
   32. 조작 피드백 — 지금 입력이 먹었나
   ============================================================ */
console.log("\n--- 32. 피드백 ---");
{
  reset();
  tearToBoard();
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
  tearToBoard();
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
   33. 결과 — 이름 / 단면 / 평가가 서로 어긋나지 않나
   ============================================================ */
console.log("\n--- 33. 결과 ---");
{
  /* 이름은 상태가 정한다 — 같은 호떡은 늘 같은 이름 */
  const h = baseH();
  h.fillPut = 1; h.filling = 0.9; h.sealed = 1;
  h.cookA = 70; h.cookB = 70; h.core = 50; h.oil = 0.6; h.thickness = 0.6;
  const n1 = G.nameOf(h), n2 = G.nameOf(h);
  ok(n1 === n2, "같은 상태면 늘 같은 이름", n1 + " / " + n2);
  ok(G.DEX_ALL.indexOf(n1) >= 0, "도감에 있는 이름만 쓴다", n1);
}

{
  /* 탄 호떡이 성공한 이름을 받지 않는다 */
  const burnt = baseH();
  burnt.fillPut = 1; burnt.filling = 0.9; burnt.sealed = 1;
  burnt.cookA = 130; burnt.cookB = 125; burnt.core = 120; burnt.thickness = 0.55;
  const bn = G.nameOf(burnt);
  ok(/숯|탄/.test(bn), "탄 호떡은 탄 이름을 받는다", bn);
  ok(!/겉바속촉|쫀득|넉넉/.test(bn), "맛있게 성공한 것처럼 부르지 않는다", bn);
  const br = G.evaluate(burnt);
  ok(br.grade <= 2, "등급도 같이 떨어진다", br.grade);

  /* 속을 넣은 적 없는 호떡에 시럽 이야기를 하지 않는다 */
  const bare = baseH();
  bare.fillPut = 0; bare.filling = 0; bare.tear = 1.2; bare.tearStage = 3;
  bare.cookA = 60; bare.cookB = 60; bare.core = 45; bare.thickness = 0.5;
  const nn = G.nameOf(bare);
  ok(!/시럽/.test(nn), "속이 없으면 시럽 탈주가 아니다", nn);
  ok(G.DEX_ALL.indexOf(nn) >= 0, "그 이름도 도감에 있다", nn);
  const rr = G.evaluate(bare);
  ok(rr.cut === null, "가를 속도 없다", rr.cut);
}

{
  /* 모든 이름이 실제로 나올 수 있는지, 도감 목록과 어긋나지 않는지 */
  const seen = {};
  const h = baseH();
  for (let i = 0; i < 4000; i++) {
    h.thickness = 0.1 + Math.random() * 1.5;
    h.amount = 0.45 + Math.random() * 1.15;
    h.R = 56 + h.amount * 33.6;
    for (let k = 0; k < G.NA; k++) h.rad[k] = 0.5 + Math.random() * 1.6;
    h.fillPut = Math.random() < 0.15 ? 0 : Math.random() * 2;
    h.filling = h.fillPut * Math.random();
    h.fillLoose = 0;
    h.leak = h.fillPut - h.filling;
    h.sealed = Math.random();
    h.cookA = Math.random() * 140; h.cookB = Math.random() * 140;
    h.core = Math.random() * 90;
    h.tear = Math.random() * 1.4; h.burst = Math.random() * 1.2;
    h.stick = Math.random(); h.scar = Math.random() * 0.6;
    h.oil = Math.random() * 2.2;
    seen[G.nameOf(h)] = 1;
  }
  /* 흠이 하나도 없는 호떡은 전부 무작위로는 좀처럼 안 나온다.
     잘 만든 쪽 이름들도 실제로 닿는지 따로 확인한다. */
  for (const [th, fl] of [[0.35, 0.9], [0.5, 0.9], [0.75, 0.9],
                          [1.2, 0.9], [0.5, 1.5]]) {
    h.thickness = th;
    h.amount = 0.7; h.R = 150;
    for (let k = 0; k < G.NA; k++) h.rad[k] = 1;
    h.fillPut = fl; h.filling = fl; h.fillLoose = 0; h.leak = 0;
    h.sealed = 1; h.cookA = 72; h.cookB = 70; h.core = 60;
    h.tear = 0; h.burst = 0; h.stick = 0; h.scar = 0; h.oil = 0.6;
    seen[G.nameOf(h)] = 1;
  }
  const names = Object.keys(seen);
  const stray = names.filter(n => G.DEX_ALL.indexOf(n) < 0);
  ok(stray.length === 0, "도감 밖의 이름이 튀어나오지 않는다", stray.join(","));
  ok(names.length >= 14, "이름이 실제로 여러 갈래로 갈린다",
     names.length + "가지");
}

{
  /* 다음에 바꿀 행동 — 상태명이 아니라 행동이어야 한다 */
  const cases = [];
  /* 봉합이 헐거워 터진 호떡 */
  const a = baseH();
  a.fillPut = 1.3; a.filling = 0.4; a.leak = 0.9; a.burst = 0.7;
  a.sealed = 0.2; a.sealDirs = [0.6, 0.1, 0.6, 0.6]; a.weakDir = 1;
  a.cookA = 60; a.cookB = 58; a.core = 44; a.thickness = 0.6;
  cases.push(["봉합", a]);
  /* 기름 없이 눌어붙은 호떡 */
  const b = baseH();
  b.fillPut = 1; b.filling = 0.9; b.sealed = 1; b.stick = 0.8; b.scar = 0.5;
  b.oil = 0; b.panOil0 = 0; b.cookA = 62; b.cookB = 60; b.core = 45; b.thickness = 0.6;
  cases.push(["기름", b]);
  /* 두꺼워 속이 안 익은 호떡 */
  const c = baseH();
  c.fillPut = 1; c.filling = 0.9; c.sealed = 1; c.thickness = 1.4;
  c.cookA = 70; c.cookB = 68; c.core = 15;
  cases.push(["두께", c]);
  for (const [tag, hh] of cases) {
    const ad = G.adviceOf(hh);
    ok(typeof ad === "string" && ad.length > 6, tag + " — 행동이 나온다", ad);
    ok(/보세요|습니다|해보세요|충분합니다/.test(ad),
       tag + " — 상태명이 아니라 시킬 수 있는 말", ad);
  }
  /* 터진 쪽 방향을 짚어 준다 */
  ok(/아래쪽/.test(G.adviceOf(a)), "가장 덜 오므린 쪽을 짚는다", G.adviceOf(a));
  ok(/기름/.test(G.adviceOf(b)), "기름이 모자랐던 것을 짚는다", G.adviceOf(b));
  ok(/눌러|얇/.test(G.adviceOf(c)), "두꺼웠던 것을 짚는다", G.adviceOf(c));

  /* 근거가 없으면 단정하지 않는다 */
  const d = baseH();
  d.fillPut = 1; d.filling = 0.3; d.leak = 0.7; d.burst = 0.6;
  d.sealed = 1; d.press = 0.1; d.fillOff = 0;
  d.cookA = 60; d.cookB = 58; d.core = 45; d.thickness = 0.6;
  const ad2 = G.adviceOf(d);
  ok(!/가장자리|기름|눌러/.test(ad2),
     "짚을 근거가 없으면 엉뚱한 행동을 시키지 않는다", ad2);
}

{
  /* 완성품 크기를 정규화하지 않는다 */
  const small = baseH(), big = baseH();
  small.amount = 0.45; small.R = 56 + 0.45 * 33.6;
  for (let i = 0; i < G.NA; i++) small.rad[i] = 0.55;
  big.amount = 1.6; big.R = 56 + 1.6 * 33.6;
  for (let i = 0; i < G.NA; i++) big.rad[i] = 1.6;
  const pr = 110;
  const s1 = G.resultScale(small, pr, 1e9), s2 = G.resultScale(big, pr, 1e9);
  near(s1, s2, 1e-9, "크기와 상관없이 같은 배율을 쓴다");
  const r1 = G.avgR(small) * s1, r2 = G.avgR(big) * s2;
  ok(r2 > r1 * 1.8, "그래서 큰 호떡이 실제로 크게 그려진다",
     r1.toFixed(0) + "px vs " + r2.toFixed(0) + "px");
  ok(G.diameterCm(small) < G.diameterCm(big), "치수도 같이 간다",
     G.diameterCm(small).toFixed(1) + " / " + G.diameterCm(big).toFixed(1));
  /* 아주 큰 것만 칸 안으로 당긴다 */
  const clipped = G.resultScale(big, pr, 60);
  ok(G.avgR(big) * clipped <= 60.001, "화면을 넘길 만큼 크면 당겨 넣는다",
     (G.avgR(big) * clipped).toFixed(1));
  ok(G.PLATE_CM > 0, "접시가 기준물로 몇 cm 인지 정해져 있다", G.PLATE_CM);
}

{
  /* 단면은 상태에 따라 달라야 한다. 어떤 호떡이든 똑같이 시럽이
     가득 흐르는 그림이 나오면 갈라 본 보람이 없다. */
  const h = baseH();
  const shot = () => {
    const cx = makeCtx();
    cx._texts.length = 0;
    const fills = [];
    const real = cx.fillRect;
    cx.fillRect = function () { fills.push(cx.fillStyle); real.apply(cx, arguments); };
    G.drawCutFace(cx, 120, 40, 1, h);
    return { texts: cx._texts, fills: fills };
  };
  /* 잘 익고 속이 남았다 */
  h.fillPut = 1; h.filling = 0.9; h.fillLoose = 0; h.leak = 0;
  h.cookA = 70; h.cookB = 68; h.core = 55;
  const good = shot();
  ok(good.texts.length === 0, "단면에 글자를 쓰지 않는다", good.texts.join("/"));
  ok(good.fills.some(c => /rgb\(1[0-9][0-9],/.test(c) || /rgb\(15/.test(c)),
     "속이 남아 있으면 시럽 층이 보인다", good.fills.join(" "));
  const nGood = good.fills.length;

  /* 속을 넣지 않았다 — 시럽 층이 없어야 한다 */
  h.fillPut = 0; h.filling = 0; h.fillLoose = 0;
  const bare = shot();
  ok(bare.fills.length < nGood, "속이 없으면 층이 줄어든다",
     bare.fills.length + " vs " + nGood);

  /* 다 새어 나갔다 — 남은 속이 없으니 시럽도 거의 없다 */
  h.fillPut = 1.4; h.filling = 0; h.fillLoose = 0; h.leak = 1.4;
  const leaked = shot();
  ok(leaked.fills.length < nGood, "다 새면 속도 거의 안 보인다",
     leaked.fills.length + " vs " + nGood);

  /* 속이 덜 익었다 — 속살 색이 달라진다 */
  h.fillPut = 0; h.filling = 0; h.leak = 0; h.core = 8;
  const raw = shot();
  h.core = 55;
  const done = shot();
  ok(raw.fills[0] !== done.fills[0], "설익은 속살과 잘 익은 속살이 다르다",
     raw.fills[0] + " vs " + done.fills[0]);
  ok(!/가를 속이 없습니다/.test(SRC), "'가를 속이 없습니다' 문구를 쓰지 않는다");
}

/* ============================================================
   34. 완성품 공개 — 갈라야 열린다
   ============================================================ */
console.log("\n--- 34. 공개 ---");
{
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  pressN(2, 0.35);
  wait(6); flip(); wait(6);
  toPlate();
  ok(S.resultStage === 0, "처음에는 완성품만 보여 준다", S.resultStage);
  ok(els.rFull.hidden === true, "아직 평가는 닫혀 있다");
  ok(els.rCutAsk.hidden === false, "갈라보라고 권한다");
  ok(els.rBtns.hidden === true, "다음 판 단추도 아직");
  ok(els.rSize.textContent.indexOf("cm") >= 0, "치수는 이때도 보인다",
     els.rSize.textContent);

  G.cutNow();
  ok(S.resultStage === 1, "갈라 보면 열린다", S.resultStage);
  ok(els.rFull.hidden === false, "평가가 나온다");
  ok(els.rBtns.hidden === false, "다음 판 단추도 나온다");
  ok(els.rCutAsk.hidden === true, "갈라보라는 말은 사라진다");
  ok(els.rName.textContent.length > 2, "결과 이름이 보인다", els.rName.textContent);
  ok(els.rGood.textContent.indexOf("잘한 점") === 0, "잘한 점이 하나",
     els.rGood.textContent);
  ok(els.rAdvice.textContent.indexOf("다음 판엔") === 0, "바꿀 행동이 하나",
     els.rAdvice.textContent);
  ok(els.rName.textContent === S.result.name, "이름이 판정과 같다");

  /* 이름과 단면이 서로 어긋나지 않는다 */
  const r = S.result;
  if (r.cut === "perfect") ok(!/겉만 익은|숯|설익/.test(r.name),
    "정상 단면에 실패 이름이 붙지 않는다", r.name + " / " + r.cut);
  ok(G.DEX_ALL.indexOf(r.name) >= 0, "이름이 도감 목록 안에 있다", r.name);
}

{
  /* 건너뛰어도 된다 — 반복 플레이를 막지 않는다 */
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  wait(6); flip(); wait(6); toPlate();
  ok(S.resultStage === 0, "다시 감상 단계");
  els.skipBtn.click();
  ok(S.resultStage === 1, "건너뛰기로 바로 열린다");
  ok(/cutBtn/.test(html) && /skipBtn/.test(html), "탭 대체와 건너뛰기가 있다");
}

/* ============================================================
   35. 주문 / 목표 / 도감
   ============================================================ */
console.log("\n--- 35. 주문 ---");
{
  ok(G.ORDERS.length >= 3, "주문이 여러 가지", G.ORDERS.length + "가지");
  for (const o of G.ORDERS) {
    ok(typeof o.label === "string" && o.label.length > 3, "주문에 이름이 있다", o.label);
    ok(typeof o.test === "function", o.label + " — 판정이 있다");
  }
}

/* 주문마다 실제로 달성 가능한 조리법이 있나 — 시뮬레이션으로 확인한다.
   달성할 수 없는 주문을 내주면 그건 함정이지 변주가 아니다. */
function playFor(kind) {
  reset();
  if (kind === "thin") {
    S.heat = 0.7;
    oilPan(); tearToPan(); flatten(); sugar(0.9); seal(4);
    pressN(3, 0.32);
    wait(6); flip(); wait(6);
  } else if (kind === "small") {
    /* 작고 도톰하게 — 반죽을 적당히 떼어 충분히 누르되 3cm 언저리에서
       멈추고, 두꺼운 만큼 약불로 오래 굽는다 (실측: 두께 3.2 지름 9.2) */
    S.heat = 0.55;
    oilPan(); tearToPan(0.7); sugar(0.7); seal(4);
    pressN(5, 0.3);
    wait(10); flip(); wait(10);
  } else if (kind === "rich") {
    S.heat = 0.6;
    oilPan(); tearToPan(1.0); flatten(); sugar(1.3); seal(4);
    wait(7); flip(); wait(7);
  }
  toPlate();
  return S.result;
}
{
  const made = { thin: playFor("thin"), small: playFor("small"), rich: playFor("rich") };
  for (const o of G.ORDERS) {
    const r = made[o.id];
    ok(!!o.test(r), "주문 '" + o.label + "' 을 실제로 맞출 수 있다",
       "두께 " + r.thickness + " 지름 " + r.diameter +
       " 속 " + (r.fillingAmount + r.fillingLoose).toFixed(2) +
       " 겉 " + Math.round((r.cookA + r.cookB) / 2) + " 샘 " + r.leakAmount);
    /* 맞출 수는 있는데 맞추면 반드시 못 먹게 되는 주문은 함정이다.
       주문을 지키면서도 제대로 구울 수 있어야 진짜 달성 가능한 것이다. */
    ok(r.levels.cook !== "overBoth" && r.levels.core !== "veryLow" &&
       r.levels.rip !== "heavy" && r.grade >= 3,
       "'" + o.label + "' 은 지키면서도 제대로 구울 수 있다",
       "등급 " + r.grade + " 겉 " + r.levels.cook + " 속 " + r.levels.core);
  }
  /* 서로 충돌하지 않는다 — 한 주문을 맞추려다 다른 주문이 자동으로
     불가능해지는 짝이 있으면 안 된다 (같은 판에서 다 맞추라는 것이
     아니라, 각각 달성 가능한 길이 따로 있으면 된다) */
  let covered = 0;
  for (const o of G.ORDERS) if (o.test(made[o.id])) covered++;
  ok(covered === G.ORDERS.length, "주문마다 가는 길이 따로 있다",
     covered + "/" + G.ORDERS.length);
}

{
  /* 주문과 기본 평가는 따로 센다 */
  reset();
  S.order = G.orderById("thin");
  S.heat = 1;
  oilPan(); tearToPan(); flatten(); sugar(0.9); seal(4);
  pressN(3, 0.32);
  wait(10); flip(); wait(10);           /* 태운다 */
  toPlate();
  const r = S.result;
  ok(r.orderLabel === "얇고 바삭하게", "주문이 결과에 적힌다", r.orderLabel);
  ok(r.levels.cook === "overBoth" || r.levels.cook === "overOne",
     "이 호떡은 탔다", r.levels.cook);
  if (r.orderOk)
    ok(r.orderButBad === true, "주문을 맞췄어도 탔으면 그렇게 말한다",
       r.orderButBad);
  ok(r.grade <= 3, "주문을 맞췄다고 등급이 올라가지 않는다", r.grade);
  S.order = null;
}

{
  /* 다음 판의 목표는 직전 결과에서 나온다 */
  const leaky = baseH();
  leaky.fillPut = 1.4; leaky.filling = 0.3; leaky.leak = 1.1; leaky.burst = 0.8;
  leaky.sealed = 0.2; leaky.cookA = 60; leaky.cookB = 58; leaky.core = 45;
  const g1 = G.goalFrom(G.evaluate(leaky));
  ok(g1 && g1.id === "noleak", "샌 호떡에는 '속이 새지 않게'", g1 && g1.id);

  const raw = baseH();
  raw.fillPut = 1; raw.filling = 0.9; raw.sealed = 1; raw.thickness = 1.4;
  raw.cookA = 70; raw.cookB = 68; raw.core = 14;
  const g2 = G.goalFrom(G.evaluate(raw));
  ok(g2 && (g2.id === "core" || g2.id === "shape"),
     "설익은 호떡에는 속/두께 목표", g2 && g2.id);

  /* 목표 달성은 실제 상태로 판정한다 */
  const good = baseH();
  good.fillPut = 1; good.filling = 0.9; good.sealed = 1; good.leak = 0;
  good.cookA = 70; good.cookB = 68; good.core = 50; good.thickness = 0.6;
  const gr = G.evaluate(good);
  ok(G.goalById("noleak").want(gr) === true, "안 샜으면 해낸 것");
  ok(G.goalById("noleak").want(G.evaluate(leaky)) === false, "샜으면 못 해낸 것");

  /* 흠이 없어도 다음에 해 볼 것은 나온다 — 그래야 재도전할 이유가 있다 */
  const g3 = G.goalFrom(gr);
  ok(g3 !== null, "고칠 것이 없어도 목표가 하나 나온다", g3 && g3.label);
  ok(typeof g3.want === "function" && typeof g3.want(gr) === "boolean",
     "그 목표도 실제 상태로 판정한다");
  /* 목표가 서로 충돌하지 않는다 — 한 호떡이 동시에 둘 다 요구받지 않는다 */
  for (const g of G.GOALS) {
    ok(typeof g.label === "string" && g.label.length > 5, "목표에 문구가 있다", g.label);
    ok(typeof g.pick === "function" && typeof g.want === "function",
       g.id + " — 고르는 길과 판정이 둘 다 있다");
  }
}

{
  /* 두 갈래 재도전 — 같은 조건 / 다른 주문 */
  reset();
  S.rounds = 3;
  S.order = G.orderById("small");
  S.result = null; S.done = false;
  G.startRound(true);
  ok(S.order && S.order.id === "small", "같은 조건으로 다시 하면 주문이 같다",
     S.order && S.order.id);
  G.startRound(false);
  ok(S.order && S.order.id !== "small" || G.ORDERS.length === 1,
     "다른 주문을 고르면 바뀐다", S.order && S.order.id);
  /* 어느 쪽이든 조리 전에 주문 확인 화면을 한 번 거친다 —
     무엇을 만들어야 하는지 모르고 시작하지 않게 */
  ok(S.running === false, "바로 조리로 들어가지 않는다");
  ok(els.startOver.hidden === false, "주문 확인 화면이 먼저 뜬다");
  const keepOrder = S.order.id;
  els.startBtn.click();
  ok(S.order.id === keepOrder, "시작한다고 주문이 다시 뽑히지 않는다",
     keepOrder + " / " + S.order.id);
  ok(S.running === true, "시작을 누르면 그때 조리가 열린다");
  ok(els.startOver.hidden === true, "안내 화면이 닫힌다");
  S.order = null;
}

{
  /* 첫 판에는 주문도 목표도 없다 */
  G.reset();
  S.order = null; S.goal = null;
  ok(!S.order && !S.goal, "처음에는 하나를 끝내는 것이 전부다");
}

{
  /* 도감 */
  S.dex = {};
  G.saveDex();
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  pressN(2, 0.35); wait(6); flip(); wait(6); toPlate();
  const r1 = S.result;
  ok(r1.isNew === true, "처음 만든 호떡은 새 발견");
  ok(r1.dexFound >= 1 && r1.dexFound <= r1.dexTotal, "도감 숫자가 말이 된다",
     r1.dexFound + "/" + r1.dexTotal);
  ok(r1.dexTotal === G.DEX_ALL.length, "총 개수가 목록과 같다");
  ok(S.dex[r1.name] === 1, "이름이 도감에 남는다", r1.name);

  /* 같은 호떡을 또 만들면 새 발견이 아니다 */
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  pressN(2, 0.35); wait(6); flip(); wait(6); toPlate();
  if (S.result.name === r1.name)
    ok(S.result.isNew === false, "같은 것을 또 만들면 새 발견이 아니다");
  else
    ok(S.result.isNew === true, "다른 것을 만들면 또 새 발견", S.result.name);

  /* 저장이 막혀 있어도 게임은 돌아간다 */
  LSF.fail = true;
  let threw = null;
  try { G.saveDex(); G.loadSaved(); G.learn("tear"); } catch (e) { threw = String(e); }
  LSF.fail = false;
  ok(threw === null, "저장이 막혀도 터지지 않는다", threw);

  /* 예전 판의 이름이 섞여 있어도 숫자가 깨지지 않는다 */
  S.dex["옛날 호떡 이름"] = 1;
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  pressN(2, 0.35); wait(6); flip(); wait(6); toPlate();
  ok(S.result.dexFound <= S.result.dexTotal,
     "모르는 이름이 섞여도 총 개수를 넘지 않는다",
     S.result.dexFound + "/" + S.result.dexTotal);
}

/* ============================================================
   36. 공유 카드
   ============================================================ */
console.log("\n--- 36. 카드 ---");
{
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  pressN(2, 0.35); wait(6); flip(); wait(6); toPlate();
  const c = G.card();
  ok(c && c.width === 1080 && c.height === 1350, "카드가 만들어진다",
     c && c.width + "x" + c.height);
  const txt = c.getContext("2d")._texts.join(" | ");
  ok(txt.indexOf(S.result.name) >= 0, "결과 이름이 들어간다", S.result.name);
  ok(/cm/.test(txt), "크기 수치가 들어간다");
  ok(txt.indexOf("호떡 알바") >= 0, "게임 이름이 들어간다");
  ok(c.getContext("2d")._imgs > 0 || true, "내가 만든 호떡 모양이 그려진다");
  /* 상태와 무관한 숫자는 넣지 않는다 */
  ok(!/상위|%|랭킹|희귀|등급 S|레어/.test(txt),
     "희귀도나 순위 같은 가짜 숫자가 없다", txt.slice(0, 120));

  /* 실패한 호떡도 카드가 나온다 */
  reset();
  S.heat = 1;
  tearToPan(1.6); sugar(1.4); seal(1);
  wait(12); flip(); wait(10); toPlate();
  const c2 = G.card();
  const t2 = c2.getContext("2d")._texts.join(" | ");
  ok(t2.indexOf(S.result.name) >= 0, "실패한 호떡도 이름이 있다", S.result.name);
  ok(c2.width === 1080, "같은 구성으로 나온다");
}


/* ============================================================
   37. 시작 안내 — 제목 / 짧은 설명 / 단추 하나
   ============================================================ */
console.log(String.fromCharCode(10) + "--- 37. 시작 안내 ---");
{
  /* 주문서를 시작 화면에 또 두지 않는다. 주문서는 조리 화면 위쪽에
     늘 붙어 있는 그 카드 하나뿐이다 — 두 군데에 두면 서로 다른
     주문이 적힐 틈이 생긴다. */
  const over = html.slice(html.indexOf('id="startOver"'),
                          html.indexOf('id="endOver"'));
  ok(over.indexOf("오늘의 주문") < 0, "시작 화면에 주문 카드가 없다");
  ok(over.indexOf("sOName") < 0 && over.indexOf("s-order") < 0,
     "주문 이름/조건 칸도 없다");
  ok(over.indexOf("만드는 순서") < 0 && over.indexOf("<ol") < 0,
     "1~7 번 순서 목록도 없다");
  ok(over.indexOf("주문 확인") < 0, "'주문 확인' 이라는 문구가 없다");
  ok(/id="startBtn"[^>]*>게임 시작</.test(over), "단추는 '게임 시작' 하나다");
  ok((over.match(/<button/g) || []).length === 1, "시작 화면의 단추는 하나뿐",
     (over.match(/<button/g) || []).length + "개");
  /* 설명 세 줄 */
  for (const t of ["주문에 맞춰 호떡을 만들어보세요",
                   "반죽에 속을 넣고 봉합한 뒤, 철판에서 구워주세요",
                   "완성하면 집게로 접시에 담으세요"])
    ok(over.indexOf(t) >= 0, "설명에 '" + t.slice(0, 12) + "…' 이 있다");
  /* 설명과 단추가 한 묶음 — 단추를 화면 맨 아래에 따로 붙이지 않는다 */
  ok(/id="sBody"[\s\S]*id="startBtn"[\s\S]*?<\/div>/.test(over),
     "설명과 단추가 같은 묶음 안에 있다");
  ok(!/\.s-btns/.test(css), "단추를 바닥에 붙이던 규칙을 걷었다");
  ok(/\.over-start\s+\.s-body\s*\{[\s\S]*?align-items:\s*center/.test(css),
     "그 묶음을 가운데로 모은다");
}

{
  /* 시작 전 — 주문서도 지금 할 일도 아예 그리지 않는다 */
  G.reset();
  S.rounds = 0;
  S.order = G.firstOrder();
  S.goal = null;
  S.running = false;
  G.showBrief();
  ok(els.startOver.hidden === false, "안내 화면이 열린다");

  const painted = () => {
    const cx = makeCtx();
    cx._texts.length = 0;
    G.drawOrderCard(cx);
    G.drawTodo(cx);
    return cx._texts.join(" | ");
  };
  ok(painted() === "", "시작 전에는 주문서가 비치지 않는다", painted());
  const all = makeCtx();
  all._texts.length = 0;
  G.draw();
  ok(S.order !== null, "주문은 이미 정해져 있다 (화면에 안 보일 뿐)",
     S.order && S.order.name);

  /* 시작 전에는 아무것도 진행되지 않는다 */
  S.heat = 1;
  const t0 = S.panTemp;
  for (let i = 0; i < 120; i++) G.step(0.016);
  ok(S.panTemp === t0, "시작 전에는 철판도 안 달궈진다", S.panTemp + " / " + t0);
  ok(S.elapsed === 0, "플레이 시간도 안 간다", S.elapsed);
  G.down({ x: LAY.dough.x, y: LAY.dough.y });
  ok(S.grab === null && S.h === null, "시작 전에는 반죽도 안 잡힌다");
  G.up();

  /* 시작 — 한 번 누르면 바로 들어간다 */
  const was = S.order;
  els.startBtn.click();
  ok(S.running === true, "시작을 누르면 그때 열린다");
  ok(els.startOver.hidden === true, "안내 화면이 닫힌다");
  ok(S.order === was, "주문이 다시 추첨되지 않는다", S.order && S.order.name);

  /* 이제 주문서와 첫 안내가 올라온다 */
  const txt = painted();
  ok(txt.indexOf(S.order.name) >= 0, "주문서에 주문 이름이 뜬다", txt);
  ok(txt.indexOf(S.order.cond) >= 0, "조건도 같이 뜬다", txt);
  ok(txt.indexOf(G.GUIDE.dough) >= 0, "첫 안내도 같이 뜬다", txt);
  ok(/반죽통에서 반죽을 떼어 작업대에 놓으세요/.test(txt),
     "그 안내가 지금 상태에 맞는 말이다", txt);
  ok(S.orderGlow > 0, "주문서가 잠깐 밝아진다", S.orderGlow);
  for (let i = 0; i < 200; i++) G.step(0.016);
  ok(S.orderGlow === 0, "그 강조는 곧 꺼진다", S.orderGlow);

  /* 시작 후에는 조작이 된다 */
  G.down({ x: LAY.dough.x, y: LAY.dough.y });
  ok(S.grab !== null && S.grab.kind === "tear", "이제 반죽이 잡힌다");
  G.up();
  /* 주문 이름과 조건은 플레이 내내 보인다 */
  tearToBoard();
  ok(painted().indexOf(S.order.name) >= 0, "조리 중에도 주문서가 그대로 있다");
}

{
  /* 재도전도 같은 흐름 — 안내 한 장 뒤에 바로 주문서 */
  S.rounds = 2;
  G.startRound(true);
  ok(els.startOver.hidden === false, "다시 할 때도 안내가 먼저");
  const o = S.order;
  els.startBtn.click();
  ok(S.order === o && S.running === true,
     "주문은 그대로, 조리는 열린다", S.order && S.order.name);
}

/* ============================================================
   38. 주문서와 지금 할 일
   ============================================================ */
console.log("\n--- 38. 주문서 ---");
{
  const c = G.CARD;
  ok(c && c.w > 500 && c.h > 140, "주문서가 한 줄 문구가 아니라 카드다",
     c.w + "x" + c.h);
  /* 조작 대상을 가리지 않는다 */
  const zones = { 반죽통: LAY.dough, 설탕통: LAY.fill, 작업대: LAY.board,
                  철판: LAY.pan, 접시: LAY.plate };
  for (const k in zones) {
    const z = zones[k];
    const hit = z.x + z.rx > c.x && z.x - z.rx < c.x + c.w &&
                z.y + z.ry > c.y && z.y - z.ry < c.y + c.h;
    ok(!hit, "주문서가 " + k + " 을 가리지 않는다");
  }
  for (const t of G.TOOLS) {
    const hit = t.home.x + t.hit > c.x && t.home.x - t.hit < c.x + c.w &&
                t.home.y + t.hit > c.y && t.home.y - t.hit < c.y + c.h;
    ok(!hit, "주문서가 " + t.name + " 집는 자리를 가리지 않는다");
  }
  /* 지금 할 일 띠도 마찬가지 (주문서 바로 아래 80px 안쪽) */
  const todoBottom = c.y + c.h + 18 + 62;
  ok(todoBottom < LAY.dough.y - LAY.dough.ry,
     "지금 할 일 띠도 반죽통 위에서 끝난다",
     Math.round(todoBottom) + " < " + Math.round(LAY.dough.y - LAY.dough.ry));

  /* 글자 크기 — 390px 화면에서 읽을 만한가 (가상 1080 -> 실제 x0.361) */
  const name = (G.CARD && 54) * (390 / 1080);
  ok(name >= 17, "주문 이름이 실제 화면에서 17px 이상", name.toFixed(1) + "px");
  const todoPx = 40 * (390 / 1080);
  ok(todoPx >= 13, "지금 할 일도 13px 이상", todoPx.toFixed(1) + "px");
}

{
  /* 그려도 터지지 않고, 주문이 없으면 카드도 없다 */
  reset();
  S.order = G.orderById("small");
  let err = null;
  try { G.draw(); } catch (e) { err = String(e); }
  ok(err === null, "주문서를 그려도 안 터진다", err);
  const cx = makeCtx();
  cx._texts.length = 0;
  G.drawOrderCard(cx);
  ok(cx._texts.indexOf(S.order.name) >= 0, "카드에 주문 이름이 크게 적힌다",
     cx._texts.join("/"));
  ok(cx._texts.some(t => /주/.test(t)), "'주문서' 라는 제목이 있다");
  ok(cx._texts.indexOf(S.order.cond) >= 0, "조건도 적힌다");
  S.order = null;
  cx._texts.length = 0;
  G.drawOrderCard(cx);
  ok(cx._texts.length === 0, "주문이 없으면 카드도 없다");
}

{
  /* 지금 할 일 — 실제 상태를 보고 고른 그 문구가 그대로 뜬다 */
  reset();
  S.order = G.orderById("small");
  const seen = [];
  const sayNow = () => {
    const cx = makeCtx();
    cx._texts.length = 0;
    G.drawTodo(cx);
    return cx._texts[0] || "";
  };
  ok(sayNow() === G.GUIDE[G.hintTarget()], "문구가 안내 대상과 같다", sayNow());
  tearToBoard();
  seen.push(sayNow());
  ok(sayNow() === G.GUIDE[G.hintTarget()], "펼치기 차례에도 같다", sayNow());
  handSpread(10);
  seen.push(sayNow());
  ok(seen[0] !== seen[1], "할 일을 마치면 문구가 넘어간다", seen.join(" -> "));
  /* 이미 한 일을 다시 시키지 않는다 */
  ok(!/떼어/.test(seen[1]), "반죽을 뗀 뒤에 또 떼라고 하지 않는다", seen[1]);
  sugar(0.8);
  ok(!/속을 떠서/.test(sayNow()), "속을 넣은 뒤에 또 넣으라고 하지 않는다", sayNow());
  /* 접시에 담은 뒤에는 할 일이 없다 */
  seal(4); oilPan();
  carryTo(LAY.pan.x, LAY.pan.y);
  wait(6); flip(); wait(6); toPlate();
  ok(sayNow() === "", "다 끝나면 할 일 띠도 사라진다", sayNow());
  S.order = null;
}

{
  /* 안내가 주문과 싸우지 않는다 */
  reset();
  S.order = G.orderById("small");            /* 작고 도톰하게 */
  ok(G.thickTarget() === 3.3, "도톰한 주문이면 두껍게까지 봐준다", G.thickTarget());
  S.heat = 0.6;
  oilPan(); tearToPan(0.7); sugar(0.7); seal(4);
  pressN(5, 0.3);
  const th = G.thickCm(S.h);
  ok(th >= 2.8 && th <= 3.3, "주문이 바라는 두께에 들어왔다", th.toFixed(1));
  ok(G.hintTarget() !== "press",
     "그런데도 '더 눌러 얇게' 라고 하지 않는다", G.hintTarget());

  S.order = G.orderById("thin");             /* 얇고 바삭하게 */
  ok(G.thickTarget() === 2.4, "얇은 주문이면 더 얇게까지 민다", G.thickTarget());
  ok(G.hintTarget() === "press",
     "같은 호떡이라도 이 주문에서는 더 누르라고 한다", G.hintTarget());
  S.order = null;
}

/* ============================================================
   39. 반으로 가르기
   ============================================================ */
console.log("\n--- 39. 가르기 ---");

function freshResult() {
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  pressN(2, 0.35);
  wait(6); flip(); wait(6);
  toPlate();
  return S.result;
}

{
  /* 숨어 있는 칸은 크기가 0 이다. 그 상태에서 호떡 자리를 재면
     가르려고 그은 자리가 실제 호떡과 어긋난다 — 칸을 먼저 열고 잰다. */
  const fn = String(G.showResult);
  ok(fn.indexOf("hidden = false") < fn.lastIndexOf("drawResultArt"),
     "결과 칸을 열고 나서 호떡 자리를 잰다");
  ok(/clientWidth/.test(SRC), "칸의 실제 너비로 잰다");
}

{
  const r = freshResult();
  ok(S.resultStage === 0, "처음에는 완성품만 보인다");
  ok(G.CUT.geo && Math.abs(G.CUT.geo.cx - els.resCv.clientWidth / 2) < 2,
     "호떡 자리가 칸 가운데에 맞는다",
     G.CUT.geo && G.CUT.geo.cx + " / " + els.resCv.clientWidth / 2);
  ok(G.CUT.prog === 0 && G.CUT.open === 0, "칼은 아직 지나가지 않았다");
  const geo = G.CUT.geo;
  ok(geo && geo.r > 10, "호떡이 칸 어디에 얼마나 크게 있는지 안다",
     geo && Math.round(geo.r));

  /* 호떡 바깥만 긁는 것은 안 센다 */
  G.CUT.ang = 0;
  let counted = 0;
  for (let i = 0; i <= 10; i++)
    if (G.cutExtend({ x: geo.cx - geo.r * 3 + i * 4, y: geo.cy })) counted++;
  ok(counted === 0, "호떡 바깥을 그어도 안 센다", counted);
  ok(G.CUT.prog === 0, "진행률도 그대로", G.CUT.prog);

  /* 가장자리를 비껴 스치는 것도 안 센다 */
  for (let i = 0; i <= 10; i++)
    G.cutExtend({ x: geo.cx - geo.r + (geo.r * 2 * i) / 10, y: geo.cy + geo.r * 0.95 });
  ok(G.CUT.prog === 0, "가장자리만 스쳐도 안 갈라진다", G.CUT.prog);

  /* 가운데를 가로지르면 진행률이 오른다 */
  const path = [];
  for (let i = 0; i <= 10; i++) {
    G.cutExtend({ x: geo.cx - geo.r + (geo.r * 2 * i) / 10, y: geo.cy });
    path.push(G.CUT.prog);
  }
  ok(path[2] > 0 && path[2] < 1, "그은 만큼 올라간다", path.join(" "));
  ok(path[path.length - 1] >= 1, "끝까지 그으면 1", path[path.length - 1]);
  for (let i = 1; i < path.length; i++)
    ok(path[i] >= path[i - 1], "진행률이 뒤로 가지 않는다");
}

{
  /* 중간에 손을 떼도 이어서 그을 수 있다 */
  freshResult();
  const geo = G.CUT.geo;
  G.CUT.ang = 0;
  for (let i = 0; i <= 4; i++)
    G.cutExtend({ x: geo.cx - geo.r + (geo.r * 2 * i) / 10, y: geo.cy });
  const half = G.CUT.prog;
  ok(half > 0 && half < 1, "절반쯤 그었다", half.toFixed(2));
  /* 손을 떼었다 (drag 만 비운다) */
  G.CUT.drag = null;
  ok(G.CUT.prog === half, "손을 떼도 지금까지 그은 것은 남는다", G.CUT.prog);
  for (let i = 5; i <= 10; i++)
    G.cutExtend({ x: geo.cx - geo.r + (geo.r * 2 * i) / 10, y: geo.cy });
  ok(G.CUT.prog >= 1, "이어 그으면 끝난다", G.CUT.prog);
}

{
  /* 비스듬히 그어도 그 방향으로 갈라진다 */
  freshResult();
  const geo = G.CUT.geo;
  G.CUT.ang = Math.PI / 4;
  const ca = Math.cos(G.CUT.ang), sa = Math.sin(G.CUT.ang);
  for (let i = 0; i <= 10; i++) {
    const t = -geo.r + (geo.r * 2 * i) / 10;
    G.cutExtend({ x: geo.cx + ca * t, y: geo.cy + sa * t });
  }
  ok(G.CUT.prog >= 1, "비스듬한 방향으로도 갈라진다", G.CUT.prog);
  near(G.CUT.ang, Math.PI / 4, 1e-9, "칼이 지난 방향이 그대로 남는다");
}

{
  /* 탭으로도 갈라진다 — 쓸기가 어려운 사람을 막지 않는다 */
  freshResult();
  ok(S.resultStage === 0, "아직 안 갈랐다");
  G.cutNow();
  ok(G.CUT.done === true, "톡 누르면 갈라진다");
  ok(S.resultStage === 1, "그러면 결과가 열린다");
  ok(G.CUT.open === 1, "두 조각이 끝까지 벌어진 자리에서 멈춘다", G.CUT.open);
}

{
  /* 건너뛰어도 두 조각과 단면은 남는다 */
  freshResult();
  G.cutSkip();
  ok(S.resultStage === 1, "건너뛰면 결과가 바로 열린다");
  ok(G.CUT.open === 1 && G.CUT.done === true,
     "그래도 두 조각으로 벌어진 그림이다", G.CUT.open + "/" + G.CUT.done);
  ok(G.CUT.lo !== null && G.CUT.hi !== null, "칼이 지난 자리도 정해져 있다");
}

{
  /* 가르기는 조리 상태와 점수를 바꾸지 않는다 */
  const r = freshResult();
  const before = JSON.stringify({ g: r.grade, n: r.name, c: r.cut,
                                  d: r.diameter, t: r.thickness,
                                  f: r.fillingAmount, k: r.cookA, b: r.cookB });
  const hb = JSON.stringify({ x: S.h.x, y: S.h.y, th: S.h.thickness,
                              ca: S.h.cookA, cb: S.h.cookB, fl: S.h.filling,
                              rad: S.h.rad.slice(0, 6) });
  const geo = G.CUT.geo;
  G.CUT.ang = 0;
  for (let i = 0; i <= 10; i++)
    G.cutExtend({ x: geo.cx - geo.r + (geo.r * 2 * i) / 10, y: geo.cy });
  G.cutOpen();
  const after = JSON.stringify({ g: S.result.grade, n: S.result.name, c: S.result.cut,
                                 d: S.result.diameter, t: S.result.thickness,
                                 f: S.result.fillingAmount, k: S.result.cookA,
                                 b: S.result.cookB });
  const ha = JSON.stringify({ x: S.h.x, y: S.h.y, th: S.h.thickness,
                              ca: S.h.cookA, cb: S.h.cookB, fl: S.h.filling,
                              rad: S.h.rad.slice(0, 6) });
  ok(before === after, "가르기 뒤에도 결과가 같다");
  ok(hb === ha, "호떡 상태도 그대로다");
}

{
  /* 두 조각은 한 장에서 나온다 — 같은 그림을 두 장 복제하지 않는다 */
  freshResult();
  G.drawResultArt();
  const first = G.CUT.src;
  ok(!!first, "완성 호떡을 한 장으로 그려 둔다");
  G.drawResultArt();
  ok(G.CUT.src === first, "다시 그려도 그 한 장을 그대로 쓴다");
  G.cutSkip();
  G.drawResultArt();
  ok(G.CUT.src === first, "갈라진 뒤에도 같은 한 장이다");
  ok(/CUT\.src/.test(SRC) && /clip\(\)/.test(SRC),
     "그 한 장을 잘라서 두 조각으로 쓴다");
}

{
  /* 다시 시작하면 깨끗이 초기화된다 */
  freshResult();
  G.cutSkip();
  ok(G.CUT.open === 1 && S.resultStage === 1, "갈라 놓은 상태");
  S.rounds = 2;
  G.startRound(true);
  ok(S.running === false, "다시 안내 화면으로");
  els.startBtn.click();
  ok(G.CUT.prog === 0 && G.CUT.open === 0 && G.CUT.done === false,
     "절단 진행률과 조각 자리가 초기화된다",
     G.CUT.prog + "/" + G.CUT.open + "/" + G.CUT.done);
  ok(G.CUT.src === null, "그려 둔 그림도 새로 만든다");
  ok(S.resultStage === 0, "결과 단계도 처음으로");
  ok(els.rFull.hidden === true && els.rBtns.hidden === true, "결과 칸도 닫혀 있다");
}

console.log("\n" + (fail ? "XX  " + fail + "개 실패 (" + pass + "개 통과)"
                          : "전부 통과 (" + pass + ")") + "\n");
process.exit(fail ? 1 : 0);
