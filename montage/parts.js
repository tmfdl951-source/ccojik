/* ============================================================
   몽타주 파츠
   ============================================================
   얼굴 / 기본머리 / 앞머리는 그림 에셋(PNG), 눈·눈썹·코·입·안경·특징은
   코드로 그린다.

   좌표를 두 겹으로 나눴다.
     (1) 판 좌표   에셋이 전부 1254x1254 판에 가로 가운데(627)로 그려져
                   있다. 얼굴·머리·앞머리를 여기에 얹는다.
     (2) 지역 좌표 작은 파츠는 '자기 기준점이 원점' 인 좌표로 적는다.
                   눈이면 (0,0) 이 한쪽 눈 가운데, 입이면 입 가운데다.
                   app.js 가 얼굴형별 기준점으로 옮겨 놓는다.

   (2) 가 이번에 바뀐 부분이다. 예전에는 모든 파츠가 '눈은 언제나 y673'
   처럼 판 좌표에 박혀 있어서, 얼굴형을 바꿔도 눈·눈썹·화장이 같은 자리에
   있었다. 특히 아이라인이 눈과 따로 놀았다.

   아래 숫자는 전부 에셋을 열어 재고 합성본을 눈으로 맞춘 값이다.
     얼굴 꼭대기/귀/턱/폭   알파 실루엣에서 잼
     기준점 비율            계란형에서 눈으로 맞춘 뒤 귀 높이로 환산
     머리 내림              얼굴마다 '두피가 안 비치는 가장 낮은 자리' 를
                            픽셀 단위로 찾아 적음 (scratchpad/cover.ps1)

   금지: 외부 라이브러리, 이모지
   ============================================================ */
