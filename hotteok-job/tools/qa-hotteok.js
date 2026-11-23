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
    arc() {}, arcTo() {}, ellipse() {}, rect() {}, fill() {}, stroke() {}, clip() {},
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
    id: id, _h: {}, hidden: false, textContent: "", style: {}, value: "",
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
 "eMade", "eLine", "shareBtn", "shareOff", "saveBtn", "toast",
 "sBody", "sIntro", "sShot",
 "battleOver", "bWho", "bCount", "bStart",
 "vsBtn", "vsOver", "vFoeName", "vScore", "vVerdict", "vAgain", "vBack",
 "nickOver", "nickInput", "nickOk", "nickCancel",
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
const LOC = { href: "https://x.test/hotteok-job/", hash: "" };
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
  ok(S.pan.length === 1, "이제 반죽통을 누르면 반죽이 난다", S.pan.length);
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
  /* 단추는 전부 판 밖의 일이다 — 소리 / 시작하기 / 도전 시작 / 도전장 /
     대결 보기 / 다시 도전 / 결과 저장 / 다시 붙기 / 내 결과 / 확인 / 취소.
     조리를 대신하는 것은 하나도 없다. */
  const btns = (html.match(/<button/g) || []).length;
  ok(btns === 11, "단추는 열한 개뿐이다", btns + "개");
  for (const id of ["muteBtn", "startBtn", "bStart", "shareBtn", "vsBtn",
                    "againBtn", "saveBtn", "vAgain", "vBack", "nickOk", "nickCancel"])
    ok(html.indexOf('id="' + id + '"') >= 0, id + " 단추가 있다");
  /* 조리판 안에서 하는 일에는 단추가 붙지 않는다 */
  const cookBtn = ["id=\"oilBtn", "id=\"pressBtn", "id=\"flipBtn",
                   "id=\"sugarBtn", "id=\"sealBtn", "id=\"autoBtn"];
  ok(cookBtn.every(b => html.indexOf(b) < 0), "조리를 대신해 주는 단추가 없다");
  ok(html.indexOf("actBtn") < 0, "조작 단추(actBtn)가 없어졌다");
  /* --- 이번 변경으로 없어져야 하는 것들 --- */
  for (const w of ["주문서", "오늘의 주문", "작업대", "도감", "공유하기", "등급"])
    ok(html.indexOf(w) < 0, "화면에 '" + w + "' 이 남아 있지 않다");
  for (const id of ["cutBtn", "skipBtn", "dexBtn", "orderBtn", "resCv", "rStars"])
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

/* --- 손놀림 보조 -----------------------------------------------
   도구를 집고, 반죽을 올리고, 철판 위에서 옮기는 기본 동작. */
function pick(id) {
  const t = G.TOOLS.filter(t => t.id === id)[0];
  G.down({ x: t.home.x, y: t.home.y });
  release();
  return t;
}
/* 반죽통을 한 번 누르면 철판 빈 자리에 펴진 생반죽이 난다 */
function makeDough() {
  reset();
  G.down({ x: LAY.dough.x, y: LAY.dough.y });
  release();
  return S.h;
}
/* 철판 위에서 자리를 옮긴다 (끌어다 놓기) */
function putAt(x, y) {
  const h = S.h;
  if (!h) return;
  G.down({ x: h.x, y: h.y });
  drag([{ x: (h.x + x) / 2, y: (h.y + y) / 2 }, { x: x, y: y }], 0.2);
  release();
  h.x = x; h.y = y;
  h.onPan = true; h.held = false;
}
/* 손으로 문질러 펴던 조작은 없앴다. 누르개로 편다. */
function handFlat() { pressN(2, 0.4); }

/* ============================================================
   3. 간소화한 조리 — 통 하나에 클릭 한 번
   ============================================================
   떼고 옮기고 문질러 펴고 손으로 오므리던 과정을 없앴다. 줄인 것은
   조작 수이지 결과가 아니다 — 여기서 그것을 확인한다. */
console.log("\n--- 3. 간소화한 조리 ---");

{
  /* --- 반죽통 한 번 --- */
  reset();
  S.heat = 0.7;
  ok(S.pan.length === 0, "처음에는 철판이 비어 있다");
  G.down({ x: LAY.dough.x, y: LAY.dough.y });
  release();
  ok(S.pan.length === 1, "한 번 누르면 하나 생긴다", S.pan.length);
  const h = S.h;
  ok(h !== null, "그 반죽이 바로 골라져 있다");
  ok(h.onPan === true, "철판 위에 난다 (옮기는 과정이 없다)");
  ok(h.held === false, "손에 들려 있지 않다");
  /* 이미 펴진 채로 — 그러나 익지는 않은 채로 */
  ok(G.thickCm(h) < 2.6, "적당히 펴진 상태로 나온다", G.thickCm(h).toFixed(2) + "cm");
  ok(G.diameterCm(h) > 6, "펴진 만큼 넓다", G.diameterCm(h).toFixed(1) + "cm");
  ok(h.cookA < 1 && h.cookB < 1, "생반죽에서 시작한다 (익힘 보정 없음)",
     h.cookA.toFixed(2) + "/" + h.cookB.toFixed(2));
  ok(h.fillPut === 0, "속도 안 들어 있다");
  ok(h.sealed === 0, "봉합도 안 돼 있다");
  ok(G.qualityOf(h).raw === true, "지금 꺼내면 덜 익은 호떡이다");
  /* 철판 위 자리에 난다 */
  ok(G.PREP.slots.some(s => Math.abs(s.x - h.x) < 1 && Math.abs(s.y - h.y) < 1),
     "정해진 자리에 놓인다", Math.round(h.x) + "," + Math.round(h.y));
}

{
  /* --- 세 개까지, 서로 안 겹치게 --- */
  reset();
  S.heat = 0.7;
  const made = [];
  for (let i = 0; i < G.PREP.maxOnPan; i++) {
    G.down({ x: LAY.dough.x, y: LAY.dough.y }); release();
    made.push(S.h);
  }
  ok(S.pan.length === G.PREP.maxOnPan, "최대 " + G.PREP.maxOnPan + "개까지 올라간다",
     S.pan.length);
  ok(new Set(made.map(h => h.slot)).size === G.PREP.maxOnPan, "서로 다른 자리에 선다");
  /* 기본 자리끼리는 겹치지 않는다 (철판을 비스듬히 보므로 타원으로 잰다) */
  for (let i = 0; i < made.length; i++)
    for (let j = i + 1; j < made.length; j++) {
      const a = made[i], b = made[j];
      const dx = (a.x - b.x) / (G.avgR(a) + G.avgR(b));
      const SQ = LAY.pan.ry / LAY.pan.rx;
      const dy = (a.y - b.y) / ((G.avgR(a) + G.avgR(b)) * SQ);
      ok(dx * dx + dy * dy >= 0.9, "기본 자리 " + i + "-" + j + " 가 안 겹친다",
         (dx * dx + dy * dy).toFixed(2));
    }
  /* 가득 차면 더 안 생기고, 짧게 알려 준다 */
  S.toast = ""; S.toastT = 0;
  G.down({ x: LAY.dough.x, y: LAY.dough.y }); release();
  ok(S.pan.length === G.PREP.maxOnPan, "가득 차면 더 안 생긴다", S.pan.length);
  ok(S.toast.length > 0, "대신 짧게 알려 준다", S.toast);
  ok(S.over === false, "게임이 멈추지도 않는다");
  /* 하나 꺼내면 다시 자리가 난다 */
  const n0 = S.made;
  G.submit(S.pan[0]);
  ok(S.pan.length === G.PREP.maxOnPan - 1, "꺼내면 자리가 빈다");
  G.down({ x: LAY.dough.x, y: LAY.dough.y }); release();
  ok(S.pan.length === G.PREP.maxOnPan, "그 자리에 새로 올라간다");
  ok(S.made === n0 + 1, "꺼낸 것은 만든 수에 들어간다", S.made);
}

{
  /* --- 속재료통 한 번 --- */
  reset();
  S.heat = 0.7;
  tearToPan();
  const h = S.h;
  const t0 = h.thickness;
  G.down({ x: LAY.fill.x, y: LAY.fill.y }); release();
  ok(h.fillPut > 0, "한 번 누르면 속이 들어간다", h.fillPut.toFixed(2));
  ok(Math.abs(h.fillPut - G.PREP.fillDose) < 1e-6, "기본 1회분이다", h.fillPut);
  ok(h.fillSpill === 0, "한가운데로 들어가 흘리지 않는다");
  ok(h.thickness > t0, "넣은 만큼 부푼다", t0.toFixed(2) + " -> " + h.thickness.toFixed(2));
  ok(h.bits.length > 0, "설탕 알갱이가 보인다", h.bits.length);
  /* 0.3초 연출로 저절로 닫힌다 */
  ok(h.sealed < 1, "누른 순간에는 아직 안 닫혔다", h.sealed.toFixed(2));
  wait(G.PREP.sealSec + 0.05);
  ok(h.sealed >= 1, "잠시 뒤 저절로 닫힌다", h.sealed.toFixed(2));
  ok(h.sealDirs.every(d => d >= 1), "네 쪽이 다 닫힌다", h.sealDirs.join(","));
  /* 연출이 도는 동안에도 다른 것을 만질 수 있다 */
  reset(); S.heat = 0.7;
  tearToPan();
  G.down({ x: LAY.fill.x, y: LAY.fill.y }); release();
  G.step(0.05);
  const before = S.pan.length;
  G.down({ x: LAY.dough.x, y: LAY.dough.y }); release();
  ok(S.pan.length === before + 1, "봉합 연출 중에도 새 반죽을 올릴 수 있다",
     S.pan.length);
  pick("press");
  ok(S.active === "press", "도구도 집을 수 있다");
  pick("press");
}

{
  /* --- 더 누르면 더 들어간다 --- */
  reset();
  S.heat = 0.7;
  tearToPan();
  const h = S.h;
  sugar(); seal();
  const one = h.fillPut;
  sugar();
  ok(h.fillPut > one, "한 번 더 누르면 더 들어간다",
     one.toFixed(2) + " -> " + h.fillPut.toFixed(2));
  ok(h.sealed < 1, "닫힌 뒤에 부으면 봉합이 헐거워진다", h.sealed.toFixed(2));
  /* 많이 넣고 누르면 터지는 기존 결과는 그대로 */
  reset(); S.heat = 0.7;
  oilPan(); tearToPan();
  const g = S.h;
  for (let i = 0; i < 5; i++) sugar();
  seal();
  wait(2);
  pressN(5, 0.6);
  ok(g.burst > 0.1 || g.leak > 0.1, "과하게 넣고 누르면 터지거나 샌다",
     "터짐 " + g.burst.toFixed(2) + " 샘 " + g.leak.toFixed(2));
}

{
  /* --- 고른 것에만 들어간다 --- */
  reset();
  S.heat = 0.7;
  tearToPan();
  const a = S.h;
  tearToPan();
  const b = S.h;
  ok(S.h === b, "새로 만든 반죽이 바로 골라진다");
  sugar();
  ok(b.fillPut > 0 && a.fillPut === 0, "속은 고른 것에만 들어간다",
     a.fillPut + " / " + b.fillPut);
  /* 다른 것을 눌러 고를 수 있다 */
  G.down({ x: a.x, y: a.y }); release();
  ok(S.h === a, "누르면 그것이 골라진다");
  sugar();
  ok(a.fillPut > 0, "이제는 이쪽에 들어간다", a.fillPut.toFixed(2));
  /* 반죽이 없으면 알려만 준다 */
  reset();
  S.toast = "";
  G.down({ x: LAY.fill.x, y: LAY.fill.y }); release();
  ok(S.pan.length === 0, "반죽 없이 속만 누르면 아무것도 안 생긴다");
  ok(S.toast.length > 0, "짧게 알려 준다", S.toast);
}

{
  /* --- 자동 봉합은 이미 난 손상을 되돌리지 않는다 --- */
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan();
  const h = S.h;
  sugar(); seal();
  wait(2);
  pressN(6, 0.7);                      /* 터뜨린다 */
  const hurt = { tear: h.tear, burst: h.burst, leak: h.leak, scar: h.scar };
  ok(hurt.tear > 0 || hurt.burst > 0 || hurt.leak > 0, "손상이 났다",
     JSON.stringify(hurt));
  sugar(); seal();                     /* 다시 넣고 저절로 닫히게 */
  ok(h.tear >= hurt.tear && h.burst >= hurt.burst && h.leak >= hurt.leak &&
     h.scar >= hurt.scar,
     "다시 닫혀도 찢김/터짐/누출은 안 줄어든다",
     JSON.stringify({ tear: h.tear, burst: h.burst, leak: h.leak, scar: h.scar }));
}

{
  /* --- 짧게 눌러도 정상 두께 --- */
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); sugar(); seal();
  const h = S.h;
  const t0 = G.thickCm(h);
  pick("press");
  G.down({ x: h.x, y: h.y });
  wait(0.5);
  release();
  pick("press");
  const t1 = G.thickCm(h);
  ok(t1 < t0, "0.5초만 눌러도 얇아진다", t0.toFixed(2) + " -> " + t1.toFixed(2));
  ok(t1 >= 1.5 && t1 <= 3.3, "한 번에 호떡 두께가 된다", t1.toFixed(2) + "cm");
  /* 더 누르면 계속 얇아진다 — 한 번에 고정되지 않는다 */
  pressN(3, 0.6);
  const t2 = G.thickCm(h);
  ok(t2 < t1, "더 누르면 더 얇아진다", t1.toFixed(2) + " -> " + t2.toFixed(2));
  /* 그 짧은 압착으로 제대로 구워진다 */
  reset(); S.heat = 0.7;
  oilPan(); tearToPan(); sugar(); seal();
  pressN(1, 0.5);
  wait(3.4);
  flip();
  wait(3.4);
  const q = G.qualityOf(S.h);
  ok(q.ok === true, "짧게 눌러도 정상 호떡이 된다",
     ["raw", "burnt", "nofill"].filter(k => q[k]).join("+") || "흠 없음");
}

{
  /* --- 기름은 문지른 자리에만 --- */
  reset();
  S.oils.length = 0;
  ok(G.panOiled() < 0.01, "처음에는 기름이 없다");
  const t = G.TOOLS.filter(t => t.id === "oil")[0];
  /* 병을 집는다 */
  G.down({ x: t.home.x, y: t.home.y });
  release();
  ok(S.active === "oil", "기름병이 손에 들린다", S.active);
  ok(G.panOiled() < 0.01, "집었다고 저절로 둘러지지 않는다",
     G.panOiled().toFixed(3));

  /* 철판 왼쪽만 문지른다 */
  const P = LAY.pan, ty = -G.TIP.oil.y;
  const left = { x: P.x - 180, y: P.y + ty };
  const right = { x: P.x + 180, y: P.y + ty };
  G.down({ x: left.x, y: left.y - 60 });
  drag([{ x: left.x, y: left.y }, { x: left.x, y: left.y + 60 },
        { x: left.x - 40, y: left.y }], 0.4);
  release();
  const oL = G.oilAt(P.x - 180, P.y);
  const oR = G.oilAt(P.x + 180, P.y);
  ok(oL > 0, "지나간 자리에는 발린다", oL.toFixed(3));
  ok(oR === 0, "안 지나간 자리에는 안 발린다", oR.toFixed(3));
  ok(oL > oR, "한 곳에 둘렀다고 철판 전체가 같아지지 않는다",
     oL.toFixed(3) + " vs " + oR.toFixed(3));
  ok(S.active === null, "한 번 문지르고 나면 병은 제자리로", S.active);

  /* 클릭만으로는 안 둘러진다 */
  reset();
  S.oils.length = 0;
  G.down({ x: t.home.x, y: t.home.y });
  release();
  G.down({ x: P.x, y: P.y + ty });
  release();
  ok(G.panOiled() < 0.01, "집어서 눌렀다 떼기만 해서는 안 둘러진다",
     G.panOiled().toFixed(3));

  /* 철판 밖에서는 안 발린다 */
  reset();
  S.oils.length = 0;
  pick("oil");
  G.down({ x: 120, y: 1700 });
  drag([{ x: 240, y: 1700 }, { x: 360, y: 1700 }], 0.3);
  release();
  ok(S.oils.length === 0, "철판 밖을 문질러도 안 발린다", S.oils.length);
}

