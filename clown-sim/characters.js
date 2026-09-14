/* ===== 삐연시 · 캐릭터 데이터 =====
 * 캐릭터를 추가하려면 CHARACTERS에 항목을 하나 더 넣고,
 * FALLBACK_PARTS에 같은 id로 파츠(헤어/분장)를 정의하면 된다.
 * 호감도 게이지는 CHAR_ORDER 순서대로 자동 생성된다.
 *
 * 색은 오토메 톤에 맞춰 저채도로 잡았다(원색 금지).
 * 저작권: 세 캐릭터 모두 오리지널 디자인. 기존 IP 광대 캐릭터와 무관. */

const CHARACTERS = {
  bbidol: {
    id: 'bbidol',
    name: '삐돌',
    personality: '우직하고 다정한 츤데레 큰형. 말은 무뚝뚝한데 손이 먼저 나간다.',
    // 일러스트 기준: 크림 블론드 + 카민 레드/화이트 다이아 + 골드 트림
    color: '#C73A4C',      // 카민 레드 — 채워진 면(말풍선·리본·게이지)
    colorSoft: '#E9868F',  // 어두운 배경 위 텍스트용 밝은 파생색
    skin: '#F7E4D3',
    // gift → 조화 한 송이를 내미는 장면 전용 (s_bbidol2)
    sprites: {
      normal: 'assets/bbidol_normal.png',
      gift:   'assets/bbidol_gift.png',
      happy:  'assets/bbidol_happy.png',
      angry:  'assets/bbidol_angry.png',
      shy:    'assets/bbidol_shy.png',
      icon:   'assets/bbidol_icon.png',   // 상단 게이지용 작은 얼굴(선택)
    },
  },
  noir: {
    id: 'noir',
    name: '삐노',
    personality: '말수 적은 시크한 나쁜남자. 분장을 지운 얼굴은 아무도 못 봤다.',
    // 일러스트 기준: 흑발 + 블랙/크림슨 다이아 + 골드 체인. 보라 요소는 없다.
    color: '#7A2233',      // 다크 버건디 — 삐돌보다 어둡게 잡아 게이지에서 구분
    colorSoft: '#C4788A',  // 어두운 HUD 배경에서도 이름이 읽히도록 충분히 밝게
    skin: '#EFDCCF',
    // 삐노만 2단 공개 구성이다.
    //   masked → 가면을 쓴 초반 모습 (s_noir1)
    //   normal → 가면을 내린 얼굴. 분장은 아직 (s_noir2 이후)
    //   happy  → 분장까지 지운 맨얼굴 (굿엔딩 e_noir)
    sprites: {
      masked: 'assets/noir_masked.png',
      normal: 'assets/noir_normal.png',
      happy:  'assets/noir_happy.png',
      angry:  'assets/noir_angry.png',
      shy:    'assets/noir_shy.png',
      icon:   'assets/noir_icon.png',
    },
  },
  ppyong: {
    id: 'ppyong',
    name: '삐용',
    personality: '방울 달린 삼각모를 쓴 막내. 하루에 백 마디쯤 한다.',
    // 일러스트 기준: 피치 헤어 + 파스텔 핑크/민트/옐로우 + 금별
    color: '#E8809B',      // 로즈 핑크 — 밝아서 말풍선 글씨는 자동으로 어두운 색이 된다
    colorSoft: '#F6B8C7',
    skin: '#FBE7D8',
    // fall → 재주를 넘다 넘어져 누운 채 고백하는 엔딩 전용 (e_ppyong)
    sprites: {
      normal: 'assets/ppyong_normal.png',
      happy:  'assets/ppyong_happy.png',
      fall:   'assets/ppyong_fall.png',
      angry:  'assets/ppyong_angry.png',
      shy:    'assets/ppyong_shy.png',
      icon:   'assets/ppyong_icon.png',
    },
  },
};

/* 게이지에 표시할 순서 */
const CHAR_ORDER = ['bbidol', 'noir', 'ppyong'];

/* ============================================================
 * 이미지 폴백 — assets에 png가 없을 때 대신 그리는 SVG 삐에로.
 * 캐릭터 color를 의상·머리에 반영하고, 표정 4종을 지원한다.
 * 실제 일러스트를 assets에 넣으면 자동으로 그쪽이 우선된다.
 * ============================================================ */

