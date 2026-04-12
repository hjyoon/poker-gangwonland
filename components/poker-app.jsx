"use client";

import { useEffect, useMemo, useState } from "react";
import {
  STREETS,
  applyAction,
  chooseComputerAction,
  createInitialState,
  formatCard,
  formatMoney,
  getAvailableActions,
  startNewHand,
} from "../lib/poker";

const CARD_RANK_ROWS = [
  "1. 로열 플러쉬",
  "2. 스트레이트 플러쉬",
  "3. 포 오브 카인드",
  "4. 풀 하우스",
  "5. 플러쉬",
  "6. 스트레이트",
  "7. 쓰리 오브 카인드",
  "8. 투 페어",
  "9. 원 페어",
];

const TERM_ROWS = [
  ["스몰 블라인드 (Small Blind)", "강제 베팅 2,000원"],
  ["빅 블라인드 (Big Blind)", "강제 베팅 5,000원"],
  ["먹 (Pot)", "원문 기준 표현. 일반 포커 용어와 다를 수 있어 별도 운영 규정 확인 필요"],
  ["번 (Burn)", "공유 카드 공개 전 제외되는 카드"],
];

function Seat({ player, isTurn, revealCards, winner }) {
  return (
    <article className={`seat${player.folded ? " is-folded" : ""}${isTurn ? " is-turn" : ""}${winner ? " is-winner" : ""}`}>
      <header>
        <strong>{player.name}</strong>
        <span>{player.isHuman ? "사람" : "컴퓨터"}</span>
      </header>
      <div className="seat-cards">
        {player.cards.map((card, index) => (
          <div className="card" key={`${player.id}-${index}`}>
            {revealCards || player.isHuman || player.folded ? formatCard(card) : "🂠"}
          </div>
        ))}
      </div>
      <dl>
        <div>
          <dt>행동</dt>
          <dd>{player.lastAction}</dd>
        </div>
        <div>
          <dt>이번 핸드</dt>
          <dd>{formatMoney(player.totalContribution)}</dd>
        </div>
        <div>
          <dt>누적 승리</dt>
          <dd>{formatMoney(player.chipsWon)}</dd>
        </div>
      </dl>
    </article>
  );
}

