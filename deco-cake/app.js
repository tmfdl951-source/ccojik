"use strict";
/* ============================================================
   꼬직 · 케이크 가게
   ============================================================
   손님이 와서 주문한 케이크를 잠깐 보여 주고 감춘다. 기억해서 만들고,
   얼마나 맞혔는지에 따라 돈을 받는다. 하루를 마치면 상점과 복권.

   계산은 전부 game.js 에 있다. 여기는 화면과 입력만 맡는다.
   화면은 아홉 개로 나뉘고 한 번에 하나만 보인다 (.scr.active).
   케이크는 픽셀 그림을 겹친 DOM 레이어다 (크림 층만 캔버스).
   ============================================================ */

const $ = id => document.getElementById(id);
const pick = a => a[(Math.random() * a.length) | 0];
const clone = v => JSON.parse(JSON.stringify(v));

const CFG = {
  enterMs: 1100,      /* 손님이 들어와 말하는 시간 */
  peekMs: 1000,       /* 주문 다시보기 */
  toastMs: 2400,
  countMs: 520,       /* 금액 count-up */
};

const S = {
  state: GAME_STATE.START,
  save: null,
  day: 1,
  event: null,        /* 오늘의 이벤트 */
  guest: 0,
  customers: 5,
  customer: null,     /* 지금 손님 타입 */
  order: null,
  cake: null,
  history: [],        /* 되돌리기용 케이크 스냅숏 */
  stats: null,        /* 오늘 장부 — blankDayStats() */
  cart: {},           /* 영업 준비에서 담은 수량 (아직 산 게 아니다) */
  prepTab: "sheet",
  buildStart: 0,      /* 제작을 시작한 시각 — 인내심과 팁의 기준 */
  patTimer: 0,
  emgId: null,        /* 긴급 구매 창에 올라온 재료 */
  previewLeft: 0,
  tab: "tier",
  layer: "bottom",
  activeTop: null,    /* 자리를 고르는 중인 토핑 */
  tierDone: false,    /* 단수를 한 번이라도 골랐나 */
  memoLine: "",       /* 기억 메모 / 셰프 노트가 남긴 한 줄 */
  tipOn: false,       /* 팁 보너스가 걸려 있나 */
  busy: false,
};

/* 시작 화면 진열대에 놓는 케이크 — 실제 게임 에셋 그대로 */
const HEROES = {
  heroA: { tiers: 2, bottomSheet: "strawberry", topSheet: "vanilla",
           bottomCream: "strawberry", topCream: "white",
           toppings: [{ type: "strawberry", count: 2 }] },
  heroB: { tiers: 1, bottomSheet: "chocolate", bottomCream: "chocolate",
           toppings: [{ type: "cherry", count: 1 }] },
  heroC: { tiers: 1, bottomSheet: "vanilla", bottomCream: "white",
           toppings: [], decoration: "macaron" },
};

/* ============================================================
   화면 전환
   ============================================================ */
const SCENE = {
  start: "scStart", dayIntro: "scDayIntro", prep: "scPrep", customerEnter: "scCustomer",
  orderPreview: "scOrder", build: "scBuild", orderResult: "scOrderResult",
  dayResult: "scDayResult", shop: "scShop", lottery: "scLottery",
};
function go(state) {
  S.state = state;
  document.querySelectorAll(".scr").forEach(s => s.classList.remove("active"));
  $(SCENE[state]).classList.add("active");
  save();
}
function restart(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

let toastTimer = 0;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; toastTimer = 0; }, CFG.toastMs);
}

