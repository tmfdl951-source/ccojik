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
  };
  /* 위쪽 띠 — 남은 시간과 개수만 앉는다. 조리에 쓰는 것이 하나도
     없는 자리라(반죽통은 y 360 부터) 무엇도 가리지 않는다.
     오른쪽 끝을 1080 까지 끌지 않는 것은 그 자리에 소리 단추(DOM)가
     있기 때문이다 — 끝까지 끌면 완성 개수가 단추 뒤로 숨는다. */
  const HUD = { x: 26, y: 24, w: 868, h: 96 };

  /* ------------------------------------------------------------
     완성 호떡 전시대
     ------------------------------------------------------------
     철판 위쪽, 반죽통과 설탕통 사이의 빈 조리대에 올린다. 양쪽 통의
     판정 타원과 겹치지 않는 자리다 (반죽통은 x 337 왼쪽에서 끝나고,
     설탕통은 이 높이에서 x 733 오른쪽에만 있다).

     inner / base 는 그림 안에서 '실제 트레이 안쪽' 이 어디인가를
     비율로 적어 둔 것이다. 알파 경계로 잘라낸 그림(2172x392)에서
     밝기가 꺾이는 자리를 재서 넣었다 — 뒤 테두리는 0.19 에서 끝나고
     앞 테두리는 0.745 에서 시작한다. 그림을 갈아 끼우면 이 값만
     다시 재면 된다. */
  const TRAY = {
    x: 530, y: 666, w: 388,      /* 화면에서 차지하는 자리 (높이는 비율에서) */
    ratio: 5.541,                /* 그림이 아직 안 왔을 때 쓸 가로/세로 */
    inner: { x0: 0.06, x1: 0.94, y0: 0.20, y1: 0.745 },
    base: 0.70,                  /* 호떡 밑이 닿는 자리 */
    front: 0.735,                /* 여기부터 아래가 앞 테두리 */
    scale: 0.25,                 /* 조리 중 크기 -> 전시 크기 (모두 같은 배율) */
    squash: 0.92,                /* 전시대 시점에서의 세로 눌림 */
    pitch: 80,                   /* 한 칸의 너비 */
    rise: 260,                   /* 호떡이 뒤 테두리 위로 솟을 수 있는 높이 */
    flySec: 0.5,                 /* 접시에서 전시대까지 */
    holdSec: 1.6,                /* 손으로 민 뒤 자동 이동을 쉬는 시간 */
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

  /* 조리대 어디든 내려놓을 수 있다. 다만 화면 밖으로는 못 나간다 —
     놓친 반죽이 안 보이는 데로 가 버리면 되찾을 길이 없다. */
  function clampToCounter(h) {
    const R = avgR(h);
    h.x = clamp(h.x, R * 0.6, W - R * 0.6);
    h.y = clamp(h.y, HUD.y + HUD.h + R * 0.5, H - R * 0.6);
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

  /* 한 판의 길이. 여기 한 줄만 바꾸면 된다. */
  const MODE = { timeLimit: 90, warnAt: 10 };

  /* 개수로 세어 줄 최소 조건. 등급이 아니라 문턱이다 —
     이 선만 넘으면 찌그러졌든 조금 샜든 한 개로 센다. */
  const PASS = {
    fill: 0.1,    /* 속을 넣은 기록 (fillPut) */
    cook: 40,     /* 양면 각각 이만큼은 익어야 한다 (cookA / cookB) */
  };

  const KEY = { mute: "hotteokMuted", skill: "hotteokSkill" };

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

    /* 완성 호떡을 올려 두는 전시대 — 투명 배경 그대로 쓴다 */
    tray:      "hotteok-display-tray.webp",

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

      onPan: false, held: false,
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
    rounds: 0,                      /* 몇 판째인가 — 첫 판에서만 안내한다 */
    /* --- 한 판 --------------------------------------------------
       시간과 개수는 호떡 하나가 아니라 판 전체에 속한다. 제출해도
       건드리지 않는다. */
    timeLeft: MODE.timeLimit,
    made: 0,                        /* 접시로 보낸 호떡 수 */
    over: false,                    /* 시간이 다 됐나 */
    pops: [],                       /* 접시 옆 "+1" 같은 짧은 표시 */
    /* --- 전시대 ---------------------------------------------------
       shelf 에 든 것은 조리 중인 호떡이 아니라 그때 그대로를 떠낸
       사본이다. 다음 반죽을 아무리 주물러도 여기 있는 것은 안 바뀐다. */
    shelf: [],
    shelfScroll: 0,                 /* 지금 보고 있는 가로 위치 */
    shelfHold: 0,                   /* 손으로 민 뒤 자동 이동을 쉬는 시간 */
    shelfDrag: null,                /* 전시대를 직접 미는 중 */
    elapsed: 0,
    running: false,               /* [시작] 을 누른 뒤부터 만질 수 있다 */
    assetsReady: false,
    toast: "", toastT: 0,
    shake: 0,                       /* 카메라 흔들림 — 큰 파열에만 */
  };
  for (const t of TOOLS) S.toolPos[t.id] = { x: t.home.x, y: t.home.y };

  /* 판 전체를 처음으로. [다시 도전] 이 부르는 것이 이것 하나다 —
     남은 시간, 개수, 반죽, 철판, 기름, 도구, 종료 상태가 모두 여기서
     돌아간다. */
  function resetWorld() {
    S.h = null; S.heat = 0.5; S.panTemp = 0.12;
    S.oils.length = 0; S.mess.length = 0; S.parts.length = 0;
    S.active = null; S.spoonLoad = 0; S.grab = null;
    S.hint = ""; S.hintT = 0;
    S.timeLeft = MODE.timeLimit; S.made = 0; S.over = false;
    S.pops.length = 0;
    /* 지난 판의 전시물과 날아오던 것, 스크롤 자리까지 모두 지운다.
       배열을 갈아 끼우지 않고 비우는 것은, 지난 판의 애니메이션이
       들고 있던 참조로 새 판에 호떡을 밀어 넣지 못하게 하기 위해서다. */
    S.shelf.length = 0;
    S.shelfScroll = 0; S.shelfHold = 0; S.shelfDrag = null;
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
  /* 솜씨는 로컬에만 둔다. 읽기/쓰기가 막혀 있어도(사생활 보호 모드,
     쿠키 차단) 게임은 그대로 돌아가야 한다 — 그래서 전부 try 안에서
     하고, 실패하면 이번 판에만 남는 셈 친다. */
  function loadSaved() {
    try {
      const a = JSON.parse(store.get(KEY.skill) || "{}");
      if (a && typeof a === "object") S.skill = a;
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
    return [h.onPan ? 1 : 0, h.held ? 1 : 0,
            Math.round(h.thickness * 6), Math.round(h.fillPut * 4),
            Math.round(h.sealed * 4), Math.round(cookDown(h) / 12),
            h.flips, Math.round(S.heat * 5)].join(",");
  }
  function stepGuide(dt) {
    if (S.over || !S.running) return;
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
    if (onPlate) { submit(); return; }
    if (onPan) {
      const was = h.onPan;
      h.onPan = true;
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
      /* 조리대다. 전용 작업대는 없앴다 — 펴든 속을 넣든 오므리든
         여기서도 철판 위에서도 그대로 된다. 내려놓았다는 이유로
         반죽이 일그러지지는 않는다. */
      h.onPan = false;
      clampToCounter(h);
      SFX.drop();
      spawn("crumb", h.x, h.y + 14, 7, { sp: 70, r: 4, col: "#D8C9AA", life: 0.5 });
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
    h.onPan = false;
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

  function coreRatio(h) { return clamp(h.core / CFG.coreFull, 0, 1); }

  /* ============================================================
     제출 — 접시에 놓으면 한 개
     ============================================================
     등급을 매기지 않는다. 세는 데 필요한 최소 조건만 본다.
     모양이 찌그러졌거나 조금 터져 속이 샜다는 이유로는 떨어뜨리지
     않는다 — 그건 '못 만든 호떡' 이지 '호떡이 아닌 것' 은 아니다.
     막는 것은 하나뿐이다: 생반죽을 접시에 던져 개수를 불리는 것. */
  function passReason(h) {
    if (!h) return "none";
    if (h.fillPut < PASS.fill) return "nofill";
    if (Math.min(h.cookA, h.cookB) < PASS.cook) return "raw";
    return null;
  }
  const PASS_SAY = {
    nofill: "속을 넣지 않았어요",
    raw:    "양면을 더 구워주세요",
  };

  /* 접시 옆에 잠깐 뜨는 표시. 조리를 가리지 않는다. */
  function popPlate(text, good) {
    S.pops.push({ text: text, good: !!good, t: 1, x: LAY.plate.x, y: LAY.plate.y - 70 });
    if (S.pops.length > 4) S.pops.shift();
  }
  function stepPops(dt) {
    for (let i = S.pops.length - 1; i >= 0; i--) {
      S.pops[i].t -= dt * 0.9;
      if (S.pops[i].t <= 0) S.pops.splice(i, 1);
    }
  }

  /* --- 전시대에 올릴 사본 ----------------------------------------
     조리 중인 객체를 그대로 들고 있으면, 다음 반죽을 만들 때 같이
     바뀌거나 계속 익는다. 그래서 그 순간의 값을 통째로 떠낸다.
     모양(rad)·찢김·탄 자국·샌 자국은 그대로 가져오고, '지금 무엇을
     하는 중' 을 뜻하는 신호들만 0 으로 눕힌다. */
  function shelfClone(h) {
    const c = {};
    for (const k in h) {
      const v = h[k];
      if (Array.isArray(v))
        c[k] = v.map(e => (e && typeof e === "object") ? Object.assign({}, e) : e);
      else if (v && typeof v === "object") c[k] = Object.assign({}, v);
      else c[k] = v;
    }
    /* 더 익지도, 들리지도, 흔들리지도 않는다 */
    c.held = false; c.onPan = false;
    c.lift = 0; c.flipT = 0; c.wobble = 0; c.insert = 0;
    c.pull = 0; c.hiss = 0; c.stick = 0;
    c.pressure = 0;                 /* 부풀어 오르는 숨쉬기도 멈춘다 */
    c.push = null; c.sealFlash = 0; c.pressRing = 0; c.landT = 0;
    c.thickGood = 0; c.liftHint = 0; c.insertAng = undefined;
    c.onShelf = true;               /* 조리 중에만 도는 연출을 끈다 */
    return c;
  }

  /* 접시에 놓았다. 타이머도 철판도 건드리지 않는다 — 한 판 전체에
     속한 것이기 때문이다. 호떡만 손에서 떠난다. */
  function submit() {
    const h = S.h;
    if (!h || S.over) return;
    const bad = passReason(h);
    S.h = null;                      /* 같은 호떡이 두 번 세어지지 않는다 */
    S.grab = null;
    if (bad) {
      popPlate(PASS_SAY[bad] || "다시 만들어주세요", false);
      SFX.drop();
      return;
    }
    /* 세는 것과 전시대에 올리는 것은 여기 한 번뿐이다.
       날아가는 연출이 끝날 때 다시 세지 않는다. */
    S.made++;
    S.shelf.push({ h: shelfClone(h), fly: 1, x0: LAY.plate.x, y0: LAY.plate.y - 30 });
    S.shelfHold = 0;                 /* 새로 올린 자리를 보여 준다 */
    learn("plate");
    popPlate("+1", true);
    SFX.clink(); buzz(16);
    spawn("bubble", LAY.plate.x, LAY.plate.y, 6,
      { sp: 40, r: 6, life: 0.5, col: "rgba(255,255,255,.7)" });
  }

  /* --- 시간 종료 -------------------------------------------------
     입력과 시뮬레이션을 세우고, 들고 있던 것을 안전하게 내려놓는다.
     여기를 지난 뒤에는 접시 판정이 늦게 돌아와도 개수가 오르지 않는다. */
  function endGame() {
    if (S.over) return;
    S.over = true;
    S.running = false;
    S.timeLeft = 0;
    if (S.h) S.h.held = false;
    S.grab = null;
    if (S.active) { S.toolPos[S.active] = { x: TOOL[S.active].home.x, y: TOOL[S.active].home.y }; }
    S.active = null;
    S.spoonLoad = 0;
    PTR.down = false; PTR.id = null;
    S.hint = ""; S.hintT = 0;
    /* 날아가던 호떡은 제자리에 내려놓는다. 이미 센 것들이라
       연출이 끝나지 않았다는 이유로 빠지면 안 된다. */
    for (const s of S.shelf) s.fly = 0;
    S.shelfDrag = null;
    track("game_complete");
    showEnd();
  }

  /* ============================================================
     전시대 — 만든 것이 쌓이는 자리
     ============================================================
     트레이 그림은 투명 배경이다. 통째로 덮어 호떡을 가리지 않는다.
     그리는 차례: 트레이 -> 안쪽에 가둔 호떡 -> 앞 테두리만 다시. */
  function trayRect() {
    const im = IMG.tray;
    const r = im ? (im.width / im.height) : TRAY.ratio;
    const w = TRAY.w, h = w / r;
    return { x: TRAY.x - w / 2, y: TRAY.y - h / 2, w: w, h: h };
  }
  /* 실제 트레이 안쪽 바닥 — 투명 여백과 테두리를 뺀 자리 */
  function trayInner() {
    const r = trayRect();
    const i = TRAY.inner;
    return {
      x: r.x + r.w * i.x0, y: r.y + r.h * i.y0,
      w: r.w * (i.x1 - i.x0), h: r.h * (i.y1 - i.y0),
      base: r.y + r.h * TRAY.base,
      top: r.y, bottom: r.y + r.h,
    };
  }
  function shelfSpan() { return TRAY.pitch * S.shelf.length; }
  function shelfMaxScroll() {
    return Math.max(0, shelfSpan() - trayInner().w);
  }
  /* i 번째 자리의 화면 x */
  function shelfSlotX(i) {
    return trayInner().x + TRAY.pitch * (i + 0.5) - S.shelfScroll;
  }
  function stepShelf(dt) {
    for (const s of S.shelf) if (s.fly > 0) s.fly = Math.max(0, s.fly - dt / TRAY.flySec);
    const max = shelfMaxScroll();
    if (S.shelfDrag) { S.shelfScroll = clamp(S.shelfScroll, 0, max); return; }
    if (S.shelfHold > 0) { S.shelfHold = Math.max(0, S.shelfHold - dt); return; }
    /* 새로 올린 자리가 보이도록 부드럽게 따라간다 */
    S.shelfScroll += (clamp(max, 0, max) - S.shelfScroll) * Math.min(1, dt * 6);
    S.shelfScroll = clamp(S.shelfScroll, 0, max);
  }

  /* 전시대 위에서 시작한 드래그인가 (조리 조작으로 넘기지 않는다) */
  function inTray(x, y) {
    const r = trayRect();
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
  function shelfDown(p) {
    S.shelfDrag = { x: p.x, scroll: S.shelfScroll, moved: 0 };
    S.shelfHold = TRAY.holdSec;
  }
  function shelfMove(p) {
    const d = S.shelfDrag;
    if (!d) return;
    d.moved = Math.max(d.moved, Math.abs(p.x - d.x));
    S.shelfScroll = clamp(d.scroll - (p.x - d.x), 0, shelfMaxScroll());
    S.shelfHold = TRAY.holdSec;
  }

  /* 전시된 호떡 하나. 트레이 바닥에 밑을 붙여 놓는다. */
  function drawShelfOne(g, h, cx, baseY, sc) {
    const e = extents(h);
    const half = e.ry * sc * SQ;
    g.save();
    /* 세로 눌림은 바닥선을 기준으로 — 밑이 뜨거나 파묻히지 않는다 */
    g.translate(cx, baseY);
    g.scale(1, TRAY.squash);
    g.translate(-cx, -baseY);
    drawHotteok(g, h, cx, baseY - half * 0.82, sc);
    g.restore();
  }

  function drawShelf(g) {
    const r = trayRect();
    /* 트레이 그림이 아직 없으면 전시대 자체를 그리지 않는다 —
       도형으로 대신 그리지 않는다 (제공된 그림만 쓴다). */
    if (!art(g, "tray", TRAY.x, TRAY.y, TRAY.w)) return;
    if (!S.shelf.length) return;

    const inn = trayInner();
    g.save();
    /* 가로로는 트레이 안을 벗어나지 않는다. 위로는 뒤 테두리 너머로
       솟아도 되므로 (실제 전시대도 그렇다) 거기만 넉넉히 연다. */
    g.beginPath();
    g.rect(inn.x, r.y - TRAY.rise, inn.w, (r.y + r.h) - (r.y - TRAY.rise));
    g.clip();
    for (let i = 0; i < S.shelf.length; i++) {
      const s = S.shelf[i];
      const tx = shelfSlotX(i);
      if (s.fly > 0) {
        /* 접시에서 날아오는 중 — 크기도 같이 줄어든다 */
        const k = 1 - Math.pow(s.fly, 1.6);        /* 0 -> 1 */
        const x = lerp(s.x0, tx, k);
        const y = lerp(s.y0, inn.base, k) - Math.sin(k * Math.PI) * 90;
        drawShelfOne(g, s.h, x, y, lerp(1, TRAY.scale, k));
      } else {
        if (tx < inn.x - TRAY.pitch || tx > inn.x + inn.w + TRAY.pitch) continue;
        drawShelfOne(g, s.h, tx, inn.base, TRAY.scale);
      }
    }
    g.restore();

    /* 앞 테두리만 다시 올린다 — 트레이 전체를 덮으면 호떡이 사라진다 */
    const im = IMG.tray;
    if (im) {
      const f = TRAY.front;
      const sy = Math.round(im.height * f);
      g.drawImage(im, 0, sy, im.width, im.height - sy,
                  r.x, r.y + r.h * f, r.w, r.h * (1 - f));
    }
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

  /* --- 조리대 ---------------------------------------------------
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
    /* 전시대에 올라간 것은 이미 끝난 호떡이다. 터지기 직전의 숨쉬기는
       조리 중에만 뜻이 있다 — 선반 위에서 계속 부풀면 아직 조리 중인
       것처럼 보인다. */
    const risk = h.onShelf ? 0 : ruptureRisk(h);
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

  /* ============================================================
     위쪽 띠 — 남은 시간과 개수
     ============================================================
     배경 사진은 밝고 어지럽다. 글자만 얹으면 간판과 조명에 묻히므로
     어두운 띠를 깔고 밝은 글자를 올린다. 자리는 조리에 쓰이는 것이
     하나도 없는 맨 위(y 24~120)다 — 반죽통(y 360~)도 설탕통(y 493~)도
     가리지 않는다. 여기 적히는 것은 둘뿐이다. */
  function mmss(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + (r < 10 ? "0" + r : String(r));
  }
  function drawHud(g) {
    if (!S.running && !S.over) return;      /* 시작 전에는 띠도 없다 */
    const c = HUD;
    const left = S.timeLeft;
    const warn = left <= MODE.warnAt;
    g.save();
    g.textBaseline = "middle";
    g.fillStyle = "rgba(18,13,9,.82)";
    g.fillRect(c.x, c.y, c.w, c.h);
    /* 마지막 10초 — 붉게 물들고 초마다 한 번 커진다. 소리도 팝업도
       없다. 눈 끝에 걸리기만 하면 된다. */
    let pop = 1;
    if (warn && S.running) {
      const frac = left - Math.floor(left);
      pop = 1 + Math.max(0, frac - 0.75) * 0.5;
      g.fillStyle = "rgba(190,52,32," + (0.2 + (1 - frac) * 0.16).toFixed(3) + ")";
      g.fillRect(c.x, c.y, c.w, c.h);
    }
    const my = c.y + c.h / 2;
    g.textAlign = "left";
    g.fillStyle = "#C3B49A";
    g.font = "700 30px Pretendard, sans-serif";
    g.fillText("남은 시간", c.x + 28, my);
    g.save();
    g.translate(c.x + 192, my);
    g.scale(pop, pop);
    g.fillStyle = warn ? "#FF8863" : "#FFF6E2";
    g.font = "800 54px Pretendard, sans-serif";
    g.fillText(mmss(left), 0, 0);
    g.restore();

    g.textAlign = "right";
    g.fillStyle = "#C3B49A";
    g.font = "700 30px Pretendard, sans-serif";
    g.fillText("완성", c.x + c.w - 150, my);
    g.fillStyle = "#FFF6E2";
    g.font = "800 54px Pretendard, sans-serif";
    g.fillText(S.made + "개", c.x + c.w - 28, my);
    g.restore();
  }

  /* 접시 옆 "+1" — 조리를 가리지 않고 금방 사라진다 */
  function drawPops(g) {
    if (!S.pops.length) return;
    g.save();
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const p of S.pops) {
      const k = clamp(p.t, 0, 1);
      g.globalAlpha = Math.min(1, k * 1.6);
      const y = p.y - (1 - k) * 56;
      g.font = p.good ? "800 72px Pretendard, sans-serif"
                      : "800 38px Pretendard, sans-serif";
      g.lineWidth = 8;
      g.strokeStyle = "rgba(18,13,9,.8)";
      g.strokeText(p.text, p.x, y);
      g.fillStyle = p.good ? "#9CE07A" : "#FFC9A8";
      g.fillText(p.text, p.x, y);
    }
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
    if (S.over) return null;
    if (!h) return "dough";
    if (h.held) return null;

    if (!h.onPan) {
      /* --- 철판 밖 --- */
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
       것처럼 몰아가게 된다. 도톰한 호떡도 호떡이다. */
    if (thickCm(h) > THICK_OK) return "press";
    const dn = cookDown(h), up = cookUp(h);
    /* 세어 주는 선(PASS.cook)을 넘겨야 집게를 들라고 한다. 안내대로
       했는데 접시에서 "덜 익었다" 는 말이 나오면 안내가 아니라
       함정이다. */
    if (dn > PASS.cook && up > PASS.cook) return "tong";
    if (dn > PASS.cook + 5) return "flip";
    return null;
  }

  /* 안내가 "더 누르세요" 를 멈추는 두께 */
  const THICK_OK = 3.3;

  /* 짧은 안내 한 줄 */
  const GUIDE = {
    dough: "반죽통에서 반죽을 떼어내세요",
    hand:  "반죽을 문질러 펼치세요",
    spoon: "숟가락으로 속을 떠서 가운데에 넣으세요",
    seal:  "벌어진 가장자리를 가운데로 모으세요",
    oil:   "철판에 기름을 두르세요",
    pan:   "반죽을 철판으로 옮기세요",
    heat:  "노브를 돌려 불을 올리세요",
    press: "누르개로 살짝 눌러주세요",
    flip:  "뒤집개를 충분히 넣고 뒤집으세요",
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
    } else if (key === "plate") {
      ell(g, LAY.plate.x, LAY.plate.y, LAY.plate.rx * 0.96, LAY.plate.ry * 0.96);
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
    /* 전시대는 뒤쪽 조리대 위에 있다 — 철판 효과보다 먼저 */
    drawShelf(g);
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
    drawPops(g);
    /* UI 는 맨 위에 — 남은 시간과 개수는 무엇에도 가리지 않는다 */
    drawHud(g);
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
    if (S.over || !S.running) return;
    if (S.hintT > 0.5) S.hintT = 0.5;

    /* 0) 전시대에서 시작한 드래그는 전시대의 것이다 — 도구 집기나
       조리로 넘기지 않는다. 다른 데서 시작해 전시대 위를 지나가는
       드래그는 여기로 오지 않는다 (누른 순간에만 자리를 본다).

       다만 손에 도구를 들고 있거나, 만들던 반죽이 바로 그 자리에
       있으면 조리가 먼저다. 전시대는 뒤쪽 조리대에 얹힌 선반이라
       그 아래에 반죽을 둘 수 있는데, 거기서 손이 안 먹으면
       빠져나올 길이 없어진다. */
    const near = S.h && !S.h.held &&
                 Math.hypot(p.x - S.h.x, p.y - S.h.y) < avgR(S.h) * 1.18;
    if (!S.active && !near && inTray(p.x, p.y)) {
      shelfDown(p);
      S.grab = { kind: "shelf" };
      return;
    }

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
    if (g.kind === "shelf") shelfMove(p);
    else if (g.kind === "tear") tearMove(p, dt);
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
    if (g.kind === "shelf") { S.shelfDrag = null; S.grab = null; return; }
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
      "pass           " + (passReason(h) || "ok") + "        made " + S.made + "  left " + n(S.timeLeft, 1),
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

    /* 시간은 프레임이 아니라 실제 경과(dt)로 깎는다. 시작 전에도
       종료 뒤에도 흐르지 않는다. */
    if (!S.over && S.running) {
      S.elapsed += dt;
      S.timeLeft = Math.max(0, S.timeLeft - dt);
      /* 손가락이 움직인 속도 — 뒤집기를 알아보는 데 쓴다 */
      const inst = dt > 0 ? Math.hypot(PTR.x - PTR.px, PTR.y - PTR.py) / dt : 0;
      PTR.sp = smoothSpeed(PTR.sp, inst, dt);
      stepInput(dt);
      stepCook(dt);
      if (S.timeLeft <= 0) endGame();
    }
    stepParts(dt);
    stepPops(dt);
    stepShelf(dt);
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
     한 판의 흐름 — 시작 안내 / 조리 / 시간 종료
     ============================================================ */
  function showBrief() {
    const so = $("startOver");
    if (so) so.hidden = false;
  }
  /* [게임 시작] — 여기서부터 시간이 간다. 그 전에는 한 틱도 깎이지
     않는다 (frame 이 S.running 을 본다). */
  function beginPlay() {
    if (S.running || S.over) return;
    const so = $("startOver");
    if (so) so.hidden = true;
    S.running = true;
    S.hint = ""; S.hintT = 0;
    track("game_start");
  }

  /* --- 결과 화면의 전시대 -----------------------------------------
     같은 S.shelf 를 그대로 읽는다. 여기서 다시 담지 않으므로
     개수가 두 번 세어질 일이 없다. 한 줄에 다 안 들어가면 줄을
     늘린다 — 줄이거나 버리지 않는다. */
  function drawEndShelf() {
    const cv2 = $("eShelf");
    if (!cv2) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = cv2.clientWidth || 300;
    const per = Math.max(1, Math.floor(w / TRAY.pitch));
    const rows = Math.max(1, Math.ceil(S.shelf.length / per));
    const rowH = TRAY.pitch * 0.92;
    const hh = rows * rowH;
    cv2.style.height = Math.round(hh) + "px";
    cv2.width = Math.max(1, Math.round(w * dpr));
    cv2.height = Math.max(1, Math.round(hh * dpr));
    const g = cv2.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    if (!S.shelf.length) return;
    for (let i = 0; i < S.shelf.length; i++) {
      const r = Math.floor(i / per), c = i % per;
      const n = Math.min(per, S.shelf.length - r * per);
      const x = w / 2 + (c - (n - 1) / 2) * TRAY.pitch;
      drawShelfOne(g, S.shelf[i].h, x, (r + 1) * rowH - rowH * 0.12, TRAY.scale);
    }
  }

  /* 시간 종료 화면 — 한 번만 뜬다 */
  function showEnd() {
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set("eSub", MODE.timeLimit + "초 동안 만든 호떡");
    set("eCount", S.made + "개");
    const o = $("endOver");
    if (o) o.hidden = false;
    /* 칸을 먼저 열고 나서 그린다 — 숨어 있는 동안에는 clientWidth 가
       0 이라 엉뚱한 자리에 그려진다. */
    drawEndShelf();
  }

  /* [다시 도전] — 판 전체를 처음으로 되돌리고 안내 화면으로 */
  function restart() {
    const o = $("endOver");
    if (o) o.hidden = true;
    resetWorld();
    S.running = false;
    showBrief();
    track("replay");
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
    /* 저장해 둔 솜씨를 먼저 읽는다. 읽기가 막혀 있어도
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
         S.running 이 false 로 남아 화면 전체가 안 눌렸다.
         그림을 받는 동안에도 시간은 가지 않는다 — S.running 이
         false 라서 frame 이 timeLeft 를 건드리지 않는다. */
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
    if (ab) ab.addEventListener("click", restart);

    track("flow_start");
    raf = requestAnimationFrame(frame);
  }

  /* 검사용 — 화면 없이 한 판을 돌려 볼 수 있게 */
  window.__hotteok = {
    S: S, LAY: LAY, TOOLS: TOOLS, TIP: TIP, CFG: CFG, MODE: MODE,
    ASSET_MAP: ASSET_MAP, ART_DIR: ART_DIR, IMG: IMG, MISSING: MISSING,
    HOTTEOK_ASSETS: HOTTEOK_ASSETS, HOTTEOK_ART: HOTTEOK_ART, HOT_ART: HOT_ART,
    HUD: HUD, PASS: PASS, THICK_OK: THICK_OK, TRAY: TRAY,
    trayRect: trayRect, trayInner: trayInner, inTray: inTray,
    shelfClone: shelfClone, shelfSlotX: shelfSlotX,
    shelfMaxScroll: shelfMaxScroll, shelfSpan: shelfSpan,
    stepShelf: stepShelf, drawShelf: drawShelf, drawEndShelf: drawEndShelf,
    moveRatio: moveRatio, heatAt: heatAt, sugarAt: sugarAt, pressRelease: pressRelease,
    DOUGH_ELASTIC: DOUGH_ELASTIC,
    ruptureRisk: ruptureRisk, riskStage: riskStage, sealHold: sealHold,
    coreRatio: coreRatio, tearStep: tearStep,
    passReason: passReason, submit: submit, endGame: endGame,
    showEnd: showEnd, restart: restart,
    showBrief: showBrief, beginPlay: beginPlay,
    drawHud: drawHud, drawPops: drawPops, mmss: mmss, popPlate: popPlate,
    loadSaved: loadSaved, panOiled: panOiled,
    hintTarget: hintTarget, guideText: guideText, GUIDE: GUIDE,
    learn: learn, knows: knows, stepGuide: stepGuide,
    clampToCounter: clampToCounter,
    toolUseful: toolUseful, inPan: inPan, inZone: inZone, MAX_R: MAX_R,
    loadAssets: loadAssets, spriteMix: spriteMix, extents: extents,
    mirrorShape: mirrorShape, fillLoad: fillLoad, fillBalance: fillBalance,
    NA: NA, VIEW: VIEW, W0: W, H0: H,
    avgR: avgR, diameterCm: diameterCm, thickCm: thickCm,
    cookUp: cookUp, cookDown: cookDown, oilAt: oilAt,
    reset: resetWorld,
    down: p => { PTR.down = true; PTR.id = 1; PTR.x = p.x; PTR.y = p.y; PTR.px = p.x; PTR.py = p.y; onDown(p); },
    move: p => { PTR.x = p.x; PTR.y = p.y; if (S.active) S.toolPos[S.active] = { x: p.x, y: p.y }; },
    up: () => onUp({ x: PTR.x, y: PTR.y }),
    /* frame() 과 같은 순서로 한 틱. 시간 차감과 종료까지 그대로 탄다 —
       여기서 빼면 검사가 보는 세상이 실제와 달라진다. */
    step: dt => {
      const d = clamp(dt, 0, 0.05);
      clock += d;
      if (!S.over && S.running) {
        S.elapsed += d;
        S.timeLeft = Math.max(0, S.timeLeft - d);
        const inst = d > 0 ? Math.hypot(PTR.x - PTR.px, PTR.y - PTR.py) / d : 0;
        PTR.sp = smoothSpeed(PTR.sp, inst, d);
        stepInput(d);
        stepCook(d);
        if (S.timeLeft <= 0) endGame();
      }
      stepParts(d);
      stepPops(d);
      stepShelf(d);
      S.hintT = Math.max(0, S.hintT - d);
      S.toastT = Math.max(0, S.toastT - d);
      if (S.h && !S.h.held) S.h.lift = Math.max(0, S.h.lift - d * 5);
      PTR.px = PTR.x; PTR.py = PTR.y;
    },
    draw: draw,
    paint: () => { try { draw(); return true; } catch (e) { return String(e); } },
    PTR: PTR,
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
