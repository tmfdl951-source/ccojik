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
  /* 눈 두 개가 앉은 자리. 안경은 이 둘 사이 거리로 폭을 잡는다. */
  leftEyeX: 121, rightEyeX: 179,
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
    /* 눈 자리 — 파츠는 featScale 로 커지므로 눈도 그만큼 벌어진다 */
    leftEyeX: REF.cx - (REF.cx - REF.leftEyeX) * (1 + (sx - 1) * 0.7),
    rightEyeX: REF.cx + (REF.rightEyeX - REF.cx) * (1 + (sx - 1) * 0.7),
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
   머리 — hair.js 의 생성기가 만든다
   ============================================================
   예전에는 '앞+뒤 한 벌' 로 손으로 그린 path 16개였다. 정수리가 납작하고
   관자놀이가 얼굴과 안 맞고 길이만 다른 비슷한 도형이라, 도형을 얹은 것처럼
   보였다.
   이제 hair.js 가 기준점(이마선·관자놀이·정수리)과 곡선 프리셋으로 만든다.
   스타일 = 숫자 묶음이고, 그 숫자가 정수리 볼륨 / 관자놀이 폭 / 길이 /
   물결 / 가르마를 정한다. 스타일을 더하려면 hair.js 의 표에 한 줄 적으면
   된다 — 좌표를 다시 잴 일이 없다. */
const HR = window.MONTAGE_HAIR;
const HAIR_BACK = HR.BACK;
const HAIR_FRONT = HR.FRONT;
const HAIR_SIDE = HR.SIDE;
const HAIR_TIE = HR.TIE;

/* ============================================================
   안경 — 따로 뺐다 (예전엔 '기타' 에 섞여 있었다)
   ============================================================ */
const GLASSES = [
  { n: "없음", s: "" },
  { n: "동그란", s: '<g fill="none" stroke="#3a3a3a" stroke-width="2.8">' +
    '<circle cx="121" cy="171" r="15"/><circle cx="179" cy="171" r="15"/>' +
    '<path d="M136 171 h28"/><path d="M106 167 l-18 8"/><path d="M194 167 l18 8"/></g>' },
  { n: "사각", s: '<g fill="none" stroke="#222" stroke-width="3">' +
    '<rect x="104" y="159" width="34" height="24" rx="3"/>' +
    '<rect x="162" y="159" width="34" height="24" rx="3"/>' +
    '<path d="M138 171 h24"/><path d="M104 165 l-18 8"/><path d="M196 165 l18 8"/></g>' },
  { n: "얇은테", s: '<g fill="none" stroke="#8a9299" stroke-width="1.6">' +
    '<rect x="106" y="162" width="30" height="19" rx="5"/>' +
    '<rect x="164" y="162" width="30" height="19" rx="5"/>' +
    '<path d="M136 171 h28"/><path d="M106 167 l-19 7"/><path d="M194 167 l19 7"/></g>' },
  { n: "두꺼운뿔테", s: '<g fill="none" stroke="#1a1a16" stroke-width="6">' +
    '<rect x="103" y="157" width="36" height="27" rx="8"/>' +
    '<rect x="161" y="157" width="36" height="27" rx="8"/>' +
    '<path d="M139 170 h22"/></g>' +
    '<g fill="none" stroke="#1a1a16" stroke-width="4">' +
    '<path d="M103 164 l-18 9"/><path d="M197 164 l18 9"/></g>' },
  { n: "작은", s: '<g fill="none" stroke="#4a4a44" stroke-width="2.4">' +
    '<circle cx="121" cy="171" r="10"/><circle cx="179" cy="171" r="10"/>' +
    '<path d="M131 171 h18"/><path d="M111 169 l-22 5"/><path d="M189 169 l22 5"/></g>' },
  { n: "큰", s: '<g fill="none" stroke="#2a2a26" stroke-width="3.2">' +
    '<rect x="98" y="153" width="44" height="33" rx="11"/>' +
    '<rect x="158" y="153" width="44" height="33" rx="11"/>' +
    '<path d="M142 170 h16"/><path d="M98 161 l-14 10"/><path d="M202 161 l14 10"/></g>' },
  { n: "선글라스", s: '<g stroke="#1a1a16" stroke-width="3">' +
    '<rect x="102" y="158" width="37" height="26" rx="8" fill="#232a33"/>' +
    '<rect x="161" y="158" width="37" height="26" rx="8" fill="#232a33"/>' +
    '<path d="M139 170 h22" fill="none"/>' +
    '<path d="M102 164 l-17 8" fill="none"/><path d="M198 164 l17 8" fill="none"/></g>' },
];

