"use strict";
/* =========================================================================
 * 꼬직 · 10초 케이크 데코 — 데이터 (케이크종류 / 주문 / 멘트)
 *
 * [조건(require) 타입 — app.js가 실제 데코와 대조해 O/X 판정]
 *   { type:"icing",   color:"choco", label }                 // 그 색 크림이 윗면을 충분히 덮었나
 *   { type:"topping", topping:"strawberry", count:5,
 *       mode:"exact"|"min", where:"center"|"border"|null, label }  // 개수/위치
 *   { type:"writing", need:true|false, label }               // 글씨 유무
 *   { type:"candle",  count:3, label }                       // 초 개수
 *   토핑키: strawberry blueberry cherry chocochip sprinkle macaron wafer starcandy heart candy
 *   장식키: candle ribbon flag
 * 회차 추가는 각 배열 끝에 넣으면 됩니다.
 * ========================================================================= */

window.CAKE_BASES = [
  { key: "choco", name: "초코시트", sponge: "#6E4A2E" },
  { key: "strawberry", name: "딸기생크림", sponge: "#F3BECC" },
  { key: "vanilla", name: "바닐라", sponge: "#F1E2B8" },
  { key: "greentea", name: "녹차", sponge: "#A9C88C" },
  { key: "black", name: "흑임자", sponge: "#5B5560" },
  { key: "carrot", name: "당근", sponge: "#E0A468" },
];

window.CREAMS = [
  { key: "white", name: "흰생크림", c: "#FFF7F0" },
  { key: "choco", name: "초코", c: "#7A5230" },
  { key: "pink", name: "딸기핑크", c: "#FFB6CE" },
  { key: "mint", name: "민트", c: "#BCEFD6" },
  { key: "yellow", name: "노랑", c: "#FFE39A" },
  { key: "purple", name: "보라", c: "#C9A7E8" },
  { key: "sky", name: "하늘", c: "#AEDCF6" },
];

/* 토핑 — basic:true는 '기본 세트'(항상 노출), 나머지는 '더보기'. 총 12종으로 슬림화.
 * (drawTopping에는 옛 아이콘도 남아있어 회차 추가 시 여기에 한 줄이면 됨) */
window.TOPPINGS = [
  // 핵심(기본 세트)
  { key: "strawberry", label: "딸기", cat: "fruit", basic: true },
  { key: "blueberry", label: "블루베리", cat: "fruit", basic: true },
  { key: "cherry", label: "체리", cat: "fruit", basic: true },
  { key: "chocochip", label: "초코칩", cat: "snack", basic: true },
  { key: "sprinkle", label: "스프링클", cat: "snack", basic: true },
  { key: "heartjelly", label: "하트젤리", cat: "snack", basic: true },
  // 추가(더보기)
  { key: "heart", label: "하트", cat: "deco" },
  { key: "starcandy", label: "별사탕", cat: "snack" },
  { key: "candy", label: "캔디", cat: "snack" },
  { key: "macaron", label: "마카롱", cat: "snack" },
  { key: "candle", label: "초", cat: "deco" },
  { key: "ribbon", label: "리본", cat: "deco" },
];

/* 짤주머니 글씨 색 — 케이크와 대비되게 고르기 */
window.WRITE_COLORS = [
  { name: "흰색", c: "#FFF7F0" }, { name: "노랑", c: "#FFE14D" }, { name: "초코", c: "#5A3A22" },
  { name: "빨강", c: "#E5384E" }, { name: "핑크", c: "#FF6FAE" }, { name: "하늘", c: "#2AAEE6" },
];

/* 조건 타입 (app.js가 실제 데코와 대조):
 *  icing(color) / topping(count,mode:exact|min,where:center|border) / writing(need) / candle(count) / forbid(topping=0개)
 *  한 주문 3~4조건 — 빡세지만 12초 안에 '가능'. 다 지키면 별 5개. 급하면 실수해서 놓치는 난이도. */
