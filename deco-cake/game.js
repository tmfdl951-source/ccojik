"use strict";
/* ============================================================
   케이크 가게 — 규칙만 모아 둔 곳
   ============================================================
   화면과 상관없는 계산은 전부 여기 있다.
     손님 / Day 이벤트 / 주문 생성 / 가격 / 정확도 / 수익 / 상점 / 복권 / 저장
   app.js 는 이 함수들을 부르기만 한다.
   ============================================================ */

/* ---------------- 장면 ---------------- */
const GAME_STATE = {
  START: "start",
  DAY_INTRO: "dayIntro",
  PREP: "prep",
  CUSTOMER_ENTER: "customerEnter",
  ORDER_PREVIEW: "orderPreview",
  BUILD: "build",
  ORDER_RESULT: "orderResult",
  DAY_RESULT: "dayResult",
  SHOP: "shop",
  LOTTERY: "lottery",
};

/* ============================================================
   손님
   ============================================================
   pay 는 정가에 곱하는 값, previewAdj 는 주문 노출 시간에 더하는 값.
   까다로운 손님만 결과에 따라 지급이 갈린다 (payOf 참고). */
const CUSTOMER_TYPES = [
  { key: "normal", label: "일반", w: 44, pay: 1,    previewAdj: 0,
    line: "이 케이크로 부탁해요!" },
  { key: "rush",   label: "급함", w: 14, pay: 1,  previewAdj: -0.5, tip: 1.2,
    line: "빨리 부탁드려요!" },
  { key: "vip",    label: "VIP",    w: 12, pay: 1.3,  previewAdj: 0, hard: true,
    line: "특별한 날이라 신경 써 주세요." },
  { key: "picky",  label: "까다로움", w: 14, pay: 1, previewAdj: 0,
    line: "이번엔 꼭 똑같이 만들어주세요!" },
  { key: "easy",   label: "느긋", w: 16, pay: 0.8, previewAdj: 0, simple: true,
    line: "간단한 걸로 주세요!" },
];
function customerOf(k) { return CUSTOMER_TYPES.find(c => c.key === k) || CUSTOMER_TYPES[0]; }

const _rnd = () => Math.random();
const _pick = a => a[(_rnd() * a.length) | 0];
function _weighted(list) {
  const total = list.reduce((a, b) => a + b.w, 0);
  let n = _rnd() * total;
  for (const row of list) { n -= row.w; if (n <= 0) return row; }
  return list[0];
}

/* Day 1 은 가르치는 날이라 평범한 손님만 온다 */
function generateCustomer(day) {
  if (day <= 1) return customerOf(_rnd() < 0.3 ? "easy" : "normal");
  return _weighted(CUSTOMER_TYPES);
}

/* ============================================================
   Day 이벤트 — 같은 Day 면 늘 같은 이벤트다 (새로고침해도 안 바뀐다)
   ============================================================ */
const DAY_EVENTS = [
  { key: "strawberry", name: "딸기 주문 폭주!",     desc: "딸기 들어간 주문이 늘어요" },
  { key: "busy",       name: "바쁜 금요일!",        desc: "주문 노출 시간 0.5초 감소" },
  { key: "premium",    name: "프리미엄 손님의 날!", desc: "주문이 복잡한 대신 수익 +20%" },
  { key: "group",      name: "단체 예약!",          desc: "2단 케이크 주문이 늘어요" },
  { key: "mania",      name: "디저트 마니아!",      desc: "토핑을 최소 두 종류 주문해요" },
];
function dayEvent(day) {
  if (day < 2) return null;
  const gate = (day * 73 + 11) % 97;
  if (gate % 5 < 2) return null;             /* 평범한 날 */
  /* 고르는 해시는 따로 둔다 — 같은 나머지에서 뽑으면 몇몇 이벤트가 영영 안 나온다 */
  const seed = (day * 41 + 7) % 89;
  return DAY_EVENTS[seed % DAY_EVENTS.length];
}

/* ============================================================
   재료 — 재고와 매입가
   ============================================================
   재료 종류는 assets.js 의 목록에서 그대로 끌어온다. 여기서 새로 만들지 않는다.
   id 는 시트와 크림만 종류를 앞에 붙이고(sheetVanilla / creamWhite),
   토핑은 키가 이미 하나뿐이라 그대로 쓴다(strawberry).
   값은 전부 이 표에 있다 — 함수 안에 숫자를 박지 않는다. */
