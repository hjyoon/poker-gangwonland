# 강원랜드 텍사스 홀덤 Next.js 프로젝트

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

E2E 검사는 Playwright로 실행합니다.

```bash
npm run test:e2e
```

Playwright 실행 시 포커 로직의 랜덤 요소는 테스트 seed로 고정됩니다.

E2E 커버리지 수집은 별도 명령으로 실행합니다.

```bash
npm run test:e2e:coverage
```

이 명령은 기존 E2E와 같은 `E2E_RANDOM_SEED=playwright-e2e` seed를 유지하면서 Chromium 브라우저 JS/CSS 커버리지와 `server.mjs` Node V8 raw 커버리지를 수집합니다. 결과는 `coverage/e2e/summary.json`, `coverage/e2e/client-coverage.json`, `coverage/e2e/istanbul-summary.json`, `coverage/e2e/istanbul-coverage.json`에 JSON으로 저장되고, 원본 브라우저 커버리지는 `coverage/e2e/raw/client/`, 서버 V8 raw 파일은 `coverage/e2e/raw/server-v8/` 아래에 생성됩니다. `coverage/` 디렉터리는 git 추적 대상에서 제외됩니다.

커버리지 수집의 알려진 제한은 다음과 같습니다.

- Chromium 전용 브라우저 커버리지입니다.
- 기본 요약은 byte/range 커버리지입니다.
- JS 원본 파일 진단용으로 `v8-to-istanbul` 변환 결과를 별도 JSON artifact에 저장하며, `istanbul-summary.json`의 percentage는 observed covered construct 기준으로 정규화합니다.
- 클라이언트 JS는 원본 `components/poker-app.jsx`의 line coverage가 아니라 브라우저에서 실행된 Next.js 개발 번들 기준으로 측정됩니다.
- CSS headline percentage는 Playwright가 보고한 used range 기준이며, emitted source byte 수를 함께 기록합니다.
- `istanbul-summary.json`은 정규화 전 변환 총량을 `convertedTotal`, 미관측 변환 총량을 `uncoveredConverted`로 함께 기록합니다.
- 서버 커버리지는 custom server와 dev-server 동작이 포함된 Node V8 raw coverage입니다.
- 아직 커버리지 threshold는 적용하지 않습니다.

## 구현 범위

- `git init` 완료
- Next.js App Router 구조
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

## 주의

- 제공된 기준에는 사이드 팟, 올인, 좌석별 세부 카지노 운영 규칙, 번(Burn)의 구체 설명이 명시되어 있지 않아 공식 규칙처럼 추가하지 않았습니다.
- 동률 정산은 앱 진행용으로 팟을 동률 승자에게 나누고 각자 몫에서 수수료 5%를 차감합니다.
- 카드 서열 표시는 하이 카드까지 포함한 `AGENTS.md` 기준을 유지했습니다.
- 컴퓨터 행동 선택은 앱 진행용 자동화이며 전략 조언이 아닙니다.