window.ORDERS = [
  { customer: "깐깐한 단골", base: "choco", require: [
    { type: "icing", color: "choco", label: "초코 아이싱으로 전체 덮기" },
    { type: "topping", topping: "strawberry", count: 5, mode: "exact", label: "딸기 정확히 5개" },
    { type: "topping", topping: "heart", count: 1, mode: "min", where: "center", label: "가운데에 하트" },
    { type: "writing", need: true, label: "축하 글씨 쓰기" },
  ]},
  { customer: "블로그 리뷰어", base: "vanilla", require: [
    { type: "icing", color: "mint", label: "민트 아이싱으로 덮기" },
    { type: "topping", topping: "blueberry", count: 5, mode: "min", label: "블루베리 5개 이상" },
    { type: "writing", need: false, label: "글씨는 쓰지 말 것" },
  ]},
  { customer: "유치원 선생님", base: "strawberry", require: [
    { type: "icing", color: "pink", label: "딸기핑크 아이싱" },
    { type: "topping", topping: "starcandy", count: 5, mode: "min", label: "별사탕 많이(5개+)" },
    { type: "topping", topping: "heart", count: 1, mode: "min", where: "center", label: "가운데에 하트" },
    { type: "topping", topping: "ribbon", count: 1, mode: "min", label: "리본 장식 하나" },
  ]},
  { customer: "다이어트 중인 손님", base: "greentea", require: [
    { type: "icing", color: "white", label: "흰생크림으로 덮기" },
    { type: "topping", topping: "cherry", count: 2, mode: "exact", label: "체리 딱 2개만" },
    { type: "forbid", topping: "sprinkle", label: "스프링클 금지" },
  ]},
  { customer: "사장님 생신 담당", base: "black", require: [
    { type: "icing", color: "choco", label: "초코 아이싱" },
    { type: "candle", count: 3, label: "초 정확히 3개" },
    { type: "writing", need: true, label: "가운데 축하 글씨" },
  ]},
  { customer: "조카 생일 이모", base: "choco", require: [
    { type: "icing", color: "yellow", label: "노랑 아이싱" },
    { type: "topping", topping: "candy", count: 5, mode: "min", label: "캔디 많이(5개+)" },
    { type: "topping", topping: "heart", count: 1, mode: "min", where: "center", label: "가운데 하트" },
    { type: "writing", need: true, label: "축하 글씨" },
  ]},
  { customer: "미니멀 손님", base: "vanilla", require: [
    { type: "icing", color: "white", label: "흰생크림 전체" },
    { type: "topping", topping: "blueberry", count: 3, mode: "exact", where: "center", label: "가운데에 블루베리 딱 3개" },
    { type: "forbid", topping: "strawberry", label: "딸기 금지" },
  ]},
  { customer: "욕심쟁이 손님", base: "carrot", require: [
    { type: "icing", color: "choco", label: "초코 아이싱 전체" },
    { type: "topping", topping: "strawberry", count: 5, mode: "min", label: "딸기 5개 이상" },
    { type: "topping", topping: "sprinkle", count: 5, mode: "min", where: "border", label: "테두리에 스프링클 많이" },
    { type: "topping", topping: "heart", count: 1, mode: "min", where: "center", label: "가운데 하트" },
  ]},
];

/* 손님 외형 (성격별로 구분) — 얼굴/머리/눈썹/옷을 파라미터화. app.js drawCustomer가 사용.
 *  face: round|square / hair: short|bob|bun|spiky|long|curly|ponytail|bald
 *  회차·손님 추가 시 여기에 look만 넣으면 됨. */
