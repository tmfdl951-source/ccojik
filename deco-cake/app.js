"use strict";
/* ===== 꼬직 · 10초 케이크 데코 (바닐라, 물리엔진 없음) ===== */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const CAKE_BASES = window.CAKE_BASES, CREAMS = window.CREAMS, TOPPINGS = window.TOPPINGS;
const ORDERS = window.ORDERS, COMMENTS = window.STAR_COMMENTS;
const WRITE_COLORS = window.WRITE_COLORS || [{ name: "흰색", c: "#FFF7F0" }];
const CREAM_TIPS = [{ key: "round", label: "기본" }, { key: "star", label: "별짜기" }, { key: "wave", label: "물결" }];

/* ---------------- 튜닝 상수 ---------------- */
const DURATION = 12;
const W_ORDER = 0.78, W_FINISH = 0.22;    // 주문충족 大 / 마감도 小 (까다롭게)
const ICING_OK = 0.32;                     // 아이싱 인정 커버리지

/* ---------------- 상태 ---------------- */
let curOrder = ORDERS[0], curBase = CAKE_BASES[0];
let mode = "cream", curCream = CREAMS[0], curTopping = "strawberry", curTip = "round", curWriteColor = "#FFFDF6";
let cakeCanvas, ctx, W = 0, H = 0, dpr = 1, cakeCX = 0, cakeCY = 0, cakeR = 0, creamR = 22, topScale = 1;
let creamStrokes = [], toppings = [], writeStrokes = [];
let curStroke = null, drawing = false, running = false, decoLocked = false, tStart = 0;

function showScreen(id) { document.querySelectorAll(".screen").forEach(s => s.classList.remove("active")); $(id).classList.add("active"); }

/* ---------------- 케이크 베이스 ---------------- */
function cakeGeom(cw, ch) { return { cx: cw / 2, cy: ch / 2, r: Math.min(cw, ch) * 0.36 }; }
function drawCakeBase(g, cw, ch, d, sponge) {
  const { cx, cy, r } = cakeGeom(cw, ch);
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = "#FFFDF6"; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.setTransform(d, 0, 0, d, 0, 0);
  g.fillStyle = "#F2ECDA"; g.beginPath(); g.arc(cx, cy, r * 1.32, 0, 7); g.fill();
  g.strokeStyle = "rgba(0,0,0,.14)"; g.lineWidth = 3; g.stroke();
  g.fillStyle = sponge; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  g.strokeStyle = "rgba(0,0,0,.28)"; g.lineWidth = 5; g.stroke();
  g.strokeStyle = "rgba(0,0,0,.14)"; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r * 0.86, 0, 7); g.stroke();
}