/* 금액이 올라가는 연출 — 최종값을 먼저 넣어 두고 애니메이션은 덧칠만 한다 */
function countUp(el, from, to, prefix) {
  const fmt = n => (prefix || "") + won(n);
  el.textContent = fmt(to);
  const t0 = performance.now();
  const step = now => {
    /* rAF 의 시각이 performance.now() 보다 앞설 때가 있어 아래도 묶는다 */
    const k = Math.max(0, Math.min(1, (now - t0) / CFG.countMs));
    el.textContent = fmt(Math.round(from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ============================================================
   케이크 그리기 — 층 안에 시트 / 크림 / 토핑 / 장식을 겹친다
   ============================================================ */
function placeCream(canvas) {
  canvas.style.left = (CREAM_BOX.left * 100) + "%";
  canvas.style.top = (CREAM_BOX.top * 100) + "%";
  canvas.style.width = (CREAM_BOX.width * 100) + "%";
  canvas.style.height = (CREAM_BOX.height * 100) + "%";
}

function paintCream(canvas, key) {
  const cream = creamOf(key);
  if (!cream || !canvas) return;
  const r = canvas.getBoundingClientRect();
  const W = 48;
  const H = Math.max(14, Math.round(W * (r.height || 40) / (r.width || 100)));
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, W, H);
  const cx = (W - 1) / 2, rx = W / 2 - 0.5;
  const ry = (H - 3) / 2, cy = ry + 0.5;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      g.fillStyle = (dy > 0.1 && d > 0.87) ? cream.c2 : cream.c;
      g.fillRect(x, y, 1, 1);
    }
  }
  g.fillStyle = cream.c2;
  for (const d of [[-0.64, 3], [-0.20, 2], [0.24, 4], [0.66, 2]]) {
    const x = Math.round(cx + d[0] * rx);
    const yTop = Math.round(cy + Math.sqrt(Math.max(0, 1 - d[0] * d[0])) * ry) - 1;
    g.fillRect(x - 1, yTop, 3, d[1]);
  }
  g.fillStyle = cream.c3;
  g.fillRect(Math.round(cx - rx * 0.56), Math.round(cy - ry * 0.40), 5, 2);
  g.fillRect(Math.round(cx - rx * 0.38), Math.round(cy - ry * 0.66), 3, 1);
}

function makeTier() {
  const t = document.createElement("div");
  t.className = "tier";
  const sheet = document.createElement("img");
  sheet.className = "layer l-sheet"; sheet.alt = "";
  const cream = document.createElement("canvas");
  cream.className = "layer l-cream";
  placeCream(cream);
  const tops = document.createElement("div");
  tops.className = "tops";
  t.appendChild(sheet); t.appendChild(cream); t.appendChild(tops);
  t._sheet = sheet; t._cream = cream; t._tops = tops;
  return t;
}

function paintTier(tier, sheet, cream) {
  if (sheet) { tier._sheet.src = assetUrl("sheet", sheet); tier._sheet.hidden = false; }
  else { tier._sheet.removeAttribute("src"); tier._sheet.hidden = true; }
  if (cream) { tier._cream.hidden = false; placeCream(tier._cream); paintCream(tier._cream, cream); }
  else { tier._cream.hidden = true; }
}

function putSprite(box, key, sp) {
  const im = document.createElement("img");
  im.className = "top-pic";
  im.alt = "";
  im.src = assetUrl("topping", key);
  im.style.left = (sp.x * 100) + "%";
  im.style.top = (sp.y * 100) + "%";
  im.style.width = (sp.w * 100) + "%";
  box.appendChild(im);
}

function paintTops(tier, list, deco) {
  tier._tops.innerHTML = "";
  /* 장식이 먼저 — 뒤쪽에 놓고 토핑이 앞에 온다 */
  if (deco) for (const sp of layoutTopping(deco, 1, "top")) putSprite(tier._tops, deco, sp);
  for (const t of list) {
    for (const sp of layoutTopping(t.type, t.count, t.position || "center")) {
      putSprite(tier._tops, t.type, sp);
    }
  }
}

/* cake 는 { tiers, bottomSheet, topSheet, bottomCream, topCream, toppings, decoration } */
function renderCake(slot, cake) {
  if (!slot) return;
  if (!slot._base) {
    slot.innerHTML = "";
    slot._base = makeTier(); slot._base.classList.add("tier-base");
    slot._up = makeTier(); slot._up.classList.add("tier-up");
    slot.appendChild(slot._base);   /* 위층이 아래층을 덮어야 얹힌 것처럼 보인다 */
    slot.appendChild(slot._up);
  }
  const two = cake && cake.tiers === 2;
  slot.classList.toggle("two", !!two);
  slot._up.hidden = !two;

  paintTier(slot._base, cake && cake.bottomSheet, cake && cake.bottomCream);
  if (two) paintTier(slot._up, cake.topSheet, cake.topCream);

  const tops = (cake && cake.toppings) || [];
  paintTops(two ? slot._up : slot._base, tops, cake && cake.decoration);
  if (!two) slot._up._tops.innerHTML = "";
}

/* 레이아웃이 잡힌 뒤에 크림을 다시 찍는다 (크기를 알아야 한다) */
function repaintCreams(slot, cake) {
  if (!slot || !slot._base) return;
  if (cake && cake.bottomCream) paintCream(slot._base._cream, cake.bottomCream);
  if (cake && cake.tiers === 2 && cake.topCream) paintCream(slot._up._cream, cake.topCream);
}
function drawCake(slot, cake) {
  renderCake(slot, cake);
  requestAnimationFrame(() => repaintCreams(slot, cake));
}

/* ============================================================
   저장과 시작 화면
   ============================================================ */
const SESSION_FIELDS = ["state", "day", "event", "guest", "customers", "customer",
  "order", "cake", "history", "stats", "cart", "prepTab", "tab", "layer",
  "activeTop", "tierDone", "memoLine", "tipOn", "result", "closing"];
let saveWarning = false;
function save() {
  if (!S.save) return;
  if (S.state !== "start") {
    /* 흐르는 시간은 따로 담는다 — 제작 경과와 주문 노출의 남은 시간.
       새로고침으로 주문을 처음부터 다시 볼 수 있으면 안 된다. */
    const session = { version: 1,
      elapsed: S.state === "build" ? buildSec() : 0,
      previewLeft: S.state === "orderPreview" ? S.previewLeft : 0 };
    for (const key of SESSION_FIELDS) if (S[key] !== undefined) session[key] = clone(S[key]);
    S.save.session = session;
  }
  const saved = writeSave(S.save);
  if (!saved && !saveWarning) toast("저장 공간을 사용할 수 없어요. 창을 닫으면 진행이 사라질 수 있어요.");
  saveWarning = !saved;
}
function restoreSession(session) {
  if (!session || session.version !== 1 || !SCENE[session.state] ||
      session.state === "start" || !session.stats || !Number.isInteger(session.day)) return false;
  const state = session.state;
  if (["build", "orderPreview", "customerEnter", "orderResult"].includes(state) &&
      (!session.order || !session.cake || !session.customer)) return false;
  if (state === "orderResult" && !session.result) return false;
  for (const key of SESSION_FIELDS) if (session[key] !== undefined) S[key] = clone(session[key]);
  S.busy = false;
  if (state === "dayIntro") { startDay(S.day); return true; }
  if (state === "prep") { openPrep(); return true; }
  if (["dayResult", "shop", "lottery"].includes(state)) {
    endDay(true);
    if (state === "shop") openShop();
    if (state === "lottery") openLottery();
    return true;
  }
  paintGuest(); paintTopBar(); orderNote(S.order);
  if (state === "orderResult") { renderOrderResult(S.result); return true; }
  if (state === "build") {
    S.buildStart = performance.now() - Math.max(0, session.elapsed || 0) * 1000;
    go("build"); startPatience(session.elapsed || 0); buildScreen();
  } else {
    go("customerEnter");
    const left = state === "orderPreview" ? session.previewLeft || 0 : 0;
    enterTimer = setTimeout(() => showOrderPreview(state === "orderPreview", left), CFG.enterMs);
  }
  return true;
}
function money() { return S.save ? S.save.money : 0; }
function addMoney(n) { if (S.save) { S.save.money += n; save(); } }
function itemCount(k) { return (S.save && S.save.items[k]) || 0; }
function itemTotal() {
  let n = 0;
  if (S.save) for (const k in S.save.items) n += S.save.items[k];
  return n;
}
function useItem(k) {
  if (!S.save || !S.save.items[k]) return false;
  S.save.items[k] -= 1;
  if (!S.save.items[k]) delete S.save.items[k];
  save();
  return true;
}

function showStart() {
  const v = loadSave();
  const rec = $("record");
  const cont = $("btnContinue");
  if (v) {
    S.save = v;
    cont.disabled = false;
    $("contSub").textContent = "DAY " + (v.session ? v.session.day : v.day) + " · " + won(v.money);
    $("setNote").textContent = "저장된 기록 — DAY " + v.bestDay + " · 누적 " + won(v.totalSales);
    rec.hidden = false;
    rec.innerHTML = "";
    const rows = [
      ["최고 DAY", "DAY " + v.bestDay],
      ["누적 매출", won(v.totalSales)],
      ["최고 일치율", v.bestAvgAcc + "%"],
    ];
    for (const r of rows) {
      const li = document.createElement("li");
      const a = document.createElement("span"); a.textContent = r[0];
      const b = document.createElement("b"); b.textContent = r[1];
      li.appendChild(a); li.appendChild(b);
      rec.appendChild(li);
    }
  } else {
    S.save = null;
    cont.disabled = true;
    $("contSub").textContent = "";
    $("setNote").textContent = "저장된 기록이 없어요.";
    rec.hidden = true;
  }
  go("start");
  requestAnimationFrame(drawHeroes);
}

function drawHeroes() {
  for (const id in HEROES) drawCake($(id), HEROES[id]);
}

function newGame() {
  if (loadSave() && !confirm("저장된 장사 기록이 지워집니다. 새로 시작할까요?")) return;
  clearSave();
  S.save = blankSave();
  save();
  track("game_start");
  startDay(1);
}
function continueGame() {
  if (!S.save) return;
  if (!restoreSession(S.save.session)) startDay(S.save.day);
}

/* ============================================================
   Day 시작
   ============================================================ */
function startDay(day) {
  S.day = day;
  S.save.day = day;
  if (day > S.save.bestDay) S.save.bestDay = day;
  S.result = null; S.closing = null; S.tipOn = false;

  S.guest = 0;
  S.customers = customersOf(day, S.save.shopReputation);
  S.event = dayEvent(day);
  S.stats = blankDayStats();
  S.cart = {};
  S.prepTab = "sheet";

  $("dayNum").textContent = "DAY " + day;
  $("daySub").textContent = day === 1 ? "오늘도 주문을 받아볼까요?" : "오늘은 주문이 좀 더 까다롭습니다.";

  const ev = $("dayEvent");
  if (S.event) {
    ev.hidden = false;
    $("eventName").textContent = S.event.name;
    $("eventDesc").textContent = S.event.desc;
  } else {
    ev.hidden = true;
  }

  $("iRep").textContent = repStars(S.save.shopReputation);
  $("iGuests").textContent = S.customers + "명";
  $("iMoney").textContent = won(money());
  $("iStock").textContent = stockKinds(S.save.inventory) + "종";

  const r = dayRules(day);
  const facts = ["주문 노출 " + previewSec(day, previewBonus(S.save.items, S.save.candyLeft),
                                           null, S.event && S.event.key).toFixed(1) + "초"];
  if (r.twoTierChance > 0) facts.push("2단 케이크");
  if (r.positions) facts.push("토핑 위치");
  if (r.decoration) facts.push("스페셜 장식");
  const box = $("dayFacts");
  box.innerHTML = "";
  for (const f of facts) {
    const li = document.createElement("li");
    li.textContent = f;
    box.appendChild(li);
  }
  go("dayIntro");
}

/* ============================================================
   영업 준비 — 오늘 쓸 재료를 사 둔다
   ============================================================
   여기서만 재료비가 빠진다. 담아 둔 수량은 아직 산 것이 아니다. */
const PREP_TABS = [
  { key: "sheet",   label: "시트" },
  { key: "cream",   label: "크림" },
  { key: "fruit",   label: "토핑" },
  { key: "deco",    label: "장식" },
];
function prepGroup(tab) {
  if (tab === "sheet" || tab === "cream") return INGREDIENTS.filter(i => i.kind === tab);
  if (tab === "fruit") return INGREDIENTS.filter(i => i.cat === "fruit");
  return INGREDIENTS.filter(i => i.cat === "deco" || i.cat === "special");
}
function ingAsset(ing) {
  return ing.kind === "sheet" ? assetUrl("sheet", ing.key)
       : ing.kind === "cream" ? assetUrl("piping", ing.key)
       : assetUrl("topping", ing.key);
}

function openPrep() {
  $("prepHead").textContent = "DAY " + S.day + " 영업 준비";
  const note = $("prepNote");
  if (S.day === 1) {
    note.hidden = false;
    note.textContent = "첫 영업 기념으로 기본 재료를 준비해뒀어요!";
  } else {
    note.hidden = false;
    note.textContent = "오늘 손님 " + S.customers + "명 — 모자란 재료를 사두세요";
  }
  drawPrepTabs();
  drawPrepCards();
  paintPrepFoot();
  go("prep");
}

function drawPrepTabs() {
  const box = $("prepTabs");
  box.innerHTML = "";
  for (const t of PREP_TABS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mtab" + (S.prepTab === t.key ? " on" : "");
    b.textContent = t.label;
    b.addEventListener("click", () => { S.prepTab = t.key; drawPrepTabs(); drawPrepCards(); });
    box.appendChild(b);
  }
}

/* 카드 안에서만 다시 그린다 — 목록을 새로 만들면 스크롤이 처음으로 돌아간다 */
function prepCard(ing) {
  const wrap = document.createElement("div");
  const im = document.createElement("img");
  im.className = "pick-pic"; im.src = ingAsset(ing); im.alt = "";
  const name = document.createElement("span");
  name.className = "pick-label"; name.textContent = ing.label;
  const stock = document.createElement("em");
  stock.className = "prep-stock";
  const cost = document.createElement("span");
  cost.className = "prep-cost"; cost.textContent = "매입 " + won(getIngredientCost(ing.id));

  const qty = document.createElement("div");
  qty.className = "qty";
  const minus = document.createElement("button");
  minus.type = "button"; minus.className = "qty-btn"; minus.textContent = "−";
  minus.setAttribute("aria-label", ing.label + " 한 개 빼기");
  const num = document.createElement("b");
  num.className = "qty-n";
  const plus = document.createElement("button");
  plus.type = "button"; plus.className = "qty-btn"; plus.textContent = "+";
  plus.setAttribute("aria-label", ing.label + " 한 개 담기");
  qty.appendChild(minus); qty.appendChild(num); qty.appendChild(plus);

  const sum = document.createElement("span");
  sum.className = "prep-sum";

  const paint = () => {
    const q = S.cart[ing.id] || 0;
    const have = S.save.inventory[ing.id] || 0;
    wrap.className = "prep-card" + (q ? " picked" : "");
    num.textContent = String(q);
    stock.textContent = q ? "재고 " + have + " → " + (have + q) : "재고 " + have + "개";
    sum.textContent = q ? won(getIngredientCost(ing.id) * q) : "";
    minus.disabled = !q;
  };
  minus.addEventListener("click", () => { if (bumpCart(ing.id, -1)) { paint(); paintPrepFoot(); } });
  plus.addEventListener("click", () => { if (bumpCart(ing.id, 1)) { paint(); paintPrepFoot(); } });

  wrap.appendChild(im); wrap.appendChild(name); wrap.appendChild(stock);
  wrap.appendChild(cost); wrap.appendChild(qty); wrap.appendChild(sum);
  paint();
  return wrap;
}
function drawPrepCards() {
  const box = $("prepCards");
  box.innerHTML = "";
  for (const ing of prepGroup(S.prepTab)) box.appendChild(prepCard(ing));
}

function bumpCart(id, d) {
  const n = (S.cart[id] || 0) + d;
  if (n < 0) return false;
  const next = Object.assign({}, S.cart);
  if (n) next[id] = n; else delete next[id];
  if (cartCost(next) > money()) { toast("보유금이 모자라요"); return false; }
  S.cart = next;
  save();
  return true;
}

function paintPrepFoot() {
  const cost = cartCost(S.cart);
  $("prepMoney").textContent = won(money());
  $("prepTotal").textContent = won(cost);
  $("prepAfter").textContent = won(money() - cost);
  $("prepCap").textContent = "보유 재료 " + stockKinds(S.save.inventory) + "종";
  const b = $("btnStartService");
  b.disabled = cost > money();
  b.textContent = cost ? "구매하고 영업 시작 (" + won(cost) + ")" : "영업 시작";
}

/* 추천 수량 — 담아만 둔다. 사는 것은 플레이어가 누를 때. */
function recommend() {
  const want = recommendCart(S.save.inventory, S.customers, S.day);
  const fit = trimCart(want, money());
  S.cart = fit;
  save();
  drawPrepCards();
  paintPrepFoot();
  const total = cartCost(fit);
  if (!total) toast("이미 넉넉해요");
  else if (cartCost(want) > total) toast("보유금에 맞춰 줄여 담았어요");
  else toast("추천 수량을 담았어요 — " + won(total));
}

function startService() {
  const cost = cartCost(S.cart);
  if (cost > money()) { toast("보유금이 모자라요"); return; }
  if (cost > 0) {
    purchaseIngredients(S.save, S.cart, S.stats);
    save();
    toast("재료 " + won(cost) + " 구매");
  }
  S.cart = {};
  track("day_open");
  nextGuest();
}

/* ============================================================
   손님 등장 -> 주문 공개
   ============================================================ */
let previewTimer = 0;
let enterTimer = 0;

function paintTopBar() {
  const left = Math.max(0, S.customers - S.guest + 1) + " / " + S.customers;
  for (const p of ["o", "b", "r", "c"]) {
    $(p + "Day").textContent = String(S.day);
    $(p + "Left").textContent = left;
    $(p + "Money").textContent = won(money());
  }
}

/* 손님 얼굴과 타입은 네 화면이 같이 쓴다 */
function paintGuest() {
  const c = S.customer;
  for (const id of ["guestNo", "guestNo2", "enterNo", "reactNo"]) $(id).textContent = String(S.guest);
  for (const id of ["guestType", "guestType2", "enterType", "reactType"]) {
    const el = $(id);
    el.textContent = c.label;
    el.className = "guest-type t-" + c.key;
  }
  /* 클래스는 통째로 다시 쓴다 — 문자열을 잘라 내면 guest-ava 의 t-ava 까지 지워진다 */
  $("enterAva").className = "guest-ava lg t-" + c.key;
  $("guestAva").className = "guest-ava t-" + c.key;
  $("guestAva2").className = "guest-ava sm t-" + c.key;
  $("reactAva").className = "guest-ava sm t-" + c.key;
  $("enterLine").textContent = c.line;
  $("guestLine").textContent = c.line;
}

/* 초기 Day 에만 보조 텍스트를 함께 보여 준다 */
function orderNote(order) {
  const box = $("orderNote");
  box.innerHTML = "";
  if (S.day > 2) { box.hidden = true; return; }
  box.hidden = false;
  const bits = [order.tiers + "단"];
  bits.push(labelOf("sheet", order.bottomSheet) + " 시트");
  bits.push(labelOf("cream", order.bottomCream) + " 크림");
  if (order.tiers === 2) {
    bits.push("위층 " + labelOf("sheet", order.topSheet) + " 시트");
    bits.push("위층 " + labelOf("cream", order.topCream) + " 크림");
  }
  for (const t of order.toppings) {
    bits.push(labelOf("topping", t.type) + " ×" + t.count
      + (t.position ? " " + labelOf("pos", t.position) : ""));
  }
  if (order.decoration) bits.push("장식 " + labelOf("topping", order.decoration));
  for (const b of bits) {
    const li = document.createElement("li");
    li.textContent = b;
    box.appendChild(li);
  }
}

function nextGuest() {
  S.guest += 1;
  if (S.guest > S.customers) { endDay(); return; }

  S.customer = generateCustomer(S.day);
  S.order = generateOrder(S.day, S.customer.key, S.event && S.event.key);
  S.cake = { tiers: 1, bottomSheet: null, topSheet: null,
             bottomCream: null, topCream: null, toppings: [], decoration: null };
  S.history = [];
  S.tab = "tier"; S.layer = "bottom"; S.tierDone = false; S.activeTop = null;
  S.memoLine = "";

  paintGuest();
  paintTopBar();
  orderNote(S.order);

  go("customerEnter");
  if (enterTimer) clearTimeout(enterTimer);
  enterTimer = setTimeout(showOrderPreview, CFG.enterMs);
}

function showOrderPreview(resuming = false, leftSec = 0) {
  if (enterTimer) { clearTimeout(enterTimer); enterTimer = 0; }
  if (S.state !== "customerEnter") return;

  /* 두뇌 사탕은 주문을 볼 때 한 알 쓴다 */
  const candy = S.save.candyLeft > 0;
  const bonus = previewBonus(S.save.items, S.save.candyLeft);
  if (candy && resuming !== true) S.save.candyLeft -= 1;

  go("orderPreview");
  const stage = $("orderStage");
  stage.classList.remove("fade");
  drawCake($("orderSlot"), S.order);

  /* 정가는 숨긴다 — 범위만 */
  const pr = priceRange(S.order);
  $("priceHint").textContent = "예상 판매가 " + pr.lo.toLocaleString("ko-KR")
    + "~" + won(pr.hi);

  /* 이어하기로 돌아왔으면 남아 있던 만큼만 센다 */
  const full = previewSec(S.day, bonus, S.customer.key, S.event && S.event.key);
  const sec = leftSec > 0 ? Math.min(leftSec, full) : full;
  S.previewLeft = sec;
  $("ordFill").style.width = "100%";
  $("ordCount").textContent = Math.ceil(sec);
  const t0 = performance.now();
  if (previewTimer) cancelAnimationFrame(previewTimer);
  const step = now => {
    /* rAF 의 시각이 performance.now() 보다 앞설 때가 있어 위도 묶는다 */
    const left = Math.min(sec, Math.max(0, sec - (now - t0) / 1000));
    S.previewLeft = left;
    $("ordCount").textContent = Math.ceil(left) || 0;
    $("ordFill").style.width = (left / sec * 100).toFixed(1) + "%";
    if (left <= 0) { previewTimer = 0; stage.classList.add("fade"); toBuild(); return; }
    previewTimer = requestAnimationFrame(step);
  };
  previewTimer = requestAnimationFrame(step);
}

/* 기억 메모 / 힌트 — 주문 정보 가운데 한 줄만 */
function memoFor(order) {
  const bits = [];
  bits.push("단수: " + order.tiers + "단");
  bits.push((order.tiers === 2 ? "아래층 시트: " : "시트: ") + labelOf("sheet", order.bottomSheet));
  bits.push((order.tiers === 2 ? "아래층 크림: " : "크림: ") + labelOf("cream", order.bottomCream));
  if (order.tiers === 2) {
    bits.push("위층 시트: " + labelOf("sheet", order.topSheet));
    bits.push("위층 크림: " + labelOf("cream", order.topCream));
  }
  for (const t of order.toppings) {
    bits.push("토핑: " + labelOf("topping", t.type) + " ×" + t.count
      + (t.position ? " (" + labelOf("pos", t.position) + ")" : ""));
  }
  if (order.decoration) bits.push("장식: " + labelOf("topping", order.decoration));
  return pick(bits);
}

function toBuild() {
  if (itemCount("memo")) {
    S.memoLine = "메모 — " + memoFor(S.order);
    useItem("memo");
  } else if (itemCount("note") && S.order.tiers === 2) {
    /* 셰프 노트는 2단 주문에서만 쓰인다 */
    S.memoLine = "셰프 노트 — 위층 시트: " + labelOf("sheet", S.order.topSheet);
    useItem("note");
  }
  go("build");
  startPatience();
  save();
  buildScreen();
}

/* ============================================================
   인내심 — 제작을 시작한 때부터 흐른다
   ============================================================
   0 이 되어도 주문은 실패하지 않는다. 팁만 사라진다. */
function startPatience(elapsed = 0) {
  if (S.patTimer) cancelAnimationFrame(S.patTimer);
  S.buildStart = performance.now() - Math.max(0, elapsed) * 1000;
  const tick = now => {
    if (S.state !== "build") { S.patTimer = 0; return; }
    paintPatience(patienceLeft(S.order, buildSec(now)));
    S.patTimer = requestAnimationFrame(tick);
  };
  S.patTimer = requestAnimationFrame(tick);
}
function buildSec(now) {
  return Math.max(0, ((now === undefined ? performance.now() : now) - S.buildStart) / 1000);
}
function paintPatience(frac) {
  const box = $("patience");
  if (!box._hearts) {
    box._hearts = [];
    for (let i = 0; i < PATIENCE_CONFIG.hearts; i++) {
      const h = document.createElement("i");
      box.appendChild(h);
      box._hearts.push(h);
    }
  }
  const on = Math.ceil(frac * PATIENCE_CONFIG.hearts);
  for (let i = 0; i < box._hearts.length; i++) {
    box._hearts[i].className = i < on ? "pat-on" : "pat-off";
  }
  box.className = "patience" + (frac > 0 && frac <= 0.4 ? " low" : "");
  $("guestWait").textContent =
    frac > 0.6 ? (S.customer && S.customer.key === "rush" ? "빨리요, 빨리!" : "기다리고 있어요")
    : frac > 0.2 ? "아직 멀었나요?"
    : frac > 0 ? "조금 늦어지네요..." : "너무 오래 걸려요...";
}

/* ============================================================
   제작 화면
   ============================================================
   주문은 보이지 않는다. 기억만으로 만든다.
   탭은 다섯 개. 재료를 고르면 다음 단계 탭으로 저절로 넘어간다. */
const BUILD_TABS = [
  { key: "tier",  label: "단수" },
  { key: "sheet", label: "시트" },
  { key: "cream", label: "크림" },
  { key: "fruit", label: "토핑" },
  { key: "deco",  label: "장식" },
];

function buildScreen() {
  paintTopBar();
  paintPatience(patienceLeft(S.order, buildSec()));
  const memo = $("memoChip");
  memo.hidden = !S.memoLine;
  memo.textContent = S.memoLine;
  $("judge").hidden = true;
  S.busy = false;
  drawTabs();
  drawPicker();
  drawChosen();
  drawActions();
  drawCake($("cakeSlot"), S.cake);
}

/* 지금 무엇을 고를 차례인가 — 안내 문구와 자동 탭 이동이 같은 곳에서 나온다 */
function stepOf() {
  const c = S.cake, two = c.tiers === 2;
  if (!S.tierDone) return { tab: "tier", layer: "bottom", text: "몇 단 케이크인가요?" };
  if (!c.bottomSheet) return { tab: "sheet", layer: "bottom",
    text: two ? "아래층 시트를 골라주세요" : "시트를 골라주세요" };
  if (!c.bottomCream) return { tab: "cream", layer: "bottom",
    text: two ? "아래층 크림을 골라주세요" : "크림을 골라주세요" };
  if (two && !c.topSheet) return { tab: "sheet", layer: "top", text: "위층 시트를 골라주세요" };
  if (two && !c.topCream) return { tab: "cream", layer: "top", text: "위층 크림을 골라주세요" };
  if (!c.toppings.length) return { tab: "fruit", layer: "bottom", text: "토핑을 올려주세요" };
  if (needPos() && S.activeTop) {
    return { tab: "fruit", layer: "bottom",
             text: labelOf("topping", S.activeTop) + " 위치를 골라주세요" };
  }
  return { tab: S.tab, layer: S.layer, text: "다 올렸으면 완성하기!" };
}
function needPos() { return dayRules(S.day).positions; }

/* 재료를 고른 뒤 — 다음 단계로 옮기고 다시 그린다 */
function advance() {
  const st = stepOf();
  S.tab = st.tab; S.layer = st.layer;
  drawTabs(); drawPicker(); drawChosen(); drawActions();
  $("stepHint").textContent = st.text;
  restart($("cakeSlot"), "put");
  drawCake($("cakeSlot"), S.cake);
  save();
}

/* 되돌리기 — 고르기 전에 스냅숏을 쌓아 둔다 */
function snap() {
  S.history.push({ cake: clone(S.cake), tierDone: S.tierDone, activeTop: S.activeTop });
  if (S.history.length > 20) S.history.shift();
}
function undo() {
  if (S.busy || !S.history.length) return;
  const h = S.history.pop();
  S.cake = h.cake;
  S.tierDone = h.tierDone;
  S.activeTop = h.activeTop;
  advance();
  track("undo");
}

function drawTabs() {
  const box = $("buildTabs");
  box.innerHTML = "";
  for (const t of BUILD_TABS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mtab" + (S.tab === t.key ? " on" : "");
    b.textContent = t.label;
    b.addEventListener("click", () => { S.tab = t.key; drawTabs(); drawPicker(); });
    box.appendChild(b);
  }
  $("stepHint").textContent = stepOf().text;
}

/* 보조줄 — 2단이면 층, 토핑 자리를 쓰는 Day 면 자리 */
function drawSubRow() {
  const box = $("subRow");
  box.innerHTML = "";
  box.hidden = true;

  if ((S.tab === "sheet" || S.tab === "cream") && S.cake.tiers === 2) {
    box.hidden = false;
    for (const L of [{ k: "bottom", n: "아래층" }, { k: "top", n: "위층" }]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sub-btn" + (S.layer === L.k ? " on" : "");
      b.textContent = L.n;
      b.addEventListener("click", () => { S.layer = L.k; drawSubRow(); drawPicker(); });
      box.appendChild(b);
    }
    return;
  }

  if (S.tab === "fruit" && needPos() && S.activeTop) {
    const got = S.cake.toppings.find(x => x.type === S.activeTop);
    box.hidden = false;
    for (const p of POSITIONS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sub-btn pos" + (got && got.position === p.key ? " on" : "");
      b.textContent = p.label;
      b.addEventListener("click", () => setPos(p.key));
      box.appendChild(b);
    }
  }
}

function card(o) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "pick-card" + (o.on ? " on" : "") + (o.out ? " out" : "")
              + (o.extra ? " " + o.extra : "");
  if (o.url) {
    const im = document.createElement("img");
    im.className = "pick-pic"; im.src = o.url; im.alt = "";
    b.appendChild(im);
  }
  const t = document.createElement("span");
  t.className = "pick-label"; t.textContent = o.label;
  b.appendChild(t);
  if (o.stock !== undefined) {
    const s = document.createElement("em");
    s.className = "pick-stock";
    s.textContent = o.stock > 0 ? "남은 " + o.stock : "품절";
    b.appendChild(s);
  }
  if (o.badge) {
    const n = document.createElement("em");
    n.className = "pick-count"; n.textContent = o.badge;
    b.appendChild(n);
  }
  b.addEventListener("click", () => { restart(b, "pop"); o.fn(); });
  return b;
}

