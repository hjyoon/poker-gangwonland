import crypto from "node:crypto";
import http from "node:http";
import next from "next";
import {
  COMPUTER_LEVEL_OPTIONS,
  COMPUTER_STYLE_OPTIONS,
  MIN_PLAYABLE_BALANCE,
  applyAction,
  chooseComputerAction,
  computerCardPeekPlan,
  formatMoney,
  getAvailableActions,
  resolveComputerLevelKey,
  resolveComputerStyleKey,
  startNewHand,
} from "./lib/poker.js";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const MAX_TOTAL_PLAYERS = 8;
const MIN_HUMAN_SLOTS = 1;
const MAX_HUMAN_SLOTS = MAX_TOTAL_PLAYERS;
const DEFAULT_STARTING_BALANCE = 100000;
const DEFAULT_COMPUTER_ACTION_DELAY_MS = 700;
const DEFAULT_NEXT_HAND_DELAY_MS = 1800;
const DEFAULT_HUMAN_ACTION_TIMEOUT_MS = 15000;
const SMALL_BLIND_AMOUNT = 2000;
const BIG_BLIND_AMOUNT = 5000;
const MIN_COMPUTER_ACTION_DELAY_MS = 100;
const MAX_COMPUTER_ACTION_DELAY_MS = 3000;
const MIN_NEXT_HAND_DELAY_MS = 500;
const MAX_NEXT_HAND_DELAY_MS = 10000;
const MIN_HUMAN_ACTION_TIMEOUT_MS = 3000;
const MAX_HUMAN_ACTION_TIMEOUT_MS = 60000;
const MAX_FRAME_BUFFER_BYTES = 128 * 1024;
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;

const rooms = new Map();
const sockets = new Set();
const COMPUTER_STYLE_KEYS = new Set(COMPUTER_STYLE_OPTIONS.map((style) => style.key));
const COMPUTER_LEVEL_KEYS = new Set(COMPUTER_LEVEL_OPTIONS.map((level) => level.key));

function roomId() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function clamp(value, min, max, fallback) {
  const numericValue = Number(value);
  return Math.min(Math.max(min, Number.isFinite(numericValue) ? numericValue : fallback), max);
}

function clampSeatIndex(value, seatCount) {
  return clamp(value, 0, Math.max(0, seatCount - 1), 0);
}

function tableSeatOptions(seatCount) {
  return Array.from({ length: seatCount }, (_, index) => index);
}

function defaultHumanTableSeats(humanSlots, totalSeatCount) {
  const slotCount = clamp(humanSlots, MIN_HUMAN_SLOTS, MAX_HUMAN_SLOTS, MIN_HUMAN_SLOTS);
  const seatCount = clamp(totalSeatCount, slotCount, MAX_TOTAL_PLAYERS, slotCount);
  if (slotCount === 1) {
    return [0];
  }
  return Array.from({ length: slotCount }, (_, index) => Math.round((index * (seatCount - 1)) / (slotCount - 1)));
}

function normalizeHumanTableSeats(tableSeats, humanSlots, totalSeatCount) {
  const slotCount = clamp(humanSlots, MIN_HUMAN_SLOTS, MAX_HUMAN_SLOTS, MIN_HUMAN_SLOTS);
  const seatCount = clamp(totalSeatCount, slotCount, MAX_TOTAL_PLAYERS, slotCount);
  const defaults = defaultHumanTableSeats(slotCount, seatCount);
  const values = Array.isArray(tableSeats) ? tableSeats : [];
  const usedSeats = new Set();

  return Array.from({ length: slotCount }, (_, index) => {
    let seatIndex = clampSeatIndex(values[index] ?? defaults[index], seatCount);
    if (usedSeats.has(seatIndex)) {
      seatIndex = defaults.find((candidate) => !usedSeats.has(candidate)) ?? tableSeatOptions(seatCount).find((candidate) => !usedSeats.has(candidate)) ?? 0;
    }
    usedSeats.add(seatIndex);
    return seatIndex;
  });
}

function sanitizeName(value, fallback = "참가자") {
  const trimmed = String(value || "").trim();
  return (trimmed || fallback).slice(0, 20);
}

function sanitizeComputerStyleKey(value) {
  return COMPUTER_STYLE_KEYS.has(value) ? value : "random";
}

function sanitizeComputerLevelKey(value) {
  return COMPUTER_LEVEL_KEYS.has(value) ? value : "random";
}

function defaultComputerSettings(humanSlots) {
  const count = Math.min(3, Math.max(0, MAX_TOTAL_PLAYERS - humanSlots));
  return Array.from({ length: count }, (_, index) => ({
    name: `컴퓨터 ${index + 1}`,
    startingBalance: DEFAULT_STARTING_BALANCE,
    computerStyle: "random",
    computerLevel: "random",
  }));
}

function humanSlotId(index) {
  return `human-slot-${index + 1}`;
}

function computerPlayerId(index) {
  return `cpu-${index + 1}`;
}

function defaultHumanSettings(humanSlots, startingBalance = DEFAULT_STARTING_BALANCE) {
  return Array.from({ length: humanSlots }, (_, index) => ({
    id: humanSlotId(index),
    name: `빈 자리 ${index + 1}`,
    startingBalance,
  }));
}

function normalizeHumanSettings(settings = {}, humanSlots) {
  const fallbackBalanceValue = Number(settings.humanStartingBalance);
  const fallbackBalance = Number.isFinite(fallbackBalanceValue) ? Math.max(0, fallbackBalanceValue) : DEFAULT_STARTING_BALANCE;
  const sourceHumanPlayers = Array.isArray(settings.humanPlayers) ? settings.humanPlayers : defaultHumanSettings(humanSlots, fallbackBalance);
  return Array.from({ length: humanSlots }, (_, index) => {
    const player = sourceHumanPlayers[index] ?? {};
    const startingBalance = Number(player.startingBalance);
    return {
      id: humanSlotId(index),
      name: sanitizeName(player.name, `빈 자리 ${index + 1}`),
      startingBalance: Number.isFinite(startingBalance) ? Math.max(0, startingBalance) : fallbackBalance,
    };
  });
}

function normalizePlayerOrder(order, humanSlots, computerCount) {
  const validIds = [
    ...Array.from({ length: humanSlots }, (_, index) => humanSlotId(index)),
    ...Array.from({ length: computerCount }, (_, index) => computerPlayerId(index)),
  ];
  const keptIds = [];
  if (Array.isArray(order)) {
    order.forEach((id) => {
      if (validIds.includes(id) && !keptIds.includes(id)) {
        keptIds.push(id);
      }
    });
  }
  return [...keptIds, ...validIds.filter((id) => !keptIds.includes(id))];
}

function shuffledPlayerOrder(humanSlots, computerCount) {
  const order = normalizePlayerOrder([], humanSlots, computerCount);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
}

function playerOrderFromHumanSeats(humanSeatPlacements, humanSlots, computerCount) {
  const totalSeatCount = humanSlots + computerCount;
  const humanSeats = normalizeHumanTableSeats(humanSeatPlacements, humanSlots, totalSeatCount);
  const computerIds = Array.from({ length: computerCount }, (_, index) => computerPlayerId(index));
  const orderedIds = Array.from({ length: totalSeatCount }, () => null);
  humanSeats.forEach((seatIndex, index) => {
    orderedIds[seatIndex] = humanSlotId(index);
  });

  let computerIndex = 0;
  return normalizePlayerOrder(
    orderedIds.map((id) => id ?? computerIds[computerIndex++]).filter(Boolean),
    humanSlots,
    computerCount,
  );
}

function humanSeatsFromPlayerOrder(playerOrder, humanSlots, computerCount) {
  const normalizedOrder = normalizePlayerOrder(playerOrder, humanSlots, computerCount);
  const placements = Array.from({ length: humanSlots }, (_, index) => index);
  normalizedOrder.forEach((id, index) => {
    if (id.startsWith("human-slot-")) {
      const slotIndex = Number(id.replace("human-slot-", "")) - 1;
      if (slotIndex >= 0 && slotIndex < humanSlots) {
        placements[slotIndex] = index;
      }
    }
  });
  return normalizeHumanTableSeats(placements, humanSlots, humanSlots + computerCount);
}

