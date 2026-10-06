/* ===== 꼬직 · 흰자 안 뜯고 깔 수 있어요? =====
 * 삶은 계란 하나를 20초 안에 끝까지 깐다. 뒤집기는 없다 — 한 화면, 계란 하나.
 *
 * 계란은 사진 네 장을 포개 만든다. 아래부터
 *   1) egg-ruined   너덜너덜한 흰자  — 같은 자리를 또 뜯었을 때 드러난다
 *   2) egg-damaged  뜯긴 흰자        — 한 번 뜯었을 때 드러난다
 *   3) egg-peeled   매끈한 흰자      — 잘 깠을 때 보이는 층
 *   4) egg-shell    껍질             — 시작 상태
 * 위 두 층(껍질/매끈한 흰자)만 지워진다. 아래 두 장은 드러나기만 한다.
 *
 * 규칙은 셋이고, 판정도 딱 그 셋이다.
 *   (1) 껍질을 천천히 문질러 금을 낸다      SHELL   -> CRACKED
 *   (2) 금 간 곳을 다시 문질러 벗긴다       CRACKED -> LIFTED -> PEELED
 *   (3) 흰자(PEELED)는 다시 문지르면 뜯긴다
 * 단계는 '실제로 끈 거리'로만 올라간다. 탭·짧은 터치로는 아무 일도 없다.
 * 흰자가 뜯기는 길은 '마찰'뿐이다 — 확률로 갑자기 뜯기는 일은 없다.
 *   흰자를 계속 비빔 / 아주 빠르게 거듭 긁음 / 한 자리를 꾹 누름
 * 마찰은 시간이 지나면 빠지므로, 짧은 시간 안에 몰아서 비벼야 뜯긴다.
 * 뜯기기 전에 한 번 경고가 뜬다.
 *
 * 반응하는 것은 '포인터가 그 순간 실제로 올라가 있는 조각 하나' 뿐이다.
 * 옆 조각으로 번지거나, 한 점을 눌러 주변까지 같이 들리는 일은 없다.
 * 큰 조각은 주변을 같이 까서 만드는 것이 아니라, 씨앗점을 성기게 두어
 * 처음부터 크게 잘려 있다. 큰 조각은 그만큼 더 긁어야 떨어진다.
 *
 * 숫자는 '껍질 사진의 불투명한 픽셀'을 기준으로 센다. 조각마다 그 안의 픽셀
 * 수를 미리 세어 두므로, 가장자리 한 조각이 남아도 100% 가 뜨지 않는다. */
