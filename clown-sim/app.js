/* ===== 삐연시 · 씬 진행 엔진 =====
 * 로드 순서: characters.js → story.js → app.js
 * window.STORY(story.js) 의 스키마를 그대로 읽는다.
 *   scenes[]  … type "vn" | "chat"
 *   sprite    … "캐릭터id:표정" (예 "bbidol:happy")
 *   choices[] … { label, effect:{캐릭터id:+n}, next }
 *   next      … 다음 씬 id, 또는 "RESOLVE"
 *   endings{} … { title, kicker, sprite, text }
 *   resolveEnding(aff, finalPick) → 엔딩 id
 * story.js 를 새 원고로 갈아끼워도 이 파일은 고칠 필요가 없다. */

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const S = window.STORY;

  /* 게이지가 꽉 차는 기준 = 한 캐릭터에게 몰아줬을 때 도달하는 최고점 */
  const GAUGE_MAX = 9;
  /* resolveEnding 의 굿엔딩 임계치(GOOD). 게이지에 눈금으로 표시한다. */
  const GOOD_MARK = 6;
  /* 같은 캐릭터의 표정이 바뀔 때 겹쳐서 넘기는 시간(ms).
     style.css 의 .char { transition: opacity } 와 맞춰 둘 것. */
  const CHAR_FADE = 550;
  const TYPE_SPEED = 30;      // 글자 하나 찍는 간격(ms)
  const BUBBLE_GAP = 240;     // 말풍선 사이 텀(ms)
  const TYPING_IND = 520;     // '입력 중' 인디케이터 노출 시간(ms)

  /* 배경별 메신저 시각 — 배경과 시간대를 맞춘다 */
  const CHAT_CLOCK = { phone: [23, 14], phone_dark: [2, 47], phone_bright: [7, 22] };

  const SEEN_KEY = 'ccojik_clownsim_endings';

  const state = {
    aff: {},
    finalPick: null,
    sceneId: null,
    chars: [],          // 무대에 올라와 있는 캐릭터 [{id, el}]
    bgSlot: 'A',        // 현재 보이는 배경 레이어
    clock: [0, 0],
  };

  const sceneById = {};
  S.scenes.forEach(s => { sceneById[s.id] = s; });

  let typer = null, typingEl = null, typingFull = '', typingDone = null;
  let chatTimer = null;
  let pending = null;

  /* ============================================================
     저장 — 본 엔딩만 기록 (없어도 게임은 정상 작동)
     ============================================================ */
  function loadSeen() {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
    catch (e) { return new Set(); }
  }
  function markSeen(id) {
    try {
      const s = loadSeen(); s.add(id);
      localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
    } catch (e) { /* 저장 못 해도 그만 */ }
  }

  /* ============================================================
     sprite 문자열 파싱 — "bbidol:happy" → {id, mood}
     ============================================================ */
  function parseSprite(str) {
    if (!str) return null;
    const [id, mood] = String(str).split(':');
    if (!CHARACTERS[id]) return null;
    return { id: id, mood: mood || 'normal' };
  }

  /* 채워진 면 위에 올릴 글자색 — 배경이 밝으면 어두운 글씨로 자동 전환.
     삐용처럼 밝은 파스텔 캐릭터에서 흰 글씨가 안 읽히는 걸 막는다. */
  function inkOn() {
    let sum = 0;
    for (const hex of arguments) {
      const n = parseInt(String(hex).slice(1), 16);
      sum += (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    }
    return (sum / arguments.length) > .6 ? '#2A1119' : '#FFF8EE';
  }

  /* 색을 어둡게(amt<0) / 밝게(amt>0). 이름표 리본에 입체감을 주는 데 쓴다. */
  function shade(hex, amt) {
    const n = parseInt(String(hex).slice(1), 16);
    const f = v => Math.max(0, Math.min(255,
      Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map(f).map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /* 이미지 우선, 실패하면 SVG 폴백. kind: 'sprite'(전신) | 'face'(아이콘)
     표정 이미지가 없으면 normal 이미지로 한 번 더 내려간 뒤 SVG 폴백으로 간다.
     — 일러스트를 표정별로 다 만들지 않아도 화면이 섞이지 않는다. */
  function paintInto(container, charId, mood, kind) {
    const ch = CHARACTERS[charId];
    if (!ch) { container.innerHTML = ''; return; }
    const isFace = kind === 'face';
    const chain = (isFace ? [ch.sprites.icon, ch.sprites.normal]
                          : [ch.sprites[mood], ch.sprites.normal])
                  .filter((v, i, a) => v && a.indexOf(v) === i);

    const img = new Image();
    img.alt = ch.name;
    let step = 0;
    img.onerror = () => {
      if (++step < chain.length) { img.src = chain[step]; return; }
      container.innerHTML = isFace ? fallbackFace(charId, mood) : fallbackSprite(charId, mood);
    };
    img.src = chain[0];
    container.innerHTML = '';
    container.appendChild(img);
  }

  /* ============================================================
     상단 호감도 HUD
     ============================================================ */
  function buildHud() {
    $('hud').innerHTML = CHAR_ORDER.map(id => {
      const c = CHARACTERS[id];
      return `<div class="hud-item" id="hud-${id}" style="--ring:${c.color}">
        <div class="hud-face" id="hudface-${id}"></div>
        <div class="hud-body">
          <div class="hud-top">
            <span class="hud-name" style="color:${c.colorSoft}">${c.name}</span>
            <span class="hud-val" id="hudval-${id}">0</span>
          </div>
          <div class="hud-track">
            <div class="hud-goal" style="left:${(GOOD_MARK / GAUGE_MAX) * 100}%"></div>
            <div class="hud-fill" id="hudfill-${id}"
                 style="background:linear-gradient(90deg,${c.color},${c.colorSoft})"></div>
            <svg class="hud-heart" id="hudheart-${id}" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21 C4 15.2 2 11.4 2 8.4 A5.4 5.4 0 0 1 12 5.6
                       A5.4 5.4 0 0 1 22 8.4 C22 11.4 20 15.2 12 21Z"
                    fill="${c.colorSoft}" stroke="#1A1016" stroke-width="1.4"/>
            </svg>
          </div>
        </div>
      </div>`;
    }).join('');
    CHAR_ORDER.forEach(id => paintInto($('hudface-' + id), id, 'normal', 'face'));
  }

  function renderHud(gained) {
    CHAR_ORDER.forEach(id => {
      const pct = Math.max(0, Math.min(100, (state.aff[id] / GAUGE_MAX) * 100));
      $('hudfill-' + id).style.width = pct + '%';
      $('hudheart-' + id).style.left = pct + '%';
      $('hudval-' + id).textContent = state.aff[id];
      $('hud-' + id).classList.toggle('on', state.aff[id] > 0);
    });
    if (gained) {
      const box = $('hud-' + gained);
      box.classList.remove('gain');
      void box.offsetWidth;
      box.classList.add('gain');
      setTimeout(() => box.classList.remove('gain'), 750);
    }
  }

  /* ============================================================
     배경 — 두 레이어를 번갈아 쓰며 크로스페이드
     ============================================================ */
  function setBg(bg) {
    if (!bg) return;
    const cur = $('bg' + state.bgSlot);
    if (cur.dataset.bg === bg && cur.classList.contains('on')) return;

    const nextSlot = state.bgSlot === 'A' ? 'B' : 'A';
    const nxt = $('bg' + nextSlot);
    nxt.dataset.bg = bg;
    void nxt.offsetWidth;
    nxt.classList.add('on');
    cur.classList.remove('on');
    state.bgSlot = nextSlot;
  }

  /* ============================================================
     캐릭터 — 여러 명을 세울 수 있는 구조.
     말하는 캐릭터만 밝게(.dim 없음), 나머지는 어둡게(.dim).
     지금 스토리는 한 씬에 한 명이지만 레이어는 그대로 쓴다.
     ============================================================ */
  function setStage(spriteStr) {
    const layer = $('charLayer');
    const want = parseSprite(spriteStr);

    // 캐릭터가 없는 씬(나레이션 등) — 있던 캐릭터는 퇴장
    if (!want) { clearChars(); return; }

    const cur = state.chars[0];
    if (cur && cur.id === want.id) {
      cur.el.classList.remove('dim');
      if (cur.mood === want.mood) return;   // 같은 그림이면 손대지 않는다

      // 같은 캐릭터의 표정 변화 — 새 그림을 위에 겹쳐 크로스페이드.
      // 삐노가 가면을 내리는 장면처럼 구도가 같은 컷이 부드럽게 이어진다.
      const next = document.createElement('div');
      next.className = 'char';
      next.style.opacity = '0';
      layer.appendChild(next);
      paintInto(next, want.id, want.mood, 'sprite');
      void next.offsetWidth;                // 첫 프레임을 확정시켜 transition 을 태운다
      next.style.opacity = '';              // .char 기본값(1)으로 돌아가며 페이드인

      const old = cur.el;
      old.classList.add('exit');
      setTimeout(() => old.remove(), CHAR_FADE);

      state.chars = [{ id: want.id, mood: want.mood, el: next }];
      motion(next, want.mood);
      return;
    }

    clearChars();
    const el = document.createElement('div');
    el.className = 'char enter';
    layer.appendChild(el);
    paintInto(el, want.id, want.mood, 'sprite');
    state.chars = [{ id: want.id, mood: want.mood, el: el }];
    motion(el, want.mood);
  }

  function clearChars() {
    state.chars.forEach(c => {
      c.el.classList.add('exit');
      setTimeout(() => c.el.remove(), CHAR_FADE);
    });
    state.chars = [];
  }

  /* 감정에 따른 미세 모션 */
  function motion(el, mood) {
    el.classList.remove('m-angry', 'm-shy', 'm-happy');
    void el.offsetWidth;
    if (mood === 'angry') el.classList.add('m-angry');
    else if (mood === 'shy') el.classList.add('m-shy');
    else if (mood === 'happy') el.classList.add('m-happy');
  }

  /* ============================================================
     타이핑
     ============================================================ */
  function startType(el, text, done) {
    clearInterval(typer);
    typingEl = el; typingFull = text; typingDone = done;
    el.textContent = '';
    el.classList.add('typing');
    let i = 0;
    typer = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) endType();
    }, TYPE_SPEED);
  }

  function endType() {
    clearInterval(typer);
    typer = null;
    if (typingEl) {
      typingEl.textContent = typingFull;
      typingEl.classList.remove('typing');
      typingEl = null;
    }
    const fn = typingDone;
    typingDone = null;
    if (fn) fn();
  }

  /* ============================================================
     씬 렌더
     ============================================================ */
  function goto(id) {
    if (id === 'RESOLVE') { resolve(); return; }
    const sc = sceneById[id];
    if (!sc) { resolve(); return; }

    state.sceneId = id;
    setBg(sc.bg);
    hideChoices();
    $('nextMark').classList.remove('on');
    $('tapHint').classList.remove('on');

    if (sc.type === 'chat') renderChat(sc);
    else renderVN(sc);
  }

  /* ---- vn 씬 ---- */
  function renderVN(sc) {
    $('chatView').classList.add('off');
    $('dialogue').classList.remove('off');

    const sp = parseSprite(sc.sprite);
    setStage(sc.sprite);

    const name = sc.speaker || '';
    const tag = $('nametag');
    if (name) {
      tag.classList.remove('off');
      $('nametagText').textContent = name;
      // 이름표 색은 스프라이트 캐릭터를 따른다. 캐릭터가 없으면(단장 등) 와인색.
      if (sp) {
        // 리본 그라데이션은 글씨색 반대쪽으로만 벌린다.
        // 흰 글씨면 아래로 어둡게, 검은 글씨(밝은 캐릭터)면 위로 밝게 —
        // 어느 쪽이든 대비가 캐릭터 색 기준 아래로 떨어지지 않는다.
        const c = CHARACTERS[sp.id];
        const ink = inkOn(c.color);
        tag.style.background = ink === '#2A1119'
          ? `linear-gradient(180deg, ${shade(c.color, .14)}, ${c.color})`
          : `linear-gradient(180deg, ${c.color}, ${shade(c.color, -.22)})`;
        tag.style.color = ink;
      } else {
        tag.style.background = 'linear-gradient(180deg, #5C1A26, #3E1826)';
        tag.style.color = '#FFF6EA';
      }
    } else {
      tag.classList.add('off');
    }
    $('line').classList.toggle('narrate', !name);

    startType($('line'), sc.text || '', () => afterText(sc));
  }

  /* ---- chat 씬 ---- */
  function renderChat(sc) {
    clearChars();
    $('dialogue').classList.add('off');
    $('chatView').classList.remove('off');

    // 상단바 — 상대 프로필
    const first = (sc.chat || []).find(m => m.side === 'them');
    const partner = first ? idOfName(first.name) : null;
    $('chatTitle').textContent = first ? first.name : '';
    if (partner) paintInto($('chatAvatar'), partner, 'normal', 'face');
    else $('chatAvatar').innerHTML = '';

    // 시각 초기화 — 배경에 맞춘 시간대
    state.clock = (CHAT_CLOCK[sc.bg] || [22, 0]).slice();

    const scroll = $('chatScroll');
    scroll.innerHTML = '';

    const list = sc.chat || [];
    let i = 0;

    function step() {
      if (i >= list.length) { afterText(sc); return; }
      const m = list[i++];

      if (m.side === 'me') {
        const b = addBubble('me', m.name, '');
        startType(b, m.text || '', () => {
          scroll.scrollTop = scroll.scrollHeight;
          chatTimer = setTimeout(step, BUBBLE_GAP);
        });
        return;
      }
      // 상대는 '입력 중' 인디케이터를 먼저 보여준다
      const ind = addTypingIndicator(m.name);
      chatTimer = setTimeout(() => {
        ind.remove();
        const b = addBubble('them', m.name, '');
        startType(b, m.text || '', () => {
          scroll.scrollTop = scroll.scrollHeight;
          chatTimer = setTimeout(step, BUBBLE_GAP);
        });
      }, TYPING_IND);
    }
    step();
  }

  function idOfName(name) {
    return CHAR_ORDER.find(k => CHARACTERS[k].name === name) || null;
  }
  /* 채워진 면(말풍선 배경)용 색 */
  function colorOfName(name) {
    const id = idOfName(name);
    return id ? CHARACTERS[id].color : '#7A2233';
  }
  /* 어두운 배경 위 텍스트(대화방 이름)용 밝은 색 */
  function softOfName(name) {
    const id = idOfName(name);
    return id ? CHARACTERS[id].colorSoft : '#B05C6B';
  }

  /* 메시지마다 1~2분씩 흐르게 */
  function tickClock() {
    state.clock[1] += 1 + Math.floor(Math.random() * 2);
    if (state.clock[1] >= 60) { state.clock[1] -= 60; state.clock[0] = (state.clock[0] + 1) % 24; }
    const h = state.clock[0], m = state.clock[1];
    const ampm = h < 12 ? '오전' : '오후';
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${ampm} ${hh}:${String(m).padStart(2, '0')}`;
  }

  function addBubble(side, name, text) {
    const scroll = $('chatScroll');
    const row = document.createElement('div');
    row.className = 'chat-row ' + (side === 'me' ? 'me' : 'them');

    if (side !== 'me' && name) {
      const who = document.createElement('div');
      who.className = 'chat-who';
      who.textContent = name;
      who.style.color = softOfName(name);
      row.appendChild(who);
    }

    const wrap = document.createElement('div');
    wrap.className = 'bubble-row';

    const b = document.createElement('div');
    b.className = 'bubble ' + (side === 'me' ? 'me' : 'them');
    if (side !== 'me') {
      const col = colorOfName(name);
      b.style.background = col;
      b.style.color = inkOn(col);          // 밝은 캐릭터면 글씨가 어두워진다
      b.style.setProperty('--bub', col);   // 말풍선 꼬리 색
    }
    b.textContent = text;

    const t = document.createElement('span');
    t.className = 'bubble-time';
    t.textContent = tickClock();

    wrap.appendChild(b);
    wrap.appendChild(t);
    row.appendChild(wrap);
    scroll.appendChild(row);
    scroll.scrollTop = scroll.scrollHeight;
    return b;
  }

  function addTypingIndicator(name) {
    const scroll = $('chatScroll');
    const ind = document.createElement('div');
    ind.className = 'typing-ind';
    ind.style.background = colorOfName(name);
    ind.innerHTML = '<span></span><span></span><span></span>';
    scroll.appendChild(ind);
    scroll.scrollTop = scroll.scrollHeight;
    return ind;
  }

  /* 대사 출력이 끝난 뒤 */
  function afterText(sc) {
    $('chatScroll').scrollTop = $('chatScroll').scrollHeight;
    if (sc.choices && sc.choices.length) showChoices(sc);
    else waitTap(sc.type === 'chat', () => goto(sc.next));
  }

  function waitTap(isChat, fn) {
    pending = fn;
    if (isChat) $('tapHint').classList.add('on');
    else $('nextMark').classList.add('on');
  }

  /* ---- 선택지 (화면 중앙) ---- */
  function showChoices(sc) {
    const box = $('choices');
    box.innerHTML = '';
    sc.choices.forEach(ch => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      b.textContent = ch.label;
      b.addEventListener('click', e => { e.stopPropagation(); pick(sc, ch, b); });
      box.appendChild(b);
    });
    $('choiceLayer').hidden = false;
  }

  function hideChoices() {
    $('choiceLayer').hidden = true;
    $('choices').innerHTML = '';
  }

  function pick(sc, ch, btn) {
    // 선택 연출: 고른 것은 반짝인 뒤 사라지고, 나머지는 조용히 사라진다
    [...$('choices').children].forEach(el => {
      el.disabled = true;
      el.classList.add(el === btn ? 'picked' : 'fade');
    });

    let gained = null;
    const effect = ch.effect || {};
    Object.keys(effect).forEach(id => {
      if (!(id in state.aff)) return;
      state.aff[id] += effect[id];
      if (state.aff[id] < 0) state.aff[id] = 0;
      if (effect[id] > 0) gained = id;
    });
    renderHud(gained);

    if (ch.next === 'RESOLVE') {
      state.finalPick = CHAR_ORDER.find(id => id in effect) || null;
    }

    setTimeout(() => {
      hideChoices();
      if (sc.type === 'chat') {
        const b = addBubble('me', '나', '');
        startType(b, ch.label, () => waitTap(true, () => goto(ch.next)));
        return;
      }
      goto(ch.next);
    }, 430);
  }

  /* ============================================================
     엔딩
     ============================================================ */
  function resolve() {
    const id = S.resolveEnding(state.aff, state.finalPick);
    const e = S.endings[id] || S.endings.e_solo;
    markSeen(id);

    const art = $('endArt');
    art.innerHTML = '';
    const sp = parseSprite(e.sprite);
    if (sp) paintInto(art, sp.id, sp.mood, 'sprite');
    else art.innerHTML = '<div class="end-mark"></div>';

    $('endKicker').textContent = e.kicker || 'Ending';
    $('endTitle').textContent = e.title;
    $('endText').textContent = e.text;
    $('endScore').textContent =
      CHAR_ORDER.map(k => `${CHARACTERS[k].name} ${state.aff[k]}`).join('   ');

    show('endScreen');
  }

  function buildEndingList() {
    const seen = loadSeen();
    const keys = Object.keys(S.endings);
    $('endingList').innerHTML = keys.map((k, i) => {
      const e = S.endings[k], got = seen.has(k);
      return `<li class="${got ? 'got' : ''}">
        <span class="el-no">${String(i + 1).padStart(2, '0')}</span>
        <span class="el-name">${got ? e.title : '— 미공개 —'}</span>
        <span class="el-tag">${got ? (e.kicker || '') : 'LOCKED'}</span>
      </li>`;
    }).join('');
  }

  /* ============================================================
     화면 전환
     ============================================================ */
  function show(which) {
    ['titleScreen', 'endScreen', 'listScreen'].forEach(s =>
      $(s).classList.toggle('active', s === which));
  }
  function hideAllScreens() {
    ['titleScreen', 'endScreen', 'listScreen'].forEach(s => $(s).classList.remove('active'));
  }
  function anyScreenOpen() {
    return ['titleScreen', 'endScreen', 'listScreen'].some(s => $(s).classList.contains('active'));
  }

  /* 타이틀 표지 CG. 파일이 없으면 레이어를 숨기고 기본 배경만 남긴다. */
  function buildCover() {
    const el = $('titleCover');
    const img = new Image();
    img.alt = '삐연시 표지';
    img.onerror = () => { el.classList.add('off'); };
    img.src = 'assets/cover.png';
    el.innerHTML = '';
    el.appendChild(img);
  }

  function reset() {
    CHAR_ORDER.forEach(id => { state.aff[id] = 0; });
    state.finalPick = null;
    pending = null;
    clearInterval(typer); typer = null;
    clearTimeout(chatTimer); chatTimer = null;
    typingEl = null; typingDone = null;
    state.chars.forEach(c => c.el.remove());
    state.chars = [];
    $('chatScroll').innerHTML = '';
    $('line').textContent = '';
    hideChoices();
    renderHud(null);
  }

  function start() {
    reset();
    hideAllScreens();
    goto(S.scenes[0].id);
  }

  /* ============================================================
     입력 — 화면을 누르면 진행 (타이핑 중이면 즉시 완성)
     ============================================================ */
  $('app').addEventListener('click', () => {
    if (anyScreenOpen()) return;
    if (!$('choiceLayer').hidden) return;      // 선택지가 떠 있으면 버튼으로만
    if (typer) { endType(); return; }
    if (pending) {
      const f = pending; pending = null;
      $('nextMark').classList.remove('on');
      $('tapHint').classList.remove('on');
      f();
    }
  });

  $('startBtn').addEventListener('click', e => { e.stopPropagation(); start(); });
  $('againBtn').addEventListener('click', e => {
    e.stopPropagation();
    reset();
    show('titleScreen');
  });
  $('listBtn').addEventListener('click', e => {
    e.stopPropagation();
    buildEndingList();
    show('listScreen');
  });
  $('listCloseBtn').addEventListener('click', e => {
    e.stopPropagation();
    show('endScreen');
  });

  /* 부트 */
  buildHud();
  reset();
  buildCover();
  setBg('circus');
})();
