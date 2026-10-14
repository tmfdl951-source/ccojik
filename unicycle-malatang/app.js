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
    duration: 45,                        // 한 판 (초)
    hotAt: 10,                           // 남은 시간이 이보다 적으면 빨갛게

    /* 외발자전거 — 역진자. 안 밀면 기울어진 쪽으로 더 기운다. */
    bike: {
      control: 110,                      // 버튼 한쪽을 누를 때 밀어 주는 힘 (도/s^2)
      ramp: 0.16,                        // 누른 힘이 다 실리기까지 (초). 몸이 기우는 데
                                         // 시간이 걸려야 보정이 넘친다 — 이게 손맛이다
      gravity: 4.8,                      // 넘어지려는 힘 (g/L, 1/s^2)
      damp: 1.3,                         // 각속도 감쇠
      maxAngle: 38,                      // 이보다 기울면 전복
      bump: 22,                          // 노면 턱 한 번의 충격 (도/s)
      bumpGap: [0.7, 1.6],               // 턱이 오는 간격 (초)
      lean: 0.55,                        // 기울어진 쪽으로 자전거가 굴러가는 정도
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

    /* 먹기 — 가운데 버튼(또는 Space)을 눌러야만 먹는다. 저절로는 안 먹는다. */
    eat: {
      cooldown: 0.10,                    // 한 입 먹고 다음 입까지 (아주 짧게)
      duration: 0.46,                    // 한 입에 걸리는 시간
      biteAt: 0.58,                      // 그 중 입에 넣는 시점 (0~1)
      buffer: 0.30,                      // 누른 것을 이만큼 들고 있다가 되는 즉시 먹는다.
                                         // 조금 빨리 눌러도 삼켜지지 않게.
      gap: [0.14, 0.74],                 // 이 구간에는 균형 보정이 둔해진다
      gapPower: 0.55,                    // 그동안 보정이 먹히는 비율 (0 이면 완전 차단)
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
      lie: 88,                           // 다 누웠을 때의 각도
      push: 300,                         // 넘어가는 가속 (도/s^2)
      bounce: 0.26,                      // 땅에 닿고 튕기는 정도
      stop: 55,                          // 이보다 느려지면 그대로 멎는다
      hold: 0.55,                        // 누운 채로 잠깐 멈췄다가 결과로
    },

    fx: { max: 26, life: 0.7 },
    sfxGap: 70,                          // 같은 소리가 겹쳐 터지지 않게 (ms)
  };

  /* 그릇 — 시작 화면에서 고른다. 크고 가득 찰수록 어렵다.
     레퍼런스처럼 커피(쉬움) / 마라탕(보통) / 마라탕 가득(어려움) 셋. */
  const PRESETS = [
    /* depth 는 '넘치기 계산' 용 머리 공간이고, vis 는 '그림' 깊이다.
       둘을 한 값으로 쓰면 쏟기를 맞출 때 그릇이 쟁반처럼 납작해진다.
       넘치기 시작하는 수면차: 작은 그릇 12도 / 보통 7도 / 큰 5도 / 대야 4도 */
    /* grav 은 CFG.bike.gravity 에 곱한다 — 큰 그릇일수록 더 잘 넘어간다 */
    { key: "COFFEE", label: "커피",        R: 92,  depth: 56, vis: 88,  fill: 0.60, wobble: 0.70, spill: 0.82, grav: 0.88, cup: true },
    { key: "NORMAL", label: "마라탕",      R: 128, depth: 72, vis: 112, fill: 0.78, wobble: 1.00, spill: 1.00, grav: 1.00 },
    { key: "FULL",   label: "마라탕 가득", R: 160, depth: 84, vis: 138, fill: 0.90, wobble: 1.34, spill: 1.24, grav: 1.16 },
  ];

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
    "player/player-head":            { w: 1254, h: 1254, l: 0.163, t: 0.098, r: 0.163, b: 0.084 },
    "player/player-torso":           { w: 1254, h: 1254, l: 0.180, t: 0.164, r: 0.179, b: 0.139 },
    "player/player-arm-upper-left":  { w: 1254, h: 1254, l: 0.212, t: 0.184, r: 0.210, b: 0.177 },
    "player/player-arm-upper-right": { w: 1254, h: 1254, l: 0.238, t: 0.190, r: 0.240, b: 0.202 },
    "player/player-arm-lower-left":  { w: 1254, h: 1254, l: 0.148, t: 0.190, r: 0.147, b: 0.161 },
    "player/player-arm-lower-right": { w: 1254, h: 1254, l: 0.174, t: 0.185, r: 0.175, b: 0.180 },
    "unicycle/unicycle-wheel":       { w: 1254, h: 1254, l: 0.137, t: 0.144, r: 0.137, b: 0.126 },
    "unicycle/unicycle-frame":       { w: 1086, h: 1448, l: 0.325, t: 0.104, r: 0.305, b: 0.102 },
    "unicycle/unicycle-seat":        { w: 1536, h: 1024, l: 0.207, t: 0.331, r: 0.183, b: 0.282 },
    "bowl/bowl-outer":               { w: 1448, h: 1086, l: 0.115, t: 0.246, r: 0.115, b: 0.191 },
    "bowl/bowl-inner-mask":          { w: 1254, h: 1254, l: 0.048, t: 0.332, r: 0.047, b: 0.332 },
    "bowl/soup-fill":                { w: 1254, h: 1254, l: 0.050, t: 0.365, r: 0.050, b: 0.321 },
    "bowl/chopsticks":               { w: 1254, h: 1254, l: 0.093, t: 0.135, r: 0.119, b: 0.116 },
    "bowl/ing-noodle":               { w: 1254, h: 1254, l: 0.359, t: 0.059, r: 0.321, b: 0.076 },
    "background/bg-road":            { w: 1448, h: 1086, l: 0.000, t: 0.000, r: 0.000, b: 0.000 },
    "background/bg-building-row-1":  { w: 1448, h: 1086, l: 0.016, t: 0.244, r: 0.000, b: 0.335 },
    "fx/fx-soup-splash-small":       { w: 1254, h: 1254, l: 0.251, t: 0.286, r: 0.092, b: 0.319 },
  };
  /* 길쭉한 조각은 그림 안에서 비스듬히 누워 있다. 어깨->팔꿈치 선에 맞춰
     돌려 붙이려면 '어느 방향으로 길고 그 길이가 얼마인지' 를 알아야 한다. */
  const BONE = {
    "player/player-arm-upper-left":  { a: 51.1, len: 918,  cx: 0.497, cy: 0.505 },
    "player/player-arm-upper-right": { a: 55.7, len: 822,  cx: 0.495, cy: 0.484 },
    "player/player-arm-lower-left":  { a: 40.6, len: 1088, cx: 0.481, cy: 0.544 },
    "player/player-arm-lower-right": { a: 43.9, len: 1029, cx: 0.488, cy: 0.525 },
    "unicycle/unicycle-frame":       { a: -88.8, len: 1152, cx: 0.496, cy: 0.535 },
  };

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
  const ST = { TITLE: "TITLE", READY: "READY", GO: "GO", PLAY: "PLAY",
               FALL: "FALL", OVER: "OVER", RESULT: "RESULT" };

  const S = {
    state: ST.TITLE,
    preset: PRESETS[1],
    left: CFG.duration, elapsed: 0,
    readyLeft: 0, goLeft: 0,

    bikeAngle: 0, bikeVel: 0,
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
    S.left = CFG.duration; S.elapsed = 0;
    S.bikeAngle = rnd(-1.2, 1.2); S.bikeVel = 0;
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
    S.topple = false; S.fallDir = 1; S.landed = 0;
    S.fx.length = 0; S.shake = 0; S.flash = 0;
    S.msg = ""; S.msgLeft = 0; S.msgSmall = false; S.why = "";
    $("startOver").hidden = true; $("endOver").hidden = true;
    paintHud(true);
    if (skipReady) { S.state = ST.PLAY; say("GO!"); }
  }

  /* ============================================================
     물리 — 몸 -> 그릇 -> 국물 순으로 전해진다
     ============================================================ */
  function stepBike(dt) {
    const B = CFG.bike;
    /* 역진자 — 기울수록 더 기운다. 가만두면 반드시 넘어진다. */
    /* 그릇이 클수록 넘어지려는 힘도 세다 */
    let acc = B.gravity * (S.preset.grav || 1) * Math.sin(S.bikeAngle * RAD) * DEG;
    /* 버튼 — 왼쪽(-1)을 누르면 왼쪽으로 기운다.
       누른 힘이 바로 실리지 않는다. 몸이 기우는 데 시간이 걸리니
       급하게 눌렀다 떼면 반드시 지나친다.
       먹는 동안에는 손이 그릇·젓가락에 가 있어서 보정이 안 먹는다 —
       이게 이 게임의 딜레마다. 먹는 0.78초가 그대로 빈틈이 된다. */
    const want = S.input * (eatGap() ? CFG.eat.gapPower : 1);
    S.push += (want - S.push) * Math.min(1, dt / B.ramp);
    acc += S.push * B.control;
    /* 먹는 동안에는 손이 나가 있어서 계속 그릇 쪽으로 끌린다 */
    if (S.eating) acc += CFG.eat.kick[S.eatBand] * 1.1;
    S.bikeVel += acc * dt;
    S.bikeVel -= S.bikeVel * B.damp * dt;
    S.bikeAngle += S.bikeVel * dt;

    /* 노면 턱 — 뒤로 갈수록 자주, 그릇이 클수록 세게 */
    if (S.state === ST.PLAY) {
      /* 먹느라 손을 뗀 동안에는 턱이 오지 않는다 — 그건 운이지 실력이 아니다 */
      if (!eatGap()) S.bumpIn -= dt * (1 + S.elapsed / CFG.duration * 0.6);
      if (S.bumpIn <= 0) {
        const k = B.bump * S.preset.wobble * rnd(0.6, 1.1);
        S.bikeVel += (Math.random() < 0.5 ? -1 : 1) * k;
        S.bumpIn = rnd(B.bumpGap[0], B.bumpGap[1]);
        addFx("bump", 0, -14, 0);
      }
    }
    /* 기울어진 쪽으로 바퀴가 굴러간다 — 배경이 그만큼 흐른다 */
    S.wheelSpin += (2.6 + S.bikeAngle * B.lean * 0.08) * dt;
    S.scroll += (170 + S.bikeAngle * 6) * dt;
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
    return S.state === ST.PLAY && !S.eating && S.eatCool <= 0 && S.amount > CFG.eat.minSoup;
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
        if (S.ing.length < 4) fillIng(9);
        addFx("pop", 0, -720, 0);
        sfx("bite"); buzz(10);
        if (S.bites % 5 === 0) { say(S.bites + "입!"); sfx("nice"); }
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
      stepBowl(dt); stepSoup(dt); stepFx(dt);
      if (S.shake > 0) S.shake -= dt;
      if (S.msgLeft > 0) S.msgLeft -= dt;
      if ((S.goLeft -= dt) <= 0) showResult();
      return;
    }
    if (S.state !== ST.PLAY) return;

    S.left = Math.max(0, S.left - dt);
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
    if (Math.abs(S.bikeAngle) >= CFG.bike.maxAngle) return fall("자전거가 넘어졌다");
    if (S.amount <= CFG.eat.minSoup) {
      /* 쏟아서 비었나, 먹어서 비었나 — 쪽이 다르면 하는 말도 달라야 한다 */
      const ate = S.bites * CFG.eat.soupPerBite;
      return endRun(ate > 100 - CFG.eat.minSoup - ate ? "그릇을 다 비웠다" : "국물이 다 쏟아졌다");
    }
    if (S.left <= 0) return endRun("시간 종료");
  }

  function fall(why) {
    S.why = why; S.state = ST.FALL;
    /* 눕는 데 걸리는 시간 + 누운 채로 잠깐 */
    S.goLeft = 0.75 + CFG.topple.hold;
    S.topple = true;
    S.fallDir = Math.sign(S.bikeAngle) || 1;
    S.landed = 0;
    S.bikeVel = Math.abs(S.bikeVel) * S.fallDir;        // 넘어가는 쪽으로 정리
    S.shake = 0.3; sfx("fall"); buzz([30, 40, 60]);
    say("넘어졌다!");
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
  /* 등급용 0~100 점수. 화면에 보이는 S.score(콤보가 붙는 점수) 와는 따로다.
     한 입이 0.56초라 45초에 최대 80입까지 나오므로 입 수의 몫을 낮게 잡는다. */
  function scoreOf() {
    const bite = Math.min(S.bites, 70) * 0.50;          // 최대 35
    const soup = clamp(S.amount, 0, 100) * 0.22;        // 최대 22
    const time = S.elapsed / CFG.duration * 18;         // 최대 18
    const calm = Math.min(S.calmBest, 14) * 0.60;       // 최대 8.4
    const combo = Math.min(S.comboBest, 20) * 0.80;     // 최대 16
    /* 쏟은 건 손해로 남아야 한다. 안 그러면 먹기만 하면 만점이 된다. */
    const mess = S.spills * 1.1;
    const total = Math.round(clamp(bite + soup + time + calm + combo - mess, 0, 100));
    return { bite, soup, time, calm, combo, mess, total };
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
     그리기 — 캐릭터
       파츠 뼈대 (명세 그대로):
       playerRoot > head / torso / scarf / arm(upper,lower,hand) x2
                    / leg(thigh,shin,foot) x2 / unicycleRoot(frame,seat,wheel,pedal x2)
     ============================================================ */
  /* 참고 이미지(assets/ref)의 색을 그대로 쓴다 — 아직 도형으로 그리는
     파츠가 들어온 3D 파츠와 따로 놀지 않게. */
  /* ---- 3/4 시점 ---- 화면 오른쪽을 살짝 바라보는 각도 */
  const VIEW = {
    turn: 0.34,              // 얼마나 돌아섰나 (0 정면 ~ 1 완전 측면)
    wheelSquash: 0.76,       // 바퀴를 가로로 누르는 정도 (사선이라 타원으로 보인다)
    cycleTilt: -0.075,       // 외발자전거가 사선으로 놓인 각도 (라디안)
    headX: 34, headRot: 0.085,  // 머리를 앞(오른쪽)으로 밀고 살짝 돌린다
    torsoX: 18, torsoRot: 0.09,
    legSplit: 38,            // 앞다리와 뒷다리의 앞뒤 간격
    backScale: 0.88,         // 뒤쪽 팔·다리를 이만큼 작게
    backDark: 0.66,          // 뒤쪽은 이만큼 어둡게
    /* 돌아선 몸은 가로로 좁아 보인다. 정면으로 그려진 그림을 눌러서 쓴다. */
    squash: 0.86,            // 머리·몸통의 가로 압축
    farShade: 0.22,          // 저편(왼쪽) 면에 얹는 그늘 (몸통에만)
    bodyFwd: 16,             // 몸이 바퀴보다 앞으로 나간 거리
    offX: -40,               // 전체를 왼쪽으로 — 그릇 쪽에 자리를 준다
    farArm: 0.84,            // 저편 팔은 짧아 보인다 (원근 단축)
  };

  /* ---- 파츠가 앉는 x 자리 ---- 전부 다르다. 이 표가 3/4 의 뼈대다.
     왼쪽(뒤) 에서 오른쪽(앞) 으로:
       몸통 -48 · 뒷다리 -31 · 머리 -18 · 뒷팔 -9 · 앞다리 +13 ·
       바퀴 +35 · 앞팔 +40 · 그릇 +230
     그리는 차례도 이 순서다 — 뒤에 있는 것이 먼저, 앞에 있는 것이 나중. */
  const PART = {
    torso: -48, backLeg: -31, head: -18, backArm: -9,
    frontLeg: 13, wheel: 35, frontArm: 40, bowl: 230,
  };
  /* 머리가 앉는 높이. 턱이 깃 안으로 들어가도록 — 맨살 목이 길게 안 보이게. */
  const HEAD_Y = -676;
  /* 앞은 크고 또렷, 뒤는 작고 어둡다 */
  const DEPTH = {
    frontLeg: { k: 1.06, a: 1 },
    backLeg:  { k: 0.86, a: 0.62 },
    frontArm: { k: 1.00, a: 1 },
    backArm:  { k: 0.91, a: 0.88 },
  };
  function atDepth(g, x, d, fn) {
    g.save();
    g.translate(x, 0);
    g.scale(d.k, d.k);
    g.globalAlpha *= d.a;
    fn();
    g.restore();
  }

  /* 둥근 면의 저편에 얹는 그늘 — 돌아선 것처럼 보이게 하는 값싼 수법 */
  function farShade(g, x, y, w, h) {
    g.save();
    g.beginPath();
    g.ellipse(x, y, w / 2, h / 2, 0, 0, 6.2832);
    g.clip();
    g.fillStyle = "#16203A";
    /* 바깥에서 안으로 갈수록 옅어지는 띠 — 한 줄로 자르면 솔기가 보인다 */
    const N = 10, band = w * 0.52 / N;
    for (let i = 0; i < N; i++) {
      g.globalAlpha = VIEW.farShade * (1 - i / N) * (1 - i / N);
      g.fillRect(x - w / 2 + i * band, y - h / 2, band + 1, h);
    }
    g.restore();
  }
  const SKIN = "#F6E3C2", SKIN_D = "#E0CBA6";       // 크림빛 얼굴·손
  const COAT = "#2E6BD4", COAT_D = "#2458B0";       // 파란 외투
  const SLEEVE = "#3C7BE4", SLEEVE_D = "#2E62BC";
  const PANT = "#55555F", PANT_D = "#43434C";       // 짙은 회색 바지 (틀보다 밝게)
  const SHOE = "#6B4A32";                           // 갈색 신발
  const REDC = "#E8463A", REDC_D = "#C3362C";       // 빨간 비니
  const SCARF = "#F0862A", SCARF_D = "#D06E1C";     // 주황 목도리
  const HEM = "#F5B82E";                            // 노란 밑단

  /* 입 자리 (플레이어 로컬) — 젓가락이 여기를 겨냥한다 */
  function mouthPoint() {
    const lean = S.eatLean;
    return { x: PART.head + lean * 10, y: HEAD_Y + lean * -6 + lean * 10 + 50 };
  }

  /* 그릇을 든 오른손의 자리 (플레이어 로컬 좌표) */
  function handPoint() {
    /* 그릇이 클수록 바깥·아래로 — 대야급이 얼굴을 덮지 않게 */
    const k = (S.preset.R - 108) / 70;
    /* 그릇은 몸통(-48) 보다 한참 앞(+230) 이다 — 앞으로 내민 자세 */
    return { x: PART.bowl + k * 22, y: -448 + k * 26 + S.eatLean * 16 };
  }
  /* 그릇 테두리의 한쪽 끝 (그릇 로컬) */
  function bowlRim(side) {
    const P = S.preset;
    const a = S.bowlAngle * RAD;
    const lx = side * P.R, ly = -P.depth * 0.5;
    return { x: lx * Math.cos(a) - ly * Math.sin(a), y: lx * Math.sin(a) + ly * Math.cos(a) };
  }

  function drawPart(g, key, x, y, w, h, fallback) { art(g, key, x, y, w, h, fallback); }

  /* 그리는 차례 = 깊이. 뒤 -> 앞 으로만 간다.
       1 뒷다리  2 바퀴  3 틀·안장·페달  4 목  5 몸통  6 어깨+뒷팔  7 머리
       8 앞다리  9 어깨+앞팔
     (그 다음은 render 에서: 9 그릇  10 젓가락  11 그릇 쥔 손) */
  function drawPlayer(g) {
    const lean = S.eatLean;
    const sway = Math.sin(S.wheelSpin * 2) * 1.4;        // 페달 밟는 좌우 흔들림
    const tx = PART.torso + lean * 16, ty = lean * -6;

    g.save();
    g.translate(VIEW.offX, 0);                           // 전체를 조금 왼쪽으로
    g.rotate(S.bikeAngle * RAD);                         // playerRoot

    /* ---- 1. 뒷다리 ---- 바퀴보다도 뒤에 있다 */
    atDepth(g, PART.backLeg, DEPTH.backLeg, () => leg(g, -1));

    /* ---- 2. 바퀴 ---- 몸통보다 앞(오른쪽). 비스듬히 보므로 가로로 눌린 타원. */
    g.save();
    g.translate(PART.wheel, 0);
    g.rotate(VIEW.cycleTilt);
    g.save();
    g.translate(0, -92);
    g.scale(VIEW.wheelSquash, 1);
    g.translate(0, 92);
    if (!put(g, "unicycle/unicycle-wheel", 0, -92, 190 / VIEW.wheelSquash, { rot: S.wheelSpin })) (() => {
      chunk(g, ngon(0, -92, 92, 92, 11, S.wheelSpin), "#3C4258", "#323850");
      chunk(g, ngon(0, -92, 56, 56, 9, -S.wheelSpin), "#5A6480", "#4A5270");
      g.save(); g.translate(0, -92); g.rotate(S.wheelSpin);
      g.strokeStyle = "#8A93A6"; g.lineWidth = 8; g.lineCap = "round";
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        g.beginPath(); g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * 78, Math.sin(a) * 78); g.stroke();
      }
      g.restore();
      chunk(g, ngon(0, -92, 17, 17, 7, 0), "#8A93A6", null);
    })();
    g.restore();
    /* 페달 — 바퀴와 같이 간다 */
    const pa = S.wheelSpin;
    for (const sgn of [-1, 1]) {
      const px = Math.cos(pa + (sgn < 0 ? Math.PI : 0)) * 64;
      const py = -92 + Math.sin(pa + (sgn < 0 ? Math.PI : 0)) * 64;
      drawPart(g, "unicycle/unicycle-pedal", px, py, 56, 18, () => {
        chunk(g, box(px, py, 56, 18, 5), "#5A6480", "#49516A");
      });
    }
    g.restore();

    /* ---- 3. 틀과 안장 ---- 바퀴(앞) 에서 안장(뒤) 으로 비스듬히 선다.
       두 x 가 다르니 틀이 저절로 사선이 된다 — 정면 대칭이 깨진다. */
    const seatX = PART.torso + 22;
    if (!bone(g, "unicycle/unicycle-frame", PART.wheel, -92, seatX, -316)) {
      chunk(g, [[PART.wheel - 26, -92], [PART.wheel + 26, -92],
                [seatX + 17, -310], [seatX - 17, -310]], "#4A5370", "#3C4460");
    }
    if (!put(g, "unicycle/unicycle-seat", seatX, -330, 160)) {
      chunk(g, box(seatX, -326, 148, 40, 14), REDC, REDC_D);
    }

    /* ---- 4. 목 ---- 몸통보다 먼저. 깃 구멍으로 비치는 자리를 메꾼다. */
    drawNeck(g, tx, ty, PART.head + lean * 10, HEAD_Y + ty + lean * 10);

    /* ---- 5. 몸통 ---- 제일 뒤쪽 x. 가로로 눌러 돌아선 폭으로. */
    if (put(g, "player/player-torso", tx, -450 + ty, 236,
            { rot: VIEW.torsoRot, sx: VIEW.squash })) {
      farShade(g, tx, -450 + ty, 236 * VIEW.squash, 258);
    } else {
      chunk(g, [[-96 + tx, -336], [96 + tx, -336], [86 + tx, -566 + ty], [-86 + tx, -566 + ty]],
        COAT, COAT_D);
      chunk(g, box(tx, -346, 192, 26, 8), HEM, HEM);              // 노란 밑단
      chunk(g, box(tx, -566 + ty, 180, 44, 14), SCARF, SCARF_D);  // 목도리
      chunk(g, box(tx - 62 + sway * 3, -524 + ty, 40, 74, 10), SCARF, SCARF_D);
    }

    /* ---- 6. 뒷팔(젓가락 쪽) ---- 몸통보다 뒤. 젓가락만 나중에 얹는다.
       상완 앞에 어깨를 얹어 팔-몸통 틈을 덮는다. */
    atDepth(g, 0, DEPTH.backArm, () => {
      drawShoulder(g, PART.backArm - 69 + lean * 10, -526 + ty, 1);
      drawArm(g, -1, tx, ty, lean, false, false, true);
    });

    /* ---- 7. 머리 ---- 몸통보다 조금 앞 */
    drawHead(g, PART.head + lean * 10, HEAD_Y + ty + lean * 10, lean);

    /* ---- 8. 앞다리 ---- 몸통보다 앞이다. 다만 외투 밑단 위로는 안 나온다.
       (명세의 깊이 순서는 지키되, 허벅지가 외투 위에 얹히면 판때기로 보인다) */
    g.save();
    g.beginPath();
    g.rect(-600, -318, 1200, 400);
    g.clip();
    atDepth(g, PART.frontLeg, DEPTH.frontLeg, () => leg(g, 1));
    g.restore();

    /* ---- 9. 앞팔(그릇 쪽) ---- 윗팔까지. 아랫팔·손은 그릇 위에 얹는다.
       여기도 어깨를 먼저 얹는다 — 앞어깨는 몸통 바깥이라 틈이 제일 크다. */
    drawShoulder(g, PART.frontArm + 38 + lean * 10, -526 + ty, 1.08);
    drawArm(g, 1, tx, ty, lean, true);

    g.restore();
  }

  /* 목 — 머리와 몸통을 잇는다. 몸통 그림의 깃 가운데가 뚫려 있어서
     몸통보다 먼저 그려야 깃이 목을 감싸는 모양이 된다.
     위는 턱 안쪽(머리에 가려지는 데)까지, 아래는 깃 한참 안쪽까지 넉넉히. */
  function drawNeck(g, tx, ty, hx, hy) {
    const top = hy + 30;                 // 턱보다 위 — 머리가 덮어 준다
    const bot = -512 + ty;               // 깃 안쪽까지만
    const wt = 92, wb = 120;
    chunk(g, [[hx - wt / 2, top], [hx + wt / 2, top],
              [tx + wb / 2, bot], [tx - wb / 2, bot]], SKIN, SKIN_D);
    /* 턱 밑 그늘 — 목이 머리 안으로 들어가 보이게 */
    g.save();
    g.globalAlpha = 0.18;
    chunk(g, ngon(hx, hy + 44, wt * 0.46, 13, 9, 0), "#8A6A44", null);
    g.restore();
  }

  /* 어깨 — 상완이 몸통에 붙는 자리를 외투색으로 메꾼다 */
  function drawShoulder(g, x, y, k) {
    chunk(g, ngon(x, y, 38 * k, 36 * k, 10, 0.3), COAT, COAT_D);
  }

  /* 다리 한 짝 — 페달 위상만 sgn 으로 다르다. 자리와 크기는 바깥에서 준다. */
  function leg(g, sgn) {
    const ph = S.wheelSpin + (sgn < 0 ? Math.PI : 0);
    const kx = sgn * 52, ky = -232 + Math.sin(ph) * 16;
    const fx = Math.cos(ph) * 64 * 0.75 + sgn * 18, fy = -92 + Math.sin(ph) * 60;
    drawPart(g, "player/player-thigh", (sgn * 36 + kx) / 2, (-330 + ky) / 2, 60, 120, () => {
      chunk(g, [[sgn * 16, -330], [sgn * 74, -324], [kx + sgn * 26, ky], [kx - sgn * 20, ky]],
        PANT, PANT_D);
    });
    drawPart(g, "player/player-shin", (kx + fx) / 2, (ky + fy) / 2, 46, 120, () => {
      chunk(g, [[kx - sgn * 18, ky], [kx + sgn * 24, ky], [fx + sgn * 19, fy], [fx - sgn * 17, fy]],
        PANT, PANT_D);
    });
    drawPart(g, "player/player-foot", fx + sgn * 10, fy + 8, 60, 28, () => {
      chunk(g, box(fx + sgn * 12, fy + 8, 68, 32, 11), SHOE, "#54382A");
    });
  }

  /* 그릇을 쥔 손 — 그릇 위에 얹어야 '들고 있다' 로 보인다 */
  function drawBowlHand(g) {
    g.save();
    g.translate(VIEW.offX, 0);
    g.rotate(S.bikeAngle * RAD);
    const lean = S.eatLean, tx = PART.torso + lean * 16, ty = lean * -6;
    drawArm(g, 1, tx, ty, lean, false, true);
    g.restore();
  }

  /* 젓가락 팔 — 머리 위에 그려야 입으로 가는 게 보인다.
     몸 저편에 있는 팔이라 조금 작고 어둡게 (깊이). */
  /* 젓가락만 — 팔은 이미 몸통 뒤에 그려 뒀고, 젓가락은 그릇보다 앞이라
     따로 늦게 얹는다. 그래야 입으로 올라가는 게 가려지지 않는다. */
  function drawEatTool(g) {
    g.save();
    g.translate(VIEW.offX, 0);
    g.rotate(S.bikeAngle * RAD);
    g.globalAlpha = DEPTH.backArm.a;
    const lean = S.eatLean, tx = PART.torso + lean * 16, ty = lean * -6;
    g.translate(PART.backArm * 0, 0);
    g.scale(DEPTH.backArm.k, DEPTH.backArm.k);
    drawArm(g, -1, tx, ty, lean, false, false, false, true);   // 젓가락만
    g.restore();
  }

  function drawArm(g, sgn, tx, ty, lean, upperOnly, lowerOnly, noTool, toolOnly) {
    /* 어깨도 앞뒤가 다르다 — 앞팔은 +40, 뒷팔은 -9 에서 나온다 */
    const sx = (sgn > 0 ? PART.frontArm + 64 : PART.backArm - 64) + lean * 10;
    const sy = -528 + ty;
    let ex, ey;                                          // 손 자리
    if (sgn > 0) {
      /* 그릇 한가운데가 아니라 '가까운 쪽 아래 테두리' 를 쥔다 — 그래야 보인다 */
      const h = handPoint();
      const a = S.bowlAngle * RAD;
      const lx = -S.preset.R * 0.45, ly = S.preset.vis * 0.30;
      ex = h.x + tx + lx * Math.cos(a) - ly * Math.sin(a);
      ey = h.y + ty + lx * Math.sin(a) + ly * Math.cos(a);
    }
    else {
      /* 젓가락 손 — 가슴 -> 그릇 -> 입 -> 가슴. 세 자리를 이어 간다. */
      const h = handPoint();
      const rest  = [tx - 168, ty - 470];                  // 가슴 옆
      const dish  = [h.x - 62, h.y - 46];                  // 그릇 위
      const mp = mouthPoint();
      const mouth = [mp.x - 56, mp.y + 96];                // 턱 아래 — 젓가락만 입으로 올린다
      const t = S.eating ? clamp(S.eatT, 0, 1) : 0;
      const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      const ease = u => u * u * (3 - 2 * u);
      let p;
      /* 가슴 -> 그릇 -> 입 -> 가슴. 세 구간 다 ease 라 뚝뚝 끊기지 않는다. */
      if (t <= 0)        p = rest;
      else if (t < 0.34) p = lerp(rest, dish, ease(t / 0.34));
      else if (t < 0.58) p = lerp(dish, mouth, ease((t - 0.34) / 0.24));
      else               p = lerp(mouth, rest, ease((t - 0.58) / 0.42));
      ex = p[0]; ey = p[1];
    }
    /* 팔꿈치 — 바깥·아래로 빼야 두 마디가 다 보인다.
       저편(젓가락) 팔은 원근 단축으로 어깨 쪽으로 당겨 짧아 보이게 한다. */
    if (sgn < 0) {
      ex = sx + (ex - sx) * VIEW.farArm;
      ey = sy + (ey - sy) * VIEW.farArm;
    }
    const mx = (sx + ex) / 2 + sgn * 42, my = (sy + ey) / 2 + 34;
    const side = sgn < 0 ? "left" : "right";
    if (!toolOnly && !lowerOnly) {
      if (!bone(g, "player/player-arm-upper-" + side, sx, sy, mx, my)) {
        chunk(g, [[sx - 24, sy - 18], [sx + 24, sy - 18], [mx + 19, my], [mx - 19, my]],
          SLEEVE, SLEEVE_D);
      }
    }
    if (upperOnly) return;
    if (!toolOnly && !bone(g, "player/player-arm-lower-" + side, mx, my, ex, ey)) {
      chunk(g, [[mx - 19, my - 10], [mx + 19, my - 10], [ex + 16, ey], [ex - 16, ey]],
        SLEEVE, SLEEVE_D);
      chunk(g, box((mx + ex * 3) / 4, (my + ey * 3) / 4, 40, 16, 5), HEM, HEM);
    }
    /* 손은 아직 그림이 없다 — 도형으로 */
    if (!toolOnly) drawPart(g, "player/player-hand", ex, ey, 46, 46, () => {
      chunk(g, ngon(ex, ey, 23, 23, 8, 0.3), SKIN, SKIN_D);
    });

    if (sgn < 0 && !noTool) {
      /* 젓가락 — 손에서 그릇 쪽으로 */
      g.save(); g.translate(ex, ey);
      /* 그릇을 찍을 땐 아래로, 입으로 갈 땐 입을 겨냥해 세운다 */
      const t = S.eating ? clamp(S.eatT, 0, 1) : 0;
      const mp = mouthPoint();
      let ang2 = -0.4, len = 104;
      if (t > 0 && t < 0.34) ang2 = 1.0;
      else if (t >= 0.34 && t < 0.82) {
        /* 손끝에서 입까지의 방향. 위쪽이 0 이 되게 90도 돌려 준다. */
        ang2 = Math.atan2(mp.y - ey, mp.x - ex) + Math.PI / 2;
        len = Math.min(126, Math.max(70, Math.hypot(mp.x - ex, mp.y - ey)));
      }
      g.rotate(ang2);
      if (!put(g, "bowl/chopsticks", 0, -len / 2, len * 0.42)) {
        g.strokeStyle = "#D8B47A"; g.lineWidth = 8; g.lineCap = "round";
        g.beginPath(); g.moveTo(-8, 12); g.lineTo(-3, -len); g.stroke();
        g.beginPath(); g.moveTo(8, 12); g.lineTo(4, -len); g.stroke();
      }
      /* 집은 건더기 */
      if (S.eating && S.eatT > 0.26 && S.eatT < CFG.eat.biteAt + 0.08 && S.ing.length) {
        const it = S.ing[0].t;
        if (!put(g, "bowl/ing-noodle", 0, -len - 4, 38)) {
          chunk(g, ngon(0, -len - 6, it.w * 0.5, it.h * 0.5, 7, 0.4), it.col, it.dark);
        }
      }
      g.restore();
    }
  }

  /* 얼굴은 정해져 있다 — 빨간 비니, 빨간 코, 동그란 눈, 웃는 입.
     그림에는 비니까지 한 덩어리로 들어 있어서, 있으면 그것만 그린다. */
  function drawHead(g, x, y, lean) {
    if (put(g, "player/player-head", x, y - 56, 252,
            { rot: VIEW.headRot, sx: VIEW.squash })) {
      return;                                    /* 얼굴엔 그늘을 안 얹는다 */
    }
    chunk(g, ngon(x, y, 108, 112, 12, 0.26), SKIN, SKIN_D);
    /* 볼 */
    g.fillStyle = "rgba(240,140,140,.45)";
    pathOf(g, ngon(x - 62, y + 26, 24, 16, 8, 0)); g.fill();
    pathOf(g, ngon(x + 62, y + 26, 24, 16, 8, 0)); g.fill();
    /* 동그란 눈 */
    g.fillStyle = "#1A1A16";
    pathOf(g, ngon(x - 36, y + 2, 13, 14, 9, 0)); g.fill();
    pathOf(g, ngon(x + 36, y + 2, 13, 14, 9, 0)); g.fill();
    /* 빨간 코 */
    chunk(g, ngon(x, y + 30, 17, 16, 8, 0.3), "#E2503C", "#C33F2D");
    /* 웃는 입 */
    g.strokeStyle = "#1A1A16"; g.lineWidth = 7; g.lineCap = "round";
    g.beginPath();
    const mo = S.eating && S.eatT > 0.42 ? 18 : 0;             // 먹을 때 입을 벌린다
    g.arc(x, y + 48 + mo * 0.2, 28 + mo * 0.4, 0.25 * Math.PI, 0.75 * Math.PI);
    g.stroke();
    /* 빨간 비니 */
    drawPart(g, "player/beanie", x, y - 92, 244, 150, () => {
      chunk(g, [[x - 112, y - 44], [x - 96, y - 112], [x - 44, y - 150], [x + 44, y - 150],
                [x + 96, y - 112], [x + 112, y - 44]], REDC, REDC_D);
      chunk(g, box(x, y - 44, 232, 34, 10), "#EE4A3A", "#C9382A");
      chunk(g, ngon(x, y - 162, 24, 24, 8, 0.3), "#FFF0E6", "#E0D2C6");
    });
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
    g.rotate((S.bowlAngle - S.bikeAngle) * RAD);         // 그릇은 제 각도로 매달린다

    const R = P.R, D = P.vis;            // 그림은 보이는 깊이로
    /* 그릇 안쪽 — 국물을 여기에 가둔다. 그림이 있으면 그림의 입 모양(타원),
       없으면 도형 그릇의 사다리꼴. */
    const real = has("bowl/bowl-outer");
    let inner, surfTop, surfDepth, halfR;
    if (real) {
      /* 그림을 쟀을 때 입(흰 안쪽)이 보이는 상자에서 차지하는 자리 */
      const vw = R * 2.2, vh = vw * (1086 * (1 - 0.246 - 0.191)) / (1448 * (1 - 0.115 - 0.115));
      /* bowl-inner-mask 를 재 보니 입이 가로:세로 = 2.69 다. 그 비율에 맞춘다. */
      const cy = -vh / 2 + vh * 0.235, rx = vw * 0.40, ry = rx / 2.69 * (vw / vh) * (vh / vw);
      inner = ngon(0, cy, rx, rx / 2.69, 22, 0);
      surfTop = cy - ry; surfDepth = ry * 2; halfR = rx;
    } else {
      inner = [[-R, -D * 0.5], [R, -D * 0.5], [R * 0.66, D * 0.5], [-R * 0.66, D * 0.5]];
      surfTop = -D * 0.5; surfDepth = D; halfR = R;
    }

    /* 바깥 */
    if (!put(g, "bowl/bowl-outer", 0, 0, R * 2.2)) {
      chunk(g, [[-R - 10, -D * 0.5], [R + 10, -D * 0.5], [R * 0.58, D * 0.56],
                [-R * 0.58, D * 0.56]], "#F2F3F5", "#D5D8DE");
      /* 굽 */
      chunk(g, [[-R * 0.34, D * 0.56], [R * 0.34, D * 0.56], [R * 0.26, D * 0.76],
                [-R * 0.26, D * 0.76]], "#C9CDD5", "#B3B8C2");
    }

    /* ---- 국물 ---- */
    const lv = level();
    if (lv > 0.001) {
      const tilt = (S.soupAngle - S.bowlAngle) * RAD;    // 그릇에서 본 수면 기울기
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
      "balanceDng " + (Math.abs(S.bikeAngle) / CFG.bike.maxAngle).toFixed(2),
      "overflow   " + S.overflow.toFixed(2),
      "fps        " + S.fps.toFixed(0),
    ];
    g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(6, 6, 190, rows.length * 15 + 10);
    g.fillStyle = "#9BF";
    rows.forEach((t, i) => g.fillText(t, 12, 12 + i * 15));
    g.restore();
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
    /* 캐릭터와 그릇은 한 덩어리로 — 좁은 화면에서는 같이 줄어든다 */
    g.save();
    let k = fitScale();
    if (S.topple) {
      /* 누우면 가로로 길어진다 — 그만큼 당겨서 화면에 담는다 */
      const p = Math.min(1, Math.abs(S.bikeAngle) / CFG.topple.lie);
      g.translate(-S.fallDir * p * 300, -p * 40);
      k *= 1 - p * 0.18;
    }
    g.scale(k, k);
    /* 9 그릇 -> 10 젓가락 -> 11 그릇 쥔 손. 뒤에서 앞으로만 간다. */
    drawPlayer(g);
    drawBowl(g);
    drawEatTool(g);
    drawBowlHand(g);
    drawFx(g);
    g.restore();
    drawMsg(g);
    if (DEBUG_MODE) drawDebug(g);
  }

  /* ============================================================
     HUD — 숫자가 바뀔 때만 DOM 을 건드린다
     ============================================================ */
  const hud = { sc: -1, band: null };
  /* 플레이 화면에 남는 건 점수 하나와 먹기 버튼 색뿐이다.
     원작처럼 비워 두려고 미터·시간·콤보·경고 배너를 전부 뺐다.
     (점수와 콤보는 계속 계산된다 — 결과 화면에서 쓴다) */
  function paintHud(force) {
    if (force || S.score !== hud.sc) { hud.sc = S.score; $("scoreNum").textContent = S.score; }
    /* 먹기 버튼이 지금 먹으면 어떻게 되는지를 색으로 알려 준다 */
    const band = S.state === ST.PLAY ? (S.eating ? "EATING"
                 : S.eatCool > 0 ? "WAIT" : S.eatBand) : "";
    if (force || band !== hud.band) {
      hud.band = band;
      const el = $("keyE");
      el.classList.toggle("warn", band === "WARN");
      el.classList.toggle("risk", band === "RISK");
      el.classList.toggle("wait", band === "WAIT" || band === "EATING");
    }
  }

  /* ============================================================
     입력 — 좌우 두 개뿐. 먹기 버튼은 없다.
     ============================================================ */
  function setInput() { S.input = (S.heldR ? 1 : 0) - (S.heldL ? 1 : 0); }
  function hold(side, on) {
    if (side < 0) S.heldL = on; else S.heldR = on;
    setInput();
    (side < 0 ? $("keyL") : $("keyR")).classList.toggle("on", on);
    if (on) sfx("button");
  }
  for (const [el, side] of [[$("keyL"), -1], [$("keyR"), 1]]) {
    el.addEventListener("pointerdown", e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); hold(side, true); });
    el.addEventListener("pointerup", e => { e.preventDefault(); hold(side, false); });
    el.addEventListener("pointercancel", () => hold(side, false));
    el.addEventListener("pointerleave", () => hold(side, false));
    el.addEventListener("contextmenu", e => e.preventDefault());
  }
  /* 가운데 먹기 버튼 — 탭할 때마다 한 입 */
  function pressEat() {
    if (S.state !== ST.PLAY) return;
    S.eatPressed = true;
    $("keyE").classList.add("on");
  }
  $("keyE").addEventListener("pointerdown", e => { e.preventDefault(); pressEat(); });
  $("keyE").addEventListener("pointerup", e => { e.preventDefault(); $("keyE").classList.remove("on"); });
  $("keyE").addEventListener("pointercancel", () => $("keyE").classList.remove("on"));
  $("keyE").addEventListener("pointerleave", () => $("keyE").classList.remove("on"));
  $("keyE").addEventListener("contextmenu", e => e.preventDefault());

  /* 화면 좌우 절반을 눌러도 균형은 잡힌다 — 먹기는 버튼으로만.
     캔버스가 잡은 쪽만 캔버스가 푼다. 그러지 않으면 버튼을 누른 채로
     화면을 건드렸다 뗐을 때 버튼까지 같이 풀려 입력이 씹힌다. */
  const cvHold = new Map();                            // pointerId -> 어느 쪽
  cv.addEventListener("pointerdown", e => {
    e.preventDefault();
    const side = e.clientX < cv.getBoundingClientRect().left + W / 2 ? -1 : 1;
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
    if (k === " " || k === "Spacebar") $("keyE").classList.remove("on");
  });
  addEventListener("blur", () => {
    cvHold.clear();
    hold(-1, false); hold(1, false); $("keyE").classList.remove("on");
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
    $("rScore").textContent = S.score;
    $("newRec").hidden = !rec;
    $("rBite").textContent = S.bites + "입 먹음";
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
    start, step, fall, endRun, showResult, scoreOf, gradeFor, canEat, eatBand, tryEat, pressEat,
    eatGap,
    setLevel: v => { LEVEL = v; }, getLevel: () => LEVEL,
    spillOver, level, stepBike, stepBowl, stepSoup, stepSpill, stepEat,
    handPoint, bowlRim, choosePreset, fillIng, addFx, stepFx, say, paintHud, drawHero,
    snapResult, buildCard, shareResult, render, loadAssets, has, drawBowlHand,
    BOX, BONE, put, bone, VIEW, fitScale, CURB, SKYLINE,
    posePaint, POSE, PART, DEPTH, drawEatTool, drawNeck, drawShoulder, tileRow,
  });
})();