(() => {
  "use strict";

  /* ============================================================
     튜닝 — 숫자는 전부 여기서만 만진다
     ============================================================ */
  const TUNE = {
    time: 20,              // 제한시간(초)
    hotAt: 5,              // 남은 시간이 이 아래면 빨갛게 커지고 두근거린다

    /* 껍질 조각 한 장이자 채점 한 칸. 손끝으로 긁어 떼는 크기여야 하므로
       성기게 잡는다. 너무 잘게 쪼개면 영영 못 깐다 — 포인터가 모든 조각을
       직접 지나가야 하기 때문이다. */
    cols: 7, rows: 11,
    jitter: 0.38,          // 조각 씨앗점을 칸 안에서 흔드는 정도 (칸 크기 대비)
    bigSeeds: 6,           // 큰 조각 수 — 가운데만 남기고 상하좌우 씨앗을 걷어 내면
                           //  그 자리를 가운데 조각이 먹어 세 칸쯤 되는 조각이 된다
                           //  (주변을 같이 까서 크게 보이게 하는 방식이 아니다)
    hitPx: 12,             // 포인터가 조각 테두리에서 이만큼 안이면 그 조각으로 본다
    shellScan: 10,         // 껍질 사진을 칸 하나당 몇 x 몇 으로 훑어 넓이를 잴지

    bigPiece: 1.7,         // 보통 조각의 이 배수부터 '큰 조각' 으로 본다 (연출·소리)
    tearBlob:  0.66,       // 뜯긴 자국 반지름 (칸 크기 배수)

    /* ---- 떨어지는 껍질 조각 ---- 속도·거리는 게임판 높이 대비다 */
    chipWait:  0.08,       // 금이 간 뒤 떨어지기까지(초)
    chipToss:  0.26,       // 떨어져 나갈 때 튕기는 속도
    chipDrop:  2.1,        // 중력
    chipSpin:  7,          // 도는 속도 (라디안/초)
    maxChips:  70,         // 동시에 날아다니는 조각 수 상한 (성능)
    maxPile:   26,         // 바닥에 쌓아 두는 조각 수 상한 (성능)

    /* ---- 계란이 손끝에 반응하는 정도 ---- 조작에 방해되지 않게 아주 조금만 */
    tiltMax:  0.07,        // 좌우로 기우는 최대 각도(라디안, 약 4도)
    shiftMax: 0.012,       // 위아래로 밀리는 최대 거리 (계란 높이 대비)
    tiltEase: 9,           // 손을 떼면 돌아오는 속도

    lastAt: 0.90,          // 이만큼 깠으면 남은 껍질을 반짝여 알려 준다

    /* ---- 채점 — 100점 만점 ---- */
    wShell: 0.45,          // 껍질 제거율 몫
    wWhite: 0.45,          // 흰자 보존율 몫
    wTime:  10,            // 남은 시간 보너스 (최대 점수)
    doneAt: 1.0,           // 껍질을 이만큼 벗기면 즉시 끝난다

    /* 사진이 화면에서 차지하는 크기 */
    eggFill: 0.90,
    eggOffY: -0.01,
  };

  /* ============================================================
     판정값 — 조작 규칙과 직결되는 숫자는 전부 여기 모여 있다.
     손으로 해 보고 이 객체만 고치면 느낌이 바뀐다.

     거리(px)와 속도(px/ms)는 '계란 가로 폭이 354px 일 때' 로 잰 값이다.
     화면이 작으면 계란도 작아지므로 안에서 계란 폭에 비례해 환산한다 —
     작은 폰에서도 같은 손놀림이 같은 결과가 되게.
     ============================================================ */
  const REF_EGG_W = 354;

  const PEEL_CONFIG = {
    /* ---- 드래그 속도 (px/ms) ----
       느리면 더디고, 알맞으면 가장 잘 까지고, 빠르면 효율이 떨어진다.
       '무조건 느릴수록 좋은' 게임이 되지 않게 양쪽을 다 깎는다. */
    safeSpeedMin: 0.20,    // 여기부터
    safeSpeedMax: 0.80,    //   여기까지가 가장 잘 까지는 속도
    dangerSpeed:  1.30,    // 이 위는 위험 — 마찰이 확 쌓인다
    slowRate:     0.45,    // 너무 느릴 때의 진행 효율
    fastRate:     0.25,    // 위험 속도일 때의 진행 효율. 속도로 벌충이 안 되게
                           //  충분히 낮춰야 "빠를수록 이득" 이 되지 않는다

    /* ---- 상태를 바꾸는 데 필요한 '끈 거리' (px) ----
       탭이나 짧은 터치로는 절대 넘어가지 않는다. 조각이 크면 비례해 늘어난다. */
    crackDistance: 18,     // 금이 갈 때까지
    liftDistance:  25,     // 거기서 들릴 때까지
    peelDistance:  30,     // 거기서 떨어질 때까지

    /* ---- 마찰 — 흰자가 뜯기는 유일한 길 (확률 아님) ---- */
    whiteDamageThreshold: 100,   // 마찰이 이만큼 쌓이면 뜯긴다
    whiteRubRate:  0.30,         // 흰자(PEELED)를 1px 비빌 때 쌓이는 마찰
    shellRubRate:  0.06,         // 껍질이 남아 있을 때 (덜 민감하게)
    dangerRubRate: 0.55,         // 위험 속도에서 1px 마다 더 얹히는 마찰
    holdRubRate:   160,          // 한 자리에 대고 있을 때 1초당 마찰
    frictionFade:  55,           // 1초에 빠지는 마찰 (짧은 시간 안에 몰아야 뜯긴다)
    warnAt:        0.45,         // 마찰이 이 비율을 넘으면 경고를 띄운다
    repeatRubThreshold: 3,       // 같은 자리를 이만큼 다시 문지르면 '반복'으로 본다
    repeatRubBoost: 1.5,         // 그때 마찰이 몇 배로 쌓이나
    rubGap:        1.5,          // 이 시간(초) 안에 다시 오면 '반복' 으로 센다
    warningCooldown: 1.2,        // 경고 문구가 다시 뜨기까지 (초)
    deepTear:      2,            // 뜯긴 자리를 이만큼 더 뜯으면 너덜너덜해진다
  };

  /* 판정을 눈으로 확인할 때만 켠다. 배포는 false. */
  const DEBUG_PEEL = false;

  /* 네 장은 찍은 계란이 달라 사진 속 계란 크기가 제각각이다. 껍질 사진을 기준으로
     나머지를 줄이고 옮겨 겹치게 맞춘 값 — 알파를 실측해서 낸 숫자다. */
  const FIT = {
    peeled:  { scale: 0.885, dx:  0.001, dy: -0.009 },
    damaged: { scale: 0.865, dx: -0.006, dy: -0.016 },
    ruined:  { scale: 0.796, dx: -0.004, dy: -0.012 },
  };

  /* 등급 — 점수로 갈린다. 멘트는 data.js 에서 key 로 찾는다. */
  const GRADES = [
    { min: 95, key: "master", label: "계란 까기 장인" },
    { min: 85, key: "clean",  label: "제법 깔끔함" },
    { min: 70, key: "okay",   label: "먹는 데 문제없음" },
    { min: 50, key: "hurt",   label: "흰자가 좀 아픔" },
    { min:  0, key: "abuse",  label: "계란 학대범" },
  ];

  /* 한줄평 — 문장은 data.js 에 있다. */
  function remarkFor(key) {
    const pool = (window.PEEL_EGG_REMARKS || {})[key];
    return pool && pool.length ? pool[Math.floor(Math.random() * pool.length)] : "";
  }

  /* 효과음 — 파일이 들어오면 여기 경로만 채우면 된다. 없으면 조용히 넘어간다. */
  const SFX = {
    crack_small: null, crack_big: null,
    peel_small: null, peel_big: null,
    white_damage: null, shell_drop: null, finish: null,
  };
  const sfxCache = {};
  function sfx(name) {
    const src = SFX[name];
    if (!src) return;                    // 아직 파일이 없다
    try {
      let a = sfxCache[name];
      if (!a) { a = sfxCache[name] = new Audio(src); a.preload = "auto"; }
      a.currentTime = 0; a.play().catch(() => {});
    } catch (_) {}
  }
  /* 모바일 진동 — 지원 안 하는 브라우저에서는 조용히 무시된다 */
  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {}
  }

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* 조각 상태 — 넷 중 하나다. 겹치지 않는다.
       SHELL   아직 멀쩡한 껍질
       CRACKED 금이 간 상태
       LIFTED  가장자리가 들린 상태
       PEELED  껍질이 없어져 흰자가 드러난 상태 */
  const SHELL = 0, CRACKED = 1, LIFTED = 2, PEELED = 3;
  /* 흰자 상태 */
  const WHOLE = 0, TORN = 1, DEEP = 2;

  /* ============================================================
     사진
     ============================================================ */
  const IMG = {
    shell:   { src: "egg-shell.png",   el: null, ok: false },
    peeled:  { src: "egg-peeled.png",  el: null, ok: false },
    damaged: { src: "egg-damaged.png", el: null, ok: false },
    ruined:  { src: "egg-ruined.png",  el: null, ok: false },
  };
  let imgAspect = 900 / 1600;           // 사진이 오면 실제 값으로 바뀐다

  /* ============================================================
     상태 — 계란은 하나다
     ============================================================ */
  const S = {
    mode: "start",
    left: TUNE.time,
    shards: null,        // 조각 모양 (0~1 비율 좌표라 화면이 바뀌어도 그대로)
    inside: null,        // 그 조각이 껍질을 품고 있나
    w: null,             // 조각마다 껍질이 몇 픽셀인지
    stage: null,         // 껍질: SHELL / CRACKED / LIFTED / PEELED
    dist: null,          // 조각마다 '실제로 끈 거리' (기준 계란 크기의 px)
    hurt: null,          // 흰자: WHOLE / TORN / DEEP
    again: null,         // 뜯긴 자리를 몇 번 더 뜯었나
    friction: null,      // 조각마다 쌓인 마찰 (흰자가 뜯기는 유일한 길)
    frictionAt: null,    // 그 마찰을 마지막으로 건드린 시각
    rubCount: null,      // 짧은 시간 안에 같은 조각을 몇 번 다시 문질렀나
    rubAt: null,         // 그 조각을 마지막으로 문지른 시각
    lastIdx: -1,         // 직전에 문지르던 조각 (다시 들어온 것을 세기 위해)
    guide: 0,            // 안내 단계: 0 금 내기 / 1 벗기기 / 2 흰자 피하기
    warnAt: 0,           // 마지막 경고 시각 (쿨다운)
    warnCount: 0,        // 경고를 몇 번 했나 (문구가 세진다)
    warnIdx: -1,         // 붉은 테두리를 두를 조각
    warnLife: 0,
    dbg: { speed: 0, idx: -1 },
    wUnit: 1,            // '보통 조각' 한 장의 픽셀 수 (기준선 환산용)
    total: 0,            // 껍질 전체 픽셀
    peeled: 0,           // 벗긴 픽셀
    torn: 0,             // 흰자가 뜯긴 픽셀
    lifts: [],           // 들려 있는 조각 (아직 안 떨어졌다)
    chips: [],           // 떨어지는 / 바닥에 쌓인 조각
    cracks: [],          // 막 깨진 자리에 짧게 보이는 금
    tilt: 0, tiltTo: 0,  // 손끝에 따라 살짝 기운다
    shift: 0, shiftTo: 0,
    moved: false,
    drag: null,
    msg: "", msgLeft: 0, // 짧은 상태 메시지
    best: 0,
  };
  try { S.best = +(localStorage.getItem("ccojik_peelegg_best") || 0) || 0; } catch (_) {}

  const cv = $("cv"), ctx = cv.getContext("2d");
  /* 네 층. 위 두 장만 지워진다. */
  const ruinCv = document.createElement("canvas");    // 너덜너덜한 흰자 (안 지움)
  const baseCv = document.createElement("canvas");    // 뜯긴 흰자
  const whiteCv = document.createElement("canvas");   // 매끈한 흰자
  const shellCv = document.createElement("canvas");   // 껍질
  let W = 0, H = 0, dpr = 1;

  function fitCanvas() {
    const r = cv.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return false;
    const changed = Math.round(r.width) !== W || Math.round(r.height) !== H;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(r.width); H = Math.round(r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return changed;
  }
  addEventListener("resize", onResize);
  addEventListener("orientationchange", onResize);
  /* 주소창이 접히거나 화면이 돌아가도 캔버스 크기를 바로 따라잡는다.
     window 의 resize 가 안 오는 브라우저가 있어 캔버스를 직접 지켜본다. */
  try { new ResizeObserver(onResize).observe(cv); } catch (_) {}
  function onResize() {
    /* 화면이 바뀌어도 지금까지 벗기고 뜯은 자리는 그대로 옮겨 온다 */
    S.chips.length = 0;                 // 날던 조각은 새 좌표계와 안 맞는다
    S.cracks.length = 0;
    const keep = {
      shell: shellCv.width ? snapshot(shellCv) : null,
      white: whiteCv.width ? snapshot(whiteCv) : null,
      base:  baseCv.width ? snapshot(baseCv) : null,
    };
    if (fitCanvas() && S.shards) buildLayers(keep);
  }
  function snapshot(src) {
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    c.getContext("2d").drawImage(src, 0, 0);
    return c;
  }

  /* 계란 사진이 놓이는 자리 — 게임판 가운데, 비율 유지 */
  function eggRect() {
    const h = H * TUNE.eggFill;
    const w = h * imgAspect;
    const fit = Math.min(1, (W * 0.94) / w);     // 가로가 모자라면 줄인다
    const ww = w * fit, hh = h * fit;
    return { x: (W - ww) / 2, y: (H - hh) / 2 + hh * TUNE.eggOffY, w: ww, h: hh };
  }
  /* 층 안에서 사진이 놓이는 자리 (층 왼쪽 위가 0,0) */
  function fitRect(R, f) {
    const w = R.w * f.scale, h = R.h * f.scale;
    return {
      x: (R.w - w) / 2 + R.w * f.dx,
      y: (R.h - h) / 2 + R.h * f.dy,
      w, h,
    };
  }
  /* 조각이 실제로 놓인 자리 (씨앗점) */
  function shardPos(R, idx) {
    const st = S.shards[idx].site;
    return { x: R.x + st.u * R.w, y: R.y + st.v * R.h };
  }

  /* ============================================================
     네 층 만들기
     ============================================================ */
  function layerCtx(c, R) {
    c.width = Math.max(1, Math.round(R.w * dpr));
    c.height = Math.max(1, Math.round(R.h * dpr));
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, R.w, R.h);
    return g;
  }
  /* 계란 윤곽 — 껍질 사진이 곧 윤곽이다. 못 불러오면 타원으로 대신한다. */
  function drawEggShape(g, R) {
    if (IMG.shell.ok) g.drawImage(IMG.shell.el, 0, 0, R.w, R.h);
    else {
      g.fillStyle = "#D5C3A0";
      g.beginPath(); g.ellipse(R.w / 2, R.h / 2, R.w * .48, R.h * .48, 0, 0, 7); g.fill();
    }
  }
  /* 각 층의 가장자리를 계란 윤곽에 딱 맞춘다 — 안 그러면 아래층이 테두리로 비친다 */
  function clipToEgg(g, R) {
    g.save();
    g.globalCompositeOperation = "destination-in";
    drawEggShape(g, R);
    g.restore();
  }
  function carryOver(g, c, prev) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(prev, 0, 0, c.width, c.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  /* 사진 한 장을 그 층에 깐다 */
  function layPhoto(g, R, img, fit, fallback) {
    if (img.ok) {
      const B = fitRect(R, fit);
      g.drawImage(img.el, B.x, B.y, B.w, B.h);
    } else { g.fillStyle = fallback; g.fillRect(0, 0, R.w, R.h); }
    clipToEgg(g, R);
  }

  function buildLayers(keep) {
    const R = eggRect();
    /* 맨 아래 — 너덜너덜한 흰자. 안 지운다. */
    layPhoto(layerCtx(ruinCv, R), R, IMG.ruined, FIT.ruined, "#D8C2A0");
    /* 그 위 — 뜯긴 흰자. 같은 자리를 또 뜯으면 여기도 지워진다. */
    const gb = layerCtx(baseCv, R);
    if (keep && keep.base) carryOver(gb, baseCv, keep.base);
    else layPhoto(gb, R, IMG.damaged, FIT.damaged, "#E0CDAE");
    /* 중간 — 매끈한 흰자. 급하게 문지른 자리가 지워진다. */
    const gw = layerCtx(whiteCv, R);
    if (keep && keep.white) carryOver(gw, whiteCv, keep.white);
    else layPhoto(gw, R, IMG.peeled, FIT.peeled, "#FFFDF7");
    /* 맨 위 — 껍질 */
    const gs = layerCtx(shellCv, R);
    if (keep && keep.shell) carryOver(gs, shellCv, keep.shell);
    else drawEggShape(gs, R);
  }

  /* 한 층에서 동그랗게 지운다. 여러 군데를 한 번에 지울 수 있다. */
  function erase(c, R, pts, r) {
    if (!pts.length) return;
    const g = c.getContext("2d");
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "#000";
    g.beginPath();
    for (const p of pts) {
      const rr = p.r || r;                       // 조각마다 자국 크기가 다르다
      g.moveTo(p.x - R.x + rr, p.y - R.y);       // 점끼리 선으로 이어지지 않게
      g.arc(p.x - R.x, p.y - R.y, rr, 0, 7);
    }
    g.fill();
    g.restore();
  }

  /* ============================================================
     껍질 조각 — 보로노이로 제각각 생긴 다각형을 미리 잘라 둔다
     ============================================================ */
  /* 씨앗점 a 쪽만 남기고 b 쪽을 잘라낸다 (두 점의 수직이등분선 기준) */
  function clipHalf(poly, ax, ay, bx, by) {
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const nx = bx - ax, ny = by - ay;
    const side = p => (p.u - mx) * nx + (p.v - my) * ny;   // 음수면 a 쪽
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const P = poly[k], Q = poly[(k + 1) % poly.length];
      const sp = side(P), sq = side(Q);
      if (sp <= 0) out.push(P);
      if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
        const t = sp / (sp - sq);
        out.push({ u: P.u + (Q.u - P.u) * t, v: P.v + (Q.v - P.v) * t });
      }
    }
    return out;
  }

  /* 칸마다 조각 하나. 좌표는 계란 사각형을 0~1 로 본 비율이라 화면 크기를 안 탄다.
     씨앗점 일부를 솎아 두면 그 자리를 옆 조각이 먹어 두세 칸짜리 큰 조각이
     된다 — 큰 조각을 '주변을 같이 까서' 만들지 않기 위한 장치다. */
  function buildShards() {
    const C = TUNE.cols, Rw = TUNE.rows;
    const cw = 1 / C, ch = 1 / Rw;
    const site = [];
    for (let j = 0; j < Rw; j++) {
      for (let i = 0; i < C; i++) {
        site.push({
          u: (i + 0.5 + (Math.random() - 0.5) * TUNE.jitter * 2) * cw,
          v: (j + 0.5 + (Math.random() - 0.5) * TUNE.jitter * 2) * ch,
        });
      }
    }
    /* 큰 조각 만들기 — 고른 칸의 상하좌우 씨앗을 걷어 내면 그 자리를 가운데
       조각이 먹어 세 칸쯤 되는 큰 조각이 된다. 큰 조각끼리 겹치지 않게
       둘레 두 칸은 비워 두고 고른다. */
    const dead = new Uint8Array(C * Rw);
    const core = new Uint8Array(C * Rw);
    const order = [];
    /* 계란이 좁아지는 위아래 끝은 피한다 — 거기 고르면 '큰 조각'인데 껍질이
       얼마 안 들어 있어 커 보이지 않는다 */
    for (let j = 2; j < Rw - 2; j++) for (let i = 1; i < C - 1; i++) order.push(j * C + i);
    for (let k = order.length - 1; k > 0; k--) {
      const r = Math.floor(Math.random() * (k + 1));
      const t = order[k]; order[k] = order[r]; order[r] = t;
    }
    let want = TUNE.bigSeeds;
    for (const k of order) {
      if (want <= 0) break;
      const i = k % C, j = (k - i) / C;
      let clash = false;
      for (let dj = -2; dj <= 2 && !clash; dj++) {
        for (let di = -2; di <= 2; di++) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= C || nj >= Rw) continue;
          if (dead[nj * C + ni] || core[nj * C + ni]) { clash = true; break; }
        }
      }
      if (clash) continue;
      core[k] = 1;
      dead[(j - 1) * C + i] = 1; dead[(j + 1) * C + i] = 1;
      dead[j * C + i - 1] = 1;   dead[j * C + i + 1] = 1;
      want--;
    }
    for (let k = 0; k < site.length; k++) if (dead[k]) site[k] = null;

    const out = [];
    for (let j = 0; j < Rw; j++) {
      for (let i = 0; i < C; i++) {
        const idx = j * C + i, a = site[idx];
        if (!a) { out.push(null); continue; }          // 솎아 낸 자리
        /* 넉넉한 사각형에서 시작해 이웃들과의 경계로 깎아 나간다. 솎은 자리를
           먹고 커질 수 있으니 처음 사각형도 그만큼 넉넉하게 잡는다.
           가장자리 조각이 계란 밖으로 뻗지 않게 처음부터 0~1 안으로 잘라 둔다. */
        const l = Math.max(0, a.u - cw * 2.8), r = Math.min(1, a.u + cw * 2.8);
        const t = Math.max(0, a.v - ch * 2.8), b2 = Math.min(1, a.v + ch * 2.8);
        let poly = [{ u: l, v: t }, { u: r, v: t }, { u: r, v: b2 }, { u: l, v: b2 }];
        for (let dj = -3; dj <= 3 && poly.length > 2; dj++) {
          for (let di = -3; di <= 3; di++) {
            if (!di && !dj) continue;
            const ni = i + di, nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= C || nj >= Rw) continue;
            const nb = site[nj * C + ni];
            if (!nb) continue;
            poly = clipHalf(poly, a.u, a.v, nb.u, nb.v);
            if (poly.length < 3) break;
          }
        }
        let lu = 1, lv = 1, hu = 0, hv = 0;
        for (const q of poly) {
          if (q.u < lu) lu = q.u; if (q.u > hu) hu = q.u;
          if (q.v < lv) lv = q.v; if (q.v > hv) hv = q.v;
        }
        /* 금이 갔을 때 보일 갈라진 선 — 가운데서 테두리 쪽으로 두 갈래.
           판마다 모양이 달라야 하지만 한 판 안에서는 흔들리지 않아야 하므로
           여기서 미리 만들어 둔다. */
        const cr = [];
        for (let t = 0; t < 2; t++) {
          const q = poly[Math.floor(Math.random() * poly.length)];
          const mx = (a.u + q.u) / 2 + (Math.random() - 0.5) * cw * 0.5;
          const my = (a.v + q.v) / 2 + (Math.random() - 0.5) * ch * 0.5;
          cr.push([{ u: a.u, v: a.v }, { u: mx, v: my }, { u: q.u, v: q.v }]);
        }
        out.push({ site: a, poly, lu, lv, hu, hv, cr });
      }
    }
    return out;
  }

  /* 포인터가 올라가 있는 조각 하나 — 가장 가까운 씨앗점이 곧 그 보로노이 칸이다.
     주변 조각은 보지 않는다. */
  function nearestShard(R, x, y) {
    const C = TUNE.cols, Rw = TUNE.rows;
    const u = (x - R.x) / R.w, v = (y - R.y) / R.h;
    const ci = clamp(Math.floor(u * C), 0, C - 1);
    const cj = clamp(Math.floor(v * Rw), 0, Rw - 1);
    let best = -1, bd = Infinity;
    for (let dj = -3; dj <= 3; dj++) {
      const nj = cj + dj;
      if (nj < 0 || nj >= Rw) continue;
      for (let di = -3; di <= 3; di++) {
        const ni = ci + di;
        if (ni < 0 || ni >= C) continue;
        const k = nj * C + ni, sh = S.shards[k];
        if (!sh) continue;
        const d = (sh.site.u - u) * (sh.site.u - u) + (sh.site.v - v) * (sh.site.v - v);
        if (d < bd) { bd = d; best = k; }
      }
    }
    return best;
  }

  /* 그 조각 안(또는 테두리에서 hitPx 안)에 포인터가 있나.
     손가락이 좀 빗나가도 집히게 하는 여유일 뿐, 여러 조각을 켜는 장치가 아니다. */
  function onShard(R, idx, x, y) {
    const sh = S.shards[idx];
    if (!sh || sh.poly.length < 3) return false;
    const u = (x - R.x) / R.w, v = (y - R.y) / R.h;
    let inside = false;
    const n = sh.poly.length;
    for (let k = 0, m = n - 1; k < n; m = k++) {
      const A = sh.poly[k], B = sh.poly[m];
      if ((A.v > v) !== (B.v > v) &&
          u < (B.u - A.u) * (v - A.v) / (B.v - A.v) + A.u) inside = !inside;
    }
    if (inside) return true;
    /* 테두리까지의 거리 — 화면 픽셀로 잰다 */
    let near = Infinity;
    for (let k = 0; k < n; k++) {
      const A = sh.poly[k], B = sh.poly[(k + 1) % n];
      const ax = A.u * R.w, ay = A.v * R.h, bx = B.u * R.w, by = B.v * R.h;
      const px = x - R.x, py = y - R.y;
      const dx = bx - ax, dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len ? clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1) : 0;
      const qx = ax + dx * t - px, qy = ay + dy * t - py;
      const d = Math.sqrt(qx * qx + qy * qy);
      if (d < near) near = d;
    }
    return near <= TUNE.hitPx;
  }


  /* 조각마다 '껍질 사진의 불투명한 픽셀'이 몇 개나 들어 있는지 센다.
     조각은 씨앗점의 보로노이 칸이므로, 어떤 점이 어느 조각에 속하는지는
     '가장 가까운 씨앗점'으로 정해진다. 칸 사각형이 아니라 조각 모양 그대로다.
     여기서 잰 값이 곧 제거율의 분모다 — 가장자리까지 다 지워야 100% 가 된다. */
  function buildWeights() {
    const C = TUNE.cols, Rw = TUNE.rows;
    const SX = C * TUNE.shellScan, SY = Rw * TUNE.shellScan;
    let alpha = null;
    if (IMG.shell.ok) {
      try {
        const c = document.createElement("canvas");
        c.width = SX; c.height = SY;
        const g = c.getContext("2d");
        g.drawImage(IMG.shell.el, 0, 0, SX, SY);
        alpha = g.getImageData(0, 0, SX, SY).data;
      } catch (_) { alpha = null; }      // file:// 로 열면 픽셀을 못 읽는다
    }
    S.w.fill(0);
    S.inside.fill(0);
    S.total = 0;
    for (let y = 0; y < SY; y++) {
      const v = (y + 0.5) / SY;
      for (let x = 0; x < SX; x++) {
        const u = (x + 0.5) / SX;
        let on;
        if (alpha) on = alpha[(y * SX + x) * 4 + 3] > 128;
        else {
          const dx = u * 2 - 1, dy = v * 2 - 1;
          on = dx * dx + dy * dy <= 1;     // 사진을 못 읽으면 타원으로
        }
        if (!on) continue;
        /* 가장 가까운 씨앗점 찾기 — 씨앗을 솎았으니 둘레 세 칸까지 본다 */
        const ci = Math.min(C - 1, Math.floor(u * C));
        const cj = Math.min(Rw - 1, Math.floor(v * Rw));
        let best = -1, bd = Infinity;
        for (let dj = -3; dj <= 3; dj++) {
          const nj = cj + dj;
          if (nj < 0 || nj >= Rw) continue;
          for (let di = -3; di <= 3; di++) {
            const ni = ci + di;
            if (ni < 0 || ni >= C) continue;
            const k = nj * C + ni, sh = S.shards[k];
            if (!sh) continue;
            const d = (sh.site.u - u) * (sh.site.u - u) + (sh.site.v - v) * (sh.site.v - v);
            if (d < bd) { bd = d; best = k; }
          }
        }
        if (best >= 0) { S.w[best]++; S.total++; }
      }
    }
    let nIn = 0;
    for (let k = 0; k < S.w.length; k++) if (S.w[k] > 0) { S.inside[k] = 1; nIn++; }
    if (!S.total) S.total = 1;           // 0 으로 나누는 것만 막는다
    /* '보통 조각' 한 장 = 껍질 전체를 조각 수로 나눈 값. 기준선을 이걸로 환산해
       큰 조각은 더 긁어야, 작은 조각은 덜 긁어도 떨어지게 한다. */
    S.wUnit = Math.max(1, S.total / Math.max(1, nIn));
  }

  /* 조각의 다각형을 캔버스에 그릴 길로 깐다 (ox,oy 만큼 옮겨서) */
  function shardPath(g, sh, R, ox, oy) {
    g.beginPath();
    for (let k = 0; k < sh.poly.length; k++) {
      const q = sh.poly[k];
      const x = q.u * R.w + ox, y = q.v * R.h + oy;
      if (k) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  }

  /* 판을 새로 차린다 */
  function buildCells() {
    const n = TUNE.cols * TUNE.rows;
    S.shards = buildShards();            // 판마다 새로 깨진다
    S.inside = new Uint8Array(n);
    S.w = new Float32Array(n);
    S.stage = new Uint8Array(n);
    S.dist = new Float32Array(n);
    S.hurt = new Uint8Array(n);
    S.again = new Uint8Array(n);
    S.friction = new Float32Array(n);
    S.frictionAt = new Float32Array(n);
    S.rubCount = new Uint16Array(n);
    S.rubAt = new Float32Array(n);
    S.lastIdx = -1;
    S.peeled = 0; S.torn = 0;
    buildWeights();
    buildLayers(null);
  }

  /* ============================================================
     껍질이 금 가고, 들리고, 떨어진다
     ============================================================ */
  /* 조각을 껍질 층에서 지운다. fill 만 하면 가장자리 반투명이 실금으로
     남으므로 같은 길을 한 번 더 긋는다. */
  function cutShell(R, sh) {
    const g = shellCv.getContext("2d");
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "#000"; g.strokeStyle = "#000";
    g.lineWidth = 1.2; g.lineJoin = "round";
    shardPath(g, sh, R, 0, 0);
    g.fill(); g.stroke();
    g.restore();
  }

  /* 조각 하나가 사진에서 어느 자리를 떼어 오는지 — 들림·낙하가 같이 쓴다 */
  function shardSprite(R, sh) {
    const kx = IMG.shell.ok ? IMG.shell.el.naturalWidth / R.w : 1;
    const ky = IMG.shell.ok ? IMG.shell.el.naturalHeight / R.h : 1;
    const cx = sh.site.u * R.w, cy = sh.site.v * R.h;
    const bx = sh.lu * R.w, by = sh.lv * R.h;
    const bw = (sh.hu - sh.lu) * R.w, bh = (sh.hv - sh.lv) * R.h;
    return {
      sh, cx, cy,
      sx: bx * kx, sy: by * ky, sw: bw * kx, sh2: bh * ky,
      dx: bx - cx, dy: by - cy, dw: bw, dh: bh,
      w: bw, h: bh,
    };
  }

  /* 금이 간다 — 조각 모양대로 갈라진 선이 잠깐 보인다 */
  function markCrack(R, idx) {
    S.cracks.push({ sh: S.shards[idx], ox: R.x, oy: R.y, life: 0.22 });
    sfx(S.w[idx] >= S.wUnit * TUNE.bigPiece ? "crack_big" : "crack_small");
  }

  /* 가장자리가 들린다 — 껍질 층에서는 빼고, 살짝 어긋난 조각으로 얹어 둔다 */
  function liftShard(R, idx) {
    const sh = S.shards[idx];
    if (!sh || sh.poly.length < 3) return;   // 솎아 낸 자리에는 조각이 없다
    cutShell(R, sh);
    const sp = shardSprite(R, sh);
    const ang = Math.random() * 6.28;
    S.lifts.push(Object.assign(sp, {
      idx,
      x: R.x + sp.cx, y: R.y + sp.cy,
      /* 어느 쪽으로 들렸는지 — 그림자도 그 반대편에 생긴다 */
      ox: Math.cos(ang) * Math.max(1.5, R.w * 0.012),
      oy: Math.sin(ang) * Math.max(1.5, R.w * 0.012) - Math.max(1, R.w * 0.006),
      rot: (Math.random() - 0.5) * 0.1,
    }));
  }

  /* 떨어져 나간다 — 들려 있던 조각을 중력에 넘긴다 */
  function dropShard(R, idx, power) {
    const li = S.lifts.findIndex(l => l.idx === idx);
    let sp;
    if (li >= 0) { sp = S.lifts[li]; S.lifts.splice(li, 1); }
    else {
      const sh = S.shards[idx];
      if (!sh || sh.poly.length < 3) return;
      cutShell(R, sh);                   // 들림을 건너뛴 경우 (급하게 문질렀을 때)
      sp = shardSprite(R, sh);
      sp.x = R.x + sp.cx; sp.y = R.y + sp.cy;
    }
    if (S.chips.length >= TUNE.maxChips + TUNE.maxPile) return;
    const toss = TUNE.chipToss * H * power;
    S.chips.push(Object.assign(sp, {
      x: sp.x, y: sp.y,
      vx: (Math.random() - 0.5) * toss,
      vy: -Math.random() * toss * 0.45,             // 살짝 튕겨 올랐다가 떨어진다
      rot: sp.rot || 0, vr: (Math.random() - 0.5) * TUNE.chipSpin,
      wait: TUNE.chipWait,
      scale: 1 + (power - 1) * 0.12,                // 큰 조각은 조금 더 크게 보인다
      settled: false,
    }));
  }

  function stepChips(dt) {
    const grav = TUNE.chipDrop * H;
    const floor = H - Math.max(6, H * 0.012);
    let flying = 0, piled = 0;
    for (let k = S.chips.length - 1; k >= 0; k--) {
      const c = S.chips[k];
      if (c.settled) { piled++; continue; }
      if (c.wait > 0) { c.wait -= dt; continue; }
      c.vy += grav * dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.rot += c.vr * dt;
      flying++;
      /* 바닥에 닿으면 거기 눕는다 — 깐 껍질이 쌓여 보이게 */
      if (c.y >= floor) {
        c.y = floor - Math.random() * H * 0.01;
        c.settled = true;
        c.rot = (Math.random() - 0.5) * 1.2;
        sfx("shell_drop");
      } else if (c.y - c.h > H) S.chips.splice(k, 1);
    }
    /* 너무 많이 쌓이면 오래된 것부터 치운다 (성능) */
    if (piled > TUNE.maxPile) {
      for (let k = 0; k < S.chips.length && piled > TUNE.maxPile; k++) {
        if (S.chips[k].settled) { S.chips.splice(k, 1); k--; piled--; }
      }
    }
    for (let k = S.cracks.length - 1; k >= 0; k--) {
      if ((S.cracks[k].life -= dt) <= 0) S.cracks.splice(k, 1);
    }
    void flying;
  }

  /* 한 조각에 마찰을 더하고 지금 얼마나 쌓였는지 돌려준다.
     빠진 만큼은 건드릴 때 한꺼번에 계산한다 — 매 프레임 전체를 훑지 않아도 된다.
     마찰이 시간과 함께 빠지기 때문에 '짧은 시간 안에 몰아서 비벼야' 뜯긴다. */
  function addFriction(idx, gain, now) {
    const gone = (now - S.frictionAt[idx]) / 1000 * PEEL_CONFIG.frictionFade;
    const v = Math.max(0, S.friction[idx] - gone) + gain;
    S.friction[idx] = v;
    S.frictionAt[idx] = now;
    return v;
  }

  /* 조각 크기 — 보통 조각의 몇 배인가. 거리 기준이므로 넓이의 제곱근으로 잰다. */
  function sizeOf(idx) {
    return clamp(Math.sqrt(S.w[idx] / S.wUnit), 0.5, 2.5);
  }

  /* 드래그 속도에 따른 진행 효율 (1 이 최고) */
  function speedRate(sp) {
    const C = PEEL_CONFIG;
    if (sp < C.safeSpeedMin) return C.slowRate + (1 - C.slowRate) * (sp / C.safeSpeedMin);
    if (sp <= C.safeSpeedMax) return 1;
    const t = clamp((sp - C.safeSpeedMax) / (C.dangerSpeed - C.safeSpeedMax), 0, 1);
    return 1 - (1 - C.fastRate) * t;
  }

  /* ============================================================
     그리기
     ============================================================ */
  function render() {
    if (!W || !H) return;
    const g = ctx, R = eggRect();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#F6F3E9"; g.fillRect(0, 0, W, H);

    /* 그림자 */
    g.fillStyle = "rgba(0,0,0,.08)";
    g.beginPath();
    g.ellipse(R.x + R.w / 2, R.y + R.h * .97, R.w * .34, R.h * .03, 0, 0, 7);
    g.fill();

    /* 계란 — 손끝 방향으로 아주 살짝 기울고 밀린다 */
    const ecx = R.x + R.w / 2, ecy = R.y + R.h / 2;
    g.save();
    g.translate(ecx, ecy + S.shift * R.h);
    g.rotate(S.tilt);
    g.translate(-ecx, -ecy);

    if (ruinCv.width) g.drawImage(ruinCv, R.x, R.y, R.w, R.h);     // 너덜너덜
    if (baseCv.width) g.drawImage(baseCv, R.x, R.y, R.w, R.h);     // 뜯긴 흰자
    if (whiteCv.width) g.drawImage(whiteCv, R.x, R.y, R.w, R.h);   // 매끈한 흰자
    if (shellCv.width) g.drawImage(shellCv, R.x, R.y, R.w, R.h);   // 껍질

    drawLifted(g, R);
    drawCracks(g, R);
    drawWarn(g, R);
    drawLastHint(g, R);
    g.restore();

    drawChips(g, R);
    drawMsg(g);
    if (DEBUG_PEEL) drawDebug(g);
  }

  /* 들려 있는 조각 — 살짝 어긋나게 얹고 그 아래에 그늘을 깐다 */
  function drawLifted(g, R) {
    for (const l of S.lifts) {
      g.save();
      g.translate(l.x + l.ox, l.y + l.oy);
      g.rotate(l.rot);
      /* 그늘 먼저 — 들린 쪽 반대편에 깔려 떠 보이게 한다 */
      g.save();
      g.translate(-l.ox * 0.9, -l.oy * 0.9 + Math.max(1, R.w * 0.004));
      shardPath(g, l.sh, R, -l.cx, -l.cy);
      g.fillStyle = "rgba(60,45,20,.30)";
      g.fill();
      g.restore();
      shardPath(g, l.sh, R, -l.cx, -l.cy);
      g.clip();
      if (IMG.shell.ok) g.drawImage(IMG.shell.el, l.sx, l.sy, l.sw, l.sh2, l.dx, l.dy, l.dw, l.dh);
      else { g.fillStyle = "#D5C3A0"; g.fillRect(l.dx, l.dy, l.dw, l.dh); }
      g.restore();
    }
  }

  /* 금 간 조각 — 갈라진 선이 또렷하게 보인다. '들린' 조각(그늘이 깔리고 살짝
     어긋난다)과 한눈에 구분되게 선만으로 표현한다. */
  function drawCracks(g, R) {
    g.lineJoin = "round";
    g.lineCap = "round";
    /* 막 갈라진 순간 — 조각 테두리가 한 번 번쩍 */
    if (S.cracks.length) {
      g.strokeStyle = "#5A4A30";
      g.lineWidth = Math.max(1.5, R.w * 0.009);
      for (const c of S.cracks) {
        g.globalAlpha = Math.max(0, c.life / 0.22) * 0.9;
        shardPath(g, c.sh, R, c.ox, c.oy);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    /* 금만 간 조각은 갈라진 선을 계속 두고 있다 — 다시 문지를 자리다 */
    for (let k = 0; k < S.stage.length; k++) {
      if (S.stage[k] !== CRACKED) continue;
      const sh = S.shards[k];
      if (!sh) continue;
      g.globalAlpha = 0.30;
      g.strokeStyle = "#8A7450";
      g.lineWidth = Math.max(1, R.w * 0.005);
      shardPath(g, sh, R, R.x, R.y);
      g.stroke();
      g.globalAlpha = 0.75;
      g.strokeStyle = "#5A4A30";
      g.lineWidth = Math.max(1.4, R.w * 0.008);
      for (const line of sh.cr || []) {
        g.beginPath();
        line.forEach((q, i) => {
          const x = R.x + q.u * R.w, y = R.y + q.v * R.h;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        });
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  /* 위험한 자리에 붉은 테두리를 짧게 — 왜 경고가 떴는지 바로 보이게 */
  function drawWarn(g, R) {
    if (S.warnIdx < 0 || S.warnLife <= 0) return;
    const sh = S.shards[S.warnIdx];
    if (!sh) return;
    g.save();
    g.globalAlpha = Math.min(1, S.warnLife / 0.45) * 0.9;
    g.strokeStyle = "#DA2B2B";
    g.lineWidth = Math.max(2, R.w * 0.011);
    g.lineJoin = "round";
    shardPath(g, sh, R, R.x, R.y);
    g.stroke();
    g.restore();
  }

  /* 거의 다 깠을 때 남은 껍질을 반짝여 알려 준다 — 마지막 조각 찾는 재미 */
  function drawLastHint(g, R) {
    if (S.mode !== "play" || S.peeled / S.total < TUNE.lastAt) return;
    const pulse = 0.35 + 0.35 * Math.sin(performance.now() / 260);
    g.save();
    g.globalAlpha = pulse;
    g.strokeStyle = "#FFCE1F";
    g.lineWidth = Math.max(2, R.w * 0.012);
    g.lineJoin = "round";
    for (let k = 0; k < S.stage.length; k++) {
      if (!S.inside[k] || S.stage[k] === PEELED) continue;
      shardPath(g, S.shards[k], R, R.x, R.y);
      g.stroke();
    }
    g.restore();
  }

  /* 떨어지는 / 바닥에 쌓인 조각 — 이미 떨어져 나왔으므로 화면 좌표로 그린다 */
  function drawChips(g, R) {
    for (const c of S.chips) {
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.rot);
      if (c.scale && c.scale !== 1) g.scale(c.scale, c.scale);
      shardPath(g, c.sh, R, -c.cx, -c.cy);
      g.clip();
      if (IMG.shell.ok) g.drawImage(IMG.shell.el, c.sx, c.sy, c.sw, c.sh2, c.dx, c.dy, c.dw, c.dh);
      else { g.fillStyle = "#D5C3A0"; g.fillRect(c.dx, c.dy, c.dw, c.dh); }
      g.restore();
    }
  }

  /* 안내 한 줄 — 게임판 아래쪽. 지금 뭘 해야 하는지가 늘 떠 있고, 경고가
     있으면 그동안만 경고로 바뀐다. */
  function drawMsg(g) {
    const hot = S.msg && S.msgLeft > 0;
    const text = hot ? S.msg : (S.mode === "play" ? GUIDE[S.guide] : "");
    if (!text) return;
    g.save();
    g.globalAlpha = hot ? Math.min(1, S.msgLeft * 3) : 0.85;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const size = Math.max(13, Math.min(W * 0.045, H * 0.028));
    g.font = "700 " + size + "px Pretendard, sans-serif";
    const y = H - size * 1.6;
    g.lineWidth = Math.max(3, size * 0.3);
    g.strokeStyle = "rgba(255,255,255,.95)";
    g.strokeText(text, W / 2, y);
    g.fillStyle = hot && S.msgBad ? "#DA2B2B" : "#1A1A16";
    g.fillText(text, W / 2, y);
    g.restore();
  }

  /* 판정을 눈으로 확인할 때만 (DEBUG_PEEL) */
  function drawDebug(g) {
    const i = S.dbg.idx;
    const rows = [
      "speed: " + S.dbg.speed.toFixed(3) + " px/ms",
      "fragment: " + i,
      "state: " + (i >= 0 ? ["SHELL", "CRACKED", "LIFTED", "PEELED"][S.stage[i]] : "-"),
      "dist: " + (i >= 0 ? S.dist[i].toFixed(1) + "px / " +
        ((PEEL_CONFIG.crackDistance + PEEL_CONFIG.liftDistance + PEEL_CONFIG.peelDistance)
          * sizeOf(i)).toFixed(1) : "-"),
      "rubCount: " + (i >= 0 ? S.rubCount[i] : "-"),
      "friction: " + (i >= 0 ? S.friction[i].toFixed(0) : "-") +
        " / " + PEEL_CONFIG.whiteDamageThreshold,
      "whiteDamage: " + (S.torn / S.total * 100).toFixed(1) + "%",
    ];
    g.save();
    g.font = "600 11px monospace";
    g.textAlign = "left";
    g.textBaseline = "top";
    g.fillStyle = "rgba(255,255,255,.88)";
    g.fillRect(4, 4, 168, rows.length * 14 + 8);
    g.fillStyle = "#1A1A16";
    rows.forEach((t, n) => g.fillText(t, 10, 9 + n * 14));
    g.restore();
  }
  function say(text, bad) { S.msg = text; S.msgBad = !!bad; S.msgLeft = 1.1; }

  /* 지금 뭘 해야 하는지 — 시간이 아니라 실제 진행에 따라 바뀐다 */
  const GUIDE = [
    "천천히 문질러 금을 내세요",
    "금 간 곳을 다시 문질러 벗기세요",
    "흰자는 피해서 남은 껍질만!",
  ];
  function setGuide(n) {
    if (n <= S.guide) return;
    S.guide = n;
    S.msg = ""; S.msgLeft = 0;           // 새 안내가 바로 보이게
  }

  /* 뜯기기 전에 한 번 알려 준다. 너무 자주 뜨지 않게 쿨다운을 둔다. */
  function warn(idx, bare, danger) {
    const now = performance.now();
    if (now - S.warnAt < PEEL_CONFIG.warningCooldown * 1000) return;
    S.warnAt = now;
    S.warnIdx = idx; S.warnLife = 0.45;
    S.warnCount++;
    if (bare) say(S.warnCount > 1 ? "흰자 뜯겨요!" : "흰자!", true);
    else say(danger > 0.5 ? "조금만 천천히!" : "살살!", true);
    buzz(8);
  }

  /* ============================================================
     문지르기
     ============================================================ */
  /* 흰자를 뜯는다. 이미 뜯긴 자리를 또 괴롭히면 너덜너덜해진다. */
  function tearShard(R, idx, tears) {
    if (idx < 0 || idx >= S.hurt.length || !S.inside[idx]) return;
    const part = Math.min(1, Math.sqrt(S.w[idx] / S.wUnit));
    const at = shardPos(R, idx);
    at.r = Math.max(R.w / TUNE.cols, R.h / TUNE.rows) * TUNE.tearBlob * part;

    if (S.hurt[idx] === WHOLE) {
      if (S.stage[idx] !== PEELED) {
        /* 껍질이 아직 붙어 있었다면 그것부터 같이 떨어져 나간다 */
        dropShard(R, idx, 1); S.stage[idx] = PEELED; S.peeled += S.w[idx];
      }
      S.hurt[idx] = TORN;
      S.torn += S.w[idx];
      tears.push(at);
      return;
    }
    /* 이미 뜯긴 자리 — 몇 번 더 뜯으면 그 아래 너덜너덜한 층까지 드러난다 */
    if (S.hurt[idx] === TORN && ++S.again[idx] >= PEEL_CONFIG.deepTear) {
      S.hurt[idx] = DEEP;
      erase(baseCv, R, [at], at.r);
      tears.push(at);
    }
  }

  /* 다 긁은 조각 하나가 떨어져 나간다. 옆 조각은 건드리지 않는다 —
     크게 벗겨지는 손맛은 '그 조각 자체가 크다' 에서 나온다. */
  function takeOff(R, idx) {
    if (!S.inside[idx] || S.stage[idx] === PEELED) return 0;
    const big = S.w[idx] >= S.wUnit * TUNE.bigPiece;
    dropShard(R, idx, big ? 1.6 : 1);
    S.stage[idx] = PEELED;
    S.peeled += S.w[idx];
    /* 큰 조각이 `쫘악` 벗겨질 때가 가장 손맛이 좋다 — 피드백도 그만큼 세게 */
    if (big) { sfx("peel_big"); buzz(20); say("쫘악!"); }
    else { sfx("peel_small"); buzz(10); }
    return 1;
  }

  /* 껍질을 한 단계 올린다 — 올라가는 길은 '실제로 끈 거리' 하나뿐이다. */
  function advance(R, idx, px) {
    const C = PEEL_CONFIG, sz = sizeOf(idx);
    S.dist[idx] += px;
    const d = S.dist[idx];
    if (S.stage[idx] === SHELL && d >= C.crackDistance * sz) {
      S.stage[idx] = CRACKED;
      markCrack(R, idx);
      setGuide(1);                       // "금 간 곳을 다시 문질러 벗기세요"
    }
    if (S.stage[idx] === CRACKED &&
        d >= (C.crackDistance + C.liftDistance) * sz) {
      S.stage[idx] = LIFTED;
      liftShard(R, idx);
    }
    if (S.stage[idx] === LIFTED &&
        d >= (C.crackDistance + C.liftDistance + C.peelDistance) * sz) {
      takeOff(R, idx);
      setGuide(2);                       // "흰자는 피해서 남은 껍질만!"
    }
  }

  /* speed: px/ms (기준 계란 크기로 환산). dwell: 그 자리에 대고 있던 시간(초).
     px: 이번에 그 자리를 지나간 거리(기준 계란 크기의 px).
     반응하는 조각은 포인터가 올라가 있는 '하나' 뿐이다. */
  function rub(x, y, speed, dwell, px) {
    if (S.mode !== "play") return;
    const R = eggRect(), C = PEEL_CONFIG;

    /* 포인터가 지금 올라가 있는 조각 하나. 못 찾으면 아무 일도 없다. */
    const idx = nearestShard(R, x, y);
    if (idx < 0 || !S.inside[idx] || !onShard(R, idx, x, y)) { S.dbg.idx = -1; return; }
    const now = performance.now();
    S.dbg.idx = idx; S.dbg.speed = speed;

    /* 같은 조각에 짧은 시간 안에 다시 들어왔나 — 반복해서 비비는 것을 센다 */
    if (S.lastIdx !== idx) {
      S.rubCount[idx] = (now - S.rubAt[idx]) / 1000 < C.rubGap ? S.rubCount[idx] + 1 : 1;
      S.lastIdx = idx;
    }
    S.rubAt[idx] = now;

    const bare = S.stage[idx] === PEELED;          // 여기는 이제 흰자다
    const danger = clamp((speed - C.safeSpeedMax) / (C.dangerSpeed - C.safeSpeedMax), 0, 1);
    const again = S.rubCount[idx] >= C.repeatRubThreshold ? C.repeatRubBoost : 1;

    /* ---- 마찰 — 흰자가 뜯기는 유일한 길 ----
       (A) 이미 깐 흰자를 계속 비빔  (B) 위험한 속도로 거듭 긁음
       (C) 한 자리에 꾹 누르고 있음 */
    const gain = px * ((bare ? C.whiteRubRate : C.shellRubRate)
                       + danger * C.dangerRubRate) * again
               + dwell * C.holdRubRate;
    const fr = addFriction(idx, gain, now);

    if (fr >= C.whiteDamageThreshold) {
      S.friction[idx] = 0;                         // 뜯겼으니 처음부터
      const tears = [];
      const fresh = S.hurt[idx] === WHOLE;
      tearShard(R, idx, tears);
      if (tears.length) {
        const cw = R.w / TUNE.cols, ch = R.h / TUNE.rows;
        erase(whiteCv, R, tears, Math.max(cw, ch) * TUNE.tearBlob);
        if (fresh) {
          sfx("white_damage"); buzz(40);
          say("흰자 뜯겼어요", true);
          S.warnIdx = idx; S.warnLife = 0.5;
        }
      }
    } else {
      /* 뜯기기 전에 경고 — 흰자를 비비거나, 너무 빠를 때 */
      if (fr >= C.whiteDamageThreshold * C.warnAt || danger > 0.6) warn(idx, bare, danger);
      /* 이미 깐 자리는 제거율이 더 오르지 않는다. 오직 손상 판정만 받는다. */
      if (!bare && px > 0) advance(R, idx, px * speedRate(speed));
    }
    paintHud();
    if (S.peeled / S.total >= TUNE.doneAt) finish();
  }

  /* ============================================================
     진행
     ============================================================ */
  function step(dt) {
    if (S.mode !== "play") return;
    /* 손을 댄 채 가만히 있으면 pointermove 가 안 온다. 그 시간은 마찰로만
       센다 — 누르고 있는 것으로는 껍질이 벗겨지지 않는다. */
    if (S.drag && !S.moved) rub(S.drag.x, S.drag.y, 0, dt, 0);
    S.moved = false;
    if (S.mode !== "play") return;

    S.left = Math.max(0, S.left - dt);
    const t = $("timer");
    t.classList.toggle("hot", S.left <= TUNE.hotAt);
    $("timeNum").textContent = S.left.toFixed(1);
    $("timeFill").style.width = clamp(S.left / TUNE.time, 0, 1) * 100 + "%";
    if (S.left <= 0) finish();
  }

  /* 기울기는 늘 원위치로 돌아간다 (판이 끝나도 부드럽게 멈추게 밖에 둔다) */
  function stepTilt(dt) {
    const k = Math.min(1, dt * TUNE.tiltEase);
    S.tilt += (S.tiltTo - S.tilt) * k;
    S.shift += (S.shiftTo - S.shift) * k;
    if (S.msgLeft > 0) S.msgLeft -= dt;
    if (S.warnLife > 0) S.warnLife -= dt;
  }

  function paintHud() {
    const P = Math.round(S.peeled / S.total * 100);
    const Wp = 100 - Math.round(S.torn / S.total * 100);
    $("peelNum").textContent = P + "%";
    $("keepNum").textContent = Wp + "%";
    $("progFill").style.width = P + "%";
    $("progNum").textContent = P + "%";
    $("keepNum").classList.toggle("bad", Wp < 75);
  }

  function start() {
    S.mode = "play";                     // 'ending' 이었다면 예약된 결과는 이걸 보고 그만둔다
    S.left = TUNE.time;
    S.drag = null;
    S.tilt = S.tiltTo = S.shift = S.shiftTo = 0;
    S.msg = ""; S.msgLeft = 0;
    S.guide = 0; S.warnAt = 0; S.warnCount = 0;
    S.warnIdx = -1; S.warnLife = 0;
    S.lastIdx = -1;
    S.lifts.length = 0;
    S.chips.length = 0;
    S.cracks.length = 0;
    fitCanvas();
    buildCells();
    paintHud();
    $("startOver").hidden = true;
    $("endOver").hidden = true;
    $("timer").classList.remove("hot");
    $("timeNum").textContent = TUNE.time.toFixed(1);
    $("timeFill").style.width = "100%";
  }

  /* 끝! — 입력을 막고 잠깐 멈춘 뒤 결과로 넘어간다 */
  function finish() {
    if (S.mode !== "play") return;
    S.mode = "ending";
    S.drag = null;
    S.tiltTo = 0; S.shiftTo = 0;
    say("끝!");
    sfx("finish");
    setTimeout(showResult, 320);
  }

  /* 플레이어가 만든 계란을 그대로 떠서 결과 화면에 쓴다 */
  function snapEgg() {
    const R = eggRect();
    const pad = R.w * 0.04;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round((R.w + pad * 2) * dpr));
    c.height = Math.max(1, Math.round((R.h + pad * 2) * dpr));
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ox = pad - R.x, oy = pad - R.y;
    [ruinCv, baseCv, whiteCv, shellCv].forEach(l => {
      if (l.width) g.drawImage(l, R.x + ox, R.y + oy, R.w, R.h);
    });
    return c;
  }

  function showResult() {
    if (S.mode !== "ending") return;     // 그 사이에 새 판을 시작했으면 버린다
    S.mode = "over";
    const P = Math.round(S.peeled / S.total * 100);          // 껍질 제거율
    const Wp = 100 - Math.round(S.torn / S.total * 100);     // 흰자 보존율
    /* 시간 보너스는 '빠르고 정확하게' 깐 경우만. 마구 문질러 빨리 끝낸
       플레이가 이득이 되면 규칙과 어긋난다. */
    const Tb = Math.round(clamp(S.left / TUNE.time, 0, 1) * TUNE.wTime
                          * (P / 100) * (Wp / 100));
    const score = clamp(Math.round(P * TUNE.wShell + Wp * TUNE.wWhite + Tb), 0, 100);
    const grade = GRADES.find(g => score >= g.min) || GRADES[GRADES.length - 1];

    $("finalScore").textContent = score;
    $("gradeLabel").textContent = grade.label;
    $("remark").textContent = remarkFor(grade.key);
    $("peelEnd").textContent = P + "%";
    $("keepEnd").textContent = Wp + "%";
    $("timeEnd").textContent = S.left.toFixed(1) + "초";

    /* 내가 만든 계란 그대로 */
    const egg = snapEgg();
    const box = $("resultEgg");
    box.innerHTML = "";
    egg.className = "result-egg-cv";
    box.appendChild(egg);
    lastEgg = egg;
    lastInfo = { score, grade, P, W: Wp, T: S.left.toFixed(1) };

    if (score > S.best) {
      S.best = score;
      try { localStorage.setItem("ccojik_peelegg_best", String(score)); } catch (_) {}
    }
    $("bestEnd").textContent = S.best;
    $("bestStart").textContent = S.best;
    $("endOver").hidden = false;
  }

  let lastEgg = null, lastInfo = null;

  /* ============================================================
     결과 공유 — 다른 꼬직 게임과 같은 방식
     ============================================================ */
  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) ||
                (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function canDownload() { return !isIOS && typeof document.createElement("a").download !== "undefined"; }

  function buildCard() {
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1350;
    const g = c.getContext("2d");
    g.fillStyle = "#F6F3E9"; g.fillRect(0, 0, 1080, 1350);
    g.textAlign = "center";
    g.fillStyle = "#1A1A16";
    g.font = "800 72px Pretendard, sans-serif";
    g.fillText("흰자 안 뜯고", 540, 130);
    g.fillText("깔 수 있어요?", 540, 214);

    if (lastEgg) {
      const maxH = 560, s = Math.min(maxH / lastEgg.height, 620 / lastEgg.width);
      const w = lastEgg.width * s, h = lastEgg.height * s;
      g.drawImage(lastEgg, 540 - w / 2, 290, w, h);
    }

    const i = lastInfo || { score: 0, grade: GRADES[GRADES.length - 1], P: 0, W: 0, T: "0.0" };
    g.fillStyle = "#1A1A16";
    g.font = "800 120px Pretendard, sans-serif";
    g.fillText(i.score + "점", 540, 980);
    g.font = "800 52px Pretendard, sans-serif";
    g.fillText(i.grade.label, 540, 1052);
    g.fillStyle = "#7A7A70";
    g.font = "500 38px Pretendard, sans-serif";
    g.fillText("껍질 제거 " + i.P + "%   흰자 보존 " + i.W + "%", 540, 1118);
    g.fillStyle = "#1A1A16";
    g.font = "600 40px Pretendard, sans-serif";
    g.fillText('"' + remarkFor(i.grade.key) + '"', 540, 1194);
    g.fillStyle = "#C6C6BC";
    g.font = "700 40px Pretendard, sans-serif";
    g.fillText("꼬직", 540, 1288);
    return c;
  }

  async function shareResult() {
    const url = location.href.split("?")[0].split("#")[0];
    const i = lastInfo;
    const text = i ? "계란 까기 " + i.score + "점 (" + i.grade.label + ") 너도 해봐" : "계란 까기 해봐";
    let card = null;
    try { card = buildCard(); } catch (_) {}
    try {
      if (card && navigator.canShare) {
        const blob = await new Promise(r => card.toBlob(r, "image/png"));
        if (blob) {
          const file = new File([blob], "계란까기.png", { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text, url });
            return;
          }
        }
      }
    } catch (_) {}
    try { if (navigator.share) { await navigator.share({ title: "흰자 안 뜯고 깔 수 있어요?", text, url }); return; } } catch (_) {}
    /* 공유를 못 쓰면 이미지로 내려 준다 */
    if (card && canDownload()) {
      card.toBlob(b => {
        if (!b) return;
        const u = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = u; a.download = "계란까기.png";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      }, "image/png");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text + " " + url).catch(() => {});
    }
  }

  /* ============================================================
     조작 — 포인터로 마우스·터치를 함께 받는다. 끄는 것은 오직 까기다.
     ============================================================ */
  function pos(e) {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  cv.addEventListener("pointerdown", e => {
    if (S.mode !== "play") return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    const p = pos(e);
    S.moved = true;
    S.drag = { x: p.x, y: p.y, t: performance.now() };
    /* 탭만으로는 아무 일도 일어나지 않는다 — 단계는 실제로 끌어야 올라간다 */
  }, { passive: false });

  cv.addEventListener("pointermove", e => {
    if (S.mode !== "play" || !S.drag) return;
    e.preventDefault();
    const p = pos(e), now = performance.now();
    S.moved = true;
    const dtMs = Math.max(8, now - S.drag.t);
    const dxp = p.x - S.drag.x, dyp = p.y - S.drag.y;
    const dist = Math.hypot(dxp, dyp);
    const R = eggRect(), rx = R.w / 2;
    /* 판정값은 기준 계란 크기(REF_EGG_W)에서 잰 값이라 화면 크기로 환산한다 */
    const k = REF_EGG_W / R.w;
    const speed = dist * k / dtMs;                 // px/ms
    /* 끄는 쪽으로 계란이 아주 살짝 기운다 (조작에 방해되지 않을 만큼만) */
    S.tiltTo = clamp(dxp / rx, -1, 1) * TUNE.tiltMax;
    S.shiftTo = clamp(dyp / (R.h / 2), -1, 1) * TUNE.shiftMax;
    /* 보간 — 이벤트 사이가 벌어져도 지나간 길을 촘촘히 되살린다. 한 번 찍을
       때마다 그 점이 올라간 조각 하나만 반응하므로, 빨리 그어도 주변이
       한꺼번에 켜지지 않고 중간 조각도 빠지지 않는다. */
    const steps = Math.max(1, Math.ceil(dist / (R.w * 0.025)));
    const px = dist * k / steps;
    for (let s = 1; s <= steps; s++) {
      rub(S.drag.x + dxp * s / steps, S.drag.y + dyp * s / steps, speed, 0, px);
      if (S.mode !== "play") break;
    }
    S.drag = { x: p.x, y: p.y, t: now };
  }, { passive: false });

  const endDrag = () => { S.drag = null; S.tiltTo = 0; S.shiftTo = 0; };
  ["pointerup", "pointercancel"].forEach(t => cv.addEventListener(t, endDrag));
  addEventListener("pointerup", endDrag);
  addEventListener("blur", endDrag);

  $("startBtn").addEventListener("click", start);
  $("againBtn").addEventListener("click", start);
  $("shareBtn").addEventListener("click", shareResult);

  /* ============================================================
     루프
     ============================================================ */
  let last = 0;
  function tick(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!W || !H) { fitCanvas(); if (W && H && !S.shards) buildCells(); }
    step(dt);
    stepTilt(dt);
    stepChips(dt);                        // 판이 끝나도 조각은 마저 떨어진다
    render();
    requestAnimationFrame(tick);
  }

  /* 부팅 — 사진부터 불러오고, 오는 대로 층을 다시 만든다 */
  Object.keys(IMG).forEach(k => {
    const o = IMG[k], im = new Image();
    im.onload = () => {
      o.ok = true; o.el = im;
      if (k === "shell") imgAspect = im.naturalWidth / im.naturalHeight;
      /* 사진이 늦게 와도 하던 판을 초기화하지는 않는다 */
      if (!W || !H || S.mode === "play" || S.mode === "ending") return;
      if (k === "shell") buildCells();
      else if (S.shards) buildLayers(null);
    };
    im.onerror = () => { o.ok = false; };    // 없으면 도형으로 굴러간다
    im.src = o.src;
    o.el = im;
  });

  $("timeNum").textContent = TUNE.time.toFixed(1);
  $("bestStart").textContent = S.best;
  requestAnimationFrame(tick);
})();
