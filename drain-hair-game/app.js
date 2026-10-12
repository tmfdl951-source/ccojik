/* ===== 꼬직 · 배수구 머리카락 뽑기 =====
 * 막힌 배수구에서 머리카락을 잡아 끊기지 않게 당겨 빼는 게임.
 *
 * 좌표계
 *   그리기는 전부 '논리 px' 로 한다. 화면 높이를 1920 으로 본 값이고,
 *   원점은 배수구 구멍의 가운데다. 화면 크기가 달라도 같은 손놀림이 같은
 *   결과가 되도록, 속도·거리 판정은 전부 이 논리 px 로 계산하고 마지막에
 *   한 번만 화면 크기로 환산한다.
 *
 * 머리카락
 *   줄기는 하나의 긴 그림이 아니다. 구멍(고정점)에서 손끝(잡은 점)까지
 *   이어진 여덜 개 마디의 감쇠 스프링 사슬이고, 장력이 낮으면 늘어지고
 *   높으면 곧게 펴진다. PNG 는 끝·매듭·오염물·덩어리 같은 '부품' 으로만 쓴다.
 *
 * 장력
 *   당기는 속도 x 그 구간의 저항 x 당기는 방향(결 대비 각도) 로 정한다.
 *   한 프레임 튀는 값으로는 안 끊어지고, 한계를 holdTime 동안 넘겨야 끊어진다.
 *
 * 그림은 assets/ 의 PNG 를 쓴다. 파일마다 투명 여백이 달라서, 알파를 실제로
 * 훑어 '보이는 부분'의 테두리를 재 둔 표(BOX)로 크기와 중심을 보정한다.
 *
 * 금지: 외부 라이브러리, 이모지 */
