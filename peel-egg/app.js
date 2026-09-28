/* ===== 꼬직 · 계란 완벽하게 까기 =====
 * 계란은 사진 세 장을 포개 만든다. 아래부터
 *   1) egg-damaged  뜯긴 흰자  — 손상됐을 때 드러나는 층
 *   2) egg-peeled   매끈한 흰자 — 잘 깠을 때 보이는 층
 *   3) egg-shell    껍질       — 시작 상태
 * 살살 문지르면 껍질만 지워져 매끈한 흰자가 나오고,
 * 급하게 문지르면 그 자리는 매끈한 흰자까지 지워져 뜯긴 흰자가 드러난다.
 * 지우기는 층마다 따로 둔 캔버스에 destination-out 으로 한다.
 *
 * 숫자(껍질 제거율·손상도)는 계란을 나눈 격자로 센다. 격자와 마스킹은 같은
 * rub() 안에서 함께 갱신되므로 화면과 숫자가 어긋나지 않는다. */
(() => {
  "use strict";

  /* ============================================================
     튜닝 — 숫자는 전부 여기서만 만진다
     ============================================================ */
  const TUNE = {
    time: 10,              // 제한시간(초) — 여기만 바꾸면 전부 따라간다
    hotAt: 5,              // 남은 시간이 이 아래면 빨갛게 커지고 두근거린다

    cols: 18, rows: 30,    // 계란을 나눈 칸 수 (사진 비율에 맞춰 세로로 길게)
    brush: 0.17,           // 붓 반지름 (계란 가로 폭 대비)

    /* 문지르는 속도 — 계란 가로 반지름을 1초에 몇 번 지나가는지로 잰다.
       safe 아래는 안전, hard 위는 거의 확실히 뜯긴다. 그 사이는 확률. */
    safeSpeed: 1.6,
    hardSpeed: 5.2,

    tearBlob: 0.62,        // 뜯긴 자국 반지름 (칸 크기 배수)

    /* 채점 */
    peelScore:   1000,     // 껍질을 다 벗기면 받는 점수
    dmgPenalty:  1400,     // 흰자를 다 뜯으면 깎이는 점수
    timeBonus:   12,       // 다 깐 뒤 남은 1초당
    doneAt: 0.98,          // 이만큼 벗기면 저절로 끝난다

    /* 결과 사진이 갈리는 손상도 경계 */
    dmgMid: 0.10,          // 이 위면 우둘투둘한 사진
    dmgBad: 0.30,          // 이 위면 너덜너덜한 사진

    /* 사진이 화면에서 차지하는 크기 — 어색하면 여기를 만진다 */
    eggFill: 0.88,         // 게임판 높이의 몇 배로 그릴지
    eggOffY: 0.0,          // 위아래 미세 조정 (계란 높이 대비)
  };

  /* 세 장은 찍은 계란이 달라 사진 속 계란 크기가 제각각이다. 껍질 사진을 기준으로
     나머지를 줄이고 옮겨 겹치게 맞춘 값 — 알파를 실측해서 낸 숫자다.
     사진을 갈아 끼우면 여기만 다시 잡으면 된다. */
  const FIT = {
    peeled:  { scale: 0.885, dx:  0.001, dy: -0.009 },
    damaged: { scale: 0.865, dx: -0.006, dy: -0.016 },
  };

  /* 결과 화면 — 사진 가장자리의 빈 여백을 걷어내고 계란만 꽉 차게 키운다.
     zoom 은 계란이 자리 높이를 채우는 배율, shift 는 계란이 사진 한가운데가
     아니라 조금 아래에 있어서 올려 주는 값(%). 알파를 실측해 낸 숫자다. */
  const RESULT_ZOOM = {
    peeled:  { zoom: 1.72, shift: -2.0 },
    damaged: { zoom: 1.67, shift: -3.2 },
    ruined:  { zoom: 1.53, shift: -2.6 },
  };

  /* 한줄평 — 문장만 더 넣으면 바로 늘어난다 */
  const REMARKS = {
    top:  ["장인의 손길, 완벽한 계란", "편의점 알바 3년차", "이 구역 계란 장인"],
    mid:  ["먹을 순 있습니다", "반은 껍질 반은 흰자", "그럭저럭 까셨습니다"],
    low:  ["이게 계란이었나요", "흰자를 다 드셨네요", "삶은 계란 학대죄"],
    slow: ["시간이 다 됐습니다. 껍질째 드세요", "아직 껍질이 남았습니다"],
    rush: ["시간에 쫓겨 흰자를 학살했습니다", "급하면 이렇게 됩니다"],
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* 칸 상태 */
  const SHELL = 0, PEELED = 1, TORN = 2;

  /* ============================================================
     사진
     ============================================================ */
  const IMG = {
    shell:   { src: "egg-shell.png",   el: null, ok: false },
    peeled:  { src: "egg-peeled.png",  el: null, ok: false },
    damaged: { src: "egg-damaged.png", el: null, ok: false },
    ruined:  { src: "egg-ruined.png",  el: null, ok: false },
  };
  let imgAspect = 941 / 1672;          // 사진이 오기 전 임시값. 오면 실제 값으로 바뀐다.

  /* ============================================================
     상태
     ============================================================ */
  const S = {
    mode: "start",
    left: TUNE.time,
    cells: null,
    inside: null,        // 껍질이 덮여 있던 칸인지 (사진의 불투명한 부분)
    total: 0,
    peeled: 0,
    torn: 0,
    drag: null,
    best: 0,
    timedOut: false,
  };
  try { S.best = +(localStorage.getItem("ccojik_peelegg_best") || 0) || 0; } catch (_) {}

  const cv = $("cv"), ctx = cv.getContext("2d");
  /* 계란 세 층 — 아래부터 위로. 지우기는 이 캔버스들에만 한다. */
  const baseCv = document.createElement("canvas");    // 뜯긴 흰자 (안 지운다)
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
  function onResize() {
    /* 화면이 바뀌어도 지금까지 벗기고 뜯은 자리는 그대로 옮겨 온다 */
    const oldShell = shellCv.width ? snapshot(shellCv) : null;
    const oldWhite = whiteCv.width ? snapshot(whiteCv) : null;
    if (fitCanvas() && S.cells) buildLayers(oldShell, oldWhite);
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
    const fit = Math.min(1, (W * 0.92) / w);     // 가로가 모자라면 줄인다
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
  /* 칸 (i,j) 의 중심 */
  function cellPos(R, i, j) {
    return {
      x: R.x + (i + 0.5) * (R.w / TUNE.cols),
      y: R.y + (j + 0.5) * (R.h / TUNE.rows),
    };
  }

  /* ============================================================
     세 층 만들기
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
  /* 세 층의 가장자리를 계란 윤곽에 딱 맞춘다 — 안 그러면 아래층이 테두리로 비친다 */
  function clipToEgg(g, R) {
    g.save();
    g.globalCompositeOperation = "destination-in";
    drawEggShape(g, R);
    g.restore();
  }
  /* 이전 층을 크기만 바꿔 옮겨 담는다 (화면이 바뀌었을 때) */
  function carryOver(g, c, prev) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(prev, 0, 0, c.width, c.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function buildLayers(prevShell, prevWhite) {
    const R = eggRect();

    /* 맨 아래 — 뜯긴 흰자. 여기는 절대 안 지운다. 위 두 층이 지워지면 드러난다. */
    const gb = layerCtx(baseCv, R);
    if (IMG.damaged.ok) {
      const B = fitRect(R, FIT.damaged);
      gb.drawImage(IMG.damaged.el, B.x, B.y, B.w, B.h);
    } else { gb.fillStyle = "#E0CDAE"; gb.fillRect(0, 0, R.w, R.h); }
    clipToEgg(gb, R);

    /* 중간 — 매끈한 흰자. 급하게 문지른 칸만 여기가 지워진다. */
    const gw = layerCtx(whiteCv, R);
    if (prevWhite) carryOver(gw, whiteCv, prevWhite);
    else {
      if (IMG.peeled.ok) {
        const P = fitRect(R, FIT.peeled);
        gw.drawImage(IMG.peeled.el, P.x, P.y, P.w, P.h);
      } else { gw.fillStyle = "#FFFDF7"; gw.fillRect(0, 0, R.w, R.h); }
      clipToEgg(gw, R);
    }

    /* 맨 위 — 껍질. 문지르면 무조건 여기부터 지워진다. */
    const gs = layerCtx(shellCv, R);
    if (prevShell) carryOver(gs, shellCv, prevShell);
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
      g.moveTo(p.x - R.x + r, p.y - R.y);        // 점끼리 선으로 이어지지 않게
      g.arc(p.x - R.x, p.y - R.y, r, 0, 7);
    }
    g.fill();
    g.restore();
  }

  /* 채점용 격자 — 껍질 사진의 불투명한 자리만 '깔 대상'으로 센다 */
  function buildCells() {
    const n = TUNE.cols * TUNE.rows;
    S.cells = new Uint8Array(n);
    S.inside = new Uint8Array(n);
    S.total = 0;
    S.peeled = 0; S.torn = 0;

    let alpha = null;
    if (IMG.shell.ok) {
      try {
        const c = document.createElement("canvas");
        c.width = TUNE.cols; c.height = TUNE.rows;
        const g = c.getContext("2d");
        g.drawImage(IMG.shell.el, 0, 0, TUNE.cols, TUNE.rows);
        alpha = g.getImageData(0, 0, TUNE.cols, TUNE.rows).data;
      } catch (_) { alpha = null; }      // file:// 로 열면 픽셀을 못 읽는다
    }
    for (let j = 0; j < TUNE.rows; j++) {
      for (let i = 0; i < TUNE.cols; i++) {
        const idx = j * TUNE.cols + i;
        let on;
        if (alpha) on = alpha[idx * 4 + 3] > 100;
        else {
          /* 사진을 못 읽으면 타원으로 대신 잡는다 */
          const dx = (i + .5) / TUNE.cols * 2 - 1, dy = (j + .5) / TUNE.rows * 2 - 1;
          on = dx * dx + dy * dy <= 1;
        }
        if (on) { S.inside[idx] = 1; S.total++; }
      }
    }
    if (!S.total) S.total = 1;           // 0 으로 나누는 것만 막는다
    buildLayers(null, null);
  }

  /* ============================================================
     그리기 — 아래부터 위로 세 장
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

    if (baseCv.width) g.drawImage(baseCv, R.x, R.y, R.w, R.h);     // 뜯긴 흰자
    if (whiteCv.width) g.drawImage(whiteCv, R.x, R.y, R.w, R.h);   // 매끈한 흰자
    if (shellCv.width) g.drawImage(shellCv, R.x, R.y, R.w, R.h);   // 껍질
  }

  /* ============================================================
     문지르기
     ============================================================ */
  function rub(x, y, speedNorm) {
    const R = eggRect();
    const br = (R.w / 2) * TUNE.brush;
    /* 속도가 safe 를 넘을수록 흰자가 뜯길 확률이 오른다 */
    const p = clamp((speedNorm - TUNE.safeSpeed) / (TUNE.hardSpeed - TUNE.safeSpeed), 0, 1);

    const cw = R.w / TUNE.cols, ch = R.h / TUNE.rows;
    const i0 = Math.max(0, Math.floor((x - br - R.x) / cw));
    const i1 = Math.min(TUNE.cols - 1, Math.ceil((x + br - R.x) / cw));
    const j0 = Math.max(0, Math.floor((y - br - R.y) / ch));
    const j1 = Math.min(TUNE.rows - 1, Math.ceil((y + br - R.y) / ch));

    let touched = false;
    const tears = [];                    // 이번에 뜯긴 칸들
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const idx = j * TUNE.cols + i;
        if (!S.inside[idx]) continue;
        const c = cellPos(R, i, j);
        if (Math.hypot(c.x - x, c.y - y) > br) continue;
        touched = true;

        const st = S.cells[idx];
        if (st === TORN) continue;
        const tear = Math.random() < p;
        if (st === SHELL) {
          if (tear) { S.cells[idx] = TORN; S.peeled++; S.torn++; tears.push(c); }
          else { S.cells[idx] = PEELED; S.peeled++; }
        } else if (tear) {
          /* 이미 벗긴 자리를 급하게 또 문지르면 흰자가 파인다 */
          S.cells[idx] = TORN; S.torn++; tears.push(c);
        }
      }
    }
    /* 껍질은 문지른 자리 전체가 벗겨진다 (계란 밖은 애초에 안 그려져 있다) */
    if (touched) erase(shellCv, R, [{ x, y }], br);
    /* 매끈한 흰자는 뜯긴 칸에서만 벗겨져 아래 뜯긴 흰자가 드러난다 */
    erase(whiteCv, R, tears, Math.max(cw, ch) * TUNE.tearBlob);

    paintHud();
    if (S.peeled / S.total >= TUNE.doneAt) finish(false);
  }

  /* ============================================================
     진행
     ============================================================ */
  function step(dt) {
    if (S.mode !== "play") return;
    S.left -= dt;
    const t = $("timer");
    t.classList.toggle("hot", S.left <= TUNE.hotAt);
    $("timeNum").textContent = Math.max(0, Math.ceil(S.left));
    $("timeFill").style.width = clamp(S.left / TUNE.time, 0, 1) * 100 + "%";
    if (S.left <= 0) { S.timedOut = true; finish(true); }
  }

  function paintHud() {
    $("peelNum").textContent = Math.round(S.peeled / S.total * 100) + "%";
    $("dmgNum").textContent = Math.round(S.torn / S.total * 100) + "%";
  }

  function start() {
    S.mode = "play";
    S.left = TUNE.time;
    S.drag = null;
    S.timedOut = false;
    fitCanvas();
    buildCells();
    paintHud();
    $("startOver").hidden = true;
    $("endOver").hidden = true;
    $("timer").classList.remove("hot");
    $("timeNum").textContent = TUNE.time;
    $("timeFill").style.width = "100%";
  }

  function finish(timedOut) {
    if (S.mode !== "play") return;
    S.mode = "over";
    S.drag = null;

    const peelPct = S.peeled / S.total, dmgPct = S.torn / S.total;
    const cleared = peelPct >= TUNE.doneAt;
    const bonus = cleared && !timedOut ? Math.round(Math.max(0, S.left) * TUNE.timeBonus) : 0;
    const score = Math.max(0, Math.round(peelPct * TUNE.peelScore - dmgPct * TUNE.dmgPenalty + bonus));

    $("finalScore").textContent = score;
    $("peelEnd").textContent = Math.round(peelPct * 100) + "%";
    $("dmgEnd").textContent = Math.round(dmgPct * 100) + "%";

    /* 결과 사진 — 흰자를 얼마나 뜯었는지로 고른다 */
    const which = dmgPct >= TUNE.dmgBad ? "ruined"
                : dmgPct >= TUNE.dmgMid ? "damaged"
                : "peeled";
    const im = $("resultImg"), box = $("resultEgg");
    if (IMG[which].ok) {
      im.src = IMG[which].src;
      const z = RESULT_ZOOM[which];
      im.style.transform = "translateY(" + z.shift + "%) scale(" + z.zoom + ")";
      box.hidden = false;
    } else box.hidden = true;

    /* 멘트 — 시간에 쫓겼는지도 섞는다 */
    let line;
    if (timedOut && peelPct < 0.6) line = pick(REMARKS.slow);
    else if (timedOut && dmgPct >= 0.3) line = pick(REMARKS.rush);
    else if (score >= 700) line = pick(REMARKS.top);
    else if (score >= 300) line = pick(REMARKS.mid);
    else line = pick(REMARKS.low);
    $("remark").textContent = line;

    if (score > S.best) {
      S.best = score;
      try { localStorage.setItem("ccojik_peelegg_best", String(score)); } catch (_) {}
    }
    $("bestEnd").textContent = S.best;
    $("bestStart").textContent = S.best;
    $("endOver").hidden = false;
  }

  /* ============================================================
     조작 — 포인터로 마우스·터치를 함께 받는다
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
    S.drag = { x: p.x, y: p.y, t: performance.now() };
    rub(p.x, p.y, 0);                       // 처음 댄 자리는 살살 댄 것으로 본다
  }, { passive: false });

  cv.addEventListener("pointermove", e => {
    if (S.mode !== "play" || !S.drag) return;
    e.preventDefault();
    const p = pos(e), now = performance.now();
    const dt = Math.max(0.008, (now - S.drag.t) / 1000);
    const dist = Math.hypot(p.x - S.drag.x, p.y - S.drag.y);
    const rx = eggRect().w / 2;
    /* 계란 반지름을 1초에 몇 번 지나가는 속도인지로 잰다 — 화면 크기를 안 탄다 */
    const speedNorm = (dist / dt) / rx;
    /* 빠르게 움직이면 그 사이가 비므로 중간중간 찍어 준다 */
    const steps = Math.max(1, Math.ceil(dist / (rx * TUNE.brush * 0.7)));
    for (let s = 1; s <= steps; s++) {
      rub(S.drag.x + (p.x - S.drag.x) * s / steps,
          S.drag.y + (p.y - S.drag.y) * s / steps, speedNorm);
      if (S.mode !== "play") break;
    }
    S.drag = { x: p.x, y: p.y, t: now };
  }, { passive: false });

  const endDrag = () => { S.drag = null; };
  ["pointerup", "pointercancel"].forEach(t => cv.addEventListener(t, endDrag));
  addEventListener("pointerup", endDrag);
  addEventListener("blur", endDrag);

  $("startBtn").addEventListener("click", start);
  $("againBtn").addEventListener("click", start);
  $("doneBtn").addEventListener("click", () => { if (S.mode === "play") finish(false); });

  /* ============================================================
     루프
     ============================================================ */
  let last = 0;
  function tick(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!W || !H) { fitCanvas(); if (W && H && !S.cells) buildCells(); }
    step(dt);
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
      if (!W || !H || S.mode === "play") return;
      if (k === "shell") buildCells();
      else if (S.cells) buildLayers(null, null);
    };
    im.onerror = () => { o.ok = false; };    // 없으면 도형으로 굴러간다
    im.src = o.src;
    o.el = im;
  });

  $("timeInfo").textContent = TUNE.time;
  $("bestStart").textContent = S.best;
  $("timeNum").textContent = TUNE.time;
  requestAnimationFrame(tick);
})();
