/* ===== 꼬직 · 햄버거 배달 런 =====
 * 높게 쌓인 햄버거를 들고 장애물을 피하며 얼마나 멀리 가나. 조작은 좌우뿐.
 *
 * 좌표계
 *   그리기는 전부 '논리 px' 로 한다. 화면 높이를 1920 으로 본 값이고,
 *   원점은 '플레이어의 발밑' 이다. 위로 갈수록 y 가 작아진다(음수).
 *   화면 크기가 달라도 같은 손놀림이 같은 결과가 되도록, 거리와 속도는
 *   전부 이 논리 px 로 계산하고 마지막에 한 번만 화면 크기로 환산한다.
 *
 * 전진은 월드가 아니라 '장애물이 내려오는' 방식(A안)이다. 오브젝트마다
 * 월드 거리(wy)를 들고 있고, 화면 y 는 그때그때 환산한다 — 모바일에서
 * 좌표를 통째로 옮기는 것보다 가볍다.
 *
 * 햄버거는 하나의 그림이 아니다. 층마다 제 오프셋과 속도를 가진 감쇠
 * 스프링이고, 손끝의 '가속도'가 그 스프링을 흔든다. 위로 갈수록 무르게
 * 묶여 있어 탑이 휘어 보인다. 많이 휘면 위에서부터 떨어진다.
 *
 * 그림은 전부 image/ 의 PNG 다. 파일마다 투명 여백이 달라서, 알파를 실제로
 * 재서 얻은 '보이는 부분'의 테두리(BOX)로 크기와 접지선을 보정한다. 그래서
 * 원본 픽셀 크기는 쓰지 않고, 보이는 폭을 논리 px 로 지정해 그린다.
 *
 * 금지: 외부 라이브러리, 이모지 */