const INGREDIENT_COSTS = {
  sheetVanilla: 40, sheetChocolate: 50, sheetStrawberry: 55,
  creamWhite: 30, creamStrawberry: 35, creamChocolate: 40,
  strawberry: 25, cherry: 20, blueberry: 20, kiwi: 25, banana: 20,
  whippedCream: 20, sprinkles: 15, chocoCurl: 20, cookieCrumble: 20,
  macaron: 40, heartCandy: 35, wafer: 35,
};
const EMERGENCY_MULT = 2;          /* 긴급 구매는 매입가의 몇 배인가 */

/* 새 게임이 들고 시작하는 것 — Day1 에 구매부터 막히지 않게 */
const START_MONEY = 1000;
const START_STOCK = { sheet: 3, cream: 3, fruit: 4, deco: 2, special: 1 };

function ingId(kind, key) {
  const up = key.charAt(0).toUpperCase() + key.slice(1);
  return kind === "sheet" ? "sheet" + up : kind === "cream" ? "cream" + up : key;
}
const INGREDIENTS = [].concat(
  SHEETS.map(s => ({ id: ingId("sheet", s.key), kind: "sheet", key: s.key,
                     label: s.label + " 시트", cat: "sheet" })),
  CREAMS.map(c => ({ id: ingId("cream", c.key), kind: "cream", key: c.key,
                     label: c.label + " 크림", cat: "cream" })),
  TOPPINGS.map(t => ({ id: t.key, kind: "topping", key: t.key,
                       label: t.label, cat: t.cat }))
);
function ingredientOf(id) { return INGREDIENTS.find(i => i.id === id) || null; }
function getIngredientCost(id) { return INGREDIENT_COSTS[id] || 0; }
function emergencyCost(id) { return getIngredientCost(id) * EMERGENCY_MULT; }

function startInventory() {
  const inv = {};
  for (const i of INGREDIENTS) inv[i.id] = START_STOCK[i.cat] || 0;
  return inv;
}
function stockKinds(inv) {
  let n = 0;
  for (const i of INGREDIENTS) if ((inv[i.id] || 0) > 0) n++;
  return n;
}

/* 케이크 하나에 실제로 들어가는 재료 — id -> 개수 */
function cakeNeeds(cake) {
  const n = {};
  const add = (id, k) => { if (id) n[id] = (n[id] || 0) + k; };
  if (cake.bottomSheet) add(ingId("sheet", cake.bottomSheet), 1);
  if (cake.bottomCream) add(ingId("cream", cake.bottomCream), 1);
  if (cake.tiers === 2) {
    if (cake.topSheet) add(ingId("sheet", cake.topSheet), 1);
    if (cake.topCream) add(ingId("cream", cake.topCream), 1);
  }
  for (const t of cake.toppings || []) add(t.type, t.count);
  if (cake.decoration) add(cake.decoration, 1);
  return n;
}
/* 이 케이크를 지금 재고로 만들 수 있나 — 모자란 첫 재료 id 를 돌려준다 */
function shortOf(inv, cake) {
  const n = cakeNeeds(cake);
  for (const id in n) if ((inv[id] || 0) < n[id]) return id;
  return null;
}
/* 차감은 제출할 때 딱 한 번 — 제작 중 선택은 재고를 건드리지 않는다 */
function consumeIngredients(inv, cake) {
  const n = cakeNeeds(cake);
  for (const id in n) inv[id] = Math.max(0, (inv[id] || 0) - n[id]);
  return n;
}

/* ---------------- 매입 ---------------- */
function cartCost(cart) {
  let c = 0;
  for (const id in cart) c += getIngredientCost(id) * cart[id];
  return c;
}
/* 영업 준비에서 한 번에 산다 — 여기서만 돈이 빠진다 */
function purchaseIngredients(save, cart, stats) {
  const cost = cartCost(cart);
  if (cost > save.money) return 0;
  save.money -= cost;
  for (const id in cart) save.inventory[id] = (save.inventory[id] || 0) + cart[id];
  if (stats) stats.ingredientCost += cost;
  return cost;
}
/* 영업 중 한 개씩 — 두 배 값이고 재료비와 따로 적는다 */
function emergencyPurchase(save, id, stats) {
  const cost = emergencyCost(id);
  if (!cost || save.money < cost) return 0;
  save.money -= cost;
  save.inventory[id] = (save.inventory[id] || 0) + 1;
  if (stats) stats.emergencyPurchaseCost += cost;
  return cost;
}

