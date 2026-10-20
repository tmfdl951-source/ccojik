/* ============================================================
   몽타주 만들기 — 전단지 위에 얼굴을 맞춰 그린다
   ============================================================
   핵심은 '기준점(앵커) 배치' 다.
   파츠 그림은 전부 기준 얼굴(parts.js 의 REF) 위에 그려져 있고, 이 파일의
   place() 가 지금 고른 얼굴형의 기준점으로 옮겨 얹는다. 그래서 얼굴형을
   바꿔도 눈·코·입이 따라 움직이고, 파츠를 더할 때 좌표를 다시 잴 일이 없다.

   예전에는 모든 파츠가 절대좌표(눈은 언제나 y=171)로 겹쳐 그려졌다. 그래서
   길쭉한 얼굴(턱 280)이든 넓적한 얼굴(턱 260)이든 눈이 같은 자리에 붙어
   얼굴 위에 스티커처럼 떠 보였다.

   금지: 외부 라이브러리, 이모지 */
(() => {
  "use strict";
  const P = window.MONTAGE_PARTS;
  const REF = P.REF;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* 정렬이 어긋날 때 어디가 문제인지 바로 보려고 켠다.
     배포는 false. 켜면 얼굴 네모·기준선·맞춤 칸이 몽타주 위에 겹쳐 그려진다. */
  let DEBUG_MONTAGE = false;
  /* 보여 주는 칸 — 파츠가 실제로 쓰는 범위에 맞춰 잘라 낸 것 */
  const VIEW = "14 24 272 330";

  /* ============================================================
     공통 — 얼굴 기준점과 맞춤 칸
     ============================================================
     파츠마다 좌표를 따로 계산하지 않는다. 전부 이 셋만 쓴다. */
  function getFaceTemplate() {
    const list = listOf("face");
    return list[clamp(pick.face | 0, 0, list.length - 1)];
  }
  /* 기준선 한 점 — 'eyeY' 같은 이름으로 묻는다 */
  function getAnchorPoint(f, name) {
    return { x: f.centerX, y: f[name] };
  }
  /* 맞춤 칸 — 그 파츠가 들어가야 하는 네모. 얼굴 기준점에서 끌어낸다
     (얼굴마다 숫자를 따로 적지 않는다). */
  function getFitRect(f, zone) {
    const fore = f.browY - f.hairlineY;
    const halfW = f.width / 2;
    const Z = {
      bangs: { x: f.centerX - halfW, y: f.topY - fore * 0.8, w: f.width, h: fore * 1.8 },
      hairBase: { x: f.centerX - halfW * 1.2, y: f.topY - fore * 1.1, w: f.width * 1.2, h: f.height * 1.5 },
      eyebrows: { x: f.leftCheekX, y: f.browY - fore * 0.3, w: f.width, h: fore * 0.6 },
      eyes: { x: f.leftCheekX, y: f.eyeY - fore * 0.4, w: f.width, h: fore * 0.9 },
      nose: { x: f.centerX - halfW * 0.4, y: f.noseY - fore * 0.5, w: halfW * 0.8, h: fore * 1.1 },
      mouth: { x: f.centerX - halfW * 0.6, y: f.mouthY - fore * 0.4, w: halfW * 1.2, h: fore * 0.9 },
      ears: { x: f.leftCheekX - 14, y: f.earY - fore * 0.7, w: f.width + 28, h: fore * 1.4 },
      detail: { x: f.leftCheekX, y: f.topY, w: f.width, h: f.height },
    };
    return Z[zone] || Z.detail;
  }

  /* ============================================================
     기준점 배치
     ============================================================ */
  /* 기준 얼굴 위에 그려진 조각을, 지금 얼굴의 기준점으로 옮겨 얹는다.
       inner  기준 좌표로 그린 svg 조각
       refY   그 조각이 기준 얼굴에서 걸려 있던 가로선 (REF.eyeY 등)
       f      지금 얼굴형 (parts.js 의 face())
       fy     이 얼굴에서 그 가로선이 있는 자리 (f.eyeY 등)
       m      이 파츠만의 미세 보정 { scale, dx, dy }
     translate -> scale -> translate 순서라, 조각의 기준점이 제자리에 꽂힌다. */
  function place(inner, refY, f, fy, m) {
    if (!inner) return "";
    const o = m || {};
    const k = f.featScale * (o.scale || 1);
    const x = f.cx + (o.dx || 0);
    const y = fy + (o.dy || 0);
    return '<g transform="translate(' + r2(x) + ' ' + r2(y) + ') scale(' + r3(k) +
      ') translate(' + -REF.cx + ' ' + -refY + ')">' + inner + '</g>';
  }
  /* 머리카락은 머리통을 덮는 뚜껑이다 — 가로·세로를 따로 늘려 머리에 맞춘다.
     얼굴보다 살짝 크게 씌워야 두피가 비지 않는다. */
  /* 틀 바닥 — 긴 머리 끝을 여기까지만 내린다 */
  const VIEW_BOT = (() => { const v = VIEW.split(" ").map(Number); return v[1] + v[3] - 4; })();
  /* 머리는 얼굴 비율로 늘인다. 다만 얼굴이 긴 사람에게 긴 머리를 얹으면
     꼬리가 틀 밖으로 흘러내린다 (길쭉 + 긴생머리에서 12px). 스타일마다
     y 를 손으로 박는 대신 '꼬리가 틀 바닥을 넘지 않는다' 는 한 규칙으로
     세로 배율만 조인다. e 는 그 파츠의 기준좌표 네모다. */
  function placeHair(inner, f, e) {
    if (!inner) return "";
    /* 얼굴형 볼륨 보정 — 긴 얼굴은 옆 볼륨을 조금 보태 세로로만 길어
       보이지 않게 하고, 둥글고 넓은 얼굴은 과하게 퍼지지 않게 줄인다.
       얼굴마다 숫자를 박지 않고 세로/가로 비율 하나로 민다. */
    const sx = f.sx * 1.02 * (1 + (faceLean(f) - 1) * 0.35);
    let sy = f.sy * 1.02;
    const drop = e ? e[3] - REF.top : 0;
    if (drop > 0) {
      const room = (VIEW_BOT - f.top) / drop;
      if (room < sy) sy = clamp(room, sy * 0.78, sy);
    }
    return '<g transform="translate(' + f.cx + ' ' + r2(f.top) + ') scale(' +
      r3(sx) + ' ' + r3(sy) + ') translate(' + -REF.cx + ' ' + -REF.top + ')">' +
      inner + '</g>';
  }

  /* 앞머리는 뚜껑도 아니고 이마에 붙인 조각도 아니다 — 머리에서 내려오는
     것이다.

     예전에는 위끝과 아래끝을 둘 다 못 박고 그 사이를 채우도록 늘였다.
     그래서 어떤 스타일이든 이마선~눈썹선을 꽉 채웠고, 재 보니 12종이
     전부 눈썹선 -2px 에서 끝났다. 올백은 그린 깊이 15px 인데 1.62배로
     늘어나 이마를 다 덮었다. 길이가 스타일 차이의 핵심인데 그게 뭉갰다.
     폭도 max(얼굴폭, 실루엣폭) 에서 실루엣 항이 늘 이겨 10종이 한 폭이
     됐다.

     이제는 '얼굴 비율로 얹고, 넘칠 때만 조인다'.
       위끝  이마선 위 — 그린 lift 만큼 머리 베이스에 묻힌다. 그래서
             앞머리 윗동이 이마 한가운데서 불쑥 시작하지 않는다.
       세로  이마 높이 비율. 늘이지 않으므로 스타일 깊이가 그대로 산다.
       폭    그린 폭 x 얼굴 가로비율. 다만 아래로 눈썹 바깥은 반드시
             덮고(가운데만 툭 튀면 안 된다), 위로 머리 실루엣을 넘지
             않는다(관자놀이에서 옆·뒷머리와 이어진다).
       조임  눈 구역(core) 밑끝이 눈썹선을 넘을 때만 세로를 줄인다.
             바깥으로 흘러내리는 가닥은 눈이 아니라 얼굴 옆이라 둔다. */
  /* 지금 머리가 차지하는 폭 — 앞머리가 이 안에 있어야 머리에서 내려온
     것으로 보인다 (밖으로 나가면 머리 위에 얹힌 조각이 된다) */
  function hairSpanOf(f, idx) {
    if (!idx) return f.width;
    const e = P.EXT.HAIR_BASE[idx];
    if (!e) return f.width;
    return Math.max(f.width, (e[2] - e[0]) * f.sx * 1.02);
  }
  function hairSpan(f) { return hairSpanOf(f, pick.hairBase); }

  /* 앞머리 폭 — 얼굴폭에 대한 비율. 이마를 덮되 관자놀이까지 끌고 가지
     않는다. 관자놀이·귀 쪽 측면은 hairBase 가 맡는다.
     예전에는 '머리 실루엣만큼 넓게' 로 잡아 얼굴폭의 123~131% 가 됐고,
     그게 앞머리가 검은 커튼처럼 보이던 가장 큰 원인이었다. */
  const FIT_W = { narrow: 0.58, standard: 0.68, wide: 0.73 };

  /* 얼굴형 보정 — 얼굴이 길면 폭을 넓히고 세로를 줄인다. 얼굴마다 x/y 를
     박는 대신 '세로/가로 비율' 하나로만 민다. */
  function faceLean(f) {
    const ref = (REF.chin - REF.top) / (REF.halfW * 2);
    return clamp(((f.chinY - f.topY) / f.width) / ref, 0.86, 1.2);
  }

  function placeFront(inner, f, name) {
    if (!inner) return "";
    const idx = P.BANGS.findIndex(h => h.n === name);
    const e = P.EXT.BANGS[idx];
    if (!e) return place(inner, REF.top, f, f.hairlineY, null);
    const meta = P.HAIR_FIT[name] || { fit: "standard" };
    const fit = meta.fit || "standard";
    const fore = f.browY - f.hairlineY, refFore = REF.browY - REF.top;
    const lean = faceLean(f);

    /* 폭 — 얼굴폭의 비율로 잡는다. 아래로 두 눈 사이는 덮어야 하고,
       위로 머리 실루엣을 넘지 않는다. */
    const artW = Math.max(8, e[2] - e[0]);
    const maxW = hairSpan(f) * 0.96;
    const minW = Math.min((f.rightEyeX - f.leftEyeX) * 1.3, maxW);
    const want = clamp(f.width * FIT_W[fit] * (1 + (lean - 1) * 0.3), minW, maxW);
    const kx = clamp(want / artW, 0.3, 2.2);

    /* 세로 — 이마 높이 비율. 긴 얼굴은 조금 줄여 세로로만 길어지지 않게 */
    let ky = clamp(fore / refFore * (1 - (lean - 1) * 0.3), 0.6, 1.8);
    /* 밑끝이 눈썹선을 넘으면 그만큼만 조인다. 예전엔 눈 구역(가운데
       +-54)만 봤는데, 앞머리 폭이 좁아지면서 바깥 가닥도 눈 위에 오게
       돼 구역을 가릴 뜻이 없어졌다 — 전체 밑끝으로 잰다. */
    const low = e[3] - REF.top;
    const room = fore - 2 * f.sy;
    if (low > 0 && ky * low > room) ky = room / low;
    /* 위끝은 늘 이마선 위에 있어야 한다 — 베이스에 묻혀야 잘린 종이가 안 된다 */
    const up = REF.top - e[1];
    if (up > 0 && ky * up < 7) ky = Math.max(ky, 7 / up);

    return '<g transform="translate(' + r2(f.cx) + ' ' + r2(f.hairlineY) + ') scale(' +
      r3(kx) + ' ' + r3(ky) + ') translate(' + -REF.cx + ' ' + -REF.top + ')">' +
      inner + '</g>';
  }

  /* 안경은 눈에 걸치는 것이다. 두 눈 기준점 사이 거리로 폭을 잡으므로
     얼굴형이 바뀌든 눈이 바뀌든 늘 두 눈에 맞는다.
       가운데  (왼눈 + 오른눈) / 2
       폭      두 눈 거리 / 기준 거리(58)
     파츠마다 offsetY / scale 로 미세 보정할 수 있다. */
  function placeGlasses(inner, f, m) {
    if (!inner) return "";
    const o = m || {};
    const dist = f.rightEyeX - f.leftEyeX;
    const refDist = REF.rightEyeX - REF.leftEyeX;
    const k = (dist / refDist) * (o.scale || 1);
    const cx = (f.leftEyeX + f.rightEyeX) / 2;
    const cy = f.eyeY + (o.dy || 0) * f.sy;
    return '<g transform="translate(' + r2(cx) + ' ' + r2(cy) + ') scale(' + r3(k) +
      ') translate(' + -REF.cx + ' ' + -REF.eyeY + ')">' + inner + '</g>';
  }

  /* 눈썹 — 눈에 너무 붙거나 이마 위로 올라가지 않게 묶는다.
     그려진 자리를 지키되, 눈과의 틈이 이마 높이의 22% 보다 좁아지면 올린다. */
  function browShift(f) {
    const e = P.EXT.BROWS[pick.brows];
    if (!e) return 0;
    const k = f.featScale;
    const fore = f.browY - f.hairlineY;
    const low = f.browY + k * (e[3] - REF.browY);      // 눈썹 아래끝
    const gap = f.eyeY - low;                          // 눈까지 틈
    const want = fore * 0.22;
    let dy = 0;
    if (gap < want) dy = -(want - gap);                // 눈에 붙었으면 올린다
    const high = f.browY + k * (e[1] - REF.browY) + dy;
    if (high < f.hairlineY + 2) dy += f.hairlineY + 2 - high;   // 이마 위로는 안 간다
    return dy;
  }

  /* 작은 파츠(점·주근깨·흉터·볼터치…)는 자유도가 커도 되지만 얼굴 밖으로는
     못 나간다. 기준 네모(EXT)를 옮겨 보고 넘치면 배율을 줄여 끌어당긴다. */
  function fitIn(ext, refY, f, fy) {
    if (!ext) return null;
    let k = f.featScale;
    for (let n = 0; n < 6; n++) {
      const x1 = f.cx + k * (ext[0] - REF.cx), x2 = f.cx + k * (ext[2] - REF.cx);
      const y1 = fy + k * (ext[1] - refY), y2 = fy + k * (ext[3] - refY);
      const out = Math.max(f.leftCheekX - x1, x2 - f.rightCheekX,
                           f.topY - y1, y2 - f.chinY);
      if (out <= 1) break;
      k *= 0.9;
    }
    return k === f.featScale ? null : { scale: k / f.featScale };
  }
  const r2 = v => Math.round(v * 100) / 100;
  const r3 = v => Math.round(v * 1000) / 1000;

  /* ============================================================
     상태
     ============================================================ */
  const KEYS = ["face", "hairBase", "bangs", "hairExtra", "brows", "eyes",
                "nose", "mouth", "ears", "glasses", "detail", "lens", "liner"];
  const listOf = k => P.CATS.find(c => c.key === k).list;
  /* 고른 번호가 범위를 벗어나면 기본 파츠로 되돌린다 — undefined 를 그리면
     화면이 통째로 비어 버린다. */
  function at(k, i) {
    const list = listOf(k);
    const n = Number(i);
    return list[(n >= 0 && n < list.length) ? n : 0];
  }
  /* 고른 것을 쓸 수 있는 상태로 다듬는다. 파츠를 고를 때마다, 랜덤 뒤에도
     반드시 거친다.
       - 없는 번호 -> 기본
       - 화면 탭에 없는 칸 -> 아예 못 들어온다 (KEYS 가 CATS 에서 나온다)
       - 안 맞는 머리 조합 -> 묶음을 "없음" 으로
       - 머리가 하나도 없으면 -> 기본 뒷머리를 씌운다 */
  function normalizeSelection() {
    validate();
    /* 묶음은 묶을 머리가 있어야 한다 */
    const backName = at("hairBase", pick.hairBase).n;
    const tieName = at("hairExtra", pick.hairExtra).n;
    if (tieName !== "없음" && !P.tieOk(backName, tieName)) pick.hairExtra = 0;
    /* 앞머리는 받쳐 줄 뒷머리가 있어야 한다 — 삭발이나 뒷머리없음 위에
       앞머리만 뜨면 공중에 붙은 조각으로 보인다 */
    if (!P.frontOk(backName, at("bangs", pick.bangs).n)) pick.bangs = 0;
    /* 앞·뒤가 다 없으면 민머리다 — 몽타주로 안 보인다 */
    if (pick.hairBase === 0 && pick.bangs === 0) pick.hairBase = 1;
    return pick;
  }

  function validate() {
    for (const k of KEYS) {
      const list = listOf(k);
      const n = Number(pick[k]);
      if (!(n >= 0 && n < list.length)) pick[k] = 0;
    }
    if (!(skinIdx >= 0 && skinIdx < P.SKIN.length)) skinIdx = 0;
    if (!(hairColIdx >= 0 && hairColIdx < P.HAIRCOL.length)) hairColIdx = 0;
  }
  let pick = {};
  let skinIdx = 0, hairColIdx = 0, curCat = "face";
  /* 어느 단계인가 — 고치는 중 / 완성본 보는 중 / 저장·공유 */
  const MODE = { EDIT: "EDIT", PREVIEW: "PREVIEW", RESULT: "RESULT" };
  let mode = MODE.EDIT;
  const history = [];
  /* 사용자가 직접 적는 칸. 비워 두면 고른 파츠로 지어낸 글이 들어간다. */
  const typed = { name: "", nick: "", age: "", feat: "", wear: "" };

  function snapshot() {
    return { pick: Object.assign({}, pick), skinIdx: skinIdx, hairColIdx: hairColIdx };
  }
  function restore(s) {
    pick = Object.assign({}, s.pick); skinIdx = s.skinIdx; hairColIdx = s.hairColIdx;
  }
  function mark() { history.push(snapshot()); if (history.length > 40) history.shift(); }

  /* 초기화는 파츠만 되돌린다 — 적어 둔 이름까지 날리면 번거롭다.
     이름까지 비우려면 keepTyped 를 false 로. */
  function resetAll(keepTyped) {
    pick = {};
    if (keepTyped === false) {
      typed.name = ""; typed.nick = ""; typed.age = ""; typed.feat = ""; typed.wear = "";
    }
    /* 중립 — 안경·수염·점 같은 장식이 하나도 안 붙은 얼굴.
       처음 들어왔을 때 이상한 게 이미 붙어 있으면 안 된다. */
    for (const k of KEYS) pick[k] = P.NEUTRAL[k] === undefined ? 0 : P.NEUTRAL[k];
    skinIdx = P.NEUTRAL.skin; hairColIdx = P.NEUTRAL.hairCol;
    normalizeSelection();
  }

  /* ============================================================
     얼굴 그리기 — 레이어 순서가 곧 그리는 순서다
     ============================================================
     1 뒷머리  2 목  3 귀  4 얼굴형  5 눈썹  6 눈  7 코  8 입
     9 피부 디테일(볼·점·주근깨·수염)  10 앞머리  11 묶음·장식
     12 안경  13 모자·마스크

     귀와 목은 얼굴보다 먼저 그린다. 뒤에 그리면 얼굴 위에 얹혀 스티커처럼
     보인다 — 안쪽이 얼굴에 가려져야 붙어 보인다. */
  /* 레이어마다 함수를 따로 둔다 — 거대한 그리기 함수 하나로 두지 않는다 */
  const dHairBase = (f, hc) =>
    placeHair(at("hairBase", pick.hairBase).f(hc), f, P.EXT.HAIR_BASE[pick.hairBase]);
  const dEars = (f, sk) => place(at("ears", pick.ears).s(sk), REF.earY, f, f.earY);
  const dNeck = (f, sk) => place(P.NECK(sk), REF.chin - 20, f, f.chinY - 20 * f.sy);
  const dFace = (f, sk) => f.d(sk);

  const dBrows = f => place(at("brows", pick.brows).s, REF.browY, f, f.browY,
    { dy: browShift(f) });
  const dEyes = f => place(at("eyes", pick.eyes).s, REF.eyeY, f, f.eyeY) +
    place(at("lens", pick.lens).s, REF.eyeY, f, f.eyeY) +
    place(at("liner", pick.liner).s, REF.eyeY, f, f.eyeY);
  const dNose = f => place(at("nose", pick.nose).s, REF.noseY, f, f.noseY);
  const dMouth = f => place(at("mouth", pick.mouth).s, REF.mouthY, f, f.mouthY);
  /* 특징 — 파츠가 '어느 기준선에 걸리나(anchor)' 를 데이터로 들고 있다.
     점은 볼선, 다크서클은 눈선, 수염은 입선… 한 칸에 하나만 고른다. */
  const dDetails = f => {
    const d = at("detail", pick.detail);
    if (!d.s || d.top) return "";
    const ref = REF[d.ref] === undefined ? REF.mouthY : REF[d.ref];
    const fy = f[d.anchor] === undefined ? f.mouthY : f[d.anchor];
    return place(d.s, ref, f, fy, fitIn(P.EXT.DETAIL[pick.detail], ref, f, fy));
  };
  const dBangs = (f, hc) => {
    const fr = at("bangs", pick.bangs);
    return placeFront(fr.f(hc), f, fr.n);
  };
  const dHairExtra = (f, hc) =>
    placeHair(at("hairExtra", pick.hairExtra).f(hc), f, P.EXT.HAIR_EXTRA[pick.hairExtra]);
  /* 안경 / 머리 위에 얹는 것 — 거의 맨 위 */
  const dAccessory = f => {
    const g = at("glasses", pick.glasses);
    const d = at("detail", pick.detail);
    const top = d.top
      ? place(d.s, REF[d.ref] === undefined ? REF.mouthY : REF[d.ref], f,
              f[d.anchor] === undefined ? f.mouthY : f[d.anchor])
      : "";
    return placeGlasses(g.s, f, g) + top;
  };

  /* 안내선 — DEBUG_MONTAGE 일 때만. 어긋난 파츠가 어느 기준선에서
     벗어났는지 눈으로 바로 보려고 둔다. */
  function dGuides(f) {
    const g = [];
    const line = (y, c, t) => '<line x1="8" y1="' + r2(y) + '" x2="292" y2="' + r2(y) +
      '" stroke="' + c + '" stroke-width="1" stroke-dasharray="4 3"/>' +
      '<text x="10" y="' + r2(y - 2) + '" font-size="7" fill="' + c + '">' + t + '</text>';
    const boxOf = (z, c) => {
      const r = getFitRect(f, z);
      return '<rect x="' + r2(r.x) + '" y="' + r2(r.y) + '" width="' + r2(r.w) +
        '" height="' + r2(r.h) + '" fill="none" stroke="' + c +
        '" stroke-width="1" stroke-dasharray="2 2"/>';
    };
    g.push('<rect x="' + r2(f.leftCheekX) + '" y="' + r2(f.topY) + '" width="' + r2(f.width) +
      '" height="' + r2(f.height) + '" fill="none" stroke="#e01b1b" stroke-width="1.4"/>');
    g.push(line(f.hairlineY, "#1b8ae0", "hairline"));
    g.push(line(f.browY, "#8a1be0", "brow"));
    g.push(line(f.eyeY, "#0f9d58", "eye"));
    g.push(line(f.noseY, "#e08a1b", "nose"));
    g.push(line(f.mouthY, "#e01b8a", "mouth"));
    g.push(line(f.chinY, "#444", "chin"));
    for (const z of ["bangs", "eyebrows", "eyes", "nose", "mouth", "detail"])
      g.push(boxOf(z, "#00000055"));
    for (const a of ["centerX"])
      g.push('<line x1="' + f[a] + '" y1="8" x2="' + f[a] + '" y2="352" stroke="#e01b1b" ' +
        'stroke-width="1" stroke-dasharray="4 3"/>');
    for (const p of [["eyeY", "#0f9d58"], ["browY", "#8a1be0"], ["mouthY", "#e01b8a"]]) {
      const q = getAnchorPoint(f, p[0]);
      g.push('<circle cx="' + r2(q.x) + '" cy="' + r2(q.y) + '" r="2.4" fill="' + p[1] + '"/>');
    }
    return g.join("");
  }

  /* 몽타주 한 장 — 레이어 차례대로 불러 모은다 (§39 순서) */
  function drawMontage(f, sk, hc) {
    return [
      /* 머리는 세 켜만 그린다 — 베이스 / 앞머리 / 묶음.
         옆머리를 따로 얹던 켜는 걷어냈다 (뒷머리와 같은 자리를 두 번
         칠해 귀 옆이 검은 덩어리로 보였다). */
      dHairBase(f, hc), dNeck(f, sk), dEars(f, sk), dFace(f, sk),
      dBrows(f), dEyes(f), dNose(f), dMouth(f), dDetails(f),
      dBangs(f, hc), dHairExtra(f, hc), dAccessory(f),
      DEBUG_MONTAGE ? dGuides(f) : "",
    ].join("");
  }

  function buildSVG(opt) {
    const o = opt || {};
    validate();
    const f = getFaceTemplate();
    const body = (o.bare ? "" : '<rect x="0" y="0" width="300" height="360" fill="' +
      (o.bg || "#FBF4DF") + '"/>') + drawMontage(f, P.SKIN[skinIdx], P.HAIRCOL[hairColIdx]);
    if (o.bare) return body;
    /* 그리는 자리는 300x360 이지만 실제로 쓰이는 칸은 x21~279 y34~328 이다.
       0 0 300 360 으로 보여 주면 사방에 빈 테가 남아 얼굴이 작아 보인다.
       쓰이는 칸에 맞춰 잘라 보여 준다 (머리까지 높이의 63~83% 를 차지). */
    return '<svg viewBox="' + VIEW + '" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>';
  }

  /* ============================================================
     전단지 더미 정보 — 고른 파츠로 문장을 짜 맞춘다
     ============================================================ */
  /* 적어 넣은 글 다듬기 — 줄바꿈·꺾쇠를 털고 길이를 자른다.
     textContent 로만 넣으므로 태그가 살아날 일은 없지만, 캔버스에 그릴 때
     줄바꿈이 섞이면 글자가 깨져 보인다. */
  function clean(v, max) {
    return String(v === undefined || v === null ? "" : v)
      .replace(/[<>]/g, "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, max);
  }

  /* 나이대 — 직접 적어도 되고 아래에서 골라도 된다 (datalist) */
  const AGES = ["10대", "20대", "30대", "40대", "50대", "60대 이상", "미상"];
  /* 옷을 고르는 기능이 없으므로 인상착의를 지어내지 않는다. 안 적으면 "미상".
     눈에 띄는 안경·모자·마스크만 자동으로 덧붙인다. */
  /* 칸 이름 -> TAGS 표의 이름 */
  const TAGKEY = { face: "FACES", bangs: "BANGS", hairBase: "HAIR_BASE",
    hairExtra: "HAIR_EXTRA", brows: "BROWS", eyes: "EYES",
    nose: "NOSE", mouth: "MOUTH", ears: "EARS", glasses: "GLASSES",
    detail: "DETAIL", lens: "LENS", liner: "LINER" };
  const CATKEY = {};
  for (const k of Object.keys(TAGKEY)) CATKEY[TAGKEY[k]] = k;

  function flyerInfo() {
    validate();
    const nm = k => at(k, pick[k]).n;
    const sum = KEYS.reduce((a, k) => a + pick[k], 0) + skinIdx + hairColIdx;
    /* 특징 — 파츠에 적힌 설명말(TAGS)을 차례대로 모아 넷까지 */
    const feat = [];
    for (const tk of P.TAG_ORDER) {
      const ck = CATKEY[tk];
      if (!ck || pick[ck] === undefined) continue;
      /* 모자·마스크는 '인상착의' 쪽에 적으므로 특징 글에서는 건너뛴다.
         안경은 사람을 가리는 표가 되므로 특징 글에도 적는다. */
      if (ck === "detail" && at("detail", pick.detail).top) continue;
      /* 설명말이 여럿이면 하나만 쓴다 — 같은 파츠를 두 번 적으면 안 된다
         ("웨이브 머리, 꼬불꼬불한 머리" 처럼). 나머지는 바꿔 쓸 말이다. */
      const t = (P.TAGS[tk] || [])[pick[ck]] || [];
      if (t.length && feat.indexOf(t[0]) < 0) feat.push(t[0]);
      if (feat.length >= 5) break;
    }
    /* 인상착의 — 적은 게 있으면 그대로. 안경은 특징 글에 적히므로 여기선
       빼고, 쓴 것(모자·마스크)만 적는다. 둘 다 없으면 미상. */
    const wear = [];
    const d = at("detail", pick.detail);
    if (d.top) wear.push(nm("detail") + " 착용");
    const made = feat.slice(0, 5).join(", ");
    return {
      /* 적은 게 있으면 그대로, 없으면 지어낸 것 */
      name: clean(typed.name, 16) || "미상",
      nick: clean(typed.nick, 16),
      age: clean(typed.age, 16) || "미상",
      feat: clean(typed.feat, 44) || made,
      autoFeat: made,
      wear: clean(typed.wear, 30) || wear.join(", ") || "미상",
      autoWear: wear.join(", ") || "미상",
      no: String(1000 + (sum * 37) % 9000),
    };
  }
  function paintInfo() {
    const i = flyerInfo();
    $("fNo").textContent = "제 " + i.no + " 호";
    /* 비워 둔 칸은 placeholder 로 들어갈 글을 미리 보여 준다 */
    $("inAge").placeholder = "미상";
    $("inFeat").placeholder = i.autoFeat;
    $("inWear").placeholder = i.autoWear;
    if (DEBUG_MONTAGE) dumpSelection();
  }
  /* 적는 칸 -> 글. 랜덤은 이 값들을 건드리지 않는다. */
  function bindInputs() {
    const map = { inName: "name", inNick: "nick", inAge: "age",
                  inFeat: "feat", inWear: "wear" };
    for (const id of Object.keys(map)) {
      const el = $(id);
      if (!el) continue;
      el.addEventListener("input", () => { typed[map[id]] = el.value; paintInfo(); });
    }
    /* 나이대 고르는 목록 */
    const dl = $("ageList");
    if (dl) for (const a of AGES) {
      const o = document.createElement("option");
      o.value = a;
      dl.appendChild(o);
    }
  }

  /* 화면에 보이는 것과 고른 값이 어긋나지 않는지 보려고 찍는다 (디버그) */
  function dumpSelection() {
    const rows = KEYS.map(k => k + ": " + at(k, pick[k]).n).join("  |  ");
    console.log("[montage] " + rows + "  |  skin:" + skinIdx + " hair:" + hairColIdx);
    const box = $("dbgPanel");
    if (box) {
      box.hidden = false;
      box.textContent = KEYS.map(k => k + ": " + at(k, pick[k]).n).join("\n");
    }
  }

  /* ============================================================
     화면 그리기
     ============================================================ */
  function paintFace() {
    $("faceArt").innerHTML = buildSVG();
    paintInfo();
  }

  /* 썸네일 — 그 파츠만 바뀐 얼굴을 작게 보여 준다. 글자만 있는 목록보다
     고르기가 훨씬 쉽다. 지금 상태를 그대로 쓰되 한 칸만 바꿔 그린다. */
  function thumb(cat, i) {
    const keep = snapshot();
    if (cat.key === "skin") skinIdx = i;
    else if (cat.key === "hairCol") hairColIdx = i;
    else pick[cat.key] = i;
    const svg = buildSVG({ bg: "#fff" });
    restore(keep);
    return svg;
  }

  function buildTabs() {
    const box = $("catTabs");
    box.innerHTML = "";
    for (const c of P.CATS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tab" + (c.key === curCat ? " on" : "");
      b.textContent = c.label;
      b.addEventListener("click", () => { curCat = c.key; buildTabs(); buildGrid(); });
      box.appendChild(b);
    }
  }

  function buildGrid() {
    const cat = P.CATS.find(c => c.key === curCat);
    const box = $("optGrid");
    box.innerHTML = "";
    cat.list.forEach((item, i) => {
      const b = document.createElement("button");
      b.type = "button";
      /* 지금 머리와 안 맞는 묶음·앞머리는 흐리게 — 눌러도 되돌려지므로
         숨기지 않고 왜 못 쓰는지 보이게 둔다 */
      const backN = at("hairBase", pick.hairBase).n;
      const bad = (cat.key === "hairExtra" && !P.tieOk(backN, item.n)) ||
                  (cat.key === "bangs" && !P.frontOk(backN, item.n));
      b.className = "opt" + (pick[cat.key] === i ? " on" : "") + (bad ? " off" : "");
      if (bad) b.title = cat.key === "hairExtra" ? "지금 뒷머리로는 묶을 수 없어요"
                                               : "지금 뒷머리에는 얹을 수 없어요";
      b.setAttribute("aria-label", item.n + " " + cat.label + " 선택");
      b.innerHTML = '<span class="opt-art">' + thumb(cat, i) + '</span>' +
                    '<span class="opt-name"></span>';
      b.querySelector(".opt-name").textContent = item.n;
      b.addEventListener("click", () => {
        mark();
        pick[cat.key] = i;
        normalizeSelection();            // 고른 것 -> 다듬기 -> 다시 그리기
        paintFace(); buildGrid(); sfx();
      });
      box.appendChild(b);
    });
    /* 색 고르기 — 얼굴형 탭에서는 피부색, 머리 탭에서는 머리색 */
    const sw = $("swatchRow");
    sw.innerHTML = "";
    const colCat = cat.skin ? { key: "skin", list: P.SKIN, label: "피부색" }
      : cat.hairCol ? { key: "hairCol", list: P.HAIRCOL, label: "머리색" } : null;
    /* 자리는 늘 차지하고 내용만 보이거나 숨는다 — hidden 으로 접으면
       아래 단추들이 위로 당겨져 창 높이가 칸마다 달라진다. */
    sw.classList.toggle("on", !!colCat);
    if (!colCat) return;
    const lab = document.createElement("span");
    lab.className = "sw-lbl";
    lab.textContent = colCat.label;
    sw.appendChild(lab);
    colCat.list.forEach((c, i) => {
      const cur = colCat.key === "skin" ? skinIdx : hairColIdx;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sw" + (cur === i ? " on" : "");
      b.style.background = c;
      b.setAttribute("aria-label", colCat.label + " " + (i + 1));
      b.addEventListener("click", () => {
        mark();
        if (colCat.key === "skin") skinIdx = i; else hairColIdx = i;
        paintFace(); buildGrid(); sfx();
      });
      sw.appendChild(b);
    });
  }

  function paintAll() { paintFace(); buildTabs(); buildGrid(); }

  /* ============================================================
     단추
     ============================================================ */
  const rnd = n => Math.floor(Math.random() * n);
  /* 랜덤은 화면에서 고를 수 있는 것에서만 뽑는다 — 탭에 없는 파츠가
     몰래 붙는 일이 없다 (KEYS 자체가 CATS 에서 나온다).
     안경·수염 같은 덧붙이는 칸은 확률로만 붙인다. 매번 붙으면 과하다. */
  function getRandomPart(k) {
    const list = listOf(k);
    if (!list.length) return 0;
    const ch = P.CHANCE[k];
    if (ch !== undefined && Math.random() >= ch) return 0;   // 0번 = "없음"
    const lo = P.OPTIONAL.indexOf(k) >= 0 ? 1 : 0;           // "없음" 은 건너뛴다
    if (list.length <= lo) return 0;
    return lo + rnd(list.length - lo);
  }
  /* 랜덤은 얼굴만 바꾼다 — 적어 넣은 이름·별명·나이대·특징·인상착의는 그대로 */
  /* 머리 계열끼리 어울리는 짝 — 랜덤이 이 쪽으로 기운다. 막지는 않는다.
     곱슬 머리에 일자 앞머리를 얹으면 질감이 따로 놀고, 웨이브 머리에
     짧고 딱 잘린 앞머리를 얹으면 흐름이 끊긴다. */
  const FAMILY = {
    curly: ["곱슬앞머리", "처피뱅", "짧은일자", "시스루"],
    wave:  ["긴앞머리", "쓸어넘김", "시스루", "옆가르마", "7대3가르마"],
  };
  function familyOf(backName) {
    const h = P.HAIR_BASE.find(x => x.n === backName);
    if (!h || !h.o || !h.o.cyc) return null;
    return h.o.cyc >= 5 ? "curly" : "wave";
  }
  /* 계열이 있으면 열 번 중 예닐곱 번은 어울리는 짝에서 고른다 */
  function leanToFamily(baseName) {
    const names = FAMILY[familyOf(baseName)];
    if (!names) return;
    if (!pick.bangs) return;                     // "없음" 은 그대로 둔다
    if (Math.random() > 0.65) return;
    const i = listOf("bangs").findIndex(x => x.n === names[rnd(names.length)]);
    if (i > 0) pick.bangs = i;
  }

  function randomize() {
    mark();
    for (const k of KEYS) pick[k] = getRandomPart(k);
    leanToFamily(at("hairBase", pick.hairBase).n);
    skinIdx = rnd(P.SKIN.length);
    hairColIdx = rnd(P.HAIRCOL.length);
    normalizeSelection();
    paintAll();
  }
  function undo() {
    if (!history.length) return;
    restore(history.pop());
    paintAll();
  }

  /* ============================================================
     소리 — 파일이 없어 짧은 삐 소리만 (더미 파일을 만들지 않는다)
     ============================================================ */
  const MUTE_KEY = "ccojik-montage-muted";
  let actx = null, muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (_) {}
  function ac() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function beep(freq, dur, vol, wait) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + (wait || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sfx = () => beep(620, 0.05, 0.07);
  const sfxDone = () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.12, 0.1, i * 0.08));
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (_) {}
    $("muteBtn").textContent = muted ? "음소거" : "소리";
    if (!muted) sfx();
  }

  /* ============================================================
     화면 넘기기
     ============================================================ */
  function show(id) {
    const all = document.querySelectorAll(".screen");
    for (let i = 0; i < all.length; i++) all[i].classList.remove("on");
    $(id).classList.add("on");
  }
  function toast(m) {
    const t = $("toast");
    t.textContent = m;
    t.classList.add("show");
    clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.remove("show"), 1700);
  }

  function finish() {
    sfxDone();
    mode = MODE.PREVIEW;
    $("resArt").innerHTML = buildSVG();
    const i = flyerInfo();
    $("rName").textContent = i.name + (i.nick ? " (" + i.nick + ")" : "");
    $("rAge").textContent = i.age;
    $("rFeat").textContent = i.feat;
    $("rWear").textContent = i.wear;
    $("rNo").textContent = "제 " + i.no + " 호";
    $("rSeen").textContent = i.seen;
    show("doneScreen");
    mode = MODE.RESULT;
  }

  /* ============================================================
     내려받기 / 공유 — 전단지 한 장을 캔버스로 굽는다
     ============================================================ */
  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) ||
                (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const canDownload = () => !isIOS && typeof document.createElement("a").download !== "undefined";

  function svgToImg(svg) {
    return new Promise((res, rej) => {
      const b = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const u = URL.createObjectURL(b);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); res(im); };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("svg")); };
      im.src = u;
    });
  }
  function box(c, x, y, w, h, fill, line) {
    if (fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
    if (line) { c.strokeStyle = "#1A1A16"; c.lineWidth = line; c.strokeRect(x, y, w, h); }
  }
  async function buildCard() {
    const W = 1080, H = 1920;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    /* 종이 */
    box(c, 0, 0, W, H, "#FBF4DF");
    box(c, 24, 24, W - 48, H - 48, null, 10);
    /* 빨간 머리띠 */
    box(c, 24, 24, W - 48, 250, "#D73A2F", 10);
    c.fillStyle = "#FFF8E6";
    c.textAlign = "center";
    c.font = "800 136px 'Black Han Sans', Pretendard, sans-serif";
    c.fillText("사람을 찾습니다", W / 2, 192);
    /* 사진 — 편집 UI 는 들어가지 않는다 (몽타주만 다시 그린다) */
    const PW = 800, PH = 960, PX = (W - PW) / 2, PY = 330;
    const svg = buildSVG({ bg: "#FFFFFF" })
      .replace("<svg ", '<svg width="' + PW + '" height="' + PH + '" ');
    try {
      const im = await svgToImg(svg);
      box(c, PX, PY, PW, PH, "#FFFFFF", 8);
      c.drawImage(im, PX, PY, PW, PH);
    } catch (_) {
      box(c, PX, PY, PW, PH, "#EDEDE4", 8);
    }
    /* 정보 */
    const i = flyerInfo();
    c.textAlign = "left";
    c.fillStyle = "#1A1A16";
    let y = 1420;
    const row = (k, v) => {
      c.font = "800 44px Pretendard, sans-serif";
      c.fillStyle = "#8A3F38";
      c.fillText(k, 150, y);
      c.font = "700 44px Pretendard, sans-serif";
      c.fillStyle = "#1A1A16";
      /* 길면 줄여 적는다 — 넘쳐 잘리는 것보다 낫다 */
      let t = v;
      while (t.length > 6 && c.measureText(t).width > W - 480) t = t.slice(0, -2);
      c.fillText(t === v ? v : t + "...", 350, y);
      y += 72;
    };
    row("이 름", i.name + (i.nick ? "  (" + i.nick + ")" : ""));
    row("나이대", i.age);
    row("특 징", i.feat);
    row("인상착의", i.wear);
    c.textAlign = "center";
    c.font = "800 40px Pretendard, sans-serif";
    c.fillStyle = "#8A3F38";
    c.fillText("찾으시면 만든 사람에게 알려 주세요 · 꼬직", W / 2, H - 70);
    return cv;
  }

  /* 저장 파일명 — 이름이 있으면 거기에 붙인다 */
  function posterName() {
    const n = clean(typed.name, 16).replace(/[^가-힣a-zA-Z0-9]/g, "");
    return n ? "wanted-poster-" + n + ".png" : "wanted-poster.png";
  }

  let savedURL = null;
  function openSave(u) {
    if (savedURL) URL.revokeObjectURL(savedURL);
    savedURL = u;
    $("saveImg").src = u;
    $("saveModal").classList.add("show");
  }
  function closeSave() {
    $("saveModal").classList.remove("show");
    $("saveImg").removeAttribute("src");
    if (savedURL) { URL.revokeObjectURL(savedURL); savedURL = null; }
  }
  async function save() {
    let cv;
    try { cv = await buildCard(); } catch (_) { toast("전단지를 만들지 못했어요"); return; }
    const blob = await new Promise(res => cv.toBlob(res, "image/png"));
    if (!blob) { toast("전단지를 만들지 못했어요"); return; }
    const url = URL.createObjectURL(blob);
    if (canDownload()) {
      const a = document.createElement("a");
      a.href = url; a.download = posterName();
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("전단지를 저장했어요");
      return;
    }
    openSave(url);
  }
  /* 공유 문구 — 이름을 적었으면 그 사람을 찾는 말로 */
  function shareText() {
    const i = flyerInfo();
    return i.name === "미상"
      ? "내가 만든 몽타주 전단지! 이 사람을 찾습니다"
      : i.name + " 몽타주 전단지를 만들었어요!";
  }
  async function share() {
    let cv;
    try { cv = await buildCard(); } catch (_) { toast("전단지를 만들지 못했어요"); return; }
    const blob = await new Promise(res => cv.toBlob(res, "image/png"));
    if (!blob) return;
    const file = new File([blob], posterName(), { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: "꼬직 · 몽타주 만들기", text: shareText() });
        return;
      }
    } catch (_) {}
    /* 공유를 못 쓰는 브라우저 — 문구와 링크를 복사해 주고 그림은 내려받게 */
    try {
      await navigator.clipboard.writeText(shareText() + " " + location.href);
      toast("공유 문구를 복사했어요");
    } catch (_) {}
    save();
  }

  /* ============================================================
     묶기
     ============================================================ */
  resetAll();
  bindInputs();
  $("startBtn").addEventListener("click", () => { sfx(); show("buildScreen"); paintAll(); });
  $("startRnd").addEventListener("click", () => { randomize(); show("buildScreen"); });
  $("backBtn").addEventListener("click", () => { sfx(); show("startScreen"); });
  $("rndBtn").addEventListener("click", () => { sfx(); randomize(); });
  $("undoBtn").addEventListener("click", () => { sfx(); undo(); });
  $("resetBtn").addEventListener("click", () => { sfx(); mark(); resetAll(true); paintAll(); });
  $("doneBtn").addEventListener("click", finish);
  $("editBtn").addEventListener("click", () => { sfx(); mode = MODE.EDIT; show("buildScreen"); paintAll(); });
  $("newBtn").addEventListener("click", () => { sfx(); mark(); randomize(); mode = MODE.EDIT; show("buildScreen"); });
  $("saveBtn").addEventListener("click", save);
  $("shareBtn").addEventListener("click", share);
  $("saveClose").addEventListener("click", closeSave);
  $("muteBtn").addEventListener("click", toggleMute);
  $("muteBtn").textContent = muted ? "음소거" : "소리";
  addEventListener("keydown", e => { if (e.key === "Escape") closeSave(); });

  /* 시작 화면 얼굴 — 중립 프리셋이다. 들어오자마자 안경·수염이 붙어 있으면
     "내가 안 골랐는데?" 가 된다. 랜덤은 단추를 눌렀을 때만 돈다. */
  resetAll(false);
  history.length = 0;
  $("startArt").innerHTML = buildSVG();
  paintInfo();
  if (DEBUG_MONTAGE) dumpSelection();

  /* 테스트가 들여다본다 */
  window.__montage = {
    place: place, placeHair: placeHair, buildSVG: buildSVG, flyerInfo: flyerInfo,
    randomize: randomize, undo: undo, resetAll: resetAll, paintAll: paintAll,
    finish: finish, buildCard: buildCard, thumb: thumb, shareText: shareText,
    placeFront: placeFront, placeGlasses: placeGlasses, fitIn: fitIn,
    hairSpan: hairSpan, hairSpanOf: hairSpanOf, FIT_W: FIT_W,
    typed: typed, bindInputs: bindInputs,
    getFaceTemplate: getFaceTemplate, getFitRect: getFitRect,
    getAnchorPoint: getAnchorPoint, drawMontage: drawMontage, browShift: browShift,
    validate: validate, at: at, clean: clean, posterName: posterName, MODE: MODE,
    normalizeSelection: normalizeSelection, getRandomPart: getRandomPart,
    dumpSelection: dumpSelection, VIEW: VIEW, AGES: AGES,
    get mode() { return mode; },
    get debug() { return DEBUG_MONTAGE; }, set debug(v) { DEBUG_MONTAGE = v; },
    get pick() { return pick; }, set pick(v) { pick = v; },
    get skinIdx() { return skinIdx; }, set skinIdx(v) { skinIdx = v; },
    get hairColIdx() { return hairColIdx; }, set hairColIdx(v) { hairColIdx = v; },
    get curCat() { return curCat; }, set curCat(v) { curCat = v; },
    history: history, KEYS: KEYS, listOf: listOf, PARTS: P,
  };
})();
