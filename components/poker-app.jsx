"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  COMPUTER_LEVELS,
  COMPUTER_LEVEL_OPTIONS,
  COMPUTER_STYLE_OPTIONS,
  COMPUTER_STYLES,
  MIN_PLAYABLE_BALANCE,
  STREETS,
  applyAction,
  calculateFee,
  chooseComputerAction,
  formatCard,
  formatMoney,
  getAvailableActions,
  resolveComputerLevelKey,
  resolveComputerStyleKey,
  startNewHand,
} from "../lib/poker";

const DEFAULT_STARTING_BALANCE = 100000;
const MAX_TOTAL_PLAYERS = 8;
const DEFAULT_COMPUTER_ACTION_DELAY_MS = 700;
const DEFAULT_NEXT_HAND_DELAY_MS = 1800;
const DEFAULT_HUMAN_ACTION_TIMEOUT_MS = 15000;
const MIN_COMPUTER_ACTION_DELAY_MS = 100;
const MAX_COMPUTER_ACTION_DELAY_MS = 3000;
const MIN_NEXT_HAND_DELAY_MS = 500;
const MAX_NEXT_HAND_DELAY_MS = 10000;
const MIN_HUMAN_ACTION_TIMEOUT_MS = 3000;
const MAX_HUMAN_ACTION_TIMEOUT_MS = 60000;
const MIN_MULTIPLAYER_HUMAN_SLOTS = 2;
const MAX_MULTIPLAYER_HUMAN_SLOTS = MAX_TOTAL_PLAYERS;
const MULTIPLAYER_RECONNECT_DELAY_MS = 1500;
const SETUP_MODE_OPTIONS = [
  { key: "single", label: "싱글플레이" },
  { key: "multiplayer", label: "멀티플레이" },
];
const SINGLEPLAY_SETUP_TABS = [
  { key: "game", label: "게임 설정" },
  { key: "rules", label: "규칙 요약" },
];
const MULTIPLAYER_SETUP_TABS = [
  { key: "multiplayer", label: "멀티플레이" },
  { key: "game", label: "게임 설정" },
  { key: "rules", label: "규칙 요약" },
];
const MULTIPLAYER_LOBBY_TABS = [{ key: "multiplayer", label: "멀티플레이" }];
const MULTIPLAYER_JOIN_SETUP_TABS = [
  { key: "multiplayer", label: "멀티플레이" },
  { key: "rules", label: "규칙 요약" },
];
const MULTIPLAYER_LOBBY_MODES = [
  { key: "create", label: "룸 만들기" },
  { key: "join", label: "룸 참가" },
];
const GAME_INFO_TABS = [
  { key: "log", label: "진행 로그" },
  { key: "rules", label: "규칙 요약" },
  { key: "progress", label: "구현 기록" },
];
const ACTIVE_GAME_TABS = [
  { key: "table", label: "게임 테이블" },
  { key: "settings", label: "게임 설정" },
  { key: "info", label: "보조 정보" },
];

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
  "10. 하이 카드",
];

const TERM_ROWS = [
  ["스몰 블라인드 (Small Blind)", "강제 베팅 2,000원"],
  ["빅 블라인드 (Big Blind)", "강제 베팅 5,000원"],
  ["먹 (Pot)", "원문 기준 표현. 일반 포커 용어와 다를 수 있어 별도 운영 규정 확인 필요"],
  ["번 (Burn)", "제공된 기준에는 구체 설명이 명시되어 있지 않아 별도 운영 규정 확인 필요"],
];

function humanSlotId(index) {
  return `human-slot-${index + 1}`;
}

function buildComputerSetupPlayers(cpuCount) {
  return Array.from({ length: cpuCount }, (_, index) => ({
    id: `cpu-${index + 1}`,
    name: `컴퓨터 ${index + 1}`,
    isHuman: false,
  }));
}

function buildBaseSetupPlayers(cpuCount, includeHuman = true) {
  const cpuPlayers = buildComputerSetupPlayers(cpuCount);
  if (!includeHuman) {
    return cpuPlayers;
  }

  return [
    {
      id: "human",
      name: "플레이어",
      isHuman: true,
    },
    ...cpuPlayers,
  ];
}

function buildMultiplayerHumanSetupPlayers(humanSlots) {
  return Array.from({ length: clampHumanSlots(humanSlots) }, (_, index) => ({
    id: humanSlotId(index),
    name: `사람 자리 ${index + 1}`,
    isHuman: true,
    isMultiplayerHumanSlot: true,
    humanSlotIndex: index,
  }));
}

function buildMultiplayerBaseSetupPlayers(humanSlots, cpuCount) {
  return [...buildMultiplayerHumanSetupPlayers(humanSlots), ...buildComputerSetupPlayers(cpuCount)];
}

function buildHumanActionHint(state, playerIndex, actions) {
  const player = state.players[playerIndex];
  if (!player) {
    return "";
  }

  const toCall = Math.max(0, state.currentBet - player.streetContribution);
  const wagerAction = actions.find((action) => action.key === "bet" || action.key === "raise");
  if (!wagerAction) {
    return "";
  }

  const isBigBlindPreflopSpot = state.streetIndex === 0 && playerIndex === state.bigBlindIndex && toCall === 0;
  if (isBigBlindPreflopSpot) {
    if (wagerAction.enabled) {
      return "빅 블라인드는 추가로 맞출 금액이 없으면 체크하거나 레이즈할 수 있습니다.";
    }
    return `빅 블라인드는 체크 가능 상태입니다. 현재 잔액 ${formatMoney(player.chipBalance)}으로는 추가 레이즈가 불가능합니다. 잔액이 0원이 아니면 올인 레이즈가 열립니다.`;
  }

  if (toCall === 0 && !wagerAction.enabled && player.chipBalance > 0) {
    return `현재 잔액 ${formatMoney(player.chipBalance)}으로는 이번 단계 기본 ${wagerAction.key === "bet" ? "베팅" : "레이즈"} 금액을 맞출 수 없지만, 0원이 아니면 올인 ${wagerAction.key === "bet" ? "베팅" : "레이즈"}가 가능합니다.`;
  }

  return "";
}

function normalizeSetupPlayerOrder(order, players) {
  const playerIds = players.map((player) => player.id);
  const keptIds = [];
  if (Array.isArray(order)) {
    order.forEach((id) => {
      if (playerIds.includes(id) && !keptIds.includes(id)) {
        keptIds.push(id);
      }
    });
  }
  return [...keptIds, ...playerIds.filter((id) => !keptIds.includes(id))];
}

function buildSetupPlayers(cpuCount, includeHuman = true, playerOrder = []) {
  const players = buildBaseSetupPlayers(cpuCount, includeHuman);
  const playerById = new Map(players.map((player) => [player.id, player]));
  return normalizeSetupPlayerOrder(playerOrder, players).map((id) => playerById.get(id)).filter(Boolean);
}

function buildMultiplayerSetupPlayers(humanSlots, cpuCount, playerOrder = []) {
  const players = buildMultiplayerBaseSetupPlayers(humanSlots, cpuCount);
  const playerById = new Map(players.map((player) => [player.id, player]));
  return normalizeSetupPlayerOrder(playerOrder, players).map((id) => playerById.get(id)).filter(Boolean);
}

function buildSetupPlayersForMode(isMultiplayerSetup, cpuCount, includeHuman, humanSlots, playerOrder = []) {
  return isMultiplayerSetup
    ? buildMultiplayerSetupPlayers(humanSlots, cpuCount, playerOrder)
    : buildSetupPlayers(cpuCount, includeHuman, playerOrder);
}

function buildSetupBalances(cpuCount, includeHuman = true, previous = {}, playerOrder = []) {
  return Object.fromEntries(
    buildSetupPlayers(cpuCount, includeHuman, playerOrder).map((player) => [player.id, previous[player.id] ?? DEFAULT_STARTING_BALANCE]),
  );
}

function buildSetupBalancesForPlayers(players, previous = {}) {
  return Object.fromEntries(players.map((player) => [player.id, previous[player.id] ?? DEFAULT_STARTING_BALANCE]));
}

function buildSetupComputerStyles(cpuCount, includeHuman = true, previous = {}, playerOrder = []) {
  return Object.fromEntries(
    buildSetupPlayers(cpuCount, includeHuman, playerOrder)
      .filter((player) => !player.isHuman)
      .map((player) => [player.id, getComputerStyleSelection(previous[player.id]).key]),
  );
}

function buildSetupComputerStylesForPlayers(players, previous = {}) {
  return Object.fromEntries(
    players
      .filter((player) => !player.isHuman)
      .map((player) => [player.id, getComputerStyleSelection(previous[player.id]).key]),
  );
}

function buildSetupComputerLevels(cpuCount, includeHuman = true, previous = {}, playerOrder = []) {
  return Object.fromEntries(
    buildSetupPlayers(cpuCount, includeHuman, playerOrder)
      .filter((player) => !player.isHuman)
      .map((player) => [player.id, getComputerLevelSelection(previous[player.id]).key]),
  );
}

function buildSetupComputerLevelsForPlayers(players, previous = {}) {
  return Object.fromEntries(
    players
      .filter((player) => !player.isHuman)
      .map((player) => [player.id, getComputerLevelSelection(previous[player.id]).key]),
  );
}

function buildMultiplayerPlayerOrderFromSettings(settings, humanSlots, cpuCount) {
  const players = buildMultiplayerBaseSetupPlayers(humanSlots, cpuCount);
  if (Array.isArray(settings?.playerOrder)) {
    return normalizeSetupPlayerOrder(settings.playerOrder, players);
  }

  const totalSeatCount = Math.min(MAX_TOTAL_PLAYERS, clampHumanSlots(humanSlots) + cpuCount);
  const humanSeatPlacements = normalizeMultiplayerTableSeats(settings?.humanSeatPlacements, humanSlots, totalSeatCount);
  const computerIds = buildComputerSetupPlayers(cpuCount).map((player) => player.id);
  const orderedIds = Array.from({ length: totalSeatCount }, () => null);
  humanSeatPlacements.forEach((seatIndex, index) => {
    orderedIds[seatIndex] = humanSlotId(index);
  });

  let computerIndex = 0;
  return normalizeSetupPlayerOrder(
    orderedIds.map((id) => id ?? computerIds[computerIndex++]).filter(Boolean),
    players,
  );
}

function buildMultiplayerHumanSeatPlacements(players, humanSlots) {
  const slotCount = clampHumanSlots(humanSlots);
  const placements = Array.from({ length: slotCount }, (_, index) => index);
  players.forEach((player, index) => {
    if (player.isMultiplayerHumanSlot) {
      placements[player.humanSlotIndex] = index;
    }
  });
  return normalizeMultiplayerTableSeats(placements, slotCount, players.length);
}

function buildMultiplayerHumanSettings(humanSlots, setupBalances) {
  return buildMultiplayerHumanSetupPlayers(humanSlots).map((player) => ({
    id: player.id,
    name: player.name,
    startingBalance: setupBalances[player.id] ?? DEFAULT_STARTING_BALANCE,
  }));
}

function setupPlayerType(player) {
  return player.isHuman ? "human" : "computer";
}