/* 추천 수량 — 손님 수만 보고 고르게 나눈다. 담아 두기만 하고 사지는 않는다. */
function spread(total, keys) {
  const out = {};
  const base = Math.floor(total / keys.length);
  let rest = total - base * keys.length;
  for (const k of keys) out[k] = base + (rest-- > 0 ? 1 : 0);
  return out;
}
function recommendCart(inv, customers, day) {
  const want = {};
  Object.assign(want, spread(customers + 2, SHEETS.map(s => ingId("sheet", s.key))));
  Object.assign(want, spread(customers + 2, CREAMS.map(c => ingId("cream", c.key))));
  Object.assign(want, spread(customers * 2, FRUITS.map(t => t.key)));
  if (dayRules(day).decoration) for (const d of DECOS) want[d.key] = 1;
  const cart = {};
  for (const id in want) {
    const need = want[id] - (inv[id] || 0);
    if (need > 0) cart[id] = need;
  }
  return cart;
}
/* 보유금에 맞게 줄인다 — 비싼 것부터 하나씩 뺀다 */
function trimCart(cart, money) {
  const out = {};
  for (const id in cart) out[id] = cart[id];
  const order = Object.keys(out).sort((a, b) => getIngredientCost(b) - getIngredientCost(a));
  while (cartCost(out) > money) {
    const id = order.find(k => out[k] > 0);
    if (!id) break;
    out[id] -= 1;
    if (!out[id]) delete out[id];
  }
  return out;
}

/* ============================================================
   판매가
   ============================================================
   재료가 많고 복잡할수록 비싸진다. 숫자만 고치면 경제가 바뀐다. */
const SALE_CONFIG = {
  tier1: 150,          /* 1단 기본 */
  tier2Add: 120,       /* 2단이면 더 받는 값 */
  cream: 60,           /* 크림 한 겹 */
  topping: 50,         /* 일반 토핑 한 종류 */
  special: 80,         /* 스페셜 토핑 한 종류 */
  perExtraCount: 20,   /* 같은 토핑을 하나 더 올릴 때마다 */
  deco: 50,            /* 장식 (데코) */
};

/* 재료값만 — 손님 타입은 안 본다 */
function calculateCakeSalePrice(order) {
  let p = SALE_CONFIG.tier1 + (order.tiers === 2 ? SALE_CONFIG.tier2Add : 0);
  p += SALE_CONFIG.cream;                        /* 아래층 크림 */
  if (order.tiers === 2) p += SALE_CONFIG.cream; /* 위층 크림 */
  for (const t of order.toppings || []) {
    const meta = toppingOf(t.type);
    p += (meta && meta.cat === "special") ? SALE_CONFIG.special : SALE_CONFIG.topping;
    p += Math.max(0, t.count - 1) * SALE_CONFIG.perExtraCount;
  }
  if (order.decoration) {
    const d = toppingOf(order.decoration);
    p += (d && d.cat === "special") ? SALE_CONFIG.special : SALE_CONFIG.deco;
  }
  return p;
}

/* 손님이 부르는 값 — VIP 는 비싸고 느긋한 손님은 싸다 */
function calculateOrderPrice(order) {
  const c = customerOf(order.customerType);
  return Math.round(calculateCakeSalePrice(order) * c.pay / 10) * 10;
}

/* 주문을 보여 줄 때는 정가를 숨기고 범위만 알려 준다 */
function priceRange(order) {
  const p = order.basePrice || calculateOrderPrice(order);
  return { lo: Math.floor(p * 0.9 / 50) * 50, hi: Math.ceil(p * 1.1 / 50) * 50 };
}

/* ============================================================
   정확도 — 조건을 하나씩 따로 본다
   ============================================================
   주문에 위치가 있으면 위치도 한 조건이다.
   안 시킨 토핑이나 장식을 올린 것도 틀린 것으로 센다. */