/* 지금 이 케이크에 쓰기로 한 양을 뺀 나머지 — 제작 중에는 재고를 건드리지 않는다 */
function leftOf(id) {
  return (S.save.inventory[id] || 0) - (cakeNeeds(S.cake)[id] || 0);
}

function drawPicker() {
  drawSubRow();
  const box = $("pickCards");
  box.innerHTML = "";
  box.dataset.tab = S.tab;

  if (S.tab === "tier") {
    for (const n of [1, 2]) {
      box.appendChild(card({ label: n + "단", on: S.cake.tiers === n && S.tierDone,
                             fn: () => setTier(n), extra: "tier-card" }));
    }
    return;
  }
  if (S.tab === "sheet") {
    const cur = S.layer === "top" ? S.cake.topSheet : S.cake.bottomSheet;
    for (const p of SHEETS) {
      const n = leftOf(ingId("sheet", p.key));
      box.appendChild(card({ label: p.label, url: assetUrl("sheet", p.key), on: cur === p.key,
                             fn: () => setSheet(p.key), stock: n, out: n <= 0 }));
    }
    return;
  }
  if (S.tab === "cream") {
    const cur = S.layer === "top" ? S.cake.topCream : S.cake.bottomCream;
    for (const p of CREAMS) {
      const n = leftOf(ingId("cream", p.key));
      box.appendChild(card({ label: p.label, url: assetUrl("piping", p.key), on: cur === p.key,
                             fn: () => setCream(p.key), stock: n, out: n <= 0 }));
    }
    return;
  }
  if (S.tab === "fruit") {
    for (const t of FRUITS) {
      const got = S.cake.toppings.find(x => x.type === t.key);
      const n = leftOf(t.key);
      box.appendChild(card({ label: t.label, url: assetUrl("topping", t.key), on: !!got,
                             fn: () => addTopping(t.key), stock: n, out: n <= 0,
                             badge: got ? "×" + got.count : "" }));
    }
    return;
  }
  /* 장식은 한 가지만 — 다시 누르면 뺀다 */
  for (const t of DECOS) {
    const on = S.cake.decoration === t.key;
    const n = leftOf(t.key);
    box.appendChild(card({ label: t.label, url: assetUrl("topping", t.key), on: on,
                           fn: () => setDeco(t.key), stock: n, out: !on && n <= 0 }));
  }
}