(() => {
  "use strict";

  /* ============================================================
     밸런스 — 숫자는 전부 여기서만 만진다
     ============================================================ */
  const GAME_CONFIG = {
    /* ---- 시작 상태 ---- */
    startBurgerLayers: 14,      // 첫 화면부터 이만큼 높다
    maxLayers: 28,              // 이 위로는 안 쌓인다 (성능·화면)
                                //  재료와 캐릭터를 키운 만큼 상한을 내렸다.
                                //  28단 최악(패티만) = 논리 1710px 로, 가장 많이
                                //  물러난 줌(0.80)에서 쓸 수 있는 1752px 안이다

    /* ---- 전진 ---- 논리 px/초 */
    baseSpeed: 1000,
    maxSpeed: 1800,
    speedFullAt: 600,           // 이 거리(m)에서 최고 속도가 된다
    worldToMeter: 0.012,        // 논리 px -> m

    /* ---- 좌우 조작 ---- */
    playerMoveSpeed: 2.6,       // 1초에 도로를 몇 번 건너나
    playerEase: 14,             // 손가락을 따라붙는 빠르기
    slipEase: 4.5,              // 물웅덩이에서는 미끄러져 둔해진다
    slipTime: 1.1,              // 그 시간(초)

    /* ---- 햄버거 흔들림 ---- */
    swaySpring: 52,             // 제자리로 돌아가는 힘
    swayDamp: 6.2,              // 감쇠 (작으면 오래 출렁인다)
    swayDrive: 0.09,            // 손끝 가속도가 실리는 정도. 아슬아슬함의 핵심이라
                                //  '한 번 크게 꺾으면 눈에 보이게' 까지 올렸다
    swayTopBias: 0.75,          // 위층일수록 더 실린다 (0 이면 전층 같음)
    swaySpringTop: 0.5,         // 위층은 이만큼 무르게 묶인다
    swayByHeight: [             // 높을수록 전체가 더 흔들린다
      { upTo: 10, mul: 1.00 },
      { upTo: 20, mul: 1.15 },
      { upTo: 30, mul: 1.35 },
      { upTo: 999, mul: 1.55 },
    ],
    dropLean: 165,              // 맨 위가 이만큼 밀리면 떨어진다 (논리 px)
    slipSwayMul: 1.5,           // 미끄러질 때 흔들림 배수

    /* ---- 충돌로 떨어지는 재료 수 ---- */
    weakCollisionLoss: 1,
    mediumCollisionLoss: 2,
    strongCollisionLoss: 3,
    wallScrapeLoss: 1,
    collisionKick: 2600,        // 충돌이 탑에 주는 흔들림 (논리 px/s^2)
    hitCooldown: 0.45,          // 같은 장애물에 연달아 맞지 않게 (초)

    /* ---- PERFECT ---- */
    perfectDistance: 42,        // 이보다 가까이 스쳐 지나가면 PERFECT
    perfectReward: 5,           // 이만큼 연속하면 재료 한 장을 얻는다

    /* ---- 카메라 ---- */
    playerY: 0.73,              // 플레이어가 화면 위에서 어디쯤인가
    cameraZoom: [               // 탑이 높아지면 조금씩 물러난다.
      { upTo: 15, scale: 1.00 },   //  마지막 칸(0.80)은 '패티만 28단' 같은
      { upTo: 19, scale: 0.95 },   //  가장 높은 경우(논리 1710px)까지
      { upTo: 23, scale: 0.90 },   //  꼭대기가 잘리지 않게 잡은 값이다
      { upTo: 26, scale: 0.85 },
      { upTo: 999, scale: 0.80 },
    ],
    zoomEase: 3.2,
    minZoom: 0.80,              // 이 아래로는 안 물러난다 — 캐릭터가 너무 작아지면
                                //  조작이 어려워진다
    shakeTime: 0.18,            // 충돌 순간에만 아주 약하게
    shakeAmp: 14,

    /* ---- 난이도 ---- 거리(m) 기준 */
    difficultyDistances: {
      easy: 0, normal: 100, medium: 250, hard: 400, expert: 600, endless: 800,
    },
    spawnGap: [                 // 난이도별 패턴 간격 (논리 px)
      { tier: "easy",    gap: 2000 },
      { tier: "normal",  gap: 1750 },
      { tier: "medium",  gap: 1500 },
      { tier: "hard",    gap: 1320 },
      { tier: "expert",  gap: 1180 },
      { tier: "endless", gap: 1050 },
    ],
    riskRouteFrom: 170,         // 안전/재료 갈림길이 나오기 시작하는 거리(m)

    /* ---- 성능 울타리 ---- */
    maxFallen: 40,              // 떨어져 날아가는 재료 수 상한
    maxEntities: 60,            // 화면에 둘 장애물·아이템 수 상한
  };

  /* 디버그 — 배포는 전부 false */
  const DEBUG_GAME = false;
  const DEBUG_COLLISION = false;
  const DEBUG_ASSET = false;        // 앵커·보이는 영역·접지선을 그려 본다

  /* ============================================================
     그림 — image/ 안의 실제 파일. 파일명은 그대로 둔다(이중 확장자 포함).
     ============================================================ */
  /* 파일명이 그대로라 브라우저·CDN 이 옛 그림을 쥐고 있을 수 있다.
     그림을 갈아 끼울 때마다 이 날짜만 올리면 즉시 새 그림이 간다. */
  const ASSET_VERSION = "20261006b";
  const ASSETS = {
    player:    "image/player.png.png?v=" + ASSET_VERSION,
    bunTop:    "image/ing-bun-top.png.png",
    bunBottom: "image/ing-bun-bottom.png.png",
    patty:     "image/ing-patty.png.png",
    cheese:    "image/ing-cheese.png.png",
    lettuce:   "image/ing-lettuce.png.png",
    tomato:    "image/ing-tomato.png.png",
    pickle:    "image/ing-pickle.png.png",
    cone:      "image/obs-cone.png.png",
    bin:       "image/obs-bin.png.png",
    box:       "image/obs-box.png.png",
    bike:      "image/obs-bike.png.png",
    scooter:   "image/obs-scooter.png.png",
    sign:      "image/obs-sign.png.png",
  };

  /* 알파를 실제로 훑어 얻은 '보이는 부분'의 테두리 — 캔버스 대비 비율이다.
     l/t/r/b 는 사방의 투명 여백. 이 값이 없으면 파일마다 여백이 달라
     크기도 접지선도 제각각 어긋난다. 그림을 바꾸면 이 표도 다시 재야 한다. */
  const BOX = {
    /* 새 컬러 캐릭터를 실측한 값 (930x1691). 손끝 .223, 머리 .200, 발밑 .879 */
    player:    { l: .056, t: .200, r: .056, b: .121, hand: .223 },
    bunTop:    { l: .076, t: .086, r: .076, b: .105 },
    bunBottom: { l: .076, t: .327, r: .078, b: .108 },
    patty:     { l: .165, t: .196, r: .164, b: .169 },
    cheese:    { l: .118, t: .250, r: .119, b: .249 },
    lettuce:   { l: .023, t: .159, r: .023, b: .146 },
    tomato:    { l: .092, t: .104, r: .093, b: .110 },
    pickle:    { l: .049, t: .225, r: .048, b: .185 },
    cone:      { l: .008, t: .058, r: .010, b: .054 },
    bin:       { l: .028, t: .103, r: .029, b: .049 },
    box:       { l: .003, t: .247, r: .004, b: .120 },
    bike:      { l: .001, t: .321, r: .000, b: .089 },
    scooter:   { l: .016, t: .056, r: .021, b: .035 },
    sign:      { l: .014, t: .203, r: .014, b: .224 },
  };

  /* 보이는 크기 — 원본 픽셀이 아니라 전부 논리 px 로 따로 잡는다 */
  /* 캐릭터는 '햄버거를 실제로 들고 가는 사람' 으로 보여야 한다 — 전보다 14% 크게 */
  const PLAYER_VISUAL = { width: 250, offsetX: 0, offsetY: 0 };
  const BURGER_W = 226;              // 기준 재료(1.0)의 보이는 폭 (전보다 8% 크게)
  const BURGER_BASE_OFFSET_Y = 0;    // + 면 아래로, - 면 위로. 손과의 간격 조정용
  /* 달리는 느낌 — 아주 조금만. 햄버거는 한 박자 늦게 따라와 '들려 있는' 느낌을 만든다 */
  const RUN_BOB = 3.5;               // 캐릭터가 위아래로 흔들리는 폭 (논리 px)
  const RUN_HZ = 4.6;                // 1초에 몇 번
  const BURGER_LAG = 11;             // 햄버거가 따라오는 빠르기 (작으면 더 늦게)

  /* 재료마다 보이는 폭과 '쌓는 간격' 을 따로 둔다.
     그림 높이를 그대로 간격으로 쓰면 탑이 들쭉날쭉하거나 벌어진다.
     widthScale 은 BURGER_W 대비 '보이는 폭', stackStep 은 쌓는 간격이다. */
  const ING_VISUAL = {
    bunTop:    { widthScale: 1.00, stackStep: 52, offsetY: 0 },
    bunBottom: { widthScale: 0.98, stackStep: 37, offsetY: 0 },
    patty:     { widthScale: 0.96, stackStep: 49, offsetY: 0 },
    cheese:    { widthScale: 1.03, stackStep: 37, offsetY: 0 },
    lettuce:   { widthScale: 1.06, stackStep: 43, offsetY: 0 },
    tomato:    { widthScale: 0.93, stackStep: 49, offsetY: 0 },
    pickle:    { widthScale: 0.88, stackStep: 32, offsetY: 0 },
  };
  const FALLING_SCALE = 0.90;        // 떨어지는 재료는 조금 작게
  const PICKUP_SCALE = 0.70;         // 길에 놓인 재료는 더 작게

  /* 장애물마다 보이는 폭 (논리 px). 높이는 그림 비율로 정한다.
     판정(KIND.hw)은 보이는 폭보다 12% 작게 — 투명 여백까지 맞고 억울하지 않게. */
  const OBSTACLE_VISUAL = {
    cone:    { width: 105, offsetX: 0, offsetY: 0 },
    bin:     { width: 186, offsetX: 0, offsetY: 0 },
    box:     { width: 155, offsetX: 0, offsetY: 0 },
    bike:    { width: 168, offsetX: 0, offsetY: 0 },
    scooter: { width: 141, offsetX: 0, offsetY: 0 },
  };

  /* 논리 좌표계 */
  const REF_H = 1920;           // 화면 높이를 이 값으로 본다
  const ROAD = 440;             // 도로 반폭
  /* 판정 반폭 — 몸통 기준이다. 그림의 보이는 폭(220)의 0.6 배로, 위로 든
     양팔과 머리는 판정에 넣지 않는다 (팔까지 맞으면 억울하다). */
  const PLAYER_HW = 66;
  const MOVE_RANGE = ROAD - PLAYER_HW - 10;

  /* ============================================================
     재료 — 생김새와 물성. 위로 갈수록 미끄러운 것이 위험하다.
       slip 손끝 가속도가 얼마나 실리나   grip 제자리로 돌아가는 힘
     ============================================================ */
  const ING = {
    bunBottom: { name: "아래 번", w: 258, h: 40, slip: 0.55, grip: 1.45, fill: "#D99A4E", edge: "#8A5A20" },
    bunTop:    { name: "위 번",   w: 268, h: 58, slip: 0.60, grip: 1.40, fill: "#E0A354", edge: "#8A5A20" },
    patty:     { name: "패티",    w: 248, h: 40, slip: 0.70, grip: 1.30, fill: "#6B3F23", edge: "#3A2111" },
    cheese:    { name: "치즈",    w: 266, h: 20, slip: 1.15, grip: 0.85, fill: "#FFC93C", edge: "#C08A00" },
    lettuce:   { name: "양상추",  w: 284, h: 26, slip: 1.35, grip: 0.70, fill: "#5FBF4A", edge: "#2F7A22" },
    tomato:    { name: "토마토",  w: 236, h: 26, slip: 1.50, grip: 0.62, fill: "#E8402F", edge: "#9A1C10" },
    pickle:    { name: "피클",    w: 150, h: 18, slip: 1.45, grip: 0.60, fill: "#7FA62B", edge: "#4A6615" },
  };
  const FILLINGS = ["patty", "cheese", "lettuce", "tomato", "pickle"];

  /* 등급 — 거리로 갈린다 */
  const GRADES = [
    { min: 800, title: "인간 자이로스코프", remark: "이 정도면 재능임" },
    { min: 600, title: "프로 배달러",       remark: "식기 전에 도착함" },
    { min: 400, title: "햄버거 운반 장인",  remark: "이걸 왜 안 떨어뜨림?" },
    { min: 250, title: "제법 갑니다",       remark: "햄버거가 불안함" },
    { min: 100, title: "동네 배달원",       remark: "조금만 더 가세요" },
    { min: 0,   title: "배달 시작도 못 함", remark: "매장 앞입니다" },
  ];

  /* 효과음 — 파일이 들어오면 여기 경로만 채우면 된다. 없으면 조용히 넘어간다. */
  const SFX = {
    hit_soft: null, hit_hard: null, drop: null,
    pickup: null, perfect: null, bump: null, over: null,
  };
  const sfxCache = {};
  function sfx(name) {
    const src = SFX[name];
    if (!src) return;
    try {
      let a = sfxCache[name];
      if (!a) { a = sfxCache[name] = new Audio(src); a.preload = "auto"; }
      a.currentTime = 0; a.play().catch(() => {});
    } catch (_) {}
  }
  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {}
  }

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ============================================================
     그림 불러오기 — 다 올 때까지 시작 버튼을 잠근다. 한 장이 실패해도
     게임은 돌아간다 (그 그림만 도형으로 대신 그린다).
     ============================================================ */
  const IMGS = {};
  let assetsReady = false, assetsLeft = 0;
  function loadAssets(done) {
    const keys = Object.keys(ASSETS);
    assetsLeft = keys.length;
    for (const k of keys) {
      const rec = IMGS[k] = { ok: false, el: new Image() };
      const fin = () => {
        if (--assetsLeft <= 0) { assetsReady = true; done && done(); }
      };
      rec.el.onload = () => { rec.ok = true; fin(); };
      /* 파일 이름이 'ing-patty.png.png' 처럼 확장자가 겹쳐 있다. 나중에 누가
         'ing-patty.png' 로 고쳐 두면 그쪽으로 한 번 더 찾아본다. */
      let retried = false;
      rec.el.onerror = () => {
        if (!retried && /.png.png$/.test(ASSETS[k])) {
          retried = true;
          rec.el.src = ASSETS[k].replace(/.png.png$/, ".png");
          return;
        }
        console.warn("[burger-run] 그림을 못 읽었습니다: " + ASSETS[k]);
        fin();
      };
      rec.el.src = ASSETS[k];
    }
  }
  const has = k => !!(IMGS[k] && IMGS[k].ok);

  /* 보이는 폭을 w 로 맞춰 그린다. mode "bottom" 이면 (x,y) 가 접지 중앙,
     "center" 면 보이는 영역의 중심. 비율은 원본 그대로 — 찌그러뜨리지 않는다. */
  function drawAsset(g, key, x, y, w, mode, rot) {
    if (!has(key)) return false;
    const B = BOX[key], im = IMGS[key].el;
    const vw = 1 - B.l - B.r, vh = 1 - B.t - B.b;
    const dw = w / vw;
    const dh = dw * (im.naturalHeight / im.naturalWidth);
    const ox = -dw * (B.l + vw / 2);
    const oy = mode === "bottom" ? -dh * (1 - B.b) : -dh * (B.t + vh / 2);
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.drawImage(im, ox, oy, dw, dh);
    g.restore();
    return true;
  }
  /* 그 그림을 w 폭으로 그렸을 때 보이는 높이 */
  function visHeight(key, w) {
    if (!has(key)) return w * 0.33;
    const B = BOX[key], im = IMGS[key].el;
    const dw = w / (1 - B.l - B.r);
    return dw * (im.naturalHeight / im.naturalWidth) * (1 - B.t - B.b);
  }
  /* 재료 한 장의 보이는 폭 / 쌓는 간격 */
  const ingW = t => BURGER_W * (ING_VISUAL[t] ? ING_VISUAL[t].widthScale : 1);
  const stepOf = t => (ING_VISUAL[t] ? ING_VISUAL[t].stackStep : 34);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  /* ============================================================
     상태
     ============================================================ */
  const S = {
    mode: "start",              // start / play / ending / over
    dist: 0,                    // m
    scroll: 0,                  // 논리 px
    speed: GAME_CONFIG.baseSpeed,
    x: 0, vx: 0, ax: 0,         // 플레이어 좌우 (-1 ~ 1)
    aim: 0,                     // 손가락이 가리키는 자리
    drag: null,
    keys: { left: false, right: false },

    layers: [],                 // 아래부터 위로. { t, off, vel }
    fallen: [],                 // 떨어지는 재료
    ents: [],                   // 장애물·아이템
    nextSpawn: 0,               // 다음 패턴을 놓을 월드 거리
    opening: 0,                 // 첫 10초 대본의 다음 순서

    flyers: [],                 // 먹은 재료가 탑 위로 날아가는 중
    bob: 0, bobLag: 0,          // 달리는 상하 흔들림 / 햄버거가 늦게 따라오는 양
    hop: 0, hopVel: 0,          // 과속방지턱에서 튀어오름
    slipLeft: 0,                // 미끄러지는 시간
    shake: 0,
    zoom: 1, zoomTo: 1,
    slowmo: 0,                  // 마지막 재료가 떨어질 때

    msg: "", msgLeft: 0, msgBig: false,
    perfect: 0, perfectBest: 0, perfectHold: 0,
    got: 0, lost: 0, maxStack: 0,
    lastHit: -9,
    pattern: "-",               // 지금 깔린 패턴 이름 (디버그)
    best: 0, bestStack: 0,
    fps: 0,
  };
  try {
    S.best = +(localStorage.getItem("ccojik_burgerrun_best") || 0) || 0;
    S.bestStack = +(localStorage.getItem("ccojik_burgerrun_stack") || 0) || 0;
  } catch (_) {}

  const cv = $("cv"), ctx = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1, sc = 1;      // sc: 논리 px -> 화면 px

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
  /* 주소창이 접히거나 화면이 돌아가도 캔버스 크기를 바로 따라잡는다 */
  try { new ResizeObserver(fitCanvas).observe(cv); } catch (_) {}

  /* ============================================================
     햄버거 탑
     ============================================================ */
  function newLayer(t) { return { t, off: 0, vel: 0 }; }

  /* 시작 탑 — 아래 번, 속재료, 위 번. 순서는 판마다 조금씩 다르다. */
  function buildBurger(n) {
    const out = [newLayer("bunBottom")];
    const deck = ["patty", "cheese", "lettuce", "patty", "tomato", "cheese",
                  "patty", "lettuce", "cheese", "patty", "tomato", "pickle"];
    for (let i = 0; i < n - 2; i++) {
      /* 대본을 따라가되 가끔 뒤섞는다 — 첫 화면이 매번 똑같지 않게 */
      out.push(newLayer(Math.random() < 0.75 ? deck[i % deck.length] : pick(FILLINGS)));
    }
    out.push(newLayer("bunTop"));
    return out;
  }

  /* 높이에 따른 흔들림 배수 */
  function swayMul(n) {
    for (const r of GAME_CONFIG.swayByHeight) if (n <= r.upTo) return r.mul;
    return 1;
  }
  /* 탑 전체 높이 (논리 px) — 그림 높이가 아니라 '쌓는 간격'의 합이다 */
  function stackHeight() {
    let h = 0;
    for (const L of S.layers) h += stepOf(L.t);
    return h;
  }
  /* 층 i 의 바닥이 손끝에서 얼마나 높은가 */
  function layerBase(i) {
    let h = 0;
    for (let k = 0; k < i; k++) h += stepOf(S.layers[k].t);
    return h;
  }
  /* 손끝 높이 — 발밑에서 위로 몇 px 인가. 햄버거는 여기서부터 쌓인다. */
  function handY() {
    if (!has("player")) return 300;
    const B = BOX.player, im = IMGS.player.el;
    const dw = PLAYER_VISUAL.width / (1 - B.l - B.r);
    const dh = dw * (im.naturalHeight / im.naturalWidth);
    /* 손끝과 머리 꼭대기 중 '더 높은 쪽' 위에 얹는다. 손끝만 보고 얹으면
       (이 그림은 머리가 손보다 조금 높다) 햄버거가 얼굴을 덮는다. */
    const top = Math.min(B.hand, B.t);
    return dh * (1 - B.b) - dh * top - BURGER_BASE_OFFSET_Y;
  }
  /* 간판의 '통과 높이' — 지금 탑에서 그 층수가 차지하는 실제 높이.
     판정은 층수로 하므로(§21) 보이는 선과 판정선이 어긋나지 않게 맞춘다. */
  function gapHeight(n) {
    let h = handY();
    for (let i = 0; i < n; i++) h += stepOf(S.layers[i] ? S.layers[i].t : "patty");
    return h;
  }
  /* 맨 위가 중심에서 얼마나 밀려 있나 (논리 px) */
  function topLean() {
    let x = 0;
    for (const L of S.layers) x += L.off;
    return x;
  }

  /* 탑을 흔든다 — 층마다 감쇠 스프링 하나. 손끝 가속도가 그 스프링을 민다. */
  function stepSway(dt) {
    const C = GAME_CONFIG, n = S.layers.length;
    if (!n) return;
    const mul = swayMul(n) * (S.slipLeft > 0 ? C.slipSwayMul : 1);
    /* 손끝 가속도 (논리 px/s^2) + 턱을 넘을 때의 충격 */
    const drive = S.ax * MOVE_RANGE * mul;
    for (let i = 0; i < n; i++) {
      const L = S.layers[i], ing = ING[L.t];
      const up = n > 1 ? i / (n - 1) : 0;               // 0 아래 ~ 1 위
      /* 위층은 무르게 묶여 더 휜다 */
      const k = C.swaySpring * ing.grip * (1 - C.swaySpringTop * up);
      const push = drive * ing.slip * (1 - C.swayTopBias + C.swayTopBias * up);
      L.vel += (-k * L.off - C.swayDamp * L.vel - push * C.swayDrive) * dt;
      L.off += L.vel * dt;
      L.off = clamp(L.off, -240, 240);
    }
    /* 너무 휘면 위에서부터 떨어진다 */
    let guard = 0;
    while (S.layers.length && Math.abs(topLean()) > C.dropLean && guard++ < 4) {
      dropLayers(1, Math.sign(topLean()));
    }
  }

  /* 탑에 바로 충격을 준다 (충돌·턱) */
  function kickSway(power, dir) {
    const n = S.layers.length;
    for (let i = 0; i < n; i++) {
      const up = n > 1 ? i / (n - 1) : 0;
      S.layers[i].vel += dir * power * (0.25 + 0.75 * up) * ING[S.layers[i].t].slip * 0.01;
    }
  }

  /* 위에서부터 n 장을 떨어뜨린다 — 배열에서 지우지 않고 '떨어지는 재료'로 넘긴다 */
  function dropLayers(n, dir) {
    for (let c = 0; c < n && S.layers.length; c++) {
      const i = S.layers.length - 1;
      const L = S.layers[i];
      const bx = S.x * MOVE_RANGE;
      let ox = 0;
      for (let k = 0; k <= i; k++) ox += S.layers[k].off;
      if (S.fallen.length < GAME_CONFIG.maxFallen) {
        S.fallen.push({
          t: L.t,
          x: bx + ox, y: -(handY() + layerBase(i) + stepOf(L.t) / 2) - S.hop,
          vx: (dir || (Math.random() < 0.5 ? -1 : 1)) * rnd(120, 420) + L.vel * 0.5,
          vy: rnd(-420, -120),
          rot: 0, vr: rnd(-7, 7),
          bounce: 0,
        });
      }
      S.layers.pop();
      S.lost++;
    }
    sfx("drop");
    if (!S.layers.length) gameOver();
    else paintHud();
  }

  /* 먹은 재료가 탑 위로 날아간다 — 순간이동하지 않게 한 박자 둔다 */
  function flyTo(t, fromX, fromY) {
    if (S.layers.length >= GAME_CONFIG.maxLayers) return false;
    S.flyers.push({ t, x: fromX, y: fromY, life: 0, dur: 0.18 });
    S.got++;
    sfx("pickup"); buzz(8);
    return true;
  }
  function stepFlyers(dt) {
    for (let i = S.flyers.length - 1; i >= 0; i--) {
      const f = S.flyers[i];
      f.life += dt;
      if (f.life >= f.dur) {
        S.flyers.splice(i, 1);
        addLayer(f.t, true);                       // 도착 — 탑에 합친다
      }
    }
  }
  /* 재료를 얻는다 — 위에 얹히면서 짧게 커졌다 작아진다 */
  function addLayer(t, fromFlyer) {
    if (S.layers.length >= GAME_CONFIG.maxLayers) return false;
    /* 위 번은 늘 맨 위에 있어야 보기 좋다 — 그 아래로 끼워 넣는다 */
    const L = newLayer(t);
    L.pop = 1;
    const top = S.layers[S.layers.length - 1];
    if (top && top.t === "bunTop") S.layers.splice(S.layers.length - 1, 0, L);
    else S.layers.push(L);
    if (!fromFlyer) S.got++;                       // 날아온 것은 먹을 때 이미 셌다
    S.maxStack = Math.max(S.maxStack, S.layers.length);
    if (fromFlyer) { sfx("pickup"); }
    paintHud();
    return true;
  }

  /* 떨어지는 재료 — 중력·회전·한 번의 튕김. 화면을 벗어나면 치운다. */
  function stepFallen(dt) {
    const floorY = 30;                                  // 발밑 가까이가 바닥
    for (let i = S.fallen.length - 1; i >= 0; i--) {
      const f = S.fallen[i];
      f.vy += 2200 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.rot += f.vr * dt;
      /* 바닥에 한 번 튕긴다 */
      if (f.y > floorY && f.vy > 0 && f.bounce < 1) {
        f.y = floorY; f.vy = -f.vy * 0.42; f.vx *= 0.7; f.bounce++;
      }
      /* 도로가 아래로 흐르므로 떨어진 재료도 같이 뒤로 밀린다 */
      f.y += S.speed * dt * 0.55;
      if (f.y > REF_H * 0.6 || Math.abs(f.x) > ROAD * 3) S.fallen.splice(i, 1);
    }
  }

  /* ============================================================
     장애물 — 패턴으로 낸다. 완전 랜덤은 못 피하는 배치를 만든다.
     ============================================================ */
  /* 종류마다 생김새와 판정이 다르다.
       over  머리 위를 지나가는 것 (간판·전깃줄) — 탑이 높으면 위층이 걸린다
       slip  물웅덩이                           — 미끄러진다
       bump  과속방지턱                         — 튀어오른다
       wall  좁은 통로                          — 벽에 스치면 떨어진다 */
  const KIND = {
    cone:    { hw: 46, h: 96,  loss: "weak",   label: "라바콘" },
    bin:     { hw: 82, h: 150, loss: "medium", label: "쓰레기통" },
    box:     { hw: 68, h: 120, loss: "medium", label: "택배박스" },
    sign:    { over: true, gapLayers: 13, hw: 240, label: "낮은 간판" },
             /*  ^ 반폭 240 + 몸 66 = 306 < 도로 364 — 가장자리로 피할 수 있다.
                  제때 못 비키면 탑 높이만큼 위층이 걸린다 (§21) */
    wire:    { over: true, gapLayers: 18, hw: 440, thin: true, label: "전깃줄" },
    puddle:  { slip: true, hw: 120, label: "물웅덩이" },
    bump:    { bump: true, hw: ROAD, label: "과속방지턱" },
    bike:    { hw: 74, h: 128, loss: "medium", move: 150, label: "자전거" },
    scooter: { hw: 62, h: 118, loss: "strong", move: 280, label: "킥보드" },
    wall:    { wall: true, label: "좁은 통로" },
    item:    { item: true, hw: 52, label: "재료" },
  };

  function ent(kind, x, wy, extra) {
    const K = KIND[kind];
    return Object.assign({
      kind, x, wy,
      hw: K.hw || 40, h: K.h || 80,
      hit: false, passed: false, near: 9999,
    }, extra || {});
  }

  /* ---- 패턴 — 한 묶음이 한 번에 놓인다. dy 는 묶음 안에서의 앞뒤 차이. ----
     어떤 패턴이든 '지나갈 수 있는 길' 이 한 줄은 남아야 한다. 아래
     safeLane() 이 그걸 실제로 검사하고, 막혔으면 하나를 치운다. */
  const PATTERNS = {
    easy: [
      () => [["cone", -200, 0], ["cone", -40, 0], ["item", 240, 300]],
      () => [["bin", 180, 0], ["item", -160, 280], ["item", -160, 560]],
      () => [["cone", 0, 0], ["item", -260, 320], ["item", 260, 320]],
      () => [["cone", -300, 0], ["cone", -140, 0], ["item", 220, 260]],
    ],
    normal: [
      () => [["box", -230, 0], ["bin", 120, 180], ["item", -60, 520]],
      () => [["sign", 0, 0, { gapLayers: 15 }], ["item", -200, 420], ["item", 200, 420]],
      () => [["cone", -120, 0], ["cone", 40, 0], ["box", 260, 160], ["item", -280, 480]],
      () => [["bin", -260, 0], ["box", 60, 120], ["item", 280, 380]],
    ],
    /* 중반 이후로는 '가운데' 도 위협한다 — 가만히 있으면 안 되게.
       그래도 지나갈 길은 한 줄 남는다 (cullImpossible 이 실제로 검사한다). */
    medium: [
      () => [["puddle", -150, 0], ["cone", 60, 200], ["cone", 240, 200]],
      () => [["bump", 0, 0], ["cone", -30, 560]],
      () => [["bike", -300, 0, { dir: 1 }], ["box", 60, 240]],
      () => [["sign", -100, 0, { hw: 250, gapLayers: 12 }], ["cone", 20, 420], ["item", 300, 420]],
    ],
    hard: [
      () => [["wall", 0, 0, { gapW: 230, len: 900 }], ["cone", 0, 1180]],
      () => [["sign", 0, 0, { gapLayers: 11 }], ["cone", -40, 520], ["cone", 200, 520]],
      () => [["bike", 280, 0, { dir: -1 }], ["puddle", -200, 260], ["box", 40, 520]],
      () => [["bump", 0, 0], ["box", -60, 420], ["box", 240, 420]],
    ],
    expert: [
      () => [["bike", -320, 0, { dir: 1 }], ["cone", 0, 0], ["cone", 160, 0]],
      () => [["wire", 0, 0, { gapLayers: 15 }], ["puddle", 120, 300], ["cone", -80, 300]],
      () => [["bump", 0, 0], ["box", 0, 300], ["bump", 0, 820]],
      () => [["wall", 0, 0, { gapW: 210, len: 1000 }], ["item", 0, 1200], ["cone", -60, 1500]],
    ],
    endless: [
      () => [["scooter", 300, 0, { dir: -1 }], ["cone", -140, 0], ["cone", 20, 0]],
      () => [["sign", 0, 0, { gapLayers: 10 }], ["box", 0, 560], ["bike", -300, 560, { dir: 1 }]],
      () => [["wall", 0, 0, { gapW: 200, len: 1100 }], ["bump", 0, 1400], ["cone", 0, 1700]],
      () => [["puddle", -120, 0], ["scooter", -300, 300, { dir: 1 }], ["cone", 60, 520]],
    ],
  };

  /* 안전/재료 갈림길 — 한쪽은 비었고 한쪽은 재료가 많고 장애물도 많다 */
  function riskPattern() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const out = [];
    for (let i = 0; i < 3; i++) out.push(["item", side * 240 + rnd(-30, 30), i * 300]);
    out.push(["cone", side * 150, 120]);
    out.push(["box", side * 330, 480]);
    return out;
  }

  function tier() {
    const D = GAME_CONFIG.difficultyDistances, d = S.dist;
    if (d >= D.endless) return "endless";
    if (d >= D.expert) return "expert";
    if (d >= D.hard) return "hard";
    if (d >= D.medium) return "medium";
    if (d >= D.normal) return "normal";
    return "easy";
  }
  function spawnGap() {
    const t = tier();
    for (const g of GAME_CONFIG.spawnGap) if (g.tier === t) return g.gap;
    return 1600;
  }

  /* 첫 10초 대본 — 이 구간만은 의도대로 보여 준다.
     회피 -> 재료 -> 간판 -> 조합 을 한 번씩 거친다. */
  const OPENING = [
    { at: 1700, rows: [["cone", -180, 0]] },
    { at: 3600, rows: [["bin", 200, 0]] },
    { at: 5400, rows: [["item", -120, 0], ["item", 120, 320]] },
    { at: 7600, rows: [["sign", 0, 0, { gapLayers: 15 }]] },
    { at: 9900, rows: [["cone", -260, 0], ["box", 60, 260]] },
  ];

  /* 패턴 하나를 월드에 놓는다 */
  function place(rows, wy) {
    for (const r of rows) {
      const [kind, x, dy, extra] = r;
      if (S.ents.length >= GAME_CONFIG.maxEntities) return;
      const e = ent(kind, clamp(x + rnd(-24, 24), -ROAD + 60, ROAD - 60), wy + dy, extra);
      if (kind === "item") e.t = pick(FILLINGS);
      if (kind === "wall") { e.x = clamp(x + rnd(-40, 40), -140, 140); }
      S.ents.push(e);
    }
    ensurePassable(wy);
  }

  /* 한 줄에서 '몸 가운데'가 있을 수 있는 x 구간들 */
  function freeLanes(list) {
    const blocks = [];
    for (const e of list) {
      if (KIND[e.kind].wall) {
        blocks.push([-ROAD, e.x - e.gapW / 2 + PLAYER_HW]);
        blocks.push([e.x + e.gapW / 2 - PLAYER_HW, ROAD]);
      } else blocks.push([e.x - e.hw - PLAYER_HW, e.x + e.hw + PLAYER_HW]);
    }
    blocks.sort((a, b) => a[0] - b[0]);
    const free = [];
    let x = -MOVE_RANGE;
    for (const [a, b] of blocks) {
      if (a > x) free.push([x, Math.min(a, MOVE_RANGE)]);
      x = Math.max(x, b);
      if (x >= MOVE_RANGE) break;
    }
    if (x < MOVE_RANGE) free.push([x, MOVE_RANGE]);
    return free.filter(f => f[1] - f[0] >= 0);
  }

  /* 방금 놓은 묶음을 '정말 지나갈 수 있나' 로 검사한다. 줄마다 빈 길을 구하고,
     앞 줄에 서 있을 수 있던 자리에서 좌우로 움직여 닿는지 본다 — 못 닿으면
     그 줄에서 가장 넓은 놈을 치운다. 보고 반응할 시간까지 치는 울타리다. */
  function ensurePassable(from) {
    const mine = S.ents.filter(e => e.wy >= from - 10 &&
      !KIND[e.kind].item && !KIND[e.kind].over && !KIND[e.kind].bump);
    if (!mine.length) return;
    mine.sort((a, b) => a.wy - b.wy);
    const rows = [];
    for (const e of mine) {
      const r = rows[rows.length - 1];
      if (r && Math.abs(e.wy - r.wy) < 120) r.list.push(e);
      else rows.push({ wy: e.wy, list: [e] });
    }
    let reach = [[-MOVE_RANGE, MOVE_RANGE]];
    let prevWy = S.scroll;
    for (const row of rows) {
      /* 그 줄까지 가는 데 쓸 수 있는 시간만큼만 좌우로 움직일 수 있다 */
      const dt = Math.max(0.05, (row.wy - prevWy) / Math.max(1, S.speed));
      const span = GAME_CONFIG.playerMoveSpeed * MOVE_RANGE * dt;
      for (let guard = 0; guard < 5; guard++) {
        const free = freeLanes(row.list);
        const next = [];
        for (const [a, b] of reach) {
          for (const [c, d] of free) {
            const lo = Math.max(a - span, c), hi = Math.min(b + span, d);
            if (hi >= lo) next.push([lo, hi]);
          }
        }
        if (next.length) { reach = next; break; }
        let worst = null;
        for (const e of row.list) if (!worst || e.hw > worst.hw) worst = e;
        if (!worst) break;
        row.list.splice(row.list.indexOf(worst), 1);
        const i = S.ents.indexOf(worst);
        if (i >= 0) S.ents.splice(i, 1);
      }
      prevWy = row.wy;
    }
  }

  function stepWorld(dt) {
    const C = GAME_CONFIG;
    /* 속도 — 거리에 따라 오르고 상한에서 멈춘다 */
    const t = clamp(S.dist / C.speedFullAt, 0, 1);
    S.speed = C.baseSpeed + (C.maxSpeed - C.baseSpeed) * t;
    S.scroll += S.speed * dt;
    S.dist += S.speed * dt * C.worldToMeter;

    /* 첫 10초는 대본대로, 그 뒤는 패턴 풀에서 */
    while (S.opening < OPENING.length && S.scroll + REF_H > OPENING[S.opening].at) {
      place(OPENING[S.opening].rows, OPENING[S.opening].at);
      S.opening++;
    }
    if (S.opening >= OPENING.length) {
      if (!S.nextSpawn) S.nextSpawn = S.scroll + 1400;
      while (S.nextSpawn < S.scroll + REF_H * 1.1) {
        const useRisk = S.dist >= C.riskRouteFrom && Math.random() < 0.22;
        const pool = PATTERNS[tier()];
        const n = Math.floor(Math.random() * pool.length);
        S.pattern = useRisk ? "risk" : tier() + "_" + (n + 1);
        place(useRisk ? riskPattern() : pool[n](), S.nextSpawn);
        S.nextSpawn += spawnGap() * rnd(0.9, 1.15);
      }
    }

    /* 움직이는 장애물 */
    for (const e of S.ents) {
      const K = KIND[e.kind];
      if (K.move) {
        e.x += (e.dir || 1) * K.move * dt;
        if (e.x > ROAD - e.hw) { e.x = ROAD - e.hw; e.dir = -1; }
        if (e.x < -ROAD + e.hw) { e.x = -ROAD + e.hw; e.dir = 1; }
      }
      if (e.pop) e.pop = Math.max(0, e.pop - dt * 4);
    }
    /* 지나간 것은 치운다 */
    for (let i = S.ents.length - 1; i >= 0; i--) {
      if (S.ents[i].wy < S.scroll - 400) S.ents.splice(i, 1);
    }
  }

  /* ============================================================
     충돌 — 몸과 햄버거를 따로 본다
     ============================================================ */
  function lossOf(kind) {
    const C = GAME_CONFIG;
    return kind === "weak" ? C.weakCollisionLoss
         : kind === "strong" ? C.strongCollisionLoss
         : C.mediumCollisionLoss;
  }

  function checkHits(dt) {
    const C = GAME_CONFIG;
    const px = S.x * MOVE_RANGE;
    const top = S.layers.length;
    const now = S.dist;

    for (const e of S.ents) {
      const K = KIND[e.kind];
      const rel = e.wy - S.scroll;              // 0 이면 지금 내 자리
      const dx = Math.abs(e.x - px);

      /* ---- 머리 위를 지나가는 것: 몸은 통과, 탑 위쪽만 걸린다 ---- */
      if (K.over) {
        const gap = e.gapLayers || K.gapLayers;
        if (!e.hit && Math.abs(rel) < 60 && dx < (e.hw || K.hw) + PLAYER_HW) {
          e.hit = true;
          const over = top - gap;
          if (over > 0) {
            const n = K.thin ? Math.min(over, 2) : Math.min(over, 5);
            say(K.label + "!", true);
            kickSway(C.collisionKick, S.x > 0 ? -1 : 1);
            dropLayers(n, S.x > 0 ? -1 : 1);
            hitShake(n >= 3 ? "hard" : "soft");
          }
        }
        continue;
      }

      /* ---- 과속방지턱: 피할 수 없다. 튀어오르고 탑이 출렁인다. ---- */
      if (K.bump) {
        if (!e.hit && Math.abs(rel) < 50) {
          e.hit = true;
          S.hopVel = -620;
          kickSway(C.collisionKick * 0.8, Math.random() < 0.5 ? -1 : 1);
          sfx("bump"); buzz(12);
          say("덜컹!");
        }
        continue;
      }

      /* ---- 물웅덩이: 재료를 없애지 않고 조작을 미끄럽게 ---- */
      if (K.slip) {
        if (!e.hit && Math.abs(rel) < 60 && dx < e.hw + PLAYER_HW) {
          e.hit = true;
          S.slipLeft = C.slipTime;
          say("미끄러워!", true);
          buzz(10);
        }
        continue;
      }

      /* ---- 좁은 통로: 벽에 스치면 떨어진다 ---- */
      if (K.wall) {
        const len = e.len || 900;
        if (rel < 40 && rel > -len) {
          const half = e.gapW / 2;
          const lean = topLean();
          /* 몸이 벽에 닿았거나, 탑이 휘어 벽에 닿았거나 */
          const bodyOut = Math.abs(px - e.x) + PLAYER_HW > half;
          const topOut = Math.abs(px + lean - e.x) + 90 > half;
          if ((bodyOut || topOut) && now - S.lastHit > C.hitCooldown) {
            S.lastHit = now;
            const dir = (px + lean > e.x) ? -1 : 1;
            kickSway(C.collisionKick * 0.7, dir);
            dropLayers(C.wallScrapeLoss, dir);
            hitShake("soft");
            say("벽!", true);
          }
          /* 몸은 통로 안으로 밀려 들어간다 */
          if (bodyOut) {
            const want = clamp(px, e.x - half + PLAYER_HW, e.x + half - PLAYER_HW);
            S.x = want / MOVE_RANGE;
          }
        }
        continue;
      }

      /* ---- 재료 획득 ---- */
      if (K.item) {
        if (!e.hit && Math.abs(rel) < 70 && dx < e.hw + PLAYER_HW) {
          e.hit = true; e.taken = true;
          /* 그 자리에서 탑 꼭대기로 날아간다 */
          if (flyTo(e.t, e.x, -(e.wy - S.scroll))) say(ING[e.t].name + " +1");
        }
        continue;
      }

      /* ---- 땅에 놓인 장애물 ---- */
      const reach = e.hw + PLAYER_HW;
      if (!e.hit && Math.abs(rel) < 56 && dx < reach) {
        e.hit = true;
        const dir = (e.x > px) ? -1 : 1;
        const n = lossOf(K.loss);
        kickSway(C.collisionKick, dir);
        say(K.label + "!", true);
        dropLayers(n, dir);
        hitShake(n >= 3 ? "hard" : "soft");
        continue;
      }
      /* ---- 스쳐 지나갔나 (PERFECT) ---- */
      if (!e.hit) {
        if (Math.abs(rel) < 160) e.near = Math.min(e.near, dx - reach);
        if (!e.passed && rel < -60) {
          e.passed = true;
          if (e.near <= C.perfectDistance) perfect();
        }
      }
    }
  }

  function perfect() {
    S.perfect++;
    S.perfectBest = Math.max(S.perfectBest, S.perfect);
    S.perfectHold = 0.9;
    sfx("perfect");
    /* 몇 번 연속하면 재료 한 장 — 보너스는 여기까지다 */
    if (S.perfect % GAME_CONFIG.perfectReward === 0) addLayer(pick(FILLINGS));
  }
  function hitShake(kind) {
    S.shake = GAME_CONFIG.shakeTime;
    S.perfect = 0;
    sfx(kind === "hard" ? "hit_hard" : "hit_soft");
    buzz(kind === "hard" ? 35 : 15);
  }
  function say(text, bad) { S.msg = text; S.msgBad = !!bad; S.msgLeft = 0.9; }

  /* ============================================================
     조작 — 좌우뿐. 포인터(마우스·터치)와 방향키.
     ============================================================ */
  function pos(e) {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  /* 화면 x -> 도로 좌표(-1~1) */
  function toRoad(x) { return clamp((x - W / 2) / (MOVE_RANGE * sc * S.zoom), -1, 1); }

  cv.addEventListener("pointerdown", e => {
    if (S.mode !== "play") return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    S.drag = { x: pos(e).x, from: S.x };
    S.aim = toRoad(pos(e).x);
  }, { passive: false });

  cv.addEventListener("pointermove", e => {
    if (S.mode !== "play" || !S.drag) return;
    e.preventDefault();
    /* 끈 만큼 옮긴다 — 손가락이 가린 자리로 순간이동하지 않게 */
    const d = (pos(e).x - S.drag.x) / (MOVE_RANGE * sc * S.zoom);
    S.aim = clamp(S.drag.from + d * 1.35, -1, 1);
  }, { passive: false });

  const endDrag = () => { S.drag = null; };
  ["pointerup", "pointercancel"].forEach(t => cv.addEventListener(t, endDrag));
  addEventListener("pointerup", endDrag);
  addEventListener("blur", endDrag);

  addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") S.keys.left = true;
    if (e.key === "ArrowRight") S.keys.right = true;
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && S.mode === "play") e.preventDefault();
    if (e.key === "Enter" && S.mode !== "play") start();
  });
  addEventListener("keyup", e => {
    if (e.key === "ArrowLeft") S.keys.left = false;
    if (e.key === "ArrowRight") S.keys.right = false;
  });

  function stepPlayer(dt) {
    const C = GAME_CONFIG;
    if (S.keys.left || S.keys.right) {
      S.aim = clamp(S.aim + (S.keys.right ? 1 : -1) * C.playerMoveSpeed * dt, -1, 1);
    }
    /* 미끄러지는 동안은 느리게 따라붙는다 (관성이 커진다) */
    const ease = S.slipLeft > 0 ? C.slipEase : C.playerEase;
    const vx0 = S.vx;
    S.vx = (S.aim - S.x) * ease;
    S.vx = clamp(S.vx, -C.playerMoveSpeed, C.playerMoveSpeed);
    S.ax = dt > 0 ? (S.vx - vx0) / dt : 0;
    S.x = clamp(S.x + S.vx * dt, -1, 1);
    if (S.slipLeft > 0) S.slipLeft -= dt;

    /* 달리는 상하 흔들림 — 아주 조금만. 햄버거는 한 박자 늦게 따라온다. */
    S.bob = Math.sin(performance.now() / 1000 * RUN_HZ * 6.283) * RUN_BOB;
    S.bobLag += (S.bob - S.bobLag) * Math.min(1, dt * BURGER_LAG);

    /* 과속방지턱에서 튀어오른 높이 */
    if (S.hopVel || S.hop) {
      S.hopVel += 2600 * dt;
      S.hop = Math.min(0, S.hop + S.hopVel * dt);
      if (S.hop >= 0) { S.hop = 0; S.hopVel = 0; }
    }
  }

  /* ============================================================
     그리기
     ============================================================ */
  /* 논리 좌표로 그릴 수 있게 변환을 깐다. 원점은 플레이어 발밑. */
  function world(g) {
    const s = sc * S.zoom;
    /* 그림을 줄여 그리므로 보간을 켠다. 느려지면 프레임이 먼저다. */
    g.imageSmoothingEnabled = true;
    try { g.imageSmoothingQuality = "high"; } catch (_) {}
    const shake = S.shake > 0 ? (Math.random() - 0.5) * GAME_CONFIG.shakeAmp * (S.shake / GAME_CONFIG.shakeTime) : 0;
    g.setTransform(dpr * s, 0, 0, dpr * s,
      dpr * (W / 2 + shake), dpr * (H * GAME_CONFIG.playerY));
  }
  function screenTop() { return -(H * GAME_CONFIG.playerY) / (sc * S.zoom); }
  function screenBottom() { return (H * (1 - GAME_CONFIG.playerY)) / (sc * S.zoom); }

  function roundRect(g, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.lineTo(x + w - rr, y); g.quadraticCurveTo(x + w, y, x + w, y + rr);
    g.lineTo(x + w, y + h - rr); g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    g.lineTo(x + rr, y + h); g.quadraticCurveTo(x, y + h, x, y + h - rr);
    g.lineTo(x, y + rr); g.quadraticCurveTo(x, y, x + rr, y);
    g.closePath();
  }

  /* 도로 — 중앙 플레이 영역과 좌우 경계가 또렷해야 장애물이 묻히지 않는다 */
  function drawRoad(g) {
    const top = screenTop(), bot = screenBottom();
    g.fillStyle = "#8E8E88";
    g.fillRect(-ROAD * 3, top, ROAD * 6, bot - top);
    /* 인도 */
    g.fillStyle = "#C9C5B6";
    g.fillRect(-ROAD * 3, top, ROAD * 3 - ROAD, bot - top);
    g.fillRect(ROAD, top, ROAD * 3, bot - top);
    g.strokeStyle = "#1A1A16"; g.lineWidth = 7;
    g.beginPath();
    g.moveTo(-ROAD, top); g.lineTo(-ROAD, bot);
    g.moveTo(ROAD, top); g.lineTo(ROAD, bot);
    g.stroke();
    /* 가운데 차선 — 아래로 흐르며 전진감을 만든다. 칸 사이를 좁게 두어
       빠를수록 더 빨리 흐르는 것처럼 보이게 한다. */
    const step = 260, len = 150;
    const off = S.scroll % step;
    g.fillStyle = "rgba(255,255,255,.72)";
    for (let y = top - step; y < bot + step; y += step) {
      g.fillRect(-18, y + off, 36, len);
    }
    /* 좌우 경계 안쪽 띠 — 도로 폭이 한눈에 보이게 */
    g.fillStyle = "rgba(255,255,255,.28)";
    for (let y = top - step; y < bot + step; y += step) {
      g.fillRect(-ROAD + 26, y + off, 10, len);
      g.fillRect(ROAD - 36, y + off, 10, len);
    }
  }

  /* 재료 한 장 — 실제 PNG 를 보이는 중심 기준으로 얹는다.
     scale 은 기준 폭 대비 배수, 회전은 보이는 중심을 축으로 돈다. */
  function drawIng(g, t, x, y, scale, rot) {
    if (drawAsset(g, t, x, y + (ING_VISUAL[t] ? ING_VISUAL[t].offsetY : 0),
                  ingW(t) * (scale || 1), "center", rot)) return;
    /* 그림을 못 읽었을 때만 — 게임이 멈추지 않게 도형으로 대신 그린다 */
    drawIngShape(g, t, x, y, scale, rot);
  }
  function drawIngShape(g, t, x, y, scale, rot) {
    const ing = ING[t];
    const w = ing.w * (scale || 1), h = ing.h * (scale || 1);
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.lineWidth = 6; g.strokeStyle = ing.edge; g.fillStyle = ing.fill;
    if (t === "bunTop") {
      g.beginPath();
      g.moveTo(-w / 2, h / 2);
      g.quadraticCurveTo(-w / 2, -h * 0.95, 0, -h * 0.95);
      g.quadraticCurveTo(w / 2, -h * 0.95, w / 2, h / 2);
      g.closePath();
      g.fill(); g.stroke();
      /* 참깨 */
      g.fillStyle = "#FFF3DA";
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.ellipse(i * w * 0.14, -h * 0.42 + Math.abs(i) * 5, 7, 4.5, i * 0.4, 0, 7);
        g.fill();
      }
    } else if (t === "lettuce") {
      /* 물결치는 잎 */
      g.beginPath();
      g.moveTo(-w / 2, 0);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x0 = -w / 2 + (w / n) * i, x1 = -w / 2 + (w / n) * (i + 1);
        g.quadraticCurveTo((x0 + x1) / 2, (i % 2 ? h * 1.1 : -h * 1.1), x1, 0);
      }
      g.lineTo(w / 2, h * 0.5); g.lineTo(-w / 2, h * 0.5);
      g.closePath();
      g.fill(); g.stroke();
    } else if (t === "tomato") {
      g.beginPath(); g.ellipse(0, 0, w / 2, h * 0.62, 0, 0, 7);
      g.fill(); g.stroke();
      g.strokeStyle = "#FFB3A6"; g.lineWidth = 4;
      g.beginPath(); g.ellipse(0, 0, w * 0.3, h * 0.34, 0, 0, 7); g.stroke();
    } else if (t === "cheese") {
      roundRect(g, -w / 2, -h / 2, w, h, 4);
      g.fill(); g.stroke();
      /* 흘러내린 모서리 */
      g.beginPath();
      g.moveTo(-w / 2, h / 2); g.lineTo(-w / 2 + 26, h / 2 + 24); g.lineTo(-w / 2 + 52, h / 2);
      g.moveTo(w / 2, h / 2); g.lineTo(w / 2 - 26, h / 2 + 24); g.lineTo(w / 2 - 52, h / 2);
      g.closePath(); g.fill(); g.stroke();
    } else if (t === "pickle") {
      g.beginPath(); g.ellipse(0, 0, w / 2, h * 0.7, 0, 0, 7);
      g.fill(); g.stroke();
    } else {
      roundRect(g, -w / 2, -h / 2, w, h, t === "patty" ? 10 : 14);
      g.fill(); g.stroke();
    }
    g.restore();
  }

  /* 햄버거 탑 — 층마다 어긋나고 조금씩 기울어 탑이 휘어 보인다.
     모든 층은 같은 중심축(bx)에서 시작하고, 흔들림만 더해진다. */
  function drawBurger(g, bx, by) {
    let ox = 0, h = 0;
    for (let i = 0; i < S.layers.length; i++) {
      const L = S.layers[i];
      const step = stepOf(L.t);
      ox += L.off;
      h += step;
      const pop = L.pop ? 1 + L.pop * 0.22 : 1;
      if (L.pop) L.pop = Math.max(0, L.pop - 0.04);
      drawIng(g, L.t, bx + ox, by - h + step / 2, pop, clamp(L.off * 0.004, -0.2, 0.2));
    }
  }

  /* 캐릭터 — 흑백 선 캐릭터 그림을 '발밑 중앙' 기준으로 얹는다.
     그림은 손을 위로 든 자세고, 그 손 위에 햄버거가 쌓인다. */
  function drawPlayer(g, x, y) {
    if (drawAsset(g, "player", x + PLAYER_VISUAL.offsetX, y + PLAYER_VISUAL.offsetY,
                  PLAYER_VISUAL.width, "bottom", 0)) return;
    drawPlayerShape(g, x, y);
  }
  function drawPlayerShape(g, x, y) {
    g.save();
    g.translate(x, y);
    g.lineWidth = 6; g.strokeStyle = "#1A1A16";
    /* 다리 — 달리는 느낌만 */
    const t = S.mode === "play" ? performance.now() / 90 : 0;
    g.strokeStyle = "#2A2A24"; g.lineWidth = 16; g.lineCap = "round";
    g.beginPath();
    g.moveTo(-20, -60); g.lineTo(-20 + Math.sin(t) * 26, -6);
    g.moveTo(20, -60); g.lineTo(20 - Math.sin(t) * 26, -6);
    g.stroke();
    /* 몸 */
    g.lineWidth = 6; g.strokeStyle = "#1A1A16"; g.fillStyle = "#3C78C8";
    roundRect(g, -46, -150, 92, 96, 18); g.fill(); g.stroke();
    /* 들어올린 팔 */
    g.strokeStyle = "#F3CDA6"; g.lineWidth = 17; g.lineCap = "round";
    g.beginPath();
    g.moveTo(-40, -132); g.lineTo(-52, -196);
    g.moveTo(40, -132); g.lineTo(52, -196);
    g.stroke();
    /* 머리 */
    g.lineWidth = 6; g.strokeStyle = "#1A1A16"; g.fillStyle = "#F7D9B6";
    g.beginPath(); g.ellipse(0, -176, 38, 36, 0, 0, 7); g.fill(); g.stroke();
    /* 눈 — 힘든 표정 */
    g.fillStyle = "#1A1A16";
    g.beginPath(); g.ellipse(-13, -182, 4.5, 5.5, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(13, -182, 4.5, 5.5, 0, 0, 7); g.fill();
    g.strokeStyle = "#1A1A16"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-9, -164); g.quadraticCurveTo(0, -158, 9, -164); g.stroke();
    g.restore();
  }

  /* 접지 그림자 — 높이를 느끼게 한다 */
  function shadow(g, x, y, w, a) {
    g.fillStyle = "rgba(0,0,0," + (a === undefined ? 0.2 : a) + ")";
    g.beginPath(); g.ellipse(x, y, w, w * 0.22, 0, 0, 7); g.fill();
  }

  function drawEnt(g, e) {
    const K = KIND[e.kind];
    const y = -(e.wy - S.scroll);
    if (K.item) {
      if (e.hit) return;
      shadow(g, e.x, y + 26, 40, 0.18);
      g.save();
      g.translate(0, Math.sin(performance.now() / 260 + e.wy) * 8);
      drawIng(g, e.t, e.x, y, PICKUP_SCALE, 0);
      g.restore();
      return;
    }
    if (K.over) {
      /* 머리 위 — 통과 높이(gap)가 판정선이다. 간판 그림의 '아래 끝'을 그 선에
         맞춰 얹어야 보이는 것과 판정이 같아진다. 기둥은 그대로 그린다. */
      const hw = e.hw || K.hw;
      const gap = gapHeight(e.gapLayers !== undefined ? e.gapLayers : K.gapLayers);
      if (K.thin) {
        g.fillStyle = "#3A3A34"; g.strokeStyle = "#1A1A16"; g.lineWidth = 6;
        roundRect(g, e.x - hw, y - gap - 14, hw * 2, 14, 7);
        g.fill(); g.stroke();
        return;
      }
      const th = visHeight("sign", hw * 2) || 78;
      g.fillStyle = "#6B6B62";                     // 기둥 먼저
      g.fillRect(e.x - hw - 14, y - gap - th, 16, gap + th);
      g.fillRect(e.x + hw - 2, y - gap - th, 16, gap + th);
      if (!drawAsset(g, "sign", e.x, y - gap, hw * 2, "bottom", 0)) {
        g.fillStyle = "#C8402F"; g.strokeStyle = "#1A1A16"; g.lineWidth = 6;
        roundRect(g, e.x - hw, y - gap - 78, hw * 2, 78, 6);
        g.fill(); g.stroke();
      }
      return;
    }
    if (K.bump) {
      g.fillStyle = "#F0C21E"; g.strokeStyle = "#1A1A16"; g.lineWidth = 6;
      roundRect(g, -ROAD, y - 22, ROAD * 2, 44, 18); g.fill(); g.stroke();
      g.fillStyle = "#1A1A16";
      for (let i = -3; i <= 3; i++) g.fillRect(i * 110 - 16, y - 22, 32, 44);
      return;
    }
    if (K.slip) {
      g.fillStyle = "rgba(60,120,200,.55)";
      g.strokeStyle = "#2A5A96"; g.lineWidth = 5;
      g.beginPath(); g.ellipse(e.x, y, e.hw, e.hw * 0.42, 0, 0, 7);
      g.fill(); g.stroke();
      return;
    }
    if (K.wall) {
      const len = e.len || 900, half = e.gapW / 2;
      g.fillStyle = "#B4502A"; g.strokeStyle = "#1A1A16"; g.lineWidth = 6;
      g.fillRect(-ROAD, y - len, (e.x - half) + ROAD, len);
      g.strokeRect(-ROAD, y - len, (e.x - half) + ROAD, len);
      g.fillRect(e.x + half, y - len, ROAD - (e.x + half), len);
      g.strokeRect(e.x + half, y - len, ROAD - (e.x + half), len);
      return;
    }
    /* 땅에 놓인 것들 — 그림은 '접지 중앙' 기준이라 바닥선에 딱 붙는다 */
    shadow(g, e.x, y + 8, e.hw * 0.9);
    const vis = OBSTACLE_VISUAL[e.kind];
    if (vis && drawAsset(g, e.kind, e.x + vis.offsetX, y + vis.offsetY, vis.width, "bottom", 0)) {
      if (KIND[e.kind].move) {                     // 어디로 가는지 보이게
        g.fillStyle = "#1A1A16";
        const d = (e.dir || 1);
        g.beginPath();
        g.moveTo(e.x + d * (e.hw + 34), y - e.h * 0.4);
        g.lineTo(e.x + d * (e.hw + 8), y - e.h * 0.4 - 17);
        g.lineTo(e.x + d * (e.hw + 8), y - e.h * 0.4 + 17);
        g.closePath(); g.fill();
      }
      return;
    }
    g.strokeStyle = "#1A1A16"; g.lineWidth = 6;
    if (e.kind === "cone") {
      g.fillStyle = "#F26A1B";
      g.beginPath();
      g.moveTo(e.x, y - e.h); g.lineTo(e.x + e.hw, y); g.lineTo(e.x - e.hw, y);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#FFF";
      g.fillRect(e.x - e.hw * 0.62, y - e.h * 0.45, e.hw * 1.24, 14);
    } else if (e.kind === "bin") {
      g.fillStyle = "#4A8C52";
      roundRect(g, e.x - e.hw, y - e.h, e.hw * 2, e.h, 8); g.fill(); g.stroke();
      g.fillStyle = "#376B3D";
      roundRect(g, e.x - e.hw - 8, y - e.h - 16, e.hw * 2 + 16, 22, 6); g.fill(); g.stroke();
    } else if (e.kind === "box") {
      g.fillStyle = "#C9964E";
      roundRect(g, e.x - e.hw, y - e.h, e.hw * 2, e.h, 6); g.fill(); g.stroke();
      g.strokeStyle = "#8A6224"; g.lineWidth = 7;
      g.beginPath(); g.moveTo(e.x, y - e.h); g.lineTo(e.x, y); g.stroke();
    } else if (e.kind === "bike" || e.kind === "scooter") {
      const sm = e.kind === "scooter";
      g.fillStyle = sm ? "#2F9BB5" : "#E24A8B";
      roundRect(g, e.x - e.hw, y - e.h, e.hw * 2, e.h * 0.56, 10); g.fill(); g.stroke();
      g.fillStyle = "#2A2A24";
      g.beginPath(); g.ellipse(e.x - e.hw * 0.55, y - 16, 22, 22, 0, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(e.x + e.hw * 0.55, y - 16, 22, 22, 0, 0, 7); g.fill(); g.stroke();
      /* 어디로 가는지 보이게 */
      g.fillStyle = "#1A1A16";
      g.beginPath();
      const d = (e.dir || 1);
      g.moveTo(e.x + d * (e.hw + 30), y - e.h * 0.3);
      g.lineTo(e.x + d * (e.hw + 6), y - e.h * 0.3 - 16);
      g.lineTo(e.x + d * (e.hw + 6), y - e.h * 0.3 + 16);
      g.closePath(); g.fill();
    }
  }

  /* 먹은 재료가 탑 꼭대기로 날아가는 중 */
  function drawFlyers(g) {
    const px = S.x * MOVE_RANGE, top = -handY() - stackHeight() + S.bobLag;
    for (const f of S.flyers) {
      const k = clamp(f.life / f.dur, 0, 1);
      const e = 1 - (1 - k) * (1 - k);             // 끝에서 느려진다
      const x = f.x + (px - f.x) * e;
      const y = f.y + (top - f.y) * e;
      drawIng(g, f.t, x, y, PICKUP_SCALE + (1 - PICKUP_SCALE) * e, (1 - e) * 0.6);
    }
  }

  function drawFallen(g) {
    for (const f of S.fallen) {
      /* 그림자로 높이를 느끼게 — 높이 있을수록 작고 옅다 */
      shadow(g, f.x, 30, 26 * clamp(1 - (30 - f.y) / 900, 0.25, 1), 0.14);
      drawIng(g, f.t, f.x, f.y, FALLING_SCALE, f.rot);
    }
  }

  /* 짧은 상태 메시지 / PERFECT */
  function drawMsg(g) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.textAlign = "center"; g.textBaseline = "middle";
    if (S.msg && S.msgLeft > 0) {
      const size = Math.max(14, Math.min(W * 0.05, H * 0.03));
      g.globalAlpha = Math.min(1, S.msgLeft * 3);
      g.font = "800 " + size + "px Pretendard, sans-serif";
      const y = H * 0.9;
      g.lineWidth = Math.max(3, size * 0.3);
      g.strokeStyle = "rgba(255,255,255,.95)";
      g.strokeText(S.msg, W / 2, y);
      g.fillStyle = S.msgBad ? "#DA2B2B" : "#1A1A16";
      g.fillText(S.msg, W / 2, y);
      g.globalAlpha = 1;
    }
    if (S.perfectHold > 0 && S.perfect > 0) {
      const size = Math.max(16, Math.min(W * 0.062, H * 0.038));
      g.globalAlpha = Math.min(1, S.perfectHold * 2);
      g.font = "800 " + size + "px Pretendard, sans-serif";
      const txt = S.perfect > 1 ? "PERFECT x" + S.perfect : "PERFECT!";
      const y = H * 0.3;
      g.lineWidth = Math.max(3, size * 0.28);
      g.strokeStyle = "rgba(255,255,255,.95)";
      g.strokeText(txt, W / 2, y);
      g.fillStyle = "#1C9A46";
      g.fillText(txt, W / 2, y);
      g.globalAlpha = 1;
    }
  }

  /* 디버그 — 판정 영역과 수치 */
  function drawBoxes(g) {
    const px = S.x * MOVE_RANGE;
    g.lineWidth = 4;
    g.strokeStyle = "#00E5FF";
    g.strokeRect(px - PLAYER_HW, -150, PLAYER_HW * 2, 150);
    g.strokeStyle = "#FFEA00";
    const lean = topLean();
    g.strokeRect(px + lean - 90, -stackHeight(), 180, stackHeight());
    g.strokeStyle = "#FF1744";
    for (const e of S.ents) {
      const K = KIND[e.kind], y = -(e.wy - S.scroll);
      if (K.wall) {
        const len = e.len || 900, half = e.gapW / 2;
        g.strokeRect(-ROAD, y - len, (e.x - half) + ROAD, len);
        g.strokeRect(e.x + half, y - len, ROAD - (e.x + half), len);
      } else if (K.over) {
        const gapPx = (e.gapLayers !== undefined ? e.gapLayers : K.gapLayers) * 34;
        g.strokeRect(e.x - (e.hw || K.hw), y - gapPx - 80, (e.hw || K.hw) * 2, 80);
      } else if (K.bump) {
        g.strokeRect(-ROAD, y - 24, ROAD * 2, 48);
      } else {
        g.strokeRect(e.x - e.hw, y - (K.h || 40), e.hw * 2, (K.h || 40));
      }
    }
  }
  /* 그림을 맞출 때만 (DEBUG_ASSET) — 앵커·보이는 영역·판정선 */
  function drawAnchors(g) {
    const px = S.x * MOVE_RANGE, hy = handY();
    g.lineWidth = 3;
    /* 플레이어 앵커(발밑)와 손끝 */
    g.strokeStyle = "#00E5FF";
    g.beginPath(); g.moveTo(px - 60, 0); g.lineTo(px + 60, 0); g.stroke();
    g.strokeStyle = "#76FF03";
    g.beginPath(); g.moveTo(px - 140, -hy); g.lineTo(px + 140, -hy); g.stroke();
    /* 햄버거 중심축과 층마다의 보이는 영역 */
    g.strokeStyle = "rgba(255,234,0,.8)";
    g.beginPath(); g.moveTo(px, -hy); g.lineTo(px, -hy - stackHeight()); g.stroke();
    let ox = 0, h = 0;
    for (const L of S.layers) {
      ox += L.off; h += stepOf(L.t);
      const w = ingW(L.t), vh2 = visHeight(L.t, w);
      g.strokeRect(px + ox - w / 2, -hy - h + stepOf(L.t) / 2 - vh2 / 2, w, vh2);
    }
    /* 장애물 앵커와 간판 판정선 */
    for (const e of S.ents) {
      const K = KIND[e.kind], y = -(e.wy - S.scroll);
      if (K.over) {
        const gap = gapHeight(e.gapLayers !== undefined ? e.gapLayers : K.gapLayers);
        g.strokeStyle = "#FF1744";
        g.beginPath();
        g.moveTo(e.x - (e.hw || K.hw), y - gap); g.lineTo(e.x + (e.hw || K.hw), y - gap);
        g.stroke();
      } else if (OBSTACLE_VISUAL[e.kind]) {
        g.strokeStyle = "#FF9100";
        g.beginPath(); g.moveTo(e.x - 40, y); g.lineTo(e.x + 40, y); g.stroke();
      }
    }
  }

  function drawDebug(g) {
    const rows = [
      "fps: " + S.fps.toFixed(0),
      "distance: " + S.dist.toFixed(1) + "m",
      "speed: " + S.speed.toFixed(0),
      "layers: " + S.layers.length,
      "sway(top): " + topLean().toFixed(0) + " / " + GAME_CONFIG.dropLean,
      "player vx: " + S.vx.toFixed(2) + "  ax: " + S.ax.toFixed(1),
      "difficulty: " + tier(),
      "pattern: " + S.pattern,
      "ents: " + S.ents.length + "  fallen: " + S.fallen.length,
      "zoom: " + S.zoom.toFixed(3),
    ];
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = "600 11px monospace";
    g.textAlign = "left"; g.textBaseline = "top";
    g.fillStyle = "rgba(255,255,255,.88)";
    g.fillRect(4, 4, 182, rows.length * 14 + 8);
    g.fillStyle = "#1A1A16";
    rows.forEach((t, i) => g.fillText(t, 10, 9 + i * 14));
  }

  function render() {
    if (!W || !H) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    world(g);
    drawRoad(g);
    /* 멀리 있는 것부터 */
    const sorted = S.ents.slice().sort((a, b) => b.wy - a.wy);
    for (const e of sorted) drawEnt(g, e);
    const px = S.x * MOVE_RANGE;
    shadow(g, px, 6, 62, 0.22);
    drawPlayer(g, px, S.hop + S.bob);
    /* 햄버거는 캐릭터보다 한 박자 늦게 따라온다 — 딱 붙은 물체로 안 보이게 */
    drawBurger(g, px, -handY() + S.hop + S.bobLag);
    drawFlyers(g);
    drawFallen(g);
    if (DEBUG_COLLISION) drawBoxes(g);
    if (DEBUG_ASSET) drawAnchors(g);
    drawMsg(g);
    if (DEBUG_GAME) drawDebug(g);
  }

  /* ============================================================
     진행
     ============================================================ */
  function step(dt) {
    if (S.mode !== "play") {
      if (S.shake > 0) S.shake -= dt;
      return;
    }
    stepPlayer(dt);
    stepWorld(dt);
    stepSway(dt);
    stepFallen(dt);
    stepFlyers(dt);
    checkHits(dt);
    /* 카메라 — 탑이 높아지면 조금 물러난다 */
    S.zoomTo = 1;
    for (const z of GAME_CONFIG.cameraZoom) {
      if (S.layers.length <= z.upTo) { S.zoomTo = z.scale; break; }
    }
    S.zoomTo = Math.max(GAME_CONFIG.minZoom, S.zoomTo);
    S.zoom += (S.zoomTo - S.zoom) * Math.min(1, dt * GAME_CONFIG.zoomEase);
    if (S.shake > 0) S.shake -= dt;
    if (S.msgLeft > 0) S.msgLeft -= dt;
    if (S.perfectHold > 0) S.perfectHold -= dt;
    paintHud();
  }

  function paintHud() {
    $("distNum").textContent = Math.floor(S.dist);
    $("stackNum").textContent = S.layers.length;
    $("stackBox").classList.toggle("low", S.layers.length <= 3);
  }
  /* 최고 기록 — 거리와 가장 높이 쌓은 층수, 둘만 둔다 */
  function paintBest() {
    const t = S.best + "m" + (S.bestStack ? " · " + S.bestStack + "단" : "");
    $("bestStart").textContent = t;
    $("bestEnd").textContent = t;
  }

  let last = 0, acc = 0, frames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!W || !H) { if (!fitCanvas()) return; }
    const raw = last ? (now - last) / 1000 : 0;
    last = now;
    let dt = Math.min(0.05, raw);                  // 탭 전환 뒤 한 번에 튀지 않게
    /* 마지막 재료가 떨어질 때만 아주 짧게 느려진다 */
    if (S.slowmo > 0) { S.slowmo -= raw; dt *= 0.25; }
    acc += raw; frames++;
    if (acc >= 0.5) { S.fps = frames / acc; acc = 0; frames = 0; }
    step(dt);
    render();
  }
  requestAnimationFrame(frame);

  /* ============================================================
     판 시작 / 끝
     ============================================================ */
  function start() {
    fitCanvas();
    S.mode = "play";
    S.dist = 0; S.scroll = 0; S.speed = GAME_CONFIG.baseSpeed;
    S.x = 0; S.vx = 0; S.ax = 0; S.aim = 0; S.drag = null;
    S.keys.left = S.keys.right = false;
    S.layers = buildBurger(GAME_CONFIG.startBurgerLayers);
    S.fallen.length = 0;
    S.ents.length = 0;
    S.nextSpawn = 0; S.opening = 0;
    S.flyers.length = 0;
    S.bob = 0; S.bobLag = 0;
    S.pattern = "-";
    S.hop = 0; S.hopVel = 0; S.slipLeft = 0; S.shake = 0; S.slowmo = 0;
    S.zoom = 1; S.zoomTo = 1;
    S.msg = ""; S.msgLeft = 0;
    S.perfect = 0; S.perfectBest = 0; S.perfectHold = 0;
    S.got = 0; S.lost = 0; S.maxStack = S.layers.length;
    S.lastHit = -9;
    $("startOver").hidden = true;
    $("endOver").hidden = true;
    paintHud();
  }

  function gameOver() {
    if (S.mode !== "play") return;
    S.mode = "ending";
    S.slowmo = 0.35;                               // 마지막 재료가 떨어지는 순간
    S.shake = GAME_CONFIG.shakeTime;
    S.drag = null;
    sfx("over"); buzz([30, 60, 30]);
    say("배달 실패!", true);
    setTimeout(showResult, 700);
  }

  function gradeFor(m) {
    return GRADES.find(g => m >= g.min) || GRADES[GRADES.length - 1];
  }

  let lastArt = null, lastInfo = null;
  function showResult() {
    if (S.mode !== "ending") return;               // 그 사이에 다시 시작했으면 버린다
    S.mode = "over";
    const m = Math.floor(S.dist);
    const G = gradeFor(m);
    $("resTitle").textContent = "배달 실패!";
    $("finalDist").textContent = m;
    $("gradeLabel").textContent = G.title;
    $("remark").textContent = G.remark;
    $("maxStack").textContent = S.maxStack + "단";
    $("gotCount").textContent = S.got + "개";
    $("lostCount").textContent = S.lost + "개";
    $("perfCount").textContent = S.perfectBest + "회";

    const art = snapPile();
    const box = $("resultArt");
    box.innerHTML = "";
    art.className = "result-egg-cv";
    box.appendChild(art);
    lastArt = art;
    lastInfo = { m, grade: G, stack: S.maxStack };

    if (m > S.best) {
      S.best = m;
      try { localStorage.setItem("ccojik_burgerrun_best", String(m)); } catch (_) {}
    }
    if (S.maxStack > S.bestStack) {
      S.bestStack = S.maxStack;
      try { localStorage.setItem("ccojik_burgerrun_stack", String(S.bestStack)); } catch (_) {}
    }
    paintBest();
    $("endOver").hidden = false;
  }

  /* 무너진 햄버거 — 플레이에 쓴 그림 그대로, 바닥에 흩어진 모습으로 그린다 */
  function snapPile() {
    const c = document.createElement("canvas");
    c.width = 560; c.height = 320;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = true;
    try { g.imageSmoothingQuality = "high"; } catch (_) {}
    g.translate(280, 250);
    const show = Math.min(9, Math.max(3, S.lost));
    for (let i = 0; i < show; i++) {
      const t = i === 0 ? "bunBottom" : (i === show - 1 ? "bunTop" : FILLINGS[i % FILLINGS.length]);
      const x = Math.sin(i * 2.1) * 115;
      const y = -i * 7 - 8;
      g.save();
      g.globalAlpha = 0.25;
      g.fillStyle = "#000";
      g.beginPath(); g.ellipse(x, 16, 58, 11, 0, 0, 7); g.fill();
      g.restore();
      drawIng(g, t, x, y, 0.58, Math.sin(i * 1.7) * 0.5);
    }
    return c;
  }

  /* ============================================================
     결과 공유 — 다른 꼬직 게임과 같은 방식
     ============================================================ */
  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) ||
                (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function canDownload() {
    return !isIOS && typeof document.createElement("a").download !== "undefined";
  }

  function buildCard() {
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1350;
    const g = c.getContext("2d");
    g.fillStyle = "#F6F3E9"; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = "#1A1A16";
    g.fillRect(0, 0, 1080, 18); g.fillRect(0, 1332, 1080, 18);

    g.textAlign = "center"; g.fillStyle = "#1A1A16";
    g.font = "800 62px Pretendard, sans-serif";
    g.fillText("햄버거 안 떨어뜨리고", 540, 150);
    g.fillText("몇 m 가능?", 540, 228);

    if (lastArt) {
      const w = 760, h = lastArt.height / lastArt.width * w;
      g.drawImage(lastArt, 540 - w / 2, 300, w, h);
    }

    const m = lastInfo ? lastInfo.m : 0;
    g.font = "800 230px Pretendard, sans-serif";
    g.fillText(m + "m", 540, 880);
    g.font = "800 54px Pretendard, sans-serif";
    g.fillText("최대 " + (lastInfo ? lastInfo.stack : 0) + "단", 540, 970);
    g.font = "800 72px Pretendard, sans-serif";
    g.fillText(lastInfo ? lastInfo.grade.title : "", 540, 1080);
    g.font = "700 40px Pretendard, sans-serif";
    g.fillStyle = "#7A7A70";
    g.fillText(lastInfo ? lastInfo.grade.remark : "", 540, 1150);
    g.fillStyle = "#1A1A16";
    g.font = "800 44px Pretendard, sans-serif";
    g.fillText("꼬직", 540, 1260);
    return c;
  }

  async function shareResult() {
    const card = buildCard();
    const blob = await new Promise(r => card.toBlob(r, "image/png"));
    if (!blob) return;
    const file = new File([blob], "ccojik-burger-run.png", { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: "꼬직 · 햄버거 배달 런" });
        return;
      }
    } catch (_) {}
    if (canDownload()) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "ccojik-burger-run.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return;
    }
    try {
      await navigator.clipboard.writeText(location.href);
      say("링크를 복사했어요");
    } catch (_) {}
  }

  /* ============================================================
     시작 화면의 햄버거 — 첫 화면부터 높은 탑을 보여 준다
     ============================================================ */
  function drawHero() {
    const c = $("heroCv");
    if (!c) return;
    const g = c.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true;
    try { g.imageSmoothingQuality = "high"; } catch (_) {}
    const layers = buildBurger(GAME_CONFIG.startBurgerLayers);
    let h = 0;
    for (const L of layers) h += stepOf(L.t);
    const s = Math.min(c.width / (BURGER_W * 1.5), c.height / (h + 70));
    g.setTransform(s, 0, 0, s, c.width / 2, c.height - 20);
    g.globalAlpha = 0.22; g.fillStyle = "#000";
    g.beginPath(); g.ellipse(0, 6, BURGER_W * 0.6, 26, 0, 0, 7); g.fill();
    g.globalAlpha = 1;
    let y = 0, ox = 0;
    for (let i = 0; i < layers.length; i++) {
      /* 가만히 있어도 살짝 휜 채로 — '이걸 떨어뜨리지 않는 게임' 임을 알린다 */
      ox += (i / layers.length) * 3.4;
      y += stepOf(layers[i].t);
      drawIng(g, layers[i].t, ox, -y + stepOf(layers[i].t) / 2, 1, ox * 0.004);
    }
  }

  /* ============================================================
     버튼
     ============================================================ */
  $("startBtn").addEventListener("click", () => { if (assetsReady) start(); });
  $("againBtn").addEventListener("click", start);
  $("shareBtn").addEventListener("click", shareResult);

  paintBest();
  paintHud();
  fitCanvas();

  /* 그림이 다 와야 시작할 수 있다. 로딩 화면은 두지 않고 버튼만 잠근다. */
  const btn = $("startBtn");
  btn.disabled = true;
  btn.textContent = "불러오는 중";
  loadAssets(() => {
    btn.disabled = false;
    btn.textContent = "시작하기";
    drawHero();                        // 그림이 온 뒤 다시 그린다
  });

  /* 검사용으로만 들여다본다 */
  window.__burger = () => ({
    S, GAME_CONFIG, ING, GRADES, KIND, PATTERNS, OPENING, SFX,
    DEBUG_GAME, DEBUG_COLLISION, REF_H, ROAD, PLAYER_HW, MOVE_RANGE,
    start, gameOver, showResult, step, render, buildBurger, buildCard,
    dropLayers, addLayer, kickSway, topLean, stackHeight, tier, place,
    ensurePassable, freeLanes, snapPile, shareResult, swayMul, gradeFor,
    ASSETS, BOX, IMGS, ING_VISUAL, OBSTACLE_VISUAL, PLAYER_VISUAL, BURGER_W,
    BURGER_BASE_OFFSET_Y, FALLING_SCALE, PICKUP_SCALE, DEBUG_ASSET,
    handY, gapHeight, stepOf, ingW, visHeight, drawHero, loadAssets,
    ASSET_VERSION, RUN_BOB, RUN_HZ, BURGER_LAG, flyTo, paintBest,
    assetsReady: () => assetsReady,
  });
})();
