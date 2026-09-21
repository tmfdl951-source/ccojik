/* ===== 꼬직 · 보호필름 한 번에 붙이기 — 엔진 =====
 * data.js(STAGES / SCORE / GRADES / REMARKS) → app.js 순서로 로드된다.
 * 상태는 state 문자열 하나로만 관리한다: start → dust → align → shake → bubble → result
 * 캔버스는 1120x680 논리 좌표로 그리고 CSS 로 축소되므로, 입력은 toCanvas() 로 환산한다. */

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const cv = $('cv');
  /* draw* 함수들이 이 ctx 를 직접 쓴다. 결과 화면에서 확대 캔버스로 잠시 바꿔 끼우려고 let 이다. */
  let ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;      // 도트가 흐려지지 않게 보간을 끈다
  const CW = cv.width, CH = cv.height;

  /* ---- 조작 감각 상수 (튜닝은 여기서) ---- */
  const PICKER_R   = 30;    // 먼지 픽커 반경
  const BRUSH_R    = 46;    // 기포 미는 손가락 반경
  const PUSH_GAIN  = 1.25;  // 드래그 이동량 대비 기포가 밀리는 비율
  const WHEEL_STEP = 0.9;   // 휠 한 칸당 필름 회전(도)
  const MAX_TILT   = 18;    // 필름 최대 기울기(도)
  const BEZEL      = 14;    // 폰 테두리 두께

  const state = {
    phase: 'start',
    stageIdx: 0,
    stage: null,
    dev: null,        // 폰 몸체 {x,y,w,h} / 액정은 BEZEL 안쪽
    dusts: [],
    bubbles: [],
    film: null,       // {x,y,angle}  x,y = 필름 중심(화면 좌표)
    tStart: 0,
    tLimit: 0,
    shakeT: 0,
    result: null,
    /* 기믹 런타임 상태 */
    fx: {
      shake: { x: 0, y: 0 },
      shakeAmp: 0,
      bump: 0,                                   // 툭 쳤을 때의 1회성 충격
      flash: 0,                                  // 충격 순간 화면 번쩍
      knock: { x: 0, y: 0 },                     // 부딪혀 밀려난 필름 오프셋
      sway: 0,                                   // 커브 쏠림(버스)
      tip: { life: 0, x: 0, y: 0, shown: false },// 갇힌 기포 안내(한 번만)
      passer: { t: -1, x: -300, hit: false, warn: false, next: 2500 },
      watch: { looking: false, next: 0 },
      caught: 0,                                 // 사수에게 들킨 횟수(안내용)
    },
  };

  let mouse = { x: CW / 2, y: CH / 2, down: false, px: CW / 2, py: CH / 2 };
  /* 마우스 hover 가 없는 기기 = 터치. 안내 문구와 조작 방식을 여기에 맞춘다. */
  const TOUCH = (() => {
    try { return matchMedia('(hover: none)').matches || 'ontouchstart' in window; }
    catch (_) { return false; }   // 여기서 죽으면 게임이 통째로 안 뜬다
  })();
  let raf = null;

  /* ============================================================
     방해 기믹 — 스테이지의 gimmick 스위치로 켜고 끈다.
     shake : 흔들림(화면 + 필름이 실제로 밀린다)
     passerby : 사람이 지나가며 툭 치고 감
     watcher : 사수가 볼 동안 조작이 먹지 않는다
     dim : 커서 주변만 보인다
     ============================================================ */
  function gim() { return state.stage ? state.stage.gimmick : {}; }

  /* 매 프레임 기믹 상태를 갱신한다 */
  function updateFX(now) {
    const g = gim();

    // --- 흔들림: 상시 미세 진동 + 가끔 크게 덜컹 ---
    if (g.shake) {
      const big = Math.pow(Math.max(0, Math.sin(now / 1500)), 10);   // 가끔만 1에 가까워진다
      const amp = g.shake * (1.6 + big * 15);
      state.fx.shakeAmp = amp / 10;
      state.fx.shake.x = Math.sin(now / 83) * amp + Math.sin(now / 31) * amp * .35;
      state.fx.shake.y = Math.cos(now / 97) * amp * .7;
    } else {
      state.fx.shakeAmp = 0;
      state.fx.shake.x = state.fx.shake.y = 0;
    }

    // --- 지나가는 사람: 주기적으로 등장, 폰 앞을 지날 때 한 번 친다 ---
    const p = state.fx.passer;
    if (g.passerby) {
      if (p.t < 0) { if (now > p.next) { p.t = 0; p.hit = false; } }
      else {
        p.t += 16;
        // 0~700ms 는 예고(그림자가 스윽), 그 뒤에 본체가 지나간다
        p.warn = p.t < 700;
        const w = Math.min(1, p.t / 700);
        p.x = p.warn ? -260 + w * (CW * .42)
                     : -260 + .42 * CW + ((p.t - 700) / 1500) * (CW * .72 + 300);
        if (!p.hit && !p.warn && p.x > CW / 2 - 70) {     // 폰 앞을 지날 때 부딪힌다
          p.hit = true;
          state.fx.bump = 52;                              // 화면이 크게 툭
          state.fx.flash = 1;                              // 충격 순간 번쩍
          if (state.phase === 'align') {
            // 잡고 있던 필름이 눈에 띄게 밀려난다
            const dir = Math.random() < .5 ? -1 : 1;
            state.fx.knock.x = dir * (34 + Math.random() * 26);
            state.fx.knock.y = (Math.random() - .5) * 26;
            state.film.angle = Math.max(-MAX_TILT, Math.min(MAX_TILT,
              state.film.angle + dir * (5 + Math.random() * 7)));
          }
        }
        if (p.x > CW + 260) { p.t = -1; p.next = now + 3600 + Math.random() * 2600; }
      }
    } else { p.t = -1; }
    state.fx.bump *= .88;                            // 충격 잔상 감쇠
    state.fx.flash *= .86;
    if (state.fx.tip.life > 0) state.fx.tip.life -= 16;
    state.fx.knock.x *= .90;                         // 밀려난 필름이 서서히 제자리로
    state.fx.knock.y *= .90;

    // --- 커브 쏠림: 버스가 좌우로 크게 기우뚱 ---
    state.fx.sway = g.sway ? Math.sin(now / 2600) * 26 + Math.sin(now / 900) * 7 : 0;

    // --- 사수 감시: 안 볼 때 / 볼 때를 번갈아 ---
    const w = state.fx.watch;
    if (g.watcher) {
      if (now > w.next) {
        w.looking = !w.looking;
        w.next = now + (w.looking ? 1300 + Math.random() * 900     // 쳐다보는 시간
                                  : 2200 + Math.random() * 1400);  // 딴짓하는 시간
      }
    } else { w.looking = false; }
  }

  /* 사수가 보고 있으면 조작을 막는다 */
  function blocked() {
    return gim().watcher && state.fx.watch.looking;
  }

  /* ============================================================
     좌표 유틸
     ============================================================ */
  function toCanvas(e) {
    const r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * CW / r.width,
      y: (e.clientY - r.top) * CH / r.height,
    };
  }
  /* 액정(필름이 덮어야 할 영역) */
  function screenRect() {
    const d = state.dev;
    return { x: d.x + BEZEL, y: d.y + BEZEL, w: d.w - BEZEL * 2, h: d.h - BEZEL * 2 };
  }
  /* 점이 회전된 필름 안에 있는지 */
  function inFilm(px, py) {
    const f = state.film, s = screenRect();
    const a = -f.angle * Math.PI / 180;
    const dx = px - f.x, dy = py - f.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) <= s.w / 2 && Math.abs(ly) <= s.h / 2;
  }

  /* ============================================================
     스테이지 준비
     ============================================================ */
  function setupStage(i) {
    const st = STAGES[i];
    state.stageIdx = i;
    state.stage = st;

    state.dev = {
      w: st.device.w, h: st.device.h,
      x: (CW - st.device.w) / 2,
      y: (CH - st.device.h) / 2,
    };

    // 먼지를 액정 위에 흩뿌린다
    const s = screenRect();
    state.dusts = [];
    for (let n = 0; n < st.dust.count; n++) {
      state.dusts.push({
        x: s.x + 18 + Math.random() * (s.w - 36),
        y: s.y + 18 + Math.random() * (s.h - 36),
        r: 2.5 + Math.random() * 3.5,
        rot: Math.random() * Math.PI,
      });
    }

    state.bubbles = [];
    state.film = { x: CW / 2, y: 130, angle: 0 };
    state.result = null;

    // 기믹 초기화
    const now = performance.now();
    state.fx.shake.x = state.fx.shake.y = 0;
    state.fx.shakeAmp = 0;
    state.fx.bump = 0;
    state.fx.flash = 0;
    state.fx.knock = { x: 0, y: 0 };
    state.fx.sway = 0;
    state.fx.tip = { life: 0, x: 0, y: 0, shown: false };
    state.fx.passer = { t: -1, x: -300, hit: false, warn: false, next: now + 2600 };
    state.fx.watch = { looking: false, next: now + 2000 };
    state.fx.caught = 0;

    $('stageName').textContent = st.name;
    $('stageSub').textContent = st.sub + ' · ' + st.device.label;
  }

  /* ============================================================
     단계 진행
     ============================================================ */
  function banner(no, text) {
    $('stepNo').textContent = no;
    $('stepText').textContent = text;
    const b = $('stepBanner');
    b.hidden = true; void b.offsetWidth; b.hidden = false;
  }

  function startTimer(sec) {
    state.tLimit = sec;
    state.tStart = performance.now();
  }
  function timeLeft() {
    if (!state.tLimit) return 0;
    return Math.max(0, state.tLimit - (performance.now() - state.tStart) / 1000);
  }

  function goDust() {
    state.phase = 'dust';
    startTimer(state.stage.dust.time);
    banner('STEP 1', '먼지를 털어내세요');
    $('hint').innerHTML = '액정 위 먼지를 <b>문질러</b> 지우세요';
    $('actionBtn').hidden = true;
    const tl = $('tilt'); if (tl) tl.hidden = true;
  }

  function goAlign() {
    state.phase = 'align';
    startTimer(state.stage.film.time);     // 부착도 제한시간 안에 — 넘기면 그 상태로 붙는다
    banner('STEP 2', '필름을 맞추세요');
    $('hint').innerHTML = state.stage.gimmick.guide
      ? (TOUCH ? '끌어서 위치 · <b>각도 버튼</b>이나 두 손가락 · 부착은 단 한 번'
               : '마우스로 위치 · <b>휠로 각도</b> · 부착은 단 한 번')
      : '<b>가이드 없음</b> · 감으로 맞추세요 · 부착은 단 한 번';
    const b = $('actionBtn');
    b.hidden = false; b.textContent = '부착!'; b.classList.add('pulse');
    const tl = $('tilt'); if (tl) tl.hidden = false;
  }

  function attach() {
    if (state.phase !== 'align') return;
    state.phase = 'shake';
    state.tLimit = 0;
    state.shakeT = performance.now();
    $('actionBtn').hidden = true;
    $('actionBtn').classList.remove('pulse');
    const tl = $('tilt'); if (tl) tl.hidden = true;

    // 필름 아래 기포 생성. 먼지 위에 생긴 기포는 '걸려서' 안 빠진다.
    const st = state.stage, s = screenRect();
    state.bubbles = [];
    for (let n = 0; n < st.bubble.count; n++) {
      let bx, by, tries = 0;
      do {
        bx = s.x + 24 + Math.random() * (s.w - 48);
        by = s.y + 24 + Math.random() * (s.h - 48);
      } while (!inFilm(bx, by) && ++tries < 30);
      state.bubbles.push({ x: bx, y: by, r: 9 + Math.random() * 13, stuck: false, wob: 0 });
    }
    // 남은 먼지 위치에 기포를 하나씩 더 얹고, 그건 고정
    state.dusts.forEach(d => {
      if (!inFilm(d.x, d.y)) return;
      state.bubbles.push({ x: d.x, y: d.y, r: 11 + Math.random() * 8, stuck: true, wob: 0 });
    });

    setTimeout(goBubble, 620);
  }

  function goBubble() {
    state.phase = 'bubble';
    startTimer(state.stage.bubble.time);
    banner('STEP 3', '기포를 밀어내세요');
    $('hint').innerHTML = '기포를 <b>바깥쪽으로</b> 쓸어내세요 · <b>붉은 기포</b>는 먼지가 갇혀 안 빠집니다';
  }

  /* ============================================================
     채점
     ============================================================ */
  function judge() {
    state.phase = 'result';
    state.tLimit = 0;

    const s = screenRect(), f = state.film;
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;

    const posErr = Math.hypot(f.x - cx, f.y - cy);
    const angErr = Math.abs(f.angle);
    const dustIn = state.dusts.filter(d => inFilm(d.x, d.y)).length;
    const bubbles = state.bubbles.length;
    const bubbleArea = state.bubbles.reduce((a, b) => a + Math.PI * b.r * b.r, 0);

    // 필름 네 모서리 중 액정 밖으로 나간 개수
    const a = f.angle * Math.PI / 180;
    let out = 0;
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx, sy]) => {
      const lx = sx * s.w / 2, ly = sy * s.h / 2;
      const px = f.x + lx * Math.cos(a) - ly * Math.sin(a);
      const py = f.y + lx * Math.sin(a) + ly * Math.cos(a);
      if (px < s.x - 1 || px > s.x + s.w + 1 || py < s.y - 1 || py > s.y + s.h + 1) out++;
    });

    const cut = {
      dust:     dustIn * SCORE.dust,
      pos:      Math.max(0, posErr - state.stage.film.tolPos) * SCORE.pos,
      angle:    Math.max(0, angErr - state.stage.film.tolAngle) * SCORE.angle,
      bubble:   bubbles * SCORE.bubble + bubbleArea * SCORE.bubbleArea,
      overhang: out * SCORE.overhang,
    };
    const total = Math.round(Math.max(0, Math.min(100,
      SCORE.base - cut.dust - cut.pos - cut.angle - cut.bubble - cut.overhang)));

    state.result = {
      score: total, grade: pickGrade(total), remark: pickRemark(total),
      dustIn, posErr, angErr, bubbles, out, cut,
    };
    showResult();
  }

  /* ============================================================
     그리기
     ============================================================ */
  /* ---- 테마 배경: 스테이지의 theme 키에 따라 다른 장소를 그린다 ---- */
  function drawTheme() {
    const th = state.stage ? state.stage.theme : 'subway';
    if (th === 'office') return drawOffice();
    if (th === 'bus')    return drawBus();
    if (th === 'dark')   return drawDark();
    return drawSubway();
  }

  /* 공통: 바닥 매트 + 조명 */
  function matte(top, bottom, lightAlpha) {
    const g = ctx.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    if (lightAlpha) {
      const l = ctx.createRadialGradient(CW / 2, CH * .34, 40, CW / 2, CH * .34, CH * .95);
      l.addColorStop(0, 'rgba(255,184,0,' + lightAlpha + ')');
      l.addColorStop(1, 'rgba(255,184,0,0)');
      ctx.fillStyle = l; ctx.fillRect(0, 0, CW, CH);
    }
  }

  /* STAGE 1 — 지하철: 창문 + 손잡이 + 좌석 */
  function drawSubway() {
    matte('#22375C', '#16233D', .12);
    // 창문 3개
    for (let i = 0; i < 3; i++) {
      const x = 70 + i * 360, y = 60, w = 260, h = 150;
      ctx.fillStyle = '#0E1A2E'; roundRect(x, y, w, h, 14); ctx.fill();
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, 'rgba(120,180,230,.20)');
      g.addColorStop(1, 'rgba(120,180,230,.05)');
      ctx.fillStyle = g; roundRect(x, y, w, h, 14); ctx.fill();
      ctx.strokeStyle = '#0A1220'; ctx.lineWidth = 6; roundRect(x, y, w, h, 14); ctx.stroke();
      // 스쳐 지나가는 터널 불빛
      ctx.fillStyle = 'rgba(255,220,150,.22)';
      const t = (performance.now() / 14 + i * 90) % (w + 60);
      ctx.fillRect(x + 6 + ((t) % (w - 12)), y + 10, 5, h - 20);
    }
    // 손잡이
    for (let i = 0; i < 6; i++) {
      const x = 120 + i * 180;
      const sw = Math.sin(performance.now() / 700 + i) * (state.fx.shakeAmp * 8 + 3);
      ctx.strokeStyle = '#8FA0B8'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + sw, 60); ctx.stroke();
      ctx.strokeStyle = '#D8B25A'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(x + sw, 82, 20, 0, 7); ctx.stroke();
    }
    // 노선도 — 창 사이 벽에 붙어 있다
    const mx = 430, my = 232;
    ctx.fillStyle = '#F2ECDC';
    roundRect(mx, my, 260, 52, 8); ctx.fill();
    ctx.strokeStyle = '#0A1220'; ctx.lineWidth = 4;
    roundRect(mx, my, 260, 52, 8); ctx.stroke();
    ctx.strokeStyle = '#00E436'; ctx.lineWidth = 6;   // 2호선
    ctx.beginPath(); ctx.moveTo(mx + 18, my + 30); ctx.lineTo(mx + 242, my + 30); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const sx = mx + 22 + i * 43;
      ctx.fillStyle = i === 2 ? '#FF004D' : '#FFFDF6';   // 현재 역만 빨강
      ctx.beginPath(); ctx.arc(sx, my + 30, i === 2 ? 8 : 5.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#1D2B53'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    ctx.fillStyle = '#1D2B53';
    ctx.font = 'bold 14px Galmuri11, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('합정  당산  영등포구청', mx + 14, my + 6);

    // 좌석 + 등받이
    ctx.fillStyle = '#16405E';
    roundRect(-10, CH - 150, CW + 20, 70, 14); ctx.fill();
    ctx.fillStyle = '#1C4C6E';
    roundRect(0, CH - 96, CW, 120, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 4;
    for (let i = 1; i < 7; i++) {
      ctx.beginPath(); ctx.moveTo(i * (CW / 7), CH - 96); ctx.lineTo(i * (CW / 7), CH); ctx.stroke();
    }
    // 좌석 위 광고판
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    roundRect(120, CH - 146, 300, 60, 8); ctx.fill();
    roundRect(700, CH - 146, 300, 60, 8); ctx.fill();
  }

  /* STAGE 2 — 사무실: 책상 + 모니터 + 서류. 사수는 drawWatcher 가 그린다 */
  function drawOffice() {
    matte('#2B3F63', '#3A2E22', .14);
    // 책상 상판
    ctx.fillStyle = '#6E4A2C'; ctx.fillRect(0, CH * .30, CW, CH);
    ctx.fillStyle = 'rgba(0,0,0,.14)';
    for (let y = CH * .30; y < CH; y += 26) ctx.fillRect(0, y, CW, 3);
    // 모니터
    ctx.fillStyle = '#14181F'; roundRect(60, 40, 300, 200, 10); ctx.fill();
    ctx.fillStyle = '#2B6E8C'; roundRect(72, 52, 276, 164, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    for (let i = 0; i < 7; i++) ctx.fillRect(88, 70 + i * 20, 90 + (i % 3) * 70, 7);
    ctx.fillStyle = '#14181F'; ctx.fillRect(190, 240, 40, 34);
    roundRect(150, 274, 120, 14, 6); ctx.fill();
    // 서류 더미
    ctx.save(); ctx.translate(CW - 190, 120); ctx.rotate(-.09);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#F2E9D4' : '#FFFDF6';
      ctx.strokeStyle = '#B9A98A'; ctx.lineWidth = 2;
      roundRect(i * 5, i * -5, 150, 190, 5); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    // 키보드
    ctx.fillStyle = '#20252E'; roundRect(70, CH - 168, 420, 132, 12); ctx.fill();
    ctx.strokeStyle = '#141820'; ctx.lineWidth = 4; roundRect(70, CH - 168, 420, 132, 12); ctx.stroke();
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 14; c++) {
        ctx.fillStyle = 'rgba(255,255,255,.10)';
        roundRect(84 + c * 28, CH - 156 + r * 29, 22, 22, 4); ctx.fill();
      }
    }
    // 마우스
    ctx.fillStyle = '#2B313C';
    ctx.beginPath(); ctx.ellipse(540, CH - 104, 30, 46, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#141820'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(540, CH - 148); ctx.lineTo(540, CH - 108); ctx.stroke();
    // 펜꽂이
    ctx.fillStyle = '#3C4656'; roundRect(CW - 268, CH - 168, 58, 74, 8); ctx.fill();
    ['#FF004D', '#29ADFF', '#FFCC00'].forEach((col, i) => {
      ctx.strokeStyle = col; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(CW - 254 + i * 16, CH - 168); ctx.lineTo(CW - 250 + i * 16, CH - 214 - i * 8); ctx.stroke();
    });
    // 머그컵
    ctx.fillStyle = '#FF004D'; roundRect(CW - 150, CH - 150, 74, 80, 10); ctx.fill();
    ctx.strokeStyle = '#A5271A'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(CW - 66, CH - 110, 22, -1.2, 1.2); ctx.stroke();
  }

  /* STAGE 3 — 심야 광역버스 뒷자리.
     지하철과 헷갈리지 않게: 창이 하나 크고(뒷자리 측면창), 앞좌석 등받이 두 개가
     통로를 사이에 두고 솟아 있으며, 천장에 개인 독서등이 줄지어 있다. */
  function drawBus() {
    matte('#101728', '#070A12', .05);

    // 천장 개인 독서등
    for (let i = 0; i < 7; i++) {
      const x = 90 + i * 160;
      ctx.fillStyle = 'rgba(255,226,160,.14)';
      ctx.beginPath(); ctx.ellipse(x, 6, 34, 20, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2A3243';
      roundRect(x - 16, 0, 32, 12, 5); ctx.fill();
    }

    // 뒷자리 측면 큰 창 하나 — 밤 도로가 흐른다
    const wx = 690, wy = 70, ww = 380, wh = 300;
    ctx.fillStyle = '#04070E'; roundRect(wx, wy, ww, wh, 16); ctx.fill();
    ctx.save();
    roundRect(wx + 6, wy + 6, ww - 12, wh - 12, 12); ctx.clip();
    // 지평선과 도로
    ctx.fillStyle = '#0A1020'; ctx.fillRect(wx, wy + wh * .52, ww, wh);
    // 흘러가는 가로등 불빛
    for (let k = 0; k < 5; k++) {
      const t = ((performance.now() / 5.5) + k * 150) % (ww + 140);
      const gx = wx + ww + 60 - t;
      const g = ctx.createRadialGradient(gx, wy + wh * .34, 3, gx, wy + wh * .34, 70);
      g.addColorStop(0, 'rgba(255,208,130,.85)');
      g.addColorStop(1, 'rgba(255,208,130,0)');
      ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
      // 도로면 반사
      ctx.fillStyle = 'rgba(255,208,130,.10)';
      ctx.fillRect(gx - 5, wy + wh * .55, 10, wh * .45);
    }
    // 창에 비친 실내
    ctx.fillStyle = 'rgba(150,190,255,.05)';
    ctx.fillRect(wx, wy, ww, wh);
    ctx.restore();
    ctx.strokeStyle = '#05080F'; ctx.lineWidth = 9; roundRect(wx, wy, ww, wh, 16); ctx.stroke();
    ctx.strokeStyle = '#3A465E'; ctx.lineWidth = 3; roundRect(wx + 9, wy + 9, ww - 18, wh - 18, 10); ctx.stroke();
    // 커튼
    ctx.fillStyle = '#1A2336';
    roundRect(wx + 6, wy + 6, 54, wh - 12, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(wx + 14 + i * 9, wy + 10); ctx.lineTo(wx + 14 + i * 9, wy + wh - 10); ctx.stroke();
    }

    // 앞좌석 등받이 2개 + 가운데 통로
    [[70, 330], [CW - 400, 330]].forEach(([sx, sw2]) => {
      ctx.fillStyle = '#242F49';
      roundRect(sx, CH - 250, sw2, 300, 28); ctx.fill();
      ctx.fillStyle = '#1B2438';                      // 헤드레스트
      roundRect(sx + 40, CH - 268, sw2 - 80, 84, 22); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 3;
      roundRect(sx + 24, CH - 170, sw2 - 48, 120, 16); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.25)';              // 뒷주머니
      roundRect(sx + 40, CH - 120, sw2 - 80, 70, 10); ctx.fill();
    });
  }

  /* STAGE 4 — 정전된 방: 거의 안 보인다. dim 오버레이가 따로 덮는다 */
  function drawDark() {
    matte('#0A0D14', '#05070C', 0);
    ctx.fillStyle = '#12161F';
    roundRect(-30, CH - 150, CW + 60, 190, 18); ctx.fill();   // 탁자
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 2;
    for (let y = CH - 140; y < CH; y += 22) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
    }
    // 손전등 빛기둥
    const g = ctx.createRadialGradient(mouse.x, mouse.y, 10, mouse.x, mouse.y, 260);
    g.addColorStop(0, 'rgba(255,236,190,.22)');
    g.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPhone() {
    const d = state.dev, s = screenRect();
    // 몸체
    ctx.fillStyle = '#0B1220';
    roundRect(d.x, d.y, d.w, d.h, 26); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#0F0F1B';
    roundRect(d.x, d.y, d.w, d.h, 26); ctx.stroke();
    // 액정
    ctx.fillStyle = '#12304A';
    roundRect(s.x, s.y, s.w, s.h, 12); ctx.fill();
    // 액정 반사광
    const g = ctx.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h);
    g.addColorStop(0, 'rgba(255,255,255,.10)');
    g.addColorStop(.45, 'rgba(255,255,255,.03)');
    g.addColorStop(1, 'rgba(255,255,255,.08)');
    ctx.fillStyle = g;
    roundRect(s.x, s.y, s.w, s.h, 12); ctx.fill();
    // 전면 카메라
    ctx.fillStyle = '#060A12';
    ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + 16, 6, 0, 7); ctx.fill();
  }

  function drawDusts() {
    state.dusts.forEach(d => {
      ctx.save();
      ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      ctx.fillStyle = 'rgba(232,226,210,.92)';
      ctx.beginPath();
      ctx.ellipse(0, 0, d.r, d.r * .62, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawFilm(ghost) {
    const f = state.film, s = screenRect();
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle * Math.PI / 180);
    const w = s.w, h = s.h;

    ctx.fillStyle = ghost ? 'rgba(180,226,255,.30)' : 'rgba(198,234,255,.20)';
    roundRect(-w / 2, -h / 2, w, h, 12); ctx.fill();
    ctx.lineWidth = ghost ? 3 : 2.5;
    ctx.strokeStyle = ghost ? 'rgba(42,174,230,.95)' : 'rgba(150,215,245,.8)';
    roundRect(-w / 2, -h / 2, w, h, 12); ctx.stroke();

    // 비스듬한 광택 한 줄 — 필름처럼 보이게
    ctx.save();
    ctx.beginPath(); roundRect(-w / 2, -h / 2, w, h, 12); ctx.clip();
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(.30, 'rgba(255,255,255,0)');
    g.addColorStop(.44, 'rgba(255,255,255,.22)');
    g.addColorStop(.58, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();

    if (ghost) {   // 떼는 탭
      ctx.fillStyle = '#FFCC00';
      ctx.strokeStyle = '#0F0F1B'; ctx.lineWidth = 3;
      ctx.fillRect(w / 2 - 82, -h / 2 - 36, 82, 36);
      ctx.strokeRect(w / 2 - 82, -h / 2 - 36, 82, 36);
      ctx.fillStyle = '#0F0F1B';
      ctx.font = 'bold 22px Galmuri11, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('필름', w / 2 - 41, -h / 2 - 18);
    }
    ctx.restore();
  }

  function drawGuide() {
    const s = screenRect(), f = state.film;
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const err = Math.hypot(f.x - cx, f.y - cy);
    const good = err <= state.stage.film.tolPos && Math.abs(f.angle) <= state.stage.film.tolAngle;

    ctx.save();
    ctx.setLineDash([9, 7]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = good ? 'rgba(53,185,78,.95)' : 'rgba(255,184,0,.8)';
    roundRect(s.x, s.y, s.w, s.h, 12); ctx.stroke();
    ctx.setLineDash([]);
    // 중앙 십자
    ctx.strokeStyle = good ? 'rgba(53,185,78,.9)' : 'rgba(255,184,0,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
    ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16);
    ctx.stroke();
    ctx.restore();

    // 정렬 수치 — 폰 왼쪽 여백에 큼직하게.
    // 폰 아래(s.y + s.h + 16)에 두면 글자를 키웠을 때 화면 밖으로 나간다.
    const px = 26, py = CH / 2 - 52, pw = 232, ph = 104;
    ctx.save();
    ctx.fillStyle = 'rgba(15,15,27,.88)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = good ? '#00E436' : '#FFCC00'; ctx.lineWidth = 4;
    ctx.strokeRect(px, py, pw, ph);
    ctx.fillStyle = good ? '#00E436' : '#FFCC00';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 26px Galmuri11, monospace';
    ctx.fillText(good ? '정렬 좋음' : '어긋남', px + pw / 2, py + 34);
    ctx.font = 'bold 22px Galmuri11, monospace';
    ctx.fillText(Math.round(err) + 'px / ' + f.angle.toFixed(1) + '°', px + pw / 2, py + 72);
    ctx.restore();
  }

  /* 기포 두 종류를 확실히 구분해서 그린다.
     - 일반 기포: 파르스름한 동그라미. 밀면 가장자리로 빠진다.
     - 갇힌 기포(stuck): 붉은 테두리 + 톱니 모양 + 한가운데 먼지 알갱이.
       STEP 1 에서 못 지운 먼지가 필름 아래 갇힌 것이라 밀어도 안 빠진다. */
  function drawBubbles() {
    state.bubbles.forEach(b => {
      const wob = Math.sin(b.wob) * (b.stuck ? 2.6 : 1.6);
      ctx.save();
      ctx.translate(b.x + wob, b.y);

      // 기포 몸통
      const g = ctx.createRadialGradient(-b.r * .3, -b.r * .35, b.r * .1, 0, 0, b.r);
      if (b.stuck) {
        g.addColorStop(0, 'rgba(255,225,215,.6)');
        g.addColorStop(.55, 'rgba(255,170,150,.30)');
        g.addColorStop(1, 'rgba(230,110,90,.38)');
      } else {
        g.addColorStop(0, 'rgba(255,255,255,.55)');
        g.addColorStop(.55, 'rgba(210,240,255,.28)');
        g.addColorStop(1, 'rgba(150,200,230,.34)');
      }
      ctx.fillStyle = g;

      if (b.stuck) {
        // 톱니 윤곽 — 동그란 일반 기포와 한눈에 구분된다
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) {
          const a = i / 20 * Math.PI * 2;
          const rr = b.r * (i % 2 ? .86 : 1);
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(238,74,52,.95)'; ctx.stroke();

        // 한가운데 갇힌 먼지 — 이것 때문에 안 빠진다
        ctx.fillStyle = 'rgba(70,58,44,.95)';
        ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 2.6, .5, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 7); ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.stroke();
      }

      // 하이라이트
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.ellipse(-b.r * .34, -b.r * .38, b.r * .22, b.r * .15, -.6, 0, 7); ctx.fill();
      ctx.restore();
    });
  }

  /* 갇힌 기포를 밀려고 할 때 한 번만 뜨는 안내 */
  function drawStuckTip() {
    const t = state.fx.tip;
    if (t.life <= 0) return;
    const a = Math.min(1, t.life / 400);
    ctx.save();
    ctx.globalAlpha = a;
    const w = 416, h = 60, x = t.x - w / 2, y = t.y - 92;
    ctx.fillStyle = '#FF004D';
    ctx.fillRect(x, y, w, h);                       // 각진 픽셀 박스
    ctx.strokeStyle = '#0F0F1B'; ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath();                       // 말풍선 꼬리
    ctx.moveTo(t.x - 9, y + h); ctx.lineTo(t.x + 9, y + h); ctx.lineTo(t.x, y + h + 12);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFF6E0';
    ctx.font = 'bold 26px Galmuri11, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('먼지가 갇혀서 안 빠집니다', t.x, y + h / 2 + 1);
    ctx.restore();
  }

  function drawTool() {
    if (state.phase === 'dust') {
      ctx.save();
      ctx.strokeStyle = '#FFCC00'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, PICKER_R, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,184,0,.16)'; ctx.fill();
      // 픽커 손잡이
      ctx.strokeStyle = '#0F0F1B'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(mouse.x + 20, mouse.y - 20); ctx.lineTo(mouse.x + 54, mouse.y - 54); ctx.stroke();
      ctx.strokeStyle = '#FF004D'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(mouse.x + 20, mouse.y - 20); ctx.lineTo(mouse.x + 54, mouse.y - 54); ctx.stroke();
      ctx.restore();
    } else if (state.phase === 'bubble') {
      ctx.save();
      ctx.strokeStyle = '#29ADFF'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, BRUSH_R, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(42,174,230,.12)'; ctx.fill();
      ctx.restore();
    }
  }

  /* 지나가는 사람 실루엣 */
  function drawPasser() {
    const p = state.fx.passer;
    if (p.t < 0) return;
    ctx.save();
    if (p.warn) {                     // 예고: 바닥에 그림자만 스윽 지나간다
      ctx.fillStyle = 'rgba(0,0,0,.34)';
      ctx.beginPath();
      ctx.ellipse(p.x, CH - 40, 130, 34, 0, 0, 7);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(6,10,18,.88)';
    const x = p.x, base = CH + 30, hh = 430;
    ctx.beginPath();                       // 몸통
    ctx.ellipse(x, base - hh * .42, 62, hh * .42, 0, 0, 7); ctx.fill();
    ctx.beginPath();                       // 머리
    ctx.arc(x, base - hh * .86, 42, 0, 7); ctx.fill();
    ctx.beginPath();                       // 흔들리는 팔
    const sw = Math.sin(p.t / 120) * 26;
    ctx.ellipse(x + 58, base - hh * .46 + sw, 17, 96, .12, 0, 7); ctx.fill();
    ctx.restore();
  }

  /* 사수 + 감시 표시 */
  function drawWatcher() {
    if (!gim().watcher) return;
    const w = state.fx.watch;
    const x = CW - 150, y = 120;
    // 고개가 스르륵 돌아간다: 0=딴 곳, 1=이쪽
    w.turn = (w.turn === undefined ? 0 : w.turn) + ((w.looking ? 1 : 0) - w.turn) * .16;
    const tn = w.turn;

    ctx.save();
    // 파티션
    ctx.fillStyle = '#5A6579';
    roundRect(x - 150, y + 128, 300, 150, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    roundRect(x - 138, y + 140, 276, 40, 6); ctx.fill();
    // 상반신
    ctx.fillStyle = '#1A2436';
    ctx.beginPath(); ctx.ellipse(x, y + 96, 78, 74, 0, 0, 7); ctx.fill();
    // 머리 — 돌아보는 만큼 얼굴이 이쪽으로 온다
    const hx = x - (1 - tn) * 26;
    ctx.fillStyle = '#E8CDB0';
    ctx.beginPath(); ctx.arc(hx, y, 50, 0, 7); ctx.fill();
    ctx.fillStyle = '#2A2118';
    ctx.beginPath(); ctx.arc(hx, y - 14, 50, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#2A2118';                       // 뒤통수(안 볼 때 더 많이 보인다)
    ctx.beginPath(); ctx.ellipse(hx + 34 * (1 - tn), y + 4, 22 * (1 - tn), 44, 0, 0, 7); ctx.fill();
    // 눈 — 돌아볼수록 또렷해진다
    if (tn > .35) {
      ctx.globalAlpha = (tn - .35) / .65;
      ctx.fillStyle = '#0F0F1B';
      ctx.beginPath(); ctx.arc(hx - 17, y + 6, 7, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + 17, y + 6, 7, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 안경
    ctx.strokeStyle = '#2B313C'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(hx - 17, y + 6, 15, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx + 17, y + 6, 15, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx - 2, y + 6); ctx.lineTo(hx + 2, y + 6); ctx.stroke();
    ctx.restore();

    // 감시 게이지 — 고개가 얼마나 돌아왔는지
    const gx = CW - 300, gy = 40, gw = 260, gh = 24;   // 사수 머리(y70~) 위에 딱 맞춘다
    ctx.save();
    ctx.fillStyle = 'rgba(10,16,32,.9)'; ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = '#0F0F1B'; ctx.lineWidth = 3; ctx.strokeRect(gx, gy, gw, gh);
    ctx.fillStyle = tn > .5 ? '#FF004D' : '#00E436';
    ctx.fillRect(gx + 3, gy + 3, (gw - 6) * tn, gh - 6);
    ctx.fillStyle = '#FFF6E0';
    ctx.font = 'bold 20px Galmuri11, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    // 게이지 왼쪽에 두면 폰 오른쪽 모서리를 침범한다. 위로 올린다.
    ctx.fillText(tn > .5 ? '시선 이쪽' : '아직 딴 곳', gx + gw, gy - 6);
    ctx.restore();

  }

  /* 감시 중 경고 — 맨 마지막에, 화면 최상단 바로 그린다.
     drawWatcher() 안에 있으면 그 뒤에 그려지는 폰에 가려져 안 보였다. */
  function drawWatchAlert() {
    if (!gim().watcher) return;
    if (!state.fx.watch.looking) return;
    ctx.save();
    // 화면 테두리
    ctx.strokeStyle = 'rgba(255,0,77,.92)'; ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, CW - 12, CH - 12);
    // 최상단 경고 바 — 폭을 화면 전체로 잡아 폰과 겹칠 일이 없다
    const bh = 64;
    ctx.fillStyle = '#FF004D';
    ctx.fillRect(0, 0, CW, bh);
    ctx.fillStyle = '#0F0F1B';
    ctx.fillRect(0, bh, CW, 5);                       // 아래 굵은 도트 경계선
    ctx.fillStyle = '#FFF6E0';
    ctx.font = 'bold 33px Galmuri11, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('사수가 보고 있습니다  손 멈춰', CW / 2, bh / 2 + 1);
    ctx.restore();
  }

  /* 시야 제한 — 커서 주변만 남기고 덮는다 */
  function drawDim() {
    const k = gim().dim;
    if (!k) return;
    ctx.save();
    const g = ctx.createRadialGradient(mouse.x, mouse.y, 40, mouse.x, mouse.y, 250);
    g.addColorStop(0, 'rgba(5,7,12,0)');
    g.addColorStop(.62, 'rgba(5,7,12,' + (k * .72) + ')');
    g.addColorStop(1, 'rgba(5,7,12,' + k + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    ctx.restore();
  }

  function render() {
    ctx.save();
    // 부착 순간 흔들림 + 스테이지 흔들림 + 툭 친 충격을 모두 합친다
    let ox = state.fx.shake.x, oy = state.fx.shake.y;
    if (state.phase === 'shake') {
      const t = (performance.now() - state.shakeT) / 620;
      const k = Math.max(0, 1 - t) * 14;
      ox += (Math.random() - .5) * k; oy += (Math.random() - .5) * k;
    }
    if (state.fx.bump > .5) {
      ox += (Math.random() - .5) * state.fx.bump;
      oy += (Math.random() - .5) * state.fx.bump;
    }
    ox += state.fx.sway;
    ctx.translate(ox, oy);

    drawTheme();
    drawWatcher();
    drawPhone();

    const attached = state.phase === 'shake' || state.phase === 'bubble' || state.phase === 'result';
    if (!attached) drawDusts();

    if (state.phase === 'align') {
      if (gim().guide) drawGuide();          // STAGE 3부터는 가이드가 없다
      drawFilm(true);
    }
    if (attached) { drawDusts(); drawFilm(false); drawBubbles(); }

    drawTool();
    drawStuckTip();
    drawPasser();
    drawDim();
    if (state.fx.flash > .04) {                      // 부딪힌 순간 화면이 번쩍
      ctx.fillStyle = 'rgba(255,240,210,' + (state.fx.flash * .5) + ')';
      ctx.fillRect(-60, -60, CW + 120, CH + 120);
    }
    ctx.restore();

    drawWatchAlert();         // 폰 위에, 흔들림 밖에. 항상 보인다
  }

  /* ============================================================
     루프
     ============================================================ */
  function tick() {
    raf = requestAnimationFrame(tick);

    updateFX(performance.now());

    // 기포 미세 진동
    state.bubbles.forEach(b => { b.wob += b.stuck ? .22 : .08; });

    // 타이머
    const tl = timeLeft();
    const tEl = $('timer'), tn = $('timerNum');
    if (state.tLimit) {
      tEl.classList.remove('idle');
      tEl.classList.toggle('warn', tl <= 2);
      tn.textContent = tl.toFixed(1);
      if (tl <= 0) {
        if (state.phase === 'dust') goAlign();
        else if (state.phase === 'align') { state.fx.forced = true; attach(); }  // 손이 미끄러진다
        else if (state.phase === 'bubble') judge();
      }
    } else {
      tEl.classList.add('idle');
      tEl.classList.remove('warn');
      tn.textContent = '--';
    }
    render();
  }

  /* ============================================================
     입력
     ============================================================ */
  function rubDust() {
    state.dusts = state.dusts.filter(d => Math.hypot(d.x - mouse.x, d.y - mouse.y) > PICKER_R);
  }

  function pushBubbles() {
    const vx = (mouse.x - mouse.px) * PUSH_GAIN;
    const vy = (mouse.y - mouse.py) * PUSH_GAIN;
    if (!vx && !vy) return;
    state.bubbles.forEach(b => {
      if (Math.hypot(b.x - mouse.x, b.y - mouse.y) > BRUSH_R + b.r) return;
      if (b.stuck) {                              // 먼지에 걸린 기포는 안 밀린다
        b.wob += 1.4;                              // 제자리에서 흔들리기만 한다
        if (!state.fx.tip.shown) {                 // 왜 안 빠지는지 한 번 알려 준다
          state.fx.tip = { life: 1900, x: b.x, y: b.y - b.r, shown: true };
        }
        return;
      }
      b.x += vx; b.y += vy;
    });
    // 필름 밖으로 밀려난 기포는 빠져나간 것
    state.bubbles = state.bubbles.filter(b => inFilm(b.x, b.y));
    if (!state.bubbles.length) judge();          // 다 밀어냈으면 즉시 판정
  }

  /* 포인터 좌표를 게임에 반영한다. dragging 은 '누르고 있는 중'.
     PC 는 누르지 않아도 필름이 따라오므로 align 에서는 항상 반영한다. */
  function applyPointer(p, dragging) {
    mouse.px = mouse.x; mouse.py = mouse.y;
    mouse.x = p.x; mouse.y = p.y;

    if (blocked()) return;                  // 사수가 볼 땐 손이 안 나간다

    if (state.phase === 'align') {
      // 흔들리는 차 안에서는 필름이 손을 그대로 따라오지 않는다
      state.film.x = mouse.x + state.fx.shake.x * 1.6 + state.fx.knock.x + state.fx.sway;
      state.film.y = mouse.y + state.fx.shake.y * 1.6 + state.fx.knock.y;
    } else if (state.phase === 'dust' && dragging) {
      rubDust();
    } else if (state.phase === 'bubble' && dragging) {
      pushBubbles();
    }
  }

  function tilt(d) {
    if (state.phase !== 'align' || blocked()) return;
    state.film.angle = Math.max(-MAX_TILT, Math.min(MAX_TILT, state.film.angle + d));
  }

  /* 두 손가락 회전용 — 눌려 있는 포인터를 전부 들고 있는다 */
  const pts = new Map();
  let rot = null;                           // { a: 두 손가락 각도, f: 그때의 필름 각도 }
  const isTouch = e => e.pointerType !== 'mouse';
  const spanAngle = () => {
    const [p, q] = [...pts.values()];
    return Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
  };

  cv.addEventListener('pointerdown', e => {
    e.preventDefault();                     // 터치가 스크롤로 새는 것을 막는다
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size === 2) {                   // 두 손가락 = 각도 조절. 위치 조작은 멈춘다
      rot = state.phase === 'align' ? { a: spanAngle(), f: state.film.angle } : null;
      return;
    }

    mouse.down = true;
    cv.classList.add('grabbing');
    const p = toCanvas(e);
    mouse.px = mouse.x = p.x; mouse.py = mouse.y = p.y;
    if (blocked()) { state.fx.caught++; return; }
    if (state.phase === 'dust') rubDust();
    else if (state.phase === 'align') {
      // 터치는 여기서 붙이면 위치를 맞출 수 없다. 손가락 아래로 필름만 옮기고,
      // 부착은 '부착!' 버튼으로 받는다. 마우스는 지금까지대로 클릭 = 부착.
      if (isTouch(e)) applyPointer(p, true);
      else attach();
    }
  }, { passive: false });

  cv.addEventListener('pointermove', e => {
    e.preventDefault();
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size === 2) {                   // 두 손가락을 벌려 돌리면 각도가 바뀐다
      if (rot && state.phase === 'align' && !blocked()) {
        let d = spanAngle() - rot.a;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        state.film.angle = Math.max(-MAX_TILT, Math.min(MAX_TILT, rot.f + d));
      }
      return;
    }

    // 터치는 hover 가 없다. 손가락을 대고 있을 때만 조작으로 친다.
    if (isTouch(e) && !mouse.down) return;
    applyPointer(toCanvas(e), mouse.down);
  }, { passive: false });

  function endPointer(e) {
    pts.delete(e.pointerId);
    if (pts.size < 2) rot = null;
    if (pts.size === 0) { mouse.down = false; cv.classList.remove('grabbing'); }
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  // 두 손가락 중 하나만 떼었을 때 남은 손가락의 드래그를 끊지 않게, 전부 떼었을 때만 푼다
  addEventListener('pointerup', () => { if (pts.size === 0) { mouse.down = false; cv.classList.remove('grabbing'); } });

  cv.addEventListener('wheel', e => {       // PC 각도 조절
    if (state.phase !== 'align' || blocked()) return;
    e.preventDefault();
    tilt((e.deltaY > 0 ? 1 : -1) * WHEEL_STEP);
  }, { passive: false });

  $('actionBtn').addEventListener('click', e => { e.stopPropagation(); if (!blocked()) attach(); });

  /* 터치용 각도 버튼 — 휠이 없는 기기의 대체 조작. 누르고 있으면 계속 돈다. */
  [['tiltL', -1], ['tiltR', 1]].forEach(([id, dir]) => {
    const b = $(id); if (!b) return;
    let t = 0;
    const stop = () => { clearInterval(t); t = 0; };
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      tilt(dir * WHEEL_STEP);
      stop(); t = setInterval(() => tilt(dir * WHEEL_STEP), 90);
    }, { passive: false });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(k => b.addEventListener(k, stop));
  });

  /* ============================================================
     결과 화면
     ============================================================ */
  function showResult() {
    const r = state.result;
    // 화면에 띄우는 건 넷뿐: 결과물 · 등급 · 한줄평 · 점수
    $('resultTitle').textContent = r.grade.title;
    $('remark').textContent = r.remark;
    $('resultScore').textContent = r.score;
    $('resultGrade').textContent = r.grade.grade;
    $('resultGrade').style.color = r.grade.color;

    // 세부 채점은 접어 둔 상태로 시작
    $('tally').hidden = true;
    $('detailBtn').textContent = '자세히 보기';

    const row = (label, val, minus) =>
      `<li><span>${label}</span><span class="t-val ${minus > 0 ? 't-minus' : 't-ok'}">${val}${
        minus > 0 ? '  −' + Math.round(minus) : ''}</span></li>`;
    $('tally').innerHTML =
      row('필름 아래 먼지', r.dustIn + '개', r.cut.dust) +
      row('중심 어긋남', Math.round(r.posErr) + 'px', r.cut.pos) +
      row('기울기', r.angErr.toFixed(1) + '°', r.cut.angle) +
      row('남은 기포', r.bubbles + '개', r.cut.bubble) +
      row('액정 밖 삐져나감', r.out + '곳', r.cut.overhang);

    drawZoom();
    $('nextBtn').hidden = state.stageIdx >= STAGES.length - 1;
    $('resultScreen').classList.add('active');
  }

  /* 결과용 확대 렌더 — 액정만 잘라서 크게 보여 준다(펀치라인).
     draw* 들이 상위 ctx 를 쓰므로 잠시 확대 캔버스로 바꿔 끼운 뒤 되돌린다. */
  function drawZoom() {
    const z = $('zoomCv'), zc = z.getContext('2d');
    const s = screenRect();
    const k = Math.min(z.width / s.w, z.height / s.h) * .96;

    zc.fillStyle = '#0B1220';
    zc.fillRect(0, 0, z.width, z.height);
    zc.save();
    zc.translate(z.width / 2, z.height / 2);
    zc.scale(k, k);
    zc.translate(-(s.x + s.w / 2), -(s.y + s.h / 2));

    const real = ctx;
    ctx = zc;
    try {
      drawPhone(); drawDusts(); drawFilm(false); drawBubbles();
    } finally {
      ctx = real;
    }
    zc.restore();
  }

  /* ============================================================
     화면 전환 / 시작
     ============================================================ */
  function buildStagePick() {
    $('stagePick').innerHTML = STAGES.map((s, i) =>
      `<button class="stage-card ${i === state.stageIdx ? 'on' : ''}" type="button" data-i="${i}">
         <span class="sc-no">STAGE ${i + 1}</span>${s.name}
         <span class="sc-dev">${s.device.label} · 먼지 ${s.dust.count} · 기포 ${s.bubble.count}</span>
         <span class="sc-dev">${s.gimmick.guide ? '가이드 있음' : '가이드 없음'}</span>
       </button>`).join('');
    [...$('stagePick').children].forEach(b =>
      b.addEventListener('click', () => {
        state.stageIdx = +b.dataset.i;
        buildStagePick();
      }));
  }

  function play(i) {
    setupStage(i);
    $('startScreen').classList.remove('active');
    $('resultScreen').classList.remove('active');
    goDust();
  }

  $('startBtn').addEventListener('click', () => play(state.stageIdx));
  $('retryBtn').addEventListener('click', () => play(state.stageIdx));
  $('nextBtn').addEventListener('click', () =>
    play(Math.min(STAGES.length - 1, state.stageIdx + 1)));
  $('detailBtn').addEventListener('click', () => {
    const t = $('tally');
    t.hidden = !t.hidden;
    $('detailBtn').textContent = t.hidden ? '자세히 보기' : '접기';
    // 펼치면 새로 생긴 항목이 보이도록 패널을 내려 준다
    if (!t.hidden) requestAnimationFrame(() => {
      const panel = t.parentElement;
      panel.scrollTop = panel.scrollHeight;
    });
  });

  /* 부팅 */
  setupStage(0);
  buildStagePick();
  $('timer').classList.add('idle');
  tick();
})();