function normalizeRoomSettings(room, settings = {}) {
  const maxComputerPlayers = Math.max(0, MAX_TOTAL_PLAYERS - room.humanSlots);
  const sourceComputerPlayers = Array.isArray(settings.computerPlayers) ? settings.computerPlayers : defaultComputerSettings(room.humanSlots);
  const computerPlayers = sourceComputerPlayers.slice(0, maxComputerPlayers).map((player, index) => ({
    name: sanitizeName(player.name, `컴퓨터 ${index + 1}`),
    startingBalance: Math.max(0, Number(player.startingBalance) || DEFAULT_STARTING_BALANCE),
    computerStyle: sanitizeComputerStyleKey(player.computerStyle),
    computerLevel: sanitizeComputerLevelKey(player.computerLevel),
  }));
  const humanPlayers = normalizeHumanSettings(settings, room.humanSlots);
  const playerOrder = Array.isArray(settings.playerOrder)
    ? normalizePlayerOrder(settings.playerOrder, room.humanSlots, computerPlayers.length)
    : playerOrderFromHumanSeats(settings.humanSeatPlacements, room.humanSlots, computerPlayers.length);
  const randomizePlayerOrder = Boolean(settings.randomizePlayerOrder ?? settings.randomizeHumanSeats);

  return {
    humanStartingBalance: humanPlayers[0]?.startingBalance ?? DEFAULT_STARTING_BALANCE,
    humanPlayers,
    humanSeatPlacements: humanSeatsFromPlayerOrder(playerOrder, room.humanSlots, computerPlayers.length),
    playerOrder,
    randomizePlayerOrder,
    randomizeHumanSeats: randomizePlayerOrder,
    computerPlayers,
    autoNextHand: Boolean(settings.autoNextHand),
    endlessMode: Boolean(settings.endlessMode),
    endlessReplacementComputerStyle: sanitizeComputerStyleKey(settings.endlessReplacementComputerStyle ?? "random"),
    endlessReplacementComputerLevel: sanitizeComputerLevelKey(settings.endlessReplacementComputerLevel ?? "random"),
    endlessReplacementStartingBalance: Math.max(
      MIN_PLAYABLE_BALANCE,
      Number(settings.endlessReplacementStartingBalance) || DEFAULT_STARTING_BALANCE,
    ),
    showComputerStyles: settings.showComputerStyles !== false,
    showCumulativeWins: settings.showCumulativeWins !== false,
    computerActionDelayMs: clamp(
      settings.computerActionDelayMs,
      MIN_COMPUTER_ACTION_DELAY_MS,
      MAX_COMPUTER_ACTION_DELAY_MS,
      DEFAULT_COMPUTER_ACTION_DELAY_MS,
    ),
    nextHandDelayMs: clamp(settings.nextHandDelayMs, MIN_NEXT_HAND_DELAY_MS, MAX_NEXT_HAND_DELAY_MS, DEFAULT_NEXT_HAND_DELAY_MS),
    humanActionTimeoutMs: clamp(
      settings.humanActionTimeoutMs,
      MIN_HUMAN_ACTION_TIMEOUT_MS,
      MAX_HUMAN_ACTION_TIMEOUT_MS,
      DEFAULT_HUMAN_ACTION_TIMEOUT_MS,
    ),
  };
}

function emptyTableSeat(index, label = "빈 자리") {
  return {
    id: `empty-seat-${index + 1}`,
    name: label,
    isHuman: false,
    isEmptySeat: true,
    cards: [],
    folded: false,
    eliminated: false,
    actionLocked: false,
    streetContribution: 0,
    totalContribution: 0,
    chipBalance: 0,
    chipsWon: 0,
    lastAction: "비어 있음",
    stateIndex: -1,
    computerStyle: null,
    computerLevel: null,
    missedBlindAmount: 0,
  };
}

function missedBlindAmountForSeat(seat) {
  if (!seat) {
    return 0;
  }
  return (seat.missedSmallBlind ? SMALL_BLIND_AMOUNT : 0) + (seat.missedBigBlind ? BIG_BLIND_AMOUNT : 0);
}

function missedBlindLabelForSeat(seat) {
  const roles = [];
  if (seat?.missedSmallBlind) {
    roles.push("SB");
  }
  if (seat?.missedBigBlind) {
    roles.push("BB");
  }
  return roles.length > 0 ? roles.join("+") : "";
}

function publicInactiveHumanSeat(seat, index, ledger = {}) {
  return {
    id: seat.playerId,
    name: seat.name || seat.label || `플레이어 ${index + 1}`,
    isHuman: true,
    isAway: Boolean(seat.away),
    isPendingStandUp: Boolean(seat.pendingStandUp),
    isPendingReturn: Boolean(seat.pendingReturn),
    isDisconnected: !seat.connected,
    cards: [],
    folded: true,
    eliminated: false,
    actionLocked: false,
    streetContribution: 0,
    totalContribution: 0,
    chipBalance: Number(ledger.chipBalance) || 0,
    chipsWon: Number(ledger.chipsWon) || 0,
    lastAction: seat.pendingStandUp ? "게임 퇴장 예약" : seat.pendingReturn ? "복귀 예약" : seat.away ? "자리 비움" : "연결 끊김",
    stateIndex: -1,
    computerStyle: null,
    computerLevel: null,
    missedSmallBlind: Boolean(seat.missedSmallBlind),
    missedBigBlind: Boolean(seat.missedBigBlind),
    missedBlindAmount: missedBlindAmountForSeat(seat),
  };
}

function syncTableSeatOrder(room, activeBefore, activeAfter) {
  if (!Array.isArray(room.game?.tableSeatOrder)) {
    return;
  }
  const replacements = new Map();
  activeBefore.forEach((config, index) => {
    if (activeAfter[index]?.id) {
      replacements.set(config.id, activeAfter[index].id);
    }
  });
  room.game.tableSeatOrder = room.game.tableSeatOrder.map((entry) =>
    entry?.playerId && replacements.has(entry.playerId) ? { ...entry, playerId: replacements.get(entry.playerId) } : entry,
  );
}

function publicTableSeats(room, publicPlayers) {
  const activeById = new Map(publicPlayers.map((player, index) => [player.id, { ...player, stateIndex: index }]));
  const order = Array.isArray(room?.game?.tableSeatOrder) ? room.game.tableSeatOrder : publicPlayers.map((player) => ({ playerId: player.id }));

  return Array.from({ length: MAX_TOTAL_PLAYERS }, (_, index) => {
    const entry = order[index];
    if (!entry?.playerId) {
      return emptyTableSeat(index, entry?.label || "빈 자리");
    }
    const activePlayer = activeById.get(entry.playerId);
    if (activePlayer) {
      const humanSeat = room?.seats.find((seat) => seat.playerId === entry.playerId);
      return humanSeat
        ? {
            ...activePlayer,
            isPendingStandUp: Boolean(humanSeat.pendingStandUp),
            missedSmallBlind: Boolean(humanSeat.missedSmallBlind),
            missedBigBlind: Boolean(humanSeat.missedBigBlind),
            missedBlindAmount: missedBlindAmountForSeat(humanSeat),
          }
        : activePlayer;
    }
    const humanSeat = room?.seats.find((seat) => seat.playerId === entry.playerId);
    if (humanSeat) {
      return publicInactiveHumanSeat(humanSeat, index, room.game?.chipTotals?.[entry.playerId]);
    }
    return emptyTableSeat(index, entry.label || "빈 자리");
  });
}

function publicGameState(state, playerId, showComputerStyles = true, room = null) {
  if (!state) {
    return null;
  }

  const showdownOpenIds = new Set((state.showdownResults ?? []).map((result) => result.id));
  const publicPlayers = state.players.map((player) => {
    const revealCards = player.id === playerId || showdownOpenIds.has(player.id);
    return {
      ...player,
      computerStyle: showComputerStyles || player.isHuman ? player.computerStyle : null,
      computerLevel: showComputerStyles || player.isHuman ? player.computerLevel : null,
      cards: revealCards ? player.cards : player.cards.map(() => null),
    };
  });

  return {
    ...state,
    computerStyles: showComputerStyles ? state.computerStyles : {},
    computerLevels: showComputerStyles ? state.computerLevels : {},
    deck: [],
    players: publicPlayers,
    tableSeats: room ? publicTableSeats(room, publicPlayers) : publicPlayers.map((player, index) => ({ ...player, stateIndex: index })),
  };
}

function publicRoomSettings(room) {
  const settings = room.settings ?? normalizeRoomSettings(room);
  if (!room.game) {
    return settings;
  }

  return {
    ...settings,
    autoNextHand: room.game.autoNextHand,
    endlessMode: room.game.endlessMode,
    endlessReplacementComputerStyle: room.game.endlessReplacementComputerStyle,
    endlessReplacementComputerLevel: room.game.endlessReplacementComputerLevel,
    endlessReplacementStartingBalance: room.game.endlessReplacementStartingBalance,
    showComputerStyles: room.game.showComputerStyles,
    showCumulativeWins: room.game.showCumulativeWins,
    computerActionDelayMs: room.game.computerActionDelayMs,
    nextHandDelayMs: room.game.nextHandDelayMs,
    humanActionTimeoutMs: room.game.humanActionTimeoutMs,
  };
}

