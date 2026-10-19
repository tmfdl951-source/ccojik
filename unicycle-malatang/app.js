/* ============================================================
 * 꼬직 · 외발자전거 타고 마라탕 먹기
 *
 * 재미의 뼈대는 '세 가지가 서로 싸운다' 는 것 하나다.
 *   자전거를 살리려고 급히 보정하면  -> 국물이 쏟아지고
 *   국물을 지키려고 가만히 있으면    -> 자전거가 넘어지고
 *   먹으려고 손을 뻗으면             -> 중심이 또 흔들린다
 * 그래서 몸 / 그릇 / 국물을 서로 다른 세 개의 각도로 따로 굴린다.
 *   bikeAngle  내가 버튼으로 직접 미는 값. 가만두면 넘어진다(역진자).
 *   bowlAngle  bikeAngle 을 용수철로 뒤따라간다. 한 박자 늦다.
 *   soupAngle  bowlAngle 을 더 느리게, 더 출렁이며 따라간다. 게다가
 *              그릇이 가속하는 쪽의 '반대' 로 먼저 쏠린다(관성).
 * 쏟기는 각도만 보고 정하지 않는다. 기운 수면이 실제로 그릇 테두리를
 * 넘는지를 계산한다 — 그릇이 클수록, 국물이 많을수록 빨리 넘친다.
 *
 * 그림
 *   에셋이 아직 없어서 전부 도형으로 그린다. assets/manifest.json 의
 *   files 에 적힌 것만 불러오고, 없는 자리는 같은 자리에 같은 크기로
 *   도형이 들어간다. 그림이 생기면 코드를 안 고쳐도 바뀐다.
 *   로우폴리 느낌은 '면 하나 칠하고 한쪽에 어두운 면을 덧대기' 로만 낸다.
 *   WebGL / Three.js 는 쓰지 않는다 (모바일 우선).
 *
 * 좌표
 *   원점은 바퀴가 땅에 닿는 점. 위가 음수. 논리 1920 높이를 화면에 맞춘다.
 *   그래서 작은 폰이든 태블릿이든 판정이 똑같다.
 * ============================================================ */
