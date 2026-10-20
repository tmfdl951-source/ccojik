/* ============================================================
   머리 실루엣 생성기
   ============================================================
   예전에는 머리가 '손으로 그린 path 한 덩어리' 였다. 그래서
     - 정수리가 납작해 종이조각처럼 보이고
     - 관자놀이가 얼굴 윤곽과 안 맞고
     - 길이만 다르고 실루엣이 다 비슷했다.

   이제는 기준점 몇 개와 곡선 프리셋으로 만든다. 스타일 = 숫자 묶음이고,
   그 숫자가 정수리 볼륨 / 관자놀이 폭 / 길이 / 물결 / 가르마를 정한다.
   점을 Catmull-Rom 으로 이어 부드러운 베지에로 바꾸므로, 적은 숫자로도
   두상을 따라가는 유기적인 윤곽이 나온다.

   좌표는 기준 얼굴(REF) 위에 그린다.
     가운데 x=150 · 이마선 y=108 · 눈썹선 y=151 · 턱 y=264 · 얼굴 반폭 70
   app.js 의 place/placeFront/placeHair 가 얼굴마다 옮겨 얹는다.

   금지: 외부 라이브러리, 이모지
   ============================================================ */
(() => {
  "use strict";

  const CX = 150;          // 가운데
  const TOP = 108;         // 이마선 (머리카락이 이마와 만나는 선)
  const BROW = 151;        // 눈썹선
  const CHIN = 264;        // 턱
  const HALF = 70;         // 얼굴 반폭

  const r1 = v => Math.round(v * 10) / 10;

  /* ------------------------------------------------------------
     점을 부드러운 곡선으로 — Catmull-Rom 을 3차 베지에로 바꾼다.
     이게 있어야 숫자 몇 개로 '두상을 따라 흐르는' 윤곽이 나온다.
     ------------------------------------------------------------ */
  function smooth(pts, close) {
    if (pts.length < 2) return "";
    const p = pts.slice();
    if (close) p.push(p[0]);
    let d = "M" + r1(p[0][0]) + " " + r1(p[0][1]);
    const at = i => p[Math.max(0, Math.min(p.length - 1, i))];
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = close ? at(i === 0 ? p.length - 2 : i - 1) : at(i - 1);
      const p1 = at(i), p2 = at(i + 1);
      const p3 = close ? at(i + 2 >= p.length ? 1 : i + 2) : at(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += "C" + r1(c1[0]) + " " + r1(c1[1]) + " " + r1(c2[0]) + " " + r1(c2[1]) +
           " " + r1(p2[0]) + " " + r1(p2[1]);
    }
    return d + (close ? "z" : "");
  }

  /* ------------------------------------------------------------
     머리 바깥 윤곽
     ------------------------------------------------------------
       crown  정수리가 이마선 위로 솟은 높이
       temple 관자놀이 반폭 (얼굴 반폭 70 보다 커야 머리가 얼굴을 감싼다)
       len    이마선에서 머리끝까지
       endW   머리끝 반폭 비율 (1 보다 작으면 아래로 모인다)
       hem    밑단이 가운데에서 더 내려오는 양 (C컬 느낌)

     물결과 곱슬은 '진폭' 과 '주기' 를 따로 둔다.
       wave  진폭 — 옆선이 안팎으로 흔들리는 폭
       cyc   주기 수 — 머리끝까지 몇 번 흔들리나
               0        매끈한 생머리
               2 ~ 3.5  웨이브. 큰 물결, 긴 흐름, 찰랑임
               6 ~ 11   곱슬. 작고 촘촘한 컬, 뽀글거림
       tip   머리끝 말림 (+ 안쪽 / - 바깥쪽)

     예전에는 옆선에 점을 두세 개만 안팎으로 번갈아 찍고 둥글렸다.
     길이 206px 에 물결 4번이면 주기가 50px 인데 그 사이에 점이 하나뿐
     이라, 사인 곡선이 아니라 울퉁불퉁한 덩어리가 됐다. 곱슬도 같은 식에
     타원 세 개를 얹은 것이라 웨이브와 구조가 같았다.
     이제 옆선을 열여섯 토막으로 쪼개 사인 곡선을 그대로 따라간다.
     ------------------------------------------------------------ */
  /* 옆선을 몇 토막으로 쪼개나. 주기가 많으면 토막도 늘려야 한다 —
     주기 8 을 16토막으로 나누면 한 주기에 표본이 둘뿐이라 사인이 뭉개져
     꺾임이 0이 된다 (복슬곱슬·풍성곱슬이 그래서 매끈한 판이 됐다).
     한 주기에 최소 다섯 토막을 둔다. */
  const sideSteps = o => Math.max(16, Math.ceil((o.cyc || 0) * 5));

  /* 한쪽 옆선. dir -1 왼쪽 / +1 오른쪽, phase 는 위상차.
     좌우를 그냥 뒤집어 붙이면 양쪽이 같은 자리에서 부풀어 가발처럼
     보인다. 위상을 엇갈려 한쪽이 들어갈 때 다른 쪽이 나오게 한다. */
  function sideLine(o, dir, phase) {
    const crown = o.crown, tw = o.temple, len = o.len;
    const wave = o.wave || 0, cyc = o.cyc || 0;
    const endW = o.endW === undefined ? 0.92 : o.endW;
    const tight = cyc >= 5;                     // 곱슬이냐
    const pts = [];
    /* 정수리에서 관자놀이까지 — 두상 곡선. 좌우를 똑같이 두면 완전한
       반원이 되어 검은 헬멧처럼 보인다. 한쪽 어깨를 살짝 낮춘다.
       곱슬은 여기서도 뽀글거린다. */
    const cr = dir < 0 ? [[0.3, 0.97], [0.62, 0.85], [0.9, 0.35]]
                       : [[0.33, 0.93], [0.66, 0.79], [0.92, 0.31]];
    for (let k = 0; k < cr.length; k++) {
      const bump = tight ? wave * 0.5 * Math.sin((k * 0.5 + phase) * Math.PI * 2) : 0;
      pts.push([CX + dir * (tw * cr[k][0] + bump),
                TOP - crown * cr[k][1] - bump * 0.4]);
    }
    /* 옆선 — 사인 곡선을 따라간다 */
    const steps = sideSteps(o);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;                      // 0 관자놀이 ~ 1 머리끝
      let base = tw * (1 - t * (1 - endW));
      /* 끝말림 — 마지막 토막에서 안이나 밖으로 돈다 */
      if (o.tip && t > 0.72) base += o.tip * (t - 0.72) / 0.28;
      /* 끝이 관자놀이의 7할보다 좁아지면 칼날로 보인다 — 거기서 멈춘다 */
      base = Math.max(base, tw * 0.7);
      /* 위쪽은 차분하고 아래로 갈수록 물결이 커진다 (웨이브의 핵심) */
      const amp = wave * Math.min(1, t / 0.28) * (tight ? 1 : 0.45 + 0.55 * t);
      const ph = Math.sin((t * cyc + phase) * Math.PI * 2);
      pts.push([CX + dir * (base + amp * ph), TOP + len * (0.08 + t * 0.92)]);
    }
    return pts;
  }

  /* 닫힌 둘레 점 목록 — 윤곽과 컬 원이 같은 선을 쓴다.
     밑단을 가운데 한 점으로 닫으면 양 끝에서 그 점으로 모여 칼날이 된다
     (재 보니 밑단폭/최대폭이 긴웨이브 0.24, 복슬곱슬 0.28). 끝 폭을
     지키면서 가운데만 내려오는 활로 닫는다. */
  function outlinePts(o) {
    const hem = o.hem === undefined ? 6 : o.hem;
    const ph = o.cyc ? 0.38 : 0;                // 좌우 위상차
    const left = sideLine(o, -1, 0);
    const rightFwd = sideLine(o, 1, ph);
    const a = left[left.length - 1], b = rightFwd[rightFwd.length - 1];
    const hemPts = [];
    for (let k = 1; k <= 4; k++) {
      const u = k / 5;
      hemPts.push([a[0] + (b[0] - a[0]) * u,
                   a[1] + (b[1] - a[1]) * u + hem * Math.sin(u * Math.PI)]);
    }
    /* 정수리 꼭대기도 살짝 비껴 둔다 — 가운데 꼭지가 서면 버섯처럼 보인다 */
    return [[CX - o.temple * 0.07, TOP - o.crown]]
      .concat(left, hemPts, rightFwd.reverse());
  }
  function outline(o) { return smooth(outlinePts(o), true); }

  /* 뽀글 — 둘레에 작은 컬 원을 쭉 두른다. 윤곽만 촘촘히 흔들면 톱니처럼
     보이는데, 원을 겹쳐 두르면 동글동글한 컬 덩어리가 된다.
       curl.r  컬 하나 반지름
       curl.n  둘레에 몇 개 */
  function curlRing(o) {
    const c = o.curl;
    if (!c) return [];
    const pts = outlinePts(o);
    const out = [];
    for (let k = 0; k < c.n; k++) {
      const p = pts[Math.round(k * (pts.length - 1) / (c.n - 1))];
      /* 크기를 조금씩 달리해 기계로 찍은 것처럼 안 보이게 */
      const r = c.r * (0.78 + 0.34 * Math.abs(Math.sin(k * 1.7)));
      out.push('<circle cx="' + r1(p[0]) + '" cy="' + r1(p[1]) +
        '" r="' + r1(r) + '"/>');
    }
    return out;
  }

  /* 머리 안쪽 결 — 아주 옅은 선. 꽉 찬 검은 덩어리로 안 보이게.
     웨이브는 긴 S 로 흐르고, 곱슬은 짧은 고리가 흩어진다. */
  function strands(o) {
    const tw = o.temple, len = o.len, crown = o.crown;
    const from = o.partX === undefined ? 0 : o.partX;
    const cyc = o.cyc || 0, wave = o.wave || 0;
    const out = [];
    const n = o.lines === undefined ? 4 : o.lines;
    if (cyc >= 5) {
      /* 곱슬 — 작은 고리를 흩는다 (긴 선을 그으면 생머리로 보인다) */
      for (let i = 0; i < n * 2; i++) {
        const side = i % 2 ? 1 : -1;
        const t = ((i >> 1) + 1) / (n + 1);
        const x = CX + side * tw * (0.3 + 0.45 * t);
        const y = TOP + len * (0.2 + 0.62 * t) - crown * 0.3 * (1 - t);
        const r = wave * 0.8;
        out.push(smooth([[x - r, y], [x, y - r * 0.9], [x + r, y],
                         [x, y + r * 0.9]], false));
      }
      return out;
    }
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      const side = i % 2 ? 1 : -1;
      const sx = CX + from * tw * 0.5;
      const sy = TOP - crown * 0.72;
      const ex = CX + side * tw * (0.42 + t * 0.5);
      const ey = TOP + len * (0.42 + t * 0.4);
      if (cyc) {
        /* 웨이브 — 결도 같은 주기로 물결친다 */
        const pts = [[sx, sy]];
        for (let k = 1; k <= 5; k++) {
          const u = k / 5;
          const ph = Math.sin((u * cyc * 0.8 + 0.2) * Math.PI * 2);
          pts.push([sx + (ex - sx) * u + side * wave * 0.7 * ph,
                    sy + (ey - sy) * u]);
        }
        out.push(smooth(pts, false));
      } else {
        const mx = (sx + ex) / 2 + side * tw * 0.06;
        out.push(smooth([[sx, sy], [mx, (sy + ey) / 2], [ex, ey]], false));
      }
    }
    return out;
  }

  /* 머리 전체 한 벌 — 윤곽 + 컬 + 광택 + 결 */
  function cap(o) {
    return c => {
      const g = ['<g fill="' + c + '">', '<path d="' + outline(o) + '"/>'];
      /* 곱슬 — 둘레를 컬 원으로 두른다 */
      for (const d of curlRing(o)) g.push(d);
      /* 웨이브 — 머리끝에 말린 덩어리를 얹어 찰랑임을 살린다 */
      if (o.curls) {
        const tw = o.temple, len = o.len;
        for (const [fx, fy, r] of o.curls) {
          g.push('<ellipse cx="' + r1(CX + fx * tw) + '" cy="' +
            r1(TOP + fy * len) + '" rx="' + r1(r * tw) + '" ry="' + r1(r * tw * 0.82) + '"/>');
          g.push('<ellipse cx="' + r1(CX - fx * tw) + '" cy="' +
            r1(TOP + fy * len) + '" rx="' + r1(r * tw) + '" ry="' + r1(r * tw * 0.82) + '"/>');
        }
      }
      g.push('</g>');
      /* 정수리 광택 — 납작해 보이지 않게 아주 옅게 */
      g.push('<path d="' + smooth([
        [CX - o.temple * 0.46, TOP - o.crown * 0.52],
        [CX, TOP - o.crown * 0.86],
        [CX + o.temple * 0.46, TOP - o.crown * 0.52],
      ], false) + '" fill="none" stroke="#ffffff" stroke-opacity=".14" stroke-width="7" ' +
        'stroke-linecap="round"/>');
      /* 가르마 — 정수리에서 이마선까지 한 줄. 이마선 아래는 얼굴이
         덮으므로 여기만 보이고, 결이 이 선에서 좌우로 퍼진다. */
      if (o.partX !== undefined) {
        const px = CX + o.partX * o.temple * 0.5;
        g.push('<path d="' + smooth([[px - o.partX * 4, TOP - o.crown * 0.92],
          [px, TOP - o.crown * 0.4], [px + o.partX * 3, TOP + 2]], false) +
          '" fill="none" stroke="#ffffff" stroke-opacity=".2" stroke-width="3.4" ' +
          'stroke-linecap="round"/>');
      }
      /* 안쪽 결 */
      g.push('<g fill="none" stroke="#000000" stroke-opacity=".22" stroke-width="2.6" ' +
        'stroke-linecap="round">');
      for (const d of strands(o)) g.push('<path d="' + d + '"/>');
      g.push('</g>');
      return g.join("");
    };
  }

  /* ------------------------------------------------------------
     앞머리 — 머리 베이스에서 내려오는 갈래 묶음
     ------------------------------------------------------------
     한 덩어리 도형을 이마에 붙이면 스티커로 보인다. 두 켜로 짓는다.

       1) 밑판  이마선 '위'(머리 베이스 안)에서 시작하는 뚜껑. 위끝이
                베이스에 묻히므로 잘린 종이처럼 안 보이고, 앞머리가
                이마 한가운데서 불쑥 시작하지 않는다.
       2) 갈래  밑판에서 내려오는 가닥들. 끝이 따로 있어 갈라져 보이고,
                갈래 사이 틈이 시스루를 만든다.

     스타일은 숫자 묶음이다 — 이 숫자가 전부 차이를 낸다.
       width    반폭. 눈썹 바깥을 지나 관자놀이까지
       height   이마선에서 내려오는 깊이. 스타일 차이의 핵심
       base     밑판이 내려오는 비율 (0.25 면 거의 안 내려와 이마가 보인다)
       strands  갈래 수
       density  갈래 두께 (1 서로 붙어 한 덩어리 ~ 0.4 틈이 넓다)
       split    가르마 자리 (-1 왼쪽 ~ 1 오른쪽, 없으면 적지 않는다)
       bias     한쪽으로 쏠린 정도 (-1 ~ 1)
       jag      갈래 끝이 들쭉날쭉한 정도
       curlTip  끝이 동글게 말리나
       lift     이마선 위로 올려 베이스에 묻는 깊이
     ------------------------------------------------------------ */

  /* 갈래 하나 — 시작점에서 끝점까지 가늘어지는 닫힌 모양.
     양쪽을 따로 그어 모아야 끝이 뾰족해지고 머리카락처럼 보인다. */
  function strand(a, b, w0, w1, bow) {
    const mx = (a[0] + b[0]) / 2 + (bow || 0), my = (a[1] + b[1]) / 2;
    return smooth([
      [a[0] - w0, a[1]],
      [mx - w1 * 1.25, my],
      [b[0] - w1 * 0.9, b[1]],
      [b[0] + w1 * 0.9, b[1] + 1.5],
      [mx + w1 * 1.25, my + 2],
      [a[0] + w0, a[1] + 2],
    ], true);
  }

  /* 갈래 끝을 흔드는 고정 패턴. 난수를 쓰면 다시 그릴 때마다 모양이
     달라져 썸네일과 결과가 어긋난다. */
  const JIT = [0, .46, -.3, .2, -.5, .3, -.14, .52, -.26, .36, -.42, .16, -.36, .24];

  /* 가닥 하나의 반폭. 얼굴폭의 4~7% 안에 들어야 한다 — 예전엔 9~14%
     라 굵은 검은 캡슐이 이마에 내려온 꼴이었다. 식을 테스트가 베껴 쓰면
     어긋나므로 여기 한 곳에만 둔다. */
  function strandHalf(W, step, dens) { return W * step * 0.5 * dens * 0.72 + 2; }

  function bangs(o) {
    const W = o.width, H = o.height;
    const n = o.strands, dens = o.density;
    const hasSplit = o.split !== undefined && o.split !== null;
    const sp = hasSplit ? o.split : 0;
    const bias = o.bias || 0, jag = o.jag || 0;
    const topY = TOP - (o.lift === undefined ? 18 : o.lift);
    const baseDrop = H * (o.base === undefined ? 0.6 : o.base);
    /* 머리 베이스 안쪽을 따라가는 활 — 가운데가 가장 높다 */
    const arcY = u => topY + 11 * u * u;
    /* 갈래 길이 — 스타일 차이가 여기서 난다 */
    const lenAt = (u, k) => {
      let t = 1 - 0.2 * u * u;
      /* 가르마는 갈라진 선에서 멀수록 길다. 선 쪽은 짧아 가운데가 열린다. */
      if (hasSplit) t = 0.38 + 0.74 * Math.min(1, Math.abs(u - sp) / 0.72);
      if (bias) t *= 1 + bias * u * 0.5;
      t *= 1 + jag * JIT[k % JIT.length];
      /* 볼 쪽으로 흘러내리던 가닥(fall)은 걷어냈다. 앞머리 폭을 얼굴폭의
         59~74% 로 줄이니 그 가닥이 더는 눈 바깥에 있지 못해 눈을 가렸다.
         앞머리는 전부 눈썹 위에서 끝낸다. */
      return Math.max(H * 0.2, H * t);
    };
    /* 갈래가 흐르는 쪽 — 가르마는 선에서 바깥으로, 쓸어넘김은 한쪽으로 */
    const flowAt = u => {
      let fx = u * W * 0.1;
      if (hasSplit) fx = (u >= sp ? 1 : -1) * W * 0.2 *
        Math.min(1, Math.abs(u - sp) / 0.5 + 0.25);
      if (bias) fx += bias * W * 0.24;
      return fx;
    };

    return c => {
      const g = [];
      /* ---- 1) 밑판 ---- */
      const lip = [];
      for (let k = -4; k <= 4; k++) { const u = k / 4; lip.push([CX + u * W, arcY(u)]); }
      const hem = [];
      for (let k = 4; k >= -4; k--) {
        const u = k / 4;
        let d = baseDrop * (1 - 0.28 * u * u);
        /* 가르마 — 갈라진 선에서 밑판이 위로 패인다 (가운데가 막히면 안 된다) */
        if (hasSplit) d *= 0.26 + 0.74 * Math.min(1, Math.abs(u - sp) / 0.55);
        if (bias) d *= 1 + bias * u * 0.42;
        /* 밑단을 조금 흔들어 자른 종이처럼 안 보이게 */
        d += baseDrop * 0.1 * JIT[(k + 5) % JIT.length];
        hem.push([CX + u * W * 0.97, TOP + d]);
      }
      g.push('<path fill="' + c + '" d="' + smooth(lip.concat(hem), true) + '"/>');
      /* ---- 2) 갈래 ---- */
      const step = 2 / (n - 1);
      for (let k = 0; k < n; k++) {
        const u = -1 + k * step;
        const flow = flowAt(u);
        const a = [CX + u * W * 0.93, arcY(u) + 2];
        const b = [a[0] + flow, TOP + lenAt(u, k)];
        /* 가닥 굵기 — 얼굴폭의 4~7% 안에 둔다. 예전엔 9~14% 라
           굵은 검은 캡슐 여러 개가 이마에 내려온 꼴이었다. 숱은
           가닥 굵기가 아니라 밑판(base)과 가닥 수가 낸다. */
        const w0 = strandHalf(W, step, dens);
        const w1 = w0 * (o.curlTip ? 0.74 : 0.4);
        g.push('<path fill="' + c + '" d="' +
          strand(a, b, w0, w1, flow * 0.3 + u * 2.5) + '"/>');
        if (o.curlTip) g.push('<circle fill="' + c + '" cx="' + r1(b[0]) +
          '" cy="' + r1(b[1]) + '" r="' + r1(w1 * 1.2) + '"/>');
      }
      /* ---- 3) 결 — 흐르는 쪽이 보이게 아주 옅게 ---- */
      g.push('<g fill="none" stroke="#000000" stroke-opacity=".2" stroke-width="2.2" ' +
        'stroke-linecap="round">');
      for (let k = 1; k < n; k += 3) {
        const u = -1 + k * step;
        const a = [CX + u * W * 0.93, arcY(u) + 6];
        const L = lenAt(u, k), fx = flowAt(u);
        g.push('<path d="' + smooth([a,
          [a[0] + fx * 0.55, TOP + L * 0.55], [a[0] + fx * 0.9, TOP + L * 0.9]], false) + '"/>');
      }
      g.push('</g>');
      /* ---- 4) 가르마 선 — 갈라진 자리를 또렷하게 ---- */
      if (hasSplit) {
        const px = CX + sp * W * 0.9;
        g.push('<path fill="none" stroke="#000000" stroke-opacity=".3" stroke-width="2.6" ' +
          'stroke-linecap="round" d="' + smooth([[px, arcY(sp) + 3],
          [px + sp * 3, TOP + baseDrop * 0.3], [px + sp * 6, TOP + baseDrop * 0.52]],
          false) + '"/>');
      }
      return g.join("");
    };
  }

  /* 옆머리 생성기는 걷어냈다. 옆머리 네모가 뒷머리 네모 안에 평균 85%
     들어가 있어 같은 자리를 두 번 칠하고 있었다 — 귀 옆이 검은 덩어리로
     보이던 원인이다. 측면 실루엣은 hairBase 의 outline() 이 맡는다. */

  /* ------------------------------------------------------------
     묶음 — 뒷머리 뒤쪽 기준점에서 파생된다 (혼자 떠 있지 않게)
     ------------------------------------------------------------ */
  function tie(o) {
    return c => {
      const g = ['<g fill="' + c + '">'];
      const ax = CX + (o.ax || 0), ay = TOP + (o.ay || 0);
      if (o.kind === "bun") {
        g.push('<circle cx="' + r1(ax) + '" cy="' + r1(ay) + '" r="' + r1(o.r) + '"/>');
        g.push('<circle cx="' + r1(ax - o.r * 0.62) + '" cy="' + r1(ay + o.r * 0.3) +
          '" r="' + r1(o.r * 0.52) + '"/>');
        g.push('<circle cx="' + r1(ax + o.r * 0.62) + '" cy="' + r1(ay + o.r * 0.3) +
          '" r="' + r1(o.r * 0.52) + '"/>');
      } else if (o.kind === "pony") {
        const s = o.flip ? -1 : 1;
        g.push('<ellipse cx="' + r1(ax) + '" cy="' + r1(ay) + '" rx="12" ry="9"/>');
        g.push('<path d="' + smooth([
          [ax, ay], [ax + s * 26, ay + o.len * 0.3],
          [ax + s * 22, ay + o.len * 0.74], [ax + s * 4, ay + o.len],
          [ax - s * 8, ay + o.len * 0.6], [ax - s * 6, ay + o.len * 0.2],
        ], true) + '"/>');
      } else if (o.kind === "twin") {
        for (const s of [-1, 1]) {
          g.push('<ellipse cx="' + r1(CX + s * 72) + '" cy="' + r1(ay) + '" rx="11" ry="9"/>');
          g.push('<path d="' + smooth([
            [CX + s * 72, ay], [CX + s * 92, ay + o.len * 0.36],
            [CX + s * 84, ay + o.len * 0.82], [CX + s * 66, ay + o.len],
            [CX + s * 58, ay + o.len * 0.5],
          ], true) + '"/>');
        }
      } else if (o.kind === "braid") {
        const s = o.flip ? -1 : 1;
        g.push('<path d="' + smooth([
          [CX + s * 66, ay], [CX + s * 84, ay + o.len * 0.3],
          [CX + s * 76, ay + o.len * 0.72], [CX + s * 62, ay + o.len],
          [CX + s * 54, ay + o.len * 0.5],
        ], true) + '"/>');
        g.push('</g><g fill="none" stroke="#000000" stroke-opacity=".3" stroke-width="3">');
        for (let i = 1; i <= 4; i++) {
          const y = ay + o.len * (i / 5);
          g.push('<path d="M' + r1(CX + s * 56) + ' ' + r1(y) + ' L' +
            r1(CX + s * 82) + ' ' + r1(y + 4) + '"/>');
        }
      } else if (o.kind === "halfup") {
        g.push('<ellipse cx="' + r1(CX) + '" cy="' + r1(ay) + '" rx="26" ry="14"/>');
        g.push('<path d="' + smooth([
          [CX - 18, ay + 8], [CX, ay + o.len], [CX + 18, ay + 8],
        ], true) + '"/>');
      } else if (o.kind === "ribbon") {
        g.push('</g><g>');
        g.push('<path d="M' + r1(CX) + ' ' + r1(ay) + ' l-24 -12 q-8 12 4 20z" fill="#D73A2F"/>');
        g.push('<path d="M' + r1(CX) + ' ' + r1(ay) + ' l24 -12 q8 12 -4 20z" fill="#D73A2F"/>');
        g.push('<circle cx="' + r1(CX) + '" cy="' + r1(ay + 3) + '" r="6" fill="#B32C22"/>');
      }
      g.push('</g>');
      return g.join("");
    };
  }

  /* ============================================================
     스타일 — 숫자 묶음. 여기만 고치면 실루엣이 바뀐다.
     ============================================================ */
  /* 뒷머리 / 기본 머리 (정수리 볼륨은 전부 들어간다) */
  /* 뒷머리 — 생머리 계열 / 웨이브 계열 / 곱슬 계열.
     cyc 가 계열을 가른다: 0 생머리 · 2~3.5 웨이브 · 6~11 곱슬.
     앞 네 자리(없음·삭발·스포츠컷·숏컷)는 자리를 지킨다 — NEUTRAL 이
     번호로 숏컷을 집는다. */
  const BACK = [
    { n: "없음", f: () => "" },
    { n: "삭발", o: { crown: 18, temple: 72, len: 26, endW: 0.96, hem: 2, lines: 2 } },
    { n: "스포츠컷", o: { crown: 26, temple: 74, len: 38, endW: 0.95, hem: 3, lines: 3 } },
    { n: "숏컷", o: { crown: 32, temple: 77, len: 56, endW: 0.94, hem: 4, lines: 3 } },
    { n: "포마드", o: { crown: 42, temple: 74, len: 44, endW: 0.9, hem: 3, lines: 4 } },
    { n: "덮은머리", o: { crown: 34, temple: 80, len: 66, endW: 0.96, hem: 8, lines: 4 } },
    { n: "단발", o: { crown: 34, temple: 80, len: 118, endW: 0.95, hem: 10, lines: 4 } },
    { n: "C컬단발", o: { crown: 34, temple: 80, len: 120, endW: 0.82, hem: 16,
        tip: 7, lines: 4 } },
    { n: "중단발", o: { crown: 36, temple: 82, len: 158, endW: 0.94, hem: 12, lines: 5 } },
    { n: "볼륨중단발", o: { crown: 44, temple: 86, len: 156, endW: 0.92, hem: 14,
        lines: 5 } },
    { n: "긴생머리", o: { crown: 36, temple: 80, len: 208, endW: 0.96, hem: 12, lines: 6 } },
    /* 가르마 — 가운데에서 갈라 넘긴 긴 머리. 가르마가 앞머리에만 있어서
       '가르마 머리' 자체를 고를 수 없었다. */
    { n: "가르마머리", o: { crown: 30, temple: 81, len: 196, endW: 0.95, hem: 12,
        partX: -0.45, lines: 6 } },
    /* 묶음 베이스 — 뒤로 넘겨 당긴 머리. 묶음(extra)과 짝이다. 풀린 긴
       머리에 꼬리를 달면 둘이 따로 놀았다. */
    { n: "묶음머리", o: { crown: 28, temple: 74, len: 52, endW: 0.98, hem: 4,
        partX: 0, lines: 4 } },

    /* 웨이브 — 큰 물결, 긴 흐름. 주기가 적고 진폭이 크다. 아래로 갈수록
       물결이 커지고 머리끝이 말린다. */
    { n: "짧은웨이브", o: { crown: 38, temple: 82, len: 96, endW: 0.9, hem: 10,
        wave: 7, cyc: 2.2, tip: -5, lines: 4 } },
    { n: "자연웨이브", o: { crown: 38, temple: 84, len: 168, endW: 0.93, hem: 13,
        wave: 8, cyc: 2.4, tip: 5, lines: 5 } },
    { n: "중단발웨이브", o: { crown: 40, temple: 85, len: 150, endW: 0.9, hem: 15,
        wave: 11, cyc: 2.8, tip: -7, lines: 5,
        curls: [[0.86, 0.9, 0.13]] } },
    { n: "굵은웨이브", o: { crown: 42, temple: 88, len: 180, endW: 0.88, hem: 17,
        wave: 17, cyc: 2, tip: 9, lines: 5,
        curls: [[0.92, 0.88, 0.16]] } },
    { n: "긴웨이브", o: { crown: 40, temple: 86, len: 206, endW: 0.9, hem: 18,
        wave: 14, cyc: 3.4, tip: -8, lines: 6,
        curls: [[0.9, 0.93, 0.14]] } },

    /* 곱슬 — 작고 촘촘한 컬. 주기가 많고 진폭이 작다. 둘레를 컬 원으로
       둘러 뽀글거리게 하고, 길게 흐르지 않고 복슬하게 마감한다. */
    { n: "짧은곱슬", o: { crown: 38, temple: 82, len: 58, endW: 0.96, hem: 6,
        wave: 5, cyc: 6, lines: 3, curl: { r: 9, n: 15 } } },
    { n: "뽀글곱슬", o: { crown: 42, temple: 84, len: 76, endW: 0.97, hem: 7,
        wave: 5, cyc: 11, lines: 3, curl: { r: 7.5, n: 24 } } },
    { n: "복슬곱슬", o: { crown: 46, temple: 88, len: 94, endW: 0.97, hem: 8,
        wave: 6, cyc: 8, lines: 4, curl: { r: 10.5, n: 19 } } },
    { n: "풍성곱슬", o: { crown: 50, temple: 92, len: 118, endW: 0.98, hem: 9,
        wave: 8, cyc: 8, lines: 4, curl: { r: 12, n: 20 } } },
    { n: "중간곱슬", o: { crown: 44, temple: 86, len: 136, endW: 0.95, hem: 9,
        wave: 6, cyc: 9, lines: 5, curl: { r: 9, n: 23 } } },
  ];

  /* 앞머리 */
  /* 앞머리 — 폭·깊이·갈래수·숱이 스타일마다 다르다.
     깊이는 이마 높이 43 기준이다. 처피뱅 22 는 눈썹에서 21px 위에서
     끝나고, 긴앞머리 44 는 눈썹선 근처까지 온다 — 이 차이가 안 뭉치게
     app.js 의 placeFront 가 '늘이지 않고' 얼굴 비율로만 얹는다.
     fit — 머리 실루엣을 얼마나 덮나. */
  const FRONT = [
    { n: "없음", f: () => "" },
    { n: "일자", o: { kind: "straight", width: 78, height: 33, base: .76,
        strands: 13, density: 1, jag: .05, lift: 18, fit: "standard" } },
    { n: "짧은일자", o: { kind: "straight", width: 74, height: 27, base: .72,
        strands: 12, density: 1, jag: .06, lift: 17, fit: "standard" } },
    { n: "시스루", o: { kind: "seethrough", width: 76, height: 28, base: .24,
        strands: 9, density: .52, jag: .3, lift: 16, fit: "standard" } },
    { n: "처피뱅", o: { kind: "choppy", width: 72, height: 22, base: .52,
        strands: 13, density: .92, jag: .34, lift: 17, fit: "standard" } },
    { n: "곱슬앞머리", o: { kind: "curl", width: 78, height: 30, base: .6,
        strands: 11, density: .9, jag: .2, curlTip: 1, lift: 19, fit: "standard" } },
    { n: "5대5가르마", o: { kind: "part", width: 80, height: 38, base: .6,
        strands: 12, density: .95, split: 0, jag: .08, lift: 18, fit: "wide" } },
    { n: "6대4가르마", o: { kind: "part", width: 80, height: 34, base: .6,
        strands: 12, density: .95, split: -.26, jag: .08, lift: 18, fit: "wide" } },
    { n: "7대3가르마", o: { kind: "part", width: 80, height: 39, base: .62,
        strands: 12, density: .95, split: -.52, jag: .08, lift: 18, fit: "wide" } },
    { n: "옆가르마", o: { kind: "part", width: 82, height: 40, base: .62,
        strands: 12, density: .95, split: .5, jag: .1, lift: 18, fit: "wide" } },
    { n: "긴앞머리", o: { kind: "sweep", width: 84, height: 42, base: .66,
        strands: 12, density: .95, bias: -.8, jag: .12, lift: 16,
        fit: "wide" } },
    { n: "쓸어넘김", o: { kind: "sweep", width: 82, height: 31, base: .5,
        strands: 12, density: .9, bias: .85, jag: .14, lift: 17,
        fit: "wide" } },
    { n: "올백", o: { kind: "straight", width: 72, height: 11, base: .84,
        strands: 11, density: 1, jag: .04, lift: 22, fit: "narrow" } },
  ];



  /* 묶음 */
  const TIE = [
    { n: "없음", f: () => "" },
    { n: "포니", o: { kind: "pony", ax: 74, ay: 36, len: 96 } },
    { n: "낮은포니", o: { kind: "pony", ax: 66, ay: 128, len: 86 } },
    { n: "양갈래", o: { kind: "twin", ay: 58, len: 92 } },
    { n: "번헤어", o: { kind: "bun", ax: 0, ay: -44, r: 26 } },
    { n: "낮은번", o: { kind: "bun", ax: 0, ay: 150, r: 22 } },
    { n: "땋은머리", o: { kind: "braid", ay: 46, len: 150 } },
    { n: "반묶음", o: { kind: "halfup", ay: 30, len: 60 } },
    { n: "리본", o: { kind: "ribbon", ay: -24 } },
  ];

  /* 앞머리 폭 꼴 — 프리셋의 tw 에서 바로 뽑는다 (그려진 네모 폭으로
     짐작하면 생성기가 만든 폭이 고르기 때문에 전부 한 꼴이 된다). */
  function fitOf(o) {
    if (!o) return "standard";
    if (o.fit) return o.fit;                 // 프리셋에 적힌 것이 먼저다
    const w = o.width || o.tw || 76;
    return w <= 73 ? "narrow" : w >= 80 ? "wide" : "standard";
  }
  const build = (list, maker) => list.map(x =>
    x.f ? { n: x.n, f: x.f, o: null } : { n: x.n, f: maker(x.o), o: x.o, fit: fitOf(x.o) });

  window.MONTAGE_HAIR = {
    REF: { CX: CX, TOP: TOP, BROW: BROW, CHIN: CHIN, HALF: HALF },
    smooth: smooth, outline: outline, cap: cap, bangs: bangs, tie: tie,
    strandHalf: strandHalf,
    BASE: build(BACK, cap),
    BANGS: build(FRONT, bangs),
    EXTRA: build(TIE, tie),
  };
})();