function normalizeSeat(seat) {
  return {
    ...seat,
    away: Boolean(seat.away),
    pendingAway: Boolean(seat.pendingAway),
    pendingReturn: Boolean(seat.pendingReturn),
    pendingStandUp: Boolean(seat.pendingStandUp),
    missedSmallBlind: Boolean(seat.missedSmallBlind),
    missedBigBlind: Boolean(seat.missedBigBlind),
    missedBlindAmount: missedBlindAmountForSeat(seat),
  };
}

function seatWillBeAwayNextHand(seat) {
  if (!seat) {
    return false;
  }
  if (seat.pendingReturn) {
    return false;
  }
  if (seat.pendingAway) {
    return true;
  }
  return Boolean(seat.away);
}

function seatWillParticipateNextHand(seat) {
  if (!seat || seat.pendingStandUp) {
    return false;
  }
  return !seatWillBeAwayNextHand(seat);
}

function nextHandRequiredPlayerIds(room) {
  if (!room.game?.state?.finished || room.game.state.gameOver) {
    return [];
  }

  const connectedPlayerIds = new Set(
    room.seats
      .filter((seat) => seat.playerId && seat.connected && seatWillParticipateNextHand(seat))
      .map((seat) => seat.playerId),
  );
  return room.game.state.players
    .filter((player) => player.isHuman && !player.eliminated && connectedPlayerIds.has(player.id))
    .map((player) => player.id);
}

function nextHandReadyPlayerIds(room) {
  const requiredPlayerIds = new Set(nextHandRequiredPlayerIds(room));
  return [...(room.game?.nextHandReadyPlayerIds ?? new Set())].filter((playerId) => requiredPlayerIds.has(playerId));
}

function allRequiredPlayersReadyForNextHand(room) {
  const requiredPlayerIds = nextHandRequiredPlayerIds(room);
  const readyPlayerIds = room.game?.nextHandReadyPlayerIds ?? new Set();
  if (requiredPlayerIds.length === 0) {
    return true;
  }
  return requiredPlayerIds.every((playerId) => readyPlayerIds.has(playerId));
}

function startNextRoomHandIfReady(room) {
  if (room.game?.state?.finished && !room.game.state.gameOver && !room.game.autoNextHand && allRequiredPlayersReadyForNextHand(room)) {
    startNextRoomHand(room);
    return true;
  }
  return false;
}

function publicRoomTimer(room) {
  if (!room.game?.timer) {
    return null;
  }
  const { id, ...timer } = room.game.timer;
  return timer;
}

function publicCardPeekPlayerIds(room) {
  if (!room.game?.state || room.game.state.finished) {
    return [];
  }

  const activePlayerIds = new Set(
    room.game.state.players
      .filter((player) => !player.eliminated && !player.folded && Array.isArray(player.cards) && player.cards.length === 2)
      .map((player) => player.id),
  );
  return [...(room.game.cardPeekPlayerIds ?? new Set())].filter((playerId) => activePlayerIds.has(playerId));
}

function publicRoom(room, socket) {
  const settings = publicRoomSettings(room);
  return {
    id: room.id,
    humanSlots: room.humanSlots,
    hostPlayerId: room.hostPlayerId,
    seats: room.seats.map((seat) => normalizeSeat(seat)),
    createdAt: room.createdAt,
    settings,
    showComputerStyles: settings.showComputerStyles,
    showCumulativeWins: settings.showCumulativeWins,
    nextHandRequiredPlayerIds: nextHandRequiredPlayerIds(room),
    nextHandReadyPlayerIds: nextHandReadyPlayerIds(room),
    cardPeekPlayerIds: publicCardPeekPlayerIds(room),
    timer: publicRoomTimer(room),
    gameState: publicGameState(room.game?.state, socket?.playerId, settings.showComputerStyles, room),
  };
}

function makeFrame(payload, opcode = 0x1) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const firstByte = 0x80 | opcode;
  const header =
    body.length < 126
      ? Buffer.from([firstByte, body.length])
      : body.length < 65536
        ? Buffer.from([firstByte, 126, body.length >> 8, body.length & 0xff])
        : null;

  if (!header) {
    throw new Error("WebSocket frame too large");
  }

  return Buffer.concat([header, body]);
}

function send(socket, message) {
  if (socket.destroyed) {
    return;
  }
  socket.write(makeFrame(JSON.stringify(message)));
}

function sendError(socket, message) {
  send(socket, { type: "error", message });
}

function broadcastRoom(room) {
  for (const socket of room.clients) {
    send(socket, { type: "roomState", room: publicRoom(room, socket) });
  }
}

function isRoomHost(room, socket) {
  return Boolean(room && socket?.playerId && room.hostPlayerId === socket.playerId);
}

function clearRoomTimers(room) {
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }
  if (room.automationTimer) {
    clearTimeout(room.automationTimer);
    room.automationTimer = null;
  }
  if (room.computerPeekTimer) {
    clearTimeout(room.computerPeekTimer);
    room.computerPeekTimer = null;
  }
}

function mergeChipTotals(previousTotals = {}, nextTotals = {}) {
  return {
    ...(previousTotals ?? {}),
    ...(nextTotals ?? {}),
  };
}

function activePlayerConfigsForNextHand(room) {
  const allPlayerConfigs = room.game?.allPlayerConfigs ?? room.game?.playerConfigs ?? [];
  return allPlayerConfigs.filter((config) => {
    if (!config.isHuman) {
      return true;
    }
    const seat = room.seats.find((entry) => entry.playerId === config.id);
    return Boolean(seat && seat.connected && seatWillParticipateNextHand(seat));
  });
}

function nextDealerIndexForPlayerConfigs(room, currentState, nextPlayerConfigs) {
  if (!nextPlayerConfigs.length) {
    return 0;
  }

  const allPlayerConfigs = room.game?.allPlayerConfigs ?? room.game?.playerConfigs ?? nextPlayerConfigs;
  const activeIds = new Set(nextPlayerConfigs.map((config) => config.id));
  const previousDealerId = currentState.players[currentState.dealerIndex]?.id;
  const previousDealerOrderIndex = allPlayerConfigs.findIndex((config) => config.id === previousDealerId);
  const startIndex = previousDealerOrderIndex >= 0 ? previousDealerOrderIndex : -1;

  for (let offset = 1; offset <= allPlayerConfigs.length; offset += 1) {
    const config = allPlayerConfigs[(startIndex + offset + allPlayerConfigs.length) % allPlayerConfigs.length];
    if (activeIds.has(config.id)) {
      return Math.max(0, nextPlayerConfigs.findIndex((nextConfig) => nextConfig.id === config.id));
    }
  }

  return 0;
}

function eligibleConfigsForBlindRotation(room, currentState) {
  const allPlayerConfigs = room.game?.allPlayerConfigs ?? room.game?.playerConfigs ?? currentState.playerConfigs ?? [];
  const chipTotals = room.game?.chipTotals ?? currentState.chipTotals ?? {};
  return allPlayerConfigs.filter((config) => {
    const ledger = chipTotals[config.id];
    const chipBalance = Number(ledger?.chipBalance ?? config.startingBalance ?? 0);
    if (chipBalance < MIN_PLAYABLE_BALANCE) {
      return false;
    }
    if (!config.isHuman) {
      return true;
    }
    return room.seats.some((seat) => seat.playerId === config.id);
  });
}

function nextConfigAfter(configs, startIndex, eligibleIds) {
  if (!configs.length || eligibleIds.size === 0) {
    return null;
  }
  for (let offset = 1; offset <= configs.length; offset += 1) {
    const config = configs[(startIndex + offset + configs.length) % configs.length];
    if (eligibleIds.has(config.id)) {
      return config;
    }
  }
  return null;
}