/* ============================================================
   품절과 긴급 구매
   ============================================================
   재고가 없어도 카드를 숨기지 않는다. 눌러서 두 배 값에 사거나,
   다른 재료를 쓰거나, 그대로 완성할 수 있다. */
function soldOut(id) {
  const ing = ingredientOf(id);
  if (!ing) return;
  S.emgId = id;
  $("emgName").textContent = ing.label + " 재고가 없어요!";
  $("emgNormal").textContent = won(getIngredientCost(id));
  $("emgPrice").textContent = won(emergencyCost(id));
  const b = $("btnEmgBuy");
  const poor = money() < emergencyCost(id);
  b.disabled = poor;
  b.textContent = poor ? "돈이 모자라요" : "1개 긴급 구매";
  $("emgSheet").hidden = false;
}
function emgBuy() {
  if (!S.emgId) return;
  const id = S.emgId;
  const cost = emergencyPurchase(S.save, id, S.stats);
  if (!cost) { toast("보유금이 모자라요"); return; }
  save();
  closeSheets();
  S.emgId = null;
  toast(ingredientOf(id).label + " 긴급 구매 — " + won(cost));
  paintTopBar();
  drawPicker();
  track("emergency_buy");
}

/* 재고를 넘기면 품절 창을 띄우고 선택을 되돌린다 */
function withStock(next, after) {
  const short = shortOf(S.save.inventory, next);
  if (short) { soldOut(short); return false; }
  snap();                       /* 되돌리기 기록은 바꾸기 전 상태로 남는다 */
  S.cake = next;
  if (after) after();
  advance();
  return true;
}