/* ============================================================
   기타 디테일 — 점·주근깨·흉터·수염 / 모자 / 마스크
   ============================================================ */
const DETAIL = [
  { n: "없음", s: "", anchor: "cheekY", ref: "cheekY" },
  /* 점 — 볼·눈밑·코옆. 얼굴 폭의 18% 쯤 되는 자리에 둔다 */
  { n: "왼쪽볼점", anchor: "cheekY", ref: "cheekY",
    s: '<circle cx="125" cy="201" r="3.2" fill="#5a3a1a"/>' },
  { n: "오른쪽볼점", anchor: "cheekY", ref: "cheekY",
    s: '<circle cx="175" cy="201" r="3.2" fill="#5a3a1a"/>' },
  { n: "눈밑점", anchor: "eyeY", ref: "eyeY",
    s: '<circle cx="126" cy="185" r="2.6" fill="#5a3a1a"/>' },
  { n: "코옆점", anchor: "noseY", ref: "noseY",
    s: '<circle cx="137" cy="196" r="2.6" fill="#5a3a1a"/>' },
  /* 주근깨 — 코 둘레와 양 볼 위쪽 */
  { n: "주근깨", anchor: "noseY", ref: "noseY",
    s: '<g fill="#a9714a" opacity=".72">' +
    '<circle cx="132" cy="188" r="1.8"/><circle cx="124" cy="194" r="1.6"/>' +
    '<circle cx="138" cy="196" r="1.5"/><circle cx="118" cy="187" r="1.5"/>' +
    '<circle cx="168" cy="188" r="1.8"/><circle cx="176" cy="194" r="1.6"/>' +
    '<circle cx="162" cy="196" r="1.5"/><circle cx="182" cy="187" r="1.5"/>' +
    '<circle cx="146" cy="183" r="1.4"/><circle cx="154" cy="183" r="1.4"/></g>' },
  /* 다크서클 — 두 눈 바로 아래 */
  { n: "다크서클", anchor: "eyeY", ref: "eyeY",
    s: '<g fill="#9a7a86" opacity=".42">' +
    '<path d="M111 180 q10 9 20 0 q-10 5 -20 0z"/>' +
    '<path d="M169 180 q10 9 20 0 q-10 5 -20 0z"/></g>' },
  /* 볼터치 — 양 볼 */
  { n: "볼터치", anchor: "cheekY", ref: "cheekY",
    s: '<g fill="#f2a0a0" opacity=".5"><ellipse cx="112" cy="201" rx="13" ry="8"/>' +
    '<ellipse cx="188" cy="201" rx="13" ry="8"/></g>' },
  /* 흉터 — 눈썹 가로지르는 것과 볼에 난 것 */
  { n: "눈썹흉터", anchor: "browY", ref: "browY",
    s: '<g stroke="#b4705c" stroke-width="2.4" stroke-linecap="round">' +
    '<path d="M178 143 l6 18"/><path d="M175 149 l12 3"/></g>' },
  { n: "볼흉터", anchor: "cheekY", ref: "cheekY",
    s: '<g stroke="#b4705c" stroke-width="2.2" stroke-linecap="round">' +
    '<path d="M186 192 l-8 20"/><path d="M181 198 l9 3"/><path d="M179 206 l9 3"/></g>' },
  /* 수염 — 코와 입 사이 / 입 아래 턱 / 턱선 */
  { n: "콧수염", anchor: "mouthY", ref: "mouthY",
    s: '<path d="M132 211 q18 9 36 0 q-8 8 -18 6 q-10 2 -18 -6z" fill="#3a2a1a"/>' },
  { n: "턱수염", anchor: "mouthY", ref: "mouthY",
    s: '<path d="M114 232 q36 46 72 0 q-8 36 -36 40 q-28 -4 -36 -40z" fill="#3a2a1a" opacity=".92"/>' },
  { n: "잔수염", anchor: "mouthY", ref: "mouthY",
    s: '<g fill="#3a2a1a" opacity=".45"><ellipse cx="150" cy="240" rx="27" ry="11"/>' +
    '<ellipse cx="150" cy="214" rx="21" ry="6"/></g>' },
  { n: "보조개", anchor: "mouthY", ref: "mouthY",
    s: '<g stroke="#b58a63" stroke-width="2" fill="none" stroke-linecap="round">' +
    '<path d="M124 222 q-3 6 0 10"/><path d="M176 222 q3 6 0 10"/></g>' },
  /* 머리 위에 얹는 것 — 레이어가 달라서 top 으로 구분한다 */
  { n: "모자", top: 1, anchor: "hairlineY", ref: "top",
    s: '<path d="M84 116 q66 -30 132 0 q0 -46 -66 -46 q-66 0 -66 46z" fill="#2e7df1"/>' +
    '<path d="M84 116 q66 -12 132 0 q-8 8 -16 8 h-100 q-8 0 -16 -8z" fill="#1e63d0"/>' },
  { n: "마스크", top: 1, anchor: "mouthY", ref: "mouthY",
    s: '<path d="M118 198 q32 22 64 0 v18 q-32 24 -64 0z" fill="#fff" stroke="#c4ccd8" stroke-width="2"/>' +
    '<path d="M118 200 l-14 -6 M182 200 l14 -6" stroke="#c4ccd8" stroke-width="2"/>' },
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
                  "lens", "liner"];
