"use strict";
/* ===== 꼬직 · 특징만 보고 그리기 (bare vanilla, 라우팅 라이브러리 없음) ===== */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const PROBLEMS = window.PROBLEMS || [];
const COMMENTS = window.RESULT_COMMENTS || { low: ["새로운 예술이네요"], mid: ["반쯤 왔어요"], high: ["오 비슷한데요"] };

/* ---------------- 상태 ---------------- */
let problem = null;      // 현재 문제
let revealed = 0;        // 공개된 힌트 수

/* 캔버스 */
let canvas, ctx, W = 0, H = 0, dpr = 1;
let strokes = [], curStroke = null, drawing = false;

/* ---------------- 팔레트 / 브러시 상태 (그리기 로직과 분리) ---------------- */
const PAPER = "#FFFDF6";   // 배경색 = 지우개 색
const COLORS = ["#141414", "#FFFFFF", "#EE4A34", "#FF8A1E", "#FFC61A", "#35B94E",
                "#2A5CE6", "#2AAEE6", "#8E5BD6", "#FF74A8", "#8A5A2B", "#9AA0A8"];
const SIZES = [5, 10, 18];         // 얇게 / 보통 / 굵게
let curColor = "#141414";
let curWidth = SIZES[1];
let eraserOn = false;

function buildSwatches() {
  const box = $("swatches"); box.innerHTML = "";
  COLORS.forEach(c => {
    const el = document.createElement("div");
    el.className = "swatch" + (!eraserOn && c === curColor ? " on" : "");
    el.style.background = c;
    el.addEventListener("click", () => selectColor(c));
    box.appendChild(el);
  });
}
function refreshSwatchSel() {
  const kids = $("swatches").children;
  for (let i = 0; i < kids.length; i++) kids[i].classList.toggle("on", !eraserOn && COLORS[i] === curColor);
}
function selectColor(c) { curColor = c; eraserOn = false; $("eraserBtn").classList.remove("on"); refreshSwatchSel(); }
function setEraser() { eraserOn = true; curColor = PAPER; $("eraserBtn").classList.add("on"); refreshSwatchSel(); }
function setSize(i) {
  curWidth = SIZES[i];
  const kids = $("brushes").children;
  for (let j = 0; j < kids.length; j++) kids[j].classList.toggle("on", j === i);
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
}

/* ---------------- (1) 문제 뽑기 ---------------- */
function pickProblem() {
  problem = pick(PROBLEMS);
  revealed = 1;                       // 첫 힌트 1개만 공개
  showScreen("drawScreen");
  renderHints();
  requestAnimationFrame(() => { sizeCanvas(); clearCanvas(); });
}

/* ---------------- (2) 힌트 ---------------- */
function renderHints() {
  const list = $("hintList"); list.innerHTML = "";
  for (let i = 0; i < revealed; i++) {
    const el = document.createElement("div");
    el.className = "hint-item";
    el.innerHTML = '<div class="hint-num">' + (i + 1) + '</div><div class="hint-text"></div>';
    el.querySelector(".hint-text").textContent = problem.hints[i];
    list.appendChild(el);
  }
  $("hintCounter").textContent = revealed + " / " + problem.hints.length;
  $("moreHintBtn").disabled = revealed >= problem.hints.length;
}
function moreHint() {
  if (revealed >= problem.hints.length) return;
  revealed++;
  renderHints();
  $("hintList").scrollTop = $("hintList").scrollHeight;
}

/* ---------------- 캔버스 그리기 ---------------- */
function sizeCanvas() {
  const r = $("canvasWrap").getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.round(r.width); H = Math.round(r.height);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineJoin = ctx.lineCap = "round";
  redraw();
}
function paintBg() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#FFFDF6"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function traceStroke(pts) {
  if (pts.length < 1) return;
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); return; }
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.stroke();
}
function redraw() {
  paintBg();
  for (const st of strokes) { ctx.strokeStyle = st.color; ctx.lineWidth = st.width; traceStroke(st.points); }
}
function posOf(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

function onDown(e) {
  if (!$("drawScreen").classList.contains("active")) return;
  e.preventDefault();
  const p = posOf(e);
  drawing = true; curStroke = { color: curColor, width: curWidth, points: [p] }; strokes.push(curStroke);
  ctx.strokeStyle = curColor; ctx.lineWidth = curWidth; ctx.fillStyle = curColor;
  ctx.beginPath(); ctx.moveTo(p.x, p.y);
  updateSubmit();
}
function onMove(e) {
  if (!drawing) return;
  const p = posOf(e); const pts = curStroke.points; const last = pts[pts.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) < 1.4) return;
  pts.push(p); ctx.lineTo(p.x, p.y); ctx.stroke();
}
function onUp() { if (!drawing) return; drawing = false; curStroke = null; }

function updateSubmit() { $("submitBtn").disabled = strokes.length < 1; }
function clearCanvas() { strokes = []; curStroke = null; drawing = false; redraw(); updateSubmit(); }
function undo() { strokes.pop(); redraw(); updateSubmit(); }