function accuracyDetail(order, cake) {
  const rows = [];
  const add = (label, ok, want, got) => rows.push({ label: label, ok: ok, want: want, got: got });
  const two = order.tiers === 2;

  add("단수", order.tiers === cake.tiers, order.tiers + "단", (cake.tiers || 1) + "단");
  add(two ? "아래층 시트" : "시트", order.bottomSheet === cake.bottomSheet,
      labelOf("sheet", order.bottomSheet), cake.bottomSheet ? labelOf("sheet", cake.bottomSheet) : "없음");
  add(two ? "아래층 크림" : "크림", order.bottomCream === cake.bottomCream,
      labelOf("cream", order.bottomCream), cake.bottomCream ? labelOf("cream", cake.bottomCream) : "없음");
  if (two) {
    add("위층 시트", order.topSheet === cake.topSheet,
        labelOf("sheet", order.topSheet), cake.topSheet ? labelOf("sheet", cake.topSheet) : "없음");
    add("위층 크림", order.topCream === cake.topCream,
        labelOf("cream", order.topCream), cake.topCream ? labelOf("cream", cake.topCream) : "없음");
  }

  const mine = {};
  for (const t of cake.toppings || []) mine[t.type] = t;
  for (const t of order.toppings || []) {
    const got = mine[t.type];
    add(labelOf("topping", t.type), !!got && got.count === t.count,
        "×" + t.count, got ? "×" + got.count : "없음");
    if (t.position) {
      add(labelOf("topping", t.type) + " 위치", !!got && got.position === t.position,
          labelOf("pos", t.position), got && got.position ? labelOf("pos", got.position) : "없음");
    }
  }
  for (const t of cake.toppings || []) {
    if (!(order.toppings || []).some(w => w.type === t.type)) {
      add(labelOf("topping", t.type), false, "주문에 없음", "×" + t.count);
    }
  }

  if (order.decoration || cake.decoration) {
    add("장식", order.decoration === cake.decoration,
        order.decoration ? labelOf("topping", order.decoration) : "없음",
        cake.decoration ? labelOf("topping", cake.decoration) : "없음");
  }
  return rows;
}

function calculateAccuracy(order, cake) {
  if (!order || !cake) return 0;
  const rows = accuracyDetail(order, cake);
  const hit = rows.filter(r => r.ok).length;
  return Math.round(hit / rows.length * 100);
}

/* ============================================================
   수익
   ============================================================
   tag 와 cls 는 결과 화면이 그대로 쓴다. 등급 기준이 두 군데로 갈라지지 않게 한곳에 둔다. */
const PAY_TABLE = [
  { min: 100, rate: 1.00, tag: "PERFECT!", cls: "perfect" },
  { min: 90,  rate: 0.90, tag: "GREAT!",   cls: "great" },
  { min: 80,  rate: 0.80, tag: "GOOD",     cls: "good" },
  { min: 60,  rate: 0.60, tag: "SO-SO",    cls: "soso" },
  { min: 40,  rate: 0.30, tag: "MISS",     cls: "miss" },
  { min: 20,  rate: 0.10, tag: "MISS",     cls: "miss" },
  { min: 1,   rate: 0.05, tag: "MISS",     cls: "miss" },
  { min: 0,   rate: 0,    tag: "MISS",     cls: "miss" },
];
function payBand(acc) { return PAY_TABLE.find(b => acc >= b.min) || PAY_TABLE[PAY_TABLE.length - 1]; }
function calculateEarnings(price, acc) { return Math.round(price * payBand(acc).rate); }

/* 정가 × 정확도 보정 뒤에 붙는 것들 — 무엇이 붙었는지 같이 돌려준다 */
function payBonuses(order, acc, opt) {
  const o = opt || {};
  const c = customerOf(order.customerType);
  const list = [];
  if (c.key === "picky") {
    if (acc >= 90) list.push({ label: "까다로운 손님 만족", mul: 1.5 });
    else list.push({ label: "까다로운 손님 실망", mul: 0.7 });
  }
  if (c.tip) list.push({ label: "급한 손님 팁", mul: c.tip });
  if (o.event === "premium") list.push({ label: "프리미엄 데이", mul: 1.2 });
  if (o.tipItem) list.push({ label: "팁 보너스", mul: 1.2 });
  return list;
}
function applyBonuses(base, list) {
  let n = base;
  for (const b of list) n *= b.mul;
  return Math.round(n);
}