const CHANCE = {
  hairFront: 0.85,       // 앞머리는 대개 있다
  hairSide: 0.35,
  hairTie: 0.2,
  glasses: 0.35,         // 안경은 35% 만 쓴다
  detail: 0.4,           // 특징도 40%
  lens: 0.15,
  liner: 0.2,
};
const NEUTRAL = {
  face: 0, hairBack: 3, hairFront: 1, hairSide: 0, hairTie: 0,   // 3 = 숏컷 / 1 = 일자 앞머리
  brows: 0, eyes: 0, nose: 0, mouth: 0, ears: 0,
  glasses: 0, detail: 0, lens: 0, liner: 0,
  skin: 0, hairCol: 0,
};

/* ============================================================
   머리 조합 호환성
   ============================================================
   묶음(포니·양갈래·번·땋은머리)은 묶을 머리가 있어야 한다. 뒷머리가
   "없음" 인데 묶음만 있으면 머리카락 없이 끈만 떠 있다.
   짧은 뒷머리(숏밥)는 긴 묶음을 달기 어색하다. */
const HAIR_COMPAT = {
  /* 뒷머리 이름 -> 함께 쓸 수 있는 묶음 이름들. 적히지 않은 머리는 전부 된다.
     짧은 머리에 긴 포니테일을 달면 머리카락 없이 끈만 떠 있다. */
  "없음": ["없음"],
  "삭발": ["없음"],
  "스포츠컷": ["없음"],
  "숏컷": ["없음", "번헤어"],
  "포마드": ["없음"],
  "덮은머리": ["없음", "번헤어"],
  "곱슬숏": ["없음", "번헤어", "리본"],
  "단발": ["없음", "번헤어", "낮은번", "반묶음", "리본"],
  "C컬단발": ["없음", "번헤어", "낮은번", "반묶음", "리본"],
};
/* 머리가 거의 없는데 앞머리를 얹으면 이마에 조각만 뜬다 */
const BALD = ["없음", "삭발"];
function frontOk(backName, frontName) {
  if (BALD.indexOf(backName) < 0) return true;
  return frontName === "없음";
}
/* 적히지 않은 뒷머리는 모든 묶음과 쓸 수 있다 */
function tieOk(backName, tieName) {
  const list = HAIR_COMPAT[backName];
  return !list || list.indexOf(tieName) >= 0;
}



