/* ============================================================
   몽타주 만들기 — 전단지 위에 얼굴을 맞춰 그린다
   ============================================================
   얼굴 / 기본머리 / 앞머리는 그림 에셋(PNG)을 얹고, 눈·눈썹·코·입·안경·
   특징처럼 작은 것만 코드로 그린다.

   좌표가 한 겹이다. 에셋이 전부 1254x1254 판에 가로 가운데(627)로 그려져
   있어서, 코드로 그리는 파츠도 같은 판에 적어 두었다. 그래서 파츠마다
   배율과 기준점을 따로 계산하지 않는다 — 얼굴형에 따른 가로 보정 한 번과,
   머리를 얹는 높이 한 줄이 전부다.

   예전에는 머리를 코드로 그린 검은 도형으로 쌓았다. 네 켜가 겹쳐 같은
   자리를 두 번 칠했고(옆머리가 뒷머리 안에 평균 85%), 앞머리가 얼굴폭의
   1.3배라 검은 커튼처럼 보였다. 지금은 그림 한 장이 실루엣을 맡는다.

   금지: 외부 라이브러리, 이모지 */
(() => {
  "use strict";
  const P = window.MONTAGE_PARTS;
  const REF = P.REF;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r2 = v => Math.round(v * 100) / 100;

  /* 정렬이 어긋날 때 어디가 문제인지 바로 보려고 켠다. 배포는 false.
     켜면 기준선(눈썹·눈·코·입)과 얼굴 꼭대기 줄이 겹쳐 그려진다. */
  let DEBUG_MONTAGE = false;
  const VIEW = P.VIEW;

  /* ============================================================
     배치 — 기준점 세 가지면 끝난다
     ============================================================
     (가) 얼굴  에셋을 판 그대로 얹는다. 네 얼굴이 같은 판에 같은 자리로
          그려져 있어 보정이 필요 없다 (dx/dy/scale 자리는 남겨 뒀다).
     (나) 머리  얼굴 꼭대기보다 TUCK 만큼 위에 머리 꼭대기가 오게 내린다.
          머리마다 그림 속 꼭대기 줄이 달라서(114~190) 이 한 줄이 없으면
          어떤 머리는 정수리가 비치고 어떤 머리는 붕 뜬다.
     (다) 앞머리  에셋이 얼굴보다 크게 그려져 있어 줄여서 내린다.
          그 값(0.727 / 109)은 합성본을 보며 맞췄다.
     ============================================================ */
  const CANVAS = REF.canvas;
  /* 머리 꼭대기가 얼굴 꼭대기보다 이만큼 위에 온다 */
  const TUCK = 14;

  function getFaceTemplate() {
    const f = at("face", pick.face);
    /* 작은 파츠 가로 보정 — 넓은 얼굴은 눈 사이가 조금 벌어진다 */
    return Object.assign({}, f, { fx: f.halfW / REF.halfW });
  }
  /* 기준점 — 바깥에서도 쓴다 (테스트·안내선) */
  function getAnchorPoint(f, name) {
    const y = { brow: REF.browY, eye: REF.eyeY, nose: REF.noseY,
                mouth: REF.mouthY, top: f.top, chin: REF.chin }[name];
    return { x: REF.cx, y: y === undefined ? REF.eyeY : y };
  }

  /* 그림 한 장 얹기. s 는 배율, dy 는 내림, dx 는 좌우 밀기.
     배율은 판 가운데(627)를 기준으로 건다 — 가로 가운데가 안 틀어진다. */
  function img(src, s, dx, dy, filter) {
    if (!src) return "";
    const w = CANVAS * s;
    const x = REF.cx - w / 2 + (dx || 0);
    return '<image href="' + src + '" x="' + r2(x) + '" y="' + r2(dy || 0) +
      '" width="' + r2(w) + '" height="' + r2(w) + '"' +
      (filter ? ' filter="url(#' + filter + ')"' : '') +
      ' preserveAspectRatio="xMidYMid meet"/>';
  }

  /* 작은 파츠 — 얼굴 가로비율만 보정해서 얹는다 */
  function place(inner, f) {
    if (!inner) return "";
    if (Math.abs(f.fx - 1) < 0.005) return inner;
    return '<g transform="translate(' + REF.cx + ' 0) scale(' + r2(f.fx) +
      ' 1) translate(' + -REF.cx + ' 0)">' + inner + '</g>';
  }

  /* 머리를 얹는 높이 — 그림 속 꼭대기 줄 차이를 메운다 */
  function hairDrop(f, h) {
    if (!h || !h.src) return 0;
    return (f.top - TUCK - h.top) + (h.dy || 0);
  }

  /* 피부색·머리색 필터 — 그림을 칠한다.
     피부는 밝기·채도만 건드리고, 머리는 어두운 그림을 색 쪽으로 끌어올린다
     (밝기만 올리면 검정은 검정 그대로라 색이 안 바뀐다). */
  function defs() {
    const sk = P.SKIN[skinIdx], hc = P.HAIRCOL[hairColIdx];
    let d = '';
    if (sk && sk.f) {
      d += '<filter id="mg-skin" color-interpolation-filters="sRGB">' +
        '<feColorMatrix type="saturate" values="' + sk.f.s + '"/>' +
        '<feComponentTransfer>' +
        '<feFuncR type="linear" slope="' + sk.f.b + '"/>' +
        '<feFuncG type="linear" slope="' + sk.f.b + '"/>' +
        '<feFuncB type="linear" slope="' + sk.f.b + '"/>' +
        '</feComponentTransfer></filter>';
    }
    if (hc && hc.m) {
      const m = hc.m;
      d += '<filter id="mg-hair" color-interpolation-filters="sRGB">' +
        '<feComponentTransfer>' +
        '<feFuncR type="linear" slope="' + m[0][0] + '" intercept="' + m[0][1] + '"/>' +
        '<feFuncG type="linear" slope="' + m[1][0] + '" intercept="' + m[1][1] + '"/>' +
        '<feFuncB type="linear" slope="' + m[2][0] + '" intercept="' + m[2][1] + '"/>' +
        '</feComponentTransfer></filter>';
    }
    return d ? '<defs>' + d + '</defs>' : '';
  }
  const skinFx = () => (P.SKIN[skinIdx] && P.SKIN[skinIdx].f) ? 'mg-skin' : null;
  const hairFx = () => (P.HAIRCOL[hairColIdx] && P.HAIRCOL[hairColIdx].m) ? 'mg-hair' : null;

  /* ============================================================
     상태
     ============================================================ */
  /* 고르는 칸 — 화면 탭에서 그대로 나온다. 탭에 없는 것이 몰래 붙는 일이
     없도록 CATS 를 그대로 쓴다. */
  const KEYS = P.CATS.map(c => c.key);
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
    /* 앞머리는 받쳐 줄 머리가 있어야 한다 — 민머리 위에 앞머리만 얹으면
       이마에 가발 조각이 붙은 꼴이 된다 */
    if (!P.bangsOk(at("hairBase", pick.hairBase).n, at("bangs", pick.bangs).n))
      pick.bangs = 0;
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
       1 얼굴(그림)  2 눈썹  3 눈  4 눈색  5 아이라인  6 코  7 입
       8 특징  9 기본머리(그림)  10 앞머리(그림)  11 안경

     머리는 얼굴 위에 얹는다 — 그림 가운데가 비어 있어 얼굴이 그대로
     비치고, 관자놀이와 귀는 머리가 덮는다. 켜는 셋을 넘지 않는다.
     귀와 목은 얼굴 그림에 이미 들어 있어 따로 그리지 않는다. */
  const dFace = f => img(f.src, f.scale || 1, f.dx, f.dy, skinFx());
  const dBrows = f => place(at("brows", pick.brows).s, f);
  const dEyes = f => place(at("eyes", pick.eyes).s, f);
  const dLens = f => place(at("lens", pick.lens).s, f);
  const dLiner = f => place(at("liner", pick.liner).s, f);
  const dNose = f => place(at("nose", pick.nose).s, f);
  const dMouth = f => place(at("mouth", pick.mouth).s, f);
  const dDetails = f => place(at("detail", pick.detail).s, f);
  const dHairBase = f => {
    const h = at("hairBase", pick.hairBase);
    return img(h.src, h.scale || 1, h.dx, hairDrop(f, h), hairFx());
  };
  const dBangs = f => {
    const b = at("bangs", pick.bangs);
    return img(b.src, b.scale || 1, b.dx, b.dy, hairFx());
  };
  const dGlasses = f => place(at("glasses", pick.glasses).s, f);

  /* 안내선 — DEBUG_MONTAGE 일 때만 */
  function dGuides(f) {
    const L = (y, c) => '<path d="M120 ' + y + ' H1134" stroke="' + c +
      '" stroke-width="2" stroke-dasharray="10 8" fill="none"/>';
    return '<g opacity=".65">' + L(f.top, '#2F80ED') + L(REF.browY, '#D73A2F') +
      L(REF.eyeY, '#D73A2F') + L(REF.noseY, '#E09F3E') + L(REF.mouthY, '#E09F3E') +
      '<path d="M627 60 V1180" stroke="#2F80ED" stroke-width="2" ' +
      'stroke-dasharray="10 8" fill="none"/></g>';
  }

  /* 몽타주 한 장 — 레이어 차례대로 불러 모은다 */
  function drawMontage(f) {
    return [
      dFace(f),
      dBrows(f), dEyes(f), dLens(f), dLiner(f), dNose(f), dMouth(f), dDetails(f),
      dHairBase(f), dBangs(f), dGlasses(f),
      DEBUG_MONTAGE ? dGuides(f) : "",
    ].join("");
  }

  function buildSVG(opt) {
    const o = opt || {};
    validate();
    const f = getFaceTemplate();
    const v = VIEW.split(" ").map(Number);
    const bg = o.bare ? "" : '<rect x="' + v[0] + '" y="' + v[1] + '" width="' + v[2] +
      '" height="' + v[3] + '" fill="' + (o.bg || "#FFFDF7") + '"/>';
    const body = defs() + bg + drawMontage(f);
    if (o.bare) return body;
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
    brows: "BROWS", eyes: "EYES", nose: "NOSE", mouth: "MOUTH",
    glasses: "GLASSES", detail: "DETAIL", lens: "LENS", liner: "LINER" };
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
      const bad = cat.key === "bangs" && !P.bangsOk(backN, item.n);
      b.className = "opt" + (pick[cat.key] === i ? " on" : "") + (bad ? " off" : "");
      if (bad) b.title = "머리를 먼저 고르면 얹을 수 있어요";
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
      b.style.background = c.c || "#ccc";
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
  function randomize() {
    mark();
    for (const k of KEYS) pick[k] = getRandomPart(k);
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

  /* 에셋을 data URI 로 바꿔 둔다 — 한 번 받으면 들고 있는다 */
  const assetCache = {};
  function asDataURI(src) {
    if (assetCache[src]) return assetCache[src];
    assetCache[src] = fetch(src).then(r => {
      if (!r.ok) throw new Error(r.status + " " + src);
      return r.blob();
    }).then(b => new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error("read " + src));
      fr.readAsDataURL(b);
    }));
    return assetCache[src];
  }
  /* SVG 안의 상대 경로를 data URI 로 바꾼다. 안 바꾸면 저장한 그림에서
     얼굴과 머리가 통째로 빠진다. */
  async function inlineAssets(svg) {
    const srcs = [];
    svg.replace(/href="([^"]+\.png)"/g, (_, u) => { srcs.push(u); return _; });
    const uniq = srcs.filter((v, i, a) => a.indexOf(v) === i);
    const map = {};
    await Promise.all(uniq.map(u =>
      asDataURI(u).then(d => { map[u] = d; }).catch(e => {
        console.error("[몽타주] 에셋을 못 읽었습니다:", u, e.message);
      })));
    return svg.replace(/href="([^"]+\.png)"/g, (m, u) =>
      map[u] ? 'href="' + map[u] + '"' : m);
  }

  /* 에셋이 다 열리는지 처음에 한 번 확인한다. 실패해도 도형 머리로
     되돌리지 않는다 — 어떤 파일이 문제인지만 콘솔에 남긴다. */
  function checkAssets() {
    const srcs = [];
    for (const list of [P.FACES, P.HAIR_BASE, P.BANGS])
      for (const it of list) if (it.src) srcs.push(it.src);
    let bad = 0;
    for (const u of srcs) {
      const im = new Image();
      im.onerror = () => {
        bad++;
        console.error("[몽타주] 그림 에셋을 못 불러왔습니다: " + u +
          "  (assets/opt 에 파일이 있는지 확인해주세요)");
      };
      im.src = u;
    }
    void bad;
  }

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
    const v = VIEW.split(" ").map(Number);
    const PW = 820, PH = Math.round(PW * v[3] / v[2]), PX = (W - PW) / 2, PY = 330;
    let svg = buildSVG({ bg: "#FFFFFF" })
      .replace("<svg ", '<svg width="' + PW + '" height="' + PH + '" ');
    try {
      svg = await inlineAssets(svg);
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
  checkAssets();
  $("startArt").innerHTML = buildSVG();
  paintInfo();
  if (DEBUG_MONTAGE) dumpSelection();

  /* 테스트가 들여다본다 */
  window.__montage = {
    place: place, img: img, buildSVG: buildSVG, flyerInfo: flyerInfo,
    randomize: randomize, undo: undo, resetAll: resetAll, paintAll: paintAll,
    finish: finish, buildCard: buildCard, thumb: thumb, shareText: shareText,
    hairDrop: hairDrop, TUCK: TUCK, defs: defs,
    typed: typed, bindInputs: bindInputs,
    getFaceTemplate: getFaceTemplate,
    getAnchorPoint: getAnchorPoint, drawMontage: drawMontage,
    validate: validate, at: at, clean: clean, posterName: posterName, MODE: MODE,
    normalizeSelection: normalizeSelection, getRandomPart: getRandomPart,
    dumpSelection: dumpSelection, VIEW: VIEW, AGES: AGES,
    inlineAssets: inlineAssets, checkAssets: checkAssets,
    get mode() { return mode; },
    get debug() { return DEBUG_MONTAGE; }, set debug(v) { DEBUG_MONTAGE = v; },
    get pick() { return pick; }, set pick(v) { pick = v; },
    get skinIdx() { return skinIdx; }, set skinIdx(v) { skinIdx = v; },
    get hairColIdx() { return hairColIdx; }, set hairColIdx(v) { hairColIdx = v; },
    get curCat() { return curCat; }, set curCat(v) { curCat = v; },
    history: history, KEYS: KEYS, listOf: listOf, PARTS: P,
  };
})();