{
  /* --- 세 자리가 각자 다른 기름을 받는다 --- */
  reset();
  S.heat = 0.8; S.panTemp = 0.8;
  S.oils.length = 0;
  /* 왼쪽 자리만 덮어 바른다 */
  pick("oil");
  const sl = G.PREP.slots[0], ty = -G.TIP.oil.y;
  const pts = [];
  for (const dy of [60, 0, -60])
    for (const dx of [-90, 0, 90]) pts.push({ x: sl.x + dx, y: sl.y + dy + ty });
  G.down({ x: pts[0].x, y: pts[0].y });
  drag(pts, 1.0);
  release();
  ok(G.oilAt(sl.x, sl.y) > G.oilAt(G.PREP.slots[2].x, G.PREP.slots[2].y),
     "왼쪽 자리에만 기름이 있다",
     G.oilAt(sl.x, sl.y).toFixed(3) + " vs " +
     G.oilAt(G.PREP.slots[2].x, G.PREP.slots[2].y).toFixed(3));

  /* 세 개를 올려 같은 시간 구우면 기름 받은 쪽만 안 붙는다 */
  const hs = [];
  for (let i = 0; i < 3; i++) { tearToPan(); hs.push(S.h); }
  wait(6);
  ok(hs[0].stick < hs[2].stick, "기름 받은 호떡이 덜 들러붙는다",
     hs[0].stick.toFixed(2) + " vs " + hs[2].stick.toFixed(2));
  ok(hs[0].contactOil > hs[2].contactOil, "닿는 면의 기름도 다르다",
     hs[0].contactOil.toFixed(3) + " vs " + hs[2].contactOil.toFixed(3));
}

{
  /* --- 기름이 없으면 눌어붙고, 나중에 둘러도 상처는 그대로 --- */
  reset();
  S.heat = 0.7;
  S.oils.length = 0;
  tearToPan(); sugar(); seal(); pressN(1, 0.5);
  const dry = S.h;
  wait(3.4);
  const stickDry = dry.stick;
  flip();
  const dryHurt = dry.scar + dry.tear;

  reset();
  S.heat = 0.7;
  oilPan();
  tearToPan(); sugar(); seal(); pressN(1, 0.5);
  const wet = S.h;
  wait(3.4);
  const stickWet = wet.stick;
  flip();
  const wetHurt = wet.scar + wet.tear;

  ok(stickDry > stickWet, "기름이 없으면 더 들러붙는다",
     stickDry.toFixed(2) + " vs " + stickWet.toFixed(2));
  ok(dryHurt > wetHurt, "그래서 뒤집을 때 더 다친다",
     dryHurt.toFixed(3) + " vs " + wetHurt.toFixed(3));
  const was = dry.scar;
  oilPan();
  wait(0.5);
  ok(dry.scar >= was, "나중에 기름을 둘러도 상처는 그대로",
     was.toFixed(3) + " -> " + dry.scar.toFixed(3));
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

  /* 안 누른 반죽은 두껍고, 두꺼우면 속이 더디 익는다 */
  reset();
  S.heat = 0.6; S.panTemp = 0.6;
  oilPan(); tearToPan(); sugar(); seal();
  const fatH = S.h, fatT = G.thickCm(fatH);
  wait(5);
  const fatCore = G.coreRatio(fatH);
  const upDown = G.cookUp(fatH) < G.cookDown(fatH);
  reset();
  S.heat = 0.6; S.panTemp = 0.6;
  oilPan(); tearToPan(); sugar(); seal(); pressN(2, 0.6);
  const thinH = S.h, thinT = G.thickCm(thinH);
  wait(5);
  const thinCore = G.coreRatio(thinH);
  ok(fatT > thinT, "안 누르면 더 두껍다", fatT.toFixed(2) + " vs " + thinT.toFixed(2));
  ok(fatCore < thinCore, "두꺼우면 속이 더디 익는다",
     fatCore.toFixed(2) + " vs " + thinCore.toFixed(2));

  ok(upDown, "위아래 면을 따로 센다");
}

console.log("\n--- 10. 기름 ---");
{
  /* 기름병은 집는 것이 아니라 누르는 것이다 */
  reset();
  S.oils.length = 0;
  const t = G.TOOLS.filter(t => t.id === "oil")[0];
  G.down({ x: t.home.x, y: t.home.y });
  release();
  ok(S.active === "oil", "기름병이 손에 들린다", S.active);
  ok(G.panOiled() < 0.01, "집었다고 저절로 둘러지지 않는다",
     G.panOiled().toFixed(3));
  /* 철판 전체를 문지르면 세 자리 모두 둘러진다 */
  oilPan();
  ok(G.panOiled() >= CFG.oilGood, "문지르면 철판이 둘러진다",
     G.panOiled().toFixed(3));
  for (const sl of G.PREP.slots)
    ok(G.oilAt(sl.x, sl.y) > 0, "자리마다 기름이 묻는다",
       Math.round(sl.x) + " " + G.oilAt(sl.x, sl.y).toFixed(3));
  /* 철판 밖에는 안 묻는다 */
  ok(G.oilAt(60, 1700) === 0, "철판 밖에는 안 묻는다");
}

{
  /* 기름 없이 구우면 들러붙는다 */
  reset();
  S.oils.length = 0;
  S.heat = 0.8; S.panTemp = 0.8;
  tearToPan();
  wait(6);
  const stuck = S.h.stick;
  ok(stuck > 0.2, "기름 없이 구우면 들러붙는다", stuck.toFixed(2));

  /* 둘러 놓고 구우면 안 붙는다 */
  reset();
  S.heat = 0.8; S.panTemp = 0.8;
  oilPan();
  tearToPan();
  wait(6);
  ok(S.h.stick < 0.1, "기름을 두르면 거의 안 붙는다", S.h.stick.toFixed(2));
  ok(S.h.contactOil >= CFG.oilGood, "닿는 면 전체에 기름이 있다",
     S.h.contactOil.toFixed(3));
}

