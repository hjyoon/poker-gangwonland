import crypto from "node:crypto";
import http from "node:http";
import next from "next";
import {
  COMPUTER_LEVEL_OPTIONS,
  COMPUTER_STYLE_OPTIONS,
  MIN_PLAYABLE_BALANCE,
  applyAction,
  chooseComputerAction,
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
const MIN_HUMAN_SLOTS = 2;
const MAX_HUMAN_SLOTS = MAX_TOTAL_PLAYERS;
const DEFAULT_STARTING_BALANCE = 100000;
const DEFAULT_COMPUTER_ACTION_DELAY_MS = 700;
const DEFAULT_NEXT_HAND_DELAY_MS = 1800;
const DEFAULT_HUMAN_ACTION_TIMEOUT_MS = 15000;
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

function publicGameState(state, playerId, showComputerStyles = true) {
  if (!state) {
    return null;
  }

  const revealShowdownCards = state.finished && state.showdownResults.length > 0;
  return {
    ...state,
    computerStyles: showComputerStyles ? state.computerStyles : {},
    computerLevels: showComputerStyles ? state.computerLevels : {},
    deck: [],
    players: state.players.map((player) => {
      const revealCards = player.id === playerId || (revealShowdownCards && !player.folded);
      return {
        ...player,
        computerStyle: showComputerStyles || player.isHuman ? player.computerStyle : null,
        computerLevel: showComputerStyles || player.isHuman ? player.computerLevel : null,
        cards: revealCards ? player.cards : player.cards.map(() => null),
      };
    }),
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
    computerActionDelayMs: room.game.computerActionDelayMs,
    nextHandDelayMs: room.game.nextHandDelayMs,
    humanActionTimeoutMs: room.game.humanActionTimeoutMs,
  };
}

function nextHandRequiredPlayerIds(room) {
  if (!room.game?.state?.finished || room.game.state.gameOver) {
    return [];
  }

  const connectedPlayerIds = new Set(room.seats.filter((seat) => seat.playerId && seat.connected).map((seat) => seat.playerId));
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
  return requiredPlayerIds.length > 0 && requiredPlayerIds.every((playerId) => readyPlayerIds.has(playerId));
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

function publicRoom(room, socket) {
  const settings = publicRoomSettings(room);
  return {
    id: room.id,
    humanSlots: room.humanSlots,
    hostPlayerId: room.hostPlayerId,
    seats: room.seats.map((seat) => ({ ...seat })),
    createdAt: room.createdAt,
    settings,
    showComputerStyles: settings.showComputerStyles,
    nextHandRequiredPlayerIds: nextHandRequiredPlayerIds(room),
    nextHandReadyPlayerIds: nextHandReadyPlayerIds(room),
    timer: publicRoomTimer(room),
    gameState: publicGameState(room.game?.state, socket?.playerId, settings.showComputerStyles),
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
    }
    seat.connected = false;
  }

  if (room.clients.size === 0) {
    if (room.automationTimer) {
      clearTimeout(room.automationTimer);
      room.automationTimer = null;
    }
    if (room.game) {
      room.game.timer = null;
    }
    scheduleEmptyRoomCleanup(room);
  } else if (!startNextRoomHandIfReady(room)) {
    broadcastRoom(room);
  }
}

function resizeRoomHumanSlots(room, nextHumanSlots) {
  const humanSlots = clamp(nextHumanSlots, MIN_HUMAN_SLOTS, MAX_HUMAN_SLOTS, room.humanSlots);
  if (humanSlots === room.humanSlots) {
    return;
  }

  if (humanSlots < room.humanSlots) {
    const removedSeats = room.seats.slice(humanSlots);
    if (removedSeats.some((seat) => seat.playerId)) {
      throw new Error("참가자가 있는 사람 플레이어는 컴퓨터로 변경할 수 없습니다.");
    }
    room.seats = room.seats.slice(0, humanSlots);
  } else {
    for (let index = room.humanSlots; index < humanSlots; index += 1) {
      room.seats.push({
        id: `human-slot-${index + 1}`,
        label: `빈 자리 ${index + 1}`,
        playerId: null,
        name: null,
        connected: false,
      });
    }
  }

  room.humanSlots = humanSlots;
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
    })),
    clients: new Set([socket]),
    createdAt: Date.now(),
    settings: null,
    game: null,
    cleanupTimer: null,
    automationTimer: null,
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

  const playerId = targetSeat.playerId || crypto.randomUUID();
  targetSeat.playerId = playerId;
  targetSeat.name = sanitizeName(playerName);
  targetSeat.connected = true;
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
    throw new Error(`사람 플레이어와 컴퓨터 플레이어를 합쳐 최대 ${MAX_TOTAL_PLAYERS}명까지만 구성할 수 있습니다.`);
  }
  const connectedHumans = room.seats
    .map((seat, index) => ({
      id: seat.playerId,
      name: seat.name || `플레이어 ${index + 1}`,
      isHuman: true,
      startingBalance: settings.humanPlayers[index]?.startingBalance ?? settings.humanStartingBalance,
      setupPlayerId: humanSlotId(index),
      connected: seat.connected,
    }))
    .filter((seat) => seat.id && seat.connected);
  const normalizedPlayerOrder = settings.randomizePlayerOrder
    ? shuffledPlayerOrder(room.humanSlots, computerPlayers.length)
    : normalizePlayerOrder(settings.playerOrder, room.humanSlots, computerPlayers.length);
  const humansBySetupId = new Map(connectedHumans.map((player) => [player.setupPlayerId, player]));
  const computersBySetupId = new Map(computerPlayers.map((player) => [player.id, player]));
  const orderedPlayers = normalizedPlayerOrder
    .map((setupPlayerId) => (setupPlayerId.startsWith("human-slot-") ? humansBySetupId.get(setupPlayerId) : computersBySetupId.get(setupPlayerId)))
    .filter(Boolean);
  const playerConfigs = orderedPlayers.map(({ id, name, isHuman, startingBalance }) => ({ id, name, isHuman, startingBalance }));

  if (playerConfigs.length < 2) {
    throw new Error("게임 시작에는 연결된 사람 또는 컴퓨터가 2명 이상 필요합니다.");
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
    playerConfigs,
    cpuCount: computerPlayers.length,
    computerStyles,
    computerLevels,
    state,
    autoNextHand: settings.autoNextHand,
    endlessMode: settings.endlessMode,
    endlessReplacementComputerStyle: settings.endlessReplacementComputerStyle,
    endlessReplacementComputerLevel: settings.endlessReplacementComputerLevel,
    endlessReplacementStartingBalance: settings.endlessReplacementStartingBalance,
    showComputerStyles: settings.showComputerStyles,
    computerActionDelayMs: settings.computerActionDelayMs,
    nextHandDelayMs: settings.nextHandDelayMs,
    humanActionTimeoutMs: settings.humanActionTimeoutMs,
    nextHandReadyPlayerIds: new Set(),
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
      resizeRoomHumanSlots(room, payload.humanPlayers.length);
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
  const nextDealerIndex = (currentState.dealerIndex + 1) % currentState.players.length;
  room.game.nextHandReadyPlayerIds = new Set();
  room.game.timer = null;
  room.game.state = startNewHand({
    cpuCount: room.game.cpuCount,
    includeHuman: false,
    dealerIndex: nextDealerIndex,
    chipTotals: currentState.chipTotals,
    feeTotal: currentState.feeTotal,
    handNumber: (currentState.handNumber ?? 0) + 1,
    computerStyles: room.game.computerStyles,
    computerLevels: room.game.computerLevels,
    endlessMode: room.game.endlessMode,
    endlessReplacementComputerStyle: room.game.endlessReplacementComputerStyle,
    endlessReplacementComputerLevel: room.game.endlessReplacementComputerLevel,
    endlessReplacementStartingBalance: room.game.endlessReplacementStartingBalance,
    playerStats: currentState.playerStats ?? {},
    playerConfigs: room.game.playerConfigs,
  });
  room.game.playerConfigs = room.game.state.playerConfigs;
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
  if (room.game) {
    room.game.timer = null;
  }
  if (!room.game?.state || room.clients.size === 0) {
    return;
  }

  const state = room.game.state;
  if (state.finished) {
    if (room.game.autoNextHand && !state.gameOver) {
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
    room.automationTimer = setTimeout(() => {
      const action = chooseComputerAction(room.game.state);
      applyRoomAction(room, action);
    }, room.game.computerActionDelayMs);
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
          applyRoomAction(room, "fold", actor.id, { timedOut: true });
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
      resizeRoomHumanSlots(room, nextSettings.humanPlayers.length);
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
  room.settings = normalizeRoomSettings(room, {
    ...room.settings,
    autoNextHand: room.game.autoNextHand,
    endlessMode: room.game.endlessMode,
    endlessReplacementComputerStyle: room.game.endlessReplacementComputerStyle,
    endlessReplacementComputerLevel: room.game.endlessReplacementComputerLevel,
    endlessReplacementStartingBalance: room.game.endlessReplacementStartingBalance,
    showComputerStyles: room.game.showComputerStyles,
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

function upgradeWebSocket(req, socket) {
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

const server = http.createServer((req, res) => handle(req, res));
server.on("upgrade", (req, socket) => {
  if (req.url === "/ws") {
    upgradeWebSocket(req, socket);
  } else {
    socket.destroy();
  }
});

server.listen(port, hostname, () => {
  console.log(`> Ready on http://${hostname}:${port}`);
});
