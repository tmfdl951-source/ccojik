// ===== 바꾸기 쉬운 설정값 =====
const WORK_START = { hour: 10, minute: 0 }; // 출근
const WORK_END = { hour: 19, minute: 0 }; // 퇴근
const MENT_ROTATE_MS = 25000; // 시간 문구 <-> 랜덤 멘트 전환 주기
const URGENT_MINUTES = 30; // 남은 시간이 이보다 적으면 색 강조
const WEEKEND_OFF = true; // 토/일은 쉬는 날로 표시
const DRAG_THRESHOLD = 5; // 이 거리(px) 넘게 움직이면 클릭이 아니라 드래그
// ==============================

const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');
const widget = document.getElementById('widget');
const characterImg = document.getElementById('character-img');
const characterFallback = document.getElementById('character-fallback');

// assets/character.png 가 없으면 간단한 도형으로 대체.
// 로컬 파일은 이 스크립트가 실행되기 전에 이미 실패할 수 있어 현재 상태도 함께 확인한다.
function useFallbackCharacter() {
  characterImg.hidden = true;
  characterFallback.hidden = false;
}

characterImg.addEventListener('error', useFallbackCharacter);

if (characterImg.complete && characterImg.naturalWidth === 0) {
  useFallbackCharacter();
}

// ---- 남은 시간 계산 ----
function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return h + '시간 ' + m + '분';
  if (h > 0) return h + '시간';
  return m + '분';
}

// { text, urgent } 반환
function timeMessage(now) {
  const day = now.getDay();
  if (WEEKEND_OFF && (day === 0 || day === 6)) {
    return { text: '오늘은 쉬는 날', urgent: false };
  }

  const current = minutesOfDay(now);
  const start = WORK_START.hour * 60 + WORK_START.minute;
  const end = WORK_END.hour * 60 + WORK_END.minute;

  if (current < start) {
    return { text: '출근까지 ' + formatMinutes(start - current), urgent: false };
  }
  if (current < end) {
    const left = end - current;
    return {
      text: '퇴근까지 ' + formatMinutes(left),
      urgent: left <= URGENT_MINUTES,
    };
  }
  return { text: '퇴근 완료! 오늘도 수고했어요', urgent: false };
}

// ---- 말풍선 내용 전환 ----
let showingMent = false;
let currentMent = pickMent();
let rotateTimer = null;

function pickMent() {
  const pool = window.MENTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function render() {
  if (showingMent) {
    bubbleText.textContent = currentMent;
    bubble.classList.remove('urgent');
    return;
  }
  const msg = timeMessage(new Date());
  bubbleText.textContent = msg.text;
  bubble.classList.toggle('urgent', msg.urgent);
}

function startRotate() {
  clearInterval(rotateTimer);
  rotateTimer = setInterval(() => {
    showingMent = !showingMent;
    if (showingMent) currentMent = pickMent();
    render();
  }, MENT_ROTATE_MS);
}

// 클릭하면 바로 다른 멘트로
function showNewMent() {
  showingMent = true;
  let next = pickMent();
  if (window.MENTS.length > 1) {
    while (next === currentMent) next = pickMent();
  }
  currentMent = next;
  render();
  startRotate();
}

render();
startRotate();
setInterval(render, 60000); // 1분마다 시간 갱신

// ---- 드래그 이동 + 클릭 구분 ----
let pressed = false;
let dragging = false;
let startPoint = { x: 0, y: 0 };

widget.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  pressed = true;
  dragging = false;
  startPoint = { x: e.screenX, y: e.screenY };
});

window.addEventListener('mousemove', (e) => {
  if (!pressed || dragging) return;
  const moved =
    Math.abs(e.screenX - startPoint.x) + Math.abs(e.screenY - startPoint.y);
  if (moved > DRAG_THRESHOLD) {
    dragging = true;
    window.mascot.dragStart();
  }
});

window.addEventListener('mouseup', () => {
  if (!pressed) return;
  pressed = false;
  if (dragging) {
    window.mascot.dragEnd();
    dragging = false;
  } else {
    showNewMent();
  }
});

// 우클릭: 종료 메뉴
widget.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.mascot.showMenu();
});

// ---- 투명한 빈 영역은 클릭이 바탕화면으로 통과하게 ----
let interactive = null;

function setInteractive(next) {
  if (interactive === next) return;
  interactive = next;
  window.mascot.setInteractive(next);
}

window.addEventListener('mousemove', (e) => {
  if (dragging || pressed) {
    setInteractive(true);
    return;
  }
  const el = document.elementFromPoint(e.clientX, e.clientY);
  setInteractive(Boolean(el && el.closest('#bubble, #character')));
});

setInteractive(false);