(() => {
  "use strict";

  const DEBUG_MODE = false;              // true 면 각도·상태·fps 를 화면에 찍는다

  /* ============================================================
     설정 — 손맛에 관계된 숫자는 전부 여기 있다
     ============================================================ */
  const CFG = {
    /* 시간 제한은 없다 — 그릇을 다 비우거나 넘어질 때까지다 (원작과 같다) */

    /* 외발자전거 — 바퀴 위에 세운 막대(역진자). 원작의 숫자를 그대로 쓴다.
       th 가 몸의 기울기(라디안, 오른쪽이 +), w 가 그 속도.
       x, v 는 바퀴의 자리와 속도. 버튼은 바퀴만 가속하고 몸은 반동으로 기운다. */
    bike: {
      G: 3.5,        // 넘어지려는 힘 (무게÷키). 클수록 빨리 넘어간다
      A: 3.2,        // 버튼이 바퀴를 가속하는 힘 (m/s^2)
      AL: 1.0,       // 바퀴의 가속이 몸 기울기에 먹히는 비율 (1÷키)
      VMAX: 2.2,     // 바퀴 최고 속도 (m/s). 여기 붙으면 그 쪽으론 더 못 민다
      ROLL: 0.05,    // 구름 저항
      ARM: 0.5,      // 젓가락을 입으로 올릴 때 중심이 뒤로 가는 양
      D: 0.2,        // 몸 흔들림이 잦아드는 정도 (작을수록 여운이 남는다)
      FALL: 1.1,     // 이보다 기울면 넘어진다 (라디안 = 63도)
      GUST: 0.4,     // 노면이 늘 흔드는 세기
      GUSTT: 0.5,    // 흔들리는 방향이 바뀌는 간격 (초)
    },

    /* 그릇 — bikeAngle 을 용수철로 뒤따라간다 */
    bowl: {
      spring: 46, damp: 7.0,             // 뒤따라가는 세기 / 멎는 세기
      follow: 0.78,                      // 몸 각도의 이만큼까지만 따라간다
      maxAngle: 52,
    },

    /* 국물 — 그릇보다 느리고 더 출렁인다 */
    soup: {
      spring: 18, damp: 1.5,             // 덜 멎는다 = 한 번 출렁이면 여운이 남는다
      follow: 0.30,                      // 수면은 세상 기준으로 눕고 싶어한다
      lead: 1.8,                         // 그릇이 '가속' 하는 반대로 먼저 쏠리는 정도.
                                         // 이 값이 핵심이다 — 몸을 반듯하게 두고도
                                         // 홱 보정하면 출렁이게 만드는 건 이것뿐이다
      spillRate: 52,                     // 넘칠 때 줄어드는 속도
      warnAt: 0.55,                      // 넘치기까지 이만큼 남으면 경고
    },

    /* 뜨거움 — 원작의 '앗 뜨거'. 한 입마다 확률로 데이고, 데면 몸이 튄다.
       먹을수록 뜨거움이 쌓여(BURN) 델 확률이 올라가고, 시간이 지나면 식는다(COOL). */
    heat: {
      HOT: 0.25,     // 식었을 때 델 확률
      BURN: 0.22,    // 한 입마다 쌓이는 뜨거움
      COOL: 0.45,    // 1초에 식는 양
      JOLT: 0.8,     // 데었을 때 몸이 튀는 세기
    },

    /* 먹기 — 가운데 버튼(또는 Space)을 눌러야만 먹는다. 저절로는 안 먹는다. */
    eat: {
      cooldown: 0.10,                    // 한 입 먹고 다음 입까지 (아주 짧게)
      duration: 0.46,                    // 한 입에 걸리는 시간
      biteAt: 0.58,                      // 그 중 입에 넣는 시점 (0~1)
      buffer: 0.30,                      // 누른 것을 이만큼 들고 있다가 되는 즉시 먹는다.
                                         // 조금 빨리 눌러도 삼켜지지 않게.
      gap: [0.14, 0.74],                 // 이 구간에는 균형 보정이 둔해진다
      gapPower: 1,                       // 원작은 먹는 동안에도 입력을 막지 않는다.
                                         // 불리한 건 ARM(팔 무게) 이 물리로 만든다.
      soupPerBite: 0.9,                  // 한 입에 줄어드는 국물 %
      minSoup: 8,                        // 이보다 적으면 더 못 먹는다
      /* 지금 먹어도 되는지 — 셋 중 하나라도 넘으면 한 단계씩 나빠진다 */
      safeBike: 4.5, safeBowl: 4.5, safeSlosh: 10,
      riskBike: 11,  riskBowl: 11,  riskSlosh: 26,
      /* 먹으면 흔들린다. 상태가 나쁠수록 더 흔들린다 — 이게 이 게임의 선택이다. */
      kick:  { SAFE: 9,   WARN: 17,  RISK: 26 },   // 그릇 쪽으로 쏠리는 충격 (도/s)
      slosh: { SAFE: 14,  WARN: 32,  RISK: 56 },   // 국물에 주는 충격
    },

    /* 넘어짐 — 한 바퀴 구르지 않는다. 옆으로 툭 눕는다. */
    topple: {
      pan: 345, lift: 40, shrink: 0.25,   // 누운 몸을 화면에 담는 보정
      lie: 88,                           // 다 누웠을 때의 각도
      push: 300,                         // 넘어가는 가속 (도/s^2)
      bounce: 0.26,                      // 땅에 닿고 튕기는 정도
      stop: 55,                          // 이보다 느려지면 그대로 멎는다
      hold: 0.55,                        // 누운 채로 잠깐 멈췄다가 결과로
    },

    /* 다 비웠을 때 — 그릇째 들고 마신다. 원작 "done" 단계의 초를 그대로 썼다. */
    done: {
      lift: 0.5,                         // 여기까지 들어 올린다
      hold: 1.3,                         // 여기까지 들고 마신다
      back: 1.7,                         // 여기까지 내린다
      say: 1.8,                          // "잘 먹었습니다"
      over: 3.4,                         // 결과 화면
      near: 0.74,                        // 그릇의 어느 쪽 테두리를 입에 대나 (R 의 배수)
      below: 8,                          // 입보다 이만큼 아래에 댄다 (px)
      tilt: [0.85, 0.55],                // 기울기 = lift*(앞 + 뒤*drink) rad
      nod: 14,                           // 꿀꺽거리는 빠르기
      head: [0.34, 0.09],                // 고개 젖힘 (rad) — 원작 0.22+0.07 보다 크게.
                                         // 우리는 옆에서 보니 더 젖혀야 들이켜 보인다
      drain: [0.45, 1.15],               // 이 사이에 국물이 바닥난다 (초)
    },

    /* 넘어진 몸 — 점과 막대로 만든 ragdoll. 아래 startRag 설명 참고. */
    rag: {
      h: 1 / 120,                        // 푸는 간격 (고정이어야 안 튄다)
      iter: 9,                           // 막대 맞추기 반복 — 많을수록 뻣뻣
      air: 0.994,                        // 공기 저항
      mu: 0.55,                          // 바닥 마찰
      bounce: 0.16,                      // 바닥에서 튕기는 정도
      grav: 0.72,                        // 중력을 이만큼만 — 다 보이게 천천히
      wobble: 520,                       // 처음 속도에 섞는 흔들림 (px/s)
                                         // 이것 때문에 매번 다르게 꺾인다
      twist: [0.75, 1.7],                // 판마다 넘어가는 기세가 다르다
      slip: [0.30, 0.78],                // 판마다 바닥이 미끄러운 정도가 다르다
      armFold: [0.34, 0.92],             // 이번 판에 팔꿈치가 접힌 정도 (쭉 편 길이의 몇 배)
      legFold: [0.42, 0.95],             // 무릎 쪽. 좌우 따로 뽑아 한쪽만 접히게 한다
      jointK: 0.26,                      // 그 접힘을 얼마나 세게 붙드나 (무를수록 흐물)
      neckFold: [0.66, 0.99],            // 이번 판에 고개가 꺾인 정도
      neck: 55,                          // 머리가 몸통에서 꺾이는 한계 (도)
      face: 72,                          // 얼굴이 똑바로에서 돌아갈 수 있는 한계 (도)
                                         // 옆으로 누운 데까지만. 거꾸로는 망가져 보인다
      sink: 0.84,                        // 바닥에 묻히는 정도 (0=안 묻힘)
      camT: 0.45,                        // 카메라가 다 당겨지는 데 걸리는 시간
    },

    /* 넘어질 때 쏟아지는 것들 — 원작 scene.js 의 숫자를 px 로 옮겼다 */
    crash: {
      M: 307,                            // 1m 가 몇 px 인가 (바퀴 반지름 0.3m = 92px)
      g: 9.8,                            // 중력 (m/s^2). 아래에서 M 을 곱해 쓴다
      bowlAway: [760, 840],              // 그릇이 떨어질 자리 (손에서 px, 기운 쪽으로)
                                         // 원작은 속도(1.4/-1.1 m/s)로 던지지만, 옆에서
                                         // 보는 2D 에선 누운 몸과 같은 줄에 떨어져 얼굴을
                                         // 덮는다. 몸길이 밖으로 보내려고 자리를 정한다.
      bowlVy: 4.0,                       // 위로 뜨는 속도. 높이 떠야 머리 위로 넘어간다
                                         // (낮게 날리면 얼굴을 가로질러 지나간다)
      bowlSpin: 5,                       // 구르는 속도 (rad/s)
      bounce: 0.5,                       // 건더기가 바닥에서 한 번 튀는 정도
      drops: 26,                         // 국물 방울 최대 개수
      puddle: [0.16, 0.52],              // 웅덩이 반지름 = (앞 + 뒤*남은비율) m
    },

    /* 아래에 고정된 세 버튼 — 원작은 캔버스 안에 그린다.
       원작 값: y = H-118, x = W의 17/50/83%, 반지름 58 (먹기 80). */
    pad: { r: [30, 58], big: 1.38, side: 0.17, up: 0.052, dim: 0.74 },

    fx: { max: 26, life: 0.7 },
    sfxGap: 70,                          // 같은 소리가 겹쳐 터지지 않게 (ms)
  };

  /* 그릇 — 시작 화면에서 고른다. 원작처럼 '먹어야 할 입 수' 와 물리값이 같이 바뀐다.
     원작 수치: 커피 N10 / 라면 N16(기본) / 전골 N20. 뒤로 갈수록 빨리 넘어가고
     팔 반동·흔들림·뜨거움이 세진다. */
  const PRESETS = [
    { key: "COFFEE", label: "커피",        R: 92,  depth: 56, vis: 88,  fill: 0.60, spill: 0.82, cup: true,
      N: 10, over: { G: 2.2, D: 0.35, ARM: 0.25, GUST: 0.2 }, heat: { JOLT: 0.5, HOT: 0.20 } },
    { key: "NORMAL", label: "마라탕",      R: 128, depth: 72, vis: 112, fill: 0.70, spill: 0.90,
      N: 16, over: { G: 3.0 }, heat: {} },
    { key: "FULL",   label: "마라탕 가득", R: 160, depth: 84, vis: 138, fill: 0.78, spill: 1.05,
      N: 20, over: { G: 3.4, ARM: 0.55, GUST: 0.45 }, heat: { JOLT: 0.9, HOT: 0.30, BURN: 0.26 } },
  ];
  /* 고른 단계의 값을 섞어 둔 것 — 매 프레임 쓰는 값이라 미리 만들어 둔다 */
  let BK = {}, HT = {}, NEED = 16;
  function applyLevel(pre) {
    BK = Object.assign({}, CFG.bike, pre.over || {});
    HT = Object.assign({}, CFG.heat, pre.heat || {});
    NEED = pre.N;
  }

  let LEVEL = 1;                         // 고른 난이도 (0 커피 / 1 보통 / 2 가득)

  /* 등급과 한줄평 — 같은 등급에서도 멘트는 그때그때 다르게 고른다 */
  const GRADES = [
    { min: 85, title: "S  외발 마라탕 장인", says: [
      "마라탕 외발자전거 부문 명장",
      "국물 한 방울도 안 흘림",
      "이 사람 원래 이렇게 먹고 다닙니다",
    ] },
    { min: 70, title: "A  거의 안 흘렸다", says: [
      "손목이 좋으시네요",
      "국물 아까운 줄 아는 사람",
      "다음엔 가득으로 가시죠",
    ] },
    { min: 52, title: "B  그럭저럭 먹었다", says: [
      "그럭저럭 먹었습니다",
      "흘린 건 흘린 거고 먹은 건 먹은 거죠",
      "배는 찼으니 됐습니다",
    ] },
    { min: 32, title: "C  반은 먹고 반은 쏟음", says: [
      "반은 먹고 반은 쏟음",
      "바닥 닦을 사람 생각도 좀",
      "그릇을 좀 작은 걸로 바꿔보세요",
    ] },
    { min: 0,  title: "D  그냥 앉아서 드세요", says: [
      "출발하자마자 자빠짐",
      "마라탕은 바닥이 다 드셨습니다",
      "균형감각 환불 요청",
      "자전거는 두고 가시는 게 맞습니다",
    ] },
  ];

  /* 마라탕 건더기 — 그릇 안에 떠 있고, 한 입마다 하나씩 사라진다 */
  const ING = [
    { key: "noodle",    col: "#F2DFA6", dark: "#D4BE81", w: 46, h: 16, kind: "noodle" },
    { key: "bokchoy",   col: "#4E9B3C", dark: "#3A7A2B", w: 40, h: 30, kind: "leaf" },
    { key: "tofu-skin", col: "#E8C66A", dark: "#C9A64C", w: 38, h: 20, kind: "sheet" },
    { key: "mushroom",  col: "#C6A98C", dark: "#A68A6D", w: 34, h: 26, kind: "round" },
    { key: "sausage",   col: "#E0705C", dark: "#BD5544", w: 42, h: 20, kind: "bar" },
    { key: "quail-egg", col: "#FFF4E2", dark: "#E2D4BE", w: 26, h: 26, kind: "round" },
    { key: "rice-cake", col: "#FBF3E7", dark: "#DED4C4", w: 30, h: 22, kind: "bar" },
    { key: "ham",       col: "#F2A0A8", dark: "#D1808A", w: 34, h: 24, kind: "round" },
  ];

  /* ============================================================
     에셋 — 있는 것만 불러온다. 없으면 같은 자리에 도형을 그린다.
     ============================================================ */
  const IMG = {};                        // "player/head" -> HTMLImageElement
  const has = k => !!IMG[k];

  function loadAssets(onStep, done) {
    fetch("assets/manifest.json", { cache: "no-cache" })
      .then(r => (r.ok ? r.json() : null))
      .then(m => {
        const files = (m && Array.isArray(m.files)) ? m.files : [];
        if (!files.length) { onStep(1); done(); return; }
        let left = files.length, got = 0;
        files.forEach(f => {
          const im = new Image();
          im.onload = () => { IMG[f.replace(/\.[a-z0-9]+$/i, "")] = im; fin(); };
          im.onerror = () => { console.warn("[malatang] 못 읽음: " + f); fin(); };
          im.src = "assets/" + f;
          function fin() { got++; onStep(got / files.length); if (!--left) done(); }
        });
      })
      .catch(() => { onStep(1); done(); });
  }

  /* 에셋의 '보이는 부분' 테두리 — 알파를 실제로 재서 넣은 값이다.
     투명 여백이 파일마다 달라서(최대 33%), 이게 없으면 파츠가 어긋나 붙는다. */
  const BOX = {
    "player/player-head":           { w: 1254, h: 1254, l: 0.156, t: 0.085, r: 0.182, b: 0.074 },
    "player/player-torso":          { w: 1323, h: 1189, l: 0.258, t: 0.131, r: 0.213, b: 0.136 },
    "player/player-scarf":          { w: 1536, h: 1024, l: 0.196, t: 0.183, r: 0.180, b: 0.169 },
    "player/player-arm-upper-left": { w: 1254, h: 1254, l: 0.215, t: 0.220, r: 0.191, b: 0.183 },
    "player/player-arm-upper-right":{ w: 1254, h: 1254, l: 0.203, t: 0.222, r: 0.198, b: 0.181 },
    "player/player-arm-lower-left": { w: 1254, h: 1254, l: 0.219, t: 0.334, r: 0.199, b: 0.263 },
    "player/player-arm-lower-right":{ w: 1254, h: 1254, l: 0.114, t: 0.274, r: 0.108, b: 0.207 },
    "player/player-hand-left":      { w: 1254, h: 1254, l: 0.239, t: 0.263, r: 0.211, b: 0.255 },
    "player/player-hand-right":     { w: 1254, h: 1254, l: 0.227, t: 0.305, r: 0.176, b: 0.281 },
    "player/player-thigh-left":     { w: 1254, h: 1254, l: 0.281, t: 0.120, r: 0.220, b: 0.102 },
    "player/player-thigh-right":    { w: 1254, h: 1254, l: 0.241, t: 0.132, r: 0.194, b: 0.123 },
    "player/player-shin-left":      { w: 1254, h: 1254, l: 0.266, t: 0.083, r: 0.258, b: 0.082 },
    "player/player-shin-right":     { w: 1254, h: 1254, l: 0.191, t: 0.047, r: 0.152, b: 0.037 },
    "player/player-foot-left":      { w: 1254, h: 1254, l: 0.134, t: 0.270, r: 0.104, b: 0.226 },
    "player/player-foot-right":     { w: 1254, h: 1254, l: 0.132, t: 0.234, r: 0.108, b: 0.235 },
    "unicycle/unicycle-wheel":      { w: 1254, h: 1254, l: 0.204, t: 0.140, r: 0.197, b: 0.117 },
    "unicycle/unicycle-frame":      { w: 1254, h: 1254, l: 0.343, t: 0.111, r: 0.319, b: 0.085 },
    "unicycle/unicycle-seat":       { w: 1254, h: 1254, l: 0.168, t: 0.325, r: 0.136, b: 0.353 },
    "unicycle/unicycle-pedal-left": { w: 1254, h: 1254, l: 0.150, t: 0.251, r: 0.144, b: 0.211 },
    "unicycle/unicycle-pedal-right":{ w: 1254, h: 1254, l: 0.156, t: 0.317, r: 0.137, b: 0.237 },
    "bowl/bowl-outer":              { w: 1254, h: 1254, l: 0.077, t: 0.215, r: 0.077, b: 0.225 },
    "bowl/bowl-inner-mask":         { w: 1254, h: 1254, l: 0.098, t: 0.383, r: 0.097, b: 0.359 },
    "bowl/soup-fill":               { w: 1254, h: 1254, l: 0.069, t: 0.276, r: 0.069, b: 0.260 },
    "bowl/chopsticks":              { w: 1254, h: 1254, l: 0.057, t: 0.238, r: 0.064, b: 0.136 },
    "bowl/ing-noodle":              { w: 1254, h: 1254, l: 0.359, t: 0.059, r: 0.321, b: 0.076 },
    "bowl/ing-fishcake":            { w: 1254, h: 1254, l: 0.227, t: 0.283, r: 0.195, b: 0.277 },
    "bowl/ing-green-onion":         { w: 1254, h: 1254, l: 0.181, t: 0.257, r: 0.180, b: 0.274 },
    "bowl/ing-narutomaki":          { w: 1254, h: 1254, l: 0.169, t: 0.200, r: 0.150, b: 0.169 },
    "bowl/ing-seaweed":             { w: 1254, h: 1254, l: 0.234, t: 0.292, r: 0.195, b: 0.242 },
    "bowl/food-lift-noodle":        { w: 1254, h: 1254, l: 0.367, t: 0.099, r: 0.342, b: 0.110 },
    "bowl/food-lift-meat":          { w: 1254, h: 1254, l: 0.212, t: 0.191, r: 0.210, b: 0.152 },
    "bowl/food-lift-bokchoy":       { w: 1254, h: 1254, l: 0.266, t: 0.214, r: 0.166, b: 0.186 },
    "bowl/food-lift-sausage":       { w: 1254, h: 1254, l: 0.290, t: 0.295, r: 0.282, b: 0.291 },
    "background/bg-road":           { w: 1448, h: 1086, l: 0.000, t: 0.000, r: 0.000, b: 0.000 },
    "background/bg-building-row-1": { w: 1448, h: 1086, l: 0.016, t: 0.244, r: 0.000, b: 0.335 },
    "fx/fx-soup-splash-small":      { w: 1254, h: 1254, l: 0.251, t: 0.286, r: 0.092, b: 0.319 },
    "ui/ui-btn-left":               { w: 1254, h: 1254, l: 0.120, t: 0.128, r: 0.125, b: 0.122 },
    "ui/ui-btn-eat":                { w: 1254, h: 1254, l: 0.124, t: 0.138, r: 0.125, b: 0.113 },
    "ui/ui-btn-right":              { w: 1254, h: 1254, l: 0.135, t: 0.137, r: 0.138, b: 0.140 },
  };
  /* 길쭉한 조각은 그림 안에서 비스듬히 누워 있다. 어깨->팔꿈치 선에 맞춰
     돌려 붙이려면 '어느 방향으로 길고 그 길이가 얼마인지' 를 알아야 한다. */
  /* 옛 BONE 표는 걷어 냈다 — 이제 JOINT(관절 두 점) 가 대신한다. */


  /* 보이는 부분의 가로를 w 로 맞춰 (x,y) 에 놓는다. 투명 여백은 알아서 뺀다. */
  function put(g, key, x, y, w, opt) {
    const im = IMG[key], B = BOX[key];
    if (!im || !B) return false;
    const o = opt || {};
    const full = w / (1 - B.l - B.r);                  // 그림 전체를 이만큼
    const fullH = full * (B.h / B.w);
    const ox = (B.l - B.r) / 2 * full;                 // 보이는 상자가 치우친 만큼
    const oy = (B.t - B.b) / 2 * fullH;
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    if (o.sx) g.scale(o.sx, 1);                        // 돌아선 만큼 가로로 눌러서
    if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    g.drawImage(im, -full / 2 - ox, -fullH / 2 - oy, full, fullH);
    g.restore();
    return true;
  }
  /* 뼈(두 점)에 맞춰 길쭉한 조각을 돌려 붙인다 */
  function bone(g, key, x0, y0, x1, y1) {
    const im = IMG[key], B = BOX[key], N = BONE[key];
    if (!im || !B || !N) return false;
    const dx = x1 - x0, dy = y1 - y0;
    const k = (Math.hypot(dx, dy) || 1) / N.len;
    g.save();
    g.translate((x0 + x1) / 2, (y0 + y1) / 2);
    g.rotate(Math.atan2(dy, dx) - N.a * RAD);          // 그림 축을 뼈에 맞춘다
    g.scale(k, k);
    g.drawImage(im, -N.cx * B.w, -N.cy * B.h, B.w, B.h);
    g.restore();
    return true;
  }

  /* 그림이 있으면 그림, 없으면 fallback 도형. 자리와 크기는 둘이 같다. */
  function art(g, key, x, y, w, h, fallback) {
    if (put(g, key, x, y, w)) return true;
    const im = IMG[key];
    if (im) { g.drawImage(im, x - w / 2, y - h / 2, w, h); return true; }
    if (fallback) fallback();
    return false;
  }

  /* ============================================================
     바탕 도구 — 로우폴리 느낌은 '면 + 어두운 옆면' 으로만 낸다
     ============================================================ */
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];

  function pathOf(g, pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }
  /* 면 하나 칠하고 오른쪽 38% 에 어두운 면을 덧대 덩어리처럼 보이게 */
  function chunk(g, pts, col, shade) {
    pathOf(g, pts);
    g.fillStyle = col; g.fill();
    if (!shade) return;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    g.save(); g.clip();
    g.fillStyle = shade;
    g.fillRect(x1 - (x1 - x0) * 0.38, y0 - 2, (x1 - x0) * 0.38 + 2, y1 - y0 + 4);
    g.restore();
  }
  /* 다각형 원 — 꼭짓점을 적게 써서 로우폴리로 보이게 */
  function ngon(cx, cy, rx, ry, n, turn) {
    const o = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (turn || 0);
      o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return o;
  }
  /* 모서리 둥근 상자를 다각형으로 */
  function box(cx, cy, w, h, cut) {
    const x = cx - w / 2, y = cy - h / 2, c = cut || Math.min(w, h) * 0.22;
    return [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c],
            [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]];
  }

  /* ============================================================
     캔버스 / 좌표
     ============================================================ */
  const $ = id => document.getElementById(id);
  const cv = $("cv"), ctx = cv.getContext("2d");
  const REF_H = 1920;
  const GROUND = 0.78;                   // 바닥선이 판 높이의 몇 % 지점인가
  let W = 0, H = 0, dpr = 1, sc = 1;

  function fitCanvas() {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w !== W || h !== H || cv.width !== w * dpr) {
      W = w; H = h;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    sc = H / REF_H;
    return true;
  }
  addEventListener("resize", fitCanvas);
  addEventListener("orientationchange", fitCanvas);
  try { new ResizeObserver(fitCanvas).observe(cv); } catch (_) {}

  /* 원점 = 바퀴가 땅에 닿는 점 */
  function world(g) {
    g.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (W / 2), dpr * (H * GROUND));
    g.imageSmoothingEnabled = true;
  }
  const topY = () => -(H * GROUND) / sc;
  const botY = () => (H * (1 - GROUND)) / sc;
  const halfW = () => (W / 2) / sc;

  /* ============================================================
     상태
     ============================================================ */
  const ST = { TITLE: "TITLE", READY: "READY", GO: "GO", PLAY: "PLAY", DONE: "DONE",
               FALL: "FALL", OVER: "OVER", RESULT: "RESULT" };

  const S = {
    state: ST.TITLE,
    preset: PRESETS[1],
    elapsed: 0, cleared: false,
    readyLeft: 0, goLeft: 0,

    th: 0, w: 0,                         // 몸 기울기(라디안)와 그 속도
    wx: 0, wv: 0,                        // 바퀴의 자리와 속도 (m)
    gust: 0, gustTo: 0,                  // 노면이 흔드는 힘
    burn: 0, hot: 0,                     // 쌓인 뜨거움 / 지금 덴 상태
    bikeAngle: 0, bikeVel: 0,            // 위 둘을 도 단위로 (그리기·판정용)
    bowlAngle: 0, bowlVel: 0, bowlAcc: 0,
    soupAngle: 0, soupVel: 0,

    input: 0,                            // -1 왼쪽 / +1 오른쪽 / 0 놓음
    push: 0,                             // 실제로 몸에 실린 힘 (input 을 천천히 따라간다)
    heldL: false, heldR: false,

    amount: 100,                         // 남은 마라탕 %
    bites: 0, spills: 0, spilling: 0,
    overflow: 0,                         // 지금 테두리를 넘은 정도 (0~1)

    eating: false, eatT: 0, eatCool: 0, eatLean: 0, bitTaken: false,
    combo: 0, comboBest: 0,              // 안 쏟고 이어 먹은 수
    score: 0,                            // 쌓인 점수 (콤보가 붙는다)
    eatBuf: 0,                           // 눌러 둔 먹기가 남아 있는 시간
    eatPressed: false,                   // 이번 프레임에 먹기를 눌렀나
    eatBand: "SAFE",                     // 지금 먹으면 어떻게 되나

    ing: [],

    calm: 0, calmBest: 0,                // 연속으로 안정했던 시간
    bumpIn: 1.2, wheelSpin: 0, scroll: 0,
    topple: false, fallDir: 1, landed: 0,   // 넘어지는 중인가 / 어느 쪽으로 / 몇 번 닿았나
    crash: null,                         // 날아간 그릇·흩어진 건더기·튄 국물
    rag: null, ragT: 0, toppleT: 0,      // 꺾여 쓰러지는 몸 / 남은 시간 / 카메라
    doneT: 0, saidDone: false, doneSoup: 0,   // 다 비우고 들이켜는 동안
    fx: [], shake: 0, flash: 0,
    msg: "", msgLeft: 0, msgSmall: false,
    why: "",                             // 끝난 이유

    best: 0, bestBite: 0,
    fps: 0, fpsT: 0, fpsN: 0,
  };

  /* 소리 — 파일이 아직 없다. 자리와 호출만 만들어 둔다. */
  const SFX = { button: null, spill: null, bite: null,
                nice: null, fall: null, over: null, result: null };
  const sfxAt = {};
  function sfx(k) {
    const a = SFX[k];
    const now = performance.now();
    if (sfxAt[k] && now - sfxAt[k] < CFG.sfxGap) return;
    sfxAt[k] = now;
    if (!a) return;                      // 파일이 생기면 여기서 울린다
    try { a.currentTime = 0; a.play(); } catch (_) {}
  }
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} }

  /* ============================================================
     판 차리기
     ============================================================ */
  const choosePreset = () => PRESETS[clamp(LEVEL, 0, PRESETS.length - 1)];

  /* 건더기를 그릇에 띄운다. 자리는 그릇 안쪽 반지름 기준 비율이다. */
  function fillIng(n) {
    while (S.ing.length < n) {
      const t = pick(ING);
      S.ing.push({
        t: t,
        u: rnd(-0.62, 0.62),             // 그릇 안에서의 좌우 자리 (-1~1)
        bob: rnd(0, 6.28),               // 둥둥 뜨는 위상
        rot: rnd(-0.5, 0.5),
        dep: rnd(0.1, 0.42),             // 수면 아래로 잠긴 정도
      });
    }
  }

  function start(skipReady) {
    S.preset = choosePreset();
    S.state = skipReady ? ST.PLAY : ST.READY;
    S.readyLeft = 0.5; S.goLeft = 0.4;
    S.elapsed = 0; S.cleared = false;
    applyLevel(S.preset);
    S.th = rnd(-0.02, 0.02); S.w = 0; S.wx = 0; S.wv = 0;
    S.gust = 0; S.gustTo = 0; S.burn = 0; S.hot = 0;
    S.bikeAngle = S.th * DEG; S.bikeVel = 0;
    S.bowlAngle = 0; S.bowlVel = 0; S.bowlAcc = 0;
    S.soupAngle = 0; S.soupVel = 0;
    S.input = 0; S.push = 0; S.heldL = S.heldR = false;
    S.amount = 100; S.bites = 0; S.spills = 0; S.spilling = 0; S.overflow = 0;
    S.eating = false; S.eatT = 0; S.eatCool = 0.5; S.eatLean = 0; S.bitTaken = false;
    S.eatPressed = false; S.eatBuf = 0; S.eatBand = "SAFE";
    S.combo = 0; S.comboBest = 0; S.score = 0;
    S.ing.length = 0; fillIng(9);
    S.calm = 0; S.calmBest = 0;
    S.bumpIn = rnd(1.0, 1.8); S.wheelSpin = 0; S.scroll = 0;
    S.topple = false; S.fallDir = 1; S.landed = 0; S.crash = null;
    S.rag = null; S.ragT = 0; S.toppleT = 0;
    S.doneT = 0; S.saidDone = false;
    S.fx.length = 0; S.shake = 0; S.flash = 0;
    S.msg = ""; S.msgLeft = 0; S.msgSmall = false; S.why = "";
    $("startOver").hidden = true; $("endOver").hidden = true;
    paintHud(true);
    if (skipReady) { S.state = ST.PLAY; say("GO!"); }
  }

  /* ============================================================
     물리 — 몸 -> 그릇 -> 국물 순으로 전해진다
     ============================================================ */
  /* 몸은 바퀴 위에 세운 막대다. 버튼은 '바퀴' 만 가속하고, 몸은 그 반동으로 기운다.
     오른쪽을 누르면 바퀴가 왼쪽으로 나가고 몸이 오른쪽으로 기운다.
     바퀴가 최고 속도에 붙으면 그 쪽으로는 더 못 민다 — 그때부터는 못 세운다. */
  function stepBike(dt) {
    /* 노면 — 가끔 방향이 바뀌는 흔들림을 부드럽게 잇는다 */
    if (Math.random() < dt / BK.GUSTT) S.gustTo = rnd(-1, 1) * BK.GUST;
    S.gust += (S.gustTo - S.gust) * Math.min(1, dt * 4);

    /* 바퀴 — 먹는 동안에는 손이 떠 있어 미는 힘이 둔해진다 */
    const push = S.input * (eatGap() ? CFG.eat.gapPower : 1);
    let a = -BK.A * push;
    if ((S.wv >= BK.VMAX && a > 0) || (S.wv <= -BK.VMAX && a < 0)) a = 0;   // 최고 속도에 붙었다
    a -= BK.ROLL * S.wv;
    S.wv = clamp(S.wv + a * dt, -BK.VMAX, BK.VMAX);
    S.wx += S.wv * dt;

    /* 몸 — 중력 + 노면 + 젓가락을 올리는 팔 + 바퀴 가속의 반동 */
    const arm = S.eating ? Math.sin(Math.PI * Math.min(1, S.eatT / 0.72)) : 0;
    const acc = S.gust + BK.G * Math.sin(S.th) - BK.ARM * arm * Math.cos(S.th)
              - a * BK.AL * Math.cos(S.th) - BK.D * S.w;
    S.w += acc * dt;
    S.th += S.w * dt;

    /* 그리기·판정은 도 단위를 본다 */
    S.bikeAngle = S.th * DEG;
    S.bikeVel = S.w * DEG;

    /* 바퀴가 구르는 만큼 배경이 흐르고 페달이 돈다 (반지름 0.3m) */
    S.wheelSpin += S.wv * dt / 0.3;
    S.scroll += (150 + S.wv * 90) * dt;
  }

  function stepBowl(dt) {
    const C = CFG.bowl;
    const target = S.bikeAngle * C.follow;
    S.bowlAcc = (target - S.bowlAngle) * C.spring - S.bowlVel * C.damp;
    S.bowlVel += S.bowlAcc * dt;
    S.bowlAngle = clamp(S.bowlAngle + S.bowlVel * dt, -C.maxAngle, C.maxAngle);
  }

  function stepSoup(dt) {
    const C = CFG.soup;
    /* 수면은 눕고 싶어하지만 그릇에 조금 끌려간다 */
    const target = S.bowlAngle * C.follow;
    /* 그릇이 가속하는 쪽의 반대로 먼저 쏠린다 — 이게 관성 출렁임이다 */
    const acc = (target - S.soupAngle) * C.spring - S.soupVel * C.damp
              - S.bowlAcc * C.lead;
    S.soupVel += acc * dt;
    S.soupAngle += S.soupVel * dt;
  }

  /* ---- 쏟기 ----
     각도만 보지 않는다. 기운 수면이 그릇 테두리를 실제로 넘는지를 본다.
     그릇이 넓을수록(지렛대가 길어서), 국물이 많을수록(머리 공간이 없어서)
     같은 각도에서 더 빨리 넘친다. */
  function spillOver() {
    const P = S.preset;
    const tilt = (S.soupAngle - S.bowlAngle) * RAD;      // 그릇에서 본 수면 기울기
    const head = P.depth * (1 - level());                // 테두리까지 남은 깊이
    const rise = P.R * Math.abs(Math.tan(clamp(tilt, -1.3, 1.3)));
    return (rise - head) / P.R;                          // >0 이면 넘치는 중
  }
  const level = () => clamp(S.amount / 100, 0, 1) * S.preset.fill;

  function stepSpill(dt) {
    const over = spillOver();
    S.overflow = clamp(over / 0.22, 0, 1);
    if (over <= 0) { S.spilling = Math.max(0, S.spilling - dt * 3); return; }

    /* 수면이 +(시계방향)로 기울면 왼쪽이 높아져 왼쪽 테두리를 먼저 넘는다 */
    const side = (S.soupAngle - S.bowlAngle) > 0 ? -1 : 1;
    S.amount = Math.max(0, S.amount - over * CFG.soup.spillRate * S.preset.spill * dt);
    if (S.spilling <= 0) {
      S.spills++; sfx("spill"); buzz(18);
      S.combo = 0;                      // 쏟으면 콤보가 끊긴다
    }
    S.spilling = 0.35;
    /* 테두리 넘어가는 자리에서 방울이 떨어진다 */
    if (S.fx.length < CFG.fx.max && Math.random() < 0.55) {
      const hp = handPoint(), br = bowlRim(side);
      addFx("drop", hp.x + br.x, hp.y + br.y, side);
    }
  }

  /* ============================================================
     먹기 — 버튼이 없다. 조용해진 순간에만 저절로 일어난다.
     ============================================================ */
  /* 먹느라 손이 떠 있는 동안인가 — 이때는 좌우 버튼이 안 먹는다 */
  function eatGap() {
    if (!S.eating) return false;
    const G = CFG.eat.gap;
    return S.eatT >= G[0] && S.eatT <= G[1];
  }

  /* 지금 먹으면 어떻게 되나 — 누르기 전에 버튼 색으로도 보여 준다 */
  function eatBand() {
    const E = CFG.eat;
    const a = Math.abs(S.bikeAngle), b = Math.abs(S.bowlAngle), v = Math.abs(S.soupVel);
    if (a >= E.riskBike || b >= E.riskBowl || v >= E.riskSlosh || S.overflow > 0) return "RISK";
    if (a >= E.safeBike || b >= E.safeBowl || v >= E.safeSlosh) return "WARN";
    return "SAFE";
  }
  /* 먹을 수 있는 상태인가 — 균형과는 상관없다. 균형은 '결과' 를 바꿀 뿐이다. */
  function canEat() {
    return S.state === ST.PLAY && !S.eating && S.eatCool <= 0
        && S.amount > CFG.eat.minSoup && S.bites < NEED;
  }

  /* 플레이어가 먹기를 눌렀다. 한 번 누르면 한 입. */
  function tryEat() {
    if (!canEat()) return false;
    const E = CFG.eat;
    const band = eatBand();
    S.eating = true; S.eatT = 0; S.bitTaken = false; S.eatBand = band;
    /* 손을 뻗으면 중심이 그릇 쪽으로 쏠린다. 위태로울수록 더 세게. */
    S.bikeVel += E.kick[band];
    S.bowlVel += E.kick[band] * 0.55;
    S.soupVel -= E.slosh[band];
    /* 먹기로는 화면을 흔들지 않고 문구도 띄우지 않는다 (원작에 없다).
       휘청이는 건 위에서 준 kick / slosh 가 물리로 만들어 낸다.
       S.shake 는 이제 넘어질 때만 쓴다. */
    if (band !== "SAFE") buzz(band === "RISK" ? 16 : 8);
    sfx("button");
    return true;
  }

  function stepEat(dt) {
    if (S.eatCool > 0) S.eatCool -= dt;
    S.hot = Math.max(0, S.hot - dt / 1.2);
    S.burn = Math.max(0, S.burn - dt * HT.COOL);
    S.eatBand = S.eating ? S.eatBand : eatBand();
    /* 누른 것을 바로 버리지 않고 잠깐 들고 있는다 — 조금 빨리 눌러도 먹히게 */
    if (S.eatPressed) { S.eatPressed = false; S.eatBuf = CFG.eat.buffer; }
    if (S.eatBuf > 0) {
      S.eatBuf -= dt;
      if (tryEat()) S.eatBuf = 0;        // 먹었으면 버퍼를 비운다
    }
    if (S.eating) {
      S.eatT += dt / CFG.eat.duration;
      if (!S.bitTaken && S.eatT >= CFG.eat.biteAt) {
        S.bitTaken = true;
        S.bites++;
        /* 콤보 — 안 쏟고 이어 먹을수록 한 입이 커진다 */
        S.combo++;
        if (S.combo > S.comboBest) S.comboBest = S.combo;
        S.score += Math.round(10 * (1 + Math.min(S.combo - 1, 9) * 0.15));
        S.amount = Math.max(0, S.amount - CFG.eat.soupPerBite);
        if (S.ing.length) S.ing.splice((Math.random() * S.ing.length) | 0, 1);
        /* 앗 뜨거 — 확률로 데고, 데면 몸이 홱 튄다. 먹을수록 더 잘 덴다. */
        if (Math.random() < Math.min(0.9, HT.HOT + S.burn * 0.6)) {
          S.hot = 1;
          S.w += (Math.random() < 0.5 ? -1 : 1) * HT.JOLT *
                 (0.5 + S.burn * 0.6) * rnd(0.8, 1.2);
          say("앗 뜨거");
          buzz(14);
        }
        S.burn = Math.min(1.5, S.burn + HT.BURN);
        if (S.ing.length < 4) fillIng(9);
        addFx("pop", 0, -720, 0);
        sfx("bite"); buzz(10);
        if (S.bites >= NEED) return startDone();   // 다 비웠다 — 이제 들이켠다
      }
      if (S.eatT >= 1) { S.eating = false; S.eatT = 0; S.eatCool = CFG.eat.cooldown; }
    }
    /* 먹는 동안 상체가 그릇 쪽으로 기운다 */
    const want = S.eating ? Math.sin(clamp(S.eatT, 0, 1) * Math.PI) : 0;
    S.eatLean += (want - S.eatLean) * Math.min(1, dt * 11);
  }

  /* ============================================================
     FX — 종류가 적고 수에 상한이 있다
     ============================================================ */
  function addFx(kind, x, y, side) {
    if (S.fx.length >= CFG.fx.max) return;
    S.fx.push({ kind, x, y, side: side || 0, life: CFG.fx.life,
                vx: kind === "drop" ? (side || 1) * rnd(40, 140) : rnd(-50, 50),
                vy: kind === "drop" ? rnd(-90, 20) : -rnd(120, 200),
                r: rnd(5, 11), rot: rnd(0, 6.28) });
  }
  function stepFx(dt) {
    for (let i = S.fx.length - 1; i >= 0; i--) {
      const f = S.fx[i];
      f.vy += 1500 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if ((f.life -= dt) <= 0) S.fx.splice(i, 1);
    }
  }
  function say(text, bad, small) {
    S.msg = text; S.msgLeft = small ? 0.45 : 0.7; S.msgSmall = !!small;
    void bad;
  }

  /* ============================================================
     한 프레임
     ============================================================ */
  function step(dt) {
    if (CALIB.on) { calibFreeze(); return; }      // 조립 맞추는 중엔 아무것도 안 움직인다
    if (S.state === ST.READY) {
      if ((S.readyLeft -= dt) <= 0) { S.state = ST.GO; say("GO!"); }
      return;
    }
    if (S.state === ST.GO) {
      stepBike(dt); stepBowl(dt); stepSoup(dt);
      if ((S.goLeft -= dt) <= 0) S.state = ST.PLAY;
      return;
    }
    if (S.state === ST.FALL) {
      if (S.topple) {
        const T = CFG.topple;
        S.th = S.bikeAngle * RAD; S.w = S.bikeVel * RAD;
        /* 기운 쪽으로만 넘어간다 — 반대로 돌아가거나 한 바퀴 구르지 않는다 */
        S.bikeVel += T.push * S.fallDir * dt;
        S.bikeAngle += S.bikeVel * dt;
        if (Math.abs(S.bikeAngle) >= T.lie) {
          S.bikeAngle = T.lie * S.fallDir;             // 다 누웠다
          if (Math.abs(S.bikeVel) > T.stop) {
            /* 땅에 닿았다 — 한 번 튕기고, 닿는 순간 국물이 쏟아진다 */
            S.bikeVel = -Math.abs(S.bikeVel) * T.bounce * S.fallDir;
            S.landed++;
            S.shake = Math.max(S.shake, S.landed === 1 ? 0.26 : 0.12);
            buzz(S.landed === 1 ? 40 : 18);
            if (S.landed === 1) {
              sfx("spill");
              S.amount = Math.max(0, S.amount * 0.35);  // 엎질러진다
              for (let i = 0; i < 9; i++)
                addFx("drop", rnd(40, 260) * S.fallDir, -260 + rnd(-60, 60), S.fallDir);
            }
          } else {
            S.bikeVel = 0;                               // 그대로 멎는다
          }
        }
      }
      stepRag(dt); stepCrash(dt);
      S.toppleT = Math.min(1, S.toppleT + dt / CFG.rag.camT);
      stepBowl(dt); stepSoup(dt); stepFx(dt);
      if (S.shake > 0) S.shake -= dt;
      if (S.msgLeft > 0) S.msgLeft -= dt;
      if ((S.goLeft -= dt) <= 0) showResult();
      return;
    }
    if (S.state === ST.DONE) { stepDone(dt); return; }
    if (S.state !== ST.PLAY) return;

    S.elapsed += dt;

    stepBike(dt);
    stepBowl(dt);
    stepSoup(dt);
    stepSpill(dt);
    stepEat(dt);
    stepFx(dt);

    /* 연속 안정 구간 */
    const steady = Math.abs(S.bikeAngle) < CFG.eat.safeBike && S.overflow <= 0;
    if (steady) { S.calm += dt; if (S.calm > S.calmBest) S.calmBest = S.calm; }
    else S.calm = 0;

    if (S.shake > 0) S.shake -= dt;
    if (S.flash > 0) S.flash -= dt;
    if (S.msgLeft > 0) S.msgLeft -= dt;

    /* ---- 끝나는 세 가지 ---- */
    if (Math.abs(S.th) >= BK.FALL) return fall("넘어졌다");
    if (S.amount <= CFG.eat.minSoup) return endRun("국물을 다 쏟았다");

  }

  function fall(why) {
    S.why = why; S.state = ST.FALL;
    /* 눕는 데 걸리는 시간 + 누운 채로 잠깐 */
    S.goLeft = 0.75 + CFG.topple.hold + 0.5;
    S.topple = true;
    S.fallDir = Math.sign(S.bikeAngle) || 1;
    S.landed = 0;
    S.bikeVel = Math.abs(S.bikeVel) * S.fallDir;        // 넘어가는 쪽으로 정리
    S.shake = 0.3; sfx("fall"); buzz([30, 40, 60]);
    startRag();                                      // 몸이 꺾이기 시작한다
    startCrash();                                    // 그릇이 손을 떠난다
    say("넘어졌다!");
  }
  /* ============================================================
     다 비웠다 — 그릇째 들고 국물을 마신다 (원작 "done" 단계)
     ============================================================ */
  function startDone() {
    S.cleared = true;
    S.why = "다 비웠다";
    S.state = ST.DONE;
    S.doneT = 0; S.saidDone = false; S.doneSoup = S.amount;
    S.eating = false; S.eatT = 0; S.eatBuf = 0;
    S.ing.length = 0;                     // 건더기는 다 먹었다. 이제 국물만 남았다
    say("국물까지!");
    sfx("nice"); buzz([20, 40, 20]);
  }

  /* 지금 얼마나 들어 올렸나 / 얼마나 기울였나 / 꿀꺽거리나 */
  function drinkPose() {
    if (S.state !== ST.DONE) return ZERO_DRINK;
    const D = CFG.done, t = S.doneT;
    const ease = u => u * u * (3 - 2 * u);
    const lift = t < D.lift ? ease(t / D.lift)
               : t < D.hold ? 1
               : t < D.back ? 1 - ease((t - D.hold) / (D.back - D.hold)) : 0;
    const drink = t < D.lift ? 0 : Math.min(1, (t - D.lift) / (D.hold - D.lift));
    return { lift, drink, gulp: (t >= D.lift && t < D.hold) ? lift : 0 };
  }
  const ZERO_DRINK = { lift: 0, drink: 0, gulp: 0 };
  /* 그릇이 입 쪽으로 기운 각 (라디안). 화면은 시계방향이 +라 음수로 기운다. */
  function drinkRot() {
    const d = drinkPose();
    return -d.lift * (CFG.done.tilt[0] + CFG.done.tilt[1] * d.drink);
  }
  /* 꿀꺽거리며 고개를 젖히는 각 */
  function gulpRot() {
    const d = drinkPose();
    if (!d.gulp) return 0;
    const D = CFG.done;
    return -d.gulp * (D.head[0] + Math.max(0, Math.sin(S.doneT * D.nod)) * D.head[1]);
  }

  function stepDone(dt) {
    const D = CFG.done;
    S.doneT += dt;
    /* 균형은 이제 안 본다 — 몸이 저절로 펴지고 속도만 줄어든다 */
    S.th += (0 - S.th) * Math.min(1, dt * 4);
    S.w = 0;
    S.wv *= 1 - Math.min(1, dt * 2);
    S.wx += S.wv * dt;
    S.bikeAngle = S.th * DEG; S.bikeVel = 0;
    S.wheelSpin += S.wv * dt / 0.3;
    S.scroll += (150 + S.wv * 90) * dt;
    S.eatLean += (0 - S.eatLean) * Math.min(1, dt * 8);
    /* 마시는 동안 국물이 바닥난다 */
    const u = (S.doneT - D.drain[0]) / (D.drain[1] - D.drain[0]);
    if (u > 0) S.amount = Math.max(0, S.doneSoup * (1 - Math.min(1, u)));
    stepBowl(dt); stepSoup(dt); stepFx(dt);
    if (S.shake > 0) S.shake -= dt;
    if (S.msgLeft > 0) S.msgLeft -= dt;
    if (!S.saidDone && S.doneT >= D.say) {
      S.saidDone = true;
      say("잘 먹었습니다"); S.msgLeft = 1.4;
      sfx("result");
    }
    if (S.doneT >= D.over) showResult();
  }

  function endRun(why) {
    S.why = why; S.state = ST.FALL; S.goLeft = 0.6;
    S.topple = false;                                    // 서서 끝난다
    sfx("over");
    say(why);
  }

  /* ============================================================
     점수
     ============================================================ */
  /* 원작과 같다. 다 비웠으면 '걸린 시간', 못 비웠으면 '먹은 비율'.
     그리고 등급을 매길 0~100 값을 따로 둔다 (다 비웠으면 빠를수록 높다). */
  function scoreOf() {
    const pct = Math.round(S.bites / NEED * 100);
    if (S.cleared) {
      /* 다 비웠다 — 빠를수록 좋다. 30초면 100, 90초면 40 쯤. */
      const total = Math.round(clamp(100 - Math.max(0, S.elapsed - 30) * 1.0, 40, 100));
      return { cleared: true, pct: 100, secs: S.elapsed, total };
    }
    return { cleared: false, pct, secs: S.elapsed, total: Math.round(pct * 0.9) };
  }
  /* 화면에 보여 줄 한 줄 */
  function scoreText() {
    const r = scoreOf();
    return r.cleared ? r.secs.toFixed(1) + "초" : r.pct + "%";
  }
  const gradeFor = t => GRADES.find(g => t >= g.min) || GRADES[GRADES.length - 1];

  /* ============================================================
     그리기 — 배경
     ============================================================ */
  const BUILD_FAR = [], BUILD_NEAR = [], LAMPS = [];
  (function buildCity() {
    let x = -1400;
    while (x < 1400) {
      const w = rnd(140, 240), h = rnd(240, 560);
      BUILD_FAR.push({ x, w, h, win: Math.round(w / 46) });
      x += w + rnd(10, 50);
    }
    x = -1500;
    while (x < 1500) {
      const w = rnd(170, 300), h = rnd(140, 300);
      BUILD_NEAR.push({ x, w, h, win: Math.round(w / 56) });
      x += w + rnd(30, 90);
    }
    for (let i = -3; i <= 3; i++) LAMPS.push({ x: i * 520 });
  })();

  function drawSky(g) {
    const t = topY(), b = botY();
    if (!art(g, "background/sky", 0, (t + b) / 2, halfW() * 2.2, b - t, null)) {
      const grd = g.createLinearGradient(0, t, 0, 120);
      grd.addColorStop(0, "#0C1020"); grd.addColorStop(1, "#243154");
      g.fillStyle = grd; g.fillRect(-halfW() - 20, t, halfW() * 2 + 40, b - t);
      /* 별 몇 개 — 자리는 고정이라 깜빡이지 않는다 */
      g.fillStyle = "rgba(255,255,255,.5)";
      for (let i = 0; i < 26; i++) {
        const sx = ((i * 263) % 2600) - 1300, sy = t + ((i * 487) % 620);
        g.fillRect(sx, sy, 4, 4);
      }
      /* 달 */
      chunk(g, ngon(halfW() * 0.52, t + 220, 62, 62, 9, 0.3), "#F3EBD2", "#DCD2B6");
    }
  }

  const CURB = -46;                       // 보도 턱이 놓이는 높이 (접지선 바로 위)

  /* 배경 한 줄을 가로로 무한히 잇는다. 한 장 걸러 좌우를 뒤집어서, 그림의
     비스듬한 선이 이음매에서 서로 맞물리게 한다 (그냥 이으면 계단이 진다). */
  function tileRow(g, key, w, y, speed, n) {
    const span = w * 2;                                  // 뒤집은 한 쌍이 한 주기
    const off = -(((S.scroll * speed) % span) + span) % span;
    for (let i = -1; i <= (n || 2); i++) {
      const x = off + i * w;
      const flip = ((i % 2) + 2) % 2 === 1;
      g.save();
      g.translate(x, 0);
      if (flip) g.scale(-1, 1);
      put(g, key, 0, y, w);
      g.restore();
    }
  }
  const SKYLINE = -210;                   // 보도 윗선 = 건물이 서는 바닥
  /* 기울면 그릇이 멀리 나간다. 좁은 화면에서는 통째로 줄여 담는다. */
  const fitScale = () => clamp(halfW() / 560, 0.70, 1);

  function drawCity(g) {
    /* 그림이 있으면 보도 턱 위에 세워 가로로 이어 붙인다 */
    if (has("background/bg-building-row-1")) {
      const B = BOX["background/bg-building-row-1"];
      const w = halfW() * 1.7;                                  // 한 장의 보이는 가로
      const hv = w * (B.h * (1 - B.t - B.b)) / (B.w * (1 - B.l - B.r));
      tileRow(g, "background/bg-building-row-1", w, SKYLINE - hv / 2, 0.28, 3);
      return;
    }
    const px = p => -((S.scroll * p) % 2600) ;
    /* 먼 건물 */
    g.save(); g.translate(px(0.12), 0);
    for (let r = 0; r < 2; r++) {
      g.save(); g.translate(r * 2600, 0);
      for (const b of BUILD_FAR) {
        chunk(g, box(b.x + b.w / 2, -620 - b.h / 2 + 620, b.w, b.h, 0), "#161D33", "#121829");
        g.fillStyle = "rgba(255,206,31,.17)";
        for (let i = 0; i < b.win; i++)
          for (let j = 0; j < Math.floor(b.h / 70); j++)
            if ((i * 7 + j * 13) % 3) g.fillRect(b.x + 22 + i * 46, -b.h + 34 + j * 70, 18, 26);
      }
      g.restore();
    }
    g.restore();
    /* 가까운 건물 */
    g.save(); g.translate(px(0.3), 0);
    for (let r = 0; r < 2; r++) {
      g.save(); g.translate(r * 2600, 0);
      for (const b of BUILD_NEAR) {
        chunk(g, box(b.x + b.w / 2, -b.h / 2, b.w, b.h, 0), "#1D2440", "#181E36");
        g.fillStyle = "rgba(255,206,31,.26)";
        for (let i = 0; i < b.win; i++)
          for (let j = 0; j < Math.floor(b.h / 86); j++)
            if ((i * 5 + j * 11) % 3) g.fillRect(b.x + 28 + i * 56, -b.h + 40 + j * 86, 22, 30);
      }
      g.restore();
    }
    g.restore();
    /* 가로등 */
    g.save(); g.translate(-((S.scroll * 0.75) % 1040), 0);
    for (const L of LAMPS) {
      for (let r = 0; r < 2; r++) {
        const x = L.x + r * 1040;
        chunk(g, box(x, -170, 12, 340, 0), "#161C2E", null);
        chunk(g, box(x + 26, -348, 68, 20, 6), "#161C2E", null);
        chunk(g, ngon(x + 54, -332, 20, 14, 7, 0), "#FFCE1F", null);
        g.fillStyle = "rgba(255,206,31,.05)";
        pathOf(g, [[x + 54, -322], [x + 164, 0], [x - 56, 0]]); g.fill();
      }
    }
    g.restore();
  }

  function drawRoad(g) {
    const b = botY();
    if (has("background/bg-road")) {
      const B = BOX["background/bg-road"];
      const L = halfW() + 30;
      const w = halfW() * 2.2;
      const h = w * (B.h / B.w);
      const imgBot = CURB - h * 0.40 + h;                // 그림이 닿는 아래 끝
      /* 그림이 못 닿는 아래쪽은 그림 맨 아래와 같은 색으로 이어 깐다 */
      chunk(g, [[-L, imgBot - 2], [L, imgBot - 2], [L, b], [-L, b]], "#2C2D39", null);
      /* 그림의 세로 40% 지점이 보도 턱이다 — 그 줄을 CURB 에 맞춘다.
         그 위쪽(먼 아스팔트)은 건물을 가리므로 잘라 낸다. */
      g.save();
      g.beginPath();
      g.rect(-L, SKYLINE, L * 2, b - SKYLINE);
      g.clip();
      tileRow(g, "background/bg-road", w, CURB - h * 0.40 + h / 2, 1.0, 2);
      g.restore();
      /* 바퀴가 땅에 닿는 자리 그림자 */
      g.save(); g.globalAlpha = 0.4;
      chunk(g, ngon(VIEW.offX + S.bikeAngle * 1.6, 8, 126, 17, 9, 0), "#0B0E15", null);
      g.restore();
      return;
    }
    if (!art(g, "background/road", 0, b / 2, halfW() * 2.2, b, null)) {
      const L = halfW() + 20;
      /* 보도 -> 턱 -> 찻길 */
      chunk(g, [[-L, -26], [L, -26], [L, 16], [-L, 16]], "#2F3545", null);
      chunk(g, [[-L, 16], [L, 16], [L, 30], [-L, 30]], "#454C60", null);
      chunk(g, [[-L, 30], [L, 30], [L, b], [-L, b]], "#1A1E28", null);
    }
    /* 바퀴가 땅에 닿는 자리 그림자 — 떠 보이지 않게 */
    g.save();
    g.globalAlpha = 0.45;
    chunk(g, ngon(S.bikeAngle * 1.6, 8, 120, 16, 9, 0), "#0B0E15", null);
    g.restore();
    /* 중앙선 — 흐르는 느낌만 */
    g.fillStyle = "rgba(255,255,255,.14)";
    const gap = 180, off = (S.scroll * 1.0) % gap;
    for (let x = -halfW() - gap; x < halfW() + gap; x += gap)
      g.fillRect(x - off, b * 0.55, 76, 9);
  }

  /* ============================================================
     조립 맞추기 모드

     기준 그림(assets/ref/ref-player-unicycle-full.png)을 캐릭터 뒤에
     흐리게 깔고, 그 위에 파츠를 올려 가며 자리를 맞춘다.
     켜면 흔들림·페달·먹기·넘어짐이 전부 멈춘다 — 움직이는 걸 보면서
     기본 자세를 맞출 수는 없다.
     다 맞추면 false 로 되돌린다 (기준 그림은 안 불러온다).
     ============================================================ */
  let CHARACTER_CALIBRATION_MODE = false;
  const CALIB = {
    on: CHARACTER_CALIBRATION_MODE,
    opacity: 0.35,
    key: "ref/ref-player-unicycle-full",
    k: 0.60,                 // 기준 그림 1px = 리그 몇 px
    ox: 492, oy: 1382,       // 기준 그림에서 바퀴가 땅에 닿는 점
    phase: -0.9,             // 맞출 때 쓰는 페달 각 (기준 그림의 발 자리)
  };
  let calibImg = null;
  function calibRef() {
    if (!CALIB.on) return null;
    if (IMG[CALIB.key]) return IMG[CALIB.key];
    if (!calibImg) {
      calibImg = new Image();
      calibImg.onload = () => { IMG[CALIB.key] = calibImg; };
      calibImg.src = "assets/" + CALIB.key + ".png";
    }
    return null;
  }
  /* 맞추는 동안은 전부 멈춘다 */
  function calibFreeze() {
    if (!CALIB.on) return;
    S.bikeAngle = 0; S.bikeVel = 0; S.th = 0; S.w = 0; S.wv = 0;
    S.bowlAngle = 0; S.bowlVel = 0; S.soupAngle = 0; S.soupVel = 0;
    S.eatLean = 0; S.eating = false; S.eatT = 0;
    S.wheelSpin = CALIB.phase; S.shake = 0; S.gust = 0; S.gustTo = 0;
    S.topple = false; S.rag = null; S.crash = null; S.doneT = 0;
  }
  function drawCalibRef(g) {
    const im = calibRef();
    if (!im) return;
    const k = CALIB.k;
    g.save();
    g.globalAlpha = CALIB.opacity;
    /* 기준 그림의 접지점을 리그 원점에 맞춰 깐다 */
    g.drawImage(im, -CALIB.ox * k, -CALIB.oy * k, im.naturalWidth * k, im.naturalHeight * k);
    g.restore();
  }

  /* ============================================================
     캐릭터 — 관절로 이어 붙인다

     파츠를 각자 좌표에 놓으면 기울거나 먹을 때마다 이음매가 벌어진다.
     부모 관절에 자식을 매달고, 이음매는 일부러 겹쳐서 끊긴 자리를 가린다.

     그림마다 크기도 투명 여백도 달라서 공통 배율을 쓸 수 없다.
     파츠마다 '보이는 가로(w)' 와 '관절 두 점(JOINT)' 을 따로 준다.
     JOINT 는 그림의 알파를 실제로 재서 넣은 값이다 (scratchpad/joints.js).
     ============================================================ */

  /* ---- 3/4 시점 ---- 화면 오른쪽을 살짝 바라보는 각도 */
  const VIEW = {
    wheelSquash: 0.86,       // 바퀴를 가로로 누르는 정도
    squash: 0.96,            // 머리·몸통의 가로 압축
    farShade: 0.18,
    offX: -40,               // 전체를 왼쪽으로 — 그릇 쪽에 자리를 준다
    headRot: 0.04,
  };
  const PART = { bowl: 175 };
  const BOWL_ART = 1.52;     // 그릇 그림은 R 의 몇 배로 그리나 (R 은 쏟기 계산용이라 안 건드린다)
  const HEAD_Y = -670;
  const LEG_TOP = -352;

  /* ---- 관절표 ---- 보이는 상자 기준 비율. a 가 부모 쪽, b 가 자식 쪽.
     전부 알파를 재서 뽑았다. 눈대중 금지. */
  const JOINT = {
    "player/player-arm-upper-left":  { a: [0.89, 0.91], b: [0.11, 0.10] },  // 어깨(공) -> 팔꿈치
    "player/player-arm-lower-left":  { a: [0.07, 0.47], b: [0.93, 0.15] },  // 팔꿈치 -> 손목
    "player/player-hand-left":       { a: [0.10, 0.76], b: [0.88, 0.15] },  // 손목 -> 쥐는 자리
    "player/player-arm-upper-right": { a: [0.89, 0.89], b: [0.09, 0.09] },
    "player/player-arm-lower-right": { a: [0.07, 0.64], b: [0.92, 0.18] },
    "player/player-hand-right":      { a: [0.06, 0.55], b: [0.94, 0.53] },
    "player/player-thigh-left":      { a: [0.84, 0.08], b: [0.14, 0.93] },  // 골반 -> 무릎
    "player/player-shin-left":       { a: [0.20, 0.06], b: [0.41, 0.94] },  // 무릎 -> 발목
    "player/player-foot-left":       { a: [0.09, 0.30], b: [0.93, 0.78] },  // 발목 -> 발끝
    "player/player-thigh-right":     { a: [0.13, 0.07], b: [0.80, 0.92] },
    "player/player-shin-right":      { a: [0.17, 0.08], b: [0.69, 0.93] },
    "player/player-foot-right":      { a: [0.10, 0.30], b: [0.93, 0.79] },
    "bowl/chopsticks":               { a: [0.08, 0.13], b: [0.93, 0.93] },  // 쥔 끝 -> 집는 끝
    "unicycle/unicycle-frame":       { a: [0.28, 0.94], b: [0.47, 0.05] },  // 바퀴축 -> 안장
    "unicycle/unicycle-pedal-left":  { a: [0.08, 0.13], b: [0.91, 0.80] },  // 크랭크 -> 발판
    "unicycle/unicycle-pedal-right": { a: [0.07, 0.16], b: [0.93, 0.80] },
  };

  /* ---- 파츠별 맞춤값 ----
     기준 그림 위에 포개 가며 하나씩 맞춘 값이다. 공통 배율·공통 겹침은 안 쓴다.
       w     : 화면에 보이는 가로 (px). '보이는 상자' 기준이라 투명 여백은 빠진다.
       x,y   : 덩어리 파츠는 가운데 자리.
       sx    : 가로만 더 누르는 값 (3/4 라 돌아선 만큼).
       over  : 부모 안으로 밀어 넣는 비율 — 관절마다 따로. */
  const PART_LAYOUT = {
    torso: { x: -15, y: -432, w: 170, sx: 0.96 },
    scarf: { x: -20, y: -506, w: 168, sx: 1.00 },
    head:  { x:  -3, y: HEAD_Y, w: 206, sx: 0.97, rot: VIEW.headRot },
    seat:  { x: -18, y: -322, w: 104 },
    wheel: { x:  -3, y: -111, w: 220 },
    armUpperNear: { w: null, over: 0.17 },   // w 는 뼈 길이로 정해진다
    armLowerNear: { over: 0.14 },
    handNear:     { over: 0.13 },
    armUpperFar:  { over: 0.17 },
    armLowerFar:  { over: 0.14 },
    handFar:      { over: 0.13 },
    thighNear: { over: 0.19 }, shinNear: { over: 0.12 }, footNear: { over: 0.16 },
    thighFar:  { over: 0.19 }, shinFar:  { over: 0.12 }, footFar:  { over: 0.16 },
    frame: { over: 0 }, pedal: { over: 0 },
  };

  /* ---- 기본 자세 ---- 기준 그림에서 읽은 자리. 움직임은 전부 여기에 더한다. */
  const BASE = {
    /* 어깨·골반은 몸통 '안쪽' 에 있다. 밖에 두면 팔다리가 떠 보인다. */
    sho:  { near: [26, -498], far: [-14, -478] },
    hipJ: { near: [8, -352],  far: [-40, -356] },
    /* 마디 길이 — 앞뒤가 다르다 (3/4 라 뒤쪽이 짧아 보인다) */
    arm:  { near: { upper: 92, fore: 84, hand: 46 },
            far:  { upper: 96, fore: 92, hand: 46 } },
    leg:  { near: { thigh: 92, shin: 134, foot: 66 },
            far:  { thigh: 86, shin: 126, foot: 60 } },
    /* 기준 그림의 앞발. 페달은 이 아래로 따라간다 (발이 먼저, 페달이 나중). */
    foot: [24, -143],
    /* 손 자리 — 하나는 그릇을 받치고 하나는 젓가락을 쥔다 */
    handBowl: [128, -378],
    handChop: [118, -516],
    chopAng: 40,              // 젓가락이 누운 각 (도)
    chopLen: 150,
    /* 깊이 — 가까운 쪽은 조금 크고 또렷, 먼 쪽은 작고 어둡다 */
    near: { k: 1.04, a: 1 },
    far:  { k: 0.90, a: 0.76 },
  };
  /* 페달은 발 자리에서 거꾸로 구한다 — 페달을 먼저 놓고 발을 맞추지 않는다 */
  const CRANK = Math.hypot(BASE.foot[0] - PART_LAYOUT.wheel.x,
                           BASE.foot[1] - PART_LAYOUT.wheel.y + 18);
  const CRANK0 = Math.atan2(BASE.foot[1] + 18 - PART_LAYOUT.wheel.y,
                            BASE.foot[0] - PART_LAYOUT.wheel.x);

  /* ---- 조각 하나를 관절에 붙인다 ----
     a 점을 (x,y) 에 놓고, a->b 방향이 ang 이 되게 돌리고, a->b 길이를 len 으로.
     over 를 주면 그만큼 뒤로 물려 그려 부모와 겹친다. */
  function limb(g, key, x, y, ang, len, opt) {
    const o = opt || {};
    const end = { x: x + Math.cos(ang) * len, y: y + Math.sin(ang) * len };
    const im = IMG[key], B = BOX[key], J = JOINT[key];
    if (!im || !B || !J) { if (o.fallback) o.fallback(end); return end; }
    const vw = B.w * (1 - B.l - B.r), vh = B.h * (1 - B.t - B.b);
    const ax = J.a[0] * vw, ay = J.a[1] * vh;
    const d = Math.hypot(J.b[0] * vw - ax, J.b[1] * vh - ay) || 1;
    const k = (len / d) * (o.k || 1);
    const spin = Math.atan2(J.b[1] * vh - ay, J.b[0] * vw - ax);
    const back = (o.over || 0) * len;
    g.save();
    g.translate(x - Math.cos(ang) * back, y - Math.sin(ang) * back);
    g.rotate(ang - spin);
    if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
    g.scale(k, k);
    g.drawImage(im, -(B.l * B.w) - ax, -(B.t * B.h) - ay, B.w, B.h);
    g.restore();
    return end;
  }

  /* 두 마디로 손/발에 닿는 가운데 관절 (팔꿈치·무릎). 두 원의 교점이다. */
  function ik2(ax, ay, bx, by, l1, l2, side) {
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy) || 0.001;
    const ux = dx / L, uy = dy / L;
    const d = clamp(L, Math.abs(l1 - l2) + 1, (l1 + l2) - 1);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    return { x: ax + ux * a - uy * h * side, y: ay + uy * a + ux * h * side };
  }
  const ang2 = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

  function farShade(g, x, y, w, h) {
    g.save();
    g.beginPath();
    g.ellipse(x, y, w / 2, h / 2, 0, 0, 6.2832);
    g.clip();
    g.fillStyle = "#16203A";
    const N = 10, band = w * 0.52 / N;
    for (let i = 0; i < N; i++) {
      g.globalAlpha = VIEW.farShade * (1 - i / N) * (1 - i / N);
      g.fillRect(x - w / 2 + i * band, y - h / 2, band + 1, h);
    }
    g.restore();
  }
  const SKIN = "#F6E3C2", SKIN_D = "#E0CBA6";
  const COAT = "#2E6BD4", COAT_D = "#2458B0";
  const SLEEVE = "#3C7BE4", SLEEVE_D = "#2E62BC";
  const PANT = "#55555F", PANT_D = "#43434C";
  const SHOE = "#6B4A32";
  const REDC = "#E8463A", REDC_D = "#C3362C";
  const SCARF = "#F0862A", SCARF_D = "#D06E1C";
  const HEM = "#F5B82E";

  function mouthPoint() {
    const lean = S.eatLean;
    return { x: PART_LAYOUT.head.x + lean * 10, y: HEAD_Y + lean * 4 + 56 };
  }

  /* 그릇이 앉는 자리 (플레이어 로컬) */
  function handPoint() {
    const k = (S.preset.R - 108) / 70;
    const base = { x: PART.bowl + k * 16, y: -408 + k * 18 + S.eatLean * 14 };
    const d = drinkPose();
    if (!d.lift) return base;
    const m = mouthPoint(), D = CFG.done;
    const tx2 = m.x + S.preset.R * D.near, ty2 = m.y + D.below;
    return { x: base.x + (tx2 - base.x) * d.lift, y: base.y + (ty2 - base.y) * d.lift };
  }
  /* 그릇 테두리의 한 점. ux·uy 는 그려지는 그릇 반쪽의 비율(-1~1). */
  function bowlRim(ux, uy) {
    const h = handPoint(), a = (S.bowlAngle - S.bikeAngle) * RAD + drinkRot();
    const lx = S.preset.R * BOWL_ART / 2 * ux, ly = S.preset.vis * BOWL_ART / 2 * uy;
    return { x: h.x + lx * Math.cos(a) - ly * Math.sin(a),
             y: h.y + lx * Math.sin(a) + ly * Math.cos(a) };
  }

  /* ---- 지금 프레임의 관절 자리 ----
     기본 자세(BASE) 에 움직임을 '더해서' 낸다. 덮어쓰지 않는다.
     그리기도 ragdoll 도 검사도 전부 이걸 본다. */
  function rigPts() {
    const lean = S.eatLean;
    const tx = lean * 12, ty = lean * -5;          // 먹을 때 상체가 그릇 쪽으로
    const P = {};
    P.hip   = { x: -5 + tx * 0.4, y: LEG_TOP + ty * 0.4 };
    P.torso = { x: PART_LAYOUT.torso.x + tx, y: PART_LAYOUT.torso.y + ty };
    P.scarf = { x: PART_LAYOUT.scarf.x + tx * 1.1, y: PART_LAYOUT.scarf.y + ty };
    P.head  = { x: PART_LAYOUT.head.x + tx * 1.2, y: PART_LAYOUT.head.y + ty * 1.2 };
    P.wheel = { x: PART_LAYOUT.wheel.x, y: PART_LAYOUT.wheel.y };
    P.seat  = { x: PART_LAYOUT.seat.x, y: PART_LAYOUT.seat.y };

    /* 페달 — 발 자리에서 구한 크랭크가 바퀴와 같이 돈다 */
    P.pedal = {};
    for (const [side, s] of [["near", 0], ["far", Math.PI]]) {
      const ph = CRANK0 + (S.wheelSpin - CALIB.phase) + s;
      P.pedal[side] = { x: P.wheel.x + Math.cos(ph) * CRANK,
                        y: P.wheel.y + Math.sin(ph) * CRANK, ph };
    }

    /* 다리 — 발이 페달에서 떨어지지 않게 무릎을 역산한다 */
    P.leg = {};
    for (const side of ["near", "far"]) {
      const L = BASE.leg[side];
      const hipJ = { x: BASE.hipJ[side][0] + tx * 0.3, y: BASE.hipJ[side][1] + ty * 0.3 };
      const pd = P.pedal[side];
      const ankle = { x: pd.x - 4, y: pd.y - 20 };
      const knee = ik2(hipJ.x, hipJ.y, ankle.x, ankle.y, L.thigh, L.shin, -1);
      P.leg[side] = { hip: hipJ, knee, ankle, pedal: pd, len: L };
    }

    /* 팔 — 손이 먼저 정해지고 팔꿈치를 역산한다 */
    P.arm = {};
    /* 먼 쪽: 그릇을 받친다. 몸통 뒤에 그려 그릇이 손을 덮게 한다. */
    {
      const A = BASE.arm.far;
      const grip = bowlRim(-0.78, 0.34);   // 그릇 아래 테두리 — 손이 그릇에 닿는 자리
      const hang = Math.atan2(-0.38, 0.92);
      const wrist = { x: grip.x - Math.cos(hang) * A.hand, y: grip.y - Math.sin(hang) * A.hand };
      const sho = { x: BASE.sho.far[0] + tx, y: BASE.sho.far[1] + ty };
      const elb = ik2(sho.x, sho.y, wrist.x, wrist.y, A.upper, A.fore, 1);
      P.arm.far = { sho, elb, wrist, grip, hand: hang, len: A };
    }
    /* 가까운 쪽: 젓가락. 가슴 앞을 가로질러 올라온다. */
    {
      const A = BASE.arm.near, mp = mouthPoint();
      const L = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      const ease = u => u * u * (3 - 2 * u);
      const t = S.eating ? clamp(S.eatT, 0, 1) : 0;
      const gRest = { x: BASE.handChop[0] + tx, y: BASE.handChop[1] + ty };
      const tRest = { x: gRest.x + Math.cos(BASE.chopAng * RAD) * BASE.chopLen,
                      y: gRest.y + Math.sin(BASE.chopAng * RAD) * BASE.chopLen };
      const gDish = bowlRim(-0.64, -0.96);
      const tDish = bowlRim(0.16, 0.06);
      const gMouth = { x: mp.x + 92, y: mp.y + 60 };
      const tMouth = { x: mp.x + 12, y: mp.y };
      let grip, tip;
      if (t <= 0) { grip = gRest; tip = tRest; }
      else if (t < 0.34) { const u = ease(t / 0.34); grip = L(gRest, gDish, u); tip = L(tRest, tDish, u); }
      else if (t < 0.58) { const u = ease((t - 0.34) / 0.24); grip = L(gDish, gMouth, u); tip = L(tDish, tMouth, u); }
      else { const u = ease((t - 0.58) / 0.42); grip = L(gMouth, gRest, u); tip = L(tMouth, tRest, u); }
      const chopA = Math.atan2(tip.y - grip.y, tip.x - grip.x);
      const chopLen = Math.max(70, Math.hypot(tip.x - grip.x, tip.y - grip.y));
      const hang = chopA + 0.36;
      const wrist = { x: grip.x - Math.cos(hang) * A.hand, y: grip.y - Math.sin(hang) * A.hand };
      const sho = { x: BASE.sho.near[0] + tx, y: BASE.sho.near[1] + ty };
      const elb = ik2(sho.x, sho.y, wrist.x, wrist.y, A.upper, A.fore, 1);
      P.arm.near = { sho, elb, wrist, grip, hand: hang, tip, chop: chopA, chopLen, len: A };
    }
    return P;
  }

  /* ---- 다리 한 짝 ---- 골반 -> 무릎 -> 발목 -> 발 */
  function drawLeg(g, P, side) {
    const L = P.leg[side], D = BASE[side], s2 = side === "near" ? "-right" : "-left";
    const PL = PART_LAYOUT, up = side === "near" ? "Near" : "Far";
    const o = { k: D.k, alpha: D.a };
    limb(g, "player/player-thigh" + s2, L.hip.x, L.hip.y, ang2(L.hip, L.knee),
      Math.hypot(L.knee.x - L.hip.x, L.knee.y - L.hip.y),
      Object.assign({ over: PL["thigh" + up].over }, o, { fallback: () =>
        limbQuad(g, L.hip, L.knee, 58 * D.k, 48 * D.k, PANT, PANT_D) }));
    limb(g, "player/player-shin" + s2, L.knee.x, L.knee.y, ang2(L.knee, L.ankle),
      Math.hypot(L.ankle.x - L.knee.x, L.ankle.y - L.knee.y),
      Object.assign({ over: PL["shin" + up].over }, o, { fallback: () =>
        limbQuad(g, L.knee, L.ankle, 48 * D.k, 40 * D.k, PANT, PANT_D) }));
    limb(g, "player/player-foot" + s2, L.ankle.x, L.ankle.y,
      ang2(L.knee, L.ankle) - Math.PI / 2 + 0.3, L.len.foot,
      Object.assign({ over: PL["foot" + up].over }, o, { fallback: () =>
        chunk(g, box(L.ankle.x + 12 * D.k, L.ankle.y + 12 * D.k, 68 * D.k, 30 * D.k, 11),
          SHOE, "#54382A") }));
  }

  /* ---- 팔 한 짝 ---- 어깨 -> 팔꿈치 -> 손목 -> 손 */
  function drawArmRig(g, P, side, what) {
    const A = P.arm[side], D = BASE[side], s2 = side === "near" ? "-right" : "-left";
    const PL = PART_LAYOUT, up = side === "near" ? "Near" : "Far";
    const o = { k: D.k, alpha: D.a };
    if (what !== "hand") {
      limb(g, "player/player-arm-upper" + s2, A.sho.x, A.sho.y, ang2(A.sho, A.elb),
        Math.hypot(A.elb.x - A.sho.x, A.elb.y - A.sho.y),
        Object.assign({ over: PL["armUpper" + up].over }, o, { fallback: () =>
          limbQuad(g, A.sho, A.elb, 48 * D.k, 40 * D.k, SLEEVE, SLEEVE_D) }));
      limb(g, "player/player-arm-lower" + s2, A.elb.x, A.elb.y, ang2(A.elb, A.wrist),
        Math.hypot(A.wrist.x - A.elb.x, A.wrist.y - A.elb.y),
        Object.assign({ over: PL["armLower" + up].over }, o, { fallback: () =>
          limbQuad(g, A.elb, A.wrist, 40 * D.k, 32 * D.k, SLEEVE, SLEEVE_D) }));
    }
    if (what !== "arm") {
      limb(g, "player/player-hand" + s2, A.wrist.x, A.wrist.y, A.hand, A.len.hand,
        Object.assign({ over: PL["hand" + up].over }, o, { fallback: () =>
          chunk(g, ngon(A.grip.x, A.grip.y, 22 * D.k, 22 * D.k, 8, 0.3), SKIN, SKIN_D) }));
    }
  }

  /* 그림이 없을 때 쓰는 통통한 마디 (끝은 둥글게 — 이음매가 안 보이게) */
  function limbQuad(g, a, b, w0, w1, col, dark) {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    chunk(g, [[a.x + nx * w0 / 2, a.y + ny * w0 / 2], [b.x + nx * w1 / 2, b.y + ny * w1 / 2],
              [b.x - nx * w1 / 2, b.y - ny * w1 / 2], [a.x - nx * w0 / 2, a.y - ny * w0 / 2]],
      col, dark);
    chunk(g, ngon(a.x, a.y, w0 / 2, w0 / 2, 9, 0.3), col, dark);
    chunk(g, ngon(b.x, b.y, w1 / 2, w1 / 2, 9, 0.3), col, dark);
  }

  function drawPart(g, key, x, y, w, h, fallback) { art(g, key, x, y, w, h, fallback); }

  /* ---- 외발자전거 ---- 안장 -> 틀 -> 바퀴 -> 페달 (캐릭터 다음에 맞춘다) */
  function drawCycle(g, P, part) {
    const PL = PART_LAYOUT;
    if (part === "wheel") {
      limb(g, "unicycle/unicycle-frame", P.wheel.x, P.wheel.y, ang2(P.wheel, P.seat),
        Math.hypot(P.seat.x - P.wheel.x, P.seat.y - P.wheel.y),
        { fallback: () => limbQuad(g, P.wheel, P.seat, 46, 30, "#4A5370", "#3C4460") });
      if (!put(g, "unicycle/unicycle-seat", P.seat.x, P.seat.y, PL.seat.w))
        chunk(g, box(P.seat.x, P.seat.y, 120, 34, 12), REDC, REDC_D);
      g.save();
      g.translate(P.wheel.x, P.wheel.y);
      g.scale(VIEW.wheelSquash, 1);
      if (!put(g, "unicycle/unicycle-wheel", 0, 0, PL.wheel.w / VIEW.wheelSquash,
               { rot: S.wheelSpin })) {
        chunk(g, ngon(0, 0, PL.wheel.w / 2, PL.wheel.w / 2, 12, S.wheelSpin), "#3C4258", "#323850");
        chunk(g, ngon(0, 0, 18, 18, 7, 0), "#8A93A6", null);
      }
      g.restore();
      return;
    }
    const side = part, pd = P.pedal[side], D = BASE[side];
    limb(g, "unicycle/unicycle-pedal" + (side === "near" ? "-right" : "-left"),
      P.wheel.x, P.wheel.y, Math.atan2(pd.y - P.wheel.y, pd.x - P.wheel.x), CRANK,
      { k: D.k, alpha: D.a,
        fallback: () => chunk(g, box(pd.x, pd.y, 50, 16, 5), "#5A6480", "#49516A") });
  }

  function drawHead(g, x, y, rot) {
    const PL = PART_LAYOUT.head;
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    if (!put(g, "player/player-head", 0, 0, PL.w, { rot: PL.rot, sx: PL.sx })) {
      chunk(g, ngon(0, 0, 100, 104, 12, 0.26), SKIN, SKIN_D);
      g.fillStyle = "#1A1A16";
      pathOf(g, ngon(-32, 2, 12, 13, 9, 0)); g.fill();
      pathOf(g, ngon(32, 2, 12, 13, 9, 0)); g.fill();
      chunk(g, ngon(0, 28, 15, 14, 8, 0.3), "#E2503C", "#C33F2D");
      g.strokeStyle = "#1A1A16"; g.lineWidth = 6; g.lineCap = "round";
      g.beginPath();
      const mo = S.eating && S.eatT > 0.42 ? 16 : 0;
      g.arc(0, 44 + mo * 0.2, 25 + mo * 0.4, 0.25 * Math.PI, 0.75 * Math.PI);
      g.stroke();
      chunk(g, [[-100, -40], [-86, -100], [-40, -134], [40, -134], [86, -100], [100, -40]],
        REDC, REDC_D);
    }
    g.restore();
  }

  /* ============================================================
     그리기 — 뒤에서 앞으로. 깊이 차례를 지켜야 3/4 로 보인다.
       뒷다리 > 뒷페달 > 안장·틀·바퀴 > 앞다리 > 앞페달 > 받치는 팔 >
       몸통 > 목도리 > 머리 > (그릇 받친 손 > 그릇) > 젓가락 팔 > 젓가락
     ============================================================ */
  function drawPlayer(g) {
    if (S.rag) { drawRag(g); return; }
    const P = rigPts();
    g.save();
    g.translate(VIEW.offX, 0);
    g.rotate(S.bikeAngle * RAD);
    drawCalibRef(g);                       // 맞추기 모드에서만 — 기준 그림을 깐다

    drawLeg(g, P, "far");
    drawCycle(g, P, "far");
    drawCycle(g, P, "wheel");
    drawLeg(g, P, "near");                 // 바퀴 앞, 몸통 뒤 — 밑단이 허벅지를 덮는다
    drawCycle(g, P, "near");
    drawArmRig(g, P, "far", "arm");        // 그릇 받치는 팔 — 몸통 뒤

    const PL = PART_LAYOUT;
    if (put(g, "player/player-torso", P.torso.x, P.torso.y, PL.torso.w, { sx: PL.torso.sx })) {
      farShade(g, P.torso.x, P.torso.y, PL.torso.w * PL.torso.sx, PL.torso.w * 1.15);
    } else {
      chunk(g, [[P.torso.x - 78, P.torso.y + 76], [P.torso.x + 78, P.torso.y + 76],
                [P.torso.x + 70, P.torso.y - 84], [P.torso.x - 70, P.torso.y - 84]], COAT, COAT_D);
      chunk(g, box(P.torso.x, P.torso.y + 70, 150, 22, 8), HEM, HEM);
    }
    /* 목도리 — 머리와 몸통 사이를 덮는다. 목이 비는 자리가 여기다. */
    if (!put(g, "player/player-scarf", P.scarf.x, P.scarf.y, PL.scarf.w, { sx: PL.scarf.sx }))
      chunk(g, box(P.scarf.x, P.scarf.y, 160, 40, 13), SCARF, SCARF_D);

    drawHead(g, P.head.x, P.head.y, gulpRot());
    g.restore();
  }

  /* 그릇을 받친 손 — 그릇보다 먼저 그려야 '손 위에 올라간' 걸로 보인다 */
  function drawBowlHand(g) {
    g.save();
    g.translate(VIEW.offX, 0);
    g.rotate(S.bikeAngle * RAD);
    drawArmRig(g, rigPts(), "far", "hand");
    g.restore();
  }

  /* 젓가락 팔 — 제일 앞. 손에서 젓가락이 시작해 그릇을 향한다. */
  function drawEatTool(g) {
    const P = rigPts(), A = P.arm.near, D = BASE.near;
    g.save();
    g.translate(VIEW.offX, 0);
    g.rotate(S.bikeAngle * RAD);
    drawArmRig(g, P, "near", "arm");
    limb(g, "bowl/chopsticks", A.grip.x, A.grip.y, A.chop, A.chopLen,
      { alpha: D.a, fallback: () => {
        g.strokeStyle = "#E7C45E"; g.lineWidth = 6; g.lineCap = "round";
        for (const o2 of [-4, 4]) {
          g.beginPath();
          g.moveTo(A.grip.x, A.grip.y + o2);
          g.lineTo(A.tip.x, A.tip.y + o2 * 0.4);
          g.stroke();
        }
      } });
    drawArmRig(g, P, "near", "hand");
    g.restore();
  }

  /* ============================================================
     꺾여 쓰러지기 — 매번 다르게 넘어진다
     원작(ichirin-nabe)은 CANNON 으로 몸통·머리·허벅지·정강이·윗팔·아랫팔을
     관절로 이어 쓰러뜨린다. 라이브러리를 못 쓰니 같은 뼈대를 점과 막대로
     만든다. 점을 중력으로 떨어뜨리고 막대 길이를 여러 번 맞춰 주면(Verlet)
     관절이 저절로 접힌다. 처음 속도에 흔들림을 섞어 매번 다르게 꺾인다.
     ============================================================ */
  function startRag() {
    const R = CFG.rag;
    const Q = rigPts();                             // 지금 자세를 그대로 물려받는다
    const a = S.bikeAngle * RAD, ca = Math.cos(a), sa = Math.sin(a);
    const w = S.w * rnd(R.twist[0], R.twist[1]);    // 넘어가던 각속도 (rad/s)
    const pt = {}, bar = [];

    /* 리그 좌표를 세상 좌표로 옮기고, 돌던 기세를 그대로 물려준다.
       v = ω × r  (r 은 바퀴 접지점에서 그 점까지) */
    function P(name, x, y, im, rad, jit) {
      const wx = VIEW.offX + x * ca - y * sa, wy = x * sa + y * ca;
      const j = jit === undefined ? 1 : jit;
      const vx = -w * wy + rnd(-R.wobble, R.wobble) * j;
      const vy = w * (wx - VIEW.offX) + rnd(-R.wobble, R.wobble) * j * 0.6;
      pt[name] = { x: wx, y: wy, px: wx - vx * R.h, py: wy - vy * R.h, im, r: rad };
      return pt[name];
    }
    /* 막대 — m:0 은 길이를 지키고, m:1 은 '이보다 가까워지지 마라' 만 지킨다
       (무릎·팔꿈치가 반대로 꺾여 사라지지 않게 하는 버팀목).
       len 을 주면 그 길이로, 안 주면 지금 벌어진 만큼을 쉬는 길이로 삼는다. */
    function B(n1, n2, k, len, m) {
      const p = pt[n1], q = pt[n2];
      bar.push({ a: p, b: q, k: k || 1, m: m || 0,
                 d: len === undefined ? Math.hypot(p.x - q.x, p.y - q.y) : len });
    }
    /* 관절이 이번 판에 굳을 자리. 꽉 매면 인형극, 아주 풀면 다 펴진다 */
    const fold = (n1, n2, len) => B(n1, n2, R.jointK, len, 0);

    /* ---- 몸통·머리 ---- 등뼈와 목이 제일 굵은 막대다 */
    P("hip",   Q.hip.x, Q.hip.y,     0.11, 66, 0.35);
    P("chest", Q.scarf.x, Q.scarf.y, 0.13, 74, 0.35);
    P("head",  Q.head.x, Q.head.y,   0.52, 112, 0.35);
    B("hip", "chest", 0.9);
    B("chest", "head", 0.9);
    /* 고개도 관절이다 — 판마다 다르게 꺾인 채로 굳는다.
       너무 풀면 얼굴이 가슴 밑으로 말려 들어가므로 0.66 아래로는 안 간다. */
    const hh = Math.hypot(pt.hip.x - pt.head.x, pt.hip.y - pt.head.y);
    B("hip", "head", R.jointK, hh * rnd(R.neckFold[0], R.neckFold[1]));
    B("hip", "head", 0.8, hh * 0.6, 1);           // 그래도 이보다 더는 안 접힌다

    /* ---- 팔 둘 ----
       마디 길이는 '넘어지는 순간의 자세' 로 재면 안 된다. 그릇 쥔 손은
       팔꿈치 바로 옆에 있어서 아랫팔이 20px 짜리로 잡힌다.
       제 길이를 정해 주고, 무르게(k 0.3) 매어 펴지는 게 보이게 한다. */
    const UP = BASE.arm.near.upper, FORE = BASE.arm.near.fore;
    for (const side of ["far", "near"]) {
      const A = Q.arm[side], k = BASE[side].k;
      const n = side === "far" ? "B" : "F";
      P("sho" + n,  A.sho.x, A.sho.y,     0.80, 34, 0.5);
      P("elb" + n,  A.elb.x, A.elb.y,     1.80, 22, 1.7);
      P("hand" + n, A.wrist.x, A.wrist.y, 2.20, 20, 2.0);
      B("chest", "sho" + n);
      B("hip", "sho" + n, 0.6);
      B("sho" + n, "elb" + n, 0.3, UP * k);
      B("elb" + n, "hand" + n, 0.3, FORE * k);
      fold("sho" + n, "hand" + n, (UP + FORE) * k * rnd(R.armFold[0], R.armFold[1]));
    }

    /* ---- 다리 둘 ---- 이쪽 마디는 자세와 상관없이 제 길이로 잡힌다 */
    for (const side of ["far", "near"]) {
      const L = Q.leg[side], n = side === "far" ? "B" : "F";
      P("lhip" + n, L.hip.x, L.hip.y,     0.70, 34, 0.4);
      P("knee" + n, L.knee.x, L.knee.y,   1.45, 26, 1.5);
      P("foot" + n, L.ankle.x, L.ankle.y, 1.75, 24, 1.7);
      B("hip", "lhip" + n);
      B("chest", "lhip" + n, 0.5);
      B("lhip" + n, "knee" + n);
      B("knee" + n, "foot" + n);
      const th = BASE.leg.near.thigh, sh = BASE.leg.near.shin;
      fold("lhip" + n, "foot" + n, (th + sh) * rnd(R.legFold[0], R.legFold[1]));
    }

    /* ---- 외발자전거 ---- 원작도 따로 구르는 몸이다 */
    P("wheel", Q.wheel.x, Q.wheel.y, 0.7, 124, 1.2);
    P("seat", Q.seat.x, Q.seat.y, 0.7, 24, 1.2);
    B("wheel", "seat");

    S.rag = { pt, bar, spin: S.wv / 0.3, t: 0, mu: rnd(R.slip[0], R.slip[1]) };
    S.ragT = 0;
  }

  function stepRag(dt) {
    const R = S.rag;
    if (!R) return;
    const C = CFG.rag, G = CFG.crash.g * CFG.crash.M * C.grav;
    R.t += dt;
    R.spin *= 0.97;                                   // 바퀴가 천천히 멎는다
    S.ragT = Math.min(S.ragT + dt, C.h * 5);          // 밀린 시간은 조금만 따라잡는다
    while (S.ragT >= C.h) { S.ragT -= C.h; ragSolve(C, G); }
  }

  function ragSolve(C, G) {
    const R = S.rag, pt = R.pt, gh = G * C.h * C.h;
    /* 1. 떨어뜨린다 (Verlet) */
    for (const k in pt) {
      const p = pt[k];
      const vx = (p.x - p.px) * C.air, vy = (p.y - p.py) * C.air;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + gh;
    }
    /* 2. 막대 길이를 맞춘다 — 반복할수록 관절이 야물어진다 */
    for (let it = 0; it < C.iter; it++) {
      for (const c of R.bar) {
        const dx = c.b.x - c.a.x, dy = c.b.y - c.a.y;
        const L = Math.hypot(dx, dy) || 0.01;
        if (c.m === 1 && L >= c.d) continue;
        const sum = c.a.im + c.b.im;
        if (sum <= 0) continue;
        const f = (L - c.d) / L * c.k;
        const ta = c.a.im / sum, tb = c.b.im / sum;
        c.a.x += dx * f * ta; c.a.y += dy * f * ta;
        c.b.x -= dx * f * tb; c.b.y -= dy * f * tb;
      }
      /* 3. 바닥 — 조각마다 제 두께가 있다 */
      for (const k in pt) {
        const p = pt[k];
        const y = 6 - p.r * C.sink;                     // 조각 두께만큼 띄운다
        if (p.y > y) {
          const vx = p.x - p.px, vy = p.y - p.py;
          p.y = y;
          p.py = p.y + vy * C.bounce;                 // 살짝 튕기고
          p.px = p.x - vx * (1 - R.mu);               // 끌리며 멎는다
        }
      }
    }
  }

  /* (옛 limb 는 걷어 냈다 — limbQuad 와 같은 것이었고, 이름이 겹쳐서
     관절 리그의 limb 를 덮어쓰고 있었다. 그래서 팔다리가 아예 안 그려졌다.) */
  const ragAng = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

  function drawRag(g) {
    const p = S.rag.pt;
    const F = BASE.far, N = BASE.near;

    /* ---- 외발자전거 ---- 몸과 따로 구른다 */
    limb(g, "unicycle/unicycle-frame", p.wheel.x, p.wheel.y, ragAng(p.wheel, p.seat),
      Math.hypot(p.seat.x - p.wheel.x, p.seat.y - p.wheel.y),
      { fallback: () => limbQuad(g, p.wheel, p.seat, 52, 34, "#4A5370", "#3C4460") });
    if (!put(g, "unicycle/unicycle-seat", p.seat.x, p.seat.y, PART_LAYOUT.seat.w,
             { rot: ragAng(p.wheel, p.seat) + Math.PI / 2 }))
      chunk(g, box(p.seat.x, p.seat.y, 148, 40, 14), REDC, REDC_D);
    if (!put(g, "unicycle/unicycle-wheel", p.wheel.x, p.wheel.y, PART_LAYOUT.wheel.w,
             { rot: S.rag.spin })) {
      chunk(g, ngon(p.wheel.x, p.wheel.y, 124, 124, 12, S.rag.spin), "#3C4258", "#323850");
      chunk(g, ngon(p.wheel.x, p.wheel.y, 20, 20, 7, 0), "#8A93A6", null);
    }

    /* ---- 뒷다리 ---- 몸통보다 먼저 (앞다리는 몸통 뒤에 그리면 안 보인다) */
    ragLeg(g, p, "B", F, "-left");

    /* ---- 목도리가 목을 덮는다 — 쓰러져도 머리와 몸통 사이가 안 벌어진다 */
    limbQuad(g, p.chest, p.head, 104, 86, SKIN, SKIN_D);

    /* ---- 몸통 ---- */
    const ta = ragAng(p.hip, p.chest) + Math.PI / 2;
    const mid = { x: (p.hip.x + p.chest.x) / 2, y: (p.hip.y + p.chest.y) / 2 };
    if (!put(g, "player/player-torso", mid.x, mid.y, PART_LAYOUT.torso.w, { rot: ta, sx: VIEW.squash }))
      limbQuad(g, p.hip, p.chest, 192, 180, COAT, COAT_D);
    if (!put(g, "player/player-scarf", p.chest.x, p.chest.y, PART_LAYOUT.scarf.w, { rot: ta }))
      chunk(g, box(p.chest.x, p.chest.y, 186, 46, 14), SCARF, SCARF_D);

    /* ---- 앞다리 ---- 몸통 앞 */
    ragLeg(g, p, "F", N, "-right");

    /* ---- 뒷팔 ---- */
    ragArm(g, p, "B", F, "-left");

    /* ---- 머리 ---- 목은 그렇게까지 안 꺾인다. 몸통에서 ±55도 안으로 묶는다. */
    const na = ragAng(p.chest, p.head) + Math.PI / 2;
    const lim = CFG.rag.neck * RAD;
    let d = na - ta;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const fl = CFG.rag.face * RAD;
    drawHead(g, p.head.x, p.head.y, clamp(ta + clamp(d, -lim, lim), -fl, fl));

    /* ---- 앞팔 ---- */
    ragArm(g, p, "F", N, "-right");
  }

  function ragLeg(g, p, n, d, sfx2) {
    const hip = p["lhip" + n], knee = p["knee" + n], foot = p["foot" + n];
    const o = { k: d.k, alpha: d.a };
    limb(g, "player/player-thigh" + sfx2, hip.x, hip.y, ragAng(hip, knee),
      Math.hypot(knee.x - hip.x, knee.y - hip.y),
      Object.assign({ over: PART_LAYOUT.thighNear.over }, o,
        { fallback: () => limbQuad(g, hip, knee, 60 * d.k, 48 * d.k, PANT, PANT_D) }));
    limb(g, "player/player-shin" + sfx2, knee.x, knee.y, ragAng(knee, foot),
      Math.hypot(foot.x - knee.x, foot.y - knee.y),
      Object.assign({ over: PART_LAYOUT.shinNear.over }, o,
        { fallback: () => limbQuad(g, knee, foot, 48 * d.k, 40 * d.k, PANT, PANT_D) }));
    limb(g, "player/player-foot" + sfx2, foot.x, foot.y,
      ragAng(knee, foot) - Math.PI / 2 + 0.25, BASE.leg.near.foot,
      Object.assign({ over: PART_LAYOUT.footNear.over }, o,
        { fallback: () => chunk(g, box(foot.x, foot.y + 6, 70 * d.k, 32 * d.k, 11),
            SHOE, "#54382A") }));
  }

  function ragArm(g, p, n, d, sfx2) {
    const sho = p["sho" + n], elb = p["elb" + n], hand = p["hand" + n];
    const o = { k: d.k, alpha: d.a };
    limb(g, "player/player-arm-upper" + sfx2, sho.x, sho.y, ragAng(sho, elb),
      Math.hypot(elb.x - sho.x, elb.y - sho.y),
      Object.assign({ over: PART_LAYOUT.armUpperNear.over }, o,
        { fallback: () => limbQuad(g, sho, elb, 50 * d.k, 42 * d.k, SLEEVE, SLEEVE_D) }));
    limb(g, "player/player-arm-lower" + sfx2, elb.x, elb.y, ragAng(elb, hand),
      Math.hypot(hand.x - elb.x, hand.y - elb.y),
      Object.assign({ over: PART_LAYOUT.armLowerNear.over }, o,
        { fallback: () => limbQuad(g, elb, hand, 42 * d.k, 34 * d.k, SLEEVE, SLEEVE_D) }));
    limb(g, "player/player-hand" + sfx2, hand.x, hand.y, ragAng(elb, hand), BASE.arm.near.hand,
      Object.assign({ over: PART_LAYOUT.handNear.over }, o,
        { fallback: () => chunk(g, ngon(hand.x, hand.y, 24 * d.k, 24 * d.k, 8, 0.3),
            SKIN, SKIN_D) }));
  }
  /* ============================================================
     개박살 — 넘어지는 순간 그릇이 손을 떠난다
     ============================================================ */
  /* 그릇이 지금 세상 어디에 있나 (플레이어 변환을 그대로 따라간다) */
  function bowlWorld() {
    const h = handPoint(), a = S.bikeAngle * RAD;
    return {
      x: VIEW.offX + h.x * Math.cos(a) - h.y * Math.sin(a),
      y: h.x * Math.sin(a) + h.y * Math.cos(a),
    };
  }

  function startCrash() {
    const C = CFG.crash, M = C.M;
    const at = bowlWorld();
    const dir = S.fallDir;
    const left = clamp(S.amount / 100, 0, 1);        // 남아 있던 국물
    const vy = -C.bowlVy;                            // 화면은 위가 음수
    const hang = 2 * C.bowlVy / C.g;                 // 떠 있는 시간 (s)
    const away = dir * rnd(C.bowlAway[0], C.bowlAway[1]);
    const vx = (away / hang) / C.M + S.wv * 0.15;    // 목표 자리에 닿는 속도
                                                     // (달리던 속도는 살짝만 보탠다.
                                                     //  많이 보태면 목표가 무너진다)
    const bits = [], drops = [];

    /* 남은 건더기가 전부 흩어진다 — 기운 쪽으로 쏠리되 제각각 */
    for (const it of S.ing) {
      bits.push({
        t: it.t, x: at.x + rnd(-30, 30), y: at.y + rnd(-20, 10),
        vx: (dir * rnd(0.15, 0.95) + rnd(-0.5, 0.5)) * M,
        vy: -rnd(0.6, 2.4) * M,
        rot: rnd(0, 6.28), vr: rnd(-30, 30), down: false,
      });
    }
    /* 국물 방울 — 남은 양에 비례해서 많이 튄다 */
    const n = Math.round(C.drops * (0.25 + 0.75 * left));
    for (let i = 0; i < n; i++) {
      drops.push({
        x: at.x + rnd(-36, 36), y: at.y - 24,
        vx: (dir * rnd(0.1, 1.05) + rnd(-0.6, 0.6)) * M,
        vy: -rnd(0.5, 2.6) * M,
        r: rnd(7, 15), down: false,
      });
    }
    S.crash = {
      bowl: { x: at.x, y: at.y, vx: vx * M, vy: vy * M,
              rot: 0, vr: dir > 0 ? -C.bowlSpin : C.bowlSpin, down: false },
      bits, drops, left, puddleT: -1, px: 0, dir,
    };
    S.ing.length = 0;
    sfx("spill");
  }

  function stepCrash(dt) {
    const c = S.crash;
    if (!c) return;
    const C = CFG.crash, G = C.g * C.M;
    const floor = 6;                                 // 바닥(접지선보다 살짝 아래)

    /* 그릇 — 포물선을 그리다 바닥에 눕는다 */
    const b = c.bowl;
    if (!b.down) {
      b.vy += G * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.y >= floor) {
        b.y = floor; b.down = true; b.vx = 0; b.vy = 0; b.vr = 0;
        /* 반바퀴 단위로 스냅하되 늘 홀수 배 — 반드시 엎어진 채로 멎는다 */
        const half = b.rot / Math.PI;
        b.rot = Math.PI * (2 * Math.round((half - 1) / 2) + 1);
        c.puddleT = 0; c.px = b.x;                       // 여기서 웅덩이가 번진다
        S.shake = Math.max(S.shake, 0.14);
        buzz(22);
      }
    }
    /* 건더기 — 한 번 튀고 멎는다 */
    for (const o of c.bits) {
      if (o.down) continue;
      o.vy += G * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
      if (o.y >= floor) {
        o.y = floor;
        if (Math.abs(o.vy) > 120) { o.vy = -o.vy * C.bounce; o.vx *= 0.6; o.vr *= 0.4; }
        else { o.down = true; o.vy = 0; o.vx = 0; o.vr = 0; }
      }
    }
    /* 국물 방울 — 바닥에 닿으면 납작한 자국이 된다 */
    for (const d of c.drops) {
      if (d.down) continue;
      d.vy += G * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.y >= floor) { d.y = floor; d.down = true; }
    }
    /* 웅덩이 — 번지다 멎는다 */
    if (c.puddleT >= 0) c.puddleT += dt;
  }

  /* front=false : 바닥에 멎은 것들 (캐릭터 뒤)
     front=true  : 아직 날아다니는 것들 (캐릭터 앞) */
  function drawCrash(g, front) {
    const c = S.crash;
    if (!c) return;
    const C = CFG.crash;
    g.save();
    toppleCam(g);                             // 캐릭터와 똑같은 카메라
    /* 웅덩이가 제일 아래 */
    if (!front && c.puddleT >= 0) {
      const r = (C.puddle[0] + C.puddle[1] * c.left) * C.M *
                (1 - Math.exp(-c.puddleT * 3));
      g.save();
      g.globalAlpha = 0.92;
      /* 그릇 밑에만 있으면 쓰러진 몸에 가린다 — 앞쪽(아래)으로 흘러나오게 */
      chunk(g, ngon(c.px - c.dir * r * 0.5, 96, r * 1.45, r * 0.38, 18, 0.4), "#B2411B", null);
      g.globalAlpha = 0.82;
      chunk(g, ngon(c.px - c.dir * r * 1.25, 150, r * 0.7, r * 0.2, 12, 1.1), "#C44B20", null);
      g.restore();
    }
    /* 바닥에 눌어붙은 국물 자국 */
    for (const d of c.drops) {
      if (!d.down || front) continue;
      g.save(); g.globalAlpha = 0.85;
      chunk(g, ngon(d.x, d.y + 2, d.r * 2.6, d.r * 0.4, 9, 0), "#B5431D", null);
      g.restore();
    }
    /* 흩어진 건더기 */
    for (const o of c.bits) {
      if (o.down === front) continue;
      g.save();
      g.translate(o.x, o.y);
      g.rotate(o.rot);
      drawIng(g, o.t);
      g.restore();
    }
    /* 날아가는 국물 방울 */
    for (const d of c.drops) {
      if (d.down || !front) continue;
      if (!put(g, "fx/fx-soup-splash-small", d.x, d.y, d.r * 6, { rot: d.x * 0.01 }))
        chunk(g, ngon(d.x, d.y, d.r, d.r * 1.2, 7, 0), "#D8381F", "#B32C17");
    }
    /* 그릇 — 뒤집혀 구른다 */
    const b = c.bowl;
    const P2 = S.preset;
    if (b.down === front) { g.restore(); return; }
    g.save();
    g.translate(b.x, b.y - P2.vis * 0.3);
    g.rotate(b.rot);
    if (!put(g, "bowl/bowl-outer", 0, 0, P2.R * BOWL_ART)) {
      chunk(g, [[-P2.R - 10, -P2.vis * 0.5], [P2.R + 10, -P2.vis * 0.5],
                [P2.R * 0.58, P2.vis * 0.56], [-P2.R * 0.58, P2.vis * 0.56]],
        "#F2F3F5", "#D5D8DE");
    }
    g.restore();
    g.restore();
  }



  /* ============================================================
     그리기 — 그릇과 국물
       국물은 PNG 를 돌리지 않는다. 그릇 안쪽에 클립을 걸고,
       기운 수면선 아래만 칠한다. 수면은 soupAngle 로 눕는다.
     ============================================================ */
  function drawBowl(g) {
    const P = S.preset;
    const h = handPoint();
    g.save();
    g.translate(VIEW.offX, 0);
    g.rotate(S.bikeAngle * RAD);
    g.translate(h.x, h.y);
    const dr = drinkRot();                               // 마실 때 기울이는 각
    g.rotate((S.bowlAngle - S.bikeAngle) * RAD + dr);    // 그릇은 제 각도로 매달린다

    const R = P.R, D = P.vis;            // 그림은 보이는 깊이로
    /* 그릇 안쪽 — 국물을 여기에 가둔다. 그림이 있으면 그림의 입 모양(타원),
       없으면 도형 그릇의 사다리꼴. */
    const real = has("bowl/bowl-outer");
    let inner, surfTop, surfDepth, halfR;
    if (real) {
      /* 그림을 쟀을 때 입(흰 안쪽)이 보이는 상자에서 차지하는 자리 */
      const vw = R * BOWL_ART, vh = vw * BOX["bowl/bowl-outer"].h * (1 - BOX["bowl/bowl-outer"].t - BOX["bowl/bowl-outer"].b) / (BOX["bowl/bowl-outer"].w * (1 - BOX["bowl/bowl-outer"].l - BOX["bowl/bowl-outer"].r));
      /* bowl-inner-mask 를 재 보니 입이 가로:세로 = 2.69 다. 그 비율에 맞춘다. */
      const cy = -vh / 2 + vh * 0.235, rx = vw * 0.40, ry = rx / 2.69 * (vw / vh) * (vh / vw);
      inner = ngon(0, cy, rx, rx / 2.69, 22, 0);
      surfTop = cy - ry; surfDepth = ry * 2; halfR = rx;
    } else {
      inner = [[-R, -D * 0.5], [R, -D * 0.5], [R * 0.66, D * 0.5], [-R * 0.66, D * 0.5]];
      surfTop = -D * 0.5; surfDepth = D; halfR = R;
    }

    /* 바깥 */
    if (!put(g, "bowl/bowl-outer", 0, 0, R * BOWL_ART)) {
      chunk(g, [[-R - 10, -D * 0.5], [R + 10, -D * 0.5], [R * 0.58, D * 0.56],
                [-R * 0.58, D * 0.56]], "#F2F3F5", "#D5D8DE");
      /* 굽 */
      chunk(g, [[-R * 0.34, D * 0.56], [R * 0.34, D * 0.56], [R * 0.26, D * 0.76],
                [-R * 0.26, D * 0.76]], "#C9CDD5", "#B3B8C2");
    }

    /* ---- 국물 ---- */
    const lv = level();
    if (lv > 0.001) {
      /* 그릇을 기울여도 수면은 세상 기준으로 누워 있어야 한다 */
      const tilt = (S.soupAngle - S.bowlAngle) * RAD - dr;  // 그릇에서 본 수면 기울기
      const surf = surfTop + surfDepth * (1 - lv);       // 수면의 가운데 높이
      const dy = halfR * Math.tan(clamp(tilt, -1.2, 1.2)); // 좌우 끝의 높이차
      g.save();
      pathOf(g, inner); g.clip();

      /* 수면 아래 */
      g.beginPath();
      const SEG = 16;
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG, x = -halfR + 2 * halfR * u;
        const rip = Math.sin(u * 7 + S.elapsed * 7 + S.soupVel * 0.05) * Math.min(5, Math.abs(S.soupVel) * 0.12);
        const yy = surf + (u * 2 - 1) * dy + rip;
        if (i) g.lineTo(x, yy); else g.moveTo(x, yy);
      }
      g.lineTo(halfR, surfTop + surfDepth * 2); g.lineTo(-halfR, surfTop + surfDepth * 2); g.closePath();
      g.fillStyle = "#D8381F"; g.fill();
      /* 기름빛 — 수면 바로 아래를 조금 밝게 */
      g.save(); g.clip();
      g.fillStyle = "rgba(255,150,60,.30)";
      g.fillRect(-halfR, surf - Math.abs(dy) - 4, halfR * 2, 16 + Math.abs(dy) * 2);
      g.restore();

      /* 건더기 — 수면에 떠 있고 수면과 같이 눕는다 */
      for (const it of S.ing) {
        const x = it.u * halfR * 0.82;
        const y = surf + it.u * dy + it.dep * D * 0.5
                + Math.sin(S.elapsed * 3 + it.bob) * 3;
        g.save(); g.translate(x, y); g.rotate(tilt + it.rot);
        drawIng(g, it.t);
        g.restore();
      }

      /* 수면선 + 반짝임 */
      g.strokeStyle = "rgba(255,196,120,.75)"; g.lineWidth = 5;
      g.beginPath(); g.moveTo(-halfR, surf - dy); g.lineTo(halfR, surf + dy); g.stroke();
      g.fillStyle = "rgba(255,255,255,.35)";
      pathOf(g, ngon(-halfR * 0.3, surf - dy * 0.3 + 10, 26, 6, 7, 0)); g.fill();
      g.restore();
    }

    /* 테두리 — 그림에는 이미 들어 있다. 도형 그릇일 때만 따로 얹는다. */
    if (!real) {
      chunk(g, box(0, -D * 0.5, R * 2.16, 22, 7), "#FFFFFF", "#DADDE4");
      chunk(g, box(0, -D * 0.5, R * 2.16, 8, 3), "#E24B3A", null);
    }

    /* 넘치기 직전 테두리가 붉어진다 */
    if (S.overflow > 0.01) {
      g.save();
      g.strokeStyle = "rgba(255,120,60," + (0.35 + S.overflow * 0.65).toFixed(2) + ")";
      g.lineWidth = 7; g.lineCap = "round";
      g.beginPath();
      g.moveTo(-halfR, surfTop - 12);
      g.lineTo(halfR, surfTop - 12);
      g.stroke();
      g.restore();
    }
    g.restore();
  }

  function drawIng(g, t) {
    const w = t.w, h = t.h;
    if (t.kind === "noodle") {
      g.strokeStyle = t.col; g.lineWidth = 6; g.lineCap = "round";
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(-w / 2, i * 5);
        g.quadraticCurveTo(0, i * 5 + 9, w / 2, i * 5 - 2);
        g.stroke();
      }
    } else if (t.kind === "leaf") {
      chunk(g, [[-w / 2, 0], [-w * 0.2, -h / 2], [w * 0.36, -h * 0.3],
                [w / 2, h * 0.2], [0, h / 2]], t.col, t.dark);
    } else if (t.kind === "sheet") {
      chunk(g, [[-w / 2, -h / 2], [w / 2, -h * 0.3], [w / 2, h / 2], [-w / 2, h * 0.3]],
        t.col, t.dark);
    } else if (t.kind === "bar") {
      chunk(g, box(0, 0, w, h, h * 0.4), t.col, t.dark);
    } else {
      chunk(g, ngon(0, 0, w / 2, h / 2, 8, 0.3), t.col, t.dark);
    }
  }

  /* ============================================================
     그리기 — FX / 글자 / 디버그
     ============================================================ */
  function drawFx(g) {
    for (const f of S.fx) {
      const a = clamp(f.life / CFG.fx.life, 0, 1);
      g.save(); g.globalAlpha = a;
      if (f.kind === "drop") {
        if (!put(g, "fx/fx-soup-splash-small", f.x, f.y, f.r * 7, { rot: f.rot * 0.2 }))
          chunk(g, ngon(f.x, f.y, f.r, f.r * 1.25, 7, f.rot), "#D8381F", "#B32C17");
      } else if (f.kind === "pop") {
        g.globalAlpha = a * 0.9;
        g.fillStyle = "#FFCE1F";
        g.font = "800 58px Pretendard, sans-serif";
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText("+1", f.x, f.y - (1 - a) * 60);
      } else {
        g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 5;
        g.beginPath(); g.arc(f.x, f.y, (1 - a) * 90 + 10, 0, 6.3); g.stroke();
      }
      g.restore();
    }
  }

  function drawMsg(g) {
    if (!S.msg || S.msgLeft <= 0) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.save();
    const sm = S.msgSmall;
    g.globalAlpha = Math.min(1, S.msgLeft * 3) * (sm ? 0.72 : 1);
    const size = sm ? Math.max(13, Math.min(W * 0.05, H * 0.026))
                    : Math.max(20, Math.min(W * 0.1, H * 0.052));
    g.font = "800 " + size + "px Pretendard, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = Math.max(4, size * 0.24); g.strokeStyle = "rgba(0,0,0,.5)";
    const y = sm ? H * 0.22 : H * 0.3;
    g.strokeText(S.msg, W / 2, y);
    g.fillStyle = sm ? "#FFB84D" : "#FFCE1F";
    g.fillText(S.msg, W / 2, y);
    g.restore();
  }

  function drawDebug(g) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.save();
    g.font = "700 12px monospace"; g.textAlign = "left"; g.textBaseline = "top";
    const rows = [
      "state      " + S.state,
      "bikeAngle  " + S.bikeAngle.toFixed(2),
      "bowlAngle  " + S.bowlAngle.toFixed(2),
      "soupAngle  " + S.soupAngle.toFixed(2),
      "soupVel    " + S.soupVel.toFixed(1),
      "soupAmount " + S.amount.toFixed(1),
      "push       " + S.push.toFixed(2),
      "eatCool    " + S.eatCool.toFixed(2),
      "eatBand    " + S.eatBand + (S.eating ? " (먹는 중)" : ""),
      "balanceDng " + (Math.abs(S.th) / BK.FALL).toFixed(2),
      "wheelV     " + S.wv.toFixed(2) + " / " + BK.VMAX,
      "burn       " + S.burn.toFixed(2),
      "overflow   " + S.overflow.toFixed(2),
      "fps        " + S.fps.toFixed(0),
    ];
    g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(6, 6, 190, rows.length * 15 + 10);
    g.fillStyle = "#9BF";
    rows.forEach((t, i) => g.fillText(t, 12, 12 + i * 15));
    g.restore();
  }

  /* 누우면 가로로 길어진다 — 그만큼 당겨서 화면에 담는 카메라.
     캐릭터도 쏟아진 것들도 이걸 똑같이 쓴다. 안 그러면 서로 어긋나 보인다. */
  function toppleCam(g) {
    let k = fitScale();
    if (S.topple) {
      const p = S.toppleT;
      g.translate(-S.fallDir * p * CFG.topple.pan, -p * CFG.topple.lift);
      k *= 1 - p * CFG.topple.shrink;
    }
    g.scale(k, k);
  }

  function render() {
    if (!W || !H) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    world(g);
    if (S.shake > 0) g.translate(rnd(-1, 1) * 14 * S.shake / 0.3, 0);

    drawSky(g);
    drawCity(g);
    drawRoad(g);
    /* 바닥에 멎은 것들은 캐릭터 뒤에 깐다 (엎어진 그릇이 얼굴을 덮지 않게) */
    if (S.crash) drawCrash(g, false);
    /* 캐릭터와 그릇은 한 덩어리로 — 좁은 화면에서는 같이 줄어든다 */
    g.save();
    toppleCam(g);
    /* 9 그릇 -> 10 젓가락 -> 11 그릇 쥔 손. 뒤에서 앞으로만 간다. */
    drawPlayer(g);
    if (!S.crash) {
      drawBowlHand(g);                    // 받치는 손이 먼저 — 그릇이 손을 덮는다
      drawBowl(g);
      drawEatTool(g);
    }
    drawFx(g);
    g.restore();
    /* 아직 날아다니는 것들은 캐릭터 앞에 */
    if (S.crash) drawCrash(g, true);
    drawMsg(g);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);   // 버튼은 흔들려서는 안 된다
    drawPads(g);
    if (DEBUG_MODE) drawDebug(g);
  }

  /* ============================================================
     조작 버튼 — 원작처럼 그림 안 아래쪽에 고정. 늘 보인다.
     ============================================================ */
  /* 화면(= CSS px) 기준 자리. 좁은 폰에서도 손가락이 닿는 크기로 줄인다. */
  function pads() {
    const C = CFG.pad, w = W, h = H;      // W·H 는 이미 CSS px 다 (world 가 dpr 을 곱한다)
    const r = clamp(Math.min(w * 0.125, h * 0.072), C.r[0], C.r[1]);
    const y = h - r - h * C.up;
    return [
      { id: "left",  x: w * C.side,       y: y,            r: r },
      { id: "eat",   x: w * 0.5,          y: y - r * 0.08, r: r * C.big },
      { id: "right", x: w * (1 - C.side), y: y,            r: r },
    ];
  }
  /* 화면을 세로 3등분 — 어느 열을 눌러도 그 버튼이다 (원작 padAt) */
  function padAt(u) { return u < 1 / 3 ? "left" : u > 2 / 3 ? "right" : "eat"; }

  const padShown = () => S.state === ST.PLAY || S.state === ST.GO;

  function drawPads(g) {
    if (!padShown()) return;
    for (const p of pads()) {
      const on = p.id === "eat" ? (S.eating || S.eatBuf > 0)
               : p.id === "left" ? S.heldL : S.heldR;
      g.save();
      g.globalAlpha = on ? 1 : CFG.pad.dim;
      if (p.id === "eat" && !S.eating && S.eatCool > 0) g.globalAlpha = CFG.pad.dim * 0.55;
      const y = p.y + (on ? 3 : 0);
      if (!put(g, "ui/ui-btn-" + p.id, p.x, y, p.r * 2)) {
        /* 그림이 없으면 원작처럼 도형으로 — 깨진 그림을 만들지 않는다 */
        g.beginPath(); g.arc(p.x, y, p.r, 0, 6.2832);
        g.fillStyle = on ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.22)";
        g.fill();
        g.lineWidth = 4; g.strokeStyle = "rgba(255,255,255,.8)"; g.stroke();
        g.fillStyle = "#fff";
        if (p.id === "eat") {
          g.font = "800 " + Math.round(p.r * 0.46) + "px Pretendard, sans-serif";
          g.textAlign = "center"; g.textBaseline = "middle";
          g.fillText("먹기", p.x, y);
        } else {
          const sg = p.id === "left" ? -1 : 1;
          g.beginPath();
          g.moveTo(p.x + sg * p.r * 0.42, y);
          g.lineTo(p.x - sg * p.r * 0.24, y - p.r * 0.42);
          g.lineTo(p.x - sg * p.r * 0.24, y + p.r * 0.42);
          g.closePath(); g.fill();
        }
      }
      /* 먹는 중이면 테두리로 진행을 보여 준다 (원작과 같다) */
      if (p.id === "eat" && S.eating) {
        g.beginPath();
        g.arc(p.x, y, p.r + 5, -Math.PI / 2, -Math.PI / 2 + 6.2832 * clamp(S.eatT, 0, 1));
        g.strokeStyle = "#FFF"; g.lineWidth = 5; g.lineCap = "round"; g.stroke();
      }
      /* 지금 먹으면 어떻게 되는지 — 테두리 색으로만 (화면을 안 어지럽히게) */
      if (p.id === "eat" && !S.eating && S.eatCool <= 0 &&
          (S.eatBand === "WARN" || S.eatBand === "RISK")) {
        g.beginPath(); g.arc(p.x, y, p.r + 5, 0, 6.2832);
        g.strokeStyle = S.eatBand === "RISK" ? "#E8463A" : "#F5B82E";
        g.lineWidth = 4; g.stroke();
      }
      g.restore();
    }
  }

  /* ============================================================
     HUD — 숫자가 바뀔 때만 DOM 을 건드린다
     ============================================================ */
  const hud = { sc: -1, band: null };
  /* 플레이 화면에 남는 건 점수 하나와 먹기 버튼 색뿐이다.
     원작처럼 비워 두려고 미터·시간·콤보·경고 배너를 전부 뺐다.
     (점수와 콤보는 계속 계산된다 — 결과 화면에서 쓴다) */
  function paintHud(force) {
    /* 원작처럼 '몇 입 중 몇 입' 만 보여 준다 */
    const n = S.bites;
    if (force || n !== hud.sc) { hud.sc = n; $("scoreNum").textContent = n + " / " + NEED; }
    /* 먹기 버튼 색은 캔버스가 직접 그린다 (drawPads) — DOM 을 안 건드린다 */
  }

  /* ============================================================
     입력 — 좌우 두 개뿐. 먹기 버튼은 없다.
     ============================================================ */
  function setInput() { S.input = (S.heldR ? 1 : 0) - (S.heldL ? 1 : 0); }
  function hold(side, on) {
    if (side < 0) S.heldL = on; else S.heldR = on;
    setInput();
    if (on) sfx("button");
  }
  /* 가운데 먹기 버튼 — 탭할 때마다 한 입 */
  function pressEat() {
    if (S.state !== ST.PLAY) return;
    S.eatPressed = true;
  }

  /* 원작처럼 화면을 세로 3등분한다 — 왼쪽 열 / 가운데(먹기) / 오른쪽 열.
     버튼 동그라미를 정확히 안 눌러도 그 열이면 먹힌다. */
  const cvHold = new Map();                            // pointerId -> 어느 쪽
  cv.addEventListener("pointerdown", e => {
    e.preventDefault();
    if (!padShown()) return;
    const r = cv.getBoundingClientRect();
    const id = padAt((e.clientX - r.left) / (r.width || 1));
    if (id === "eat") { pressEat(); return; }
    const side = id === "left" ? -1 : 1;
    cv.setPointerCapture?.(e.pointerId);
    cvHold.set(e.pointerId, side);
    hold(side, true);
  });
  const cvUp = e => {
    const side = cvHold.get(e.pointerId);
    if (side === undefined) return;
    cvHold.delete(e.pointerId);
    hold(side, false);
  };
  cv.addEventListener("pointerup", cvUp);
  cv.addEventListener("pointercancel", cvUp);
  addEventListener("keydown", e => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") hold(-1, true);
    if (k === "ArrowRight" || k === "d" || k === "D") hold(1, true);
    if (k === " " || k === "Spacebar") {
      e.preventDefault();
      if (e.repeat) return;              // 누르고 있어도 한 번만 — 연속 먹기 금지
      pressEat();
    }
  });
  addEventListener("keyup", e => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") hold(-1, false);
    if (k === "ArrowRight" || k === "d" || k === "D") hold(1, false);

  });
  addEventListener("blur", () => {
    cvHold.clear();
    hold(-1, false); hold(1, false);
  });

  /* ============================================================
     결과
     ============================================================ */
  let lastArt = null, lastInfo = null;
  function showResult() {
    if (S.state === ST.RESULT) return;
    S.state = ST.RESULT;
    const sc2 = scoreOf();
    const G = gradeFor(sc2.total);
    const rec = sc2.total > S.best;

    $("resWhy").textContent = S.why;
    $("rScore").textContent = scoreText();
    $("newRec").hidden = !rec;
    $("rBite").textContent = S.cleared
      ? NEED + "입 다 먹음" : S.bites + " / " + NEED + "입";
    $("remark").textContent = pick(G.says);

    const artc = snapResult();
    const bx = $("resultArt");
    bx.innerHTML = ""; bx.appendChild(artc);
    lastArt = artc;
    lastInfo = { bites: S.bites, soup: Math.round(S.amount), grade: G,
                 time: S.elapsed.toFixed(1), score: S.score };
    void G;

    if (rec) { S.best = sc2.total; sfx("result"); }
    S.bestBite = Math.max(S.bestBite, S.bites);
    try {
      localStorage.setItem("ccojik_malatang_score", String(S.best));
      localStorage.setItem("ccojik_malatang_bite", String(S.bestBite));
    } catch (_) {}
    paintBest();
    sfx("result");
    $("endOver").hidden = false;
  }

  /* 타이틀·결과·공유 카드가 같이 쓰는 틀.
     캐릭터+그릇은 가로로 -210~330, 세로로 -820~0 을 쓴다. */
  const POSE = { x0: -210, x1: 330, y0: -820, y1: 0 };
  function posePaint(g, w, h, pad) {
    const m = pad === undefined ? 10 : pad;
    const k = Math.min((w - m * 2) / (POSE.x1 - POSE.x0),
                       (h - m * 2) / (POSE.y1 - POSE.y0));
    const cx = (POSE.x0 + POSE.x1) / 2;
    g.setTransform(k, 0, 0, k, w / 2 - cx * k, h - m);
    drawPlayerFlat(g);
    return k;
  }

  /* 결과 그림 — 지금 자세 그대로 한 장 */
  function snapResult() {
    const c = document.createElement("canvas");
    c.width = 420; c.height = 300;
    posePaint(c.getContext("2d"), 420, 300);
    return c;
  }
  /* 타이틀·결과용 — 흔들림 없이 반듯하게 한 장 */
  function drawPlayerFlat(g) {
    const keep = { b: S.bikeAngle, bo: S.bowlAngle, so: S.soupAngle, e: S.eatLean, w: S.wheelSpin };
    S.bikeAngle = 0; S.bowlAngle = 0; S.soupAngle = 0; S.eatLean = 0; S.wheelSpin = 0.6;
    drawPlayer(g);
    drawBowl(g);
    S.bikeAngle = keep.b; S.bowlAngle = keep.bo; S.soupAngle = keep.so;
    S.eatLean = keep.e; S.wheelSpin = keep.w;
  }

  function paintBest() {
    const t = S.best > 0 ? S.best + "점 · " + S.bestBite + "입" : "-";
    $("bestStart").textContent = "BEST " + t;
    $("bestEnd").textContent = "BEST " + t;
  }

  function buildCard() {
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1350;
    const g = c.getContext("2d");
    g.fillStyle = "#1B2030"; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = "#FFCE1F"; g.fillRect(0, 0, 1080, 16); g.fillRect(0, 1334, 1080, 16);
    g.textAlign = "center"; g.fillStyle = "#FFFFFF";
    g.font = "800 60px Pretendard, sans-serif";
    g.fillText("외발자전거 타고", 540, 144);
    g.fillText("마라탕 먹기", 540, 220);
    if (lastArt) {
      const w = 760, h = lastArt.height / lastArt.width * w;
      g.drawImage(lastArt, 540 - w / 2, 290, w, h);
    }
    const i = lastInfo || { bites: 0, soup: 0, grade: GRADES[4], time: "0.0" };
    g.font = "800 190px Pretendard, sans-serif";
    g.fillText(i.bites + "입", 540, 1000);
    g.font = "800 48px Pretendard, sans-serif";
    g.fillStyle = "#AEB6C6";
    g.fillText("남은 국물 " + i.soup + "% · " + i.time + "초", 540, 1072);
    g.font = "800 60px Pretendard, sans-serif";
    g.fillStyle = "#FFCE1F";
    g.fillText(i.grade.title, 540, 1168);
    g.font = "800 42px Pretendard, sans-serif";
    g.fillStyle = "#8A93A6";
    g.fillText("꼬직", 540, 1262);
    return c;
  }

  async function shareResult() {
    const card = buildCard();
    const blob = await new Promise(r => card.toBlob(r, "image/png"));
    if (!blob) return;
    const file = new File([blob], "ccojik-malatang.png", { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: "꼬직 · 외발자전거 타고 마라탕 먹기" });
        return;
      }
    } catch (_) {}
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ccojik-malatang.png"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return;
    } catch (_) {}
    try { await navigator.clipboard.writeText(location.href); } catch (_) {}
  }

  /* ============================================================
     타이틀 그림
     ============================================================ */
  function drawHero() {
    const c = $("heroCv"), g = c.getContext("2d");
    const w = c.width || 420, h = c.height || 300;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    const keep = S.preset;
    S.preset = PRESETS[clamp(LEVEL, 0, PRESETS.length - 1)];
    posePaint(g, w, h);
    S.preset = keep;
  }

  /* ============================================================
     루프
     ============================================================ */
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!fitCanvas()) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);   // 탭 복귀에 한 번에 안 튀게
    last = now;
    S.fpsN++; S.fpsT += dt;
    if (S.fpsT >= 0.5) { S.fps = S.fpsN / S.fpsT; S.fpsN = 0; S.fpsT = 0; }
    step(dt);
    if (S.state === ST.PLAY || S.state === ST.GO) paintHud(false);
    render();
  }

  /* ============================================================
     시작
     ============================================================ */
  /* 난이도 — 시작 화면에서 고른다 (커피 / 마라탕 / 마라탕 가득) */
  function paintPicks() {
    const bs = $("picks").children;
    for (let i = 0; i < bs.length; i++) bs[i].classList.toggle("on", i === LEVEL);
    drawHero();                              // 고른 그릇으로 타이틀 그림을 다시
  }
  for (const b2 of $("picks").children) {
    b2.addEventListener("click", () => {
      LEVEL = +b2.getAttribute("data-lv") || 0;
      try { localStorage.setItem("ccojik_malatang_lv", String(LEVEL)); } catch (_) {}
      sfx("button");
      paintPicks();
    });
  }

  $("startBtn").addEventListener("click", () => { sfx("button"); start(false); });
  $("againBtn").addEventListener("click", () => { sfx("button"); start(true); });
  $("shareBtn").addEventListener("click", shareResult);

  try {
    S.best = +(localStorage.getItem("ccojik_malatang_score") || 0);
    S.bestBite = +(localStorage.getItem("ccojik_malatang_bite") || 0);
    const lv = localStorage.getItem("ccojik_malatang_lv");
    if (lv !== null) LEVEL = clamp(+lv, 0, PRESETS.length - 1);
  } catch (_) {}

  $("startBtn").disabled = true;
  loadAssets(
    p => { $("loadFill").style.width = Math.round(p * 100) + "%"; },
    () => {
      $("loadOver").hidden = true;
      $("startOver").hidden = false;
      $("startBtn").disabled = false;
      fitCanvas();
      paintBest();
      paintPicks();
      paintHud(true);
    }
  );
  requestAnimationFrame(frame);

  /* 검사용 — 바깥에서 속을 들여다본다 */
  window.__malatang = () => ({
    S, CFG, PRESETS, GRADES, ING, ST, IMG, SFX, DEBUG_MODE, REF_H, GROUND,
    start, step, fall, endRun, showResult, scoreOf, scoreText, gradeFor, canEat, eatBand, tryEat, pressEat,
    eatGap,
    setLevel: v => { LEVEL = v; }, getLevel: () => LEVEL,
    applyLevel, getNeed: () => NEED, getBK: () => BK, getHT: () => HT,
    spillOver, level, stepBike, stepBowl, stepSoup, stepSpill, stepEat,
    handPoint, bowlRim, choosePreset, fillIng, addFx, stepFx, say, paintHud, drawHero,
    snapResult, buildCard, shareResult, render, loadAssets, has, drawBowlHand,
    BOX, JOINT, put, VIEW, fitScale, CURB, SKYLINE,
    posePaint, POSE, PART, drawEatTool, tileRow,
    startCrash, stepCrash, drawCrash, bowlWorld,
    startRag, stepRag, drawRag, rigPts, BASE, PART_LAYOUT, CALIB, calibFreeze,
    LEG_TOP, HEAD_Y, limb, CRANK, CRANK0,
    startDone, stepDone, drinkPose, drinkRot, gulpRot,
    pads, padAt, drawPads, padShown,
    getW: () => W, getH: () => H,
  });
})();