/* 앞머리 맞춤 — drop 은 이마 높이의 몇 배까지 내려오는 꼴인가,
   fit 은 폭이 좁은/보통/넓은 꼴인가. app.js 가 이 둘로 크기를 잡는다. */



/* 앞머리 맞춤 — drop 은 이마 높이의 몇 배까지 내려오는 꼴인가,
   fit 은 폭이 좁은/보통/넓은 꼴인가. app.js 가 이 둘로 크기를 잡는다. */



/* 앞머리 맞춤 — drop 은 이마 높이의 몇 배까지 내려오는 꼴인가,
   fit 은 폭이 좁은/보통/넓은 꼴인가. app.js 가 이 둘로 크기를 잡는다. */



/* 앞머리 맞춤 — drop 은 이마 높이의 몇 배까지 내려오는 꼴인가,
   fit 은 폭이 좁은/보통/넓은 꼴인가. app.js 가 이 둘로 크기를 잡는다. */



/* 앞머리 맞춤 — drop 은 이마 높이의 몇 배까지 내려오는 꼴인가,
   fit 은 폭이 좁은/보통/넓은 꼴인가. app.js 가 이 둘로 크기를 잡는다. */

/* ============================================================
   파츠 설명말 — 전단지 "특징" 글을 이걸로 짓는다
   ============================================================
   칸 이름 + 번호 -> 설명말. "없음" 은 빈 배열이라 글에 안 들어간다.
   TAG_ORDER 가 글에 적히는 차례다 — 사람을 가리는 건 얼굴형·앞머리·
   눈·눈썹이라 그 차례로 둔다 (뒷머리를 앞세우면 눈이 밀려난다).
   (scratchpad/mgtags2.js 가 다시 굽는다.) */