function nextFullBlindRoleIds(room, currentState) {
  const allPlayerConfigs = room.game?.allPlayerConfigs ?? room.game?.playerConfigs ?? currentState.playerConfigs ?? [];
  const eligibleConfigs = eligibleConfigsForBlindRotation(room, currentState);
  if (eligibleConfigs.length < 2) {
    return { smallBlindId: null, bigBlindId: null };
  }

  const eligibleIds = new Set(eligibleConfigs.map((config) => config.id));
  const previousDealerId = currentState.players[currentState.dealerIndex]?.id;
  const previousDealerOrderIndex = allPlayerConfigs.findIndex((config) => config.id === previousDealerId);
  const dealerConfig = nextConfigAfter(allPlayerConfigs, previousDealerOrderIndex >= 0 ? previousDealerOrderIndex : -1, eligibleIds);
  const dealerIndex = allPlayerConfigs.findIndex((config) => config.id === dealerConfig?.id);
  const smallBlindConfig = nextConfigAfter(allPlayerConfigs, dealerIndex, eligibleIds);
  const smallBlindIndex = allPlayerConfigs.findIndex((config) => config.id === smallBlindConfig?.id);
  const bigBlindConfig = nextConfigAfter(allPlayerConfigs, smallBlindIndex, eligibleIds);

  return {
    smallBlindId: smallBlindConfig?.id ?? null,
    bigBlindId: bigBlindConfig?.id ?? null,
  };
}

function recordMissedBlindsForAwaySeats(room, currentState) {
  const { smallBlindId, bigBlindId } = nextFullBlindRoleIds(room, currentState);
  const log = [];

  room.seats = room.seats.map((seat) => {
    const nextSeat = normalizeSeat(seat);
    if (!nextSeat.playerId || !seatWillBeAwayNextHand(nextSeat)) {
      return nextSeat;
    }

    const name = nextSeat.name || nextSeat.label || "참가자";
    const updates = {};
    if (nextSeat.playerId === smallBlindId && !nextSeat.missedSmallBlind) {
      updates.missedSmallBlind = true;
      log.push(`${name}: 자리 비움으로 스몰 블라인드 미스드 기록 (${formatMoney(SMALL_BLIND_AMOUNT)})`);
    }
    if (nextSeat.playerId === bigBlindId && !nextSeat.missedBigBlind) {
      updates.missedBigBlind = true;
      log.push(`${name}: 자리 비움으로 빅 블라인드 미스드 기록 (${formatMoney(BIG_BLIND_AMOUNT)})`);
    }

    return Object.keys(updates).length > 0 ? { ...nextSeat, ...updates } : nextSeat;
  });

  return log;
}

function missedBlindForcedContributions(room, nextPlayerConfigs) {
  const activeIds = new Set(nextPlayerConfigs.map((config) => config.id));
  const contributions = [];

  room.seats = room.seats.map((seat) => {
    const nextSeat = normalizeSeat(seat);
    const amount = missedBlindAmountForSeat(nextSeat);
    if (!nextSeat.playerId || amount <= 0 || !activeIds.has(nextSeat.playerId)) {
      return nextSeat;
    }

    const label = `미스드 블라인드(${missedBlindLabelForSeat(nextSeat)})`;
    contributions.push({
      playerId: nextSeat.playerId,
      amount,
      label,
    });

    return {
      ...nextSeat,
      missedSmallBlind: false,
      missedBigBlind: false,
    };
  });

  return contributions;
}

function clearTableSeatOrderPlayerIds(room, playerIds) {
  if (!Array.isArray(room.game?.tableSeatOrder) || playerIds.size === 0) {
    return;
  }

  room.game.tableSeatOrder = room.game.tableSeatOrder.map((entry) =>
    entry?.playerId && playerIds.has(entry.playerId) ? { ...entry, playerId: null, label: "빈 자리" } : entry,
  );
}

function emptyHumanGameSeat(seat) {
  return {
    ...seat,
    playerId: null,
    name: null,
    connected: false,
    away: false,
    pendingAway: false,
    pendingReturn: false,
    pendingStandUp: false,
    missedSmallBlind: false,
    missedBigBlind: false,
    missedBlindAmount: 0,
  };
}

function clearHumanSeatFromGame(room, seat) {
  const playerId = seat?.playerId;
  if (!playerId) {
    return null;
  }

  const playerName = seat.name || seat.label || "참가자";
  clearTableSeatOrderPlayerIds(room, new Set([playerId]));
  room.game?.nextHandReadyPlayerIds?.delete(playerId);
  room.game?.cardPeekPlayerIds?.delete(playerId);

  const seatIndex = room.seats.findIndex((entry) => entry === seat || entry.playerId === playerId);
  if (seatIndex >= 0) {
    room.seats[seatIndex] = emptyHumanGameSeat(room.seats[seatIndex]);
  }

  return { playerId, playerName };
}

function syncAllPlayerConfigs(room, activeBefore, activeAfter) {
  const allPlayerConfigs = room.game?.allPlayerConfigs ?? room.game?.playerConfigs ?? [];
  const replacements = new Map();
  activeBefore.forEach((config, index) => {
    if (activeAfter[index]) {
      replacements.set(config.id, activeAfter[index]);
    }
  });
  room.game.allPlayerConfigs = allPlayerConfigs.map((config) => replacements.get(config.id) ?? config);
}

function applySeatParticipationReservations(room) {
  const log = [];
  const standUpPlayerIds = new Set();
  room.seats = room.seats.map((seat) => {
    const nextSeat = normalizeSeat(seat);
    const name = nextSeat.name || nextSeat.label || "참가자";
    if (nextSeat.pendingStandUp) {
      if (nextSeat.playerId) {
        standUpPlayerIds.add(nextSeat.playerId);
      }
      log.push(`${name}: 게임에서 빠짐`);
      return emptyHumanGameSeat(nextSeat);
    }
    if (nextSeat.pendingAway) {
      log.push(`${name}: 다음 핸드부터 자리 비움`);
      return {
        ...nextSeat,
        away: true,
        pendingAway: false,
        pendingReturn: false,
        pendingStandUp: false,
      };
    }
    if (nextSeat.pendingReturn) {
      log.push(`${name}: 다음 핸드부터 복귀`);
      return {
        ...nextSeat,
        away: false,
        pendingAway: false,
        pendingReturn: false,
        pendingStandUp: false,
      };
    }
    return nextSeat;
  });
  clearTableSeatOrderPlayerIds(room, standUpPlayerIds);
  standUpPlayerIds.forEach((playerId) => {
    room.game?.nextHandReadyPlayerIds?.delete(playerId);
    room.game?.cardPeekPlayerIds?.delete(playerId);
  });
  return log;
}

function scheduleEmptyRoomCleanup(room) {
  if (room.clients.size > 0 || room.cleanupTimer) {
    return;
  }
  room.cleanupTimer = setTimeout(() => {
    if (room.clients.size === 0) {
      clearRoomTimers(room);
      rooms.delete(room.id);
    }
  }, EMPTY_ROOM_TTL_MS);
}

function detachSocketFromRoom(socket, { clearSeat = false } = {}) {
  if (!socket.roomId) {
    return;
  }

  const room = rooms.get(socket.roomId);
  const playerId = socket.playerId;
  socket.roomId = null;
  socket.playerId = null;

  if (!room) {
    return;
  }

  room.clients.delete(socket);
  const seat = room.seats.find((entry) => entry.playerId === playerId);
  if (seat) {
    const shouldClearSeat = clearSeat && !room.game;
    if (shouldClearSeat) {
      seat.playerId = null;
      seat.name = null;
      seat.away = false;
      seat.pendingAway = false;
      seat.pendingReturn = false;
      seat.pendingStandUp = false;
      seat.missedSmallBlind = false;
      seat.missedBigBlind = false;
    }
    seat.connected = false;
  }
  room.game?.cardPeekPlayerIds?.delete(playerId);

  if (room.clients.size === 0) {
    if (room.automationTimer) {
      clearTimeout(room.automationTimer);
      room.automationTimer = null;
    }
    if (room.computerPeekTimer) {
      clearTimeout(room.computerPeekTimer);
      room.computerPeekTimer = null;
    }
    if (room.game) {
      room.game.timer = null;
    }
    scheduleEmptyRoomCleanup(room);
  } else if (!startNextRoomHandIfReady(room)) {
    broadcastRoom(room);
  }
}