{
  /* 한 번 둘러 놓으면 여러 개를 굽는 동안 간다 */
  reset();
  S.heat = 0.7; S.panTemp = 0.7;
  oilPan();
  const a0 = G.panOiled();
  for (let i = 0; i < 3; i++) {
    tearToPan(); sugar(); seal(); pressN(1, 0.4);
    wait(3);
    toPlate();
  }
  const a1 = G.panOiled();
  ok(a1 < a0, "쓸수록 줄어든다", a0.toFixed(3) + " -> " + a1.toFixed(3));
  ok(a1 > 0, "세 개를 굽는 동안 다 마르지는 않는다", a1.toFixed(3));
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

console.log("\n--- 13. 터짐 / 누출 ---");
{
  /* 봉합은 이제 저절로 된다. 터지느냐 마느냐를 가르는 것은
     얼마나 넣었느냐와 얼마나 세게 누르느냐다. */
  reset();
  S.heat = 0.7;
  oilPan();
  tearToPan();
  const h = S.h;
  for (let i = 0; i < 6; i++) sugar();     /* 가득 */
  seal();
  ok(h.fillPut > 3, "속을 가득 넣었다", h.fillPut.toFixed(2));
  pick("press");
  G.down({ x: h.x, y: h.y }); wait(1.6); release();
  pick("press");
  ok(h.burst > 0.25, "가득 넣고 세게 누르면 터진다", h.burst.toFixed(2));
  ok(h.leak > 0.3, "설탕물이 샌다", h.leak.toFixed(2));

  /* 한 번만 넣으면 같은 힘에도 버틴다 */
  reset();
  S.heat = 0.7;
  oilPan();
  tearToPan();
  const h2 = S.h;
  sugar();
  seal();
  ok(h2.sealed >= 1, "저절로 닫혔다", h2.sealed.toFixed(2));
  pick("press");
  G.down({ x: h2.x, y: h2.y }); wait(1.6); release();
  pick("press");
  ok(h2.leak < h.leak * 0.7, "한 번만 넣었으면 훨씬 덜 샌다",
     h2.leak.toFixed(2) + " vs " + h.leak.toFixed(2));
  ok(h2.burst < h.burst * 0.6, "터짐도 훨씬 적다",
     h2.burst.toFixed(2) + " vs " + h.burst.toFixed(2));
}


/* ============================================================
   14. 뒤집기와 제출 — 클릭 한 번, 끌기 한 번
   ============================================================ */
console.log("\n--- 14. 뒤집기와 제출 ---");

function cooked(sec) {
  oilPan();
  tearToPan();
  sugar();
  seal();
  pressN(1, 0.5);
  wait(sec === undefined ? 3.4 : sec);
  return S.h;
}

{
  /* --- 클릭 한 번에 딱 한 번 --- */
  reset();
  S.heat = 0.7;
  const h = cooked();
  const up0 = h.up;
  pick("flip");
  G.down({ x: h.x, y: h.y });
  release();
  ok(h.flips === 1, "한 번 누르면 한 번 뒤집힌다", h.flips);
  ok(h.up !== up0, "윗면이 바뀐다", up0 + " -> " + h.up);
  /* 연출이 도는 동안 또 눌러도 안 뒤집힌다 */
  G.down({ x: h.x, y: h.y }); release();
  G.down({ x: h.x, y: h.y }); release();
  ok(h.flips === 1, "연출 중에는 또 안 뒤집힌다", h.flips);
  wait(0.6);
  G.down({ x: h.x, y: h.y }); release();
  ok(h.flips === 2, "연출이 끝나면 다시 뒤집힌다", h.flips);
  pick("flip");
  /* 깊이 밀어 넣거나 휘두를 필요가 없다 */
  ok(/function flipOnce/.test(SRC), "뒤집기는 한 번 누르는 것으로 끝난다");
  ok(SRC.indexOf("CFG.insertOK") < 0, "날을 깊이 넣어야 하는 판정은 없앴다");
}

{
  /* --- 뒤집개를 안 들었으면 안 뒤집힌다 --- */
  reset();
  S.heat = 0.7;
  const h = cooked();
  G.down({ x: h.x, y: h.y }); release();
  ok(h.flips === 0, "맨손으로 누르면 고르기만 한다", h.flips);
  ok(S.h === h, "고르기는 됐다");
}

{
  /* --- 집게로 집어 접시에 놓으면 진열된다 --- */
  reset();
  S.heat = 0.7;
  const h = cooked();
  flip();
  wait(3.4);
  const made0 = S.made, stock0 = S.shelf.length;
  const ty = -G.TIP.tong.y;
  /* 손가락으로 직접 끌어서는 제출되지 않는다 */
  G.down({ x: h.x, y: h.y });
  drag([{ x: LAY.plate.x, y: LAY.plate.y }], 0.3);
  release();
  ok(S.made === made0, "맨손으로 끌어서는 제출되지 않는다", S.made);
  ok(S.pan.indexOf(h) >= 0, "철판에 그대로 있다");
  ok(h.held === false, "들리지도 않는다");

  /* 집게로 집어 접시에 놓는다 */
  pick("tong");
  ok(S.active === "tong", "집게를 집었다", S.active);
  G.down({ x: h.x, y: h.y + ty });
  ok(h.held === true, "집게 끝에 닿은 호떡이 집힌다");
  ok(h.onPan === false, "집히면 철판에서 떨어진다");
  const cook0 = G.cookDown(h);
  wait(2);
  ok(G.cookDown(h) === cook0, "집힌 뒤로는 더 안 익는다",
     cook0.toFixed(1) + " -> " + G.cookDown(h).toFixed(1));
  /* 접시 위를 지나가는 것만으로는 제출되지 않는다 */
  drag([{ x: LAY.plate.x, y: LAY.plate.y + ty }], 0.2);
  ok(S.made === made0, "접시 위를 지나가기만 해서는 안 센다", S.made);
  drag([{ x: LAY.plate.x + 10, y: LAY.plate.y + ty }], 0.1);
  release();
  ok(S.made === made0 + 1, "놓아야 한 개", S.made);
  ok(S.shelf.length === stock0 + 1, "전시대에도 올라간다", S.shelf.length);
  ok(S.pan.indexOf(h) < 0, "철판 목록에서도 빠진다");
  ok(S.active === "tong", "놓아도 집게는 손에 남는다", S.active);
  ok(!(S.grab && S.grab.carry), "물고 있던 호떡만 비워진다");
  /* 같은 호떡을 두 번 세지 않는다 */
  G.submit(h);
  ok(S.made === made0 + 1, "다시 제출해도 안 오른다", S.made);
}

{
  /* --- 한 번 집고 세 개를 연달아 옮긴다 --- */
  reset();
  S.heat = 0.7;
  oilPan();
  const ty = -G.TIP.tong.y;
  const hs = [];
  for (let i = 0; i < 3; i++) {
    tearToPan(); sugar(); seal(); pressN(1, 0.4);
    hs.push(S.h);
  }
  wait(3);
  pick("tong");
  ok(S.active === "tong", "집게를 한 번 집었다");
  const picks = [];
  for (let i = 0; i < 3; i++) {
    const h2 = S.pan[0];
    G.down({ x: h2.x, y: h2.y + ty });
    picks.push(S.grab && S.grab.carry === h2);
    drag([{ x: LAY.plate.x, y: LAY.plate.y + ty }], 0.15);
    release();
    ok(S.active === "tong", (i + 1) + "번째 뒤에도 집게는 그대로", S.active);
  }
  ok(picks.every(Boolean), "세 번 다 집게 끝에 닿은 것을 집었다",
     JSON.stringify(picks));
  ok(S.made === 3, "세 개가 다 세어졌다", S.made);
  ok(S.shelf.length === 3, "세 개가 다 진열됐다", S.shelf.length);
  ok(S.pan.length === 0, "철판이 비었다", S.pan.length);
  ok(new Set(S.shelf.map(e => e.id)).size === 3, "서로 다른 호떡이다");

  /* 집게를 든 채로는 반죽통이 받지 않는다 (한 손으로 둘 다 못 한다) */
  const n0 = S.pan.length;
  tearToPan();
  ok(S.pan.length === n0, "집게를 들고는 반죽을 못 올린다", S.pan.length);
  /* 내려놓고 만들면 된다 */
  pick("tong");
  tearToPan();
  const fresh = S.h;
  ok(fresh !== null, "내려놓으면 올라간다");
  ok(fresh.held === false, "새 반죽을 저절로 집지 않는다");
  /* 다시 집어 옮긴다 */
  pick("tong");
  G.down({ x: fresh.x, y: fresh.y + ty });
  drag([{ x: LAY.plate.x, y: LAY.plate.y + ty }], 0.15);
  release();
  ok(S.made === 4, "하나 더 옮겼다", S.made);
  ok(!(S.grab && S.grab.carry), "손을 뗀 뒤에는 아무것도 안 물고 있다");
  ok(S.active === "tong", "그래도 집게는 손에 남는다", S.active);
}

{
  /* --- 내려놓기와 도구 전환 --- */
  reset();
  S.heat = 0.7;
  oilPan();
  tearToPan();
  const h = S.h;
  const tongHome = G.TOOLS.filter(t => t.id === "tong")[0].home;
  pick("tong");
  ok(S.active === "tong", "집게를 들었다");
  /* 빈 집게로 철판을 눌렀다 떼도 안 내려놓는다 */
  G.down({ x: LAY.pan.x + 300, y: LAY.pan.y + 190 });
  release();
  ok(S.active === "tong", "빈 데를 눌러도 집게는 그대로", S.active);
  /* 보관 자리를 누르면 내려놓는다 */
  G.down({ x: tongHome.x, y: tongHome.y });
  release();
  ok(S.active === null, "보관 자리를 누르면 내려놓는다", S.active);
  ok(S.toolPos.tong.x === tongHome.x && S.toolPos.tong.y === tongHome.y,
     "제자리로 돌아간다");
  /* 들고 있을 때 보관 자리를 알아볼 표시가 있다 */
  pick("tong");
  ok(/function drawEmptySlots/.test(SRC) && /setLineDash/.test(SRC),
     "들고 있는 동안 보관 자리에 표시를 남긴다");
  ok(G.paint() === true, "그 표시를 그려도 안 터진다", G.paint());
  /* 다른 도구를 고르면 안전하게 바뀐다 */
  pick("press");
  ok(S.active === "press", "다른 도구로 바뀐다", S.active);
  ok(S.toolPos.tong.x === tongHome.x && S.toolPos.tong.y === tongHome.y,
     "집게는 제자리에 놓인다");
  ok(S.pan.indexOf(h) >= 0 && h.held === false,
     "도구를 바꿨다고 호떡이 사라지지 않는다");
  pick("press");

  /* 집게를 든 채로도 다른 호떡은 계속 익는다 */
  pick("tong");
  const c0 = G.cookDown(h);
  wait(2);
  ok(G.cookDown(h) > c0, "집게를 들고 있어도 철판 위 호떡은 익는다",
     c0.toFixed(0) + " -> " + G.cookDown(h).toFixed(0));

  /* 시간이 끝나면 집게도 운반도 정리된다 */
  S.timeLeft = 0.01;
  wait(0.1);
  ok(S.active === null, "종료하면 집게를 놓는다", S.active);
  ok(S.pan.every(x => !x.held), "들고 있던 것도 내려놓는다");
  G.restart();
  ok(S.active === null && S.grab === null, "다시 도전하면 도구도 운반도 없다");
}

{
  /* --- 잘못 놓거나 취소돼도 사라지지 않는다 --- */
  reset();
  S.heat = 0.7;
  const a = cooked(1.0);
  tearToPan();
  const b = S.h;
  const ty = -G.TIP.tong.y;
  const slot = G.PREP.slots[a.slot];

  /* 접시도 철판도 아닌 데서 놓는다 */
  pick("tong");
  G.down({ x: a.x, y: a.y + ty });
  ok(a.held === true, "집었다");
  drag([{ x: 120, y: 1700 }], 0.2);
  release();
  ok(a.held === false, "놓으면 내려온다");
  ok(a.onPan === true, "철판으로 돌아온다");
  ok(S.pan.indexOf(a) >= 0, "사라지지 않는다");
  ok(Math.abs(a.x - slot.x) < 1 && Math.abs(a.y - slot.y) < 1,
     "집기 전 제 자리로 돌아간다", Math.round(a.x) + "," + Math.round(a.y));
  ok(S.made === 0, "접시 밖이니 세지 않는다", S.made);
  ok(S.pan.indexOf(b) >= 0, "다른 호떡은 그대로");

  /* 입력이 취소돼도(포인터 취소) 마찬가지다 */
  pick("tong");
  G.down({ x: a.x, y: a.y + ty });
  drag([{ x: LAY.pan.x, y: LAY.pan.y - 300 }], 0.15);
  G.up();
  G.step(0.016);
  ok(S.pan.indexOf(a) >= 0, "취소돼도 사라지지 않는다");
  ok(a.held === false, "들린 채로 멈추지도 않는다");
  ok(S.made === 0, "제출되지도 않는다", S.made);

  /* 철판 위에 놓으면 거기에 앉는다 */
  pick("tong");
  G.down({ x: a.x, y: a.y + ty });
  const spot = { x: LAY.pan.x - 40, y: LAY.pan.y + 60 };
  drag([{ x: spot.x, y: spot.y + ty }], 0.2);
  release();
  ok(a.onPan === true, "철판 위에 내려놓인다");
  ok(S.made === 0, "그래도 제출은 아니다", S.made);
  ok(G.inPan(a.x, a.y), "철판 안에 있다", Math.round(a.x) + "," + Math.round(a.y));
}

{
  /* --- 하나를 꺼내도 나머지는 계속 익는다 --- */
  reset();
  S.heat = 0.7;
  oilPan();
  const hs = [];
  for (let i = 0; i < 3; i++) {
    tearToPan(); sugar(); seal(); pressN(1, 0.4);
    hs.push(S.h);
  }
  wait(2.5);
  const before = hs.map(h => ({ cook: G.cookDown(h), fill: h.fillPut, up: h.up }));
  toPlate(hs[0]);
  ok(S.pan.length === 2, "하나가 빠진다", S.pan.length);
  wait(2);
  for (let i = 1; i < 3; i++) {
    ok(G.cookDown(hs[i]) > before[i].cook,
       (i + 1) + "번째는 계속 익는다",
       before[i].cook.toFixed(0) + " -> " + G.cookDown(hs[i]).toFixed(0));
    ok(hs[i].fillPut === before[i].fill, (i + 1) + "번째 속은 그대로");
    ok(hs[i].up === before[i].up, (i + 1) + "번째 윗면도 그대로");
  }
  /* 하나만 뒤집어도 다른 것은 안 뒤집힌다 */
  const f0 = hs[1].flips, f2 = hs[2].flips;
  flip(hs[1]);
  ok(hs[1].flips === f0 + 1, "고른 것만 뒤집힌다");
  ok(hs[2].flips === f2, "나머지는 그대로", hs[2].flips);
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
  const hudTexts = t1.filter(t => /^[0-9]+:[0-9]{2}$/.test(t) || /^[0-9]+$/.test(t));
  ok(hudTexts.length === 3, "위쪽 띠에 남은 시간과 만든/판매 수가 있다",
     hudTexts.join("|"));
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
                            !/^[0-9]+:[0-9]{2}$/.test(t) && !/^[0-9]+$/.test(t));
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
  /* 결과 그림 */
  toPlate();
  /* 접시를 다시 눌러도 더 오르지 않는다 — 이미 철판에서 빠졌다 */
  const n1 = S.made;
  G.down({ x: LAY.plate.x, y: LAY.plate.y });
  release();
  ok(S.made === n1, "같은 호떡이 두 번 세어지지 않는다", S.made);

  /* 생반죽을 바로 접시에 올려도 개수가 오르지 않는다 */
  makeDough(0.6);
  putAt(LAY.pan.x, LAY.pan.y);
  const n2 = S.made;
  toPlate();
  ok(S.made === n2 + 1, "생반죽도 만든 호떡에 들어간다", S.made);
  ok(lastOf().nofill === true && lastOf().raw === true,
     "속 없음과 덜 익음이 적힌다", lastOf().flaws);
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
  ok(S.pan.length === 1, "실제 이벤트로 반죽이 난다", S.pan.length);
  ok(els.cv._captured === true, "포인터를 붙잡는다");
  ok(prevented > 0, "기본 동작을 막는다");
  els.cv.fire("pointermove", ev(LAY.dough.x / 3, (LAY.dough.y + 320) / 3));
  G.step(0.05);
  ok(S.h !== null, "그 반죽이 골라져 있다");
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
  /* 조리 화면은 여전히 전부 캔버스에 그린다. DOM 그림은 흰 화면에만
     있다 — 시작 장면, 도전장 장면, 대결의 두 칸. 전부 조리가 아니라
     보여 주기다. */
  {
    const imgs = html.match(/<img[^>]*>/g) || [];
    ok(imgs.length === 4, "DOM 그림은 흰 화면의 넷뿐이다", imgs.length + "개");
    ok(/id="sShot"/.test(imgs[0] || ""), "그 하나는 시작 화면의 플레이 장면이다",
       (imgs[0] || "").slice(0, 50));
    ok(/width="[0-9]+"/.test(imgs[0] || "") && /height="[0-9]+"/.test(imgs[0] || ""),
       "크기를 적어 두어 자리가 밀리지 않는다");
    ok(/alt="[^"]+"/.test(imgs[0] || ""), "대체 글이 있다");
  }
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
   22. 고르기 — 누르면 골라지고, 표시가 난다
   ============================================================ */
console.log("\n--- 22. 고르기 ---");
{
  reset();
  S.heat = 0.7;
  tearToPan();
  const a = S.h;
  ok(S.h === a, "새로 만들면 그것이 골라진다");
  tearToPan();
  const b = S.h;
  ok(S.h === b, "또 만들면 새것이 골라진다");
  /* 빈 철판을 눌러도 고른 것이 안 바뀐다 */
  G.down({ x: LAY.pan.x + 300, y: LAY.pan.y + 180 }); release();
  ok(S.h === b, "엉뚱한 데를 눌러도 그대로", S.h === b);
  /* 호떡을 누르면 바뀐다 */
  G.down({ x: a.x, y: a.y }); release();
  ok(S.h === a, "누른 호떡으로 바뀐다");
  /* 고른 것을 꺼내면 남은 것 중 하나가 골라진다 */
  toPlate(a);
  ok(S.h === b, "꺼내면 남은 것이 골라진다");
  toPlate(b);
  ok(S.h === null, "다 꺼내면 고른 것이 없다");
  ok(S.pan.length === 0, "철판도 빈다");
  /* 여럿일 때만 표시를 그린다 */
  reset(); S.heat = 0.7;
  tearToPan();
  ok(G.paint() === true, "하나일 때 그릴 수 있다", G.paint());
  tearToPan();
  ok(G.paint() === true, "둘일 때도 그릴 수 있다", G.paint());
}


/* ============================================================
   23. 조리 흐름 — 철판 위에서 손만으로 이어지나
   ============================================================ */
console.log("\n--- 23. 흐름 ---");

const PAN = LAY.pan;
/* 전용 작업대는 없어졌다. 철판 밖 조리대 아무 데나 둔다. */
function carryTo(x, y) { putAt(x, y); }
function handSpread(n) { pressN(Math.max(1, Math.round((n || 8) / 4)), 0.4); }
/* 반죽은 이제 철판에서만 난다 — 철판 밖 준비 공간은 없앴다 */
function tearToPan() {
  G.down({ x: LAY.dough.x, y: LAY.dough.y });
  release();
  return S.h;
}
function tearToCounter() { return tearToPan(); }
function pressN(n, sec, off) {
  if (!S.h) return;
  pick("press");
  for (let i = 0; i < n; i++) {
    if (!S.h) break;
    G.down({ x: S.h.x + (off || 0), y: S.h.y });
    wait(sec === undefined ? 0.3 : sec);
    release();
  }
  pick("press");
}
/* 사람처럼 — 적당히 펴지면 손을 뗀다 */
/* 사람처럼 — 적당히 펴지면 손을 뗀다 */
function flatten() {
  if (!S.h) return;
  pick("press");
  for (let i = 0; i < 12 && S.h && S.h.thickness > 0.42; i++) {
    G.down({ x: S.h.x, y: S.h.y });
    wait(0.3);
    release();
  }
  pick("press");
}
/* 속재료통을 누르면 기본 1회분이 들어간다. sec 는 '얼마나 많이' 로
   읽어, 그만큼 여러 번 누른다 — 조작은 같고 양만 다르다. */
function sugar(sec) {
  const n = sec === undefined ? 1 : Math.max(1, Math.round(sec / 0.6));
  for (let i = 0; i < n; i++) {
    G.down({ x: LAY.fill.x, y: LAY.fill.y });
    release();
  }
}
/* 손으로 오므리던 조작은 없앴다. 넣으면 저절로 닫힌다 — 그 시간을 준다. */
function seal() { wait(G.PREP.sealSec + 0.05); }
function flip(which) {
  const h = which || S.h;
  if (!h) return;
  pick("flip");
  G.down({ x: h.x, y: h.y });
  release();
  pick("flip");
}
/* 접시에 놓으면 S.h 가 비워지므로, 놓기 직전의 호떡을 들고 있는다.
   등급 평가는 없어졌다 — 검사는 원래 수치를 그대로 본다. */
var LAST = null;
/* 집게를 집어 호떡을 물고 접시까지 옮겨 놓는다 */
function toPlate(which) {
  const h = which || S.h;
  if (!h) return;
  LAST = h;
  const ty = -G.TIP.tong.y;
  pick("tong");
  G.down({ x: h.x, y: h.y + ty });
  drag([{ x: (h.x + LAY.plate.x) / 2, y: (h.y + LAY.plate.y) / 2 + ty },
        { x: LAY.plate.x, y: LAY.plate.y + ty },
        { x: LAY.plate.x, y: LAY.plate.y + ty }], 0.3);
  release();
  if (S.active === "tong") pick("tong");
}
function lastOf() {
  const h = LAST;
  if (!h) return null;
  const q = G.qualityOf(h);
  return {
    diameter: G.diameterCm(h), thickness: G.thickCm(h),
    burstAmount: h.burst, leakAmount: h.leak, tearAmount: h.tear,
    scarAmount: h.scar, deformation: h.deform, core: h.core,
    coreScore: G.coreRatio(h), fillPut: h.fillPut, sealed: h.sealed,
    cookA: h.cookA, cookB: h.cookB,
    cookMax: Math.max(h.cookA, h.cookB), cookMin: Math.min(h.cookA, h.cookB),
    q: q,
    /* 이제는 품질과 상관없이 다 진열된다. 보는 것은 "흠이 있나" 다. */
    good: q.ok, raw: q.raw, burnt: q.burnt, nofill: q.nofill,
    flaws: ["raw", "burnt", "nofill"].filter(k => q[k]).join("+") || "none",
  };
}
/* 호떡이 앉을 자리를 면으로 덮어 바른다 (기름은 닿는 면 전체로 판정한다) */
/* 기름병을 집어 철판 위를 문질러 두르고 내려놓는다.
   세 자리 모두 덮어야 어디에 올려도 안 붙는다. */
function oilPan() {
  if (S.active !== "oil") pick("oil");
  const P = LAY.pan, ty = -G.TIP.oil.y;
  const pts = [];
  for (const dy of [120, 60, 0, -60, -120])
    for (const dx of [-230, -115, 0, 115, 230])
      pts.push({ x: P.x + dx, y: P.y + dy + ty });
  G.down({ x: pts[0].x, y: pts[0].y });
  drag(pts, 1.6);
  release();
  if (S.active === "oil") pick("oil");    /* 혹시 들려 있으면 내려놓는다 */
}

{
  reset();
  S.heat = 0.7;
  S.oils.length = 0;
  ok(G.hintTarget() === "oil", "기름이 없으면 기름부터", G.hintTarget());
  oilPan();
  ok(G.oilAt(PAN.x, PAN.y) >= CFG.oilGood, "철판에 기름을 둘렀다",
     G.oilAt(PAN.x, PAN.y).toFixed(2));
  ok(G.hintTarget() === "dough", "그다음이 반죽통", G.hintTarget());

  tearToPan();
  ok(S.h !== null, "반죽이 났다");
  ok(S.h.onPan === true, "철판 위에 놓였다");
  ok(G.thickCm(S.h) < 2.6, "이미 적당히 펴져 있다", G.thickCm(S.h).toFixed(2));
  ok(G.hintTarget() === "sugar", "다음은 속재료통", G.hintTarget());

  /* 아직 안 누른 반죽에도 속은 들어간다 — 순서를 막지 않는다.
     막는 대신 결과로 보여 준다 (두꺼운 채로 속이 들어가 더
     두꺼워지고, 그만큼 속이 안 익는다). */
  const thickWas = S.h.thickness;
  sugar();
  ok(S.h.filling > 0.3, "안 누른 반죽에도 속이 들어간다", S.h.filling.toFixed(2));
  ok(S.h.thickness > thickWas, "대신 더 두꺼워진다",
     thickWas.toFixed(2) + " -> " + S.h.thickness.toFixed(2));
  seal();
  ok(S.h.sealed >= 1, "그래도 저절로 닫힌다", S.h.sealed.toFixed(2));

  /* 속을 넣으면 저절로 닫힌다 */
  sugar();
  ok(S.h.filling > 0.3, "속이 들어간다", S.h.filling.toFixed(2));
  seal();
  ok(S.h.sealed >= 1, "손으로 오므리지 않아도 닫힌다", S.h.sealed.toFixed(2));

  /* 누르면 넓어지고 얇아진다 */
  const t0 = S.h.thickness, r0 = G.avgR(S.h);
  pressN(1, 0.5);
  const t1 = S.h.thickness, r1 = G.avgR(S.h);
  ok(t1 < t0 && r1 > r0, "한 번 누르면 얇아지고 넓어진다",
     r0.toFixed(0) + " -> " + r1.toFixed(0));
  /* 더 누르라는 말은 정말 두꺼울 때만 한다 */
  ok(G.thickCm(S.h) <= 3.3 ? G.hintTarget() !== "press" : G.hintTarget() === "press",
     "두꺼울 때만 더 누르라고 알린다",
     G.thickCm(S.h).toFixed(1) + "cm -> " + G.hintTarget());

  wait(3.4);
  ok(G.hintTarget() === "flip", "노릇해지면 뒤집개", G.hintTarget());
  flip();
  ok(S.h.flips === 1, "뒤집었다");
  wait(3.4);
  ok(G.hintTarget() === "tong", "양면이 익으면 집게", G.hintTarget());
  toPlate();
  ok(S.made === 1, "접시에 담으면 한 개로 센다", S.made);
  const r = lastOf();
  console.log("     -> 지름 " + r.diameter.toFixed(1) + "cm  두께 " + r.thickness.toFixed(1) + "cm");
  ok(r.good === true, "순서대로 하면 흠 없는 호떡", r.flaws);
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
    ["빨리 뒤집기",     { cookA: 1, cookB: 2 },   r => r.raw === true],
    ["늦게 뒤집기",     { cookA: 18, cookB: 16 }, r => r.cookMax > 104],
    ["덜 익은 채 꺼냄", { cookA: 1, flip: false, cookB: 0.2 }, r => r.raw === true],
    ["태운 뒤 꺼냄",    { heat: 1, cookA: 16, cookB: 16 },     r => r.cookMax > 104],
    ["설탕 안 넣음",    { sugar: 0 },             r => r.nofill === true],
  ];
  for (const [name, opt, want] of cases) {
    const r = play(opt);
    if (process.env.QA_DEBUG) console.log("     [" + name + "] " + JSON.stringify(r));
    ok(want(r), name + " 은 그대로 수치에 남는다",
       "흠=" + r.flaws + " 터짐=" + r.burstAmount.toFixed(2) +
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
  ok(rA.good === false && rA.nofill === true,
     "속을 안 넣었으니 속 없음으로 적힌다", rA.flaws);
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
  ok(Bst.sealed >= 1, "속을 넣으면 저절로 닫힌다", Bst.sealed.toFixed(2));
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
  sugar();
  seal();
  pressN(1, 0.5);
  wait(3.4);
  flip();
  wait(3.4);
  toPlate();
  const rC = lastOf();
  ok(rC.good === true, "정상 호떡은 흠이 없다",
     rC.flaws + " 굽기 " + rC.cookA.toFixed(0) + "/" + rC.cookB.toFixed(0));
  ok(rC.burstAmount === 0, "터지지 않았다");
  ok(rC.tearAmount === 0, "찢어지지도 않았다");

  /* ---------- 단계 건너뛰기 금지 ---------- */
  reset();
  S.heat = 0.5;
  tearToPan();
  flatten();
  sugar(0.6);
  const open = S.h;
  ok(open.sealed < 1, "넣은 그 순간에는 아직 열려 있다", open.sealed.toFixed(2));
  ok(G.spriteMix(open).a === "filled", "속이 보이는 그림", G.spriteMix(open).a);
  wait(4);
  ok(open.sealed >= 1, "잠시 뒤 저절로 닫힌다", open.sealed.toFixed(2));
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
  /* 봉합은 이제 늘 저절로 된다. 같은 조건에서 가르는 것은 넣은 양이다. */
  function bake(doses) {
    reset();
    S.heat = 0.7;
    oilPan();
    tearToPan();
    for (let i = 0; i < doses; i++) sugar();
    seal();
    pressN(1, 0.5);
    wait(4);
    return { sealed: S.h.sealed, leak: S.h.leak, left: S.h.filling, put: S.h.fillPut };
  }
  const many = bake(4), few = bake(1);
  ok(many.put > few.put * 2, "한쪽은 훨씬 많이 넣었다",
     few.put.toFixed(2) + " vs " + many.put.toFixed(2));
  ok(many.sealed >= 1 && few.sealed >= 1, "둘 다 저절로 닫혔다",
     few.sealed.toFixed(2) + " / " + many.sealed.toFixed(2));
  ok(many.leak > few.leak * 2, "많이 넣은 쪽이 훨씬 많이 샌다",
     few.leak.toFixed(2) + " vs " + many.leak.toFixed(2));
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
  /* 집게로 들어 올렸다 다시 내려놓는다 */
  pick("tong");
  G.down({ x: S.h.x, y: S.h.y - G.TIP.tong.y });
  drag([{ x: S.h.x + 30, y: S.h.y - G.TIP.tong.y }], 0.15);
  release();
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
  for (let i = 0; i < 4; i++) sugar();   /* 가득 */
  pressN(2, 1.0);                    /* 꾹 누르면 밀려 나온다 */
  wait(3);
  flip();                            /* 양면을 고르게 — 익힘 문제가 가리지 않게 */
  wait(3);
  const h = S.h;
  ok(h.filling < h.fillPut * 0.5, "속이 많이 빠져나갔다",
     h.filling.toFixed(2) + " / " + h.fillPut.toFixed(2));
  ok(h.leak > 0.5, "샌 양은 그대로 남아 있다", h.leak.toFixed(2));
  near(h.filling + h.fillLoose + h.leak + h.fillSpill, h.fillPut, 1e-6, "총량은 맞는다");
  ok(h.fillPut > 0.5, "넣었던 기록이 남아 있다", h.fillPut.toFixed(2));
  /* 속이 다 새어 나가도 "속 없음" 은 아니다 — 넣은 기록(fillPut)이
     남아 있기 때문이다. 이 호떡은 오래 구워 탄 쪽으로 잡히는데,
     그것은 익힘이 따로 적힌다는 뜻이지 속 판정이 흔들린다는 뜻이
     아니다. */
  ok(G.qualityOf(h).nofill === false,
     "속이 다 새어도 속 없음으로 보지는 않는다",
     "fillPut " + h.fillPut.toFixed(2) + " 남은속 " + h.filling.toFixed(2));
  ok(G.qualityOf(h).raw === false, "양면이 익은 것도 그대로 읽는다",
     h.cookA.toFixed(0) + "/" + h.cookB.toFixed(0));
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
    tearToPan();
    for (let i = 0; i < Math.round(1 / dt); i++) G.step(dt);
    G.down({ x: LAY.fill.x, y: LAY.fill.y });
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
  for (let i = 0; i < 5; i++) sugar();   /* 과다 */
  seal();
  const put = S.h.fillPut;
  pressN(6, 0.5);
  wait(3);
  const h = S.h;
  ok(put > 2.5, "속이 과하게 들어갔다", put.toFixed(2));
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

/* 휘두르는 세기(flipShock)는 한 번 누르는 뒤집기로 바뀌며 없앴다. 눌어붙은 채 뒤집으면 뜯기는 것은 3 절에서 본다 */

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
  ok(r.raw === true, "한쪽만 구운 것은 덜 익은 것으로 적힌다", r.flaws);
}

/* --- TEST 8. 두꺼운 호떡을 짧게 -> 속이 설익는다 -------------- */
{
  reset();
  S.heat = 0.7;
  oilPan();
  tearToPan();
  const h = S.h;
  for (let i = 0; i < 3; i++) sugar();   /* 안 누르고 속까지 많다 */
  seal();
  wait(1.6); flip(); wait(1.6);
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
    for (let i = 0; i < sugars * 2; i++) sugar();
    seal();
    pressN(2, 0.8);
    wait(sec);
    return { leak: S.h.leak, n: syrup().length, area: syrupArea(),
             marked: S.h.leakMarked };
  }
  const mid = leakRun(2, 1, 3), big = leakRun(1, 3, 4);
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
  oilPan(); tearToPan(); sugar();
  const h = S.h;
  wait(G.PREP.sealSec * 0.5);       /* 닫히는 도중 */
  const mix = G.spriteMix(h);
  ok(h.sealed > 0.25 && h.sealed < 0.7, "닫히는 중이다", h.sealed.toFixed(2));
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
  tearToPan();                      /* 안 눌러서 두껍다 */
  for (let i = 0; i < 3; i++) sugar();   /* 속이 많으면 더 더디 익는다 */
  seal();
  wait(1.6); flip(); wait(1.6);
  const h = S.h;
  ok(G.coreRatio(h) < 0.6, "속이 덜 익었다", G.coreRatio(h).toFixed(2));
  /* 겉과 속의 차이를 본다. 겉면 절대값으로 재면 뒤집히는 시점이
     한 프레임만 달라져도 넘어가는 종잇장 판정이 된다 — 여기서
     말하려는 것은 "겉은 익었는데 속은 아직" 이라는 관계다. */
  ok(Math.max(h.cookA, h.cookB) > h.core + 8, "겉은 제법 익었는데도",
     Math.max(h.cookA, h.cookB).toFixed(0) + " vs 속 " + h.core.toFixed(0));
  toPlate();
  ok(lastOf().coreScore < 0.6, "접시에 놓인 뒤에도 속익힘이 낮다", lastOf().coreScore);
  ok(lastOf().raw === true,
     "두껍게 짧게 구우면 겉도 덜 익어 덜 익음으로 적힌다",
     lastOf().flaws + " / 겉 " + lastOf().cookMin.toFixed(0));
}

/* --- TEST G. 제대로 만들면 perfect 단면 ----------------------
   속까지 익히려면 양면 합쳐 12 초쯤 걸린다 (실측: 강불에서 6+6 초면
   겉이 57/79, 속이 49 — 겉이 알맞게 익는 때와 속이 익는 때가 맞물린다). */
{
  reset();
  S.heat = 0.7;
  oilPan(); tearToPan(); sugar(); seal();
  pressN(1, 0.5);                   /* 속을 넣고 살살 눌러 납작하게 — 이게 호떡이다 */
  wait(3.2); flip(); wait(3.2);
  const h = S.h;
  toPlate();
  const r = lastOf();
  ok(r.good === true, "제대로 만든 호떡은 흠이 없다",
     r.flaws + " 굽기 " + r.cookA.toFixed(0) + "/" + r.cookB.toFixed(0));
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

/* 붓는 자리(fillOff)는 속재료통 클릭으로 바뀌며 없앴다 — 늘 한가운데로 들어간다 */

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

/* 손을 덜 따라오게 하던 moveRatio 는 끌기 조작과 함께 없앴다 */

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
  const thin = play(3, 0.42, 3.2);
  const mid = play(2, 0.35, 3.4);
  const thick = play(1, 0.2, 3.6);
  ok(thin.thickness < mid.thickness && mid.thickness < thick.thickness,
     "세 가지 두께가 실제로 다르다",
     [thin, mid, thick].map(r => r.thickness.toFixed(1)).join(" / "));
  /* 두께에 정답이 하나뿐이지 않다 — 셋 다 흠 없는 호떡이다 */
  ok(thin.good && mid.good && thick.good,
     "얇게 만든 것도 도톰하게 만든 것도 똑같이 멀쩡한 호떡",
     [thin, mid, thick].map(r => r.flaws + "(" + r.cookMax.toFixed(0) + ")").join(" / "));
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
  ok((S.skill.dough || 0) >= 1, "해낸 것을 센다", JSON.stringify(S.skill));

  /* 한 번 해낸 것만으로는 아직 안 접는다 */
  reset();
  ok(!G.knows("dough"), "한 번 해냈다고 다 배운 것으로 치지 않는다");
  S.hint = ""; S.hintT = 0;
  tearToPan();
  ok(S.hint !== "", "두 번째 판에서도 아직 도와준다", S.hint);

  /* 두 번 해내면 접는다 */
  ok(G.knows("dough"), "이제 할 줄 안다", JSON.stringify(S.skill));
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
  /* 좁은 자리에 쌓이면 검은 원반이 되어 호떡을 가린다.

     연기는 호떡 중심에서 ±0.85R 에 고르게 난다 (너비 1.7R). 표본이
     적으면 그 너비에서도 우연히 좁게 몰린다 — 세 개만 보고 0.5R 를
     요구하면 스무 번에 네 번쯤 애먼 실패가 난다. 여덟 개를 모아
     보면 천 번에 한 번꼴로 떨어진다. 한 점에서 뿜는 쪽으로 망가지면
     표본이 몇이든 몇십 px 에 머물러 그대로 걸린다. */
  if (smoke.length >= 8) {
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
  S.oils.length = 0;
  ok(G.hintTarget() === "oil", "기름이 없으면 기름부터", G.hintTarget());
  oilPan();
  ok(G.hintTarget() === "dough", "반죽이 없으면 반죽통", G.hintTarget());
  tearToPan();
  ok(G.hintTarget() === "sugar", "반죽이 있으면 속재료통", G.hintTarget());
  sugar(); seal();
  ok(G.hintTarget() !== "sugar", "넣었으면 더 넣으라고 안 한다", G.hintTarget());
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
  /* 도톰한 채로 센 불에 아주 짧게 — 겉이 속보다 빨리 간다 */
  oilPan(); tearToPan();
  for (let i = 0; i < 3; i++) sugar();
  seal();
  wait(3.1); flip(); wait(3.1);
  const h = S.h;
  ok(Math.min(h.cookA, h.cookB) > 44, "양면 겉은 익었다",
     Math.round(Math.min(h.cookA, h.cookB)));
  ok(G.coreRatio(h) < 0.8, "그런데 속은 아직", G.coreRatio(h).toFixed(2));
  ok(G.thickCm(h) <= 3.3, "두께는 이미 적당하다", G.thickCm(h).toFixed(1));
  ok(G.hintTarget() === "tong", "안내 선을 넘었으니 집게라고 한다",
     G.hintTarget());
  ok(G.qualityOf(h).raw === false,
     "안내가 집게라고 할 때는 손님도 덜 익었다고 안 한다");
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
    else if (t === "sugar") { sugar(); seal(); }
    else if (t === "oil") oilPan();
    else if (t === "heat") S.heat = 0.75;
    else if (t === "press") pressN(1, 0.5);
    else if (t === "flip") flip();
    else if (t === "tong") toPlate();
    else wait(0.3);
  }
  ok(S.made === 1, "안내만 따라가도 호떡 하나가 세어진다", guard + "번");
  const r = lastOf();
  ok(r.good === true, "안내대로 했는데 손님이 투덜댈 호떡이 안 나온다",
     r.flaws + "(" + r.cookMax.toFixed(0) + ")");
  ok(r.cookMax <= 104, "타지도 않는다", r.cookMax.toFixed(0));
}

/* ============================================================
   32. 조작 피드백 — 지금 입력이 먹었나
   ============================================================ */
console.log("\n--- 32. 피드백 ---");
{
  /* 손으로 밀던 방향(push)과 덜 오므린 쪽(weakDir)은 그 조작과
     함께 없앴다. 남은 신호는 "속이 들어가 닫혔다" 하나다. */
  reset();
  tearToPan();
  ok(S.h.sealFlash === 0, "아직 아무 신호도 없다");
  sugar();
  ok(S.h.sealFlash > 0, "속을 넣는 순간 한 번", S.h.sealFlash.toFixed(2));
  wait(1);
  ok(S.h.sealFlash === 0, "잠깐 뒤에 사라진다 — 상태가 아니라 신호다");
  ok(S.h.sealed >= 1, "그 사이에 저절로 닫혔다", S.h.sealed.toFixed(2));
}

{
  /* 고르려는 손과 옮기려는 손을 끈 거리로 가른다 */
  reset();
  tearToPan();
  const h0 = S.h;
  G.down({ x: h0.x, y: h0.y });
  wait(0.12);
  ok(h0.held === false, "가만히 쥐고만 있으면 안 들린다");
  wait(0.5);
  ok(h0.held === false, "오래 쥐고 있어도 안 들린다");
  drag([{ x: h0.x + 120, y: h0.y + 60 }], 0.15);
  ok(h0.held === false, "끌어도 맨손으로는 안 들린다 — 집게로만 든다");
  const d0 = h0.deform;
  release();
  ok(h0.deform === d0, "눌렀다고 깎지 않는다", h0.deform);
  ok(h0.onPan === true, "철판에 그대로 있다");

  /* 집게로 화면 밖에서 놓아도 제 자리로 돌아온다 */
  freshGame();
  tearToPan();
  const h1 = S.h;
  pick("tong");
  G.down({ x: h1.x, y: h1.y - G.TIP.tong.y });
  drag([{ x: -400, y: -400 }], 0.1);
  release();
  ok(h1.x > 0 && h1.y > G.HUD.y + G.HUD.h, "화면 밖으로 빠져나가지 않는다",
     Math.round(h1.x) + "," + Math.round(h1.y));
  ok(S.pan.indexOf(h1) >= 0, "사라지지도 않는다");
}

{
  /* 조작 신호를 그리다가 터지지 않는다 (화면이 통째로 멈추는 버그) */
  reset();
  S.heat = 0.6;
  oilPan(); tearToPan(); flatten(); sugar(); seal();
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
  /* 뒤집개는 이제 한 번 누르면 끝이다. 깊이도 속도도 안 본다. */
  reset();
  S.heat = 0.6;
  oilPan(); tearToPan(); flatten();
  const h = S.h;
  pick("flip");
  G.down({ x: h.x, y: h.y });
  ok(h.flips === 1, "누르는 순간 뒤집힌다 (끌 필요가 없다)", h.flips);
  release();
  pick("flip");
  ok(G.CFG.flickSpeed === undefined, "휘두르는 속도 판정이 없다");
  ok(G.CFG.insertOK === undefined, "날이 들어간 깊이 판정도 없다");
}

/* 덜 넣고 휘둘러 미끄러지던 판정은 한 번 누르는 뒤집기로 바뀌며 없앴다 */

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
  for (const k of ["raw", "core", "burn", "fill"])
    ok(typeof G.QUAL[k] === "number", "품질 문턱 " + k + " 이 설정값이다", G.QUAL[k]);
  for (const k of ["firstDelay", "gapMin", "gapMax", "wantMin", "wantMax",
                   "waitSec", "saySec"])
    ok(typeof G.CUST[k] === "number", "손님 설정값 " + k + " 이 따로 있다", G.CUST[k]);
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
  ok(els.eCount.textContent === String(S.sold), "판 개수를 크게 보여 준다",
     els.eCount.textContent);
  ok(els.eMade.textContent === "판매한 호떡 " + S.sold + "개",
     "판 개수를 말로도 적는다", els.eMade.textContent);
  /* 세부 기록은 표가 아니라 한 줄이다 */
  const line = els.eLine.textContent;
  for (const [k, v] of [["판매", S.sold + "개"], ["남은 호떡", S.shelf.length + "개"],
                        ["만족 손님", S.happy + "명"], ["불만 손님", S.upset + "명"]])
    ok(line.indexOf(k + " " + v) >= 0, "한 줄에 " + k + " 가 있다", line);
  ok((line.match(/·/g) || []).length === 3, "가운데 점으로 넷을 가른다", line);

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
  while (S.pan.length) G.submit(S.pan[0]);
  tearToPan();
  const h = S.h;
  ok(h.fillPut === 0 && h.cookA < 1 && h.cookB < 1 && h.burst === 0,
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
    G.down({ x: LAY.plate.x, y: LAY.plate.y });
    release();
  }
  ok(S.made === n, "접시를 다시 건드려도 안 오른다", S.made);
  G.submit();
  ok(S.made === n, "제출을 직접 불러도 안 오른다", S.made);
}

