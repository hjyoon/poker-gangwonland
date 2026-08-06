# 강원랜드 텍사스 홀덤 React 프로젝트

이 프로젝트는 `AGENTS.md` 기준을 따라 강원랜드 텍사스 홀덤 규칙을 초보자도 확인할 수 있게 정리하고, 웹 시뮬레이터로 구성했습니다.

## 실행

```bash
npm install
npm run dev
```

개발용 실행 스크립트를 직접 사용할 수도 있습니다.

```bash
npm run dev:local
```

포트를 바꾸려면 아래처럼 실행합니다.

```bash
PORT=3100 npm run dev:local
```

## Docker

Docker 이미지는 Bun으로 React/Vite 정적 프론트엔드를 빌드하고, Go 서버를 정적 바이너리로 컴파일한 뒤, `gcr.io/distroless/static-debian12:nonroot` 런타임에서 실행합니다.

```bash
docker build -t poker-gangwonland:latest .
docker run --rm -p 3000:3000 poker-gangwonland:latest
```

개발 실행과 Docker 런타임 모두 Vite 정적 빌드를 Go 서버가 서빙합니다. 같은 Go 서버가 `/ws` 멀티플레이 룸, 좌석 예약, 게임 액션, 다음 핸드 진행까지 처리합니다.

멀티플레이에서는 앱 진행용 멀티 테이블 프리즈아웃 토너먼트를 만들 수 있습니다. 최초 참가자 수에는 인간과 컴퓨터가 모두 포함되며, 서버가 참가자를 테이블당 최대 8명으로 무작위 균등 배치합니다. 연결이 끊어진 인간 참가자는 탈락하지 않고 블라인드를 계속 납부하며 재접속 전까지 자동 폴드됩니다. 이 토너먼트 구조는 강원랜드 공식 운영 규정이 아니라 현재 앱 규칙을 이용한 진행 기능입니다.

E2E 검사는 Playwright로 실행합니다.

```bash
npm run test:e2e
```

Playwright 실행 시 포커 로직의 랜덤 요소는 테스트 seed로 고정됩니다.

E2E 커버리지 수집은 별도 명령으로 실행합니다.

```bash
npm run test:e2e:coverage
```

이 명령은 기존 E2E와 같은 `E2E_RANDOM_SEED=playwright-e2e` seed를 유지하면서 Chromium 브라우저 JS/CSS 커버리지를 수집합니다. 추가로 Go WebSocket 서버 integration harness와 포커 판정/액션 로직 coverage harness를 실행합니다. 결과는 `coverage/e2e/summary.json`, `coverage/e2e/client-coverage.json`, `coverage/e2e/istanbul-summary.json`, `coverage/e2e/istanbul-coverage.json`에 JSON으로 저장되고, 원본 브라우저 커버리지는 `coverage/e2e/raw/client/`, 포커 엔진 V8 raw 파일은 `coverage/e2e/raw/engine-v8/`, 의미 있는 E2E 시나리오 기록은 `coverage/e2e/meaningful/` 아래에 생성됩니다. `coverage/` 디렉터리는 git 추적 대상에서 제외됩니다.

커버리지 명령은 다음 조건을 100% threshold로 강제합니다.

- Chromium client JS byte coverage
- Chromium client CSS used-range byte coverage
- Poker engine Node raw V8 byte coverage
- 명시된 의미 있는 E2E 시나리오 coverage (`summary.json`의 `meaningful`)

커버리지 수집의 알려진 제한은 다음과 같습니다.

- Chromium 전용 브라우저 커버리지입니다.
- 기본 요약은 byte/range 커버리지입니다.
- JS 원본 파일 진단용으로 `v8-to-istanbul` 변환 결과를 별도 JSON artifact에 저장하며, `istanbul-summary.json`에는 client/engine/combined 작성 코드 요약을 함께 기록합니다.
- 클라이언트 JS의 기본 커버리지는 원본 `components/poker-app.jsx`의 line coverage가 아니라 브라우저에서 실행된 Vite 번들 기준으로 측정됩니다.
- `v8-to-istanbul` 작성 코드 요약은 source map과 Vite 번들 특성상 진단용 artifact이며 threshold로 강제하지 않습니다.
- CSS headline percentage는 Playwright가 보고한 used range 기준이며, emitted source byte 수를 함께 기록합니다.
- Go 서버는 raw WebSocket integration harness로 검증하고, 포커 룰 엔진은 별도 JS harness의 V8 raw coverage로 측정합니다.

## 구현 범위

- `git init` 완료
- React 19 + Vite 단일 페이지 앱 구조
- 앱 진행용 상대 선택 UI. 이 값은 강원랜드 좌석 수 규정이 아닙니다.
- 프리 플랍 (Pre-flop) → 플랍 (Flop) → 턴 (Turn) → 리버 (River)
- 스몰 블라인드 2,000원 / 빅 블라인드 5,000원
- 단계별 베팅 상한
  - 프리 플랍: 5,000 → 10,000 → 15,000
  - 플랍: 5,000 → 10,000 → 15,000
  - 턴: 10,000 → 20,000 → 30,000
  - 리버: 10,000 → 20,000 → 30,000 → 40,000(캡)
- 1인 기준 최대 베팅 100,000원
- 쇼다운 후 수수료 5% 차감 정산
- 인간과 컴퓨터를 합쳐 최대 64명으로 시작하는 멀티 테이블 프리즈아웃 토너먼트
- 테이블당 최대 8명 무작위 균등 배치와 핸드 경계 재배치
- 토너먼트 참가자 전체 순위, 테이블 현황, 연결 끊김 자동 폴드 및 재접속

## 주의

- 제공된 기준에는 사이드 팟, 올인, 좌석별 세부 카지노 운영 규칙, 번(Burn)의 구체 설명이 명시되어 있지 않아 공식 규칙처럼 추가하지 않았습니다.
- 동률 정산은 앱 진행용으로 팟을 동률 승자에게 나누고 각자 몫에서 수수료 5%를 차감합니다.
- 카드 서열 표시는 하이 카드까지 포함한 `AGENTS.md` 기준을 유지했습니다.
- 컴퓨터 행동 선택은 앱 진행용 자동화이며 전략 조언이 아닙니다.
