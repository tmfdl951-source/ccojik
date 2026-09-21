/* ===== 꼬직 · 보호필름 한 번에 붙이기 — 데이터 =====
 * 스테이지 / 등급 기준 / 한줄평 / 채점 가중치를 전부 여기 모아 둔다.
 * app.js 는 이 값만 읽으므로, 난이도 조절은 이 파일만 고치면 된다. */

/* ------------------------------------------------------------------
 * 채점 가중치 — 100점에서 깎는 방식.
 * 숫자를 키우면 그 항목이 더 아프게 깎인다.
 * ------------------------------------------------------------------ */
const SCORE = {
  base:      100,
  dust:        2.5,  // 필름 아래 갇힌 먼지 1개당
  pos:         0.6,  // 중심 위치 오차 1px 당 (허용 오차를 넘은 만큼만)
  angle:       2.5,  // 기울기 오차 1도 당 (허용 오차를 넘은 만큼만)
  bubble:      3,    // 남은 기포 1개당
  bubbleArea:  0.004,// 남은 기포 넓이(px²) 당 — 큰 기포가 조금 더 아프다
  overhang:   14,    // 필름이 액정 밖으로 삐져나간 모서리 1개당
};

/* ------------------------------------------------------------------
 * 스테이지 — 위에서 아래로 갈수록 어렵다.
 *   theme   : 배경 그림 키 (app.js 의 drawTheme 이 읽는다)
 *              subway / office / bus / dark
 *   gimmick : 방해 요소 스위치. 켜고 끄기만 하면 된다.
 *     guide    정렬 가이드(기준선·중앙 십자·수치) 표시 여부  ← STAGE 3부터 false
 *     shake    흔들림 강도 0~1.5. 0이면 없음. 필름과 커서가 실제로 밀린다
 *     passerby 사람이 지나가며 툭 치고 감 (정렬이 틀어진다)
 *     watcher  사수 감시. 쳐다보는 동안은 조작이 먹지 않는다
 *     dim      시야 제한 0~1. 커서 주변만 보인다
 *     sway     커브 쏠림. 좌우로 크게 기우뚱한다 (버스)
 *   device  : 액정 크기(px). 뒤로 갈수록 커져 붙일 면적이 넓어진다
 *   dust    : 먼지 개수 / 제거 제한시간(초)
 *   film    : 정렬 허용 오차 (tolPos=px, tolAngle=도) + 부착 제한시간(time, 초).
 *              시간 안에 못 붙이면 그 순간 상태 그대로 자동 부착된다(되돌리기 없음)
 *   bubble  : 기포 개수 / 밀어내기 제한시간(초)
 *
 * 난이도 곡선: 가이드 제거(3) → 시간 단축 → 먼지 증가 → 방해 중첩(4)
 * 스테이지를 추가하려면 항목을 하나 더 넣기만 하면 된다.
 * ------------------------------------------------------------------ */
const STAGES = [
  {
    name: '출근길 지하철',
    sub:  '2호선 합정역 구간, 곧 덜컹합니다',
    theme: 'subway',
    gimmick: { guide: true, shake: 0.55, passerby: true, watcher: false, dim: 0 },
    device: { w: 300, h: 600, label: '6.1인치' },
    dust:   { count: 8,  time: 6.0 },
    film:   { tolPos: 12, tolAngle: 3.0, time: 8.0 },
    bubble: { count: 7,  time: 8.0 },
  },
  {
    name: '사수가 뒤에서 보고 있음',
    sub:  '쳐다볼 때 손 멈추세요',
    theme: 'office',
    gimmick: { guide: true, shake: 0, passerby: false, watcher: true, dim: 0 },
    device: { w: 320, h: 650, label: '6.7인치' },
    dust:   { count: 11, time: 7.0 },   // 감시로 실제 작업 시간은 절반쯤
    film:   { tolPos: 10, tolAngle: 2.5, time: 6.5 },
    bubble: { count: 9,  time: 9.0 },
  },
  {
    name: '심야 광역버스 뒷자리',
    sub:  '가이드 없음 · 커브마다 쏠립니다',
    theme: 'bus',
    // 사람은 안 지나간다. 대신 흔들림이 STAGE 1 보다 훨씬 세고 커브 쏠림이 있다.
    gimmick: { guide: false, shake: 1.6, passerby: false, watcher: false, dim: 0, sway: true },
    device: { w: 340, h: 690, label: '6.9인치' },
    dust:   { count: 14, time: 5.0 },
    film:   { tolPos: 9,  tolAngle: 2.0, time: 5.5 },
    bubble: { count: 11, time: 6.5 },
  },
  {
    name: '정전된 방, 손전등 하나',
    sub:  '보이는 만큼만 붙이면 됩니다',
    theme: 'dark',
    gimmick: { guide: false, shake: 0.7, passerby: false, watcher: false, dim: 0.88 },
    device: { w: 470, h: 660, label: '11인치' },
    dust:   { count: 18, time: 4.5 },
    film:   { tolPos: 8,  tolAngle: 1.8, time: 5.0 },
    bubble: { count: 14, time: 6.0 },
  },
];