const TAGS = {
  FACES: [["둥근 얼굴형"], ["계란 얼굴형"], ["길쭉 얼굴형"], ["각진 얼굴형"], ["넓적 얼굴형"], ["브이 얼굴형"], ["각턱 얼굴형"], ["통통 얼굴형"], ["광대 얼굴형"]],
  HAIR_FRONT: [[], ["일자 앞머리"], ["짧은일자 앞머리"], ["시스루 앞머리"], ["처피뱅 앞머리"], ["곱슬 앞머리"], ["5대5가르마 앞머리"], ["6대4가르마 앞머리"], ["7대3가르마 앞머리"], ["옆가르마 앞머리"], ["긴 앞머리"], ["쓸어넘김 앞머리"], ["올백 앞머리"]],
  HAIR_BACK: [[], ["삭발 머리"], ["스포츠컷 머리"], ["숏컷 머리"], ["포마드 머리"], ["덮은 머리"], ["곱슬숏 머리"], ["단발 머리"], ["C컬단발 머리"], ["중단발 머리"], ["볼륨중단발 머리"], ["긴생 머리"], ["긴웨이브 머리"], ["웨이브 머리","꼬불꼬불한 머리"], ["곱슬 머리"]],
  GLASSES: [[], ["동그란 안경"], ["사각 안경"], ["얇은테 안경"], ["두꺼운뿔테 안경"], ["작은 안경"], ["큰 안경"], ["선글라스 안경"]],
  DETAIL: [[], ["왼쪽볼점"], ["오른쪽볼점"], ["눈밑점"], ["코옆점"], ["주근깨"], ["다크서클"], ["볼터치"], ["눈썹흉터"], ["볼흉터"], ["콧수염"], ["턱수염"], ["잔수염"], ["보조개"], ["모자"], ["마스크"]],
  EYES: [["기본 눈"], ["큰 눈"], ["작은 눈"], ["찢어진 눈"], ["졸린 눈"], ["동그란 눈"], ["쌍꺼풀 눈"], ["무쌍 눈"], ["윙크 눈"], ["감은 눈"], ["하트 눈"], ["처진 눈"], ["올라간 눈"]],
  BROWS: [["일자 눈썹"], ["아치 눈썹"], ["짙은 눈썹"], ["화난 눈썹"], ["처진 눈썹"], ["갈매기 눈썹"], ["세미 눈썹"], ["옅은 눈썹"], ["짧은 눈썹"], ["굵은아치 눈썹"]],
  NOSE: [["작은 코"], ["동그란 코"], ["넓은 코"], ["뾰족 코"], ["콧대 코"], ["들창 코"], ["매부리 코"], ["주먹 코"], ["뭉툭 코"], ["긴 코"]],
  MOUTH: [["미소 입"], ["무표정 입"], ["벌림 입"], ["삐죽 입"], ["이빨 입"], ["혀 입"], ["앙다문 입"], ["메롱 입"], ["하하 입"], ["립스틱 입"], ["비웃음 입"], ["내려간 입"], ["두꺼운 입"], ["얇은 입"]],
  HAIR_TIE: [[], ["포니"], ["낮은포니"], ["양갈래"], ["번헤어"], ["낮은번"], ["땋은머리"], ["반묶음"], ["리본"]],
  HAIR_SIDE: [[], ["짧은갈래 옆머리"], ["귀덮기 옆머리"], ["볼선 옆머리"], ["턱선 옆머리"], ["구레나룻 옆머리"], ["옆으로 흘러내린 컬"]],
  EARS: [["기본 귀"], ["큰 귀"], ["작은 귀"], ["칼 귀"], ["당나 귀"]],
  LENS: [[], ["갈색 렌즈"], ["파랑 렌즈"], ["초록 렌즈"], ["회색 렌즈"], ["보라 렌즈"], ["핑크 렌즈"]],
  LINER: [[], ["기본 아이라인"], ["또렷 아이라인"], ["캣아이 아이라인"], ["언더 아이라인"]],
};
const TAG_ORDER = ["FACES","HAIR_FRONT","HAIR_BACK","GLASSES","DETAIL","EYES","BROWS","NOSE","MOUTH","HAIR_TIE","HAIR_SIDE","EARS","LENS","LINER"];
/* ============================================================
   파츠가 기준 얼굴에서 차지하는 네모 [x1, y1, x2, y2]
   ============================================================
   path 를 런타임에 재지 않으려고 미리 재서 적어 둔 표다. app.js 가
   이 숫자로 앞머리를 이마 안에 맞추고, 작은 파츠가 얼굴 밖으로
   나가면 끌어당긴다. 파츠 그림을 고치면 이 표도 다시 재야 한다
   (scratchpad/mgbake2.js 가 다시 굽는다). */