(() => {
"use strict";

const A = "assets/opt/";
const CANVAS = 1254;
const CX = 627;

/* 보이는 칸 — 가장 넓은 머리(곱슬 x100~1160)와 가장 긴 목(길쭉 y1158)이
   다 들어오게 잘랐다 */
const VIEW = "88 44 1078 1148";

/* ------------------------------------------------------------
   얼굴 — 그림 에셋 + 그 얼굴만의 기준점
     top/chin      머리꼭대기와 턱 (실루엣에서 잼)
     earTop/earBot 귀가 튀어나온 구간. 눈썹선과 코 밑을 잇는 해부학적 기준
     halfW         가장 넓은 곳의 반폭
     a             기준점. 계란형에서 눈으로 맞춘 비율(귀 높이의 0.375 /
                   0.605 / 1.15 / 1.605)을 각 얼굴의 귀에 적용한 값이다.
                   그래서 얼굴형이 바뀌면 눈·눈썹·코·입이 같이 움직인다.
     browGap       눈썹은 눈에서 이만큼 위 (눈에 매달려 움직인다)
   ------------------------------------------------------------ */
function face(n, key, top, chin, earTop, earBot, halfW) {
  const sp = earBot - earTop;
  const brow = Math.round(earTop + 0.375 * sp);
  const eye = Math.round(earTop + 0.605 * sp);
  return {
    n: n, key: key, src: A + "face-" + key + ".png",
    top: top, chin: chin, earTop: earTop, earBot: earBot, halfW: halfW,
    dx: 0, dy: 0, scale: 1,
    a: {
      brow: brow,
      eye: eye,
      nose: Math.round(earTop + 1.150 * sp),
      mouth: Math.round(earTop + 1.605 * sp),
      ear: Math.round((earTop + earBot) / 2),
      cheek: Math.round(earTop + 1.30 * sp),
      /* 눈 사이 반간격 — 얼굴이 넓다고 그만큼 벌어지진 않는다 (0.7 만) */
      eyeDx: Math.round(105 * (1 + (halfW / 406 - 1) * 0.7)),
    },
    browGap: eye - brow,
    /* 머리통 크기 — 머리와 앞머리를 이만큼 키운다. 계란형이 1 이다.
       가로만 보면 긴 얼굴에서 머리가 작아지므로 세로와 반반 섞는다. */
    hairK: Math.round((0.5 * (halfW / 406) + 0.5 * ((chin - top) / 826)) * 1000) / 1000,
  };
}
const FACES = [
  face("둥근", "round", 164, 1030, 564, 754, 442),
  face("계란", "oval", 182, 1008, 552, 752, 406),
  face("길쭉", "long", 130, 1138, 530, 740, 388),
  face("각진", "square", 164, 1020, 544, 764, 436),
];

/* ------------------------------------------------------------
   기본 머리 — 그림 에셋. 하나가 정수리·옆·뒤·길이를 다 맡는다.
   drop 은 얼굴형마다 다르다. 네모(bbox) 꼭대기끼리 맞추면 안 된다 —
   곱슬은 맨 위 픽셀이 듬성듬성한 컬 끝이라, 그걸 맞추면 빽빽한 부분이
   두개골보다 아래로 내려가 정수리가 대머리처럼 비친다 (26~30px 차이).
   그래서 얼굴마다 '두피가 안 비치는 가장 낮은 자리' 를 픽셀로 찾아 적었다.
   ------------------------------------------------------------ */
const HAIR_BASE = [
  { n: "없음", src: null },
  { n: "숏컷", key: "short", src: A + "hair-base-short.png",
    drop: { round: -50, oval: -18, long: -86, square: -68 }, dx: 0, scale: 1 },
  { n: "단발", key: "bob", src: A + "hair-base-bob.png",
    drop: { round: -2, oval: 26, long: -38, square: -8 }, dx: 0, scale: 1 },
  { n: "웨이브", key: "wave", src: A + "hair-base-wave.png",
    drop: { round: 16, oval: 42, long: -22, square: 14 }, dx: 0, scale: 1 },
  { n: "곱슬", key: "curly", src: A + "hair-base-curly.png",
    drop: { round: -92, oval: -58, long: -130, square: -94 }, dx: 0, scale: 1 },
];

/* ------------------------------------------------------------
   앞머리 — 머리라인에서 내려와 눈 바로 위에서 끝난다.
   에셋이 얼굴보다 크게 그려져 있어 0.727 배로 줄이고, 머리통 크기만큼
   같이 키운다.
   내리는 양은 '앞머리 끝' 을 눈에 묶어서 낸다 — 판 좌표로 박아 두면
   얼굴형이 바뀔 때 눈을 덮거나 이마에 붕 뜬다.
     tip  그림에서 가운데 앞머리가 끝나는 줄 (실측)
   ------------------------------------------------------------ */
const BANGS = [
  { n: "없음", src: null },
  { n: "일자", key: "straight", src: A + "bangs-straight.png",
    scale: 0.727, tip: 744, dx: 0 },
  { n: "시스루", key: "seeThrough", src: A + "bangs-see-through.png",
    scale: 0.727, tip: 734, dx: 0 },
];
/* 앞머리 끝이 눈 위로 이만큼 띄워진다 */
const BANGS_EYE_GAP = 2;

/* 머리 x 얼굴형 x 앞머리 — 어색한 짝만 여기에 적어 덮어쓴다.
   키는 "머리:얼굴형:앞머리" 이고, "머리:앞머리" 로 적으면 네 얼굴형에
   다 걸린다. 비어 있으면 위의 계산값이 그대로 쓰인다. */
const BANGS_COMBO_OVERRIDES = {};

/* ============================================================
   코드로 그리는 작은 파츠 — 전부 '지역 좌표' 다
   ============================================================
   원점(0,0)이 그 파츠의 기준점이다.
     brows  두 눈썹을 한 벌로. x 는 얼굴 가운데, y 는 눈썹선
     eyes   한쪽 눈. app.js 가 좌우 두 번 찍는다
     eyeFx  눈에 붙는 것(아이라인·눈색). 좌표가 '눈 반지름의 몇 배' 라
            눈을 바꾸면 같이 커지고 작아진다
     nose / mouth / detail  각자 기준점
   선을 얇게(5.5 ≈ 화면에서 2px) 두고 검정 대신 차콜브라운을 쓴다.
   ============================================================ */
const INK = "#3D322E";
const LW = 5.5;
const S = 'fill="none" stroke="' + INK + '" stroke-width="' + LW +
          '" stroke-linecap="round" stroke-linejoin="round"';
const PUP = "#2E2622";

/* 눈썹 — 눈마다 하나씩. 원점이 '그 눈의 가운데' 다.
   예전에는 두 벌을 한 번에 그려 x 를 판 좌표로 박았는데, 눈썹 가운데가
   눈 중심보다 45~62px 안쪽이었다 (눈 위가 아니라 눈 안쪽 모서리 위).
   눈처럼 한쪽만 그려 두고 좌우로 찍으면 어떤 얼굴에서도 저절로 맞는다.
   그린 방향은 오른쪽 눈 기준이다 — +x 가 바깥(관자놀이) 쪽. */
const BROWS = [
  { n: "기본", s: '<g ' + S + '><path d="M-38 5 Q2 -13 48 2"/></g>' },
  { n: "일자", s: '<g ' + S + '><path d="M-38 -1 Q3 -6 48 -2"/></g>' },
  { n: "둥근", s: '<g ' + S + '><path d="M-36 9 Q4 -17 46 6"/></g>' },
  { n: "올라간", s: '<g ' + S + '><path d="M-38 11 Q2 -5 48 -13"/></g>' },
  { n: "처진", s: '<g ' + S + '><path d="M-38 -12 Q2 -1 48 11"/></g>' },
  { n: "짙은", s: '<g fill="' + INK + '">' +
      '<path d="M-38 6 Q2 -16 48 0 Q4 -8 -34 13z"/></g>' },
  { n: "가는", s: '<g fill="none" stroke="' + INK + '" stroke-width="3.6" ' +
      'stroke-linecap="round"><path d="M-33 3 Q3 -11 44 1"/></g>' },
];

/* 눈 — 한쪽만 그린다. 원점이 그 눈의 가운데.
   예전에는 전부 타원 하나였고 쳐진눈/올라간눈은 그 타원을 3px 올리고
   내린 게 전부라 이름과 실제 모습이 따로 놀았다. 이제 윗꺼풀과 아랫꺼풀
   을 잇는 닫힌 모양으로 그려 눈꼬리를 실제로 내리고 올린다.
   그리는 방향은 오른쪽 눈 — +x 가 바깥(관자놀이) 쪽이다.
     w/h       아이라인·눈색이 따라붙을 크기
     browDy    이 눈일 때 눈썹을 더 내리거나(+) 올린다(-)
     browTilt  이 눈일 때 눈썹을 기울인다 (+ 바깥쪽이 내려감)
   눈썹 보정은 고른 눈썹 모양을 바꾸지 않고 자리만 다듬는다. */
const SHINE = '<circle cx="-4" cy="-9" r="6" fill="#ffffff" fill-opacity=".85"/>';
const EYES = [
  { n: "기본", id: "neutral", w: 24, h: 20, browDy: 0, browTilt: 0,
    desc: "보통 크기 눈",
    s: '<path d="M-24 2 Q-8 -32 15 -14 Q22 -8 24 -2 Q10 24 -11 16 Q-20 11 -24 2z" ' +
       'fill="' + PUP + '"/>' + SHINE },

  { n: "큰눈", id: "big", w: 28, h: 25, browDy: -4, browTilt: 0,
    desc: "크고 동그란 눈",
    s: '<path d="M-28 2 Q-9 -40 17 -17 Q26 -9 28 -1 Q12 30 -13 20 Q-23 14 -28 2z" ' +
       'fill="' + PUP + '"/>' +
       '<circle cx="-5" cy="-11" r="7.4" fill="#ffffff" fill-opacity=".85"/>' },

  { n: "작은눈", id: "small", w: 18, h: 14, browDy: 4, browTilt: 0,
    desc: "작은 눈",
    s: '<path d="M-18 1 Q-6 -23 11 -10 Q16 -6 18 -1 Q7 17 -8 11 Q-15 8 -18 1z" ' +
       'fill="' + PUP + '"/>' +
       '<circle cx="-3" cy="-6" r="4.2" fill="#ffffff" fill-opacity=".8"/>' },

  { n: "또렷한눈", id: "clear", w: 29, h: 23, browDy: -2, browTilt: 0,
    desc: "또렷한 눈",
    s: '<path d="M-29 1 Q-9 -36 16 -16 Q26 -8 29 -1 Q12 28 -13 19 Q-24 13 -29 1z" ' +
       'fill="#FBF7F2" stroke="' + INK + '" stroke-width="3.6" stroke-linejoin="round"/>' +
       '<circle cx="1" cy="-2" r="12" fill="' + PUP + '"/>' +
       '<circle cx="-2" cy="-7" r="4.4" fill="#ffffff" fill-opacity=".9"/>' },

  /* ---- 눈꼬리가 확실히 내려간다. 안쪽 끝보다 바깥 끝이 20px 아래다 ---- */
  { n: "쳐진눈", id: "droopy", w: 25, h: 22, browDy: 4, browTilt: 8,
    desc: "눈꼬리가 처진 순한 눈",
    s: '<path d="M-24 -11 Q-8 -36 12 -8 Q20 2 25 14 Q8 24 -11 8 Q-20 0 -24 -11z" ' +
       'fill="' + PUP + '"/>' +
       '<circle cx="-7" cy="-12" r="5.4" fill="#ffffff" fill-opacity=".85"/>' },

  /* ---- 눈꼬리가 확실히 올라간다 ---- */
  { n: "올라간눈", id: "sharp-up", w: 25, h: 22, browDy: -6, browTilt: -8,
    desc: "눈꼬리가 올라간 또렷한 눈",
    s: '<path d="M-24 10 Q-10 -18 10 -24 Q19 -27 25 -24 Q16 6 -6 16 Q-18 19 -24 10z" ' +
       'fill="' + PUP + '"/>' +
       '<circle cx="-8" cy="-2" r="5.2" fill="#ffffff" fill-opacity=".85"/>' +
       '<path d="M20 -24 L32 -31" fill="none" stroke="' + INK +
       '" stroke-width="3.8" stroke-linecap="round"/>' },

  { n: "날카로운눈", id: "keen", w: 30, h: 14, browDy: -5, browTilt: -6,
    desc: "가늘고 날카로운 눈",
    s: '<path d="M-30 5 Q-10 -20 12 -16 Q24 -14 30 -11 Q14 10 -10 13 Q-24 13 -30 5z" ' +
       'fill="' + PUP + '"/>' +
       '<path d="M25 -12 L35 -17" fill="none" stroke="' + INK +
       '" stroke-width="3.4" stroke-linecap="round"/>' },

  { n: "웃는눈", id: "smiley", w: 26, h: 16, browDy: -3, browTilt: 0,
    desc: "반달처럼 웃는 눈",
    s: '<path d="M-26 8 Q0 -30 26 4 Q0 -12 -26 8z" fill="' + PUP + '"/>' },

  { n: "무쌍눈", id: "mono", w: 24, h: 13, browDy: 3, browTilt: 0,
    desc: "쌍꺼풀 없는 담백한 눈",
    s: '<path d="M-24 1 Q-7 -20 12 -10 Q19 -6 24 -2 Q9 15 -10 10 Q-19 7 -24 1z" ' +
       'fill="' + PUP + '"/>' },

  { n: "감은눈", id: "closed", w: 26, h: 8,
    browDy: 3, browTilt: 0,
    desc: "눈을 감고 있음",
    s: '<path d="M-26 -3 Q0 8 26 -4" fill="none" stroke="' + INK +
       '" stroke-width="5" stroke-linecap="round"/>' },

  { n: "졸린눈", id: "sleepy", w: 23, h: 15, browDy: 5, browTilt: 5,
    desc: "졸려 보이는 눈",
    s: '<path d="M-23 3 Q-7 -14 11 -8 Q18 -5 23 -1 Q8 18 -9 12 Q-18 9 -23 3z" ' +
       'fill="' + PUP + '"/>' +
       '<path d="M-23 -6 Q-5 -17 21 -7" fill="none" stroke="' + INK +
       '" stroke-width="4.4" stroke-linecap="round"/>' },
];

/* 코 / 입 — 자기 기준점이 원점 */
const NOSE = [
  { n: "기본", s: '<g ' + S + '><path d="M-15 -22 Q-21 4 0 8"/></g>' },
  { n: "작은", s: '<g ' + S + '><path d="M-11 -10 Q-15 6 0 8"/></g>' },
  { n: "둥근", s: '<g ' + S + '><path d="M-19 -10 Q-21 12 0 10 Q19 10 19 -2"/></g>' },
  { n: "뾰족", s: '<g ' + S + '><path d="M-9 -26 L-19 8 L3 6"/></g>' },
  { n: "콧볼", s: '<g ' + S + '><path d="M-17 -12 Q-23 8 0 8 Q21 8 17 -10"/></g>' },
  { n: "점두개", s: '<g fill="' + INK + '" fill-opacity=".62">' +
      '<ellipse cx="-15" cy="4" rx="6" ry="4.5"/>' +
      '<ellipse cx="17" cy="3" rx="6" ry="4.5"/></g>' },
];
const MOUTH = [
  { n: "기본", s: '<g ' + S + '><path d="M-39 -5 Q1 19 41 -7"/></g>' },
  { n: "옅은미소", s: '<g ' + S + '><path d="M-33 -3 Q1 9 37 -5"/></g>' },
  { n: "일자", s: '<g ' + S + '><path d="M-35 -1 L37 -3"/></g>' },
  { n: "뾰로통", s: '<g ' + S + '><path d="M-31 5 Q1 -11 35 3"/></g>' },
  { n: "벌린입", s: '<path d="M-33 -7 Q1 -9 37 -9 Q25 25 -1 25 Q-27 23 -33 -7z" ' +
      'fill="#8C5B52" fill-opacity=".9"/><g ' + S + '>' +
      '<path d="M-33 -7 Q1 -9 37 -9"/></g>' },
  { n: "웃는입", s: '<path d="M-41 -9 Q1 -7 43 -11 Q33 33 -1 33 Q-33 29 -41 -9z" ' +
      'fill="#8C5B52" fill-opacity=".9"/>' +
      '<path d="M-27 11 Q1 23 29 9 Q1 17 -27 11z" fill="#F7E6E2" fill-opacity=".8"/>' +
      '<g ' + S + '><path d="M-41 -9 Q1 -7 43 -11"/></g>' },
  { n: "삐죽", s: '<g ' + S + '><path d="M-33 1 Q-11 -11 11 1 Q25 7 37 -1"/></g>' },
  { n: "작은입", s: '<g ' + S + '><path d="M-21 -3 Q1 11 25 -5"/></g>' },
];

/* 안경 — 원점은 두 눈 사이 한가운데. 렌즈 가운데가 ±105 에 그려져 있고,
   얼굴의 실제 눈 간격에 맞춰 app.js 가 가로로 늘린다. */
function gl(d, w) {
  return '<g fill="none" stroke="#4A403B" stroke-width="' + (w || 6) +
         '" stroke-linecap="round">' + d + '</g>';
}
const GLASSES = [
  { n: "없음", s: "" },
  { n: "동그란", s: gl('<circle cx="-105" cy="0" r="62"/><circle cx="105" cy="0" r="62"/>' +
      '<path d="M-43 0 H43"/><path d="M-167 -13 L-217 -1"/><path d="M167 -13 L217 -1"/>') },
  { n: "사각", s: gl('<rect x="-173" y="-39" width="136" height="80" rx="12"/>' +
      '<rect x="37" y="-39" width="136" height="80" rx="12"/>' +
      '<path d="M-37 -1 H37"/><path d="M-173 -23 L-223 -9"/><path d="M173 -23 L223 -9"/>') },
  { n: "뿔테", s: gl('<rect x="-177" y="-43" width="142" height="86" rx="16"/>' +
      '<rect x="35" y="-43" width="142" height="86" rx="16"/>' +
      '<path d="M-35 -5 H35"/>', 11) },
  { n: "얇은테", s: gl('<rect x="-169" y="-33" width="128" height="70" rx="26"/>' +
      '<rect x="41" y="-33" width="128" height="70" rx="26"/>' +
      '<path d="M-41 1 H41"/><path d="M-169 -19 L-219 -7"/><path d="M169 -19 L219 -7"/>', 3.6) },
  { n: "반달", s: gl('<path d="M-171 -7 H-39 Q-51 39 -105 39 Q-159 39 -171 -7z"/>' +
      '<path d="M39 -7 H171 Q159 39 105 39 Q51 39 39 -7z"/>' +
      '<path d="M-39 -3 H39"/>', 4.6) },
  { n: "선글라스", s: '<g fill="#3A3330" fill-opacity=".82" stroke="#2C2724" ' +
      'stroke-width="6"><rect x="-177" y="-41" width="140" height="82" rx="20"/>' +
      '<rect x="37" y="-41" width="140" height="82" rx="20"/></g>' +
      gl('<path d="M-37 -7 H37"/>') },
  { n: "뿔테사각", s: gl('<rect x="-179" y="-45" width="146" height="90" rx="8"/>' +
      '<rect x="33" y="-45" width="146" height="90" rx="8"/>' +
      '<path d="M-33 -7 H33"/>', 9) },
];

/* ------------------------------------------------------------
   눈에 붙는 것 — 원점이 '그 눈의 가운데' 이고, 좌표 단위가 '눈 반지름' 이다.
   그래서 눈을 큰눈/가는눈으로 바꾸면 아이라인도 같이 커지고 눕는다.
   예전에는 판 좌표(x522, y654)에 박혀 있어 눈과 따로 놀았다.
   ------------------------------------------------------------ */
const LENS = [
  { n: "없음", s: "" },
  { n: "갈색", s: '<circle cx="0" cy="0" r=".42" fill="#7A4A28" fill-opacity=".8"/>' },
  { n: "회색", s: '<circle cx="0" cy="0" r=".42" fill="#8A8C8E" fill-opacity=".8"/>' },
  { n: "푸른", s: '<circle cx="0" cy="0" r=".42" fill="#3F6E96" fill-opacity=".8"/>' },
  { n: "초록", s: '<circle cx="0" cy="0" r=".42" fill="#4E7A52" fill-opacity=".8"/>' },
];
const LINER = [
  { n: "없음", s: "" },
  { n: "옅게", s: '<path d="M-1.12 -0.62 Q0 -1.1 1.1 -0.66" fill="none" stroke="' + INK +
      '" stroke-width=".17" stroke-linecap="round"/>' },
  { n: "또렷하게", s: '<path d="M-1.18 -0.6 Q0 -1.22 1.14 -0.74 L1.46 -1.02" fill="none" ' +
      'stroke="#2A2320" stroke-width=".26" stroke-linecap="round"/>' },
];

/* ------------------------------------------------------------
   얼굴 특징 — 저마다 기준점이 다르다 (anchor 로 적는다)
     eye    눈 (좌우 둘 다, 좌표 단위는 눈 반지름)
     cheek  볼 / mouth 입 / brow 눈썹  (좌표 단위는 판 좌표 px)
   ------------------------------------------------------------ */
const DETAIL = [
  { n: "없음", s: "" },
  { n: "볼점", anchor: "cheek", s: '<circle cx="-119" cy="0" r="9" fill="#5A4038"/>' },
  { n: "입가점", anchor: "mouth", s: '<circle cx="49" cy="-21" r="8" fill="#5A4038"/>' },
  { n: "주근깨", anchor: "cheek", s: '<g fill="#B9765A" fill-opacity=".68">' +
      '<circle cx="-129" cy="-30" r="6"/><circle cx="-99" cy="-14" r="5"/>' +
      '<circle cx="-157" cy="-10" r="5.5"/><circle cx="129" cy="-30" r="6"/>' +
      '<circle cx="99" cy="-14" r="5"/><circle cx="157" cy="-10" r="5.5"/>' +
      '<circle cx="-21" cy="0" r="4.5"/><circle cx="23" cy="4" r="4.5"/></g>' },
  { n: "다크서클", anchor: "eye", s: '<path d="M-1.2 1.35 Q0 2.15 1.2 1.35" fill="none" ' +
      'stroke="#9B7A72" stroke-width=".26" stroke-linecap="round" stroke-opacity=".6"/>' },
  { n: "흉터", anchor: "brow", s: '<g fill="none" stroke="#B5705E" stroke-width="5.5" ' +
      'stroke-linecap="round"><path d="M145 12 L121 82"/>' +
      '<path d="M129 34 L155 42"/><path d="M121 60 L145 68"/></g>' },
  { n: "콧수염", anchor: "mouth", s: '<path d="M-55 -27 Q-27 -47 0 -31 ' +
      'Q27 -47 55 -27 Q27 -15 0 -23 Q-27 -15 -55 -27z" fill="#4A3A33"/>' },
  { n: "턱수염", anchor: "mouth", s: '<path d="M-81 7 Q-67 89 0 99 Q67 89 81 7 ' +
      'Q63 57 0 63 Q-63 57 -81 7z" fill="#4A3A33" fill-opacity=".92"/>' },
  { n: "보조개", anchor: "mouth", s: '<g fill="none" stroke="' + INK + '" ' +
      'stroke-width="4.4" stroke-linecap="round" stroke-opacity=".55">' +
      '<path d="M-71 -5 Q-75 9 -67 19"/><path d="M71 -7 Q75 7 67 17"/></g>' },
];

/* ------------------------------------------------------------
   피부색 / 머리색 — 그림을 칠하는 필터 값
     skin  밝기·채도만 건드린다 (살색 결을 유지)
     hair  어두운 그림을 색 쪽으로 끌어올린다
           R' = R*slope + intercept  (밝기만 올리면 검정은 검정 그대로다)
   ------------------------------------------------------------ */
const SKIN = [
  { n: "기본", c: "#F6CDAA", f: null },
  { n: "밝은", c: "#FBE0C6", f: { b: 1.07, s: 0.92 } },
  { n: "보통", c: "#EEBE98", f: { b: 0.95, s: 1.06 } },
  { n: "그을린", c: "#D9A277", f: { b: 0.86, s: 1.14 } },
  { n: "어두운", c: "#B2825D", f: { b: 0.72, s: 1.18 } },
];
const HAIRCOL = [
  { n: "검정", c: "#2B2B2B", m: null },
  { n: "진갈색", c: "#4A3222", m: [[1.5, 0.16], [1.3, 0.10], [1.0, 0.06]] },
  { n: "갈색", c: "#6B4A2C", m: [[1.8, 0.30], [1.5, 0.19], [1.1, 0.10]] },
  { n: "밝은갈색", c: "#8E6436", m: [[2.0, 0.45], [1.8, 0.32], [1.4, 0.18]] },
  { n: "금발", c: "#C9A456", m: [[1.6, 0.66], [1.6, 0.54], [1.4, 0.28]] },
  { n: "회색", c: "#8C8C8C", m: [[1.4, 0.48], [1.4, 0.48], [1.4, 0.48]] },
  { n: "붉은", c: "#8A3A22", m: [[2.0, 0.42], [1.2, 0.14], [1.0, 0.08]] },
];

/* ------------------------------------------------------------
   고르는 칸 — 화면에 보이는 것은 전부 여기서 고르고 뗄 수 있다
   ------------------------------------------------------------ */
const CATS = [
  { key: "face", label: "얼굴형", list: FACES, img: true, skin: true },
  { key: "hairBase", label: "기본머리", list: HAIR_BASE, img: true, hairCol: true },
  { key: "bangs", label: "앞머리", list: BANGS, img: true, hairCol: true },
  { key: "brows", label: "눈썹", list: BROWS },
  { key: "eyes", label: "눈", list: EYES },
  { key: "nose", label: "코", list: NOSE },
  { key: "mouth", label: "입", list: MOUTH },
  { key: "glasses", label: "안경", list: GLASSES },
  { key: "detail", label: "특징", list: DETAIL },
  { key: "lens", label: "눈색", list: LENS },
  { key: "liner", label: "아이라인", list: LINER },
];

const OPTIONAL = ["hairBase", "bangs", "glasses", "detail", "lens", "liner"];
const CHANCE = { bangs: 0.7, glasses: 0.3, detail: 0.35, lens: 0.15, liner: 0.2 };
const NEUTRAL = {
  face: 1, hairBase: 1, bangs: 0,
  brows: 0, eyes: 0, nose: 0, mouth: 0,
  glasses: 0, detail: 0, lens: 0, liner: 0,
  skin: 0, hairCol: 0,
};
/* 앞머리는 받쳐 줄 머리가 있어야 한다 */
function bangsOk(baseName, bangsName) {
  return baseName !== "없음" || bangsName === "없음";
}

/* ------------------------------------------------------------
   전단지에 적을 말
   ------------------------------------------------------------ */
const TAGS = {
  FACES: [["둥근 얼굴형"], ["계란형 얼굴"], ["길쭉한 얼굴형"], ["각진 얼굴형"]],
  HAIR_BASE: [[], ["짧은 머리"], ["단발머리"], ["웨이브 머리", "물결진 머리"],
              ["곱슬머리", "뽀글뽀글한 머리"]],
  BANGS: [[], ["일자 앞머리"], ["시스루 앞머리"]],
  BROWS: [["눈썹이 자연스러움"], ["일자 눈썹"], ["둥근 눈썹"], ["올라간 눈썹"],
          ["처진 눈썹"], ["짙은 눈썹"], ["가는 눈썹"]],
  /* 눈은 목록에 적어 둔 desc 를 그대로 쓴다 — 이름과 글이 어긋날 수 없다 */
  EYES: EYES.map(e => [e.desc]),
  NOSE: [["보통 코"], ["작은 코"], ["둥근 코"], ["뾰족한 코"], ["콧볼이 넓음"],
         ["콧구멍이 보임"]],
  MOUTH: [["보통 입"], ["옅게 웃는 입"], ["일자 입"], ["뾰로통한 입"], ["입을 벌림"],
          ["활짝 웃는 입"], ["삐죽한 입"], ["작은 입"]],
  GLASSES: [[], ["동그란 안경"], ["사각 안경"], ["뿔테 안경"], ["얇은 테 안경"],
            ["반달 안경"], ["선글라스"], ["두꺼운 뿔테"]],
  DETAIL: [[], ["볼에 점"], ["입가에 점"], ["주근깨"], ["다크서클"], ["이마에 흉터"],
           ["콧수염"], ["턱수염"], ["보조개"]],
  LENS: [[], ["갈색 눈동자"], ["회색 눈동자"], ["푸른 눈동자"], ["초록 눈동자"]],
  LINER: [[], ["옅은 아이라인"], ["또렷한 아이라인"]],
};
const TAG_ORDER = ["FACES", "HAIR_BASE", "BANGS", "GLASSES", "DETAIL",
                   "EYES", "BROWS", "NOSE", "MOUTH", "LENS", "LINER"];

window.MONTAGE_PARTS = {
  CANVAS: CANVAS, CX: CX, VIEW: VIEW, ASSET_DIR: A,
  FACES: FACES, HAIR_BASE: HAIR_BASE, BANGS: BANGS,
  BANGS_EYE_GAP: BANGS_EYE_GAP, BANGS_COMBO_OVERRIDES: BANGS_COMBO_OVERRIDES,
  BROWS: BROWS, EYES: EYES, NOSE: NOSE, MOUTH: MOUTH,
  GLASSES: GLASSES, DETAIL: DETAIL, LENS: LENS, LINER: LINER,
  SKIN: SKIN, HAIRCOL: HAIRCOL, CATS: CATS,
  OPTIONAL: OPTIONAL, CHANCE: CHANCE, NEUTRAL: NEUTRAL,
  TAGS: TAGS, TAG_ORDER: TAG_ORDER,
  bangsOk: bangsOk, INK: INK,
  REF: { cx: CX, canvas: CANVAS, halfW: 406 },
};
})();
