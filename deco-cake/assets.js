"use strict";
/* ============================================================
   에셋 지도와 주문 규칙
   ============================================================
   실제 파일은 assets/ 에 평평하게 들어 있다 (폴더를 나누지 않았다).
   원본은 건드리지 않고, 게임은 알파 여백을 잘라 줄인 assets/opt/ 를 쓴다.
   파일명은 받은 그대로다.
   ============================================================ */

const ASSET_DIR = "assets/opt/";

const SHEET_ASSETS = {
  vanilla:    "cake-sheet-vanilla-pixel.png",
  chocolate:  "cake-sheet-chocolate-pixel.png",
  strawberry: "cake-sheet-strawberry-pixel.png",
};
/* 짤주머니는 '고르는 도구' 그림이다. 케이크에 발리는 크림 층은
   에셋이 없어서 app.js 가 픽셀로 직접 찍는다. */
const PIPING_ASSETS = {
  white:      "piping-bag-cream-basic-pixel.png",
  strawberry: "piping-bag-strawberry-pixel.png",
  chocolate:  "piping-bag-chocolate-pixel.png",
};
const TOPPING_ASSETS = {
  strawberry:    "topping-strawberry-pair-pixel.png",
  cherry:        "topping-cherry-pixel.png",
  blueberry:     "topping-blueberry-pixel.png",
  kiwi:          "topping-kiwi-pixel.png",
  banana:        "topping-banana-pixel.png",
  whippedCream:  "topping-whipped-cream-pixel.png",
  sprinkles:     "topping-sprinkles-rainbow.png",
  chocoCurl:     "topping-choco-curl-pixel.png",
  cookieCrumble: "topping-cookie-crumble-pixel.png",
  macaron:       "topping-macaron-pixel.png",
  heartCandy:    "topping-heart-candy-pixel.png",
  wafer:         "topping-wafer-stick-pixel.png",
};
const ASSET_MAP = { sheet: SHEET_ASSETS, piping: PIPING_ASSETS, topping: TOPPING_ASSETS };

function assetUrl(group, key) { return ASSET_DIR + ASSET_MAP[group][key]; }

/* ============================================================
   재료
   ============================================================ */
const SHEETS = [
  { key: "vanilla",    label: "바닐라" },
  { key: "chocolate",  label: "초코" },
  { key: "strawberry", label: "딸기" },
];
/* c=본색  c2=아랫단 그늘  c3=광 (그라데이션 없이 세 색만) */
const CREAMS = [
  { key: "white",      label: "화이트", c: "#FFFFFF", c2: "#D9BE9B", c3: "#FFFFFF" },
  { key: "strawberry", label: "딸기",   c: "#FF9CC2", c2: "#DC6392", c3: "#FFD6E6" },
  { key: "chocolate",  label: "초코",   c: "#9A6239", c2: "#623A1D", c3: "#C68B55" },
];

/* cat  = 트레이 탭        max = 한 주문에 요구할 수 있는 최대 개수
   w    = 케이크 대비 폭   pat = 여러 개를 놓을 때의 모양             */
const TOPPINGS = [
  { key: "strawberry",    label: "딸기",     cat: "fruit",   max: 3, w: 0.34, pat: "cluster" },
  { key: "cherry",        label: "체리",     cat: "fruit",   max: 3, w: 0.32, pat: "cluster" },
  { key: "blueberry",     label: "블루베리", cat: "fruit",   max: 4, w: 0.24, pat: "cluster" },
  { key: "kiwi",          label: "키위",     cat: "fruit",   max: 3, w: 0.28, pat: "fan" },
  { key: "banana",        label: "바나나",   cat: "fruit",   max: 3, w: 0.32, pat: "stack" },
  { key: "whippedCream",  label: "휘핑크림", cat: "deco",    max: 4, w: 0.22, pat: "cluster" },
  { key: "sprinkles",     label: "스프링클", cat: "deco",    max: 2, w: 0.50, pat: "scatter" },
  { key: "chocoCurl",     label: "초코컬",   cat: "deco",    max: 2, w: 0.34, pat: "cluster" },
  { key: "cookieCrumble", label: "쿠키크럼블", cat: "deco",  max: 2, w: 0.42, pat: "scatter" },
  { key: "macaron",       label: "마카롱",   cat: "special", max: 2, w: 0.30, pat: "cluster" },
  { key: "heartCandy",    label: "하트사탕", cat: "special", max: 3, w: 0.22, pat: "cluster" },
  { key: "wafer",         label: "웨이퍼",   cat: "special", max: 2, w: 0.34, pat: "cross" },
];
const TOP_CATS = [
  { key: "fruit",   label: "과일" },
  { key: "deco",    label: "데코" },
  { key: "special", label: "스페셜" },
];

