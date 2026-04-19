"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
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
  resolveComputerStyleKey,
  startNewHand,
} from "../lib/poker";

const DEFAULT_STARTING_BALANCE = 100000;
const MAX_TOTAL_PLAYERS = 8;
const MIN_CPU_WITH_HUMAN = 1;
const MIN_CPU_ONLY = 2;
const MAX_CPU_WITH_HUMAN = MAX_TOTAL_PLAYERS - 1;
const MAX_CPU_ONLY = MAX_TOTAL_PLAYERS;
const DEFAULT_COMPUTER_ACTION_DELAY_MS = 700;
const DEFAULT_NEXT_HAND_DELAY_MS = 1800;
const MIN_COMPUTER_ACTION_DELAY_MS = 100;
const MAX_COMPUTER_ACTION_DELAY_MS = 3000;
const MIN_NEXT_HAND_DELAY_MS = 500;
const MAX_NEXT_HAND_DELAY_MS = 10000;
const MIN_MULTIPLAYER_HUMAN_SLOTS = 2;
const MAX_MULTIPLAYER_HUMAN_SLOTS = MAX_TOTAL_PLAYERS;
const MULTIPLAYER_RECONNECT_DELAY_MS = 1500;

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

function buildSetupPlayers(cpuCount, includeHuman = true) {
  const cpuPlayers = Array.from({ length: cpuCount }, (_, index) => ({
    id: `cpu-${index + 1}`,
    name: `컴퓨터 ${index + 1}`,
    isHuman: false,
  }));
  return includeHuman ? [{ id: "human", name: "플레이어", isHuman: true }, ...cpuPlayers] : cpuPlayers;
}

function buildSetupBalances(cpuCount, includeHuman = true, previous = {}) {
  return Object.fromEntries(
    buildSetupPlayers(cpuCount, includeHuman).map((player) => [player.id, previous[player.id] ?? DEFAULT_STARTING_BALANCE]),
  );
}

function buildSetupComputerStyles(cpuCount, includeHuman = true, previous = {}) {
  return Object.fromEntries(
    buildSetupPlayers(cpuCount, includeHuman)
      .filter((player) => !player.isHuman)
      .map((player) => [player.id, getComputerStyleSelection(previous[player.id]).key]),
  );
}

function getComputerStyleOption(styleKey) {
  return COMPUTER_STYLES.find((style) => style.key === styleKey) ?? COMPUTER_STYLES[0];
}