/* ---------------- 토핑 스탬프 (버튼 아이콘 겸용) ---------------- */
function drawTopping(g, key, x, y, s, seed) {
  g.save(); g.translate(x, y); g.scale(s, s); g.lineWidth = 2; g.lineJoin = "round"; seed = seed | 0;
  if (key === "strawberry") {
    g.fillStyle = "#E5384E"; g.strokeStyle = "#B02437";
    g.beginPath(); g.moveTo(0, -9); g.bezierCurveTo(11, -9, 11, 6, 0, 15); g.bezierCurveTo(-11, 6, -11, -9, 0, -9); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#FFE9A8"; [[-4, -2], [3, -1], [-2, 5], [4, 5], [0, 9]].forEach(p => { g.beginPath(); g.ellipse(p[0], p[1], 1.1, 1.9, 0, 0, 7); g.fill(); });
    g.fillStyle = "#3FAE4E"; g.beginPath(); for (let i = -2; i <= 2; i++) { g.moveTo(0, -8); g.lineTo(i * 4, -15); g.lineTo(i * 4 + 3, -8); } g.closePath(); g.fill();
  } else if (key === "blueberry") {
    g.fillStyle = "#4B5FB0"; g.strokeStyle = "#2f3d78"; g.beginPath(); g.arc(0, 1, 7, 0, 7); g.fill(); g.stroke();
    g.fillStyle = "#2f3d78"; g.beginPath(); for (let i = 0; i < 5; i++) { const a = i * 72 * Math.PI / 180 - Math.PI / 2; const px = Math.cos(a) * 2.6, py = -3 + Math.sin(a) * 2.6; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill();
    g.fillStyle = "rgba(255,255,255,.5)"; g.beginPath(); g.arc(-3, -1, 1.6, 0, 7); g.fill();
  } else if (key === "cherry") {
    g.strokeStyle = "#3FAE4E"; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-4, 4); g.quadraticCurveTo(-2, -11, 2, -13); g.moveTo(5, 6); g.quadraticCurveTo(3, -9, 2, -13); g.stroke();
    g.fillStyle = "#D42A3E"; g.strokeStyle = "#951f2d"; g.beginPath(); g.arc(-5, 6, 5, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.arc(5, 8, 5, 0, 7); g.fill(); g.stroke();
  } else if (key === "chocochip") {
    g.fillStyle = "#5A3A22"; g.strokeStyle = "#3a2413"; g.beginPath(); g.moveTo(-6, 4); g.quadraticCurveTo(-8, -6, 0, -7); g.quadraticCurveTo(8, -6, 6, 4); g.quadraticCurveTo(0, 7, -6, 4); g.closePath(); g.fill(); g.stroke();
  } else if (key === "sprinkle") {
    const cols = ["#E5384E", "#35B94E", "#2AAEE6", "#FF74A8", "#FFC61A", "#8E5BD6"];
    for (let i = 0; i < 3; i++) { g.save(); g.rotate((i * 55 - 45) * Math.PI / 180); g.translate((i - 1) * 5, (i % 2) * 4 - 2); g.fillStyle = cols[(i * 2 + seed) % cols.length]; g.beginPath(); if (g.roundRect) g.roundRect(-6, -2, 12, 4, 2); else g.rect(-6, -2, 12, 4); g.fill(); g.restore(); }
  } else if (key === "macaron") {
    g.fillStyle = "#F4A6C0"; g.strokeStyle = "#c76e8c";
    g.beginPath(); g.ellipse(0, -5, 10, 5.5, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(0, 5, 10, 5.5, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = "#FFF3D0"; g.beginPath(); g.rect(-9, -1.5, 18, 3.5); g.fill();
  } else if (key === "wafer") {
    g.fillStyle = "#E7C79A"; g.strokeStyle = "#b8945f"; g.beginPath(); g.rect(-9, -7, 18, 14); g.fill(); g.stroke();
    g.strokeStyle = "rgba(120,80,40,.5)"; g.lineWidth = 1.4; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-9, i * 5); g.lineTo(9, i * 5); g.stroke(); g.beginPath(); g.moveTo(i * 6, -7); g.lineTo(i * 6, 7); g.stroke(); }
  } else if (key === "starcandy") {
    const cols = ["#FF9EC0", "#9ED0FF", "#FFF29E", "#B7F5C0"]; g.fillStyle = cols[seed % cols.length]; g.strokeStyle = "rgba(0,0,0,.25)";
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * 36 * Math.PI / 180 - Math.PI / 2, rr = i % 2 ? 3.4 : 8; const px = Math.cos(a) * rr, py = Math.sin(a) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill(); g.stroke();
  } else if (key === "heart") {
    g.fillStyle = "#FF3D74"; g.strokeStyle = "#c31f52";
    g.beginPath(); g.moveTo(0, 8); g.bezierCurveTo(-11, -2, -8, -12, 0, -5); g.bezierCurveTo(8, -12, 11, -2, 0, 8); g.closePath(); g.fill(); g.stroke();
  } else if (key === "candy") {
    g.fillStyle = "#FF6FAE"; g.beginPath(); g.moveTo(-11, 0); g.lineTo(-6, -4); g.lineTo(-6, 4); g.closePath(); g.moveTo(11, 0); g.lineTo(6, -4); g.lineTo(6, 4); g.closePath(); g.fill();
    g.fillStyle = "#FFD21A"; g.strokeStyle = "#b98a00"; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); g.stroke();
  } else if (key === "candle") {
    g.fillStyle = "#FF8AA8"; g.strokeStyle = "#c95f7c"; g.beginPath(); g.rect(-3, -6, 6, 20); g.fill(); g.stroke();
    g.strokeStyle = "#fff"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-3, -1); g.lineTo(3, -3); g.moveTo(-3, 5); g.lineTo(3, 3); g.stroke();
    g.fillStyle = "#FFD21A"; g.beginPath(); g.moveTo(0, -18); g.quadraticCurveTo(4, -11, 0, -7); g.quadraticCurveTo(-4, -11, 0, -18); g.fill();
    g.fillStyle = "#FF7A2D"; g.beginPath(); g.moveTo(0, -15); g.quadraticCurveTo(2, -11, 0, -8); g.quadraticCurveTo(-2, -11, 0, -15); g.fill();
  } else if (key === "ribbon") {
    g.fillStyle = "#FF4D8D"; g.strokeStyle = "#c31f5e";
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-12, -6); g.lineTo(-12, 6); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(12, -6); g.lineTo(12, 6); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#c31f5e"; g.beginPath(); g.arc(0, 0, 3.5, 0, 7); g.fill();
  } else if (key === "flag") {
    g.strokeStyle = "#7a5a3a"; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-6, 14); g.lineTo(-6, -14); g.stroke();
    g.fillStyle = "#35C15E"; g.strokeStyle = "#1f7a3a"; g.beginPath(); g.moveTo(-6, -14); g.lineTo(10, -9); g.lineTo(-6, -4); g.closePath(); g.fill(); g.stroke();
  } else if (key === "kiwi") {
    g.fillStyle = "#7CA82E"; g.strokeStyle = "#5a7d1f"; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill(); g.stroke();
    g.fillStyle = "#C7E29A"; g.beginPath(); g.arc(0, 0, 5.5, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(0, 0, 2, 0, 7); g.fill();
    g.fillStyle = "#2b2b2b"; for (let i = 0; i < 8; i++) { const a = i / 8 * 2 * Math.PI; g.beginPath(); g.arc(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0.9, 0, 7); g.fill(); }
  } else if (key === "orange") {
    g.fillStyle = "#FF9A2E"; g.strokeStyle = "#d5721a"; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = "#FFD9A8"; g.lineWidth = 1.4; for (let i = 0; i < 6; i++) { const a = i / 6 * 2 * Math.PI; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); g.stroke(); }
    g.fillStyle = "#FFC46B"; g.beginPath(); g.arc(0, 0, 2, 0, 7); g.fill();
  } else if (key === "banana") {
    g.fillStyle = "#F4DC6A"; g.strokeStyle = "#c9a83a"; g.beginPath(); g.ellipse(0, 0, 9, 6, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = "#EFCF52"; g.beginPath(); g.arc(0, 0, 2.4, 0, 7); g.fill();
    g.fillStyle = "#a07a1a"; g.beginPath(); g.moveTo(0, -2.4); g.lineTo(1.6, 1.2); g.lineTo(-1.6, 1.2); g.closePath(); g.fill();
  } else if (key === "pretzel") {
    g.strokeStyle = "#8A5A2B"; g.lineWidth = 4.2; g.lineCap = "round";
    g.beginPath(); g.arc(-4, 1, 5, 0.2 * Math.PI, 1.7 * Math.PI); g.stroke();
    g.beginPath(); g.arc(4, 1, 5, -0.7 * Math.PI, 0.8 * Math.PI); g.stroke();
    g.beginPath(); g.moveTo(-6, -3); g.lineTo(0, 5); g.lineTo(6, -3); g.stroke();
    g.fillStyle = "#fff"; for (const p of [[-6, -3], [6, -3], [0, 6]]) { g.beginPath(); g.arc(p[0], p[1], 1, 0, 7); g.fill(); }
  } else if (key === "lotus") {
    g.fillStyle = "#C88A46"; g.strokeStyle = "#9c6a30"; g.beginPath(); roundRectPath(g, -11, -7, 22, 14, 3); g.fill(); g.stroke();
    g.strokeStyle = "rgba(90,55,20,.5)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-7, -7); g.lineTo(-7, 7); g.moveTo(7, -7); g.lineTo(7, 7); g.stroke();
    g.beginPath(); for (let x = -5; x <= 5; x += 5) { g.moveTo(x, -4); g.lineTo(x + 2, 4); } g.stroke();
  } else if (key === "poppari") {
    g.fillStyle = "#F6D97A"; g.strokeStyle = "#c9a83a"; for (const p of [[-5, 1], [0, -4], [5, 1], [-1, 5], [3, 5]]) { g.beginPath(); g.arc(p[0], p[1], 4, 0, 7); g.fill(); g.stroke(); }
    g.fillStyle = "rgba(255,255,255,.4)"; g.beginPath(); g.arc(-2, -2, 1.4, 0, 7); g.fill();
  } else if (key === "heartjelly") {
    g.fillStyle = "rgba(255,90,140,.72)"; g.strokeStyle = "#e0407a";
    g.beginPath(); g.moveTo(0, 8); g.bezierCurveTo(-10, -1, -7, -11, 0, -4); g.bezierCurveTo(7, -11, 10, -1, 0, 8); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "rgba(255,255,255,.6)"; g.beginPath(); g.ellipse(-3, -2, 2.4, 3.4, -0.5, 0, 7); g.fill();
  } else if (key === "pearl") {
    for (const p of [[-4, 2], [4, 3], [0, -3]]) { g.fillStyle = "#F3EEF5"; g.strokeStyle = "#c9bfd0"; g.beginPath(); g.arc(p[0], p[1], 4, 0, 7); g.fill(); g.stroke(); g.fillStyle = "#fff"; g.beginPath(); g.arc(p[0] - 1.3, p[1] - 1.3, 1.2, 0, 7); g.fill(); }
  } else if (key === "gold") {
    g.fillStyle = "#F1C33B"; g.strokeStyle = "#b8901f";
    for (const p of [[-5, -2], [3, -4], [1, 3], [6, 2]]) { g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + 4, p[1] - 1); g.lineTo(p[0] + 5, p[1] + 3); g.lineTo(p[0] + 1, p[1] + 4); g.closePath(); g.fill(); g.stroke(); }
  }
  g.restore();
}