function resizeRoomHumanSlots(room, nextHumanSlots, removedHumanSlotIds = []) {
  const humanSlots = clamp(nextHumanSlots, MIN_HUMAN_SLOTS, MAX_HUMAN_SLOTS, room.humanSlots);
  if (humanSlots === room.humanSlots) {
    return;
  }

  if (humanSlots < room.humanSlots) {
    const seats = [...room.seats];
    const removeCount = room.humanSlots - humanSlots;
    const preferredRemovedIds = Array.isArray(removedHumanSlotIds) ? removedHumanSlotIds.map((id) => String(id)) : [];
    for (let index = 0; index < removeCount; index += 1) {
      let emptySeatIndex = -1;
      while (preferredRemovedIds.length > 0 && emptySeatIndex < 0) {
        const preferredId = preferredRemovedIds.shift();
        emptySeatIndex = seats.findIndex((seat) => seat.id === preferredId && !seat.playerId);
      }
      if (emptySeatIndex < 0) {
        emptySeatIndex = seats.findIndex((seat) => !seat.playerId);
      }
      if (emptySeatIndex < 0) {
        throw new Error("참가자가 있는 인간 플레이어는 컴퓨터로 변경하거나 삭제할 수 없습니다.");
      }
      seats.splice(emptySeatIndex, 1);
    }
    room.seats = seats;
  } else {
    for (let index = room.humanSlots; index < humanSlots; index += 1) {
      room.seats.push({
        id: `human-slot-${index + 1}`,
        label: `빈 자리 ${index + 1}`,
        playerId: null,
        name: null,
        connected: false,
        away: false,
        pendingAway: false,
        pendingReturn: false,
        pendingStandUp: false,
        missedSmallBlind: false,
        missedBigBlind: false,
      });
    }
  }

  room.humanSlots = humanSlots;
  room.seats = room.seats.map((seat, index) => ({
    ...normalizeSeat(seat),
    id: `human-slot-${index + 1}`,
    label: `빈 자리 ${index + 1}`,
  }));
}

function createRoom(socket, payload) {
  detachSocketFromRoom(socket, { clearSeat: true });
  let id = roomId();
  while (rooms.has(id)) {
    id = roomId();
  }

  const humanSlots = clamp(payload.humanSlots, MIN_HUMAN_SLOTS, MAX_HUMAN_SLOTS, MIN_HUMAN_SLOTS);
  const playerId = crypto.randomUUID();
  const room = {
    id,
    humanSlots,
    hostPlayerId: playerId,
    seats: Array.from({ length: humanSlots }, (_, index) => ({
      id: `human-slot-${index + 1}`,
      label: `빈 자리 ${index + 1}`,
      playerId: index === 0 ? playerId : null,
      name: index === 0 ? sanitizeName(payload.playerName, "방장") : null,
      connected: index === 0,
      away: false,
      pendingAway: false,
      pendingReturn: false,
      pendingStandUp: false,
      missedSmallBlind: false,
      missedBigBlind: false,
    })),
    clients: new Set([socket]),
    createdAt: Date.now(),
    settings: null,
    game: null,
    cleanupTimer: null,
    automationTimer: null,
    computerPeekTimer: null,
  };
  room.settings = normalizeRoomSettings(room, payload.settings);

  socket.roomId = room.id;
  socket.playerId = playerId;
  rooms.set(id, room);
  send(socket, { type: "joinedRoom", roomId: room.id, playerId });
  broadcastRoom(room);
}

function joinRoom(socket, targetRoomId, playerName, requestedPlayerId = null) {
  const room = rooms.get(String(targetRoomId || "").trim().toUpperCase());
  if (!room) {
    sendError(socket, "룸을 찾을 수 없습니다.");
    return;
  }

  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }

  const normalizedPlayerId = requestedPlayerId ? String(requestedPlayerId) : null;
  let targetSeat = normalizedPlayerId ? room.seats.find((seat) => seat.playerId === normalizedPlayerId) : null;
  if (targetSeat?.connected) {
    sendError(socket, "이미 연결된 참가자입니다.");
    return;
  }
  if (!targetSeat) {
    targetSeat = room.seats.find((seat) => !seat.playerId);
  }
  if (!targetSeat) {
    sendError(socket, "빈 자리가 없습니다.");
    return;
  }

  if (socket.roomId && (socket.roomId !== room.id || socket.playerId !== targetSeat.playerId)) {
    detachSocketFromRoom(socket, { clearSeat: true });
  }

  const isNewSeatOccupant = !targetSeat.playerId;
  const playerId = targetSeat.playerId || crypto.randomUUID();
  targetSeat.playerId = playerId;
  targetSeat.name = sanitizeName(playerName);
  targetSeat.connected = true;
  if (isNewSeatOccupant) {
    targetSeat.away = false;
    targetSeat.pendingAway = false;
    targetSeat.pendingReturn = false;
    targetSeat.pendingStandUp = false;
    targetSeat.missedSmallBlind = false;
    targetSeat.missedBigBlind = false;
  } else {
    targetSeat.away = Boolean(targetSeat.away);
    targetSeat.pendingAway = Boolean(targetSeat.pendingAway);
    targetSeat.pendingReturn = Boolean(targetSeat.pendingReturn);
    targetSeat.pendingStandUp = Boolean(targetSeat.pendingStandUp);
    targetSeat.missedSmallBlind = Boolean(targetSeat.missedSmallBlind);
    targetSeat.missedBigBlind = Boolean(targetSeat.missedBigBlind);
  }
  socket.roomId = room.id;
  socket.playerId = playerId;
  room.clients.add(socket);
  send(socket, { type: "joinedRoom", roomId: room.id, playerId });
  broadcastRoom(room);
  scheduleRoomAutomation(room);
}

function updatePlayerName(socket, playerName) {
  const room = rooms.get(socket.roomId);
  if (!room || !socket.playerId) {
    sendError(socket, "먼저 멀티플레이 룸에 참가해야 합니다.");
    return;
  }

  const nextName = sanitizeName(playerName, "플레이어");
  const seat = room.seats.find((entry) => entry.playerId === socket.playerId);
  if (seat) {
    seat.name = nextName;
  }

  if (room.game?.playerConfigs) {
    room.game.playerConfigs = room.game.playerConfigs.map((config) =>
      config.id === socket.playerId ? { ...config, name: nextName } : config,
    );
  }
  if (room.game?.allPlayerConfigs) {
    room.game.allPlayerConfigs = room.game.allPlayerConfigs.map((config) =>
      config.id === socket.playerId ? { ...config, name: nextName } : config,
    );
  }

  if (room.game?.state) {
    room.game.state = {
      ...room.game.state,
      playerConfigs: Array.isArray(room.game.state.playerConfigs)
        ? room.game.state.playerConfigs.map((config) => (config.id === socket.playerId ? { ...config, name: nextName } : config))
        : room.game.state.playerConfigs,
      players: room.game.state.players.map((player) => (player.id === socket.playerId ? { ...player, name: nextName } : player)),
      showdownResults: Array.isArray(room.game.state.showdownResults)
        ? room.game.state.showdownResults.map((result) => (result.id === socket.playerId ? { ...result, name: nextName } : result))
        : room.game.state.showdownResults,
    };
    if (room.game.timer?.playerId === socket.playerId) {
      room.game.timer = { ...room.game.timer, playerName: nextName };
    }
  }

  broadcastRoom(room);
}