function getComputerStyleSelection(styleKey) {
  return COMPUTER_STYLE_OPTIONS.find((style) => style.key === styleKey) ?? COMPUTER_STYLES[0];
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

function clampHumanSlots(value) {
  return Math.min(Math.max(MIN_MULTIPLAYER_HUMAN_SLOTS, Number(value) || MIN_MULTIPLAYER_HUMAN_SLOTS), MAX_MULTIPLAYER_HUMAN_SLOTS);
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

function Seat({ player, isTurn, revealCards, showPrivateCards, showComputerStyle, winner }) {
  const chipBalance = player.chipBalance ?? 0;
  const balanceClass = chipBalance > 0 ? "money-positive" : chipBalance < 0 ? "money-negative" : "";
  const computerStyleLabel =
    showComputerStyle && player.computerStyle ? `컴퓨터 · ${getComputerStyleOption(player.computerStyle).label}` : "컴퓨터 · 성향 비공개";
  const seatLabel = player.eliminated ? "탈락" : player.isHuman ? "사람" : computerStyleLabel;

  return (
    <article className={`seat${player.folded ? " is-folded" : ""}${player.eliminated ? " is-eliminated" : ""}${isTurn ? " is-turn" : ""}${winner ? " is-winner" : ""}`}>
      <header>
        <strong>{player.name}</strong>
        <span>{seatLabel}</span>
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
          <dd>{player.lastAction}</dd>
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
  const [computerStyles, setComputerStyles] = useState(() => buildSetupComputerStyles(3, true));
  const [setupBalances, setSetupBalances] = useState(() => buildSetupBalances(3, true));
  const [dealerIndex, setDealerIndex] = useState(0);
  const [chipTotals, setChipTotals] = useState({});
  const [state, setState] = useState(null);
  const [autoNextHand, setAutoNextHand] = useState(true);
  const [showComputerStylesInGame, setShowComputerStylesInGame] = useState(true);
  const [computerActionDelayMs, setComputerActionDelayMs] = useState(DEFAULT_COMPUTER_ACTION_DELAY_MS);
  const [nextHandDelayMs, setNextHandDelayMs] = useState(DEFAULT_NEXT_HAND_DELAY_MS);
  const [multiplayerName, setMultiplayerName] = useState("플레이어");
  const [multiplayerSlots, setMultiplayerSlots] = useState(2);
  const [multiplayerHumanBalance, setMultiplayerHumanBalance] = useState(DEFAULT_STARTING_BALANCE);
  const [multiplayerJoinCode, setMultiplayerJoinCode] = useState("");
  const [multiplayerRoom, setMultiplayerRoom] = useState(null);
  const [multiplayerPlayerId, setMultiplayerPlayerId] = useState(null);
  const [multiplayerGameActive, setMultiplayerGameActive] = useState(false);
  const [multiplayerStatus, setMultiplayerStatus] = useState("연결 대기");
  const [multiplayerError, setMultiplayerError] = useState("");
  const [handHistory, setHandHistory] = useState([]);
  const [archivedHandIds, setArchivedHandIds] = useState(() => new Set());
  const multiplayerSocketRef = useRef(null);
  const multiplayerReconnectRef = useRef(null);
  const multiplayerRoomIdRef = useRef("");
  const multiplayerPlayerIdRef = useRef(null);
  const multiplayerNameRef = useRef(multiplayerName);
  const multiplayerGameActiveRef = useRef(false);
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
  const setupIncludesLocalHuman = !multiplayerRoom && includeHuman;
  const setupPlayers = useMemo(() => buildSetupPlayers(cpuCount, setupIncludesLocalHuman), [cpuCount, setupIncludesLocalHuman]);
  const cpuCountOptions = useMemo(() => buildCpuCountOptions(includeHuman), [includeHuman]);
  const effectiveCpuCountOptions = useMemo(
    () => (multiplayerRoom ? buildMultiplayerCpuCountOptions(multiplayerRoom.humanSlots) : cpuCountOptions),
    [cpuCountOptions, multiplayerRoom],
  );
  const connectedMultiplayerHumans =
    multiplayerHumanBalance >= MIN_PLAYABLE_BALANCE ? (multiplayerRoom?.seats.filter((seat) => seat.playerId && seat.connected).length ?? 0) : 0;
  const playableComputerSetupCount = setupPlayers.filter((player) => !player.isHuman && (setupBalances[player.id] ?? 0) >= MIN_PLAYABLE_BALANCE).length;
  const multiplayerPlayableSetupCount = connectedMultiplayerHumans + playableComputerSetupCount;
  const multiplayerConfiguredPlayerCount = multiplayerRoom ? multiplayerRoom.humanSlots + cpuCount : 0;
  const activeComputerStyleSummary = state
    ? showComputerStylesInGame
      ? state.players
        .filter((player) => !player.isHuman)
        .map((player) => `${player.name} ${player.computerStyle ? getComputerStyleOption(player.computerStyle).label : "성향 비공개"}`)
        .join(" / ")
      : "비공개"
    : "";
  const playableSetupCount = setupPlayers.filter((player) => (setupBalances[player.id] ?? 0) >= MIN_PLAYABLE_BALANCE).length;
  const canStartSetupGame = multiplayerRoom
    ? multiplayerPlayableSetupCount >= 2 && multiplayerConfiguredPlayerCount <= MAX_TOTAL_PLAYERS
    : playableSetupCount >= 2;

  function applySetupShape(nextCpuCount, nextIncludeHuman, includeSetupHuman = nextIncludeHuman) {
    setCpuCount(nextCpuCount);
    setIncludeHuman(nextIncludeHuman);
    setSetupBalances((current) => buildSetupBalances(nextCpuCount, includeSetupHuman, current));
    setComputerStyles((current) => buildSetupComputerStyles(nextCpuCount, includeSetupHuman, current));
  }

  function reshapeSetup(nextCpuCount, nextIncludeHuman) {
    const clampedCpuCount = clampCpuCount(nextCpuCount, nextIncludeHuman);
    applySetupShape(clampedCpuCount, nextIncludeHuman, nextIncludeHuman);
  }

  function changeCpuCount(nextCpuCount) {
    if (multiplayerRoom) {
      applySetupShape(clampMultiplayerCpuCount(nextCpuCount, multiplayerRoom.humanSlots), includeHuman, false);
      return;
    }
    reshapeSetup(nextCpuCount, includeHuman);
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
      reshapeSetup(nextCpuCount, restoredIncludeHuman);
    }
  }, [cpuCount, includeHuman, state]);

  useEffect(() => {
    if (!multiplayerRoom || state) {
      return;
    }

    const clampedCpuCount = clampMultiplayerCpuCount(cpuCount, multiplayerRoom.humanSlots);
    if (clampedCpuCount !== cpuCount) {
      applySetupShape(clampedCpuCount, includeHuman, false);
    }
  }, [cpuCount, includeHuman, multiplayerRoom, state]);

  function updateSetupBalance(playerId, value) {
    const numericValue = Math.max(0, Number(value) || 0);
    setSetupBalances((current) => ({
      ...current,
      [playerId]: numericValue,
    }));
  }

  function updateMultiplayerHumanBalance(value) {
    setMultiplayerHumanBalance(Math.max(0, Number(value) || 0));
  }

  function updateComputerStyle(playerId, styleKey) {
    setComputerStyles((current) => ({
      ...current,
      [playerId]: getComputerStyleSelection(styleKey).key,
    }));
  }

  function changeIncludeHuman(nextIncludeHuman) {
    if (multiplayerRoom) {
      applySetupShape(clampMultiplayerCpuCount(cpuCount, multiplayerRoom.humanSlots), nextIncludeHuman, false);
      return;
    }
    reshapeSetup(cpuCount, nextIncludeHuman);
  }

  function updateAutoNextHand(enabled) {
    setAutoNextHand(enabled);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", autoNextHand: enabled });
    }
  }

  function updateShowComputerStylesInGame(enabled) {
    setShowComputerStylesInGame(enabled);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", showComputerStyles: enabled });
    }
  }

  function updateComputerActionDelay(value) {
    const nextValue = clampDelay(value, MIN_COMPUTER_ACTION_DELAY_MS, MAX_COMPUTER_ACTION_DELAY_MS);
    setComputerActionDelayMs(nextValue);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", computerActionDelayMs: nextValue });
    }
  }

  function updateNextHandDelay(value) {
    const nextValue = clampDelay(value, MIN_NEXT_HAND_DELAY_MS, MAX_NEXT_HAND_DELAY_MS);
    setNextHandDelayMs(nextValue);
    if (multiplayerGameActive) {
      sendMultiplayerMessage({ type: "updateGameOptions", nextHandDelayMs: nextValue });
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
      sendMultiplayerMessage({
        type: "startGame",
        humanStartingBalance: multiplayerHumanBalance,
        computerPlayers: setupPlayers
          .filter((player) => !player.isHuman)
          .map((player) => ({
            id: player.id,
            name: player.name,
            startingBalance: setupBalances[player.id] ?? 0,
            computerStyle: getComputerStyleSelection(computerStyles[player.id]).key,
          })),
        autoNextHand,
        showComputerStyles: showComputerStylesInGame,
        computerActionDelayMs,
        nextHandDelayMs,
      });
      return;
    }

    const initialComputerStyles = Object.fromEntries(
      setupPlayers
        .filter((player) => !player.isHuman)
        .map((player) => [player.id, resolveComputerStyleKey(getComputerStyleSelection(computerStyles[player.id]).key)]),
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
      playerStats: state?.playerStats ?? {},
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
  }, [autoNextHand, chipTotals, computerStyles, cpuCount, dealerIndex, multiplayerGameActive, nextHandDelayMs, state]);

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
              강원랜드 기준으로 제공된 베팅 금액, 블라인드, 쇼다운 수수료를 확인하며 진행하는 텍사스 홀덤 시뮬레이터입니다. 사람 플레이어 포함 여부, 컴퓨터 수, 컴퓨터 성향 선택은 앱 진행용 설정이며, 제공된 기준의 좌석 수 규정이 아닙니다.
            </p>
          </div>
        </section>
        <section className="panel setup-panel">
          <div>
            <h2>게임 시작 설정</h2>
            <p className="note">
              시작 금액, 컴퓨터 성향, 잔액 부족 탈락은 앱 진행용 설정입니다. 잔액 {formatMoney(MIN_PLAYABLE_BALANCE)} 미만인 플레이어는 다음 핸드를 진행할 수 없어 탈락 처리됩니다.
            </p>
          </div>
          <div className="setup-controls">
            <label>
              컴퓨터 플레이어 수
              <select ref={cpuCountSelectRef} value={cpuCount} onChange={(event) => changeCpuCount(Number(event.target.value))}>
                {effectiveCpuCountOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}명
                  </option>
                ))}
              </select>
            </label>
            <label className="toggle-input">
              <input
                ref={includeHumanInputRef}
                type="checkbox"
                checked={includeHuman}
                onChange={(event) => changeIncludeHuman(event.target.checked)}
              />
              사람 플레이어 포함
            </label>
            <label className="toggle-input">
              <input type="checkbox" checked={autoNextHand} onChange={(event) => updateAutoNextHand(event.target.checked)} />
              다음 핸드 자동 진행
            </label>
            <label className="toggle-input">
              <input
                type="checkbox"
                checked={showComputerStylesInGame}
                onChange={(event) => updateShowComputerStylesInGame(event.target.checked)}
              />
              인게임 컴퓨터 성향 표시
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
              />
            </label>
          </div>
          <section className="multiplayer-lobby">
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
                  value={multiplayerSlots}
                  onChange={(event) => setMultiplayerSlots(clampHumanSlots(event.target.value))}
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
                />
              </label>
              <label>
                룸 코드
                <input
                  maxLength="6"
                  type="text"
                  value={multiplayerJoinCode}
                  onChange={(event) => setMultiplayerJoinCode(event.target.value.toUpperCase())}
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
            ) : null}
          </section>
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
                  />
                </label>
                {player.isHuman ? (
                  <p className="note">사람 플레이어는 직접 행동을 선택합니다.</p>
                ) : (
                  <label className="style-input">
                    컴퓨터 플레이 성향
                    <select
                      value={getComputerStyleSelection(computerStyles[player.id]).key}
                      onChange={(event) => updateComputerStyle(player.id, event.target.value)}
                    >
                      {COMPUTER_STYLE_OPTIONS.map((style) => (
                        <option key={style.key} value={style.key}>
                          {style.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ))}
          </div>
          <p className="note">컴퓨터별 성향은 전략 조언이 아닌 앱 자동 진행 기준입니다. 랜덤은 게임 시작 시 실제 성향으로 확정됩니다.</p>
          {multiplayerRoom ? (
            <p className="note">
              멀티플레이에서는 빈 사람 슬롯 {multiplayerRoom.humanSlots}명과 컴퓨터 {cpuCount}명을 합쳐 최대 {MAX_TOTAL_PLAYERS}명까지만 구성할 수 있습니다.
            </p>
          ) : null}
          <div className="setup-actions">
            <button onClick={startGame} disabled={!canStartSetupGame}>
              {multiplayerRoom ? "룸 게임 시작" : "게임 시작"}
            </button>
            {!canStartSetupGame ? <p className="note">진행 가능한 플레이어가 2명 이상 필요합니다.</p> : null}
          </div>
        </section>
        <RulesPanel />
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
  const statusText = state.gameOver
    ? "게임이 종료되었습니다."
    : multiplayerGameActive && isControlledHumanTurn
      ? "내 차례입니다."
      : multiplayerGameActive && currentActor?.isHuman
        ? `${currentActor.name} 차례입니다.`
        : multiplayerGameActive && hasHumanPlayer
          ? "서버에서 컴퓨터 진행을 동기화 중입니다."
          : multiplayerGameActive
            ? "관전 중입니다."
    : !hasHumanPlayer
      ? "컴퓨터 플레이어만으로 자동 진행 중입니다."
      : state.waitingForHuman && !state.finished
      ? "사람 차례입니다."
      : "컴퓨터 진행 중이거나 핸드가 종료되었습니다.";
  const dealerName = state.gameOver ? "-" : state.players[state.dealerIndex]?.name;
  const turnName = state.gameOver ? "-" : state.players[state.currentPlayerIndex]?.name;
  const handFee = state.finished ? state.currentHandFee ?? 0 : calculateFee(state.pot);
  const handFeeLabel = state.finished ? "이번 핸드 수수료" : "이번 핸드 예상 수수료";
  const cumulativeFee = state.feeTotal ?? 0;

  return (
    <main className="app-shell">
      <section className="hero panel">
        <div>
          <p className="eyebrow">Gangwon Land Hold&apos;em</p>
          <h1>강원랜드 기준 베팅 시뮬레이터</h1>
          <p>
            강원랜드 기준으로 제공된 베팅 금액, 블라인드, 쇼다운 수수료를 확인하며 진행하는 텍사스 홀덤 시뮬레이터입니다. 사람 플레이어 포함 여부, 컴퓨터 수, 컴퓨터 성향 선택은 앱 진행용 설정이며, 제공된 기준의 좌석 수 규정이 아닙니다.
          </p>
          <p className="note">컴퓨터 성향: {activeComputerStyleSummary || "없음"}</p>
        </div>
        <div className="hero-controls">
          <button className="secondary" onClick={nextHand} disabled={!state.finished || state.gameOver}>
            다음 핸드
          </button>
          <label className="toggle-input">
            <input type="checkbox" checked={autoNextHand} onChange={(event) => updateAutoNextHand(event.target.checked)} />
            다음 핸드 자동 진행
          </label>
          <label className="toggle-input">
            <input
              type="checkbox"
              checked={showComputerStylesInGame}
              onChange={(event) => updateShowComputerStylesInGame(event.target.checked)}
            />
            인게임 컴퓨터 성향 표시
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
          {hasHumanPlayer ? (
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
          {state.finished ? (
            <p className="note">
              공개 순서: {state.revealOrder.map((id) => state.players.find((player) => player.id === id)?.name).join(" → ") || "즉시 종료"}
            </p>
          ) : null}
          <p className="note">{state.note}</p>
          <p className="note">보유 금액은 게임 시작 전에 입력한 앱 진행용 시작 금액에서 베팅과 정산을 반영한 값입니다.</p>
        </section>
      </section>

      <section className="panel log-panel">
        <h2>진행 로그</h2>
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
      </section>

      <RulesPanel />

      <section className="panel step-panel">
        <h2>프로젝트 진행 순서</h2>
        <ol>
          <li>`git init`으로 저장소를 초기화했습니다.</li>
          <li>Next.js 앱 구조를 `app/`, `components/`, `lib/`로 분리했습니다.</li>
          <li>강원랜드 기준 블라인드, 단계별 베팅 금액, 1인 최대 100,000원을 엔진에 고정했습니다.</li>
          <li>앱 진행용 상대 선택 UI를 구성했습니다. 이 값은 제공된 기준의 좌석 수 규정이 아닙니다.</li>
          <li>프리 플랍, 플랍, 턴, 리버, 쇼다운과 수수료 5% 정산을 연결했습니다.</li>
        </ol>
      </section>
    </main>
  );
}