/* ============================================================
   인내심과 팁
   ============================================================
   인내심이 0 이 되어도 주문은 실패하지 않는다 — 팁만 사라진다.
   복잡한 주문일수록 기다려 주는 시간이 길다. */
const PATIENCE_CONFIG = {
  base: 8,                /* 기본 허용시간(초) */
  twoTier: 4,             /* 2단이면 더 */
  perExtraTopping: 2,     /* 토핑 한 종류 늘 때마다 */
  positions: 2,           /* 자리까지 맞춰야 하는 주문 */
  decoration: 1,          /* 장식이 있으면 */
  hearts: 5,              /* 게이지 칸 수 */
};
function calculatePatienceTime(order) {
  const p = PATIENCE_CONFIG;
  let s = p.base;
  if (order.tiers === 2) s += p.twoTier;
  s += Math.max(0, (order.toppings || []).length - 1) * p.perExtraTopping;
  if ((order.toppings || []).some(t => t.position)) s += p.positions;
  if (order.decoration) s += p.decoration;
  return s;
}
function patienceLeft(order, duration) {
  const limit = calculatePatienceTime(order);
  return Math.max(0, Math.min(1, 1 - duration / limit));
}

/* 팁은 속도와 정확도를 함께 본다. 둘 중 하나만 좋아서는 안 나온다. */
const TIP_CONFIG = {
  minAccuracy: 80,
  tiers: [
    { within: 0.5, rate: 0.20, label: "번개처럼 빨랐어요" },
    { within: 0.8, rate: 0.10, label: "빠른 제작" },
    { within: 1.0, rate: 0.05, label: "제시간 제작" },
  ],
};
/* duration 은 초. 돌려주는 rate 는 실제 판매금에 곱한다. */
function calculateTip(order, accuracy, duration) {
  const limit = calculatePatienceTime(order);
  const ratio = limit > 0 ? duration / limit : 2;
  const none = { rate: 0, label: "", ratio: ratio, limit: limit };
  if (accuracy < TIP_CONFIG.minAccuracy) return none;
  for (const t of TIP_CONFIG.tiers) {
    if (ratio <= t.within) return { rate: t.rate, label: t.label, ratio: ratio, limit: limit };
  }
  return none;
}

/* 손님 반응 — 숫자만 보여 주지 않는다. 빠르면 속도를 먼저 말한다. */
function reactionFor(acc, fast) {
  if (acc >= 80 && fast) return "와! 정말 빨라요!";
  if (acc >= 95) return "완전 똑같아요!";
  if (acc >= 80) return "거의 제가 주문한 그대로예요!";
  if (acc >= 60) return "조금 다르긴 하지만 괜찮아요!";
  if (acc >= 40) return "음... 제가 주문한 것과 좀 다른데요?";
  return "이건 다른 케이크 같은데요...";
}

/* ============================================================
   하루 장부
   ============================================================
   매출과 팁은 벌어들인 것, 재료비와 긴급 구매는 이미 나간 것이다.
   순이익은 '보여 주는 값'이다 — 여기서 돈을 또 깎지 않는다. */
function blankDayStats() {
  return { revenue: 0, ingredientCost: 0, emergencyPurchaseCost: 0, tips: 0,
           orders: 0, perfectOrders: 0, accuracyTotal: 0, best: 0 };
}
function calculateDayProfit(s) {
  return s.revenue + s.tips - s.ingredientCost - s.emergencyPurchaseCost;
}
function dayAvgAccuracy(s) {
  return s.orders ? Math.round(s.accuracyTotal / s.orders) : 0;
}

/* ============================================================
   가게 평판
   ============================================================
   하루 평균 일치율로 마감 때 한 번만 움직인다.
   이번 버전에서 평판이 바꾸는 것은 손님 수 하나뿐이다. */
const REP_CONFIG = {
  start: 3.0, min: 1.0, max: 5.0,
  steps: [{ min: 95, d: 0.2 }, { min: 85, d: 0.1 }, { min: 70, d: 0 },
          { min: 50, d: -0.1 }, { min: 0, d: -0.2 }],
  guests: [{ min: 4.7, add: 2 }, { min: 4.0, add: 1 }, { min: 2.5, add: 0 }, { min: 0, add: -1 }],
  maxGuests: 8,
  minGuests: 4,
};
function repDelta(avgAcc) { return (REP_CONFIG.steps.find(s => avgAcc >= s.min) || { d: 0 }).d; }
function updateReputation(rep, avgAcc) {
  const n = (rep || REP_CONFIG.start) + repDelta(avgAcc);
  return Math.round(Math.min(REP_CONFIG.max, Math.max(REP_CONFIG.min, n)) * 10) / 10;
}
function repGuestAdj(rep) {
  return (REP_CONFIG.guests.find(g => (rep || REP_CONFIG.start) >= g.min) || { add: 0 }).add;
}
const repStars = r => "★ " + (r === undefined || r === null ? REP_CONFIG.start : r).toFixed(1);