const EXT = {
  HAIR_FRONT: [null, [66,85,234,150], [66,87,234,136], [68,89,232,144], [68,86,232,145], [71,83,229,151], [66,88,234,152], [67,88,235,152], [68,88,236,152], [64,87,233,155], [64,88,235,160], [65,88,236,158], [70,81,230,123]],
  HAIR_BACK: [null, [69,90,231,136], [68,82,232,150], [65,76,235,169], [72,66,228,156], [60,74,240,182], [53,70,247,177], [61,74,239,237], [68,74,233,244], [60,72,240,280], [56,64,244,278], [60,72,240,334], [50,68,250,332], [50,68,250,274], [36,61,264,258]],
  HAIR_SIDE: [null, [72,112,228,156], [71,111,229,187], [70,108,230,231], [69,105,231,272], [73,112,227,165], [68,107,232,248]],
  HAIR_TIE: [null, [212,135,254,242], [204,227,246,324], [56,157,244,263], [120,38,180,90], [125,236,175,280], [203,149,236,310], [124,124,176,198], [118,72,182,93]],
  BROWS: [[106,149,194,154], [106,141,194,153], [103,146,197,155], [106,147,194,155], [106,148,194,155], [106,146,194,153], [107,145,193,153], [107,150,193,154], [114,149,186,155], [104,139,196,155]],
  EYES: [[114,164,186,178], [111,160,189,182], [117,167,183,175], [110,165,190,178], [112,171,188,177], [112,162,188,180], [112,161,188,179], [112,168,188,174], [114,164,188,178], [112,170,188,176], [112,161,188,176], [112,165,188,179], [112,164,188,178]],
  NOSE: [[142,182,150,199], [144,191,157,204], [139,183,161,205], [142,181,158,199], [144,178,156,202], [143,184,157,198], [146,180,156,198], [141,187,159,205], [140,180,160,204], [143,172,157,205]],
  MOUTH: [[126,219,174,241], [131,225,169,225], [135,215,165,239], [130,218,170,236], [127,218,173,240], [126,218,174,249], [132,221,168,230], [126,218,178,254], [124,216,176,246], [126,220,174,240], [130,212,170,226], [128,222,172,232], [126,220,174,236], [132,224,168,224]],
  EARS: [[71,175,229,205], [65,170,235,210], [76,179,224,201], [72,176,228,208], [66,160,234,208]],
  GLASSES: [null, [88,156,212,186], [86,159,214,183], [87,162,213,181], [85,157,215,184], [89,161,211,181], [84,153,216,186], [85,158,215,184]],
  DETAIL: [null, [122,198,128,204], [172,198,178,204], [123,182,129,188], [134,193,140,199], [117,182,184,198], [111,180,189,189], [99,193,201,209], [175,143,187,161], [178,192,190,212], [132,211,168,220], [114,232,186,278], [123,208,177,251], [121,222,179,232], [84,70,216,124], [104,194,196,240]],
  LENS: [null, [116,166,184,176], [116,166,184,176], [116,166,184,176], [116,166,184,176], [116,166,184,176], [116,166,184,176]],
  LINER: [null, [113,162,187,169], [112,160,188,169], [107,161,193,168], [114,178,186,181]],
  BLUSH: [null, [99,193,201,209], [99,193,201,209], [99,193,201,209], [110,183,190,187]],
  MOLE: [null, [173,227,179,233], [123,183,129,189], [183,207,189,213], [147,147,153,153]],
};

/* 앞머리 맞춤 — drop 은 이마 높이의 몇 배까지 내려오는 꼴인가,
   fit 은 폭이 좁은/보통/넓은 꼴인가. app.js 가 이 둘로 크기를 잡는다. */
const HAIR_FIT = {
  "일자": { drop: 0.98, fit: "standard" },
  "짧은일자": { drop: 0.65, fit: "standard" },
  "시스루": { drop: 0.84, fit: "standard" },
  "처피뱅": { drop: 0.86, fit: "standard" },
  "곱슬앞머리": { drop: 1, fit: "standard" },
  "5대5가르마": { drop: 1.02, fit: "standard" },
  "6대4가르마": { drop: 1.02, fit: "standard" },
  "7대3가르마": { drop: 1.02, fit: "standard" },
  "옆가르마": { drop: 1.09, fit: "standard" },
  "긴앞머리": { drop: 1.21, fit: "wide" },
  "쓸어넘김": { drop: 1.16, fit: "wide" },
  "올백": { drop: 0.35, fit: "narrow" },
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
  HAIR_COMPAT: HAIR_COMPAT, tieOk: tieOk, frontOk: frontOk, BALD: BALD,
};
})();