/* 토핑 탭에는 과일, 장식 탭에는 데코와 스페셜이 올라간다.
   토핑은 개수와 자리가 있고, 장식은 한 가지만 고른다. */
const FRUITS = TOPPINGS.filter(t => t.cat === "fruit");
const DECOS = TOPPINGS.filter(t => t.cat !== "fruit");

const POSITIONS = [
  { key: "center", label: "중앙" },
  { key: "left",   label: "왼쪽" },
  { key: "right",  label: "오른쪽" },
  { key: "edge",   label: "테두리" },
  { key: "top",    label: "상단" },
];

function sheetOf(k) { return SHEETS.find(x => x.key === k) || null; }
function creamOf(k) { return CREAMS.find(x => x.key === k) || null; }
function toppingOf(k) { return TOPPINGS.find(x => x.key === k) || null; }
function posOf(k) { return POSITIONS.find(x => x.key === k) || null; }
function labelOf(kind, key) {
  const t = kind === "sheet" ? sheetOf(key) : kind === "cream" ? creamOf(key)
          : kind === "pos" ? posOf(key) : toppingOf(key);
  return t ? t.label : key;
}

/* ============================================================
   케이크 위 자리 — 전부 '한 층 상자'(가로 1, 세로 1) 기준 비율
   ============================================================ */
/* 시트 윗면은 세로 0.06~0.70 구간이다 (에셋 픽셀을 재서 잡은 값) */
const CREAM_BOX = { left: 0.085, top: 0.070, width: 0.83, height: 0.680 };

const POS_ANCHOR = {
  center: { x: 0.50, y: 0.36 },
  left:   { x: 0.31, y: 0.39 },
  right:  { x: 0.69, y: 0.39 },
  edge:   { x: 0.50, y: 0.36 },
  top:    { x: 0.50, y: 0.22 },
};

/* 같은 주문이면 늘 같은 자리에 놓인다 — 흩뿌린 듯 보이되 고정이다 */
function layoutTopping(key, count, pos) {
  const t = toppingOf(key);
  if (!t) return [];
  const where = pos || "center";
  const out = [];

  if (where === "edge") {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (i / Math.max(1, count)) * Math.PI * 2;
      out.push({ x: 0.50 + Math.cos(a) * 0.30, y: 0.36 + Math.sin(a) * 0.17, w: t.w * 0.8 });
    }
    return out;
  }

  const an = POS_ANCHOR[where];
  const step = t.pat === "stack" ? t.w * 0.42
             : t.pat === "scatter" ? t.w * 0.46
             : t.pat === "cross" ? t.w * 0.55
             : t.w * 0.70;
  const start = -(count - 1) / 2;
  for (let i = 0; i < count; i++) {
    const k = start + i;
    let x = an.x + k * step;
    let y = an.y;
    if (t.pat === "fan") y += Math.abs(k) * 0.040;          /* 부채꼴 */
    else if (t.pat === "stack") y += k * 0.035;             /* 겹쳐 쌓기 */
    else if (t.pat === "cross") y += (i % 2 ? 0.05 : -0.05);/* X 자 */
    else if (count > 2) y += (i % 2 ? 0.05 : 0);            /* 지그재그 */
    out.push({ x: Math.min(0.86, Math.max(0.14, x)), y: y, w: t.w });
  }
  return out;
}