/* ============================================================
   Day — 손님 수와 난이도
   ============================================================
   손님 수를 늘리는 대신 주문을 복잡하게 만든다.
   rep 을 넘기면 평판만큼 손님이 늘거나 줄어든다. */
function customersOf(day, rep) {
  const base = day <= 1 ? 5 : day <= 3 ? 6 : day === 4 ? 7 : (day % 2 ? 7 : 8);
  if (rep === undefined || rep === null) return base;
  return Math.max(REP_CONFIG.minGuests,
                  Math.min(REP_CONFIG.maxGuests, base + repGuestAdj(rep)));
}

/* 주문을 보여 주는 시간 — 1.5초 밑으로는 안 내려간다 */
const MIN_PREVIEW = 1.5;
function previewSec(day, bonus, customerType, event) {
  const base = day <= 1 ? 3.5 : day <= 3 ? 3 : day <= 6 ? 2.5 : 2;
  let adj = bonus || 0;
  if (customerType) adj += customerOf(customerType).previewAdj;
  if (event === "busy") adj -= 0.5;
  return Math.max(MIN_PREVIEW, Math.round((base + adj) * 10) / 10);
}

/* Day 별로 무엇이 풀리는지 한곳에 모아 둔다 */
function dayRules(day) {
  return {
    twoTierChance: day < 4 ? 0 : day < 5 ? 0.3 : day < 9 ? 0.4 : day < 10 ? 0.6 : 0.7,
    differentSheets: day >= 5,     /* 2단 위아래 시트가 다르다 */
    differentCreams: day >= 6,     /* 2단 위아래 크림이 다르다 */
    maxToppingKinds: day < 2 ? 1 : day < 7 ? 2 : 3,
    maxToppingCount: day < 3 ? 1 : day < 7 ? 2 : 3,
    positions: day >= 8,           /* 토핑 자리까지 기억 */
    decoration: day >= 9,          /* 스페셜 장식 */
    decoChance: day < 9 ? 0 : day < 10 ? 0.4 : 0.6,
  };
}

function generateOrder(day, customerType, eventKey) {
  const r = dayRules(day);
  const c = customerOf(customerType || "normal");
  const ev = eventKey || null;

  let twoChance = r.twoTierChance;
  if (ev === "group") twoChance = Math.min(0.9, twoChance + 0.3);
  if (c.hard) twoChance = Math.min(0.95, twoChance + 0.25);
  if (c.simple) twoChance = twoChance * 0.3;
  const two = _rnd() < twoChance;

  const o = { tiers: two ? 2 : 1, bottomSheet: null, topSheet: null,
              bottomCream: null, topCream: null, toppings: [], decoration: null,
              customerType: c.key, event: ev };

  o.bottomSheet = _pick(SHEETS).key;
  o.bottomCream = _pick(CREAMS).key;
  if (two) {
    o.topSheet = r.differentSheets
      ? _pick(SHEETS.filter(s => s.key !== o.bottomSheet)).key
      : o.bottomSheet;
    o.topCream = r.differentCreams
      ? _pick(CREAMS.filter(cr => cr.key !== o.bottomCream)).key
      : o.bottomCream;
  }

  /* 토핑 — 과일에서 고른다 */
  let kinds = 1 + ((_rnd() * r.maxToppingKinds) | 0);
  if (ev === "mania") kinds = Math.max(kinds, Math.min(2, r.maxToppingKinds));
  if (c.hard) kinds = Math.min(r.maxToppingKinds, kinds + 1);
  if (c.simple) kinds = 1;

  let pool = FRUITS.slice();
  if (ev === "strawberry") {
    /* 딸기가 꼭 하나는 들어간다 */
    const berry = FRUITS.find(t => t.key === "strawberry");
    if (berry) {
      o.toppings.push(makeTopping(berry, r, c));
      pool = pool.filter(t => t.key !== berry.key);
      kinds -= 1;
    }
  }
  for (let i = 0; i < kinds; i++) {
    if (!pool.length) break;
    const t = _pick(pool);
    pool = pool.filter(x => x.key !== t.key);
    o.toppings.push(makeTopping(t, r, c));
  }

  /* 장식 — 한 가지만 */
  if (r.decoration && !c.simple && _rnd() < (c.hard ? r.decoChance + 0.2 : r.decoChance)) {
    o.decoration = _pick(DECOS).key;
  }

  o.basePrice = calculateOrderPrice(o);
  return o;
}

