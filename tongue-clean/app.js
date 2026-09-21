/* ===== 꼬직 · 혀 닦기 =====
 * 누르고 있으면 깊이 들어가고 구역질 게이지가 찬다. 떼면 그 깊이만큼 점수.
 * 게이지가 꽉 차면 그 판은 0점. 언제 뺄지가 전부인 게임.
 *
 * 캔버스는 CSS 크기 그대로 그린다(논리 좌표 = CSS 픽셀). 화면 비율이 달라져도
 * 매 프레임 크기에서 배치를 다시 계산하므로 찌그러지거나 좌표가 어긋나지 않는다. */
(() => {
  "use strict";

  /* ============================================================
     튜닝 — 숫자는 전부 여기서만 만진다
     ============================================================ */
  const TUNE = {
    strokes:    3,     // 한 판에 닦는 횟수
    diveSpeed:  0.58,  // 누르고 있을 때 초당 깊이 증가 (깊이는 0~1)
    outSpeed:   2.6,   // 뗐을 때 빠져나오는 속도
    gagBase:    0.20,  // 구역질 기본 상승(초당) — 얕아도 조금씩 찬다
    gagByDepth: 1.05,  // 깊이의 제곱에 비례해 더 빨리 찬다 (깊을수록 위험)
    gagRelief:  0.60,  // 빼는 동안 초당 가라앉는 양
    strokeRamp: 0.16,  // 횟수가 거듭될수록 더 빨리 찬다 (1회차 대비 비율)
    scoreCurve: 1.75,  // 클수록 '깊이'의 값이 가파르게 오른다
    scoreMax:   120,   // 한 번에 얻을 수 있는 최대 점수(깊이 1.0 기준)
    dangerAt:   0.70,  // 게이지 위험구간 시작(빨강)
    gagHold:    1.15,  // '우웩' 연출 길이(초)
  };

  /* 도구 — 난이도 겸 개그. gag 가 클수록 빨리 차고, score 가 클수록 많이 준다. */
  const TOOLS = [
    /* gag(위험)보다 score(보상)를 더 벌려야 도구 선택에 의미가 생긴다.
       둘을 같은 비율로 올리면 서로 상쇄돼 최고점이 똑같아진다.
       최적 플레이 기준 최고점: 170 / 196 / 217 점 */
    /* art: 사진 파일과, 사진 안에서 '머리'(혀에 닿는 부분)가 어디인지.
       headL~headR = 머리 좌우 비율, tip = 머리 끝의 세로 비율.
       사진을 바꾸면 이 세 값만 다시 잡으면 된다. */
    { key: "cleaner", name: "텅클리너", sub: "무난",       gag: 1.00, score: 1.00,
      art: { src: "cleaner.jpg", headL: 0.40, headR: 0.60, tip: 0.02 } },
    { key: "brush",   name: "칫솔",     sub: "좀 더 아슬", gag: 1.22, score: 1.42,
      art: { src: "brush.jpg",   headL: 0.41, headR: 0.59, tip: 0.02 } },
    { key: "spoon",   name: "숟가락",   sub: "왜요",       gag: 1.55, score: 2.05,
      art: { src: "spoon.jpg",   headL: 0.32, headR: 0.68, tip: 0.05 } },
  ];

  /* 한줄평 — 추가하려면 배열에 문장만 더 넣으면 된다 */
  const REMARKS = {
    gag:  ["우웩. 0점입니다", "혀보다 멘탈이 먼저 나갔습니다", "거기까진 아니었어요", "아침은 드셨나요"],
    low:  ["간만 봤네요", "조금만 더 들어가 보지", "안전제일도 좋습니다만"],
    mid:  ["조금만 더 참지 그랬어요", "나쁘지 않은 타협", "딱 중간입니다"],
    high: ["구역질 참기 장인", "프로 텅클리너", "혀가 개운하다고 합니다", "이 구역 최고 담력"],
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* ============================================================
     상태
     ============================================================ */
  const $ = id => document.getElementById(id);
  const S = {
    screen: "start",          // start | guide | play | result
    phase: "ready",           // ready | in | out | gag   (play 안에서의 단계)
    tool: TOOLS[0],
    depth: 0,                 // 0(혀끝) ~ 1(제일 안쪽)
    reach: 0,                 // 이번 판에서 닦아낸 최대 깊이
    gag: 0,                   // 구역질 0~1
    score: 0,
    stroke: 0,                // 지금 몇 번째 닦기인지 (0부터)
    gagT: 0,
    holding: false,
    best: 0,
  };
  try { S.best = +(localStorage.getItem("ccojik_tongue_best") || 0) || 0; } catch (_) {}

  /* 바탕 사진. 사진 안에서 혀가 차지하는 자리를 0~1 비율로 적어 둔다.
     (540x360 원본 기준 — 사진을 바꾸면 이 네 값만 다시 잡으면 된다) */
  const PHOTO = { src: "tongue.jpg", w: 540, h: 360,
                  x0: 0.422, x1: 0.583, y0: 0.478, y1: 0.811 };
  const photo = new Image();
  let photoOK = false;

  const cv = $("cv");
  const ctx = cv.getContext("2d");
  const artCv = $("artCv");
  const artCtx = artCv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  artCtx.imageSmoothingEnabled = false;

  /* ---- 도구 사진: 흰 배경 지우기 ----
     가장자리에서 시작해 흰색이 이어지는 만큼만 지운다. 이렇게 하면 숟가락의
     안쪽 흰 하이라이트처럼 '물체 안의 밝은 부분'은 구멍이 나지 않는다. */
  function cutWhite(img) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, c.width, c.height); }
    catch (_) { return c; }                 // file:// 로 열면 픽셀을 못 읽는다. 사진 그대로 쓴다.
    const px = d.data, W2 = c.width, H2 = c.height;
    /* 네 모서리에서 배경색을 잰다 */
    const at = (x, y) => { const i = (y * W2 + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    const corners = [at(0, 0), at(W2 - 1, 0), at(0, H2 - 1), at(W2 - 1, H2 - 1)];
    const bg = [0, 1, 2].map(k => corners.reduce((s, c2) => s + c2[k], 0) / 4);
    /* 그 색과 거의 같을 때만 배경. 기준을 넓게 잡으면 은색 숟가락처럼
       밝은 물체가 바깥과 이어진 채 같이 파먹힌다. */
    const TOL = 14;
    const isBg = i => Math.abs(px[i] - bg[0]) <= TOL
                   && Math.abs(px[i + 1] - bg[1]) <= TOL
                   && Math.abs(px[i + 2] - bg[2]) <= TOL;
    const seen = new Uint8Array(W2 * H2);
    const stack = [];
    for (let x = 0; x < W2; x++) { stack.push(x, (H2 - 1) * W2 + x); }
    for (let y = 0; y < H2; y++) { stack.push(y * W2, y * W2 + W2 - 1); }
    while (stack.length) {
      const p = stack.pop();
      if (seen[p]) continue;
      const i = p * 4;
      if (!isBg(i)) continue;
      seen[p] = 1; px[i + 3] = 0;
      const x = p % W2, y = (p - x) / W2;
      if (x > 0) stack.push(p - 1);
      if (x < W2 - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W2);
      if (y < H2 - 1) stack.push(p + W2);
    }
    /* 흰 손잡이(칫솔)나 은색 면(숟가락)은 바깥 배경과 색이 같아, 색만 보면
       바깥에서 물체 안쪽까지 지우기가 번져 들어간다.
       그래서 지운 뒤에, 남은 픽셀 사이에 끼어 있는 자리는 도로 살린다.
       좌우 모두 물체가 있고 위아래로도 물체가 있으면 그건 물체 안쪽이다. */
    const rowL = new Int32Array(H2).fill(-1), rowR = new Int32Array(H2).fill(-1);
    const colT = new Int32Array(W2).fill(-1), colB = new Int32Array(W2).fill(-1);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      if (seen[y * W2 + x]) continue;                  // 지워진 자리
      if (rowL[y] < 0) rowL[y] = x;
      rowR[y] = x;
      if (colT[x] < 0) colT[x] = y;
      colB[x] = y;
    }
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const p = y * W2 + x;
      if (!seen[p]) continue;
      if (x > rowL[y] && x < rowR[y] && rowL[y] >= 0 &&
          y > colT[x] && y < colB[x] && colT[x] >= 0) {
        seen[p] = 0; px[p * 4 + 3] = 255;              // 물체 안쪽 — 되살린다
      }
    }

    g.putImageData(d, 0, 0);
    let cut = 0; for (let p = 0; p < seen.length; p++) cut += seen[p];
    c.__cut = cut / seen.length;        // 실제로 얼마나 지웠는지
    return c;
  }

  /* 흰 칫솔·은색 숟가락은 밝은 혀 위에서 흐릿해 보인다.
     같은 모양을 검게 칠한 판을 만들어 뒤에 여러 번 깔아 테두리를 두른다. */
  function silhouette(src) {
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const g = c.getContext("2d");
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#16161D";
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /* 도구별 스프라이트를 미리 만들어 둔다 */
  const toolArt = {};
  TOOLS.forEach(t => {
    const im = new Image();
    im.onload = () => {
      const sp = cutWhite(im);
      /* 배경을 거의 못 지웠다면(사진이 흰 배경이 아니거나 픽셀을 못 읽은 경우)
         흰 사각형이 혀를 덮는다. 그럴 때는 곱하기로 얹어 밝은 곳이 비치게 한다. */
      /* 거의 안 지웠으면(흰 배경이 아니거나 픽셀을 못 읽음) 곱하기로 얹고,
         거의 다 지웠으면(남는 게 없음) 사진을 버리고 픽셀 도구로 간다. */
      const cut = sp.__cut;
      if (cut > 0.985) return;                  // 도구가 통째로 사라진 경우
      const mul = !(cut > 0.15);
      toolArt[t.key] = { cv: sp, w: im.naturalWidth, h: im.naturalHeight, a: t.art,
                         mul, edge: mul ? null : silhouette(sp) };
      drawArt();
    };
    im.onerror = () => {};                  // 없으면 아래 픽셀 그림으로 그린다
    im.src = t.art.src;
  });

  /* 사진은 캔버스 준비가 끝난 뒤에 건다 — onload 가 먼저 돌면 artCtx 가 아직 없다 */
  photo.onload = () => { photoOK = true; drawArt(); };
  photo.onerror = () => { photoOK = false; };      // 못 불러오면 픽셀 그림으로 굴러간다
  photo.src = PHOTO.src;

  /* ============================================================
     화면 전환
     ============================================================ */
  function show(name) {
    S.screen = name;
    ["startScreen", "guideScreen", "playScreen", "resultScreen"].forEach(id =>
      $(id).classList.remove("active"));
    $({ start: "startScreen", guide: "guideScreen", play: "playScreen", result: "resultScreen" }[name])
      .classList.add("active");
    if (name === "play") requestAnimationFrame(fitCanvas);
  }

  /* 캔버스를 칸 크기에 맞춘다. 논리 좌표를 CSS 픽셀과 1:1 로 두어
     터치 좌표가 따로 환산 없이 그대로 맞는다. */
  let W = 0, H = 0, dpr = 1;
  function fitCanvas() {
    const r = cv.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(r.width); H = Math.round(r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  addEventListener("resize", () => { if (S.screen === "play") fitCanvas(); });
  addEventListener("orientationchange", () => { if (S.screen === "play") fitCanvas(); });

  /* ============================================================
     그리기 — 위에서 내려다본 혀. 아래가 혀끝, 위가 목구멍 쪽.
     ============================================================ */
  /* 사진을 칸에 꽉 채운다(cover). 남는 쪽은 잘리는데, 혀 띠가 잘리지 않게
     세로 위치를 혀 가운데에 맞춘 뒤 사진 범위 안으로 되돌린다. */
  function photoBox(w, h) {
    const k = Math.max(w / PHOTO.w, h / PHOTO.h);
    const dw = PHOTO.w * k, dh = PHOTO.h * k;
    const dx = (w - dw) / 2;
    const mid = (PHOTO.y0 + PHOTO.y1) / 2;
    let dy = h / 2 - mid * dh;
    dy = Math.max(h - dh, Math.min(0, dy));        // 사진 밖이 보이지 않게
    return { dx, dy, dw, dh };
  }
  /* 사진 위에서 혀가 놓인 자리 */
  function photoGeom(w, h) {
    const b = photoBox(w, h);
    const x0 = b.dx + PHOTO.x0 * b.dw, x1 = b.dx + PHOTO.x1 * b.dw;
    return { box: b, cx: (x0 + x1) / 2, tw: x1 - x0,
             top: b.dy + PHOTO.y0 * b.dh, bot: b.dy + PHOTO.y1 * b.dh,
             tipY: b.dy + PHOTO.y1 * b.dh - 6,     // 깊이 0 (혀끝)
             backY: b.dy + PHOTO.y0 * b.dh + 6 };  // 깊이 1 (제일 안쪽)
  }

  function geom(w, h) {
    const tw = Math.min(w * 0.56, h * 0.42);
    const pad = h * 0.07;
    const top = pad, bot = h - pad;
    return { cx: w / 2, tw, top, bot,
             tipY: bot - 10,            // 깊이 0
             backY: top + 10 };         // 깊이 1
  }

  /* 혀 모양 — 위는 넓고 아래(혀끝)로 갈수록 좁아지는 둥근 형태 */
  function tonguePath(g, G) {
    const { cx, tw, top, bot } = G;
    const hw = tw / 2;
    g.beginPath();
    g.moveTo(cx - hw, top + hw * 0.5);
    g.quadraticCurveTo(cx - hw, top, cx, top);
    g.quadraticCurveTo(cx + hw, top, cx + hw, top + hw * 0.5);
    g.lineTo(cx + hw * 0.86, bot - hw * 0.72);
    g.quadraticCurveTo(cx + hw * 0.7, bot, cx, bot);
    g.quadraticCurveTo(cx - hw * 0.7, bot, cx - hw * 0.86, bot - hw * 0.72);
    g.closePath();
  }

  function drawScene(g, w, h, opt) {
    const showTool = opt && opt.tool !== false;
    const depth = opt && opt.depth || 0;
    const reach = opt && opt.reach || 0;
    const usePhoto = photoOK;
    const G = usePhoto ? photoGeom(w, h) : geom(w, h);

    g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, w, h);

    if (usePhoto) {
      const b = G.box;
      g.drawImage(photo, b.dx, b.dy, b.dw, b.dh);
    } else {
      // 사진을 못 불러왔을 때의 대비 — 픽셀 그림으로 그대로 굴러간다
      g.fillStyle = "#FFF6F0"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#E4B7AE";
      g.fillRect(0, 0, Math.max(6, w * 0.07), h);
      g.fillRect(w - Math.max(6, w * 0.07), 0, Math.max(6, w * 0.07), h);
      tonguePath(g, G); g.fillStyle = "#FF9AAE"; g.fill();
      g.lineWidth = 4; g.strokeStyle = "#16161D"; tonguePath(g, G); g.stroke();
      g.strokeStyle = "rgba(180,70,95,.5)"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(G.cx, G.top + 16); g.lineTo(G.cx, G.bot - 24); g.stroke();
    }

    // 설태 — 도트. 닦인 구간(아래쪽)에서는 지워진다.
    const cleanY = G.tipY + (G.backY - G.tipY) * reach;
    g.save();
    if (usePhoto) {
      // 혀 자리에만 칠해지게 막아 둔다
      g.beginPath();
      const hw = G.tw / 2, r = hw * 0.55;
      g.moveTo(G.cx - hw, G.top);
      g.lineTo(G.cx + hw, G.top);
      g.lineTo(G.cx + hw, G.bot - r);
      g.quadraticCurveTo(G.cx + hw, G.bot, G.cx, G.bot);
      g.quadraticCurveTo(G.cx - hw, G.bot, G.cx - hw, G.bot - r);
      g.closePath(); g.clip();
    } else { tonguePath(g, G); g.clip(); }
    g.fillStyle = usePhoto ? "rgba(214,206,170,.85)" : "#CFC7A6";
    for (let i = 0; i < 90; i++) {
      const rx = ((i * 73) % 100) / 100, ry = ((i * 37) % 100) / 100;
      const x = G.cx - G.tw / 2 + rx * G.tw;
      const y = G.top + ry * (G.bot - G.top);
      if (y > cleanY) continue;                     // 이미 닦인 구간
      g.fillRect(Math.round(x), Math.round(y), 4, 4);
    }
    // 닦인 자리 — 밝게
    g.fillStyle = "rgba(255,255,255,.34)";
    g.fillRect(G.cx - G.tw / 2 - 4, cleanY, G.tw + 8, G.bot - cleanY + 6);
    g.restore();

    // 깊이 눈금 — 오른쪽
    const sx = G.cx + G.tw / 2 + 12;
    if (sx < w - 14) {
      g.strokeStyle = "rgba(22,22,29,.3)"; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        const y = G.tipY + (G.backY - G.tipY) * (i / 4);
        g.beginPath(); g.moveTo(sx, y); g.lineTo(sx + (i % 2 ? 6 : 11), y); g.stroke();
      }
    }

    if (showTool) {
      const y = G.tipY + (G.backY - G.tipY) * depth;
      const hw = G.tw / 2 + 6;
      const art = toolArt[S.tool.key];

      if (art) {
        // 머리 폭을 혀 폭에 맞춰 사진을 키운다. 머리 끝이 지금 깊이에 놓이게.
        const headW = (art.a.headR - art.a.headL) * art.w;
        const k = (G.tw * 1.00) / headW;      // 머리 폭 = 혀 폭
        const dw = art.w * k, dh = art.h * k;
        /* 머리 끝을 그대로 깊이에 놓으면 날이 혀 위에 떠 보인다.
           머리 높이의 절반만큼 올려 날 가운데가 그 깊이에 닿게 한다. */
        const headH = (art.a.headR - art.a.headL) * art.w * k * 0.5;
        const dx = G.cx - dw / 2, dy = y - art.a.tip * dh - headH * 0.5;
        // 손잡이가 화면 아래까지 안 닿으면 이어 그려 준다
        const end = dy + dh;
        if (end < h) {
          g.fillStyle = "#2A2A33";
          g.fillRect(G.cx - Math.max(5, dw * 0.03), end - 2, Math.max(10, dw * 0.06), h - end + 4);
        }
        if (art.mul) {
          g.save(); g.globalCompositeOperation = "multiply";
          g.drawImage(art.cv, dx, dy, dw, dh);
          g.restore();
        } else {
          if (art.edge) {                       // 검은 테두리 — 밝은 도구도 또렷하게
            const r = Math.max(2, Math.round(dw * 0.016));
            for (let i = 0; i < 8; i++) {
              const ang = i * Math.PI / 4;
              g.drawImage(art.edge, dx + Math.cos(ang) * r, dy + Math.sin(ang) * r, dw, dh);
            }
          }
          g.drawImage(art.cv, dx, dy, dw, dh);
        }
      } else {
        // 사진을 못 불러왔을 때 — 원래 픽셀 도구
        g.fillStyle = "#6FC9F2"; g.fillRect(G.cx - 9, y, 18, h - y);
        g.strokeStyle = "#16161D"; g.lineWidth = 4; g.strokeRect(G.cx - 9, y, 18, h - y);
        g.fillStyle = "#BFE9FF"; g.fillRect(G.cx - hw, y - 14, hw * 2, 18);
        g.strokeStyle = "#16161D"; g.lineWidth = 4; g.strokeRect(G.cx - hw, y - 14, hw * 2, 18);
      }

      // 깊이 수치
      g.fillStyle = "#16161D";
      g.font = "700 " + Math.max(11, Math.round(h * 0.036)) + "px Galmuri11, monospace";
      g.textAlign = "center"; g.textBaseline = "bottom";
      g.fillText(Math.round(depth * 100) + "%", G.cx, y - 20);
    }

    // 우웩 연출
    if (S.phase === "gag" && g === ctx) {
      g.fillStyle = "rgba(233,43,63," + (0.22 + Math.sin(S.gagT * 40) * 0.12) + ")";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff";
      g.font = "700 " + Math.round(Math.min(w * 0.22, h * 0.16)) + "px Galmuri11, monospace";
      g.textAlign = "center"; g.textBaseline = "middle";
      const jx = (Math.random() - 0.5) * 10, jy = (Math.random() - 0.5) * 10;
      g.strokeStyle = "#16161D"; g.lineWidth = 8;
      g.strokeText("우웩", w / 2 + jx, h / 2 + jy);
      g.fillText("우웩", w / 2 + jx, h / 2 + jy);
    }
  }

  /* 시작화면 그림 — 같은 장면을 한 컷으로 */
  function drawArt() {
    artCtx.setTransform(1, 0, 0, 1, 0, 0);
    drawScene(artCtx, artCv.width, artCv.height, { depth: 0.42, reach: 0.42, tool: true });
    artCtx.strokeStyle = "#16161D"; artCtx.lineWidth = 6;
    artCtx.strokeRect(0, 0, artCv.width, artCv.height);
  }


  /* ============================================================
     한 판
     ============================================================ */
  function startRun() {
    S.phase = "ready"; S.depth = 0; S.reach = 0; S.gag = 0;
    S.score = 0; S.stroke = 0; S.gagT = 0; S.holding = false;
    $("holdBtn").classList.remove("on");
    $("holdBtn").textContent = "누르고 있기";
    syncHud();
    show("play");
  }

  /* 횟수가 거듭될수록 조금씩 빨리 찬다 */
  const gagRate = () =>
    (TUNE.gagBase + TUNE.gagByDepth * S.depth * S.depth) *
    S.tool.gag * (1 + TUNE.strokeRamp * S.stroke);

  const strokeScore = d => Math.round(TUNE.scoreMax * Math.pow(d, TUNE.scoreCurve) * S.tool.score);

  function press() {
    if (S.screen !== "play") return;
    if (S.phase !== "ready") return;
    S.holding = true; S.phase = "in";
    $("holdBtn").classList.add("on");
    $("holdBtn").textContent = "떼면 뺍니다";
  }
  function release() {
    if (!S.holding) return;
    S.holding = false;
    $("holdBtn").classList.remove("on");
    $("holdBtn").textContent = "누르고 있기";
    if (S.phase !== "in") return;
    S.phase = "out";
    S.score += strokeScore(S.depth);          // 뗀 순간의 깊이로 점수 확정
    S.reach = Math.max(S.reach, S.depth);
    syncHud();
  }

  function step(dt) {
    if (S.screen !== "play") return;

    if (S.phase === "in") {
      S.depth = Math.min(1, S.depth + TUNE.diveSpeed * dt);
      S.reach = Math.max(S.reach, S.depth);
      S.gag += gagRate() * dt;
      if (S.gag >= 1) {                        // 꽉 참 — 그 판 실패
        S.gag = 1; S.phase = "gag"; S.gagT = 0;
        S.holding = false;
        $("holdBtn").classList.remove("on");
        $("gaugeFill").parentElement.classList.add("flash");
      }
    } else if (S.phase === "out") {
      S.depth = Math.max(0, S.depth - TUNE.outSpeed * dt);
      S.gag = Math.max(0, S.gag - TUNE.gagRelief * dt);
      if (S.depth <= 0) {
        S.stroke++;
        if (S.stroke >= TUNE.strokes) return finish(false);
        S.phase = "ready";
        syncHud();
      }
    } else if (S.phase === "ready") {
      S.gag = Math.max(0, S.gag - TUNE.gagRelief * dt);
    } else if (S.phase === "gag") {
      S.gagT += dt;
      if (S.gagT >= TUNE.gagHold) return finish(true);
    }
    syncGauge();
  }

  function syncGauge() {
    const f = $("gaugeFill");
    f.style.width = (S.gag * 100).toFixed(1) + "%";
    f.classList.toggle("hot", S.gag >= TUNE.dangerAt);
  }
  function syncHud() {
    $("scoreNum").textContent = S.score;
    $("leftNum").textContent = Math.max(0, TUNE.strokes - S.stroke);
    syncGauge();
  }

  function finish(gagged) {
    const total = gagged ? 0 : S.score;
    $("gaugeFill").parentElement.classList.remove("flash");
    $("finalScore").textContent = total;
    /* 기준은 최적 플레이(170~217점)를 재서 잡았다.
       상 = 거의 최적, 중 = 무난, 하 = 너무 몸 사림 */
    $("remark").textContent = gagged ? pick(REMARKS.gag)
      : total >= 150 ? pick(REMARKS.high)
      : total >= 75  ? pick(REMARKS.mid)
      : pick(REMARKS.low);
    if (total > S.best) {
      S.best = total;
      try { localStorage.setItem("ccojik_tongue_best", String(total)); } catch (_) {}
    }
    $("bestNum").textContent = S.best;
    show("result");
  }

  /* ============================================================
     입력 — 포인터로 마우스·터치를 함께 받는다
     ============================================================ */
  function onDown(e) { e.preventDefault(); press(); }
  [cv, $("holdBtn")].forEach(el => {
    el.addEventListener("pointerdown", onDown, { passive: false });
    // 손가락이 벗어나도 이 누름이 이어지게 붙잡아 둔다
    el.addEventListener("pointerdown", e => { try { el.setPointerCapture(e.pointerId); } catch (_) {} });
  });
  addEventListener("pointerup", release);
  addEventListener("pointercancel", release);
  // 창을 벗어나면 누른 채로 남지 않게
  addEventListener("blur", release);

  /* 키보드(PC) — 스페이스로도 된다 */
  addEventListener("keydown", e => {
    if (e.code === "Space" && !e.repeat) { e.preventDefault(); press(); }
  });
  addEventListener("keyup", e => { if (e.code === "Space") release(); });

  /* ============================================================
     버튼 / 도구 고르기
     ============================================================ */
  function buildTools() {
    const box = $("tools");
    box.innerHTML = "";
    TOOLS.forEach(t => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tool" + (t.key === S.tool.key ? " on" : "");
      b.innerHTML = t.name + '<span class="t-sub">' + t.sub + "</span>";
      b.addEventListener("click", () => { S.tool = t; buildTools(); drawArt(); });
      box.appendChild(b);
    });
  }

  $("toGuideBtn").addEventListener("click", () => show("guide"));
  $("startBtn").addEventListener("click", startRun);
  $("againBtn").addEventListener("click", () => { buildTools(); show("start"); });

  /* ============================================================
     루프
     ============================================================ */
  let last = 0;
  function tick(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    step(dt);
    if (S.screen === "play") {
      if (!W || !H) fitCanvas();
      if (W && H) drawScene(ctx, W, H, { depth: S.depth, reach: S.reach, tool: true });
    }
    requestAnimationFrame(tick);
  }

  /* 부팅 */
  $("strokeInfo").textContent = ["한 번", "두 번", "세 번", "네 번", "다섯 번"][TUNE.strokes - 1] || TUNE.strokes + "번";
  buildTools();
  drawArt();
  syncHud();
  requestAnimationFrame(tick);
})();