/* ---------------- 도구 UI (기본 세트 항상 노출 + 더보기) ---------------- */
let moreOpen = false;
const BASE_CREAMS = ["white", "choco", "pink", "yellow"];   // 기본 크림 4
function chip(bg, on, title, onClick) { const el = document.createElement("div"); el.className = "cream-chip" + (on ? " on" : ""); el.style.background = bg; el.title = title || ""; el.addEventListener("click", onClick); return el; }
function topButton(key, label, on, onClick) { const btn = document.createElement("button"); btn.className = "top-btn" + (on ? " on" : ""); btn.title = label; const c = document.createElement("canvas"); c.width = 54; c.height = 54; drawTopping(c.getContext("2d"), key, 27, 30, 1.7, 3); btn.appendChild(c); btn.addEventListener("click", onClick); return btn; }
function tipBtn(t, onClick) { const b = document.createElement("button"); b.className = "tip-btn" + (curTip === t.key ? " on" : ""); b.textContent = t.label; b.addEventListener("click", onClick); return b; }
function group(title) {   // .tool-group을 #tabBody에 붙이고 아이템 담을 컨테이너 반환
  const d = document.createElement("div"); d.className = "tool-group";
  if (title) { const h = document.createElement("div"); h.className = "tg-title"; h.textContent = title; d.appendChild(h); }
  const items = document.createElement("div"); items.className = "tg-items"; d.appendChild(items);
  $("tabBody").appendChild(d); return items;
}
function curToolText() {
  if (mode === "writing") { const w = (WRITE_COLORS.find(x => x.c === curWriteColor) || {}).name || ""; return "글씨 " + w; }
  if (mode === "topping") { const t = TOPPINGS.find(x => x.key === curTopping); return "토핑 " + (t ? t.label : ""); }
  const tip = (CREAM_TIPS.find(x => x.key === curTip) || {}).label || ""; return "크림 " + curCream.name + " (" + tip + ")";
}
function buildPalette() {
  $("curTool").textContent = "지금: " + curToolText();
  const box = $("tabBody"); box.innerHTML = "";
  // 기본 크림 색
  const gc = group("크림 색"); BASE_CREAMS.forEach(k => { const cr = CREAMS.find(c => c.key === k); if (cr) gc.appendChild(chip(cr.c, mode === "cream" && curCream.key === cr.key, cr.name, () => { mode = "cream"; curCream = cr; buildPalette(); })); });
  // 짜는 팁
  const gt = group("짜는 팁"); CREAM_TIPS.forEach(t => gt.appendChild(tipBtn(t, () => { mode = "cream"; curTip = t.key; buildPalette(); })));
  // 핵심 토핑
  const gtop = group("토핑"); TOPPINGS.filter(t => t.basic).forEach(t => gtop.appendChild(topButton(t.key, t.label, mode === "topping" && curTopping === t.key, () => { mode = "topping"; curTopping = t.key; buildPalette(); })));
  // 글씨
  const gw = group("글씨"); const wb = document.createElement("button"); wb.className = "tool-btn wide" + (mode === "writing" ? " on" : ""); wb.textContent = "짤주머니(글씨)"; wb.addEventListener("click", () => { mode = "writing"; buildPalette(); }); gw.appendChild(wb);
  // 더보기 토글
  const more = document.createElement("button"); more.className = "more-toggle"; more.textContent = moreOpen ? "간단히" : "＋ 더보기"; more.addEventListener("click", () => { moreOpen = !moreOpen; buildPalette(); }); box.appendChild(more);
  if (moreOpen) {
    const gc2 = group("추가 크림"); CREAMS.filter(c => !BASE_CREAMS.includes(c.key)).forEach(cr => gc2.appendChild(chip(cr.c, mode === "cream" && curCream.key === cr.key, cr.name, () => { mode = "cream"; curCream = cr; buildPalette(); })));
    const gt2 = group("추가 토핑"); TOPPINGS.filter(t => !t.basic).forEach(t => gt2.appendChild(topButton(t.key, t.label, mode === "topping" && curTopping === t.key, () => { mode = "topping"; curTopping = t.key; buildPalette(); })));
    const gw2 = group("글씨 색"); WRITE_COLORS.forEach(w => gw2.appendChild(chip(w.c, mode === "writing" && curWriteColor === w.c, w.name, () => { mode = "writing"; curWriteColor = w.c; buildPalette(); })));
  }
}