function buildRoomGame(room, payload) {
  const settings = normalizeRoomSettings(room, payload);
  const computerPlayers = settings.computerPlayers.map((player, index) => ({
    id: computerPlayerId(index),
    name: sanitizeName(player.name, `컴퓨터 ${index + 1}`),
    isHuman: false,
    startingBalance: Math.max(0, Number(player.startingBalance) || DEFAULT_STARTING_BALANCE),
    computerStyle: resolveComputerStyleKey(player.computerStyle),
    computerLevel: resolveComputerLevelKey(player.computerLevel),
  }));
  if (room.humanSlots + computerPlayers.length > MAX_TOTAL_PLAYERS) {
    throw new Error(`인간 플레이어와 컴퓨터 플레이어를 합쳐 최대 ${MAX_TOTAL_PLAYERS}명까지만 구성할 수 있습니다.`);
  }
  const connectedHumans = room.seats
    .map((seat, index) => ({
      id: seat.playerId,
      name: seat.name || `플레이어 ${index + 1}`,
      isHuman: true,
      startingBalance: settings.humanPlayers[index]?.startingBalance ?? settings.humanStartingBalance,
      setupPlayerId: humanSlotId(index),
      connected: seat.connected,
      away: seatWillBeAwayNextHand(seat),
    }))
    .filter((seat) => seat.id && seat.connected && !seat.away);
  const normalizedPlayerOrder = settings.randomizePlayerOrder
    ? shuffledPlayerOrder(room.humanSlots, computerPlayers.length)
    : normalizePlayerOrder(settings.playerOrder, room.humanSlots, computerPlayers.length);
  const humansBySetupId = new Map(connectedHumans.map((player) => [player.setupPlayerId, player]));
  const computersBySetupId = new Map(computerPlayers.map((player) => [player.id, player]));
  const orderedPlayers = normalizedPlayerOrder
    .map((setupPlayerId) => (setupPlayerId.startsWith("human-slot-") ? humansBySetupId.get(setupPlayerId) : computersBySetupId.get(setupPlayerId)))
    .filter(Boolean);
  const tableSeatOrder = normalizedPlayerOrder.slice(0, MAX_TOTAL_PLAYERS).map((setupPlayerId, index) => {
    if (setupPlayerId.startsWith("human-slot-")) {
      const slotIndex = Number(setupPlayerId.replace("human-slot-", "")) - 1;
      const seat = room.seats[slotIndex];
      return {
        setupPlayerId,
        playerId: seat?.playerId ?? null,
        label: seat?.name || seat?.label || `빈 자리 ${index + 1}`,
      };
    }
    return {
      setupPlayerId,
      playerId: computersBySetupId.get(setupPlayerId)?.id ?? null,
      label: computersBySetupId.get(setupPlayerId)?.name || `빈 자리 ${index + 1}`,
    };
  });
  const playerConfigs = orderedPlayers.map(({ id, name, isHuman, startingBalance }) => ({ id, name, isHuman, startingBalance }));

  if (playerConfigs.length < 2) {
    throw new Error("게임 시작에는 연결된 인간 또는 컴퓨터가 2명 이상 필요합니다.");
  }

  const chipTotals = Object.fromEntries(
    orderedPlayers.map((player) => [
      player.id,
      {
        chipBalance: player.startingBalance,
        chipsWon: 0,
      },
    ]),
  );
  const computerStyles = Object.fromEntries(computerPlayers.map((player) => [player.id, player.computerStyle]));
  const computerLevels = Object.fromEntries(computerPlayers.map((player) => [player.id, player.computerLevel]));
  const state = startNewHand({
    cpuCount: computerPlayers.length,
    includeHuman: false,
    dealerIndex: 0,
    chipTotals,
    feeTotal: 0,
    handNumber: 1,
    computerStyles,
    computerLevels,
    endlessMode: settings.endlessMode,
    endlessReplacementComputerStyle: settings.endlessReplacementComputerStyle,
    endlessReplacementComputerLevel: settings.endlessReplacementComputerLevel,
    endlessReplacementStartingBalance: settings.endlessReplacementStartingBalance,
    playerConfigs,
  });

  return {
    playerConfigs: state.playerConfigs,
    allPlayerConfigs: state.playerConfigs,
    cpuCount: computerPlayers.length,
    computerStyles,
    computerLevels,
    state,
    tableSeatOrder,
    chipTotals: state.chipTotals,
    autoNextHand: settings.autoNextHand,
    endlessMode: settings.endlessMode,
    endlessReplacementComputerStyle: settings.endlessReplacementComputerStyle,
    endlessReplacementComputerLevel: settings.endlessReplacementComputerLevel,
    endlessReplacementStartingBalance: settings.endlessReplacementStartingBalance,
    showComputerStyles: settings.showComputerStyles,
    showCumulativeWins: settings.showCumulativeWins,
    computerActionDelayMs: settings.computerActionDelayMs,
    nextHandDelayMs: settings.nextHandDelayMs,
    humanActionTimeoutMs: settings.humanActionTimeoutMs,
    nextHandReadyPlayerIds: new Set(),
    cardPeekPlayerIds: new Set(),
    computerCardCheckedPlayerIds: new Set(),
    timer: null,
    timerId: 0,
  };
}

function startRoomGame(socket, payload) {
  const room = rooms.get(socket.roomId);
  if (!room) {
    sendError(socket, "먼저 멀티플레이 룸에 참가해야 합니다.");
    return;
  }
  if (!isRoomHost(room, socket)) {
    sendError(socket, "방장만 게임 설정과 시작을 할 수 있습니다.");
    return;
  }

  try {
    if (Array.isArray(payload.humanPlayers)) {
      resizeRoomHumanSlots(room, payload.humanPlayers.length, payload.removedHumanSlotIds);
    }
    room.settings = normalizeRoomSettings(room, { ...room.settings, ...payload });
    room.game = buildRoomGame(room, room.settings);
    scheduleRoomAutomation(room);
  } catch (error) {
    sendError(socket, error.message);
  }
}

function startNextRoomHand(room) {
  if (!room.game?.state || room.game.state.gameOver) {
    return;
  }

  const currentState = room.game.state;
  const reservationLog = applySeatParticipationReservations(room);
  const missedBlindLog = recordMissedBlindsForAwaySeats(room, currentState);
  const nextPlayerConfigs = activePlayerConfigsForNextHand(room);
  const nextDealerIndex = nextDealerIndexForPlayerConfigs(room, currentState, nextPlayerConfigs);
  const forcedContributions = missedBlindForcedContributions(room, nextPlayerConfigs);
  room.game.nextHandReadyPlayerIds = new Set();
  room.game.cardPeekPlayerIds = new Set();
  room.game.computerCardCheckedPlayerIds = new Set();
  room.game.timer = null;
  const nextState = startNewHand({
    cpuCount: room.game.cpuCount,
    includeHuman: false,
    dealerIndex: nextDealerIndex,
    chipTotals: room.game.chipTotals ?? currentState.chipTotals,
    feeTotal: currentState.feeTotal,
    handNumber: (currentState.handNumber ?? 0) + 1,
    computerStyles: room.game.computerStyles,
    computerLevels: room.game.computerLevels,
    endlessMode: room.game.endlessMode,
    endlessReplacementComputerStyle: room.game.endlessReplacementComputerStyle,
    endlessReplacementComputerLevel: room.game.endlessReplacementComputerLevel,
    endlessReplacementStartingBalance: room.game.endlessReplacementStartingBalance,
    playerStats: currentState.playerStats ?? {},
    playerConfigs: nextPlayerConfigs,
    forcedContributions,
  });
  const participationLog = [...reservationLog, ...missedBlindLog];
  room.game.state = participationLog.length ? { ...nextState, log: [...participationLog, ...nextState.log] } : nextState;
  room.game.playerConfigs = room.game.state.playerConfigs;
  syncAllPlayerConfigs(room, nextPlayerConfigs, room.game.state.playerConfigs);
  syncTableSeatOrder(room, nextPlayerConfigs, room.game.state.playerConfigs);
  room.game.chipTotals = mergeChipTotals(room.game.chipTotals ?? currentState.chipTotals, room.game.state.chipTotals);
  room.game.computerStyles = room.game.state.computerStyles ?? room.game.computerStyles;
  room.game.computerLevels = room.game.state.computerLevels ?? room.game.computerLevels;
  scheduleRoomAutomation(room);
}

function applyRoomAction(room, actionKey, actorPlayerId = null, { timedOut = false } = {}) {
  if (!room.game?.state || room.game.state.finished) {
    return false;
  }

  const actorIndex = actorPlayerId
    ? room.game.state.players.findIndex((player) => player.id === actorPlayerId)
    : room.game.state.currentPlayerIndex;
  const actor = room.game.state.players[actorIndex];
  const sourceState = timedOut && actor ? { ...room.game.state, log: [...room.game.state.log, `${actor.name}: 제한 시간 초과`] } : room.game.state;
  const nextState = applyAction(sourceState, actionKey, actorIndex);
  if (nextState === sourceState) {
    return false;
  }

  room.game.state = nextState;
  room.game.chipTotals = mergeChipTotals(room.game.chipTotals, nextState.chipTotals);
  room.game.computerStyles = nextState.computerStyles ?? room.game.computerStyles;
  room.game.computerLevels = nextState.computerLevels ?? room.game.computerLevels;
  scheduleRoomAutomation(room);
  return true;
}