function drawChosen() {
  const box = $("chosen");
  box.innerHTML = "";
  for (const t of S.cake.toppings) {
    const li = document.createElement("li");
    li.className = "chip-sel" + (S.activeTop === t.type ? " on" : "");
    const s = document.createElement("button");
    s.type = "button";
    s.className = "chip-name";
    s.textContent = labelOf("topping", t.type) + " ×" + t.count
      + (t.position ? " · " + labelOf("pos", t.position) : "");
    s.addEventListener("click", () => { S.activeTop = t.type; S.tab = "fruit"; drawTabs(); drawPicker(); drawChosen(); });
    const x = document.createElement("button");
    x.type = "button"; x.className = "chip-x"; x.textContent = "×";
    x.setAttribute("aria-label", labelOf("topping", t.type) + " 빼기");
    x.addEventListener("click", () => dropTopping(t.type));
    li.appendChild(s); li.appendChild(x);
    box.appendChild(li);
  }
  if (S.cake.decoration) {
    const li = document.createElement("li");
    li.className = "chip-sel deco";
    const s = document.createElement("span");
    s.className = "chip-name";
    s.textContent = "장식 · " + labelOf("topping", S.cake.decoration);
    const x = document.createElement("button");
    x.type = "button"; x.className = "chip-x"; x.textContent = "×";
    x.setAttribute("aria-label", "장식 빼기");
    x.addEventListener("click", () => setDeco(S.cake.decoration));
    li.appendChild(s); li.appendChild(x);
    box.appendChild(li);
  }
}

