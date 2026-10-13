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
      gravity: 5.4,                      // 넘어지려는 힘 (g/L, 1/s^2)
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

    /* 먹기 — 버튼이 없다. 조용해지면 알아서 먹는다. */
    eat: {
      cooldown: 0.7,                     // 한 입 먹고 다음 입까지
      duration: 0.82,                    // 한 입에 걸리는 시간
      biteAt: 0.62,                      // 그 중 입에 넣는 시점 (0~1)
      kick: 11,                          // 손 뻗을 때 그릇 쪽으로 쏠리는 충격 (도/s)
      safeBike: 4.5,                     // 몸이 이보다 반듯해야
      safeBowl: 4.5,                     // 그릇이 이보다 반듯해야
      safeSlosh: 10,                     // 국물이 이보다 잔잔해야
      soupPerBite: 2.0,                  // 한 입에 줄어드는 국물 %
      minSoup: 8,                        // 이보다 적으면 더 못 먹는다
    },

    fx: { max: 26, life: 0.7 },
    sfxGap: 70,                          // 같은 소리가 겹쳐 터지지 않게 (ms)
  };

  /* 그릇 프리셋 — 판마다 뽑는다. 크고 가득 찰수록 어렵다. */
  const PRESETS = [
    /* depth 는 '넘치기 계산' 용 머리 공간이고, vis 는 '그림' 깊이다.
       둘을 한 값으로 쓰면 쏟기를 맞출 때 그릇이 쟁반처럼 납작해진다.
       넘치기 시작하는 수면차: 작은 그릇 12도 / 보통 7도 / 큰 5도 / 대야 4도 */
    { key: "EASY",   label: "작은 그릇", w: 0.20, R: 108, depth: 64, vis: 96,  fill: 0.66, wobble: 0.78, spill: 1.00 },
    { key: "NORMAL", label: "보통 그릇", w: 0.45, R: 128, depth: 72, vis: 112, fill: 0.78, wobble: 1.00, spill: 1.00 },
    { key: "HARD",   label: "큰 그릇",   w: 0.25, R: 150, depth: 80, vis: 130, fill: 0.86, wobble: 1.22, spill: 1.15 },
    { key: "CRAZY",  label: "대야급",    w: 0.10, R: 178, depth: 96, vis: 152, fill: 0.88, wobble: 1.45, spill: 1.30 },
  ];

  const GRADES = [
    { min: 85, title: "S  외발 마라탕 장인",   remark: "이 사람 원래 이렇게 먹고 다닙니다." },
    { min: 70, title: "A  국물 한 방울도 아깝다", remark: "거의 안 흘렸어요. 손목이 좋으시네." },
    { min: 52, title: "B  그래도 배는 찼다",   remark: "흘린 건 흘린 거고 먹은 건 먹은 거죠." },
    { min: 32, title: "C  반은 먹고 반은 바닥에", remark: "바닥 닦을 사람 생각도 좀..." },
    { min: 0,  title: "D  그냥 앉아서 드세요", remark: "자전거는 두고 가시는 게 맞습니다." },
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
    ing: [],

    calm: 0, calmBest: 0,                // 연속으로 안정했던 시간
    bumpIn: 1.2, wheelSpin: 0, scroll: 0,
    fx: [], shake: 0, flash: 0,
    msg: "", msgLeft: 0,
    why: "",                             // 끝난 이유

    best: 0, bestBite: 0,
    fps: 0, fpsT: 0, fpsN: 0,
  };

  /* 소리 — 파일이 아직 없다. 자리와 호출만 만들어 둔다. */
  const SFX = { button: null, warn: null, spill: null, bite: null,
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
  function choosePreset() {
    let r = Math.random(), acc = 0;
    for (const p of PRESETS) { acc += p.w; if (r < acc) return p; }
    return PRESETS[1];
  }

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
    S.eating = false; S.eatT = 0; S.eatCool = 0.6; S.eatLean = 0; S.bitTaken = false;
    S.ing.length = 0; fillIng(9);
    S.calm = 0; S.calmBest = 0;
    S.bumpIn = rnd(1.0, 1.8); S.wheelSpin = 0; S.scroll = 0;
    S.fx.length = 0; S.shake = 0; S.flash = 0;
    S.msg = ""; S.msgLeft = 0; S.why = "";
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
    let acc = B.gravity * Math.sin(S.bikeAngle * RAD) * DEG;
    /* 버튼 — 왼쪽(-1)을 누르면 왼쪽으로 기운다.
       누른 힘이 바로 실리지 않는다. 몸이 기우는 데 시간이 걸리니까
       급하게 눌렀다 떼면 반드시 지나친다. */
    S.push += (S.input - S.push) * Math.min(1, dt / B.ramp);
    acc += S.push * B.control;
    /* 먹는 중에는 그릇 쪽(오른쪽)으로 손이 가서 중심이 쏠린다 */
    if (S.eating) acc += CFG.eat.kick * 1.4;
    S.bikeVel += acc * dt;
    S.bikeVel -= S.bikeVel * B.damp * dt;
    S.bikeAngle += S.bikeVel * dt;

    /* 노면 턱 — 뒤로 갈수록 자주, 그릇이 클수록 세게 */
    if (S.state === ST.PLAY) {
      S.bumpIn -= dt * (1 + S.elapsed / CFG.duration * 0.6);
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
    if (S.spilling <= 0) { S.spills++; sfx("spill"); buzz(18); }
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
  function canEat() {
    const E = CFG.eat;
    return S.state === ST.PLAY && !S.eating && S.eatCool <= 0
        && S.amount > E.minSoup
        && Math.abs(S.bikeAngle) < E.safeBike
        && Math.abs(S.bowlAngle) < E.safeBowl
        && Math.abs(S.soupVel) < E.safeSlosh
        && S.overflow <= 0;
  }

  function stepEat(dt) {
    if (S.eatCool > 0) S.eatCool -= dt;
    if (!S.eating) {
      if (canEat()) {
        S.eating = true; S.eatT = 0; S.bitTaken = false;
        /* 손을 뻗는 순간 중심이 그릇 쪽으로 쏠린다 — 먹기가 곧 위험이다 */
        S.bikeVel += CFG.eat.kick;
        S.bowlVel += CFG.eat.kick * 0.5;
      }
    } else {
      S.eatT += dt / CFG.eat.duration;
      if (!S.bitTaken && S.eatT >= CFG.eat.biteAt) {
        S.bitTaken = true;
        S.bites++;
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
  function say(t) { S.msg = t; S.msgLeft = 0.7; }

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
      S.bikeAngle += S.bikeVel * dt;
      S.bikeVel += 240 * Math.sign(S.bikeAngle || 1) * dt;
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
    if (S.amount <= CFG.eat.minSoup) return endRun("국물이 다 쏟아졌다");
    if (S.left <= 0) return endRun("시간 종료");
  }

  function fall(why) {
    S.why = why; S.state = ST.FALL; S.goLeft = 0.9;
    S.shake = 0.3; sfx("fall"); buzz([30, 40, 60]);
    say("넘어졌다!");
    for (let i = 0; i < 8; i++) addFx("drop", rnd(-120, 120), -400, Math.sign(S.bikeAngle));
  }
  function endRun(why) {
    S.why = why; S.state = ST.FALL; S.goLeft = 0.5;
    sfx("over");
    say(why);
  }

  /* ============================================================
     점수
     ============================================================ */
  function scoreOf() {
    const bite = S.bites * 2.4;
    const soup = clamp(S.amount, 0, 100) * 0.26;
    const time = S.elapsed / CFG.duration * 14;
    const calm = Math.min(S.calmBest, 14) * 0.8;
    /* 쏟은 건 손해로 남아야 한다. 안 그러면 먹기만 하면 만점이 된다. */
    const mess = S.spills * 0.9;
    const total = Math.round(clamp(bite + soup + time + calm - mess, 0, 100));
    return { bite, soup, time, calm, mess, total };
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

  function drawCity(g) {
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
    return { x: lean * 16 + lean * 10, y: -700 + lean * -6 + lean * 10 + 50 };
  }

  /* 그릇을 든 오른손의 자리 (플레이어 로컬 좌표) */
  function handPoint() {
    /* 그릇이 클수록 바깥·아래로 — 대야급이 얼굴을 덮지 않게 */
    const k = (S.preset.R - 108) / 70;
    return { x: 270 + k * 22, y: -452 + k * 26 + S.eatLean * 16 };
  }
  /* 그릇 테두리의 한쪽 끝 (그릇 로컬) */
  function bowlRim(side) {
    const P = S.preset;
    const a = S.bowlAngle * RAD;
    const lx = side * P.R, ly = -P.depth * 0.5;
    return { x: lx * Math.cos(a) - ly * Math.sin(a), y: lx * Math.sin(a) + ly * Math.cos(a) };
  }

  function drawPart(g, key, x, y, w, h, fallback) { art(g, key, x, y, w, h, fallback); }

  function drawPlayer(g) {
    const lean = S.eatLean;
    const sway = Math.sin(S.wheelSpin * 2) * 1.4;        // 페달 밟는 좌우 흔들림

    g.save();
    g.rotate(S.bikeAngle * RAD);                         // playerRoot

    /* ---- unicycleRoot ---- */
    g.save();
    /* wheel */
    if (!put(g, "unicycle/unicycle-wheel", 0, -92, 190, { rot: S.wheelSpin })) (() => {
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
    /* frame */
    if (!bone(g, "unicycle/unicycle-frame", 0, -92, 0, -316)) {
      chunk(g, [[-26, -92], [26, -92], [17, -310], [-17, -310]], "#4A5370", "#3C4460");
    }
    /* seat */
    if (!put(g, "unicycle/unicycle-seat", 0, -330, 160)) {
      chunk(g, box(0, -326, 148, 40, 14), REDC, REDC_D);
    }
    /* pedalLeft / pedalRight */
    const pa = S.wheelSpin;
    for (const sgn of [-1, 1]) {
      const px = Math.cos(pa + (sgn < 0 ? Math.PI : 0)) * 64;
      const py = -92 + Math.sin(pa + (sgn < 0 ? Math.PI : 0)) * 64;
      drawPart(g, "unicycle/pedal", px, py, 56, 18, () => {
        chunk(g, box(px, py, 56, 18, 5), "#5A6480", "#49516A");
      });
    }
    g.restore();

    /* ---- 다리 (thigh > shin > foot) — 틀보다 앞에서 페달을 밟는다 ---- */
    for (const sgn of [-1, 1]) {
      const ph = S.wheelSpin + (sgn < 0 ? Math.PI : 0);
      const kx = sgn * 52, ky = -232 + Math.sin(ph) * 16;
      const fx = Math.cos(ph) * 64 * 0.75 + sgn * 18, fy = -92 + Math.sin(ph) * 60;
      drawPart(g, "player/thigh", (sgn * 36 + kx) / 2, (-330 + ky) / 2, 60, 120, () => {
        chunk(g, [[sgn * 16, -330], [sgn * 74, -324], [kx + sgn * 26, ky], [kx - sgn * 20, ky]],
          PANT, PANT_D);
      });
      drawPart(g, "player/shin", (kx + fx) / 2, (ky + fy) / 2, 46, 120, () => {
        chunk(g, [[kx - sgn * 18, ky], [kx + sgn * 24, ky], [fx + sgn * 19, fy], [fx - sgn * 17, fy]],
          PANT, PANT_D);
      });
      drawPart(g, "player/foot", fx + sgn * 10, fy + 8, 60, 28, () => {
        chunk(g, box(fx + sgn * 12, fy + 8, 68, 32, 11), SHOE, "#54382A");
      });
    }

    /* ---- torso ---- 그림에는 목도리까지 들어 있다 */
    const tx = lean * 16, ty = lean * -6;
    if (!put(g, "player/player-torso", tx, -450 + ty, 236)) {
      chunk(g, [[-96 + tx, -336], [96 + tx, -336], [86 + tx, -566 + ty], [-86 + tx, -566 + ty]],
        COAT, COAT_D);
      chunk(g, box(tx, -346, 192, 26, 8), HEM, HEM);              // 노란 밑단
      chunk(g, box(tx, -566 + ty, 180, 44, 14), SCARF, SCARF_D);  // 목도리
      chunk(g, box(tx - 62 + sway * 3, -524 + ty, 40, 74, 10), SCARF, SCARF_D);
    }

    /* ---- 오른팔 (그릇 쪽) ---- 윗팔까지만. 아랫팔과 손은 그릇 위에 얹는다. */
    drawArm(g, 1, tx, ty, lean, true);

    /* ---- head + beanie ---- */
    const hx = tx + lean * 10, hy = -700 + ty + lean * 10;
    drawHead(g, hx, hy, lean);

    g.restore();
  }

  /* 그릇을 쥔 손 — 그릇 위에 얹어야 '들고 있다' 로 보인다 */
  function drawBowlHand(g) {
    g.save();
    g.rotate(S.bikeAngle * RAD);
    const lean = S.eatLean, tx = lean * 16, ty = lean * -6;
    drawArm(g, 1, tx, ty, lean, false, true);
    g.restore();
  }

  /* 젓가락 팔 — 머리 위에 그려야 입으로 가는 게 보인다 */
  function drawEatArm(g) {
    g.save();
    g.rotate(S.bikeAngle * RAD);
    const lean = S.eatLean, tx = lean * 16, ty = lean * -6;
    drawArm(g, -1, tx, ty, lean);
    g.restore();
  }

  function drawArm(g, sgn, tx, ty, lean, upperOnly, lowerOnly) {
    /* 어깨는 몸통 그림의 바깥 가장자리쯤에 둔다. 안쪽에 두면 팔이 묻힌다. */
    const sx = tx + sgn * 104, sy = -528 + ty;
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
      if (t <= 0)        p = rest;
      else if (t < 0.40) p = lerp(rest, dish, ease(t / 0.40));
      else if (t < 0.62) p = lerp(dish, mouth, ease((t - 0.40) / 0.22));
      else               p = lerp(mouth, rest, ease((t - 0.62) / 0.38));
      ex = p[0]; ey = p[1];
    }
    /* 팔꿈치 — 바깥·아래로 빼야 두 마디가 다 보인다 */
    const mx = (sx + ex) / 2 + sgn * 42, my = (sy + ey) / 2 + 34;
    const side = sgn < 0 ? "left" : "right";
    if (!lowerOnly) {
      if (!bone(g, "player/player-arm-upper-" + side, sx, sy, mx, my)) {
        chunk(g, [[sx - 24, sy - 18], [sx + 24, sy - 18], [mx + 19, my], [mx - 19, my]],
          SLEEVE, SLEEVE_D);
      }
    }
    if (upperOnly) return;
    if (!bone(g, "player/player-arm-lower-" + side, mx, my, ex, ey)) {
      chunk(g, [[mx - 19, my - 10], [mx + 19, my - 10], [ex + 16, ey], [ex - 16, ey]],
        SLEEVE, SLEEVE_D);
      chunk(g, box((mx + ex * 3) / 4, (my + ey * 3) / 4, 40, 16, 5), HEM, HEM);
    }
    /* 손은 아직 그림이 없다 — 도형으로 */
    drawPart(g, "player/player-hand", ex, ey, 46, 46, () => {
      chunk(g, ngon(ex, ey, 23, 23, 8, 0.3), SKIN, SKIN_D);
    });

    if (sgn < 0) {
      /* 젓가락 — 손에서 그릇 쪽으로 */
      g.save(); g.translate(ex, ey);
      /* 그릇을 찍을 땐 아래로, 입으로 갈 땐 입을 겨냥해 세운다 */
      const t = S.eating ? clamp(S.eatT, 0, 1) : 0;
      const mp = mouthPoint();
      let ang2 = -0.4, len = 104;
      if (t > 0 && t < 0.4) ang2 = 1.0;
      else if (t >= 0.4 && t < 0.8) {
        /* 손끝에서 입까지의 방향. 위쪽이 0 이 되게 90도 돌려 준다. */
        ang2 = Math.atan2(mp.y - ey, mp.x - ex) + Math.PI / 2;
        len = Math.min(126, Math.max(70, Math.hypot(mp.x - ex, mp.y - ey)));
      }
      g.rotate(ang2);
      drawPart(g, "player/chopsticks", 0, -len / 2, 22, len, () => {
        g.strokeStyle = "#D8B47A"; g.lineWidth = 8; g.lineCap = "round";
        g.beginPath(); g.moveTo(-8, 12); g.lineTo(-3, -len); g.stroke();
        g.beginPath(); g.moveTo(8, 12); g.lineTo(4, -len); g.stroke();
      });
      /* 집은 건더기 */
      if (S.eating && S.eatT > 0.3 && S.eatT < CFG.eat.biteAt + 0.06 && S.ing.length) {
        const it = S.ing[0].t;
        chunk(g, ngon(0, -len - 6, it.w * 0.5, it.h * 0.5, 7, 0.4), it.col, it.dark);
      }
      g.restore();
    }
  }

  /* 얼굴은 정해져 있다 — 빨간 비니, 빨간 코, 동그란 눈, 웃는 입.
     그림에는 비니까지 한 덩어리로 들어 있어서, 있으면 그것만 그린다. */
  function drawHead(g, x, y, lean) {
    if (put(g, "player/player-head", x, y - 56, 252)) return;
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
    const mo = S.eating && S.eatT > 0.46 ? 18 : 0;             // 먹을 때 입을 벌린다
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
      const cy = -vh / 2 + vh * 0.215, rx = vw * 0.40, ry = vh * 0.185;
      inner = ngon(0, cy, rx, ry, 22, 0);
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
    g.globalAlpha = Math.min(1, S.msgLeft * 3);
    const size = Math.max(20, Math.min(W * 0.1, H * 0.052));
    g.font = "800 " + size + "px Pretendard, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = Math.max(5, size * 0.24); g.strokeStyle = "rgba(0,0,0,.65)";
    g.strokeText(S.msg, W / 2, H * 0.3);
    g.fillStyle = "#FFCE1F";
    g.fillText(S.msg, W / 2, H * 0.3);
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
    drawPlayer(g);
    drawBowl(g);
    drawBowlHand(g);                              // 그릇을 쥔 손은 그릇 위에
    drawEatArm(g);                                // 젓가락 팔은 머리 위에
    drawFx(g);
    drawMsg(g);
    if (DEBUG_MODE) drawDebug(g);
  }

  /* ============================================================
     HUD — 숫자가 바뀔 때만 DOM 을 건드린다
     ============================================================ */
  const hud = { t: -1, b: -1, s: -1, warn: null, tip: null };
  function paintHud(force) {
    const t = Math.ceil(S.left);
    if (force || t !== hud.t) {
      hud.t = t;
      $("timeNum").textContent = t;
      $("timeNum").classList.toggle("hot", t <= CFG.hotAt);
    }
    if (force || S.bites !== hud.b) { hud.b = S.bites; $("biteNum").textContent = S.bites; }
    const s = Math.round(S.amount);
    if (force || s !== hud.s) {
      hud.s = s;
      $("soupNum").textContent = s;
      $("soupNum").classList.toggle("hot", s <= 30);
    }
    const warn = S.state === ST.PLAY && (S.overflow > 0 || spillOver() > -CFG.soup.warnAt * 0.22);
    if (force || warn !== hud.warn) {
      hud.warn = warn;
      $("warn").hidden = !warn;
      if (warn) { sfx("warn"); buzz(8); }     // 뜨는 순간에만
    }
    const tip = S.eating ? "eat" : S.state === ST.PLAY && S.eatCool <= 0 ? "ready" : "";
    if (force || tip !== hud.tip) {
      hud.tip = tip;
      const el = $("padTip");
      el.textContent = tip === "eat" ? "먹는 중 — 중심 조심!"
                     : tip === "ready" ? "조용하면 바로 한 입"
                     : "가만히 있으면 알아서 한 입";
      el.classList.toggle("eat", tip === "eat");
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
  /* 화면 좌우 절반을 눌러도 된다 — 버튼이 작은 폰에서 */
  cv.addEventListener("pointerdown", e => {
    e.preventDefault();
    hold(e.clientX < cv.getBoundingClientRect().left + W / 2 ? -1 : 1, true);
  });
  cv.addEventListener("pointerup", () => { hold(-1, false); hold(1, false); });
  cv.addEventListener("pointercancel", () => { hold(-1, false); hold(1, false); });
  addEventListener("keydown", e => {
    if (e.key === "ArrowLeft" || e.key === "a") hold(-1, true);
    if (e.key === "ArrowRight" || e.key === "d") hold(1, true);
  });
  addEventListener("keyup", e => {
    if (e.key === "ArrowLeft" || e.key === "a") hold(-1, false);
    if (e.key === "ArrowRight" || e.key === "d") hold(1, false);
  });
  addEventListener("blur", () => { hold(-1, false); hold(1, false); });

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
    $("newRec").hidden = !rec;
    $("rBite").textContent = S.bites + "입";
    $("rSoup").textContent = Math.round(S.amount) + "%";
    $("gradeLabel").textContent = G.title;
    $("remark").textContent = G.remark;
    $("rTime").textContent = S.elapsed.toFixed(1) + "초";
    $("rCalm").textContent = S.calmBest.toFixed(1) + "초";
    $("rSpill").textContent = S.spills + "회";
    $("rBowl").textContent = S.preset.label;

    const artc = snapResult();
    const bx = $("resultArt");
    bx.innerHTML = ""; bx.appendChild(artc);
    lastArt = artc;
    lastInfo = { bites: S.bites, soup: Math.round(S.amount), grade: G,
                 time: S.elapsed.toFixed(1) };

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
    S.preset = PRESETS[1];
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
  $("startBtn").addEventListener("click", () => { sfx("button"); start(false); });
  $("againBtn").addEventListener("click", () => { sfx("button"); start(true); });
  $("shareBtn").addEventListener("click", shareResult);

  try {
    S.best = +(localStorage.getItem("ccojik_malatang_score") || 0);
    S.bestBite = +(localStorage.getItem("ccojik_malatang_bite") || 0);
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
      drawHero();
      paintHud(true);
    }
  );
  requestAnimationFrame(frame);

  /* 검사용 — 바깥에서 속을 들여다본다 */
  window.__malatang = () => ({
    S, CFG, PRESETS, GRADES, ING, ST, IMG, SFX, DEBUG_MODE, REF_H, GROUND,
    start, step, fall, endRun, showResult, scoreOf, gradeFor, canEat,
    spillOver, level, stepBike, stepBowl, stepSoup, stepSpill, stepEat,
    handPoint, bowlRim, choosePreset, fillIng, addFx, stepFx, say, paintHud, drawHero,
    snapResult, buildCard, shareResult, render, loadAssets, has, drawBowlHand, drawEatArm,
    BOX, BONE, put, bone,
    posePaint, POSE,
  });
})();
