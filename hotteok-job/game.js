/* ============================================================
   호떡 알바
   ============================================================
   단계 버튼이 없는 게임이다.

   철판 위의 물건을 직접 집어서 호떡 하나를 만든다. 반죽을 잡아당겨
   떼고, 손으로 눌러 펼치고, 숟가락으로 설탕을 떠 넣고, 가장자리를
   오므리고, 누르개로 꾹 누르고, 뒤집개를 밀어 넣어 뒤집고, 집게로
   들어 접시에 놓는다. 순서를 강제하지 않는다. 기름을 먼저 발라도
   되고 열 번 뒤집어도 된다.

   그래서 상태 머신이 사람의 행동을 막지 않는다. 대신 호떡 자신이
   상태를 들고 있고(HOT), 사람의 행동이 그 숫자를 바꾼다. 결과는
   점수가 아니라 접시에 놓인 호떡의 모양 그 자체다.

   화면에 숫자 게이지가 없다. 익었는지는 색과 거품과 연기와 소리로
   판단한다. 불 세기도 숫자로 쓰지 않고 불꽃 크기로만 보여 준다.

   좌표계는 1080x1920 가상 공간 하나뿐이다. 캔버스를 어떤 크기로
   띄워도 그리기와 터치는 이 좌표로만 이야기한다.

   금지: 외부 라이브러리, 이모지
   ============================================================ */