/* 캐릭터별 고유 파츠: 머리 위(헤어/모자) + 얼굴 분장 + 코 */
const FALLBACK_PARTS = {
  bbidol: {
    head: c => `
      <circle cx="52" cy="74" r="26" fill="${c}"/>
      <circle cx="148" cy="74" r="26" fill="${c}"/>
      <circle cx="100" cy="38" r="24" fill="${c}"/>
      <circle cx="70" cy="48" r="19" fill="${c}"/>
      <circle cx="130" cy="48" r="19" fill="${c}"/>`,
    paint: () => `
      <path d="M74 108 q6 14 0 20 q-6 -6 0 -20Z" fill="#2A1B33" opacity=".78"/>
      <path d="M126 108 q6 14 0 20 q-6 -6 0 -20Z" fill="#2A1B33" opacity=".78"/>`,
    nose: () => `<circle cx="100" cy="112" r="14" fill="#C0392E"/>
                 <circle cx="95" cy="107" r="4.5" fill="#fff" opacity=".5"/>`,
  },
  noir: {
    head: c => `
      <rect x="46" y="52" width="108" height="12" rx="6" fill="#221B2E"/>
      <rect x="66" y="12" width="68" height="44" rx="6" fill="#221B2E"/>
      <rect x="66" y="40" width="68" height="9" fill="${c}"/>`,
    paint: c => `
      <rect x="71" y="82" width="6" height="46" rx="3" fill="${c}" opacity=".9"/>
      <rect x="123" y="82" width="6" height="46" rx="3" fill="${c}" opacity=".9"/>`,
    nose: () => `<circle cx="100" cy="112" r="10" fill="#7C2E38"/>`,
  },
  ppyong: {
    head: c => `
      <path d="M100 22 L58 76 L142 76Z" fill="${c}"/>
      <path d="M100 22 L79 76 L58 76Z" fill="#2A1B33" opacity=".2"/>
      <rect x="52" y="70" width="96" height="12" rx="6" fill="#D4AF6A"/>
      <circle cx="100" cy="16" r="10" fill="#D4AF6A"/>`,
    paint: c => `
      <path d="M68 116 l10 -13 l10 13 l-10 13Z" fill="${c}"/>
      <path d="M112 116 l10 -13 l10 13 l-10 13Z" fill="${c}"/>`,
    nose: c => `<circle cx="100" cy="112" r="11" fill="${c}"/>
                <circle cx="96" cy="108" r="3.5" fill="#fff" opacity=".55"/>`,
  },
};

/* 표정 4종: 눈 + 입 */
const FALLBACK_FACES = {
  normal: `
    <circle cx="78" cy="98" r="6" fill="#2A1B33"/>
    <circle cx="122" cy="98" r="6" fill="#2A1B33"/>
    <path d="M80 138 q20 14 40 0" stroke="#2A1B33" stroke-width="5"
          fill="none" stroke-linecap="round"/>`,
  happy: `
    <path d="M70 100 q8 -12 16 0" stroke="#2A1B33" stroke-width="5.5"
          fill="none" stroke-linecap="round"/>
    <path d="M114 100 q8 -12 16 0" stroke="#2A1B33" stroke-width="5.5"
          fill="none" stroke-linecap="round"/>
    <path d="M74 134 q26 26 52 0 q-26 8 -52 0Z" fill="#2A1B33"/>`,
  angry: `
    <path d="M68 88 L90 96" stroke="#2A1B33" stroke-width="5.5" stroke-linecap="round"/>
    <path d="M132 88 L110 96" stroke="#2A1B33" stroke-width="5.5" stroke-linecap="round"/>
    <circle cx="80" cy="103" r="5.5" fill="#2A1B33"/>
    <circle cx="120" cy="103" r="5.5" fill="#2A1B33"/>
    <path d="M80 142 q20 -12 40 0" stroke="#2A1B33" stroke-width="5"
          fill="none" stroke-linecap="round"/>`,
  shy: `
    <path d="M70 100 q8 8 16 0" stroke="#2A1B33" stroke-width="5"
          fill="none" stroke-linecap="round"/>
    <path d="M114 100 q8 8 16 0" stroke="#2A1B33" stroke-width="5"
          fill="none" stroke-linecap="round"/>
    <ellipse cx="64" cy="120" rx="13" ry="8" fill="#C97B84" opacity=".55"/>
    <ellipse cx="136" cy="120" rx="13" ry="8" fill="#C97B84" opacity=".55"/>
    <path d="M92 138 q8 8 16 0" stroke="#2A1B33" stroke-width="5"
          fill="none" stroke-linecap="round"/>`,
};

/* 전신 스탠딩 SVG. app.js가 이미지 로드 실패 시 호출. */
function fallbackSprite(charId, mood) {
  const ch = CHARACTERS[charId];
  const p = FALLBACK_PARTS[charId];
  if (!ch || !p) return '';
  const c = ch.color;
  const face = FALLBACK_FACES[mood] || FALLBACK_FACES.normal;

  return `<svg class="fb-sprite" viewBox="0 0 200 260" role="img" aria-label="${ch.name}">
    <path d="M28 260 q10 -52 72 -52 q62 0 72 52Z" fill="${c}"/>
    <path d="M100 208 v52" stroke="#2A1B33" stroke-width="3" opacity=".22"/>
    <circle cx="82" cy="232" r="6" fill="#D4AF6A"/>
    <circle cx="118" cy="232" r="6" fill="#D4AF6A"/>
    <g fill="#F5EDE0">
      <circle cx="66" cy="196" r="17"/><circle cx="88" cy="203" r="19"/>
      <circle cx="112" cy="203" r="19"/><circle cx="134" cy="196" r="17"/>
    </g>
    ${p.head(c)}
    <ellipse cx="100" cy="112" rx="52" ry="56" fill="${ch.skin}"/>
    ${p.paint(c)}
    ${face}
    ${p.nose(c)}
  </svg>`;
}

/* 얼굴만 잘라낸 아이콘용 SVG. 상단 호감도 게이지에서 쓴다.
   전신과 같은 파츠를 쓰되 viewBox를 머리로 좁힌다. */
function fallbackFace(charId, mood) {
  const ch = CHARACTERS[charId];
  const p = FALLBACK_PARTS[charId];
  if (!ch || !p) return '';
  const c = ch.color;
  const face = FALLBACK_FACES[mood] || FALLBACK_FACES.normal;

  return `<svg class="fb-face" viewBox="40 14 120 150" role="img" aria-label="${ch.name}">
    ${p.head(c)}
    <ellipse cx="100" cy="112" rx="52" ry="56" fill="${ch.skin}"/>
    ${p.paint(c)}
    ${face}
    ${p.nose(c)}
  </svg>`;
}
