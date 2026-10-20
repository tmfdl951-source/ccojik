/* ============================================================
   몽타주 파츠 — 데이터만 모은 곳
   ============================================================
   모든 그림은 '기준 얼굴(REF)' 위에 그려져 있다. 둥근 얼굴 하나를 기준으로
   삼아, 눈은 y=171, 눈썹 151, 코 190, 입 224, 귀 190 에 그려 두었다.
   얼굴형이 바뀌면 그림을 고치는 게 아니라, app.js 의 place() 가 그 얼굴의
   기준점으로 옮겨 얹는다. 그래서 파츠를 더할 때 좌표를 다시 잴 일이 없다.

   파츠를 더하려면: 해당 배열에 { n: "이름", s: "<svg 조각>" } 한 줄.
   기준 얼굴 좌표로 그리면 된다 (가운데 x=150).
   비뚤면 { dx, dy, scale } 로 그 파츠만 미세 보정한다.
   ============================================================ */
(() => {
  "use strict";

/* 기준 얼굴 — 아래 모든 그림이 이 자리를 가정하고 그려져 있다 */
const REF = {
  cx: 150,
  top: 108, chin: 264,          // 이마 위 ~ 턱 끝
  halfW: 70,                    // 가로 반폭
  browY: 151, eyeY: 171, noseY: 190, mouthY: 224,
  earY: 190, cheekY: 201,
  hairlineY: 108,               // 머리카락이 이마와 만나는 선 (= 이마 위)
};

/* 떼어낸 원본 아트 — 좌표는 기준 얼굴(REF) 기준이다. 손대지 않았다. */
const SKIN = ["#F5CBA0", "#E9B085", "#CE8E5E", "#F7DDC2", "#B87A50", "#8A5A38"];
const HAIRCOL = ["#2A2A2A", "#4E3320", "#0E0E0E", "#8A6A3B", "#C0392B", "#6C5CE7", "#E67E22", "#9AA0A6", "#F1C40F", "#EAEAEA"];
function lensSVG(c) { return `<circle cx="121" cy="171" r="5.2" fill="${c}"/><circle cx="121" cy="171" r="2.4" fill="#141414"/><circle cx="179" cy="171" r="5.2" fill="${c}"/><circle cx="179" cy="171" r="2.4" fill="#141414"/>`; }
function cheeks(c, o) { return `<ellipse cx="112" cy="201" rx="13" ry="8" fill="${c}" opacity="${o}"/><ellipse cx="188" cy="201" rx="13" ry="8" fill="${c}" opacity="${o}"/>`; }


const BROWS = [
  { n: "일자", s: `<rect x="106" y="149" width="30" height="5" rx="2.5" fill="#3a2a1a"/><rect x="164" y="149" width="30" height="5" rx="2.5" fill="#3a2a1a"/>` },
  { n: "아치", s: `<path d="M106 153 q15 -12 30 0" stroke="#3a2a1a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M164 153 q15 -12 30 0" stroke="#3a2a1a" stroke-width="5" fill="none" stroke-linecap="round"/>` },
  { n: "짙은", s: `<rect x="103" y="146" width="35" height="9" rx="3.5" fill="#1a1208"/><rect x="162" y="146" width="35" height="9" rx="3.5" fill="#1a1208"/>` },
  { n: "화난", s: `<path d="M106 147 l30 8" stroke="#3a2a1a" stroke-width="6" stroke-linecap="round"/><path d="M194 147 l-30 8" stroke="#3a2a1a" stroke-width="6" stroke-linecap="round"/>` },
  { n: "처진", s: `<path d="M106 148 l30 7" stroke="#3a2a1a" stroke-width="5" stroke-linecap="round" transform="rotate(6 121 151)"/><path d="M164 155 l30 -7" stroke="#3a2a1a" stroke-width="5" stroke-linecap="round" transform="rotate(-6 179 151)"/>` },
  { n: "갈매기", s: `<path d="M106 153 l14 -7 16 7" stroke="#3a2a1a" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M164 153 l16 -7 14 7" stroke="#3a2a1a" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` },
  { n: "세미", s: `<path d="M107 153 q14 -8 28 -2" stroke="#3a2a1a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M165 151 q14 -6 28 2" stroke="#3a2a1a" stroke-width="5" fill="none" stroke-linecap="round"/>` },
  { n: "옅은", s: `<rect x="107" y="150" width="28" height="4" rx="2" fill="#6a5238" opacity=".7"/><rect x="165" y="150" width="28" height="4" rx="2" fill="#6a5238" opacity=".7"/>` },
  { n: "짧은", s: `<rect x="114" y="149" width="18" height="6" rx="3" fill="#2a1c0e"/><rect x="168" y="149" width="18" height="6" rx="3" fill="#2a1c0e"/>` },
];

const EYES = [
  { n: "기본", s: `<circle cx="121" cy="171" r="7" fill="#fff" stroke="#222" stroke-width="2"/><circle cx="121" cy="171" r="3.4" fill="#222"/><circle cx="179" cy="171" r="7" fill="#fff" stroke="#222" stroke-width="2"/><circle cx="179" cy="171" r="3.4" fill="#222"/>` },
  { n: "큰눈", s: `<ellipse cx="121" cy="171" rx="10" ry="11" fill="#fff" stroke="#222" stroke-width="2"/><circle cx="122" cy="172" r="4.6" fill="#222"/><circle cx="120" cy="169" r="1.5" fill="#fff"/><ellipse cx="179" cy="171" rx="10" ry="11" fill="#fff" stroke="#222" stroke-width="2"/><circle cx="180" cy="172" r="4.6" fill="#222"/><circle cx="178" cy="169" r="1.5" fill="#fff"/>` },
  { n: "작은눈", s: `<circle cx="121" cy="171" r="3.6" fill="#222"/><circle cx="179" cy="171" r="3.6" fill="#222"/>` },
  { n: "찢어진", s: `<path d="M110 172 q11 -7 22 0 q-11 6 -22 0z" fill="#fff" stroke="#222" stroke-width="2"/><circle cx="121" cy="171" r="3" fill="#222"/><path d="M168 172 q11 -7 22 0 q-11 6 -22 0z" fill="#fff" stroke="#222" stroke-width="2"/><circle cx="179" cy="171" r="3" fill="#222"/>` },
  { n: "졸린", s: `<path d="M112 171 q9 6 18 0" stroke="#222" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M170 171 q9 6 18 0" stroke="#222" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  { n: "동그란", s: `<circle cx="121" cy="171" r="9" fill="#fff" stroke="#222" stroke-width="2.5"/><circle cx="121" cy="171" r="4.4" fill="#222"/><circle cx="179" cy="171" r="9" fill="#fff" stroke="#222" stroke-width="2.5"/><circle cx="179" cy="171" r="4.4" fill="#222"/>` },
  { n: "쌍꺼풀", s: `<ellipse cx="121" cy="171" rx="9" ry="8" fill="#fff" stroke="#222" stroke-width="2"/><circle cx="121" cy="171" r="4" fill="#222"/><path d="M112 164 q9 -3 18 0" stroke="#8a6a4a" stroke-width="1.5" fill="none"/><ellipse cx="179" cy="171" rx="9" ry="8" fill="#fff" stroke="#222" stroke-width="2"/><circle cx="179" cy="171" r="4" fill="#222"/><path d="M170 164 q9 -3 18 0" stroke="#8a6a4a" stroke-width="1.5" fill="none"/>` },
  { n: "무쌍", s: `<path d="M112 170 h18" stroke="#222" stroke-width="3.5" stroke-linecap="round"/><circle cx="121" cy="171" r="2.6" fill="#222"/><path d="M170 170 h18" stroke="#222" stroke-width="3.5" stroke-linecap="round"/><circle cx="179" cy="171" r="2.6" fill="#222"/>` },
  { n: "윙크", s: `<circle cx="121" cy="171" r="7" fill="#fff" stroke="#222" stroke-width="2"/><circle cx="121" cy="171" r="3.4" fill="#222"/><path d="M170 172 q9 5 18 0" stroke="#222" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  { n: "감은", s: `<path d="M112 170 q9 6 18 0" stroke="#222" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M170 170 q9 6 18 0" stroke="#222" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  { n: "하트눈", s: `<path d="M121 176 c-6 -6 -9 -10 -5 -13 c3 -2 5 0 5 2 c0 -2 2 -4 5 -2 c4 3 1 7 -5 13z" fill="#e0405a"/><path d="M179 176 c-6 -6 -9 -10 -5 -13 c3 -2 5 0 5 2 c0 -2 2 -4 5 -2 c4 3 1 7 -5 13z" fill="#e0405a"/>` },
];

const NOSE = [
  { n: "작은", s: `<path d="M150 182 v14 q-5 3 -8 1" stroke="#b58a63" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  { n: "동그란", s: `<circle cx="150" cy="197" r="6.5" fill="#e6ac7e"/>` },
  { n: "넓은", s: `<path d="M150 183 v11" stroke="#b58a63" stroke-width="3" stroke-linecap="round"/><path d="M139 197 q11 8 22 0" stroke="#b58a63" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  { n: "뾰족", s: `<path d="M150 181 l8 18 h-16 z" fill="#e6ac7e" stroke="#b58a63" stroke-width="1.5" stroke-linejoin="round"/>` },
  { n: "콧대", s: `<path d="M150 178 v18" stroke="#b58a63" stroke-width="3" stroke-linecap="round"/><path d="M144 198 q6 4 12 0" stroke="#b58a63" stroke-width="3" fill="none"/>` },
  { n: "들창코", s: `<path d="M150 184 v9" stroke="#b58a63" stroke-width="3"/><ellipse cx="145" cy="196" rx="2" ry="1.6" fill="#a9805a"/><ellipse cx="155" cy="196" rx="2" ry="1.6" fill="#a9805a"/>` },
  { n: "매부리", s: `<path d="M150 180 q6 8 4 16 q-4 2 -8 -1" stroke="#b58a63" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  { n: "주먹코", s: `<circle cx="150" cy="196" r="9" fill="#e6ac7e"/><ellipse cx="145" cy="199" rx="2" ry="1.4" fill="#a9805a"/><ellipse cx="155" cy="199" rx="2" ry="1.4" fill="#a9805a"/>` },
];

const MOUTH = [
  { n: "미소", s: `<path d="M126 219 q24 22 48 0" stroke="#b03a3a" stroke-width="4" fill="none" stroke-linecap="round"/>` },
  { n: "무표정", s: `<line x1="131" y1="225" x2="169" y2="225" stroke="#b03a3a" stroke-width="4" stroke-linecap="round"/>` },
  { n: "벌림", s: `<ellipse cx="150" cy="227" rx="15" ry="12" fill="#7a2222"/>` },
  { n: "삐죽", s: `<path d="M130 227 q10 -9 20 0 q10 9 20 0" stroke="#b03a3a" stroke-width="4" fill="none" stroke-linecap="round"/>` },
  { n: "이빨", s: `<path d="M127 218 q23 22 46 0z" fill="#7a2222"/><path d="M132 219 h36 v6 h-36z" fill="#fff"/>` },
  { n: "혀", s: `<path d="M126 218 q24 18 48 0 q-6 9 -24 9 q-18 0 -24 -9z" fill="#7a2222"/><path d="M137 226 q13 -5 26 0 q4 21 -13 23 q-17 -2 -13 -23z" fill="#e0666e" stroke="#c04a52" stroke-width="1.4"/><path d="M150 228 v17" stroke="#c04a52" stroke-width="1.2"/>` },
  { n: "앙다문", s: `<path d="M132 224 q18 6 36 0" stroke="#b03a3a" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M132 224 q18 -3 36 0" stroke="#b03a3a" stroke-width="2" fill="none" opacity=".5"/>` },
  { n: "메롱", s: `<path d="M126 218 q24 16 48 0 q-6 8 -24 8 q-18 0 -24 -8z" fill="#7a2222"/><path d="M148 224 q16 -2 24 8 q6 16 -10 20 q-18 2 -20 -12 q-2 -10 6 -16z" fill="#e0666e" stroke="#c04a52" stroke-width="1.4"/>` },
  { n: "하하", s: `<path d="M124 216 q26 30 52 0z" fill="#7a2222"/><path d="M129 217 h42 v6 h-42z" fill="#fff"/>` },
  { n: "립스틱", s: `<path d="M126 220 q24 20 48 0 q-24 8 -48 0z" fill="#d21f4a"/>` },
  { n: "비웃음", s: `<path d="M130 226 q22 -6 40 -14" stroke="#b03a3a" stroke-width="4" fill="none" stroke-linecap="round"/>` },
];

const HAIR = [
  { n: "짧은", long: false, back: () => ``, front: c => `<path d="M78 156 q4 -80 72 -82 q68 2 72 82 q-6 -24 -18 -30 q-18 -22 -54 -22 q-36 0 -54 22 q-12 6 -18 30z" fill="${c}"/>` },
  { n: "반머리", long: false, back: () => ``, front: c => `<path d="M92 142 q10 -38 58 -38 q48 0 58 38 q-28 -22 -58 -22 q-30 0 -58 22z" fill="${c}"/>` },
  { n: "투블럭", long: false, back: () => ``, front: c => `<path d="M90 152 q4 -68 60 -70 q56 2 60 70 q-6 -24 -22 -24 v-8 q-38 -20 -76 0 v8 q-16 0 -22 24z" fill="${c}"/>` },
  { n: "가르마", long: false, back: () => ``, front: c => `<path d="M80 154 q6 -76 70 -78 q64 2 70 78 q-8 -26 -30 -32 q-4 -14 -22 -16 q4 12 2 22 q-16 -16 -34 -12 q-32 6 -56 38z" fill="${c}"/>` },
  { n: "올백", long: false, back: () => ``, front: c => `<path d="M84 150 q8 -58 66 -60 q58 2 66 60 q-6 -30 -30 -32 q-2 10 -8 14 q-26 -22 -56 -8 q-26 12 -32 26z" fill="${c}"/>` },
  { n: "뾰족", long: false, back: () => ``, front: c => `<path d="M82 154 q6 -66 68 -70 q62 4 68 70 l-14 -34 -12 28 -14 -38 -14 38 -14 -28 -12 34 -16 -22z" fill="${c}"/>` },
  { n: "모히칸", long: false, back: () => ``, front: c => `<path d="M138 100 q12 -34 24 0 v54 h-24z" fill="${c}"/><path d="M94 152 q6 -22 56 -24 q50 2 56 24 q-16 -10 -44 -10 v-16 h-24 v16 q-28 0 -44 10z" fill="${c}"/>` },
  { n: "반삭", long: false, back: () => ``, front: c => `<path d="M86 152 q6 -52 64 -54 q58 2 64 54 q-20 -24 -64 -24 q-44 0 -64 24z" fill="${c}" opacity="0.82"/>` },
  { n: "곱슬", long: false, back: () => ``, front: c => `<g fill="${c}"><circle cx="96" cy="128" r="16"/><circle cx="120" cy="112" r="18"/><circle cx="150" cy="107" r="19"/><circle cx="180" cy="112" r="18"/><circle cx="204" cy="128" r="16"/><path d="M84 150 q0 -30 66 -34 q66 4 66 34 z"/></g>` },
  { n: "파마", long: false,
    back: c => `<g fill="${c}"><circle cx="80" cy="172" r="17"/><circle cx="86" cy="198" r="16"/><circle cx="214" cy="198" r="16"/><circle cx="220" cy="172" r="17"/><ellipse cx="150" cy="150" rx="84" ry="76"/></g>`,
    front: c => `<g fill="${c}"><circle cx="88" cy="150" r="18"/><circle cx="82" cy="124" r="18"/><circle cx="98" cy="102" r="20"/><circle cx="124" cy="88" r="21"/><circle cx="150" cy="83" r="22"/><circle cx="176" cy="88" r="21"/><circle cx="202" cy="102" r="20"/><circle cx="218" cy="124" r="18"/><circle cx="212" cy="150" r="18"/><path d="M86 152 q0 -52 64 -56 q64 4 64 56 z"/></g>` },
  { n: "장발", long: true, back: c => `<path d="M72 152 q-4 122 30 130 h96 q34 -8 30 -130 q0 -86 -78 -86 q-78 0 -78 86z" fill="${c}"/>`, front: c => `<path d="M78 156 q6 -80 72 -82 q66 2 72 82 q-6 -26 -20 -32 q-18 -20 -52 -20 q-34 0 -52 20 q-14 6 -20 32z" fill="${c}"/>` },
  { n: "단발", long: true, back: c => `<path d="M76 152 q-4 74 26 100 h96 q30 -26 26 -100 q0 -82 -74 -82 q-74 0 -74 82z" fill="${c}"/>`, front: c => `<path d="M80 154 q6 -76 70 -78 q64 2 70 78 q-22 -38 -70 -38 q-48 0 -70 38z" fill="${c}"/>` },
  { n: "긴생머리", long: true, back: c => `<path d="M72 150 q-6 138 26 140 h104 q32 -2 26 -140 q0 -86 -78 -86 q-78 0 -78 86z" fill="${c}"/>`, front: c => `<path d="M80 154 q6 -78 70 -80 q64 2 70 80 q-8 -14 -20 -16 q-6 -18 -26 -22 q4 12 2 22 q-16 -16 -36 -12 q-26 6 -60 28z" fill="${c}"/>` },
  { n: "웨이브", long: true, back: c => `<g fill="${c}"><path d="M150 66 q-56 0 -78 46 q-16 24 8 40 q-22 20 -6 40 q-20 22 8 42 q-22 18 -6 38 q-8 20 14 28 q24 10 40 -10 q16 14 40 0 q16 20 40 10 q22 -8 14 -28 q14 -20 -6 -38 q28 -20 8 -42 q16 -20 -6 -40 q24 -16 8 -40 q-22 -46 -78 -46z"/><ellipse cx="80" cy="262" rx="20" ry="16"/><ellipse cx="220" cy="262" rx="20" ry="16"/><ellipse cx="94" cy="294" rx="18" ry="14"/><ellipse cx="206" cy="294" rx="18" ry="14"/><ellipse cx="72" cy="196" rx="14" ry="20"/><ellipse cx="228" cy="196" rx="14" ry="20"/></g><g fill="none" stroke="#00000033" stroke-width="3" stroke-linecap="round"><path d="M96 150 q16 22 -2 44 q-16 22 2 44 q14 20 0 38"/><path d="M204 150 q-16 22 2 44 q16 22 -2 44 q-14 20 0 38"/><path d="M84 176 q14 18 0 36"/><path d="M216 176 q-14 18 0 36"/></g>`, front: c => `<path d="M78 156 q6 -80 72 -82 q66 2 72 82 q-24 -40 -72 -40 q-48 0 -72 40z" fill="${c}"/>` },
  { n: "포니", long: true, back: c => `<path d="M196 116 q46 12 34 78 q-6 30 -24 20 q14 -46 -14 -92z" fill="${c}"/>`, front: c => `<path d="M82 152 q6 -70 68 -72 q62 2 68 72 q-22 -38 -68 -38 q-46 0 -68 38z" fill="${c}"/>` },
  { n: "양갈래", long: true, back: c => `<g fill="${c}"><path d="M80 150 q-32 6 -36 50 q-2 22 16 24 q-4 -32 28 -54z"/><path d="M220 150 q32 6 36 50 q2 22 -16 24 q4 -32 -28 -54z"/></g>`, front: c => `<path d="M82 152 q6 -70 68 -72 q62 2 68 72 q-22 -38 -68 -38 q-46 0 -68 38z" fill="${c}"/>` },
];


const LENS = [
  { n: "없음", s: `` }, { n: "갈색", s: lensSVG("#7a4a24") }, { n: "파랑", s: lensSVG("#3a6fd8") }, { n: "초록", s: lensSVG("#3a9a5a") },
  { n: "회색", s: lensSVG("#8a8f98") }, { n: "보라", s: lensSVG("#7d5fff") }, { n: "핑크", s: lensSVG("#e06a9a") },
];

const LINER = [
  { n: "없음", s: `` },
  { n: "기본", s: `<path d="M113 169 Q121 162 130 167" stroke="#161616" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M170 167 Q179 162 187 169" stroke="#161616" stroke-width="2.4" fill="none" stroke-linecap="round"/>` },
  { n: "또렷", s: `<path d="M112 169 Q121 160 131 166" stroke="#0c0c0c" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M169 166 Q179 160 188 169" stroke="#0c0c0c" stroke-width="3.4" fill="none" stroke-linecap="round"/>` },
  { n: "캣아이", s: `<path d="M129 167 Q121 161 113 168 l-6 -5" stroke="#0c0c0c" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M171 168 Q179 161 187 167 l6 -5" stroke="#0c0c0c" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` },
  { n: "언더", s: `<path d="M114 178 Q121 181 128 178" stroke="#333" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".85"/><path d="M172 178 Q179 181 186 178" stroke="#333" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".85"/>` },
];

const BLUSH = [
  { n: "없음", s: `` }, { n: "핑크", s: cheeks("#f2a0a0", "0.55") }, { n: "진분홍", s: cheeks("#e86a8a", "0.5") },
  { n: "주황", s: cheeks("#f4a460", "0.5") },
  { n: "애교", s: `<path d="M110 183 q10 4 20 0" stroke="#e78" stroke-width="2" fill="none" opacity=".6" stroke-linecap="round"/><path d="M170 183 q10 4 20 0" stroke="#e78" stroke-width="2" fill="none" opacity=".6" stroke-linecap="round"/>` },
];

const MOLE = [
  { n: "없음", s: `` }, { n: "입가", s: `<circle cx="176" cy="230" r="3" fill="#5a3a1a"/>` }, { n: "눈밑", s: `<circle cx="126" cy="186" r="2.6" fill="#5a3a1a"/>` },
  { n: "볼", s: `<circle cx="186" cy="210" r="3" fill="#5a3a1a"/>` }, { n: "이마", s: `<circle cx="150" cy="150" r="3" fill="#5a3a1a"/>` },
];

/* ============================================================
   얼굴형 — 여기가 기준(base)이다
   ============================================================
   top/chin/halfW 만 적으면 눈·코·입 자리는 REF 에서 비례로 끌어온다.
   특정 얼굴만 눈을 조금 올리고 싶으면 eyeY 처럼 덮어쓰면 된다. */
function face(n, top, chin, halfW, d, over) {
  const sx = halfW / REF.halfW;
  const sy = (chin - top) / (REF.chin - REF.top);
  const at = ry => top + (ry - REF.top) * sy;
  return Object.assign({
    n: n, top: top, chin: chin, halfW: halfW, cx: REF.cx, d: d,
    sx: sx, sy: sy,
    /* 파츠 크기는 얼굴 폭을 따라가되 끝까지는 안 간다 — 넓은 얼굴에
       눈이 그만큼 커지면 이상하다. 70% 만 따라간다. */
    featScale: 1 + (sx - 1) * 0.7,
    /* 요청한 이름 그대로 — 바깥에서 읽기 쉽게 */
    centerX: REF.cx, topY: top, chinY: chin,
    width: halfW * 2, height: chin - top,
    hairlineY: top,
    leftCheekX: REF.cx - halfW, rightCheekX: REF.cx + halfW,
    browY: at(REF.browY), eyeY: at(REF.eyeY), noseY: at(REF.noseY),
    mouthY: at(REF.mouthY), earY: at(REF.earY), cheekY: at(REF.cheekY),
  }, over || {});
}
const ST = 'stroke="#a9805a" stroke-width="2.5"';
const FACES = [
  face("둥근", 108, 264, 70, s => '<ellipse cx="150" cy="186" rx="70" ry="78" fill="' + s + '" ' + ST + '/>'),
  face("계란", 108, 264, 66, s => '<path d="M150 108 q66 0 66 82 q0 74 -66 74 q-66 0 -66 -74 q0 -82 66 -82z" fill="' + s + '" ' + ST + '/>'),
  face("길쭉", 100, 280, 60, s => '<ellipse cx="150" cy="190" rx="60" ry="90" fill="' + s + '" ' + ST + '/>'),
  face("각진", 114, 258, 66, s => '<rect x="84" y="114" width="132" height="144" rx="30" fill="' + s + '" ' + ST + '/>'),
  face("넓적", 120, 260, 82, s => '<ellipse cx="150" cy="190" rx="82" ry="70" fill="' + s + '" ' + ST + '/>'),
  face("브이", 106, 254, 66, s => '<path d="M84 152 q0 -46 66 -46 q66 0 66 46 q0 58 -32 88 q-14 14 -34 14 q-20 0 -34 -14 q-32 -30 -32 -88z" fill="' + s + '" ' + ST + '/>'),
  face("각턱", 108, 250, 64, s => '<path d="M86 150 q0 -42 64 -42 q64 0 64 42 v66 q0 30 -30 34 h-68 q-30 -4 -30 -34z" fill="' + s + '" ' + ST + '/>'),
  /* 새로 더한 둘 */
  face("통통", 112, 266, 74, s => '<path d="M150 112 q74 0 74 74 q0 50 -30 68 q-20 12 -44 12 q-24 0 -44 -12 q-30 -18 -30 -68 q0 -74 74 -74z" fill="' + s + '" ' + ST + '/>'),
  face("광대", 110, 246, 70, s => '<path d="M150 110 q58 0 66 56 q4 26 -14 44 q-12 34 -52 36 q-40 -2 -52 -36 q-18 -18 -14 -44 q8 -56 66 -56z" fill="' + s + '" ' + ST + '/>'),
];

/* ============================================================
   귀 — 얼굴 폭을 따라 양옆에 붙는다 (목은 얼굴 아래 고정)
   ============================================================ */
const NECK = s => '<path d="M134 244 h32 v34 h-32 z" fill="' + s + '" stroke="#a9805a" stroke-width="2"/>';
const EARS = [
  { n: "기본", s: s => ('<ellipse cx="82" cy="190" rx="11" ry="15" fill="' + s + '" stroke="#a9805a" stroke-width="2.5"/><ellipse cx="218" cy="190" rx="11" ry="15" fill="' + s + '" stroke="#a9805a" stroke-width="2.5"/>') },
  { n: "큰귀", s: s => ('<ellipse cx="80" cy="190" rx="15" ry="20" fill="' + s + '" stroke="#a9805a" stroke-width="2.5"/><ellipse cx="220" cy="190" rx="15" ry="20" fill="' + s + '" stroke="#a9805a" stroke-width="2.5"/>') },
  { n: "작은귀", s: s => ('<ellipse cx="84" cy="190" rx="8" ry="11" fill="' + s + '" stroke="#a9805a" stroke-width="2"/><ellipse cx="216" cy="190" rx="8" ry="11" fill="' + s + '" stroke="#a9805a" stroke-width="2"/>') },
  { n: "칼귀", s: s => ('<path d="M84 176 q-12 6 -8 20 q4 12 14 10z" fill="' + s + '" stroke="#a9805a" stroke-width="2.2"/><path d="M216 176 q12 6 8 20 q-4 12 -14 10z" fill="' + s + '" stroke="#a9805a" stroke-width="2.2"/>') },
  { n: "당나귀", s: s => ('<ellipse cx="78" cy="184" rx="12" ry="24" fill="' + s + '" stroke="#a9805a" stroke-width="2.5"/><ellipse cx="222" cy="184" rx="12" ry="24" fill="' + s + '" stroke="#a9805a" stroke-width="2.5"/>') },
];

/* ============================================================
   머리 — 앞 / 뒤 / 묶음 세 칸으로 쪼갰다
   ============================================================
   예전엔 '스타일 하나 = 앞+뒤 한 벌' 이라 16 가지뿐이었다. 쪼개 놓으면
   앞머리 19 x 뒷머리 10 x 묶음 7 = 1330 가지가 된다. */
const HAIR_FRONT = [{ n: "없음", f: () => "" }].concat(HAIR.map(h => ({ n: h.n, f: h.front })));
/* 포니·양갈래는 머리통 실루엣이 아니라 묶음 조각이다 (HAIR_TIE 에 있다).
   뒷머리로 고르면 머리카락 없이 묶음만 떠 있어서 여기서는 뺀다. */
const TIE_ONLY = ["포니", "양갈래"];
const HAIR_BACK = [{ n: "없음", f: () => "" }].concat(
  HAIR.filter(h => h.back("#000") !== "" && TIE_ONLY.indexOf(h.n) < 0)
      .map(h => ({ n: h.n, f: h.back })));

/* 뒷머리 새로 — 중단발 / 뽀글 / 숏밥 */
HAIR_BACK.push(
  { n: "중단발", f: c => '<path d="M74 152 q-6 96 24 112 h104 q30 -16 24 -112 q0 -84 -76 -84 q-76 0 -76 84z" fill="' + c + '"/>' },
  { n: "뽀글", f: c => '<g fill="' + c + '"><circle cx="78" cy="150" r="26"/><circle cx="222" cy="150" r="26"/><circle cx="90" cy="196" r="24"/><circle cx="210" cy="196" r="24"/><circle cx="110" cy="112" r="28"/><circle cx="190" cy="112" r="28"/><circle cx="150" cy="98" r="30"/><ellipse cx="150" cy="150" rx="86" ry="74"/></g>' },
  { n: "숏밥", f: c => '<path d="M80 154 q-2 54 20 70 h100 q22 -16 20 -70 q0 -80 -70 -80 q-70 0 -70 80z" fill="' + c + '"/>' });

/* 앞머리 새로 — 시스루 / 처피뱅 / 가운데가르마 */
HAIR_FRONT.push(
  { n: "시스루", f: c => '<g fill="' + c + '"><path d="M80 154 q6 -78 70 -80 q64 2 70 80 q-8 -30 -28 -36 q-42 -14 -84 0 q-20 6 -28 36z" opacity=".95"/><g opacity=".55"><path d="M110 132 q-4 26 -6 34"  stroke="' + c + '" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M132 130 q-2 28 -2 38" stroke="' + c + '" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M168 130 q2 28 2 38" stroke="' + c + '" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M190 132 q4 26 6 34" stroke="' + c + '" stroke-width="7" fill="none" stroke-linecap="round"/></g></g>' },
  { n: "처피뱅", f: c => '<path d="M80 154 q6 -78 70 -80 q64 2 70 80 l-12 -22 -10 20 -12 -24 -12 24 -12 -22 -12 22 -12 -24 -10 24z" fill="' + c + '"/>' },
  { n: "가운데", f: c => '<path d="M80 156 q6 -80 70 -82 q64 2 70 82 q-10 -34 -34 -42 l-36 -4 -36 4 q-24 8 -34 42z" fill="' + c + '"/><path d="M146 112 h8 v40 h-8z" fill="' + c + '" opacity=".0"/>' });

/* 옆머리 — 귀 옆으로 흘러내리는 몫. 앞머리와 따로 고른다. */
const HAIR_SIDE = [
  { n: "없음", f: () => "" },
  { n: "귀덮기", f: c => '<g fill="' + c + '"><path d="M78 140 q-8 44 2 66 q10 -30 6 -66z"/><path d="M222 140 q8 44 -2 66 q-10 -30 -6 -66z"/></g>' },
  { n: "볼선", f: c => '<g fill="' + c + '"><path d="M80 136 q-10 60 4 92 q12 -42 6 -92z"/><path d="M220 136 q10 60 -4 92 q-12 -42 -6 -92z"/></g>' },
  { n: "짧은갈래", f: c => '<g fill="' + c + '"><path d="M84 134 q-6 26 0 40 q8 -18 6 -40z"/><path d="M216 134 q6 26 0 40 q-8 -18 -6 -40z"/></g>' },
  { n: "구레나룻", f: c => '<g fill="' + c + '" opacity=".9"><path d="M86 150 q-4 20 2 30 q6 -14 4 -30z"/><path d="M214 150 q4 20 -2 30 q-6 -14 -4 -30z"/></g>' },
  { n: "한쪽넘김", f: c => '<path d="M78 138 q-10 54 6 84 q14 -38 8 -84z" fill="' + c + '"/>' },
  /* 웨이브용 — 귀 옆으로 흘러내리는 컬 덩어리. 얼굴 옆이 매끈하면
     아무리 뒷머리를 물결쳐도 생머리로 읽힌다. */
  { n: "웨이브컬", f: c => '<g fill="' + c + '">' +
    '<path d="M80 140 q-14 26 4 44 q-16 22 2 42 q-12 20 6 34 q16 -34 10 -60 q-6 -30 -2 -60z"/>' +
    '<path d="M220 140 q14 26 -4 44 q16 22 -2 42 q12 20 -6 34 q-16 -34 -10 -60 q6 -30 2 -60z"/>' +
    '<ellipse cx="84" cy="236" rx="15" ry="12"/><ellipse cx="216" cy="236" rx="15" ry="12"/>' +
    '</g>' },
];

/* 묶음 / 장식 */
const HAIR_TIE = [
  { n: "없음", f: () => "" },
  { n: "포니", f: c => '<path d="M196 116 q46 12 34 78 q-6 30 -24 20 q14 -46 -14 -92z" fill="' + c + '"/>' },
  { n: "양갈래", f: c => '<g fill="' + c + '"><path d="M80 150 q-32 6 -36 50 q-2 22 16 24 q-4 -32 28 -54z"/><path d="M220 150 q32 6 36 50 q2 22 -16 24 q4 -32 -28 -54z"/></g>' },
  { n: "번헤어", f: c => '<g fill="' + c + '"><circle cx="150" cy="78" r="26"/><circle cx="132" cy="86" r="14"/><circle cx="168" cy="86" r="14"/></g>' },
  { n: "낮은묶음", f: c => '<g fill="' + c + '"><ellipse cx="150" cy="258" rx="22" ry="16"/><path d="M138 268 q12 34 24 0 q-2 26 -12 30 q-10 -4 -12 -30z"/></g>' },
  { n: "땋은머리", f: c => '<g fill="' + c + '"><path d="M206 150 q22 10 18 40 q-3 24 -14 22 q6 -32 -4 -62z"/><g opacity=".45"><path d="M210 168 h14 M212 184 h14 M212 200 h12" stroke="#000" stroke-width="3"/></g></g>' },
  { n: "리본", f: c => '<g><path d="M150 92 l-24 -12 q-8 12 4 20z" fill="#d73a2f"/><path d="M150 92 l24 -12 q8 12 -4 20z" fill="#d73a2f"/><circle cx="150" cy="95" r="6" fill="#b32c22"/></g><g fill="' + c + '" opacity="0"></g>' },
];

/* ============================================================
   안경 — 따로 뺐다 (예전엔 '기타' 에 섞여 있었다)
   ============================================================ */
const GLASSES = [
  { n: "없음", s: "" },
  { n: "뿔테", s: '<g fill="none" stroke="#222" stroke-width="3"><rect x="102" y="160" width="36" height="24" rx="9"/><rect x="162" y="160" width="36" height="24" rx="9"/><line x1="138" y1="171" x2="162" y2="171"/><line x1="102" y1="166" x2="86" y2="176"/><line x1="198" y1="166" x2="214" y2="176"/></g>' },
  { n: "둥근테", s: '<g fill="none" stroke="#6a5238" stroke-width="2.6"><circle cx="120" cy="172" r="15"/><circle cx="180" cy="172" r="15"/><line x1="135" y1="172" x2="165" y2="172"/><line x1="105" y1="168" x2="86" y2="176"/><line x1="195" y1="168" x2="214" y2="176"/></g>' },
  { n: "무테", s: '<g fill="none" stroke="#9aa6ad" stroke-width="1.8"><rect x="104" y="162" width="32" height="20" rx="4"/><rect x="164" y="162" width="32" height="20" rx="4"/><line x1="136" y1="171" x2="164" y2="171"/></g>' },
  { n: "선글라스", s: '<g stroke="#222" stroke-width="3"><rect x="102" y="160" width="36" height="24" rx="9" fill="#232a33"/><rect x="162" y="160" width="36" height="24" rx="9" fill="#232a33"/><line x1="138" y1="171" x2="162" y2="171"/><line x1="102" y1="166" x2="86" y2="176"/><line x1="198" y1="166" x2="214" y2="176"/></g>' },
  { n: "반달", s: '<g fill="none" stroke="#3a3a3a" stroke-width="2.8"><path d="M104 172 h34 a0 0 0 0 1 0 0 a17 12 0 0 1 -34 0z"/><path d="M162 172 h34 a17 12 0 0 1 -34 0z"/><line x1="138" y1="172" x2="162" y2="172"/></g>' },
];

/* ============================================================
   기타 디테일 — 점·주근깨·흉터·수염 / 모자 / 마스크
   ============================================================ */
const DETAIL = [
  { n: "없음", s: "" },
  { n: "주근깨", s: '<g fill="#a9714a" opacity=".75"><circle cx="118" cy="196" r="1.8"/><circle cx="126" cy="202" r="1.6"/><circle cx="112" cy="204" r="1.5"/><circle cx="182" cy="196" r="1.8"/><circle cx="174" cy="202" r="1.6"/><circle cx="188" cy="204" r="1.5"/></g>' },
  { n: "흉터", s: '<g stroke="#b4705c" stroke-width="2.4" stroke-linecap="round"><path d="M196 150 l-10 22"/><path d="M190 154 l8 4"/><path d="M186 164 l8 4"/></g>' },
  { n: "보조개", s: '<g stroke="#b58a63" stroke-width="2" fill="none" stroke-linecap="round"><path d="M124 222 q-3 6 0 10"/><path d="M176 222 q3 6 0 10"/></g>' },
  { n: "콧수염", s: '<path d="M132 209 q18 9 36 0 q-8 8 -18 6 q-10 2 -18 -6z" fill="#3a2a1a"/>' },
  { n: "턱수염", s: '<path d="M112 212 q38 52 76 0 q-8 40 -38 44 q-30 -4 -38 -44z" fill="#3a2a1a" opacity="0.92"/>' },
  { n: "모자", top: 1, s: '<path d="M84 116 q66 -30 132 0 q0 -46 -66 -46 q-66 0 -66 46z" fill="#2e7df1"/><path d="M84 116 q66 -12 132 0 q-8 8 -16 8 h-100 q-8 0 -16 -8z" fill="#1e63d0"/>' },
  { n: "다크서클", s: '<g fill="#9a7a86" opacity=".4"><ellipse cx="121" cy="182" rx="11" ry="4.5"/><ellipse cx="179" cy="182" rx="11" ry="4.5"/></g>' },
  { n: "잔수염", s: '<g fill="#3a2a1a" opacity=".5"><ellipse cx="150" cy="232" rx="26" ry="10"/><ellipse cx="150" cy="212" rx="20" ry="6"/></g>' },
  { n: "마스크", top: 1, s: '<path d="M118 198 q32 22 64 0 v18 q-32 24 -64 0z" fill="#fff" stroke="#c4ccd8" stroke-width="2"/><path d="M118 200 l-14 -6 M182 200 l14 -6" stroke="#c4ccd8" stroke-width="2"/>' },
];

/* 눈 / 코 / 입 몇 개 더 — 요청한 인상 (처진·올라간·뭉툭·내려간 입꼬리) */
EYES.push(
  { n: "처진눈", s: '<g><ellipse cx="121" cy="172" rx="9" ry="7" fill="#fff" stroke="#222" stroke-width="2" transform="rotate(8 121 172)"/><circle cx="121" cy="172" r="3.8" fill="#222"/><ellipse cx="179" cy="172" rx="9" ry="7" fill="#fff" stroke="#222" stroke-width="2" transform="rotate(-8 179 172)"/><circle cx="179" cy="172" r="3.8" fill="#222"/></g>' },
  { n: "올라간눈", s: '<g><ellipse cx="121" cy="171" rx="9" ry="7" fill="#fff" stroke="#222" stroke-width="2" transform="rotate(-10 121 171)"/><circle cx="121" cy="171" r="3.8" fill="#222"/><ellipse cx="179" cy="171" rx="9" ry="7" fill="#fff" stroke="#222" stroke-width="2" transform="rotate(10 179 171)"/><circle cx="179" cy="171" r="3.8" fill="#222"/></g>' });
NOSE.push(
  { n: "뭉툭", s: '<path d="M150 180 v12" stroke="#b58a63" stroke-width="3" stroke-linecap="round"/><ellipse cx="150" cy="197" rx="10" ry="7" fill="#e6ac7e" stroke="#b58a63" stroke-width="1.4"/>' },
  { n: "긴코", s: '<path d="M150 172 v26" stroke="#b58a63" stroke-width="3" stroke-linecap="round"/><path d="M143 200 q7 5 14 0" stroke="#b58a63" stroke-width="3" fill="none" stroke-linecap="round"/>' });
MOUTH.push(
  { n: "내려간", s: '<path d="M128 222 q22 10 44 0" stroke="#b03a3a" stroke-width="4" fill="none" stroke-linecap="round" transform="rotate(180 150 225)"/>' },
  { n: "두꺼운", s: '<path d="M126 220 q24 16 48 0 q-24 14 -48 0z" fill="#c4525e" stroke="#a03a46" stroke-width="1.6"/>' },
  { n: "얇은", s: '<path d="M132 224 h36" stroke="#b03a3a" stroke-width="2.4" stroke-linecap="round"/>' });
BROWS.push(
  { n: "굵은아치", s: '<path d="M104 155 q17 -16 33 -2" stroke="#1a1208" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M163 153 q16 -14 33 2" stroke="#1a1208" stroke-width="9" fill="none" stroke-linecap="round"/>' });


/* ============================================================
   카테고리 — 화면 아래 탭 순서
   ============================================================ */
const CATS = [
  { key: "face", label: "얼굴형", list: FACES, skin: true },
  { key: "hairBack", label: "뒷머리", list: HAIR_BACK, hairCol: true },
  { key: "hairFront", label: "앞머리", list: HAIR_FRONT, hairCol: true },
  { key: "hairSide", label: "옆머리", list: HAIR_SIDE, hairCol: true },
  { key: "hairTie", label: "묶음", list: HAIR_TIE, hairCol: true },
  { key: "brows", label: "눈썹", list: BROWS },
  { key: "eyes", label: "눈", list: EYES },
  { key: "nose", label: "코", list: NOSE },
  { key: "mouth", label: "입", list: MOUTH },
  { key: "ears", label: "귀", list: EARS, skin: true },
  { key: "glasses", label: "안경", list: GLASSES },
  { key: "detail", label: "특징", list: DETAIL },
  { key: "lens", label: "눈색", list: LENS },
  { key: "liner", label: "아이라인", list: LINER },
  { key: "blush", label: "볼", list: BLUSH },
  { key: "mole", label: "점", list: MOLE },
];




/* 앞머리 맞춤 — drop 은 이마 높이의 몇 배까지 내려오는 꼴인가,
   fit 은 폭이 좁은/보통/넓은 꼴인가. app.js 가 이 둘로 크기를 잡는다. */




/* 앞머리 맞춤 — drop 은 이마 높이의 몇 배까지 내려오는 꼴인가,
   fit 은 폭이 좁은/보통/넓은 꼴인가. app.js 가 이 둘로 크기를 잡는다. */



/* 앞머리 맞춤 — drop 은 이마 높이의 몇 배까지 내려오는 꼴인가,
   fit 은 폭이 좁은/보통/넓은 꼴인가. app.js 가 이 둘로 크기를 잡는다. */

/* ============================================================
   칸 규칙 — 화면 탭 / 랜덤 / 그리기가 다 이 하나만 본다
   ============================================================
   OPTIONAL  "없음" 이 0번에 있어야 하는 칸. 사용자가 언제든 뺄 수 있다.
   CHANCE    랜덤에서 붙을 확률. 안 적힌 칸은 늘 고른다(얼굴·눈·코·입처럼
             없으면 안 되는 것들). 안경·수염까지 매번 붙으면 과하다.
   NEUTRAL   처음 들어왔을 때의 얼굴. 장식이 하나도 안 붙은 상태다. */
const OPTIONAL = ["hairFront", "hairSide", "hairTie", "glasses", "detail",
                  "lens", "liner", "blush", "mole"];
const CHANCE = {
  hairFront: 0.85,       // 앞머리는 대개 있다
  hairSide: 0.35,
  hairTie: 0.2,
  glasses: 0.3,
  detail: 0.35,
  lens: 0.15,
  liner: 0.2,
  blush: 0.25,
  mole: 0.2,
};
const NEUTRAL = {
  face: 0, hairBack: 8, hairFront: 1, hairSide: 0, hairTie: 0,   // 8 = 숏밥 (기본 단발)
  brows: 0, eyes: 0, nose: 0, mouth: 0, ears: 0,
  glasses: 0, detail: 0, lens: 0, liner: 0, blush: 0, mole: 0,
  skin: 0, hairCol: 0,
};

/* ============================================================
   머리 조합 호환성
   ============================================================
   묶음(포니·양갈래·번·땋은머리)은 묶을 머리가 있어야 한다. 뒷머리가
   "없음" 인데 묶음만 있으면 머리카락 없이 끈만 떠 있다.
   짧은 뒷머리(숏밥)는 긴 묶음을 달기 어색하다. */
const HAIR_COMPAT = {
  /* 뒷머리 이름 -> 함께 쓸 수 있는 묶음 이름들 ("*" 는 전부) */
  "없음": ["없음"],
  "숏밥": ["없음", "번헤어"],
  "파마": ["없음", "번헤어", "리본"],
  "뽀글": ["없음", "번헤어", "리본"],
};
/* 적히지 않은 뒷머리는 모든 묶음과 쓸 수 있다 */
function tieOk(backName, tieName) {
  const list = HAIR_COMPAT[backName];
  return !list || list.indexOf(tieName) >= 0;
}

/* ============================================================
   파츠 설명말 — 전단지 "특징" 글을 이걸로 짓는다
   ============================================================
   칸 이름 + 번호 -> 설명말. "없음" 은 빈 배열이라 글에 안 들어간다.
   TAG_ORDER 가 글에 적히는 차례다 — 사람을 가리는 건 얼굴형·앞머리·
   눈·눈썹이라 그 차례로 둔다 (뒷머리를 앞세우면 눈이 밀려난다).
   (scratchpad/mgtags2.js 가 다시 굽는다.) */
const TAGS = {
  FACES: [["둥근 얼굴형"], ["계란 얼굴형"], ["길쭉 얼굴형"], ["각진 얼굴형"], ["넓적 얼굴형"], ["브이 얼굴형"], ["각턱 얼굴형"], ["통통 얼굴형"], ["광대 얼굴형"]],
  HAIR_FRONT: [[], ["짧은 앞머리"], ["반머리 앞머리"], ["투블럭 앞머리"], ["가르마 앞머리"], ["올백 앞머리"], ["뾰족 앞머리"], ["모히칸 앞머리"], ["반삭 앞머리"], ["곱슬 앞머리"], ["파마 앞머리"], ["장발 앞머리"], ["단발 앞머리"], ["긴생머리 앞머리"], ["웨이브 앞머리"], ["포니 앞머리"], ["양갈래 앞머리"], ["시스루 앞머리"], ["처피뱅 앞머리"], ["가운데 앞머리"]],
  HAIR_BACK: [[], ["파마 머리"], ["장발 머리"], ["단발 머리"], ["긴생 머리"], ["웨이브 머리","꼬불꼬불한 머리"], ["중단발 머리"], ["뽀글 머리","곱슬머리"], ["숏밥 머리"]],
  EYES: [["기본 눈"], ["큰 눈"], ["작은 눈"], ["찢어진 눈"], ["졸린 눈"], ["동그란 눈"], ["쌍꺼풀 눈"], ["무쌍 눈"], ["윙크 눈"], ["감은 눈"], ["하트 눈"], ["처진 눈"], ["올라간 눈"]],
  BROWS: [["일자 눈썹"], ["아치 눈썹"], ["짙은 눈썹"], ["화난 눈썹"], ["처진 눈썹"], ["갈매기 눈썹"], ["세미 눈썹"], ["옅은 눈썹"], ["짧은 눈썹"], ["굵은아치 눈썹"]],
  NOSE: [["작은 코"], ["동그란 코"], ["넓은 코"], ["뾰족 코"], ["콧대 코"], ["들창 코"], ["매부리 코"], ["주먹 코"], ["뭉툭 코"], ["긴 코"]],
  MOUTH: [["미소 입"], ["무표정 입"], ["벌림 입"], ["삐죽 입"], ["이빨 입"], ["혀 입"], ["앙다문 입"], ["메롱 입"], ["하하 입"], ["립스틱 입"], ["비웃음 입"], ["내려간 입"], ["두꺼운 입"], ["얇은 입"]],
  HAIR_TIE: [[], ["포니"], ["양갈래"], ["번헤어"], ["낮은묶음"], ["땋은머리"], ["리본"]],
  HAIR_SIDE: [[], ["귀덮기 옆머리"], ["볼선 옆머리"], ["짧은갈래 옆머리"], ["구레나룻 옆머리"], ["한쪽넘김 옆머리"], ["옆으로 흘러내린 컬"]],
  GLASSES: [[], ["뿔테 안경"], ["둥근테 안경"], ["무테 안경"], ["선글라스 안경"], ["반달 안경"]],
  DETAIL: [[], ["주근깨"], ["흉터"], ["보조개"], ["콧수염"], ["턱수염"], ["모자"], ["다크서클"], ["잔수염"], ["마스크"]],
  EARS: [["기본 귀"], ["큰 귀"], ["작은 귀"], ["칼 귀"], ["당나 귀"]],
  MOLE: [[], ["입가 점"], ["눈밑 점"], ["볼 점"], ["이마 점"]],
  BLUSH: [[], ["핑크 볼터치"], ["진분홍 볼터치"], ["주황 볼터치"], ["애교 볼터치"]],
  LENS: [[], ["갈색 렌즈"], ["파랑 렌즈"], ["초록 렌즈"], ["회색 렌즈"], ["보라 렌즈"], ["핑크 렌즈"]],
  LINER: [[], ["기본 아이라인"], ["또렷 아이라인"], ["캣아이 아이라인"], ["언더 아이라인"]],
};
const TAG_ORDER = ["FACES","HAIR_FRONT","HAIR_BACK","EYES","BROWS","NOSE","MOUTH","HAIR_TIE","HAIR_SIDE","GLASSES","DETAIL","EARS","MOLE","BLUSH","LENS","LINER"];
/* ============================================================
   파츠가 기준 얼굴에서 차지하는 네모 [x1, y1, x2, y2]
   ============================================================
   path 를 런타임에 재지 않으려고 미리 재서 적어 둔 표다. app.js 가
   이 숫자로 앞머리를 이마 안에 맞추고, 작은 파츠가 얼굴 밖으로
   나가면 끌어당긴다. 파츠 그림을 고치면 이 표도 다시 재야 한다
   (scratchpad/mgbake2.js 가 다시 굽는다). */
const EXT = {
  HAIR_FRONT: [null, [78,74,222,156], [92,104,208,142], [90,82,210,152], [80,76,220,154], [84,90,216,150], [82,84,218,154], [94,66,206,154], [86,98,214,152], [80,88,220,150], [64,61,236,168], [78,74,222,156], [80,76,220,154], [80,74,220,154], [78,74,222,156], [82,80,218,152], [82,80,218,152], [80,74,220,168], [80,74,220,154], [80,74,220,156]],
  HAIR_BACK: [null, [63,74,237,226], [68,66,232,282], [72,70,228,252], [66,64,234,290], [54,66,246,310], [68,68,232,264], [52,68,248,224], [78,74,222,224]],
  HAIR_SIDE: [null, [70,140,230,206], [70,136,230,228], [78,134,222,174], [82,150,218,180], [68,138,98,222], [66,140,234,260]],
  HAIR_TIE: [null, [192,116,242,224], [42,150,258,224], [118,52,182,104], [128,242,172,302], [206,150,228,214], [118,80,182,101]],
  BROWS: [[106,149,194,154], [106,141,194,153], [103,146,197,155], [106,147,194,155], [106,148,194,155], [106,146,194,153], [107,145,193,153], [107,150,193,154], [114,149,186,155], [104,139,196,155]],
  EYES: [[114,164,186,178], [111,160,189,182], [117,167,183,175], [110,165,190,178], [112,171,188,177], [112,162,188,180], [112,161,188,179], [112,168,188,174], [114,164,188,178], [112,170,188,176], [112,161,188,176], [112,165,188,179], [112,164,188,178]],
  NOSE: [[142,182,150,199], [144,191,157,204], [139,183,161,205], [142,181,158,199], [144,178,156,202], [143,184,157,198], [146,180,156,198], [141,187,159,205], [140,180,160,204], [143,172,157,205]],
  MOUTH: [[126,219,174,241], [131,225,169,225], [135,215,165,239], [130,218,170,236], [127,218,173,240], [126,218,174,249], [132,221,168,230], [126,218,178,254], [124,216,176,246], [126,220,174,240], [130,212,170,226], [128,222,172,232], [126,220,174,236], [132,224,168,224]],
  EARS: [[71,175,229,205], [65,170,235,210], [76,179,224,201], [72,176,228,208], [66,160,234,208]],
  GLASSES: [null, [86,160,214,184], [86,157,214,187], [104,162,196,182], [86,160,214,184], [104,172,213,184]],
  DETAIL: [null, [111,194,190,206], [186,150,198,172], [121,222,179,232], [132,209,168,218], [112,212,188,264], [84,70,216,124], [110,178,190,187], [124,206,176,242], [104,194,196,240]],
  LENS: [null, [116,166,184,176], [116,166,184,176], [116,166,184,176], [116,166,184,176], [116,166,184,176], [116,166,184,176]],
  LINER: [null, [113,162,187,169], [112,160,188,169], [107,161,193,168], [114,178,186,181]],
  BLUSH: [null, [99,193,201,209], [99,193,201,209], [99,193,201,209], [110,183,190,187]],
  MOLE: [null, [173,227,179,233], [123,183,129,189], [183,207,189,213], [147,147,153,153]],
};

/* 앞머리 맞춤 — drop 은 이마 높이의 몇 배까지 내려오는 꼴인가,
   fit 은 폭이 좁은/보통/넓은 꼴인가. app.js 가 이 둘로 크기를 잡는다. */
const HAIR_FIT = {
  "짧은": { drop: 1.12, fit: "standard" },
  "반머리": { drop: 0.79, fit: "narrow" },
  "투블럭": { drop: 1.02, fit: "standard" },
  "가르마": { drop: 1.07, fit: "standard" },
  "올백": { drop: 0.98, fit: "standard" },
  "뾰족": { drop: 1.07, fit: "standard" },
  "모히칸": { drop: 1.07, fit: "narrow" },
  "반삭": { drop: 1.02, fit: "standard" },
  "곱슬": { drop: 0.98, fit: "standard" },
  "파마": { drop: 1.4, fit: "wide" },
  "장발": { drop: 1.12, fit: "standard" },
  "단발": { drop: 1.07, fit: "standard" },
  "긴생머리": { drop: 1.07, fit: "standard" },
  "웨이브": { drop: 1.12, fit: "standard" },
  "포니": { drop: 1.02, fit: "standard" },
  "양갈래": { drop: 1.02, fit: "standard" },
  "시스루": { drop: 1.4, fit: "standard" },
  "처피뱅": { drop: 1.07, fit: "standard" },
  "가운데": { drop: 1.12, fit: "standard" },
};
window.MONTAGE_PARTS = {
  REF: REF, FACES: FACES, EARS: EARS, NECK: NECK,
  HAIR_FRONT: HAIR_FRONT, HAIR_BACK: HAIR_BACK, HAIR_TIE: HAIR_TIE,
  HAIR_SIDE: HAIR_SIDE,
  BROWS: BROWS, EYES: EYES, NOSE: NOSE, MOUTH: MOUTH,
  GLASSES: GLASSES, DETAIL: DETAIL,
  LENS: LENS, LINER: LINER, BLUSH: BLUSH, MOLE: MOLE,
  SKIN: SKIN, HAIRCOL: HAIRCOL, CATS: CATS,
  TAGS: TAGS, TAG_ORDER: TAG_ORDER,
  
   EXT: EXT, HAIR_FIT: HAIR_FIT,
  OPTIONAL: OPTIONAL, CHANCE: CHANCE, NEUTRAL: NEUTRAL,
  HAIR_COMPAT: HAIR_COMPAT, tieOk: tieOk,
};
})();