/* ---------------- 고르기 ---------------- */
function setTier(n) {
  snap();
  S.cake.tiers = n;
  S.tierDone = true;
  if (n === 1) { S.cake.topSheet = null; S.cake.topCream = null; S.layer = "bottom"; }
  advance();
}
function setSheet(k) {
  const next = clone(S.cake);
  if (S.layer === "top") next.topSheet = k; else next.bottomSheet = k;
  withStock(next);
}
function setCream(k) {
  const next = clone(S.cake);
  if (S.layer === "top") next.topCream = k; else next.bottomCream = k;
  withStock(next);
}
function addTopping(k) {
  const meta = toppingOf(k);
  const next = clone(S.cake);
  const got = next.toppings.find(x => x.type === k);
  if (got) {
    if (got.count >= meta.max) { toast(meta.label + "은 " + meta.max + "개까지예요"); return; }
    got.count += 1;
  } else {
    if (next.toppings.length >= 3) { toast("토핑은 세 종류까지예요"); return; }
    next.toppings.push(needPos() ? { type: k, count: 1, position: "center" }
                                 : { type: k, count: 1 });
  }
  withStock(next, () => { S.activeTop = k; });
}
function dropTopping(k) {
  snap();
  S.cake.toppings = S.cake.toppings.filter(x => x.type !== k);
  if (S.activeTop === k) S.activeTop = S.cake.toppings.length ? S.cake.toppings[0].type : null;
  advance();
}
function setPos(p) {
  const got = S.cake.toppings.find(x => x.type === S.activeTop);
  if (!got) return;
  snap();
  got.position = p;
  advance();
}
function setDeco(k) {
  const next = clone(S.cake);
  next.decoration = next.decoration === k ? null : k;
  withStock(next);
}

/* ============================================================
   액션바 — 힌트 / 아이템 / 완성하기
   ============================================================ */
function drawActions() {
  const hint = itemCount("hint");
  $("hintN").textContent = String(hint);
  $("btnHint").disabled = !hint || S.busy;
  $("itemN").textContent = String(itemTotal());
  $("btnItems").disabled = S.busy;
  $("btnDone").disabled = S.busy;
  $("btnUndo").disabled = S.busy || !S.history.length;
}

function useHint() {
  if (S.busy || !useItem("hint")) return;
  toast("힌트 — " + memoFor(S.order));
  drawActions();
  track("item_hint");
}

function usePeek() {
  if (S.busy || !useItem("peek")) return;
  closeSheets();
  S.busy = true;
  drawActions();
  const slot = $("cakeSlot");
  const keep = S.cake;
  drawCake(slot, S.order);
  restart(slot, "peek");
  const j = $("judge");
  j.hidden = false; j.className = "stage-flash peek-tag"; j.textContent = "주문 다시보기";
  setTimeout(() => {
    j.hidden = true;
    drawCake(slot, keep);
    S.busy = false;
    drawActions();
  }, CFG.peekMs);
  track("item_peek");
}

/* 보유 아이템 — 화면을 다 덮지 않는 작은 시트 */
function openItems() {
  const box = $("holdList");
  box.innerHTML = "";
  let n = 0;
  for (const it of ITEMS) {
    const have = itemCount(it.key);
    if (!have) continue;
    n++;
    const li = document.createElement("li");
    const ico = document.createElement("i");
    ico.className = "item-ico c" + ((ITEMS.indexOf(it) % 6) + 1);
    ico.textContent = it.ico;
    const info = document.createElement("div");
    info.className = "hold-info";
    const b = document.createElement("b"); b.textContent = it.name + " ×" + have;
    const d = document.createElement("span"); d.textContent = it.desc;
    info.appendChild(b); info.appendChild(d);
    li.appendChild(ico); li.appendChild(info);
    if (it.key === "peek") {
      const u = document.createElement("button");
      u.type = "button"; u.className = "use-btn"; u.textContent = "사용";
      u.disabled = S.state !== "build" || S.busy;
      u.addEventListener("click", usePeek);
      li.appendChild(u);
    } else {
      const auto = document.createElement("span");
      auto.className = "hold-tag";
      auto.textContent = it.key === "hint" ? "액션바에서" : "자동 적용";
      li.appendChild(auto);
    }
    box.appendChild(li);
  }
  if (S.save && S.save.candyLeft > 0) {
    const li = document.createElement("li");
    li.className = "hold-empty";
    li.textContent = "두뇌 사탕 효과 " + S.save.candyLeft + "주문 남음";
    box.appendChild(li);
    n++;
  }
  if (!n) {
    const li = document.createElement("li");
    li.className = "hold-empty";
    li.textContent = "아직 아이템이 없어요. 상점에서 살 수 있습니다.";
    box.appendChild(li);
  }
  $("itemSheet").hidden = false;
}
function closeSheets() {
  $("itemSheet").hidden = true;
  $("setSheet").hidden = true;
  $("emgSheet").hidden = true;
}
function openSettings() { $("setSheet").hidden = false; }
function wipeSave() {
  if (!confirm("저장된 장사 기록을 지울까요?")) return;
  clearSave();
  closeSheets();
  showStart();
}

/* ============================================================
   완성 -> 채점
   ============================================================ */

