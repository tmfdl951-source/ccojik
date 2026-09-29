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
 * 조작은 둘로 확실히 갈라 둔다. 게임판 위를 끄는 것은 오직 '까기'이고,
 * 돌리는 것은 아래 [뒤집기] 버튼 전담이다. 한 손짓이 두 뜻으로 읽히지 않는다.
 *
 * 계란에는 앞면과 뒷면이 있다. 두 면은 껍질·흰자 상태를 따로 들고 있고,
 * 돌리면(가로로 뒤집는 짧은 애니메이션) 반대 면이 앞으로 나온다. 뒷면은 같은
 * 사진을 좌우로 뒤집어 그려 "반대쪽"처럼 보이게 한다. 점수는 양면을 합쳐서 낸다.
 *
 * 숫자(껍질 제거율·손상도)는 계란을 나눈 격자로 센다. 격자와 마스킹은 같은
 * rub() 안에서 함께 갱신되므로 화면과 숫자가 어긋나지 않는다. */
(() => {
  "use strict";

  /* ============================================================
     튜닝 — 숫자는 전부 여기서만 만진다
     ============================================================ */
  const TUNE = {
    time: 22,              // 제한시간(초) — 여기만 바꾸면 전부 따라간다.
                           // 양면을 다 까야 하므로 한 면만 있던 때의 두 배가 넘는다.
    hotAt: 5,              // 남은 시간이 이 아래면 빨갛게 커지고 두근거린다

    /* 계란 돌리기 — 납작해지지 않고 굴러 넘어가는 느낌으로.
       기울기·미끄러짐·표면을 스치는 빛을 겹쳐 입체 착시를 준다. */
    spinTime:   0.50,      // 굴러 도는 데 걸리는 시간(초). 이 동안은 까기가 안 먹는다.
    spinTilt:   0.17,      // 도는 동안 기우는 각도(라디안)
    spinSlide:  0.055,     // 옆으로 미끄러지는 정도 (계란 폭 대비)
    spinSquash: 0.10,      // 가로로 줄어드는 최대치. 0 까지 납작해지지 않게 조금만.
    spinBlend:  0.28,      // 반대 면으로 넘어가며 겹치는 구간 (0~1 중 길이)
    spinGlow:   0.42,      // 굴러갈 때 표면을 스치는 빛의 세기
    arrowFlip:  -1,        // 힌트 화살표가 휘어 도는 쪽. 계란 도는 방향과 안 맞으면
                           // 부호만 뒤집으면 된다 (+1 / -1).

    /* 돌릴 수 있다는 걸 알리는 힌트. 한 번 돌리고 나면 저절로 사라진다. */
    nudgeTime:   2.2,      // 시작 직후 계란이 까딱거리는 시간(초)
    nudgeSwing:  0.06,     // 까딱거리는 각도(라디안)
    nudgeCycles: 2,        // 그 동안 몇 번 까딱하나
    hintAt:      0.8,      // 한 면을 이만큼 까면 반대 면을 까라고 알린다

    /* 껍질 조각 한 장이자 채점 한 칸. 조각이 손에 잡히는 크기가 되도록 성기게 잡는다.
       너무 잘게 쪼개면 무겁고 오히려 픽셀처럼 보인다. */
    cols: 11, rows: 18,
    jitter: 0.38,          // 조각 씨앗점을 칸 안에서 흔드는 정도 (칸 크기 대비)
    shellScan: 10,         // 껍질 사진을 칸 하나당 몇 x 몇 으로 훑어 넓이를 잴지.
                           // 이 격자로 '조각마다 껍질 픽셀이 몇 개인지'를 센다.
    brush: 0.32,           // 붓 반지름 (계란 가로 폭 대비). 크면 한 번에 넓게 벗겨진다.

    /* ---- 난이도 ---- 이 아래 숫자만 만지면 쉬워지고 어려워진다.
       지금은 "정말 조심해야 안 뜯긴다" 쪽으로 잡아 뒀다. */

    /* 문지르는 속도 — 계란 가로 반지름을 1초에 몇 번 지나가는지로 잰다.
       safe 아래만 안전하다. 이 폭이 좁을수록 어렵다.
       hard 위는 거의 확실히 뜯긴다. 그 사이는 확률. */
    safeSpeed: 1.0,
    hardSpeed: 2.2,

    /* 흰자가 뜯기는 두 번째 길 — 한 부위에 쌓이는 부담.
       빠르게 긁는 것과 별개로, 한 자리에 머무르거나(꾹 누르기) 급하게 연타하거나
       같은 데를 거듭 문지르면 쌓인다. 넓게 옮겨 다니면 안 쌓인다. */
    stillSpeed: 0.35,      // 이보다 느리면 '머물러 있다'고 본다
    stressRate: 5.0,       // 머무는 1초당 쌓이는 부담 (꾹 누르면 이게 붙는다)
    sweepHit:   0.55,      // 붓이 한 번 지나갈 때 쌓이는 부담.
                           // 시간이 아니라 지나간 거리로 센다 — 천천히 가는 것은
                           // 벌이 아니고, 같은 데를 거듭 지나가는 것이 벌이다.
    tapHit:     0.35,      // 한 번 탭(클릭)할 때 실리는 부담
    tapCalm:    0.50,      // 탭 간격이 이보다 길면 침착한 것 (초)
    tapRush:    0.08,      // 이보다 짧으면 완전히 급한 연타 (초)
    rushBoost:  2.5,       // 급한 연타가 부담을 몇 배까지 키우나
    stressFade: 1.2,       // 1초에 빠지는 부담 (작을수록 오래 남아 어렵다)
    stressTear: 1.0,       // 이만큼 쌓이면 흰자가 뜯긴다

    tearSpread: 0.55,      // 한 칸이 뜯기면 옆 칸까지 번질 확률 (손상이 찔끔이 아니게)

    tearBlob: 0.66,        // 뜯긴 자국 반지름 (칸 크기 배수)

    /* 껍질이 깨져 떨어지는 연출. 속도·거리는 게임판 높이 대비라 화면 크기를 안 탄다. */
    crackLife: 0.22,       // 금이 보이는 시간(초)
    chipWait:  0.10,       // 금이 간 뒤 조각이 떨어지기까지(초)
    chipToss:  0.26,       // 떨어져 나갈 때 튕기는 속도 (게임판 높이 대비/초)
    chipDrop:  2.1,        // 중력 (게임판 높이 대비/초제곱)
    chipSpin:  7,          // 도는 속도 (라디안/초)
    maxChips:  90,         // 동시에 떨어지는 조각 수 상한 (성능)

    /* 채점 — 0~100점. 두 지표만 쓴다. 앞면+뒷면 합산이다.
         P = 껍질 제거율  = 벗긴 껍질 / 전체 껍질 x 100
         W = 흰자 보존율  = 100 - 흰자 손상율
       점수 = round(P x wPeel + W x wKeep), 0~100 으로 자른다.
       화면에 적히는 P, W 도 같은 반올림값이라 손으로 계산해도 딱 맞는다.
       흰자 보존을 더 무겁게 본다 — 다 벗겨도 흰자를 다 뜯으면 40점이다. */
    wPeel: 0.4,            // 껍질 제거율의 몫
    wKeep: 0.6,            // 흰자 보존율의 몫 (합이 1 이어야 0~100 이 유지된다)
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

  /* 껍질 사진의 불투명한 부분을 실측해 낸 타원 — 계란 사각형을 0~1 로 본 값.
     굴러갈 때 표면을 스치는 빛을 이 안에만 가두는 데 쓴다. */
  const EGG_OVAL = { cx: 0.500, cy: 0.501, rx: 0.337, ry: 0.240 };

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
  /* 면 하나가 들고 있는 것 — 껍질/흰자 상태와 그 면만의 층 두 장.
     맨 아래 '뜯긴 흰자'는 지우지 않으므로 두 면이 같이 쓴다(그릴 때만 뒤집는다). */
  function newFace(flip) {
    return {
      flip,              // 뒷면이면 좌우로 뒤집어 그린다
      cells: null, inside: null, w: null, stress: null, stressAt: null,
      shards: null,
      total: 0, peeled: 0, torn: 0,
      shell: document.createElement("canvas"),   // 껍질
      white: document.createElement("canvas"),   // 매끈한 흰자
    };
  }

  const S = {
    mode: "start",
    left: TUNE.time,
    faces: [newFace(false), newFace(true)],
    face: 0,             // 지금 앞에 나와 있는 면
    spin: null,          // 돌아가는 중이면 { p: 0~1, from, to }
    flipped: false,      // 한 번이라도 돌려 봤나 (힌트를 거둘지 정한다)
    nudge: 0,            // 시작 직후 까딱거리는 데 남은 시간
    lastTap: 0,          // 직전에 탭한 시각 — 연타가 급한지 보려고
    moved: false,        // 이번 프레임에 손이 움직였나 (가만히 누르고 있는지 보려고)
    chips: [],           // 떨어지는 껍질 조각
    cracks: [],          // 막 깨진 자리에 짧게 보이는 금
    drag: null,
    best: 0,
  };
  const FACE = () => S.faces[S.face];
  const sum = k => S.faces[0][k] + S.faces[1][k];
  /* 계란 한가운데를 기준으로 좌우를 뒤집는다 (뒷면 좌표 <-> 화면 좌표) */
  const mirX = (R, x) => R.x * 2 + R.w - x;
  /* 눈금이 0~100 으로 바뀌었다. 예전 기록(수백~천점)이 섞이지 않게 키를 새로 쓴다. */
  try { S.best = +(localStorage.getItem("ccojik_peelegg_best100") || 0) || 0; } catch (_) {}

  const cv = $("cv"), ctx = cv.getContext("2d");
  /* 맨 아래 '뜯긴 흰자'는 지우지 않으므로 두 면이 같이 쓴다 */
  const baseCv = document.createElement("canvas");
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
    const keep = S.faces.map(f => ({
      shell: f.shell.width ? snapshot(f.shell) : null,
      white: f.white.width ? snapshot(f.white) : null,
    }));
    if (fitCanvas() && S.faces[0].cells) buildLayers(keep);
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
  /* 조각이 실제로 놓인 자리 (씨앗점) */
  function shardPos(R, f, idx) {
    const st = f.shards[idx].site;
    return { x: R.x + st.u * R.w, y: R.y + st.v * R.h };
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

  function buildLayers(keep) {
    const R = eggRect();

    /* 맨 아래 — 뜯긴 흰자. 여기는 절대 안 지운다. 두 면이 같이 쓴다. */
    const gb = layerCtx(baseCv, R);
    if (IMG.damaged.ok) {
      const B = fitRect(R, FIT.damaged);
      gb.drawImage(IMG.damaged.el, B.x, B.y, B.w, B.h);
    } else { gb.fillStyle = "#E0CDAE"; gb.fillRect(0, 0, R.w, R.h); }
    clipToEgg(gb, R);

    S.faces.forEach((f, n) => {
      const prev = keep && keep[n];
      /* 중간 — 매끈한 흰자. 급하게 문지른 칸만 여기가 지워진다. */
      const gw = layerCtx(f.white, R);
      if (prev && prev.white) carryOver(gw, f.white, prev.white);
      else {
        if (IMG.peeled.ok) {
          const P = fitRect(R, FIT.peeled);
          gw.drawImage(IMG.peeled.el, P.x, P.y, P.w, P.h);
        } else { gw.fillStyle = "#FFFDF7"; gw.fillRect(0, 0, R.w, R.h); }
        clipToEgg(gw, R);
      }
      /* 맨 위 — 껍질. 문지르면 무조건 여기부터 지워진다. */
      const gs = layerCtx(f.shell, R);
      if (prev && prev.shell) carryOver(gs, f.shell, prev.shell);
      else drawEggShape(gs, R);
    });
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

  /* 채점용 격자. 조각을 먼저 잘라 두고, 조각마다 껍질 픽셀을 세어 넓이를 매긴다. */
  function buildCells() {
    const n = TUNE.cols * TUNE.rows;
    S.faces.forEach(f => {
      f.cells = new Uint8Array(n);
      f.inside = new Uint8Array(n);
      f.w = new Float32Array(n);
      f.stress = new Float32Array(n);
      f.stressAt = new Float32Array(n);
      f.peeled = 0; f.torn = 0;
      /* 면마다 따로 깨진다 — 앞뒤가 똑같은 모양으로 갈라지면 어색하다 */
      f.shards = buildShards();
      buildWeights(f);                   // 조각마다 껍질이 몇 픽셀인지
    });
    buildLayers(null);
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

  /* 조각마다 '껍질 사진의 불투명한 픽셀'이 몇 개나 들어 있는지 센다.
     조각은 씨앗점의 보로노이 칸이므로, 어떤 점이 어느 조각에 속하는지는
     '가장 가까운 씨앗점'으로 정해진다. 칸 사각형이 아니라 조각 모양 그대로다.
     그래서 씨앗점이 흔들려 칸과 어긋나 있어도 빠지는 껍질이 없다.
     여기서 잰 값이 곧 제거율의 분모다 — 가장자리까지 다 지워야 100% 가 된다. */
  function buildWeights(f) {
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

    f.w.fill(0);
    f.inside.fill(0);
    f.total = 0;
    for (let y = 0; y < SY; y++) {
      const v = (y + 0.5) / SY;
      for (let x = 0; x < SX; x++) {
        const u = (x + 0.5) / SX;
        let on;
        if (alpha) on = alpha[(y * SX + x) * 4 + 3] > 128;
        else {
          /* 사진을 못 읽으면 타원으로 대신 잡는다 */
          const dx = u * 2 - 1, dy = v * 2 - 1;
          on = dx * dx + dy * dy <= 1;
        }
        if (!on) continue;
        /* 가장 가까운 씨앗점 찾기 — 둘레 두 칸 안만 보면 충분하다 */
        const ci = Math.min(C - 1, Math.floor(u * C));
        const cj = Math.min(Rw - 1, Math.floor(v * Rw));
        let best = -1, bd = Infinity;
        for (let dj = -2; dj <= 2; dj++) {
          const nj = cj + dj;
          if (nj < 0 || nj >= Rw) continue;
          for (let di = -2; di <= 2; di++) {
            const ni = ci + di;
            if (ni < 0 || ni >= C) continue;
            const k = nj * C + ni, st = f.shards[k].site;
            const d = (st.u - u) * (st.u - u) + (st.v - v) * (st.v - v);
            if (d < bd) { bd = d; best = k; }
          }
        }
        if (best >= 0) { f.w[best]++; f.total++; }
      }
    }
    for (let k = 0; k < f.w.length; k++) if (f.w[k] > 0) f.inside[k] = 1;
    if (!f.total) f.total = 1;           // 0 으로 나누는 것만 막는다
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
    const f = FACE();
    const sh = f.shards[j * TUNE.cols + i];
    if (!sh || sh.poly.length < 3) return;

    /* 껍질 층에서 그 조각 모양을 지운다.
       fill 만 하면 가장자리 반투명이 실금으로 남으므로 같은 길을 한 번 더 긋는다. */
    const g = f.shell.getContext("2d");
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
    /* 뒷면은 뒤집어 보이고 있으므로 조각도 화면상 반대쪽에서 떨어져야 한다 */
    const scrX = f.flip ? mirX(R, R.x + cx) : R.x + cx;
    S.chips.push({
      sh, flip: f.flip, x: scrX, y: R.y + cy, cx, cy,
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
  function addStress(f, idx, gain, now) {
    const gone = (now - f.stressAt[idx]) / 1000 * TUNE.stressFade;
    const v = Math.max(0, f.stress[idx] - gone) + gain;
    f.stress[idx] = v;
    f.stressAt[idx] = now;
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

    /* 굴러 도는 중 — 계란은 둥근 모양을 지킨 채 살짝 기울고 미끄러진다.
       가로로는 아주 조금만 줄어든다(납작해지지 않는다).
       뒷면은 같은 사진을 좌우로 뒤집어 그려 "반대쪽"처럼 보이게 한다. */
    let roll = null;
    if (S.spin) {
      const s = S.spin;
      const p = easeOut(s.raw);
      const wave = Math.sin(Math.PI * p);            // 0 -> 1 -> 0
      roll = {
        p,
        tilt: wave * TUNE.spinTilt * s.dir,
        slide: wave * TUNE.spinSlide * R.w * s.dir,
        squash: 1 - wave * TUNE.spinSquash,
        /* 반대 면으로 넘어가는 짧은 구간에서만 겹쳐 보인다 — 툭 끊기지 않게 */
        blend: clamp((p - (0.5 - TUNE.spinBlend / 2)) / TUNE.spinBlend, 0, 1),
        dir: s.dir, from: s.from, to: s.to,
      };
    }

    if (roll) {
      drawFace(g, R, S.faces[roll.from], 1, roll);
      if (roll.blend > 0) drawFace(g, R, S.faces[roll.to], roll.blend, roll);
      drawRollGlow(g, R, roll);
    } else {
      drawFace(g, R, S.faces[S.face], 1, nudgePose(R));
      /* 막 깨진 자리에 금이 간다 — 조각이 갈라진 모양 그대로라 들쭉날쭉하다 */
      if (S.cracks.length) {
        const face = S.faces[S.face];
        g.save();
        const ecx = R.x + R.w / 2;
        g.translate(ecx, 0); g.scale(face.flip ? -1 : 1, 1); g.translate(-ecx, 0);
        g.strokeStyle = "#7A6746";
        g.lineWidth = Math.max(1, R.w * 0.008);
        g.lineJoin = "round";
        for (const c of S.cracks) {
          g.globalAlpha = Math.max(0, c.life / TUNE.crackLife) * 0.8;
          shardPath(g, c.sh, R, c.ox, c.oy);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.restore();
      }
    }

    drawSpinHint(g, R, performance.now());

    /* 떨어지는 껍질 조각 — 이미 떨어져 나왔으므로 화면 좌표로 따로 그린다 */
    for (const c of S.chips) {
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.rot);
      if (c.flip) g.scale(-1, 1);                 // 뒷면에서 떨어진 조각
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

  /* 시작 직후 계란이 좌우로 까딱거린다 — 돌아갈 수 있다는 암시.
     한 번 돌려 보면 그만둔다. */
  function nudgePose(R) {
    if (S.nudge <= 0 || S.spin || S.flipped) return null;
    const t = 1 - S.nudge / TUNE.nudgeTime;        // 0 -> 1
    const damp = Math.max(0, 1 - t);               // 갈수록 잦아든다
    const a = Math.sin(t * Math.PI * 2 * TUNE.nudgeCycles) * TUNE.nudgeSwing * damp;
    return { tilt: a, slide: a * R.w * 0.35, squash: 1 };
  }

  /* 계란 오른쪽에 위로 휘어 도는 곡선 화살표 하나.
     아래에서 시작해 왼쪽을 지나 위로 올라가며 오른쪽으로 빠지는 매끈한 호에,
     끝에 삼각 화살촉을 붙였다. 동그라미로 한 바퀴 두르지 않는다.
     이건 안내일 뿐이고 실제로 돌리는 곳은 아래 [뒤집기] 버튼이다.
     캔버스로 직접 그린다(그림 파일도, 이모지도 아니다). */
  function drawSpinHint(g, R, now) {
    if (S.flipped || S.spin || S.mode !== "play") return;
    const margin = (W - R.w) / 2;
    /* 여백이 좁은 세로로 긴 화면에서는 계란에 살짝 걸쳐서라도 그린다 */
    const rad = Math.max(R.w * 0.072, Math.min(margin * 0.40, R.w * 0.11));
    const cx = W - margin / 2, cy = R.y + R.h * 0.42;
    /* 통째로 도는 대신 좌우로 조금 흔들린다 — 동그라미로 안 읽히게 */
    const rock = Math.sin(now / 560) * 0.16;
    const alpha = 0.7 + 0.22 * Math.sin(now / 520);

    g.save();
    g.globalAlpha = alpha;
    g.translate(cx, cy);
    /* 계란이 도는 쪽과 맞추려고 좌우를 뒤집는다 (arrowFlip) */
    g.scale(TUNE.arrowFlip, 1);
    g.rotate(rock * TUNE.arrowFlip);

    const lw = Math.max(2.5, rad * 0.30);
    /* 0.62pi(왼쪽 아래)에서 1.62pi(위를 지나 오른쪽)까지 — 위로 휘어 오른다 */
    const a0 = Math.PI * 0.62, a1 = Math.PI * 1.62;
    const head = rad * 0.46;                           // 화살촉 크기
    const tipA = a1 + 0.44;                            // 호보다 조금 더 간 지점
    const baseA = a1 - 0.02;

    /* 흰 테두리를 먼저 깔고 그 위에 빨간 선 — 어떤 바탕에서도 읽힌다 */
    for (const outline of [true, false]) {
      const col = outline ? "rgba(255,255,255,.96)" : "#DA2B2B";
      g.strokeStyle = col; g.fillStyle = col;
      g.lineWidth = outline ? lw * 2.1 : lw;
      g.lineCap = "round"; g.lineJoin = "round";

      g.beginPath();
      g.arc(0, 0, rad, a0, a1);
      g.stroke();

      /* 호가 끝나는 쪽에 삼각 화살촉 — 도는 방향을 가리킨다 */
      g.beginPath();
      g.moveTo(Math.cos(tipA) * rad, Math.sin(tipA) * rad);
      g.lineTo(Math.cos(baseA) * (rad + head), Math.sin(baseA) * (rad + head));
      g.lineTo(Math.cos(baseA) * (rad - head), Math.sin(baseA) * (rad - head));
      g.closePath();
      g.fill();
      if (outline) { g.lineWidth = lw * 1.3; g.stroke(); }
    }
    g.restore();
  }

  /* 한 면을 그린다. roll 이 있으면 굴러가는 자세로. */
  function drawFace(g, R, face, alpha, roll) {
    const ecx = R.x + R.w / 2, ecy = R.y + R.h / 2;
    g.save();
    g.globalAlpha = alpha;
    if (roll) {
      g.translate(ecx + roll.slide, ecy);
      g.rotate(roll.tilt);
      g.scale(roll.squash * (face.flip ? -1 : 1), 1);
      g.translate(-ecx, -ecy);
    } else {
      g.translate(ecx, 0);
      g.scale(face.flip ? -1 : 1, 1);
      g.translate(-ecx, 0);
    }
    if (baseCv.width) g.drawImage(baseCv, R.x, R.y, R.w, R.h);        // 뜯긴 흰자
    if (face.white.width) g.drawImage(face.white, R.x, R.y, R.w, R.h); // 매끈한 흰자
    if (face.shell.width) g.drawImage(face.shell, R.x, R.y, R.w, R.h); // 껍질
    g.restore();
  }

  /* 굴러가는 착시의 핵심 — 표면을 스치고 지나가는 빛과 그늘.
     계란 실루엣 안쪽에만 칠한다. */
  function drawRollGlow(g, R, roll) {
    const wave = Math.sin(Math.PI * roll.p);
    if (wave < 0.02) return;
    const ecx = R.x + R.w / 2, ecy = R.y + R.h / 2;
    g.save();
    g.translate(ecx + roll.slide, ecy);
    g.rotate(roll.tilt);
    g.translate(-ecx, -ecy);
    g.beginPath();
    g.ellipse(R.x + EGG_OVAL.cx * R.w, R.y + EGG_OVAL.cy * R.h,
              EGG_OVAL.rx * R.w, EGG_OVAL.ry * R.h, 0, 0, 7);
    g.clip();

    /* 빛이 지나가는 자리 — 도는 방향으로 쓸고 간다 */
    const lead = roll.dir > 0 ? roll.p : 1 - roll.p;
    const band = R.w * 0.55;
    const at = R.x + R.w * (0.15 + lead * 0.7);
    const gr = g.createLinearGradient(at - band, 0, at + band, 0);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.5, "rgba(255,255,255," + (TUNE.spinGlow * wave).toFixed(3) + ")");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(R.x, R.y, R.w, R.h);

    /* 빛 뒤로는 그늘이 따라온다 — 둥글게 말려 들어가는 느낌 */
    const back = at - roll.dir * R.w * 0.62;
    const gd = g.createLinearGradient(back - band, 0, back + band, 0);
    gd.addColorStop(0, "rgba(40,30,15,0)");
    gd.addColorStop(0.5, "rgba(40,30,15," + (TUNE.spinGlow * 0.5 * wave).toFixed(3) + ")");
    gd.addColorStop(1, "rgba(40,30,15,0)");
    g.fillStyle = gd;
    g.fillRect(R.x, R.y, R.w, R.h);
    g.restore();
  }

  /* ============================================================
     문지르기
     ============================================================ */
  /* dwell: 붓을 대고 있던 시간(초).  impulse: 탭 한 번에 실리는 부담.
     sweep: 붓 지름 대비 이번에 지나간 거리(한 번 훑고 지나가면 1). */
  /* 한 칸을 뜯는다. 껍질이 남아 있었다면 그 조각도 같이 떨어져 나간다. */
  function tearCell(f, R, i, j, tears) {
    if (i < 0 || j < 0 || i >= TUNE.cols || j >= TUNE.rows) return;
    const idx = j * TUNE.cols + i;
    if (!f.inside[idx] || f.cells[idx] === TORN) return;
    if (f.cells[idx] === SHELL) { breakChip(R, i, j); f.peeled += f.w[idx]; }
    f.cells[idx] = TORN;
    f.torn += f.w[idx];
    /* 가장자리 조각은 껍질을 조금밖에 안 덮는다 — 자국도 그만큼만 남겨야
       화면에 보이는 손상과 손상도 숫자가 안 어긋난다. */
    const full = TUNE.shellScan * TUNE.shellScan;
    const part = Math.min(1, Math.sqrt(f.w[idx] / full));
    const at = shardPos(R, f, idx);
    at.r = Math.max(R.w / TUNE.cols, R.h / TUNE.rows) * TUNE.tearBlob * part;
    tears.push(at);
  }

  function rub(x, y, speedNorm, dwell, impulse, sweep) {
    if (S.spin) return;                  // 돌아가는 중에는 까기가 안 먹는다
    const R = eggRect();
    const f = FACE();
    /* 뒷면은 뒤집어 보이고 있으니, 손가락이 닿은 화면 자리를 면 좌표로 옮긴다 */
    if (f.flip) x = mirX(R, x);
    const br = (R.w / 2) * TUNE.brush;
    /* 속도가 safe 를 넘을수록 흰자가 뜯길 확률이 오른다.
       이 확률은 '붓이 한 번 훑고 지나갈 때' 기준이다. 아래에서 지나간 거리만큼
       나눠 굴리므로, 프레임이 몇 번 돌았는지에 따라 결과가 달라지지 않는다. */
    const p = clamp((speedNorm - TUNE.safeSpeed) / (TUNE.hardSpeed - TUNE.safeSpeed), 0, 1);
    /* 이번 손놀림이 그 칸에 얹는 부담.
       sweep 은 붓 지름 대비 지나간 거리 — 한 번 훑고 지나가면 1 이 된다.
       머무를수록(stillSpeed 아래) 시간당 부담이 따로 크게 붙는다 = 꾹 누르기. */
    const still = clamp(1 - speedNorm / TUNE.stillSpeed, 0, 1);
    const gain = (sweep || 0) * TUNE.sweepHit
               + (dwell || 0) * TUNE.stressRate * still
               + (impulse || 0);
    /* 이번에 지나간 만큼만 굴린다 — 한 번 다 훑고 지나가면 딱 p 가 된다 */
    const passP = p > 0 ? 1 - Math.pow(1 - p, Math.min(1, sweep || 0)) : 0;
    const now = performance.now();

    const cw = R.w / TUNE.cols, ch = R.h / TUNE.rows;
    /* 조각의 씨앗점은 칸 안에서 흔들려 있으므로 한 칸씩 넉넉히 훑는다 */
    const i0 = Math.max(0, Math.floor((x - br - R.x) / cw) - 1);
    const i1 = Math.min(TUNE.cols - 1, Math.ceil((x + br - R.x) / cw) + 1);
    const j0 = Math.max(0, Math.floor((y - br - R.y) / ch) - 1);
    const j1 = Math.min(TUNE.rows - 1, Math.ceil((y + br - R.y) / ch) + 1);

    let touched = false;
    const tears = [];                    // 이번에 뜯긴 칸들
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const idx = j * TUNE.cols + i;
        if (!f.inside[idx]) continue;
        /* 조각이 실제로 놓인 자리로 잰다. 칸 가운데로 재면 씨앗점이 흔들린 만큼
           어긋나서, 가장자리 조각에 붓이 닿아도 안 깨지는 일이 생긴다. */
        const c = shardPos(R, f, idx);
        if (Math.hypot(c.x - x, c.y - y) > br) continue;
        touched = true;

        const st = f.cells[idx];
        if (st === TORN) continue;
        /* 뜯기는 길은 둘 — 한 번에 빠르게 긁었거나, 부담이 꽉 찼거나 */
        const tear = addStress(f, idx, gain, now) >= TUNE.stressTear || Math.random() < passP;
        if (tear) {
          /* 한 번 뜯기면 옆으로 번진다 — 한 번의 실수가 찔끔으로 끝나지 않게 */
          tearCell(f, R, i, j, tears);
          if (Math.random() < TUNE.tearSpread) tearCell(f, R, i - 1, j, tears);
          if (Math.random() < TUNE.tearSpread) tearCell(f, R, i + 1, j, tears);
          if (Math.random() < TUNE.tearSpread) tearCell(f, R, i, j - 1, tears);
          if (Math.random() < TUNE.tearSpread) tearCell(f, R, i, j + 1, tears);
        } else if (st === SHELL) {
          breakChip(R, i, j);                  // 껍질만 깨져 떨어진다
          f.cells[idx] = PEELED; f.peeled += f.w[idx];
        }
      }
    }
    /* 껍질은 칸 단위로 깨져 떨어진다 (breakChip). 여기서 따로 지우지 않는다. */
    /* 매끈한 흰자는 뜯긴 칸에서만 벗겨져 아래 뜯긴 흰자가 드러난다 */
    erase(f.white, R, tears, Math.max(cw, ch) * TUNE.tearBlob);

    paintHud();
    if (sum("peeled") / sum("total") >= TUNE.doneAt) finish();
  }

  /* ============================================================
     계란 돌리기
     ============================================================ */
  /* 굴러 멈추는 느낌 — 뒤로 갈수록 느려진다 */
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  /* 돌리기는 [뒤집기] 버튼 전담이다. 게임판을 끄는 것과 섞이지 않는다. */
  function flipEgg() {
    if (S.mode !== "play" || S.spin) return;
    S.cracks.length = 0;                 // 금은 면에 붙어 있다 — 같이 넘어가면 어색하다
    S.drag = null;                       // 까던 손은 여기서 끊는다
    S.spin = { raw: 0, dir: 1, from: S.face, to: 1 - S.face };
  }

  function stepSpin(dt) {
    const s = S.spin;
    if (!s) return;
    s.raw = clamp(s.raw + dt / TUNE.spinTime, 0, 1);
    /* 반을 넘어가는 순간 반대 면으로 바꾼다 */
    if (s.raw >= 0.5 && S.face === s.from) {
      S.face = s.to;
      S.flipped = true;                  // 돌릴 줄 알게 됐으니 힌트는 거둔다
      S.nudge = 0;
      paintHud();
    }
    if (s.raw >= 1) S.spin = null;
  }

  /* ============================================================
     진행
     ============================================================ */
  function step(dt) {
    if (S.mode !== "play") return;
    /* 손을 댄 채 가만히 있으면 pointermove 가 안 온다. 그 시간도 부담으로 친다. */
    if (S.drag && !S.moved) rub(S.drag.x, S.drag.y, 0, dt, 0);
    S.moved = false;
    if (S.mode !== "play") return;
    if (S.nudge > 0) S.nudge -= dt;
    S.left -= dt;
    const t = $("timer");
    t.classList.toggle("hot", S.left <= TUNE.hotAt);
    $("timeNum").textContent = Math.max(0, Math.ceil(S.left));
    $("timeFill").style.width = clamp(S.left / TUNE.time, 0, 1) * 100 + "%";
    if (S.left <= 0) finish();
  }

  function paintHud() {
    /* 앞뒤를 합쳐서 센다 — 한 면만 까면 제거율이 반밖에 안 오른다 */
    $("peelNum").textContent = Math.round(sum("peeled") / sum("total") * 100) + "%";
    $("dmgNum").textContent = Math.round(sum("torn") / sum("total") * 100) + "%";
    const f = FACE(), other = S.faces[1 - S.face];
    $("faceTag").textContent = f.flip ? "뒷면" : "앞면";
    /* 지금 보는 면이 얼마나 깠는지도 같이 — 뒤집을 때가 됐는지 알 수 있게 */
    $("faceDone").textContent = Math.round(f.peeled / f.total * 100) + "%";

    /* 돌리는 곳이 버튼이라는 걸 버튼 자신도 알린다 */
    $("flipBtn").classList.toggle("callout", S.mode === "play" && !S.flipped);

    /* 힌트 — 이 면을 거의 다 깠으면 반대 면으로 가라고 붙잡는다 */
    const hint = $("spinHint");
    const needOther = f.peeled / f.total >= TUNE.hintAt &&
                      other.peeled / other.total < TUNE.hintAt;
    if (needOther) {
      hint.textContent = (f.flip ? "앞면" : "뒷면") + "도 까세요";
      hint.className = "hint urge";
      hint.hidden = false;
    } else if (!S.flipped) {
      hint.textContent = "아래 [뒤집기] 를 누르면 뒷면도 깔 수 있어요";
      hint.className = "hint";
      hint.hidden = false;
    } else {
      hint.hidden = true;            // 이미 돌릴 줄 안다
    }
  }

  function start() {
    S.mode = "play";
    S.left = TUNE.time;
    S.drag = null;
    S.lastTap = 0;
    S.face = 0;
    S.spin = null;
    S.flipped = false;
    S.nudge = TUNE.nudgeTime;
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

    /* 앞뒤를 합쳐서 낸다 — 뒷면을 안 까면 제거율이 안 오른다 */
    /* 화면에 적는 값으로 그대로 계산한다 — 보이는 숫자와 점수가 어긋나지 않게 */
    const P = Math.round(sum("peeled") / sum("total") * 100);       // 껍질 제거율
    const W = 100 - Math.round(sum("torn") / sum("total") * 100);   // 흰자 보존율
    const score = clamp(Math.round(P * TUNE.wPeel + W * TUNE.wKeep), 0, 100);
    const grade = GRADES.find(g => score >= g.min) || GRADES[GRADES.length - 1];

    $("finalScore").textContent = score;
    $("gradeLabel").textContent = grade.label;
    $("gradeLabel").className = "grade g-" + grade.key;
    /* 무엇으로 이 점수가 나왔는지 그대로 보여 준다 */
    $("peelEnd").textContent = P + "%";
    $("keepEnd").textContent = W + "%";
    $("scoreEnd").textContent = score + "점";
    $("gradeEnd").textContent = "[" + grade.label + "]";

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
    if (S.mode !== "play" || S.spin) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    const p = pos(e), now = performance.now();
    /* 게임판 위를 누르는 것은 오직 까기다. 돌리기는 [뒤집기] 버튼이 맡는다. */
    S.moved = true;
    /* 직전 탭과의 간격 — 짧을수록 급한 연타다. 탭으로 안전하게 까는 길은 없다. */
    const gap = S.lastTap ? (now - S.lastTap) / 1000 : 99;
    const rush = clamp((TUNE.tapCalm - gap) / (TUNE.tapCalm - TUNE.tapRush), 0, 1);
    S.lastTap = now;
    S.drag = { x: p.x, y: p.y, t: now };
    rub(p.x, p.y, 0, 0, TUNE.tapHit * (1 + rush * TUNE.rushBoost));
  }, { passive: false });

  cv.addEventListener("pointermove", e => {
    if (S.mode !== "play" || !S.drag || S.spin) return;
    e.preventDefault();
    const p = pos(e), now = performance.now();
    S.moved = true;
    const dt = Math.max(0.008, (now - S.drag.t) / 1000);
    const dist = Math.hypot(p.x - S.drag.x, p.y - S.drag.y);
    const rx = eggRect().w / 2;
    /* 계란 반지름을 1초에 몇 번 지나가는 속도인지로 잰다 — 화면 크기를 안 탄다 */
    const speedNorm = (dist / dt) / rx;
    /* 빠르게 움직이면 그 사이가 비므로 중간중간 찍어 준다 */
    const steps = Math.max(1, Math.ceil(dist / (rx * TUNE.brush * 0.7)));
    const sweep = dist / (rx * TUNE.brush * 2);     // 붓 지름 몇 개만큼 지나갔나
    for (let s = 1; s <= steps; s++) {
      rub(S.drag.x + (p.x - S.drag.x) * s / steps,
          S.drag.y + (p.y - S.drag.y) * s / steps,
          speedNorm, dt / steps, 0, sweep / steps);
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
  $("flipBtn").addEventListener("click", flipEgg);

  /* ============================================================
     루프
     ============================================================ */
  let last = 0;
  function tick(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!W || !H) { fitCanvas(); if (W && H && !S.faces[0].cells) buildCells(); }
    stepSpin(dt);
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
      else if (S.faces[0].cells) buildLayers(null);
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