function makeTopping(meta, rules, cust) {
  const cap = Math.min(rules.maxToppingCount, meta.max);
  let count = 1 + ((_rnd() * cap) | 0);
  if (cust && cust.simple) count = 1;
  const t = { type: meta.key, count: count };
  if (rules.positions) t.position = _pick(POSITIONS).key;
  return t;
}

/* 기억할 거리가 몇 개인지 — 난이도 표시에 쓴다 */
function orderLoad(order) {
  let n = 3 + (order.tiers === 2 ? 2 : 0) + (order.toppings || []).length;
  for (const t of order.toppings || []) if (t.position) n += 1;
  if (order.decoration) n += 1;
  return n;
}

/* 실수 방지권 — 완성할 때 틀린 항목을 하나만 조용히 고쳐 준다.
   고칠 게 없으면 null 을 돌려주고, 그러면 아이템을 쓰지 않는다. */
function autoFix(order, cake) {
  if (order.tiers !== cake.tiers) {
    cake.tiers = order.tiers;
    if (cake.tiers === 1) { cake.topSheet = null; cake.topCream = null; }
    return "단수";
  }
  const pairs = [
    ["bottomSheet", order.tiers === 2 ? "아래층 시트" : "시트"],
    ["bottomCream", order.tiers === 2 ? "아래층 크림" : "크림"],
  ];
  if (order.tiers === 2) {
    pairs.push(["topSheet", "위층 시트"]);
    pairs.push(["topCream", "위층 크림"]);
  }
  for (const p of pairs) {
    if (cake[p[0]] !== order[p[0]]) { cake[p[0]] = order[p[0]]; return p[1]; }
  }
  /* 토핑 — 빠진 것 / 개수 / 위치 / 안 시킨 것 가운데 하나만 */
  for (const t of order.toppings || []) {
    const got = (cake.toppings || []).find(x => x.type === t.type);
    if (!got) {
      cake.toppings.push({ type: t.type, count: t.count, position: t.position });
      return labelOf("topping", t.type);
    }
    if (got.count !== t.count) { got.count = t.count; return labelOf("topping", t.type); }
    if (t.position && got.position !== t.position) {
      got.position = t.position;
      return labelOf("topping", t.type) + " 위치";
    }
  }
  for (const t of cake.toppings || []) {
    if (!(order.toppings || []).some(w => w.type === t.type)) {
      cake.toppings = cake.toppings.filter(x => x.type !== t.type);
      return labelOf("topping", t.type);
    }
  }
  if (order.decoration !== cake.decoration) { cake.decoration = order.decoration; return "장식"; }
  return null;
}

/* ============================================================
   상점
   ============================================================
   use 가 "order" 면 제작 중에 눌러 쓰는 것, "passive" 면 때가 되면 저절로 쓰인다. */
const ITEMS = [
  { key: "ext05",  name: "주문 연장권",   price: 400, ico: "연",
    desc: "주문 노출 +0.5초", use: "passive", stack: true },
  { key: "hint",   name: "힌트 카드",     price: 300, ico: "힌",
    desc: "제작 중 재료 하나를 알려 준다", use: "order", stack: true },
  { key: "peek",   name: "주문 다시보기", price: 700, ico: "다",
    desc: "제작 중 주문을 1초 다시 본다", use: "order", stack: true },
  { key: "memo",   name: "기억 메모",     price: 500, ico: "메",
    desc: "다음 주문 내내 재료 한 줄이 남는다", use: "passive", stack: false },
  { key: "fix",    name: "실수 방지권",   price: 600, ico: "방",
    desc: "완성할 때 틀린 항목 하나를 고쳐 준다", use: "passive", stack: true },
  { key: "tip",    name: "팁 보너스",     price: 400, ico: "팁",
    desc: "다음 주문 수익 +20%", use: "passive", stack: true },
  { key: "candy",  name: "두뇌 사탕",     price: 800, ico: "사",
    desc: "다음 세 주문 노출 +1초", use: "passive", stack: false },
  { key: "note",   name: "셰프 노트",     price: 650, ico: "노",
    desc: "2단 주문의 위층 시트를 알려 준다", use: "passive", stack: true },
];
function itemOf(k) { return ITEMS.find(i => i.key === k) || null; }