function submit() {
  if (S.state !== "build" || S.busy) return;
  if (!S.cake.bottomSheet || !S.cake.bottomCream) {
    /* 고를 재료가 남아 있을 때만 막는다. 재고가 아예 없으면 빈 케이크라도
       내보낼 수 있어야 한다 — 돈까지 떨어지면 영업이 멈춰 버린다. */
    const anySheet = SHEETS.some(s => (S.save.inventory[ingId("sheet", s.key)] || 0) > 0);
    const anyCream = CREAMS.some(c => (S.save.inventory[ingId("cream", c.key)] || 0) > 0);
    if ((!S.cake.bottomSheet && anySheet) || (!S.cake.bottomCream && anyCream)) {
      const j = $("judge");
      j.hidden = false; j.className = "stage-flash miss";
      j.textContent = "시트와 크림은 올려야 해요";
      restart(j, "show");
      setTimeout(() => { j.hidden = true; }, 1200);
      return;
    }
  }
  S.busy = true;
  closeSheets();

  /* 제작에 걸린 시간 — 인내심과 팁의 기준 */
  const duration = buildSec();
  if (S.patTimer) { cancelAnimationFrame(S.patTimer); S.patTimer = 0; }

  /* 실수 방지권 — 틀린 항목이 있으면 하나를 고치고 한 장 쓴다 */
  let fixed = null;
  if (itemCount("fix") && calculateAccuracy(S.order, S.cake) < 100) {
    fixed = autoFix(S.order, S.cake);
    if (fixed) useItem("fix");
  }

  const acc = calculateAccuracy(S.order, S.cake);
  const price = S.order.basePrice;
  const earned = calculateEarnings(price, acc);
  const bonuses = payBonuses(S.order, acc,
    { event: S.event && S.event.key, tipItem: S.tipOn });
  const paid = applyBonuses(earned, bonuses);
  const tip = calculateTip(S.order, acc, duration);
  const tipAmt = Math.round(paid * tip.rate);
  const got = paid + tipAmt;
  if (S.tipOn) S.tipOn = false;

  /* 재료는 여기서 딱 한 번 빠진다 (제작 중 선택은 재고를 건드리지 않았다) */
  consumeIngredients(S.save.inventory, S.cake);

  const before = money();
  const st = S.stats;
  st.orders += 1;
  st.accuracyTotal += acc;
  st.revenue += paid;
  st.tips += tipAmt;
  if (acc >= 100) st.perfectOrders += 1;
  if (got > st.best) st.best = got;
  S.save.money += got;
  S.save.totalSales += got;
  S.result = { acc, price, earned, bonuses, paid, tip, tipAmt, got, fixed, duration, before };
  renderOrderResult(S.result);
  track("order_done");
}

function renderOrderResult(result) {
  const { acc, price, earned, bonuses, paid, tip, tipAmt, got, fixed, duration, before } = result;
  S.busy = true;
  const band = payBand(acc);
  $("resTag").textContent = band.tag;
  $("resTag").className = "grade g-" + band.cls;
  $("resAcc").textContent = acc + "%";

  /* 정가 -> 정확도 반영 -> 보너스 -> 팁 */
  const pay = $("payRows");
  pay.innerHTML = "";
  const payRow = (cap, val, cls) => {
    const li = document.createElement("li");
    if (cls) li.className = cls;
    const a = document.createElement("span"); a.textContent = cap;
    const b = document.createElement("b"); b.textContent = val;
    li.appendChild(a); li.appendChild(b);
    pay.appendChild(li);
  };
  payRow("케이크 정가", won(price));
  payRow("정확도 반영 " + acc + "%", won(earned));
  let run = earned;
  bonuses.forEach((b, i) => {
    run = i === bonuses.length - 1 ? paid : Math.round(run * b.mul);
    payRow(b.label, won(run));
  });
  if (tipAmt) payRow("빠른 제작 팁 · " + tip.label, "+" + won(tipAmt), "tip");
  else if (acc >= 80) payRow("제작 " + duration.toFixed(1) + "초 (" + tip.limit + "초 안)", "팁 없음");

  $("payCap").textContent = "총 수입" + (fixed ? " · 실수 방지권" : "");
  $("payGot").textContent = "+" + won(got);
  $("reactLine").textContent = reactionFor(acc, tip.rate >= 0.2);

  /* 조건별 판정 — 맞은 것과 틀린 것을 모두 보여 준다 */
  const rows = $("resRows");
  rows.innerHTML = "";
  for (const r of accuracyDetail(S.order, S.cake)) {
    const li = document.createElement("li");
    li.className = r.ok ? "ok" : "bad";
    const m = document.createElement("i");
    m.textContent = r.ok ? "O" : "X";
    const s = document.createElement("span");
    s.textContent = r.ok ? r.label : r.label + " · 주문 " + r.want + " / 내 케이크 " + r.got;
    li.appendChild(m); li.appendChild(s);
    rows.appendChild(li);
  }

  go("orderResult");
  paintTopBar();
  drawCake($("resOrder"), S.order);
  drawCake($("resMine"), S.cake);

  /* 돈이 케이크에서 떠올라 상단 보유금으로 */
  const fly = $("flyMoney");
  fly.textContent = "+" + won(got);
  fly.hidden = false;
  restart(fly, "go");
  $("rMoney").textContent = won(before);
  countUp($("rMoney"), before, money());

  if (fixed) toast("실수 방지권 — " + fixed + "를 고쳤어요");
  $("btnNextGuest").textContent = S.guest >= S.customers ? "오늘 장사 마감하기" : "다음 손님 맞이하기";
}

/* 결과는 충분히 읽은 뒤 다음 버튼으로 진행한다. */
function leaveResult() {
  if (S.state !== "orderResult") return;
  $("flyMoney").hidden = true;
  nextGuest();
}

/* ============================================================
   하루 정산
   ============================================================ */
function endDay(restoring = false) {
  const st = S.stats;
  const avg = dayAvgAccuracy(st);
  let repGap = S.closing ? S.closing.repGap : 0;
  let got = [];
  if (!restoring) {
  if (avg > S.save.bestAvgAcc) S.save.bestAvgAcc = avg;
  S.save.day = S.day + 1;

  /* 평판은 하루 평균 일치율로 마감 때 한 번만 움직인다 */
  const repWas = S.save.shopReputation;
  S.save.shopReputation = updateReputation(repWas, avg);
  repGap = Math.round((S.save.shopReputation - repWas) * 10) / 10;

  /* 가게 성장 — 해금만 기록해 둔다 */
  got = newDecors(S.day, S.save.decor);
  for (const d of got) S.save.decor.push(d.key);
  S.closing = { repGap, got };
  } else got = S.closing ? S.closing.got : [];
  const line = $("decorLine");
  if (got.length) {
    line.hidden = false;
    line.textContent = "가게가 바뀌었어요 — " + got.map(d => d.name).join(", ");
  } else {
    line.hidden = true;
  }
  /* 순이익은 보여 주기만 한다 — 재료비는 영업 준비에서 이미 빠졌다 */
  const profit = calculateDayProfit(st);
  $("dayResHead").textContent = "DAY " + S.day + " 마감";
  $("dGuests").textContent = st.orders + "개";
  $("dPerfect").textContent = st.perfectOrders + "개";
  $("dAcc").textContent = avg + "%";
  $("dBest").textContent = won(st.best);
  countUp($("dSales"), 0, st.revenue);
  $("dTips").textContent = (st.tips ? "+" : "") + won(st.tips);
  $("dCost").textContent = (st.ingredientCost ? "-" : "") + won(st.ingredientCost);
  $("dEmg").textContent = (st.emergencyPurchaseCost ? "-" : "") + won(st.emergencyPurchaseCost);
  const pf = $("dProfit");
  pf.className = profit < 0 ? "minus" : "";
  pf.textContent = (profit < 0 ? "-" : "") + won(Math.abs(profit));
  $("dMoney").textContent = won(money());
  $("dRep").textContent = repStars(S.save.shopReputation)
    + (repGap ? " (" + (repGap > 0 ? "+" : "") + repGap.toFixed(1) + ")" : "");
  $("btnNextDay").textContent = "DAY " + (S.day + 1) + " 장사하기";
  $("dayBubble").textContent =
    profit <= 0 ? "재료비가 매출보다 많았어요..." :
    avg >= 95 ? "오늘 장사 대박이에요!" :
    avg >= 75 ? "손님들 만족했어요." :
    avg >= 50 ? "조금만 더 기억해 봐요." : "내일은 더 잘할 수 있어요.";

  /* 사장님 그림은 있으면 쓰고, 없으면 말풍선만 남는다 */
  const slot = $("chefPic");
  slot.innerHTML = ""; slot.hidden = true;
  const im = new Image();
  im.alt = "";
  im.onload = () => { slot.appendChild(im); slot.hidden = false; };
  im.onerror = () => {};
  im.src = "assets/chef_great.png";

  go("dayResult");
  if (!restoring) track("day_done");
}

/* ============================================================
   상점
   ============================================================ */