/* ---------------- 데코 캔버스 ---------------- */
function sizeCake() {
  cakeCanvas = $("cakeCanvas");
  const r = $("cakeWrap").getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2); W = Math.round(r.width); H = Math.round(r.height);
  cakeCanvas.width = W * dpr; cakeCanvas.height = H * dpr;
  ctx = cakeCanvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineJoin = ctx.lineCap = "round";
  const gm = cakeGeom(W, H); cakeCX = gm.cx; cakeCY = gm.cy; cakeR = gm.r; creamR = Math.max(16, cakeR * 0.13); topScale = cakeR / 90;
  drawCakeBase(ctx, W, H, dpr, curBase.sponge);
}
function resetDeco() { creamStrokes = []; toppings = []; writeStrokes = []; curStroke = null; drawing = false; decoLocked = false; }
function posOf(e) { const r = cakeCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
/* 크림: 짜여 나온 도톰한 느낌 + 팁 모양(기본/별/물결). 케이크 밖에도 발림(클리핑 없음) */
function starPath(g, x, y, ro, ri, n) { g.beginPath(); for (let i = 0; i < 2 * n; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? ri : ro, px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); }
function scallopPath(g, x, y, r, n) { g.beginPath(); for (let i = 0; i < n; i++) { const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI, am = (i + 0.5) / n * 2 * Math.PI; if (i === 0) g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r); g.quadraticCurveTo(x + Math.cos(am) * r * 1.28, y + Math.sin(am) * r * 1.28, x + Math.cos(a1) * r, y + Math.sin(a1) * r); } g.closePath(); }
function creamShape(x, y, color) {
  ctx.fillStyle = color;
  if (curTip === "star") { starPath(ctx, x, y, creamR * 1.15, creamR * 0.55, 5); ctx.fill(); }
  else if (curTip === "wave") { scallopPath(ctx, x, y, creamR * 0.92, 7); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(x, y, creamR, 0, 7); ctx.fill(); }
  ctx.fillStyle = "rgba(255,255,255,.30)"; ctx.beginPath(); ctx.arc(x - creamR * 0.3, y - creamR * 0.3, creamR * 0.4, 0, 7); ctx.fill();  // 도톰 하이라이트
}
function creamBlob(x, y, color) { creamShape(x, y, color); }
function writeShadow(hex) { const n = parseInt(hex.slice(1), 16), lum = (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255; return lum > 0.58 ? "rgba(70,40,20,.9)" : "rgba(255,255,255,.9)"; }

function onDown(e) {
  if (!running || decoLocked) return; e.preventDefault(); const p = posOf(e);
  if (mode === "topping") {                                        // 크기·방향 살짝 랜덤
    const rot = (Math.random() - 0.5) * 0.5, sc = topScale * (0.88 + Math.random() * 0.26);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(rot); drawTopping(ctx, curTopping, 0, 0, sc, Math.floor(p.x + p.y)); ctx.restore();
    toppings.push({ type: curTopping, x: p.x, y: p.y }); return;
  }
  if (mode === "writing") { drawing = true; curStroke = { points: [p] }; writeStrokes.push(curStroke); return; }
  drawing = true; curStroke = { key: curCream.key, color: curCream.c, r: creamR, points: [p] }; creamStrokes.push(curStroke); creamBlob(p.x, p.y, curCream.c);
}
function onMove(e) {
  if (!drawing || decoLocked) return; const p = posOf(e), pts = curStroke.points, last = pts[pts.length - 1]; const d = Math.hypot(p.x - last.x, p.y - last.y);
  if (mode === "writing") {                                        // 짤주머니: 도톰 + 외곽 그림자로 또렷하게, 끊김 없이
    if (d < 1.2) return; pts.push(p);
    ctx.save(); ctx.lineCap = ctx.lineJoin = "round"; ctx.shadowColor = writeShadow(curWriteColor); ctx.shadowBlur = 4;
    ctx.strokeStyle = curWriteColor; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.restore();
    return;
  }
  if (d < creamR * 0.45) return;
  const steps = Math.max(1, Math.floor(d / (creamR * 0.5)));
  for (let s = 1; s <= steps; s++) creamBlob(last.x + (p.x - last.x) * s / steps, last.y + (p.y - last.y) * s / steps, curStroke.color);
  pts.push(p);
}
function onUp() { drawing = false; curStroke = null; }

/* ---------------- 타이머 ---------------- */
function startTimer() { running = true; tStart = performance.now(); requestAnimationFrame(tick); }
function tick(now) {
  if (!running) return; const left = Math.max(0, DURATION - (now - tStart) / 1000);
  $("timerNum").textContent = Math.ceil(left); $("timerFill").style.width = (left / DURATION * 100) + "%"; $("timer").classList.toggle("danger", left <= 5);
  if (left <= 0) { running = false; finish(); return; } requestAnimationFrame(tick);
}

/* ---------------- 채점 (주문 조건 대조 — 까다롭게) ---------------- */
function regionOf(x, y) { const d = Math.hypot(x - cakeCX, y - cakeCY); if (d > cakeR) return "out"; if (d <= cakeR * 0.42) return "center"; if (d >= cakeR * 0.60) return "border"; return "mid"; }
function computeScore() {
  const cell = 14, cols = Math.ceil(W / cell), rows = Math.ceil(H / cell), key = (a, b) => a + "," + b;
  const inCake = (x, y) => Math.hypot(x - cakeCX, y - cakeCY) <= cakeR;
  const cakeSet = new Set();
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) if (inCake(gx * cell + cell / 2, gy * cell + cell / 2)) cakeSet.add(key(gx, gy));
  const totalCake = cakeSet.size || 1;

  const byColor = {}, anySet = new Set(); let creamOut = 0;
  for (const st of creamStrokes) { const set = byColor[st.key] || (byColor[st.key] = new Set());
    for (const p of st.points) { const R = st.r; for (let gy = Math.floor((p.y - R) / cell); gy <= Math.floor((p.y + R) / cell); gy++) for (let gx = Math.floor((p.x - R) / cell); gx <= Math.floor((p.x + R) / cell); gx++) { if (Math.hypot(gx * cell + cell / 2 - p.x, gy * cell + cell / 2 - p.y) > R) continue; const k = key(gx, gy); if (cakeSet.has(k)) { set.add(k); anySet.add(k); } else creamOut++; } } }

  const tByType = {}; let topOut = 0;
  for (const t of toppings) { const reg = regionOf(t.x, t.y); if (reg === "out") { topOut++; continue; } (tByType[t.type] || (tByType[t.type] = [])).push({ x: t.x, y: t.y, reg }); }
  let writingLen = 0; for (const w of writeStrokes) for (let i = 1; i < w.points.length; i++) writingLen += Math.hypot(w.points[i].x - w.points[i - 1].x, w.points[i].y - w.points[i - 1].y);

  const whereMatch = (o, where) => where === "center" ? o.reg === "center" : where === "border" ? o.reg === "border" : where === "lefthalf" ? o.x < cakeCX : where === "righthalf" ? o.x > cakeCX : true;
  const clockPoint = pos => { const a = ((parseInt(pos, 10) % 12) * 30 - 90) * Math.PI / 180, rr = cakeR * 0.72; return { x: cakeCX + Math.cos(a) * rr, y: cakeCY + Math.sin(a) * rr }; };
  const card = curOrder.require.map(cond => {
    let ok = false, got = "";
    if (cond.type === "icing") { const cov = (byColor[cond.color] ? byColor[cond.color].size : 0) / totalCake; ok = cov >= ICING_OK; got = Math.round(cov * 100) + "%"; }
    else if (cond.type === "topping") { let list = tByType[cond.topping] || []; if (cond.where) list = list.filter(o => whereMatch(o, cond.where)); const n = list.length; ok = cond.mode === "exact" ? n === cond.count : n >= cond.count; got = n + "개"; }
    else if (cond.type === "writing") { const present = writingLen > 60; ok = cond.need ? present : !present; got = present ? "씀" : "안 씀"; }
    else if (cond.type === "candle") { const n = (tByType["candle"] || []).length; ok = n === cond.count; got = n + "개"; }
    else if (cond.type === "forbid") { const n = (tByType[cond.topping] || []).length; ok = n === 0; got = n + "개"; }               // 함정: 넣으면 X
    else if (cond.type === "pattern") { const list = tByType[cond.topping] || []; let cov = 0; for (const pos of cond.positions) { const cp = clockPoint(pos); if (list.some(o => Math.hypot(o.x - cp.x, o.y - cp.y) <= cakeR * 0.30)) cov++; } ok = cov === cond.positions.length; got = cov + "/" + cond.positions.length; }
    else if (cond.type === "combo") { const list = tByType[cond.topping] || []; let done = false; for (const o of list) { for (const st of creamStrokes) { for (const p of st.points) { if (Math.hypot(p.x - o.x, p.y - o.y) <= cakeR * 0.16) { done = true; break; } } if (done) break; } if (done) break; } ok = done; got = ok ? "얹음" : "안 얹음"; }
    return { label: cond.label, ok, got };
  });

  const okCount = card.filter(c => c.ok).length;
  const orderScore = card.length ? okCount / card.length : 0;
  const coverage = anySet.size / totalCake;
  const spillRatio = clamp((creamOut + topOut * 6) / (totalCake * 0.55), 0, 1);   // 케이크 밖 흘림
  const finishScore = clamp(coverage * 0.85 - spillRatio * 0.45 + 0.15, 0, 1);    // 흘림 감점 복구(적당히)

  let q = W_ORDER * orderScore + W_FINISH * finishScore;
  q += (Math.random() - 0.5) * 0.08; q = clamp(q, 0, 1);
  const rr = Math.random(); if (rr < 0.05 && q < 0.4) q = Math.random() * 0.05; if (rr > 0.96 && q > 0.65) q = 0.96 + Math.random() * 0.04;
  let stars = Math.round(q * 5 * 2) / 2;
  if (creamStrokes.length === 0 && toppings.length === 0) stars = 0;
  stars = clamp(stars, 0, 5);
  const tier = stars <= 1 ? "t0" : stars <= 2.5 ? "t1" : stars <= 4 ? "t2" : "t3";
  return { stars, tier, card, orderScore };
}

/* ---------------- 손님 캐릭터 (레이어 + 표정, 좌우 대칭 보장) ----------------
 * 부위 기준 좌표(150x150) — 표정이 바뀌어도 고정. pair()로 좌우 미러링해 눈/눈썹이 절대 어긋나지 않음.
 * 표정/손님 추가: EXPR에 표정 한 줄, data.js CUSTOMER_LOOKS에 손님 look 한 줄이면 됨. */