/* 노출 시간 보너스 — 연장권 보유량 + 두뇌 사탕 */
function previewBonus(items, candyLeft) {
  return (items.ext05 || 0) * 0.5 + (candyLeft > 0 ? 1 : 0);
}

/* ============================================================
   가게 성장 — 지금은 해금 구조만 둔다 (그림은 아직 없다)
   ============================================================ */
const DECORS = [
  { key: "bench",  day: 1,  name: "기본 작업대" },
  { key: "ribbon", day: 5,  name: "리본 장식" },
  { key: "case",   day: 10, name: "쇼케이스" },
  { key: "vase",   day: 15, name: "꽃병" },
  { key: "sign",   day: 20, name: "새 간판" },
];
function newDecors(day, owned) {
  const have = owned || [];
  return DECORS.filter(d => d.day <= day && have.indexOf(d.key) < 0);
}

/* ============================================================
   복권 — 메인 수입이 아니다. 기댓값은 산 값보다 낮게 둔다.
   ============================================================ */
const LOTTERY_PRICE = 500;
const LOTTERY_TABLE = [
  { pay: 0,    w: 30, tag: "꽝" },
  { pay: 250,  w: 24, tag: "0.5배" },
  { pay: 500,  w: 24, tag: "본전" },
  { pay: 750,  w: 12, tag: "1.5배" },
  { pay: 1000, w: 7,  tag: "2배" },
  { pay: 1500, w: 3,  tag: "3배" },
];
function drawLottery() {
  const total = LOTTERY_TABLE.reduce((a, b) => a + b.w, 0);
  let n = _rnd() * total;
  for (const row of LOTTERY_TABLE) {
    n -= row.w;
    if (n <= 0) return row;
  }
  return LOTTERY_TABLE[0];
}
function lotteryEV() {
  const total = LOTTERY_TABLE.reduce((a, b) => a + b.w, 0);
  return LOTTERY_TABLE.reduce((a, b) => a + b.pay * b.w, 0) / total;
}

/* ============================================================
   저장
   ============================================================ */
const SAVE_KEY = "ccojik.decoCake.v1";

function blankSave() {
  return {
    day: 1,             /* currentDay */
    money: START_MONEY,
    items: {},          /* 상점 아이템 — key -> 개수 */
    inventory: startInventory(),   /* 재료 재고 — id -> 개수 */
    shopReputation: REP_CONFIG.start,
    bestDay: 1,         /* highestDay */
    totalSales: 0,      /* totalRevenue */
    bestAvgAcc: 0,      /* bestAccuracy */
    lotteryDay: 0,      /* usedLotteryToday — 복권을 쓴 Day */
    candyLeft: 0,       /* 두뇌 사탕 남은 주문 수 */
    decor: [],          /* unlockedDecorations */
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v.day !== "number") return null;
    const base = blankSave();
    for (const k in base) if (v[k] === undefined) v[k] = base[k];
    if (!v.items || typeof v.items !== "object") v.items = {};
    if (!Array.isArray(v.decor)) v.decor = [];
    /* 재고가 없던 저장은 기본 재료를 받고 시작한다 (0 으로 두면 아무것도 못 만든다) */
    if (!v.inventory || typeof v.inventory !== "object") v.inventory = startInventory();
    else for (const i of INGREDIENTS) {
      if (typeof v.inventory[i.id] !== "number") v.inventory[i.id] = 0;
    }
    if (typeof v.shopReputation !== "number") v.shopReputation = REP_CONFIG.start;
    return v;
  } catch (_) {
    return null;
  }
}

function writeSave(v) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); return true; }
  catch (_) { return false; }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
}

const won = n => (n | 0).toLocaleString("ko-KR") + "원";
