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
     앞머리 — 이마선에서 내려오는 파츠
     ------------------------------------------------------------
       depth  이마선에서 아래로 내려오는 깊이 (이마 높이 43 기준)
       tw     좌우 반폭 (눈썹 바깥까지 덮어야 가발 조각으로 안 보인다)
       kind   straight | seethrough | choppy | part | sweep | curl
       part   가르마 가로 위치 (-1 왼쪽 ~ 1 오른쪽)
     ------------------------------------------------------------ */
  function bangs(o) {
    const tw = o.tw, dep = o.depth, kind = o.kind;
    const topY = TOP - (o.lift === undefined ? 16 : o.lift);   // 머리에서 시작
    const lo = TOP + dep;
    return c => {
      const g = ['<g fill="' + c + '">'];
      if (kind === "seethrough") {
        /* 시스루 — 이마가 비쳐 보이게 윗동은 얇게, 아래로 가닥만 */
        g.push('<path d="' + smooth([
          [CX - tw, topY + 10], [CX - tw * 0.5, topY], [CX, topY - 3],
          [CX + tw * 0.5, topY], [CX + tw, topY + 10],
          [CX + tw * 0.86, TOP + dep * 0.42], [CX, TOP + dep * 0.3],
          [CX - tw * 0.86, TOP + dep * 0.42],
        ], true) + '"/>');
        g.push('</g>');
        g.push('<g fill="none" stroke="' + c + '" stroke-width="6.5" stroke-linecap="round" ' +
          'stroke-opacity=".82">');
        for (let i = -3; i <= 3; i++) {
          const x = CX + i * tw * 0.26;
          g.push('<path d="' + smooth([[x, TOP + dep * 0.22],
            [x + (i < 0 ? -3 : 3), TOP + dep * 0.66], [x + (i < 0 ? -5 : 5), lo]], false) + '"/>');
        }
        g.push('</g>');
        return g.join("");
      }
      if (kind === "part") {
        /* 가르마 — 가운데 선만 옮기고 양쪽 끝은 머리에 붙여 둔다.
           px 에서 ±tw 를 재면 머리 전체가 옆으로 밀려 반대쪽 관자놀이에
           틈이 생긴다 (7대3 에서 25px). 비대칭은 두 갈래의 두께로 낸다. */
        const pr = o.part || 0;                       // -1 왼쪽 ~ 1 오른쪽
        const px = CX + pr * tw * 0.42;               // 가르마 선
        const lw = px - (CX - tw);                    // 왼쪽 갈래 폭
        const rw = (CX + tw) - px;                    // 오른쪽 갈래 폭
        /* 좁은 쪽이 더 깊게 내려온다 — 쓸어 넘긴 쪽이 두꺼워 보인다 */
        const lDeep = lw >= rw ? 0.95 : 0.74;
        const rDeep = rw > lw ? 0.95 : 0.74;
        g.push('<path d="' + smooth([
          [px, topY + 3], [px - lw * 0.45, topY + 2], [CX - tw, TOP + dep * 0.3],
          [CX - tw * 0.93, lo], [px - lw * 0.22, TOP + dep * lDeep],
          [px - 2, TOP + dep * 0.36],
        ], true) + '"/>');
        g.push('<path d="' + smooth([
          [px, topY + 3], [px + rw * 0.45, topY + 2], [CX + tw, TOP + dep * 0.3],
          [CX + tw * 0.93, lo], [px + rw * 0.22, TOP + dep * rDeep],
          [px + 2, TOP + dep * 0.36],
        ], true) + '"/>');
        g.push('</g>');
        /* 갈라진 방향이 보이게 결을 그 쪽으로 흘린다 */
        g.push('<g fill="none" stroke="#000000" stroke-opacity=".26" stroke-width="2.4" ' +
          'stroke-linecap="round">');
        g.push('<path d="' + smooth([[px - 3, topY + 9],
          [px - lw * 0.5, TOP + dep * 0.42], [px - lw * 0.82, lo - 4]], false) + '"/>');
        g.push('<path d="' + smooth([[px + 3, topY + 9],
          [px + rw * 0.5, TOP + dep * 0.42], [px + rw * 0.82, lo - 4]], false) + '"/>');
        g.push('</g>');
        return g.join("");
      }
      if (kind === "choppy") {
        /* 처피뱅 — 밑단이 톱니처럼 들쭉날쭉 */
        const pts = [[CX - tw, topY + 10], [CX - tw * 0.5, topY - 2], [CX, topY - 4],
                     [CX + tw * 0.5, topY - 2], [CX + tw, topY + 10]];
        const teeth = 7;
        for (let i = 0; i <= teeth; i++) {
          const t = 1 - i / teeth;
          pts.push([CX - tw + 2 * tw * t, lo - (i % 2 ? dep * 0.3 : 0)]);
        }
        g.push('<path d="' + smooth(pts, true) + '"/>');
        g.push('</g>');
        return g.join("");
      }
      if (kind === "sweep") {
        /* 긴 앞머리 — 한쪽으로 쓸어 넘긴다 */
        const s = o.part === undefined || o.part <= 0 ? -1 : 1;
        g.push('<path d="' + smooth([
          [CX - s * tw * 0.2, topY], [CX + s * tw * 0.6, topY + 2],
          [CX + s * tw, TOP + dep * 0.3], [CX + s * tw * 0.96, lo + dep * 0.12],
          [CX + s * tw * 0.3, lo], [CX - s * tw * 0.7, TOP + dep * 0.62],
          [CX - s * tw * 0.98, TOP + dep * 0.2],
        ], true) + '"/>');
        g.push('</g>');
        g.push('<g fill="none" stroke="#000000" stroke-opacity=".24" stroke-width="2.6" ' +
          'stroke-linecap="round">');
        for (let i = 1; i <= 3; i++) {
          g.push('<path d="' + smooth([[CX - s * tw * 0.5, topY + 8],
            [CX + s * tw * 0.2, TOP + dep * (0.3 + i * 0.14)],
            [CX + s * tw * 0.8, TOP + dep * (0.5 + i * 0.16)]], false) + '"/>');
        }
        g.push('</g>');
        return g.join("");
      }
      if (kind === "curl") {
        /* 곱슬 앞머리 — 밑단이 동글동글 */
        g.push('<path d="' + smooth([
          [CX - tw, topY + 12], [CX - tw * 0.5, topY - 2], [CX, topY - 5],
          [CX + tw * 0.5, topY - 2], [CX + tw, topY + 12],
          [CX + tw * 0.6, TOP + dep * 0.8], [CX, TOP + dep * 0.66],
          [CX - tw * 0.6, TOP + dep * 0.8],
        ], true) + '"/>');
        for (let i = -3; i <= 3; i++) {
          g.push('<circle cx="' + r1(CX + i * tw * 0.27) + '" cy="' +
            r1(lo - dep * 0.1) + '" r="' + r1(tw * 0.16) + '"/>');
        }
        g.push('</g>');
        return g.join("");
      }
      /* straight — 일자. 다만 가장자리를 살짝 눌러 종이조각처럼 안 보이게 */
      g.push('<path d="' + smooth([
        [CX - tw, topY + 12], [CX - tw * 0.5, topY - 2], [CX, topY - 5],
        [CX + tw * 0.5, topY - 2], [CX + tw, topY + 12],
        [CX + tw * 0.94, lo - dep * 0.1], [CX, lo], [CX - tw * 0.94, lo - dep * 0.1],
      ], true) + '"/>');
      g.push('</g>');
      g.push('<g fill="none" stroke="#000000" stroke-opacity=".2" stroke-width="2.4" ' +
        'stroke-linecap="round">');
      for (let i = -2; i <= 2; i++) {
        const x = CX + i * tw * 0.34;
        g.push('<path d="' + smooth([[x, topY + 10], [x, TOP + dep * 0.5],
          [x, lo - 3]], false) + '"/>');
      }
      g.push('</g>');
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
  const FRONT = [
    { n: "없음", f: () => "" },
    /* fit — 머리 실루엣을 얼마나 덮나. tw(그리는 폭)와 다른 값이다.
       올백만 좁게 둔다 (뒤로 넘겨 이마가 드러나는 꼴). */
    { n: "일자", o: { kind: "straight", tw: 76, depth: 38, lift: 18, fit: "standard" } },
    { n: "짧은일자", o: { kind: "straight", tw: 76, depth: 26, lift: 16, fit: "standard" } },
    { n: "시스루", o: { kind: "seethrough", tw: 77, depth: 36, lift: 16, fit: "standard" } },
    { n: "처피뱅", o: { kind: "choppy", tw: 76, depth: 32, lift: 18, fit: "standard" } },
    { n: "곱슬앞머리", o: { kind: "curl", tw: 78, depth: 34, lift: 20, fit: "standard" } },
    { n: "5대5가르마", o: { kind: "part", tw: 78, depth: 40, lift: 18, part: 0, fit: "standard" } },
    { n: "6대4가르마", o: { kind: "part", tw: 78, depth: 40, lift: 18, part: -0.3, fit: "standard" } },
    { n: "7대3가르마", o: { kind: "part", tw: 78, depth: 40, lift: 18, part: -0.6, fit: "standard" } },
    { n: "옆가르마", o: { kind: "part", tw: 78, depth: 42, lift: 18, part: 0.55, fit: "standard" } },
    { n: "긴앞머리", o: { kind: "sweep", tw: 80, depth: 42, lift: 16, part: -1, fit: "wide" } },
    { n: "쓸어넘김", o: { kind: "sweep", tw: 80, depth: 40, lift: 16, part: 1, fit: "wide" } },
    { n: "올백", o: { kind: "straight", tw: 72, depth: 12, lift: 22, fit: "narrow" } },
  ];

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
    return o.tw <= 72 ? "narrow" : o.tw >= 80 ? "wide" : "standard";
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