function scheduleRoomAutomation(room) {
  if (room.automationTimer) {
    clearTimeout(room.automationTimer);
    room.automationTimer = null;
  }
  if (room.computerPeekTimer) {
    clearTimeout(room.computerPeekTimer);
    room.computerPeekTimer = null;
  }
  if (room.game) {
    room.game.timer = null;
  }
  if (!room.game?.state || room.clients.size === 0) {
    return;
  }

  const state = room.game.state;
  if (state.finished) {
    const hasRequiredHumanNextHandConfirmation = nextHandRequiredPlayerIds(room).length > 0;
    if (!state.gameOver && (room.game.autoNextHand || !hasRequiredHumanNextHandConfirmation)) {
      scheduleRoomTimer(room, {
        phase: "autoNextHand",
        durationMs: room.game.nextHandDelayMs,
        onTimeout: () => startNextRoomHand(room),
      });
    } else if (!state.gameOver) {
      scheduleRoomTimer(room, {
        phase: "nextHandReady",
        durationMs: room.game.humanActionTimeoutMs,
        onTimeout: () => startNextRoomHand(room),
      });
    }
    broadcastRoom(room);
    return;
  }

  const actor = state.players[state.currentPlayerIndex];
  if (actor && !actor.isHuman) {
    const planState = {
      ...state,
      computerCardCheckedPlayerIds: room.game.computerCardCheckedPlayerIds ?? new Set(),
    };
    const peekPlan = computerCardPeekPlan(planState, state.currentPlayerIndex, room.game.computerActionDelayMs);
    if (peekPlan.shouldPeek) {
      room.game.cardPeekPlayerIds ??= new Set();
      room.game.computerCardCheckedPlayerIds ??= new Set();
      room.game.computerCardCheckedPlayerIds.add(actor.id);
      room.game.cardPeekPlayerIds.add(actor.id);
      room.computerPeekTimer = setTimeout(() => {
        if (room.game?.state?.players?.[room.game.state.currentPlayerIndex]?.id === actor.id) {
          room.game.cardPeekPlayerIds?.delete(actor.id);
          broadcastRoom(room);
        }
      }, peekPlan.durationMs);
    }
    const actionDelayMs = peekPlan.shouldPeek ? Math.max(room.game.computerActionDelayMs, peekPlan.durationMs + 80) : room.game.computerActionDelayMs;
    room.automationTimer = setTimeout(() => {
      room.game.cardPeekPlayerIds?.delete(actor.id);
      const decisionState = {
        ...room.game.state,
        cardPeekPlayerIds: [...(room.game.cardPeekPlayerIds ?? new Set())].filter((playerId) => playerId !== actor.id),
      };
      const action = chooseComputerAction(decisionState);
      applyRoomAction(room, action);
    }, actionDelayMs);
  } else if (actor?.isHuman) {
    scheduleRoomTimer(room, {
      phase: "humanAction",
      playerId: actor.id,
      playerName: actor.name,
      durationMs: room.game.humanActionTimeoutMs,
      onTimeout: () => {
        if (room.game?.state?.finished) {
          return;
        }
        const currentActor = room.game.state.players[room.game.state.currentPlayerIndex];
        if (currentActor?.id === actor.id && currentActor.isHuman) {
          const timeoutActions = getAvailableActions(room.game.state, room.game.state.currentPlayerIndex).filter((action) => action.enabled);
          const timeoutAction = room.game.state.showdownPending && timeoutActions.some((action) => action.key === "muck") ? "muck" : room.game.state.showdownPending ? "show" : "fold";
          applyRoomAction(room, timeoutAction, actor.id, { timedOut: true });
        }
      },
    });
  }
  broadcastRoom(room);
}

function scheduleRoomTimer(room, { phase, playerId = null, playerName = null, durationMs, onTimeout }) {
  const startedAt = Date.now();
  const safeDurationMs = Math.max(0, Number(durationMs) || 0);
  const timerId = (room.game.timerId ?? 0) + 1;
  room.game.timerId = timerId;
  room.game.timer = {
    id: timerId,
    phase,
    playerId,
    playerName,
    startedAt,
    expiresAt: startedAt + safeDurationMs,
    durationMs: safeDurationMs,
  };
  room.automationTimer = setTimeout(() => {
    if (room.game?.timer?.id !== timerId) {
      return;
    }
    room.game.timer = null;
    onTimeout();
  }, safeDurationMs);
}

function handleGameAction(socket, payload) {
  const room = rooms.get(socket.roomId);
  if (!room?.game?.state) {
    sendError(socket, "진행 중인 멀티플레이 게임이 없습니다.");
    return;
  }

  const actor = room.game.state.players[room.game.state.currentPlayerIndex];
  if (!actor?.isHuman || actor.id !== socket.playerId) {
    sendError(socket, "현재 내 차례가 아닙니다.");
    return;
  }

  if (!applyRoomAction(room, payload.action, socket.playerId)) {
    sendError(socket, "해당 행동을 적용할 수 없습니다.");
  }
}

function handleRequestNextHand(socket) {
  const room = rooms.get(socket.roomId);
  if (!room?.game?.state) {
    sendError(socket, "진행 중인 멀티플레이 게임이 없습니다.");
    return;
  }
  if (!room.game.state.finished || room.game.state.gameOver) {
    sendError(socket, "다음 핸드를 시작할 수 있는 상태가 아닙니다.");
    return;
  }

  const requiredPlayerIds = nextHandRequiredPlayerIds(room);
  if (!requiredPlayerIds.includes(socket.playerId)) {
    sendError(socket, "다음 핸드 진행 확인 대상이 아닙니다.");
    return;
  }

  room.game.nextHandReadyPlayerIds ??= new Set();
  room.game.nextHandReadyPlayerIds.add(socket.playerId);
  if (allRequiredPlayersReadyForNextHand(room)) {
    startNextRoomHand(room);
    return;
  }
  broadcastRoom(room);
}

function handleSetSeatAway(socket, payload) {
  const room = rooms.get(socket.roomId);
  if (!room || !socket.playerId) {
    sendError(socket, "먼저 멀티플레이 룸에 참가해야 합니다.");
    return;
  }

  const seat = room.seats.find((entry) => entry.playerId === socket.playerId);
  if (!seat) {
    sendError(socket, "참가자 자리를 찾을 수 없습니다.");
    return;
  }

  const wantsAway = Boolean(payload.away);
  const state = room.game?.state;
  const handInProgress = Boolean(state && !state.finished && !state.gameOver);

  if (handInProgress) {
    if (Boolean(seat.away) === wantsAway) {
      seat.pendingAway = false;
      seat.pendingReturn = false;
    } else {
      seat.pendingAway = wantsAway;
      seat.pendingReturn = !wantsAway;
    }
    seat.pendingStandUp = false;
  } else {
    seat.away = wantsAway;
    seat.pendingAway = false;
    seat.pendingReturn = false;
    seat.pendingStandUp = false;
    room.game?.nextHandReadyPlayerIds?.delete(socket.playerId);
  }

  room.game?.cardPeekPlayerIds?.delete(socket.playerId);
  if (room.game?.state?.finished && !room.game.state.gameOver) {
    if (!startNextRoomHandIfReady(room)) {
      scheduleRoomAutomation(room);
    }
    return;
  }

  broadcastRoom(room);
}

function handleStandUpFromGame(socket, payload) {
  const room = rooms.get(socket.roomId);
  if (!room?.game || !socket.playerId) {
    sendError(socket, "진행 중인 멀티플레이 게임에 참가해야 합니다.");
    return;
  }

  const seat = room.seats.find((entry) => entry.playerId === socket.playerId);
  if (!seat) {
    sendError(socket, "현재 게임 좌석에 앉아 있지 않습니다.");
    return;
  }

  const state = room.game.state;
  const handInProgress = Boolean(state && !state.finished && !state.gameOver);
  const playerInCurrentHand = Boolean(state?.players.some((player) => player.id === socket.playerId && !player.eliminated));

  if (Boolean(payload.cancel)) {
    if (!seat.pendingStandUp) {
      sendError(socket, "취소할 게임 퇴장 예약이 없습니다.");
      return;
    }
    seat.pendingStandUp = false;
    broadcastRoom(room);
    return;
  }

  if (handInProgress && playerInCurrentHand) {
    seat.pendingStandUp = true;
    seat.pendingAway = false;
    seat.pendingReturn = false;
    room.game.cardPeekPlayerIds?.delete(socket.playerId);
    broadcastRoom(room);
    return;
  }

  const cleared = clearHumanSeatFromGame(room, seat);
  if (cleared && room.game?.state?.finished && !room.game.state.gameOver) {
    if (!startNextRoomHandIfReady(room)) {
      scheduleRoomAutomation(room);
    }
    return;
  }

  broadcastRoom(room);
}

function handleCardPeekState(socket, payload) {
  const room = rooms.get(socket.roomId);
  if (!room?.game?.state || !socket.playerId) {
    return;
  }

  room.game.cardPeekPlayerIds ??= new Set();
  const player = room.game.state.players.find((entry) => entry.id === socket.playerId && entry.isHuman && !entry.eliminated);
  const canPeek = Boolean(player && !room.game.state.finished);
  const nextPeeking = Boolean(payload.peeking) && canPeek;
  const wasPeeking = room.game.cardPeekPlayerIds.has(socket.playerId);
  if (nextPeeking === wasPeeking) {
    return;
  }

  if (nextPeeking) {
    room.game.cardPeekPlayerIds.add(socket.playerId);
  } else {
    room.game.cardPeekPlayerIds.delete(socket.playerId);
  }
  broadcastRoom(room);
}