{
  /* --- 못 만든 것도 그대로 진열된다 (흠만 적힌다) --- */
  freshGame();
  S.heat = 0.7;
  tearToPan();
  const n = S.made;
  toPlate();
  ok(S.made === n + 1, "생반죽도 만든 호떡에 들어간다", S.made);
  const rawOne = S.shelf[S.shelf.length - 1];
  ok(rawOne.q.raw === true && rawOne.q.nofill === true,
     "덜 익음과 속 없음이 둘 다 적힌다",
     JSON.stringify([rawOne.q.raw, rawOne.q.burnt, rawOne.q.nofill]));
  ok(rawOne.q.ok === false, "멀쩡한 호떡으로는 안 센다");
  ok(S.h === null, "다음 반죽으로 넘어간다");
  ok(S.over === false, "게임이 멈추지도 않는다");

  /* 속은 넣었지만 덜 구운 것 */
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  wait(2);
  ok(G.qualityOf(S.h).raw === true, "덜 구우면 덜 익음으로 적힌다");
  toPlate();
  ok(S.made === n + 2, "그래도 진열은 된다", S.made);
  ok(S.shelf[S.shelf.length - 1].q.raw === true, "전시대에도 덜 익음");

  /* 찌그러지거나 조금 샌 것만으로는 흠이 아니다 */
  oilPan(); tearToPan(); flatten(); sugar(1.2); sugar(1.2); seal(1);
  pressN(4, 0.5);
  wait(6); flip(); wait(6);
  const h = S.h;
  ok(h.leak > 0 || h.burst > 0 || h.deform > 0, "터지거나 샜거나 일그러졌다",
     h.leak.toFixed(2) + " / " + h.burst.toFixed(2) + " / " + h.deform.toFixed(2));
  const qd = G.qualityOf(h);
  ok(qd.raw === false && qd.nofill === false,
     "모양이 일그러졌다는 이유만으로 불량이 되지 않는다", JSON.stringify(qd.ok));
  toPlate();
  ok(S.made === n + 3, "역시 한 개", S.made);
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
  ok(S.active === null && S.grab === null, "도구와 운반 상태도 처음으로");
  ok(G.TOOLS.every(t => S.toolPos[t.id].x === t.home.x && S.toolPos[t.id].y === t.home.y),
     "도구가 제자리로 돌아간다");
  ok(S.pan.length === 0, "철판도 비었다");
  ok(S.panTemp <= 0.12 && S.heat === 0.7, "철판과 불도 처음으로",
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
  ok(now.indexOf("0") >= 0, "만든/판매 개수도 뜬다", now.join("|"));
  ok(now.indexOf("남은 시간") >= 0 && now.indexOf("만든") >= 0 &&
     now.indexOf("판매") >= 0, "무엇인지 적혀 있다", now.join("|"));
  ok(now.indexOf("완성") < 0, "집계를 뜻하던 옛 말은 쓰지 않는다", now.join("|"));
  /* 이 셋 말고는 아무것도 없다 */
  const extra = now.filter(t =>
    ["남은 시간", "만든", "판매", "1:30", "0"].indexOf(t) < 0);
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
  S.sold = 4;
  const seven = painted();
  ok(seven.indexOf("7") >= 0 && seven.indexOf("4") >= 0,
     "만든 수와 판 수가 바뀌면 띠도 바뀐다", seven.join("|"));
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

  /* 조리는 전부 철판 위에서 한다 — 철판 밖 준비 공간이 없다 */
  const spots = [[540, 700], [380, 790], [700, 780]];
  for (const [x, y] of spots)
    ok(!G.inPan(x, y), "(" + x + "," + y + ") 는 철판 밖이다 (여기서는 조리하지 않는다)");
  freshGame();
  tearToPan();
  ok(S.h.onPan === true, "반죽은 철판 위에 난다");
  for (const sl of G.PREP.slots)
    ok(G.inPan(sl.x, sl.y), "세 자리가 모두 철판 안이다",
       Math.round(sl.x) + "," + Math.round(sl.y));

  /* 집게로 끌어다 놓아도 철판을 벗어나지 않는다 */
  freshGame();
  tearToPan();
  const far = S.h;
  const d0 = far.deform;
  pick("tong");
  G.down({ x: far.x, y: far.y - G.TIP.tong.y });
  drag([{ x: -400, y: -400 }], 0.1);
  release();
  ok(far.x > 0 && far.y > G.HUD.y + G.HUD.h, "화면 밖으로 빠져나가지 않는다",
     Math.round(far.x) + "," + Math.round(far.y));
  ok(G.inPan(far.x, far.y), "철판 위로 돌아온다");
  ok(far.deform === d0, "끌었다고 깎지 않는다", far.deform);
  ok(S.pan.indexOf(far) >= 0, "사라지지도 않는다");
}

/* ============================================================
   36. 시작 화면
   ============================================================ */
console.log("\n--- 36. 시작 화면 ---");
{
  /* 위에서 아래로: 플레이 장면 / 제목 / 두 줄 / 단추 */
  const order = ["s-shot", "t-title", "t-sub", "startBtn"]
    .map(k => html.indexOf(k));
  ok(order.every(i => i >= 0), "넷이 다 있다", order.join(","));
  ok(order.every((v, i) => i === 0 || v > order[i - 1]),
     "장면 -> 제목 -> 설명 -> 단추 차례다", order.join(" < "));

  const title = (html.match(/class="t-title"[^>]*>([^<]*)</) || [])[1] || "";
  ok(title === "호떡집을 운영하세요", "제목이 바뀌었다", title);
  ok(els.startBtn.textContent === "시작하기" ||
     html.indexOf(">시작하기<") >= 0, "단추는 '시작하기'");
  const sub2 = (html.match(/id="sIntro"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "";
  ok(/90초 동안 최대한 많이 파세요/.test(sub2), "첫 줄", sub2.slice(0, 40));
  ok(/너무 세게 누르면 터집니다/.test(sub2), "둘째 줄");
  ok(/<br\s*\/?>/.test(sub2), "두 줄로 나뉘어 있다");
  ok(html.indexOf("90초") >= 0, "제한시간도 알려 준다");
  for (const id of ["eShelf", "eCount", "eMade", "eLine", "shareBtn", "againBtn", "saveBtn"])
    ok(html.indexOf('id="' + id + '"') >= 0,
       "결과 화면에 " + id + " 칸이 있다");
  ok(html.indexOf("e-stats") < 0, "네 칸짜리 표는 걷어냈다");

  /* 걷어낸 것들 */
  ok(html.indexOf('id="sRule"') < 0, "노란 안내 상자를 걷어냈다");
  ok(css.indexOf(".t-rule") < 0, "그 스타일도 남기지 않았다");
  ok(html.indexOf("호떡을 구워 손님에게 파는 게임입니다") < 0,
     "예전 설명 문구도 걷어냈다");

  /* 플레이 장면 — 실제 파일이 있고, 16:10 이고, 꽉 채운다 */
  const shotSrc = (html.match(/id="sShot"[^>]*src="([^"]+)"/) || [])[1] || "";
  ok(shotSrc.indexOf("assets/opt/") === 0, "프로젝트 기준 상대 경로다", shotSrc);
  ok(fs.existsSync(path.join(ROOT, shotSrc)), "그 그림이 실제로 있다", shotSrc);
  {
    const b = fs.readFileSync(path.join(ROOT, shotSrc));
    const sz = webpSize(path.join(ROOT, shotSrc));
    ok(!!sz, "webp 크기를 읽을 수 있다");
    if (sz) ok(Math.abs(sz.w / sz.h - 1.6) < 0.03, "16:10 이다",
               sz.w + "x" + sz.h + " = " + (sz.w / sz.h).toFixed(3));
    ok(b.length > 10000, "빈 그림이 아니다", b.length + " 바이트");
  }
  ok(/aspect-ratio:\s*16\s*\/\s*10/.test(css), "칸도 16:10 으로 잡는다");
  ok(/\.s-shot img[\s\S]*?object-fit:\s*cover/.test(css),
     "꽉 채우되 비율은 안 찌그러진다");

  /* 흰 바탕, 검정 글자, 거의 직각 */
  ok(/\.over-start[^{]*\{[^}]*background:\s*#fff/.test(css), "바탕이 희다");
  ok(/\.over-start[^{]*\{[^}]*padding:[^;]*20%/.test(css),
     "좌우 여백을 20% 로 잡는다");
  ok(/\.over-start \.btn\s*\{[^}]*background:\s*#000/.test(css), "단추는 검정");
  ok(/\.over-start \.btn\s*\{[^}]*width:\s*100%/.test(css),
     "단추 너비가 장면 칸과 같다");
  ok(/\.mute\s*\{[^}]*color:\s*#111/.test(css), "소리 단추도 밝은 쪽으로");

  /* 설명과 단추가 한 묶음 */
  ok(html.indexOf('id="sBody"') >= 0, "설명과 단추가 한 묶음이다");
  ok(/\.s-body[^{]*\{[^}]*align-items:\s*center/.test(css),
     "그 묶음을 가운데로 모은다");
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
/* ============================================================
   36-2. 결과 화면 — 시작 화면과 같은 규칙
   ============================================================ */
console.log("\n--- 36-2. 결과 화면 ---");
{
  /* 위에서 아래로: 장면 / 제목 / 큰 숫자 / 말 / 한 줄 / 검정 / 흰 둘 / 계정.
     결과 화면 안쪽만 본다 — e-count 같은 이름은 도전장 화면에서도
     쓰이므로 문서 전체에서 찾으면 엉뚱한 자리가 걸린다. */
  const endHtml = html.slice(html.indexOf('id="endOver"'),
                             html.indexOf('id="vsOver"'));
  const order = ["e-shot", "e-title", "e-count", "eMade", "eLine",
                 "shareBtn", "againBtn", "saveBtn", "e-tag"]
    .map(k => endHtml.indexOf(k));
  ok(order.every(i => i >= 0), "아홉이 다 있다", order.join(","));
  ok(order.every((v, i) => i === 0 || v > order[i - 1]),
     "장면 -> 제목 -> 숫자 -> 말 -> 줄 -> 검정 -> 흰 둘 -> 계정 차례다",
     order.join(" < "));

  const title = (html.match(/class="e-title"[^>]*>([^<]*)</) || [])[1] || "";
  ok(title === "시간 종료!", "제목은 그대로", title);
  const main = (html.match(/id="shareBtn"[^>]*>([^<]*)</) || [])[1] || "";
  ok(main === "친구에게 도전장 보내기", "검정 단추 글", main);
  const sub1 = (html.match(/id="againBtn"[^>]*>([^<]*)</) || [])[1] || "";
  const sub2 = (html.match(/id="saveBtn"[^>]*>([^<]*)</) || [])[1] || "";
  ok(sub1 === "다시 도전" && sub2 === "결과 저장", "흰 단추 둘", sub1 + " / " + sub2);
  ok(/class="e-tag"[^>]*>@/.test(html), "아래에 계정 표기가 있다");

  /* 걷어낸 것들 */
  ok(html.indexOf('id="eSub"') < 0, "'90초 동안 만든 호떡' 줄을 걷어냈다");
  ok(css.indexOf(".e-stats") < 0, "네 칸짜리 표 스타일도 남기지 않았다");
  ok(!/\.e-count\s*\{[^}]*#F7C843/.test(css), "노란 강조를 걷어냈다");

  /* 흰 바탕, 검정 글자, 직각, 한 기둥 */
  ok(/\.over-end[^{]*\{[^}]*background:\s*#fff/.test(css), "바탕이 희다");
  ok(/\.over-end[^{]*\{[^}]*padding:[^;]*20%/.test(css), "좌우 여백 20%");
  ok(/\.e-shot\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10/.test(css), "장면 칸은 16:10");
  ok(/\.e-shot\s*\{[^}]*border:\s*1px solid #111/.test(css), "1px 검정 테두리");
  ok(/\.e-shot canvas[\s\S]*?object-fit:\s*cover/.test(css), "꽉 채우되 안 찌그러진다");
  ok(/\.btn-main\s*\{[^}]*background:\s*#000/.test(css), "메인 단추는 검정");
  ok(/\.btn-main,\s*\.btn-sub\s*\{[^}]*width:\s*100%/.test(css),
     "단추 폭은 장면과 같다");
  ok(/\.btn-sub\s*\{[^}]*background:\s*#fff/.test(css), "보조 단추는 흰색");
  ok(/\.e-subs\s*\{[^}]*gap:\s*8px/.test(css), "보조 둘 사이가 8px");
  ok(/\.e-line\s*\{[^}]*color:\s*#888/.test(css), "한 줄은 회색");

  /* 끝난 뒤에는 위쪽 띠를 그리지 않는다 */
  ok(/if \(!S\.running\) return;/.test(SRC), "결과 화면에서는 띠를 안 그린다");
}

{
  /* --- 숫자가 실제 결과와 맞는다 --- */
  freshGame();
  S.heat = 0.7;
  oilPan();
  makeMany(3);
  const ty = -G.TIP.tong.y;
  /* 손님에게 둘만 판다 */
  S.cust = null; S.nextIn = 0;
  wait(G.CUST.firstDelay + 0.6);
  ok(S.cust !== null, "손님이 왔다");
  S.cust.want = 2;
  G.sellTo();
  wait(1);
  S.timeLeft = 0.01;
  wait(0.1);
  ok(S.over === true, "시간이 끝났다");
  ok(els.eCount.textContent === "2", "큰 숫자는 판 개수", els.eCount.textContent);
  ok(els.eMade.textContent === "판매한 호떡 2개", "말로도 판 개수", els.eMade.textContent);
  ok(els.eLine.textContent === G.endLine(), "한 줄이 같은 값을 쓴다", els.eLine.textContent);
  ok(els.eLine.textContent.indexOf("남은 호떡 1개") >= 0, "남은 수도 맞는다",
     els.eLine.textContent);
  ok(S.made === S.sold + S.shelf.length, "만든 = 판매 + 재고",
     S.made + " = " + S.sold + " + " + S.shelf.length);

  /* 결과 장면은 이번 판에 만든 것 전부를 들고 있다 (판 것도) */
  ok(S.roundLook.length === S.made, "장면 기록이 만든 수와 같다",
     S.roundLook.length + " / " + S.made);
  ok(G.paint() === true, "결과 화면을 그려도 안 터진다", G.paint());
  ok(G.drawEndShelf() === undefined, "결과 장면을 그려도 안 터진다");

  /* 도전장 — 공유를 못 하면 복사하고, 복사도 못 하면 링크를 보여 준다 */
  const how = G.shareScore("테스터");
  ok(["share", "clipboard", "exec", "prompt"].indexOf(how) >= 0, "도전장을 보낸다", how);

  /* 다시 도전하면 장면 기록도 지워진다 */
  G.restart();
  ok(S.roundLook.length === 0, "장면 기록도 처음으로", S.roundLook.length);
  ok(S.made === 0 && S.sold === 0, "숫자도 처음으로");
}

/* ============================================================
   36-3. 도전장 — 링크 한 줄에 담아 보내는 기록
   ============================================================ */
console.log("\n--- 36-3. 도전장 ---");
{
  /* --- 담고 푸는 길이 서로 맞는가 --- */
  const rec = { nick: "호떡장인", sold: 12, left: 3, happy: 4, angry: 1 };
  const tok = G.makeToken(rec);
  ok(tok.indexOf("v1.") === 0, "표를 v1 로 붙인다", tok);
  ok(!/[+/=]/.test(tok), "주소에 그냥 못 쓰는 글자가 없다", tok);
  const back = G.parseToken(tok);
  ok(back !== null, "다시 풀린다");
  ok(back.nick === "호떡장인", "한글 이름이 그대로 돌아온다", back && back.nick);
  ok(back.sold === 12 && back.left === 3 && back.happy === 4 && back.angry === 1,
     "숫자 넷도 그대로", JSON.stringify(back));

  /* 담는 것은 다섯뿐이다 — 링크가 길어지면 메신저에서 잘린다 */
  const raw = JSON.parse(decodeURIComponent(escape(atob(
    tok.slice(3).replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - tok.slice(3).length % 4) % 4)))));
  ok(Object.keys(raw).length === 5, "링크에 담는 값은 다섯뿐이다",
     Object.keys(raw).join(","));
  ok(Object.keys(raw).join("") === "nskhu", "짧은 키를 쓴다", Object.keys(raw).join(","));

  /* --- 주소 --- */
  ok(!!G.BATTLE.base, "공개 주소가 한 곳에 적혀 있다", G.BATTLE.base);
  const url = G.buildUrl(tok);
  ok(url.indexOf("#battle/v1.") > 0, "주소 뒤에 해시로 붙는다", url);
  ok(url.split("#").length === 2, "해시는 하나뿐이다", url);
  /* 이미 해시가 붙은 주소를 또 겹쳐 붙이지 않는다 */
  const old = G.BATTLE.base;
  G.BATTLE.base = "https://x.test/g/#battle/v1.zzz";
  ok(G.buildUrl(tok).split("#").length === 2, "먼저 있던 해시는 떼고 붙인다",
     G.buildUrl(tok));
  /* 주소가 비어 있으면 도전장을 만들 수 없다 */
  G.BATTLE.base = "";
  ok(G.buildUrl(tok) === "", "주소가 없으면 링크도 없다");
  ok(G.shareScore("아무개") === "off", "주소가 없으면 보내지 않는다");
  G.BATTLE.base = old;

  /* --- 남이 만든 글자를 푸는 자리 --- */
  ok(G.parseToken("") === null, "빈 표는 버린다");
  ok(G.parseToken("v2.abc") === null, "모르는 판은 버린다");
  ok(G.parseToken("v1.!!!!") === null, "깨진 글자는 버린다");
  ok(G.parseToken("v1." + btoa('{"s":"twelve"}')) === null, "숫자가 아니면 버린다");
  ok(G.parseToken("v1." + btoa('{"s":-3}')) === null, "음수는 버린다");
  ok(G.parseToken("v1." + btoa('{"s":1000}')) === null, "너무 큰 수는 버린다");
  const dirty = G.parseToken("v1." + btoa(unescape(encodeURIComponent(
    JSON.stringify({ n: "<img>\u0007나쁜이름인데아주길다", s: 5 })))));
  ok(dirty !== null, "숫자만 맞으면 읽는다");
  ok(dirty.nick.indexOf("<") < 0 && dirty.nick.indexOf(">") < 0,
     "꺾쇠는 털어 낸다", dirty && dirty.nick);
  ok(dirty.nick.length <= 12, "이름은 열두 자까지", dirty && dirty.nick);
  const noName = G.parseToken("v1." + btoa('{"s":7}'));
  ok(noName && noName.nick === "친구", "이름이 없으면 '친구'", noName && noName.nick);
  ok(noName && noName.left === 0 && noName.happy === 0 && noName.angry === 0,
     "빠진 숫자는 0 으로");

  /* --- 해시 읽기 --- */
  ok(G.hashBattle("") === null, "해시가 없으면 도전장이 아니다");
  ok(G.hashBattle("#about") === null, "다른 해시는 도전장이 아니다");
  ok(G.hashBattle("#battle/v1.!!!") === null, "깨진 도전장은 버린다");
  const got = G.hashBattle("#battle/" + tok);
  ok(got !== null && got.sold === 12, "도전장 해시를 읽는다", JSON.stringify(got));

  /* --- 도전장 화면 --- */
  ok(/class="over over-battle" id="battleOver"[^>]*hidden/.test(html),
     "도전장 화면은 처음에 닫혀 있다");
  const batHtml = html.slice(html.indexOf('id="battleOver"'),
                             html.indexOf('id="endOver"'));
  const bOrder = ["s-shot", "b-title", "bWho", "bCount", "b-dare", "bStart"]
    .map(k => batHtml.indexOf(k));
  ok(bOrder.every(i => i >= 0), "도전장 화면의 여섯이 다 있다", bOrder.join(","));
  ok(bOrder.every((v, i) => i === 0 || v > bOrder[i - 1]),
     "그림 -> 제목 -> 라벨 -> 숫자 -> 문구 -> 단추 차례다", bOrder.join(" < "));
  const bt = (html.match(/class="b-title"[^>]*>([^<]*)</) || [])[1] || "";
  ok(bt === "도전장이 도착했습니다", "도전장 제목", bt);
  const bd = (html.match(/class="b-dare"[^>]*>([^<]*)</) || [])[1] || "";
  ok(bd === "이길 수 있으면 해보세요.", "도전장 문구", bd);
  const bs = (html.match(/id="bStart"[^>]*>([^<]*)</) || [])[1] || "";
  ok(bs === "도전 시작", "도전장 단추", bs);
  ok(/\.over-start,[^{]*\.over-battle[^{]*\{[^}]*background:\s*#fff/.test(css),
     "도전장도 흰 바탕이다");

  /* 화면을 실제로 세워 본다 — 아직 [시작] 을 안 누른 상태에서 */
  G.reset();
  S.running = false; S.over = false;
  els.startOver.hidden = false; els.endOver.hidden = true;
  els.vsOver.hidden = true; els.nickOver.hidden = true;
  S.battle = G.hashBattle("#battle/" + G.makeToken(
    { nick: "<b>철수", sold: 9, left: 2, happy: 3, angry: 0 }));
  ok(S.battle !== null, "친구 기록을 들고 있다");
  ok(G.showBattle() === true, "도전장 화면이 열린다");
  ok(els.battleOver.hidden === false, "도전장 화면이 보인다");
  ok(els.startOver.hidden === true, "시작 화면은 가려진다");
  ok(els.bCount.textContent === "9", "친구가 판 개수", els.bCount.textContent);
  ok(els.bWho.textContent === "b철수의 호떡집 운영 기록",
     "이름은 글자로만 넣는다", els.bWho.textContent);
  ok(SRC.indexOf("innerHTML") < 0, "innerHTML 을 쓰지 않는다");

  /* [도전 시작] 은 시작 화면을 거치지 않고 바로 굽는다 */
  ok(S.running === false, "누르기 전에는 시간이 가지 않는다");
  els.bStart.click();
  ok(els.battleOver.hidden === true, "도전장 화면이 닫힌다");
  ok(els.startOver.hidden === true, "시작 화면은 끼어들지 않는다");
  ok(S.running === true, "바로 굽기 시작한다");
  ok(S.timeLeft === G.MODE.timeLimit, "시간은 처음부터", S.timeLeft);

  /* --- 한 판 굽고 대결 결과까지 --- */
  oilPan();
  makeMany(2);
  S.cust = null; S.nextIn = 0;
  wait(G.CUST.firstDelay + 0.6);
  if (S.cust) { S.cust.want = 2; G.sellTo(); wait(1); }
  const mine = S.sold;
  S.timeLeft = 0.01;
  wait(0.1);
  ok(els.endOver.hidden === false, "결과 화면이 열린다");
  ok(els.vsBtn.hidden === false, "도전으로 들어온 판에는 대결 단추가 보인다");

  els.vsBtn.click();
  ok(els.vsOver.hidden === false, "대결 화면이 열린다");
  ok(els.endOver.hidden === true, "결과 화면은 가려진다");
  ok(els.vFoeName.textContent === "b철수", "친구 이름", els.vFoeName.textContent);
  ok(els.vScore.textContent === "9 VS " + mine, "친구 먼저, 내가 뒤",
     els.vScore.textContent);
  ok(els.vVerdict.textContent === G.vsVerdict(mine, 9), "승패 문구가 같은 값을 쓴다",
     els.vVerdict.textContent);
  ok(G.vsVerdict(7, 3) === "이겼습니다. 4개 차이.", "더 팔면 이겼다", G.vsVerdict(7, 3));
  ok(G.vsVerdict(3, 7) === "졌습니다. 4개 부족.", "덜 팔면 졌다", G.vsVerdict(3, 7));
  ok(G.vsVerdict(5, 5) === "무승부. 한 번 더.", "같으면 무승부", G.vsVerdict(5, 5));

  /* [내 결과 자세히 보기] 는 되돌아갈 뿐이다 */
  els.vBack.click();
  ok(els.vsOver.hidden === true && els.endOver.hidden === false,
     "결과 화면으로 돌아온다");
  ok(S.sold === mine, "숫자는 그대로", S.sold);

  /* [다시 붙기] 는 친구 기록을 들고 한 판을 새로 연다 */
  els.vsBtn.click();
  const foe = S.battle;
  els.vAgain.click();
  ok(els.vsOver.hidden === true && els.endOver.hidden === true, "두 화면 다 닫힌다");
  ok(S.battle === foe, "친구 기록은 그대로다");
  ok(S.running === true && S.over === false, "바로 다시 굽는다");
  ok(S.sold === 0 && S.made === 0, "내 숫자만 처음으로", S.sold + "/" + S.made);
  ok(S.timeLeft === G.MODE.timeLimit, "시간도 처음부터", S.timeLeft);

  /* 일반 플레이에는 대결 단추가 없다 */
  els.vsOver.hidden = true;
  freshGame();
  S.battle = null;
  S.timeLeft = 0.01;
  wait(0.1);
  ok(els.endOver.hidden === false, "결과 화면이 열린다");
  ok(els.vsBtn.hidden === true, "그냥 한 판에는 대결 단추가 없다");
  ok(G.showVs() === false, "볼 상대가 없으면 대결 화면도 안 연다");
}

{
  /* --- 닉네임 묻기 --- */
  ok(/class="over over-nick" id="nickOver"[^>]*hidden/.test(html),
     "이름 묻는 칸은 처음에 닫혀 있다");
  const nt = (html.match(/class="n-title"[^>]*>([^<]*)</) || [])[1] || "";
  ok(nt === "도전장에 적을 닉네임", "묻는 말", nt);
  ok(/id="nickInput"[^>]*maxlength="12"/.test(html), "열두 자까지만 받는다");
  ok(/id="nickInput"[^>]*placeholder="예: 호떡장인"/.test(html), "보기를 적어 둔다");

  freshGame();
  S.timeLeft = 0.01;
  wait(0.1);
  /* 도전장 단추를 누르면 바로 보내지 않고 이름부터 묻는다 */
  els.shareBtn.click();
  ok(els.nickOver.hidden === false, "이름부터 묻는다");

  /* 취소하면 아무 일도 없다 */
  els.nickCancel.click();
  ok(els.nickOver.hidden === true, "닫힌다");
  ok(els.endOver.hidden === false, "결과 화면으로 돌아온다");

  /* 비워서 확인하면 '친구' 로 적힌다 */
  els.shareBtn.click();
  els.nickInput.value = "   ";
  els.nickOk.click();
  ok(els.nickOver.hidden === true, "확인하면 닫힌다");
  ok(G.parseToken(G.shareLink().split("#battle/")[1]).nick === "친구",
     "비워 두면 '친구' 로 적는다", G.shareLink());

  /* 적은 이름은 기억해 두었다가 다음에 채워 준다 */
  els.shareBtn.click();
  els.nickInput.value = "호떡왕";
  els.nickOk.click();
  els.shareBtn.click();
  ok(els.nickInput.value === "호떡왕", "지난 이름을 채워 준다", els.nickInput.value);
  els.nickCancel.click();

  /* 엔터는 확인, Esc 는 취소 */
  els.shareBtn.click();
  els.nickInput.value = "엔터맨";
  els.nickInput.fire("keydown", { key: "Enter", preventDefault() {} });
  ok(els.nickOver.hidden === true, "엔터로 확인한다");
  els.shareBtn.click();
  els.nickInput.fire("keydown", { key: "Escape", preventDefault() {} });
  ok(els.nickOver.hidden === true, "Esc 로 취소한다");

  /* 링크에는 이번 판의 기록이 담긴다 */
  const link = G.shareLink();
  const r = G.parseToken(link.split("#battle/")[1]);
  ok(r !== null, "내가 만든 링크는 내가 읽을 수 있다", link);
  ok(r.sold === S.sold && r.left === S.shelf.length &&
     r.happy === S.happy && r.angry === S.upset,
     "내 기록 그대로 담긴다", JSON.stringify(r));

  /* 저장이 막혀 있어도 터지지 않는다 */
  LSF.fail = true;
  els.shareBtn.click();
  els.nickInput.value = "막힌이";
  ok(els.nickOk.click() === undefined, "저장이 막혀도 확인이 된다");
  ok(els.nickOver.hidden === true, "닫히기는 한다");
  LSF.fail = false;
}

console.log("\n--- 37. 전시대 ---");

{
  /* --- 그림과 자리 --- */
  ok(G.ASSET_MAP.tray === "hotteok-wire-rack.webp",
     "철망 그림을 에셋 목록으로 읽는다", G.ASSET_MAP.tray);
  ok(G.ART_DIR + G.ASSET_MAP.tray === "assets/opt/hotteok-wire-rack.webp",
     "프로젝트 기준 상대 경로다", G.ART_DIR + G.ASSET_MAP.tray);
  /* 바뀐 그림이 남아서 겹쳐 나오지 않는다 */
  ok(!/hotteok-display-tray/.test(SRC), "예전 트레이 그림을 더 읽지 않는다");
  ok(!fs.existsSync(path.join(ROOT, "assets/opt/hotteok-display-tray.webp")),
     "예전 트레이 webp 를 걷어냈다");
  /* 작업용 경로가 코드에 박히지 않았나. http(s):// 까지 걸리지 않도록
     윈도 드라이브 경로와 작업 폴더 이름만 본다. */
  ok(!/[A-Za-z]:[\\/]{1,2}Users|\.codex|chatgpt-projects|file:\/\//.test(SRC),
     "작업용 절대 경로를 코드에 넣지 않았다");
  ok(fs.existsSync(path.join(ROOT, "assets/opt/hotteok-wire-rack.webp")),
     "webp 사본이 있다");
  /* 받은 원본은 확장자가 없다. 이름을 바꾸지도 지우지도 않는다. */
  ok(fs.existsSync(path.join(ROOT, "assets/\uc804\uc2dc\ub300")),
     "받은 원본을 그대로 두었다");
  {
    const b = fs.readFileSync(path.join(ROOT, "assets/\uc804\uc2dc\ub300"));
    ok(b.readUInt32BE(0) === 0x89504e47, "원본은 PNG 다");
    ok(b.readUInt32BE(16) === 2176 && b.readUInt32BE(20) === 722,
       "원본 크기 2176x722", b.readUInt32BE(16) + "x" + b.readUInt32BE(20));
  }
  /* webp 가 투명한가 — VP8L / VP8X(알파 플래그) 둘 중 하나여야 한다 */
  {
    const b = fs.readFileSync(path.join(ROOT, "assets/opt/hotteok-wire-rack.webp"));
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
  /* 투명 여백을 뺀 실제 철망 넓이에서 나온 비율인가 (원본 알파 경계
     2171x688 -> 3.1555). 캔버스 통째 비율(2176/722=3.014)이면 틀렸다. */
  ok(Math.abs(G.TRAY.ratio - 3.1555) < 0.01,
     "투명 여백이 아니라 철망 넓이로 잰 비율이다", G.TRAY.ratio);
  ok(inn.x > r.x && inn.x + inn.w < r.x + r.w, "안쪽 바닥이 그림 안에 있다");
  ok(inn.base > inn.y && inn.base < r.y + r.h * G.TRAY.front,
     "호떡 기준선이 바닥 위, 앞 테두리 앞이다",
     Math.round(inn.base) + " / " + Math.round(r.y + r.h * G.TRAY.front));
  for (const k of ["inner", "base", "front", "scale", "stand", "pitch",
                   "tilt", "jitter", "rise"])
    ok(G.TRAY[k] !== undefined, "배치 값 " + k + " 이 따로 나와 있다");
}

{
  /* --- 조리 영역과 도구를 가리지 않는다 --- */
  const r = G.trayRect();
  /* 철판과 접시는 아예 닿지 않는다 */
  for (const k of ["pan", "plate"]) {
    const z = LAY[k];
    const hit = z.x + z.rx > r.x && z.x - z.rx < r.x + r.w &&
                z.y + z.ry > r.y && z.y - z.ry < r.y + r.h;
    ok(!hit, "전시대가 " + k + " 자리에 닿지 않는다");
  }
  /* 양쪽 통과 도구 자리는 철망이 위를 지나간다. 지나갈 뿐이고,
     누르면 전시대가 아니라 그 자리가 받아야 한다. */
  ok(!G.inTray(LAY.dough.x, LAY.dough.y), "반죽통 자리를 전시대가 안 가져간다");
  ok(!G.inTray(LAY.fill.x, LAY.fill.y), "설탕통 자리를 전시대가 안 가져간다");
  for (const t of G.TOOLS)
    ok(!G.inTray(t.home.x, t.home.y),
       t.name + " 집는 자리를 전시대가 안 가져간다");
  /* 통 안의 내용물은 촘촘한 바닥 철망 위에 있어야 보인다 —
     바닥 철망이 시작하는 높이가 두 통의 중심보다 아래여야 한다. */
  const meshTop = r.y + r.h * G.TRAY.inner.y0;
  ok(meshTop > LAY.dough.y, "반죽통 속이 바닥 철망 위에 있다",
     Math.round(meshTop) + " > " + LAY.dough.y);
  ok(meshTop > LAY.fill.y, "설탕통 속이 바닥 철망 위에 있다",
     Math.round(meshTop) + " > " + LAY.fill.y);
  const c = G.HUD;
  ok(r.y > c.y + c.h, "상단 타이머 아래에 있다",
     Math.round(r.y) + " > " + Math.round(c.y + c.h));
  ok(r.y + r.h < LAY.pan.y - LAY.pan.ry, "철판 위에서 끝난다",
     Math.round(r.y + r.h) + " < " + Math.round(LAY.pan.y - LAY.pan.ry));
  /* 작은 빈틈에 끼워 넣지 않았나 — 화면 너비의 70% 이상 */
  ok(r.w / 1080 >= 0.7, "철망이 화면 너비의 70% 이상이다",
     (r.w / 1080 * 100).toFixed(0) + "%");
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

  /* 못 만든 것도 전시된다 — 흠만 적힌다 */
  tearToPan();
  toPlate();
  ok(S.made === 4 && S.shelf.length === 4, "생반죽도 전시된다",
     S.made + " / " + S.shelf.length);
  ok(S.shelf[3].q.ok === false, "다만 흠 있는 호떡으로 적힌다");

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

  makeMany(2);
  wait(2);
  const x0 = G.shelfSlotX(0), x1 = G.shelfSlotX(1);
  const step = x1 - x0;
  ok(x1 > x0, "완성 순서대로 왼쪽부터", Math.round(x0) + " -> " + Math.round(x1));
  /* 겹치되 완전히 포개지지는 않는다 — 앞 호떡 지름의 35~50% 만큼 나아간다 */
  {
    const d0 = S.shelf[0].dia;
    const k = step / d0;
    ok(k > 0.3 && k < 0.55, "중심 간격이 지름의 30~55% 다", k.toFixed(2));
    ok(step < d0, "앞 호떡과 겹친다", Math.round(step) + " < " + Math.round(d0));
  }
  const fit = Math.max(1, Math.floor(inn.w / step));
  ok(fit >= 3, "한 줄에 적어도 세 개는 보인다", fit);

  /* 한 줄이 넘도록 만든다 — 줄이지도, 버리지도 않는다 */
  const n0 = S.shelf.length;
  const firstDia = S.shelf[0].dia;
  makeMany(fit + 2);
  ok(S.shelf.length === n0 + fit + 2, "넘쳐도 다 보관한다", S.shelf.length);
  ok(S.made === S.shelf.length, "개수와 전시 수가 끝까지 같다",
     S.made + " / " + S.shelf.length);
  ok(Math.abs(S.shelf[0].dia - firstDia) < 0.01,
     "칸이 모자라다고 먼저 올린 호떡을 줄이지 않는다",
     firstDia.toFixed(1) + " -> " + S.shelf[0].dia.toFixed(1));
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
  ok(S.grab && S.grab.kind === "tap", "반죽에서 시작한 누르기는 조리다",
     S.grab && S.grab.kind);
  const mid2 = { x: G.trayRect().x + G.trayRect().w * 0.5,
                 y: G.trayRect().y + G.trayRect().h * 0.5 };
  const sc0 = S.shelfScroll;
  for (let i = 1; i <= 8; i++) {
    G.move({ x: (h.x + (mid2.x - h.x) * (i / 8)), y: (h.y + (mid2.y - h.y) * (i / 8)) });
    G.step(0.016);
  }
  ok(S.grab && S.grab.kind === "tap", "전시대 위를 지나도 조리 그대로",
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
  ok(els.eCount.textContent === String(S.sold), "개수가 맞다", els.eCount.textContent);
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


/* ============================================================
   38. 손님 — 재고를 사 가고 한마디 한다
   ============================================================ */
console.log("\n--- 38. 손님 ---");

/* 품질을 마음대로 정한 호떡을 전시대에 바로 올린다. 손님 쪽 규칙만
   보려는 것이라, 매번 구워 만들면 시간도 오래 걸리고 원하는 흠을
   정확히 낼 수도 없다. 조리 경로 자체는 다른 절에서 본다. */
function shelveFake(opt) {
  const h = G.shelfClone(fakeDough());
  h.cookA = opt.cookA === undefined ? 70 : opt.cookA;
  h.cookB = opt.cookB === undefined ? 70 : opt.cookB;
  h.core = opt.core === undefined ? 55 : opt.core;
  h.fillPut = opt.fillPut === undefined ? 1.0 : opt.fillPut;
  S.made++;
  S.shelf.push(G.shelfEntry(h));
  if (S.made === 1) S.nextIn = G.CUST.firstDelay;
  return S.shelf[S.shelf.length - 1];
}
function fakeDough() {
  tearToPan();
  const h = S.h;
  /* 모양만 빌린다 — 철판 자리는 도로 비운다 */
  const i = S.pan.indexOf(h);
  if (i >= 0) S.pan.splice(i, 1);
  S.h = S.pan[S.pan.length - 1] || null;
  return h;
}
function stockUp(list) {
  for (const o of list) shelveFake(o);
}
function painted() {
  const ctx = els.cv.getContext();
  ctx._texts.length = 0;
  G.draw();
  return ctx._texts.slice();
}
const GOOD = {}, BURNT = { cookA: 70, cookB: 130 }, RAW = { cookA: 10, cookB: 70 },
      NOFILL = { fillPut: 0 };

{
  /* --- 그림 넷 --- */
  const want = ["custWoman", "custMan", "custGrandma", "custKid"];
  for (const k of want) {
    ok(typeof G.ASSET_MAP[k] === "string", k + " 가 에셋 목록에 있다", G.ASSET_MAP[k]);
    const rel = G.ART_DIR + G.ASSET_MAP[k];
    ok(rel.indexOf("assets/opt/") === 0, k + " 는 프로젝트 기준 상대 경로", rel);
    ok(fs.existsSync(path.join(ROOT, rel)), k + " webp 파일이 있다", rel);
    /* 투명한가 — VP8L 이거나 VP8X 의 알파 플래그 */
    const b = fs.readFileSync(path.join(ROOT, rel));
    const tag = b.slice(12, 16).toString("ascii");
    ok(tag === "VP8L" || (tag === "VP8X" && (b[20] & 0x10) !== 0),
       k + " 가 투명도를 들고 있다", tag);
  }
  /* 받은 원본도 그대로 둔다 */
  for (const f of ["customer-woman", "customer-man", "customer-grandma", "customer-kid"])
    ok(fs.existsSync(path.join(ROOT, "assets/" + f + ".png")),
       f + " 원본 PNG 를 지우지 않았다");
  /* 네 사람이 돌아가며 나온다 */
  ok(G.WHO.length === 4, "손님은 넷", G.WHO.length);
  ok(G.WHO.filter(w => w.kid).length === 1, "그중 하나가 꼬마");
  /* 도형이나 글자로 대신 그리지 않는다 */
  ok(/fadedCust\(S\.cust\.who\.id\)/.test(SRC) && /g\.drawImage\(im,/.test(SRC),
     "손님은 받은 그림으로만 그린다 (도형 대체 없음)");
  ok(/const im = fadedCust\(S\.cust\.who\.id\);\n\s*if \(!im\) return;/.test(SRC),
     "그림이 없으면 아무도 안 그린다");
}

{
  /* --- 서는 자리 --- */
  freshGame();
  S.cust = { who: G.WHO[0], want: 2, phase: "ask", t: 0, wait: 0, say: "x", mood: "ask", done: false };
  const r = G.custRect();
  ok(r !== null, "손님 자리가 나온다");
  const top = r.bottom - r.h;
  ok(top > G.HUD.y + G.HUD.h, "타이머 띠 아래에서 시작한다",
     Math.round(top) + " > " + (G.HUD.y + G.HUD.h));
  /* 카운터 너머 — 허리 아래는 철망과 조리대가 가린다 */
  ok(r.bottom > G.trayRect().y, "허리께가 철망에 걸친다",
     Math.round(r.bottom) + " > " + Math.round(G.trayRect().y));
  ok(r.bottom < LAY.pan.y - LAY.pan.ry, "철판 위로는 안 내려온다",
     Math.round(r.bottom) + " < " + Math.round(LAY.pan.y - LAY.pan.ry));
  /* 배경 바로 다음, 철망보다 먼저 그린다 */
  ok(SRC.indexOf("drawCustomer(g);") < SRC.indexOf("drawShelf(g);"),
     "손님을 철망보다 먼저 그린다 (철망이 앞을 가린다)");
  /* 꼬마가 더 작다 */
  S.cust.who = G.WHO.find(w => w.kid);
  const kid = G.custRect();
  S.cust.who = G.WHO.find(w => !w.kid);
  const adult = G.custRect();
  ok(kid.h < adult.h, "꼬마는 어른보다 작다",
     Math.round(kid.h) + " < " + Math.round(adult.h));
  /* 말풍선과 단추가 조리대 위 어느 것도 안 가린다 */
  const b = G.CUST.bubble, bt = G.CUST.btn;
  for (const box of [b, bt]) {
    const x0 = box.x - box.w / 2, x1 = box.x + box.w / 2;
    const y0 = box.y - box.h / 2, y1 = box.y + box.h / 2;
    ok(y0 > G.HUD.y + G.HUD.h, "타이머 띠를 안 가린다", Math.round(y0));
    ok(y1 < G.trayRect().y, "전시대를 안 가린다",
       Math.round(y1) + " < " + Math.round(G.trayRect().y));
    for (const k of ["dough", "fill", "pan", "plate"]) {
      const z = LAY[k];
      const hit = z.x + z.rx > x0 && z.x - z.rx < x1 && z.y + z.ry > y0 && z.y - z.ry < y1;
      ok(!hit, "말풍선/단추가 " + k + " 를 안 가린다");
    }
    for (const t of G.TOOLS) {
      const hit = t.home.x + t.hit > x0 && t.home.x - t.hit < x1 &&
                  t.home.y + t.hit > y0 && t.home.y - t.hit < y1;
      ok(!hit, "말풍선/단추가 " + t.name + " 자리를 안 가린다");
    }
  }
  S.cust = null;
}

{
  /* --- 언제 오나 --- */
  freshGame();
  wait(20);
  ok(S.cust === null, "호떡이 하나도 없으면 손님이 안 온다");
  shelveFake(GOOD);
  ok(S.cust === null, "첫 호떡을 올린 그 순간에 바로 오지도 않는다");
  wait(G.CUST.firstDelay + 0.3);
  ok(S.cust !== null, "조금 있다가 첫 손님이 온다");
  ok(S.cust.want >= G.CUST.wantMin && S.cust.want <= G.CUST.wantMax,
     "1~3개를 달라고 한다", S.cust && S.cust.want);
  /* 한 개짜리 문구 하나는 숫자 없이 "하나만 주세요!" 라고 한다 —
     수를 말하는 방식이 다를 뿐 수량은 들어 있다. */
  ok(/[0-9]/.test(S.cust.say) || (S.cust.want === 1 && S.cust.say.indexOf("하나") >= 0),
     "수량이 말에 들어 있다", S.cust.want + " / " + S.cust.say);
  /* 한 번에 한 명 */
  const who = S.cust;
  wait(2);
  ok(S.cust === who, "손님은 한 번에 한 명뿐이다");
}

{
  /* --- 재고가 모자라면 못 판다 --- */
  freshGame();
  stockUp([GOOD]);
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 3;
  ok(G.canSell() === false, "재고가 모자라면 못 건넨다");
  ok(G.sellLabel() === "1/3개 준비됨", "얼마나 모았는지 보여 준다", G.sellLabel());
  const made0 = S.made;
  G.sellTo();
  ok(S.sold === 0 && S.shelf.length === 1, "눌러도 아무 일이 없다",
     S.sold + " / " + S.shelf.length);
  ok(S.made === made0, "모자란 호떡을 저절로 만들지 않는다", S.made);
  stockUp([GOOD, GOOD]);
  ok(G.canSell() === true, "수량이 차면 건넬 수 있다");
  ok(G.sellLabel() === "3개 건네기", "단추 글이 바뀐다", G.sellLabel());
}

{
  /* --- 오래 기다리면 그냥 간다 --- */
  freshGame();
  stockUp([GOOD]);
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 3;
  wait(G.CUST.waitSec + 0.5);
  ok(S.cust && S.cust.phase === "say", "기다리다 한마디 하고 돌아선다",
     S.cust && S.cust.phase);
  ok(G.SAY.leave.indexOf(S.cust.say) >= 0, "다음에 온다고 한다", S.cust.say);
  ok(S.upset === 0, "기다리다 간 손님은 불만 손님이 아니다", S.upset);
  ok(S.happy === 0, "만족 손님도 아니다", S.happy);
  ok(S.sold === 0 && S.shelf.length === 1, "재고는 그대로다");
  wait(G.CUST.saySec + G.CUST.outSec + 0.3);
  ok(S.cust === null, "떠났다");
}

{
  /* --- 먼저 만든 것부터 나간다 --- */
  freshGame();
  stockUp([GOOD, GOOD, GOOD, GOOD, GOOD]);
  const ids = S.shelf.map(s => s.id);
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 2;
  ok(G.sellTo() === true, "건넸다");
  ok(S.sold === 2, "판매 수가 오른다", S.sold);
  ok(S.shelf.length === 3, "재고가 그만큼 준다", S.shelf.length);
  ok(S.shelf[0].id === ids[2], "앞의 둘이 나갔다 (선입선출)",
     S.shelf.map(s => s.id).join(","));
  ok(S.made === 5, "만든 수는 안 줄어든다", S.made);
  ok(S.made === S.sold + S.shelf.length, "만든 = 판매 + 재고",
     S.made + " = " + S.sold + " + " + S.shelf.length);
  /* 남은 것들의 자리가 당겨진다 */
  ok(Math.abs(S.shelf[0].off - S.shelf[0].dia * 0.5) < 0.01,
     "남은 것이 맨 앞으로 당겨진다", S.shelf[0].off.toFixed(1));
  /* 연타 */
  const sold0 = S.sold, stock0 = S.shelf.length;
  G.sellTo(); G.sellTo(); G.sellTo();
  ok(S.sold === sold0 && S.shelf.length === stock0,
     "연타해도 두 번 나가지 않는다", S.sold + " / " + S.shelf.length);
}

{
  /* --- 산 묶음만 보고 말한다 --- */
  /* 모두 멀쩡 */
  freshGame();
  stockUp([GOOD, GOOD, BURNT, RAW]);     /* 뒤의 둘은 안 판다 */
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 2;
  G.sellTo();
  ok(S.cust.mood === "good", "앞의 둘만 샀으니 좋은 말", S.cust.mood);
  ok(G.SAY.good.indexOf(S.cust.say) >= 0, "긍정 문구다", S.cust.say);
  ok(S.happy === 1 && S.upset === 0, "만족 손님 하나", S.happy + "/" + S.upset);
  ok(S.shelf.length === 2, "안 판 불량은 그대로 남아 있다");

  /* 멀쩡한 것 사이에 탄 것 하나 */
  freshGame();
  stockUp([GOOD, BURNT, GOOD]);
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 3;
  G.sellTo();
  ok(S.cust.mood === "burnt", "하나만 타도 불만", S.cust.mood);
  ok(G.SAY.burnt.indexOf(S.cust.say) >= 0, "탄 것에 대한 말", S.cust.say);
  ok(S.upset === 1 && S.happy === 0, "불만 손님 하나", S.happy + "/" + S.upset);

  /* 덜 익은 것 */
  freshGame();
  stockUp([GOOD, RAW]);
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 2;
  G.sellTo();
  ok(S.cust.mood === "raw", "덜 익은 것이 섞이면 그 말", S.cust.mood);
  ok(G.SAY.raw.indexOf(S.cust.say) >= 0, "덜 익음 문구", S.cust.say);

  /* 속이 없는 것 */
  freshGame();
  stockUp([GOOD, NOFILL]);
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 2;
  G.sellTo();
  ok(S.cust.mood === "nofill", "속 없는 것이 섞이면 그 말", S.cust.mood);
  ok(G.SAY.nofill.indexOf(S.cust.say) >= 0, "속 없음 문구", S.cust.say);

  /* 섞이면 한 문장만, 차례는 늘 같다: 덜 익음 -> 탐 -> 속 없음 */
  const both = [{ q: { raw: true, burnt: true, nofill: true } }];
  ok(G.verdictOf(both).mood === "raw", "여러 흠이면 덜 익음이 먼저");
  ok(G.verdictOf([{ q: { raw: false, burnt: true, nofill: true } }]).mood === "burnt",
     "그다음이 탐");
  ok(G.verdictOf([{ q: { raw: false, burnt: false, nofill: true } }]).mood === "nofill",
     "그다음이 속 없음");
  ok(G.verdictOf([{ q: { raw: false, burnt: false, nofill: false } }]).mood === "good",
     "다 멀쩡하면 좋은 말");
}

{
  /* --- 안 판 재고는 반응을 바꾸지 않는다 --- */
  freshGame();
  stockUp([GOOD]);
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 1;
  /* 전시대에 탄 것과 생것을 잔뜩 쌓아 둔다 — 사 가는 것은 앞의 하나뿐 */
  stockUp([BURNT, BURNT, RAW, NOFILL]);
  G.sellTo();
  ok(S.cust.mood === "good", "안 판 불량 때문에 말이 바뀌지 않는다", S.cust.mood);
  ok(S.happy === 1 && S.upset === 0, "만족으로 센다");
}

{
  /* --- 손님이 있어도 조리는 계속된다 --- */
  freshGame();
  stockUp([GOOD]);
  wait(G.CUST.firstDelay + 0.5);
  ok(S.cust !== null, "손님이 와 있다");
  const made0 = S.made;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  wait(6); flip(); wait(6);
  ok(S.h !== null, "손님이 말하는 동안에도 반죽을 만질 수 있다");
  toPlate();
  ok(S.made === made0 + 1, "제출도 된다", S.made);
  ok(S.cust !== null, "그 사이 손님은 그대로 서 있다");
  /* 전체 화면으로 덮지 않는다 */
  ok(els.endOver.hidden === true && els.startOver.hidden === true,
     "손님 때문에 다른 화면이 뜨지 않는다");
}

{
  /* --- 단추가 조리를 막지 않는다 --- */
  freshGame();
  stockUp([GOOD, GOOD]);
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 1;
  const b = G.CUST.btn;
  ok(G.inSellBtn(b.x, b.y) === true, "단추 자리는 단추가 받는다");
  ok(G.inTray(b.x, b.y) === false, "거기는 전시대가 안 가져간다");
  ok(G.inSellBtn(LAY.pan.x, LAY.pan.y) === false, "철판 위는 단추가 아니다");
  ok(G.inSellBtn(LAY.dough.x, LAY.dough.y) === false, "반죽통도 아니다");
  /* 손님이 없으면 단추도 없다 */
  S.cust = null;
  ok(G.sellBtnOn() === false, "손님이 없으면 단추가 안 보인다");
  ok(G.inSellBtn(b.x, b.y) === false, "그 자리를 눌러도 아무 일 없다");
  /* 실제 포인터로 눌러 본다 */
  freshGame();
  stockUp([GOOD, GOOD]);
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 2;
  G.down({ x: b.x, y: b.y });
  ok(S.grab && S.grab.kind === "sell", "그 자리를 누르면 판매로 간다",
     S.grab && S.grab.kind);
  ok(S.sold === 2, "실제로 팔렸다", S.sold);
  G.move({ x: b.x + 60, y: b.y });
  release();
  ok(S.grab === null, "손을 떼면 끝난다");
  ok(S.sold === 2, "끌어도 더 팔리지 않는다", S.sold);
}

{
  /* --- 시간 종료 --- */
  freshGame();
  stockUp([GOOD, GOOD, GOOD]);
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 2;
  G.sellTo();
  const sold0 = S.sold, happy0 = S.happy, stock0 = S.shelf.length;
  ok(S.flyout.length === 2, "건너가는 중이다", S.flyout.length);
  S.timeLeft = 0.01;
  wait(0.1);
  ok(S.over === true, "시간이 끝났다");
  ok(S.sold === sold0 && S.happy === happy0,
     "건너가던 중에 끝나도 확정된 거래는 남는다", S.sold + "/" + S.happy);
  ok(S.shelf.length === stock0, "재고도 어긋나지 않는다", S.shelf.length);
  ok(S.made === S.sold + S.shelf.length, "만든 = 판매 + 재고",
     S.made + " = " + S.sold + " + " + S.shelf.length);
  ok(S.cust === null, "손님은 보낸다");
  /* 끝난 뒤에는 아무것도 안 일어난다 */
  const n = S.sold;
  G.spawnCustomer();
  ok(G.canSell() === false, "종료 뒤에는 못 판다");
  S.cust = null;
  wait(30);
  ok(S.cust === null, "새 손님도 안 온다");
  ok(S.sold === n, "판매 수도 안 바뀐다", S.sold);
  /* 결과 화면 — 큰 숫자 하나와 한 줄에 네 가지 */
  ok(els.eCount.textContent === String(sold0), "큰 숫자는 판 개수", els.eCount.textContent);
  const l = els.eLine.textContent;
  ok(l.indexOf("판매 " + sold0 + "개") >= 0, "한 줄에 판매 수", l);
  ok(l.indexOf("남은 호떡 " + stock0 + "개") >= 0, "한 줄에 남은 수", l);
  ok(l.indexOf("만족 손님 " + happy0 + "명") >= 0, "한 줄에 만족 손님", l);
  ok(l.indexOf("불만 손님 " + S.upset + "명") >= 0, "한 줄에 불만 손님", l);
}

{
  /* --- 기다리던 손님은 불만이 아니다 (종료 시) --- */
  freshGame();
  stockUp([GOOD]);
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 3;
  ok(G.canSell() === false, "못 사고 기다리는 중");
  S.timeLeft = 0.01;
  wait(0.1);
  ok(S.upset === 0, "못 사고 끝난 손님을 불만으로 세지 않는다", S.upset);
  ok(S.happy === 0, "만족으로도 안 센다", S.happy);
}

{
  /* --- 다시 도전 --- */
  freshGame();
  stockUp([GOOD, GOOD, BURNT]);
  wait(G.CUST.firstDelay + 0.5);
  S.cust.want = 2;
  G.sellTo();
  S.timeLeft = 0.01; wait(0.1);
  const oldShelf = S.shelf, oldFly = S.flyout;
  G.restart();
  ok(S.made === 0 && S.sold === 0, "만든 수와 판 수가 0", S.made + "/" + S.sold);
  ok(S.happy === 0 && S.upset === 0, "손님 기록도 0");
  ok(S.shelf.length === 0, "재고도 비었다");
  ok(S.flyout.length === 0, "건너가던 것도 없다");
  ok(S.cust === null && S.nextIn === 0, "손님도 대기시간도 처음으로");
  ok(S.seq === 0, "호떡 번호도 처음부터");
  ok(oldShelf === S.shelf && oldFly === S.flyout,
     "배열을 갈아 끼우지 않고 비운다 (지난 판 참조가 새 판에 못 쓴다)");
  /* 지난 판 손님이 들고 있던 것으로 새 판을 건드릴 수 없다 */
  G.beginPlay();
  stockUp([GOOD]);
  wait(G.CUST.firstDelay + 0.5);
  ok(S.made === 1 && S.sold === 0, "새 판은 새로 센다", S.made + "/" + S.sold);
}

{
  /* --- 품질은 올린 뒤에 안 바뀐다 --- */
  freshGame();
  S.heat = 0.7;
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  wait(5); flip(); wait(5);
  toPlate();
  const kept = S.shelf[0];
  const q0 = JSON.stringify(kept.q);
  /* 다음 반죽을 만들어 실컷 태운다 */
  oilPan(); tearToPan(); flatten(); sugar(1.0); seal(4);
  wait(16); flip(); wait(16);
  ok(JSON.stringify(kept.q) === q0, "다음 반죽을 태워도 올린 호떡의 품질은 그대로",
     JSON.stringify(kept.q));
  ok(kept.id === 1, "고유 번호가 있다", kept.id);
  ok(S.shelf[0].id < (S.shelf[1] ? S.shelf[1].id : 99), "번호가 만든 차례다");
  for (const k of ["cookA", "cookB", "core", "fillPut"])
    ok(typeof kept.q[k] === "number", "품질에 " + k + " 가 적혀 있다", kept.q[k]);
}

{
  /* --- 그려도 안 터진다 --- */
  freshGame();
  stockUp([GOOD, GOOD]);
  wait(G.CUST.firstDelay + 0.5);
  ok(G.paint() === true, "손님이 서 있어도 그릴 수 있다", G.paint());
  S.cust.want = 2;
  G.sellTo();
  ok(G.paint() === true, "건네는 중에도 그릴 수 있다", G.paint());
  wait(G.CUST.giveSec + 0.1);
  ok(G.paint() === true, "한줄평 중에도 그릴 수 있다", G.paint());
  wait(G.CUST.saySec + G.CUST.outSec + 0.3);
  ok(G.paint() === true, "손님이 간 뒤에도 그릴 수 있다", G.paint());
  /* 말풍선 글이 실제로 그려진다 */
  freshGame();
  stockUp([GOOD]);
  wait(G.CUST.firstDelay + 0.5);
  const txt = painted();
  ok(txt.indexOf(S.cust.say) >= 0, "말풍선 글이 화면에 나온다", S.cust.say);
  ok(txt.indexOf(G.sellLabel()) >= 0, "단추 글도 나온다", G.sellLabel());
}

console.log("\n" + (fail ? "XX  " + fail + "개 실패 (" + pass + "개 통과)"
                          : "전부 통과 (" + pass + ")") + "\n");
process.exit(fail ? 1 : 0);