function openShop() {
  $("shopMoney").textContent = won(money());
  const box = $("shopList");
  box.innerHTML = "";
  ITEMS.forEach((it, i) => {
    const li = document.createElement("li");
    li.className = "shop-card";

    const ico = document.createElement("i");
    ico.className = "item-ico c" + ((i % 6) + 1);
    ico.textContent = it.ico;

    const info = document.createElement("div");
    info.className = "shop-info";
    const n = document.createElement("b"); n.textContent = it.name;
    const d = document.createElement("span"); d.textContent = it.desc;
    info.appendChild(n); info.appendChild(d);
    if (itemCount(it.key)) {
      const h = document.createElement("em");
      h.textContent = "보유 " + itemCount(it.key) + "개";
      info.appendChild(h);
    }

    const right = document.createElement("div");
    right.className = "shop-buy";
    const price = document.createElement("span");
    price.className = "shop-price"; price.textContent = won(it.price);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "buy-btn";
    b.textContent = "구매";
    const canHold = it.stack || !itemCount(it.key);
    b.disabled = money() < it.price || !canHold;
    if (!canHold) b.textContent = "보유 중";
    b.addEventListener("click", () => buy(it));
    right.appendChild(price); right.appendChild(b);

    li.appendChild(ico); li.appendChild(info); li.appendChild(right);
    box.appendChild(li);
  });
  go("shop");
}

function buy(it) {
  if (money() < it.price) return;
  if (!it.stack && itemCount(it.key)) return;
  S.save.money -= it.price;
  S.save.items[it.key] = itemCount(it.key) + 1;
  if (it.key === "tip") S.tipOn = true;
  if (it.key === "candy") {
    S.save.candyLeft = 3;
    delete S.save.items.candy;      /* 효과로 바로 바뀐다 */
  }
  save();
  toast(it.name + "을 샀어요");
  track("buy_" + it.key);
  openShop();
}

/* ============================================================
   복권 — 하루 한 번
   ============================================================ */
function openLottery() {
  $("lottoMoney").textContent = won(money());
  const odds = $("lottoOdds");
  odds.innerHTML = "";
  const total = LOTTERY_TABLE.reduce((a, b) => a + b.w, 0);
  for (const row of LOTTERY_TABLE) {
    const li = document.createElement("li");
    const a = document.createElement("span"); a.textContent = row.tag;
    const b = document.createElement("b"); b.textContent = Math.round(row.w / total * 100) + "%";
    li.appendChild(a); li.appendChild(b);
    odds.appendChild(li);
  }
  const used = S.save.lotteryDay === S.day;
  const btn = $("btnScratch");
  btn.disabled = used || money() < LOTTERY_PRICE;
  btn.textContent = used ? "오늘은 다 썼어요" : "긁기 (" + won(LOTTERY_PRICE) + ")";
  $("lottoLeft").textContent = used ? "0회" : "1회";
  $("lottoFace").textContent = "?";
  $("lottoCard").className = "lotto-card";
  $("lottoMsg").textContent = used ? "복권은 하루 한 번만 살 수 있어요."
    : money() < LOTTERY_PRICE ? won(LOTTERY_PRICE) + "이 필요합니다."
    : "한 장에 " + won(LOTTERY_PRICE) + ". 하루 한 번만 살 수 있어요.";
  go("lottery");
}

function scratch() {
  if (S.save.lotteryDay === S.day || money() < LOTTERY_PRICE) return;
  S.save.money -= LOTTERY_PRICE;
  S.save.lotteryDay = S.day;
  const row = drawLottery();
  S.save.money += row.pay;
  save();
  const card = $("lottoCard");
  $("lottoFace").textContent = row.pay ? won(row.pay) : "꽝!";
  card.className = "lotto-card open" + (row.pay >= LOTTERY_PRICE * 1.5 ? " big" : row.pay ? "" : " zero");
  restart(card, "pop");
  $("lottoMsg").textContent = row.pay > LOTTERY_PRICE ? row.tag + " 당첨! 남는 장사네요."
    : row.pay === LOTTERY_PRICE ? "본전입니다."
    : row.pay ? "조금 돌려받았어요." : "다음엔 될지도?";
  $("lottoMoney").textContent = won(money());
  $("lottoLeft").textContent = "0회";
  $("btnScratch").disabled = true;
  $("btnScratch").textContent = "오늘은 다 썼어요";
  track("lottery");
}

/* ============================================================
   연결
   ============================================================ */
function track(name) {
  try { if (window.SiteAnalytics && window.SiteAnalytics.track) window.SiteAnalytics.track(name); } catch (_) {}
}

function backToDay() {
  $("dMoney").textContent = won(money());
  go("dayResult");
}

$("btnNew").addEventListener("click", newGame);
$("btnContinue").addEventListener("click", continueGame);
$("btnSet").addEventListener("click", openSettings);
$("btnSetClose").addEventListener("click", closeSheets);
$("btnWipe").addEventListener("click", wipeSave);
$("btnPrep").addEventListener("click", openPrep);
$("btnRecommend").addEventListener("click", recommend);
$("btnStartService").addEventListener("click", startService);
$("btnEmgBuy").addEventListener("click", emgBuy);
$("btnEmgClose").addEventListener("click", () => { closeSheets(); S.emgId = null; });
$("scCustomer").addEventListener("click", showOrderPreview);
$("btnUndo").addEventListener("click", undo);
$("btnHint").addEventListener("click", useHint);
$("btnItems").addEventListener("click", openItems);
$("btnItemClose").addEventListener("click", closeSheets);
$("btnDone").addEventListener("click", submit);
$("btnNextGuest").addEventListener("click", leaveResult);
$("btnShop").addEventListener("click", openShop);
$("btnLotto").addEventListener("click", openLottery);
$("btnShopBack").addEventListener("click", backToDay);
$("btnShopNext").addEventListener("click", () => startDay(S.day + 1));
$("btnLottoBack").addEventListener("click", backToDay);
$("btnScratch").addEventListener("click", scratch);
$("btnNextDay").addEventListener("click", () => startDay(S.day + 1));
$("itemSheet").addEventListener("click", e => { if (e.target === $("itemSheet")) closeSheets(); });
$("setSheet").addEventListener("click", e => { if (e.target === $("setSheet")) closeSheets(); });
$("emgSheet").addEventListener("click", e => {
  if (e.target === $("emgSheet")) { closeSheets(); S.emgId = null; }
});

window.addEventListener("resize", () => {
  if (S.state === "build") drawCake($("cakeSlot"), S.cake);
  if (S.state === "orderPreview") drawCake($("orderSlot"), S.order);
  if (S.state === "start") drawHeroes();
});

window.addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });

showStart();

window.__cake = {
  S: S, go: go, showStart: showStart, newGame: newGame, startDay: startDay,
  openPrep: openPrep, recommend: recommend, startService: startService,
  bumpCart: bumpCart, soldOut: soldOut, emgBuy: emgBuy, leftOf: leftOf,
  paintPatience: paintPatience, buildSec: buildSec,
  nextGuest: nextGuest, showOrderPreview: showOrderPreview, toBuild: toBuild,
  buildScreen: buildScreen, submit: submit, leaveResult: leaveResult, endDay: endDay,
  openShop: openShop, buy: buy, openLottery: openLottery, scratch: scratch,
  setTier: setTier, setSheet: setSheet, setCream: setCream, setDeco: setDeco, setPos: setPos,
  addTopping: addTopping, dropTopping: dropTopping, stepOf: stepOf, undo: undo,
  useHint: useHint, usePeek: usePeek, openItems: openItems, closeSheets: closeSheets,
  openSettings: openSettings, drawCake: drawCake, memoFor: memoFor,
  money: money, itemCount: itemCount, itemTotal: itemTotal, HEROES: HEROES,
  save: save, useItem: useItem, continueGame: continueGame,
};