const F = { cx: 75, cy: 60, r: 43, ey: 62, ex: 18, by: 45, my: 88 };
const DEFAULT_LOOK = { face: "round", skin: "#FBE0C8", hair: "short", hairColor: "#3A2E26", cloth: "#3FB57A" };
function lookOf() { return (window.CUSTOMER_LOOKS && window.CUSTOMER_LOOKS[curOrder.customer]) || DEFAULT_LOOK; }
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); return "rgb(" + Math.round(((n >> 16) & 255) * f) + "," + Math.round(((n >> 8) & 255) * f) + "," + Math.round((n & 255) * f) + ")"; }
/* 좌우 대칭 렌더: draw()는 '왼쪽 것'만 그리면 오른쪽은 자동 미러 → 항상 대칭·정렬 */
function pair(g, offX, y, draw) { g.save(); g.translate(F.cx - offX, y); draw(g); g.restore(); g.save(); g.translate(F.cx + offX, y); g.scale(-1, 1); draw(g); g.restore(); }
function roundRectPath(g, x, y, w, h, r) { if (g.roundRect) g.roundRect(x, y, w, h, r); else { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); } }

const EXPR = {
  happy:        { brow: "raised", eye: "sparkle", mouth: "bigSmile", blush: true },   // 감동
  satisfied:    { brow: "flat",   eye: "squint",  mouth: "smile",    blush: true },   // 만족
  neutral:      { brow: "flat",   eye: "round",   mouth: "straight" },                // 무표정
  awkward:      { brow: "sad",    eye: "round",   mouth: "squiggle", sweat: true },   // 애매
  disappointed: { brow: "sad",    eye: "glare",   mouth: "frown" },                   // 실망
  shock:        { brow: "high",   eye: "big",     mouth: "openO" },                   // 충격
  angry:        { brow: "angry",  eye: "angry",   mouth: "gritted" },                 // 분노
  disgust:      { brow: "angry",  eye: "x",       mouth: "tongue" },                  // 역겨움(뱉기)
};