function normalizeSetupPlayerTypes(types, isMultiplayerSetup) {
  const normalizedTypes = types.filter((type) => type === "human" || type === "computer").slice(0, MAX_TOTAL_PLAYERS);
  if (isMultiplayerSetup) {
    const humanCount = normalizedTypes.filter((type) => type === "human").length;
    return humanCount >= MIN_MULTIPLAYER_HUMAN_SLOTS ? normalizedTypes : null;
  }

  let hasHuman = false;
  return normalizedTypes.map((type) => {
    if (type !== "human") {
      return "computer";
    }
    if (hasHuman) {
      return "computer";
    }
    hasHuman = true;
    return "human";
  });
}

function buildSetupPlayerOrderFromTypes(types, isMultiplayerSetup) {
  let humanCount = 0;
  let computerCount = 0;
  return types.map((type) => {
    if (type === "human") {
      humanCount += 1;
      return isMultiplayerSetup ? humanSlotId(humanCount - 1) : "human";
    }
    computerCount += 1;
    return `cpu-${computerCount}`;
  });
}

function moveSetupPlayerOrder(order, players, draggedId, targetId, placement = "before") {
  if (!draggedId || !targetId || draggedId === targetId) {
    return normalizeSetupPlayerOrder(order, players);
  }

  const normalizedOrder = normalizeSetupPlayerOrder(order, players);
  const fromIndex = normalizedOrder.indexOf(draggedId);
  const targetIndex = normalizedOrder.indexOf(targetId);
  if (fromIndex < 0 || targetIndex < 0) {
    return normalizedOrder;
  }

  const nextOrder = [...normalizedOrder];
  const [dragged] = nextOrder.splice(fromIndex, 1);
  let toIndex = targetIndex + (placement === "after" ? 1 : 0);
  if (fromIndex < toIndex) {
    toIndex -= 1;
  }
  nextOrder.splice(toIndex, 0, dragged);
  return nextOrder;
}

function setupDragClass(playerId, draggedId, overId) {
  return `${draggedId === playerId ? " is-dragging" : ""}${overId === playerId && draggedId !== playerId ? " is-drop-target" : ""}`;
}

function getSetupDropPlacement(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const xRatio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
  const yRatio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
  const horizontalDistance = Math.abs(xRatio - 0.5);
  const verticalDistance = Math.abs(yRatio - 0.5);
  const isAfter = verticalDistance > horizontalDistance ? yRatio > 0.5 : xRatio > 0.5;
  return isAfter ? "after" : "before";
}

function getComputerStyleOption(styleKey) {
  return COMPUTER_STYLES.find((style) => style.key === styleKey) ?? COMPUTER_STYLES[0];
}

function getComputerStyleSelection(styleKey) {
  return COMPUTER_STYLE_OPTIONS.find((style) => style.key === styleKey) ?? COMPUTER_STYLES[0];
}

function getComputerLevelSelection(levelKey) {
  return COMPUTER_LEVEL_OPTIONS.find((level) => level.key === levelKey) ?? COMPUTER_LEVELS[1];
}

function computerProfileLabel(player, visible = true) {
  if (!visible) {
    return "설정 비공개";
  }
  const styleLabel = player.computerStyle ? getComputerStyleOption(player.computerStyle).label : "성향 비공개";
  const levelLabel = player.computerLevel ? getComputerLevelSelection(player.computerLevel).label : "중급";
  return `${styleLabel} · ${levelLabel}`;
}

function maxMultiplayerCpuCount(humanSlots) {
  return Math.max(0, MAX_TOTAL_PLAYERS - clampHumanSlots(humanSlots));
}

function clampMultiplayerCpuCount(cpuCount, humanSlots) {
  return Math.min(Math.max(0, Number(cpuCount) || 0), maxMultiplayerCpuCount(humanSlots));
}

function clampDelay(value, min, max) {
  return Math.min(Math.max(min, Number(value) || min), max);
}

function timerLabel(timer) {
  if (timer.phase === "humanAction") {
    return `${timer.playerName ?? "사람 플레이어"} 행동 제한 시간`;
  }
  if (timer.phase === "nextHandReady") {
    return "다음 핸드 준비 제한 시간";
  }
  if (timer.phase === "autoNextHand") {
    return "다음 핸드 자동 진행";
  }
  return "제한 시간";
}

function TimerProgress({ timer, nowMs }) {
  if (!timer) {
    return null;
  }
  const durationMs = Math.max(1, Number(timer.durationMs) || 1);
  const remainingMs = Math.max(0, Number(timer.expiresAt) - nowMs);
  const progress = Math.max(0, Math.min(100, (remainingMs / durationMs) * 100));
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="timer-progress" aria-label={timerLabel(timer)}>
      <div className="timer-meta">
        <span>{timerLabel(timer)}</span>
        <span>{remainingSeconds}초</span>
      </div>
      <div className="timer-track">
        <div className="timer-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function clampHumanSlots(value) {
  return Math.min(Math.max(MIN_MULTIPLAYER_HUMAN_SLOTS, Number(value) || MIN_MULTIPLAYER_HUMAN_SLOTS), MAX_MULTIPLAYER_HUMAN_SLOTS);
}

function clampTableSeatIndex(value, totalSeatCount) {
  return Math.min(Math.max(0, Number(value) || 0), Math.max(0, totalSeatCount - 1));
}

function buildTableSeatOptions(totalSeatCount) {
  return Array.from({ length: totalSeatCount }, (_, index) => index);
}

function buildDefaultMultiplayerTableSeats(humanSlots, totalSeatCount) {
  const slotCount = clampHumanSlots(humanSlots);
  const seatCount = Math.max(slotCount, Math.min(MAX_TOTAL_PLAYERS, Number(totalSeatCount) || slotCount));
  if (slotCount === 1) {
    return [0];
  }
  return Array.from({ length: slotCount }, (_, index) => Math.round((index * (seatCount - 1)) / (slotCount - 1)));
}

function normalizeMultiplayerTableSeats(tableSeats, humanSlots, totalSeatCount) {
  const slotCount = clampHumanSlots(humanSlots);
  const seatCount = Math.max(slotCount, Math.min(MAX_TOTAL_PLAYERS, Number(totalSeatCount) || slotCount));
  const defaults = buildDefaultMultiplayerTableSeats(slotCount, seatCount);
  const values = Array.isArray(tableSeats) ? tableSeats : [];
  const usedSeats = new Set();

  return Array.from({ length: slotCount }, (_, index) => {
    let seatIndex = clampTableSeatIndex(values[index] ?? defaults[index], seatCount);
    if (usedSeats.has(seatIndex)) {
      seatIndex = defaults.find((candidate) => !usedSeats.has(candidate)) ?? buildTableSeatOptions(seatCount).find((candidate) => !usedSeats.has(candidate)) ?? 0;
    }
    usedSeats.add(seatIndex);
    return seatIndex;
  });
}

function websocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function cardSuitClass(card) {
  if (!card) {
    return "";
  }
  return card.suit === "H" || card.suit === "D" ? " is-red" : " is-black";
}

function Seat({ player, isTurn, revealCards, showPrivateCards, showComputerStyle, winner, blindRole, isDealer, showdownLabel }) {
  const chipBalance = player.chipBalance ?? 0;
  const balanceClass = chipBalance > 0 ? "money-positive" : chipBalance < 0 ? "money-negative" : "";
  const computerLabel = computerProfileLabel(player, showComputerStyle);
  const seatLabel = player.eliminated ? "탈락" : player.isHuman ? "사람" : computerLabel;
  const actionLabel =
    player.lastAction === "스몰 블라인드" || player.lastAction === "빅 블라인드" || player.lastAction === "잔액 전액 콜"
      ? "대기"
      : player.lastAction;

  return (
    <article className={`seat${player.folded ? " is-folded" : ""}${player.eliminated ? " is-eliminated" : ""}${isTurn ? " is-turn" : ""}${winner ? " is-winner" : ""}`}>
      <header>
        <strong>{player.name}</strong>
        <span className="seat-meta">
          <span>{seatLabel}</span>
          {isDealer ? (
            <span className="dealer-badge" title="딜러">
              D
            </span>
          ) : null}
          {blindRole ? (
            <span className="blind-badge" title={blindRole === "SB" ? "스몰 블라인드" : "빅 블라인드"}>
              {blindRole}
            </span>
          ) : null}
          {player.actionLocked ? (
            <span className="all-in-badge" title="잔액 전액 투입">
              올인
            </span>
          ) : null}
        </span>
      </header>
      <div className="seat-cards">
        {player.eliminated ? (
          <div className="eliminated-badge">탈락</div>
        ) : (
          player.cards.map((card, index) => {
            const showCard = Boolean(card) && (showPrivateCards || (revealCards && !player.folded));
            return (
              <div className={`card${showCard ? cardSuitClass(card) : ""}`} key={`${player.id}-${index}`}>
                {showCard ? formatCard(card) : "🂠"}
              </div>
            );
          })
        )}
      </div>
      {showdownLabel ? (
        <div className={`showdown-hand${winner ? " is-winner" : ""}`}>
          <span>최종 패</span>
          <strong>{showdownLabel}</strong>
        </div>
      ) : null}
      <dl>
        <div>
          <dt>행동</dt>
          <dd>{actionLabel}</dd>
        </div>
        <div>
          <dt>이번 핸드</dt>
          <dd>{formatMoney(player.totalContribution)}</dd>
        </div>
        <div>
          <dt>보유 금액</dt>
          <dd className={balanceClass}>{formatMoney(chipBalance)}</dd>
        </div>
        <div>
          <dt>누적 승리</dt>
          <dd>{formatMoney(player.chipsWon)}</dd>
        </div>
      </dl>
    </article>
  );
}

