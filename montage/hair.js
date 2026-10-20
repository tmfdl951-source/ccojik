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
     머리 바깥 윤곽 (정수리 볼륨 + 관자놀이 + 옆선 + 밑단)
     ------------------------------------------------------------
       crown  정수리가 이마선 위로 솟은 높이
       temple 관자놀이 반폭 (얼굴 반폭 70 보다 커야 머리가 얼굴을 감싼다)
       len    이마선에서 머리끝까지
       wave   옆선이 안팎으로 흔들리는 폭 (0 이면 매끈한 생머리)
       waves  흔들리는 횟수
       hem    밑단이 가운데에서 더 내려오는 양 (C컬 느낌)
       endW   머리끝 반폭 비율 (1 보다 작으면 아래로 모인다)
       nape   뒷목 쪽으로 좁아지는 정도
     ------------------------------------------------------------ */
  function outline(o) {
    const crown = o.crown, tw = o.temple, len = o.len;
    const wave = o.wave || 0, waves = o.waves || 0;
    const hem = o.hem === undefined ? 6 : o.hem;
    const endW = o.endW === undefined ? 0.92 : o.endW;
    const left = [];
    /* 정수리에서 관자놀이까지 — 두상 곡선 */
    left.push([CX - tw * 0.52, TOP - crown * 0.88]);
    left.push([CX - tw * 0.88, TOP - crown * 0.34]);
    left.push([CX - tw * 0.99, TOP + len * 0.10]);
    /* 옆선 — 물결 */
    const n = Math.max(1, waves);
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const sign = i % 2 ? 1 : -1;                  // 바깥 / 안쪽 번갈아
      const x = CX - (tw * (1 - t * (1 - endW)) + sign * wave);
      left.push([x, TOP + len * (0.10 + t * 0.86)]);
    }
    left.push([CX - tw * endW, TOP + len]);
    /* 밑단 */
    const bottom = [[CX, TOP + len + hem]];
    /* 오른쪽은 왼쪽을 뒤집는다 — 좌우 대칭이면 가발처럼 안 보인다 */
    const right = left.slice().reverse().map(p => [2 * CX - p[0], p[1]]);
    const pts = [[CX, TOP - crown]].concat(left, bottom, right);
    return smooth(pts, true);
  }

  /* 머리 안쪽 결 — 아주 옅은 선 몇 가닥. 꽉 찬 검은 덩어리로 안 보이게.
     흐름 방향(flow)에 따라 가르마에서 퍼지거나 아래로 흐른다. */
  function strands(o) {
    const tw = o.temple, len = o.len, crown = o.crown;
    const from = o.partX === undefined ? 0 : o.partX;   // 가르마 가로 위치(-1~1)
    const out = [];
    const n = o.lines === undefined ? 4 : o.lines;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      const side = i % 2 ? 1 : -1;
      const sx = CX + from * tw * 0.5;
      const ex = CX + side * tw * (0.42 + t * 0.5);
      const sy = TOP - crown * 0.72;
      const ey = TOP + len * (0.42 + t * 0.4);
      const mx = (sx + ex) / 2 + side * tw * (o.wave ? 0.18 : 0.06);
      const my = (sy + ey) / 2;
      out.push(smooth([[sx, sy], [mx, my], [ex, ey]], false));
    }
    return out;
  }

  /* 머리 전체 한 벌 — 윤곽 + 결 + (물결이면) 끝 컬 덩어리 */
  function cap(o) {
    return c => {
      const g = ['<g fill="' + c + '">', '<path d="' + outline(o) + '"/>'];
      /* 물결·곱슬이면 옆선과 끝에 덩어리를 얹어 결을 살린다 */
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
       fall     바깥 갈래가 볼 쪽으로 더 내려오는 길이 (긴 앞머리)
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

  function bangs(o) {
    const W = o.width, H = o.height;
    const n = o.strands, dens = o.density;
    const hasSplit = o.split !== undefined && o.split !== null;
    const sp = hasSplit ? o.split : 0;
    const bias = o.bias || 0, jag = o.jag || 0, fall = o.fall || 0;
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
      /* 맨 바깥 갈래만 볼 쪽으로 더 내려온다. 0.78 보다 바깥이라야 눈
         구역(가운데 +-54)을 벗어나 눈을 안 가린다 — 얼굴 옆으로 흐른다. */
      const out = fall * Math.max(0, Math.abs(u) - 0.78) / 0.22;
      return Math.max(H * 0.2, H * t) + out * (bias === 0 || u * bias > 0 ? 1 : 0.3);
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
        const w0 = W * step * 0.5 * dens + 1.4;
        const w1 = w0 * (o.curlTip ? 0.74 : 0.4);
        g.push('<path fill="' + c + '" d="' +
          strand(a, b, w0, w1, flow * 0.3 + u * 2.5) + '"/>');
        if (o.curlTip) g.push('<circle fill="' + c + '" cx="' + r1(b[0]) +
          '" cy="' + r1(b[1]) + '" r="' + r1(w1 * 1.2) + '"/>');
      }
      /* ---- 3) 결 — 흐르는 쪽이 보이게 아주 옅게 ---- */
      g.push('<g fill="none" stroke="#000000" stroke-opacity=".2" stroke-width="2.2" ' +
        'stroke-linecap="round">');
      for (let k = 0; k < n; k += 2) {
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

  /* ------------------------------------------------------------
     옆머리 — 관자놀이에서 볼을 타고 내려온다.
     앞머리와 뒷머리 사이를 이어 주는 몫이라, 시작점이 관자놀이여야 한다.
       len   얼굴을 타고 내려오는 길이
       grip  얼굴에 붙는 정도 (0 붙음 ~ 1 벌어짐)
       ear   귀를 덮나 (true 면 귀 위를 지난다)
     ------------------------------------------------------------ */
  function side(o) {
    const tw = o.tw === undefined ? 76 : o.tw;
    const len = o.len, grip = o.grip === undefined ? 0.3 : o.grip;
    return c => {
      const g = ['<g fill="' + c + '">'];
      for (const s of [-1, 1]) {
        g.push('<path d="' + smooth([
          [CX + s * tw * 0.86, TOP + 6],
          [CX + s * (tw + grip * 10), TOP + len * 0.4],
          [CX + s * (tw * 0.94 + grip * 6), TOP + len],
          [CX + s * tw * (o.taper === undefined ? 0.6 : o.taper), TOP + len * 0.96],
          [CX + s * tw * 0.66, TOP + len * 0.4],
          [CX + s * tw * 0.7, TOP + 8],
        ], true) + '"/>');
        if (o.curl) {
          g.push('<ellipse cx="' + r1(CX + s * tw * 0.88) + '" cy="' +
            r1(TOP + len * 0.92) + '" rx="' + r1(tw * 0.17) + '" ry="' + r1(tw * 0.14) + '"/>');
        }
      }
      g.push('</g>');
      return g.join("");
    };
  }

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
  const BACK = [
    { n: "없음", f: () => "" },
    { n: "삭발", o: { crown: 18, temple: 72, len: 26, endW: 0.96, hem: 2, lines: 2 } },
    { n: "스포츠컷", o: { crown: 26, temple: 74, len: 38, endW: 0.95, hem: 3, lines: 3 } },
    { n: "숏컷", o: { crown: 32, temple: 77, len: 56, endW: 0.94, hem: 4, lines: 3 } },
    { n: "포마드", o: { crown: 42, temple: 74, len: 44, endW: 0.9, hem: 3, lines: 4 } },
    { n: "덮은머리", o: { crown: 34, temple: 80, len: 66, endW: 0.96, hem: 8, lines: 4 } },
    { n: "곱슬숏", o: { crown: 38, temple: 82, len: 62, wave: 14, waves: 4, hem: 7,
        curls: [[0.82, 0.3, 0.17], [0.9, 0.72, 0.15], [0.52, 0.02, 0.16]], lines: 3 } },
    { n: "단발", o: { crown: 34, temple: 80, len: 118, endW: 0.95, hem: 10, lines: 4 } },
    { n: "C컬단발", o: { crown: 34, temple: 80, len: 120, endW: 0.82, hem: 16,
        wave: 5, waves: 2, curls: [[0.78, 0.94, 0.16]], lines: 4 } },
    { n: "중단발", o: { crown: 36, temple: 82, len: 158, endW: 0.94, hem: 12, lines: 5 } },
    { n: "볼륨중단발", o: { crown: 44, temple: 88, len: 156, endW: 0.9, hem: 14,
        wave: 7, waves: 2, lines: 5 } },
    { n: "긴생머리", o: { crown: 36, temple: 80, len: 208, endW: 0.96, hem: 12, lines: 6 } },
    { n: "긴웨이브", o: { crown: 40, temple: 86, len: 206, endW: 0.9, hem: 18,
        wave: 13, waves: 4,
        curls: [[0.92, 0.42, 0.14], [1.0, 0.68, 0.15], [0.86, 0.9, 0.16]], lines: 6 } },
    { n: "웨이브", o: { crown: 40, temple: 86, len: 150, endW: 0.88, hem: 16,
        wave: 12, waves: 4,
        curls: [[0.94, 0.4, 0.15], [1.0, 0.72, 0.16], [0.8, 0.95, 0.15]], lines: 5 } },
    { n: "곱슬머리", o: { crown: 46, temple: 92, len: 140, endW: 0.96, hem: 10,
        wave: 15, waves: 5,
        curls: [[0.98, 0.18, 0.19], [1.04, 0.5, 0.2], [0.92, 0.82, 0.18],
                [0.5, -0.1, 0.2], [0.0, -0.22, 0.21]], lines: 4 } },
  ];

  /* 앞머리 */
  /* 앞머리 — 폭·깊이·갈래수·숱이 스타일마다 다르다.
     깊이는 이마 높이 43 기준이다. 처피뱅 22 는 눈썹에서 21px 위에서
     끝나고, 긴앞머리 44 는 눈썹선 근처까지 온다 — 이 차이가 안 뭉치게
     app.js 의 placeFront 가 '늘이지 않고' 얼굴 비율로만 얹는다.
     fit — 머리 실루엣을 얼마나 덮나. */
  const FRONT = [
    { n: "없음", f: () => "" },
    { n: "일자", o: { kind: "straight", width: 78, height: 33, base: .72,
        strands: 11, density: 1, jag: .05, lift: 18, fit: "standard" } },
    { n: "짧은일자", o: { kind: "straight", width: 74, height: 27, base: .7,
        strands: 10, density: 1, jag: .06, lift: 17, fit: "standard" } },
    { n: "시스루", o: { kind: "seethrough", width: 76, height: 28, base: .24,
        strands: 9, density: .52, jag: .3, lift: 16, fit: "standard" } },
    { n: "처피뱅", o: { kind: "choppy", width: 72, height: 22, base: .52,
        strands: 13, density: .92, jag: .34, lift: 17, fit: "standard" } },
    { n: "곱슬앞머리", o: { kind: "curl", width: 78, height: 30, base: .56,
        strands: 9, density: .9, jag: .2, curlTip: 1, lift: 19, fit: "standard" } },
    { n: "5대5가르마", o: { kind: "part", width: 80, height: 38, base: .6,
        strands: 11, density: .95, split: 0, jag: .08, lift: 18, fit: "wide" } },
    { n: "6대4가르마", o: { kind: "part", width: 80, height: 34, base: .6,
        strands: 11, density: .95, split: -.26, jag: .08, lift: 18, fit: "wide" } },
    { n: "7대3가르마", o: { kind: "part", width: 80, height: 39, base: .62,
        strands: 11, density: .95, split: -.52, jag: .08, lift: 18, fit: "wide" } },
    { n: "옆가르마", o: { kind: "part", width: 82, height: 40, base: .62,
        strands: 11, density: .95, split: .5, jag: .1, lift: 18, fit: "wide" } },
    { n: "긴앞머리", o: { kind: "sweep", width: 84, height: 42, base: .66,
        strands: 11, density: .95, bias: -.8, fall: 26, jag: .12, lift: 16,
        fit: "wide" } },
    { n: "쓸어넘김", o: { kind: "sweep", width: 82, height: 31, base: .5,
        strands: 10, density: .9, bias: .85, fall: 14, jag: .14, lift: 17,
        fit: "wide" } },
    { n: "올백", o: { kind: "straight", width: 72, height: 11, base: .8,
        strands: 9, density: 1, jag: .04, lift: 22, fit: "narrow" } },
  ];;

  /* 옆머리 */
  const SIDE = [
    { n: "없음", f: () => "" },
    { n: "짧은갈래", o: { len: 44, grip: 0.1, taper: 0.66 } },
    { n: "귀덮기", o: { len: 72, grip: 0.2, taper: 0.62 } },
    { n: "볼선", o: { len: 112, grip: 0.3, taper: 0.58 } },
    { n: "턱선", o: { len: 150, grip: 0.36, taper: 0.56 } },
    { n: "구레나룻", o: { len: 52, grip: 0.0, taper: 0.78 } },
    { n: "웨이브컬", o: { len: 128, grip: 0.42, taper: 0.52, curl: 1 } },
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
    smooth: smooth, outline: outline, cap: cap, bangs: bangs, side: side, tie: tie,
    BACK: build(BACK, cap),
    FRONT: build(FRONT, bangs),
    SIDE: build(SIDE, side),
    TIE: build(TIE, tie),
  };
})();