function drawCustomer(g, look, exprName, chewT) {
  g.clearRect(0, 0, 150, 150); g.lineJoin = g.lineCap = "round";
  const skin = look.skin, hairC = look.hairColor, ink = "#141414";
  g.fillStyle = look.cloth; g.strokeStyle = ink; g.lineWidth = 3;                     // 옷/어깨
  g.beginPath(); g.moveTo(16, 150); g.quadraticCurveTo(20, 122, 52, 118); g.lineTo(98, 118); g.quadraticCurveTo(130, 122, 134, 150); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = shade(look.cloth, 0.7); g.lineWidth = 2; g.beginPath(); g.moveTo(60, 120); g.lineTo(75, 132); g.lineTo(90, 120); g.stroke();
  g.fillStyle = skin; g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.rect(67, 96, 16, 22); g.fill();  // 목
  hairBack(g, look, hairC);
  g.fillStyle = skin; g.strokeStyle = ink; g.lineWidth = 3;                            // 귀(대칭)
  g.beginPath(); g.arc(F.cx - F.r + 2, F.cy + 4, 8, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.arc(F.cx + F.r - 2, F.cy + 4, 8, 0, 7); g.fill(); g.stroke();
  g.beginPath();                                                                       // 얼굴형
  if (look.face === "square") roundRectPath(g, F.cx - F.r, F.cy - F.r + 2, F.r * 2, F.r * 2 - 2, 22);
  else g.ellipse(F.cx, F.cy, F.r, F.r + 3, 0, 0, 7);
  g.fill(); g.stroke();
  const e = EXPR[exprName] || EXPR.neutral, chew = exprName === "chew";
  if (e.blush && !chew) { g.fillStyle = "#FF9EB6"; pair(g, 30, F.cy + 12, gg => { gg.beginPath(); gg.ellipse(0, 0, 8, 5, 0, 0, 7); gg.fill(); }); }
  drawBrows(g, chew ? "flat" : e.brow);
  drawEyes(g, chew ? "round" : e.eye);
  drawMouth(g, chew ? "chew" : e.mouth, chewT);
  if (e.sweat && !chew) { g.fillStyle = "#7EC7F0"; g.beginPath(); g.moveTo(F.cx + F.r - 6, F.cy - 6); g.quadraticCurveTo(F.cx + F.r, F.cy + 8, F.cx + F.r - 6, F.cy + 12); g.quadraticCurveTo(F.cx + F.r - 12, F.cy + 8, F.cx + F.r - 6, F.cy - 6); g.fill(); }
  hairFront(g, look, hairC);
}

function drawBrows(g, kind) {
  g.strokeStyle = "#3a2a22"; g.lineWidth = 4;
  pair(g, F.ex, F.by, gg => { gg.beginPath();
    if (kind === "raised") { gg.arc(0, 4, 7, Math.PI, 2 * Math.PI); gg.stroke(); }
    else if (kind === "high") { gg.arc(0, 6, 8, Math.PI, 2 * Math.PI); gg.stroke(); }
    else if (kind === "flat") { gg.moveTo(-8, 0); gg.lineTo(7, -1); gg.stroke(); }
    else if (kind === "angry") { gg.moveTo(-9, -4); gg.lineTo(6, 4); gg.stroke(); }    // 안쪽이 아래로 (\ /)
    else if (kind === "sad") { gg.moveTo(-9, 3); gg.lineTo(6, -4); gg.stroke(); }       // 안쪽이 위로 (/ \)
  });
}
function drawEyes(g, kind) {
  const ink = "#141414";
  pair(g, F.ex, F.ey, gg => { gg.lineCap = "round";
    if (kind === "round") { gg.fillStyle = "#fff"; gg.strokeStyle = ink; gg.lineWidth = 2; gg.beginPath(); gg.ellipse(0, 0, 6, 8, 0, 0, 7); gg.fill(); gg.stroke(); gg.fillStyle = ink; gg.beginPath(); gg.arc(0, 1, 3.4, 0, 7); gg.fill(); }
    else if (kind === "big") { gg.fillStyle = "#fff"; gg.strokeStyle = ink; gg.lineWidth = 2; gg.beginPath(); gg.arc(0, 0, 9, 0, 7); gg.fill(); gg.stroke(); gg.fillStyle = ink; gg.beginPath(); gg.arc(0, 1, 4, 0, 7); gg.fill(); gg.fillStyle = "#fff"; gg.beginPath(); gg.arc(-2, -2, 1.4, 0, 7); gg.fill(); }
    else if (kind === "sparkle") { gg.fillStyle = "#fff"; gg.strokeStyle = ink; gg.lineWidth = 2; gg.beginPath(); gg.ellipse(0, 0, 7, 9, 0, 0, 7); gg.fill(); gg.stroke(); gg.fillStyle = "#3a2a55"; gg.beginPath(); gg.arc(0, 1, 5, 0, 7); gg.fill(); gg.fillStyle = "#fff"; gg.beginPath(); gg.arc(-2, -2, 2.2, 0, 7); gg.fill(); gg.beginPath(); gg.arc(2, 3, 1, 0, 7); gg.fill(); }
    else if (kind === "squint") { gg.strokeStyle = ink; gg.lineWidth = 4; gg.beginPath(); gg.arc(0, -1, 6, 0.15 * Math.PI, 0.85 * Math.PI); gg.stroke(); }
    else if (kind === "glare") { gg.fillStyle = "#fff"; gg.strokeStyle = ink; gg.lineWidth = 2; gg.beginPath(); gg.ellipse(0, 1, 6, 4, 0, 0, 7); gg.fill(); gg.stroke(); gg.fillStyle = ink; gg.beginPath(); gg.arc(0, 2, 2.6, 0, 7); gg.fill(); gg.strokeStyle = ink; gg.lineWidth = 3; gg.beginPath(); gg.moveTo(-7, -3); gg.lineTo(7, -4); gg.stroke(); }
    else if (kind === "angry") { gg.fillStyle = ink; gg.beginPath(); gg.moveTo(-7, -3); gg.lineTo(7, 1); gg.lineTo(6, 4); gg.lineTo(-7, 2); gg.closePath(); gg.fill(); }
    else if (kind === "x") { gg.strokeStyle = ink; gg.lineWidth = 4; gg.beginPath(); gg.moveTo(-5, -5); gg.lineTo(5, 5); gg.moveTo(5, -5); gg.lineTo(-5, 5); gg.stroke(); }
    else if (kind === "teary") { gg.fillStyle = "#fff"; gg.strokeStyle = ink; gg.lineWidth = 2; gg.beginPath(); gg.ellipse(0, 0, 6, 8, 0, 0, 7); gg.fill(); gg.stroke(); gg.fillStyle = ink; gg.beginPath(); gg.arc(0, 1, 3.2, 0, 7); gg.fill(); gg.fillStyle = "#8FD3F4"; gg.beginPath(); gg.ellipse(0, 12, 3, 5, 0, 0, 7); gg.fill(); }
  });
}
function drawMouth(g, kind, chewT) {
  const ink = "#141414"; g.save(); g.translate(F.cx, F.my); g.strokeStyle = ink; g.lineWidth = 4; g.lineCap = "round";
  if (kind === "bigSmile") { g.fillStyle = "#a33"; g.beginPath(); g.arc(0, -2, 15, 0.1 * Math.PI, 0.9 * Math.PI); g.arc(0, -2, 7, 0.9 * Math.PI, 0.1 * Math.PI, true); g.closePath(); g.fill(); g.lineWidth = 3; g.beginPath(); g.arc(0, -2, 15, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); }
  else if (kind === "smile") { g.beginPath(); g.arc(0, -3, 11, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
  else if (kind === "straight") { g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.stroke(); }
  else if (kind === "squiggle") { g.beginPath(); g.moveTo(-11, 0); g.quadraticCurveTo(-5.5, -6, 0, 0); g.quadraticCurveTo(5.5, 6, 11, 0); g.stroke(); }
  else if (kind === "frown") { g.beginPath(); g.arc(0, 8, 11, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); }
  else if (kind === "openO") { g.fillStyle = "#7a2b2b"; g.beginPath(); g.ellipse(0, 0, 8, 11, 0, 0, 7); g.fill(); g.lineWidth = 3; g.stroke(); }
  else if (kind === "gritted") { g.fillStyle = "#7a2b2b"; g.beginPath(); roundRectPath(g, -13, -6, 26, 12, 4); g.fill(); g.lineWidth = 2; g.stroke(); g.fillStyle = "#fff"; g.beginPath(); roundRectPath(g, -13, -6, 26, 5, 2); g.fill(); g.strokeStyle = "rgba(0,0,0,.3)"; g.lineWidth = 1.2; for (let x = -8; x <= 8; x += 5) { g.beginPath(); g.moveTo(x, -6); g.lineTo(x, 6); g.stroke(); } }
  else if (kind === "tongue") { g.fillStyle = "#7a2b2b"; g.beginPath(); g.ellipse(0, 2, 15, 13, 0, 0, 7); g.fill(); g.lineWidth = 3; g.stroke(); g.fillStyle = "#E06666"; g.strokeStyle = "#c04a52"; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 12, 8, 7, 0, 0, 7); g.fill(); g.stroke(); }
  else if (kind === "chew") { const o = 4 + Math.abs(Math.sin((chewT || 0) * Math.PI * 9)) * 10; g.fillStyle = "#7a2b2b"; g.beginPath(); g.ellipse(0, 4, 11, o, 0, 0, 7); g.fill(); }
  g.restore();
}
/* 머리: 전부 얼굴 기준 F(중심·반지름)로 상대 배치 → 얼굴에 정확히 얹힘 */
function hairBack(g, look, c) {
  g.fillStyle = c; g.strokeStyle = "#141414"; g.lineWidth = 3; const topY = F.cy - (F.r + 3);
  if (look.hair === "long") {
    g.beginPath(); g.moveTo(F.cx - F.r + 1, F.cy - 6);
    g.quadraticCurveTo(F.cx - F.r - 10, F.cy + 28, F.cx - F.r - 3, F.cy + 62);
    g.quadraticCurveTo(F.cx - F.r + 8, F.cy + 70, F.cx, F.cy + 70);
    g.quadraticCurveTo(F.cx + F.r - 8, F.cy + 70, F.cx + F.r + 3, F.cy + 62);
    g.quadraticCurveTo(F.cx + F.r + 10, F.cy + 28, F.cx + F.r - 1, F.cy - 6);
    g.quadraticCurveTo(F.cx, topY - 2, F.cx - F.r + 1, F.cy - 6);
    g.closePath(); g.fill(); g.stroke();
  } else if (look.hair === "bob") {
    g.beginPath(); g.moveTo(F.cx - F.r + 1, F.cy - 6);
    g.quadraticCurveTo(F.cx - F.r - 7, F.cy + 18, F.cx - F.r + 2, F.cy + 32); g.lineTo(F.cx + F.r - 2, F.cy + 32);
    g.quadraticCurveTo(F.cx + F.r + 7, F.cy + 18, F.cx + F.r - 1, F.cy - 6);
    g.quadraticCurveTo(F.cx, topY - 2, F.cx - F.r + 1, F.cy - 6);
    g.closePath(); g.fill(); g.stroke();
  } else if (look.hair === "ponytail") {
    g.beginPath(); g.moveTo(F.cx + F.r - 4, F.cy - 2);
    g.quadraticCurveTo(F.cx + F.r + 22, F.cy + 22, F.cx + F.r + 10, F.cy + 50);
    g.quadraticCurveTo(F.cx + F.r + 2, F.cy + 34, F.cx + F.r - 8, F.cy + 14);
    g.closePath(); g.fill(); g.stroke();
  }
}
function hairFront(g, look, c) {
  if (look.hair === "bald") return;
  const topY = F.cy - (F.r + 3), hl = F.cy - F.r * 0.40;   // hl: 이마 위 헤어라인(눈썹보다 위)
  g.fillStyle = c; g.strokeStyle = "#141414"; g.lineWidth = 3;
  // 공통 베이스: 머리 위를 감싸는 캡 + 가운데가 내려온 앞머리 (얼굴 폭에 맞춤)
  g.beginPath();
  g.moveTo(F.cx - F.r - 1, F.cy - 2);
  g.quadraticCurveTo(F.cx - F.r - 2, topY - 3, F.cx, topY - 6);
  g.quadraticCurveTo(F.cx + F.r + 2, topY - 3, F.cx + F.r + 1, F.cy - 2);
  g.quadraticCurveTo(F.cx + F.r * 0.62, hl + 4, F.cx + F.r * 0.22, hl + 1);
  g.quadraticCurveTo(F.cx, hl - 9, F.cx - F.r * 0.22, hl + 1);
  g.quadraticCurveTo(F.cx - F.r * 0.62, hl + 4, F.cx - F.r - 1, F.cy - 2);
  g.closePath(); g.fill(); g.stroke();
  if (look.hair === "spiky") {   // 위로 삐친 스파이크
    g.beginPath(); const n = 6, span = F.r * 1.7, x0 = F.cx - span / 2, dx = span / (n - 1);
    for (let i = 0; i < n; i++) { const x = x0 + dx * i; g.moveTo(x - 8, topY + 8); g.lineTo(x, topY - 12); g.lineTo(x + 8, topY + 8); g.closePath(); }
    g.fill(); g.stroke();
  } else if (look.hair === "curly") {   // 곱슬 클러스터 (머리 윤곽 따라)
    g.beginPath(); for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI, x = F.cx + Math.cos(a) * (F.r - 1), y = F.cy + Math.sin(a) * (F.r + 1); g.moveTo(x + 10, y); g.arc(x, y, 10, 0, 7); }
    g.fill(); g.stroke();
  } else if (look.hair === "bun") {   // 정수리 번
    g.beginPath(); g.arc(F.cx, topY - 5, 13, 0, 7); g.fill(); g.stroke();
  }
}

function exprForTier(tier) { return tier === "t3" ? "happy" : tier === "t2" ? "satisfied" : tier === "t1" ? "disappointed" : "angry"; }
function exprForMotion(m) { return m === "yum" ? "happy" : m === "meh" ? "awkward" : m === "spit" ? "disgust" : "disappointed"; }
function drawChew(g, t) { drawCustomer(g, lookOf(), "chew", t); }
function drawFace(tier) { drawCustomer($("custFace").getContext("2d"), lookOf(), exprForTier(tier)); }

/* ---------------- 시식 연출 (구간별 모션 → 말풍선 → 평가 → 도장 → 개그) ---------------- */
let rateTimer = null, fxCanvas = null, fxCtx = null, fxParts = [], fxRunning = false;
function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

function sizeFx() {
  fxCanvas = $("fxCanvas"); const r = $("app").getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
  fxCanvas.width = r.width * d; fxCanvas.height = r.height * d; fxCtx = fxCanvas.getContext("2d");
  fxCtx.setTransform(1, 0, 0, 1, 0, 0); fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
}
function resetResultUI() {
  $("verdictReveal").classList.remove("show");
  $("starsFill").style.width = "0px"; $("ratingNum").textContent = "0.0";
  $("bubble").classList.remove("show"); $("stamp").classList.remove("show");
  $("reviewPopup").classList.remove("show"); $("subGag").classList.remove("show");
  $("custFace").className = ""; $("resultCake").classList.remove("push");
  if (fxCtx) { fxCtx.setTransform(1, 0, 0, 1, 0, 0); fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height); }
}