(() => {
  "use strict";

  /* ============================================================
     설정 — 숫자는 전부 여기서만 만진다
     ============================================================ */
  const GAME_CONFIG = {
    duration: 45,                 // 제한시간(초)
    hotAt: 10,                    // 남은 시간이 이 아래면 빨갛게 두근거린다

    /* ---- 당기는 속도 (논리 px/초) ---- */
    pull: {
      safeSpeed: 250,
      warningSpeed: 450,
      dangerSpeed: 650,
      smooth: 0.26,               // 손끝 속도를 이만큼씩 섞어 떨림을 지운다
    },

    /* ---- 머리카락 ---- */
    hair: {
      nodes: 8,                   // 사슬 마디 수
      stiffness: 0.42,            // 제자리로 돌아가는 힘
      damping: 0.80,              // 감쇠 (작으면 오래 출렁인다)
      sag: 150,                   // 장력이 0 일 때 늘어지는 정도 (논리 px)
      visMin: 150,                // 보이는 줄기의 최소 길이
      visMax: 720,                // 보이는 줄기의 최대 길이 — 화면 밖으로 안 나가게
      visCm: 70,                  // 보이는 줄기가 나타내는 길이(cm)
      cmPerPx: 0.09,              // 손끝이 1px 움직일 때 빠져나오는 길이(cm)
      retractOnRelease: 0.02,     // 손을 떼면 이 비율만큼 다시 들어간다
      regrabDelay: 0.3,           // 다시 잡을 수 있게 되기까지(초)
    },

    /* ---- 끊김 ---- */
    break: {
      warningThreshold: 0.62,
      breakThreshold: 0.82,
      holdTime: 0.18,             // 한계를 이 시간 넘겨야 끊어진다
      recoil: 170,                // 끊어질 때 튕기는 거리
      shake: 0.14,                // 화면 흔들림 시간(초)
      shakeAmp: 10,
    },

    /* ---- 당기는 방향 (결 대비 각도, 도) ---- */
    angle: { safe: 25, warning: 50, danger: 80, maxMul: 2.1 },

    /* ---- 구간별 저항 ---- */
    resistance: {
      normal: 1, soap: 1.2, smallKnot: 1.35, mediumKnot: 1.5,
      largeKnot: 1.65, grime: 1.4, final: 1.8,
    },

    /* ---- 잡는 자리 ---- 끊을수록 좁아진다 */
    grabRadius: 150,              // 기본 반지름 (논리 px)
    grabShrink: [1, 0.85, 0.7, 0.6],

    /* ---- 채점 (100점) ---- */
    score: { clean: 50, break: 25, time: 15, streak: 10 },
    breakScore: [25, 20, 15, 10, 5, 0],

    /* ---- 연출 ---- */
    fxTime: 0.34,                 // FX 한 장이 보이는 시간(초)
    maxFx: 10,
    clearHold: 0.9,               // 물이 빠지는 연출 시간(초)
    sfxGap: 70,                   // 같은 소리가 겹쳐 터지지 않게(ms)
  };

  /* 한 판마다 똑같지 않게 — 다섯 가지 + 드물게 하나 */
  const PRESETS = [
    { key: "NORMAL",     total: 150, knots: 2, grimes: 2, resMul: 1.00, clogAt: 0.88 },
    { key: "LONG",       total: 220, knots: 2, grimes: 3, resMul: 0.88, clogAt: 0.90 },
    { key: "KNOTTY",     total: 160, knots: 4, grimes: 1, resMul: 1.00, clogAt: 0.88 },
    { key: "GROSS",      total: 180, knots: 2, grimes: 5, resMul: 0.96, clogAt: 0.89 },
    { key: "SHORT HARD", total: 120, knots: 2, grimes: 2, resMul: 1.18, clogAt: 0.86 },
  ];
  const MEGA = { key: "MEGA CLOG", total: 200, knots: 3, grimes: 4, resMul: 1.05, clogAt: 0.80, mega: true };
  const MEGA_CHANCE = 0.1;

  /* 등급 — 점수로 갈린다 */
  const GRADES = [
    { min: 95, title: "배수구 구조대",        remark: "이 정도면 기사님입니다." },
    { min: 85, title: "한 번에 쑤욱",          remark: "손맛 좀 아시네요." },
    { min: 70, title: "제법 깔끔함",           remark: "물이 내려가긴 합니다." },
    { min: 50, title: "아직 뭐가 남아있는데?", remark: "다시 한 번 들여다보세요." },
    { min: 0,  title: "그냥 업체 부르세요",    remark: "더 건드리면 큰일 납니다." },
  ];

  /* 디버그 — 배포는 false */
  const DEBUG_GAME = false;

  /* 논리 좌표계 */
  const REF_H = 1920;
  const DRAIN_R = 380;            // 배수구 반지름 (논리 px)
  const DRAIN_Y = -210;           // 배수구 중심이 화면 가운데서 얼마나 위인가

  /* ============================================================
     그림 — assets/ 의 실제 파일. 투명 여백(l/t/r/b)은 알파를 훑어 잰 값이다.
     그림을 바꾸면 이 표도 다시 재야 한다.
     ============================================================ */
  const ASSET_VERSION = "20261012";
  /* assets/ 에는 원본(합계 71MB)이 그대로 있고, 게임은 assets/opt/ 의 WebP
     사본(합계 2.9MB)을 쓴다. 투명도를 살린 손실 압축이고 화면에 그려지는
     크기의 1~2배 해상도라 눈으로는 차이가 없다. WebP 를 못 읽는 환경에서는
     아래 로더가 원본 PNG 로 자동으로 물러난다. */
  const DIR = "assets/opt/";
  const FALLBACK_DIR = "assets/";
  const BOX = {
    drainEdgeDirt: { file: "drain-edge-dirt.png", w: 1283, h: 1226, l: 0.033, t: 0.031, r: 0.023, b: 0.033 },
    drainHighlight: { file: "drain-highlight.png", w: 1303, h: 1207, l: 0.04, t: 0.035, r: 0.06, b: 0.028 },
    drainHoleMask: { file: "drain-hole-mask.png", w: 1303, h: 1207, l: 0.034, t: 0.016, r: 0.036, b: 0.002 },
    drainInnerDark: { file: "drain-inner-dark.png", w: 1254, h: 1254, l: 0.15, t: 0.145, r: 0.149, b: 0.153 },
    drainInnerDirty: { file: "drain-inner-dirty.png", w: 1261, h: 1247, l: 0.059, t: 0.047, r: 0.061, b: 0.059 },
    drainRingWet: { file: "drain-ring-wet.png", w: 1283, h: 1226, l: 0.04, t: 0.04, r: 0.041, b: 0.014 },
    drainRing: { file: "drain-ring.png", w: 1254, h: 1254, l: 0.043, t: 0.043, r: 0.041, b: 0.051 },
    fxBreakHair: { file: "fx-break-hair.png", w: 1536, h: 1024, l: 0.018, t: 0.082, r: 0.006, b: 0.054 },
    fxDroplet: { file: "fx-droplet.png", w: 1536, h: 1024, l: 0.036, t: 0.106, r: 0.032, b: 0.065 },
    fxPopClean: { file: "fx-pop-clean.png", w: 1536, h: 1024, l: 0.015, t: 0.077, r: 0.005, b: 0.054 },
    fxSlimeSplash: { file: "fx-slime-splash.png", w: 1536, h: 1024, l: 0.016, t: 0.084, r: 0.004, b: 0.054 },
    grimeDustClump: { file: "grime-dust-clump.png", w: 1536, h: 1024, l: 0.079, t: 0.059, r: 0.064, b: 0.044 },
    grimeMixedClog: { file: "grime-mixed-clog.png", w: 1536, h: 1024, l: 0.043, t: 0.028, r: 0.042, b: 0.046 },
    grimeSlimeLarge: { file: "grime-slime-large.png", w: 1536, h: 1024, l: 0.085, t: 0.036, r: 0.051, b: 0.049 },
    grimeSlimeSmall: { file: "grime-slime-small.png", w: 1254, h: 1254, l: 0.136, t: 0.14, r: 0.103, b: 0.129 },
    grimeSoapLarge: { file: "grime-soap-large.png", w: 1536, h: 1024, l: 0.206, t: 0.221, r: 0.222, b: 0.185 },
    grimeSoapSmall: { file: "grime-soap-small.png", w: 1254, h: 1254, l: 0.069, t: 0.191, r: 0.063, b: 0.224 },
    hairClogFinal: { file: "hair-clog-final.png", w: 1448, h: 1086, l: 0.023, t: 0.006, r: 0.003, b: 0.006 },
    hairKnotLarge: { file: "hair-knot-large.png", w: 1254, h: 1254, l: 0.005, t: 0.01, r: 0.002, b: 0.012 },
    hairKnotMedium: { file: "hair-knot-medium.png", w: 1254, h: 1254, l: 0.018, t: 0.039, r: 0.01, b: 0.029 },
    hairKnotSmall: { file: "hair-knot-small.png", w: 1536, h: 1024, l: 0.018, t: 0.015, r: 0.02, b: 0.041 },
    hairTipClump: { file: "hair-tip-clump.png", w: 1536, h: 1024, l: 0.044, t: 0.018, r: 0.023, b: 0.035 },
    hairTipMedium: { file: "hair-tip-medium.png", w: 1536, h: 1024, l: 0.212, t: 0.02, r: 0.11, b: 0.061 },
    hairTipShort: { file: "hair-tip-short.png", w: 1774, h: 887, l: 0.211, t: 0.014, r: 0.148, b: 0.036 },
    hairTipThin: { file: "hair-tip-thin.png", w: 1536, h: 1024, l: 0.074, t: 0.03, r: 0.078, b: 0.052 },
    resultClogPile: { file: "result-clog-pile.png", w: 1254, h: 1254, l: 0.023, t: 0.105, r: 0.02, b: 0.098 },
    resultDrainClean: { file: "result-drain-clean.png", w: 1254, h: 1254, l: 0.08, t: 0.077, r: 0.082, b: 0.083 },
    resultDrainDirty: { file: "result-drain-dirty.png", w: 1254, h: 1254, l: 0.038, t: 0.04, r: 0.039, b: 0.039 },
    sinkBase: { file: "sink-base.png", w: 1283, h: 1226, l: 0, t: 0, r: 0, b: 0 },
    sinkShadow: { file: "sink-shadow.png", w: 1283, h: 1226, l: 0, t: 0, r: 0, b: 0 },
    waterDrainClear: { file: "water-drain-clear.png", w: 1536, h: 1024, l: 0.03, t: 0.045, r: 0.021, b: 0.046 },
    waterPool: { file: "water-pool.png", w: 1536, h: 1024, l: 0.014, t: 0.09, r: 0.01, b: 0.05 },
    waterShineOverlay: { file: "water-shine-overlay.png", w: 1536, h: 1024, l: 0.021, t: 0.029, r: 0.009, b: 0.016 },
    waterSwirl1: { file: "water-swirl-1.png", w: 1536, h: 1024, l: 0.022, t: 0.026, r: 0.018, b: 0.026 },
    waterSwirl2: { file: "water-swirl-2.png", w: 1536, h: 1024, l: 0, t: 0.017, r: 0, b: 0 },
  };

  /* 효과음 — 파일이 들어오면 경로만 채우면 된다. 없으면 조용히 넘어간다.
     pull 은 당기는 동안 이어져야 하므로 따로 둔다(loop). */
  const SFX = {
    grab: null, pull: null, tension: null, knot_release: null,
    break: null, slime: null, drain_clear: null, result: null,
  };

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const lerp = (a, b, k) => a + (b - a) * k;

  /* ============================================================
     소리 / 진동
     ============================================================ */
  const sfxCache = {}, sfxAt = {};
  let pullLoop = null;
  function sfx(name) {
    const src = SFX[name];
    if (!src) return;
    const now = performance.now();
    if (now - (sfxAt[name] || -9999) < GAME_CONFIG.sfxGap) return;
    sfxAt[name] = now;
    try {
      let a = sfxCache[name];
      if (!a) { a = sfxCache[name] = new Audio(src); a.preload = "auto"; }
      a.currentTime = 0; a.play().catch(() => {});
    } catch (_) {}
  }
  /* 당기는 소리만 이어서 틀고 끈다 */
  function pullSound(on) {
    if (!SFX.pull) return;
    try {
      if (!pullLoop) { pullLoop = new Audio(SFX.pull); pullLoop.loop = true; }
      if (on) pullLoop.play().catch(() => {});
      else { pullLoop.pause(); pullLoop.currentTime = 0; }
    } catch (_) {}
  }
  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {}
  }

  /* ============================================================
     그림 불러오기 — 다 올 때까지 시작 버튼을 잠근다.
     한 장이 실패해도 게임은 돌아간다 (그 그림만 도형으로 대신 그린다).
     ============================================================ */
  const IMGS = {};
  let assetsReady = false;
  function loadAssets(onProgress, done) {
    const keys = Object.keys(BOX);
    let left = keys.length, loaded = 0;
    for (const k of keys) {
      const rec = IMGS[k] = { ok: false, el: new Image() };
      const fin = () => {
        loaded++;
        onProgress && onProgress(loaded / keys.length);
        if (--left <= 0) { assetsReady = true; done && done(); }
      };
      rec.el.onload = () => { rec.ok = true; fin(); };
      /* 사본(webp) -> 원본(png) 순으로 찾아본다 */
      let tried = 0;
      const paths = [
        DIR + BOX[k].file.replace(".png", ".webp"),
        FALLBACK_DIR + BOX[k].file,
      ];
      rec.el.onerror = () => {
        if (tried < paths.length) { rec.el.src = paths[tried++] + "?v=" + ASSET_VERSION; return; }
        console.warn("[drain-hair] 그림을 못 읽었습니다: " + BOX[k].file);
        fin();
      };
      rec.el.src = paths[tried++] + "?v=" + ASSET_VERSION;
    }
  }
  const has = k => !!(IMGS[k] && IMGS[k].ok);

  /* 보이는 폭을 w 로 맞춰 그린다. mode "center" 는 보이는 영역의 중심,
     "bottom" 은 접지 중앙. 비율은 원본 그대로 — 찌그러뜨리지 않는다. */
  function draw(g, key, x, y, w, opt) {
    if (!has(key)) return false;
    const o = opt || {}, B = BOX[key], im = IMGS[key].el;
    const vw = 1 - B.l - B.r, vh = 1 - B.t - B.b;
    const dw = w / vw;
    const dh = dw * (im.naturalHeight / im.naturalWidth);
    const ox = -dw * (B.l + vw / 2);
    const oy = o.mode === "bottom" ? -dh * (1 - B.b) : -dh * (B.t + vh / 2);
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    if (o.scale && o.scale !== 1) g.scale(o.scale, o.scale);
    if (o.alpha !== undefined) g.globalAlpha = clamp(o.alpha, 0, 1);
    g.drawImage(im, ox, oy, dw, dh);
    g.restore();
    return true;
  }
  /* 그 그림을 w 폭으로 그렸을 때 보이는 높이 */
  function visH(key, w) {
    if (!has(key)) return w * 0.6;
    const B = BOX[key], im = IMGS[key].el;
    const dw = w / (1 - B.l - B.r);
    return dw * (im.naturalHeight / im.naturalWidth) * (1 - B.t - B.b);
  }

  /* ============================================================
     상태
     ============================================================ */
  /* 상태 머신 — 이 이름들로만 움직인다 */
  const ST = {
    TITLE: "TITLE", READY: "READY", SEARCHING: "SEARCHING", GRABBED: "GRABBED",
    PULLING: "PULLING", TENSION: "TENSION", BREAK: "BREAK", REGRAB: "REGRAB",
    FINAL_CLOG: "FINAL_CLOG", CLEAR: "CLEAR", TIME_OVER: "TIME_OVER", RESULT: "RESULT",
  };

  const S = {
    state: ST.TITLE,
    preset: PRESETS[0],
    left: GAME_CONFIG.duration,
    elapsed: 0,

    /* 머리카락 */
    total: 150,                   // 이 판의 전체 길이(cm)
    extracted: 0,                 // 뽑아낸 길이(cm)
    segments: [],                 // 구간별 저항
    knots: [], grimes: [],        // 매듭·오염물
    tipKind: "hairTipShort",
    nodes: [],                    // 사슬 마디 {x,y,vx,vy}
    grab: null,                   // 잡은 자리 {x,y}
    outDir: { x: 0, y: 1 },       // 머리카락이 나오는 방향
    visLen: 0,

    /* 손끝 */
    ptr: null, ptrPrev: null,
    pullSpeed: 0, pullAccel: 0, prevSpeed: 0,
    angleDeg: 0, angleMul: 1,
    tension: 0, overTime: 0,
    resistance: 1,

    /* 기록 */
    breaks: 0, streak: 0, streakBest: 0,
    clean: 0,
    regrabLeft: 0,

    /* 연출 */
    fx: [], shake: 0, flash: 0,
    msg: "", msgLeft: 0, msgBad: false,
    banner: "", bannerLeft: 0,
    clearLeft: 0,
    waterSpin: 0,
    clogOut: 0,                   // 최종 덩어리가 빠져나온 정도 0~1

    /* 최고 기록 */
    bestScore: 0, bestLength: 0, bestClean: 0,
    fps: 0,
  };
  try {
    S.bestScore = +(localStorage.getItem("ccojik_drain_score") || 0) || 0;
    S.bestLength = +(localStorage.getItem("ccojik_drain_length") || 0) || 0;
    S.bestClean = +(localStorage.getItem("ccojik_drain_clean") || 0) || 0;
  } catch (_) {}

  const cv = $("cv"), ctx = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1, sc = 1;

  function fitCanvas() {
    const r = cv.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(r.width); H = Math.round(r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    sc = H / REF_H;
    return true;
  }
  addEventListener("resize", fitCanvas);
  addEventListener("orientationchange", fitCanvas);
  try { new ResizeObserver(fitCanvas).observe(cv); } catch (_) {}

  /* 논리 좌표 -> 화면 변환. 원점은 배수구 구멍 가운데. */
  function world(g) {
    const k = GAME_CONFIG.break;
    const sh = S.shake > 0 ? (Math.random() - 0.5) * k.shakeAmp * (S.shake / k.shake) : 0;
    g.setTransform(dpr * sc, 0, 0, dpr * sc,
      dpr * (W / 2 + sh), dpr * (H / 2 + DRAIN_Y * sc));
    g.imageSmoothingEnabled = true;
    try { g.imageSmoothingQuality = "high"; } catch (_) {}
  }
  const topY = () => -(H / 2 + DRAIN_Y * sc) / sc;
  const botY = () => (H / 2 - DRAIN_Y * sc) / sc;
  /* 화면 좌표 -> 논리 좌표 */
  function toLogical(sx, sy) {
    return { x: (sx - W / 2) / sc, y: (sy - H / 2) / sc - DRAIN_Y };
  }

  /* ============================================================
     판 차리기
     ============================================================ */
  /* 전체 길이를 구간으로 나눈다 — 구간마다 저항이 다르다 */
  function buildSegments(p) {
    const R = GAME_CONFIG.resistance, m = p.resMul;
    const seg = [
      { to: 0.15, res: R.normal * m, kind: "normal" },
      { to: 0.28, res: R.soap * m, kind: "soap" },
      { to: 0.48, res: R.normal * m, kind: "normal" },
      { to: 0.60, res: R.smallKnot * m, kind: "smallKnot" },
      { to: 0.74, res: R.grime * m, kind: "grime" },
      { to: 0.88, res: R.largeKnot * m, kind: "largeKnot" },
      { to: 1.01, res: R.final * m, kind: "final" },
    ];
    /* 최종 덩어리 시작점은 프리셋마다 조금 다르다 */
    seg[5].to = p.clogAt;
    return seg;
  }

  function buildHair() {
    const p = S.preset;
    S.total = p.total;
    S.extracted = 0;
    S.segments = buildSegments(p);

    /* 매듭 — 저항이 큰 구간 머리에 놓아 '여기서 걸린다' 가 맞게 한다 */
    const knotSpots = [0.52, 0.60, 0.76, 0.84, 0.68, 0.44];
    const knotKinds = ["hairKnotSmall", "hairKnotMedium", "hairKnotLarge"];
    S.knots = [];
    for (let i = 0; i < p.knots; i++) {
      S.knots.push({
        p: knotSpots[i % knotSpots.length] + rnd(-0.02, 0.02),
        kind: knotKinds[Math.min(2, Math.floor(i * 3 / Math.max(1, p.knots)))],
        w: rnd(150, 230), rot: rnd(-0.5, 0.5), out: false,
      });
    }
    /* 오염물 — 머리카락에 붙어 같이 올라온다 */
    const grimeKinds = ["grimeSoapSmall", "grimeSoapLarge", "grimeSlimeSmall",
                        "grimeSlimeLarge", "grimeDustClump", "grimeMixedClog"];
    S.grimes = [];
    for (let i = 0; i < p.grimes; i++) {
      S.grimes.push({
        p: rnd(0.14, p.clogAt - 0.04),
        kind: pick(grimeKinds),
        w: rnd(110, 190), rot: rnd(-0.8, 0.8),
        offX: rnd(-26, 26), offY: rnd(-18, 18), out: false,
      });
    }
    S.knots.sort((a, b) => a.p - b.p);
    S.grimes.sort((a, b) => a.p - b.p);
    S.clogOut = 0;
    newTip();
    resetChain();
  }

  /* 잡을 끝부분을 구멍 위에 내놓는다 */
  function newTip() {
    const kinds = ["hairTipShort", "hairTipMedium", "hairTipThin", "hairTipClump"];
    S.tipKind = S.breaks === 0 ? "hairTipShort" : kinds[Math.min(3, S.breaks)];
  }
  const grabRadius = () => {
    const g = GAME_CONFIG;
    return g.grabRadius * g.grabShrink[Math.min(g.grabShrink.length - 1, S.breaks)];
  };
  /* 끝부분이 쉬고 있는 자리 — 구멍에서 조금 나온 상태 */
  function tipRest() {
    return { x: 0, y: GAME_CONFIG.hair.visMin * 0.42 };
  }

  function resetChain() {
    const n = GAME_CONFIG.hair.nodes;
    const rest = tipRest();
    S.nodes = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      S.nodes.push({ x: rest.x * k, y: rest.y * k, vx: 0, vy: 0 });
    }
    S.visLen = Math.hypot(rest.x, rest.y);
    S.outDir = { x: 0, y: 1 };
  }

  /* ============================================================
     머리카락 물리
     ============================================================ */
  /* 지금 뽑히는 자리의 저항 — 구간 + 매듭이 걸려 있으면 그쪽이 이긴다 */
  function resistanceNow() {
    const prog = S.extracted / S.total;
    let res = 1;
    for (const s of S.segments) { if (prog < s.to) { res = s.res; break; } }
    /* 매듭이 구멍을 막 지나는 동안은 더 버틴다 */
    for (const k of S.knots) {
      if (Math.abs(prog - k.p) < 0.025) {
        const R = GAME_CONFIG.resistance;
        const extra = k.kind === "hairKnotLarge" ? R.largeKnot
                    : k.kind === "hairKnotMedium" ? R.mediumKnot : R.smallKnot;
        res = Math.max(res, extra * S.preset.resMul);
      }
    }
    return res;
  }
  const segmentName = () => {
    const prog = S.extracted / S.total;
    for (const s of S.segments) if (prog < s.to) return s.kind;
    return "final";
  };

  /* 사슬 — 마디마다 '곧은 선 + 늘어짐' 을 향해 당겨지는 감쇠 스프링.
     장력이 높으면 늘어짐이 줄어 거의 직선이 된다. */
  function stepChain(dt) {
    const C = GAME_CONFIG.hair;
    const n = S.nodes.length;
    const end = S.grab || tipRest();
    const ax = 0, ay = 0;                        // 고정점 = 구멍
    const dx = end.x - ax, dy = end.y - ay;
    const len = Math.hypot(dx, dy) || 1;
    /* 줄기에 직각인 방향 — 늘어짐은 이 쪽으로 생긴다 */
    const nx = -dy / len, ny = dx / len;
    const sag = C.sag * (1 - S.tension) * clamp(len / C.visMax, 0.25, 1);
    const k = Math.min(1, dt * 60) ;             // 60fps 기준으로 맞춘다

    for (let i = 1; i < n; i++) {
      const u = i / (n - 1);
      const bend = Math.sin(u * Math.PI);        // 가운데가 가장 많이 늘어진다
      const tx = ax + dx * u + nx * sag * bend;
      const ty = ay + dy * u + ny * sag * bend + sag * 0.35 * bend;
      const node = S.nodes[i];
      node.vx += (tx - node.x) * C.stiffness * k;
      node.vy += (ty - node.y) * C.stiffness * k;
      node.vx *= Math.pow(C.damping, k);
      node.vy *= Math.pow(C.damping, k);
      node.x += node.vx * k;
      node.y += node.vy * k;
    }
    S.nodes[0].x = ax; S.nodes[0].y = ay;
    /* 마지막 마디는 손끝을 따라간다 — 저항이 크면 조금 늦게 */
    const lagK = clamp(1 - (S.resistance - 1) * 0.5, 0.35, 1);
    const last = S.nodes[n - 1];
    last.x = lerp(last.x, end.x, Math.min(1, dt * 26 * lagK));
    last.y = lerp(last.y, end.y, Math.min(1, dt * 26 * lagK));
    S.visLen = Math.hypot(last.x, last.y);
  }

  /* 사슬을 지나는 부드러운 곡선 위의 한 점 (0~1) */
  function curvePoint(t) {
    const n = S.nodes.length;
    const f = clamp(t, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    const u = f - i;
    const p0 = S.nodes[Math.max(0, i - 1)], p1 = S.nodes[i];
    const p2 = S.nodes[i + 1], p3 = S.nodes[Math.min(n - 1, i + 2)];
    /* Catmull-Rom */
    const q = (a, b, c, d) =>
      0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u +
             (-a + 3 * b - 3 * c + d) * u * u * u);
    return { x: q(p0.x, p1.x, p2.x, p3.x), y: q(p0.y, p1.y, p2.y, p3.y) };
  }

  /* ============================================================
     손 입력 — 포인터 하나로 마우스·터치를 함께 받는다
     ============================================================ */
  function pos(e) {
    const r = cv.getBoundingClientRect();
    return toLogical(e.clientX - r.left, e.clientY - r.top);
  }
  const playing = () => [ST.SEARCHING, ST.GRABBED, ST.PULLING, ST.TENSION,
                         ST.REGRAB, ST.FINAL_CLOG].includes(S.state);

  cv.addEventListener("pointerdown", e => {
    if (!playing()) return;
    e.preventDefault();
    const p = pos(e);
    /* 끝부분 근처를 잡아야 한다 */
    const t = S.grab || tipRest();
    if (Math.hypot(p.x - t.x, p.y - t.y) > grabRadius()) return;
    if (S.regrabLeft > 0) return;
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    cv.classList.add("grabbing");
    S.grab = { x: p.x, y: p.y };
    S.ptr = { x: p.x, y: p.y, t: performance.now() };
    S.ptrPrev = null;
    S.pullSpeed = 0; S.prevSpeed = 0; S.pullAccel = 0;
    S.streak = 0;
    S.state = ST.GRABBED;
    sfx("grab"); buzz(10);
    pullSound(true);
  }, { passive: false });

  cv.addEventListener("pointermove", e => {
    if (!S.grab || !playing()) return;
    e.preventDefault();
    const p = pos(e), now = performance.now();
    const dt = Math.max(0.008, (now - (S.ptr ? S.ptr.t : now)) / 1000);
    const dx = p.x - S.ptr.x, dy = p.y - S.ptr.y;
    const moved = Math.hypot(dx, dy);

    /* 손끝 속도 — 날값은 튀므로 섞어 쓴다 */
    const raw = moved / dt;
    S.pullSpeed = lerp(S.pullSpeed, raw, GAME_CONFIG.pull.smooth);
    S.pullAccel = (S.pullSpeed - S.prevSpeed) / dt;
    S.prevSpeed = S.pullSpeed;

    /* 결 대비 각도 — 줄기 방향과 손이 가는 방향의 차이 */
    if (moved > 0.5) {
      const mvx = dx / moved, mvy = dy / moved;
      const dot = clamp(mvx * S.outDir.x + mvy * S.outDir.y, -1, 1);
      S.angleDeg = Math.acos(dot) * 180 / Math.PI;
    }

    /* 당긴 만큼 뽑혀 나온다 — 구멍에서 멀어지는 쪽만 센다 */
    const before = Math.hypot(S.ptr.x, S.ptr.y);
    const after = Math.hypot(p.x, p.y);
    const feed = Math.max(0, after - before);
    if (feed > 0 && S.state !== ST.BREAK) {
      const add = feed * GAME_CONFIG.hair.cmPerPx / S.resistance;
      S.extracted = Math.min(S.total, S.extracted + add);
      S.streak += add;
      S.streakBest = Math.max(S.streakBest, S.streak);
      if (Math.random() < 0.035) addFx("fxDroplet", curvePoint(0.6), 70);
    }

    S.ptrPrev = S.ptr;
    S.ptr = { x: p.x, y: p.y, t: now };
    /* 보이는 줄기는 화면 밖으로 안 나가게 길이를 묶는다 */
    const d = Math.hypot(p.x, p.y) || 1;
    const vl = clamp(d, GAME_CONFIG.hair.visMin, GAME_CONFIG.hair.visMax);
    S.grab = { x: p.x / d * vl, y: p.y / d * vl };
    S.outDir = { x: lerp(S.outDir.x, p.x / d, 0.18), y: lerp(S.outDir.y, p.y / d, 0.18) };
    const on = Math.hypot(S.outDir.x, S.outDir.y) || 1;
    S.outDir.x /= on; S.outDir.y /= on;
    /* 너무 멀리 끌면 팽팽해진다 */
    S.overPull = Math.max(0, d - GAME_CONFIG.hair.visMax) / 260;
  }, { passive: false });

  function release() {
    if (!S.grab) return;
    cv.classList.remove("grabbing");
    pullSound(false);
    S.grab = null; S.ptr = null; S.ptrPrev = null;
    S.pullSpeed = 0; S.tension = 0; S.overTime = 0; S.overPull = 0;
    /* 손을 놓으면 조금 다시 들어간다 — 짧게 끊어 당기는 꼼수를 막는다 */
    S.extracted = Math.max(0, S.extracted * (1 - GAME_CONFIG.hair.retractOnRelease));
    S.regrabLeft = GAME_CONFIG.hair.regrabDelay;
    if (playing()) S.state = ST.SEARCHING;
  }
  ["pointerup", "pointercancel"].forEach(t => cv.addEventListener(t, release));
  addEventListener("pointerup", release);
  addEventListener("blur", release);

  /* ============================================================
     장력 / 끊김
     ============================================================ */
  function stepTension(dt) {
    const C = GAME_CONFIG;
    S.resistance = resistanceNow();
    /* 각도 벌점 */
    const a = S.angleDeg;
    S.angleMul = a <= C.angle.safe ? 1
      : a <= C.angle.warning ? lerp(1, 1.35, (a - C.angle.safe) / (C.angle.warning - C.angle.safe))
      : a <= C.angle.danger ? lerp(1.35, C.angle.maxMul, (a - C.angle.warning) / (C.angle.danger - C.angle.warning))
      : C.angle.maxMul;

    if (!S.grab) {
      S.tension = lerp(S.tension, 0, Math.min(1, dt * 6));
      S.overTime = 0;
      return;
    }
    /* 속도 x 저항 x 각도 (+ 급가속, + 너무 멀리 끌기) */
    const spd = S.pullSpeed / C.pull.dangerSpeed;
    let t = spd * S.resistance * S.angleMul;
    t += clamp(S.pullAccel / 9000, 0, 0.35);
    t += (S.overPull || 0) * 0.55;
    S.tension = clamp(lerp(S.tension, t, Math.min(1, dt * 12)), 0, 1.6);

    /* 한계를 '잠깐' 넘긴 것으로는 안 끊어진다 */
    if (S.tension > C.break.breakThreshold) {
      S.overTime += dt;
      if (S.overTime >= C.break.holdTime) doBreak();
    } else {
      S.overTime = Math.max(0, S.overTime - dt * 1.6);
      if (S.tension > C.break.warningThreshold) {
        S.state = ST.TENSION;
        sfx("tension");                            // 팽팽해지는 소리 (쿨다운이 겹침을 막는다)
        if (!S.msgLeft) say("살살!", true);
      } else if (S.grab) {
        S.state = S.extracted / S.total >= S.preset.clogAt ? ST.FINAL_CLOG : ST.PULLING;
      }
    }
  }

  function doBreak() {
    const C = GAME_CONFIG.break;
    const at = S.grab ? { x: S.grab.x, y: S.grab.y } : tipRest();
    S.breaks++;
    S.state = ST.BREAK;
    addFx("fxBreakHair", at, 300);
    S.shake = C.shake;
    buzz(40); sfx("break");
    say("끊어졌다!", true);
    pullSound(false);
    cv.classList.remove("grabbing");
    /* 끊어진 쪽은 손 방향으로 튕기고, 남은 쪽은 구멍으로 조금 들어간다 */
    const d = Math.hypot(at.x, at.y) || 1;
    for (const n of S.nodes) {
      n.vx += at.x / d * C.recoil * 0.1;
      n.vy += at.y / d * C.recoil * 0.1;
    }
    S.extracted = Math.max(0, S.extracted - S.total * 0.03);
    S.grab = null; S.ptr = null;
    S.tension = 0; S.overTime = 0; S.overPull = 0;
    S.streak = 0;
    S.regrabLeft = 0.5;
    newTip();
  }

  /* ============================================================
     최종 덩어리 / 클리어
     ============================================================ */
  function stepClog(dt) {
    const prog = S.extracted / S.total;
    if (prog < S.preset.clogAt) return;
    /* 덩어리가 구멍에서 빠져나온 정도 */
    S.clogOut = clamp((prog - S.preset.clogAt) / (1 - S.preset.clogAt), 0, 1);
    if (S.clogOut >= 1 && S.state !== ST.CLEAR) doClear();
    void dt;
  }

  function doClear() {
    S.state = ST.CLEAR;
    S.clean = 100;
    S.clearLeft = GAME_CONFIG.clearHold;
    S.flash = 0.18;
    const at = S.grab || { x: 0, y: -200 };
    addFx("fxSlimeSplash", at, 520);
    addFx("fxDroplet", { x: at.x, y: at.y + 60 }, 320);
    addFx("fxPopClean", { x: 0, y: 0 }, 460);
    buzz(30); sfx("slime"); sfx("drain_clear");
    say("쑥 빠졌다!");
    banner("CLEAR!", "");
    pullSound(false);
    S.grab = null; S.ptr = null;
    cv.classList.remove("grabbing");
  }

  /* ============================================================
     연출
     ============================================================ */
  function addFx(kind, at, w) {
    if (S.fx.length >= GAME_CONFIG.maxFx) S.fx.shift();
    S.fx.push({ kind, x: at.x, y: at.y, w, life: GAME_CONFIG.fxTime, rot: rnd(-0.4, 0.4) });
  }
  function stepFx(dt) {
    for (let i = S.fx.length - 1; i >= 0; i--) {
      if ((S.fx[i].life -= dt) <= 0) S.fx.splice(i, 1);
    }
  }
  function say(text, bad) { S.msg = text; S.msgBad = !!bad; S.msgLeft = 0.45; }
  function banner(t, sub) { S.banner = t; S.bannerSub = sub || ""; S.bannerLeft = 0.9; }

  /* ============================================================
     진행
     ============================================================ */
  function step(dt) {
    if (S.state === ST.READY) {
      S.readyLeft -= dt;
      if (S.readyLeft <= 0) { S.state = ST.SEARCHING; S.msgLeft = 0; }
      return;
    }
    if (S.state === ST.CLEAR) {
      S.clearLeft -= dt;
      S.waterSpin += dt * 3.2;
      stepFx(dt); stepChain(dt);
      if (S.shake > 0) S.shake -= dt;
      if (S.flash > 0) S.flash -= dt;
      if (S.bannerLeft > 0) S.bannerLeft -= dt;
      if (S.clearLeft <= 0) showResult(true);
      return;
    }
    if (!playing() && S.state !== ST.BREAK) return;

    /* 시간 */
    S.left = Math.max(0, S.left - dt);
    S.elapsed += dt;
    if (S.left <= 0) { timeOver(); return; }

    if (S.regrabLeft > 0) {
      S.regrabLeft -= dt;
      if (S.regrabLeft <= 0 && S.state === ST.BREAK) S.state = ST.REGRAB;
    }
    if (S.state === ST.REGRAB) S.state = ST.SEARCHING;

    stepTension(dt);
    stepChain(dt);
    stepClog(dt);
    stepFx(dt);
    S.waterSpin += dt * (0.35 + S.clean / 100 * 1.4);
    if (S.shake > 0) S.shake -= dt;
    if (S.flash > 0) S.flash -= dt;
    if (S.msgLeft > 0) S.msgLeft -= dt;
    if (S.bannerLeft > 0) S.bannerLeft -= dt;

    /* 청소율 — 최종 덩어리가 빠져야 100% 가 된다 */
    if (S.state !== ST.CLEAR) S.clean = Math.min(99, S.extracted / S.total * 100);

    /* 매듭·오염물이 구멍을 지나는 순간 한 번씩 알려 준다 */
    const prog = S.extracted / S.total;
    for (const k of S.knots) {
      if (!k.out && prog > k.p) {
        k.out = true;
        addFx("fxPopClean", curvePoint(0.12), 220);
        buzz(15); sfx("knot_release");
        say("매듭 풀렸다!");
      }
    }
    for (const gr of S.grimes) {
      if (!gr.out && prog > gr.p) {
        gr.out = true;
        addFx("fxSlimeSplash", curvePoint(0.1), 240);
        buzz(15); sfx("slime");
      }
    }
    paintHud();
  }

  function paintHud() {
    const m = Math.floor(S.left / 60), s = Math.floor(S.left % 60);
    $("timeNum").textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    $("cleanNum").textContent = Math.floor(S.clean);
    $("top").querySelector(".gauge").classList.toggle("low", S.left <= GAME_CONFIG.hotAt);
  }

  /* ============================================================
     그리기
     ============================================================ */
  /* 청소율에 따른 오염 세기 */
  const dirtAlpha = () => clamp(1 - S.clean / 95, 0, 1);

  function drawScene(g) {
    const box = DRAIN_R * 2;
    /* 1~2 싱크 바탕 */
    if (!draw(g, "sinkBase", 0, 0, Math.max(W / sc, botY() - topY()) * 1.25, { mode: "center" })) {
      g.fillStyle = "#C9D2D6";
      g.fillRect(-W / sc, topY(), (W / sc) * 2, botY() - topY());
    }
    draw(g, "sinkShadow", 0, 0, box * 2.1, { mode: "center", alpha: 0.75 });

    /* 3~4 배수구 안쪽 */
    draw(g, "drainInnerDark", 0, 0, box * 0.92, { mode: "center" });
    draw(g, "drainInnerDirty", 0, 0, box * 0.92, { mode: "center", alpha: dirtAlpha() * 0.95 });

    /* 7 물 — 청소율에 따라 층이 바뀐다 (회전·크기·투명도로 섞는다) */
    drawWater(g, box);

    /* 5~6 금속 테와 가장자리 때 */
    draw(g, "drainRing", 0, 0, box, { mode: "center" });
    draw(g, "drainRingWet", 0, 0, box, { mode: "center", alpha: clamp(S.clean / 70, 0, 1) * 0.55 });
    draw(g, "drainEdgeDirt", 0, 0, box * 1.02, { mode: "center", alpha: dirtAlpha() * 0.9 });
  }

  function drawWater(g, box) {
    const c = S.clean;
    const spin = S.waterSpin;
    /* 고인 물 — 처음엔 많이 보이고 깨끗해지면 사라진다 */
    draw(g, "waterPool", 0, 0, box * 1.08, { mode: "center", alpha: clamp(1 - c / 80, 0, 1) * 0.9 });
    /* 돌기 시작 */
    const a1 = clamp((c - 20) / 35, 0, 1) * clamp(1 - (c - 60) / 40, 0, 1);
    draw(g, "waterSwirl1", 0, 0, box * 1.0, { mode: "center", alpha: a1 * 0.85, rot: spin * 0.5 });
    /* 더 빠르게 */
    const a2 = clamp((c - 55) / 35, 0, 1);
    draw(g, "waterSwirl2", 0, 0, box * 0.98, { mode: "center", alpha: a2 * 0.9, rot: -spin * 1.1 });
    /* 다 빠지는 순간 */
    if (S.state === ST.CLEAR) {
      const k = 1 - clamp(S.clearLeft / GAME_CONFIG.clearHold, 0, 1);
      draw(g, "waterDrainClear", 0, 0, box * (1.1 - k * 0.5),
        { mode: "center", alpha: 1 - k * 0.8, rot: spin * 2.2 });
    }
  }

  /* 머리카락 줄기 — 긴 PNG 가 아니라 사슬을 지나는 곡선으로 그린다 */
  function drawHair(g) {
    const n = S.nodes.length;
    if (n < 2) return;
    const taut = clamp(S.tension, 0, 1);
    /* 떨림 — 끊어질 것 같을 때만 눈에 보인다 */
    const shiver = taut > GAME_CONFIG.break.warningThreshold
      ? (taut - GAME_CONFIG.break.warningThreshold) * 26 : 0;
    const t = performance.now() / 1000;

    const path = (wd, col, alpha) => {
      g.save();
      g.globalAlpha = alpha === undefined ? 1 : alpha;
      g.strokeStyle = col;
      g.lineWidth = wd;
      g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath();
      const STEPS = 34;
      for (let i = 0; i <= STEPS; i++) {
        const p = curvePoint(i / STEPS);
        const sh = shiver * Math.sin(i * 1.7 + t * 42) * (i / STEPS);
        const x = p.x + sh, y = p.y;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
      g.restore();
    };
    /* 굵게 어둡게 한 번, 가늘게 밝게 한 번 — 가닥처럼 보이게 */
    path(13, "rgba(24,20,18,.92)");
    path(5, "rgba(96,80,70,.75)", 0.8);
    /* 잡은 끝부분 */
    const end = curvePoint(1);
    const ang = Math.atan2(end.y - curvePoint(0.88).y, end.x - curvePoint(0.88).x);
    draw(g, S.tipKind, end.x, end.y, 200, { mode: "center", rot: ang - Math.PI / 2 });
  }

  /* 매듭·오염물 — 진행도에 따라 곡선을 타고 올라온다 */
  function drawOnHair(g) {
    const prog = S.extracted / S.total;
    const visCm = GAME_CONFIG.hair.visCm;
    const place = (item, key, w) => {
      if (prog < item.p) return;                 // 아직 구멍 안
      const t = clamp((prog - item.p) * S.total / visCm, 0, 1);
      const p = curvePoint(t);
      draw(g, key, p.x + (item.offX || 0), p.y + (item.offY || 0), w,
        { mode: "center", rot: item.rot + t * 0.6 });
    };
    for (const gr of S.grimes) place(gr, gr.kind, gr.w);
    for (const k of S.knots) place(k, k.kind, k.w);
  }

  /* 최종 덩어리 — 마지막에 구멍에서 쑥 올라온다 */
  function drawClog(g) {
    if (S.extracted / S.total < S.preset.clogAt) return;
    const k = S.clogOut;
    const p = curvePoint(clamp(k * 0.8, 0, 0.8));
    const w = (S.preset.mega ? 520 : 420) * (0.6 + k * 0.4);
    draw(g, "hairClogFinal", p.x, p.y, w, { mode: "center", rot: Math.sin(k * 3) * 0.12 });
  }

  /* 잡을 자리 표시 — 손가락이 가까우면 또렷해진다 */
  function drawGrabHint(g) {
    if (S.state !== ST.SEARCHING && S.state !== ST.BREAK) return;
    const t = tipRest();
    const r = grabRadius();
    const pulse = 0.35 + 0.3 * Math.sin(performance.now() / 300);
    g.save();
    g.globalAlpha = S.regrabLeft > 0 ? 0.25 : pulse;
    g.strokeStyle = "#FFCE1F";
    g.lineWidth = 7;
    g.setLineDash([26, 20]);
    g.beginPath(); g.ellipse(t.x, t.y, r, r, 0, 0, 7); g.stroke();
    g.restore();
  }

  function drawFx(g) {
    for (const f of S.fx) {
      const k = f.life / GAME_CONFIG.fxTime;
      draw(g, f.kind, f.x, f.y, f.w * (1.25 - k * 0.25),
        { mode: "center", alpha: Math.min(1, k * 1.6), rot: f.rot });
    }
  }

  /* 뽑은 길이 — 머리카락 근처에 작게 */
  function drawLength(g) {
    if (!playing() && S.state !== ST.CLEAR) return;
    const end = curvePoint(1);
    const size = 46;
    g.save();
    g.font = "800 " + size + "px Pretendard, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 10; g.strokeStyle = "rgba(255,255,255,.92)";
    const txt = Math.floor(S.extracted) + "cm";
    g.strokeText(txt, end.x, end.y + 78);
    g.fillStyle = "#1A1A16";
    g.fillText(txt, end.x, end.y + 78);
    g.restore();
  }

  function drawMsg(g) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.textAlign = "center"; g.textBaseline = "middle";
    if (S.msg && S.msgLeft > 0) {
      const size = Math.max(16, Math.min(W * 0.062, H * 0.038));
      g.save();
      g.globalAlpha = Math.min(1, S.msgLeft * 4);
      g.font = "800 " + size + "px Pretendard, sans-serif";
      const y = H * 0.84;
      g.lineWidth = Math.max(4, size * 0.3);
      g.strokeStyle = "rgba(255,255,255,.95)";
      g.strokeText(S.msg, W / 2, y);
      g.fillStyle = S.msgBad ? "#DA2B2B" : "#1A1A16";
      g.fillText(S.msg, W / 2, y);
      g.restore();
    }
    let big = "";
    if (S.state === ST.READY) big = "READY";
    else if (S.bannerLeft > 0) big = S.banner;
    if (big) {
      const size = Math.max(24, Math.min(W * 0.12, H * 0.07));
      g.save();
      g.globalAlpha = S.state === ST.READY ? 1 : Math.min(1, S.bannerLeft * 3);
      g.font = "800 " + size + "px Pretendard, sans-serif";
      g.lineWidth = Math.max(5, size * 0.26);
      g.strokeStyle = "rgba(255,255,255,.95)";
      g.strokeText(big, W / 2, H * 0.38);
      g.fillStyle = big === "CLEAR!" ? "#1C9A46" : "#1A1A16";
      g.fillText(big, W / 2, H * 0.38);
      g.restore();
    }
  }

  function drawDebug(g) {
    const rows = [
      "fps: " + S.fps.toFixed(0),
      "state: " + S.state,
      "pullSpeed: " + S.pullSpeed.toFixed(0),
      "pullAccel: " + S.pullAccel.toFixed(0),
      "tension: " + S.tension.toFixed(3) + " / " + GAME_CONFIG.break.breakThreshold,
      "resistance: " + S.resistance.toFixed(2) + "  seg: " + segmentName(),
      "angle: " + S.angleDeg.toFixed(0) + "deg  x" + S.angleMul.toFixed(2),
      "extracted: " + S.extracted.toFixed(1) + "cm / " + S.total + "cm",
      "remaining: " + (S.total - S.extracted).toFixed(1) + "cm",
      "clean: " + S.clean.toFixed(1) + "%  breaks: " + S.breaks,
      "preset: " + S.preset.key + "  fx: " + S.fx.length,
    ];
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = "600 11px monospace";
    g.textAlign = "left"; g.textBaseline = "top";
    g.fillStyle = "rgba(255,255,255,.88)";
    g.fillRect(4, 4, 232, rows.length * 14 + 8);
    g.fillStyle = "#1A1A16";
    rows.forEach((t, i) => g.fillText(t, 10, 9 + i * 14));
  }

  function render() {
    if (!W || !H) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    world(g);
    drawScene(g);
    drawGrabHint(g);
    drawHair(g);
    drawOnHair(g);
    drawClog(g);
    /* 10~11 광택과 물빛은 머리카락 위에 아주 옅게 */
    const box = DRAIN_R * 2;
    draw(g, "drainHighlight", 0, 0, box, { mode: "center", alpha: 0.3 + S.clean / 100 * 0.35 });
    draw(g, "waterShineOverlay", 0, 0, box * 1.05,
      { mode: "center", alpha: clamp(1 - S.clean / 90, 0, 1) * 0.35, rot: S.waterSpin * 0.2 });
    drawFx(g);
    drawLength(g);
    if (S.flash > 0) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "rgba(255,255,255," + (S.flash / 0.18 * 0.45).toFixed(3) + ")";
      g.fillRect(0, 0, W, H);
    }
    drawMsg(g);
    if (DEBUG_GAME) drawDebug(g);
  }

  let last = 0, acc = 0, frames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!W || !H) { if (!fitCanvas()) return; }
    const raw = last ? (now - last) / 1000 : 0;
    last = now;
    const dt = Math.min(0.05, raw);
    acc += raw; frames++;
    if (acc >= 0.5) { S.fps = frames / acc; acc = 0; frames = 0; }
    step(dt);
    render();
  }
  requestAnimationFrame(frame);

  /* ============================================================
     판 시작 / 끝
     ============================================================ */
  function start(skipReady) {
    fitCanvas();
    S.preset = Math.random() < MEGA_CHANCE ? MEGA : pick(PRESETS);
    S.left = GAME_CONFIG.duration;
    S.elapsed = 0;
    S.breaks = 0; S.streak = 0; S.streakBest = 0;
    S.clean = 0;
    S.tension = 0; S.overTime = 0; S.overPull = 0;
    S.pullSpeed = 0; S.prevSpeed = 0; S.pullAccel = 0;
    S.angleDeg = 0; S.angleMul = 1; S.resistance = 1;
    S.grab = null; S.ptr = null; S.ptrPrev = null;
    S.regrabLeft = 0;
    S.fx.length = 0;
    S.shake = 0; S.flash = 0;
    S.msg = ""; S.msgLeft = 0;
    S.banner = ""; S.bannerLeft = 0;
    S.waterSpin = 0; S.clearLeft = 0;
    buildHair();
    cv.classList.remove("grabbing");
    $("startOver").hidden = true;
    $("endOver").hidden = true;
    if (skipReady) S.state = ST.SEARCHING;
    else { S.state = ST.READY; S.readyLeft = 0.5; }
    paintHud();
  }

  function timeOver() {
    if (S.state === ST.TIME_OVER || S.state === ST.RESULT) return;
    S.state = ST.TIME_OVER;
    pullSound(false);
    S.grab = null; S.ptr = null;
    banner("TIME OVER", "");
    buzz(30);
    setTimeout(() => showResult(false), 600);
  }

  const gradeFor = n => GRADES.find(g => n >= g.min) || GRADES[GRADES.length - 1];

  function scoreOf() {
    const C = GAME_CONFIG.score;
    const cleared = S.clean >= 100;
    const clean = C.clean * (S.clean / 100);
    const brk = GAME_CONFIG.breakScore[Math.min(GAME_CONFIG.breakScore.length - 1, S.breaks)];
    const time = cleared ? C.time * clamp(S.left / GAME_CONFIG.duration, 0, 1) : 0;
    const streak = C.streak * clamp(S.streakBest / Math.max(1, S.total), 0, 1);
    return {
      total: clamp(Math.round(clean + brk + time + streak), 0, 100),
      clean, brk, time, streak, cleared,
    };
  }

  let lastArt = null, lastInfo = null;
  function showResult(cleared) {
    if (S.state === ST.RESULT) return;
    S.state = ST.RESULT;
    const sc2 = scoreOf();
    const G = gradeFor(sc2.total);
    const rec = sc2.total > S.bestScore;

    $("resTitle").textContent = cleared ? "배수구 청소 완료!" : "시간 종료!";
    $("resTitle").classList.toggle("fail", !cleared);
    $("newRec").hidden = !rec;
    $("finalScore").textContent = sc2.total;
    $("gradeLabel").textContent = G.title;
    $("remark").textContent = G.remark;
    $("rClean").textContent = Math.floor(S.clean) + "%";
    $("rLength").textContent = Math.floor(S.extracted) + "cm";
    $("rStreak").textContent = Math.floor(S.streakBest) + "cm";
    $("rBreak").textContent = S.breaks + "회";
    $("rTime").textContent = S.elapsed.toFixed(1) + "초";

    const art = snapResult(sc2.total);
    const box = $("resultArt");
    box.innerHTML = "";
    art.className = "result-art-cv";
    box.appendChild(art);
    lastArt = art;
    lastInfo = { score: sc2.total, grade: G, clean: Math.floor(S.clean),
                 length: Math.floor(S.extracted) };

    if (rec) { S.bestScore = sc2.total; sfx("result"); }
    S.bestLength = Math.max(S.bestLength, Math.floor(S.extracted));
    S.bestClean = Math.max(S.bestClean, Math.floor(S.clean));
    try {
      localStorage.setItem("ccojik_drain_score", String(S.bestScore));
      localStorage.setItem("ccojik_drain_length", String(S.bestLength));
      localStorage.setItem("ccojik_drain_clean", String(S.bestClean));
    } catch (_) {}
    paintBest();
    sfx("result");
    $("endOver").hidden = false;
  }

  /* 결과 그림 — 성공도에 따라 다른 PNG */
  function snapResult(score) {
    const c = document.createElement("canvas");
    c.width = 560; c.height = 560;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = true;
    try { g.imageSmoothingQuality = "high"; } catch (_) {}
    g.translate(280, 280);
    const key = score >= 85 ? "resultDrainClean"
              : score >= 50 ? "resultClogPile" : "resultDrainDirty";
    if (!draw(g, key, 0, 0, 480, { mode: "center" })) {
      g.fillStyle = "#8A8A82";
      g.beginPath(); g.ellipse(0, 0, 220, 220, 0, 0, 7); g.fill();
    }
    return c;
  }

  function paintBest() {
    const t = S.bestScore ? S.bestScore + "점 · " + S.bestLength + "cm" : "-";
    $("bestStart").textContent = t;
    $("bestEnd").textContent = t;
  }

  /* ============================================================
     결과 공유 — 다른 꼬직 게임과 같은 방식
     ============================================================ */
  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) ||
                (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const canDownload = () =>
    !isIOS && typeof document.createElement("a").download !== "undefined";

  function buildCard() {
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1350;
    const g = c.getContext("2d");
    g.fillStyle = "#ECF1F3"; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = "#1A1A16";
    g.fillRect(0, 0, 1080, 18); g.fillRect(0, 1332, 1080, 18);
    g.textAlign = "center"; g.fillStyle = "#1A1A16";
    g.font = "800 62px Pretendard, sans-serif";
    g.fillText("배수구 머리카락", 540, 150);
    g.fillText("몇 점?", 540, 228);
    if (lastArt) {
      const w = 620, h = lastArt.height / lastArt.width * w;
      g.drawImage(lastArt, 540 - w / 2, 290, w, h);
    }
    const info = lastInfo || { score: 0, grade: GRADES[4], clean: 0, length: 0 };
    g.font = "800 230px Pretendard, sans-serif";
    g.fillText(info.score + "점", 540, 1010);
    g.font = "800 54px Pretendard, sans-serif";
    g.fillText("청소율 " + info.clean + "% · " + info.length + "cm", 540, 1090);
    g.font = "800 68px Pretendard, sans-serif";
    g.fillText(info.grade.title, 540, 1185);
    g.font = "800 44px Pretendard, sans-serif";
    g.fillText("꼬직", 540, 1272);
    return c;
  }

  async function shareResult() {
    const card = buildCard();
    const blob = await new Promise(r => card.toBlob(r, "image/png"));
    if (!blob) return;
    const file = new File([blob], "ccojik-drain-hair.png", { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: "꼬직 · 배수구 머리카락 뽑기" });
        return;
      }
    } catch (_) {}
    if (canDownload()) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "ccojik-drain-hair.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return;
    }
    try { await navigator.clipboard.writeText(location.href); say("링크를 복사했어요"); }
    catch (_) {}
  }

  /* ============================================================
     타이틀 그림
     ============================================================ */
  function drawHero() {
    const c = $("heroCv");
    if (!c) return;
    const g = c.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true;
    try { g.imageSmoothingQuality = "high"; } catch (_) {}
    g.translate(c.width / 2, c.height / 2);
    const box = c.width * 0.88;
    draw(g, "sinkShadow", 0, 0, box * 1.6, { mode: "center", alpha: 0.5 });
    draw(g, "drainInnerDark", 0, 0, box * 0.92, { mode: "center" });
    draw(g, "drainInnerDirty", 0, 0, box * 0.92, { mode: "center", alpha: 0.95 });
    draw(g, "waterPool", 0, 0, box * 1.05, { mode: "center", alpha: 0.7 });
    draw(g, "drainRing", 0, 0, box, { mode: "center" });
    draw(g, "drainEdgeDirt", 0, 0, box * 1.02, { mode: "center", alpha: 0.85 });
    /* 구멍에서 머리카락이 조금 나와 있는 모습 */
    g.save();
    g.strokeStyle = "rgba(24,20,18,.9)";
    g.lineWidth = box * 0.022;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(box * 0.1, box * 0.18, box * 0.03, box * 0.34);
    g.stroke();
    g.restore();
    draw(g, "hairTipShort", box * 0.03, box * 0.36, box * 0.3, { mode: "center" });
    draw(g, "drainHighlight", 0, 0, box, { mode: "center", alpha: 0.35 });
  }

  /* ============================================================
     버튼 / 부팅
     ============================================================ */
  $("startBtn").addEventListener("click", () => { if (assetsReady) start(false); });
  $("againBtn").addEventListener("click", () => start(true));
  $("shareBtn").addEventListener("click", shareResult);

  paintBest();
  paintHud();
  fitCanvas();

  const btn = $("startBtn");
  btn.disabled = true;
  btn.textContent = "불러오는 중";
  loadAssets(
    p => { $("loadFill").style.width = Math.round(p * 100) + "%"; },
    () => {
      btn.disabled = false;
      btn.textContent = "뽑기 시작";
      $("loadOver").hidden = true;
      buildHair();
      drawHero();
    }
  );

  /* 검사용으로만 들여다본다 */
  window.__drain = () => ({
    S, GAME_CONFIG, PRESETS, MEGA, MEGA_CHANCE, GRADES, ST, BOX, IMGS, SFX, DIR,
    ASSET_VERSION, DEBUG_GAME, REF_H, DRAIN_R, DRAIN_Y,
    start, timeOver, showResult, doBreak, doClear, release, buildHair, newTip,
    resistanceNow, segmentName, curvePoint, stepChain, stepTension, scoreOf,
    gradeFor, grabRadius, tipRest, addFx, snapResult, buildCard, shareResult,
    drawHero, paintBest, toLogical, visH, has, loadAssets,
    assetsReady: () => assetsReady,
  });
})();
