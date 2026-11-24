# deco-cake 에셋

`assets.js` 의 `ASSET_MAP` 이 파일명을 그대로 들고 있다.
받은 파일명은 바꾸지 않았고, 폴더도 나누지 않았다 (평평하게 둔 그대로).

- `assets/` — **원본**. 1254×1254, 건드리지 않는다.
- `assets/opt/` — 게임이 읽는 최적화본. 투명 여백을 잘라 내고
  nearest-neighbor 로만 줄였다 (픽셀이 뭉개지지 않게). 4.9MB → 460KB.
  파일명은 원본과 같다.

원본을 갈아 끼우면 아래 한 줄로 최적화본을 다시 만든다.

    ffmpeg -y -i <원본> -vf "crop=W:H:X:Y,scale=288:-1:flags=neighbor" opt/<같은이름>

`crop` 값은 알파 여백을 뺀 칸이다. 토핑은 192, 짤주머니는 176 으로 줄였다.

## 쓰는 그림

| 쓰임 | 파일 |
|---|---|
| 시트 · 바닐라 | `cake-sheet-vanilla-pixel.png` |
| 시트 · 초코 | `cake-sheet-chocolate-pixel.png` |
| 시트 · 딸기 | `cake-sheet-strawberry-pixel.png` |
| 크림 · 화이트 | `piping-bag-cream-basic-pixel.png` |
| 크림 · 딸기 | `piping-bag-strawberry-pixel.png` |
| 크림 · 초코 | `piping-bag-chocolate-pixel.png` |
| 토핑 · 딸기 | `topping-strawberry-pair-pixel.png` |
| 토핑 · 체리 | `topping-cherry-pixel.png` |
| 토핑 · 초코컬 | `topping-choco-curl-pixel.png` |
| 토핑 · 스프링클 | `topping-sprinkles-rainbow.png` |

짤주머니 그림은 **고르는 카드와 주문서에만** 쓴다. 케이크 위에 올라가는
크림 층은 그림이 없어서 `app.js` 의 `paintCream` 이 작은 눈금(가로 48칸)에
직접 찍고 `image-rendering: pixelated` 로 키운다. 색은 `assets.js` 의
`CREAMS` 에 세 가지(본색 / 아랫단 그늘 / 광)로 들어 있다.

## 자리 값

`assets.js` 아래쪽에 있다. 시트 그림 상자를 1 로 본 비율이다.

- `CREAM_BOX` — 크림 층. 시트 윗면은 세로 0.06~0.70 구간이라 거기에 맞췄다.
- `POS_ANCHOR` / `layoutTopping` — 토핑 자리. 같은 주문이면 늘 같은 곳에 올라간다.

## 아직 없는 그림

게임은 없는 그림을 임의로 만들지 않는다. 아래가 들어오면 코드에 연결한다.

### 손님 (가장 먼저 필요)
손님 타입이 다섯이다 (일반 / 급함 / VIP / 까다로움 / 느긋). 지금은 번호가 적힌
색 네모 + 타입 딱지로 대신하고 있다. 말풍선과 등장 연출은 이미 있다.

| 파일(제안) | 내용 |
|---|---|
| `guest-normal-pixel.png` | 일반 손님 |
| `guest-rush-pixel.png` | 급한 손님 (땀, 시계) |
| `guest-vip-pixel.png` | VIP (정장, 모자) |
| `guest-picky-pixel.png` | 까다로운 손님 (팔짱) |
| `guest-easy-pixel.png` | 느긋한 손님 (웃음) |
| `guest-01-pixel.png` ~ `guest-06-pixel.png` | 같은 타입 안에서 돌려 쓸 얼굴 변형 |
| `guest-happy-pixel.png` / `guest-sad-pixel.png` | 결과 화면 반응 표정 (선택) |

### 가게 / 소품
| 파일(제안) | 내용 |
|---|---|
| `shop-counter-pixel.png` | 제작 화면 뒤에 깔 계산대 배경 |
| `coin-pixel.png` | 보유금 옆 동전 아이콘 |
| `lottery-ticket-pixel.png` | 복권 긁기 카드 (지금은 노란 CSS 카드) |
| `sign-open-pixel.png` / `sign-closed-pixel.png` | DAY 시작 · 정산 화면의 간판 (지금은 CSS 뱃지) |
| `item-hint-pixel.png` 등 | 아이템 8종 아이콘 (연·힌·다·메·방·팁·사·노). 지금은 글자 한 자를 넣은 색 타일 |
| `shop-ribbon-pixel.png` / `shop-case-pixel.png` / `shop-vase-pixel.png` / `shop-sign-pixel.png` | 가게 성장 장식. Day 5 / 10 / 15 / 20 에 해금만 되어 있고 그림이 없다 |

### 영업 시뮬레이션 (이번에 들어온 화면)
재료 카드와 품절 카드는 **기존 토핑·시트·짤주머니 그림을 그대로 쓴다** — 새로 필요한 것이 없다.
아래는 있으면 좋은 것들이다.

| 파일(제안) | 내용 |
|---|---|
| `heart-full-pixel.png` / `heart-empty-pixel.png` | 손님 인내심 게이지. 지금은 배경 장식과 같은 하트 clip-path 를 줄여 쓴다 |
| `star-pixel.png` | 가게 평판 별. 지금은 글자 `★` |
| `sold-out-pixel.png` | 품절 띠. 지금은 카드를 회색조로 바꾸고 "품절" 글자만 |
| `truck-pixel.png` | 긴급 구매 창 그림 (급히 사오는 느낌) |
| `receipt-pixel.png` | 마감 정산 카드 머리 장식 |

### 시트 추가 (선택)
주문에 쓸 수 있는 시트가 바닐라·초코·딸기 3종뿐이다.
`cake-sheet-matcha-pixel.png` 같은 시트가 늘면 기억할 거리가 자연스럽게 늘어난다.

### 사장님 캐릭터
`chef_great.png` 한 장만 있고 화풍이 2D 벡터라 픽셀 에셋과 어울리지 않는다.
픽셀로 다시 뽑는 편이 좋다. 표정은 `chef_good` / `chef_soso` / `chef_bad`.

## 사운드
아직 한 개도 없다. 더미는 만들지 않았다.
필요: 재료 올림 / 완성 / 손님 등장 / 돈 받기 / 복권 긁기 / Day 종료 /
재료 구매(계산대) / 품절 막힘 / 인내심 바닥.