function finish() {
  decoLocked = true;
  const snapshot = cakeCanvas.toDataURL("image/png");
  const res = computeScore();
  showScreen("resultScreen");
  resetResultUI(); sizeFx();
  $("cakeShowCap").textContent = "손님이 시식 중...";
  loadResultCake(snapshot, (img, geom) => eatMotion(res, img, geom, () => afterEat(res)));
}

function loadResultCake(snapshot, cb) {
  const rc = $("resultCake"), rr = rc.parentElement.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.round(rr.width - 32), ch = Math.round(rr.height - 56);
  rc.width = cw * d; rc.height = ch * d; rc.getContext("2d").setTransform(d, 0, 0, d, 0, 0);
  const img = new Image();
  img.onload = () => { const scale = Math.min(cw / img.width, ch / img.height), iw = img.width * scale, ih = img.height * scale, ix = (cw - iw) / 2, iy = (ch - ih) / 2, cx = ix + iw / 2, cy = iy + ih / 2, cr = Math.min(iw, ih) * 0.36;
    cb(img, { d, ix, iy, iw, ih, bx: cx + cr * 0.5, by: cy - cr * 0.45, biteMax: cr * 0.6 }); };
  img.onerror = () => cb(null, { d, ix: 0, iy: 0, iw: cw, ih: ch, bx: cw / 2, by: ch / 2, biteMax: 40 });
  img.src = snapshot;
}

/* 별점 구간 → 시식 모션 종류 */
function motionOf(stars) { return stars <= 0.5 ? "refuse" : stars <= 1.5 ? "spit" : stars <= 3.5 ? "meh" : "yum"; }
function eatMotion(res, img, geom, done) {
  const motion = motionOf(res.stars);
  const rc = $("resultCake"), g = rc.getContext("2d"), fg = $("custFace").getContext("2d"), face = $("custFace");
  const { d, ix, iy, iw, ih, bx, by, biteMax } = geom;
  const start = performance.now(), A = 700, B = motion === "refuse" ? 1000 : 1400;
  let reacted = false;
  if (motion === "spit" && res.stars <= 1) restart(rc, "push");     // 반품(접시 밀기)
  (function frame(now) {
    const el = now - start;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, rc.width, rc.height); g.setTransform(d, 0, 0, d, 0, 0);
    if (img) g.drawImage(img, ix, iy, iw, ih);
    if (motion !== "refuse") { const bp = clamp((el - 250) / 500, 0, 1); if (bp > 0) { g.save(); g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000"; g.beginPath(); g.arc(bx, by, biteMax * bp, 0, 7); g.fill(); g.restore(); } }
    if (motion !== "refuse" && el < A) drawChew(fg, el / 300);
    else if (!reacted) { reacted = true; reactFace(fg, motion); applyMotion(face, motion); if (motion === "spit") spawnSpit(); }
    if (el < A + B) requestAnimationFrame(frame); else done();
  })(start);
}
function applyMotion(face, motion) { face.className = motion === "yum" ? "nod" : motion === "meh" ? "tilt" : motion === "spit" ? "shakeit" : "shakeno"; }
function reactFace(g, motion) {
  drawCustomer(g, lookOf(), exprForMotion(motion));
  if (motion === "refuse") {   // 냅킨으로 입 가림
    g.fillStyle = "#FFFFFF"; g.strokeStyle = "#c9c2b2"; g.lineWidth = 2;
    g.beginPath(); roundRectPath(g, F.cx - 24, F.my - 8, 48, 28, 6); g.fill(); g.stroke();
  }
}
function spawnSpit() {
  const ar = $("app").getBoundingClientRect(), fr = $("custFace").getBoundingClientRect();
  const mx = fr.left - ar.left + fr.width * 0.5, my = fr.top - ar.top + fr.height * 0.66;
  const cols = ["#E7C39A", "#7A5230", "#FFF7F0", "#E5384E"]; fxParts = [];
  for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, sp = 3 + Math.random() * 5; fxParts.push({ x: mx, y: my, vx: Math.cos(a) * sp * 1.2, vy: Math.sin(a) * sp - 2, r: 3 + Math.random() * 4, c: cols[i % cols.length], life: 1 }); }
  if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxTick); }
}
function fxTick() {
  const d = Math.min(window.devicePixelRatio || 1, 2);
  fxCtx.setTransform(1, 0, 0, 1, 0, 0); fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height); fxCtx.setTransform(d, 0, 0, d, 0, 0);
  let alive = 0;
  for (const p of fxParts) { if (p.life <= 0) continue; alive++; p.vy += 0.4; p.x += p.vx; p.y += p.vy; p.life -= 0.02; fxCtx.globalAlpha = Math.max(0, p.life); fxCtx.fillStyle = p.c; fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.r, 0, 7); fxCtx.fill(); }
  fxCtx.globalAlpha = 1;
  if (alive > 0) requestAnimationFrame(fxTick); else fxRunning = false;
}

