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
const MIN_CPU_WITH_HUMAN = 0;
const MIN_CPU_ONLY = 2;
const MAX_CPU_WITH_HUMAN = MAX_TOTAL_PLAYERS - 1;
const MAX_CPU_ONLY = MAX_TOTAL_PLAYERS;
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
  { key: "players", label: "플레이어" },
  { key: "rules", label: "규칙 요약" },
];
const MULTIPLAYER_SETUP_TABS = [
  { key: "multiplayer", label: "멀티플레이" },
  { key: "game", label: "게임 설정" },
  { key: "players", label: "플레이어" },
  { key: "rules", label: "규칙 요약" },
];
const GAME_INFO_TABS = [
  { key: "log", label: "진행 로그" },
  { key: "rules", label: "규칙 요약" },
  { key: "progress", label: "구현 기록" },
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

function clampHumanSeatIndex(value, cpuCount, includeHuman = true) {
  if (!includeHuman) {
    return 0;
  }
  const maxIndex = cpuCount;
  return Math.min(Math.max(0, Number(value) || 0), maxIndex);
}

function buildHumanSeatOptions(cpuCount) {
  return Array.from({ length: cpuCount + 1 }, (_, index) => index);
}

function buildSetupPlayers(cpuCount, includeHuman = true, humanSeatIndex = 0) {
  const cpuPlayers = Array.from({ length: cpuCount }, (_, index) => ({
    id: `cpu-${index + 1}`,
    name: `컴퓨터 ${index + 1}`,
    isHuman: false,
  }));
  if (!includeHuman) {
    return cpuPlayers;
  }

  const players = [...cpuPlayers];
  players.splice(clampHumanSeatIndex(humanSeatIndex, cpuCount, includeHuman), 0, {
    id: "human",
    name: "플레이어",
    isHuman: true,
  });
  return players;
}

function buildSetupBalances(cpuCount, includeHuman = true, previous = {}, humanSeatIndex = 0) {
  return Object.fromEntries(
    buildSetupPlayers(cpuCount, includeHuman, humanSeatIndex).map((player) => [player.id, previous[player.id] ?? DEFAULT_STARTING_BALANCE]),
  );
}

function buildSetupComputerStyles(cpuCount, includeHuman = true, previous = {}, humanSeatIndex = 0) {
  return Object.fromEntries(
    buildSetupPlayers(cpuCount, includeHuman, humanSeatIndex)
      .filter((player) => !player.isHuman)
      .map((player) => [player.id, getComputerStyleSelection(previous[player.id]).key]),
  );
}

function buildSetupComputerLevels(cpuCount, includeHuman = true, previous = {}, humanSeatIndex = 0) {
  return Object.fromEntries(
    buildSetupPlayers(cpuCount, includeHuman, humanSeatIndex)
      .filter((player) => !player.isHuman)
      .map((player) => [player.id, getComputerLevelSelection(previous[player.id]).key]),
  );
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

function minCpuCount(includeHuman) {
  return includeHuman ? MIN_CPU_WITH_HUMAN : MIN_CPU_ONLY;
}

function maxCpuCount(includeHuman) {
  return includeHuman ? MAX_CPU_WITH_HUMAN : MAX_CPU_ONLY;
}

function buildCpuCountOptions(includeHuman) {
  const min = minCpuCount(includeHuman);
  return Array.from({ length: maxCpuCount(includeHuman) - min + 1 }, (_, index) => index + min);
}

function clampCpuCount(cpuCount, includeHuman) {
  return Math.min(Math.max(minCpuCount(includeHuman), cpuCount), maxCpuCount(includeHuman));
}

function maxMultiplayerCpuCount(humanSlots) {
  return Math.max(0, MAX_TOTAL_PLAYERS - clampHumanSlots(humanSlots));
}

function buildMultiplayerCpuCountOptions(humanSlots) {
  const max = maxMultiplayerCpuCount(humanSlots);
  return Array.from({ length: max + 1 }, (_, index) => index);
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

function moveMultiplayerTableSeat(tableSeats, slotIndex, nextSeatIndex, humanSlots, totalSeatCount) {
  const seats = normalizeMultiplayerTableSeats(tableSeats, humanSlots, totalSeatCount);
  const targetSeatIndex = clampTableSeatIndex(nextSeatIndex, totalSeatCount);
  const previousSeatIndex = seats[slotIndex];
  const occupiedSlotIndex = seats.findIndex((seatIndex, index) => index !== slotIndex && seatIndex === targetSeatIndex);

  if (occupiedSlotIndex >= 0) {
    seats[occupiedSlotIndex] = previousSeatIndex;
  }
  seats[slotIndex] = targetSeatIndex;
  return normalizeMultiplayerTableSeats(seats, humanSlots, totalSeatCount);
}

function sameNumberList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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

function Seat({ player, isTurn, revealCards, showPrivateCards, showComputerStyle, winner, blindRole, isDealer }) {
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
  const [humanSeatIndex, setHumanSeatIndex] = useState(0);
  const [computerStyles, setComputerStyles] = useState(() => buildSetupComputerStyles(3, true, {}, 0));
  const [computerLevels, setComputerLevels] = useState(() => buildSetupComputerLevels(3, true, {}, 0));
  const [setupBalances, setSetupBalances] = useState(() => buildSetupBalances(3, true, {}, 0));
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
  const [multiplayerTableSeats, setMultiplayerTableSeats] = useState(() => buildDefaultMultiplayerTableSeats(2, 5));
  const [randomizeMultiplayerHumanSeats, setRandomizeMultiplayerHumanSeats] = useState(false);
  const [multiplayerHumanBalance, setMultiplayerHumanBalance] = useState(DEFAULT_STARTING_BALANCE);
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
  const [setupTab, setSetupTab] = useState("game");
  const [gameInfoTab, setGameInfoTab] = useState("log");
  const multiplayerSocketRef = useRef(null);
  const multiplayerReconnectRef = useRef(null);
  const multiplayerRoomIdRef = useRef("");
  const multiplayerPlayerIdRef = useRef(null);
  const multiplayerNameRef = useRef(multiplayerName);
  const multiplayerGameActiveRef = useRef(false);
  const lastSentRoomSettingsRef = useRef("");
  const cpuCountSelectRef = useRef(null);
  const includeHumanInputRef = useRef(null);
  const hasSyncedRestoredCpuCountRef = useRef(false);

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
      setSetupTab((current) => (current === "multiplayer" ? current : "multiplayer"));
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
  const setupTabs = isMultiplayerSetup ? MULTIPLAYER_SETUP_TABS : SINGLEPLAY_SETUP_TABS;
  const setupIncludesLocalHuman = !isMultiplayerSetup && includeHuman;
  const resolvedHumanSeatIndex = clampHumanSeatIndex(humanSeatIndex, cpuCount, setupIncludesLocalHuman);
  const setupPlayers = useMemo(
    () => buildSetupPlayers(cpuCount, setupIncludesLocalHuman, resolvedHumanSeatIndex),
    [cpuCount, resolvedHumanSeatIndex, setupIncludesLocalHuman],
  );
  const humanSeatOptions = useMemo(() => buildHumanSeatOptions(cpuCount), [cpuCount]);
  const multiplayerHumanSlotCount = multiplayerRoom?.humanSlots ?? multiplayerSlots;
  const multiplayerConfiguredSeatCount = multiplayerHumanSlotCount + cpuCount;
  const multiplayerTableSeatCount = Math.min(MAX_TOTAL_PLAYERS, multiplayerConfiguredSeatCount);
  const resolvedMultiplayerTableSeats = useMemo(
    () => normalizeMultiplayerTableSeats(multiplayerTableSeats, multiplayerHumanSlotCount, multiplayerTableSeatCount),
    [multiplayerHumanSlotCount, multiplayerTableSeatCount, multiplayerTableSeats],
  );
  const multiplayerTableSeatOptions = useMemo(() => buildTableSeatOptions(multiplayerTableSeatCount), [multiplayerTableSeatCount]);
  const cpuCountOptions = useMemo(() => buildCpuCountOptions(includeHuman), [includeHuman]);
  const effectiveCpuCountOptions = useMemo(
    () => (isMultiplayerSetup ? buildMultiplayerCpuCountOptions(multiplayerHumanSlotCount) : cpuCountOptions),
    [cpuCountOptions, isMultiplayerSetup, multiplayerHumanSlotCount],
  );
  const connectedMultiplayerHumans =
    multiplayerHumanBalance >= MIN_PLAYABLE_BALANCE ? (multiplayerRoom?.seats.filter((seat) => seat.playerId && seat.connected).length ?? 0) : 0;
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
    : !isMultiplayerSetup && playableSetupCount >= 2;
  const setupStartButtonLabel = isMultiplayerSetup ? (multiplayerRoom ? "룸 게임 시작" : "룸 생성 후 시작") : "게임 시작";
  const isMultiplayerHost = Boolean(multiplayerRoom && multiplayerPlayerId && multiplayerRoom.hostPlayerId === multiplayerPlayerId);
  const canEditMultiplayerSettings = !multiplayerRoom || isMultiplayerHost;
  const canEditActiveGameSettings = !multiplayerGameActive || isMultiplayerHost;
  const multiplayerTimer = multiplayerRoom?.timer ?? null;
  const multiplayerNextHandRequiredIds = multiplayerRoom?.nextHandRequiredPlayerIds ?? [];
  const multiplayerNextHandReadyIds = multiplayerRoom?.nextHandReadyPlayerIds ?? [];
  const multiplayerNextHandReadyCount = multiplayerNextHandReadyIds.filter((playerId) => multiplayerNextHandRequiredIds.includes(playerId)).length;
  const canConfirmMultiplayerNextHand = Boolean(multiplayerPlayerId && multiplayerNextHandRequiredIds.includes(multiplayerPlayerId));
  const hasConfirmedMultiplayerNextHand = Boolean(multiplayerPlayerId && multiplayerNextHandReadyIds.includes(multiplayerPlayerId));
  const multiplayerSettingsPayload = useMemo(
    () => ({
      humanStartingBalance: multiplayerHumanBalance,
      humanSeatPlacements: resolvedMultiplayerTableSeats,
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
      multiplayerHumanBalance,
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
    setMultiplayerSlots(room.humanSlots);
    setCpuCount(nextCpuCount);
    setSetupBalances((current) => {
      const nextBalances = buildSetupBalances(nextCpuCount, false, current, 0);
      computerPlayers.forEach((player, index) => {
        nextBalances[`cpu-${index + 1}`] = Math.max(0, Number(player.startingBalance) || 0);
      });
      return nextBalances;
    });
    setComputerStyles((current) => {
      const nextStyles = buildSetupComputerStyles(nextCpuCount, false, current, 0);
      computerPlayers.forEach((player, index) => {
        nextStyles[`cpu-${index + 1}`] = getComputerStyleSelection(player.computerStyle).key;
      });
      return nextStyles;
    });
    setComputerLevels((current) => {
      const nextLevels = buildSetupComputerLevels(nextCpuCount, false, current, 0);
      computerPlayers.forEach((player, index) => {
        nextLevels[`cpu-${index + 1}`] = getComputerLevelSelection(player.computerLevel).key;
      });
      return nextLevels;
    });
    setMultiplayerHumanBalance(Math.max(0, Number(settings.humanStartingBalance) || 0));
    setMultiplayerTableSeats(normalizeMultiplayerTableSeats(settings.humanSeatPlacements, room.humanSlots, room.humanSlots + nextCpuCount));
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

  function applySetupShape(nextCpuCount, nextIncludeHuman, includeSetupHuman = nextIncludeHuman, nextHumanSeatIndex = humanSeatIndex) {
    const clampedHumanSeatIndex = clampHumanSeatIndex(nextHumanSeatIndex, nextCpuCount, includeSetupHuman);
    setCpuCount(nextCpuCount);
    setIncludeHuman(nextIncludeHuman);
    setHumanSeatIndex(clampedHumanSeatIndex);
    setSetupBalances((current) => buildSetupBalances(nextCpuCount, includeSetupHuman, current, clampedHumanSeatIndex));
    setComputerStyles((current) => buildSetupComputerStyles(nextCpuCount, includeSetupHuman, current, clampedHumanSeatIndex));
    setComputerLevels((current) => buildSetupComputerLevels(nextCpuCount, includeSetupHuman, current, clampedHumanSeatIndex));
  }

  function reshapeSetup(nextCpuCount, nextIncludeHuman) {
    const clampedCpuCount = clampCpuCount(nextCpuCount, nextIncludeHuman);
    applySetupShape(clampedCpuCount, nextIncludeHuman, nextIncludeHuman);
  }

  function changeSetupMode(nextMode) {
    const resolvedMode = nextMode === "multiplayer" ? "multiplayer" : "single";
    if (multiplayerRoom && resolvedMode === "single") {
      return;
    }

    setSetupMode(resolvedMode);
    setSetupTab(resolvedMode === "multiplayer" ? "multiplayer" : "game");

    if (resolvedMode === "multiplayer") {
      const clampedCpuCount = clampMultiplayerCpuCount(cpuCount, multiplayerHumanSlotCount);
      if (clampedCpuCount !== cpuCount) {
        applySetupShape(clampedCpuCount, includeHuman, false, humanSeatIndex);
      }
    }
  }

  function changeCpuCount(nextCpuCount) {
    if (multiplayerRoom) {
      if (!isMultiplayerHost) {
        return;
      }
      applySetupShape(clampMultiplayerCpuCount(nextCpuCount, multiplayerRoom.humanSlots), includeHuman, false, humanSeatIndex);
      return;
    }
    reshapeSetup(nextCpuCount, includeHuman);
  }

  function changeHumanSeatIndex(nextHumanSeatIndex) {
    setHumanSeatIndex(clampHumanSeatIndex(nextHumanSeatIndex, cpuCount, includeHuman));
  }

  useEffect(() => {
    if (state || hasSyncedRestoredCpuCountRef.current) {
      return;
    }
    hasSyncedRestoredCpuCountRef.current = true;

    const restoredIncludeHuman = includeHumanInputRef.current?.checked ?? includeHuman;
    const restoredCpuCount = Number(cpuCountSelectRef.current?.value);
    const nextCpuCount = Number.isFinite(restoredCpuCount) ? clampCpuCount(restoredCpuCount, restoredIncludeHuman) : cpuCount;
    if (restoredIncludeHuman !== includeHuman || nextCpuCount !== cpuCount) {
      applySetupShape(nextCpuCount, restoredIncludeHuman, restoredIncludeHuman, humanSeatIndex);
    }
  }, [cpuCount, humanSeatIndex, includeHuman, state]);

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
      applySetupShape(clampedCpuCount, includeHuman, false, humanSeatIndex);
    }
  }, [cpuCount, humanSeatIndex, includeHuman, isMultiplayerSetup, multiplayerHumanSlotCount, multiplayerRoom, state]);

  useEffect(() => {
    if (!multiplayerRoom || state) {
      return;
    }

    const clampedCpuCount = clampMultiplayerCpuCount(cpuCount, multiplayerRoom.humanSlots);
    if (clampedCpuCount !== cpuCount) {
      applySetupShape(clampedCpuCount, includeHuman, false, humanSeatIndex);
    }
  }, [cpuCount, humanSeatIndex, includeHuman, multiplayerRoom, state]);

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
    setMultiplayerTableSeats((current) => {
      const nextSeats = normalizeMultiplayerTableSeats(current, multiplayerHumanSlotCount, multiplayerTableSeatCount);
      return sameNumberList(current, nextSeats) ? current : nextSeats;
    });
  }, [multiplayerHumanSlotCount, multiplayerTableSeatCount]);

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

  function updateMultiplayerHumanBalance(value) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    setMultiplayerHumanBalance(Math.max(0, Number(value) || 0));
  }

  function updateMultiplayerSlots(value) {
    if (multiplayerRoom) {
      return;
    }
    const nextSlots = clampHumanSlots(value);
    setMultiplayerSlots(nextSlots);
    setMultiplayerTableSeats((current) => normalizeMultiplayerTableSeats(current, nextSlots, nextSlots + cpuCount));
  }

  function updateMultiplayerTableSeat(slotIndex, value) {
    if (multiplayerRoom && !isMultiplayerHost) {
      return;
    }
    setMultiplayerTableSeats((current) =>
      moveMultiplayerTableSeat(current, slotIndex, value, multiplayerHumanSlotCount, multiplayerTableSeatCount),
    );
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

  function changeIncludeHuman(nextIncludeHuman) {
    if (multiplayerRoom) {
      if (!isMultiplayerHost) {
        return;
      }
      applySetupShape(clampMultiplayerCpuCount(cpuCount, multiplayerRoom.humanSlots), nextIncludeHuman, false, humanSeatIndex);
      return;
    }
    reshapeSetup(cpuCount, nextIncludeHuman);
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
    sendMultiplayerMessage({
      type: "createRoom",
      playerName: multiplayerName,
      humanSlots: multiplayerSlots,
      settings: multiplayerSettingsPayload,
    });
  }

  function joinMultiplayerRoom() {
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
    setState(null);
    multiplayerRoomIdRef.current = "";
    multiplayerPlayerIdRef.current = null;
    multiplayerGameActiveRef.current = false;
  }

  function startGame() {
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
              강원랜드 기준으로 제공된 베팅 금액, 블라인드, 쇼다운 수수료를 확인하며 진행하는 텍사스 홀덤 시뮬레이터입니다. 사람 플레이어 포함 여부, 컴퓨터 수, 컴퓨터 성향과 수준 선택은 앱 진행용 설정이며, 제공된 기준의 좌석 수 규정이 아닙니다.
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
            <div className="setup-controls setup-section" role="tabpanel">
              <label>
                컴퓨터 플레이어 수
                <select
                  ref={cpuCountSelectRef}
                  value={cpuCount}
                  onChange={(event) => changeCpuCount(Number(event.target.value))}
                  disabled={!canEditMultiplayerSettings}
                >
                  {effectiveCpuCountOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}명
                    </option>
                  ))}
                </select>
              </label>
              {!isMultiplayerSetup ? (
                <>
                  <label className="toggle-input">
                    <input
                      ref={includeHumanInputRef}
                      type="checkbox"
                      checked={includeHuman}
                      onChange={(event) => changeIncludeHuman(event.target.checked)}
                    />
                    사람 플레이어 포함
                  </label>
                  {includeHuman ? (
                    <label>
                      사람 플레이어 자리
                      <select value={resolvedHumanSeatIndex} onChange={(event) => changeHumanSeatIndex(Number(event.target.value))}>
                        {humanSeatOptions.map((option) => (
                          <option key={option} value={option}>
                            {option + 1}번 자리
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </>
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
              <label>
                엔들리스 신규 컴퓨터 성향
                <select
                  value={getComputerStyleSelection(endlessReplacementComputerStyle).key}
                  onChange={(event) => updateEndlessReplacementStyle(event.target.value)}
                  disabled={!canEditMultiplayerSettings || !endlessMode}
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
                  disabled={!canEditMultiplayerSettings || !endlessMode}
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
                  disabled={!canEditMultiplayerSettings || !endlessMode}
                />
              </label>
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
          ) : null}

          {setupTab === "multiplayer" ? (
            <section className="multiplayer-lobby setup-section" role="tabpanel">
              <div>
                <h3>멀티플레이 룸</h3>
                <p className="note">WebSocket 상태: {multiplayerStatus}</p>
              </div>
              <div className="setup-controls">
                <label>
                  표시 이름
                  <input
                    maxLength="20"
                    type="text"
                    value={multiplayerName}
                    onChange={(event) => setMultiplayerName(event.target.value)}
                  />
                </label>
                <label>
                  빈 사람 슬롯
                  <input
                    min={MIN_MULTIPLAYER_HUMAN_SLOTS}
                    max={MAX_MULTIPLAYER_HUMAN_SLOTS}
                    step="1"
                    type="number"
                    value={multiplayerRoom?.humanSlots ?? multiplayerSlots}
                    onChange={(event) => updateMultiplayerSlots(event.target.value)}
                    disabled={Boolean(multiplayerRoom)}
                  />
                </label>
                <label>
                  참가자 시작 금액
                  <input
                    min="0"
                    step="1000"
                    type="number"
                    value={multiplayerHumanBalance}
                    onChange={(event) => updateMultiplayerHumanBalance(event.target.value)}
                    disabled={!canEditMultiplayerSettings}
                  />
                </label>
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
              </div>
              <div className="setup-actions">
                <button type="button" onClick={createMultiplayerRoom}>
                  룸 만들기
                </button>
                <button className="secondary" type="button" onClick={joinMultiplayerRoom}>
                  룸 참가
                </button>
                {multiplayerRoom ? (
                  <button className="secondary" type="button" onClick={leaveMultiplayerRoom}>
                    룸 나가기
                  </button>
                ) : null}
              </div>
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
                    <div className="room-table-seats">
                      <strong>게임 자리 배치</strong>
                      <label className="toggle-input seat-random-toggle">
                        <input
                          type="checkbox"
                          checked={randomizeMultiplayerHumanSeats}
                          onChange={(event) => setRandomizeMultiplayerHumanSeats(event.target.checked)}
                          disabled={!canEditMultiplayerSettings}
                        />
                        사람 자리 랜덤 배치
                      </label>
                      <div className="seat-placement-grid">
                        {multiplayerRoom.seats.map((seat, index) => (
                          <label key={seat.id}>
                            {seat.label}
                            <select
                              value={resolvedMultiplayerTableSeats[index] ?? 0}
                              onChange={(event) => updateMultiplayerTableSeat(index, event.target.value)}
                              disabled={randomizeMultiplayerHumanSeats || !canEditMultiplayerSettings}
                            >
                              {multiplayerTableSeatOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option + 1}번 자리
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                      <p className="note">
                        {randomizeMultiplayerHumanSeats
                          ? "게임 시작 시 모든 사람 슬롯의 자리를 서버에서 랜덤으로 확정합니다."
                          : "컴퓨터 플레이어는 사람이 지정되지 않은 남은 자리에 순서대로 배치됩니다."}
                      </p>
                    </div>
                  </div>
                  <p className="note">
                    멀티플레이에서는 빈 사람 슬롯 {multiplayerRoom.humanSlots}명과 컴퓨터 {cpuCount}명을 합쳐 최대 {MAX_TOTAL_PLAYERS}명까지만 구성할 수 있습니다.
                    {isMultiplayerHost ? " 방장만 게임 설정을 변경할 수 있습니다." : " 현재 설정은 방장이 정한 값으로 동기화됩니다."}
                  </p>
                </>
              ) : null}
            </section>
          ) : null}

          {setupTab === "players" ? (
            <div className="setup-section" role="tabpanel">
              <div className="balance-grid">
                {setupPlayers.map((player) => (
                  <div className="setup-player-config" key={player.id}>
                    <label className="balance-input">
                      <span>{player.name}</span>
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
                      <p className="note">사람 플레이어는 직접 행동을 선택합니다.</p>
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
              </div>
              <p className="note">
                컴퓨터별 성향과 수준은 전략 조언이 아닌 앱 자동 진행 기준입니다. 랜덤은 게임 시작 시 실제 성향이나 수준으로 확정됩니다.
                엔들리스 게임 모드에서는 다음 핸드 시작 시 탈락 좌석에 새 컴퓨터가 입장합니다.
              </p>
            </div>
          ) : null}

          {setupTab === "rules" ? (
            <div className="setup-section" role="tabpanel">
              <RulesPanel embedded />
            </div>
          ) : null}

          <div className="setup-actions setup-primary-action">
            <button onClick={startGame} disabled={!canStartSetupGame || (multiplayerRoom && !isMultiplayerHost)}>
              {setupStartButtonLabel}
            </button>
            {!canStartSetupGame ? (
              <p className="note">
                {isMultiplayerSetup && !multiplayerRoom
                  ? "멀티플레이는 룸을 만들거나 참가한 뒤 방장이 시작합니다."
                  : "진행 가능한 플레이어가 2명 이상 필요합니다."}
              </p>
            ) : null}
          </div>
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
            강원랜드 기준으로 제공된 베팅 금액, 블라인드, 쇼다운 수수료를 확인하며 진행하는 텍사스 홀덤 시뮬레이터입니다. 사람 플레이어 포함 여부, 컴퓨터 수, 컴퓨터 성향과 수준 선택은 앱 진행용 설정이며, 제공된 기준의 좌석 수 규정이 아닙니다.
          </p>
          <p className="note">컴퓨터 성향/수준: {activeComputerStyleSummary || "없음"}</p>
        </div>
        <div className="hero-controls">
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
          <label>
            엔들리스 신규 컴퓨터 성향
            <select
              value={getComputerStyleSelection(endlessReplacementComputerStyle).key}
              onChange={(event) => updateEndlessReplacementStyle(event.target.value)}
              disabled={!canEditActiveGameSettings || !endlessMode}
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
              disabled={!canEditActiveGameSettings || !endlessMode}
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
              disabled={!canEditActiveGameSettings || !endlessMode}
            />
          </label>
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

      <section className="table panel">
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
            <div key={player.id}>
              <Seat
                player={player}
                isTurn={state.currentPlayerIndex === index && !state.finished}
                revealCards={revealCards}
                showPrivateCards={multiplayerGameActive ? player.id === multiplayerPlayerId : player.isHuman}
                showComputerStyle={showComputerStylesInGame}
                winner={state.winnerIds.includes(player.id)}
                blindRole={index === state.smallBlindIndex ? "SB" : index === state.bigBlindIndex ? "BB" : ""}
                isDealer={index === state.dealerIndex}
              />
              {showdownMap[player.id] ? <p className="hand-label">{showdownMap[player.id]}</p> : null}
            </div>
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

      <section className="panel info-panel">
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
    </main>
  );
}
