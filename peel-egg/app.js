/* ===== 꼬직 · 계란 완벽하게 까기 =====
 * 계란은 사진 세 장을 포개 만든다. 아래부터
 *   1) egg-damaged  뜯긴 흰자  — 손상됐을 때 드러나는 층
 *   2) egg-peeled   매끈한 흰자 — 잘 깠을 때 보이는 층
 *   3) egg-shell    껍질       — 시작 상태
 * 살살 문지르면 껍질만 지워져 매끈한 흰자가 나오고,
 * 급하게 다루면 그 자리는 매끈한 흰자까지 지워져 뜯긴 흰자가 드러난다.
 * 급하다는 판정은 두 갈래다. (1) 한 번에 빠르게 긁는 것, (2) 한 부위에 부담이
 * 쌓이는 것 — 같은 자리를 계속 문지르거나 급하게 연타하면 쌓인다. 그래서
 * 제자리 탭으로만 까는 꼼수가 통하지 않는다.
 * 지우기는 층마다 따로 둔 캔버스에 destination-out 으로 한다.
 * 껍질은 그냥 사라지지 않는다. 계란 표면에 흩뿌린 점들로 보로노이 조각을
 * 미리 잘라 두고, 문지른 자리의 조각에 먼저 그 모양대로 금이 짝 간 뒤
 * 조각이 떨어져 나가 중력을 받아 화면 아래로 사라진다. 네모 격자가 아니라
 * 제각각 생긴 다각형이라 계단처럼 보이지 않는다.
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

    /* 껍질 조각 한 장이자 채점 한 칸. 조각이 손에 잡히는 크기가 되도록 성기게 잡는다.
       너무 잘게 쪼개면 무겁고 오히려 픽셀처럼 보인다. */
    cols: 11, rows: 18,
    jitter: 0.38,          // 조각 씨앗점을 칸 안에서 흔드는 정도 (칸 크기 대비)
    brush: 0.17,           // 붓 반지름 (계란 가로 폭 대비)

    /* 문지르는 속도 — 계란 가로 반지름을 1초에 몇 번 지나가는지로 잰다.
       safe 아래는 안전, hard 위는 거의 확실히 뜯긴다. 그 사이는 확률. */
    safeSpeed: 1.6,
    hardSpeed: 5.2,

    /* 흰자가 뜯기는 두 번째 길 — 한 부위에 쌓이는 부담.
       빠르게 긁는 것과 별개로, 같은 자리를 계속 문지르거나 급하게 연타하면 쌓인다.
       쌓인 부담은 시간이 지나면 저절로 빠지므로, 천천히 넓게 가면 안 쌓인다. */
    stressRate: 2.2,       // 대고 있는 1초당 쌓이는 부담
    tapHit:     0.30,      // 한 번 탭(클릭)할 때 실리는 부담
    tapCalm:    0.30,      // 탭 간격이 이보다 길면 침착한 것 (초)
    tapRush:    0.06,      // 이보다 짧으면 완전히 급한 연타 (초)
    rushBoost:  3,         // 급한 연타가 부담을 몇 배까지 키우나
    stressFade: 1.6,       // 1초에 빠지는 부담
    stressTear: 1.0,       // 이만큼 쌓이면 흰자가 뜯긴다

    tearBlob: 0.62,        // 뜯긴 자국 반지름 (칸 크기 배수)

    /* 껍질이 깨져 떨어지는 연출. 속도·거리는 게임판 높이 대비라 화면 크기를 안 탄다. */
    crackLife: 0.22,       // 금이 보이는 시간(초)
    chipWait:  0.10,       // 금이 간 뒤 조각이 떨어지기까지(초)
    chipToss:  0.26,       // 떨어져 나갈 때 튕기는 속도 (게임판 높이 대비/초)
    chipDrop:  2.1,        // 중력 (게임판 높이 대비/초제곱)
    chipSpin:  7,          // 도는 속도 (라디안/초)
    maxChips:  90,         // 동시에 떨어지는 조각 수 상한 (성능)

    /* 채점 — 0~100점.
       점수 = 100 x (껍질 제거율 ^ wPeel) x (흰자 보존율 ^ wKeep)
       둘을 곱하므로 껍질을 안 벗기거나 흰자를 다 뜯으면 0점으로 수렴하고,
       다 벗기고 하나도 안 뜯으면 정확히 100점이 된다.
       중요도를 올리려면 그쪽 지수를 키운다 (예: wKeep 2 -> 흰자 손상이 두 배로 아프다). */
    wPeel: 1,              // 껍질 제거율의 중요도
    wKeep: 1,              // 흰자 보존율의 중요도
    doneAt: 0.98,          // 이만큼 벗기면 저절로 끝난다

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

  /* 등급 — 점수로 갈린다. 경계값·이름·쓸 사진을 한자리에서 본다.
     위에서부터 내려오며 처음 맞는 칸을 쓴다. 한줄평은 key 로 data.js 에서 찾는다. */
  const GRADES = [
    { min: 90, key: "perfect", label: "완벽", img: "peeled"  },
    { min: 70, key: "good",    label: "양호", img: "peeled"  },
    { min: 40, key: "damaged", label: "손상", img: "damaged" },
    { min:  0, key: "ruined",  label: "참사", img: "ruined"  },
  ];

  /* 결과 화면 — 사진 가장자리의 빈 여백을 걷어내고 계란만 꽉 차게 키운다.
     zoom 은 계란이 자리 높이를 채우는 배율, shift 는 계란이 사진 한가운데가
     아니라 조금 아래에 있어서 올려 주는 값(%). 알파를 실측해 낸 숫자다. */
  const RESULT_ZOOM = {
    peeled:  { zoom: 1.72, shift: -2.0 },
    damaged: { zoom: 1.67, shift: -3.2 },
    ruined:  { zoom: 1.53, shift: -2.6 },
  };

  /* 한줄평 — 문장은 data.js 에 있다. 등급에 맞는 배열에서 무작위로 하나. */
  function remarkFor(key) {
    const pool = (window.PEEL_EGG_REMARKS || {})[key];
    /* data.js 를 못 불러와도 게임은 굴러가야 한다 — 한 줄만 비워 둔다 */
    return pool && pool.length ? pool[Math.floor(Math.random() * pool.length)] : "";
  }

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
    stress: null,        // 칸마다 쌓인 부담
    stressAt: null,      // 그 부담을 마지막으로 건드린 시각
    lastTap: 0,          // 직전에 탭한 시각 — 연타가 급한지 보려고
    shards: null,        // 칸마다의 조각 모양 (0~1 비율 좌표라 화면이 바뀌어도 그대로)
    chips: [],           // 떨어지는 껍질 조각
    cracks: [],          // 막 깨진 자리에 짧게 보이는 금
    total: 0,
    peeled: 0,
    torn: 0,
    drag: null,
    best: 0,
  };
  /* 눈금이 0~100 으로 바뀌었다. 예전 기록(수백~천점)이 섞이지 않게 키를 새로 쓴다. */
  try { S.best = +(localStorage.getItem("ccojik_peelegg_best100") || 0) || 0; } catch (_) {}

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
  /* 주소창이 접히거나 화면이 돌아가도 캔버스 크기를 바로 따라잡는다.
     window 의 resize 가 안 오는 브라우저가 있어 캔버스를 직접 지켜본다. */
  try { new ResizeObserver(onResize).observe(cv); } catch (_) {}
  function onResize() {
    /* 화면이 바뀌어도 지금까지 벗기고 뜯은 자리는 그대로 옮겨 온다 */
    S.chips.length = 0;                 // 날던 조각은 새 좌표계와 안 맞는다
    S.cracks.length = 0;
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
    S.stress = new Float32Array(n);
    S.stressAt = new Float32Array(n);
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
    S.shards = buildShards();            // 판마다 새로 깨진다 — 같은 모양이 반복되지 않게
    buildLayers(null, null);
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

  /* 칸마다 조각 하나. 좌표는 계란 사각형을 0~1 로 본 비율이라 화면 크기를 안 탄다. */
  function buildShards() {
    const C = TUNE.cols, Rw = TUNE.rows;
    const cw = 1 / C, ch = 1 / Rw;
    /* 씨앗점을 칸 안에서 흔든다 — 이게 조각 모양을 제각각으로 만든다 */
    const site = [];
    for (let j = 0; j < Rw; j++) {
      for (let i = 0; i < C; i++) {
        site.push({
          u: (i + 0.5 + (Math.random() - 0.5) * TUNE.jitter * 2) * cw,
          v: (j + 0.5 + (Math.random() - 0.5) * TUNE.jitter * 2) * ch,
        });
      }
    }
    const out = [];
    for (let j = 0; j < Rw; j++) {
      for (let i = 0; i < C; i++) {
        const idx = j * C + i, a = site[idx];
        /* 넉넉한 사각형에서 시작해 이웃들과의 경계로 깎아 나간다.
           가장자리 조각이 계란 밖으로 뻗지 않게 처음부터 0~1 안으로 잘라 둔다. */
        const l = Math.max(0, a.u - cw * 1.6), r = Math.min(1, a.u + cw * 1.6);
        const t = Math.max(0, a.v - ch * 1.6), b2 = Math.min(1, a.v + ch * 1.6);
        let poly = [{ u: l, v: t }, { u: r, v: t }, { u: r, v: b2 }, { u: l, v: b2 }];
        for (let dj = -2; dj <= 2 && poly.length > 2; dj++) {
          for (let di = -2; di <= 2; di++) {
            if (!di && !dj) continue;
            const ni = i + di, nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= C || nj >= Rw) continue;
            const b = site[nj * C + ni];
            poly = clipHalf(poly, a.u, a.v, b.u, b.v);
            if (poly.length < 3) break;
          }
        }
        let lu = 1, lv = 1, hu = 0, hv = 0;
        for (const q of poly) {
          if (q.u < lu) lu = q.u; if (q.u > hu) hu = q.u;
          if (q.v < lv) lv = q.v; if (q.v > hv) hv = q.v;
        }
        out.push({ site: a, poly, lu, lv, hu, hv });
      }
    }
    return out;
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

  /* ============================================================
     껍질이 깨져 떨어진다
     ============================================================ */
  /* 조각 하나가 껍질 층에서 떨어져 나간다. 제 모양대로 금이 먼저 가고,
     잠깐 뒤 그 모양 그대로 조각이 떨어진다. */
  function breakChip(R, i, j) {
    const sh = S.shards[j * TUNE.cols + i];
    if (!sh || sh.poly.length < 3) return;

    /* 껍질 층에서 그 조각 모양을 지운다.
       fill 만 하면 가장자리 반투명이 실금으로 남으므로 같은 길을 한 번 더 긋는다. */
    const g = shellCv.getContext("2d");
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "#000"; g.strokeStyle = "#000";
    g.lineWidth = 1.2; g.lineJoin = "round";
    shardPath(g, sh, R, 0, 0);
    g.fill(); g.stroke();
    g.restore();

    /* 깨진 자리에 그 조각 모양대로 금이 보인다 — 직선 격자가 아니다 */
    S.cracks.push({ sh, R: { w: R.w, h: R.h }, ox: R.x, oy: R.y, life: TUNE.crackLife });

    /* 너무 많으면 조각은 생략한다 — 껍질은 그대로 사라지므로 게임에는 지장 없다 */
    if (S.chips.length >= TUNE.maxChips) return;
    const toss = TUNE.chipToss * H;
    const kx = IMG.shell.ok ? IMG.shell.el.naturalWidth / R.w : 1;
    const ky = IMG.shell.ok ? IMG.shell.el.naturalHeight / R.h : 1;
    const cx = sh.site.u * R.w, cy = sh.site.v * R.h;     // 조각이 도는 중심
    const bx = sh.lu * R.w, by = sh.lv * R.h;
    const bw = (sh.hu - sh.lu) * R.w, bh = (sh.hv - sh.lv) * R.h;
    S.chips.push({
      sh, x: R.x + cx, y: R.y + cy, cx, cy,
      /* 사진에서 떼어 올 자리와, 조각 중심을 원점으로 놓았을 때 그릴 자리 */
      sx: bx * kx, sy: by * ky, sw: bw * kx, sh2: bh * ky,
      dx: bx - cx, dy: by - cy, dw: bw, dh: bh,
      w: bw, h: bh,
      vx: (Math.random() - 0.5) * toss,
      vy: -Math.random() * toss * 0.45,             // 살짝 튕겨 올랐다가 떨어진다
      rot: 0, vr: (Math.random() - 0.5) * TUNE.chipSpin,
      wait: TUNE.chipWait,                          // 금이 가는 동안은 제자리
    });
  }

  function stepChips(dt) {
    const grav = TUNE.chipDrop * H;
    for (let k = S.chips.length - 1; k >= 0; k--) {
      const c = S.chips[k];
      if (c.wait > 0) { c.wait -= dt; continue; }    // 아직 금만 간 상태
      c.vy += grav * dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.y - c.h > H) S.chips.splice(k, 1);       // 화면 아래로 나가면 버린다
    }
    for (let k = S.cracks.length - 1; k >= 0; k--) {
      if ((S.cracks[k].life -= dt) <= 0) S.cracks.splice(k, 1);
    }
  }

  /* 한 칸에 부담을 더하고 지금 얼마나 쌓였는지 돌려준다.
     빠진 만큼은 건드릴 때 한꺼번에 계산한다 — 매 프레임 전체를 훑지 않아도 된다. */
  function addStress(idx, gain, now) {
    const gone = (now - S.stressAt[idx]) / 1000 * TUNE.stressFade;
    const v = Math.max(0, S.stress[idx] - gone) + gain;
    S.stress[idx] = v;
    S.stressAt[idx] = now;
    return v;
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

    /* 막 깨진 자리에 금이 간다 — 조각이 갈라진 모양 그대로라 들쭉날쭉하다 */
    if (S.cracks.length) {
      g.strokeStyle = "#7A6746";
      g.lineWidth = Math.max(1, R.w * 0.008);
      g.lineJoin = "round";
      for (const c of S.cracks) {
        g.globalAlpha = Math.max(0, c.life / TUNE.crackLife) * 0.8;
        shardPath(g, c.sh, R, c.ox, c.oy);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    /* 떨어지는 껍질 조각 — 제 모양대로 오려서 사진을 그 안에 그린다 */
    for (const c of S.chips) {
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.rot);
      shardPath(g, c.sh, R, -c.cx, -c.cy);        // 조각 중심이 원점
      g.clip();
      if (IMG.shell.ok) {
        g.drawImage(IMG.shell.el, c.sx, c.sy, c.sw, c.sh2, c.dx, c.dy, c.dw, c.dh);
      } else {
        g.fillStyle = "#D5C3A0";
        g.fillRect(c.dx, c.dy, c.dw, c.dh);
      }
      g.restore();
    }
  }

  /* ============================================================
     문지르기
     ============================================================ */
  /* dwell: 이번에 붓을 대고 있던 시간(초). impulse: 탭 한 번에 실리는 부담. */
  function rub(x, y, speedNorm, dwell, impulse) {
    const R = eggRect();
    const br = (R.w / 2) * TUNE.brush;
    /* 속도가 safe 를 넘을수록 흰자가 뜯길 확률이 오른다 */
    const p = clamp((speedNorm - TUNE.safeSpeed) / (TUNE.hardSpeed - TUNE.safeSpeed), 0, 1);
    /* 이번 손놀림이 그 칸에 얹는 부담 */
    const gain = (dwell || 0) * TUNE.stressRate + (impulse || 0);
    const now = performance.now();

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
        /* 뜯기는 길은 둘 — 한 번에 빠르게 긁었거나, 부담이 꽉 찼거나 */
        const tear = addStress(idx, gain, now) >= TUNE.stressTear || Math.random() < p;
        if (st === SHELL) {
          breakChip(R, i, j);                  // 이 칸의 껍질이 깨져 떨어진다
          if (tear) { S.cells[idx] = TORN; S.peeled++; S.torn++; tears.push(c); }
          else { S.cells[idx] = PEELED; S.peeled++; }
        } else if (tear) {
          /* 이미 벗긴 자리를 급하게 또 문지르면 흰자가 파인다 */
          S.cells[idx] = TORN; S.torn++; tears.push(c);
        }
      }
    }
    /* 껍질은 칸 단위로 깨져 떨어진다 (breakChip). 여기서 따로 지우지 않는다. */
    /* 매끈한 흰자는 뜯긴 칸에서만 벗겨져 아래 뜯긴 흰자가 드러난다 */
    erase(whiteCv, R, tears, Math.max(cw, ch) * TUNE.tearBlob);

    paintHud();
    if (S.peeled / S.total >= TUNE.doneAt) finish();
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
    if (S.left <= 0) finish();
  }

  function paintHud() {
    $("peelNum").textContent = Math.round(S.peeled / S.total * 100) + "%";
    $("dmgNum").textContent = Math.round(S.torn / S.total * 100) + "%";
  }

  function start() {
    S.mode = "play";
    S.left = TUNE.time;
    S.drag = null;
    S.lastTap = 0;
    S.chips.length = 0;
    S.cracks.length = 0;
    fitCanvas();
    buildCells();
    paintHud();
    $("startOver").hidden = true;
    $("endOver").hidden = true;
    $("timer").classList.remove("hot");
    $("timeNum").textContent = TUNE.time;
    $("timeFill").style.width = "100%";
  }

  function finish() {
    if (S.mode !== "play") return;
    S.mode = "over";
    S.drag = null;

    const peelPct = S.peeled / S.total, dmgPct = S.torn / S.total;
    const keepPct = 1 - dmgPct;                     // 흰자 보존율
    const score = clamp(Math.round(
      100 * Math.pow(peelPct, TUNE.wPeel) * Math.pow(keepPct, TUNE.wKeep)), 0, 100);
    const grade = GRADES.find(g => score >= g.min) || GRADES[GRADES.length - 1];

    $("finalScore").textContent = score;
    $("gradeLabel").textContent = grade.label;
    $("gradeLabel").className = "grade g-" + grade.key;
    /* 무엇으로 이 점수가 나왔는지 그대로 보여 준다 */
    $("peelEnd").textContent = Math.round(peelPct * 100) + "%";
    $("keepEnd").textContent = Math.round(keepPct * 100) + "%";
    $("scoreEnd").textContent = score + "점";

    /* 결과 사진 — 등급이 정한다 */
    const im = $("resultImg"), box = $("resultEgg");
    if (IMG[grade.img].ok) {
      im.src = IMG[grade.img].src;
      const z = RESULT_ZOOM[grade.img];
      im.style.transform = "translateY(" + z.shift + "%) scale(" + z.zoom + ")";
      box.hidden = false;
    } else box.hidden = true;

    $("remark").textContent = remarkFor(grade.key);

    if (score > S.best) {
      S.best = score;
      try { localStorage.setItem("ccojik_peelegg_best100", String(score)); } catch (_) {}
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
    const p = pos(e), now = performance.now();
    /* 직전 탭과의 간격 — 짧을수록 급한 연타다. 탭으로 안전하게 까는 길은 없다. */
    const gap = S.lastTap ? (now - S.lastTap) / 1000 : 99;
    const rush = clamp((TUNE.tapCalm - gap) / (TUNE.tapCalm - TUNE.tapRush), 0, 1);
    S.lastTap = now;
    S.drag = { x: p.x, y: p.y, t: now };
    rub(p.x, p.y, 0, 0, TUNE.tapHit * (1 + rush * TUNE.rushBoost));
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
          S.drag.y + (p.y - S.drag.y) * s / steps, speedNorm, dt / steps, 0);
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
  $("doneBtn").addEventListener("click", () => { if (S.mode === "play") finish(); });

  /* ============================================================
     루프
     ============================================================ */
  let last = 0;
  function tick(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!W || !H) { fitCanvas(); if (W && H && !S.cells) buildCells(); }
    step(dt);
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