function RulesPanel() {
  return (
    <section className="panel rules">
      <h2>강원랜드 기준 요약</h2>
      <p>
        52장 카드로 진행하며 개인 카드 2장과 공유 카드 5장을 조합합니다. 승리 방식은 상대를 폴드시키거나 쇼다운에서 더 높은 패를 만드는 것입니다.
      </p>
      <div className="rules-grid">
        <div>
          <h3>카드 서열</h3>
          <ul>
            {CARD_RANK_ROWS.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
          <p className="note">스트레이트에서 에이스는 가장 낮거나 가장 높은 카드로 계산될 수 있습니다.</p>
        </div>
        <div>
          <h3>블라인드</h3>
          <ul>
            <li>스몰 블라인드 (Small Blind): 2,000원</li>
            <li>빅 블라인드 (Big Blind): 5,000원</li>
          </ul>
          <h3>핵심 액션</h3>
          <ul>
            <li>폴드 (Fold): 게임 포기</li>
            <li>레이즈 (Raise): 기존 베팅보다 높게 추가 베팅</li>
            <li>콜 (Call): 현재 베팅 금액에 맞춤</li>
            <li>체크 (Check): 베팅 없이 순서 넘김</li>
          </ul>
          <p className="note">체크는 이전 베팅이 없을 때만 가능하며, 프리 플랍 (Pre-flop)에서는 블라인드가 이미 있어 체크가 불가능합니다.</p>
        </div>
      </div>
      <div>
        <h3>단계별 베팅 금액</h3>
        <table>
          <thead>
            <tr>
              <th>단계</th>
              <th>최초 베팅</th>
              <th>레이즈 증가</th>
              <th>최대 총 베팅</th>
              <th>예시</th>
            </tr>
          </thead>
          <tbody>
            {STREETS.map((street) => (
              <tr key={street.key}>
                <td>{street.label}</td>
                <td>{formatMoney(street.firstBet)}</td>
                <td>{formatMoney(street.raiseSize)}</td>
                <td>{formatMoney(street.maxBet)}</td>
                <td>{street.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rules-grid">
        <div>
          <h3>쇼다운 및 승패 결정</h3>
          <ul>
            <li>최종 베팅 이후 남아 있는 플레이어가 카드를 공개합니다.</li>
            <li>콜을 제외한 마지막 베팅 관련 액션을 한 플레이어부터 공개합니다.</li>
            <li>더 높은 패를 가진 플레이어가 승리합니다.</li>
            <li>승자는 전체 금액에서 수수료 5%를 제외한 칩스를 가져갑니다.</li>
          </ul>
        </div>
        <div>
          <h3>용어</h3>
          <table>
            <tbody>
              {TERM_ROWS.map(([name, value]) => (
                <tr key={name}>
                  <th>{name}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="note">1인 기준 한 게임당 최대 베팅 금액은 100,000원입니다.</p>
    </section>
  );
}

export default function PokerApp() {
  const [cpuCount, setCpuCount] = useState(3);
  const [dealerIndex, setDealerIndex] = useState(0);
  const [chipTotals, setChipTotals] = useState({});
  const [state, setState] = useState(() => createInitialState(3));

  useEffect(() => {
    if (state.finished || state.waitingForHuman) {
      return undefined;
    }
    const actor = state.players[state.currentPlayerIndex];
    if (!actor || actor.isHuman) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const action = chooseComputerAction(state);
      setState((current) => applyAction(current, action));
    }, 700);

    return () => window.clearTimeout(timer);
  }, [state]);

  const activeStreet = STREETS[state.streetIndex];
  const humanIndex = state.players.findIndex((player) => player.isHuman);
  const humanActions = getAvailableActions(state, humanIndex);
  const revealCards = state.finished;

  const showdownMap = useMemo(
    () => Object.fromEntries(state.showdownResults.map((entry) => [entry.id, entry.label])),
    [state.showdownResults],
  );

  function resetTable(nextCpuCount) {
    const nextState = startNewHand({
      cpuCount: nextCpuCount,
      dealerIndex: 0,
      chipTotals: {},
    });
    setCpuCount(nextCpuCount);
    setDealerIndex(0);
    setChipTotals({});
    setState(nextState);
  }

  function nextHand() {
    const nextDealerIndex = (dealerIndex + 1) % (cpuCount + 1);
    const nextState = startNewHand({
      cpuCount,
      dealerIndex: nextDealerIndex,
      chipTotals,
    });
    setDealerIndex(nextDealerIndex);
    setState(nextState);
  }

  function onHumanAction(action) {
    setState((current) => {
      const next = applyAction(current, action, humanIndex);
      setChipTotals(next.chipTotals ?? {});
      return next;
    });
  }

  useEffect(() => {
    if (state.finished) {
      setChipTotals(state.chipTotals ?? {});
    }
  }, [state]);

  return (
    <main className="app-shell">
      <section className="hero panel">
        <div>
          <p className="eyebrow">Gangwon Land Hold&apos;em</p>
          <h1>사람 1명 vs 컴퓨터 1~7명</h1>
          <p>
            총 8인 테이블까지 플레이할 수 있는 강원랜드 기준 텍사스 홀덤 시뮬레이터입니다. 베팅 금액은 프리 플랍/플랍 5,000원 단위, 턴/리버 10,000원 단위, 리버는 40,000원 캡(Cap)까지 반영했습니다.
          </p>
        </div>
        <div className="hero-controls">
          <label>
            컴퓨터 수
            <select value={cpuCount} onChange={(event) => resetTable(Number(event.target.value))}>
              {Array.from({ length: 7 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}명
                </option>
              ))}
            </select>
          </label>
          <button className="secondary" onClick={nextHand}>
            다음 핸드
          </button>
        </div>
      </section>

      <section className="table panel">
        <header className="table-header">
          <div>
            <h2>{activeStreet.label}</h2>
            <p>
              팟 {formatMoney(state.pot)} / 현재 베팅 {formatMoney(state.currentBet)}
            </p>
          </div>
          <div>
            <p>딜러: {state.players[state.dealerIndex]?.name}</p>
            <p>현재 턴: {state.players[state.currentPlayerIndex]?.name}</p>
          </div>
        </header>

        <div className="community">
          {state.communityCards.map((card, index) => (
            <div className="card large" key={`${card.id}-${index}`}>
              {formatCard(card)}
            </div>
          ))}
          {Array.from({ length: Math.max(0, 5 - state.communityCards.length) }, (_, index) => (
            <div className="card large is-empty" key={`empty-${index}`}>
              ?
            </div>
          ))}
        </div>

        <div className="seats">
          {state.players.map((player, index) => (
            <div key={player.id}>
              <Seat
                player={player}
                isTurn={state.currentPlayerIndex === index && !state.finished}
                revealCards={revealCards}
                winner={state.winnerIds.includes(player.id)}
              />
              {showdownMap[player.id] ? <p className="hand-label">{showdownMap[player.id]}</p> : null}
            </div>
          ))}
        </div>

        <section className="controls">
          <div>
            <h3>플레이어 행동</h3>
            <p>{state.waitingForHuman && !state.finished ? "사람 차례입니다." : "컴퓨터 진행 중이거나 핸드가 종료되었습니다."}</p>
          </div>
          <div className="action-row">
            {humanActions.map((action) => (
              <button
                key={action.key}
                onClick={() => onHumanAction(action.key)}
                disabled={!state.waitingForHuman || !action.enabled}
              >
                {action.label}
              </button>
            ))}
          </div>
          {state.finished ? (
            <p className="note">
              공개 순서: {state.revealOrder.map((id) => state.players.find((player) => player.id === id)?.name).join(" → ") || "즉시 종료"}
            </p>
          ) : null}
          <p className="note">{state.note}</p>
        </section>
      </section>

      <section className="panel log-panel">
        <h2>진행 로그</h2>
        <ol>
          {[...state.log].reverse().map((line, index) => (
            <li key={`${line}-${index}`}>{line}</li>
          ))}
        </ol>
      </section>

      <RulesPanel />

      <section className="panel step-panel">
        <h2>프로젝트 진행 순서</h2>
        <ol>
          <li>`git init`으로 저장소를 초기화했습니다.</li>
          <li>Next.js 앱 구조를 `app/`, `components/`, `lib/`로 분리했습니다.</li>
          <li>강원랜드 기준 블라인드, 단계별 베팅 금액, 1인 최대 100,000원을 엔진에 고정했습니다.</li>
          <li>사람 1명과 컴퓨터 최대 7명이 참여하는 8인 테이블 UI를 구성했습니다.</li>
          <li>프리 플랍, 플랍, 턴, 리버, 쇼다운과 수수료 5% 정산을 연결했습니다.</li>
        </ol>
      </section>
    </main>
  );
}
