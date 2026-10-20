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
  function placeHair(inner, f) {
    if (!inner) return "";
    const sx = f.sx * 1.02, sy = f.sy * 1.02;
    return '<g transform="translate(' + f.cx + ' ' + r2(f.top) + ') scale(' +
      r3(sx) + ' ' + r3(sy) + ') translate(' + -REF.cx + ' ' + -REF.top + ')">' +
      inner + '</g>';
  }
  const r2 = v => Math.round(v * 100) / 100;
  const r3 = v => Math.round(v * 1000) / 1000;

  /* ============================================================
     상태
     ============================================================ */
  const KEYS = ["face", "hairBack", "hairFront", "hairTie", "brows", "eyes",
                "nose", "mouth", "ears", "glasses", "detail",
                "lens", "liner", "blush", "mole"];
  const listOf = k => P.CATS.find(c => c.key === k).list;
  let pick = {};
  let skinIdx = 0, hairColIdx = 0, curCat = "face";
  const history = [];

  function snapshot() {
    return { pick: Object.assign({}, pick), skinIdx: skinIdx, hairColIdx: hairColIdx };
  }
  function restore(s) {
    pick = Object.assign({}, s.pick); skinIdx = s.skinIdx; hairColIdx = s.hairColIdx;
  }
  function mark() { history.push(snapshot()); if (history.length > 40) history.shift(); }

  function resetAll() {
    pick = {};
    for (const k of KEYS) pick[k] = 0;
    pick.hairFront = 1;                 // 맨머리로 시작하면 몽타주 같지 않다
    skinIdx = 0; hairColIdx = 0;
  }

  /* ============================================================
     얼굴 그리기 — 레이어 순서가 곧 그리는 순서다
     ============================================================
     1 뒷머리  2 목  3 귀  4 얼굴형  5 눈썹  6 눈  7 코  8 입
     9 피부 디테일(볼·점·주근깨·수염)  10 앞머리  11 묶음·장식
     12 안경  13 모자·마스크

     귀와 목은 얼굴보다 먼저 그린다. 뒤에 그리면 얼굴 위에 얹혀 스티커처럼
     보인다 — 안쪽이 얼굴에 가려져야 붙어 보인다. */
  function buildSVG(opt) {
    const o = opt || {};
    const f = listOf("face")[pick.face];
    const s = P.SKIN[skinIdx], hc = P.HAIRCOL[hairColIdx];
    const det = listOf("detail")[pick.detail];
    const L = [];
    if (!o.bare) L.push('<rect width="300" height="360" fill="' + (o.bg || "#FBF4DF") + '"/>');
    L.push(placeHair(listOf("hairBack")[pick.hairBack].f(hc), f));
    L.push(place(P.NECK(s), REF.chin - 20, f, f.chin - 20 * f.sy));
    L.push(place(listOf("ears")[pick.ears].s(s), REF.earY, f, f.earY));
    L.push(f.d(s));
    L.push(place(listOf("blush")[pick.blush].s, REF.cheekY, f, f.cheekY));
    L.push(place(listOf("brows")[pick.brows].s, REF.browY, f, f.browY));
    L.push(place(listOf("eyes")[pick.eyes].s, REF.eyeY, f, f.eyeY));
    L.push(place(listOf("lens")[pick.lens].s, REF.eyeY, f, f.eyeY));
    L.push(place(listOf("liner")[pick.liner].s, REF.eyeY, f, f.eyeY));
    L.push(place(listOf("nose")[pick.nose].s, REF.noseY, f, f.noseY));
    L.push(place(listOf("mouth")[pick.mouth].s, REF.mouthY, f, f.mouthY));
    L.push(place(listOf("mole")[pick.mole].s, REF.mouthY, f, f.mouthY));
    if (!det.top) L.push(place(det.s, REF.mouthY, f, f.mouthY));
    L.push(placeHair(listOf("hairFront")[pick.hairFront].f(hc), f));
    L.push(placeHair(listOf("hairTie")[pick.hairTie].f(hc), f));
    L.push(place(listOf("glasses")[pick.glasses].s, REF.eyeY, f, f.eyeY));
    if (det.top) L.push(place(det.s, REF.mouthY, f, f.mouthY));
    const body = L.join("");
    if (o.bare) return body;
    return '<svg viewBox="0 0 300 360" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>';
  }

  /* ============================================================
     전단지 더미 정보 — 고른 파츠로 문장을 짜 맞춘다
     ============================================================ */
  const AGES = ["10대 후반", "20대 초반", "20대 중반", "20대 후반",
                "30대 초반", "30대 중반", "40대 초반", "50대 전후"];
  const WEARS = ["검은 상의", "회색 후드", "남색 셔츠", "체크 남방",
                 "흰 티셔츠", "베이지 코트", "검은 패딩"];
  const SEEN = ["편의점 앞", "지하철 2호선", "학교 정문", "시장 골목",
                "버스 정류장", "아파트 단지", "PC방 앞"];
  function flyerInfo() {
    const nm = k => listOf(k)[pick[k]].n;
    const sum = KEYS.reduce((a, k) => a + pick[k], 0) + skinIdx + hairColIdx;
    /* 특징 — 있는 것만 골라 세 토막까지 */
    const feat = [];
    if (nm("hairFront") !== "없음") feat.push(nm("hairFront") + " 앞머리");
    if (nm("hairBack") !== "없음") feat.push(nm("hairBack") + " 뒷머리");
    if (nm("hairTie") !== "없음") feat.push(nm("hairTie"));
    feat.push(nm("face") + " 얼굴형");
    feat.push(nm("eyes").replace(/눈$/, "") + " 눈");
    feat.push(nm("brows") + " 눈썹");
    feat.push(nm("nose") + " 코");
    if (nm("detail") !== "없음" && !listOf("detail")[pick.detail].top) feat.push(nm("detail"));
    /* 인상착의 — 안경·모자·마스크는 눈에 띄니 따로 적는다 */
    const wear = [WEARS[sum % WEARS.length]];
    if (nm("glasses") !== "없음") wear.push(nm("glasses") + " 안경");
    const d = listOf("detail")[pick.detail];
    if (d.top) wear.push(nm("detail") + " 착용");
    return {
      name: "미상",
      age: AGES[(sum * 3) % AGES.length] + " 추정",
      feat: feat.slice(0, 4).join(", "),
      wear: wear.join(", "),
      seen: SEEN[(sum * 5) % SEEN.length],
      no: String(1000 + (sum * 37) % 9000),
    };
  }
  function paintInfo() {
    const i = flyerInfo();
    $("fName").textContent = i.name;
    $("fAge").textContent = i.age;
    $("fFeat").textContent = i.feat;
    $("fWear").textContent = i.wear;
    $("fNo").textContent = "제 " + i.no + " 호";
    const r = $("rSeen");
    if (r) r.textContent = i.seen;
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
      b.className = "opt" + (pick[cat.key] === i ? " on" : "");
      b.innerHTML = '<span class="opt-art">' + thumb(cat, i) + '</span>' +
                    '<span class="opt-name"></span>';
      b.querySelector(".opt-name").textContent = item.n;
      b.addEventListener("click", () => {
        mark();
        pick[cat.key] = i;
        paintFace(); buildGrid(); sfx();
      });
      box.appendChild(b);
    });
    /* 색 고르기 — 얼굴형 탭에서는 피부색, 머리 탭에서는 머리색 */
    const sw = $("swatchRow");
    sw.innerHTML = "";
    const colCat = cat.skin ? { key: "skin", list: P.SKIN, label: "피부색" }
      : cat.hairCol ? { key: "hairCol", list: P.HAIRCOL, label: "머리색" } : null;
    sw.hidden = !colCat;
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
  function randomize() {
    mark();
    for (const k of KEYS) pick[k] = rnd(listOf(k).length);
    /* 머리가 아예 없으면 몽타주로 안 보인다 */
    if (pick.hairFront === 0 && pick.hairBack === 0) pick.hairFront = 1 + rnd(listOf("hairFront").length - 1);
    skinIdx = rnd(P.SKIN.length);
    hairColIdx = rnd(P.HAIRCOL.length);
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
    $("resArt").innerHTML = buildSVG();
    const i = flyerInfo();
    $("rName").textContent = i.name;
    $("rAge").textContent = i.age;
    $("rFeat").textContent = i.feat;
    $("rWear").textContent = i.wear;
    $("rNo").textContent = "제 " + i.no + " 호";
    $("rSeen").textContent = i.seen;
    show("doneScreen");
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
    const W = 1080, H = 1500;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    /* 종이 */
    box(c, 0, 0, W, H, "#FBF4DF");
    box(c, 24, 24, W - 48, H - 48, null, 10);
    /* 빨간 머리띠 */
    box(c, 24, 24, W - 48, 210, "#D73A2F", 10);
    c.fillStyle = "#FFF8E6";
    c.textAlign = "center";
    c.font = "800 118px 'Black Han Sans', Pretendard, sans-serif";
    c.fillText("사람을 찾습니다", W / 2, 162);
    /* 사진 */
    const svg = buildSVG({ bg: "#FFFFFF" }).replace("<svg ", '<svg width="760" height="912" ');
    try {
      const im = await svgToImg(svg);
      box(c, 160, 276, 760, 912, "#FFFFFF", 8);
      c.drawImage(im, 160, 276, 760, 912);
    } catch (_) {
      box(c, 160, 276, 760, 912, "#EDEDE4", 8);
    }
    /* 정보 */
    const i = flyerInfo();
    c.textAlign = "left";
    c.fillStyle = "#1A1A16";
    let y = 1256;
    const row = (k, v) => {
      c.font = "800 38px Pretendard, sans-serif";
      c.fillStyle = "#8A3F38";
      c.fillText(k, 170, y);
      c.font = "700 38px Pretendard, sans-serif";
      c.fillStyle = "#1A1A16";
      c.fillText(v, 330, y);
      y += 56;
    };
    row("이 름", i.name);
    row("나이대", i.age);
    row("특 징", i.feat);
    row("인상착의", i.wear);
    c.textAlign = "center";
    c.font = "800 34px Pretendard, sans-serif";
    c.fillStyle = "#8A3F38";
    c.fillText("찾으시면 만든 사람에게 알려 주세요 · 꼬직", W / 2, H - 56);
    return cv;
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
      a.href = url; a.download = "ccojik-montage.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("전단지를 저장했어요");
      return;
    }
    openSave(url);
  }
  async function share() {
    let cv;
    try { cv = await buildCard(); } catch (_) { toast("전단지를 만들지 못했어요"); return; }
    const blob = await new Promise(res => cv.toBlob(res, "image/png"));
    if (!blob) return;
    const file = new File([blob], "ccojik-montage.png", { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: "꼬직 · 몽타주 만들기" });
        return;
      }
    } catch (_) {}
    try { await navigator.clipboard.writeText(location.href); toast("링크를 복사했어요"); }
    catch (_) { save(); }
  }

  /* ============================================================
     묶기
     ============================================================ */
  resetAll();
  $("startBtn").addEventListener("click", () => { sfx(); show("buildScreen"); paintAll(); });
  $("startRnd").addEventListener("click", () => { randomize(); show("buildScreen"); });
  $("backBtn").addEventListener("click", () => { sfx(); show("startScreen"); });
  $("rndBtn").addEventListener("click", () => { sfx(); randomize(); });
  $("undoBtn").addEventListener("click", () => { sfx(); undo(); });
  $("resetBtn").addEventListener("click", () => { sfx(); mark(); resetAll(); paintAll(); });
  $("doneBtn").addEventListener("click", finish);
  $("editBtn").addEventListener("click", () => { sfx(); show("buildScreen"); paintAll(); });
  $("newBtn").addEventListener("click", () => { sfx(); mark(); randomize(); show("buildScreen"); });
  $("saveBtn").addEventListener("click", save);
  $("shareBtn").addEventListener("click", share);
  $("saveClose").addEventListener("click", closeSave);
  $("muteBtn").addEventListener("click", toggleMute);
  $("muteBtn").textContent = muted ? "음소거" : "소리";
  addEventListener("keydown", e => { if (e.key === "Escape") closeSave(); });

  /* 시작 화면에도 얼굴 하나 */
  randomize();
  history.length = 0;
  $("startArt").innerHTML = buildSVG();
  paintInfo();

  /* 테스트가 들여다본다 */
  window.__montage = {
    place: place, placeHair: placeHair, buildSVG: buildSVG, flyerInfo: flyerInfo,
    randomize: randomize, undo: undo, resetAll: resetAll, paintAll: paintAll,
    finish: finish, buildCard: buildCard, thumb: thumb,
    get pick() { return pick; }, set pick(v) { pick = v; },
    get skinIdx() { return skinIdx; }, set skinIdx(v) { skinIdx = v; },
    get hairColIdx() { return hairColIdx; }, set hairColIdx(v) { hairColIdx = v; },
    get curCat() { return curCat; }, set curCat(v) { curCat = v; },
    history: history, KEYS: KEYS, listOf: listOf, PARTS: P,
  };
})();