/* ---------------- 연출용 일치율 (실제 인식 아님) ---------------- */
function coverageEstimate() {
  if (!strokes.length) return 0;
  const cell = 16, cols = Math.max(1, Math.ceil(W / cell)), rows = Math.max(1, Math.ceil(H / cell));
  const set = new Set();
  for (const st of strokes) { const pts = st.points; for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.floor(d / (cell / 2)));
      for (let s = 0; s <= steps; s++) set.add(Math.floor((a.x + dx * s / steps) / cell) + "," + Math.floor((a.y + dy * s / steps) / cell));
    } else set.add(Math.floor(pts[i].x / cell) + "," + Math.floor(pts[i].y / cell));
  } }
  return clamp(set.size / (cols * rows), 0, 1);
}
/* 연출용 일치율: 0~99 넓은 범위 + 가끔 극단값(0%대 / 90%대) */
function fakeMatch() {
  const cov = coverageEstimate();
  const r = Math.random();
  if (r < 0.13) return Math.floor(Math.random() * 6);           // 0~5 처참
  if (r > 0.89) return 93 + Math.floor(Math.random() * 7);       // 93~99 우연의 명중
  let m = Math.random() * 100 * 0.8 + cov * 100 * 0.2;           // 나머지는 넓게 + 노력 약간 반영
  return clamp(Math.round(m), 0, 99);
}

/* ---------------- (3) 제출 → 스캔(두구두구) → 정답 팝 ---------------- */
const SCAN_MSGS = ["판독 중...", "정답과 대조 중...", "민망함 계산 중...", "두구두구두구..."];
let scanTimer = null, matchTimer = null;
function submit() {
  if (strokes.length < 1) return;
  const snapshot = canvas.toDataURL("image/png");   // 제출 순간의 내 그림 저장
  const overlay = $("scanOverlay"), textEl = $("scanText");
  overlay.classList.add("show");
  let i = 0; textEl.textContent = SCAN_MSGS[0];
  clearInterval(scanTimer);
  scanTimer = setInterval(() => { i = (i + 1) % SCAN_MSGS.length; textEl.textContent = SCAN_MSGS[i]; }, 400);
  setTimeout(() => {
    clearInterval(scanTimer); overlay.classList.remove("show");
    renderResult(snapshot);
    showScreen("resultScreen");
  }, 1500);
}
function renderResult(snapshot) {
  // 정답 팝 등장
  const nameEl = $("answerName");
  nameEl.textContent = problem.answer;
  nameEl.classList.remove("pop"); void nameEl.offsetWidth; nameEl.classList.add("pop");

  $("drawingImg").src = snapshot;
  $("resultComment").textContent = "";

  // 일치율 게이지 (차오르는 애니메이션 + 숫자 카운트업)
  const m = fakeMatch();
  const tier = m <= 20 ? "low" : m <= 70 ? "mid" : "high";               // 코멘트/색 구간
  const color = tier === "high" ? "#35B94E" : tier === "mid" ? "#FFB800" : "#EE4A34";
  const fill = $("matchFill");
  fill.style.width = "0%"; fill.style.background = color;
  $("matchVal").textContent = "0%";

  // 정답 팝(0.55s) 뒤에 게이지·코멘트 등장
  setTimeout(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = m + "%"; }));
    let n = 0; const step = Math.max(1, Math.round(m / 20));
    clearInterval(matchTimer);
    matchTimer = setInterval(() => { n += step; if (n >= m) { n = m; clearInterval(matchTimer); } $("matchVal").textContent = n + "%"; }, 34);
    $("resultComment").textContent = pick(COMMENTS[tier] || COMMENTS.low);
  }, 550);
}

/* ---------------- 내 그림 저장 (선택) ---------------- */
function saveDrawing() {
  const src = $("drawingImg").src; if (!src) return;
  const a = document.createElement("a");
  a.href = src; a.download = "ccojik_hint_draw.png";
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------------- 이벤트 ---------------- */
$("pickBtn").addEventListener("click", pickProblem);
$("moreHintBtn").addEventListener("click", moreHint);
$("undoBtn").addEventListener("click", undo);
$("clearBtn").addEventListener("click", clearCanvas);
$("eraserBtn").addEventListener("click", setEraser);
$("brushes").addEventListener("click", e => { const b = e.target.closest(".brush"); if (b) setSize(+b.dataset.size); });
buildSwatches();
$("submitBtn").addEventListener("click", submit);
$("againBtn").addEventListener("click", () => showScreen("startScreen"));
$("saveBtn").addEventListener("click", saveDrawing);

canvas = $("canvas");
canvas.addEventListener("pointerdown", onDown);
window.addEventListener("pointermove", onMove);
window.addEventListener("pointerup", onUp);
window.addEventListener("pointercancel", onUp);
let resizeTm = null;
window.addEventListener("resize", () => {
  if (!$("drawScreen").classList.contains("active")) return;
  clearTimeout(resizeTm);
  resizeTm = setTimeout(() => {
    const r = $("canvasWrap").getBoundingClientRect(); W = Math.round(r.width); H = Math.round(r.height);
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineJoin = ctx.lineCap = "round"; redraw();
  }, 180);
});