function RulesPanel({ embedded = false }) {
  return (
    <section className={embedded ? "rules embedded-rules" : "panel rules"}>
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
            <li>베팅 (Bet): 아직 베팅이 없을 때 처음 칩스 내기</li>
            <li>레이즈 (Raise): 이미 있는 베팅보다 높게 추가 베팅</li>
            <li>콜 (Call): 현재 베팅 금액에 맞춤</li>
            <li>체크 (Check): 베팅 없이 순서 넘김</li>
          </ul>
          <p className="note">
            체크는 이전 베팅이 없을 때만 가능합니다. 프리 플랍 (Pre-flop)에서는 일반적으로 체크가 불가능하지만, 빅 블라인드 (Big Blind)가 추가로 맞출 금액이 없으면 체크할 수 있습니다.
          </p>
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
              <th>리레이즈 증가</th>
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
                <td>{formatMoney(street.reraiseSize)}</td>
                <td>{street.maxLabel ?? formatMoney(street.maxBet)}</td>
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
  const [includeHuman, setIncludeHuman] = useState(true);
  const [setupPlayerOrder, setSetupPlayerOrder] = useState(() => buildBaseSetupPlayers(3, true).map((player) => player.id));
  const [draggedSetupPlayerId, setDraggedSetupPlayerId] = useState("");
  const [dragOverSetupPlayerId, setDragOverSetupPlayerId] = useState("");
  const [dragPreviewPlayerOrder, setDragPreviewPlayerOrder] = useState([]);
  const [computerStyles, setComputerStyles] = useState(() => buildSetupComputerStyles(3, true, {}));
  const [computerLevels, setComputerLevels] = useState(() => buildSetupComputerLevels(3, true, {}));
  const [setupBalances, setSetupBalances] = useState(() => buildSetupBalances(3, true, {}));
  const [dealerIndex, setDealerIndex] = useState(0);
  const [chipTotals, setChipTotals] = useState({});
  const [state, setState] = useState(null);
  const [autoNextHand, setAutoNextHand] = useState(false);
  const [endlessMode, setEndlessMode] = useState(false);
  const [endlessReplacementComputerStyle, setEndlessReplacementComputerStyle] = useState("random");
  const [endlessReplacementComputerLevel, setEndlessReplacementComputerLevel] = useState("random");
  const [endlessReplacementStartingBalance, setEndlessReplacementStartingBalance] = useState(DEFAULT_STARTING_BALANCE);
  const [showComputerStylesInGame, setShowComputerStylesInGame] = useState(true);
  const [computerActionDelayMs, setComputerActionDelayMs] = useState(DEFAULT_COMPUTER_ACTION_DELAY_MS);
  const [nextHandDelayMs, setNextHandDelayMs] = useState(DEFAULT_NEXT_HAND_DELAY_MS);
  const [humanActionTimeoutMs, setHumanActionTimeoutMs] = useState(DEFAULT_HUMAN_ACTION_TIMEOUT_MS);
  const [multiplayerName, setMultiplayerName] = useState("플레이어");
  const [multiplayerSlots, setMultiplayerSlots] = useState(2);
  const [randomizeMultiplayerHumanSeats, setRandomizeMultiplayerHumanSeats] = useState(false);
  const [multiplayerJoinCode, setMultiplayerJoinCode] = useState("");
  const [multiplayerRoom, setMultiplayerRoom] = useState(null);
  const [multiplayerPlayerId, setMultiplayerPlayerId] = useState(null);
  const [multiplayerGameActive, setMultiplayerGameActive] = useState(false);
  const [multiplayerStatus, setMultiplayerStatus] = useState("연결 대기");
  const [multiplayerError, setMultiplayerError] = useState("");
  const [handHistory, setHandHistory] = useState([]);
  const [archivedHandIds, setArchivedHandIds] = useState(() => new Set());
  const [timerNowMs, setTimerNowMs] = useState(() => Date.now());
  const [setupMode, setSetupMode] = useState("single");
  const [multiplayerLobbyMode, setMultiplayerLobbyMode] = useState("");
  const [setupTab, setSetupTab] = useState("game");
  const [activeGameTab, setActiveGameTab] = useState("table");
  const [gameInfoTab, setGameInfoTab] = useState("log");
  const multiplayerSocketRef = useRef(null);
  const multiplayerReconnectRef = useRef(null);
  const multiplayerRoomIdRef = useRef("");
  const multiplayerPlayerIdRef = useRef(null);
  const multiplayerNameRef = useRef(multiplayerName);
  const multiplayerGameActiveRef = useRef(false);
  const lastSentRoomSettingsRef = useRef("");
  const setupDragDropCommittedRef = useRef(false);

  useEffect(() => {
    if (multiplayerGameActive) {
      return undefined;
    }
    if (!state) {
      return undefined;
    }
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
    }, computerActionDelayMs);

    return () => window.clearTimeout(timer);
  }, [computerActionDelayMs, multiplayerGameActive, state]);

  useEffect(() => {
    multiplayerNameRef.current = multiplayerName;
  }, [multiplayerName]);

  useEffect(() => {
    let disposed = false;

    function clearReconnectTimer() {
      if (multiplayerReconnectRef.current) {
        window.clearTimeout(multiplayerReconnectRef.current);
        multiplayerReconnectRef.current = null;
      }
    }

    function scheduleReconnect() {
      if (disposed || multiplayerReconnectRef.current) {
        return;
      }
      multiplayerReconnectRef.current = window.setTimeout(() => {
        multiplayerReconnectRef.current = null;
        connect();
      }, MULTIPLAYER_RECONNECT_DELAY_MS);
    }

    function handleRoomState(room) {
      multiplayerRoomIdRef.current = room.id;
      applyMultiplayerRoomSettings(room);
      setSetupMode("multiplayer");
      setMultiplayerLobbyMode(room.hostPlayerId === multiplayerPlayerIdRef.current ? "create" : "join");
      setMultiplayerRoom(room);
      setMultiplayerError("");
      if (room.gameState) {
        multiplayerGameActiveRef.current = true;
        setMultiplayerGameActive(true);
        setShowComputerStylesInGame(room.showComputerStyles !== false);
        setState(room.gameState);
      } else if (multiplayerGameActiveRef.current) {
        multiplayerGameActiveRef.current = false;
        setMultiplayerGameActive(false);
        setState(null);
      }
    }

    function handleSocketMessage(event) {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        setMultiplayerError("서버 메시지를 읽을 수 없습니다.");
        return;
      }

      if (message.type === "roomState") {
        handleRoomState(message.room);
      }
      if (message.type === "joinedRoom") {
        multiplayerRoomIdRef.current = message.roomId;
        multiplayerPlayerIdRef.current = message.playerId;
        setSetupMode("multiplayer");
        setSetupTab("multiplayer");
        setMultiplayerJoinCode(message.roomId);
        setMultiplayerPlayerId(message.playerId);
      }
      if (message.type === "leftRoom") {
        multiplayerRoomIdRef.current = "";
        multiplayerPlayerIdRef.current = null;
        multiplayerGameActiveRef.current = false;
        setMultiplayerRoom(null);
        setMultiplayerPlayerId(null);
        setMultiplayerGameActive(false);
        setMultiplayerLobbyMode("");
        setSetupTab("multiplayer");
        setState(null);
      }
      if (message.type === "error") {
        setMultiplayerError(message.message);
      }
    }

    function connect() {
      if (disposed) {
        return;
      }

      const socket = new WebSocket(websocketUrl());
      multiplayerSocketRef.current = socket;
      setMultiplayerStatus("연결 중");

      socket.addEventListener("open", () => {
        clearReconnectTimer();
        setMultiplayerStatus("연결됨");
        setMultiplayerError("");
        if (multiplayerRoomIdRef.current && multiplayerPlayerIdRef.current) {
          socket.send(
            JSON.stringify({
              type: "rejoinRoom",
              roomId: multiplayerRoomIdRef.current,
              playerId: multiplayerPlayerIdRef.current,
              playerName: multiplayerNameRef.current,
            }),
          );
        }
      });
      socket.addEventListener("message", handleSocketMessage);
      socket.addEventListener("close", () => {
        if (multiplayerSocketRef.current === socket) {
          multiplayerSocketRef.current = null;
          setMultiplayerStatus("연결 끊김");
          scheduleReconnect();
        }
      });
      socket.addEventListener("error", () => {
        setMultiplayerStatus("연결 오류");
      });
    }

    connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      const socket = multiplayerSocketRef.current;
      multiplayerSocketRef.current = null;
      socket?.close();
    };
  }, []);

  const showdownMap = useMemo(
    () => (state ? Object.fromEntries(state.showdownResults.map((entry) => [entry.id, entry.label])) : {}),
    [state],
  );
  const isMultiplayerSetup = setupMode === "multiplayer" || Boolean(multiplayerRoom);
  const isMultiplayerHost = Boolean(multiplayerRoom && multiplayerPlayerId && multiplayerRoom.hostPlayerId === multiplayerPlayerId);
  const isMultiplayerCreateFlow = isMultiplayerSetup && (multiplayerLobbyMode === "create" || isMultiplayerHost);
  const setupTabs = !isMultiplayerSetup
    ? SINGLEPLAY_SETUP_TABS
    : isMultiplayerCreateFlow
      ? MULTIPLAYER_SETUP_TABS
      : multiplayerLobbyMode === "join" || multiplayerRoom
        ? MULTIPLAYER_JOIN_SETUP_TABS
        : MULTIPLAYER_LOBBY_TABS;
  const setupIncludesLocalHuman = !isMultiplayerSetup && includeHuman;
  const multiplayerHumanSlotCount = multiplayerRoom?.humanSlots ?? multiplayerSlots;
  const multiplayerConfiguredSeatCount = multiplayerHumanSlotCount + cpuCount;
  const setupPlayers = useMemo(
    () => buildSetupPlayersForMode(isMultiplayerSetup, cpuCount, setupIncludesLocalHuman, multiplayerHumanSlotCount, setupPlayerOrder),
    [cpuCount, isMultiplayerSetup, multiplayerHumanSlotCount, setupIncludesLocalHuman, setupPlayerOrder],
  );
  const displayedSetupPlayers = useMemo(
    () =>
      buildSetupPlayersForMode(
        isMultiplayerSetup,
        cpuCount,
        setupIncludesLocalHuman,
        multiplayerHumanSlotCount,
        draggedSetupPlayerId && dragPreviewPlayerOrder.length > 0 ? dragPreviewPlayerOrder : setupPlayerOrder,
      ),
    [cpuCount, dragPreviewPlayerOrder, draggedSetupPlayerId, isMultiplayerSetup, multiplayerHumanSlotCount, setupIncludesLocalHuman, setupPlayerOrder],
  );
  const resolvedMultiplayerTableSeats = useMemo(
    () => buildMultiplayerHumanSeatPlacements(setupPlayers, multiplayerHumanSlotCount),
    [multiplayerHumanSlotCount, setupPlayers],
  );
  const connectedMultiplayerHumans =
    multiplayerRoom?.seats.filter((seat, index) => seat.playerId && seat.connected && (setupBalances[humanSlotId(index)] ?? 0) >= MIN_PLAYABLE_BALANCE).length ?? 0;
  const playableComputerSetupCount = setupPlayers.filter((player) => !player.isHuman && (setupBalances[player.id] ?? 0) >= MIN_PLAYABLE_BALANCE).length;
  const multiplayerPlayableSetupCount = connectedMultiplayerHumans + playableComputerSetupCount;
  const multiplayerConfiguredPlayerCount = multiplayerRoom ? multiplayerConfiguredSeatCount : 0;
  const activeComputerStyleSummary = state
    ? showComputerStylesInGame
      ? state.players
        .filter((player) => !player.isHuman)
        .map((player) => `${player.name} ${computerProfileLabel(player, true)}`)
        .join(" / ")
      : "비공개"
    : "";
  const playableSetupCount = setupPlayers.filter((player) => (setupBalances[player.id] ?? 0) >= MIN_PLAYABLE_BALANCE).length;
  const canStartSetupGame = multiplayerRoom
    ? multiplayerPlayableSetupCount >= 2 && multiplayerConfiguredPlayerCount <= MAX_TOTAL_PLAYERS
    : isMultiplayerSetup
      ? isMultiplayerCreateFlow
      : playableSetupCount >= 2;
  const setupStartButtonLabel = isMultiplayerSetup ? (multiplayerRoom ? "룸 게임 시작" : "룸 만들기") : "게임 시작";
  const canEditMultiplayerSettings = !isMultiplayerSetup || (isMultiplayerCreateFlow && (!multiplayerRoom || isMultiplayerHost));
  const canEditActiveGameSettings = !multiplayerGameActive || isMultiplayerHost;
  const showSetupStartAction = !isMultiplayerSetup || (isMultiplayerCreateFlow && (multiplayerRoom || setupTab !== "multiplayer"));
  const multiplayerTimer = multiplayerRoom?.timer ?? null;
  const multiplayerNextHandRequiredIds = multiplayerRoom?.nextHandRequiredPlayerIds ?? [];
  const multiplayerNextHandReadyIds = multiplayerRoom?.nextHandReadyPlayerIds ?? [];
  const multiplayerNextHandReadyCount = multiplayerNextHandReadyIds.filter((playerId) => multiplayerNextHandRequiredIds.includes(playerId)).length;
  const canConfirmMultiplayerNextHand = Boolean(multiplayerPlayerId && multiplayerNextHandRequiredIds.includes(multiplayerPlayerId));
  const hasConfirmedMultiplayerNextHand = Boolean(multiplayerPlayerId && multiplayerNextHandReadyIds.includes(multiplayerPlayerId));
  const multiplayerSettingsPayload = useMemo(
    () => ({
      humanStartingBalance: setupBalances[humanSlotId(0)] ?? DEFAULT_STARTING_BALANCE,
      humanPlayers: buildMultiplayerHumanSettings(multiplayerHumanSlotCount, setupBalances),
      humanSeatPlacements: resolvedMultiplayerTableSeats,
      playerOrder: setupPlayers.map((player) => player.id),
      randomizeHumanSeats: randomizeMultiplayerHumanSeats,
      computerPlayers: setupPlayers
        .filter((player) => !player.isHuman)
        .map((player) => ({
          name: player.name,
          startingBalance: setupBalances[player.id] ?? 0,
          computerStyle: getComputerStyleSelection(computerStyles[player.id]).key,
          computerLevel: getComputerLevelSelection(computerLevels[player.id]).key,
        })),
      autoNextHand,
      endlessMode,
      endlessReplacementComputerStyle: getComputerStyleSelection(endlessReplacementComputerStyle).key,
      endlessReplacementComputerLevel: getComputerLevelSelection(endlessReplacementComputerLevel).key,
      endlessReplacementStartingBalance,
      showComputerStyles: showComputerStylesInGame,
      computerActionDelayMs,
      nextHandDelayMs,
      humanActionTimeoutMs,
    }),
    [
      autoNextHand,
      computerActionDelayMs,
      computerLevels,
      computerStyles,
      endlessMode,
      endlessReplacementComputerLevel,
      endlessReplacementComputerStyle,
      endlessReplacementStartingBalance,
      humanActionTimeoutMs,
      multiplayerHumanSlotCount,
      nextHandDelayMs,
      randomizeMultiplayerHumanSeats,
      resolvedMultiplayerTableSeats,
      setupBalances,
      setupPlayers,
      showComputerStylesInGame,
    ],
  );

  function applyMultiplayerRoomSettings(room) {
    const settings = room?.settings;
    if (!settings) {
      return;
    }

    const computerPlayers = Array.isArray(settings.computerPlayers) ? settings.computerPlayers : [];
    const nextCpuCount = clampMultiplayerCpuCount(computerPlayers.length, room.humanSlots);
    const nextPlayers = buildMultiplayerBaseSetupPlayers(room.humanSlots, nextCpuCount);
    const nextPlayerOrder = buildMultiplayerPlayerOrderFromSettings(settings, room.humanSlots, nextCpuCount);
    const humanPlayers = Array.isArray(settings.humanPlayers) ? settings.humanPlayers : [];
    setMultiplayerSlots(room.humanSlots);
    setCpuCount(nextCpuCount);
    setSetupPlayerOrder(nextPlayerOrder);
    setSetupBalances((current) => {
      const nextBalances = buildSetupBalancesForPlayers(nextPlayers, current);
      buildMultiplayerHumanSetupPlayers(room.humanSlots).forEach((player, index) => {
        nextBalances[player.id] = Math.max(0, Number(humanPlayers[index]?.startingBalance ?? settings.humanStartingBalance) || 0);
      });
      computerPlayers.forEach((player, index) => {
        nextBalances[`cpu-${index + 1}`] = Math.max(0, Number(player.startingBalance) || 0);
      });
      return nextBalances;
    });
    setComputerStyles((current) => {
      const nextStyles = buildSetupComputerStylesForPlayers(nextPlayers, current);
      computerPlayers.forEach((player, index) => {
        nextStyles[`cpu-${index + 1}`] = getComputerStyleSelection(player.computerStyle).key;
      });
      return nextStyles;
    });
    setComputerLevels((current) => {
      const nextLevels = buildSetupComputerLevelsForPlayers(nextPlayers, current);
      computerPlayers.forEach((player, index) => {
        nextLevels[`cpu-${index + 1}`] = getComputerLevelSelection(player.computerLevel).key;
      });
      return nextLevels;
    });
    setRandomizeMultiplayerHumanSeats(Boolean(settings.randomizeHumanSeats));
    setAutoNextHand(Boolean(settings.autoNextHand));
    setEndlessMode(Boolean(settings.endlessMode));
    setEndlessReplacementComputerStyle(getComputerStyleSelection(settings.endlessReplacementComputerStyle).key);
    setEndlessReplacementComputerLevel(getComputerLevelSelection(settings.endlessReplacementComputerLevel).key);
    setEndlessReplacementStartingBalance(Math.max(MIN_PLAYABLE_BALANCE, Number(settings.endlessReplacementStartingBalance) || DEFAULT_STARTING_BALANCE));
    setShowComputerStylesInGame(settings.showComputerStyles !== false);
    setComputerActionDelayMs(clampDelay(settings.computerActionDelayMs, MIN_COMPUTER_ACTION_DELAY_MS, MAX_COMPUTER_ACTION_DELAY_MS));
    setNextHandDelayMs(clampDelay(settings.nextHandDelayMs, MIN_NEXT_HAND_DELAY_MS, MAX_NEXT_HAND_DELAY_MS));
    setHumanActionTimeoutMs(clampDelay(settings.humanActionTimeoutMs, MIN_HUMAN_ACTION_TIMEOUT_MS, MAX_HUMAN_ACTION_TIMEOUT_MS));
  }

  function applySetupShape(
    nextCpuCount,
    nextIncludeHuman,
    includeSetupHuman = nextIncludeHuman,
    nextHumanSlots = multiplayerHumanSlotCount,
    useMultiplayerSetup = isMultiplayerSetup,
  ) {
    const nextPlayers = useMultiplayerSetup
      ? buildMultiplayerBaseSetupPlayers(nextHumanSlots, nextCpuCount)
      : buildBaseSetupPlayers(nextCpuCount, includeSetupHuman);
    const nextPlayerOrder = normalizeSetupPlayerOrder(setupPlayerOrder, nextPlayers);
    const nextSetupPlayers = buildSetupPlayersForMode(useMultiplayerSetup, nextCpuCount, includeSetupHuman, nextHumanSlots, nextPlayerOrder);
    setCpuCount(nextCpuCount);
    setIncludeHuman(nextIncludeHuman);
    setSetupPlayerOrder(nextPlayerOrder);
    setDragPreviewPlayerOrder([]);
    setDraggedSetupPlayerId("");
    setDragOverSetupPlayerId("");
    setSetupBalances((current) => buildSetupBalancesForPlayers(nextSetupPlayers, current));
    setComputerStyles((current) => buildSetupComputerStylesForPlayers(nextSetupPlayers, current));
    setComputerLevels((current) => buildSetupComputerLevelsForPlayers(nextSetupPlayers, current));
  }

  function changeSetupMode(nextMode) {
    const resolvedMode = nextMode === "multiplayer" ? "multiplayer" : "single";
    if (multiplayerRoom && resolvedMode === "single") {
      return;
    }

    setSetupMode(resolvedMode);
    setSetupTab(resolvedMode === "multiplayer" ? "multiplayer" : "game");
    if (resolvedMode === "single") {
      setMultiplayerLobbyMode("");
    }
    setSetupPlayerOrder((current) => {
      const nextPlayers =
        resolvedMode === "multiplayer"
          ? buildMultiplayerBaseSetupPlayers(multiplayerHumanSlotCount, clampMultiplayerCpuCount(cpuCount, multiplayerHumanSlotCount))
          : buildBaseSetupPlayers(cpuCount, includeHuman);
      return normalizeSetupPlayerOrder(current, nextPlayers);
    });

    if (resolvedMode === "multiplayer") {
      const clampedCpuCount = clampMultiplayerCpuCount(cpuCount, multiplayerHumanSlotCount);
      if (clampedCpuCount !== cpuCount) {
        applySetupShape(clampedCpuCount, includeHuman, false, multiplayerHumanSlotCount, true);
      }
    }
  }

  useEffect(() => {
    if (setupTabs.some((tab) => tab.key === setupTab)) {
      return;
    }
    setSetupTab(setupTabs[0].key);
  }, [setupTab, setupTabs]);

  useEffect(() => {
    if (state || !isMultiplayerSetup || multiplayerRoom) {
      return;
    }

    const clampedCpuCount = clampMultiplayerCpuCount(cpuCount, multiplayerHumanSlotCount);
    if (clampedCpuCount !== cpuCount) {
      applySetupShape(clampedCpuCount, includeHuman, false);
    }
  }, [cpuCount, includeHuman, isMultiplayerSetup, multiplayerHumanSlotCount, multiplayerRoom, state]);

  useEffect(() => {
    if (!multiplayerRoom || state) {
      return;
    }

    const clampedCpuCount = clampMultiplayerCpuCount(cpuCount, multiplayerRoom.humanSlots);
    if (clampedCpuCount !== cpuCount) {
      applySetupShape(clampedCpuCount, includeHuman, false);
    }
  }, [cpuCount, includeHuman, multiplayerRoom, state]);

  useEffect(() => {
    if (!multiplayerTimer) {
      return undefined;
    }

    setTimerNowMs(Date.now());
    const timer = window.setInterval(() => {
      setTimerNowMs(Date.now());
    }, 100);

    return () => window.clearInterval(timer);
  }, [multiplayerTimer?.expiresAt, multiplayerTimer?.startedAt]);

  useEffect(() => {
    if (!multiplayerRoom || multiplayerGameActive || !isMultiplayerHost) {
      return;
    }

    const serializedSettings = JSON.stringify(multiplayerSettingsPayload);
    if (lastSentRoomSettingsRef.current === serializedSettings) {
      return;
    }

    lastSentRoomSettingsRef.current = serializedSettings;
    sendMultiplayerMessage({ type: "updateRoomSettings", settings: multiplayerSettingsPayload });
  }, [isMultiplayerHost, multiplayerGameActive, multiplayerRoom, multiplayerSettingsPayload]);

  function updateSetupBalance(playerId, value) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    const numericValue = Math.max(0, Number(value) || 0);
    setSetupBalances((current) => ({
      ...current,
      [playerId]: numericValue,
    }));
  }

  function applySetupPlayerTypes(nextTypes) {
    const normalizedTypes = normalizeSetupPlayerTypes(nextTypes, isMultiplayerSetup);
    if (!normalizedTypes || normalizedTypes.length < 2) {
      return;
    }

    const nextHumanCount = normalizedTypes.filter((type) => type === "human").length;
    const nextCpuCount = normalizedTypes.filter((type) => type === "computer").length;
    if (isMultiplayerSetup && multiplayerRoom && nextHumanCount !== multiplayerRoom.humanSlots) {
      return;
    }

    const nextIncludeHuman = normalizedTypes.includes("human");
    const nextHumanSlots = isMultiplayerSetup ? nextHumanCount : multiplayerHumanSlotCount;
    const nextPlayerOrder = buildSetupPlayerOrderFromTypes(normalizedTypes, isMultiplayerSetup);
    const nextSetupPlayers = buildSetupPlayersForMode(
      isMultiplayerSetup,
      nextCpuCount,
      !isMultiplayerSetup && nextIncludeHuman,
      nextHumanSlots,
      nextPlayerOrder,
    );
    const previousPlayers = setupPlayers;

    setCpuCount(nextCpuCount);
    setIncludeHuman(nextIncludeHuman);
    if (isMultiplayerSetup) {
      setMultiplayerSlots(nextHumanSlots);
    }
    setSetupPlayerOrder(nextPlayerOrder);
    resetSetupPlayerDrag();
    setSetupBalances((current) =>
      Object.fromEntries(
        nextSetupPlayers.map((player, index) => {
          const previousPlayer = previousPlayers[index];
          return [player.id, current[previousPlayer?.id] ?? current[player.id] ?? DEFAULT_STARTING_BALANCE];
        }),
      ),
    );
    setComputerStyles((current) =>
      Object.fromEntries(
        nextSetupPlayers
          .map((player, index) => {
            if (player.isHuman) {
              return null;
            }
            const previousPlayer = previousPlayers[index];
            const previousStyle = previousPlayer && !previousPlayer.isHuman ? current[previousPlayer.id] : current[player.id];
            return [player.id, getComputerStyleSelection(previousStyle).key];
          })
          .filter(Boolean),
      ),
    );
    setComputerLevels((current) =>
      Object.fromEntries(
        nextSetupPlayers
          .map((player, index) => {
            if (player.isHuman) {
              return null;
            }
            const previousPlayer = previousPlayers[index];
            const previousLevel = previousPlayer && !previousPlayer.isHuman ? current[previousPlayer.id] : current[player.id];
            return [player.id, getComputerLevelSelection(previousLevel).key];
          })
          .filter(Boolean),
      ),
    );
  }

  function addSetupPlayerCard() {
    if (!canEditMultiplayerSettings || setupPlayers.length >= MAX_TOTAL_PLAYERS) {
      return;
    }
    applySetupPlayerTypes([...setupPlayers.map(setupPlayerType), "computer"]);
  }

  function canRemoveSetupPlayer(player) {
    if (!canEditMultiplayerSettings || setupPlayers.length <= 2) {
      return false;
    }
    if (isMultiplayerSetup && player.isHuman && (multiplayerRoom || multiplayerHumanSlotCount <= MIN_MULTIPLAYER_HUMAN_SLOTS)) {
      return false;
    }
    return true;
  }

  function removeSetupPlayerCard(playerId) {
    const player = setupPlayers.find((entry) => entry.id === playerId);
    if (!player || !canRemoveSetupPlayer(player)) {
      return;
    }
    applySetupPlayerTypes(setupPlayers.filter((entry) => entry.id !== playerId).map(setupPlayerType));
  }

  function canChangeSetupPlayerType(player, nextType) {
    if (setupPlayerType(player) === nextType) {
      return true;
    }
    if (!canEditMultiplayerSettings) {
      return false;
    }
    if (isMultiplayerSetup && multiplayerRoom) {
      return false;
    }
    if (isMultiplayerSetup && player.isHuman && nextType === "computer" && multiplayerHumanSlotCount <= MIN_MULTIPLAYER_HUMAN_SLOTS) {
      return false;
    }
    return true;
  }

  function updateSetupPlayerType(playerId, nextType) {
    const playerIndex = setupPlayers.findIndex((player) => player.id === playerId);
    const player = setupPlayers[playerIndex];
    if (!player || !canChangeSetupPlayerType(player, nextType)) {
      return;
    }
    const nextTypes =
      !isMultiplayerSetup && nextType === "human"
        ? setupPlayers.map((_, index) => (index === playerIndex ? "human" : "computer"))
        : setupPlayers.map(setupPlayerType);
    if (isMultiplayerSetup || nextType !== "human") {
      nextTypes[playerIndex] = nextType === "human" ? "human" : "computer";
    }
    applySetupPlayerTypes(nextTypes);
  }

  function setupHumanPlayerNote(player) {
    if (!player.isMultiplayerHumanSlot) {
      return "사람 플레이어는 직접 행동을 선택합니다.";
    }

    const seat = multiplayerRoom?.seats[player.humanSlotIndex];
    if (!seat) {
      return "룸 생성 전 대기 자리입니다.";
    }
    if (!seat.playerId) {
      return "참가 대기 중입니다.";
    }
    return `${seat.name ?? player.name}${seat.connected ? " 참가 중" : " 연결 끊김"}`;
  }

  function updateComputerStyle(playerId, styleKey) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    setComputerStyles((current) => ({
      ...current,
      [playerId]: getComputerStyleSelection(styleKey).key,
    }));
  }

  function updateComputerLevel(playerId, levelKey) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    setComputerLevels((current) => ({
      ...current,
      [playerId]: getComputerLevelSelection(levelKey).key,
    }));
  }

  function resetSetupPlayerDrag() {
    setDraggedSetupPlayerId("");
    setDragOverSetupPlayerId("");
    setDragPreviewPlayerOrder([]);
  }

  function handleSetupPlayerDragStart(event, playerId) {
    if (!canEditMultiplayerSettings || setupPlayers.length <= 1) {
      event.preventDefault();
      return;
    }
    const dragOrder = normalizeSetupPlayerOrder(setupPlayerOrder, setupPlayers);
    setupDragDropCommittedRef.current = false;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", playerId);
    const dragImage = event.currentTarget.closest(".setup-player-config");
    if (dragImage) {
      event.dataTransfer.setDragImage(dragImage, dragImage.clientWidth / 2, 24);
    }
    setDraggedSetupPlayerId(playerId);
    setDragOverSetupPlayerId("");
    setDragPreviewPlayerOrder(dragOrder);
  }

  function handleSetupPlayerDragOver(event, playerId) {
    if (!canEditMultiplayerSettings || !draggedSetupPlayerId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (draggedSetupPlayerId === playerId) {
      return;
    }
    const placement = getSetupDropPlacement(event);
    setDragOverSetupPlayerId(playerId);
    setDragPreviewPlayerOrder((current) =>
      moveSetupPlayerOrder(current.length > 0 ? current : setupPlayerOrder, setupPlayers, draggedSetupPlayerId, playerId, placement),
    );
  }

  function handleSetupPlayerDrop(event, playerId) {
    if (!canEditMultiplayerSettings) {
      return;
    }
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("text/plain") || draggedSetupPlayerId;
    const placement = getSetupDropPlacement(event);
    const baseOrder = dragPreviewPlayerOrder.length > 0 ? dragPreviewPlayerOrder : setupPlayerOrder;
    setupDragDropCommittedRef.current = true;
    setSetupPlayerOrder(moveSetupPlayerOrder(baseOrder, setupPlayers, draggedId, playerId, placement));
    resetSetupPlayerDrag();
  }

  function handleSetupPlayerDragEnd() {
    if (setupDragDropCommittedRef.current) {
      setupDragDropCommittedRef.current = false;
      resetSetupPlayerDrag();
      return;
    }
    if (draggedSetupPlayerId && dragOverSetupPlayerId && dragPreviewPlayerOrder.length > 0) {
      setSetupPlayerOrder(normalizeSetupPlayerOrder(dragPreviewPlayerOrder, setupPlayers));
    }
    resetSetupPlayerDrag();
  }

  function updateAutoNextHand(enabled) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    setAutoNextHand(enabled);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", autoNextHand: enabled });
    }
  }

  function updateEndlessMode(enabled) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    setEndlessMode(enabled);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", endlessMode: enabled });
    }
  }

  function updateEndlessReplacementStyle(styleKey) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    const nextValue = getComputerStyleSelection(styleKey).key;
    setEndlessReplacementComputerStyle(nextValue);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", endlessReplacementComputerStyle: nextValue });
    }
  }

  function updateEndlessReplacementLevel(levelKey) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    const nextValue = getComputerLevelSelection(levelKey).key;
    setEndlessReplacementComputerLevel(nextValue);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", endlessReplacementComputerLevel: nextValue });
    }
  }

  function updateEndlessReplacementBalance(value) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    const nextValue = Math.max(MIN_PLAYABLE_BALANCE, Number(value) || DEFAULT_STARTING_BALANCE);
    setEndlessReplacementStartingBalance(nextValue);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", endlessReplacementStartingBalance: nextValue });
    }
  }

  function updateShowComputerStylesInGame(enabled) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    setShowComputerStylesInGame(enabled);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", showComputerStyles: enabled });
    }
  }

  function updateComputerActionDelay(value) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    const nextValue = clampDelay(value, MIN_COMPUTER_ACTION_DELAY_MS, MAX_COMPUTER_ACTION_DELAY_MS);
    setComputerActionDelayMs(nextValue);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", computerActionDelayMs: nextValue });
    }
  }

  function updateNextHandDelay(value) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    const nextValue = clampDelay(value, MIN_NEXT_HAND_DELAY_MS, MAX_NEXT_HAND_DELAY_MS);
    setNextHandDelayMs(nextValue);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", nextHandDelayMs: nextValue });
    }
  }

  function updateHumanActionTimeout(value) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    const nextValue = clampDelay(value, MIN_HUMAN_ACTION_TIMEOUT_MS, MAX_HUMAN_ACTION_TIMEOUT_MS);
    setHumanActionTimeoutMs(nextValue);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", humanActionTimeoutMs: nextValue });
    }
  }

  function sendMultiplayerMessage(message) {
    const socket = multiplayerSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setMultiplayerError("WebSocket 서버에 연결되어 있지 않습니다. npm run dev 또는 npm run start로 실행해야 합니다.");
      return;
    }
    socket.send(JSON.stringify(message));
  }

  function createMultiplayerRoom() {
    setMultiplayerLobbyMode("create");
    sendMultiplayerMessage({
      type: "createRoom",
      playerName: multiplayerName,
      humanSlots: multiplayerSlots,
      settings: multiplayerSettingsPayload,
    });
  }

  function joinMultiplayerRoom() {
    setMultiplayerLobbyMode("join");
    sendMultiplayerMessage({
      type: "joinRoom",
      playerName: multiplayerName,
      roomId: multiplayerJoinCode,
    });
  }

  function leaveMultiplayerRoom() {
    sendMultiplayerMessage({ type: "leaveRoom" });
    setMultiplayerRoom(null);
    setMultiplayerPlayerId(null);
    setMultiplayerGameActive(false);
    setMultiplayerLobbyMode("");
    setSetupTab("multiplayer");
    setState(null);
    multiplayerRoomIdRef.current = "";
    multiplayerPlayerIdRef.current = null;
    multiplayerGameActiveRef.current = false;
  }

  function startGame() {
    if (isMultiplayerSetup && !multiplayerRoom) {
      if (!isMultiplayerCreateFlow) {
        setMultiplayerError("룸 만들기를 선택해야 게임 설정으로 룸을 만들 수 있습니다.");
        return;
      }
      createMultiplayerRoom();
      return;
    }

    if (multiplayerRoom) {
      if (!isMultiplayerHost) {
        setMultiplayerError("방장만 게임을 시작할 수 있습니다.");
        return;
      }
      sendMultiplayerMessage({
        type: "startGame",
        ...multiplayerSettingsPayload,
      });
      return;
    }

    const initialComputerStyles = Object.fromEntries(
      setupPlayers
        .filter((player) => !player.isHuman)
        .map((player) => [player.id, resolveComputerStyleKey(getComputerStyleSelection(computerStyles[player.id]).key)]),
    );
    const initialComputerLevels = Object.fromEntries(
      setupPlayers
        .filter((player) => !player.isHuman)
        .map((player) => [player.id, resolveComputerLevelKey(getComputerLevelSelection(computerLevels[player.id]).key)]),
    );
    const initialChipTotals = Object.fromEntries(
      setupPlayers.map((player) => [
        player.id,
        {
          chipBalance: setupBalances[player.id] ?? 0,
          chipsWon: 0,
        },
      ]),
    );
    const nextState = startNewHand({
      cpuCount,
      includeHuman,
      dealerIndex: 0,
      chipTotals: initialChipTotals,
      feeTotal: 0,
      handNumber: 1,
      computerStyles: initialComputerStyles,
      computerLevels: initialComputerLevels,
      endlessMode,
      endlessReplacementComputerStyle: getComputerStyleSelection(endlessReplacementComputerStyle).key,
      endlessReplacementComputerLevel: getComputerLevelSelection(endlessReplacementComputerLevel).key,
      endlessReplacementStartingBalance,
      playerConfigs: setupPlayers.map((player) => ({
        id: player.id,
        name: player.name,
        isHuman: player.isHuman,
        startingBalance: setupBalances[player.id] ?? DEFAULT_STARTING_BALANCE,
      })),
    });
    setDealerIndex(nextState.dealerIndex);
    setChipTotals(nextState.chipTotals ?? initialChipTotals);
    setHandHistory([]);
    setArchivedHandIds(new Set());
    setState(nextState);
  }

  function openSetup() {
    if (multiplayerRoom) {
      leaveMultiplayerRoom();
    }
    setDealerIndex(0);
    setChipTotals({});
    setHandHistory([]);
    setArchivedHandIds(new Set());
    setState(null);
  }

  function nextHand() {
    if (multiplayerGameActive) {
      if (!state?.finished || state.gameOver) {
        return;
      }
      if (!canConfirmMultiplayerNextHand) {
        setMultiplayerError("다음 핸드 진행 확인 대상이 아닙니다.");
        return;
      }
      if (hasConfirmedMultiplayerNextHand) {
        return;
      }
      sendMultiplayerMessage({ type: "requestNextHand" });
      return;
    }

    if (!state?.finished || state.gameOver) {
      return;
    }
    const nextDealerIndex = (dealerIndex + 1) % state.players.length;
    const nextState = startNewHand({
      cpuCount,
      includeHuman: state.players.some((player) => player.isHuman),
      dealerIndex: nextDealerIndex,
      chipTotals: state?.chipTotals ?? chipTotals,
      feeTotal: state?.feeTotal ?? 0,
      handNumber: (state?.handNumber ?? 0) + 1,
      computerStyles: state?.computerStyles ?? computerStyles,
      computerLevels: state?.computerLevels ?? computerLevels,
      endlessMode,
      endlessReplacementComputerStyle,
      endlessReplacementComputerLevel,
      endlessReplacementStartingBalance,
      playerStats: state?.playerStats ?? {},
      playerConfigs: state?.playerConfigs,
    });
    setDealerIndex(nextState.dealerIndex);
    setChipTotals(nextState.chipTotals ?? {});
    setState(nextState);
  }

  useEffect(() => {
    if (multiplayerGameActive || !autoNextHand || !state?.finished || state.gameOver) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      nextHand();
    }, nextHandDelayMs);

    return () => window.clearTimeout(timer);
  }, [
    autoNextHand,
    chipTotals,
    computerLevels,
    computerStyles,
    cpuCount,
    dealerIndex,
    endlessMode,
    endlessReplacementComputerLevel,
    endlessReplacementComputerStyle,
    endlessReplacementStartingBalance,
    multiplayerGameActive,
    nextHandDelayMs,
    state,
  ]);

  function onHumanAction(action) {
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "gameAction", action });
      return;
    }

    if (humanIndex < 0) {
      return;
    }
    setState((current) => {
      const next = applyAction(current, action, humanIndex);
      if (next.chipTotals) {
        setChipTotals(next.chipTotals);
      }
      return next;
    });
  }

  useEffect(() => {
    if (!state) {
      return;
    }
    if (state.finished) {
      setChipTotals(state.chipTotals ?? {});
    }
  }, [state]);

  useEffect(() => {
    if (!state?.finished) {
      return;
    }
    const handId = state.handId ?? state.log[0] ?? `${state.streetIndex}-${state.log.length}`;
    if (archivedHandIds.has(handId)) {
      return;
    }

    const winnerNames = state.winnerIds
      .map((id) => state.players.find((player) => player.id === id)?.name)
      .filter(Boolean);
    const summary = state.gameOver
      ? "게임 종료"
      : winnerNames.length > 0
        ? `승자: ${winnerNames.join(", ")}`
        : "정산 보류";
    const entry = {
      id: handId,
      title: `핸드 ${state.handNumber ?? handHistory.length + 1}`,
      summary,
      log: [...state.log],
    };

    setHandHistory((current) => [entry, ...current]);
    setArchivedHandIds((current) => new Set(current).add(handId));
  }, [archivedHandIds, handHistory.length, state]);

  if (!state) {
    return (
      <main className="app-shell">
        <section className="hero panel">
          <div>
            <p className="eyebrow">Gangwon Land Hold&apos;em</p>
            <h1>강원랜드 기준 베팅 시뮬레이터</h1>
            <p>
              강원랜드 기준으로 제공된 베팅 금액, 블라인드, 쇼다운 수수료를 확인하며 진행하는 텍사스 홀덤 시뮬레이터입니다. 플레이어 카드 구성, 컴퓨터 성향과 수준 선택은 앱 진행용 설정이며, 제공된 기준의 좌석 수 규정이 아닙니다.
            </p>
          </div>
        </section>
        <section className="panel setup-panel">
          <div>
            <h2>게임 시작 설정</h2>
            <p className="note">
              시작 금액, 컴퓨터 성향/수준, 잔액 부족 탈락은 앱 진행용 설정입니다. 잔액 {formatMoney(MIN_PLAYABLE_BALANCE)} 미만인 플레이어는 다음 핸드를 진행할 수 없어 탈락 처리됩니다.
            </p>
          </div>
          <div className="setup-mode-switch" role="radiogroup" aria-label="플레이 모드">
            {SETUP_MODE_OPTIONS.map((mode) => (
              <button
                aria-checked={setupMode === mode.key}
                className={`mode-option${setupMode === mode.key ? " is-active" : ""}`}
                disabled={Boolean(multiplayerRoom) && mode.key === "single"}
                key={mode.key}
                onClick={() => changeSetupMode(mode.key)}
                role="radio"
                type="button"
              >
                {mode.label}
              </button>
            ))}
          </div>
          <div className="section-tabs setup-tabs" role="tablist" aria-label="게임 시작 설정">
            {setupTabs.map((tab) => (
              <button
                aria-selected={setupTab === tab.key}
                className={`section-tab setup-tab${setupTab === tab.key ? " is-active" : ""}`}
                key={tab.key}
                onClick={() => setSetupTab(tab.key)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {setupTab === "game" ? (
            <div className="setup-section setup-game-section" role="tabpanel">
              <div className="setup-controls">
                {isMultiplayerSetup ? (
                  <label className="toggle-input">
                    <input
                      type="checkbox"
                      checked={randomizeMultiplayerHumanSeats}
                      onChange={(event) => setRandomizeMultiplayerHumanSeats(event.target.checked)}
                      disabled={!canEditMultiplayerSettings}
                    />
                    사람 자리 랜덤 배치
                  </label>
                ) : null}
                <label className="toggle-input">
                  <input
                    type="checkbox"
                    checked={autoNextHand}
                    onChange={(event) => updateAutoNextHand(event.target.checked)}
                    disabled={!canEditMultiplayerSettings}
                  />
                  다음 핸드 자동 진행
                </label>
                <label className="toggle-input">
                  <input
                    type="checkbox"
                    checked={endlessMode}
                    onChange={(event) => updateEndlessMode(event.target.checked)}
                    disabled={!canEditMultiplayerSettings}
                  />
                  엔들리스 게임 모드
                </label>
                {endlessMode ? (
                  <>
                    <label>
                      엔들리스 신규 컴퓨터 성향
                      <select
                        value={getComputerStyleSelection(endlessReplacementComputerStyle).key}
                        onChange={(event) => updateEndlessReplacementStyle(event.target.value)}
                        disabled={!canEditMultiplayerSettings}
                      >
                        {COMPUTER_STYLE_OPTIONS.map((style) => (
                          <option key={style.key} value={style.key}>
                            {style.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      엔들리스 신규 컴퓨터 수준
                      <select
                        value={getComputerLevelSelection(endlessReplacementComputerLevel).key}
                        onChange={(event) => updateEndlessReplacementLevel(event.target.value)}
                        disabled={!canEditMultiplayerSettings}
                      >
                        {COMPUTER_LEVEL_OPTIONS.map((level) => (
                          <option key={level.key} value={level.key}>
                            {level.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="delay-input">
                      엔들리스 신규 시작 금액
                      <input
                        min={MIN_PLAYABLE_BALANCE}
                        step="1000"
                        type="number"
                        value={endlessReplacementStartingBalance}
                        onChange={(event) => updateEndlessReplacementBalance(event.target.value)}
                        disabled={!canEditMultiplayerSettings}
                      />
                    </label>
                  </>
                ) : null}
                <label className="toggle-input">
                  <input
                    type="checkbox"
                    checked={showComputerStylesInGame}
                    onChange={(event) => updateShowComputerStylesInGame(event.target.checked)}
                    disabled={!canEditMultiplayerSettings}
                  />
                  인게임 컴퓨터 성향/수준 표시
                </label>
                <label className="delay-input">
                  컴퓨터 행동 딜레이(ms)
                  <input
                    min={MIN_COMPUTER_ACTION_DELAY_MS}
                    max={MAX_COMPUTER_ACTION_DELAY_MS}
                    step="100"
                    type="number"
                    value={computerActionDelayMs}
                    onChange={(event) => updateComputerActionDelay(event.target.value)}
                    disabled={!canEditMultiplayerSettings}
                  />
                </label>
                <label className="delay-input">
                  다음 핸드 딜레이(ms)
                  <input
                    min={MIN_NEXT_HAND_DELAY_MS}
                    max={MAX_NEXT_HAND_DELAY_MS}
                    step="100"
                    type="number"
                    value={nextHandDelayMs}
                    onChange={(event) => updateNextHandDelay(event.target.value)}
                    disabled={!canEditMultiplayerSettings || !autoNextHand}
                  />
                </label>
                {isMultiplayerSetup ? (
                  <label className="delay-input">
                    멀티플레이 제한 시간(ms)
                    <input
                      min={MIN_HUMAN_ACTION_TIMEOUT_MS}
                      max={MAX_HUMAN_ACTION_TIMEOUT_MS}
                      step="1000"
                      type="number"
                      value={humanActionTimeoutMs}
                      onChange={(event) => updateHumanActionTimeout(event.target.value)}
                      disabled={!canEditMultiplayerSettings}
                    />
                  </label>
                ) : null}
              </div>
              <div className="setup-player-section">
                <div className="setup-player-section-header">
                  <h3>플레이어 설정</h3>
                </div>
                <div className="balance-grid">
                  {displayedSetupPlayers.map((player) => (
                    <div
                      aria-label={`${player.name} 설정 카드`}
                      className={`setup-player-config${canEditMultiplayerSettings ? " is-draggable" : ""}${setupDragClass(player.id, draggedSetupPlayerId, dragOverSetupPlayerId)}`}
                      key={player.id}
                      onDragEnter={(event) => handleSetupPlayerDragOver(event, player.id)}
                      onDragOver={(event) => handleSetupPlayerDragOver(event, player.id)}
                      onDrop={(event) => handleSetupPlayerDrop(event, player.id)}
                      role="group"
                    >
                      <div className="setup-player-card-header">
                        <strong>{player.name}</strong>
                        <div className="setup-player-card-actions">
                          {canEditMultiplayerSettings && setupPlayers.length > 1 ? (
                            <span
                              aria-label={`${player.name} 순서 변경`}
                              className="drag-handle"
                              draggable
                              onDragEnd={handleSetupPlayerDragEnd}
                              onDragStart={(event) => handleSetupPlayerDragStart(event, player.id)}
                              title="드래그해서 순서 변경"
                            >
                              <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
                                <circle cx="5" cy="4" r="1.4" />
                                <circle cx="11" cy="4" r="1.4" />
                                <circle cx="5" cy="8" r="1.4" />
                                <circle cx="11" cy="8" r="1.4" />
                                <circle cx="5" cy="12" r="1.4" />
                                <circle cx="11" cy="12" r="1.4" />
                              </svg>
                            </span>
                          ) : null}
                          {canRemoveSetupPlayer(player) ? (
                            <button
                              aria-label={`${player.name} 제거`}
                              className="setup-card-icon-button"
                              onClick={() => removeSetupPlayerCard(player.id)}
                              title="플레이어 제거"
                              type="button"
                            >
                              <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
                                <path d="M4.2 3.2 8 7l3.8-3.8 1 1L9 8l3.8 3.8-1 1L8 9l-3.8 3.8-1-1L7 8 3.2 4.2l1-1Z" />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <label className="style-input">
                        플레이어 유형
                        <select
                          value={setupPlayerType(player)}
                          onChange={(event) => updateSetupPlayerType(player.id, event.target.value)}
                          disabled={!canEditMultiplayerSettings || (isMultiplayerSetup && Boolean(multiplayerRoom))}
                        >
                          <option value="human" disabled={!canChangeSetupPlayerType(player, "human")}>
                            사람
                          </option>
                          <option value="computer" disabled={!canChangeSetupPlayerType(player, "computer")}>
                            컴퓨터
                          </option>
                        </select>
                      </label>
                      <label className="balance-input">
                        시작 금액
                        <input
                          min="0"
                          step="1000"
                          type="number"
                          value={setupBalances[player.id] ?? 0}
                          onChange={(event) => updateSetupBalance(player.id, event.target.value)}
                          disabled={!canEditMultiplayerSettings}
                        />
                      </label>
                      {player.isHuman ? (
                        <p className="note">{setupHumanPlayerNote(player)}</p>
                      ) : (
                        <>
                          <label className="style-input">
                            컴퓨터 플레이 성향
                            <select
                              value={getComputerStyleSelection(computerStyles[player.id]).key}
                              onChange={(event) => updateComputerStyle(player.id, event.target.value)}
                              disabled={!canEditMultiplayerSettings}
                            >
                              {COMPUTER_STYLE_OPTIONS.map((style) => (
                                <option key={style.key} value={style.key}>
                                  {style.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="style-input">
                            컴퓨터 판단 수준
                            <select
                              value={getComputerLevelSelection(computerLevels[player.id]).key}
                              onChange={(event) => updateComputerLevel(player.id, event.target.value)}
                              disabled={!canEditMultiplayerSettings}
                            >
                              {COMPUTER_LEVEL_OPTIONS.map((level) => (
                                <option key={level.key} value={level.key}>
                                  {level.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      )}
                    </div>
                  ))}
                  {canEditMultiplayerSettings && setupPlayers.length < MAX_TOTAL_PLAYERS ? (
                    <button
                      aria-label="플레이어 카드 추가"
                      className="setup-player-add-card"
                      onClick={addSetupPlayerCard}
                      type="button"
                    >
                      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                        <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
                      </svg>
                    </button>
                  ) : null}
                </div>
                <p className="note">
                  {isMultiplayerSetup
                    ? `마지막 + 카드에서 플레이어를 추가하고, 각 카드의 유형에서 사람 자리 또는 컴퓨터를 선택합니다. 전체 플레이어는 최대 ${MAX_TOTAL_PLAYERS}명입니다.`
                    : `마지막 + 카드에서 플레이어를 추가하고, 각 카드의 유형에서 사람 또는 컴퓨터를 선택합니다. 전체 플레이어는 최대 ${MAX_TOTAL_PLAYERS}명입니다.`}
                  {" "}
                  엔들리스 게임 모드에서는 다음 핸드 시작 시 탈락 좌석에 새 컴퓨터가 입장합니다.
                </p>
              </div>
            </div>
          ) : null}

          {setupTab === "multiplayer" ? (
            <section className="multiplayer-lobby setup-section" role="tabpanel">
              <div>
                <h3>멀티플레이 룸</h3>
                <p className="note">WebSocket 상태: {multiplayerStatus}</p>
              </div>
              <div className="setup-mode-switch multiplayer-room-choice" role="radiogroup" aria-label="멀티플레이 룸 선택">
                {MULTIPLAYER_LOBBY_MODES.map((mode) => (
                  <button
                    aria-checked={multiplayerLobbyMode === mode.key}
                    className={`mode-option${multiplayerLobbyMode === mode.key ? " is-active" : ""}`}
                    disabled={Boolean(multiplayerRoom)}
                    key={mode.key}
                    onClick={() => {
                      setMultiplayerLobbyMode(mode.key);
                      setSetupTab("multiplayer");
                    }}
                    role="radio"
                    type="button"
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              {!multiplayerLobbyMode && !multiplayerRoom ? <p className="note">룸 만들기 또는 룸 참가를 먼저 선택하세요.</p> : null}
              {multiplayerLobbyMode || multiplayerRoom ? (
                <>
                  <div className="setup-controls">
                    <label>
                      표시 이름
                      <input
                        maxLength="20"
                        type="text"
                        value={multiplayerName}
                        onChange={(event) => setMultiplayerName(event.target.value)}
                        disabled={Boolean(multiplayerRoom)}
                      />
                    </label>
                    {multiplayerLobbyMode === "join" ? (
                      <label>
                        룸 코드
                        <input
                          maxLength="6"
                          type="text"
                          value={multiplayerJoinCode}
                          onChange={(event) => setMultiplayerJoinCode(event.target.value.toUpperCase())}
                          disabled={Boolean(multiplayerRoom)}
                        />
                      </label>
                    ) : null}
                  </div>
                  <div className="setup-actions">
                    {!multiplayerRoom && multiplayerLobbyMode === "create" ? (
                      <button type="button" onClick={createMultiplayerRoom}>
                        룸 만들기
                      </button>
                    ) : null}
                    {!multiplayerRoom && multiplayerLobbyMode === "join" ? (
                      <button className="secondary" type="button" onClick={joinMultiplayerRoom}>
                        룸 참가
                      </button>
                    ) : null}
                    {multiplayerRoom ? (
                      <button className="secondary" type="button" onClick={leaveMultiplayerRoom}>
                        룸 나가기
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
              {multiplayerError ? <p className="note money-negative">{multiplayerError}</p> : null}
              {multiplayerRoom ? (
                <>
                  <div className="room-state">
                    <strong>룸 코드: {multiplayerRoom.id}</strong>
                    <div className="room-slots">
                      {multiplayerRoom.seats.map((seat) => (
                        <div className={`room-slot${seat.playerId && !seat.connected ? " is-disconnected" : ""}`} key={seat.id}>
                          <span>{seat.label}</span>
                          <strong>{seat.name ? `${seat.name}${seat.connected ? "" : " (연결 끊김)"}` : "대기 중"}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="note">
                    멀티플레이에서는 사람 자리 {multiplayerRoom.humanSlots}명과 컴퓨터 {cpuCount}명을 합쳐 최대 {MAX_TOTAL_PLAYERS}명까지만 구성할 수 있습니다.
                    {randomizeMultiplayerHumanSeats ? " 게임 시작 시 사람 자리 순서는 서버에서 랜덤으로 확정됩니다." : " 플레이어 설정 카드 순서가 게임 시작 순서로 반영됩니다."}
                    {isMultiplayerHost ? " 방장만 게임 설정을 변경할 수 있습니다." : " 참가자는 방장이 정한 설정으로 진행합니다."}
                  </p>
                </>
              ) : null}
            </section>
          ) : null}

          {setupTab === "rules" ? (
            <div className="setup-section" role="tabpanel">
              <RulesPanel embedded />
            </div>
          ) : null}

          {showSetupStartAction ? (
            <div className="setup-actions setup-primary-action">
              <button onClick={startGame} disabled={!canStartSetupGame || (multiplayerRoom && !isMultiplayerHost)}>
                {setupStartButtonLabel}
              </button>
              {!canStartSetupGame ? (
                <p className="note">
                  {isMultiplayerSetup && !multiplayerRoom
                    ? "멀티플레이는 룸을 만든 뒤 방장이 시작합니다."
                    : "진행 가능한 플레이어가 2명 이상 필요합니다."}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  const activeStreet = STREETS[state.streetIndex];
  const controlledPlayerId = multiplayerGameActive ? multiplayerPlayerId : null;
  const humanIndex = multiplayerGameActive
    ? state.players.findIndex((player) => player.id === controlledPlayerId && player.isHuman)
    : state.players.findIndex((player) => player.isHuman);
  const hasHumanPlayer = humanIndex >= 0;
  const isControlledHumanTurn = hasHumanPlayer && state.currentPlayerIndex === humanIndex && state.waitingForHuman && !state.finished;
  const humanActions = isControlledHumanTurn ? getAvailableActions(state, humanIndex) : [];
  const humanActionHint = isControlledHumanTurn ? buildHumanActionHint(state, humanIndex, humanActions) : "";
  const revealCards = state.finished && state.showdownResults.length > 0;
  const currentActor = state.players[state.currentPlayerIndex];
  let statusText = "컴퓨터 진행 중입니다.";
  if (state.gameOver) {
    statusText = "게임이 종료되었습니다.";
  } else if (state.finished && multiplayerGameActive && autoNextHand) {
    statusText = "핸드가 종료되었습니다. 자동 진행 옵션에 따라 다음 핸드를 대기 중입니다.";
  } else if (state.finished && multiplayerGameActive && hasConfirmedMultiplayerNextHand) {
    statusText = "다른 사람 플레이어의 다음 핸드 클릭을 기다립니다.";
  } else if (state.finished && multiplayerGameActive) {
    statusText = "핸드가 종료되었습니다. 다음 핸드를 눌러 준비하세요.";
  } else if (state.finished && autoNextHand) {
    statusText = "핸드가 종료되었습니다. 자동 진행 옵션에 따라 다음 핸드를 대기 중입니다.";
  } else if (state.finished) {
    statusText = "핸드가 종료되었습니다. 테이블의 다음 핸드 버튼을 눌러 진행하세요.";
  } else if (multiplayerGameActive && isControlledHumanTurn) {
    statusText = "내 차례입니다.";
  } else if (multiplayerGameActive && currentActor?.isHuman) {
    statusText = `${currentActor.name} 차례입니다.`;
  } else if (multiplayerGameActive && hasHumanPlayer) {
    statusText = "서버에서 컴퓨터 진행을 동기화 중입니다.";
  } else if (multiplayerGameActive) {
    statusText = "관전 중입니다.";
  } else if (!hasHumanPlayer) {
    statusText = "컴퓨터 플레이어만으로 자동 진행 중입니다.";
  } else if (state.waitingForHuman) {
    statusText = "사람 차례입니다.";
  }
  const dealerName = state.gameOver ? "-" : state.players[state.dealerIndex]?.name;
  const turnName = state.gameOver ? "-" : state.players[state.currentPlayerIndex]?.name;
  const handFee = state.finished ? state.currentHandFee ?? 0 : calculateFee(state.pot);
  const handFeeLabel = state.finished ? "이번 핸드 수수료" : "이번 핸드 예상 수수료";
  const cumulativeFee = state.feeTotal ?? 0;
  const isNextHandReadyPhase = state.finished && !state.gameOver;
  const nextHandButtonDisabled = multiplayerGameActive && (!canConfirmMultiplayerNextHand || hasConfirmedMultiplayerNextHand);
  const nextHandButtonLabel = multiplayerGameActive && hasConfirmedMultiplayerNextHand ? "다음 핸드 준비 완료" : "다음 핸드";

  return (
    <main className="app-shell">
      <section className="hero panel">
        <div>
          <p className="eyebrow">Gangwon Land Hold&apos;em</p>
          <h1>강원랜드 기준 베팅 시뮬레이터</h1>
          <p>
            강원랜드 기준으로 제공된 베팅 금액, 블라인드, 쇼다운 수수료를 확인하며 진행하는 텍사스 홀덤 시뮬레이터입니다. 플레이어 카드 구성, 컴퓨터 성향과 수준 선택은 앱 진행용 설정이며, 제공된 기준의 좌석 수 규정이 아닙니다.
          </p>
          <p className="note">컴퓨터 성향/수준: {activeComputerStyleSummary || "없음"}</p>
        </div>
      </section>

      <section className={`panel active-game-panel${activeGameTab === "table" ? " is-table" : ""}`}>
        <div className="section-tabs active-game-tabs" role="tablist" aria-label="게임 진행 섹션">
          {ACTIVE_GAME_TABS.map((tab) => (
            <button
              aria-selected={activeGameTab === tab.key}
              className={`section-tab active-game-tab${activeGameTab === tab.key ? " is-active" : ""}`}
              key={tab.key}
              onClick={() => setActiveGameTab(tab.key)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

      {activeGameTab === "settings" ? (
      <section className="active-game-section game-settings-panel" role="tabpanel">
        <div>
          <h2>게임 진행 설정</h2>
          <p className="note">진행 중 변경 가능한 앱 옵션입니다. 멀티플레이에서는 방장만 변경할 수 있습니다.</p>
        </div>
        <div className="game-settings-controls">
          <label className="toggle-input">
            <input
              type="checkbox"
              checked={autoNextHand}
              onChange={(event) => updateAutoNextHand(event.target.checked)}
              disabled={!canEditActiveGameSettings}
            />
            다음 핸드 자동 진행
          </label>
          <label className="toggle-input">
            <input
              type="checkbox"
              checked={endlessMode}
              onChange={(event) => updateEndlessMode(event.target.checked)}
              disabled={!canEditActiveGameSettings}
            />
            엔들리스 게임 모드
          </label>
          {endlessMode ? (
            <>
              <label>
                엔들리스 신규 컴퓨터 성향
                <select
                  value={getComputerStyleSelection(endlessReplacementComputerStyle).key}
                  onChange={(event) => updateEndlessReplacementStyle(event.target.value)}
                  disabled={!canEditActiveGameSettings}
                >
                  {COMPUTER_STYLE_OPTIONS.map((style) => (
                    <option key={style.key} value={style.key}>
                      {style.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                엔들리스 신규 컴퓨터 수준
                <select
                  value={getComputerLevelSelection(endlessReplacementComputerLevel).key}
                  onChange={(event) => updateEndlessReplacementLevel(event.target.value)}
                  disabled={!canEditActiveGameSettings}
                >
                  {COMPUTER_LEVEL_OPTIONS.map((level) => (
                    <option key={level.key} value={level.key}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                엔들리스 신규 시작 금액
                <input
                  min={MIN_PLAYABLE_BALANCE}
                  step="1000"
                  type="number"
                  value={endlessReplacementStartingBalance}
                  onChange={(event) => updateEndlessReplacementBalance(event.target.value)}
                  disabled={!canEditActiveGameSettings}
                />
              </label>
            </>
          ) : null}
          <label className="toggle-input">
            <input
              type="checkbox"
              checked={showComputerStylesInGame}
              onChange={(event) => updateShowComputerStylesInGame(event.target.checked)}
              disabled={!canEditActiveGameSettings}
            />
            인게임 컴퓨터 성향/수준 표시
          </label>
          <label>
            컴퓨터 행동 딜레이(ms)
            <input
              min={MIN_COMPUTER_ACTION_DELAY_MS}
              max={MAX_COMPUTER_ACTION_DELAY_MS}
              step="100"
              type="number"
              value={computerActionDelayMs}
              onChange={(event) => updateComputerActionDelay(event.target.value)}
              disabled={!canEditActiveGameSettings}
            />
          </label>
          <label>
            다음 핸드 딜레이(ms)
            <input
              min={MIN_NEXT_HAND_DELAY_MS}
              max={MAX_NEXT_HAND_DELAY_MS}
              step="100"
              type="number"
              value={nextHandDelayMs}
              onChange={(event) => updateNextHandDelay(event.target.value)}
              disabled={!canEditActiveGameSettings || !autoNextHand}
            />
          </label>
          <label>
            멀티플레이 제한 시간(ms)
            <input
              min={MIN_HUMAN_ACTION_TIMEOUT_MS}
              max={MAX_HUMAN_ACTION_TIMEOUT_MS}
              step="1000"
              type="number"
              value={humanActionTimeoutMs}
              onChange={(event) => updateHumanActionTimeout(event.target.value)}
              disabled={!canEditActiveGameSettings}
            />
          </label>
          <button onClick={openSetup}>새 게임 설정</button>
        </div>
      </section>
      ) : null}

      {activeGameTab === "table" ? (
      <section className="active-game-section game-table-section" role="tabpanel">
        <header className="table-header">
          <div>
            <h2>{activeStreet.label}</h2>
            <p>
              먹(Pot) {formatMoney(state.pot)} / 현재 베팅 {formatMoney(state.currentBet)}
            </p>
            <p>
              누적 수수료 {formatMoney(cumulativeFee)} / {handFeeLabel} {formatMoney(handFee)}
            </p>
          </div>
          <div>
            <p>딜러: {dealerName}</p>
            <p>현재 턴: {turnName}</p>
          </div>
        </header>

        <div className="community">
          {state.communityCards.map((card, index) => (
            <div className={`card large${cardSuitClass(card)}`} key={`${card.id}-${index}`}>
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
            <Seat
              blindRole={index === state.smallBlindIndex ? "SB" : index === state.bigBlindIndex ? "BB" : ""}
              isDealer={index === state.dealerIndex}
              isTurn={state.currentPlayerIndex === index && !state.finished}
              key={player.id}
              player={player}
              revealCards={revealCards}
              showdownLabel={showdownMap[player.id] ?? ""}
              showComputerStyle={showComputerStylesInGame}
              showPrivateCards={multiplayerGameActive ? player.id === multiplayerPlayerId : player.isHuman}
              winner={state.winnerIds.includes(player.id)}
            />
          ))}
        </div>

        <section className="controls">
          <div>
            <h3>플레이어 행동</h3>
            <p>{statusText}</p>
          </div>
          {multiplayerGameActive && multiplayerTimer ? <TimerProgress timer={multiplayerTimer} nowMs={timerNowMs} /> : null}
          {isNextHandReadyPhase ? (
            <div className="action-row">
              <button onClick={nextHand} disabled={nextHandButtonDisabled}>
                {nextHandButtonLabel}
              </button>
            </div>
          ) : hasHumanPlayer ? (
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
          ) : null}
          {humanActionHint ? <p className="note">{humanActionHint}</p> : null}
          {isNextHandReadyPhase && multiplayerGameActive ? (
            <p className="note">
              {autoNextHand
                ? `자동 진행 옵션이 켜져 있습니다. 직접 진행하려면 사람 플레이어 전원이 다음 핸드를 눌러야 합니다. 준비 ${multiplayerNextHandReadyCount}/${multiplayerNextHandRequiredIds.length}명`
                : `사람 플레이어 전원이 다음 핸드를 눌러야 진행됩니다. 준비 ${multiplayerNextHandReadyCount}/${multiplayerNextHandRequiredIds.length}명`}
            </p>
          ) : null}
          {state.finished ? (
            <p className="note">
              공개 순서: {state.revealOrder.map((id) => state.players.find((player) => player.id === id)?.name).join(" → ") || "즉시 종료"}
            </p>
          ) : null}
          <p className="note">{state.note}</p>
          <p className="note">보유 금액은 게임 시작 전에 입력한 앱 진행용 시작 금액에서 베팅과 정산을 반영한 값입니다.</p>
        </section>
      </section>
      ) : null}

      {activeGameTab === "info" ? (
      <section className="active-game-section info-panel" role="tabpanel">
        <div className="info-panel-header">
          <div>
            <h2>보조 정보</h2>
            <p className="note">진행 로그, 규칙 요약, 구현 기록을 필요한 항목만 열어 볼 수 있습니다.</p>
          </div>
          <div className="section-tabs info-tabs" role="tablist" aria-label="게임 보조 정보">
            {GAME_INFO_TABS.map((tab) => (
              <button
                aria-selected={gameInfoTab === tab.key}
                className={`section-tab info-tab${gameInfoTab === tab.key ? " is-active" : ""}`}
                key={tab.key}
                onClick={() => setGameInfoTab(tab.key)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {gameInfoTab === "log" ? (
          <div className="info-section log-section" role="tabpanel">
            <h3>현재 핸드</h3>
            <ol>
              {[...state.log].reverse().map((line, index) => (
                <li key={`${line}-${index}`}>{line}</li>
              ))}
            </ol>
            <h3>이전 핸드 기록</h3>
            {handHistory.filter((entry) => entry.id !== state.handId).length > 0 ? (
              <div className="history-list">
                {handHistory
                  .filter((entry) => entry.id !== state.handId)
                  .map((entry) => (
                    <details className="history-item" key={entry.id}>
                      <summary>
                        <span>{entry.title}</span>
                        <span>{entry.summary}</span>
                      </summary>
                      <ol>
                        {[...entry.log].reverse().map((line, index) => (
                          <li key={`${entry.id}-${line}-${index}`}>{line}</li>
                        ))}
                      </ol>
                    </details>
                  ))}
              </div>
            ) : (
              <p className="note">아직 완료된 이전 핸드가 없습니다.</p>
            )}
          </div>
        ) : null}

        {gameInfoTab === "rules" ? (
          <div className="info-section" role="tabpanel">
            <RulesPanel embedded />
          </div>
        ) : null}

        {gameInfoTab === "progress" ? (
          <div className="info-section step-section" role="tabpanel">
            <h3>프로젝트 진행 순서</h3>
            <ol>
              <li>`git init`으로 저장소를 초기화했습니다.</li>
              <li>Next.js 앱 구조를 `app/`, `components/`, `lib/`로 분리했습니다.</li>
              <li>강원랜드 기준 블라인드, 단계별 베팅 금액, 1인 최대 100,000원을 엔진에 고정했습니다.</li>
              <li>앱 진행용 상대 선택 UI를 구성했습니다. 이 값은 제공된 기준의 좌석 수 규정이 아닙니다.</li>
              <li>프리 플랍, 플랍, 턴, 리버, 쇼다운과 수수료 5% 정산을 연결했습니다.</li>
            </ol>
          </div>
        ) : null}
      </section>
      ) : null}
      </section>
    </main>
  );
}