function afterEat(res) {
  $("cakeShowCap").textContent = "손님의 평가";
  showBubble(res.tier);                                       // 1) 말풍선 한마디
  setTimeout(() => revealVerdict(res), 950);                  // 2) 별점/표정/채점표/한줄평
  setTimeout(() => { dropStamp(res.tier); shakeScreen(); }, 1550); // 3) 등급 도장 쾅
  setTimeout(() => maybeGag(res), 2200);                      // 4) (가끔) 추가 개그
}
function showBubble(tier) { $("bubbleText").textContent = pick((window.BUBBLE_LINES || {})[tier] || ["..."]); restart($("bubble"), "show"); }
function revealVerdict(res) {
  drawFace(res.tier); renderScoreCard(res.card); $("verdictReveal").classList.add("show");
  requestAnimationFrame(() => requestAnimationFrame(() => { $("starsFill").style.width = starClipWidth(res.stars) + "px"; }));
  let n = 0; clearInterval(rateTimer); rateTimer = setInterval(() => { n += 0.5; if (n >= res.stars) { n = res.stars; clearInterval(rateTimer); } $("ratingNum").textContent = n.toFixed(1); }, 60);
  let comment = pick(COMMENTS[res.tier] || COMMENTS.t0);
  if (res.stars <= 2.5 && res.orderScore < 1 && COMMENTS.nag && Math.random() < 0.6) comment += " " + pick(COMMENTS.nag);
  $("resultComment").textContent = comment;
}
function dropStamp(tier) { $("stampText").textContent = pick((window.STAMP_TEXTS || {})[tier] || ["평가"]); restart($("stamp"), "show"); }
function shakeScreen() { const a = $("app"); restart(a, "shake"); setTimeout(() => a.classList.remove("shake"), 520); }
function maybeGag(res) {
  if (res.stars > 1 || Math.random() > 0.6) return;           // 최악 등급일 때만, 확률로
  if (Math.random() < 0.5) restart($("reviewPopup"), "show"); else restart($("subGag"), "show");
}
/* 별 채움 클립 너비(px). STAR/GAP 은 style.css의 .stars-row i(48px) / gap(8px)와 일치해야 함 */
function starClipWidth(stars) {
  const STAR = 48, GAP = 8, n = Math.floor(stars), f = stars - n;
  if (f > 0) return n * STAR + n * GAP + f * STAR;   // n개 꽉 + 사이 간격 + 다음 별의 f 비율
  return n > 0 ? n * STAR + (n - 1) * GAP : 0;        // 정수: n번째 별 오른쪽 끝
}
function renderScoreCard(card) {
  const box = $("scoreCard"); box.innerHTML = "";
  card.forEach(item => {
    const row = document.createElement("div"); row.className = "sc-row";
    row.innerHTML = '<span class="sc-badge ' + (item.ok ? "o" : "x") + '">' + (item.ok ? "O" : "X") + '</span>'
      + '<span class="sc-label"></span><span class="sc-got"></span>';
    row.querySelector(".sc-label").textContent = item.label;
    row.querySelector(".sc-got").textContent = item.ok ? "" : "(" + item.got + ")";
    box.appendChild(row);
  });
}

/* ---------------- 주문 / 마스코트 / 시작화면 ---------------- */
function chooseOrder() {
  curOrder = pick(ORDERS);
  curBase = CAKE_BASES.find(b => b.key === curOrder.base) || CAKE_BASES[0];
  $("orderCustomer").textContent = curOrder.customer;
  $("orderBaseName").textContent = curBase.name;
  const ul = $("orderList"); ul.innerHTML = "";
  curOrder.require.forEach(r => { const li = document.createElement("li"); li.textContent = r.label; ul.appendChild(li); });
  $("decoOrder").innerHTML = "<b>" + curOrder.customer + "</b> · " + curOrder.require.map(r => r.label).join(" / ");
}
function sizeStartCake() {
  const c = $("startCake"), r = c.parentElement.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.round(r.width - 28), ch = Math.round(r.height - 28);
  c.width = cw * d; c.height = ch * d; drawCakeBase(c.getContext("2d"), cw, ch, d, curBase.sponge);
}
function drawMascot() {
  const g = $("mascot").getContext("2d"); g.clearRect(0, 0, 120, 120);
  // 컵케이크 몸통
  g.fillStyle = "#E7A24C"; g.strokeStyle = "#141414"; g.lineWidth = 3; g.beginPath(); g.moveTo(34, 70); g.lineTo(86, 70); g.lineTo(80, 108); g.lineTo(40, 108); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 2; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(60 + i * 16, 70); g.lineTo(60 + i * 12, 108); g.stroke(); }
  // 크림
  g.fillStyle = "#FF9EC0"; g.strokeStyle = "#141414"; g.lineWidth = 3; g.beginPath(); g.moveTo(30, 70); g.quadraticCurveTo(34, 40, 60, 42); g.quadraticCurveTo(86, 40, 90, 70); g.closePath(); g.fill(); g.stroke();
  // 얼굴
  g.fillStyle = "#141414"; g.beginPath(); g.arc(52, 84, 3.5, 0, 7); g.fill(); g.beginPath(); g.arc(68, 84, 3.5, 0, 7); g.fill();
  g.strokeStyle = "#141414"; g.lineWidth = 3; g.beginPath(); g.arc(60, 90, 7, .1 * Math.PI, .9 * Math.PI); g.stroke();
  // 체리
  g.fillStyle = "#E5384E"; g.strokeStyle = "#141414"; g.beginPath(); g.arc(60, 36, 6, 0, 7); g.fill(); g.stroke();
}

/* ---------------- 이벤트 ---------------- */
$("startBtn").addEventListener("click", () => { showScreen("decoScreen"); requestAnimationFrame(() => { sizeCake(); resetDeco(); startTimer(); }); });
$("finishBtn").addEventListener("click", () => { if (running) { running = false; finish(); } });
$("againBtn").addEventListener("click", () => { chooseOrder(); showScreen("startScreen"); requestAnimationFrame(sizeStartCake); });
$("saveBtn").addEventListener("click", () => { const rc = $("resultCake"); const a = document.createElement("a"); a.href = rc.toDataURL("image/png"); a.download = "ccojik_cake.png"; document.body.appendChild(a); a.click(); a.remove(); });

document.addEventListener("pointerdown", e => { if (e.target && e.target.id === "cakeCanvas") onDown(e); });
window.addEventListener("pointermove", onMove);
window.addEventListener("pointerup", onUp);
window.addEventListener("pointercancel", onUp);

buildPalette();
chooseOrder();
drawMascot();
requestAnimationFrame(sizeStartCake);