/* ------------------------------------------------------------------
 * 등급 — 위에서부터 검사해 처음 걸리는 것이 채택된다.
 * ------------------------------------------------------------------ */
const GRADES = [
  { min: 92, grade: 'S', color: '#FFB800', title: '대리점 스카우트' },
  { min: 78, grade: 'A', color: '#35B94E', title: '무난하게 성공' },
  { min: 60, grade: 'B', color: '#2AAEE6', title: '쓸 만은 합니다' },
  { min: 38, grade: 'C', color: '#F0803C', title: '눈에 좀 밟힘' },
  { min: -999, grade: 'F', color: '#EE4A34', title: '다시 사 오세요' },
];

/* ------------------------------------------------------------------
 * 한줄평 — 점수 구간별 풀에서 랜덤. 이모지 없이 꼬직 톤.
 * 멘트를 추가하려면 배열에 문자열만 넣으면 된다.
 * ------------------------------------------------------------------ */
const REMARKS = {
  bad: [                       // 38점 미만
    '기포로 지도를 그렸습니다',
    '먼지 표본 수집 성공',
    '차라리 안 붙인 게 나았어요',
    '필름이 액정을 피해 다녔네요',
    '이건 보호필름이 아니라 방해필름입니다',
    '떼고 다시 붙이면 더 나빠집니다. 그냥 쓰세요',
    '먼지를 못 지우니 기포가 그 위에 눌러앉았습니다',
    '이건 필름이 아니라 지문 채취 키트입니다',
    '기포로 세계지도 완성',
    '차라리 안 붙인 폰이 낫습니다',
  ],
  mid: [                       // 38 ~ 77점
    '합격점은 아니지만 봐줍니다',
    '햇빛 아래서는 보지 마세요',
    '먼지 두 개는 그냥 점이라고 우기면 됩니다',
    '미세하게 삐뚤어진 걸 본인만 압니다',
    '붉은 기포는 먼지가 갇힌 자리입니다. 1단계를 서두르셨군요',
    '쓸 순 있는데 왼쪽 위 기포가 평생 신경 쓰일 겁니다',
    '합격은 아니고 통과입니다',
  ],
  good: [                      // 78점 이상
    '센터 정중앙 기포 제로. 이 구역의 장인',
    '혹시 대리점 다니세요?',
    '이 정도면 남의 폰도 붙여줄 수 있습니다',
    '손 떨림 없는 사람의 결과물',
    '필름값이 아깝지 않은 하루',
    '이걸 한 번에 하셨다고요?',
  ],
};

/* 점수로 한줄평 풀 고르기 */
function pickRemark(score) {
  const pool = score >= 78 ? REMARKS.good : score >= 38 ? REMARKS.mid : REMARKS.bad;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* 점수로 등급 고르기 */
function pickGrade(score) {
  return GRADES.find(g => score >= g.min) || GRADES[GRADES.length - 1];
}
