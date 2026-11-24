/* ============================================================
   케이크 가게 — 검사
   ============================================================
   브라우저 없이 assets.js / game.js / app.js 를 돌려 본다.
     node tools/qa-cake.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const has = f => fs.existsSync(path.join(ROOT, f));

let pass = 0, fail = 0;
function ok(c, label, extra) {
  if (c) { pass++; console.log("  OK  " + label); }
  else { fail++; console.log("  XX  " + label + (extra === undefined ? "" : "   -> " + extra)); }
}

/* ---------- 최소 DOM ---------- */
function ctxStub() {
  return {
    fillStyle: "", imageSmoothingEnabled: true,
    setTransform() {}, clearRect() {}, fillRect() {}, save() {}, restore() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
    rect() {}, fill() {}, stroke() {}, clip() {}, fillText() {}, drawImage() {},
    measureText: () => ({ width: 10 }),
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
}
const els = {};
const created = [];
function el(tag) {
  const e = {
    tagName: String(tag).toUpperCase(), _h: {}, _kids: [], children: [],
    dataset: {}, style: {}, className: "", textContent: "", alt: "",
    width: 100, height: 100, hidden: false, src: null, type: "", disabled: false,
    classList: {
      _s: {},
      add() { for (const k of arguments) this._s[k] = 1; },
      remove() { for (const k of arguments) delete this._s[k]; },
      toggle(k, on) { if (on === undefined) on = !this._s[k]; on ? this._s[k] = 1 : delete this._s[k]; },
      contains(k) { return !!this._s[k]; },
    },
    getContext: () => { if (!e._ctx) e._ctx = ctxStub(); return e._ctx; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 90 }),
    addEventListener(k, fn) { (e._h[k] = e._h[k] || []).push(fn); },
    removeEventListener() {}, removeAttribute(k) { e[k] = null; },
    setAttribute() {},
    appendChild(c) { e._kids.push(c); e.children = e._kids; return c; },
    querySelector(sel) { return e._kids.find(k => ("." + k.className) === sel) || null; },
    remove() {},
    click() { if (!e.disabled) (e._h.click || []).forEach(f => f({ target: e })); },
    get offsetWidth() { return 100; },
  };
  Object.defineProperty(e, "innerHTML", {
    get() { return ""; },
    set(v) { if (v === "") { e._kids = []; e.children = e._kids; } },
  });
  let _id = "";
  Object.defineProperty(e, "id", {
    get() { return _id; },
    set(v) { _id = v; if (v) els[v] = e; },
  });
  created.push(e);
  return e;
}
/* index.html 의 id 를 그대로 읽어 와 만든다 — 빠진 id 가 있으면 바로 드러난다 */
const HTML = read("index.html");
const IDS = (HTML.match(/id="([A-Za-z0-9_]+)"/g) || []).map(s => s.slice(4, -1));
for (const id of IDS) { const e = el("div"); e.id = id; }
for (const m of HTML.match(/class="scr [^"]+" id="[A-Za-z0-9_]+"/g) || []) {
  els[m.match(/id="([^"]+)"/)[1]].className = m.match(/class="([^"]+)"/)[1];
}

function matches(e, sel) {
  const cls = sel.replace(".", "");
  return (" " + e.className + " ").indexOf(" " + cls + " ") >= 0;
}
const DOC = {
  getElementById: id => els[id] || null,
  createElement: tag => el(tag),
  querySelector: sel => created.find(e => matches(e, sel)) || null,
  querySelectorAll: sel => created.filter(e => matches(e, sel)),
  /* 문서에 걸린 손은 모아 둔다 — 창을 숨길 때 저장하는지 보려면 불러야 한다 */
  _h: {}, hidden: false,
  addEventListener(k, fn) { (DOC._h[k] = DOC._h[k] || []).push(fn); },
  body: { appendChild() {} },
};
function fire(target, name) { (target._h[name] || []).forEach(f => f()); }

/* localStorage 흉내 */
let STORE = {};
const LS = {
  getItem: k => (k in STORE ? STORE[k] : null),
  setItem: (k, v) => { STORE[k] = String(v); },
  removeItem: k => { delete STORE[k]; },
};
const WIN = {
  devicePixelRatio: 1, _h: {},
  addEventListener(k, fn) { (WIN._h[k] = WIN._h[k] || []).push(fn); },
  location: { href: "x", search: "" },
};
let rafQ = [], timers = [];
const RAF = fn => { rafQ.push(fn); return rafQ.length; };
const TO = (fn, ms) => { timers.push({ fn: fn, ms: ms || 0 }); return timers.length; };
const CLEAR_TO = id => { if (timers[id - 1]) timers[id - 1] = { fn() {}, ms: 0 }; };
function flushRaf(n, t) {
  for (let i = 0; i < (n || 3); i++) { const q = rafQ; rafQ = []; q.forEach(f => f(t === undefined ? 0 : t)); }
}
function flushTimers(n) {
  for (let i = 0; i < (n || 1); i++) { const q = timers; timers = []; q.forEach(x => x.fn()); }
}
function ImageStub() { this.onload = null; this.onerror = null; }
Object.defineProperty(ImageStub.prototype, "src", { set() {} });

let NOW = 1000;
const PERF = { now: () => NOW };
let CONFIRM = true;

function boot() {
  rafQ = []; timers = [];
  WIN._h = {}; DOC._h = {}; DOC.hidden = false;   /* 지난 판의 손은 지운다 */
  const G = {};
  new Function("window", "document", "navigator", "requestAnimationFrame", "cancelAnimationFrame",
               "location", "performance", "setTimeout", "clearTimeout", "Image", "localStorage", "confirm",
               read("assets.js") + "\n" + read("game.js") + "\n" + read("app.js"))
    (WIN, DOC, {}, RAF, () => {}, WIN.location, PERF, TO, CLEAR_TO, ImageStub, LS, () => CONFIRM);
  Object.assign(G, WIN.__cake);
  return G;
}
let G = boot();
if (!G.S) { console.log("XX  window.__cake 가 없다"); process.exit(1); }

/* 규칙만 따로 불러 쓰는 통로 */
function rules(names) {
  return new Function("localStorage",
    read("assets.js") + "\n" + read("game.js") + "; return { " + names + " };")(LS);
}

const RULES = rules("cakeNeeds");
/* 주문대로 똑같이 만들어 주는 손.
   기억 루프만 보려는 검사가 재고 때문에 막히지 않게 필요한 만큼 먼저 채워 둔다
   (재고가 실제로 막는지는 12번에서 따로 본다). */
function copyOrder(o) {
  if (G.S.save) {
    const need = RULES.cakeNeeds(o);
    for (const id in need) {
      G.S.save.inventory[id] = Math.max(G.S.save.inventory[id] || 0, need[id]);
    }
  }
  G.setTier(o.tiers);
  G.setSheet(o.bottomSheet);
  G.setCream(o.bottomCream);
  if (o.tiers === 2) { G.setSheet(o.topSheet); G.setCream(o.topCream); }
  for (const t of o.toppings) {
    for (let i = 0; i < t.count; i++) G.addTopping(t.type);
    if (t.position) { G.S.activeTop = t.type; G.setPos(t.position); }
  }
  if (o.decoration) G.setDeco(o.decoration);
}
/* 손님 등장 -> 주문 공개 -> 제작 까지 건너뛴다 */
function skipEnter() { G.showOrderPreview(); }
function skipPreview() {
  flushRaf(2, NOW);
  NOW += 10000;
  flushRaf(2, NOW);
}
function toBuild() { skipEnter(); skipPreview(); }
/* DAY INTRO -> 영업 준비 -> 영업 시작 (아무것도 안 사고 바로 연다) */
function openForBusiness() { els.btnPrep.click(); els.btnStartService.click(); }
function prepCardOf(label) {
  for (const c of els.prepCards.children) {
    const lab = c._kids.find(k => k.className === "pick-label");
    if (lab && lab.textContent === label) return c;
  }
  return null;
}
/* prep-card 안의 [-] n [+] */
function qtyOf(label) {
  const c = prepCardOf(label);
  if (!c) return null;
  const q = c._kids.find(k => k.className === "qty");
  return { minus: q._kids[0], num: q._kids[1], plus: q._kids[2],
           stock: c._kids.find(k => k.className === "prep-stock") };
}
/* "1,250원" -> 1250 */
const num = el => Number(String(el.textContent).replace(/[^0-9]/g, "")) || 0;
const cartTotal = () => num(els.prepTotal);
function payRowText() {
  return els.payRows.children.map(li => li._kids.map(k => k.textContent).join(" ")).join(" | ");
}

function cardBtn(label) {
  for (const b of els.pickCards.children) {
    const lab = b._kids.find(k => k.className === "pick-label");
    if (lab && lab.textContent === label) return b;
  }
  return null;
}
function buyRow(name) {
  for (const li of els.shopList.children) {
    const info = li._kids[1];
    if (info && info._kids[0] && info._kids[0].textContent === name) return li._kids[2]._kids[1];
  }
  return null;
}

/* ============================================================
   1. 구조
   ============================================================ */
console.log("\n--- 1. 구조 ---");
{
  const app = read("app.js"), html = read("index.html"), css = read("style.css"), gm = read("game.js");
  ok(html.indexOf("game.js") > 0, "game.js 를 읽는다");
  ok(app.indexOf("playSec") < 0 && app.indexOf("60초") < 0, "60초 한 판 구조가 없다");
  ok(app.indexOf("failOrder") < 0, "즉시 MISS 구조가 없다");
  for (const k of ["START", "DAY_INTRO", "PREP", "CUSTOMER_ENTER", "ORDER_PREVIEW", "BUILD",
                   "ORDER_RESULT", "DAY_RESULT", "SHOP", "LOTTERY"]) {
    ok(gm.indexOf(k + ":") > 0, "GAME_STATE." + k);
  }
  for (const id of ["scStart", "scDayIntro", "scPrep", "scCustomer", "scOrder", "scBuild",
                    "scOrderResult", "scDayResult", "scShop", "scLottery"]) {
    ok(html.indexOf(id) > 0, "화면 " + id);
  }
  /* 계산은 game.js 에만 있어야 한다 */
  for (const f of ["getIngredientCost", "purchaseIngredients", "emergencyPurchase",
                   "calculateCakeSalePrice", "calculateAccuracy", "calculatePatienceTime",
                   "calculateTip", "consumeIngredients", "calculateDayProfit",
                   "updateReputation"]) {
    ok(gm.indexOf("function " + f) > 0, "game.js 에 " + f + "()");
    ok(app.indexOf("function " + f) < 0, "app.js 가 " + f + " 를 다시 만들지 않는다");
  }
  for (const c of ["INGREDIENT_COSTS", "SALE_CONFIG", "PAY_TABLE", "TIP_CONFIG",
                   "PATIENCE_CONFIG", "REP_CONFIG", "EMERGENCY_MULT"]) {
    ok(gm.indexOf("const " + c) > 0, "config " + c);
  }
  ok(html.indexOf("prepCards") > 0 && html.indexOf("btnStartService") > 0, "영업 준비 화면");
  ok(html.indexOf("id=\"patience\"") > 0, "인내심 게이지");
  ok(html.indexOf("dProfit") > 0 && html.indexOf("dEmg") > 0, "하루 정산 칸");
  ok(html.indexOf("emgSheet") > 0, "긴급 구매 창");
  ok(html.indexOf("btnOpen") < 0, "재료 준비를 건너뛰는 버튼이 없다");
  ok(css.indexOf(".prep-card") > 0 && css.indexOf(".patience") > 0 &&
     css.indexOf(".ledger-card") > 0 && css.indexOf(".pay-rows") > 0, "새 화면 CSS");
  ok(css.indexOf(".prep-card") > 0 && css.slice(css.indexOf(".prep-card")).indexOf("table") < 0,
     "엑셀 표가 아니다");
  ok(css.indexOf("image-rendering: pixelated") > 0, "픽셀 유지");
  ok(!has("parts.js") && !has("cake.js"), "도형으로 그리던 파일이 없다");
  for (const c of ["top-bar", "customer-area", "cake-stage", "material-panel", "action-bar"]) {
    ok(html.indexOf(c) > 0, "영역 ." + c);
  }
  ok(css.indexOf("--pink:") > 0 && css.indexOf("--mint:") > 0 && css.indexOf("--butter:") > 0,
     "파스텔 색 토큰");
  ok(css.indexOf("flash-bg") < 0, "어두운 패널 색이 남아 있지 않다");

  /* 재료 목록은 진짜 가로 스크롤 상자여야 한다 */
  const ml = css.slice(css.indexOf(".material-list {"), css.indexOf(".material-list::"));
  ok(ml.indexOf("overflow-x: auto") > 0, "재료 목록 overflow-x: auto");
  ok(ml.indexOf("flex-wrap: nowrap") > 0, "재료 목록 flex-wrap: nowrap");
  ok(ml.indexOf("touch-action: pan-x") > 0, "재료 목록 touch-action: pan-x");
  ok(ml.indexOf("overscroll-behavior-x: contain") > 0, "재료 목록 overscroll-behavior-x");
  ok(ml.indexOf("grid-template-columns") < 0, "재료 목록에 grid 가 없다");
  const pc = css.slice(css.indexOf(".pick-card {"), css.indexOf(".pick-card:active"));
  ok(/flex: 0 0 \d+px/.test(pc) && pc.indexOf("%") < 0, "카드 폭이 % 가 아니라 고정값");
  ok(/padding: \d+px 1[2-6]px/.test(ml), "마지막 카드가 붙지 않게 오른쪽 여백 12~16px");
  ok(html.indexOf("step-hint") > 0 && html.indexOf("btnUndo") > 0, "단계 안내 + 되돌리기");
  ok(html.indexOf("flyMoney") > 0, "수익이 날아가는 자리");
}

/* ============================================================
   2. 손님과 Day 이벤트
   ============================================================ */
console.log("\n--- 2. 손님 / 이벤트 ---");
{
  const F = rules("CUSTOMER_TYPES, customerOf, generateCustomer, dayEvent, DAY_EVENTS,"
    + " previewSec, payBonuses, applyBonuses, reactionFor, generateOrder, calculateOrderPrice,"
    + " calculateCakeSalePrice, MIN_PREVIEW");

  ok(F.CUSTOMER_TYPES.length === 5, "손님 5종", F.CUSTOMER_TYPES.length);
  for (const k of ["normal", "rush", "vip", "picky", "easy"]) {
    ok(!!F.CUSTOMER_TYPES.find(c => c.key === k), "손님 " + k);
  }
  const d1 = [];
  for (let i = 0; i < 200; i++) d1.push(F.generateCustomer(1).key);
  ok(d1.every(k => k === "normal" || k === "easy"), "Day1 은 평범한 손님만");
  const d5 = {};
  for (let i = 0; i < 600; i++) d5[F.generateCustomer(5).key] = 1;
  ok(Object.keys(d5).length === 5, "Day5 는 다섯 타입이 다 나온다", Object.keys(d5).join(","));

  /* 노출 시간 */
  ok(F.previewSec(1, 0) === 3.5, "Day1 노출 3.5초", F.previewSec(1, 0));
  ok(F.previewSec(2, 0) === 3 && F.previewSec(3, 0) === 3, "Day2~3 은 3초");
  ok(F.previewSec(4, 0) === 2.5 && F.previewSec(6, 0) === 2.5, "Day4~6 은 2.5초");
  ok(F.previewSec(7, 0) === 2 && F.previewSec(12, 0) === 2, "Day7 부터 2초");
  ok(F.previewSec(1, 0, "rush") === 3, "급한 손님은 0.5초 짧다", F.previewSec(1, 0, "rush"));
  ok(F.previewSec(7, 0, "normal", "busy") === F.MIN_PREVIEW, "바쁜 금요일은 더 짧다",
     F.previewSec(7, 0, "normal", "busy"));
  ok(F.previewSec(12, -5) === F.MIN_PREVIEW, "1.5초 밑으로는 안 내려간다");
  ok(F.previewSec(7, 1) === 3, "두뇌 사탕이면 +1초");

  /* Day 이벤트는 같은 Day 면 늘 같다 */
  ok(F.dayEvent(1) === null, "Day1 은 이벤트 없음");
  let same = true;
  for (let d = 2; d <= 30; d++) {
    const a = F.dayEvent(d), b = F.dayEvent(d);
    if ((a && a.key) !== (b && b.key)) same = false;
  }
  ok(same, "같은 Day 면 같은 이벤트 (새로고침해도 안 바뀐다)");
  let evs = {}, none = 0;
  for (let d = 2; d <= 40; d++) { const e = F.dayEvent(d); if (e) evs[e.key] = 1; else none++; }
  ok(Object.keys(evs).length === F.DAY_EVENTS.length, "다섯 이벤트가 모두 돌아온다",
     Object.keys(evs).join(","));
  ok(none > 0, "이벤트 없는 날도 있다", none);

  /* 손님 타입이 가격과 지급에 반영된다 */
  const plain = { tiers: 1, bottomSheet: "vanilla", bottomCream: "white",
                  toppings: [{ type: "strawberry", count: 1 }], customerType: "normal" };
  const vip = Object.assign({}, plain, { customerType: "vip" });
  const easy = Object.assign({}, plain, { customerType: "easy" });
  ok(F.calculateOrderPrice(vip) > F.calculateOrderPrice(plain), "VIP 주문이 더 비싸다",
     F.calculateOrderPrice(vip));
  ok(F.calculateOrderPrice(easy) < F.calculateOrderPrice(plain), "느긋한 손님은 싸다",
     F.calculateOrderPrice(easy));

  const picky = Object.assign({}, plain, { customerType: "picky" });
  ok(F.applyBonuses(100, F.payBonuses(picky, 95)) === 150, "까다로운 손님 90% 이상이면 +50%",
     F.applyBonuses(100, F.payBonuses(picky, 95)));
  ok(F.applyBonuses(100, F.payBonuses(picky, 70)) === 70, "까다로운 손님 미달이면 깎인다",
     F.applyBonuses(100, F.payBonuses(picky, 70)));
  const rush = Object.assign({}, plain, { customerType: "rush" });
  ok(F.applyBonuses(100, F.payBonuses(rush, 80)) === 120, "급한 손님은 팁 +20%");
  ok(F.applyBonuses(100, F.payBonuses(plain, 80, { event: "premium" })) === 120,
     "프리미엄 데이 +20%");
  ok(F.applyBonuses(100, F.payBonuses(plain, 80, { tipItem: true })) === 120, "팁 보너스 +20%");

  /* 반응 */
  ok(F.reactionFor(100).indexOf("똑같") > 0, "100% 반응", F.reactionFor(100));
  ok(F.reactionFor(85) !== F.reactionFor(100), "80~94% 반응이 다르다");
  ok(F.reactionFor(70) !== F.reactionFor(85), "60~79% 반응이 다르다");
  ok(F.reactionFor(50) !== F.reactionFor(70), "40~59% 반응이 다르다");
  ok(F.reactionFor(10) !== F.reactionFor(50), "0~39% 반응이 다르다");

  /* 이벤트가 주문에 실제로 반영되는가 */
  let berry = 0;
  for (let i = 0; i < 200; i++) {
    const o = F.generateOrder(7, "normal", "strawberry");
    if (o.toppings.some(t => t.type === "strawberry")) berry++;
  }
  ok(berry === 200, "딸기 폭주 날에는 늘 딸기가 들어간다", berry);
  let twoPlain = 0, twoGroup = 0;
  for (let i = 0; i < 400; i++) {
    if (F.generateOrder(6, "normal", null).tiers === 2) twoPlain++;
    if (F.generateOrder(6, "normal", "group").tiers === 2) twoGroup++;
  }
  ok(twoGroup > twoPlain, "단체 예약 날에는 2단이 늘어난다", twoPlain + " -> " + twoGroup);
  let kinds = true;
  for (let i = 0; i < 200; i++) {
    if (F.generateOrder(7, "normal", "mania").toppings.length < 2) kinds = false;
  }
  ok(kinds, "디저트 마니아 날에는 토핑 두 종류 이상");
}

/* ============================================================
   3. 가격 / 정확도 / 수익
   ============================================================ */
console.log("\n--- 3. 계산 ---");
{
  const F = rules("calculateCakeSalePrice, calculateOrderPrice, calculateAccuracy, calculateEarnings,"
    + " accuracyDetail, payBand, autoFix, ITEMS, SALE_CONFIG, priceRange");

  const simple = { tiers: 1, bottomSheet: "vanilla", bottomCream: "white",
                   toppings: [{ type: "strawberry", count: 1 }] };
  ok(F.calculateCakeSalePrice(simple) === 260, "1단+크림+토핑1 = 260원",
     F.calculateCakeSalePrice(simple));

  const fancy = { tiers: 2, bottomSheet: "chocolate", topSheet: "vanilla",
                  bottomCream: "strawberry", topCream: "white",
                  toppings: [{ type: "strawberry", count: 2 }, { type: "blueberry", count: 2 },
                             { type: "cherry", count: 1 }] };
  const fp = F.calculateCakeSalePrice(fancy);
  ok(fp === 580, "2단+크림2+토핑3(2,2,1) = 580원", fp);
  ok(fp > F.calculateCakeSalePrice(simple) * 2, "복잡한 케이크가 훨씬 비싸다");

  const withDeco = { tiers: 1, bottomSheet: "vanilla", bottomCream: "white",
                     toppings: [], decoration: "macaron" };
  ok(F.calculateCakeSalePrice(withDeco) === 290, "스페셜 장식 +80원",
     F.calculateCakeSalePrice(withDeco));
  const withPlainDeco = { tiers: 1, bottomSheet: "vanilla", bottomCream: "white",
                          toppings: [], decoration: "sprinkles" };
  ok(F.calculateCakeSalePrice(withPlainDeco) === 260, "일반 장식 +50원",
     F.calculateCakeSalePrice(withPlainDeco));
  const special = { tiers: 1, bottomSheet: "vanilla", bottomCream: "white",
                    toppings: [{ type: "macaron", count: 1 }] };
  ok(F.calculateCakeSalePrice(special) === 290, "스페셜 토핑은 +80원",
     F.calculateCakeSalePrice(special));

  /* 주문을 볼 때는 범위만 */
  const rng = F.priceRange({ basePrice: 500 });
  ok(rng.lo < 500 && rng.hi > 500, "예상 판매가 범위", rng.lo + "~" + rng.hi);

  const same = JSON.parse(JSON.stringify(fancy));
  ok(F.calculateAccuracy(fancy, same) === 100, "똑같이 만들면 100%");
  const halfish = JSON.parse(JSON.stringify(fancy));
  halfish.topSheet = "strawberry"; halfish.toppings[0].count = 1;
  ok(F.calculateAccuracy(fancy, halfish) === 75, "8개 중 6개면 75%",
     F.calculateAccuracy(fancy, halfish));
  const wrong = { tiers: 1, bottomSheet: "strawberry", bottomCream: "chocolate", toppings: [] };
  ok(F.calculateAccuracy(fancy, wrong) === 0, "완전히 다르면 0%");
  const extra = JSON.parse(JSON.stringify(fancy));
  extra.toppings.push({ type: "kiwi", count: 1 });
  ok(F.calculateAccuracy(fancy, extra) < 100, "안 시킨 토핑을 올리면 깎인다");
  ok(F.accuracyDetail(fancy, halfish).length === 8, "8개 조건을 따로 본다");

  /* 자리와 장식도 조건이다 */
  const posOrder = { tiers: 1, bottomSheet: "vanilla", bottomCream: "white",
                     toppings: [{ type: "cherry", count: 2, position: "left" }] };
  const posWrong = { tiers: 1, bottomSheet: "vanilla", bottomCream: "white",
                     toppings: [{ type: "cherry", count: 2, position: "edge" }] };
  ok(F.accuracyDetail(posOrder, posWrong).length === 5, "위치가 조건 하나를 더한다",
     F.accuracyDetail(posOrder, posWrong).length);
  ok(F.calculateAccuracy(posOrder, posWrong) === 80, "위치가 틀리면 깎인다",
     F.calculateAccuracy(posOrder, posWrong));
  const decoWrong = { tiers: 1, bottomSheet: "vanilla", bottomCream: "white",
                      toppings: [], decoration: "wafer" };
  ok(F.calculateAccuracy(withDeco, decoWrong) < 100, "장식이 다르면 깎인다");

  /* 지급 구간 */
  ok(F.calculateEarnings(500, 100) === 500, "100% 면 정가");
  ok(F.calculateEarnings(500, 95) === 450, "90~99% 면 90%", F.calculateEarnings(500, 95));
  ok(F.calculateEarnings(500, 85) === 400, "80~89% 면 80%");
  ok(F.calculateEarnings(500, 70) === 300, "60~79% 면 60%", F.calculateEarnings(500, 70));
  ok(F.calculateEarnings(500, 45) === 150, "40~59% 면 30%", F.calculateEarnings(500, 45));
  ok(F.calculateEarnings(500, 30) === 50, "20~39% 면 10%", F.calculateEarnings(500, 30));
  ok(F.calculateEarnings(500, 10) === 25, "1~19% 면 5%", F.calculateEarnings(500, 10));
  ok(F.calculateEarnings(500, 0) === 0, "0% 면 0원");
  ok(F.payBand(100).tag === "PERFECT!" && F.payBand(95).tag === "GREAT!" &&
     F.payBand(85).tag === "GOOD" && F.payBand(70).tag === "SO-SO" &&
     F.payBand(20).tag === "MISS", "등급 이름");

  /* 실수 방지권 */
  const broken = JSON.parse(JSON.stringify(fancy));
  broken.topSheet = "strawberry";
  ok(F.autoFix(fancy, broken) === "위층 시트", "틀린 항목 하나를 고친다");
  ok(broken.topSheet === "vanilla", "실제로 고쳐졌다");
  ok(F.autoFix(fancy, JSON.parse(JSON.stringify(fancy))) === null, "고칠 게 없으면 안 쓴다");
  const pw = JSON.parse(JSON.stringify(posWrong));
  ok(String(F.autoFix(posOrder, pw)).indexOf("위치") > 0, "위치도 고쳐 준다");
  ok(pw.toppings[0].position === "left", "위치가 실제로 바뀌었다");

  ok(F.ITEMS.length === 8, "아이템 8종", F.ITEMS.length);
  for (const n of ["주문 연장권", "힌트 카드", "주문 다시보기", "기억 메모",
                   "실수 방지권", "팁 보너스", "두뇌 사탕", "셰프 노트"]) {
    ok(F.ITEMS.some(i => i.name === n), "아이템 " + n);
  }
}

/* ============================================================
   4. Day 난이도
   ============================================================ */
console.log("\n--- 4. Day 난이도 ---");
{
  const F = rules("generateOrder, customersOf, dayRules, orderLoad, newDecors, DECORS");

  ok(F.customersOf(1) === 5 && F.customersOf(2) === 6 && F.customersOf(3) === 6 &&
     F.customersOf(4) === 7, "손님 5/6/6/7");
  ok([5, 6, 7, 8, 9, 10].map(d => F.customersOf(d)).every(n => n === 7 || n === 8),
     "Day5 부터는 7~8명");

  const sample = (d, n) => {
    const r = { two: 0, kinds: 0, cnt: 0, pos: 0, deco: 0, diffSheet: 0, diffCream: 0 };
    for (let i = 0; i < n; i++) {
      const o = F.generateOrder(d, "normal", null);
      if (o.tiers === 2) {
        r.two++;
        if (o.topSheet !== o.bottomSheet) r.diffSheet++;
        if (o.topCream !== o.bottomCream) r.diffCream++;
      }
      r.kinds += o.toppings.length;
      r.cnt = Math.max(r.cnt, Math.max.apply(null, o.toppings.map(t => t.count)));
      if (o.toppings.some(t => t.position)) r.pos++;
      if (o.decoration) r.deco++;
    }
    return r;
  };
  const d1 = sample(1, 300);
  ok(d1.two === 0, "Day1 은 1단만");
  ok(d1.kinds === 300, "Day1 토핑 한 종류");
  ok(d1.cnt === 1, "Day1 토핑 한 개");
  ok(d1.pos === 0 && d1.deco === 0, "Day1 은 위치도 장식도 없다");
  ok(sample(2, 300).kinds / 300 > 1.2, "Day2 부터 토핑 두 종류");
  ok(sample(3, 300).cnt === 2, "Day3 부터 개수 2");
  ok(sample(3, 300).two === 0, "Day3 까지는 1단만");
  ok(sample(4, 300).two > 0, "Day4 에 2단 해금");
  ok(sample(4, 400).diffSheet === 0, "Day4 2단은 위아래 시트가 같다");
  const d5 = sample(5, 400);
  ok(d5.diffSheet === d5.two && d5.two > 0, "Day5 부터 위아래 시트가 다르다");
  ok(d5.diffCream === 0, "Day5 는 크림은 아직 같다");
  ok(sample(6, 400).diffCream === sample(6, 400).two || true, "Day6 부터 위아래 크림도 다르다");
  const d6 = sample(6, 400);
  ok(d6.diffCream === d6.two, "Day6 크림 확인");
  ok(sample(7, 400).cnt === 3, "Day7 부터 개수 3");
  ok(sample(7, 400).pos === 0, "Day7 까지는 위치가 없다");
  ok(sample(8, 300).pos === 300, "Day8 부터 토핑 위치가 붙는다", sample(8, 300).pos);
  ok(sample(8, 300).deco === 0, "Day8 까지는 장식이 없다");
  ok(sample(9, 400).deco > 0, "Day9 에 장식 해금");
  ok(sample(10, 600).deco > sample(9, 600).deco * 0.9, "Day10 에 장식이 더 자주");
  const t9 = sample(9, 600).two / 600, t10 = sample(10, 600).two / 600;
  ok(t10 > t9, "Day10 에 2단 비율이 더 높다");

  const load = d => {
    let t = 0;
    for (let i = 0; i < 400; i++) t += F.orderLoad(F.generateOrder(d, "normal", null));
    return t / 400;
  };
  ok(load(10) > load(1) + 2, "Day10 이 Day1 보다 기억할 게 많다",
     load(1).toFixed(1) + " -> " + load(10).toFixed(1));

  /* 가게 성장 — 해금 구조만 */
  ok(F.DECORS.length >= 5, "가게 장식 표");
  ok(F.newDecors(1, []).length === 1, "Day1 에 기본 작업대", F.newDecors(1, []).length);
  ok(F.newDecors(5, ["bench"]).length === 1, "Day5 에 리본 해금");
  ok(F.newDecors(5, ["bench", "ribbon"]).length === 0, "이미 가진 건 또 안 준다");
  ok(F.newDecors(20, []).length === 5, "Day20 까지 다섯 개");
}

/* ============================================================
   5. 한 판 전체
   ============================================================ */
console.log("\n--- 5. Day 1 완주 ---");
{
  STORE = {};
  G = boot();
  ok(G.S.state === "start", "시작 화면");
  ok(els.btnContinue.disabled === true, "저장이 없으면 이어하기가 꺼져 있다");

  els.btnNew.click();
  ok(G.S.state === "dayIntro", "새로 시작 -> DAY INTRO");
  ok(els.dayNum.textContent === "DAY 1", "DAY 1");
  ok(els.dayEvent.hidden === true, "Day1 은 이벤트 칸이 없다");

  ok(els.iGuests.textContent === "5명", "오늘 예상 손님", els.iGuests.textContent);
  ok(els.iRep.textContent === "★ 3.0", "가게 평판", els.iRep.textContent);
  ok(els.iMoney.textContent === "1,000원", "시작 보유금 1,000원", els.iMoney.textContent);
  ok(els.iStock.textContent === "18종", "기본 재료가 있다", els.iStock.textContent);

  els.btnPrep.click();
  ok(G.S.state === "prep", "재료 준비하기 -> PREP", G.S.state);
  ok(String(els.prepNote.textContent).indexOf("첫 영업") === 0, "Day1 안내",
     els.prepNote.textContent);
  els.btnStartService.click();
  ok(G.S.state === "customerEnter", "영업 시작 -> 손님 등장", G.S.state);
  ok(!!G.S.customer, "손님 타입이 정해졌다");
  ok(els.enterType.textContent.length > 0, "손님 타입 딱지", els.enterType.textContent);
  ok(els.enterLine.textContent.length > 0, "손님 대사", els.enterLine.textContent);
  ok(els.enterAva.className.indexOf("guest-ava") === 0, "아바타 클래스가 살아 있다",
     els.enterAva.className);
  ok(els.guestAva2.className.indexOf("guest-ava sm") === 0, "제작 화면 아바타 클래스",
     els.guestAva2.className);
  ok(els.cLeft.textContent === "5 / 5", "상단바 남은 주문", els.cLeft.textContent);

  els.scCustomer.click();
  ok(G.S.state === "orderPreview", "누르면 바로 주문 공개", G.S.state);
  ok(Number(els.ordCount.textContent) === 4, "Day1 카운트다운 3.5초 -> 4", els.ordCount.textContent);
  ok(els.orderNote.hidden === false, "Day1 은 보조 텍스트를 보여 준다");

  skipPreview();
  ok(G.S.state === "build", "노출이 끝나면 BUILD");
  ok(els.buildTabs.children.length === 5, "재료 탭 5개");
  ok(els.btnUndo.disabled === true, "아직 되돌릴 게 없다");

  const seg = HTML.slice(HTML.indexOf("scBuild"), HTML.indexOf("scOrderResult"));
  ok(seg.indexOf("orderSlot") < 0 && seg.indexOf("orderNote") < 0, "제작 화면에 주문서가 없다");

  /* 단계 안내 */
  G.setTier(1);
  ok(els.stepHint.textContent === "시트를 골라주세요", "시트 차례", els.stepHint.textContent);
  cardBtn("초코").click();
  ok(G.S.cake.bottomSheet === "chocolate", "카드를 누르면 반영된다");
  ok(els.stepHint.textContent === "크림을 골라주세요", "크림 차례");
  cardBtn("화이트").click();
  ok(els.stepHint.textContent === "토핑을 올려주세요", "토핑 차례");
  ok(G.S.tab === "fruit", "토핑 탭으로 넘어간다");
  ok(els.pickCards.children.length === 5, "토핑 탭에는 과일만", els.pickCards.children.length);
  cardBtn("체리").click();
  ok(G.S.cake.toppings.length === 1, "토핑이 올라갔다");

  /* 되돌리기 */
  ok(els.btnUndo.disabled === false, "되돌리기가 켜졌다");
  els.btnUndo.click();
  ok(G.S.cake.toppings.length === 0, "토핑이 취소됐다");
  els.btnUndo.click();
  ok(G.S.cake.bottomCream === null, "크림도 취소됐다");
  G.setCream("white"); G.addTopping("cherry");

  /* 장식 탭 */
  G.S.tab = "deco"; G.buildScreen();
  ok(els.pickCards.children.length === 7, "장식 탭에는 데코와 스페셜",
     els.pickCards.children.length);
  cardBtn("마카롱").click();
  ok(G.S.cake.decoration === "macaron", "장식이 하나 올라간다");
  cardBtn("마카롱").click();
  ok(G.S.cake.decoration === null, "다시 누르면 빠진다");

  /* 주문대로 만들어 제출 */
  const o1 = G.S.order;
  G.S.cake = { tiers: 1, bottomSheet: null, topSheet: null, bottomCream: null,
               topCream: null, toppings: [], decoration: null };
  G.S.tierDone = false;
  copyOrder(o1);
  const money0 = G.money();
  els.btnDone.click();
  ok(G.S.state === "orderResult", "완성하기 -> ORDER RESULT");
  ok(els.resAcc.textContent === "100%", "똑같이 만들면 100%", els.resAcc.textContent);
  ok(G.money() >= money0 + o1.basePrice, "정가 이상을 받는다",
     G.money() + " vs " + (money0 + o1.basePrice));
  ok(els.resTag.textContent === "PERFECT!", "PERFECT!");
  ok(els.reactLine.textContent.length > 0, "손님 반응", els.reactLine.textContent);
  ok(els.flyMoney.hidden === false, "수익이 날아간다", els.flyMoney.textContent);
  ok(els.resRows.children.length === 4, "조건별 판정 4줄", els.resRows.children.length);
  ok(els.resRows.children.every(li => li.className === "ok"), "전부 O");

  els.btnNextGuest.click();
  ok(G.S.state === "customerEnter" && G.S.guest === 2, "결과를 누르면 다음 손님",
     G.S.state + " / " + G.S.guest);

  /* 두 번째는 일부러 틀린다 */
  toBuild();
  G.setTier(1); G.setSheet("vanilla"); G.setCream("white");
  const before = G.money();
  els.btnDone.click();
  ok(G.money() >= before, "틀려도 돈이 줄지는 않는다");
  ok(els.resRows.children.some(li => li.className === "bad"), "틀린 조건이 표시된다");
  ok(G.S.stats.orders === 2, "두 번째 손님까지 기록됐다");

  flushTimers(1);
  ok(G.S.state === "orderResult" && G.S.guest === 2, "결과는 자동으로 사라지지 않는다");
  G.leaveResult();

  for (let i = 0; i < 3; i++) { toBuild(); copyOrder(G.S.order); els.btnDone.click(); G.leaveResult(); }
  ok(G.S.state === "dayResult", "5명을 처리하면 DAY RESULT", G.S.state);
  ok(els.dGuests.textContent === "5개", "처리 주문 5개", els.dGuests.textContent);
  ok(Number(els.dPerfect.textContent.replace("개", "")) >= 4, "완벽 주문 수");
  ok(/^\d+%$/.test(els.dAcc.textContent), "평균 일치율");
  ok(els.dBest.textContent.indexOf("원") > 0, "최고 판매가");
  ok(els.decorLine.hidden === false, "Day1 에 기본 작업대 해금", els.decorLine.textContent);
  ok(G.S.save.decor.indexOf("bench") >= 0, "해금이 저장된다");
  ok(els.btnNextDay.textContent === "DAY 2 장사하기", "다음 Day 버튼");
}

/* ============================================================
   6. 상점 / 아이템
   ============================================================ */
console.log("\n--- 6. 상점 ---");
{
  G.S.save.money = 6000;
  els.btnShop.click();
  ok(G.S.state === "shop", "상점으로");
  ok(els.shopList.children.length === 8, "아이템 8종", els.shopList.children.length);

  const before = G.money();
  buyRow("힌트 카드").click();
  ok(G.itemCount("hint") === 1, "힌트 카드를 샀다");
  ok(G.money() === before - 300, "값이 빠졌다");
  buyRow("주문 연장권").click();
  ok(G.itemCount("ext05") === 1, "연장권을 샀다");
  buyRow("실수 방지권").click();
  ok(G.itemCount("fix") === 1, "실수 방지권을 샀다");
  buyRow("두뇌 사탕").click();
  ok(G.S.save.candyLeft === 3, "두뇌 사탕은 세 주문짜리 효과", G.S.save.candyLeft);
  buyRow("셰프 노트").click();
  ok(G.itemCount("note") === 1, "셰프 노트를 샀다");

  G.S.save.money = 100;
  els.btnShop.click();
  ok(buyRow("주문 다시보기").disabled === true, "돈이 모자라면 못 산다");
  G.S.save.money = 6000;
  els.btnShop.click();
  buyRow("기억 메모").click();
  ok(G.itemCount("memo") === 1, "기억 메모를 샀다");
  ok(buyRow("기억 메모").disabled === true, "겹쳐 살 수 없는 아이템은 막힌다");

  els.btnShopBack.click();
  ok(G.S.state === "dayResult", "뒤로 -> DAY RESULT");
  els.btnShop.click();
  els.btnShopNext.click();
  ok(G.S.state === "dayIntro" && G.S.day === 2, "상점에서 바로 다음 Day");
}

/* ============================================================
   7. 복권
   ============================================================ */
console.log("\n--- 7. 복권 ---");
{
  G.endDay();
  G.S.save.money = 3000;
  G.S.save.lotteryDay = 0;
  els.btnLotto.click();
  ok(G.S.state === "lottery", "복권 화면");
  ok(els.btnScratch.disabled === false, "살 수 있다");
  ok(els.lottoLeft.textContent === "1회", "남은 횟수 1회");
  ok(els.lottoOdds.children.length === 6, "배당표 6줄");
  const before = G.money();
  els.btnScratch.click();
  ok(G.money() >= before - 500, "최소한 값만 빠진다");
  ok(els.btnScratch.disabled === true, "하루 한 번");
  ok(els.lottoLeft.textContent === "0회", "남은 횟수 0회");
  els.btnLotto.click();
  ok(els.btnScratch.disabled === true, "다시 들어와도 못 산다");
  G.S.save.money = 100;
  G.S.save.lotteryDay = 0;
  els.btnLotto.click();
  ok(els.btnScratch.disabled === true, "돈이 모자라면 못 산다");
  els.btnLottoBack.click();

  const F = rules("lotteryEV, LOTTERY_PRICE");
  ok(F.lotteryEV() < F.LOTTERY_PRICE, "기댓값이 값보다 낮다", Math.round(F.lotteryEV()));
}

/* ============================================================
   8. 아이템이 실제로 먹히는가
   ============================================================ */
console.log("\n--- 8. 아이템 적용 ---");
{
  const F = rules("previewSec, previewBonus");
  const sec = (items, candy, day) => F.previewSec(day, F.previewBonus(items, candy));
  ok(sec({ ext05: 1 }, 0, 1) === 4, "연장권 +0.5초", sec({ ext05: 1 }, 0, 1));
  ok(sec({ ext05: 2 }, 0, 1) === 4.5, "두 장이면 +1초");
  ok(sec({}, 3, 7) === 3, "두뇌 사탕이면 +1초", sec({}, 3, 7));
  ok(sec({}, 0, 7) === 2, "사탕이 떨어지면 원래대로");

  /* 기억 메모 */
  G.S.save.items = { memo: 1 };
  G.S.save.candyLeft = 0;
  els.btnNextDay.click();
  openForBusiness();
  toBuild();
  ok(els.memoChip.hidden === false, "메모가 남는다");
  ok(String(els.memoChip.textContent).indexOf("메모") === 0, "메모 표시");
  ok(G.itemCount("memo") === 0, "쓰면 사라진다");

  /* 셰프 노트 — 2단 주문에서만 */
  G.S.save.items = { note: 1 };
  G.S.order.tiers = 2; G.S.order.topSheet = "chocolate";
  G.S.memoLine = "";
  G.toBuild();
  ok(String(els.memoChip.textContent).indexOf("셰프 노트") === 0, "셰프 노트가 위층 시트를 알려 준다",
     els.memoChip.textContent);
  ok(G.itemCount("note") === 0, "2단에서 한 장 쓴다");

  /* 힌트 */
  G.S.save.items = { hint: 2 };
  G.buildScreen();
  ok(els.btnHint.disabled === false, "힌트 버튼이 켜진다");
  ok(els.hintN.textContent === "2", "보유 개수 표시");
  els.btnHint.click();
  ok(els.toast.hidden === false && String(els.toast.textContent).indexOf("힌트") === 0,
     "힌트가 토스트로 뜬다", els.toast.textContent);
  ok(G.itemCount("hint") === 1, "한 장 썼다");
  G.S.save.items = {};
  G.buildScreen();
  ok(els.btnHint.disabled === true, "힌트가 없으면 꺼진다");

  /* 아이템 시트 */
  G.S.save.items = { peek: 1 };
  G.buildScreen();
  els.btnItems.click();
  ok(els.itemSheet.hidden === false, "아이템 시트가 열린다");
  ok(els.holdList.children.length === 1, "보유 아이템만 보인다");
  els.btnItemClose.click();
  ok(els.itemSheet.hidden === true, "닫힌다");

  /* 다시보기 */
  const mine = G.S.cake;
  G.usePeek();
  ok(G.S.busy === true, "다시보기 중에는 입력이 잠긴다");
  ok(G.itemCount("peek") === 0, "한 장 썼다");
  flushTimers(1);
  ok(G.S.busy === false, "1초 뒤 풀린다");
  ok(G.S.cake === mine, "내 케이크가 그대로다");

  /* 실수 방지권 */
  const o = G.S.order;
  G.S.save.items = { fix: 1 };
  G.S.cake = JSON.parse(JSON.stringify({ tiers: o.tiers, bottomSheet: o.bottomSheet,
    topSheet: o.topSheet, bottomCream: o.bottomCream, topCream: o.topCream,
    toppings: o.toppings, decoration: o.decoration }));
  G.S.cake.bottomSheet = o.bottomSheet === "vanilla" ? "chocolate" : "vanilla";
  G.buildScreen();
  els.btnDone.click();
  ok(els.resAcc.textContent === "100%", "실수 방지권이 고쳐서 100%", els.resAcc.textContent);
  ok(G.itemCount("fix") === 0, "한 장 썼다");
  ok(els.payCap.textContent.indexOf("실수 방지권") > 0, "무엇이 적용됐는지 알려 준다");
  G.leaveResult();

  /* 팁 보너스 */
  G.S.save.items = {};
  G.S.tipOn = true;
  toBuild();
  copyOrder(G.S.order);
  els.btnDone.click();
  ok(payRowText().indexOf("팁 보너스") >= 0, "팁 보너스가 수익 내역에 뜬다", payRowText());
  ok(G.S.tipOn === false, "팁은 한 번만");
  G.leaveResult();
}

/* ============================================================
   9. 저장과 설정
   ============================================================ */
console.log("\n--- 9. 저장 ---");
{
  STORE = {};
  G = boot();
  els.btnNew.click();
  openForBusiness();
  toBuild();
  copyOrder(G.S.order);
  els.btnDone.click();
  G.leaveResult();
  G.S.save.money = 3000;
  G.openShop();
  buyRow("힌트 카드").click();
  buyRow("힌트 카드").click();
  G.S.save.totalSales = 1234;
  G.S.save.bestAvgAcc = 91;
  G.S.save.day = 3;
  G.S.save.bestDay = 3;
  G.S.save.decor = ["bench"];
  G.S.save.candyLeft = 2;
  G.save();
  const money = G.money();
  ok(!!STORE["ccojik.decoCake.v1"], "localStorage 에 쓴다");
  const raw = JSON.parse(STORE["ccojik.decoCake.v1"]);
  for (const k of ["day", "money", "items", "inventory", "shopReputation", "bestDay",
                   "totalSales", "bestAvgAcc", "lotteryDay", "candyLeft", "decor"]) {
    ok(raw[k] !== undefined, "저장 항목 " + k);
  }

  const G2 = boot();
  ok(G2.S.save !== null, "저장을 읽는다");
  ok(els.btnContinue.disabled === false, "이어하기가 켜진다");
  ok(G2.S.save.money === money, "보유금이 남는다");
  ok(G2.S.save.items.hint === 2, "아이템이 남는다");
  ok(G2.S.save.day === 3 && G2.S.save.bestDay === 3, "Day 가 남는다");
  ok(G2.S.save.totalSales === 1234, "누적 매출이 남는다");
  ok(G2.S.save.bestAvgAcc === 91, "최고 평균 정확도가 남는다");
  ok(G2.S.save.candyLeft === 2, "두뇌 사탕 남은 횟수가 남는다");
  ok(G2.S.save.decor[0] === "bench", "가게 해금이 남는다");

  els.btnContinue.click();
  ok(G2.S.state === "shop" && G2.S.day === raw.session.day, "이어하기는 저장된 상점으로");

  /* 옛 저장도 읽혀야 한다 (새 항목은 채워 넣는다) */
  STORE["ccojik.decoCake.v1"] = JSON.stringify({ day: 4, money: 500, items: { hint: 1 },
    bestDay: 4, totalSales: 10, bestAvgAcc: 50, lotteryDay: 0 });
  const G3 = boot();
  ok(G3.S.save.candyLeft === 0 && Array.isArray(G3.S.save.decor),
     "예전 저장에 새 항목이 채워진다");
  ok(G3.S.save.shopReputation === 3, "평판이 없던 저장은 3.0 으로", G3.S.save.shopReputation);
  ok(G3.S.save.inventory && G3.S.save.inventory.sheetVanilla > 0,
     "재고가 없던 저장은 기본 재료를 받는다");

  /* 설정 */
  G3.showStart();
  els.btnSet.click();
  ok(els.setSheet.hidden === false, "설정 시트가 열린다");
  ok(els.setNote.textContent.indexOf("DAY") > 0, "저장 요약을 보여 준다");
  els.btnSetClose.click();
  ok(els.setSheet.hidden === true, "설정이 닫힌다");

  CONFIRM = false;
  els.btnSet.click();
  els.btnWipe.click();
  ok(STORE["ccojik.decoCake.v1"] !== undefined, "아니오를 누르면 안 지운다");
  CONFIRM = true;
  els.btnWipe.click();
  ok(STORE["ccojik.decoCake.v1"] === undefined, "기록 지우기");
  ok(els.btnContinue.disabled === true, "지우면 이어하기가 꺼진다");
}

/* ============================================================
   10. 재료 · 재고 · 매입
   ============================================================ */
console.log("\n--- 10. 재료와 매입 ---");
{
  const F = rules("INGREDIENTS, INGREDIENT_COSTS, getIngredientCost, emergencyCost, EMERGENCY_MULT,"
    + " startInventory, stockKinds, cakeNeeds, shortOf, consumeIngredients, cartCost,"
    + " purchaseIngredients, emergencyPurchase, recommendCart, trimCart, ingId, ingredientOf,"
    + " SHEETS, CREAMS, TOPPINGS, blankDayStats, START_MONEY");

  ok(F.INGREDIENTS.length === 18, "재료 18종 (시트3 크림3 토핑12)", F.INGREDIENTS.length);
  /* 없는 재료를 만들어 내지 않았는지 — 전부 assets.js 목록에서 나왔다 */
  let fromAssets = true;
  for (const i of F.INGREDIENTS) {
    const src = i.kind === "sheet" ? F.SHEETS : i.kind === "cream" ? F.CREAMS : F.TOPPINGS;
    if (!src.some(s => s.key === i.key)) fromAssets = false;
  }
  ok(fromAssets, "재료 id 가 모두 실제 에셋 키에서 나왔다");
  let priced = true;
  for (const i of F.INGREDIENTS) if (!F.getIngredientCost(i.id)) priced = false;
  ok(priced, "18종 모두 매입가가 있다");
  ok(Object.keys(F.INGREDIENT_COSTS).length === 18, "원가표에 군더더기가 없다",
     Object.keys(F.INGREDIENT_COSTS).length);

  ok(F.ingId("sheet", "vanilla") === "sheetVanilla", "시트 id", F.ingId("sheet", "vanilla"));
  ok(F.ingId("cream", "white") === "creamWhite", "크림 id");
  ok(F.ingId("topping", "strawberry") === "strawberry", "토핑 id 는 키 그대로");
  ok(F.getIngredientCost("sheetVanilla") === 40 && F.getIngredientCost("sheetStrawberry") === 55,
     "시트 매입가 40/55");
  ok(F.getIngredientCost("creamWhite") === 30, "생크림 30원");
  ok(F.getIngredientCost("strawberry") === 25 && F.getIngredientCost("sprinkles") === 15,
     "토핑 매입가 25/15");
  ok(F.emergencyCost("strawberry") === 50 && F.EMERGENCY_MULT === 2, "긴급 구매는 두 배");

  const inv0 = F.startInventory();
  ok(F.stockKinds(inv0) === 18, "새 게임은 18종을 들고 시작한다", F.stockKinds(inv0));
  ok(inv0.sheetVanilla === 3 && inv0.creamWhite === 3 && inv0.strawberry === 4,
     "기본 재료 시트3 크림3 토핑4");
  ok(F.START_MONEY === 1000, "시작 보유금 1,000원");

  /* 케이크에 실제로 들어가는 양 */
  const two = { tiers: 2, bottomSheet: "vanilla", topSheet: "vanilla",
                bottomCream: "white", topCream: "chocolate",
                toppings: [{ type: "cherry", count: 3 }], decoration: "macaron" };
  const need = F.cakeNeeds(two);
  ok(need.sheetVanilla === 2, "같은 시트를 두 층 쓰면 2개", need.sheetVanilla);
  ok(need.creamWhite === 1 && need.creamChocolate === 1, "크림은 층마다 하나");
  ok(need.cherry === 3, "토핑은 개수만큼");
  ok(need.macaron === 1, "장식도 한 개 쓴다");
  const one = { tiers: 1, bottomSheet: "vanilla", topSheet: "chocolate",
                bottomCream: "white", topCream: "white", toppings: [] };
  ok(F.cakeNeeds(one).sheetChocolate === undefined, "1단이면 위층 재료는 안 쓴다");

  ok(F.shortOf({ sheetVanilla: 1, creamWhite: 1 }, one) === null, "재고가 있으면 만들 수 있다");
  ok(F.shortOf({ sheetVanilla: 0, creamWhite: 1 }, one) === "sheetVanilla", "모자란 재료를 집어낸다");

  const inv = { sheetVanilla: 2, creamWhite: 1, cherry: 1 };
  F.consumeIngredients(inv, two);
  ok(inv.sheetVanilla === 0, "제출하면 실제로 빠진다", inv.sheetVanilla);
  ok(inv.cherry === 0, "재고보다 많이 써도 음수가 되지 않는다", inv.cherry);

  /* 매입 */
  const st = F.blankDayStats();
  const sv = { money: 1000, inventory: F.startInventory() };
  const cart = { strawberry: 3, sheetVanilla: 2 };
  ok(F.cartCost(cart) === 155, "3×25 + 2×40 = 155원", F.cartCost(cart));
  ok(F.purchaseIngredients(sv, cart, st) === 155, "구매 성공");
  ok(sv.money === 845, "보유금에서 빠진다", sv.money);
  ok(sv.inventory.strawberry === 7 && sv.inventory.sheetVanilla === 5, "재고가 늘어난다");
  ok(st.ingredientCost === 155, "오늘 재료비에 적힌다", st.ingredientCost);

  const poor = { money: 10, inventory: {} };
  ok(F.purchaseIngredients(poor, cart, st) === 0 && poor.money === 10,
     "돈이 모자라면 아무 일도 없다");

  const emgSave = { money: 100, inventory: { cherry: 0 } };
  const emgSt = F.blankDayStats();
  ok(F.emergencyPurchase(emgSave, "cherry", emgSt) === 40, "긴급 구매 40원", 20 * 2);
  ok(emgSave.money === 60 && emgSave.inventory.cherry === 1, "즉시 돈이 빠지고 재고가 는다");
  ok(emgSt.emergencyPurchaseCost === 40 && emgSt.ingredientCost === 0,
     "긴급 구매비는 재료비와 따로 적힌다");
  ok(F.emergencyPurchase({ money: 10, inventory: {} }, "macaron", emgSt) === 0,
     "돈이 모자라면 긴급 구매도 안 된다");

  /* 추천 수량 */
  const rec = F.recommendCart({}, 6, 3);
  const sum = keys => keys.reduce((a, k) => a + (rec[k] || 0), 0);
  ok(sum(F.SHEETS.map(s => F.ingId("sheet", s.key))) === 8, "6명이면 시트 8개",
     sum(F.SHEETS.map(s => F.ingId("sheet", s.key))));
  ok(sum(F.CREAMS.map(c => F.ingId("cream", c.key))) === 8, "크림 8개");
  const fruitKeys = F.TOPPINGS.filter(t => t.cat === "fruit").map(t => t.key);
  ok(sum(fruitKeys) === 12, "기본 토핑 12개", sum(fruitKeys));
  ok(!rec.macaron, "Day3 에는 스페셜을 권하지 않는다");
  ok(!!F.recommendCart({}, 6, 9).macaron, "Day9 부터는 장식도 권한다");
  ok(!F.recommendCart(F.startInventory(), 1, 1).sheetVanilla,
     "이미 넉넉하면 추천하지 않는다");
  const tight = F.trimCart(rec, 200);
  ok(F.cartCost(tight) <= 200, "보유금에 맞게 줄인다", F.cartCost(tight));
  ok(F.cartCost(tight) > 0, "다 비우지는 않는다");
}

/* ============================================================
   11. 인내심 · 팁 · 정산 · 평판
   ============================================================ */
console.log("\n--- 11. 인내심 / 팁 / 평판 ---");
{
  const F = rules("calculatePatienceTime, calculateTip, patienceLeft, PATIENCE_CONFIG,"
    + " TIP_CONFIG, calculateDayProfit, dayAvgAccuracy, blankDayStats,"
    + " updateReputation, repDelta, repGuestAdj, customersOf, REP_CONFIG, repStars");

  const simple = { tiers: 1, toppings: [{ type: "cherry", count: 1 }] };
  ok(F.calculatePatienceTime(simple) === 8, "1단 단순 주문 8초", F.calculatePatienceTime(simple));
  ok(F.calculatePatienceTime({ tiers: 2, toppings: [{ type: "cherry", count: 1 }] }) === 12,
     "2단이면 +4초");
  ok(F.calculatePatienceTime({ tiers: 1, toppings: [{ type: "cherry", count: 1 },
     { type: "kiwi", count: 1 }] }) === 10, "토핑 한 종류 늘면 +2초");
  ok(F.calculatePatienceTime({ tiers: 1, toppings: [{ type: "cherry", count: 1,
     position: "left" }] }) === 10, "자리 조건이면 +2초");
  ok(F.calculatePatienceTime({ tiers: 1, toppings: [{ type: "cherry", count: 1 }],
     decoration: "macaron" }) === 9, "장식이면 +1초");
  const hard = { tiers: 2, toppings: [{ type: "cherry", count: 2, position: "left" },
     { type: "kiwi", count: 1 }], decoration: "wafer" };
  ok(F.calculatePatienceTime(hard) === 17, "복잡한 주문은 더 기다려 준다",
     F.calculatePatienceTime(hard));

  ok(F.patienceLeft(simple, 0) === 1, "처음에는 꽉 차 있다");
  ok(F.patienceLeft(simple, 4) === 0.5, "절반");
  ok(F.patienceLeft(simple, 99) === 0, "0 밑으로는 안 내려간다");

  /* 팁 — 속도와 정확도를 같이 본다 */
  ok(F.calculateTip(simple, 95, 3).rate === 0.2, "허용시간 절반 안이면 +20%",
     F.calculateTip(simple, 95, 3).rate);
  ok(F.calculateTip(simple, 95, 6).rate === 0.1, "50~80% 면 +10%");
  ok(F.calculateTip(simple, 95, 7.8).rate === 0.05, "80~100% 면 +5%");
  ok(F.calculateTip(simple, 95, 9).rate === 0, "시간을 넘기면 팁이 없다");
  ok(F.calculateTip(simple, 79, 1).rate === 0, "정확도 80% 미만이면 팁이 없다");
  ok(F.calculateTip(simple, 80, 1).rate === 0.2, "정확도 80% 면 받는다");
  ok(F.TIP_CONFIG.minAccuracy === 80, "팁 기준선은 config 에");
  /* §28 예시 — 정가 500 / 95% / 빠른 제작 */
  const eg = Math.round(450 * F.calculateTip(simple, 95, 3).rate);
  ok(eg === 90, "정가 500 · 95% · 빠름 -> 팁 90원", eg);

  /* 하루 정산 */
  const st = F.blankDayStats();
  st.revenue = 3280; st.tips = 320; st.ingredientCost = 780; st.emergencyPurchaseCost = 120;
  st.orders = 6; st.accuracyTotal = 504;
  ok(F.calculateDayProfit(st) === 2700, "순이익 = 매출+팁-재료비-긴급구매",
     F.calculateDayProfit(st));
  ok(F.dayAvgAccuracy(st) === 84, "평균 일치율 84%", F.dayAvgAccuracy(st));
  ok(F.dayAvgAccuracy(F.blankDayStats()) === 0, "주문이 없으면 0%");
  const loss = F.blankDayStats();
  loss.revenue = 200; loss.ingredientCost = 900;
  ok(F.calculateDayProfit(loss) === -700, "적자도 나온다", F.calculateDayProfit(loss));

  /* 평판 */
  ok(F.REP_CONFIG.start === 3, "평판은 3.0 에서 시작");
  ok(F.updateReputation(3, 96) === 3.2, "95% 이상 +0.2", F.updateReputation(3, 96));
  ok(F.updateReputation(3, 90) === 3.1, "85~94% +0.1");
  ok(F.updateReputation(3, 75) === 3, "70~84% 그대로");
  ok(F.updateReputation(3, 60) === 2.9, "50~69% -0.1");
  ok(F.updateReputation(3, 40) === 2.8, "50% 미만 -0.2");
  ok(F.updateReputation(5, 100) === 5, "5.0 을 넘지 않는다");
  ok(F.updateReputation(1, 0) === 1, "1.0 밑으로 안 내려간다");
  ok(F.repStars(3.8) === "★ 3.8", "별 표시", F.repStars(3.8));

  ok(F.customersOf(5, 3.0) === F.customersOf(5), "평판 보통이면 기본 손님 수");
  ok(F.customersOf(5, 2.0) === F.customersOf(5) - 1, "평판이 낮으면 한 명 줄고");
  ok(F.customersOf(2, 4.2) === 7, "4.0 이상이면 한 명 늘고", F.customersOf(2, 4.2));
  ok(F.customersOf(2, 4.8) === 8, "4.7 이상이면 두 명 는다", F.customersOf(2, 4.8));
  ok(F.customersOf(10, 5.0) === 8, "최대 8명까지", F.customersOf(10, 5.0));
  ok(F.customersOf(1, 1.0) === 4, "최소 4명은 온다", F.customersOf(1, 1.0));
}

/* ============================================================
   12. 운영 루프 한 바퀴
   ============================================================
   §59 의 시나리오를 그대로 따라간다.
   ============================================================ */
console.log("\n--- 12. 운영 루프 ---");
{
  STORE = {};
  G = boot();
  els.btnNew.click();
  const m0 = G.money();
  ok(m0 === 1000, "새 게임 보유금 1,000원", m0);

  /* --- PREP --- */
  els.btnPrep.click();
  ok(G.S.state === "prep", "DAY INTRO -> PREP");
  ok(els.prepCards.children.length === 3, "시트 탭에 3장", els.prepCards.children.length);
  ok(!!qtyOf("바닐라 시트"), "시트 카드 이름", els.prepCards.children.length);
  ok(String(qtyOf("바닐라 시트").stock.textContent).indexOf("재고 3") === 0, "현재 재고 표시",
     qtyOf("바닐라 시트").stock.textContent);

  G.S.prepTab = "fruit"; G.openPrep();
  ok(els.prepCards.children.length === 5, "토핑 탭에 과일 5장", els.prepCards.children.length);
  const berry = qtyOf("딸기");
  berry.plus.click(); berry.plus.click(); berry.plus.click();
  ok(berry.num.textContent === "3", "딸기 3개 담았다", berry.num.textContent);
  ok(String(berry.stock.textContent).indexOf("4 → 7") > 0, "예상 재고를 보여 준다",
     berry.stock.textContent);
  ok(els.prepTotal.textContent === "75원", "총 구매비 75원", els.prepTotal.textContent);
  ok(els.prepAfter.textContent === "925원", "구매 후 보유금", els.prepAfter.textContent);
  ok(String(els.btnStartService.textContent).indexOf("구매하고") === 0, "버튼 문구가 바뀐다",
     els.btnStartService.textContent);
  berry.minus.click();
  ok(berry.num.textContent === "2" && els.prepTotal.textContent === "50원", "빼기도 된다");
  berry.plus.click();

  /* 기본 재료만으로도 Day1 은 넉넉하다 — 모자란 상태를 만들고 추천을 받는다 */
  els.btnRecommend.click();
  ok(cartTotal() === 0, "이미 넉넉하면 추천이 비어 있다", els.prepTotal.textContent);
  G.S.save.inventory.sheetVanilla = 0;
  G.S.save.inventory.strawberry = 1;
  G.openPrep();
  els.btnRecommend.click();
  ok(cartTotal() > 0, "모자라면 추천 수량이 담긴다", els.prepTotal.textContent);
  ok(cartTotal() <= G.money(), "보유금을 넘지 않는다");
  const cost = cartTotal();

  /* --- 구매하고 영업 시작 --- */
  const stockWas = G.S.save.inventory.sheetVanilla;
  els.btnStartService.click();
  ok(G.S.state === "customerEnter", "영업 시작");
  ok(G.money() === m0 - cost, "재료비가 보유금에서 빠졌다", G.money() + " vs " + (m0 - cost));
  ok(G.S.stats.ingredientCost === cost, "오늘 재료비에 적혔다", G.S.stats.ingredientCost);
  ok(G.S.save.inventory.sheetVanilla >= stockWas, "재고가 늘었다");
  const afterBuy = G.money();

  /* --- 제작 중에는 재고가 안 빠진다 --- */
  for (const id in G.S.save.inventory) G.S.save.inventory[id] = 9;
  toBuild();
  ok(els.patience.children.length === 5, "인내심 하트 5개", els.patience.children.length);
  ok(els.patience.children.every(h => h.className === "pat-on"), "처음엔 다 차 있다");

  G.setTier(1); G.setSheet("vanilla"); G.setCream("white");
  ok(G.S.save.inventory.sheetVanilla === 9, "고르기만 해서는 재고가 안 빠진다",
     G.S.save.inventory.sheetVanilla);
  ok(G.leftOf("sheetVanilla") === 8, "카드에는 쓸 양을 뺀 수가 보인다", G.leftOf("sheetVanilla"));
  els.btnUndo.click();
  ok(G.leftOf("creamWhite") === 9, "되돌리면 쓸 양도 돌아온다", G.leftOf("creamWhite"));
  G.setCream("white");
  G.addTopping("cherry"); G.addTopping("cherry");
  ok(G.leftOf("cherry") === 7, "토핑은 개수만큼 센다", G.leftOf("cherry"));

  /* --- 품절과 긴급 구매 --- */
  G.S.save.inventory.kiwi = 0;
  G.buildScreen();
  G.S.tab = "fruit"; G.buildScreen();
  const kiwi = cardBtn("키위");
  ok(String(kiwi.className).indexOf("out") > 0, "품절 카드는 흐려진다", kiwi.className);
  ok(kiwi._kids.some(k => k.textContent === "품절"), "품절 글자");
  kiwi.click();
  ok(els.emgSheet.hidden === false, "누르면 긴급 구매 창이 뜬다");
  ok(String(els.emgName.textContent).indexOf("키위 재고가 없어요") === 0, "무엇이 없는지 알려 준다",
     els.emgName.textContent);
  ok(els.emgNormal.textContent === "25원" && els.emgPrice.textContent === "50원",
     "일반가와 두 배 값을 같이 보여 준다");
  ok(G.S.cake.toppings.every(t => t.type !== "kiwi"), "품절이면 올라가지 않는다");
  els.btnEmgClose.click();
  ok(els.emgSheet.hidden === true, "다른 재료를 써도 된다");

  const beforeEmg = G.money();
  kiwi.click();
  els.btnEmgBuy.click();
  ok(G.money() === beforeEmg - 50, "긴급 구매는 두 배 값", G.money());
  ok(G.S.save.inventory.kiwi === 1, "재고가 하나 늘었다");
  ok(G.S.stats.emergencyPurchaseCost === 50, "긴급 구매비가 따로 적힌다",
     G.S.stats.emergencyPurchaseCost);
  ok(els.emgSheet.hidden === true, "사면 창이 닫힌다");

  /* --- 제출하면 그때 빠진다 --- */
  const o = G.S.order;
  G.S.cake = { tiers: 1, bottomSheet: null, topSheet: null, bottomCream: null,
               topCream: null, toppings: [], decoration: null };
  G.S.tierDone = false;
  copyOrder(o);
  const needed = Object.assign({}, G.S.save.inventory);
  els.btnDone.click();
  ok(G.S.state === "orderResult", "완성");
  const usedSheet = "sheet" + o.bottomSheet.charAt(0).toUpperCase() + o.bottomSheet.slice(1);
  ok(G.S.save.inventory[usedSheet] === needed[usedSheet] - 1, "제출할 때 시트가 빠진다",
     G.S.save.inventory[usedSheet] + " / " + needed[usedSheet]);
  ok(els.payRows.children.length >= 2, "정가와 정확도 반영을 보여 준다",
     els.payRows.children.length);
  ok(payRowText().indexOf("케이크 정가") >= 0, "케이크 정가 줄", payRowText());
  ok(payRowText().indexOf("정확도 반영") >= 0, "정확도 반영 줄");
  ok(payRowText().indexOf("팁") >= 0, "팁 줄", payRowText());
  ok(G.S.stats.tips > 0, "빠르게 만들면 팁이 붙는다", G.S.stats.tips);
  ok(G.money() === afterBuy - 50 + G.S.stats.revenue + G.S.stats.tips,
     "판매금과 팁이 그대로 들어온다");
  ok(String(els.reactLine.textContent).indexOf("빨라요") > 0, "빠르면 속도를 먼저 말한다",
     els.reactLine.textContent);
  G.leaveResult();

  /* --- 느리게 만들면 팁이 없다 --- */
  toBuild();
  copyOrder(G.S.order);
  NOW += 60000;                      /* 1분을 끌었다 */
  const tipWas = G.S.stats.tips;
  els.btnDone.click();
  ok(G.S.stats.tips === tipWas, "시간을 넘기면 팁이 없다");
  ok(payRowText().indexOf("팁 없음") > 0, "왜 없는지 알려 준다", payRowText());
  G.leaveResult();

  /* --- 하루 마감 --- */
  while (G.S.state !== "dayResult") {
    toBuild(); copyOrder(G.S.order); els.btnDone.click(); G.leaveResult();
  }
  const st = G.S.stats;
  const profit = st.revenue + st.tips - st.ingredientCost - st.emergencyPurchaseCost;
  ok(num(els.dSales) === st.revenue, "오늘 매출", els.dSales.textContent);
  ok(num(els.dTips) === st.tips, "팁", els.dTips.textContent);
  ok(num(els.dCost) === st.ingredientCost, "재료 매입", els.dCost.textContent);
  ok(num(els.dEmg) === 50, "긴급 구매", els.dEmg.textContent);
  ok(num(els.dProfit) === Math.abs(profit), "오늘 순이익", els.dProfit.textContent);
  ok(String(els.dCost.textContent).indexOf("-") === 0, "나간 돈은 - 로");
  /* 중복 차감 검사 — 마감 화면은 보여 주기만 한다 */
  ok(G.money() === m0 - cost - 50 + st.revenue + st.tips,
     "재료비를 두 번 깎지 않는다", G.money() + " vs " + (m0 - cost - 50 + st.revenue + st.tips));
  ok(num(els.dMoney) === G.money(), "현재 보유금", els.dMoney.textContent);
  ok(String(els.dRep.textContent).indexOf("★") === 0, "가게 평판", els.dRep.textContent);
  ok(G.S.save.shopReputation > 3, "잘 만들었으면 평판이 오른다", G.S.save.shopReputation);

  /* --- 다음 Day 로 넘어가도 남는다 --- */
  const invWas = G.S.save.inventory.sheetVanilla;
  const repWas = G.S.save.shopReputation;
  const moneyWas = G.money();
  els.btnNextDay.click();
  ok(G.S.day === 2 && G.S.state === "dayIntro", "DAY 2");
  ok(G.S.save.inventory.sheetVanilla === invWas, "재고가 남는다");
  ok(G.S.save.shopReputation === repWas, "평판이 남는다");
  ok(G.money() === moneyWas, "보유금이 남는다");
  ok(G.S.stats.ingredientCost === 0, "장부는 하루마다 새로 쓴다");
  ok(els.iStock.textContent.indexOf("종") > 0, "준비된 재료 종수", els.iStock.textContent);

  /* --- 새로고침 --- */
  const G2 = boot();
  ok(G2.S.save.inventory.sheetVanilla === invWas, "새로고침해도 재고가 그대로",
     G2.S.save.inventory.sheetVanilla);
  ok(G2.S.save.shopReputation === repWas, "평판도 그대로");
  ok(G2.S.save.money === moneyWas, "보유금도 그대로");
}

/* ============================================================
   13. 막히지 않는가 — 재료도 돈도 없을 때
   ============================================================ */
console.log("\n--- 13. 막힘 방지 ---");
{
  STORE = {};
  G = boot();
  els.btnNew.click();
  openForBusiness();
  toBuild();

  /* 재료가 남아 있으면 빈 케이크는 못 낸다 */
  els.btnDone.click();
  ok(G.S.state === "build", "고를 재료가 있으면 빈 케이크는 막는다", G.S.state);

  /* 전부 품절 + 돈도 없음 — 그래도 주문은 끝나야 한다 */
  for (const id in G.S.save.inventory) G.S.save.inventory[id] = 0;
  G.S.save.money = 0;
  G.buildScreen();
  const sheetCard = (G.S.tab = "sheet", G.buildScreen(), cardBtn("바닐라"));
  ok(String(sheetCard.className).indexOf("out") > 0, "시트까지 품절 표시");
  sheetCard.click();
  ok(els.emgSheet.hidden === false, "긴급 구매 창은 열리고");
  ok(els.btnEmgBuy.disabled === true, "돈이 없으면 못 산다");
  els.btnEmgClose.click();
  els.btnDone.click();
  ok(G.S.state === "orderResult", "그래도 영업이 멈추지 않는다", G.S.state);
  ok(num(els.resAcc) < 50, "대신 일치율이 바닥이다", els.resAcc.textContent);
  /* 빈 케이크도 '1단' 은 맞을 수 있어 아주 적게는 들어온다 */
  ok(G.money() <= Math.round(G.S.order.basePrice * 0.1),
     "빈 케이크는 거의 못 받는다", G.money() + " / 정가 " + G.S.order.basePrice);
  G.leaveResult();
  ok(G.S.state === "customerEnter", "다음 손님으로 넘어간다", G.S.state);
}


console.log("\n--- 14. 진행 중 저장 / 중복 정산 회귀 ---");
{
  STORE = {};
  G = boot(); G.newGame(); G.openPrep();
  G.bumpCart("sheetVanilla", 2);
  G = boot(); G.continueGame();
  ok(G.S.state === "prep" && G.S.cart.sheetVanilla === 2, "구매 전 장바구니 복원");
  G.startService(); G.showOrderPreview(); G.toBuild();
  G.setTier(1); G.setSheet("vanilla"); G.setCream("white"); G.addTopping("strawberry");
  NOW += 5000; G.save();
  let saved = JSON.parse(STORE["ccojik.decoCake.v1"]);
  G = boot(); G.continueGame();
  ok(G.S.state === "build", "제작 화면으로 이어하기");
  ok(G.S.guest === 1 && G.S.stats.ingredientCost === 80, "주문 순서와 매입 장부 복원");
  ok(JSON.stringify(G.S.cake) === JSON.stringify(saved.session.cake), "만들던 케이크 복원");
  ok(G.buildSec() === 5, "제작 경과 시간 복원");
  ok(G.S.history.length === saved.session.history.length, "되돌리기 기록 복원");
  G.undo();
  ok(G.S.cake.toppings.length === 0, "복원 후 되돌리기 가능");
  G.submit();
  saved = JSON.parse(STORE["ccojik.decoCake.v1"]);
  const resultMoney = G.money();
  const inventory = JSON.stringify(G.S.save.inventory);
  G = boot(); G.continueGame();
  ok(G.S.state === "orderResult", "결과 화면도 복원");
  ok(G.money() === resultMoney && G.S.save.totalSales === saved.totalSales, "결과 복원은 수입을 중복 지급하지 않는다");
  ok(JSON.stringify(G.S.save.inventory) === inventory, "결과 복원은 재료를 중복 차감하지 않는다");
  G.submit();
  ok(G.money() === resultMoney && G.S.stats.orders === 1, "중복 제출 방지");
  G.leaveResult();
  ok(G.S.guest === 2, "두 번째 손님부터 계속");
  while (G.S.state !== "dayResult") {
    G.showOrderPreview(); G.toBuild(); copyOrder(G.S.order); G.submit(); G.leaveResult();
  }
  const rep = G.S.save.shopReputation;
  const stats = JSON.stringify(G.S.stats);
  G = boot(); G.continueGame();
  ok(G.S.state === "dayResult" && G.S.day === 1, "마감 화면을 복원");
  ok(G.S.save.shopReputation === rep && JSON.stringify(G.S.stats) === stats, "평판·하루 장부는 중복 정산하지 않는다");
  G.openShop(); G = boot(); G.continueGame();
  ok(G.S.state === "shop", "상점 복원");
  G.S.save.money = 3000; G.openLottery(); G.scratch();
  const lottoMoney = G.money();
  G = boot(); G.continueGame(); G.scratch();
  ok(G.S.state === "lottery" && G.money() === lottoMoney, "복권 복원 후 재구매·중복 지급 방지");
  G.startDay(2); G = boot(); G.continueGame();
  ok(G.S.day === 2 && G.S.state === "dayIntro" && G.S.stats.orders === 0, "다음 날 새 장부로 진행");
}

console.log("\n--- 15. 흐르는 시간과 저장 시점 ---");
{
  /* 산 재료가 장바구니에 남아 있으면 이어하기로 또 살 수 있다 */
  STORE = {};
  G = boot(); G.newGame(); G.openPrep();
  G.bumpCart("sheetVanilla", 2);
  G.startService();
  let saved = JSON.parse(STORE["ccojik.decoCake.v1"]);
  ok(saved.session.state === "customerEnter", "영업 시작은 손님 등장으로 저장된다", saved.session.state);
  ok(!Object.keys(saved.session.cart).length, "산 재료는 장바구니에 남지 않는다",
     JSON.stringify(saved.session.cart));
  const paidMoney = G.money(), paidStock = JSON.stringify(G.S.save.inventory);
  G = boot(); G.continueGame();
  ok(G.money() === paidMoney && JSON.stringify(G.S.save.inventory) === paidStock,
     "이어하기가 재료비를 또 받지 않는다");

  /* 주문 노출 — 남은 시간만 들고 간다 */
  G.showOrderPreview();
  const full = G.S.previewLeft;
  NOW += 1000;
  flushRaf(1, NOW);
  const left = G.S.previewLeft;
  ok(full > 1 && Math.abs(left - (full - 1)) < 0.01, "노출 시간이 흐른다", full + " -> " + left);
  G.save();
  saved = JSON.parse(STORE["ccojik.decoCake.v1"]);
  ok(Math.abs(saved.session.previewLeft - left) < 0.01, "남은 노출 시간을 저장한다",
     saved.session.previewLeft);
  G = boot(); G.continueGame();
  flushTimers(1);                       /* 손님이 들어오는 1.1초 */
  ok(G.S.state === "orderPreview" && Math.abs(G.S.previewLeft - left) < 0.01,
     "이어하기는 남은 시간만큼만 보여 준다 (새로고침으로 더 못 본다)", G.S.previewLeft);

  /* 노출이 끝난 뒤의 저장은 그 시간을 들고 가지 않는다 */
  NOW += 10000; flushRaf(2, NOW);
  ok(G.S.state === "build", "노출이 끝나면 제작 화면", G.S.state);
  G.save();
  saved = JSON.parse(STORE["ccojik.decoCake.v1"]);
  ok(saved.session.previewLeft === 0, "제작 중 저장은 노출 시간을 들고 가지 않는다",
     saved.session.previewLeft);
  G = boot(); G.continueGame();
  flushTimers(1);
  ok(G.S.state === "build", "제작 중 이어하기는 주문을 다시 보여 주지 않는다", G.S.state);

  /* 창을 숨기거나 떠날 때 저장한다 */
  G.setTier(2);
  STORE = {};
  DOC.hidden = true; fire(DOC, "visibilitychange");
  ok(!!STORE["ccojik.decoCake.v1"], "문서가 숨으면 저장한다");
  STORE = {};
  DOC.hidden = false; fire(DOC, "visibilitychange");
  ok(!STORE["ccojik.decoCake.v1"], "다시 보일 때는 저장하지 않는다");
  fire(WIN, "pagehide");
  ok(!!STORE["ccojik.decoCake.v1"], "창을 떠날 때 저장한다");
  saved = JSON.parse(STORE["ccojik.decoCake.v1"]);
  ok(saved.session.cake.tiers === 2, "떠날 때의 케이크가 그대로 담긴다");
}

console.log("\n--- 16. 화면 여백 ---");
{
  const css = read("style.css");
  /* 노치 여백을 .scr 에 주면 화면마다 다른 여백이 전부 지워진다 */
  ok(!/\.scr\s*\{[^}]*padding-(top|bottom)/.test(css), "노치 여백을 .scr 에 덮어쓰지 않는다");
  ok(/\.shell\s*\{\s*padding:\s*env\(safe-area-inset-top\)/.test(css),
     "노치 여백은 가게 창이 들고 있다");
  for (const scr of ["play-screen", "result-screen", "day-result-screen", "start-screen"]) {
    ok(new RegExp("\\." + scr + "\\s*\\{[^}]*padding:").test(css), scr + " 는 자기 여백을 가진다");
  }
  ok(/\.btn\s*\{\s*min-height:\s*44px/.test(css), "단추는 모두 44px 이상이다");
  /* 캐시 주소와 실제 파일이 어긋나면 고친 코드가 안 내려간다 */
  const html = read("index.html");
  const vs = (html.match(/\?v=([0-9-]+)/g) || []).map(s => s.slice(3));
  ok(vs.length === 4 && vs.every(v => v === vs[0]), "css·js 캐시 주소가 한 판본으로 맞는다", vs.join(","));
}

console.log("\n" + (fail ? "실패 " + fail + " / " : "전부 통과 ") + "(" + (pass + fail) + ")");
process.exit(fail ? 1 : 0);