(() => {
  "use strict";

  const W = 1080, H = 1920;

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const norm01 = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

  /* ============================================================
     조리대 배치 — 도구가 서로 겹치지 않게
     ============================================================ */
  /* ------------------------------------------------------------
     자리 — 전부 배경 사진에서 재서 넣은 값이다 (1080x1920 기준).
     ------------------------------------------------------------
     사진을 비스듬히 찍어서 철판이 원이 아니라 타원으로 보인다.
     그래서 철판 판정도 타원으로 한다 (rx / ry). */
  const LAY = {
    pan:   { x: 533, y: 1014, rx: 338, ry: 228 },   /* 철판 조리면 */
    dough: { x: 150, y: 500,  rx: 160, ry: 140 },   /* 좌상단 반죽 볼 */
    fill:  { x: 881, y: 593,  rx: 150, ry: 100 },   /* 우상단 설탕소 볼 */
    plate: { x: 550, y: 1603, rx: 215, ry: 125 },   /* 하단 중앙 접시 */
    knob:  { x: 540, y: 1367, r: 30 },              /* 철판 아래 가스 노브 */
    /* 반죽판 — 사진에 없다. 뒤쪽 조리대의 반죽통과 설탕통 사이,
       실제 호떡집에서 반죽판을 두는 그 자리에 얹어 그린다.
       여기서는 익지도 눌어붙지도 않는다. 준비는 여유롭게. */
    board: { x: 545, y: 648, rx: 198, ry: 92 },
  };
  /* 반죽이 퍼질 수 있는 한계 — 철판의 82% (명세 2/5) */
  const MAX_R = LAY.pan.rx * 0.82;
  /* 이만큼 얇아져야 '충분히 펼쳐진 반죽' 으로 본다 — 설탕은 그때부터 */
  const FLAT_ENOUGH = 0.62;
  /* 위에서 비스듬히 본 눌림 — 철판 타원과 같은 비율 */
  const SQ = LAY.pan.ry / LAY.pan.rx;

  /* 타원 안인가. k 를 주면 그만큼 넉넉하게 본다. */
  function inZone(z, x, y, k) {
    const m = k === undefined ? 1 : k;
    const dx = (x - z.x) / (z.rx * m), dy = (y - z.y) / (z.ry * m);
    return dx * dx + dy * dy <= 1;
  }
  const inPan = (x, y, k) => inZone(LAY.pan, x, y, k);
  const inBoard = (x, y, k) => inZone(LAY.board, x, y, k);
  /* 철판 안으로 끌어당긴다 (타원 기준) */
  function clampToPan(h) {
    const p = LAY.pan, R = avgR(h);
    const kx = (p.rx - R * 0.9) / p.rx, ky = (p.ry - R * 0.9 * SQ) / p.ry;
    const dx = (h.x - p.x) / (p.rx * kx), dy = (h.y - p.y) / (p.ry * ky);
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      h.x = p.x + (dx / d) * p.rx * kx;
      h.y = p.y + (dy / d) * p.ry * ky;
    }
  }

  /* 반죽판은 철판처럼 꽉 끌어당기지 않는다. 가운데만 판 안에 들어오면
     가장자리가 조금 걸쳐도 그대로 둔다 — 넓게 편 반죽을 억지로
     줄여 앉히면 플레이어가 편 만큼이 지워진다. */
  function clampToBoard(h) {
    const b = LAY.board;
    const dx = (h.x - b.x) / (b.rx * 0.82), dy = (h.y - b.y) / (b.ry * 0.82);
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      h.x = b.x + (dx / d) * b.rx * 0.82;
      h.y = b.y + (dy / d) * b.ry * 0.82;
    }
  }

  /* 도구는 사진 속 제자리에서 집어 든다. 제자리에 있는 동안은 사진이
     보여 주므로 따로 그리지 않고, 집어 들었을 때만 그린다. */
  const TOOLS = [
    { id: "oil",   name: "식용유",     home: { x: 93,  y: 843 },  hit: 115,
      hint: "철판 위에 문질러 기름을 두르세요" },
    { id: "spoon", name: "설탕 숟가락", home: { x: 975, y: 520 },  hit: 110,
      hint: "설탕통 안을 눌러 담고 반죽 가운데에 톡" },
    { id: "press", name: "누르개",      home: { x: 969, y: 1027 }, hit: 118,
      hint: "철판 위 반죽을 꾹 눌러 펴세요" },
    { id: "flip",  name: "뒤집개",      home: { x: 150, y: 1420 }, hit: 125,
      hint: "호떡 아래로 밀어 넣고 휙" },
    { id: "tong",  name: "집게",        home: { x: 967, y: 1587 }, hit: 120,
      hint: "호떡을 집어 접시로" },
  ];
  const TOOL = {};
  for (const t of TOOLS) TOOL[t.id] = t;

  /* 도구마다 '일하는 끝' 이 손잡이에서 얼마나 떨어져 있나 */
  const TIP = {
    oil:   { x: 0, y: -52 },
    /* 손가락이 투입점을 가리면 어디에 들어갈지를 볼 수가 없다.
       숟가락 끝을 손끝보다 한참 위에 두어, 조준 고리가 손가락
       바깥에서 보이게 한다 (390px 화면에서 약 33px 위). */
    spoon: { x: 0, y: -92 },
    press: { x: 0, y: 0 },      /* 누르개는 바닥 전체가 끝 */
    flip:  { x: 0, y: -90 },    /* 날 끝 */
    tong:  { x: 0, y: -76 },
  };

  /* ============================================================
     제원
     ============================================================ */
  const CFG = {
    /* 지름/두께를 cm 로 바꿀 때. 배경 사진의 철판(반지름 320px)을
       지름 26cm 쯤으로 보고 맞췄다 — 잘 편 호떡이 12cm 언저리가 된다. */
    pxPerCm: 24.5,
    tearDist: 148,            /* 반죽통에서 이만큼 끌면 떨어진다 */
    /* 강불에서 1초에 오르는 익힘. 기름 판정이 면 평균으로 바뀌면서
       기름 보정(oilMul)이 덜 깎이게 되어, 같은 시간에 더 익던 것을 되돌렸다. */
    cookRate: 16,
    panLag: 2.6,              /* 철판이 불을 따라가는 느림 */
    /* 이만큼 발라야 안 들러붙는다. 중심 한 점이 아니라 닿는 면 전체의
       평균으로 재기 때문에, 한 점만 보던 때(0.26)보다 낮게 잡는다. */
    oilGood: 0.18,
    oilMax: 140,              /* 기름 자국 개수 상한 */
    hotToTouch: 34,           /* 이보다 익으면 손으로 못 집는다 */
    flickSpeed: 1350,         /* 뒤집기로 보는 속도 (가상 px/s) */
    insertOK: 0.7,            /* 이만큼 넣고 휙 해야 깔끔하게 뒤집힌다 */
    partMax: 240,
    /* 봉합 그림이 갈리는 자리. 이 아래로는 아직 오므리지도 않은 것으로 본다. */
    sealTight: 0.7,
    sealOpen: 0.25,
    /* 속이 다 익었다고 보는 값 — 단면 판정의 1.0.
       원래 "겉은 노릇한데 속은 반죽" 이라고 말하는 선이 core 46 이었다.
       단면 그림의 '정상' 선(0.8)이 바로 그 46 에 떨어지도록 맞춘다.
       안 맞추면 문구는 "익었다" 는데 단면만 설익은 그림이 나온다. */
    coreFull: 57.5,
  };

  /* 나중에 타임어택을 붙일 자리. 0 이면 제한 없음(초기 버전). */
  const MODE = { timeLimit: 0 };

  const KEY = { mute: "hotteokMuted", made: "hotteokMadeCount", last: "hotteokLast",
                skill: "hotteokSkill", dex: "hotteokDex" };

  /* ============================================================
     에셋
     ============================================================
     assets/ 의 원본(1254px, 69MB)은 그대로 두고, 게임은 assets/opt 의
     잘라낸 축소본(1.2MB)만 읽는다. 파일이 하나라도 없으면 그 그림만
     도형으로 대신 그린다 — 깨진 그림은 절대 안 나온다. */
  const ART_DIR = "assets/opt/";
  const ASSET_MAP = {
    stall:     "stall-counter.webp",     /* 배경 — 이 사진이 곧 레이아웃 기준 */
    griddle:   "hotteok_griddle.webp",
    doughBowl: "dough_bowl.webp",
    fillBowl:  "filling_bowl.webp",
    plate:     "serving_plate.webp",

    press:     "hotteok_press.webp",
    spatula:   "spatula.webp",
    tongsOpen: "tongs-open.webp",
    tongsShut: "tongs-closed.webp",
    spoonEmpty:"spoon-empty.webp",
    spoonFull: "spoon-filled.webp",
    oilBottle: "oil_bottle.webp",

    doughPiece:"dough_piece.webp",
    strand:    "dough-sticky-strand.webp",
    stuck:     "dough-stuck.webp",

    flat:      "hotteok-dough-flat.webp",
    flat1:     "hotteok-dough-flattened-01.webp",
    flat2:     "hotteok-dough-flattened-02.webp",
    flat3:     "hotteok-dough-flattened-03.webp",
    flat4:     "hotteok-dough-flattened-04.webp",
    flat5:     "hotteok-dough-flattened-05.webp",
    filled:    "hotteok-dough-filled.webp",
    sealed:    "hotteok-dough-sealed.webp",

    raw:       "hotteok-raw.webp",
    golden:    "hotteok-bottom-golden.webp",
    cooked:    "hotteok-cooked.webp",
    charred:   "hotteok-bottom-burnt.webp",
    burnt:     "hotteok-burnt.webp",
    burst:     "hotteok-burst.webp",

    oilSheen:  "oil-sheen-overlay.webp",
    bubble:    "sugar-bubble.webp",
    caramel:   "sugar-caramelized.webp",
    leak:      "sugar-leak-streak.webp",
  };

  /* ------------------------------------------------------------
     새로 들어온 호떡 상태 그림
     ------------------------------------------------------------
     폴더와 이름은 받은 그대로다. 원본 PNG 도 같은 자리에 함께 두었고,
     게임은 같은 이름의 webp 를 읽는다 — 원본 여덟 장이 18MB 라서
     그대로 받게 하면 이 게임 그림 전부(1.5MB)의 열 배가 넘는다.

     fit 은 '사진 속 호떡 몸통이 잘라낸 상자를 얼마나 채우나' 다.
     시럽이 몸통 밖으로 비어져 나온 그림은 상자가 그만큼 넓어서
     그대로 그리면 몸통이 작아 보인다. 이 값으로 되돌려서, 그림이
     바뀌어도 호떡 크기가 튀지 않게 한다. */
  const HOTTEOK_ART = "assets/hotteok/";
  const HOTTEOK_ASSETS = {
    seal: {
      tight: { key: "sealTight",  file: "state/hotteok-seal-tight.webp",   fit: 1 },
      loose: { key: "sealLoose",  file: "state/hotteok-seal-loose.webp",   fit: 1 },
    },
    tear: {
      light:  { key: "tearLight",  file: "state/hotteok-tear-light.webp",  fit: 1 },
      medium: { key: "tearMedium", file: "state/hotteok-tear-medium.webp", fit: 1 },
      heavy:  { key: "tearHeavy",  file: "state/hotteok-tear-heavy.webp",  fit: 1 },
    },
    cut: {
      raw:     { key: "cutRaw",     file: "result/hotteok-cut-raw.webp" },
      perfect: { key: "cutPerfect", file: "result/hotteok-cut-perfect.webp" },
      burst:   { key: "cutBurst",   file: "result/hotteok-cut-burst.webp" },
    },
  };
  /* 그리는 쪽에서 키 하나로 찾아 쓸 수 있게 펴 둔다 */
  const HOT_ART = {};
  for (const g in HOTTEOK_ASSETS)
    for (const n in HOTTEOK_ASSETS[g]) {
      const e = HOTTEOK_ASSETS[g][n];
      e.group = g; e.name = n;
      HOT_ART[e.key] = e;
    }
  function artFit(key) {
    const e = HOT_ART[key];
    return e && e.fit ? e.fit : 1;
  }
  const IMG = {};
  const MISSING = [];

  function loadAssets(done) {
    /* 원래 쓰던 그림과 새로 들어온 상태 그림을 한 자리에 모아 받는다 */
    const want = [];
    for (const k in ASSET_MAP) want.push([k, ART_DIR + ASSET_MAP[k]]);
    for (const k in HOT_ART) want.push([k, HOTTEOK_ART + HOT_ART[k].file]);
    let left = want.length;
    if (!left) { done(); return; }
    for (const [k, url] of want) {
      const im = new Image();
      im.onload = () => { IMG[k] = im; if (--left === 0) done(); };
      im.onerror = () => {
        /* 어떤 파일이 없는지 반드시 남긴다 */
        MISSING.push(url);
        console.warn("[호떡] 에셋 없음: " + url + " — 도형으로 대신 그린다");
        if (--left === 0) done();
      };
      im.src = url;
    }
  }

  /* 그림 한 장을 중심/너비 기준으로 — 높이는 원본 비율을 지킨다 */
  function art(g, key, cx, cy, w, opt) {
    const im = IMG[key];
    if (!im) return false;
    opt = opt || {};
    const h = w * (im.height / im.width) * (opt.squash === undefined ? 1 : opt.squash);
    g.save();
    if (opt.alpha !== undefined) g.globalAlpha *= opt.alpha;
    g.translate(cx, cy);
    if (opt.rot) g.rotate(opt.rot);
    if (opt.flip) g.scale(-1, 1);
    g.drawImage(im, -w / 2, -h / 2, w, h);
    g.restore();
    return true;
  }

  /* 그림의 어느 점을 집었는지 정해서 놓는다 (도구용) */
  function artAt(g, key, x, y, w, ax, ay, rot, alpha) {
    const im = IMG[key];
    if (!im) return false;
    const h = w * (im.height / im.width);
    g.save();
    if (alpha !== undefined) g.globalAlpha *= alpha;
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.drawImage(im, -ax * w, -ay * h, w, h);
    g.restore();
    return true;
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  };

  /* ============================================================
     소리 — 파일이 없으므로 Web Audio 로 만들어 쓴다
     ============================================================
     지글거림만 계속 울리고(불 세기와 익는 정도에 따라 커진다),
     나머지는 짧게 한 번씩 난다. */
  const SND = {
    ctx: null, master: null, muted: store.get(KEY.mute) === "1",
    sizzleGain: null, noise: null,
  };

  function makeNoise(ctx, sec) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function audioUnlock() {
    if (SND.ctx) { if (SND.ctx.state === "suspended") SND.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = SND.muted ? 0 : 0.85;
      master.connect(ctx.destination);

      /* 지글지글 — 끊김 없는 잡음을 대역통과로 깎아서 */
      const src = ctx.createBufferSource();
      src.buffer = makeNoise(ctx, 2);
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start();

      SND.ctx = ctx; SND.master = master; SND.sizzleGain = g; SND.noise = src;
    } catch (_) {}
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!SND.ctx || SND.muted) return;
    const ctx = SND.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(SND.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, freq, q, vol) {
    if (!SND.ctx || SND.muted) return;
    const ctx = SND.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = makeNoise(ctx, Math.max(0.06, dur));
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(SND.master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  /* 쓰는 소리들 */
  const SFX = {
    tear()  { noiseBurst(0.26, 900, 0.8, 0.3); tone(220, 0.22, "triangle", 0.12, 120); },
    plop()  { tone(150, 0.16, "sine", 0.26, 70); noiseBurst(0.1, 500, 1.2, 0.14); },
    drop()  { tone(110, 0.2, "sine", 0.2, 55); },
    oil()   { noiseBurst(0.22, 5200, 0.6, 0.16); },
    sugar() { for (let i = 0; i < 5; i++) setTimeout(() => tone(rnd(1400, 2600), 0.05, "square", 0.05), i * 26); },
    scoop() { noiseBurst(0.18, 1500, 1.4, 0.14); },
    press() { tone(90, 0.3, "sine", 0.3, 48); noiseBurst(0.18, 700, 0.9, 0.12); },
    creak() { tone(320, 0.14, "sawtooth", 0.05, 260); },
    flip()  { noiseBurst(0.3, 1800, 0.5, 0.22); tone(420, 0.16, "triangle", 0.1, 760); },
    fail()  { tone(170, 0.2, "square", 0.1, 90); noiseBurst(0.22, 400, 0.8, 0.14); },
    tong()  { tone(1800, 0.05, "square", 0.08); setTimeout(() => tone(2100, 0.05, "square", 0.07), 55); },
    clink() { tone(2400, 0.1, "sine", 0.12, 1800); tone(3200, 0.08, "sine", 0.07); },
    seal()  { noiseBurst(0.14, 420, 1.6, 0.12); },
    burst() { noiseBurst(0.4, 320, 0.5, 0.3); tone(80, 0.34, "square", 0.16, 40); },
    knob()  { tone(640, 0.05, "square", 0.06); },
    /* 눌어붙은 것을 억지로 떼는 소리 — 길게 끌리는 저음 */
    stickPull() { noiseBurst(0.38, 240, 1.9, 0.13); tone(145, 0.3, "sawtooth", 0.07, 92); },
    /* 살짝 갈라지는 소리 — 터지는 소리보다 훨씬 작게 */
    tearSmall() { noiseBurst(0.16, 1300, 1.2, 0.1); },
    /* 샌 시럽이 철판에 닿는 소리 */
    syrup() { noiseBurst(0.5, 3200, 0.7, 0.09); },
  };

  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {}
  }

  function track(name) {
    try {
      if (window.SiteAnalytics && window.SiteAnalytics.track)
        window.SiteAnalytics.track(name);
    } catch (_) {}
  }

  /* ============================================================
     호떡 — 상태를 들고 있는 쪽
     ============================================================
     단계가 아니라 숫자다. 사람이 무엇을 하든 이 숫자만 바뀐다. */
  const NA = 44;                    /* 둘레를 44 등분해서 모양을 들고 있는다 */

  function newHotteok(amount, x, y) {
    const rad = new Array(NA);
    for (let i = 0; i < NA; i++) rad[i] = 1 + rnd(-0.035, 0.035);
    return {
      amount,                       /* 반죽 양 0.45 ~ 1.6 */
      x: x, y: y,
      R: 56 + amount * 33.6,        /* 기본 반지름 */
      rad: rad,                     /* 각도별 배율 — 찌그러짐이 여기 남는다 */
      /* 많이 떼면 처음부터 두껍다 — 두꺼우면 속이 안 익는다 */
      thickness: 0.72 + amount * 0.3,

      /* --- 속 --------------------------------------------------
         넣은 양은 사라지지 않는다. 늘 이 식이 성립한다.
           fillPut = filling + fillLoose + leak + fillSpill         */
      filling: 0,                   /* 봉합 안에 남아 있는 양 */
      fillPut: 0,                   /* 지금까지 넣은 총량 */
      fillLoose: 0,                 /* 봉합 밖 — 표면에 얹혀만 있는 양 */
      fillSpill: 0,                 /* 반죽 밖으로 흘린 양 */
      fillSpread: 0,
      bits: [],                     /* 보이는 설탕 입자 */
      sealed: 0,                    /* 0 열림 ~ 1 봉합 */
      sealDirs: [0, 0, 0, 0],       /* 위/오른쪽/아래/왼쪽 — 네 쪽을 다 오므려야 닫힌다 */
      sealMark: [],                 /* 오므린 자리 */

      cookA: 0, cookB: 0,           /* 겉면 — 양면 따로 */
      core: 0,                      /* 속까지 익은 정도 — 두꺼우면 더디다 */
      timeA: 0, timeB: 0,           /* 면별 철판 접촉 시간 */
      lastFlip: -1,                 /* 마지막으로 뒤집은 시각 */
      up: "A",                      /* 지금 위를 보는 면 */
      oil: 0,                       /* 호떡이 받은 기름 */
      contactOil: 0,                /* 지금 바닥면이 깔고 있는 기름 (한 점이 아니라 닿는 면 전체) */
      stick: 0,                     /* 지금 철판에 붙어 있는 정도 — 떼면 내려간다 */

      press: 0,                     /* 누적 압착량 — 줄지 않는다 */
      pressCount: 0,                /* 누른 횟수 (한 번 쥐고 누른 것을 1 로 센다) */
      pressure: 0,                  /* 지금 안에 걸린 압력 — 새어 나가면 내려간다 */
      /* burst 는 '속이 터져 나온 정도' 라서 설탕이 있어야만 오른다.
         반죽 자체가 갈라지는 것은 tear 로 따로 센다. */
      burst: 0, tear: 0, leak: 0, deform: 0, burstSaid: 0, tearMark: 0,
      tearStage: 0,                 /* 0 없음 1 가벼움 2 중간 3 심함 — 내려가지 않는다 */
      leakMarked: 0,                /* 새어 나온 양 중 철판 자국으로 이미 남긴 몫 */
      /* 눌어붙어 뜯긴 자국. 모양에서 다시 계산하는 deform 과 달리
         한 번 생기면 어떤 조작으로도 지워지지 않는다. */
      scar: 0,
      flips: 0,
      flipShock: 0,                 /* 마지막으로 뒤집을 때의 거친 정도 */

      onPan: false, onBoard: false, held: false,
      lift: 0,                      /* 들린 높이 (그림용) */
      flipT: 0,                     /* 뒤집는 중 1 -> 0 */
      wobble: 0,
      insert: 0,                    /* 뒤집개가 들어간 정도 */
      pull: 0,                      /* 떼어 낸 직후 남은 끈적임 — 손을 덜 따라온다 */
      hiss: 0,                      /* 막 올렸을 때 치익 */
      /* 속을 어디에 부었나 — 반죽 반지름을 1 로 본 치우침. 한가운데에
         부으면 0 에 가깝고, 가장자리에 부으면 1 쪽으로 간다. 봉합이
         어려워지고 그쪽 옆구리가 먼저 샌다. */
      fillOffX: 0, fillOffY: 0, fillOff: 0,
      /* --- 손맛을 눈에 보여 주는 값들 (상태가 아니라 신호다) ----
         전부 시간이 지나면 0 으로 돌아간다. 결과에는 쓰이지 않는다. */
      push: null,                   /* 방금 민 방향 */
      sealFlash: 0,                 /* 막 닫혔다 */
      pressRing: 0,                 /* 누르개가 막 닿았다 */
      landT: 0,                     /* 막 착지했다 */
      thickGood: 0,                 /* 알맞은 두께에 처음 들어온 순간 */
      thickSaid: 0,                 /* 그 신호를 이미 줬나 */
      coreSaid: 0,                  /* 속까지 익었다고 이미 알렸나 */
      liftHint: 0,                  /* 들어 올리기까지 얼마나 남았나 */
      insertAng: undefined,         /* 뒤집개 날이 들어온 쪽 */
      /* --- 결과에서 "무엇을 바꾸면 되나" 를 말하려고 남기는 기록 --- */
      weakDir: 0,                   /* 가장 덜 오므린 쪽 (0 위 1 오른쪽 2 아래 3 왼쪽) */
      panOil0: 0,                   /* 철판에 올린 그 순간 깔려 있던 기름 */
      slipFlips: 0,                 /* 덜 넣고 휘둘러 미끄러진 횟수 */
      /* 손으로 빚은 것이라 하나하나 조금씩 다르게 놓인다 */
      spin: rnd(-0.3, 0.3),
      leakSeed: rnd(0, TAU),
    };
  }

  /* 세상 */
  const S = {
    h: null,                        /* 지금 만들고 있는 호떡 (하나) */
    heat: 0.5,                      /* 불 0 ~ 1 */
    panTemp: 0.12,                  /* 철판 온도 — 불을 늦게 따라온다 */
    oils: [],                       /* 철판 기름 자국 */
    mess: [],                       /* 흘린 설탕 / 샌 시럽 / 붙은 자국 */
    parts: [],                      /* 연기 거품 가루 */
    active: null,                   /* 들고 있는 도구 */
    toolPos: {},                    /* 도구가 지금 놓인 자리 */
    spoonLoad: 0,                   /* 숟가락에 담긴 설탕 */
    grab: null,                     /* 진행 중인 조작 */
    hint: "",                       /* 짧은 힌트 한 줄 */
    hintT: 0,
    skill: {},                      /* 해낸 횟수 — 안내를 줄일지 여기로 정한다 */
    saidRound: {},                  /* 이번 판에 이미 한 말 */
    lastTag: "", stuckT: 0,         /* 상태가 멈춰 있나 */
    panRing: null,                  /* 철판에 닿는 순간 퍼지는 김 */
    order: null,                    /* 이번 판의 주문 (첫 판은 없다) */
    orderN: 0,                      /* 주문을 돌아가며 주려고 세는 값 */
    resultStage: 0,                 /* 0 감상 1 결과 전부 */
    orderGlow: 0,                   /* 시작 직후 주문서를 잠깐 밝힌다 */
    goal: null,                     /* 지난 판 결과에서 뽑은 다음 목표 */
    nextGoalId: null,               /* 이번 결과가 권하는 다음 목표 */
    dex: {},                        /* 도감 — 만나 본 호떡 이름 */
    rounds: 0,                      /* 몇 판째인가 — 첫 판에서만 안내한다 */
    done: false,                    /* 접시에 놓았나 */
    result: null,
    elapsed: 0,
    started: false,
    running: false,               /* [시작] 을 누른 뒤부터 만질 수 있다 */
    assetsReady: false,
    toast: "", toastT: 0,
    shake: 0,                       /* 카메라 흔들림 — 큰 파열에만 */
  };
  for (const t of TOOLS) S.toolPos[t.id] = { x: t.home.x, y: t.home.y };

  function resetWorld() {
    S.h = null; S.heat = 0.5; S.panTemp = 0.12;
    S.oils.length = 0; S.mess.length = 0; S.parts.length = 0;
    S.active = null; S.spoonLoad = 0; S.grab = null;
    S.hint = ""; S.hintT = 0; S.done = false; S.result = null;
    S.elapsed = 0; S.toast = ""; S.toastT = 0; S.shake = 0;
    S.panRing = null;
    /* 이번 판에 한 말은 지운다. 다시 떠들기 위해서가 아니라, 아직
       익히지 못한 행동(skill)에서 또 막히면 한 번은 더 도와주기
       위해서다. 이미 두 번 해낸 행동은 skill 쪽에서 막는다. */
    S.saidRound = {};
    S.lastTag = ""; S.stuckT = 0;
    S.rounds++;
    for (const t of TOOLS) S.toolPos[t.id] = { x: t.home.x, y: t.home.y };
  }

  /* ============================================================
     치수 — 숫자 게이지로는 안 보여 주지만 결과에는 쓴다
     ============================================================ */
  function avgR(h) {
    let s = 0;
    for (let i = 0; i < NA; i++) s += h.rad[i];
    return h.R * (s / NA);
  }
  function diameterCm(h) { return (avgR(h) * 2) / CFG.pxPerCm; }
  function thickCm(h) { return 0.85 + h.thickness * 2.45; }
  function cookUp(h) { return h.up === "A" ? h.cookA : h.cookB; }
  function cookDown(h) { return h.up === "A" ? h.cookB : h.cookA; }
  function addCookDown(h, v) { if (h.up === "A") h.cookB += v; else h.cookA += v; }
  function addCookUp(h, v) { if (h.up === "A") h.cookA += v; else h.cookB += v; }

  /* 찌그러진 정도 — 각도별 반지름이 얼마나 들쭉날쭉한가.
     여기에 '뜯긴 자국(scar)' 을 더한다. scar 를 따로 들고 있지 않으면
     이 함수가 돌 때마다 눌어붙어 생긴 손상이 지워져 버린다. */
  function recalcDeform(h) {
    let m = 0;
    for (let i = 0; i < NA; i++) m += h.rad[i];
    m /= NA;
    let v = 0;
    for (let i = 0; i < NA; i++) v += (h.rad[i] - m) * (h.rad[i] - m);
    h.deform = clamp(Math.sqrt(v / NA) / Math.max(0.2, m) + h.scar, 0, 1);
  }
  /* 손상은 모양 계산과 상관없이 쌓인다 */
  function addScar(h, v) {
    h.scar = clamp(h.scar + v, 0, 1);
    recalcDeform(h);
  }

  /* 찢어진 자리를 둘레에서 실제로 파낸다.
     찢어짐을 그림으로 덧대지 않고 모양으로 보여 주는 길이다 —
     파인 만큼 사진이 들어가는 상자가 일그러지고, 한번 파이면 돌아오지 않는다. */
  function tearBite(h, amt) {
    const a0 = rnd(0, TAU);
    const wide = 0.5 + amt * 1.2;
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * TAU;
      const dd = Math.abs(((a - a0 + Math.PI * 3) % TAU) - Math.PI);
      if (dd < wide) h.rad[i] *= 1 - amt * (1 - dd / wide) * rnd(0.7, 1.3);
    }
    recalcDeform(h);
  }
  /* tear 가 한 칸(0.25) 넘어갈 때마다 한 입씩.
     다만 한없이 파내지는 않는다. 계속 파면 호떡이 점점 작아져서,
     "많이 눌러 넓게 편 호떡" 이라는 플레이어의 결과를 게임이 거꾸로
     되돌려 버린다. 여섯 입이면 둘레는 이미 충분히 일그러져 있다. */
  const TEAR_BITES = 6;
  /* 찢김 정도를 그림 세 장에 나누는 칸. 값이 오르내려도 그림은
     한 방향으로만 간다 — 심하게 찢어진 호떡이 저절로 가벼운 찢김으로
     돌아가면 플레이어가 한 일이 지워진다. */
  const TEAR_BANDS = [0.05, 0.3, 0.6];
  function tearStep(h) {
    h.tear = Math.min(h.tear, 3);     /* 숫자가 뜻을 잃을 만큼 커지지 않게 */
    let st = 0;
    for (let i = 0; i < TEAR_BANDS.length; i++) if (h.tear > TEAR_BANDS[i]) st = i + 1;
    if (st > h.tearStage) { h.tearStage = st; SFX.tearSmall(); }
    const step = Math.min(TEAR_BITES, Math.floor(h.tear / 0.25));
    if (step > (h.tearMark || 0)) {
      h.tearMark = step;
      tearBite(h, 0.1);
    }
  }

  /* ------------------------------------------------------------
     속의 보존
     ------------------------------------------------------------
     넣은 양 = 남은 양 + 표면에 얹힌 양 + 새어 나온 양 + 흘린 양.
     어디선가 새면 반드시 남은 양에서 덜어 낸다. 덜어 낼 것이 없으면
     아무 일도 일어나지 않는다 — 그래서 빈 반죽은 샐 수가 없다. */
  function drainFill(h, want) {
    if (!(want > 0)) return 0;
    const have = h.filling + h.fillLoose;
    if (have <= 1e-6) return 0;
    const take = Math.min(want, have);
    /* 표면에 얹혀 있던 것부터 흘러내린다 */
    const fromLoose = Math.min(h.fillLoose, take);
    h.fillLoose -= fromLoose;
    h.filling = Math.max(0, h.filling - (take - fromLoose));
    h.leak += take;
    /* 빠져나간 만큼 압력이 내려가되 조금만 — 많이 깎으면 압력이 터지는
       문턱에 딱 붙어서, 아무리 끓여도 영영 안 터지는 밸브가 된다. */
    h.pressure = Math.max(0, h.pressure - take * 0.35);
    /* 새어 나온 양만큼 철판에 자국을 남긴다 — 운이 아니라 양이 정한다 */
    markLeak(h);
    return take;
  }
  function fillBalance(h) { return h.filling + h.fillLoose + h.leak + h.fillSpill; }
  /* 반죽 양 대비 속의 비율 — 절대량만 보면 큰 반죽이 억울하다 */
  function fillRatio(h) { return (h.filling + h.fillLoose) / Math.max(0.25, h.amount); }
  /* 옆구리에 걸리는 부담은 절대량과 비율을 같이 본다.
     큰 반죽이라고 설탕 한 통이 아무렇지 않을 수 없고,
     작은 반죽에 한 숟갈도 이미 과하다. */
  function fillLoad(h) {
    return (h.filling + h.fillLoose) * 0.6 + fillRatio(h) * 0.6;
  }

  /* 옆구리가 버텨 주는 힘. 잘 오므렸고 두꺼우면 버티고, 아직 생반죽이면 약하다.
     누를 때와 구울 때가 같은 기준을 써야 "봉합을 잘하면 더 잘 버틴다" 가 성립한다. */
  function sealHold(h) {
    const raw = clamp(1 - Math.max(h.cookA, h.cookB) / 55, 0, 1);
    /* 속이 한쪽으로 쏠리면 그쪽 옆구리 살이 얇아져서 먼저 터진다 */
    const lean = clamp(h.fillOff, 0, 1) * 0.35;
    return 0.55 + h.sealed * 1.25 + clamp(h.thickness, 0, 1.2) * 0.3 - raw * 0.2 - lean;
  }
  /* 터진 것을 한 번만 알린다 */
  function announceBurst(h) {
    if (h.burstSaid || h.burst < 0.25) return;
    h.burstSaid = 1;
    /* 터진 자리는 넓게 남는다 — 샌 양이 적어도 터짐 자체가 자국이다 */
    if (h.onPan) for (let i = 0; i < 3; i++) leakBlob(h, LEAK_DROP * 2.5);
    SFX.burst(); buzz(30); toast("옆구리가 터졌다");
    S.shake = 1;
    spawn("syrup", h.x + rnd(-avgR(h), avgR(h)) * 0.85, h.y, 9,
      { sp: 105, r: 7, col: "#7A4512", life: 0.7 });
  }
  /* --- 터지기 전에 알려 주기 ------------------------------------
     압력이 한계를 넘는 순간 갑자기 터지면, 플레이어는 자기가 뭘
     잘못했는지 모른 채 당한다. 넘기 전부터 얼마나 아슬아슬한지를
     형태로 내보낸다 — 숫자나 문구가 아니라 눈으로.
       ~0.35  멀쩡
       ~0.55  한쪽이 볼록
       ~0.70  미세한 금
       ~0.85  틈 + 시럽 비침
       0.85~  큰 파열
     속이 없으면 터질 것이 없으므로 언제나 0 이다. */
  function ruptureRisk(h) {
    if (h.fillPut <= 0.1 || h.filling + h.fillLoose <= 0.02) return 0;
    const hold = Math.max(0.3, sealHold(h));
    const p = clamp(h.pressure / hold, 0, 1.6);
    /* 이미 간 자리가 있으면 그만큼 더 아슬아슬하다 */
    const hurt = clamp(h.tear * 0.5 + h.burst * 0.6, 0, 0.6);
    return clamp(p * 0.72 + hurt, 0, 1.2);
  }
  function riskStage(r) {
    if (r >= 0.85) return 4;
    if (r >= 0.7) return 3;
    if (r >= 0.55) return 2;
    if (r >= 0.35) return 1;
    return 0;
  }

  /* 압력이 한계를 넘은 만큼 옆구리가 간다. 터진 자리로 속도 빠져나간다. */
  function burstBy(h, over, k) {
    if (!(over > 0)) return;
    h.burst = clamp(h.burst + over * k, 0, 2.5);
    drainFill(h, over * k * 0.6);         /* 자국은 drainFill 이 양만큼 남긴다 */
    announceBurst(h);
  }

  /* 철판 기름 — 자국을 쌓고, 그 자리 두께를 물어본다 */
  function paintOil(x, y, r, a) {
    const p = LAY.pan;
    if (!inPan(x, y)) return;
    S.oils.push({ x: x, y: y, r: r, a: a, rot: Math.random() * TAU });
    if (S.oils.length > CFG.oilMax) S.oils.shift();
  }
  function oilAt(x, y) {
    let s = 0;
    for (let i = 0; i < S.oils.length; i++) {
      const o = S.oils[i];
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < o.r) s += o.a * (1 - d / o.r);
    }
    return clamp(s, 0, 2.6);
  }
  /* --- 철판 열 분포 ---------------------------------------------
     불은 철판 가운데 아래에 있다. 가장자리로 갈수록 덜 뜨겁다.
     구석에 밀어 놓고 구우면 그만큼 더디 익는다 — 자리도 플레이어가
     고르는 것이라 결과에 남아야 한다. 0.72 ~ 1.0 사이로만 움직여서
     가장자리에 놓는다고 안 익는 일은 없게 한다. */
  const HEAT_EDGE = 0.72;
  function heatAt(x, y) {
    const p = LAY.pan;
    const dx = (x - p.x) / p.rx, dy = (y - p.y) / p.ry;
    const d = clamp(Math.hypot(dx, dy), 0, 1);
    return lerp(1, HEAT_EDGE, d * d);
  }

  /* 철판에 눌어붙은 설탕 — 그 위에 올라가면 더 달라붙는다. 시럽이
     아래로 들어가면 설탕이 눌어붙는 것은 실제로 그렇다. */
  function sugarAt(x, y) {
    let s = 0;
    for (let i = 0; i < S.mess.length; i++) {
      const m = S.mess[i];
      /* 설탕과 시럽만 — 뜯겨 남은 반죽(stuck)은 끈적이는 것이 아니라
         이미 떨어져 나간 살점이다. 그것까지 세면 한 번 뜯긴 호떡이
         기름을 아무리 둘러도 안 떨어지게 된다. */
      if (m.kind !== "sugar" && m.kind !== "syrup") continue;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < m.r * 2) s += (1 - d / (m.r * 2)) * (0.35 + m.burn * 0.65);
    }
    return clamp(s, 0, 1.5);
  }

  /* 바닥이 닿는 면 전체를 훑는다. 중심 한 점만 보면 가장자리가 바싹
     마른 철판에 놓고도 멀쩡히 익는 일이 생긴다. 평균과 '가장 마른 자리'
     를 같이 돌려준다 — 눌어붙는 것은 제일 마른 쪽부터다.
     열과 설탕도 같은 자리들에서 같이 본다. */
  const CONTACT_N = 8;
  function contactOil(h) {
    const R = avgR(h) * 0.62;
    let sum = oilAt(h.x, h.y), lo = sum, lx = h.x, ly = h.y;
    let hot = heatAt(h.x, h.y), sug = sugarAt(h.x, h.y);
    for (let i = 0; i < CONTACT_N; i++) {
      const a = (i / CONTACT_N) * TAU;
      const x = h.x + Math.cos(a) * R, y = h.y + Math.sin(a) * R * SQ;
      const v = oilAt(x, y);
      sum += v;
      hot += heatAt(x, y);
      sug += sugarAt(x, y);
      if (v < lo) { lo = v; lx = x; ly = y; }
    }
    const n = CONTACT_N + 1;
    return { avg: sum / n, dry: lo, x: lx, y: ly,
             heat: hot / n, sugar: sug / n };
  }

  /* ============================================================
     입자
     ============================================================ */
  function spawn(kind, x, y, n, opt) {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      if (S.parts.length >= CFG.partMax) break;
      const ang = opt.ang === undefined ? rnd(0, TAU) : opt.ang + rnd(-0.6, 0.6);
      const sp = opt.sp === undefined ? rnd(20, 90) : opt.sp * rnd(0.5, 1.4);
      S.parts.push({
        kind: kind, x: x + rnd(-6, 6), y: y + rnd(-6, 6),
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (opt.rise || 0),
        r: (opt.r || 8) * rnd(0.6, 1.4),
        life: 0, max: (opt.life || 0.8) * rnd(0.7, 1.3),
        col: opt.col || null, rot: rnd(0, TAU),
      });
    }
  }

  function stepParts(dt) {
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const p = S.parts[i];
      p.life += dt;
      if (p.life >= p.max) { S.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === "smoke" || p.kind === "steam")
        { p.vy -= 36 * dt; p.vx *= 0.99; p.r += 26 * dt; }
      else if (p.kind === "bubble") { p.vx *= 0.9; p.vy *= 0.9; }
      else { p.vy += 240 * dt; p.vx *= 0.985; }
    }
  }

  /* ============================================================
     굽기 — 철판 위에 있으면 아래쪽 면이 익는다
     ============================================================ */
  function stepCook(dt) {
    const h = S.h;
    /* 철판은 불을 천천히 따라간다 */
    S.panTemp += (S.heat - S.panTemp) * clamp(dt / CFG.panLag, 0, 1);
    /* 뜨거우면 기름이 마른다 */
    if (S.panTemp > 0.35) {
      for (const o of S.oils) o.a -= dt * 0.002 * S.panTemp;
      for (let i = S.oils.length - 1; i >= 0; i--) if (S.oils[i].a <= 0.01) S.oils.splice(i, 1);
    }
    /* 철판에 흘린 것은 타서 어두워진다 */
    for (const m of S.mess) m.burn = clamp(m.burn + dt * 0.1 * S.panTemp, 0, 1);
    S.shake = Math.max(0, S.shake - dt * 4);     /* 0.25초 */
    S.orderGlow = Math.max(0, S.orderGlow - dt * 0.6);   /* 약 1.7초 */

    /* 철판에 닿는 순간 퍼지던 김 */
    if (S.panRing) {
      S.panRing.t -= dt * 1.6;
      if (S.panRing.t <= 0) S.panRing = null;
    }

    if (!h) return;
    /* 눈으로만 쓰는 신호들은 전부 여기서 꺼진다 */
    h.sealFlash = Math.max(0, h.sealFlash - dt * 2.4);
    h.pressRing = Math.max(0, h.pressRing - dt * 3);
    h.landT = Math.max(0, h.landT - dt * 3);
    h.thickGood = Math.max(0, h.thickGood - dt * 1.4);
    if (h.push) { h.push.t -= dt * 3.2; if (h.push.t <= 0) h.push = null; }
    /* 알맞은 두께에 처음 들어온 순간 — 한 번만, 은은하게 알린다.
       "여기서 멈추라" 가 아니라 "여기부터는 호떡 두께다" 다.
       더 눌러도 되고, 더 누르면 기존 로직대로 위험해진다. */
    if (!h.thickSaid) {
      const t = thickCm(h);
      if (t >= 1.9 && t <= 3.3 && h.press > 0.03) {
        h.thickSaid = 1; h.thickGood = 1;
        SFX.knob();
        learn("press");
      }
    }
    h.hiss = Math.max(0, h.hiss - dt);
    h.pull = Math.max(0, h.pull - dt * 1.6);
    if (h.flipT > 0) h.flipT = Math.max(0, h.flipT - dt * 2.2);   /* 약 450ms */
    h.wobble = Math.max(0, h.wobble - dt * 2.2);
    if (!h.onPan || h.held) return;

    /* 닿는 면 전체의 기름을 본다 (한 점이 아니다) */
    const con = contactOil(h);
    h.contactOil = con.avg;
    h.oil = Math.max(h.oil, con.avg);

    /* 기름이 적으면 더디 익고 들러붙는다 */
    const oilMul = con.avg >= CFG.oilGood ? 1 : lerp(0.72, 1, con.avg / CFG.oilGood);
    /* 두꺼우면 겉도 조금 더디다 — 데울 살이 많으니까 */
    const thickMul = lerp(1, 0.62, norm01(h.thickness, 0.3, 1.45));
    /* 철판 어디에 놓았는지 — 구석은 덜 뜨겁다 */
    const d = dt * CFG.cookRate * S.panTemp * oilMul * thickMul * con.heat;
    addCookDown(h, d);
    addCookUp(h, d * 0.1);            /* 여열 */
    /* 면별 접촉 시간 — 언제 뒤집었는지가 여기 남는다 */
    if (h.up === "A") h.timeB += dt; else h.timeA += dt;

    /* 속 익힘 — 겉에서 안으로 들어온다. 두껍거나 속이 많으면 훨씬 더디다.
       그래서 두꺼운 반죽은 겉만 노릇하고 속은 생반죽으로 남는다. */
    const coreMul = lerp(1, 0.34, norm01(h.thickness, 0.3, 1.45));
    const wet = lerp(1, 0.78, clamp(fillRatio(h), 0, 1.2) / 1.2);
    const surf = (h.cookA + h.cookB) * 0.5;
    h.core += clamp((surf - h.core) * dt * 0.5 * coreMul * wet, 0, 99);

    /* --- 속이 익는 것을 밖에서 읽는 길 ---------------------------
       단면은 접시에 담기 전까지 볼 수 없다. 그래서 속이 익을수록
       김이 더 많이 새어 나오게 한다 — 겉색은 다 익었는데 김이 거의
       안 오르면 안쪽이 아직 반죽이라는 뜻이다. 숫자 게이지 대신
       이것으로 읽는다. */
    const cr = coreRatio(h);
    if (cr > 0.2 && Math.random() < cr * cr * 3 * dt * S.panTemp)
      spawn("steam", h.x + rnd(-1, 1) * avgR(h) * 0.55, h.y - 6, 1,
        { sp: 6, rise: 56, r: 9, life: 0.95, col: "rgba(238,233,226,.24)" });
    if (!h.coreSaid && cr >= 0.85) {
      h.coreSaid = 1;
      toast("속까지 열이 들어갔다");
      spawn("steam", h.x, h.y - 10, 6,
        { sp: 12, rise: 70, r: 11, life: 1.1, col: "rgba(244,240,234,.3)" });
    }

    /* 닿는 면 전체의 평균으로 본다 — 가운데만 발라 놓으면 둘레가 마른 채라
       평균이 떨어지고, 그래서 들러붙는다. 자국은 제일 마른 자리에 남는다. */
    const grip = con.avg;
    if (grip < CFG.oilGood && S.panTemp > 0.2)
      h.stick = clamp(h.stick + dt * 0.1 * (1 - grip / CFG.oilGood) * S.panTemp, 0, 1);
    else if (grip > CFG.oilGood * 1.2)
      h.stick = Math.max(0, h.stick - dt * 0.05);   /* 기름이 돌면 덜 붙는다 (찢긴 자국은 그대로) */
    /* 흘린 설탕 위에 앉아 있으면 기름이 있어도 눌어붙는다. 녹은 설탕이
       졸아 붙는 것이라 기름으로는 못 막는다. */
    if (con.sugar > 0.05 && S.panTemp > 0.2)
      h.stick = clamp(h.stick + dt * 0.14 * con.sugar * S.panTemp, 0, 1);

    /* --- 내부 압력 ------------------------------------------------
       속이 녹아 끓으면서 생긴다. 봉합이 단단할수록 더 많이 갇힌다.
       누적 압착량(press)과는 다른 값이다 — 빠져나가면 내려간다. */
    const fr = fillRatio(h);
    if (fr > 0.02) {
      const heat = norm01(cookDown(h) + h.core * 0.5, 20, 90);
      const want = fillLoad(h) * (0.25 + heat * 0.6) * (0.4 + h.sealed * 0.6);
      h.pressure += (want - h.pressure) * clamp(dt * 1.1, 0, 1);
    } else {
      h.pressure = Math.max(0, h.pressure - dt * 0.8);
    }

    if (h.filling + h.fillLoose > 0.02) {
      /* 봉합이 약하면 구우면서 샌다 — 새는 만큼 남은 속이 준다 */
      if (h.sealed < 0.8) {
        const weak = (0.8 - h.sealed) / 0.8;
        const add = dt * 0.085 * weak * (0.4 + fr * 0.6) * S.panTemp;
        drainFill(h, add);
      }
      /* 압력이 옆구리가 버티는 힘을 넘으면 벌어진다 */
      burstBy(h, (h.pressure - sealHold(h)) * dt, 0.9);
      /* 갈라진 반죽으로도 속이 밀려 나온다 */
      if (h.tear > 0.3)
        drainFill(h, dt * (h.tear - 0.3) * 0.25 * S.panTemp);
    }

    /* 눈과 귀로 알 수 있게 — 숫자는 안 보여 준다 */
    const cd = cookDown(h);
    const sz = S.panTemp * (0.45 + con.avg * 0.5);
    if (Math.random() < sz * 10 * dt) {
      const a = rnd(0, TAU), rr = avgR(h) * rnd(0.72, 1.02);
      spawn("bubble", h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr * 0.72, 1,
        { sp: 10, r: 5, life: 0.5, col: "rgba(255,255,255,.75)" });
    }
    /* 연기는 호떡 위에 쌓이지 않고 넓게 퍼져 올라가야 한다. 좁은
       자리에 많이 뿜으면 알파가 겹쳐 검은 원반이 되어 호떡을 가린다.
       타는 것을 알리는 것이 목적이지 가리는 것이 목적이 아니다. */
    if (cd > 86 && Math.random() < (cd > 104 ? 4.5 : 1.8) * dt)
      spawn("smoke", h.x + rnd(-1, 1) * avgR(h) * 0.85, h.y - 10, 1,
        { sp: 8, rise: 74, r: 13, life: 1.5,
          col: cd > 104 ? "rgba(60,52,46,.34)" : "rgba(170,160,150,.28)" });
  }

  /* --- 철판에 남는 시럽 자국 -----------------------------------
     확률에 맡기지 않는다. 새어 나온 양을 세어 두고, 아직 자국으로
     남기지 않은 몫이 한 방울(LEAK_DROP)을 넘을 때마다 그 양에 맞는
     크기로 남긴다. 아주 조금 새면 자국이 없을 수도 있지만,
     중간쯤 새면 반드시 남고, 많이 새면 반드시 크고 여러 개가 된다. */
  const LEAK_DROP = 0.12;

  function leakBlob(h, amt) {
    const k = clamp((amt === undefined ? LEAK_DROP : amt) / LEAK_DROP, 0.6, 3);
    /* 속이 쏠린 쪽으로 샌다. 한가운데 넣었으면 아무 데나. */
    let a = rnd(0, TAU);
    if (h.fillOff > 0.15) {
      const lean = Math.atan2(h.fillOffY, h.fillOffX);
      const tight = clamp(1 - h.fillOff, 0.25, 1);
      a = lean + rnd(-Math.PI, Math.PI) * tight;
    }
    const rr = avgR(h) * rnd(0.95, 1.2);
    S.mess.push({ x: h.x + Math.cos(a) * rr, y: h.y + Math.sin(a) * rr * 0.8,
                  r: rnd(7, 15) * (0.6 + k * 0.45), burn: 0, kind: "syrup",
                  rot: a + rnd(-0.5, 0.5) });
    if (S.mess.length > 80) S.mess.shift();
  }

  function markLeak(h) {
    if (!h.onPan) return;                 /* 철판 밖에 흘린 것은 철판에 안 남는다 */
    let owed = h.leak - h.leakMarked;
    let n = 0;
    while (owed >= LEAK_DROP && n < 6) {
      const amt = Math.min(owed, LEAK_DROP * 2.5);
      h.leakMarked += amt;
      owed -= amt;
      n++;
      leakBlob(h, amt);
      if (n === 1 && S.panTemp > 0.2) SFX.syrup();  /* 뜨거운 철판에 닿아야 소리가 난다 */
    }
  }

  function sizzleLevel() {
    const h = S.h;
    let v = S.panTemp * 0.3;
    if (h && h.onPan && !h.held) v += S.panTemp * (0.45 + Math.min(0.55, h.oil));
    if (h && h.hiss > 0) v += 0.7;
    return clamp(v, 0, 1.5);
  }

  /* ============================================================
     사람이 하는 일
     ============================================================ */
  /* --- 안내는 솜씨를 보고 한다 ---------------------------------
     설명을 한 번 띄웠다는 이유로 "배웠다" 고 치지 않는다. 그 행동을
     실제로 해낸 횟수(learn)를 세어서, 두 번 해낸 뒤부터 그 설명을
     접는다. 접은 뒤에도 같은 자리에서 한참 막히면(stepGuide) 다시
     한 줄 띄운다. 판이 바뀌어도 솜씨는 남는다. */
  const LEARNED = 2;
  function saveSkill() {
    try { store.set(KEY.skill, JSON.stringify(S.skill)); } catch (_) {}
  }
  /* 도감은 로컬에만 둔다. 읽기/쓰기가 막혀 있어도(사생활 보호 모드,
     쿠키 차단) 게임은 그대로 돌아가야 한다 — 그래서 전부 try 안에서
     하고, 실패하면 이번 판에만 남는 셈 친다. */
  function saveDex() {
    try { store.set(KEY.dex, JSON.stringify(S.dex)); } catch (_) {}
  }
  function loadSaved() {
    try {
      const a = JSON.parse(store.get(KEY.skill) || "{}");
      if (a && typeof a === "object") S.skill = a;
    } catch (_) {}
    try {
      const b = JSON.parse(store.get(KEY.dex) || "{}");
      /* 예전 판에서 쓰던 이름이 섞여 있어도 그냥 둔다 — 지우면
         이미 발견한 것이 사라진다. 세는 쪽에서 추린다. */
      if (b && typeof b === "object") S.dex = b;
    } catch (_) {}
  }

  function learn(key) {
    if (!key) return;
    const n = (S.skill[key] || 0) + 1;
    if (n > LEARNED + 1) return;        /* 더 세어 봐야 쓸 데가 없다 */
    S.skill[key] = n;
    saveSkill();
  }
  function knows(key) { return (S.skill[key] || 0) >= LEARNED; }

  function say(text, key) {
    if (!text) return;
    if (key) {
      if (knows(key)) return;
      if (S.saidRound[key]) return;     /* 한 판 안에서 같은 말을 되풀이하지 않는다 */
      S.saidRound[key] = 1;
    }
    S.hint = text; S.hintT = 2.6;
  }
  function toast(text) { S.toast = text; S.toastT = 1.8; }

  /* --- 막혔을 때 다시 돕기 --------------------------------------
     상태가 한동안 그대로면 — 뭘 해야 할지 모르는 것이다. 숙련자라도
     막힐 수 있으므로 솜씨와 상관없이 한 줄 띄운다. 대신 상태가 조금만
     움직여도 타이머가 풀려서, 잘하고 있는 사람은 아무 말도 안 듣는다. */
  const STUCK_SEC = 8;
  function progressTag() {
    const h = S.h;
    if (!h) return "none";
    return [h.onPan ? 1 : 0, h.onBoard ? 1 : 0, h.held ? 1 : 0,
            Math.round(h.thickness * 6), Math.round(h.fillPut * 4),
            Math.round(h.sealed * 4), Math.round(cookDown(h) / 12),
            h.flips, Math.round(S.heat * 5)].join(",");
  }
  function stepGuide(dt) {
    if (S.done || !S.running) return;
    const tag = progressTag();
    if (tag !== S.lastTag) { S.lastTag = tag; S.stuckT = 0; return; }
    S.stuckT += dt;
    if (S.stuckT < STUCK_SEC) return;
    S.stuckT = 0;
    const t = guideText();
    if (t && S.hintT <= 0) { S.hint = t; S.hintT = 2.6; }
  }

  /* --- 반죽 떼기 ------------------------------------------------
     반죽통을 눌러서 끌어당긴다. 끌수록 늘어나고, 오래 잡고 있을수록
     덩어리가 커진다. 일정 거리를 넘으면 뚝 떨어진다. */
  function tearStart(p) {
    S.grab = { kind: "tear", t: 0, x: p.x, y: p.y, amount: 0.5 };
    say("끌어서 떼어내세요", "tear");
  }
  function tearMove(p, dt) {
    const g = S.grab, b = LAY.dough;
    g.x = p.x; g.y = p.y; g.t += dt;
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    /* 오래 잡고 있을수록, 문턱을 넘겨 더 끌수록 큰 덩어리 */
    const br = (b.rx + b.ry) / 2;
    g.amount = clamp(0.45 + g.t * 0.5 + Math.max(0, d - br - CFG.tearDist) / 320, 0.45, 1.6);
    if (d > br + CFG.tearDist) {
      const h = newHotteok(g.amount, p.x, p.y);
      h.held = true; h.lift = 1;
      S.h = h;
      S.grab = { kind: "carry" };
      SFX.tear(); buzz(18);
      learn("tear");
      spawn("crumb", p.x, p.y, 5, { sp: 60, r: 5, col: "#E8D5AC", life: 0.5 });
      S.started = true;
    }
  }

  /* --- 손으로 펼치기 / 오므리기 -------------------------------- */
  function spreadAt(h, p, px, py) {
    const dx = p.x - px, dy = p.y - py;
    const len = Math.hypot(dx, dy);
    if (len < 1.2) return;
    const ang = Math.atan2(p.y - h.y, p.x - h.x);
    const t0 = h.thickness;
    h.thickness = Math.max(0.2, h.thickness - len * 0.00085 - 0.0004);
    /* 민 방향으로 늘어난 자국을 잠깐 남긴다. 숫자를 띄우는 대신
       "지금 이쪽으로 밀렸다" 를 손이 떠난 자리에 보여 준다. */
    h.push = { a: Math.atan2(dy, dx), k: clamp(len / 26, 0.25, 1), t: 1 };
    if (t0 > FLAT_ENOUGH && h.thickness <= FLAT_ENOUGH) learn("spread");
    /* 부피를 지킨다 — 얇아진 만큼 넓어진다 */
    const grow = Math.sqrt(t0 / Math.max(0.2, h.thickness));
    /* 누른 방향으로 더 넓어진다 */
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * TAU;
      let dd = Math.abs(((a - ang + Math.PI * 3) % TAU) - Math.PI);
      const w = 0.15 + 1.6 * Math.max(0, 1 - dd / 1.5);
      h.rad[i] *= 1 + (grow - 1) * w;
    }
    recalcDeform(h);
    if (Math.random() < 0.25) spawn("crumb", p.x, p.y, 1, { sp: 24, r: 3, col: "#EADCBB", life: 0.4 });
  }

  function sealAt(h, p, px, py) {
    const d0 = Math.hypot(px - h.x, py - h.y);
    const d1 = Math.hypot(p.x - h.x, p.y - h.y);
    const inward = d0 - d1;
    if (inward <= 0.6) return;
    const r = avgR(h);
    const add = clamp(inward / r, 0, 0.35) * 0.5;
    const was = h.sealed;
    const ang = Math.atan2(py - h.y, px - h.x);
    /* 어느 쪽을 당겼는지 센다 — 한쪽만 백 번 당겨도 안 닫힌다 */
    const q = (Math.round((ang / TAU) * 4) + 4) % 4;
    h.sealDirs[q] = Math.min(1, h.sealDirs[q] + add * 2);
    let dirs = 0;
    for (const d of h.sealDirs) if (d > 0.3) dirs++;
    /* 속이 한쪽으로 쏠려 있으면 아무리 당겨도 끝까지 안 닫힌다 —
       가장자리에 부은 설탕이 입구에 끼어 있는 셈이다. */
    const cap = 0.25 * dirs * (1 - clamp(h.fillOff - 0.3, 0, 0.5) * 0.5);
    h.sealed = clamp(Math.min(h.sealed + add, cap), 0, 1);
    /* 가장 덜 오므린 쪽 — 결과에서 어느 쪽을 더 모으라고 말하려면
       숫자가 아니라 방향이 있어야 한다 */
    let wq = 0;
    for (let i = 1; i < 4; i++) if (h.sealDirs[i] < h.sealDirs[wq]) wq = i;
    h.weakDir = wq;
    h.sealMark.push({ a: ang, s: add });
    if (h.sealMark.length > 40) h.sealMark.shift();
    /* 오므리면 조금 좁아지고 두꺼워진다 */
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * TAU;
      let dd = Math.abs(((a - ang + Math.PI * 3) % TAU) - Math.PI);
      if (dd < 0.9) h.rad[i] *= 1 - add * 0.5 * (1 - dd / 0.9);
    }
    /* 오므리면 가장자리가 가운데로 모여 조금 두꺼워진다. 다만 '얼마로
       만든다' 가 아니라 '조금 더한다' 여야 한다. 한 값(1.05)으로 모으면
       납작하게 편 반죽과 안 편 반죽이 봉합을 거치는 순간 같아져서,
       플레이어가 편 만큼이 지워진다. 천장은 속을 넣을 때와 같은 1.7. */
    h.thickness = Math.min(1.7, h.thickness + add * 0.25);
    recalcDeform(h);
    /* 닫힌 순간은 분명해야 한다 — 한 번만, 짧게. 그 뒤로는 아무리
       더 당겨도 이 신호가 다시 나오지 않는다. */
    if (was < 0.75 && h.sealed >= 0.75) {
      SFX.seal(); buzz(14);
      h.sealFlash = 1;
      learn("seal");
      toast("잘 오므려졌다");
    } else if (Math.random() < 0.3) SFX.seal();
  }

  /* --- 들고 옮기기 --------------------------------------------- */
  function canHandLift(h) { return Math.max(h.cookA, h.cookB) < CFG.hotToTouch; }

  function placeDown(p) {
    const h = S.h;
    if (!h) return;
    h.held = false; h.lift = 0;
    const onPan = inPan(p.x, p.y, 1.06);
    const onPlate = inZone(LAY.plate, p.x, p.y, 1.1);
    if (onPlate) { finish(); return; }
    if (onPan) {
      const was = h.onPan;
      h.onPan = true; h.onBoard = false;
      /* 가장자리에 걸치면 철판 안으로 당겨 앉힌다 */
      clampToPan(h);
      h.wobble = 1;
      SFX.plop();
      /* --- 철판에 닿는 순간 ---------------------------------------
         준비가 끝나고 조리가 시작되는 지점이다. 여기만큼은 분명해야
         한다 — 치익 소리와 함께 닿은 자리에서 김이 퍼져 나간다. */
      if (!was) {
        h.hiss = 1;
        h.panOil0 = contactOil(h).avg;
        S.panRing = { x: h.x, y: h.y, r: avgR(h) * 0.7, t: 1 };
        learn("pan");
        if (S.panTemp > 0.18) {
          SFX.oil();
          spawn("bubble", h.x, h.y, 14,
            { sp: 70, r: 7, life: 0.6, col: "rgba(255,255,255,.8)" });
          spawn("steam", h.x, h.y - 8, 3,
            { sp: 14, rise: 60, r: 14, life: 1.1, col: "rgba(215,205,190,.3)" });
        } else {
          /* 불이 꺼져 있으면 치익 소리가 날 리 없다. 그 침묵이 곧 신호다. */
          say("불을 올려야 익기 시작합니다", "coldpan");
        }
      } else {
        h.hiss = 0.5;
        spawn("bubble", h.x, h.y, 6, { sp: 50, r: 6, life: 0.5, col: "rgba(255,255,255,.7)" });
      }
    } else {
      h.onPan = false;
      h.onBoard = inBoard(p.x, p.y, 1.1);
      SFX.drop();
      spawn("crumb", h.x, h.y + 14, 7, { sp: 70, r: 4, col: "#D8C9AA", life: 0.5 });
      /* 반죽판은 놓으라고 만든 자리다. 거기 제대로 내려놓은 것을
         '떨어뜨렸다' 고 깎지 않는다. 조리대 아무 데나 던지면 그때는
         조금 일그러진다 — 그래서 반죽판이 쓸모가 생긴다. */
      if (h.onBoard) {
        clampToBoard(h);
        learn("board");
        say("여기서 펴고 속을 넣고 오므리세요", "boarduse");
      } else {
        h.deform = Math.min(1, h.deform + 0.02);
      }
      h.wobble = 1;
    }
  }

  /* --- 누르개 --------------------------------------------------
     닿은 동안 계속 압력이 들어간다. 중심에서 벗어나 누르면 그 쪽만
     얇고 넓어진다. 얇아진 만큼 넓어지게 해서 부피를 지킨다. */
  function pressStep(p, dt) {
    const h = S.h;
    if (!h || h.held) return;
    const R = avgR(h);
    const off = Math.hypot(p.x - h.x, p.y - h.y);
    if (off > R + 76) return;                     /* 안 닿았다 */
    const g = S.grab;
    g.hold = (g.hold || 0) + dt;
    /* 한 번 쥐고 누른 것을 1 로 센다 (누른 총량 press 와는 다른 값) */
    if (!g.sounded) { g.sounded = 1; h.pressCount++; h.pressRing = 1; SFX.press(); }
    const force = clamp(0.8 + g.hold * 0.7, 0, 2.3);
    const sq = force * dt;

    const t0 = h.thickness;
    h.thickness = Math.max(0.1, h.thickness - sq * 0.5);
    let grow = Math.sqrt(t0 / Math.max(0.1, h.thickness));
    /* 철판 안지름의 82% 까지만 퍼진다 (명세 5).
       거기 닿으면 더 안 커지고, 반죽만 조금씩 찢어진다. */
    let capped = false;
    if (R * grow > MAX_R * 0.95) capped = true;
    const bias = clamp(off / Math.max(1, R), 0, 1);
    const ang = off > 3 ? Math.atan2(p.y - h.y, p.x - h.x) : 0;
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * TAU;
      let w = 1;
      if (off > 3) {
        const dd = Math.abs(((a - ang + Math.PI * 3) % TAU) - Math.PI);
        const side = 1 - dd / Math.PI;
        w = lerp(1, 0.2 + 1.6 * side, bias);
      }
      h.rad[i] *= 1 + (grow - 1) * w;
      /* 어느 방향도 한계를 넘지 않는다 */
      if (h.R * h.rad[i] > MAX_R) { h.rad[i] = MAX_R / h.R; capped = true; }
    }
    /* 한계까지 퍼진 뒤에도 계속 누르면 — 더 커질 데가 없으니
       두께로, 모양으로, 찢김으로 간다. 속이 있으면 밀려 나온다. */
    /* 철판 끝에 닿았거나, 더 얇아질 수도 없는데 계속 누르고 있다.
       두께가 바닥이면 grow 가 1 이 되어 위의 계산은 아무것도 하지
       않는다 — 그래서 여기서 따로 받아 준다. 안 그러면 한계에 닿은
       뒤로는 아무리 눌러도 호떡이 꿈쩍도 안 한다. */
    if (capped || h.thickness <= 0.1001) {
      h.tear += sq * 0.5;
      /* 더 퍼질 데가 없다. 미는 힘은 모양으로 간다 — 누른 쪽이 밀려
         나가고 반대쪽이 끌려 들어온다. 방향은 누른 자리가 정한다.
         무작위로 흔들면 "한쪽만 눌렀다" 는 사람의 의도를 덮어써 버린다. */
      /* 밀려 들어오는 쪽에는 바닥을 둔다. 바닥이 없으면 한쪽이 한없이
         깎여 호떡이 사라지고, 반대로 모든 방향을 한계에 딱 붙이면
         누를수록 반듯한 원이 되어 일그러뜨린 솜씨가 지워진다.
         그 사이에서 한쪽으로 치우친 모양으로 수렴한다. */
      const a0 = off > 3 ? ang : rnd(0, TAU);
      const hiR = MAX_R / h.R, loR = hiR * 0.7;
      for (let i = 0; i < NA; i++)
        h.rad[i] = clamp(h.rad[i] * (1 + Math.cos(a0 - (i / NA) * TAU) * sq * 0.3),
                         loR, hiR);
      drainFill(h, sq * 0.3);        /* 빈 반죽은 여기서도 샐 것이 없다 */
    }
    /* 누적 압착량과 지금 안에 걸린 압력은 다른 값이다.
       누른 양은 쌓이기만 하고, 압력은 눌린 속이 빠져나가면 내려간다. */
    h.press += sq;
    g.squash = (g.squash || 0) + (t0 - h.thickness);   /* 이번에 눌러 준 두께 */
    h.wobble = 1;
    recalcDeform(h);

    /* --- 여기서부터는 속이 있을 때만 일어나는 일 ---------------- */
    const inside = h.filling + h.fillLoose;
    if (inside > 0.02) {
      const fr = fillRatio(h);
      const weak = clamp(1 - h.sealed, 0, 1);
      /* 눌러서 걸리는 압력은 속의 비율만큼까지 올라간다 (쌓이기만 하지 않는다) */
      const want = fillLoad(h) * 0.55;
      h.pressure += (want - h.pressure) * clamp(sq * 8, 0, 1);
      /* 헐겁거나 갈라진 곳이 있으면 눌린 속이 그리로 빠져나간다.
         제곱을 쓴다 — 어설프게 오므린 것과 제대로 닫은 것의 차이가 커야 한다. */
      const gap = weak * weak * 0.9 + clamp(h.tear - 0.2, 0, 1) * 0.8;
      if (gap > 0.01) {
        const out = drainFill(h, sq * gap * (0.4 + fr * 0.6));
        /* 한꺼번에 밀려 나오면 그 자리가 터져 벌어진다 */
        if (out > 0) h.burst = clamp(h.burst + out * weak * fr * 0.35, 0, 2.5);
      }
      /* 잘 닫혀 있으면 빠져나갈 데가 없어 압력으로 터진다 */
      burstBy(h, (h.pressure - sealHold(h)) * sq * 2.2, 1);
      announceBurst(h);
    }
    /* 너무 얇아지면 반죽이 갈라진다 — 속과는 상관없다.
       빈 반죽도 여기서 찢어진다. 다만 찢어질 뿐 터지지는 않는다. */
    if (h.thickness < 0.22) h.tear += sq * 1.1;
    tearStep(h);                      /* 찢어진 만큼 둘레를 파낸다 */

    if (Math.random() < 5 * dt) SFX.creak();
    if (g.hold > 0.45 && !g.buzzed) { g.buzzed = 1; buzz(12); }
    if (h.onPan && Math.random() < 14 * dt * S.panTemp)
      spawn("bubble", h.x + rnd(-R, R), h.y + rnd(-R, R) * 0.7, 1,
        { sp: 24, r: 5, life: 0.4, col: "rgba(255,255,255,.8)" });
  }

  /* --- 누르개를 떼었을 때 --------------------------------------
     생반죽은 눌렀다 떼면 조금 돌아온다. 익은 표면은 굳어서 그대로
     남는다. 그래서 덜 익었을 때 아무리 눌러도 잘 안 펴지고, 좀 익은
     뒤에 누르면 누른 만큼 남는다 — 누르는 때가 중요해진다.
     돌아오는 것은 두께뿐이고, 비대칭이나 찢김은 돌아오지 않는다. */
  const DOUGH_ELASTIC = 0.18;
  function pressRelease(g) {
    const h = S.h;
    if (!h || !g || !g.squash) return;
    const cook = norm01(Math.max(cookUp(h), cookDown(h)), 10, 70);
    /* 이미 갈라진 반죽은 돌아올 탄성이 없다 — 종잇장처럼 눌러 놓고
       손을 떼면 도로 도톰해지는 일은 없어야 한다 */
    const whole = 1 - clamp(h.tear, 0, 1);
    const back = g.squash * DOUGH_ELASTIC * (1 - cook) * whole;
    if (back < 0.004) return;
    h.thickness = Math.min(1.7, h.thickness + back);
    /* 두꺼워진 만큼 둘레는 조금 오므라든다 — 부피는 그대로다 */
    const k = 1 / Math.sqrt(1 + back / Math.max(0.1, h.thickness));
    for (let i = 0; i < NA; i++) h.rad[i] *= k;
    h.wobble = 1;
    recalcDeform(h);
  }

  /* --- 뒤집개 --------------------------------------------------
     날 끝이 호떡 아래로 들어간 만큼 insert 가 오른다. 들러붙어
     있으면 잘 안 들어간다. 충분히 넣고 휙 해야 깔끔하게 뒤집힌다. */
  function flipStep(p, dt) {
    const h = S.h;
    if (!h || h.held) return;
    const tip = { x: p.x + TIP.flip.x, y: p.y + TIP.flip.y };
    const R = avgR(h);
    const d = Math.hypot(tip.x - h.x, tip.y - h.y);
    if (d > R * 1.2) { h.insert = Math.max(0, h.insert - dt * 1.6); return; }
    const want = clamp(1 - d / (R * 0.95), 0, 1) * (1 - h.stick * 0.55);
    /* 날이 어느 쪽에서 들어갔나 — 그려 줄 때 쓴다 */
    if (d > 4) h.insertAng = Math.atan2(tip.y - h.y, tip.x - h.x);
    if (want > h.insert) {
      const was = h.insert;
      h.insert = want;
      /* 충분히 걸린 순간 — 호떡이 날 위에 올라앉는다. 여기서부터는
         휘두르면 깔끔하게 넘어간다는 것을 손으로 알 수 있어야 한다. */
      if (was < CFG.insertOK && want >= CFG.insertOK) {
        SFX.press(); buzz(10);
        h.wobble = 0.6;
        say("이제 휙 넘기세요", "flickhint");
      } else if (Math.random() < 0.3) SFX.creak();
    }
    /* 눌어붙어 있으면 날이 더 안 들어간다 — 들어가는 대신 살이 긁힌다 */
    if (h.insert > 0.25 && h.stick > 0.35 && Math.random() < 3 * dt)
      spawn("crumb", tip.x, tip.y, 1, { sp: 30, r: 4, col: "#C79C5C", life: 0.4 });
  }

  function foldDeform(h, amt) {
    const a0 = rnd(0, TAU);
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * TAU;
      const dd = Math.abs(((a - a0 + Math.PI * 3) % TAU) - Math.PI);
      h.rad[i] *= 1 - amt * Math.max(0, 1 - dd / 1.8) * rnd(0.6, 1.2);
    }
    recalcDeform(h);
  }

  /* --- 뒤집으면 좌우가 바뀐다 ----------------------------------
     찌그러진 모양은 그대로 남아야 한다. 다만 뒤집힌 호떡은 아까
     오른쪽이던 쪽이 왼쪽에 온다. 모양을 평평하게 되돌리는 것(=
     플레이어가 만든 것을 지우는 것) 대신, 호떡이 돌아간 축을 기준으로
     거울처럼 뒤집는다. 축은 손이 휘두른 방향에 수직이다.
     들쭉날쭉한 정도는 그대로이므로 deform 값은 변하지 않는다. */
  function mirrorShape(h, ang) {
    const two = 2 * (ang + Math.PI / 2);          /* 반사 축의 두 배 각 */
    const wrap = (v, m) => ((v % m) + m) % m;
    const src = h.rad.slice();
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * TAU;
      h.rad[i] = src[wrap(Math.round(((two - a) / TAU) * NA), NA)];
    }
    /* 오므린 자리 */
    for (const m of h.sealMark) m.a = two - m.a;
    /* 네 쪽 봉합 — 축에 따라 어느 쪽과 어느 쪽이 자리를 바꾸는지 다르다 */
    const sd = h.sealDirs.slice();
    for (let q = 0; q < 4; q++)
      h.sealDirs[wrap(Math.round(((two - q * (Math.PI / 2)) / TAU) * 4), 4)] = sd[q];
    /* 보이는 설탕 입자. dy 는 이미 눌린(SQ) 좌표라서 풀었다가 다시 누른다 */
    const c = Math.cos(two), s = Math.sin(two);
    for (const b of h.bits) {
      const dx = b.dx, dy = b.dy / 0.8;
      b.dx = c * dx + s * dy;
      b.dy = (s * dx - c * dy) * 0.8;
    }
    h.spin = -h.spin;
    recalcDeform(h);
  }

  /* 눌어붙은 것을 억지로 떼어 낼 때 — 손이든 집게든 뒤집개든 같은 길로 보낸다.
     어느 한 도구로만 멀쩡히 빠져나가면 눌어붙음이 의미를 잃는다.
     k 는 도구가 얼마나 거칠게 떼었나 (뒤집개는 덜 넣을수록 크다). */
  function tearOffPan(h, k) {
    if (h.stick <= 0.12) return 0;
    const raw = clamp(1 - cookDown(h) / 55, 0, 1);    /* 생반죽일수록 잘 뜯긴다 */
    const thin = clamp(1 - h.thickness / 0.9, 0, 1);  /* 얇을수록 잘 뜯긴다 */
    const hurt = h.stick * (0.5 + raw * 0.5 + thin * 0.4) * (k === undefined ? 1 : k);
    addScar(h, hurt * 0.2);
    h.tear += hurt * 0.35;
    tearStep(h);
    drainFill(h, hurt * 0.08);                        /* 속이 있을 때만 샌다 */
    /* 호떡 밑이 아니라 반쯤 비껴난 자리에 남긴다 — 밑에 깔리면 안 보인다 */
    const ma = rnd(0, TAU), mr = avgR(h) * 0.55;
    S.mess.push({ x: h.x + Math.cos(ma) * mr, y: h.y + Math.sin(ma) * mr * SQ,
                  r: avgR(h) * (0.3 + clamp(hurt, 0, 1) * 0.2),
                  burn: 0.3, kind: "stuck", rot: rnd(0, TAU) });
    if (S.mess.length > 80) S.mess.shift();
    spawn("crumb", h.x, h.y, 4, { sp: 50, r: 4, col: "#D8C9AA", life: 0.5 });
    if (hurt > 0.05) SFX.stickPull();
    /* 떼어 낸 뒤에도 잠깐은 손을 안 따라온다 — 늘어났다가 돌아온다 */
    h.pull = Math.max(h.pull, h.stick);
    h.stick *= 0.35;
    return hurt;
  }

  /* --- 눌어붙은 것을 끌 때 -------------------------------------
     포인터와 호떡을 1:1 로 붙여 놓으면, 달라붙었다는 사실이 손에
     전혀 전해지지 않는다. 붙은 만큼 덜 따라오게 해서 끈적임을
     조작감으로 알린다. 숫자나 문구로 알리지 않는다. */
  function moveRatio(h) {
    const s = Math.max(h.onPan ? h.stick : 0, h.pull);
    return clamp(1 - s * 0.75, 0.25, 1);
  }
  function dragHot(h, x, y) {
    const k = moveRatio(h);
    h.x += (x - h.x) * k;
    h.y += (y - h.y) * k;
  }

  function doFlip(ang, sp) {
    const h = S.h;
    if (!h) return;
    const ins = h.insert;
    h.flips++;
    h.flipT = 1;
    /* 얼마나 거칠게 휘둘렀나. 1 = 간신히 뒤집히는 속도 */
    h.flipShock = clamp((sp === undefined ? CFG.flickSpeed : sp) / CFG.flickSpeed, 0, 3);
    /* 뒤집히면 모양은 남고 좌우만 바뀐다 */
    const swap = () => { h.up = h.up === "A" ? "B" : "A"; mirrorShape(h, ang); };

    if (ins >= CFG.insertOK) {
      swap();
      h.spin = rnd(-0.3, 0.3);
      /* 거칠게 휘두르면 더 멀리 떨어진다 */
      const far = 8 * (1 + h.flipShock * 0.6);
      h.x += Math.cos(ang) * far; h.y += Math.sin(ang) * far;
      h.deform = Math.min(1, h.deform + 0.012);
      h.landT = 1;
      learn("flip");
      SFX.flip(); buzz(14);
    } else if (ins >= 0.3) {
      swap();
      foldDeform(h, 0.42);
      /* 접히면서 속이 밀려 나온다 — 속이 있을 때만 */
      drainFill(h, 0.1);
      h.tear += 0.05;
      tearStep(h);
      h.x += Math.cos(ang) * 44; h.y += Math.sin(ang) * 44;
      SFX.fail(); toast("반쯤 접혔다");
    } else {
      h.x += Math.cos(ang) * 74; h.y += Math.sin(ang) * 74;
      foldDeform(h, 0.14);
      h.slipFlips++;
      SFX.fail(); toast("덜 넣고 휙 했다");
      say("아래로 더 밀어 넣어 보세요", null);
    }

    /* 들러붙은 채로 떼면 살이 뜯긴다.
       덜 넣고 들쑤실수록, 아직 생반죽일수록, 얇을수록 더 뜯긴다.
       그리고 거칠게 휘두를수록 더 뜯긴다 — 붙은 정도 x 뒤집기 충격. */
    if (h.stick > 0.35) {
      tearOffPan(h, (1 - ins * 0.5) * (0.55 + h.flipShock * 0.5));
      toast("철판에 붙었다");
    }
    if (h.flips > 4) addScar(h, 0.012);

    h.insert = 0;
    h.wobble = 1;
    /* 철판 밖으로 밀려나면 철판에서 내려온다 */
    if (!inPan(h.x, h.y, 1.1)) { h.onPan = false; SFX.drop(); }
    else clampToPan(h);
    recalcDeform(h);
  }

  /* --- 집게 ---------------------------------------------------- */
  function tongGrab(p) {
    const h = S.h;
    if (!h) return false;
    const g = { x: p.x + TIP.tong.x, y: p.y + TIP.tong.y };
    if (Math.hypot(g.x - h.x, g.y - h.y) > avgR(h) * 1.3) return false;
    h.held = true; h.lift = 1;
    /* 집게라고 눌어붙음을 비껴가지 않는다 */
    if (h.onPan && tearOffPan(h, 0.8) > 0) toast("철판에 붙었다");
    h.onPan = false; h.onBoard = false;
    SFX.tong(); buzz(10);
    learn("tong");
    return true;
  }

  /* --- 설탕 숟가락 --------------------------------------------- */
  function scoopStep(dt) {
    const was = S.spoonLoad;
    S.spoonLoad = clamp(S.spoonLoad + dt * 1.15, 0, 1.5);
    if (Math.random() < 4 * dt) SFX.scoop();
    if (was < 0.5 && S.spoonLoad >= 0.5) learn("scoop");
    if (was < 1.5 && S.spoonLoad >= 1.5) toast("숟가락이 넘친다");
  }

  function dumpFilling(p) {
    const h = S.h;
    if (S.spoonLoad <= 0.02) { say("설탕통 안을 눌러 담으세요", "scoop"); return; }
    const onDough = h && !h.held && Math.hypot(p.x - h.x, p.y - h.y) < avgR(h) * 1.25;
    /* 순서를 막지 않는다. 덜 편 반죽에도, 철판 밖 반죽에도 부을 수 있다.
       대신 그 결과(두꺼워짐 / 가장자리로 흘러내림)가 그대로 남는다. */
    const load = S.spoonLoad;
    S.spoonLoad = 0;
    if (onDough) {
      const R = Math.max(1, avgR(h));
      /* 가운데를 벗어나 부으면 그만큼 반죽 밖으로 흘러내린다 */
      const off = Math.hypot(p.x - h.x, p.y - h.y) / R;
      const spill = load * clamp((off - 0.55) / 0.7, 0, 0.6);
      const got = load - spill;

      /* 어디에 부었는지를 남긴다. 여러 번 부으면 넣은 양으로 가중한
         평균 — 한가운데 한 번 + 가장자리 한 번이면 그 사이가 된다. */
      if (got > 0.01) {
        const was = Math.max(0, h.filling + h.fillLoose);
        const w = was + got;
        h.fillOffX = (h.fillOffX * was + ((p.x - h.x) / R) * got) / w;
        h.fillOffY = (h.fillOffY * was + ((p.y - h.y) / (R * SQ)) * got) / w;
        h.fillOff = clamp(Math.hypot(h.fillOffX, h.fillOffY), 0, 1.4);
      }

      h.fillPut += load;
      h.fillSpill += spill;
      /* 이미 닫힌 호떡에는 순간이동하듯 들어가지 않는다.
         봉합된 만큼은 표면에 쌓이고, 그 무게로 봉합이 헐거워진다. */
      const open = clamp(1 - h.sealed, 0, 1);
      const inAmt = got * open;
      const onTop = got - inAmt;
      h.filling += inAmt;
      h.fillLoose += onTop;
      if (onTop > 0.02) {
        h.sealed = clamp(h.sealed - onTop * 0.4, 0, 1);
        for (let i = 0; i < 4; i++)
          h.sealDirs[i] = Math.min(h.sealDirs[i], h.sealed + 0.2);
        toast("봉합 위에 쌓였다");
      }
      /* 속이 들어간 만큼 부푼다 — 절대량이 아니라 반죽 양 대비 비율로 */
      const ratio = got / Math.max(0.25, h.amount);
      h.thickness = Math.min(1.7, h.thickness + ratio * 0.2);
      const grow = 1 + ratio * 0.05;
      for (let i = 0; i < NA; i++) {
        h.rad[i] *= grow;
        if (h.R * h.rad[i] > MAX_R) h.rad[i] = MAX_R / h.R;
      }
      recalcDeform(h);

      if (got > 0.05) learn("fill");
      h.fillSpread = clamp(h.fillSpread + got * 0.5, 0, 1);
      const n = Math.round(6 + got * 14);
      /* 부은 자리에 쌓인다 — 한가운데 부으면 가운데, 가장자리에 부으면
         그쪽으로. 눈으로 어디에 넣었는지가 보여야 한다. */
      const cx = h.fillOffX * R, cy = h.fillOffY * R * 0.8;
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU);
        const r = Math.sqrt(Math.random()) * R * 0.5 * (0.5 + h.fillSpread);
        h.bits.push({ dx: cx + Math.cos(a) * r, dy: cy + Math.sin(a) * r * 0.8,
                      r: rnd(3, 7) });
      }
      if (h.bits.length > 90) h.bits.splice(0, h.bits.length - 90);
      if (spill > 0.02) {
        const m = Math.round(2 + spill * 6);
        for (let i = 0; i < m; i++) {
          const a = rnd(0, TAU), rr = R * rnd(1, 1.25);
          S.mess.push({ x: h.x + Math.cos(a) * rr, y: h.y + Math.sin(a) * rr * SQ,
                        r: rnd(5, 10), burn: 0, kind: "sugar", rot: rnd(0, TAU) });
        }
        if (S.mess.length > 80) S.mess.splice(0, S.mess.length - 80);
        toast("가장자리로 흘렀다");
      }
      SFX.sugar();
      spawn("sugar", p.x, p.y, 7, { sp: 40, r: 4, col: "#6B3F16", life: 0.5 });
    } else {
      /* 철판이나 조리대에 흘렸다 */
      const n = Math.round(3 + load * 5);
      for (let i = 0; i < n; i++)
        S.mess.push({ x: p.x + rnd(-26, 26), y: p.y + rnd(-18, 18),
                      r: rnd(5, 11), burn: 0, kind: "sugar", rot: rnd(0, TAU) });
      if (S.mess.length > 80) S.mess.splice(0, S.mess.length - 80);
      SFX.sugar();
      spawn("sugar", p.x, p.y, 6, { sp: 60, r: 4, col: "#6B3F16", life: 0.5 });
      toast("설탕을 흘렸다");
    }
  }

  /* --- 기름 솔 -------------------------------------------------- */
  function oilStep(p, q) {
    const pan = LAY.pan;
    const g = S.grab;
    /* 문지른 길이만큼만 발린다. 한 자리에 들고 있어도 쌓이지 않는다. */
    const last = g.oilAt || (g.oilAt = { x: p.x, y: p.y });
    const moved = Math.hypot(p.x - last.x, p.y - last.y);
    if (moved < 20) return;
    const n = clamp(Math.round(moved / 20), 1, 10);
    let any = false;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const hx = lerp(last.x, p.x, t) + TIP.oil.x;
      const hy = lerp(last.y, p.y, t) + TIP.oil.y;
      if (!inPan(hx, hy)) continue;
      paintOil(hx, hy, 58, 0.085);
      any = true;
    }
    g.oilAt = { x: p.x, y: p.y };
    if (!any) return;
    const head = { x: p.x + TIP.oil.x, y: p.y + TIP.oil.y };
    g.oilT = (g.oilT || 0) + 1;
    if (g.oilT % 6 === 1) {
      SFX.oil();
      if (S.panTemp > 0.3)
        spawn("bubble", head.x, head.y, 2,
          { sp: 30, r: 4, life: 0.35, col: "rgba(255,255,255,.6)" });
    }
    if (!g.oiled && oilAt(head.x, head.y) >= CFG.oilGood) { g.oiled = 1; learn("oil"); }
    const h = S.h;
    if (h && !h.held && Math.hypot(head.x - h.x, head.y - h.y) < avgR(h))
      h.oil = Math.min(2.4, h.oil + 0.02);
  }

  /* ============================================================
     결과 — 점수가 아니라 접시에 놓인 호떡 그 자체
     ============================================================
     가장 크게 어긋난 한 가지만 짚어 준다. 전부 알려 주면 다음 판에
     스스로 고쳐 볼 것이 없어진다. */
  /* --- 단면 -----------------------------------------------------
     어느 그림을 보여 줄지는 실제 상태가 정한다. 그림이 상태를 정하는
     일은 없다. 겹칠 수 있으니 순서를 못박는다: 터짐 > 설익음 > 정상.
     속을 넣은 적이 없으면 아무 그림도 쓰지 않는다 — 가진 단면 그림
     셋이 모두 갈색 속을 보여 주기 때문이다. */
  function coreRatio(h) { return clamp(h.core / CFG.coreFull, 0, 1); }
  function cutOf(h) {
    if (h.fillPut <= 0.1) return null;
    if (h.burst >= 0.5 || h.tear >= 0.65 || h.leak >= 0.8) return "burst";
    const core = coreRatio(h);
    if (core >= 0.8 && h.tear < 0.3 && h.burst < 0.2 && h.filling >= 0.35)
      return "perfect";
    return "raw";
  }
  const CUT_KEY = { raw: "cutRaw", perfect: "cutPerfect", burst: "cutBurst" };
  /* 단면 설명도 두세 가지. 두 줄을 넘기지 않는다. */
  const CUT_LINE = {
    raw: ["겉은 괜찮아 보여도 중심 반죽은 아직 덜 익었습니다.",
          "가운데가 하얗게 남았어요. 열이 속까지 못 갔습니다.",
          "조금만 더 구웠다면 속까지 딱 좋았을 거예요."],
    perfect: ["겉은 노릇하고 속까지 고르게 익었어요.",
              "속이 알맞게 차고 반죽도 잘 익었습니다.",
              "단면이 깔끔해요. 잘 만든 호떡입니다."],
    burst: ["달콤한 속이 많이 새어나가 안쪽 분포도 고르지 않습니다.",
            "터진 자리로 속이 빠져나가 가운데가 비었어요.",
            "속이 흘러나와서 남은 양이 많지 않습니다."],
  };

  /* ============================================================
     결과 리포트
     ============================================================
     한 문장을 if/else 로 고르지 않는다. 항목마다 '지금 어느 칸인가' 를
     먼저 정하고, 그 칸에 딸린 표현 가운데 하나를 고른다. 그래서 같은
     호떡이라도 말투는 달라지지만, 칸이 곧 실제 상태라서 없는 문제를
     지어내는 일은 구조적으로 일어나지 않는다. */

  function lvRip(h) {
    if (h.fillPut > 0.1 && (h.burst >= 0.5 || h.leak >= 0.8)) return "heavy";
    if (h.tear >= 0.65) return "heavy";
    if (h.fillPut > 0.1 && (h.burst >= 0.2 || h.leak >= 0.3)) return "medium";
    if (h.tear >= 0.3) return "medium";
    if (h.tear > 0.05) return "light";
    return "none";
  }
  function lvStick(h) {
    if (h.stick >= 0.55 || h.scar >= 0.4) return "bad";
    if (h.stick >= 0.25 || h.scar >= 0.15) return "some";
    return "ok";
  }
  function lvCore(h) {
    const c = coreRatio(h);
    if (c < 0.4) return "veryLow";
    if (c < 0.8) return "low";
    if (c >= 1.5) return "over";
    return "ok";
  }
  function lvCook(h) {
    const hi = Math.max(h.cookA, h.cookB), lo = Math.min(h.cookA, h.cookB);
    if (lo > 104) return "overBoth";
    if (hi > 104) return "overOne";
    if (hi - lo > 45) return "uneven";
    if (lo < 44) return "underOne";
    return "good";
  }
  /* 사람에게 말해 줄 때는 '지금 들어 있는 양' 으로 센다.
     터질 위험을 재는 fillLoad 는 반죽 양 대비 비율까지 섞은 값이라
     옆구리가 버티는 힘을 볼 때만 쓴다 — 둘을 섞으면 한 숟갈 넣은
     호떡에게 "많이 넣었다" 고 하게 된다. */
  function fillHeld(h) { return h.filling + h.fillLoose; }
  function lvFill(h) {
    if (h.fillPut <= 0.1) return "none";
    const a = fillHeld(h);
    if (a < 0.6) return "low";
    if (a > 1.6) return "over";
    if (a > 1.2) return "high";
    return "ok";
  }
  function lvSeal(h) {
    if (h.fillPut <= 0.1) return "na";
    if (h.sealed >= 0.75) return "good";
    if (h.sealed >= 0.4) return "mid";
    return "bad";
  }
  /* 정답 두께를 하나로 못 박지 않는다. 얇게 눌러 바삭한 것과 도톰하게
     남겨 쫀득한 것은 둘 다 제대로 만든 호떡이다. 재어 보니 상하지 않고
     만들 수 있는 두께가 2.2~3.4cm 인데 '적정' 을 1.62~2.75 로 잡아 두어,
     잘 만든 도톰한 호떡이 늘 감점되고 있었다. 실제로 도달할 수 있는
     범위에 맞춰 넓혔다. 그 바깥은 여전히 지적한다. */
  function lvPress(h) {
    const t = thickCm(h);
    if (t < 1.3) return "wayOver";
    if (t < 1.9) return "over";
    if (t > 4) return "wayUnder";
    if (t > 3.3) return "under";
    return "ok";
  }

  /* --- 어떤 호떡이 됐나 (명세 58) -------------------------------
     점수가 아니라 '종류' 다. 얇은 쪽이든 도톰한 쪽이든 잘 만들었으면
     좋은 호떡이고, 이 값은 그중 어느 쪽인지만 말한다. 결과 화면에는
     아직 안 쓴다 — 안쪽에서만 들고 있는다. */
  function styleOf(h) {
    const t = thickCm(h);
    if (t > 3.3) return "THICK";
    if (t < 1.9) return "THIN";
    if (fillHeld(h) > 1.2) return "FILLING_RICH";
    const surf = (h.cookA + h.cookB) * 0.5;
    if (t < 2.6 && surf > 78) return "CRISPY";
    return "CHEWY";
  }
  function lvOil(h) {
    if (h.oil < 0.08) return "none";
    if (h.oil < CFG.oilGood) return "low";
    if (h.oil > 1.7) return "much";
    return "ok";
  }
  const LV = { rip: lvRip, stick: lvStick, core: lvCore, cook: lvCook,
               fill: lvFill, seal: lvSeal, press: lvPress, oil: lvOil };

  /* 같은 칸이라도 매번 같은 말이 나오지 않게 두세 가지씩 둔다.
     말투만 바뀔 뿐, 칸이 아니면 이 표현은 영영 안 나온다. */
  const SAY = {
    rip: {
      heavy: ["압력을 버티지 못하고 크게 터졌어요. 속도 많이 흘러나왔습니다.",
              "옆구리가 크게 벌어져서 속이 철판으로 쏟아졌어요.",
              "너무 밀어붙였어요. 호떡이 버티지 못하고 터졌습니다."],
      /* 원인을 특정 항목(봉합 같은) 탓으로 돌리지 않는다. 아래에서
         그 항목을 칭찬하게 되면 리포트가 앞뒤로 어긋난다. */
      medium: ["옆구리가 벌어지면서 속이 조금 새어나왔어요.",
               "눌린 자리가 터져서 시럽이 비어져 나왔습니다.",
               "갈라진 틈으로 속이 조금 빠져나갔어요."],
      light: ["표면이 살짝 갈라졌어요. 조금만 덜 눌렀으면 더 예뻤을 것 같아요.",
              "겉면에 작은 금이 갔어요. 거의 다 왔는데 아쉽습니다.",
              "살짝 찢어진 자국이 남았어요."],
    },
    stick: {
      bad: ["기름을 거의 두르지 않아 철판에 많이 눌어붙었습니다.",
            "철판이 호떡을 놓아주지 않아서 떼는 동안 살이 뜯겼어요.",
            "눌어붙은 채로 떼어내느라 표면이 많이 상했어요."],
      some: ["기름이 조금 부족해서 표면이 살짝 달라붙었어요.",
             "떼어낼 때 조금 끈적였어요. 기름을 더 둘러도 좋았겠습니다."],
    },
    core: {
      veryLow: ["겉은 익어 보여도 중심 반죽은 아직 생반죽에 가까워요.",
                "속까지 열이 전혀 들어가지 않았어요.",
                "겉만 익히고 꺼냈어요. 안쪽은 아직 반죽 그대로입니다."],
      low: ["안쪽 반죽이 아직 촉촉하고 덜 익었어요.",
            "중심부까지 열이 충분히 들어가지 않았어요.",
            "조금만 더 구웠다면 속까지 딱 좋았을 것 같아요."],
      over: ["안쪽까지 너무 오래 익혀 쫀득함이 조금 줄었어요.",
             "속까지 바싹 익혔어요. 조금 퍽퍽할 것 같습니다."],
    },
    cook: {
      overBoth: ["전체적으로 너무 오래 구웠어요. 겉면이 많이 딱딱해졌습니다.",
                 "양면 모두 새까맣게 탔어요.",
                 "불 앞에서 너무 오래 두었어요. 숯에 가까워졌습니다."],
      overOne: ["한쪽을 너무 오래 구워 색이 많이 진해졌어요.",
                "한 면이 타버렸어요. 조금 일찍 뒤집었으면 좋았겠습니다."],
      uneven: ["한쪽은 잘 익었지만 반대쪽은 아직 덜 익었어요.",
               "앞뒤 색이 많이 달라요. 뒤집는 때를 놓쳤습니다.",
               "한 면만 열심히 구웠네요. 반대쪽이 창백합니다."],
      underOne: ["뒤집은 면이 아직 덜 익었어요.",
                 "한 면이 아직 하얘요. 조금 더 구워도 좋았겠습니다."],
    },
    fill: {
      none: ["반죽은 구웠지만 속을 넣지 않았어요.",
             "설탕을 깜빡했어요. 맨 반죽만 구워졌습니다."],
      low: ["속이 조금 부족해요. 먹었을 때 반죽 맛이 더 강할 것 같아요.",
            "설탕이 조금 적게 들어갔어요."],
      high: ["속이 꽤 많이 들어갔어요. 달콤하지만 터질 위험이 높았습니다.",
             "속을 욕심냈네요. 옆구리가 터질 듯 빵빵합니다."],
      over: ["속을 너무 많이 넣었어요. 내부 압력이 크게 올라갔습니다.",
             "설탕을 한참 들이부었어요. 버텨준 게 용합니다."],
    },
    seal: {
      bad: ["입구가 제대로 닫히지 않아 속이 새기 쉬운 상태였습니다.",
            "오므리다 말았어요. 벌어진 틈으로 속이 보입니다."],
      mid: ["봉합은 괜찮지만 조금 느슨한 부분이 있었어요.",
            "한쪽 봉합이 야물지 못했어요."],
    },
    press: {
      wayOver: ["지나치게 눌러 반죽이 압력을 버티지 못했습니다.",
                "너무 밀어서 종잇장처럼 얇아졌어요."],
      over: ["너무 많이 눌러 호떡이 얇고 넓게 퍼졌어요.",
             "조금 과하게 눌렀어요. 얇아진 만큼 금방 식을 것 같습니다."],
      wayUnder: ["거의 누르지 않았어요. 호떡이라기엔 너무 두껍습니다.",
                 "반죽 덩어리에 가까워요. 더 눌러서 펴야 합니다."],
      under: ["조금 더 눌러도 괜찮았을 것 같아요.",
              "두께가 남았어요. 호떡보다는 찐빵에 가깝습니다."],
    },
    oil: {
      none: ["기름을 두르지 않고 구웠어요.",
             "마른 철판에 바로 올렸습니다."],
      low: ["기름이 조금 모자랐어요.",
            "기름을 더 둘러도 좋았겠습니다."],
      much: ["기름을 넉넉히도 둘렀네요.",
             "기름이 조금 과했어요."],
    },
  };

  /* 잘한 점 — 문제로 잡히지 않은 항목에서만 고른다 */
  const GOOD = {
    cook: { good: ["앞뒤 모두 노릇하게 잘 익었어요.", "굽기는 나무랄 데 없습니다."] },
    core: { ok: ["속까지 고르게 잘 익었습니다.", "안쪽까지 알맞게 익었어요."] },
    fill: { ok: ["반죽과 속의 비율이 좋습니다.", "속을 알맞게 넣었어요."] },
    seal: { good: ["봉합은 단단하게 잘 됐어요.", "야물게 잘 오므렸습니다."] },
    oil: { ok: ["기름 양은 적당했어요.", "기름을 알맞게 둘렀습니다."] },
    press: { ok: ["두께와 크기가 적당합니다.", "알맞게 눌러 폈어요."] },
  };

  /* 심한 것부터. 이 차례가 곧 보여 줄 차례다. */
  const ISSUE_ORDER = [
    ["rip", "heavy"], ["stick", "bad"],
    ["core", "veryLow"], ["cook", "overBoth"], ["cook", "overOne"],
    ["rip", "medium"], ["core", "low"], ["cook", "uneven"], ["cook", "underOne"],
    ["fill", "over"], ["fill", "high"], ["fill", "none"], ["fill", "low"],
    ["press", "wayOver"], ["press", "wayUnder"], ["press", "over"], ["press", "under"],
    ["seal", "bad"], ["seal", "mid"],
    ["oil", "none"], ["oil", "low"], ["core", "over"], ["oil", "much"],
    ["rip", "light"], ["stick", "some"],
  ];

  /* 문제와 맞물린 항목은 칭찬하지 않는다. "터졌지만 봉합은 훌륭했어요"
     나 "눌어붙었지만 기름은 적당했어요" 같은 말이 나오면 리포트를
     믿을 수 없게 된다. 겉굽기와 속익힘처럼 서로 다른 이야기를 하는
     짝은 그대로 둔다 — "겉은 잘 익었지만 속은 덜" 은 쓸모 있는 말이다. */
  const TIED = { rip: ["seal", "press"], stick: ["oil"], seal: ["rip"], oil: ["stick"] };

  function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* 겉과 속을 한 낱말로 — 단면을 왜 보여 주는지가 여기서 드러난다 */
  const TAG_COOK = { good: "노릇함", uneven: "한쪽만", underOne: "덜 익음",
                     overOne: "한쪽 탐", overBoth: "탐" };
  const TAG_CORE = { veryLow: "생반죽", low: "설익음", ok: "잘 익음", over: "과하게 익음" };

  const GRADES = ["다시 도전", "연습이 필요해요", "조금 아쉬워요", "잘 구웠어요", "호떡 장인"];

  /* --- 결과 화면용 짧은 문구 ------------------------------------
     위의 SAY 는 상태를 제대로 설명하는 긴 문장이고(공유 카드와
     판정에 그대로 남는다), 여기 있는 것은 한 화면에 들어가야 하는
     결과 화면용 축약판이다. 칸은 똑같다 — 짧게 말할 뿐이다.
       c : 앞에 올 때의 연결형 ("...고")
       s : 혼자 설 때 / 뒤에 올 때의 종결형
     한 줄 18~22자를 넘기지 않게 썼다. */
  const SHORT = {
    rip: {
      heavy: { c: "옆구리가 크게 터지고",
               s: ["옆구리가 터져 속이 샜어요.", "크게 터져 속이 많이 샜어요."] },
      medium: { c: "옆구리가 조금 벌어지고",
                s: ["옆구리가 벌어져 속이 샜어요.", "갈라진 틈으로 속이 샜어요."] },
      light: { c: "표면이 살짝 갈라지고",
               s: ["표면이 살짝 갈라졌어요.", "겉면에 작은 금이 갔어요."] },
    },
    stick: {
      bad: { c: "철판에 많이 눌어붙고",
             s: ["철판에 많이 눌어붙었어요.", "눌어붙어 겉이 상했어요."] },
      some: { c: "철판에 살짝 붙고",
              s: ["철판에 살짝 붙었어요.", "떼어낼 때 조금 끈적였어요."] },
    },
    core: {
      veryLow: { c: "속이 생반죽으로 남고",
                 s: ["속이 아직 생반죽이에요.", "안쪽까지 열이 안 갔습니다."] },
      /* 연결형은 뒤에 올 굽기 문장("한쪽 면이 조금 덜 익었어요")과
         같은 말이 겹치지 않게 다른 낱말을 쓴다 */
      low: { c: "속까지 열이 덜 가고",
             s: ["속이 아직 조금 덜 익었어요.", "중심부가 아직 촉촉합니다."] },
      over: { c: "속까지 너무 익고",
              s: ["속까지 너무 오래 익혔어요.", "안쪽이 조금 퍽퍽합니다."] },
    },
    cook: {
      overBoth: { c: "양면이 너무 타고",
                  s: ["양면 모두 너무 많이 탔어요.", "너무 구워 딱딱해졌어요."] },
      overOne: { c: "한쪽이 너무 타고",
                 s: ["한쪽 면이 너무 많이 탔어요.", "한 면 색이 많이 진합니다."] },
      uneven: { c: "앞뒤 굽기가 고르지 않고",
                s: ["앞뒤 굽기가 고르지 않아요.", "한쪽만 익고 반대쪽은 덜 익었어요."] },
      underOne: { c: "한쪽 면이 창백하고",
                  s: ["한쪽 면이 조금 덜 익었어요.", "뒤집은 면이 아직 하얘요."] },
    },
    fill: {
      none: { c: "속을 넣지 않고",
              s: ["속을 넣지 않았어요.", "설탕을 깜빡했어요."] },
      low: { c: "속이 조금 부족하고",
             s: ["속이 조금 부족해요.", "설탕이 조금 적게 들어갔어요."] },
      high: { c: "속이 꽤 많이 들어가고",
              s: ["속이 꽤 많이 들어갔어요.", "속을 조금 욕심냈네요."] },
      over: { c: "속을 너무 많이 넣고",
              s: ["속을 너무 많이 넣었어요.", "설탕을 한참 들이부었어요."] },
    },
    seal: {
      bad: { c: "입구가 벌어지고",
             s: ["입구가 제대로 닫히지 않았어요.", "오므리다 말아 틈이 남았어요."] },
      mid: { c: "봉합이 조금 느슨하고",
             s: ["봉합이 조금 느슨했어요.", "한쪽 봉합이 야물지 못했어요."] },
    },
    press: {
      wayOver: { c: "너무 눌러 얇아지고",
                 s: ["너무 눌러 종잇장처럼 얇아요.", "지나치게 눌러 얇아졌어요."] },
      over: { c: "조금 과하게 눌리고",
              s: ["조금 과하게 눌러 얇아졌어요.", "얇고 넓게 퍼졌어요."] },
      wayUnder: { c: "거의 펴지 못해 두껍고",
                  s: ["덜 펴서 많이 두꺼워요.", "반죽 덩어리에 가깝습니다."] },
      under: { c: "두께가 조금 남고",
               s: ["조금 더 눌러도 좋았겠어요.", "두께가 제법 남았어요."] },
    },
    oil: {
      none: { c: "기름 없이 굽고",
              s: ["기름 없이 그냥 구웠어요.", "마른 철판에 바로 올렸어요."] },
      low: { c: "기름이 조금 모자라고",
             s: ["기름이 조금 모자랐어요.", "기름을 더 둘러도 좋았겠어요."] },
      much: { c: "기름이 조금 과하고",
              s: ["기름이 조금 과했어요.", "기름을 넉넉히도 둘렀네요."] },
    },
  };
  const SHORT_OK = ["겉과 속 모두\n아주 잘 익었습니다.",
                    "노릇하게 잘 익었고\n두께도 딱 좋습니다.",
                    "흠잡을 데가 없어요.\n바로 팔아도 되겠습니다."];

  /* 결과 화면 총평은 반드시 말해야 하는 것부터 자리를 준다.
     터짐과 속 없음은 다른 문제에 밀려 빠지면 안 된다. */
  const MUST = { rip: "heavy", fill: "none" };

  /* 두 칸밖에 없으니 같은 이야기로 둘을 채우지 않는다. "철판에 많이
     눌어붙고 기름이 조금 모자랐어요" 는 결과와 원인을 한 번씩 말한
     것이라 두 번째 칸이 아깝다. 압착과 파열은 빼 두었다 — "너무 세게
     눌러 옆구리가 터졌어요" 는 원인과 결과가 붙어야 쓸모 있는 말이다. */
  const DITTO = { stick: ["oil"], oil: ["stick"], rip: ["seal"], seal: ["rip"] };

  function shortIssues(now) {
    const out = [];
    const add = (k, v) => {
      if (out.length >= 2 || out.some(p => p.k === k)) return;
      if (out.some(p => (DITTO[p.k] || []).indexOf(k) >= 0)) return;
      out.push({ k: k, level: v });
    };
    for (const k in MUST) if (now[k] === MUST[k]) add(k, now[k]);
    for (const [k, v] of ISSUE_ORDER) if (now[k] === v) add(k, v);
    return out;
  }

  /* 한 화면에 들어가는 총평. 긴 문장들을 이어 붙이지 않고, 문제 두
     개를 한 문장으로 묶는다 — "A 고 / B" 두 줄. */
  function buildShortSummary(now) {
    const p = shortIssues(now);
    if (!p.length) return pickOne(SHORT_OK);
    if (p.length === 1) return pickOne(SHORT[p[0].k][p[0].level].s);
    return SHORT[p[0].k][p[0].level].c + "\n" + pickOne(SHORT[p[1].k][p[1].level].s);
  }

  /* ============================================================
     결과 이름 — 상태가 정한다
     ============================================================
     무작위로 붙이지 않는다. 위에서부터 보면서 처음 맞는 것이 이름이
     되고, 치명적인 실패가 늘 생김새보다 앞선다. 탄 호떡이 "겉바속촉"
     이 되는 일은 구조적으로 일어나지 않는다. 실패한 이름도 사람을
     탓하지 않고 호떡을 부른다. */
  function nameOf(h) {
    const cook = lvCook(h), core = lvCore(h), rip = lvRip(h);
    const fill = lvFill(h), stick = lvStick(h), press = lvPress(h);
    const cm = diameterCm(h), t = thickCm(h);
    /* 속을 넣은 적이 없으면 샐 시럽도 없다. 이름이 상태와 어긋나지
       않도록 '탈주' 계열은 속이 있었을 때만 쓴다. */
    const had = h.fillPut > 0.1;
    /* 1. 먹기 어려운 수준의 실패가 먼저다 */
    if (cook === "overBoth") return "숯이 된 호떡";
    if (rip === "heavy") return had ? "시럽 탈주 호떡" : "갈가리 찢어진 반죽";
    if (core === "veryLow") return "겉만 익은 호떡";
    if (stick === "bad") return "철판에 붙었던 호떡";
    if (!had) return "속 없는 민호떡";
    /* 2. 한눈에 보이는 생김새 */
    if (press === "wayOver") return "종잇장 호떡";
    if (cm >= 15.5) return "철판만 한 호떡";
    if (cm <= 8.5) return "한입 호떡";
    if (cook === "overOne") return "한쪽이 탄 호떡";
    if (rip === "medium" || rip === "light") return "옆구리 터진 호떡";
    if (cook === "uneven" || cook === "underOne") return "한쪽만 노릇한 호떡";
    if (core === "low") return "속이 설익은 호떡";
    if (core === "over") return "바싹 익은 호떡";
    if (fill === "over" || fill === "high") return "설탕 넘치는 호떡";
    if (fill === "low") return "설탕이 아쉬운 호떡";
    if (stick === "some") return "살짝 눌어붙은 호떡";
    if (t >= 3.6) return "도톰한 찐빵형 호떡";
    /* 3. 흠이 없다 — 어느 쪽으로 잘 만들었는지로 가른다 */
    const st = styleOf(h);
    if (st === "CRISPY") return "겉바속촉 시장 호떡";
    if (st === "THIN") return "얇고 바삭한 호떡";
    if (st === "THICK") return "도톰한 찐빵형 호떡";
    if (st === "FILLING_RICH") return "속 넉넉한 호떡";
    return "쫀득한 시장 호떡";
  }
  /* 도감이 다 채워졌는지 셀 수 있게, 나올 수 있는 이름을 한곳에 둔다 */
  const DEX_ALL = ["숯이 된 호떡", "시럽 탈주 호떡", "갈가리 찢어진 반죽", "겉만 익은 호떡",
    "철판에 붙었던 호떡", "속 없는 민호떡", "종잇장 호떡", "철판만 한 호떡",
    "한입 호떡", "한쪽이 탄 호떡", "옆구리 터진 호떡", "한쪽만 노릇한 호떡",
    "속이 설익은 호떡", "바싹 익은 호떡", "설탕 넘치는 호떡", "설탕이 아쉬운 호떡",
    "살짝 눌어붙은 호떡", "도톰한 찐빵형 호떡", "겉바속촉 시장 호떡",
    "얇고 바삭한 호떡", "속 넉넉한 호떡", "쫀득한 시장 호떡"];

  /* ============================================================
     다음 판에서 바꿔 볼 행동 하나
     ============================================================
     "봉합 부족" 에서 끝내지 않는다. 손이 무엇을 다르게 하면 되는지를
     말한다. 다만 근거가 없으면 단정하지 않는다 — 어느 쪽 잘못인지
     가릴 수 없을 때는 특정 행동 대신 두루뭉술하게 둔다.
     그 근거로 쓰려고 호떡이 조리 중에 몇 가지를 적어 둔다
     (weakDir / panOil0 / slipFlips / pressCount). */
  const DIRN = ["오른쪽", "아래쪽", "왼쪽", "위쪽"];
  function adviceOf(h) {
    const cook = lvCook(h), core = lvCore(h), rip = lvRip(h);
    const fill = lvFill(h), stick = lvStick(h), press = lvPress(h), oil = lvOil(h);
    const seal = lvSeal(h);
    const weak = DIRN[clamp(h.weakDir || 0, 0, 3)];

    if (rip === "heavy" || rip === "medium") {
      /* 터진 이유가 여럿일 수 있다. 짚을 수 있는 것부터 짚는다. */
      if (seal === "bad" || seal === "mid")
        return "벌어진 " + weak + " 가장자리를 가운데로 더 모아보세요";
      if (fill === "over" || fill === "high")
        return "설탕을 반 숟갈만 덜 떠서 넣어보세요";
      if (h.press > 0.9) return "누르개를 조금 일찍 떼어보세요";
      if (h.fillOff > 0.45) return "설탕을 반죽 한가운데에 놓아보세요";
      return "다음엔 조금 더 살살 다뤄보세요";
    }
    if (stick === "bad" || stick === "some") {
      if ((h.panOil0 || 0) < CFG.oilGood)
        return "반죽을 올리기 전에 철판에 기름을 한 번 더 둘러보세요";
      return "조금 더 익혀 바닥이 굳은 뒤에 떼어보세요";
    }
    if (cook === "overBoth" || cook === "overOne")
      return "노브를 왼쪽으로 돌려 불을 줄이고 색이 나면 바로 뒤집어보세요";
    if (core === "veryLow" || core === "low") {
      if (thickCm(h) > 3.3) return "누르개로 두세 번 더 눌러 얇게 편 뒤 구워보세요";
      return "불을 한 칸 줄이고 조금 더 오래 구워보세요";
    }
    if (cook === "uneven") return "한쪽이 노릇해지면 바로 뒤집어보세요";
    if (cook === "underOne") return "뒤집은 뒤에도 비슷한 시간만큼 구워보세요";
    if (fill === "none") return "설탕통을 눌러 숟가락에 담고 반죽 가운데에 놓아보세요";
    if (fill === "over" || fill === "high") return "설탕을 반 숟갈만 덜 떠보세요";
    if (fill === "low") return "설탕통을 조금 더 오래 눌러 넉넉히 담아보세요";
    if (press === "wayUnder" || press === "under")
      return "누르개로 두세 번 더 눌러 펴보세요";
    if (press === "wayOver" || press === "over")
      return "누르개를 한 번 덜 눌러보세요";
    if (seal === "bad" || seal === "mid")
      return weak + " 가장자리를 가운데로 더 모아보세요";
    if (oil === "none" || oil === "low")
      return "반죽을 올리기 전에 철판에 기름을 넉넉히 둘러보세요";
    if (oil === "much") return "기름은 한 번만 쓱 둘러도 충분합니다";
    if ((h.slipFlips || 0) > 0)
      return "뒤집개를 호떡 밑으로 더 깊이 밀어 넣고 휙 넘겨보세요";
    /* 흠이 없다 — 바꿀 것이 아니라 해 볼 것을 준다 */
    return pickOne(["이번 두께가 좋았어요. 다음엔 조금 더 얇게도 해보세요",
                    "같은 솜씨로 조금 더 크게 펴보세요",
                    "설탕을 조금 더 넣고도 안 새게 해보세요"]);
  }

  /* ============================================================
     주문 — 변주는 숨은 난수가 아니라 주문의 차이로
     ============================================================
     기본 품질 평가와 따로 센다. 주문을 맞췄어도 태웠으면 태운 것이고,
     주문을 못 맞췄어도 잘 구웠으면 잘 구운 것이다. */
  /* name  : 주문서에 크게 적히는 이름
     cond  : 사람 말로 적은 조건 (숫자를 외우게 하지 않는다)
     tip   : 그 주문을 맞추려면 손이 무엇을 다르게 해야 하나
     thick : 안내가 "더 누르세요" 를 멈추는 두께. 주문마다 다르다 —
             도톰한 호떡을 주문해 놓고 얇게 누르라고 하면 안내가
             주문과 싸우게 된다. */
  const ORDERS = [
    { id: "thin", label: "얇고 바삭하게", name: "얇고 바삭한 호떡",
      cond: "얇은 두께 · 양면 노릇하게",
      tip: "누르개로 네댓 번 눌러 넓게 펴고, 양면을 고르게 구우세요.",
      hint: "두께 2.4cm 아래로, 양면을 노릇하게",
      thickMax: 2.4,
      test: r => r.thickness <= 2.4 && (r.cookA + r.cookB) / 2 >= 62 },
    { id: "small", label: "작고 도톰하게", name: "작고 도톰한 호떡",
      cond: "작은 크기 · 도톰한 두께 · 속까지 익히기",
      tip: "반죽을 조금만 떼고 살살 누르세요. 도톰한 만큼 약한 불로 오래 구워야 속까지 익습니다.",
      hint: "지름 11cm 아래, 두께 2.8cm 위로",
      thickMax: 3.3, thickMin: 2.8,
      test: r => r.diameter <= 11 && r.thickness >= 2.8 },
    { id: "rich", label: "속 넉넉하게, 새지 않게", name: "속 넉넉한 호떡",
      cond: "속 넉넉하게 · 터지지도 새지도 않게",
      tip: "설탕을 넉넉히 뜨되 반죽 한가운데에 놓고, 네 쪽을 모두 야물게 오므리세요.",
      hint: "속을 1.0 넘게 품은 채로 터지지 않게",
      thickMax: 3.3,
      test: r => r.fillingAmount + r.fillingLoose >= 1 &&
                 r.leakAmount <= 0.25 && r.burstAmount < 0.2 },
  ];
  /* 안내가 "더 누르세요" 를 멈추는 두께 — 주문이 있으면 주문을 따른다 */
  function thickTarget() {
    return (S.order && S.order.thickMax) || 3.3;
  }
  function thickFloor() {
    return (S.order && S.order.thickMin) || 0;
  }
  /* 첫 판의 주문. 안내만 따라 해도 닿는 것으로 고른다 — 처음 하는
     사람이 첫 주문부터 못 맞추면 주문이 벽이 된다. (실측: 안내만
     따라가면 지름 8.4cm 두께 3.1cm 가 나오고 이 조건에 든다.) */
  function firstOrder() { return orderById("small"); }
  function orderById(id) {
    for (const o of ORDERS) if (o.id === id) return o;
    return null;
  }
  /* 돌아가며 준다 — 예고 없이 난이도가 변하지 않게. 다만 "다른
     주문으로" 를 눌렀는데 같은 주문이 또 나오면 그건 다른 주문이
     아니므로, 지금 들고 있는 것은 건너뛴다. */
  function nextOrder() {
    const cur = S.order ? S.order.id : null;
    for (let i = 0; i < ORDERS.length; i++) {
      const o = ORDERS[S.orderN++ % ORDERS.length];
      if (o.id !== cur) return o;
    }
    return ORDERS[0];
  }

  /* --- 다음 판의 목표 한 가지 ----------------------------------
     직전 결과에서 가장 아쉬웠던 것 하나만 고른다. 첫 판에는 아무
     목표도 주지 않는다 — 처음에는 하나를 끝내는 것이 전부다. */
  const GOALS = [
    { id: "noleak", label: "이번에는 속이 새지 않게",
      want: r => r.leakAmount <= 0.25 && r.burstAmount < 0.2,
      pick: r => r.leakAmount > 0.25 || r.burstAmount >= 0.2 },
    { id: "even", label: "이번에는 양면을 고르게",
      want: r => Math.abs(r.cookA - r.cookB) <= 45 && Math.min(r.cookA, r.cookB) >= 44,
      pick: r => r.levels.cook === "uneven" || r.levels.cook === "underOne" },
    { id: "core", label: "이번에는 속까지 익히기",
      want: r => r.coreScore >= 0.8,
      pick: r => r.levels.core === "low" || r.levels.core === "veryLow" },
    { id: "nostick", label: "이번에는 눌어붙지 않게",
      want: r => r.stickiness < 0.25 && r.scarAmount < 0.15,
      pick: r => r.levels.stick !== "ok" },
    { id: "noburn", label: "이번에는 태우지 않게",
      want: r => Math.max(r.cookA, r.cookB) <= 104,
      pick: r => r.levels.cook === "overBoth" || r.levels.cook === "overOne" },
    { id: "fill", label: "이번에는 속을 알맞게",
      want: r => r.levels.fill === "ok",
      pick: r => r.levels.fill !== "ok" },
    { id: "shape", label: "이번에는 두께를 알맞게",
      want: r => r.levels.press === "ok",
      pick: r => r.levels.press !== "ok" },
    /* 흠이 없을 때도 다음 판에 해 볼 것이 있어야 한다. 고칠 것이
       없다고 "그대로 또 하세요" 라고 하면 재도전할 이유가 없어진다. */
    { id: "crisp", label: "이번에는 더 얇고 바삭하게",
      want: r => r.thickness <= 2.4 && (r.cookA + r.cookB) / 2 >= 62,
      pick: r => r.thickness > 2.4 },
    { id: "bigger", label: "이번에는 더 크게 펴보기",
      want: r => r.diameter >= 13,
      pick: () => true },
  ];
  function goalFrom(r) {
    for (const g of GOALS) if (g.pick(r)) return g;
    return null;
  }
  function goalById(id) {
    for (const g of GOALS) if (g.id === id) return g;
    return null;
  }

  function reportOf(h, sc) {
    const now = {};
    for (const k in LV) now[k] = LV[k](h);

    /* 문제는 심한 차례로 최대 둘 */
    const issues = [];
    for (const [k, v] of ISSUE_ORDER) {
      if (issues.length >= 2) break;
      if (now[k] === v && !issues.some(i => i.k === k))
        issues.push({ k: k, level: v, text: pickOne(SAY[k][v]) });
    }
    /* 잘한 점은 하나. 문제로 잡힌 항목에서는 고르지 않는다. */
    const blocked = {};
    for (const i of issues) {
      blocked[i.k] = 1;
      for (const t of (TIED[i.k] || [])) blocked[t] = 1;
    }
    const okNow = [];
    for (const k in GOOD)
      if (GOOD[k][now[k]] && !blocked[k]) okNow.push(k);
    const praiseKey = okNow.length ? pickOne(okNow) : null;
    const praise = praiseKey ? pickOne(GOOD[praiseKey][now[praiseKey]]) : null;

    /* 등급 — 평균만으로 매기지 않는다. 치명적인 문제가 있으면 천장을 내린다. */
    let g = Math.round(clamp(sc.overall, 0, 1) * 4) + 1;
    if (now.rip === "heavy" || now.core === "veryLow" || now.cook === "overBoth") g = Math.min(g, 2);
    else if (now.stick === "bad" || now.rip === "medium" || now.fill === "none") g = Math.min(g, 3);
    else if (issues.length) g = Math.min(g, 4);
    g = clamp(g, 1, 5);

    return {
      levels: now,
      issues: issues,
      headline: issues.length ? issues.map(i => i.text).join(" ")
                              : pickOne(["노릇하게 잘 익었어요. 두께와 모양도 딱 좋습니다!",
                                         "흠잡을 데가 없어요. 바로 팔아도 되겠습니다.",
                                         "겉도 속도 알맞게 익었어요. 잘 만들었습니다."]),
      /* 잘한 점은 흠이 없을 때도 말해 준다. 결과 화면이 "잘한 점 하나 +
         다음에 바꿀 행동 하나" 로 짜여 있어서, 여기서 null 을 돌려주면
         잘 만든 사람만 칭찬을 못 받는다. */
      praise: praise,
      /* 결과 화면이 읽는 축약 총평 */
      shortLine: buildShortSummary(now),
      outerTag: TAG_COOK[now.cook] || "-",
      innerTag: TAG_CORE[now.core] || "-",
      grade: g,
      gradeLabel: GRADES[g - 1],
    };
  }

  /* 세부 항목 옆에 붙는 짧은 딱지 — 심한 것만 */
  const ROW_TAG = {
    cookScore: h => ({ uneven: "한쪽만 익음", underOne: "덜 익음",
                       overOne: "한쪽 탐", overBoth: "탐" })[lvCook(h)],
    coreScore: h => ({ veryLow: "생반죽", low: "설익음", over: "과하게 익음" })[lvCore(h)],
    fillingScore: h => ({ none: "없음", low: "부족", high: "많음", over: "과다" })[lvFill(h)],
    sealScore: h => ({ bad: "벌어짐", mid: "느슨함" })[lvSeal(h)],
    oilScore: h => ({ none: "거의 없음", low: "부족", much: "과함" })[lvOil(h)],
  };

  function evaluate(h) {
    const cm = diameterCm(h), th = thickCm(h);
    const hi = Math.max(h.cookA, h.cookB);
    const lo = Math.min(h.cookA, h.cookB);
    const gap = Math.abs(h.cookA - h.cookB);
    /* 속 문제는 '넣은 적이 있나' 로 본다 — 다 새어 나간 뒤에도 그건 샌 호떡이다 */
    const had = h.fillPut > 0.05;
    const probs = [
      { k: "burst",  v: had ? (h.burst - 0.22) / 0.5 : -1,
                                                 s: "옆구리가 터졌습니다. 설탕을 좀 줄여 볼까요." },
      { k: "tear",   v: (h.tear - 0.35) / 0.6,   s: "너무 밀어서 반죽이 찢어졌습니다." },
      { k: "stuckTear", v: (h.scar - 0.3) / 0.5, s: "철판에 붙은 채로 떼다가 살이 뜯겼습니다." },
      { k: "burnt",  v: (hi - 104) / 36,         s: "숯불은 넣지 않았는데 숯이 됐습니다." },
      { k: "uneven", v: (gap - 45) / 30,         s: "한 면만 숯이 되고 반대쪽은 생반죽입니다." },
      { k: "raw",    v: (44 - lo) / 44,          s: "아직 반죽의 꿈을 못 버렸습니다." },
      /* 단면 그림의 '정상' 선과 같은 값을 쓴다 — 둘이 따로 놀면
         문구와 단면이 어긋난다 */
      { k: "doughy", v: lo > 44 ? (CFG.coreFull * 0.8 - h.core) / 40 : -1,
                                                 s: "겉은 노릇한데 속은 아직 반죽입니다." },
      { k: "leak",   v: had ? (h.leak - 0.3) / 0.5 : -1,
                                                 s: "설탕이 탈출을 시도했습니다." },
      { k: "open",   v: h.filling + h.fillLoose > 0.1 ? (0.6 - h.sealed) / 0.6 : -1,
                                                 s: "입을 다물지 못한 호떡입니다." },
      { k: "nofill", v: (0.4 - h.fillPut) / 0.4, s: "속을 깜빡했네요." },
      { k: "thick",  v: (th - 3.3) / 1.1,        s: "호떡보다 찐빵에 가깝습니다." },
      { k: "thin",   v: (1.9 - th) / 0.6,        s: "종이처럼 얇아졌습니다." },
      /* 찌그러짐에서 '뜯겨서 생긴 몫' 은 빼고 본다 — 뜯긴 것을
         "한쪽만 눌렀다" 고 하면 엉뚱한 데를 고치게 된다 */
      { k: "skew",   v: (h.deform - (h.scar || 0) - 0.17) / 0.3,
                                                 s: "한쪽만 열심히 눌렀군요." },
      { k: "stick",  v: (h.stick - 0.4) / 0.5,   s: "철판이 호떡을 쉽게 놓아주지 않았습니다." },
      { k: "oily",   v: (h.oil - 1.7) / 0.9,     s: "기름을 좀 아껴도 됩니다." },
      { k: "small",  v: (9.4 - cm) / 3,          s: "한 입에 사라질 크기입니다." },
      { k: "huge",   v: (cm - 17.5) / 4,         s: "호떡인지 전인지 모르겠습니다." },
    ];
    let worst = probs[0];
    for (const p of probs) if (p.v > worst.v) worst = p;
    const good = worst.v <= 0;

    /* --- 하위 점수 ---------------------------------------------
       '단계를 다 거쳤나' 가 아니라 실제로 남은 상태에서 뽑는다.
       각각 0~1 이고, 낮은 쪽이 그 호떡의 문제다. 한 줄 판정은 위의
       probs 가 그대로 정하고, 이 점수는 무엇이 얼마나 어긋났는지를 센다. */
    const r2 = v => Math.round(clamp(v, 0, 1) * 100) / 100;
    const surf = (h.cookA + h.cookB) * 0.5;
    const scores = {
      /* 뜯긴 몫(scar)은 damage 쪽에서 세므로 여기서는 뺀다 */
      shapeScore:   r2(1 - (h.deform - (h.scar || 0)) / 0.45),
      /* 속은 많아도 적어도 깎인다. 문구가 '적정' 이라고 말하는 구간
         (0.6~1.2) 에서 가득 받도록 같은 선을 쓴다 — 따로 놀면
         "비율이 좋습니다" 라면서 점수만 깎이는 일이 생긴다. */
      fillingScore: r2(h.fillPut <= 0.1 ? 0
                       : 1 - Math.max(0, 0.6 - fillHeld(h), fillHeld(h) - 1.2) / 0.8),
      sealScore:    r2(h.fillPut > 0.05 ? h.sealed : 1),
      /* 겉굽기와 속익힘은 따로 센다 — 결과 화면에서 각각 보여 준다.
         문구가 '굽기는 나무랄 데 없다' 고 말하는 구간(lvCook 의 good:
         덜 익은 면 없고, 탄 면 없고, 앞뒤 차이 45 아래)에서 가득 받게
         같은 선을 쓴다. 평균에서 멀어진 만큼 깎는 식으로 재면 제대로
         구운 호떡이 두세 칸밖에 못 받아, 바로 위의 총평과 어긋난다.
         벌점의 분모는 위 probs 의 burnt/raw/uneven 과 같은 값이다. */
      cookScore:    r2(1 - Math.max(0, (hi - 104) / 36, (44 - lo) / 44,
                                       (gap - 45) / 30)),
      coreScore:    r2(coreRatio(h)),
      oilScore:     r2(1 - Math.abs(h.oil - 0.6) / 1.2),
      damageScore:  r2(1 - (h.tear + h.burst + h.scar) / 1.2),
    };
    let sum = 0, cnt = 0;
    for (const k in scores) { sum += scores[k]; cnt++; }

    /* 한 줄로 못 담는 문제는 여러 줄로 — 겹친 문제를 하나로 뭉개지 않는다 */
    const lines = [];
    for (const p of probs) if (p.v > 0.1) lines.push({ k: p.k, v: p.v, s: p.s });
    lines.sort((a, b) => b.v - a.v);

    const cut = cutOf(h);
    const rep = reportOf(h, { overall: sum / cnt });
    return {
      /* --- 리포트 (결과 화면이 읽는 것) --- */
      headline: rep.headline,
      shortLine: rep.shortLine,
      praise: rep.praise,
      issues: rep.issues.map(i => ({ k: i.k, level: i.level, text: i.text })),
      levels: rep.levels,
      outerTag: rep.outerTag,
      innerTag: rep.innerTag,
      grade: rep.grade,
      gradeLabel: rep.gradeLabel,
      /* 결과 화면이 읽는 것 — 이름과, 다음 판에서 바꿔 볼 행동 하나 */
      name: nameOf(h),
      advice: adviceOf(h),
      styleType: styleOf(h),
      fillOffset: Math.round(h.fillOff * 100) / 100,
      ruptureRisk: Math.round(ruptureRisk(h) * 100) / 100,
      rowTags: {
        cookScore: ROW_TAG.cookScore(h) || null,
        coreScore: ROW_TAG.coreScore(h) || null,
        fillingScore: ROW_TAG.fillingScore(h) || null,
        sealScore: ROW_TAG.sealScore(h) || null,
        oilScore: ROW_TAG.oilScore(h) || null,
      },
      shapeScore: scores.shapeScore,
      fillingScore: scores.fillingScore,
      sealScore: scores.sealScore,
      cookScore: scores.cookScore,
      coreScore: scores.coreScore,
      oilScore: scores.oilScore,
      damageScore: scores.damageScore,
      overallScore: Math.round((sum / cnt) * 100) / 100,
      /* 단면 — 그림 열쇠와 한 줄. 속을 안 넣었으면 null */
      cut: cut,
      cutKey: cut ? CUT_KEY[cut] : null,
      cutLine: cut ? pickOne(CUT_LINE[cut]) : "속을 넣지 않아서 가를 것이 없습니다.",
      problems: lines.slice(0, 3).map(p => p.s),
      diameter: Math.round(cm * 10) / 10,
      thickness: Math.round(th * 10) / 10,
      cookA: Math.round(h.cookA), cookB: Math.round(h.cookB),
      core: Math.round(h.core),
      fillingAmount: Math.round(h.filling * 100) / 100,
      fillingPut: Math.round(h.fillPut * 100) / 100,
      fillingLoose: Math.round(h.fillLoose * 100) / 100,
      fillingSpilled: Math.round(h.fillSpill * 100) / 100,
      sealedRatio: Math.round(h.sealed * 100) / 100,
      leakAmount: Math.round(h.leak * 100) / 100,
      burstAmount: Math.round(h.burst * 100) / 100,
      tearAmount: Math.round(h.tear * 100) / 100,
      tearStage: h.tearStage,
      scarAmount: Math.round(h.scar * 100) / 100,
      deformation: Math.round(h.deform * 100) / 100,
      /* 누적 압착량과 지금 걸린 압력은 다른 값이다 */
      pressTotal: Math.round(h.press * 100) / 100,
      pressCount: h.pressCount,
      pressure: Math.round(h.pressure * 100) / 100,
      stickiness: Math.round(h.stick * 100) / 100,
      flipCount: h.flips,
      flipShock: Math.round(h.flipShock * 100) / 100,
      doughAmount: Math.round(h.amount * 100) / 100,
      resultType: good ? "perfect" : worst.k,
      comment: good ? "시장 입구에서 바로 팔아도 됩니다." : worst.s,
    };
  }

  function finish() {
    const h = S.h;
    if (!h || S.done) return;
    h.held = false; h.onPan = false; h.lift = 0;
    h.x = LAY.plate.x; h.y = LAY.plate.y - 8;
    S.done = true;
    learn("plate");
    const r = evaluate(h);
    S.result = r;

    /* --- 주문과 목표는 기본 평가와 따로 센다 --------------------
       주문을 맞췄어도 태웠으면 태운 것이다. 그래서 둘을 한 점수로
       섞지 않고, 화면에도 따로 적는다. */
    if (S.order) {
      r.orderLabel = S.order.label;
      r.orderOk = !!S.order.test(r);
      /* 맞췄더라도 먹을 수 없는 수준이면 분명히 말한다 */
      r.orderButBad = r.orderOk &&
        (r.levels.cook === "overBoth" || r.levels.core === "veryLow" ||
         r.levels.rip === "heavy");
    }
    if (S.goal) {
      r.goalLabel = S.goal.label;
      r.goalOk = !!S.goal.want(r);
    }
    /* --- 도감 --------------------------------------------------- */
    r.isNew = !S.dex[r.name];
    S.dex[r.name] = 1;
    saveDex();
    /* 저장해 둔 것 가운데 지금 쓰는 이름만 센다 — 예전 판의 이름이
       섞여 있어도 "21 중 23 발견" 같은 숫자가 나오지 않게 */
    let found = 0;
    for (const nm of DEX_ALL) if (S.dex[nm]) found++;
    r.dexFound = found;
    r.dexTotal = DEX_ALL.length;
    /* 다음 판에 권할 목표 한 가지 */
    const g = goalFrom(r);
    r.nextGoal = g ? g.label : null;
    S.nextGoalId = g ? g.id : null;

    S.grab = null; S.active = null;
    SFX.clink(); buzz(16);
    spawn("bubble", h.x, h.y, 6, { sp: 40, r: 6, life: 0.5, col: "rgba(255,255,255,.7)" });
    const n = (parseInt(store.get(KEY.made), 10) || 0) + 1;
    store.set(KEY.made, String(n));
    try { store.set(KEY.last, JSON.stringify(S.result)); } catch (_) {}
    track("game_complete");
    showResult();
  }

  /* ============================================================
     그리기
     ============================================================
     캔버스 하나. 1080x1920 가상 좌표로만 그리고, 화면 크기에 맞춰
     한 번만 확대/축소한다. */
  const cv = $("cv");
  const ctx = cv ? cv.getContext("2d") : null;
  const VIEW = { s: 1, ox: 0, oy: 0, dpr: 1 };

  function resize() {
    if (!cv) return;
    const w = cv.clientWidth || 360, h = cv.clientHeight || 640;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    const s = Math.min(w / W, h / H);
    VIEW.s = s; VIEW.dpr = dpr;
    VIEW.ox = (w - W * s) / 2;
    VIEW.oy = (h - H * s) / 2;
  }

  /* 화면 좌표 -> 가상 좌표 */
  function toVirtual(clientX, clientY) {
    const r = cv.getBoundingClientRect();
    return { x: (clientX - r.left - VIEW.ox) / VIEW.s,
             y: (clientY - r.top - VIEW.oy) / VIEW.s };
  }

  const C = {
    ink: "#F0E7D8", cream: "#FFF6E2", paper: "#FFFFFF",
    counter: "#2E2A26", line: "#3A352F",
    pan: "#1E1B18", panIn: "#2A2521", panHot: "#4A3528",
    steel: "#B9B4AC", steelDark: "#7E796F",
    wood: "#A9743C", brown: "#6B3F16", syrup: "#8A4E14",
    oilCol: "rgba(255,236,170,.5)", plate: "#D8D4CC",
  };

  /* 익힘 -> 색 */
  const COOK = [
    [0, 246, 231, 203], [28, 240, 210, 149], [58, 210, 154, 82],
    [84, 168, 98, 31], [108, 94, 55, 20], [150, 46, 34, 25],
  ];
  function cookColor(v, dark) {
    v = clamp(v, 0, 150);
    let a = COOK[0], b = COOK[COOK.length - 1];
    for (let i = 0; i < COOK.length - 1; i++) {
      if (v >= COOK[i][0] && v <= COOK[i + 1][0]) { a = COOK[i]; b = COOK[i + 1]; break; }
    }
    const t = (v - a[0]) / Math.max(1, b[0] - a[0]);
    const k = dark === undefined ? 1 : dark;
    const r = Math.round(lerp(a[1], b[1], t) * k);
    const g = Math.round(lerp(a[2], b[2], t) * k);
    const bl = Math.round(lerp(a[3], b[3], t) * k);
    return "rgb(" + r + "," + g + "," + bl + ")";
  }

  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function box(g, x, y, w, h) {
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h);
    g.closePath();
  }
  function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); }
  function stroke(g, col, w) { g.strokeStyle = col; g.lineWidth = w; g.stroke(); }

  /* --- 작업대 ---------------------------------------------------
     배경 사진 한 장이 곧 조리대다. 통·철판·접시·도구가 이미 사진 안에
     제자리에 있으므로, 제자리에 있는 동안은 아무것도 덧그리지 않는다.
     사진을 못 받았을 때만 도형으로 대신 그린다. */
  function drawBackdrop(g) {
    if (art(g, "stall", W / 2, H / 2, W)) return;
    /* 대비책 */
    g.fillStyle = C.counter; g.fillRect(0, 0, W, H);
    ell(g, LAY.pan.x, LAY.pan.y, LAY.pan.rx, LAY.pan.ry);
    g.fillStyle = C.pan; g.fill(); stroke(g, "#15120F", 8);
    for (const z of [LAY.dough, LAY.fill, LAY.plate]) {
      ell(g, z.x, z.y, z.rx, z.ry);
      g.fillStyle = C.steelDark; g.fill(); stroke(g, "#15120F", 6);
    }
  }

  /* 집어 든 도구가 있던 자리는 비어 보여야 한다 */
  function drawEmptySlots(g) {
    if (!S.active) return;
    const t = TOOL[S.active];
    if (!t) return;
    ell(g, t.home.x, t.home.y, t.hit * 0.82, t.hit * 0.66);
    g.fillStyle = "rgba(14,11,9,.62)";
    g.fill();
  }

  /* 철판 위에서만 일어나는 것들 — 기름막, 눌어붙은 자국, 열기 */
  function drawPanFx(g, t) {
    const p = LAY.pan, k = S.panTemp;
    if (k > 0.08) {
      const gr = g.createRadialGradient(p.x, p.y, p.rx * 0.2, p.x, p.y, p.rx);
      gr.addColorStop(0, "rgba(232,106,38," + (0.1 * k).toFixed(3) + ")");
      gr.addColorStop(1, "rgba(200,60,14,0)");
      ell(g, p.x, p.y, p.rx, p.ry);
      g.fillStyle = gr; g.fill();
    }
    g.save();
    ell(g, p.x, p.y, p.rx * 0.98, p.ry * 0.98);
    g.clip();
    for (const o of S.oils) {
      const a2 = clamp(o.a * 2.2, 0, 0.4);
      if (!art(g, "oilSheen", o.x, o.y, o.r * 2.6, { alpha: a2, rot: o.rot || 0, squash: SQ }))
        { ell(g, o.x, o.y, o.r, o.r * SQ); g.fillStyle = "rgba(255,241,196,.2)"; g.fill(); }
    }
    for (const m of S.mess) {
      const key = m.kind === "stuck" ? "stuck" : m.kind === "sugar" ? "caramel" : "leak";
      if (!art(g, key, m.x, m.y, m.r * 3.4, { alpha: 0.45 + m.burn * 0.5, rot: m.rot || 0, squash: SQ }))
        { ell(g, m.x, m.y, m.r, m.r * SQ); g.fillStyle = "rgba(120,70,22,.8)"; g.fill(); }
      if (m.burn > 0.35) {
        ell(g, m.x, m.y, m.r * 1.1, m.r * 0.8 * SQ);
        g.fillStyle = "rgba(20,14,8," + ((m.burn - 0.35) * 0.7).toFixed(3) + ")";
        g.fill();
      }
    }
    g.restore();
    /* 불꽃은 사진의 버너 자리에서 */
    if (k > 0.05) {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const x = p.x + (i - 1) * 96;
        const hgt = (10 + k * 26) * (0.7 + Math.sin(t * 9 + i * 2) * 0.3);
        ell(g, x, p.y + p.ry * 0.96, 26, hgt * 0.5);
        g.fillStyle = "rgba(96,160,232," + (0.14 + k * 0.2).toFixed(3) + ")";
        g.fill();
      }
    }
  }

  /* --- 호떡 -----------------------------------------------------
     모양을 PNG 로 바꿔 끼우지 않는다. 각도별 반지름과 두께를 그대로
     그려서, 찌그러짐과 터짐이 눈에 보이게 한다. */

  function blobPath(g, h, cx, cy, sc, squash) {
    const pts = [];
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * TAU;
      const r = h.R * h.rad[i] * sc;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * squash });
    }
    const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const m0 = mid(pts[NA - 1], pts[0]);
    g.beginPath();
    g.moveTo(m0.x, m0.y);
    for (let i = 0; i < NA; i++) {
      const p = pts[i], m = mid(p, pts[(i + 1) % NA]);
      g.quadraticCurveTo(p.x, p.y, m.x, m.y);
    }
    g.closePath();
    return pts;
  }

  function drawHotteokShape(g, h, cx, cy, sc) {
    const up = cookUp(h), dn = cookDown(h);
    const wall = Math.max(6, thickCm(h) * 8 * sc);
    /* 뒤집는 중이면 납작하게 눌러서 돈다 */
    const fk = h.flipT > 0 ? Math.max(0.12, Math.abs(Math.cos((1 - h.flipT) * Math.PI))) : 1;
    const wob = h.wobble > 0 ? 1 + Math.sin(h.wobble * 14) * 0.03 * h.wobble : 1;
    const sx = sc * fk * wob;

    g.save();
    g.translate(cx, cy);
    g.scale(fk * wob, wob);
    g.translate(-cx, -cy);

    /* 그림자 */
    ell(g, cx, cy + wall * 0.7, h.R * sc * 1.02, h.R * sc * SQ * 0.8);
    g.fillStyle = "rgba(31,27,22,.2)"; g.fill();

    /* 옆면 — 아래쪽 면 색이 비친다 (뒤집지 않아도 눈치챌 수 있게) */
    blobPath(g, h, cx, cy + wall, sc, SQ);
    g.fillStyle = cookColor(dn, 0.76); g.fill();
    stroke(g, C.ink, 5);

    /* 위쪽 면 */
    const pts = blobPath(g, h, cx, cy, sc, SQ);
    g.fillStyle = cookColor(up); g.fill();
    stroke(g, C.ink, 5);

    /* 표면 — 익을수록 갈색 점이 돈다 */
    g.save();
    blobPath(g, h, cx, cy, sc, SQ); g.clip();
    const spots = Math.round(norm01(up, 20, 95) * 16);
    g.fillStyle = cookColor(Math.min(130, up + 34), 0.9);
    for (let i = 0; i < spots; i++) {
      const a = (i * 2.399) % TAU, r = Math.sqrt((i + 1) / (spots + 1)) * h.R * sc * 0.86;
      ell(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r * SQ, 4 + (i % 3) * 2.2, 3 + (i % 3) * 1.6);
      g.fill();
    }
    /* 기름광 */
    if (h.oil > 0.12) {
      ell(g, cx - h.R * sc * 0.3, cy - h.R * sc * 0.3, h.R * sc * 0.34, h.R * sc * 0.18);
      g.fillStyle = "rgba(255,255,255," + clamp(h.oil * 0.22, 0, 0.3) + ")"; g.fill();
    }
    /* 설탕소 — 봉합이 덜 됐으면 그대로 보인다 */
    const show = clamp(1 - h.sealed, 0, 1);
    if (h.filling + h.fillLoose > 0.03 && show > 0.04) {
      for (const b of h.bits) {
        ell(g, cx + b.dx * sc, cy + b.dy * sc * SQ, b.r * sc, b.r * sc * 0.8);
        g.fillStyle = "rgba(107,63,22," + (0.35 + show * 0.6) + ")"; g.fill();
      }
    }
    /* 터진 금 */
    const crack = h.tear + h.burst;
    if (crack > 0.08) {
      const n = Math.min(5, 1 + Math.floor(crack * 5));
      g.strokeStyle = "rgba(60,34,14,.85)";
      g.lineWidth = 2.5 + crack * 2;
      for (let i = 0; i < n; i++) {
        const a = (i * 1.9) % TAU;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * h.R * sc * 0.25, cy + Math.sin(a) * h.R * sc * 0.25 * SQ);
        for (let k = 1; k <= 4; k++) {
          const rr = h.R * sc * (0.18 + k * 0.21);
          const aa = a + Math.sin(i * 3 + k) * 0.22;
          g.lineTo(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr * SQ);
        }
        g.stroke();
      }
    }
    g.restore();

    /* 오므린 자리 */
    if (h.sealed > 0.05) {
      g.strokeStyle = "rgba(31,27,22,.4)"; g.lineWidth = 3.5 * sc;
      const n = Math.min(h.sealMark.length, 14);
      for (let i = 0; i < n; i++) {
        const a = h.sealMark[h.sealMark.length - 1 - i].a;
        const r0 = h.R * sc * 0.76, r1 = h.R * sc * 0.95;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * SQ);
        g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * SQ);
        g.stroke();
      }
    }

    /* 터져 나온 설탕 / 샌 시럽이 옆에 굳어 있다 — 다 새어 버린 뒤에도 남는다 */
    if (h.fillPut > 0.05 && (h.burst > 0.2 || h.leak > 0.35)) {
      const n = Math.min(6, Math.floor(h.burst * 6 + h.leak * 4));
      for (let i = 0; i < n; i++) {
        const a = (i * 2.7) % TAU, rr = h.R * sc * rnd(0.95, 1.12);
        ell(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * SQ + wall * 0.6,
            7 * sc + i, 5 * sc + i * 0.6);
        g.fillStyle = "rgba(122,69,18,.9)"; g.fill();
      }
    }
    g.restore();
    return sx;
  }

  /* ------------------------------------------------------------
     상태에 맞는 그림 고르기
     ------------------------------------------------------------
     한 장만 쓰면 색이 뚝뚝 끊긴다. 이웃한 두 장을 겹쳐 섞어서
     생반죽 -> 노릇 -> 진갈색 -> 검정 이 천천히 넘어가게 한다. */
  const COOK_STOPS = [[0, "raw"], [34, "golden"], [66, "cooked"],
                      [96, "charred"], [130, "burnt"]];
  const FLAT_LADDER = ["doughPiece", "flat1", "flat2", "flat4", "flat5", "flat3", "flat"];

  function spriteMix(h) {
    /* 터진 호떡 그림에는 설탕이 흘러나온 모습이 들어 있다.
       그러니 '속이 실제로 들었고, 실제로 터졌고, 실제로 구워진' 때만 쓴다.
       맨 반죽을 아무리 눌러도 이 그림으로 바뀌지 않는다. */
    /* fillPut 으로 본다 — 속이 다 새어 나간 뒤에도 터진 자국은 남아야 한다 */
    if (h.fillPut > 0.1 && h.burst > 0.3 && Math.max(h.cookA, h.cookB) > 20)
      return { a: "burst", b: "burst", t: 0 };
    const up = cookUp(h);

    /* 찢어진 모습 — 구워진 뒤에만, 그리고 속을 넣은 적이 있을 때만.
       새 찢김 그림 세 장은 모두 갈색 시럽이 비어져 나온 모습이라,
       속을 넣은 적 없는 반죽에 쓰면 없던 설탕이 생겨 버린다.
       빈 반죽의 찢김은 지금까지처럼 둘레를 파낸 모양으로만 보인다. */
    if (h.tearStage > 0 && h.fillPut > 0.1 && up > 24) {
      const k = ["tearLight", "tearMedium", "tearHeavy"][h.tearStage - 1];
      if (IMG[k]) return { a: k, b: k, t: 0 };
    }

    if (up < 8) {
      const inside = h.filling + h.fillLoose;
      /* 얼마나 오므렸나로 생반죽 그림이 갈린다. 그림이 바뀔 뿐
         sealed 값은 건드리지 않는다 — 그림은 상태의 결과다. */
      if (inside > 0.1 && h.sealed >= CFG.sealTight && IMG.sealTight)
        return { a: "sealTight", b: "sealTight", t: 0 };
      if (inside > 0.1 && h.sealed >= CFG.sealOpen && IMG.sealLoose)
        return { a: "sealLoose", b: "sealLoose", t: 0 };
      /* 아직 오므리지도 않았으면 원래 쓰던 '속을 얹은 반죽' 그림 */
      if (inside > 0.1 && h.sealed >= 0.7) return { a: "sealed", b: "sealed", t: 0 };
      if (inside > 0.1) return { a: "filled", b: "filled", t: 0 };
      const f = clamp((1.05 - h.thickness) / 0.75, 0, 1) * (FLAT_LADDER.length - 1);
      const i = Math.min(FLAT_LADDER.length - 2, Math.floor(f));
      return { a: FLAT_LADDER[i], b: FLAT_LADDER[i + 1], t: clamp(f - i, 0, 1) };
    }
    for (let i = 0; i < COOK_STOPS.length - 1; i++) {
      if (up <= COOK_STOPS[i + 1][0]) {
        const t = (up - COOK_STOPS[i][0]) / (COOK_STOPS[i + 1][0] - COOK_STOPS[i][0]);
        return { a: COOK_STOPS[i][1], b: COOK_STOPS[i + 1][1], t: clamp(t, 0, 1) };
      }
    }
    return { a: "burnt", b: "burnt", t: 0 };
  }

  /* 각도별 반지름을 '그림이 들어갈 상자' 로 줄인다.
     평균을 내면 한쪽만 불룩한 것이 지워지므로 바깥 테두리를 쓴다.
     가운데가 치우친 만큼 cx/cy 가 생겨서, 한쪽으로 퍼진 호떡은
     그림도 그쪽으로 밀려 그려진다. */
  function extents(h) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * TAU, r = h.R * h.rad[i];
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { rx: (x1 - x0) / 2, ry: (y1 - y0) / 2,
             cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  function artBox(g, key, cx, cy, w, hgt, alpha, rot) {
    const im = IMG[key];
    if (!im) return false;
    g.save();
    if (alpha !== undefined) g.globalAlpha *= alpha;
    g.translate(cx, cy);
    if (rot) g.rotate(rot);
    g.drawImage(im, -w / 2, -hgt / 2, w, hgt);
    g.restore();
    return true;
  }

  function drawHotteok(g, h, cx, cy, sc) {
    const mix = spriteMix(h);
    if (!IMG[mix.a]) { drawHotteokShape(g, h, cx, cy, sc); return; }

    const e = extents(h);
    const fk = h.flipT > 0 ? Math.max(0.1, Math.abs(Math.cos((1 - h.flipT) * Math.PI))) : 1;
    const wob = h.wobble > 0 ? 1 + Math.sin(h.wobble * 14) * 0.03 * h.wobble : 1;
    /* 두꺼우면 카메라에 조금 가까워 보인다 */
    const fat = 1 + clamp((thickCm(h) - 1.8) * 0.05, -0.04, 0.12);
    /* 터지기 직전이면 눌린 쪽이 부풀어 오른다 (명세 31).
       모양값(rad)을 건드리지 않고 그릴 때만 부풀린다 — 압력이
       빠지면 도로 가라앉아야 하는 것이라 상태에 새기면 안 된다. */
    const risk = ruptureRisk(h);
    const swell = risk > 0.35 ? clamp((risk - 0.35) / 0.5, 0, 1) : 0;
    const breath = swell > 0 ? 1 + Math.sin(clock * 5) * 0.012 * swell : 1;

    const w = e.rx * 2 * sc * fk * wob * fat * breath;
    const hh = e.ry * 2 * sc * SQ * wob * fat * breath;
    /* 한쪽으로 퍼졌으면 그림도 그쪽으로 */
    cx += e.cx * sc * fk;
    cy += e.cy * sc * SQ;
    /* 뒤집는 동안에는 살짝 들렸다가 내려앉는다 */
    if (h.flipT > 0) cy -= Math.sin((1 - h.flipT) * Math.PI) * 46 * sc;
    /* 날이 충분히 들어가면 호떡이 날 위로 올라앉는다. 그림자와
       사이가 벌어져서 "걸렸다" 가 눈에 보인다. 모양값은 안 건드린다. */
    const lifted = !h.held && h.insert >= CFG.insertOK
                   ? (h.insert - CFG.insertOK) / (1 - CFG.insertOK) : 0;
    const liftPx = lifted * 15 * sc;

    /* 그림자 — 두꺼울수록 짙고 넓다. 들려 있으면 그림자는 철판에
       남으므로 몸통만 올라가고 사이가 벌어진다. */
    ell(g, cx, cy + hh * 0.42, w * 0.46, hh * 0.24);
    g.fillStyle = "rgba(0,0,0," + (0.13 + clamp(h.thickness, 0, 1) * 0.14 +
                                   lifted * 0.1).toFixed(3) + ")";
    g.fill();
    cy -= liftPx;

    /* 어떤 그림을 쓰든 상자는 rad[] 에서 나온다 — 그림이 바뀐다고
       지름이나 자리가 튀지 않는다. fit 은 사진마다 몸통이 상자를
       채우는 정도가 달라서 생기는 차이만 되돌린다. */
    const fa = artFit(mix.a);
    artBox(g, mix.a, cx, cy, w * fa, hh * fa, 1, h.spin || 0);
    if (mix.t > 0.01 && mix.b !== mix.a) {
      const fb = artFit(mix.b);
      artBox(g, mix.b, cx, cy, w * fb, hh * fb, mix.t, h.spin || 0);
    }

    /* 기름을 먹으면 번들거린다 */
    if (h.oil > 0.15 && IMG.oilSheen)
      artBox(g, "oilSheen", cx - w * 0.08, cy - hh * 0.1, w * 0.62, hh * 0.4,
             clamp(h.oil * 0.22, 0, 0.3), 0.4);

    /* 찢어지고 뜯긴 자국은 그림을 덧대지 않는다.
       반죽이 찢어진 모습을 담은 에셋이 없고, 있는 것(dough-stuck)은
       '철판에 눌어붙어 남은 반죽' 사진이라 호떡 위에 올리면 그림체가 깨진다.
       대신 찢긴 만큼 둘레를 실제로 파내서(tearBite) 사진이 들어가는 상자가
       일그러지게 했다. 철판에 남은 자국은 원래 쓰던 자리에 그대로 쓴다. */

    /* --- 터지기 전 신호 -------------------------------------------
       속이 쏠린 쪽(없으면 둘레 한 곳)이 먼저 간다. 금 -> 틈 -> 시럽
       순으로 짙어져서, 터지기 전에 손을 뗄 틈을 준다. */
    if (swell > 0) {
      const stage = riskStage(risk);
      const lean = h.fillOff > 0.1 ? Math.atan2(h.fillOffY, h.fillOffX)
                                   : h.leakSeed;
      /* 한쪽 볼록 — 쏠린 쪽 살이 한 겹 더 부푼다 */
      g.save();
      g.globalAlpha = 0.1 + swell * 0.16;
      ell(g, cx + Math.cos(lean) * w * 0.2, cy + Math.sin(lean) * hh * 0.2,
          w * 0.34, hh * 0.3);
      g.fillStyle = "rgba(255,228,170,1)";
      g.fill();
      g.restore();

      if (stage >= 2) {
        /* 갈라지는 금 — 봉합 주름과 헷갈리지 않게 테두리를 따라
           옆으로 긋는다. 주름은 가운데에서 바깥으로 뻗으므로,
           같은 방향으로 그으면 묻혀서 아무 신호도 못 준다. */
        const deep = stage >= 3 ? 1 : 0.5;
        const span = 0.26 + deep * 0.3;             /* 금이 벌어진 각도 */
        const rr = 0.44 + deep * 0.03;
        g.save();
        g.lineCap = "round";
        /* 밝은 살을 먼저 깔아 어두운 금이 떠 보이게 한다 */
        for (const [col, wid, off] of [["rgba(255,236,196,.55)", 2.6, -0.012],
                                       ["rgba(74,40,14,.85)", 1.9, 0]]) {
          g.beginPath();
          for (let i = 0; i <= 12; i++) {
            const a = lean - span / 2 + (span * i) / 12;
            const x = cx + Math.cos(a) * w * (rr + off);
            const y = cy + Math.sin(a) * hh * (rr + off);
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.strokeStyle = col;
          g.lineWidth = wid * (1 + deep) * sc * 2.2;
          g.stroke();
        }
        g.restore();
      }
      if (stage >= 3) {
        /* 틈으로 시럽이 비친다 — 아직 흘러내리지는 않는다 */
        const a = lean, k = 0.45 + (stage - 3) * 0.35;
        g.save();
        g.globalAlpha = k;
        ell(g, cx + Math.cos(a) * w * 0.44, cy + Math.sin(a) * hh * 0.44,
            w * 0.1, hh * 0.05);
        g.fillStyle = "#7A4512";
        g.fill();
        g.restore();
      }
    }

    /* 새어 나온 설탕 — 옆구리에 줄줄.
       넣은 적이 있어야만 그린다. 다 새어 버린 뒤에도 자국은 남는다. */
    if (h.fillPut > 0.02 && h.leak > 0.2) {
      /* 시럽은 옆구리에서 아래로 흐른다 */
      const n = Math.min(3, 1 + Math.floor(h.leak * 2));
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (0.22 + 0.56 * ((i + 0.5) / n)) + (h.leakSeed % 0.35);
        artBox(g, "leak", cx + Math.cos(a) * w * 0.4, cy + Math.sin(a) * hh * 0.46,
               w * 0.32, hh * 0.22, clamp(h.leak * 0.8, 0.22, 0.6), a - Math.PI / 2);
      }
    }
    /* 철판에 닿은 설탕이 끓는다 */
    if (h.fillPut > 0.02 && h.leak > 0.3 && h.onPan && S.panTemp > 0.25 && IMG.bubble) {
      const k = 0.5 + Math.sin(clock * 6) * 0.2;
      artBox(g, "bubble", cx + w * 0.4, cy + hh * 0.34, w * 0.34, hh * 0.26,
             clamp(h.leak * 0.8, 0, 0.75) * k, 0);
    }
  }

  /* 들고 있을 때는 조금 크게 그리고 아래에 그림자를 남긴다 */
  function drawHotteokWorld(g) {
    const h = S.h;
    if (!h) return;
    if (h.held || h.lift > 0) {
      ell(g, h.x, h.y + 46, h.R * 1.0, h.R * 0.4);
      g.fillStyle = "rgba(31,27,22,.14)"; g.fill();
      drawHotteok(g, h, h.x, h.y - 26, 1.1);
    } else {
      drawHotteok(g, h, h.x, h.y, 1);
    }
  }

  /* ============================================================
     지금 입력이 먹었나 — 조작의 손맛을 눈으로
     ============================================================
     게이지도 숫자도 띄우지 않는다. 방금 한 동작이 반죽의 어디에
     어떻게 들어갔는지를 그 자리에 잠깐 그려서 알린다. 전부 신호라
     0.3~0.6초 안에 사라지고, 상태값은 건드리지 않는다. */
  function drawFeel(g) {
    const h = S.h;
    if (!h) return;
    const R = avgR(h), cx = h.x, cy = h.y - (h.held || h.lift > 0 ? 26 : 0);

    /* --- 민 방향 ------------------------------------------------
       손이 지나간 쪽으로 반죽이 늘어난다. 늘어난 줄 몇 가닥으로
       "옮긴 게 아니라 편 것" 을 알린다. */
    if (h.push && h.push.t > 0) {
      const k = h.push.t * h.push.k;
      g.save();
      g.globalAlpha = clamp(k * 0.55, 0, 0.5);
      g.strokeStyle = "#FFF1CE"; g.lineCap = "round";
      for (let i = -1; i <= 1; i++) {
        const a = h.push.a + i * 0.34;
        g.lineWidth = 7 - Math.abs(i) * 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3 * SQ);
        g.lineTo(cx + Math.cos(a) * R * (0.95 + k * 0.2),
                 cy + Math.sin(a) * R * (0.95 + k * 0.2) * SQ);
        g.stroke();
      }
      g.restore();
    }

    /* --- 아직 안 닫힌 쪽 ----------------------------------------
       네 쪽 가운데 덜 오므린 자리를 벌어진 틈으로 보여 준다.
       그 쪽을 가운데로 당기면 틈이 그만큼 좁아지고, 다 닫히면
       사라진다. 숫자를 외울 필요가 없다. */
    const inside = h.filling + h.fillLoose;
    if (inside > 0.05 && h.sealed < 1 && !h.held) {
      g.save();
      g.lineCap = "round";
      for (let q = 0; q < 4; q++) {
        const open = clamp((0.62 - h.sealDirs[q]) / 0.62, 0, 1);
        if (open < 0.08) continue;
        const a0 = q * (Math.PI / 2);
        const span = 0.5 + open * 0.52;
        const pulse = 0.72 + Math.sin(clock * 3.4 + q) * 0.22;
        /* 반죽은 밝다. 밝은 노란 선만 올리면 묻히므로 어두운 선을
           먼저 깔고 그 위에 올린다 — 터지기 전 금과 같은 수법이다. */
        for (const [col, wid, aa] of [["rgba(52,32,12,.75)", 11, 1],
                                      ["#F7C843", 6, 1]]) {
          g.globalAlpha = clamp(open * pulse * aa, 0, 0.9);
          g.strokeStyle = col;
          g.lineWidth = wid * (0.6 + open * 0.6);
          g.beginPath();
          for (let i = 0; i <= 10; i++) {
            const a = a0 - span / 2 + (span * i) / 10;
            const x = cx + Math.cos(a) * R * 1.06, y = cy + Math.sin(a) * R * 1.06 * SQ;
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
        }
        /* 어디로 모아야 하는지 — 가운데를 향한 짧은 화살 */
        g.globalAlpha = clamp(open * pulse, 0, 0.9);
        g.strokeStyle = "#F7C843";
        g.lineWidth = 5;
        const ax = Math.cos(a0), ay = Math.sin(a0) * SQ;
        const tipx = cx + ax * R * 0.72, tipy = cy + ay * R * 0.72;
        g.beginPath();
        g.moveTo(cx + ax * R * 1.0, cy + ay * R * 1.0);
        g.lineTo(tipx, tipy);
        g.moveTo(tipx, tipy);
        g.lineTo(tipx + Math.cos(a0 + 2.5) * R * 0.14,
                 tipy + Math.sin(a0 + 2.5) * R * 0.14 * SQ);
        g.moveTo(tipx, tipy);
        g.lineTo(tipx + Math.cos(a0 - 2.5) * R * 0.14,
                 tipy + Math.sin(a0 - 2.5) * R * 0.14 * SQ);
        g.stroke();
      }
      g.restore();
    }
    /* 막 닫혔다 — 한 바퀴 돌고 사라지는 테 */
    if (h.sealFlash > 0) {
      g.save();
      g.globalAlpha = h.sealFlash * 0.75;
      g.strokeStyle = "#FFE9A8";
      g.lineWidth = 4 + h.sealFlash * 7;
      ell(g, cx, cy, R * (1.04 + (1 - h.sealFlash) * 0.22),
                     R * (1.04 + (1 - h.sealFlash) * 0.22) * SQ);
      g.stroke();
      g.restore();
    }

    /* --- 들어 올리는 중 -------------------------------------------
       가만히 쥐고 있으면 고리가 조여든다. 다 조여들면 호떡이 들린다.
       그전에 손을 밀면 펴는 쪽이 된다. */
    if (h.liftHint > 0 && !h.held) {
      const k = h.liftHint;
      g.save();
      g.globalAlpha = 0.25 + k * 0.5;
      g.strokeStyle = "#CFE8B8"; g.lineWidth = 4 + k * 4;
      const rr = R * (1.5 - k * 0.42);
      ell(g, cx, cy, rr, rr * SQ);
      g.stroke();
      g.restore();
    }

    /* --- 누르개가 닿았다 / 알맞은 두께 --------------------------- */
    if (h.pressRing > 0) {
      g.save();
      g.globalAlpha = h.pressRing * 0.5;
      g.strokeStyle = "#FFF1CE"; g.lineWidth = 5;
      ell(g, cx, cy, R * (0.5 + (1 - h.pressRing) * 0.6),
                     R * (0.5 + (1 - h.pressRing) * 0.6) * SQ);
      g.stroke();
      g.restore();
    }
    if (h.thickGood > 0) {
      g.save();
      g.globalAlpha = h.thickGood * 0.3;
      ell(g, cx, cy, R * 1.12, R * 1.12 * SQ);
      g.fillStyle = "#FFE9A8"; g.fill();
      g.restore();
    }

    /* --- 뒤집개가 들어간 깊이 -----------------------------------
       날이 호떡 밑으로 얼마나 들어갔는지를 그려 준다. 충분히
       들어가면 그쪽 가장자리가 날 위로 올라앉는다. */
    if (!h.held && h.insert > 0.04 && S.active === "flip") {
      const a = h.insertAng === undefined ? Math.PI : h.insertAng;
      const deep = clamp(h.insert, 0, 1);
      const enough = h.insert >= CFG.insertOK;
      /* 뒤집개 그림이 호떡 위를 덮으므로, 들어간 깊이는 호떡 바깥
         테두리를 따라 그린다. 호를 반대쪽으로 한 바퀴 돌리는 길이가
         곧 들어간 깊이다 — 숫자가 아니라 길이로 읽는다. */
      const span = Math.PI * 1.7 * deep;
      g.save();
      g.lineCap = "round";
      g.globalAlpha = 0.45;
      g.strokeStyle = "rgba(30,20,8,.9)"; g.lineWidth = 13;
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const ang = a - span / 2 + (span * i) / 24;
        const x = cx + Math.cos(ang) * R * 1.14, y = cy + Math.sin(ang) * R * 1.14 * SQ;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.globalAlpha = enough ? 0.95 : 0.7;
      g.strokeStyle = enough ? "#CFE8B8" : "#F7C843";
      g.lineWidth = enough ? 8 : 6;
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const ang = a - span / 2 + (span * i) / 24;
        const x = cx + Math.cos(ang) * R * 1.14, y = cy + Math.sin(ang) * R * 1.14 * SQ;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.restore();
    }

    /* --- 막 착지했다 --------------------------------------------- */
    if (h.landT > 0) {
      g.save();
      g.globalAlpha = h.landT * 0.4;
      g.strokeStyle = "#FFF1CE"; g.lineWidth = 4;
      ell(g, h.x, h.y, R * (1 + (1 - h.landT) * 0.5), R * (1 + (1 - h.landT) * 0.5) * SQ);
      g.stroke();
      g.restore();
    }
  }

  /* --- 숟가락 조준 ------------------------------------------------
     어디에 떨어질지를 붓기 전에 보여 준다. 숟가락 끝은 손끝보다
     위에 있으므로 손가락에 가리지 않는다. 가운데를 벗어나면 그만큼
     밖으로 흐른다는 것을 고리 색으로 미리 알린다. */
  function drawAim(g) {
    if (S.active !== "spoon" || S.spoonLoad <= 0.02) return;
    const pos = S.toolPos.spoon;
    if (!pos) return;
    const t = { x: pos.x + TIP.spoon.x, y: pos.y + TIP.spoon.y };
    const h = S.h;
    const on = h && !h.held && Math.hypot(t.x - h.x, t.y - h.y) < avgR(h) * 1.25;
    const off = on ? Math.hypot(t.x - h.x, t.y - h.y) / Math.max(1, avgR(h)) : 2;
    const spill = clamp((off - 0.55) / 0.7, 0, 0.6);
    g.save();
    /* 반죽 위라면 '여기까지는 안 흘러내린다' 는 선을 먼저 보여 준다.
       0.55R 이라는 숫자를 외우게 하는 대신 눈으로 알게 한다. */
    if (h && !h.held) {
      const safe = avgR(h) * 0.55;
      g.globalAlpha = 0.32;
      g.strokeStyle = "#FFF1CE"; g.lineWidth = 3;
      g.setLineDash([12, 12]);
      ell(g, h.x, h.y, safe, safe * SQ);
      g.stroke();
      g.setLineDash([]);
    }
    /* 떨어질 자리 — 숟가락 그림에 가리지 않게 넉넉히 크게 그리고,
       밝은 반죽 위에서도 읽히게 어두운 선을 먼저 깐다.
       고리 크기가 곧 담긴 양이다. */
    const r = 30 + S.spoonLoad * 26;
    const col = !on ? "#C9C4BA" : spill > 0.05 ? "#E8732B" : "#F7C843";
    g.globalAlpha = 0.5;
    g.strokeStyle = "rgba(42,26,10,.8)"; g.lineWidth = 11;
    ell(g, t.x, t.y, r, r * SQ);
    g.stroke();
    g.globalAlpha = 0.9;
    g.strokeStyle = col; g.lineWidth = 5;
    ell(g, t.x, t.y, r, r * SQ);
    g.stroke();
    /* 가운데를 벗어났으면 그만큼 밖으로 흐른다 — 붓기 전에 알린다 */
    if (on && spill > 0.05) {
      g.globalAlpha = 0.85;
      g.font = "700 26px Pretendard, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "#E8732B";
      g.fillText("흘러내림", t.x, t.y - r * SQ - 22);
    }
    g.restore();
  }

  /* --- 철판에 닿는 순간 ------------------------------------------ */
  function drawPanRing(g) {
    const r = S.panRing;
    if (!r) return;
    g.save();
    g.globalAlpha = r.t * 0.5;
    g.strokeStyle = "#FFF6E2";
    g.lineWidth = 3 + r.t * 6;
    const k = r.r * (1 + (1 - r.t) * 1.5);
    ell(g, r.x, r.y, k, k * SQ);
    g.stroke();
    g.restore();
  }

  /* --- 반죽판 ----------------------------------------------------
     사진에 없는 물건이라 직접 그린다. 뒤쪽 조리대 위, 반죽통과
     설탕통 사이. 여기서는 익지도 눌어붙지도 않는다 — 그래서 철판과
     한눈에 달라 보여야 한다. 뜨거운 쇠가 아니라 마른 나무다. */
  function drawBoard(g) {
    const b = LAY.board;
    g.save();
    /* 바닥 그림자 — 조리대에 얹혀 있다는 것을 먼저 보여 준다 */
    ell(g, b.x, b.y + b.ry * 0.5, b.rx * 1.02, b.ry * 0.38);
    g.fillStyle = "rgba(0,0,0,.42)"; g.fill();

    /* 옆면 — 두께가 있어야 조리대에 얹힌 판으로 보인다 */
    ell(g, b.x, b.y + 13, b.rx, b.ry);
    g.fillStyle = "#3A2411"; g.fill();

    const gr = g.createLinearGradient(b.x - b.rx * 0.4, b.y - b.ry, b.x + b.rx * 0.3, b.y + b.ry);
    gr.addColorStop(0, "#7E5227");
    gr.addColorStop(0.5, "#64401D");
    gr.addColorStop(1, "#452B13");
    ell(g, b.x, b.y, b.rx, b.ry);
    g.fillStyle = gr; g.fill();
    stroke(g, "rgba(38,23,9,.9)", 4);

    g.save();
    ell(g, b.x, b.y, b.rx * 0.985, b.ry * 0.985);
    g.clip();
    /* 나뭇결 */
    g.strokeStyle = "rgba(32,19,7,.3)"; g.lineWidth = 3;
    for (let i = -3; i <= 3; i++) {
      const y = b.y + i * (b.ry / 3.4);
      g.beginPath();
      g.moveTo(b.x - b.rx, y);
      g.quadraticCurveTo(b.x, y + 7, b.x + b.rx, y);
      g.stroke();
    }
    /* 조명은 사진과 같은 쪽에서 — 왼쪽 위가 밝다 */
    const lit = g.createRadialGradient(b.x - b.rx * 0.35, b.y - b.ry * 0.5, 10,
                                       b.x - b.rx * 0.35, b.y - b.ry * 0.5, b.rx * 1.2);
    lit.addColorStop(0, "rgba(255,206,130,.22)");
    lit.addColorStop(1, "rgba(255,206,130,0)");
    ell(g, b.x, b.y, b.rx, b.ry);
    g.fillStyle = lit; g.fill();
    /* 밀가루 자국 — 쓰던 판으로 보일 만큼만 */
    g.globalAlpha = 0.07;
    g.fillStyle = "#FFF6E2";
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7;
      ell(g, b.x + Math.cos(a) * b.rx * 0.52, b.y + Math.sin(a * 1.3) * b.ry * 0.42,
          20 + i * 4, 9 + i * 2);
      g.fill();
    }
    g.restore();

    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "700 24px Pretendard, sans-serif";
    g.fillStyle = "rgba(255,246,226,.34)";
    g.fillText("작업대", b.x, b.y + b.ry * 0.68);
    g.restore();
  }

  /* ============================================================
     주문서 — 화면 위쪽의 전용 자리
     ============================================================
     배경 사진은 밝고 어지럽다. 글자만 얹으면 간판과 조명에 묻히므로
     불투명한 종이 카드를 깔고 어두운 글자를 올린다. 자리는 조리에
     쓰이는 것이 하나도 없는 위쪽 띠(y 26~300)다 — 반죽통(y 360~)도
     설탕통(y 493~)도 작업대(y 556~)도 가리지 않는다.
     접었다 폈다 하지 않는다. 조리 중에 늘 보여야 하고, 여기를
     만지는 일이 도구를 집는 일과 부딪히면 안 되기 때문이다. */
  const CARD = { x: 26, y: 26, w: 648, h: 186 };
  function drawOrderCard(g) {
    const o = S.order;
    if (!o) return;
    /* 시작 전에는 주문서가 아직 올라오지 않았다. 막으로 덮는 것이
       아니라 그리지 않는다 — 시작 안내 뒤로 비쳐 보이면 안 된다. */
    if (!S.running) return;
    const c = CARD;
    g.save();
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    /* 바닥 그림자 — 사진 위에 올려놓은 종이로 보이게 */
    g.fillStyle = "rgba(0,0,0,.42)";
    g.fillRect(c.x + 6, c.y + 8, c.w, c.h);
    g.fillStyle = "#F7EEDA";
    g.fillRect(c.x, c.y, c.w, c.h);
    g.strokeStyle = "#C6B894"; g.lineWidth = 6;
    g.strokeRect(c.x + 3, c.y + 3, c.w - 6, c.h - 6);

    g.fillStyle = "#96835E";
    g.font = "800 30px Pretendard, sans-serif";
    g.fillText("주  문  서", c.x + 30, c.y + 50);
    g.fillStyle = "#2A241C";
    g.font = "800 54px Pretendard, sans-serif";
    g.fillText(o.name, c.x + 30, c.y + 112);
    g.fillStyle = "#6B5F49";
    g.font = "700 32px Pretendard, sans-serif";
    g.fillText(o.cond, c.x + 30, c.y + 158);

    /* 시작 직후 한 번 — 아까 읽은 주문이 여기로 왔다는 표시 */
    if (S.orderGlow > 0) {
      const k = S.orderGlow;
      g.globalAlpha = clamp(k, 0, 1) * (0.55 + Math.sin(clock * 11) * 0.35);
      g.strokeStyle = "#F7C843";
      g.lineWidth = 8;
      const pad = 6 + (1 - k) * 10;
      g.strokeRect(c.x - pad, c.y - pad, c.w + pad * 2, c.h + pad * 2);
    }
    g.restore();
  }

  /* --- 지금 할 일 -------------------------------------------------
     주문서가 "무엇을 만드나" 라면 이 줄은 "지금 무엇을 하나" 다.
     그래서 생김새를 일부러 반대로 둔다 — 밝은 종이 / 어두운 띠.
     잠깐 떴다 사라지는 토스트가 아니라 할 일이 바뀔 때까지 남는다. */
  function drawTodo(g) {
    if (S.done || !S.running) return;
    const t = guideText();
    if (!t) return;
    const y = CARD.y + CARD.h + 18;
    g.save();
    g.textAlign = "left"; g.textBaseline = "middle";
    g.font = "700 40px Pretendard, sans-serif";
    const w = g.measureText(t).width + 54;
    g.fillStyle = "rgba(18,13,9,.88)";
    g.fillRect(CARD.x, y, w, 62);
    g.fillStyle = "#F7C843";
    g.fillRect(CARD.x, y, 8, 62);
    g.fillStyle = "#FFF6E2";
    g.fillText(t, CARD.x + 28, y + 33);
    g.restore();
  }

  /* --- 통 / 접시 / 노브 ------------------------------------------ */
  /* 노브는 사진에 있다. 지금 세기만 작은 눈금으로 얹는다. */
  function drawKnob(g) {
    const k = LAY.knob;
    const a0 = -Math.PI * 1.25, a1 = a0 + S.heat * Math.PI * 1.5;
    g.strokeStyle = "rgba(232,115,43,.75)";
    g.lineWidth = 5; g.lineCap = "round";
    g.beginPath();
    g.arc(k.x, k.y, k.r + 11, a0, a1);
    g.stroke();
    g.beginPath();
    g.moveTo(k.x + Math.cos(a1) * (k.r * 0.3), k.y + Math.sin(a1) * (k.r * 0.3));
    g.lineTo(k.x + Math.cos(a1) * (k.r + 5), k.y + Math.sin(a1) * (k.r + 5));
    g.stroke();
    g.lineCap = "butt";
  }

  /* --- 도구 ------------------------------------------------------
     그림마다 '일하는 끝' 이 어디인지 정해 두고 그 점을 손끝(+TIP) 에
     맞춘다. 제자리에 있을 때는 배경 사진이 보여 주므로 안 그린다. */
  const TOOL_ART = {
    press: { key: "press",      w: 188, ax: 0.50, ay: 0.84, rot: 0 },
    flip:  { key: "spatula",    w: 118, ax: 0.50, ay: 0.95, rot: Math.PI },
    tong:  { key: "tongsOpen",  w: 250, ax: 0.12, ay: 0.84, rot: 2.3 },
    spoon: { key: "spoonEmpty", w: 215, ax: 0.14, ay: 0.44, rot: Math.PI / 2 },
    oil:   { key: "oilBottle",  w: 100, ax: 0.50, ay: 0.08, rot: 2.5 },
  };

  function toolSprite(id) {
    const a = TOOL_ART[id];
    if (!a) return null;
    if (id === "tong" && S.h && S.h.held && S.active === "tong")
      return { key: "tongsShut", w: a.w, ax: 0.10, ay: 0.86, rot: a.rot };
    if (id === "spoon" && S.spoonLoad > 0.02)
      return { key: "spoonFull", w: 112, ax: 0.50, ay: 0.16, rot: 0 };
    return a;
  }

  /* 에셋이 없을 때만 쓰는 도형 도구 — 깨진 그림 대신 */
  function toolArt(g, id, x, y, held) {
    g.save();
    g.translate(x, y);
    if (held) g.scale(1.08, 1.08);
    g.lineCap = "round";
    if (id === "press") {
      box(g, -13, -104, 26, 84); g.fillStyle = C.wood; g.fill(); stroke(g, "#15120F", 5);
      ell(g, 0, 0, 82, 29); g.fillStyle = C.steel; g.fill(); stroke(g, "#15120F", 6);
    } else if (id === "flip") {
      box(g, -10, -16, 20, 84); g.fillStyle = "#2A241E"; g.fill();
      g.beginPath();
      g.moveTo(-42, -14); g.lineTo(42, -14); g.lineTo(36, -92); g.lineTo(-36, -92);
      g.closePath();
      g.fillStyle = C.steel; g.fill(); stroke(g, "#15120F", 6);
    } else if (id === "tong") {
      const open = S.h && S.h.held && S.active === "tong" ? 12 : 26;
      g.strokeStyle = C.steel; g.lineWidth = 18;
      g.beginPath(); g.moveTo(-8, 54); g.quadraticCurveTo(-open, -20, -open - 4, -80); g.stroke();
      g.beginPath(); g.moveTo(8, 54); g.quadraticCurveTo(open, -20, open + 4, -80); g.stroke();
    } else if (id === "spoon") {
      box(g, -8, -24, 16, 80); g.fillStyle = C.steel; g.fill(); stroke(g, "#15120F", 4);
      ell(g, 0, -56, 36, 27); g.fillStyle = C.steel; g.fill(); stroke(g, "#15120F", 6);
      if (S.spoonLoad > 0.02) {
        const k = clamp(S.spoonLoad / 1.5, 0, 1);
        ell(g, 0, -58, 11 + 16 * k, 8 + 11 * k);
        g.fillStyle = "#6B3F16"; g.fill();
      }
    } else if (id === "oil") {
      box(g, -22, -70, 44, 92); g.fillStyle = "#E6C878"; g.fill(); stroke(g, "#15120F", 5);
      box(g, -8, -92, 16, 24); g.fillStyle = C.steel; g.fill(); stroke(g, "#15120F", 4);
    }
    g.lineCap = "butt";
    g.restore();
  }

  /* held 면 손끝에 맞춰, 아니면 제자리에 놓인 모습으로 */
  function drawTool(g, id, x, y, held) {
    const a = toolSprite(id);
    if (!a || !IMG[a.key]) { toolArt(g, id, x, y, held); return; }
    const k = held ? 1.06 : 1;
    if (held) {
      const t = TIP[id] || { x: 0, y: 0 };
      artAt(g, a.key, x + t.x, y + t.y, a.w * k, a.ax, a.ay, a.rot);
      /* 숟가락 그림은 "담겼다 / 비었다" 두 장뿐이라 양이 안 보인다.
         담긴 만큼 설탕 더미를 얹어서 반 술과 한 술을 구별하게 한다. */
      if (id === "spoon" && S.spoonLoad > 0.02) {
        const q = clamp(S.spoonLoad / 1.5, 0, 1);
        g.save();
        g.globalAlpha = 0.85;
        ell(g, x + t.x, y + t.y + 4, 9 + 17 * q, (6 + 11 * q) * 0.8);
        g.fillStyle = "#6B3F16"; g.fill();
        g.restore();
      }
    } else {
      art(g, a.key, x, y, a.w, { rot: a.restRot === undefined ? a.rot : a.restRot });
    }
  }

  /* 지금 할 수 있는 일이 어디 있는지 — "이제 ~하세요" 대신 약한 맥동으로.
     강제하지 않는다. 다른 걸 해도 된다. */
  /* 철판에 기름이 깔려 있나 — 한 점이 아니라 가운데 쪽 전체로 본다 */
  function panOiled() {
    const p = LAY.pan;
    let s = oilAt(p.x, p.y);
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2);
      s += oilAt(p.x + Math.cos(a) * p.rx * 0.45, p.y + Math.sin(a) * p.ry * 0.45);
    }
    return s / 5;
  }

  /* ------------------------------------------------------------
     지금 할 수 있는 일이 어디 있는지
     ------------------------------------------------------------
     권장 경로일 뿐 강제가 아니다. 다른 걸 해도 되고, 순서를 바꿔도
     막지 않는다. 다만 안내가 가리키는 쪽은 실제 상태와 맞아야 한다 —
     시킨 대로 했는데 결과에서 그 일로 깎이면 안내가 아니라 함정이다.

     준비(철판 밖) 와 조리(철판 위) 를 갈라서 본다. */
  function hintTarget() {
    const h = S.h;
    if (S.done) return null;
    if (!h) return "dough";
    if (h.held) return null;

    if (!h.onPan) {
      /* --- 준비 공간 --- */
      if (!h.onBoard && h.fillPut < 0.1) return "board";
      /* 속이 들어간 뒤에는 "더 펴라" 고 하지 않는다 — 그 말을 따르면
         설탕이 밀려 나온다. 먼저 오므리라고 알려 주는 쪽이 맞다. */
      if (h.fillPut < 0.1) return h.thickness > FLAT_ENOUGH ? "hand" : "spoon";
      if (h.sealed < 0.6) return "seal";
      /* 기름은 반죽을 올리기 전에 둘러야 한다. 올린 뒤에 두르면
         이미 눌어붙기 시작한 뒤다. */
      /* 들러붙는 문턱(oilGood)보다 조금 느슨하게 본다. 이미 거의 다
         두른 사람에게 "기름부터 두르세요" 를 또 하면 잔소리가 된다. */
      if (panOiled() < CFG.oilGood * 0.7) return "oil";
      return "pan";
    }

    /* --- 철판 위 --- */
    if (S.panTemp < 0.12 && S.heat < 0.12) return "heat";
    /* 철판 위에서도 속을 넣고 오므릴 수 있다 — 준비 공간은 권장이지
       강제가 아니다. 다만 그동안 아래쪽은 계속 익는다. */
    if (h.fillPut < 0.1) return h.thickness > FLAT_ENOUGH ? "press" : "spoon";
    if (h.sealed < 0.6) return "seal";
    /* 더 누르라는 말은 정말 두꺼울 때만 한다. 적정 구간에 들어온
       호떡에게까지 "더 누르세요" 라고 하면 두께에 정답이 하나뿐인
       것처럼 몰아가게 된다. 도톰한 호떡도 호떡이다.
       주문이 있으면 그 주문이 멈출 자리를 정한다 — "작고 도톰하게"
       를 시켜 놓고 얇게 누르라고 하면 안내가 주문과 싸운다. */
    if (thickCm(h) > thickTarget()) return "press";
    const dn = cookDown(h), up = cookUp(h);
    if (dn > 44 && up > 44) {
      /* 양면이 다 노릇해졌다. 그렇다고 다 된 것이 아니다 —
         두껍게 만든 호떡은 여기서 속이 아직 반죽이다. 겉만 보고
         접시로 보내라고 하면, 결과 화면이 곧바로 "속이 덜 익었다"
         고 말하게 된다. 그 어긋남을 여기서 막는다. */
      if (coreRatio(h) < 0.8 && Math.max(dn, up) < 104) return "slow";
      return "tong";
    }
    if (dn > 45) return "flip";
    return null;
  }

  /* 짧은 안내 한 줄 */
  const GUIDE = {
    dough: "반죽통에서 반죽을 떼어 작업대에 놓으세요",
    board: "떼어낸 반죽을 작업대에 놓으세요",
    hand:  "반죽을 문질러 펼치세요",
    spoon: "숟가락으로 속을 떠서 가운데에 넣으세요",
    seal:  "벌어진 가장자리를 가운데로 모으세요",
    oil:   "철판에 기름을 두르세요",
    pan:   "반죽을 철판으로 옮기세요",
    heat:  "노브를 돌려 불을 올리세요",
    press: "누르개로 살짝 눌러주세요",
    flip:  "뒤집개를 충분히 넣고 뒤집으세요",
    slow:  "겉은 익었어요. 불을 낮춰 속까지 익혀주세요",
    tong:  "완성됐어요. 집게로 접시에 담으세요",
  };
  function guideText() {
    const k = hintTarget();
    return k ? GUIDE[k] || "" : "";
  }

  function drawHintPulse(g, t) {
    const key = hintTarget();
    if (!key) return;
    const k = 0.07 + Math.sin(t * 3.2) * 0.05;
    if (k <= 0) return;
    g.strokeStyle = "rgba(247,200,67," + k.toFixed(3) + ")";
    g.lineWidth = 5;
    if ((key === "seal" || key === "hand") && S.h) {
      circle(g, S.h.x, S.h.y, avgR(S.h) * 1.35);
      g.stroke();
    } else if (key === "pan") {
      ell(g, LAY.pan.x, LAY.pan.y, LAY.pan.rx * 0.9, LAY.pan.ry * 0.9);
      g.stroke();
    } else if (key === "board") {
      ell(g, LAY.board.x, LAY.board.y, LAY.board.rx * 0.96, LAY.board.ry * 0.96);
      g.stroke();
    } else if (key === "dough") {
      ell(g, LAY.dough.x, LAY.dough.y, LAY.dough.rx * 1.05, LAY.dough.ry * 1.05);
      g.stroke();
    } else if (key === "heat" || key === "slow") {
      circle(g, LAY.knob.x, LAY.knob.y, LAY.knob.r + 22);
      g.stroke();
    } else if (S.active !== key) {
      const tl = TOOL[key];
      if (!tl) return;
      circle(g, tl.home.x, tl.home.y + 4, 66);
      g.stroke();
    }
  }

  /* 노릇해지면 뒤집개 자리가 아주 약하게 흔들린다 (명세 7 / 30) */
  function toolNudge(id, t) {
    if (S.active === id) return 0;
    if (id === "flip" && S.h && S.h.onPan && !S.h.held && cookDown(S.h) > 46)
      return Math.sin(t * 7) * 3;
    return 0;
  }

  /* --- 떼어내는 중인 반죽 ---------------------------------------- */
  function drawTearing(g) {
    const grb = S.grab;
    if (!grb || grb.kind !== "tear") return;
    const b = LAY.dough;
    const r = 18 + grb.amount * 26;
    const ang = Math.atan2(grb.y - b.y, grb.x - b.x) - Math.PI / 2;
    /* 늘어난 반죽 그림이 있으면 그것만으로 충분하다 */
    if (art(g, "strand", grb.x, grb.y - r * 0.5, r * 3.4, { rot: ang })) return;

    const mx = (b.x + grb.x) / 2, my = (b.y + grb.y) / 2;
    const d = Math.hypot(grb.x - b.x, grb.y - b.y);
    const w = Math.max(7, 34 - d * 0.1);
    g.strokeStyle = "#F7EBCF"; g.lineWidth = w; g.lineCap = "round";
    g.beginPath();
    g.moveTo(b.x, b.y);
    g.quadraticCurveTo(mx, my + 18, grb.x, grb.y);
    g.stroke();
    g.lineCap = "butt";
    ell(g, grb.x, grb.y, r, r * 0.88);
    g.fillStyle = "#F7EBCF"; g.fill(); stroke(g, "#15120F", 5);
  }

  /* --- 입자 ------------------------------------------------------ */
  function drawParts(g) {
    for (const p of S.parts) {
      const k = 1 - p.life / p.max;
      if (p.kind === "smoke" || p.kind === "steam") {
        circle(g, p.x, p.y, p.r);
        g.fillStyle = (p.col || "rgba(170,160,150,.4)").replace(/[\d.]+\)$/, (k * 0.45).toFixed(2) + ")");
        g.fill();
      } else if (p.kind === "bubble") {
        circle(g, p.x, p.y, p.r * k);
        g.fillStyle = p.col || "rgba(255,255,255,.7)"; g.fill();
      } else {
        circle(g, p.x, p.y, p.r * (0.4 + k * 0.6));
        g.fillStyle = p.col || "#D8C9AA"; g.fill();
      }
    }
  }

  /* --- 짧은 한 줄 ------------------------------------------------ */
  function drawHint(g) {
    g.textAlign = "center"; g.textBaseline = "middle";
    if (S.hintT > 0 && S.hint) {
      const a = clamp(S.hintT / 0.5, 0, 1);
      g.globalAlpha = a;
      g.fillStyle = "rgba(31,27,22,.9)";
      g.font = "700 30px Pretendard, sans-serif";
      const w = g.measureText(S.hint).width + 56;
      g.beginPath();
      g.rect(W / 2 - w / 2, 1412, w, 60);
      g.fill();
      g.fillStyle = C.cream;
      g.fillText(S.hint, W / 2, 1442);
      g.globalAlpha = 1;
    }
    if (S.toastT > 0 && S.toast) {
      const a = clamp(S.toastT / 0.4, 0, 1);
      g.globalAlpha = a;
      g.font = "800 38px Pretendard, sans-serif";
      g.fillStyle = "rgba(232,115,43,.95)";
      g.fillText(S.toast, W / 2, LAY.pan.y - LAY.pan.ry - 56);
      g.globalAlpha = 1;
    }
  }

  /* --- 한 장 그리기 ---------------------------------------------- */
  let clock = 0;
  function draw() {
    if (!ctx) return;
    const g = ctx;
    g.setTransform(VIEW.dpr, 0, 0, VIEW.dpr, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = C.counter;
    g.fillRect(0, 0, cv.width, cv.height);
    /* 카메라 — 크게 터질 때만 아주 짧게 흔든다. 조리 중에 화면이
       계속 움직이면 도구를 겨냥할 수가 없다. 2~4px 안쪽, 0.25초. */
    let shx = 0, shy = 0;
    if (S.shake > 0) {
      const k = S.shake * 4;
      shx = Math.sin(clock * 97) * k;
      shy = Math.cos(clock * 83) * k;
    }
    g.setTransform(VIEW.dpr * VIEW.s, 0, 0, VIEW.dpr * VIEW.s,
                   VIEW.dpr * (VIEW.ox + shx), VIEW.dpr * (VIEW.oy + shy));

    /* 배경 사진 -> 철판 위 효과 -> 음식 -> 손에 든 도구 -> UI */
    drawBackdrop(g);
    drawBoard(g);
    drawEmptySlots(g);
    drawPanFx(g, clock);
    drawPanRing(g);
    drawKnob(g);
    /* 철판 위 호떡 -> 조작 신호 -> 들고 있는 호떡 -> 손에 든 도구 */
    if (S.h && !S.h.held) { drawHotteokWorld(g); drawFeel(g); }
    drawTearing(g);
    if (S.h && S.h.held) { drawHotteokWorld(g); drawFeel(g); }
    drawAim(g);
    if (S.active) {
      const p = S.toolPos[S.active];
      /* 누르고 있는 동안 누르개가 실제로 가라앉는다 — 닿기 전과
         누르는 중이 손에서 구별된다 */
      let sink = 0;
      if (S.active === "press" && S.grab && S.grab.kind === "tool" &&
          S.grab.tool === "press" && S.grab.hold)
        sink = Math.min(10, S.grab.hold * 16);
      drawTool(g, S.active, p.x + toolNudge(S.active, clock), p.y + sink, true);
    }
    drawParts(g);
    drawHintPulse(g, clock);
    /* UI 는 맨 위에 — 주문서와 지금 할 일은 무엇에도 가리지 않는다 */
    drawOrderCard(g);
    drawTodo(g);
    drawHint(g);
  }

  /* ============================================================
     만지기 — Pointer Events 하나로 PC 와 모바일을 같이 본다
     ============================================================
     누르고 있는 동안의 일(압력, 설탕 담기, 날 밀어 넣기)은 이벤트가
     아니라 루프에서 처리한다. 가만히 누르고만 있어도 압력이 쌓여야
     하고, 프레임이 흔들려도 같은 결과가 나와야 한다. */
  const PTR = { down: false, id: null, x: 0, y: 0, px: 0, py: 0, sp: 0 };

  /* 손가락 속도 고르기 — 프레임마다 같은 비율로 섞으면 30fps 와 120fps 에서
     같은 손짓이 다른 속도로 읽힌다. 시간 상수로 섞어야 결과가 같다. */
  const SP_TAU = 0.05;
  function smoothSpeed(cur, inst, dt) {
    const k = 1 - Math.exp(-Math.max(0, dt) / SP_TAU);
    return cur + (inst - cur) * k;
  }

  function tipOf(id, p) {
    const t = TIP[id] || { x: 0, y: 0 };
    return { x: p.x + t.x, y: p.y + t.y };
  }
  function inside(c, p, extra) {
    return Math.hypot(p.x - c.x, p.y - c.y) <= c.r + (extra || 0);
  }
  function hitTool(p) {
    let best = null, bd = 1e9;
    for (const t of TOOLS) {
      const d = Math.hypot(p.x - t.home.x, p.y - t.home.y);
      if (d <= t.hit && d < bd) { bd = d; best = t; }
    }
    return best;
  }
  function pickTool(id, p) {
    if (S.active && S.active !== id)
      S.toolPos[S.active] = { x: TOOL[S.active].home.x, y: TOOL[S.active].home.y };
    S.active = id;
    S.toolPos[id] = { x: p.x, y: p.y };
    S.grab = { kind: "tool", tool: id };
    SFX.tong();
    say(TOOL[id].hint, "pick_" + id);
  }
  function dropTool() {
    if (!S.active) return;
    S.toolPos[S.active] = { x: TOOL[S.active].home.x, y: TOOL[S.active].home.y };
    S.active = null; S.grab = null;
    SFX.drop();
  }

  function onDown(p) {
    audioUnlock();
    if (S.done || !S.running) return;
    if (S.hintT > 0.5) S.hintT = 0.5;

    /* 1) 도구 제자리 — 집기 / 내려놓기 / 바꾸기 */
    const t = hitTool(p);
    if (t) {
      if (S.active === t.id) dropTool();
      else pickTool(t.id, p);
      return;
    }

    /* 2) 들고 있는 도구의 일 */
    if (S.active) {
      S.toolPos[S.active] = { x: p.x, y: p.y };
      const id = S.active;
      if (id === "tong") {
        S.grab = { kind: "tool", tool: "tong", carry: tongGrab(p) };
      } else if (id === "spoon") {
        const tip = tipOf("spoon", p);
        if (inZone(LAY.fill, tip.x, tip.y, 1.05)) S.grab = { kind: "tool", tool: "spoon", scoop: true };
        /* 누르는 순간 쏟지 않는다. 누르고 있는 동안은 겨누는 중이고
           (drawAim 이 떨어질 자리를 고리로 보여 준다), 손을 뗄 때
           그 자리에 붓는다. 손가락은 호버가 없으므로, 이렇게 해야
           "어디에 들어갈지" 를 붓기 전에 볼 수 있다. */
        else S.grab = { kind: "tool", tool: "spoon", aim: true };
      } else {
        S.grab = { kind: "tool", tool: id };
      }
      return;
    }

    /* 3) 맨손 */
    if (Math.hypot(p.x - LAY.knob.x, p.y - LAY.knob.y) <= LAY.knob.r + 45) {
      S.grab = { kind: "knob", a0: Math.atan2(p.y - LAY.knob.y, p.x - LAY.knob.x) };
      say("돌려서 불을 조절하세요", "knob");
      return;
    }
    /* 설탕통을 누르면 거기 꽂힌 숟가락이 잡힌다 */
    if (inZone(LAY.fill, p.x, p.y, 1.05)) {
      pickTool("spoon", p);
      return;
    }
    /* 반죽통을 누르면 반죽을 뗀다 */
    if (inZone(LAY.dough, p.x, p.y, 1.0)) {
      if (S.h) { say("호떡 하나를 먼저 끝내세요", null); return; }
      tearStart(p);
      return;
    }
    const h = S.h;
    if (h && !h.held) {
      const R = avgR(h);
      const d = Math.hypot(p.x - h.x, p.y - h.y);
      if (d < R * 1.18) {
        S.grab = { kind: "touch", t: 0, moved: 0, inner: d < R * 0.52 };
        return;
      }
    }
    S.grab = null;
  }

  function touchStep(p, q, dt) {
    const h = S.h;
    if (!h) { S.grab = null; return; }
    const g = S.grab;
    g.t += dt;
    g.moved += Math.hypot(p.x - q.x, p.y - q.y);
    /* 아직 어느 쪽인지 안 갈렸다. 가만히 쥐고 있으면 들어 올리는
       쪽으로 가고, 밀면 펴는 쪽으로 간다 — 그 갈림을 고리로 보여
       준다. 안 보여 주면 옮기려다 펴 버리는 일이 계속 생긴다. */
    if (g.mode === undefined && g.moved <= 12)
      h.liftHint = clamp(g.t / 0.26, 0, 1);
    else h.liftHint = 0;
    if (g.mode === undefined) {
      if (g.moved > 12)
        g.mode = (!g.inner && h.fillPut > 0.05 && h.sealed < 1) ? "seal" : "spread";
      else if (g.t > 0.26) {
        if (canHandLift(h)) {
          g.mode = "carry";
          h.liftHint = 0;
          h.held = true; h.lift = 1;
          /* 맨손도 마찬가지다 — 붙어 있으면 뜯긴다 */
          if (h.onPan && tearOffPan(h, 1.1) > 0) toast("철판에 붙었다");
          h.onPan = false;
          SFX.plop(); buzz(10);
        } else {
          g.mode = "hot";
          toast("뜨겁다");
          say("집게로 집어 보세요", "usetong");
          spawn("smoke", p.x, p.y, 3, { sp: 10, rise: 26, r: 12, life: 0.9 });
        }
      }
    }
    if (g.mode === "spread") spreadAt(h, p, q.x, q.y);
    else if (g.mode === "seal") sealAt(h, p, q.x, q.y);
    else if (g.mode === "carry") { h.x = p.x; h.y = p.y; }
  }

  function knobStep(p) {
    const g = S.grab, k = LAY.knob;
    const a = Math.atan2(p.y - k.y, p.x - k.x);
    let d = a - g.a0;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    g.a0 = a;
    const nh = clamp(S.heat + d / (Math.PI * 1.5), 0, 1);
    if (Math.abs(nh - S.heat) > 0.03) SFX.knob();
    S.heat = nh;
  }

  function toolStep(p, q, dt) {
    const g = S.grab;
    switch (g.tool) {
      case "press": pressStep(p, dt); break;
      case "flip": {
        flipStep(p, dt);
        /* 깊이 넣었으면 살살 들어 올려도 넘어간다. 속도 하나로만 보면
           마우스로는 쉽고 손가락으로는 영영 안 넘어가는 판정이 된다.
           좌표는 가상(1080 폭) 이라 화면 크기와는 상관이 없다. */
        const ins = S.h ? S.h.insert : 0;
        const need = CFG.flickSpeed * (1 - clamp(ins, 0, 1) * 0.42);
        if (PTR.sp > need && S.h && !S.h.held && S.h.flipT <= 0 && S.h.insert > 0.02)
          doFlip(Math.atan2(p.y - q.y, p.x - q.x), PTR.sp);
        break;
      }
      case "tong":
        if (g.carry && S.h) { const t = tipOf("tong", p); dragHot(S.h, t.x, t.y); }
        break;
      case "oil": oilStep(p, q); break;
      case "spoon": {
        const t = tipOf("spoon", p);
        if (g.scoop && inZone(LAY.fill, t.x, t.y, 1.05)) scoopStep(dt);
        break;
      }
    }
  }

  function stepInput(dt) {
    const g = S.grab;
    if (!g || !PTR.down) return;
    const p = { x: PTR.x, y: PTR.y }, q = { x: PTR.px, y: PTR.py };
    if (g.kind === "tear") tearMove(p, dt);
    else if (g.kind === "carry") { if (S.h) dragHot(S.h, p.x, p.y); }
    else if (g.kind === "knob") knobStep(p);
    else if (g.kind === "touch") touchStep(p, q, dt);
    else if (g.kind === "tool") toolStep(p, q, dt);
  }

  /* 여기서 놓으면 쓸모가 있나? 없으면 도구는 제자리로 돌아간다. */
  function toolUseful(id, p) {
    const h = S.h;
    const onPan = inPan(p.x, p.y, 1.2);
    const onFood = h && Math.hypot(p.x - h.x, p.y - h.y) <= avgR(h) * 2.2;
    switch (id) {
      case "press":
      case "flip":  return onPan || onFood;
      case "tong":  return onPan || onFood ||
                    inZone(LAY.plate, p.x, p.y, 1.3);
      /* 숟가락은 철판에 설탕을 흘릴 수도 있으니 철판도 쓸 자리로 본다 */
      case "spoon": return onPan || onFood || inZone(LAY.fill, p.x, p.y, 1.6);
      case "oil":   return onPan;
    }
    return false;
  }

  function onUp(p) {
    const g = S.grab;
    PTR.down = false; PTR.id = null; PTR.sp = 0;
    if (!g) return;
    if (g.kind === "carry" || (g.kind === "touch" && g.mode === "carry")) {
      placeDown(p);
      S.grab = null;
      return;
    }
    if (g.kind === "tool" && g.tool === "tong" && g.carry) {
      placeDown(tipOf("tong", p));
      S.grab = { kind: "tool", tool: "tong" };
      return;
    }
    if (g.kind === "tear") { S.grab = null; return; }
    if (g.kind === "knob") { S.grab = null; return; }
    if (g.kind === "touch") { if (S.h) S.h.liftHint = 0; S.grab = null; return; }
    /* 누르개를 떼면 생반죽은 조금 돌아온다 */
    if (g.kind === "tool" && g.tool === "press") pressRelease(g);
    /* 숟가락은 손을 뗄 때 붓는다 — 겨눈 자리 그대로 */
    if (g.kind === "tool" && g.tool === "spoon" && g.aim) dumpFilling(tipOf("spoon", p));
    /* 쓸 만한 자리에서 놓으면 계속 들고 있고, 엉뚱한 데서 놓으면 제자리로.
       단 제자리에서 막 집은 참이면(아직 안 움직였으면) 그대로 들고 있는다. */
    if (g.kind === "tool") {
      const tl = TOOL[g.tool];
      const atRack = tl && Math.hypot(p.x - tl.home.x, p.y - tl.home.y) <= tl.hit;
      if (S.active && !atRack && !toolUseful(g.tool, p)) { dropTool(); return; }
      S.grab = { kind: "tool", tool: g.tool };
    }
  }

  function bindPointer() {
    if (!cv) return;
    cv.addEventListener("pointerdown", e => {
      if (PTR.down) return;
      const p = toVirtual(e.clientX, e.clientY);
      PTR.down = true; PTR.id = e.pointerId;
      PTR.x = p.x; PTR.y = p.y; PTR.px = p.x; PTR.py = p.y; PTR.sp = 0;
      /* 화면 밖으로 조금 나가도 도구를 놓치지 않게 */
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      cv.classList.add("grabbing");
      onDown(p);
      e.preventDefault();
    });
    cv.addEventListener("pointermove", e => {
      const p = toVirtual(e.clientX, e.clientY);
      if (!PTR.down) {
        /* 마우스는 누르지 않아도 도구가 따라온다 */
        if (S.active && e.pointerType === "mouse") S.toolPos[S.active] = { x: p.x, y: p.y };
        return;
      }
      if (PTR.id !== null && e.pointerId !== PTR.id) return;
      PTR.x = p.x; PTR.y = p.y;
      if (S.active) S.toolPos[S.active] = { x: p.x, y: p.y };
      e.preventDefault();
    });
    const end = e => {
      if (PTR.id !== null && e.pointerId !== PTR.id) return;
      const p = { x: PTR.x, y: PTR.y };
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
      cv.classList.remove("grabbing");
      onUp(p);
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("contextmenu", e => e.preventDefault());
  }

  /* ============================================================
     개발용 상태 패널
     ============================================================
     만들면서 숫자를 눈으로 확인하는 용도다. 기본은 숨어 있고
     ?debug=1 로 켜거나 D 키로 여닫는다. 게임 화면 위에 글자만
     얹으므로 조리대 그림에는 손대지 않는다. */
  const DBG = { on: false, el: null, t: 0 };

  function dbgInit() {
    DBG.el = $("dbg");
    try { DBG.on = /[?&]debug=1/.test(location.search); } catch (_) {}
    if (DBG.el) DBG.el.hidden = !DBG.on;
    window.addEventListener("keydown", e => {
      if (e.key !== "d" && e.key !== "D") return;
      DBG.on = !DBG.on;
      if (DBG.el) DBG.el.hidden = !DBG.on;
    });
  }

  function dbgPaint(dt) {
    if (!DBG.on || !DBG.el) return;
    DBG.t += dt;
    if (DBG.t < 0.1) return;              /* 초당 열 번이면 읽기에 충분하다 */
    DBG.t = 0;
    const h = S.h;
    const n = (v, d) => v.toFixed(d === undefined ? 2 : d);
    if (!h) {
      DBG.el.textContent = "반죽 없음   불 " + n(S.heat) + "   철판 " + n(S.panTemp);
      return;
    }
    DBG.el.textContent = [
      "doughSize      " + n(h.amount) + "   diameter " + n(diameterCm(h), 1) + "cm  thickness " + n(thickCm(h), 1) + "cm",
      "fillingAmount  " + n(h.filling) + "   put " + n(h.fillPut) + "  loose " + n(h.fillLoose) + "  spill " + n(h.fillSpill),
      "fillingPress   " + n(h.pressure) + "   sealStrength " + n(h.sealed) + "  opening " + n(1 - h.sealed),
      "oilAmount      " + n(h.contactOil) + "   stickiness " + n(h.stick),
      "pressCount     " + h.pressCount + "        pressTotal " + n(h.press),
      "tearAmount     " + n(h.tear) + "   burst " + n(h.burst) + "  scar " + n(h.scar) + "  leak " + n(h.leak),
      "cookFront      " + n(h.cookA, 0) + "      cookBack " + n(h.cookB, 0) + "  coreCook " + n(h.core, 0) + "  up " + h.up,
      "flipCount      " + h.flips + "        flipShock " + n(h.flipShock),
      "heatLevel      " + n(S.heat) + "   pan " + n(S.panTemp) + "  here " + n(heatAt(h.x, h.y)),
      "fillOffset     " + n(h.fillOff) + "   sugarUnder " + n(sugarAt(h.x, h.y)),
      "ruptureRisk    " + n(ruptureRisk(h)) + "   stage " + riskStage(ruptureRisk(h)) +
        "   moveRatio " + n(moveRatio(h)),
      "styleType      " + styleOf(h),
    ].join("\n");
  }

  /* ============================================================
     루프
     ============================================================ */
  let prev = 0, raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!prev) prev = now;
    /* 뒤로 가는 시간과 탭 전환으로 생기는 긴 틈을 막는다 */
    const dt = clamp((now - prev) / 1000 || 0, 0, 0.05);
    prev = now;
    clock += dt;

    if (!S.done && S.running) {
      S.elapsed += dt;
      /* 손가락이 움직인 속도 — 뒤집기를 알아보는 데 쓴다 */
      const inst = dt > 0 ? Math.hypot(PTR.x - PTR.px, PTR.y - PTR.py) / dt : 0;
      PTR.sp = smoothSpeed(PTR.sp, inst, dt);
      stepInput(dt);
      stepCook(dt);
      if (MODE.timeLimit > 0 && S.elapsed >= MODE.timeLimit) finish();
    }
    stepParts(dt);
    S.hintT = Math.max(0, S.hintT - dt);
    S.toastT = Math.max(0, S.toastT - dt);
    if (S.h && !S.h.held) S.h.lift = Math.max(0, S.h.lift - dt * 5);
    updateSizzle();
    dbgPaint(dt);
    PTR.px = PTR.x; PTR.py = PTR.y;
    draw();
  }

  function updateSizzle() {
    if (!SND.sizzleGain || !SND.ctx) return;
    const want = SND.muted ? 0 : sizzleLevel() * 0.1;
    try {
      SND.sizzleGain.gain.setTargetAtTime(want, SND.ctx.currentTime, 0.12);
    } catch (_) { SND.sizzleGain.gain.value = want; }
  }

  /* ============================================================
     결과 화면
     ============================================================ */
  /* ============================================================
     반 가르기
     ============================================================
     단면 사진으로 갈아 끼우지 않는다. 접시에 놓인 바로 그 호떡을
     한 번만 그려 두고(CUT.src), 그 한 장을 칼이 지난 선으로 나눠
     두 조각으로 쓴다. 그래서 눌린 자국도 탄 자리도 찢긴 테두리도
     두 조각에 그대로 이어진다.

     가르기는 연출일 뿐이라 조리 상태와 점수는 건드리지 않는다. */
  const CUT = {
    prog: 0,        /* 0~1 칼이 지난 정도 */
    ang: 0,         /* 칼이 지난 방향 */
    open: 0,        /* 0~1 두 조각이 벌어진 정도 */
    done: false,
    raf: 0,
    lo: null, hi: null,   /* 칼이 지나간 구간 (칼 방향 좌표) */
    off: 0,               /* 칼이 가운데에서 얼마나 비껴갔나 */
    drag: null,
    src: null, srcW: 0, srcH: 0,
    geo: null,      /* 결과 칸 안에서의 호떡 자리 {cx, cy, r} */
  };
  function cutReset() {
    if (CUT.raf) { try { cancelAnimationFrame(CUT.raf); } catch (_) {} CUT.raf = 0; }
    CUT.prog = 0; CUT.ang = 0; CUT.open = 0; CUT.done = false;
    CUT.lo = null; CUT.hi = null; CUT.off = 0; CUT.drag = null;
    CUT.src = null; CUT.geo = null;
  }

  /* 완성 호떡을 한 번만 그려 둔다. 두 조각은 이 한 장에서 나온다 —
     같은 그림을 두 장 복제해 나란히 놓는 것과는 다르다. */
  function cutSource(w, hh, dpr, cx, cy, sc) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(hh * dpr));
    const g = c.getContext("2d");
    if (!g) return null;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const h = S.h;
    const keep = { flipT: h.flipT, wobble: h.wobble, insert: h.insert, lift: h.lift };
    h.flipT = 0; h.wobble = 0; h.insert = 0; h.lift = 0;
    drawHotteok(g, h, cx, cy, sc);
    h.flipT = keep.flipT; h.wobble = keep.wobble;
    h.insert = keep.insert; h.lift = keep.lift;
    return c;
  }

  /* --- 절단면 ----------------------------------------------------
     조각의 안쪽 가장자리에 붙는 띠다. 두께 방향을 그대로 펼쳐 놓은
     것이라, 가까운 쪽이 위 껍질이고 먼 쪽이 아래 껍질이다. 그 사이가
     속살이고, 속을 넣었으면 가운데에 시럽 층이 생긴다.
     층의 두께와 색은 전부 실제 상태에서 나온다 — 어떤 호떡이든
     똑같이 시럽이 가득한 그림이 나오는 일은 없다. */
  function drawCutFace(g, halfW, faceH, dir, h) {
    if (halfW <= 1 || faceH <= 1) return;
    const yf = dir * faceH;
    const cap = Math.min(faceH * 0.7, halfW * 0.5);
    g.save();
    g.beginPath();
    g.moveTo(-halfW, 0);
    g.lineTo(halfW, 0);
    g.quadraticCurveTo(halfW, yf, halfW - cap, yf);
    g.lineTo(-halfW + cap, yf);
    g.quadraticCurveTo(-halfW, yf, -halfW, 0);
    g.closePath();
    g.save();
    g.clip();

    const band = (u0, u1, col) => {
      const a = dir * faceH * u0, b = dir * faceH * u1;
      g.fillStyle = col;
      g.fillRect(-halfW - 2, Math.min(a, b), halfW * 2 + 4, Math.abs(b - a) + 1);
    };

    /* 속살 — 속까지 익으면 뽀얗고, 덜 익었으면 눅눅한 반죽색이다 */
    const core = coreRatio(h);
    const wet = clamp((0.8 - core) / 0.8, 0, 1);
    const crumb = "rgb(" + Math.round(lerp(242, 214, wet)) + "," +
                  Math.round(lerp(228, 199, wet)) + "," +
                  Math.round(lerp(196, 166, wet)) + ")";
    band(0, 1, crumb);

    /* 속 — 넣었고 아직 남아 있을 때만. 샌 만큼 얇아진다. */
    const held = fillHeld(h);
    if (held > 0.04) {
      const k = clamp(held / 1.4, 0.12, 1);
      const half = 0.22 * k;
      /* 많이 구울수록 짙게 졸아든다 */
      const burn = clamp((h.cookA + h.cookB) * 0.5 / 110, 0, 1);
      const syr = "rgb(" + Math.round(lerp(152, 84, burn)) + "," +
                  Math.round(lerp(88, 44, burn)) + "," +
                  Math.round(lerp(26, 12, burn)) + ")";
      band(0.5 - half, 0.5 + half, syr);
      /* 가장자리가 반죽에 스며든 자리 */
      g.globalAlpha = 0.35;
      band(0.5 - half - 0.06, 0.5 - half, syr);
      band(0.5 + half, 0.5 + half + 0.06, syr);
      g.globalAlpha = 1;
    } else if (h.fillPut > 0.1) {
      /* 넣긴 넣었는데 다 새어 나갔다 — 빈 자리가 남는다 */
      g.globalAlpha = 0.5;
      band(0.42, 0.58, "rgba(206,188,152,1)");
      g.globalAlpha = 1;
    }

    /* 덜 익은 가운데 — 띠가 아니라 뭉친 덩어리로 */
    if (wet > 0.15 && held <= 0.04) {
      g.globalAlpha = 0.5 + wet * 0.3;
      g.fillStyle = "rgba(198,183,148,1)";
      ell(g, 0, dir * faceH * 0.5, halfW * (0.3 + wet * 0.3), faceH * 0.3);
      g.fill();
      g.globalAlpha = 1;
    }

    /* 위아래 껍질 — 각 면이 실제로 익은 만큼 */
    band(0, 0.14, cookColor(clamp(cookUp(h), 0, 150)));
    band(0.86, 1, cookColor(clamp(cookDown(h), 0, 150)));
    /* 윗면에서 꺾여 내려온 자리에 그늘 — 종잇장처럼 보이지 않게 */
    const gr = g.createLinearGradient(0, 0, 0, yf);
    gr.addColorStop(0, "rgba(40,22,8,.55)");
    gr.addColorStop(0.3, "rgba(40,22,8,0)");
    gr.addColorStop(1, "rgba(40,22,8,.3)");
    g.fillStyle = gr;
    g.fillRect(-halfW - 2, Math.min(0, yf), halfW * 2 + 4, Math.abs(yf) + 1);
    g.restore();

    /* 테두리와 그늘 — 평면 스티커로 보이지 않게 */
    g.strokeStyle = "rgba(62,38,16,.7)";
    g.lineWidth = Math.max(1, faceH * 0.07);
    g.stroke();
    g.restore();
  }

  /* --- 벌어진 틈 ------------------------------------------------- */
  function drawCutGap(g, halfW, gap, h) {
    const held = fillHeld(h);
    const cooked = coreRatio(h) >= 0.75;
    g.save();
    /* 시럽이 늘어난다 — 속이 남아 있고 뜨겁게 익었을 때만 */
    if (held > 0.35 && cooked && gap > 6) {
      g.strokeStyle = "rgba(138,78,20,.75)";
      g.lineCap = "round";
      const n = clamp(Math.round(held * 2), 1, 3);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * halfW * 0.5;
        g.lineWidth = Math.max(1.2, gap * 0.1 * clamp(held, 0.4, 1.2));
        g.beginPath();
        g.moveTo(x, -gap * 0.9);
        g.quadraticCurveTo(x + gap * 0.22, 0, x, gap * 0.9);
        g.stroke();
      }
    }
    /* 김 — 속까지 익었을 때만 */
    if (cooked) {
      g.globalAlpha = 0.22;
      g.fillStyle = "#FFF6E2";
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * halfW * 0.4;
        ell(g, x, -gap * 1.5 - i * 4, 9 + i * 3, 5 + i * 2);
        g.fill();
      }
    }
    g.restore();
  }

  /* --- 완성품 ---------------------------------------------------
     크기를 칸에 맞춰 정규화하지 않는다. 접시를 함께 그려 두고 cm 당
     픽셀 수를 고정해서, 작은 호떡은 작게 큰 호떡은 크게 보이게 한다.
     접시를 넘칠 만큼 큰 것만 칸 안으로 당기고, 그때도 치수는 글자로
     따로 적어 둔다. */
  const PLATE_CM = 22;
  /* cm 당 픽셀을 고정한다 — 이 함수가 "크기를 정규화하지 않는다" 의
     전부다. 호떡이 작든 크든 같은 배율을 쓰므로 접시 옆에서 실제
     크기 차이가 그대로 보인다. */
  function resultScale(h, pr, maxR) {
    const sc = (pr / (PLATE_CM / 2)) / CFG.pxPerCm;
    if (maxR && avgR(h) * sc > maxR) return maxR / avgR(h);
    return sc;
  }

  function drawResultArt() {
    const rc = $("resCv");
    if (!rc || !S.h) return;
    const g = rc.getContext("2d");
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = rc.clientWidth || 300, hh = rc.clientHeight || 300;
    rc.width = Math.round(w * dpr); rc.height = Math.round(hh * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    const h = S.h;
    const cx = w / 2, cy = hh / 2 + hh * 0.02;

    /* 벌어지면 두 조각이 칸을 넘는다. 조각만 줄이면 접시라는 기준이
       무너지므로 접시까지 통째로 조금 당긴다 — 서로의 비율은 그대로다. */
    g.save();
    const back = 1 / (1 + CUT.open * 0.3);
    g.translate(cx, cy); g.scale(back, back); g.translate(-cx, -cy);

    /* 접시 — 기준물. 늘 같은 자리에 같은 크기로 있다. */
    const pr = Math.min(w, hh) * 0.46;
    g.save();
    ell(g, cx, cy + pr * 0.1, pr, pr * 0.82);
    g.fillStyle = "rgba(0,0,0,.3)"; g.fill();
    ell(g, cx, cy, pr, pr * 0.82);
    g.fillStyle = "#CFCAC1"; g.fill();
    stroke(g, "#9A9186", 2);
    ell(g, cx, cy, pr * 0.82, pr * 0.82 * 0.82);
    g.strokeStyle = "rgba(120,114,104,.5)"; g.lineWidth = 1.5; g.stroke();
    g.restore();

    const sc = resultScale(h, pr, Math.min(w, hh) * 0.49);
    const rr = avgR(h) * sc;
    const cyA = cy - 4;
    CUT.geo = { cx: cx, cy: cyA, r: rr };

    /* 호떡은 한 번만 그린다. 아래는 그 한 장을 쓰는 일뿐이다. */
    if (!CUT.src || CUT.srcW !== w || CUT.srcH !== hh) {
      CUT.src = cutSource(w, hh, dpr, cx, cyA, sc);
      CUT.srcW = w; CUT.srcH = hh;
    }
    const src = CUT.src;
    if (!src) { drawHotteok(g, h, cx, cyA, sc); g.restore(); return; }

    const put = () => g.drawImage(src, 0, 0, w, hh);

    if (CUT.open <= 0.001) {
      put();
      /* 칼이 지나간 자국 — 그은 만큼만 */
      if (CUT.prog > 0 && CUT.lo !== null) {
        const ca = Math.cos(CUT.ang), sa = Math.sin(CUT.ang);
        g.save();
        g.lineCap = "round";
        for (const [col, lw] of [["rgba(70,40,14,.75)", 7], ["rgba(255,246,226,.85)", 3]]) {
          g.strokeStyle = col;
          g.lineWidth = lw * clamp(rr / 110, 0.6, 1.4);
          g.beginPath();
          const nx = -sa * CUT.off, ny = ca * CUT.off;
          g.moveTo(cx + ca * CUT.lo + nx, cyA + sa * CUT.lo + ny);
          g.lineTo(cx + ca * CUT.hi + nx, cyA + sa * CUT.hi + ny);
          g.stroke();
        }
        g.restore();
      }
      g.restore();
      return;
    }

    /* --- 두 조각 -------------------------------------------------
       칼이 지난 선을 가로축으로 삼은 틀에서, 위/아래 반쪽을 각각
       잘라 내어 선과 수직으로 밀어낸다. 조금 돌면서 접시에 내려앉는다. */
    const k = CUT.open;
    const ease = 1 - Math.pow(1 - k, 3);
    const settle = Math.sin(Math.min(1, k) * Math.PI) * 0.1 * (1 - k);
    const tilt = ease * 0.075;
    const BIG = Math.max(w, hh) * 2;
    /* 절단면의 높이는 실제 두께/지름 비율에서 나온다 — 도톰한 호떡은
       두꺼운 단면이, 얇은 호떡은 얇은 단면이 보인다. */
    const faceH = clamp(rr * 2 * (thickCm(h) / Math.max(4, diameterCm(h))),
                        rr * 0.13, rr * 0.5);
    /* 벌어지는 폭은 절단면 두께가 정한다. 두 면이 거의 맞닿을 만큼만
       떨어져야 한 덩어리를 갈랐다는 것이 보인다. */
    const gap = (ease + settle) * (faceH + rr * 0.05);

    /* 칼이 비껴 지나갔으면 그 자리에서 갈린다. 가운데를 지났으면
       반반이고, 비껴 지났으면 한쪽이 더 크고 절단면은 그만큼 짧다. */
    const off = clamp(CUT.off || 0, -rr * 0.55, rr * 0.55);
    const halfW = rr * Math.sqrt(Math.max(0.12, 1 - (off / rr) * (off / rr))) * 0.98;

    for (const side of [-1, 1]) {
      g.save();
      g.translate(cx, cyA);
      g.rotate(CUT.ang);
      g.translate(0, side * gap);
      g.rotate(side * tilt);

      /* 그늘 — 들린 조각이 접시에 드리운다 */
      g.save();
      g.globalAlpha = 0.22 * ease;
      g.fillStyle = "#000";
      ell(g, 0, off + side * faceH * 0.5 + 3, halfW * 0.92, rr * 0.4);
      g.fill();
      g.restore();

      /* 절단면 — 조각의 안쪽 가장자리, 곧 칼이 지난 선에 붙는다 */
      g.save();
      g.translate(0, off);
      drawCutFace(g, halfW, faceH * ease, side < 0 ? 1 : -1, h);
      g.restore();

      /* 조각 본체 — 한 장짜리 원본을 그 선에서 잘라 쓴다 */
      g.save();
      g.beginPath();
      if (side < 0) g.rect(-BIG, off - BIG, BIG * 2, BIG);
      else g.rect(-BIG, off, BIG * 2, BIG);
      g.clip();
      g.rotate(-CUT.ang);
      g.translate(-cx, -cyA);
      put();
      g.restore();
      g.restore();
    }

    /* 틈 — 시럽과 김은 해당 상태일 때만 */
    g.save();
    g.translate(cx, cyA);
    g.rotate(CUT.ang);
    g.translate(0, off);
    drawCutGap(g, halfW * 0.9, gap, h);
    g.restore();
    g.restore();
  }

  /* 세 칸만. 점수를 숫자로 들이밀지 않고 칸으로 끊어 읽게 한다.
     별 기호(U+2605)는 이 프로젝트가 막아 둔 기호 범위라서, 글자가
     아니라 CSS 로 그린 점을 쓴다.
     속 양 / 봉합 / 기름은 계산에는 그대로 들어가지만(완성도) 화면에
     따로 줄을 내주지 않는다 — 같은 이야기를 두 번 하지 않는다. */
  function starCount(v) { return clamp(Math.round(v * 5), 0, 5); }
  const STAR_ROWS = [
    ["겉굽기", "cookScore"], ["속익힘", "coreScore"], ["완성도", "grade"],
  ];
  function pips(parent, n) {
    for (let i = 0; i < 5; i++) {
      const pip = document.createElement("i");
      pip.className = i < n ? "pip on" : "pip";
      parent.appendChild(pip);
    }
  }
  /* 완성도는 등급과 같은 값을 쓴다. 따로 계산해 두면 위의 등급 칸과
     숫자가 어긋나서 같은 호떡에 두 가지 점수가 붙는다. */
  function rowPips(r, key) {
    return key === "grade" ? clamp(r.grade, 0, 5) : starCount(r[key]);
  }
  function fillStars() {
    const el = $("rStars"), r = S.result;
    if (!el || !r) return;
    el.innerHTML = "";
    for (const [label, key] of STAR_ROWS) {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      const n = rowPips(r, key);
      dd.setAttribute("aria-label", n + "/5");
      pips(dd, n);
      el.appendChild(dt); el.appendChild(dd);
    }
  }

  /* --- 갈라보기 --------------------------------------------------
     결과를 한꺼번에 쏟지 않는다. 먼저 완성품을 보고, 직접 갈라야
     단면과 이름과 평가가 열린다. 다만 기다리게 하지는 않는다 —
     가로로 쓸거나, 톡 누르거나, 건너뛰면 바로 열린다. */

  function showCut() {
    const r = S.result;
    if (!r || S.resultStage >= 1) return;
    S.resultStage = 1;
    SFX.tearSmall();
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    const show = (id, on) => { const e = $(id); if (e) e.hidden = !on; };

    fillStars();
    set("rName", r.name);
    set("rGrade", r.gradeLabel);
    const gp = $("rGradePip");
    if (gp) { gp.innerHTML = ""; pips(gp, r.grade); }

    /* 주문 — 기본 평가와 섞지 않고 따로 적는다 */
    const ro = $("rOrder");
    if (ro) {
      if (r.orderLabel) {
        ro.hidden = false;
        ro.className = "r-order" + (r.orderOk ? "" : " miss");
        ro.textContent = r.orderButBad
          ? "주문 「" + r.orderLabel + "」 은 맞췄지만 이대로는 팔기 어렵습니다"
          : "주문 「" + r.orderLabel + "」 " + (r.orderOk ? "맞췄습니다" : "는 못 맞췄어요");
      } else if (r.goalLabel) {
        ro.hidden = false;
        ro.className = "r-order" + (r.goalOk ? "" : " miss");
        ro.textContent = "목표 「" + r.goalLabel + "」 " +
          (r.goalOk ? "해냈습니다" : "는 다음에 다시");
      } else ro.hidden = true;
    }
    set("rGood", r.praise ? "잘한 점 · " + r.praise : "잘한 점 · 끝까지 하나를 완성했어요");
    set("rAdvice", "다음 판엔 · " + r.advice);
    const dx = $("rDex");
    if (dx) {
      dx.className = "r-dex" + (r.isNew ? " fresh" : "");
      dx.textContent = (r.isNew ? "처음 만든 호떡입니다 · " : "") +
        "도감 " + r.dexFound + " / " + r.dexTotal;
    }

    show("rFull", true);
    show("rCutAsk", false);
    show("rBtns", true);
    const sh = $("rShow");
    if (sh) sh.classList.add("mini");
    drawResultArt();
    track("result_cut");
  }

  /* --- 도감 ------------------------------------------------------
     찾아야 할 숙제가 아니라 구경거리다. 그래서 기본은 접혀 있고,
     아직 못 만난 것은 이름 대신 물음표로만 둔다 — 궁금하되
     목록을 채우라고 등 떠밀지 않는다. */
  function fillDex() {
    const el = $("rDexList");
    if (!el) return;
    el.innerHTML = "";
    for (const nm of DEX_ALL) {
      const li = document.createElement("li");
      const got = !!S.dex[nm];
      li.className = got ? "got" : "";
      li.textContent = got ? nm : "???";
      el.appendChild(li);
    }
  }
  function toggleDex() {
    const el = $("rDexList"), b = $("dexBtn");
    if (!el) return;
    const open = el.hidden;
    if (open) fillDex();
    el.hidden = !open;
    if (b) {
      b.textContent = open ? "도감 접기" : "도감 보기";
      b.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }

  /* 움직임을 줄여 달라고 해 둔 사람에게는 가르는 시늉을 생략한다.
     결과를 보는 데 꼭 필요한 연출이 아니라 거드는 연출이다. */
  function canAnimate() {
    try {
      if (typeof requestAnimationFrame !== "function") return false;
      if (!window.matchMedia) return false;
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) { return false; }
  }

  /* --- 가르는 손 --------------------------------------------------
     호떡을 가로지르는 동안 칼자국이 따라온다. 호떡 바깥을 스치는
     것은 세지 않고, 가운데를 지나야 센다. 손을 떼도 지금까지 그은
     만큼은 남아서 이어 그을 수 있다. 쓸기가 어려우면 톡 눌러도 된다. */
  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }
  function cutPoint(e) {
    const rc = $("resCv");
    if (!rc) return null;
    const b = rc.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    /* 화면 좌표 -> 칸 안의 좌표. 확대/축소된 화면에서도 어긋나지 않게
       실제 그려진 크기로 나눈다. */
    return { x: (e.clientX - b.left) * ((rc.clientWidth || b.width) / b.width),
             y: (e.clientY - b.top) * ((rc.clientHeight || b.height) / b.height) };
  }
  /* 칼이 지난 구간을 넓힌다. 돌려주는 값은 "이번에 셌나" */
  function cutExtend(p) {
    const geo = CUT.geo;
    if (!geo) return false;
    const ca = Math.cos(CUT.ang), sa = Math.sin(CUT.ang);
    const rx = p.x - geo.cx, ry = p.y - geo.cy;
    const t = rx * ca + ry * sa;         /* 칼 방향 */
    const n = -rx * sa + ry * ca;        /* 칼과 수직 */
    /* 손가락이 굵다. 가운데를 정확히 지나야 한다고 하면 휴대폰에서
       영영 안 갈라진다 — 반지름의 80% 까지는 가로지른 것으로 본다.
       대신 호떡 바깥(|t| > r)은 아무리 그어도 안 센다. */
    if (Math.abs(n) > geo.r * 0.8) return false;
    if (Math.abs(t) > geo.r * 1.05) return false;
    const tt = clamp(t, -geo.r, geo.r);
    /* 가운데에서 얼마나 비껴갔는지도 기억한다 — 비껴 그으면 한쪽
       조각이 더 크고 절단면도 그만큼 짧아져야 한다 */
    const nn = clamp(n, -geo.r * 0.55, geo.r * 0.55);
    CUT.off = CUT.lo === null ? nn : CUT.off * 0.78 + nn * 0.22;
    if (CUT.lo === null) { CUT.lo = tt; CUT.hi = tt; }
    else { CUT.lo = Math.min(CUT.lo, tt); CUT.hi = Math.max(CUT.hi, tt); }
    CUT.prog = clamp((CUT.hi - CUT.lo) / (geo.r * 1.6), 0, 1);
    return true;
  }
  /* 다 그었다 — 두 조각이 벌어진다 (약 0.9초) */
  function cutOpen() {
    if (CUT.done) return;
    CUT.done = true; CUT.prog = 1;
    SFX.tearSmall(); buzz(14);
    if (!canAnimate()) { CUT.open = 1; drawResultArt(); showCut(); return; }
    const t0 = now();
    const tick = () => {
      const k = clamp((now() - t0) / 900, 0, 1);
      CUT.open = k;
      drawResultArt();
      if (k < 1) { CUT.raf = requestAnimationFrame(tick); return; }
      CUT.raf = 0;
      showCut();
    };
    CUT.raf = requestAnimationFrame(tick);
  }
  /* 톡 눌렀을 때 / 건너뛸 때 — 칼이 저절로 지나간다 */
  function cutNow() {
    if (S.resultStage >= 1) { showCut(); return; }
    if (CUT.done || CUT.raf) return;
    const geo = CUT.geo;
    if (geo) { CUT.ang = 0; CUT.lo = -geo.r; CUT.hi = geo.r; CUT.off = 0; }
    CUT.prog = 1;
    if (!canAnimate()) { cutOpen(); return; }
    /* 긋는 시늉을 아주 짧게 보여 주고 바로 벌어진다 */
    const t0 = now();
    const tick = () => {
      const k = clamp((now() - t0) / 240, 0, 1);
      if (geo) { CUT.lo = -geo.r * k; CUT.hi = geo.r * k; }
      drawResultArt();
      if (k < 1) { CUT.raf = requestAnimationFrame(tick); return; }
      CUT.raf = 0;
      cutOpen();
    };
    CUT.raf = requestAnimationFrame(tick);
  }
  /* 결과를 바로 보고 싶을 때 — 연출을 건너뛰어도 두 조각과 단면은 남는다 */
  function cutSkip() {
    if (CUT.raf) { try { cancelAnimationFrame(CUT.raf); } catch (_) {} CUT.raf = 0; }
    const geo = CUT.geo;
    if (geo && CUT.lo === null) { CUT.ang = 0; CUT.lo = -geo.r; CUT.hi = geo.r; CUT.off = 0; }
    CUT.prog = 1; CUT.open = 1; CUT.done = true;
    drawResultArt();
    showCut();
  }

  function bindCut() {
    const rc = $("resCv");
    if (!rc) return;
    const down = e => {
      if (S.resultStage >= 1 || CUT.done) return;
      const p = cutPoint(e);
      if (!p) return;
      CUT.drag = { x0: p.x, y0: p.y, set: false, moved: 0 };
      try { rc.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    };
    const move = e => {
      const d = CUT.drag;
      if (!d || CUT.done || S.resultStage >= 1) return;
      const p = cutPoint(e);
      if (!p) return;
      const dx = p.x - d.x0, dy = p.y - d.y0;
      d.moved = Math.max(d.moved, Math.hypot(dx, dy));
      if (!d.set) {
        if (d.moved < 10) return;
        d.set = true;
        /* 처음 그은 방향이 칼이 지난 방향이다. 이어 그을 때는
           먼저 정한 방향을 그대로 쓴다. */
        if (CUT.lo === null) CUT.ang = Math.atan2(dy, dx);
      }
      if (cutExtend(p)) {
        if (CUT.prog >= 1) { CUT.drag = null; cutOpen(); return; }
        drawResultArt();
      }
      e.preventDefault();
    };
    const up = e => {
      const d = CUT.drag;
      CUT.drag = null;
      try { rc.releasePointerCapture(e.pointerId); } catch (_) {}
      if (!d || CUT.done || S.resultStage >= 1) return;
      /* 거의 움직이지 않았으면 탭으로 본다 */
      if (d.moved < 10) cutNow();
    };
    rc.addEventListener("pointerdown", down);
    rc.addEventListener("pointermove", move);
    rc.addEventListener("pointerup", up);
    rc.addEventListener("pointercancel", up);
  }

  /* 결과 화면을 처음 상태로 — 절단 진행률도 조각 자리도 안내 표시도.
     판을 새로 시작할 때와 결과를 새로 열 때 둘 다 여기를 지난다. */
  function resetResultUI() {
    cutReset();
    S.resultStage = 0;
    const show = (id, on) => { const e = $(id); if (e) e.hidden = !on; };
    show("rFull", false);
    show("rCutAsk", true);
    show("rBtns", false);
    const dl = $("rDexList");
    if (dl) dl.hidden = true;
    const db0 = $("dexBtn");
    if (db0) { db0.textContent = "도감 보기"; db0.setAttribute("aria-expanded", "false"); }
    const sh = $("rShow");
    if (sh) sh.classList.remove("mini");
  }

  function showResult() {
    const r = S.result;
    if (!r) return;
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    resetResultUI();
    set("rSize", "지름 " + r.diameter.toFixed(1) + "cm  ·  두께 " + r.thickness.toFixed(1) + "cm");
    /* 화면에는 축약 총평만. 긴 문장들(headline)은 공유 카드 쪽에 남는다. */
    set("rLine", r.shortLine);
    /* 칸을 먼저 열고 나서 그린다. 숨어 있는 동안에는 clientWidth 가 0 이라
       호떡이 칸 어디에 얼마나 크게 있는지(CUT.geo)를 엉뚱하게 잡고,
       그러면 가르려고 그은 자리가 실제 호떡과 어긋난다. */
    const o = $("endOver");
    if (o) { o.hidden = false; }
    const b = $("rBody");
    if (b) b.scrollTop = 0;
    drawResultArt();
  }

  /* ============================================================
     시작 안내 — 무엇을, 어떤 순서로
     ============================================================
     조리가 시작되기 전에 주문과 순서를 먼저 읽힌다. 여기서 본 주문이
     그대로 조리 화면의 주문서가 된다 (둘이 다르면 안내가 아니라
     함정이다). 두 판째부터는 순서를 접어 두되 다시 펼칠 수 있게
     남겨 둔다 — 아는 사람에게 일곱 줄을 매번 읽히지 않는다. */
  function showBrief() {
    const so = $("startOver");
    if (so) so.hidden = false;
  }
  /* [게임 시작] — 여기서부터 시간이 가고, 주문서가 올라온다.
     주문은 이 판이 시작될 때(startRound / boot) 이미 정해져 있다.
     여기서 다시 뽑지 않는다 — 뽑으면 화면마다 다른 주문이 뜬다. */
  function beginPlay() {
    const so = $("startOver");
    if (so) so.hidden = true;
    S.running = true;
    /* 주문서가 올라오면서 한 번 밝아진다 */
    S.orderGlow = 1;
    S.hint = ""; S.hintT = 0;
    track("game_start");
  }

  /* --- 다음 판 ---------------------------------------------------
     두 갈래다. 같은 조건으로 다시 하면 무엇을 바꿨는지 견줄 수 있고,
     다른 주문을 받으면 같은 규칙으로 다른 호떡을 만들게 된다.
     어느 쪽이든 조리 전에 주문 확인 화면을 한 번 거친다. */
  function startRound(keepOrder) {
    const o = $("endOver");
    if (o) o.hidden = true;
    const prevOrder = S.order;
    resetWorld();
    resetResultUI();
    S.order = keepOrder ? (prevOrder || firstOrder()) : nextOrder();
    /* 같은 조건으로 다시 할 때만 지난 판의 목표를 함께 들고 간다 —
       주문이 바뀌면 지난 목표는 이미 다른 이야기다. */
    S.goal = keepOrder && S.nextGoalId ? goalById(S.nextGoalId) : null;
    S.running = false;
    showBrief();
  }
  function again() { startRound(true); track("replay"); }
  function otherOrder() { startRound(false); track("replay_order"); }

  /* --- 공유 ------------------------------------------------------
     완성 호떡과 한 줄 판정을 그림으로 만든다. */
  function buildCard() {
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1350;
    const g = c.getContext("2d");
    const r = S.result, h = S.h;
    const CARD = { bg: "#FFF6E2", ink: "#2A241C", sub: "#9C8F79", foot: "#C6BBA6" };
    g.fillStyle = CARD.bg; g.fillRect(0, 0, 1080, 1350);
    g.textAlign = "center"; g.textBaseline = "middle";

    /* 접시를 같이 그린다 — 카드에서도 크기 차이가 보여야 한다.
       성공이든 실패든 같은 구성이고, 희귀도나 순위 같은 상태와
       무관한 숫자는 넣지 않는다. */
    const pr = 330;
    ell(g, 540, 610, pr, pr * 0.82);
    g.fillStyle = "#EDE7DA"; g.fill();
    g.strokeStyle = "#CFC6B4"; g.lineWidth = 4; g.stroke();
    ell(g, 540, 610, pr * 0.82, pr * 0.82 * 0.82);
    g.strokeStyle = "rgba(180,170,152,.6)"; g.lineWidth = 3; g.stroke();
    if (h) {
      const sc = resultScale(h, pr, pr * 1.06);
      const keep = { f: h.flipT, w: h.wobble };
      h.flipT = 0; h.wobble = 0;
      drawHotteok(g, h, 540, 600, sc);
      h.flipT = keep.f; h.wobble = keep.w;
    }

    /* 결과 이름이 제목 자리에 온다 */
    g.fillStyle = CARD.ink;
    g.font = "800 76px Pretendard, sans-serif";
    g.fillText(r.name, 540, 150);
    g.fillStyle = CARD.sub;
    g.font = "600 42px Pretendard, sans-serif";
    g.fillText("지름 " + r.diameter.toFixed(1) + "cm      두께 " + r.thickness.toFixed(1) +
               "cm      " + r.gradeLabel, 540, 232);

    /* 상태에서 바로 나온 한 줄 */
    g.fillStyle = CARD.ink;
    g.font = "800 50px Pretendard, sans-serif";
    wrapText(g, r.comment, 540, 1070, 900, 62);
    if (r.orderLabel) {
      g.fillStyle = CARD.sub;
      g.font = "700 40px Pretendard, sans-serif";
      g.fillText("주문 「" + r.orderLabel + "」 " +
                 (r.orderOk ? "맞춤" : "실패"), 540, 1190);
    }
    g.fillStyle = CARD.foot;
    g.font = "700 40px Pretendard, sans-serif";
    g.fillText("꼬직 · 호떡 알바", 540, 1286);
    return c;
  }

  function wrapText(g, text, x, y, maxW, lh) {
    const words = String(text).split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    const y0 = y - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => g.fillText(l, x, y0 + i * lh));
  }

  function canDownload() {
    const a = document.createElement("a");
    return typeof a.download === "string";
  }

  async function shareResult() {
    const r = S.result;
    if (!r) return;
    const url = location.href.split("?")[0].split("#")[0];
    const text = r.name + " (지름 " + r.diameter.toFixed(1) + "cm) — " + r.comment;
    let card = null;
    try { card = buildCard(); } catch (_) {}
    try {
      if (card && navigator.canShare) {
        const blob = await new Promise(res => card.toBlob(res, "image/png"));
        if (blob) {
          const file = new File([blob], "호떡알바.png", { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text: text, url: url });
            return;
          }
        }
      }
    } catch (_) {}
    try {
      if (navigator.share) { await navigator.share({ title: "호떡 알바", text: text, url: url }); return; }
    } catch (_) {}
    if (card && canDownload()) {
      card.toBlob(b => {
        if (!b) return;
        const u = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = u; a.download = "호떡알바.png";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      }, "image/png");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(text + " " + url).catch(() => {});
  }

  /* ============================================================
     시작
     ============================================================ */
  function setMute(v) {
    SND.muted = v;
    store.set(KEY.mute, v ? "1" : "0");
    const b = $("muteBtn");
    if (b) { b.textContent = v ? "소리 꺼짐" : "소리"; b.setAttribute("aria-pressed", v ? "true" : "false"); }
    if (SND.master) SND.master.gain.value = v ? 0 : 0.85;
  }

  function boot() {
    if (!cv) return;
    /* 저장해 둔 솜씨와 도감을 먼저 읽는다. 읽기가 막혀 있어도
       (사생활 보호 모드 등) 빈 값으로 그냥 시작한다. */
    loadSaved();
    resize();
    bindPointer();
    dbgInit();
    /* 그림부터 받아 두고 시작한다 — 없는 파일은 도형으로 대신한다 */
    loadAssets(() => {
      S.assetsReady = true;
      const lo = $("loadOver");
      if (lo) lo.hidden = true;
      /* 로딩이 끝나면 시작 화면을 '보여 줘야' 한다.
         이 줄이 빠져 있어서 시작 단추가 영영 안 나타났고,
         S.running 이 false 로 남아 화면 전체가 안 눌렸다. */
      /* 첫 판의 주문을 먼저 정해 두고 안내 화면을 연다 —
         여기 적힌 주문이 곧 조리 화면의 주문서다 */
      S.order = firstOrder();
      S.goal = null;
      showBrief();
      const sb = $("startBtn");
      if (sb) sb.disabled = false;
      if (MISSING.length)
        console.warn("[호떡] 못 받은 그림 " + MISSING.length + "개: " + MISSING.join(", "));
      draw();
    });
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", () => setTimeout(resize, 120));
    /* 도구를 끄는 동안 페이지가 밀리면 안 된다. 다만 문서 전체에
       걸면 결과 판이나 앞으로 생길 다른 UI 까지 같이 막힌다 —
       조리판(캔버스) 위에서만 막는다. */
    if (cv) cv.addEventListener("touchmove", e => {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    const mb = $("muteBtn");
    if (mb) mb.addEventListener("click", () => { audioUnlock(); setMute(!SND.muted); });
    setMute(SND.muted);

    const stb = $("startBtn");
    if (stb) stb.addEventListener("click", () => { audioUnlock(); beginPlay(); });

    const ab = $("againBtn");
    if (ab) ab.addEventListener("click", again);
    const ob = $("orderBtn");
    if (ob) ob.addEventListener("click", otherOrder);
    const sb = $("shareBtn");
    if (sb) sb.addEventListener("click", () => { track("share"); shareResult(); });
    /* 갈라보기 — 쓸기 / 톡 누르기 / 건너뛰기 세 길 모두 연다 */
    bindCut();
    const cb = $("cutBtn");
    if (cb) cb.addEventListener("click", cutNow);
    const kb = $("skipBtn");
    if (kb) kb.addEventListener("click", cutSkip);
    const db = $("dexBtn");
    if (db) db.addEventListener("click", toggleDex);

    track("flow_start");
    raf = requestAnimationFrame(frame);
  }

  /* 검사용 — 화면 없이 한 판을 돌려 볼 수 있게 */
  window.__hotteok = {
    S: S, LAY: LAY, TOOLS: TOOLS, TIP: TIP, CFG: CFG, MODE: MODE,
    ASSET_MAP: ASSET_MAP, ART_DIR: ART_DIR, IMG: IMG, MISSING: MISSING,
    HOTTEOK_ASSETS: HOTTEOK_ASSETS, HOTTEOK_ART: HOTTEOK_ART, HOT_ART: HOT_ART,
    moveRatio: moveRatio, heatAt: heatAt, sugarAt: sugarAt, pressRelease: pressRelease,
    styleOf: styleOf, DOUGH_ELASTIC: DOUGH_ELASTIC,
    ruptureRisk: ruptureRisk, riskStage: riskStage, sealHold: sealHold,
    cutOf: cutOf, coreRatio: coreRatio, starCount: starCount, showCut: showCut,
    tearStep: tearStep, LV: LV, SAY: SAY, GOOD: GOOD, reportOf: reportOf,
    SHORT: SHORT, SHORT_OK: SHORT_OK, shortIssues: shortIssues,
    nameOf: nameOf, adviceOf: adviceOf, DEX_ALL: DEX_ALL,
    ORDERS: ORDERS, GOALS: GOALS, goalFrom: goalFrom, goalById: goalById,
    orderById: orderById, nextOrder: nextOrder,
    showResult: showResult, cutNow: cutNow, startRound: startRound,
    showBrief: showBrief, beginPlay: beginPlay,
    resetResultUI: resetResultUI,
    drawOrderCard: drawOrderCard, drawTodo: drawTodo, CARD: CARD,
    firstOrder: firstOrder, thickTarget: thickTarget,
    fillDex: fillDex, toggleDex: toggleDex, saveDex: saveDex, canAnimate: canAnimate,
    again: again, otherOrder: otherOrder, drawResultArt: drawResultArt,
    PLATE_CM: PLATE_CM, loadSaved: loadSaved, resultScale: resultScale,
    CUT: CUT, cutReset: cutReset, cutOpen: cutOpen, cutSkip: cutSkip,
    cutExtend: cutExtend, drawCutFace: drawCutFace, cutSource: cutSource,
    panOiled: panOiled,
    buildShortSummary: buildShortSummary, STAR_ROWS: STAR_ROWS, rowPips: rowPips,
    hintTarget: hintTarget, guideText: guideText, GUIDE: GUIDE,
    learn: learn, knows: knows, stepGuide: stepGuide, panOiled: panOiled,
    inBoard: inBoard, clampToBoard: clampToBoard,
    toolUseful: toolUseful, inPan: inPan, inZone: inZone, MAX_R: MAX_R,
    loadAssets: loadAssets, spriteMix: spriteMix, extents: extents,
    mirrorShape: mirrorShape, fillLoad: fillLoad, fillBalance: fillBalance,
    NA: NA, VIEW: VIEW, W0: W, H0: H,
    avgR: avgR, diameterCm: diameterCm, thickCm: thickCm,
    cookUp: cookUp, cookDown: cookDown, oilAt: oilAt, evaluate: evaluate,
    reset: resetWorld,
    down: p => { PTR.down = true; PTR.id = 1; PTR.x = p.x; PTR.y = p.y; PTR.px = p.x; PTR.py = p.y; onDown(p); },
    move: p => { PTR.x = p.x; PTR.y = p.y; if (S.active) S.toolPos[S.active] = { x: p.x, y: p.y }; },
    up: () => onUp({ x: PTR.x, y: PTR.y }),
    step: dt => {
      const d = clamp(dt, 0, 0.05);
      clock += d;
      if (!S.done && S.running) {
        S.elapsed += d;
        const inst = d > 0 ? Math.hypot(PTR.x - PTR.px, PTR.y - PTR.py) / d : 0;
        PTR.sp = smoothSpeed(PTR.sp, inst, d);
        stepInput(d);
        stepCook(d);
      }
      stepParts(d);
      S.hintT = Math.max(0, S.hintT - d);
      S.toastT = Math.max(0, S.toastT - d);
      if (S.h && !S.h.held) S.h.lift = Math.max(0, S.h.lift - d * 5);
      PTR.px = PTR.x; PTR.py = PTR.y;
    },
    draw: draw,
    paint: () => { try { draw(); return true; } catch (e) { return String(e); } },
    card: buildCard,
    PTR: PTR,
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