function handleUpdateRoomSettings(socket, payload) {
  const room = rooms.get(socket.roomId);
  if (!room) {
    sendError(socket, "먼저 멀티플레이 룸에 참가해야 합니다.");
    return;
  }
  if (!isRoomHost(room, socket)) {
    sendError(socket, "방장만 게임 설정을 변경할 수 있습니다.");
    return;
  }
  if (room.game) {
    sendError(socket, "진행 중인 게임의 시작 설정은 변경할 수 없습니다.");
    return;
  }

  const nextSettings = payload.settings ?? payload;
  if (Array.isArray(nextSettings.humanPlayers)) {
    try {
      resizeRoomHumanSlots(room, nextSettings.humanPlayers.length, nextSettings.removedHumanSlotIds);
    } catch (error) {
      sendError(socket, error.message);
      return;
    }
  }
  room.settings = normalizeRoomSettings(room, { ...room.settings, ...nextSettings });
  broadcastRoom(room);
}

function handleUpdateGameOptions(socket, payload) {
  const room = rooms.get(socket.roomId);
  if (!room?.game) {
    sendError(socket, "진행 중인 멀티플레이 게임이 없습니다.");
    return;
  }
  if (!isRoomHost(room, socket)) {
    sendError(socket, "방장만 게임 설정을 변경할 수 있습니다.");
    return;
  }

  if (Object.hasOwn(payload, "autoNextHand")) {
    room.game.autoNextHand = Boolean(payload.autoNextHand);
  }
  if (Object.hasOwn(payload, "endlessMode")) {
    room.game.endlessMode = Boolean(payload.endlessMode);
  }
  if (Object.hasOwn(payload, "endlessReplacementComputerStyle")) {
    room.game.endlessReplacementComputerStyle = sanitizeComputerStyleKey(payload.endlessReplacementComputerStyle);
  }
  if (Object.hasOwn(payload, "endlessReplacementComputerLevel")) {
    room.game.endlessReplacementComputerLevel = sanitizeComputerLevelKey(payload.endlessReplacementComputerLevel);
  }
  if (Object.hasOwn(payload, "endlessReplacementStartingBalance")) {
    room.game.endlessReplacementStartingBalance = Math.max(
      MIN_PLAYABLE_BALANCE,
      Number(payload.endlessReplacementStartingBalance) || DEFAULT_STARTING_BALANCE,
    );
  }
  if (Object.hasOwn(payload, "computerActionDelayMs")) {
    room.game.computerActionDelayMs = clamp(
      payload.computerActionDelayMs,
      MIN_COMPUTER_ACTION_DELAY_MS,
      MAX_COMPUTER_ACTION_DELAY_MS,
      DEFAULT_COMPUTER_ACTION_DELAY_MS,
    );
  }
  if (Object.hasOwn(payload, "nextHandDelayMs")) {
    room.game.nextHandDelayMs = clamp(payload.nextHandDelayMs, MIN_NEXT_HAND_DELAY_MS, MAX_NEXT_HAND_DELAY_MS, DEFAULT_NEXT_HAND_DELAY_MS);
  }
  if (Object.hasOwn(payload, "humanActionTimeoutMs")) {
    room.game.humanActionTimeoutMs = clamp(
      payload.humanActionTimeoutMs,
      MIN_HUMAN_ACTION_TIMEOUT_MS,
      MAX_HUMAN_ACTION_TIMEOUT_MS,
      DEFAULT_HUMAN_ACTION_TIMEOUT_MS,
    );
  }
  if (Object.hasOwn(payload, "showComputerStyles")) {
    room.game.showComputerStyles = Boolean(payload.showComputerStyles);
  }
  if (Object.hasOwn(payload, "showCumulativeWins")) {
    room.game.showCumulativeWins = Boolean(payload.showCumulativeWins);
  }
  room.settings = normalizeRoomSettings(room, {
    ...room.settings,
    autoNextHand: room.game.autoNextHand,
    endlessMode: room.game.endlessMode,
    endlessReplacementComputerStyle: room.game.endlessReplacementComputerStyle,
    endlessReplacementComputerLevel: room.game.endlessReplacementComputerLevel,
    endlessReplacementStartingBalance: room.game.endlessReplacementStartingBalance,
    showComputerStyles: room.game.showComputerStyles,
    showCumulativeWins: room.game.showCumulativeWins,
    computerActionDelayMs: room.game.computerActionDelayMs,
    nextHandDelayMs: room.game.nextHandDelayMs,
    humanActionTimeoutMs: room.game.humanActionTimeoutMs,
  });
  scheduleRoomAutomation(room);
}

function handleMessage(socket, message) {
  if (message.type === "createRoom") {
    createRoom(socket, message);
    return;
  }
  if (message.type === "joinRoom") {
    joinRoom(socket, message.roomId, message.playerName, message.playerId);
    return;
  }
  if (message.type === "rejoinRoom") {
    joinRoom(socket, message.roomId, message.playerName, message.playerId);
    return;
  }
  if (message.type === "updatePlayerName") {
    updatePlayerName(socket, message.playerName);
    return;
  }
  if (message.type === "leaveRoom") {
    detachSocketFromRoom(socket, { clearSeat: true });
    send(socket, { type: "leftRoom" });
    return;
  }
  if (message.type === "startGame") {
    startRoomGame(socket, message);
    return;
  }
  if (message.type === "updateRoomSettings") {
    handleUpdateRoomSettings(socket, message);
    return;
  }
  if (message.type === "gameAction") {
    handleGameAction(socket, message);
    return;
  }
  if (message.type === "requestNextHand") {
    handleRequestNextHand(socket);
    return;
  }
  if (message.type === "setSeatAway") {
    handleSetSeatAway(socket, message);
    return;
  }
  if (message.type === "standUpFromGame") {
    handleStandUpFromGame(socket, message);
    return;
  }
  if (message.type === "cardPeekState") {
    handleCardPeekState(socket, message);
    return;
  }
  if (message.type === "updateGameOptions") {
    handleUpdateGameOptions(socket, message);
    return;
  }
  sendError(socket, "알 수 없는 메시지입니다.");
}

function parseFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    }
    if (length === 127) {
      break;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (offset + frameLength > buffer.length) {
      break;
    }

    const mask = masked ? buffer.subarray(offset + headerLength, offset + headerLength + 4) : null;
    const dataStart = offset + headerLength + maskLength;
    const payload = Buffer.from(buffer.subarray(dataStart, dataStart + length));
    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    if (opcode === 0x8) {
      frames.push({ type: "close" });
    } else if (opcode === 0x9) {
      frames.push({ type: "ping", payload });
    } else if (opcode === 0x1) {
      frames.push({ type: "text", payload: payload.toString("utf8") });
    }

    offset += frameLength;
  }

  return { frames, remaining: buffer.subarray(offset) };
}

function upgradeWebSocket(req, socket, head = Buffer.alloc(0)) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n"),
  );

  socket.frameBuffer = Buffer.alloc(0);
  if (head.length > 0) {
    socket.frameBuffer = Buffer.from(head);
  }
  sockets.add(socket);
  socket.on("data", (buffer) => {
    socket.frameBuffer = Buffer.concat([socket.frameBuffer, buffer]);
    if (socket.frameBuffer.length > MAX_FRAME_BUFFER_BYTES) {
      socket.destroy();
      return;
    }

    const parsed = parseFrames(socket.frameBuffer);
    socket.frameBuffer = parsed.remaining;
    for (const frame of parsed.frames) {
      if (frame.type === "close") {
        socket.end();
        return;
      }
      if (frame.type === "ping") {
        socket.write(makeFrame(frame.payload, 0x0a));
        continue;
      }
      try {
        handleMessage(socket, JSON.parse(frame.payload));
      } catch {
        sendError(socket, "메시지를 처리할 수 없습니다.");
      }
    }
  });
  socket.on("close", () => {
    sockets.delete(socket);
    detachSocketFromRoom(socket);
  });
  socket.on("error", () => {
    sockets.delete(socket);
    detachSocketFromRoom(socket);
  });
  send(socket, { type: "connected" });
}

await app.prepare();

const handleUpgrade = app.getUpgradeHandler();
const server = http.createServer((req, res) => handle(req, res));
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    upgradeWebSocket(req, socket, head);
    return;
  }
  handleUpgrade(req, socket, head);
});

server.listen(port, hostname, () => {
  console.log(`> Ready on http://${hostname}:${port}`);
});