window.CUSTOMER_LOOKS = {
  "깐깐한 단골":       { face: "square", skin: "#F0C79E", hair: "short",    hairColor: "#2B2622", cloth: "#3C5A8A" },
  "블로그 리뷰어":     { face: "round",  skin: "#FADCC0", hair: "bob",      hairColor: "#6B4A2E", cloth: "#E0567E" },
  "유치원 선생님":     { face: "round",  skin: "#FBE0C8", hair: "long",     hairColor: "#8A5A2E", cloth: "#F2B33C" },
  "다이어트 중인 손님":{ face: "round",  skin: "#EAC49A", hair: "ponytail", hairColor: "#3A2E26", cloth: "#3FB57A" },
  "사장님 생신 담당":  { face: "square", skin: "#E7B688", hair: "bald",     hairColor: "#2B2622", cloth: "#5A4A6A" },
  "조카 생일 이모":    { face: "round",  skin: "#FBD7B8", hair: "curly",    hairColor: "#B05A2E", cloth: "#FF7AA8" },
  "미니멀 손님":       { face: "square", skin: "#F3D3B0", hair: "bun",      hairColor: "#4A3A30", cloth: "#7A8894" },
  "욕심쟁이 손님":     { face: "round",  skin: "#F0C79E", hair: "spiky",    hairColor: "#1F2A44", cloth: "#E5453C" },
};

window.STAR_COMMENTS = {
  t0: [ /* 0 ~ 1점 */
    "이건 케이크가 아니라 사건입니다",
    "빵이 다 불쌍합니다",
    "주문서 보긴 하셨어요?",
    "손님이 한 입 먹고 수저를 내려놨습니다",
    "이걸 돈 받고 파시려고요",
    "주문 대비 완성도가 마이너스입니다",
  ],
  t1: [ /* 1.5 ~ 2.5점 */
    "노력상은 드리겠습니다",
    "반은 크림 반은 실수",
    "먹을 수는 있습니다, 겨우",
    "주문의 절반은 어디 갔나요",
    "급하게 만든 티가 팍 납니다",
    "별을 더 주기엔 양심이 찔립니다",
  ],
  t2: [ /* 3 ~ 4점 */
    "생각보단 봐줄 만합니다",
    "12초치곤 인정합니다",
    "핵심은 지키셨네요",
    "합격점은 아슬아슬 넘겼습니다",
    "손님이 고개를 끄덕였습니다",
    "이 정도면 재방문 고민해 보겠습니다",
  ],
  t3: [ /* 4.5 ~ 5점 */
    "혹시 전공자세요",
    "손님이 감동해서 재주문했습니다",
    "12초 만에 주문을 다 지키다니",
    "이건 사진 찍어 자랑할 맛입니다",
    "깐깐한 손님도 말을 잃었습니다",
    "완벽에 가깝습니다, 인정",
  ],
  // 주문 미충족을 콕 집는 잔소리(랜덤으로 뒤에 덧붙임)
  nag: [
    "딸기 개수부터 다시 세어보시죠",
    "테두리가 허전한데요",
    "가운데가 비었잖아요",
    "글씨는 어디 갔습니까",
    "아이싱 색이 주문과 다른데요",
    "초 개수 확인 좀요",
  ],
};

/* 손님 머리 위 말풍선 한마디 (짧고 즉각적, 별점 구간별 · 각 5개 이상) */
window.BUBBLE_LINES = {
  t0: ["퉤", "이걸 돈 받고요?", "사장 나와요", "다신 안 와", "말이 안 나와"],
  t1: ["음…", "할 말을 잃었어요", "노력은 알겠는데", "이게 최선이에요?", "글쎄요"],
  t2: ["뭐 그럭저럭", "먹을 만은 하네", "나쁘진 않아요", "봐줄게요", "오케이"],
  t3: ["오 맛있다", "재주문이요", "이거 물건인데", "합격!", "감동이에요"],
};

/* 등급 도장 문구 (빨간 잉크 도장, 별점 구간별 · 각 5개 이상) */
window.STAMP_TEXTS = {
  t0: ["환불", "판매 금지", "폐기", "반려", "영업정지"],
  t1: ["재교육 요망", "노력상", "반품 대기", "보류", "경고"],
  t2: ["겨우 통과", "봐줌", "간신히", "무난", "통과"],
  t3: ["합격", "재주문", "예술", "베스트", "감동"],
};
