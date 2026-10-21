/* ============================================================
   몽타주 파츠
   ============================================================
   얼굴 / 기본머리 / 앞머리는 그림 에셋(PNG)을 쓰고,
   눈·눈썹·코·입·안경·특징처럼 작은 것만 코드로 그린다.

   좌표계 — 에셋이 전부 1254x1254 판에 가로 가운데(627)로 그려져 있다.
   코드로 그리는 파츠도 같은 판 위에 적는다. 그래서 변환이 한 겹뿐이다.

   아래 숫자는 에셋을 실제로 열어 재고, 합성 결과를 눈으로 맞춘 값이다.
     얼굴 꼭대기/반폭   알파 실루엣에서 잼
     눈썹 618 / 눈 673 / 코 782 / 입 873   합성본을 보며 맞춤
     앞머리 배율 0.727 / 내림 109          합성본을 보며 맞춤

   금지: 외부 라이브러리, 이모지
   ============================================================ */
(() => {
"use strict";

const A = "assets/opt/";

/* 기준 얼굴 — 계란형을 기준으로 잡았다 */
const REF = {
  cx: 627,
  top: 182, chin: 1005,
  browY: 618, eyeY: 673, noseY: 782, mouthY: 873,
  eyeDx: 105, halfW: 406,
  /* 에셋 판 크기 */
  canvas: 1254,
};

/* 보이는 칸 — 가장 넓은 머리(곱슬 x100~1160)와 가장 긴 머리(웨이브 y1098),
   가장 긴 목(길쭉 y1158)이 다 들어오게 잘랐다 */
const VIEW = "88 44 1078 1148";

/* ------------------------------------------------------------
   얼굴 — 그림 에셋
     top    그림에서 머리꼭대기가 있는 줄 (머리를 얹는 기준)
     halfW  가장 넓은 곳의 반폭 (작은 파츠 가로 보정에 쓴다)
     dx/dy/scale  미세 보정 자리. 지금은 전부 기본값이면 맞는다.
   ------------------------------------------------------------ */
const FACES = [
  { n: "둥근", key: "round", src: A + "face-round.png",
    top: 164, halfW: 442, dx: 0, dy: 0, scale: 1 },
  { n: "계란", key: "oval", src: A + "face-oval.png",
    top: 182, halfW: 406, dx: 0, dy: 0, scale: 1 },
  { n: "길쭉", key: "long", src: A + "face-long.png",
    top: 130, halfW: 388, dx: 0, dy: 0, scale: 1 },
  { n: "각진", key: "square", src: A + "face-square.png",
    top: 164, halfW: 436, dx: 0, dy: 0, scale: 1 },
];

/* ------------------------------------------------------------
   기본 머리 — 그림 에셋. 하나가 정수리·옆·뒤·길이를 다 맡는다.
     top  그림에서 머리 꼭대기가 있는 줄.
          얼굴 꼭대기보다 14px 위에 오도록 얹는다 (app.js 가 계산).
   ------------------------------------------------------------ */
const HAIR_BASE = [
  { n: "없음", src: null },
  { n: "숏컷", key: "short", src: A + "hair-base-short.png",
    top: 174, dx: 0, dy: 0, scale: 1 },
  { n: "단발", key: "bob", src: A + "hair-base-bob.png",
    top: 140, dx: 0, dy: 0, scale: 1 },
  { n: "웨이브", key: "wave", src: A + "hair-base-wave.png",
    top: 114, dx: 0, dy: 0, scale: 1 },
  { n: "곱슬", key: "curly", src: A + "hair-base-curly.png",
    top: 190, dx: 0, dy: 0, scale: 1 },
];

/* ------------------------------------------------------------
   앞머리 — 그림 에셋. 머리라인에서 내려와 눈썹 위에서 끝난다.
   에셋이 얼굴보다 크게 그려져 있어 0.727 배로 줄이고 109 내린다
   (그 값이어야 앞머리 끝이 눈 바로 위에 온다 — 합성본으로 맞춤).
   ------------------------------------------------------------ */
const BANGS = [
  { n: "없음", src: null },
  { n: "일자", key: "straight", src: A + "bangs-straight.png",
    scale: 0.727, dy: 109, dx: 0 },
  { n: "시스루", key: "seeThrough", src: A + "bangs-see-through.png",
    scale: 0.727, dy: 109, dx: 0 },
];

/* ============================================================
   코드로 그리는 작은 파츠
   ============================================================
   선을 얇게(5.5 ≈ 화면에서 2px) 두고 검정 대신 차콜브라운을 쓴다.
   예전에는 선이 얼굴폭의 2.1% 라 굵은 막대처럼 보였다 — 지금은 0.7% 다.
   좌우를 완전히 똑같이 두지 않아 기계적으로 안 보이게 한다.
   ============================================================ */
const INK = "#3D322E";
const LW = 5.5;
const S = 'fill="none" stroke="' + INK + '" stroke-width="' + LW +
          '" stroke-linecap="round" stroke-linejoin="round"';
const EX = REF.eyeDx;

/* 눈썹 — y618. 굵은 막대가 아니라 얇은 결 */
function brow(d) { return '<g ' + S + '>' + d + '</g>'; }
const BROWS = [
  { n: "기본", s: brow(
    '<path d="M522 622 Q572 600 622 616"/><path d="M732 616 Q682 598 632 620"/>') },
  { n: "일자", s: brow(
    '<path d="M520 616 L622 612"/><path d="M734 613 L632 610"/>') },
  { n: "둥근", s: brow(
    '<path d="M524 626 Q574 594 624 622"/><path d="M730 622 Q680 592 630 626"/>') },
  { n: "올라간", s: brow(
    '<path d="M520 632 Q574 606 624 598"/><path d="M734 630 Q680 604 630 596"/>') },
  { n: "처진", s: brow(
    '<path d="M520 600 Q574 612 624 628"/><path d="M734 602 Q680 614 630 630"/>') },
  { n: "짙은", s: '<g fill="' + INK + '">' +
    '<path d="M520 626 Q574 598 626 616 Q574 610 524 634z"/>' +
    '<path d="M734 622 Q680 596 628 614 Q680 608 730 630z"/></g>' },
  { n: "가는", s: '<g fill="none" stroke="' + INK + '" stroke-width="3.6" ' +
    'stroke-linecap="round"><path d="M530 620 Q576 604 620 616"/>' +
    '<path d="M726 617 Q680 601 634 614"/></g>' },
];

/* 눈 — y673. 흰자·검은자 대비를 너무 세게 두지 않는다 */
function eyes(inner) {
  return '<g>' + inner.replace(/@/g, String(627 - EX)) + '</g>' +
         '<g>' + inner.replace(/@/g, String(627 + EX)) + '</g>';
}
const PUP = '#2E2622';
const EYES = [
  { n: "기본", s: eyes('<ellipse cx="@" cy="673" rx="23" ry="21" fill="' + PUP + '"/>' +
      '<circle cx="@" cy="665" r="6.5" fill="#ffffff" fill-opacity=".85"/>') },
  { n: "큰눈", s: eyes('<ellipse cx="@" cy="673" rx="28" ry="26" fill="' + PUP + '"/>' +
      '<circle cx="@" cy="663" r="8" fill="#ffffff" fill-opacity=".85"/>') },
  { n: "작은눈", s: eyes('<ellipse cx="@" cy="673" rx="17" ry="16" fill="' + PUP + '"/>' +
      '<circle cx="@" cy="667" r="5" fill="#ffffff" fill-opacity=".8"/>') },
  { n: "또렷한", s: eyes(
      '<ellipse cx="@" cy="673" rx="30" ry="22" fill="#FBF7F2"/>' +
      '<ellipse cx="@" cy="673" rx="30" ry="22" fill="none" stroke="' + INK +
      '" stroke-width="4"/>' +
      '<circle cx="@" cy="673" r="13" fill="' + PUP + '"/>' +
      '<circle cx="@" cy="667" r="4.5" fill="#ffffff" fill-opacity=".9"/>') },
  { n: "가는눈", s: '<g ' + S + '><path d="M492 673 Q522 656 552 673"/>' +
      '<path d="M702 673 Q732 656 762 673"/></g>' +
      eyes('<ellipse cx="@" cy="670" rx="11" ry="8" fill="' + PUP + '"/>') },
  { n: "처진눈", s: eyes('<ellipse cx="@" cy="676" rx="23" ry="20" fill="' + PUP + '"/>' +
      '<circle cx="@" cy="669" r="6" fill="#ffffff" fill-opacity=".85"/>') +
      '<g ' + S + '><path d="M494 660 Q522 650 550 658"/>' +
      '<path d="M704 658 Q732 650 760 660"/></g>' },
  { n: "올라간눈", s: eyes('<ellipse cx="@" cy="671" rx="22" ry="20" fill="' + PUP + '"/>' +
      '<circle cx="@" cy="664" r="6" fill="#ffffff" fill-opacity=".85"/>') +
      '<g ' + S + '><path d="M496 658 Q524 646 552 654"/>' +
      '<path d="M702 654 Q730 646 758 658"/></g>' },
  { n: "감은눈", s: '<g ' + S + '><path d="M494 670 Q522 686 550 670"/>' +
      '<path d="M704 670 Q732 686 760 670"/></g>' },
  { n: "졸린눈", s: eyes('<ellipse cx="@" cy="678" rx="21" ry="15" fill="' + PUP + '"/>') +
      '<g ' + S + '><path d="M496 664 L552 662"/><path d="M758 664 L702 662"/></g>' },
];

/* 코 — y782. 예전 'ㄴ자' 코를 없애고 짧은 곡선만 */
const NOSE = [
  { n: "기본", s: '<g ' + S + '><path d="M612 760 Q606 786 627 790"/></g>' },
  { n: "작은", s: '<g ' + S + '><path d="M616 772 Q612 788 627 790"/></g>' },
  { n: "둥근", s: '<g ' + S + '><path d="M608 772 Q606 794 627 792 Q646 792 646 780"/></g>' },
  { n: "뾰족", s: '<g ' + S + '><path d="M618 756 L608 790 L630 788"/></g>' },
  { n: "콧볼", s: '<g ' + S + '><path d="M610 770 Q604 790 627 790 Q648 790 644 772"/></g>' },
  { n: "점두개", s: '<g fill="' + INK + '" fill-opacity=".62">' +
      '<ellipse cx="612" cy="786" rx="6" ry="4.5"/>' +
      '<ellipse cx="644" cy="785" rx="6" ry="4.5"/></g>' },
];

/* 입 — y873. 완벽한 반원 금지, 살짝 비대칭 */
const MOUTH = [
  { n: "기본", s: '<g ' + S + '><path d="M588 868 Q628 892 668 866"/></g>' },
  { n: "옅은미소", s: '<g ' + S + '><path d="M594 870 Q628 882 664 868"/></g>' },
  { n: "일자", s: '<g ' + S + '><path d="M592 872 L664 870"/></g>' },
  { n: "뾰로통", s: '<g ' + S + '><path d="M596 878 Q628 862 662 876"/></g>' },
  { n: "벌린입", s: '<path d="M594 866 Q628 864 664 864 Q652 898 626 898 Q600 896 594 866z" ' +
      'fill="#8C5B52" fill-opacity=".9"/><g ' + S + '>' +
      '<path d="M594 866 Q628 864 664 864"/></g>' },
  { n: "웃는입", s: '<path d="M586 864 Q628 866 670 862 Q660 906 626 906 Q594 902 586 864z" ' +
      'fill="#8C5B52" fill-opacity=".9"/>' +
      '<path d="M600 884 Q628 896 656 882 Q628 890 600 884z" fill="#F7E6E2" ' +
      'fill-opacity=".8"/><g ' + S + '><path d="M586 864 Q628 866 670 862"/></g>' },
  { n: "삐죽", s: '<g ' + S + '><path d="M594 874 Q616 862 638 874 Q652 880 664 872"/></g>' },
  { n: "작은입", s: '<g ' + S + '><path d="M606 870 Q628 884 652 868"/></g>' },
];

/* 안경 — 두 눈 기준 */
function gl(d, w) {
  return '<g fill="none" stroke="#4A403B" stroke-width="' + (w || 6) +
         '" stroke-linecap="round">' + d + '</g>';
}
const GLASSES = [
  { n: "없음", s: "" },
  { n: "동그란", s: gl('<circle cx="522" cy="673" r="62"/><circle cx="732" cy="673" r="62"/>' +
      '<path d="M584 673 H670"/><path d="M460 660 L410 672"/><path d="M794 660 L844 672"/>') },
  { n: "사각", s: gl('<rect x="454" y="634" width="136" height="80" rx="12"/>' +
      '<rect x="664" y="634" width="136" height="80" rx="12"/>' +
      '<path d="M590 672 H664"/><path d="M454 650 L404 664"/><path d="M800 650 L850 664"/>') },
  { n: "뿔테", s: gl('<rect x="450" y="630" width="142" height="86" rx="16"/>' +
      '<rect x="662" y="630" width="142" height="86" rx="16"/>' +
      '<path d="M592 668 H662"/>', 11) },
  { n: "얇은테", s: gl('<rect x="458" y="640" width="128" height="70" rx="26"/>' +
      '<rect x="668" y="640" width="128" height="70" rx="26"/>' +
      '<path d="M586 674 H668"/><path d="M458 654 L408 666"/><path d="M796 654 L846 666"/>', 3.6) },
  { n: "반달", s: gl('<path d="M456 666 H588 Q576 712 522 712 Q468 712 456 666z"/>' +
      '<path d="M666 666 H798 Q786 712 732 712 Q678 712 666 666z"/>' +
      '<path d="M588 670 H666"/>', 4.6) },
  { n: "선글라스", s: '<g fill="#3A3330" fill-opacity=".82" stroke="#2C2724" ' +
      'stroke-width="6"><rect x="450" y="632" width="140" height="82" rx="20"/>' +
      '<rect x="664" y="632" width="140" height="82" rx="20"/></g>' +
      gl('<path d="M590 666 H664"/>') },
  { n: "뿔테사각", s: gl('<rect x="448" y="628" width="146" height="90" rx="8"/>' +
      '<rect x="660" y="628" width="146" height="90" rx="8"/>' +
      '<path d="M594 666 H660"/>', 9) },
];

/* 얼굴 특징 — 한 칸에서 하나만 고른다 (랜덤으로 붙어도 '없음'으로 뗄 수 있다) */
const DETAIL = [
  { n: "없음", s: "" },
  { n: "볼점", s: '<circle cx="508" cy="806" r="9" fill="#5A4038"/>' },
  { n: "입가점", s: '<circle cx="676" cy="852" r="8" fill="#5A4038"/>' },
  { n: "주근깨", s: '<g fill="#B9765A" fill-opacity=".68">' +
      '<circle cx="498" cy="776" r="6"/><circle cx="528" cy="792" r="5"/>' +
      '<circle cx="470" cy="796" r="5.5"/><circle cx="756" cy="776" r="6"/>' +
      '<circle cx="726" cy="792" r="5"/><circle cx="784" cy="796" r="5.5"/>' +
      '<circle cx="606" cy="806" r="4.5"/><circle cx="650" cy="810" r="4.5"/></g>' },
  { n: "다크서클", s: '<g fill="none" stroke="#9B7A72" stroke-width="7" ' +
      'stroke-linecap="round" stroke-opacity=".6">' +
      '<path d="M494 702 Q522 718 552 702"/><path d="M702 702 Q732 718 762 702"/></g>' },
  { n: "흉터", s: '<g fill="none" stroke="#B5705E" stroke-width="5.5" ' +
      'stroke-linecap="round"><path d="M772 630 L748 700"/>' +
      '<path d="M756 652 L782 660"/><path d="M748 678 L772 686"/></g>' },
  { n: "콧수염", s: '<path d="M572 846 Q600 826 627 842 Q654 826 682 846 ' +
      'Q654 858 627 850 Q600 858 572 846z" fill="#4A3A33"/>' },
  { n: "턱수염", s: '<path d="M546 880 Q560 962 627 972 Q694 962 708 880 ' +
      'Q690 930 627 936 Q564 930 546 880z" fill="#4A3A33" fill-opacity=".92"/>' },
  { n: "보조개", s: '<g fill="none" stroke="' + INK + '" stroke-width="4.4" ' +
      'stroke-linecap="round" stroke-opacity=".55">' +
      '<path d="M556 868 Q552 882 560 892"/>' +
      '<path d="M698 866 Q702 880 694 890"/></g>' },
];

/* 눈색 / 아이라인 — 또렷한 눈에만 어울리지만 어느 눈에도 올릴 수 있다 */
const LENS = [
  { n: "없음", s: "" },
  { n: "갈색", s: '<g fill="#7A4A28" fill-opacity=".8">' +
      '<circle cx="522" cy="673" r="9"/><circle cx="732" cy="673" r="9"/></g>' },
  { n: "회색", s: '<g fill="#8A8C8E" fill-opacity=".8">' +
      '<circle cx="522" cy="673" r="9"/><circle cx="732" cy="673" r="9"/></g>' },
  { n: "푸른", s: '<g fill="#3F6E96" fill-opacity=".8">' +
      '<circle cx="522" cy="673" r="9"/><circle cx="732" cy="673" r="9"/></g>' },
  { n: "초록", s: '<g fill="#4E7A52" fill-opacity=".8">' +
      '<circle cx="522" cy="673" r="9"/><circle cx="732" cy="673" r="9"/></g>' },
];
const LINER = [
  { n: "없음", s: "" },
  { n: "옅게", s: '<g fill="none" stroke="' + INK + '" stroke-width="4.4" ' +
      'stroke-linecap="round"><path d="M496 654 Q522 646 550 652"/>' +
      '<path d="M704 652 Q732 646 758 654"/></g>' },
  { n: "또렷하게", s: '<g fill="none" stroke="#2A2320" stroke-width="7" ' +
      'stroke-linecap="round"><path d="M492 654 Q522 642 554 650 L566 642"/>' +
      '<path d="M762 654 Q732 642 700 650 L688 642"/></g>' },
];

/* ------------------------------------------------------------
   피부색 / 머리색 — 그림을 색칠하는 필터 값
   그림이 한 가지 색으로 칠해져 있어 SVG 필터로 톤을 옮긴다.
     skin  밝기·채도만 건드린다 (살색 결을 유지)
     hair  어두운 그림을 색 쪽으로 끌어올린다
           R' = R*slope + intercept  (셋 다 따로)
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

/* "없음" 이 있는 칸 — 랜덤이 확률로 비워 둘 수 있다 */
const OPTIONAL = ["hairBase", "bangs", "glasses", "detail", "lens", "liner"];
const CHANCE = {
  bangs: 0.7,
  glasses: 0.3,
  detail: 0.35,
  lens: 0.15,
  liner: 0.2,
};
/* 처음 열었을 때 — 랜덤이 아니라 중립 */
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
   전단지에 적을 말 — 고른 파츠에서 뽑는다
   ------------------------------------------------------------ */
const TAGS = {
  FACES: [["둥근 얼굴형"], ["계란형 얼굴"], ["길쭉한 얼굴형"], ["각진 얼굴형"]],
  HAIR_BASE: [[], ["짧은 머리"], ["단발머리"], ["웨이브 머리", "물결진 머리"],
              ["곱슬머리", "뽀글뽀글한 머리"]],
  BANGS: [[], ["일자 앞머리"], ["시스루 앞머리"]],
  BROWS: [["눈썹이 자연스러움"], ["일자 눈썹"], ["둥근 눈썹"], ["올라간 눈썹"],
          ["처진 눈썹"], ["짙은 눈썹"], ["가는 눈썹"]],
  EYES: [["보통 크기 눈"], ["큰 눈"], ["작은 눈"], ["또렷한 눈"], ["가는 눈"],
         ["처진 눈"], ["올라간 눈"], ["눈을 감고 있음"], ["졸린 눈"]],
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
/* 글에 적는 차례 — 사람을 가리는 표가 앞에 온다 */
const TAG_ORDER = ["FACES", "HAIR_BASE", "BANGS", "GLASSES", "DETAIL",
                   "EYES", "BROWS", "NOSE", "MOUTH", "LENS", "LINER"];

window.MONTAGE_PARTS = {
  REF: REF, VIEW: VIEW, ASSET_DIR: A,
  FACES: FACES, HAIR_BASE: HAIR_BASE, BANGS: BANGS,
  BROWS: BROWS, EYES: EYES, NOSE: NOSE, MOUTH: MOUTH,
  GLASSES: GLASSES, DETAIL: DETAIL, LENS: LENS, LINER: LINER,
  SKIN: SKIN, HAIRCOL: HAIRCOL, CATS: CATS,
  OPTIONAL: OPTIONAL, CHANCE: CHANCE, NEUTRAL: NEUTRAL,
  TAGS: TAGS, TAG_ORDER: TAG_ORDER,
  bangsOk: bangsOk,
  INK: INK,
};
})();
