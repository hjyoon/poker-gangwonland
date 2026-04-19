import crypto from "node:crypto";
import http from "node:http";
import next from "next";
import { COMPUTER_STYLE_OPTIONS, applyAction, chooseComputerAction, resolveComputerStyleKey, startNewHand } from "./lib/poker.js";

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
const MIN_COMPUTER_ACTION_DELAY_MS = 100;
const MAX_COMPUTER_ACTION_DELAY_MS = 3000;
const MIN_NEXT_HAND_DELAY_MS = 500;
const MAX_NEXT_HAND_DELAY_MS = 10000;
const MAX_FRAME_BUFFER_BYTES = 128 * 1024;
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;

const rooms = new Map();
const sockets = new Set();
const COMPUTER_STYLE_KEYS = new Set(COMPUTER_STYLE_OPTIONS.map((style) => style.key));

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

function shuffledTableSeats(seatCount) {
  const seats = tableSeatOptions(seatCount);
  for (let index = seats.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [seats[index], seats[swapIndex]] = [seats[swapIndex], seats[index]];
  }
  return seats;
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
  return COMPUTER_STYLE_KEYS.has(value) ? value : "balanced";
}

function defaultComputerSettings(humanSlots) {
  const count = Math.min(3, Math.max(0, MAX_TOTAL_PLAYERS - humanSlots));
  return Array.from({ length: count }, (_, index) => ({
    name: `컴퓨터 ${index + 1}`,
    startingBalance: DEFAULT_STARTING_BALANCE,
    computerStyle: "balanced",
  }));
}

function normalizeRoomSettings(room, settings = {}) {
  const maxComputerPlayers = Math.max(0, MAX_TOTAL_PLAYERS - room.humanSlots);
  const sourceComputerPlayers = Array.isArray(settings.computerPlayers) ? settings.computerPlayers : defaultComputerSettings(room.humanSlots);
  const computerPlayers = sourceComputerPlayers.slice(0, maxComputerPlayers).map((player, index) => ({
    name: sanitizeName(player.name, `컴퓨터 ${index + 1}`),
    startingBalance: Math.max(0, Number(player.startingBalance) || DEFAULT_STARTING_BALANCE),
    computerStyle: sanitizeComputerStyleKey(player.computerStyle),
  }));
  const totalSeatCount = room.humanSlots + computerPlayers.length;

  return {
    humanStartingBalance: Math.max(0, Number(settings.humanStartingBalance) || DEFAULT_STARTING_BALANCE),
    humanSeatPlacements: normalizeHumanTableSeats(settings.humanSeatPlacements, room.humanSlots, totalSeatCount),
    randomizeHumanSeats: Boolean(settings.randomizeHumanSeats),
    computerPlayers,
    autoNextHand: settings.autoNextHand !== false,
    showComputerStyles: settings.showComputerStyles !== false,
    computerActionDelayMs: clamp(
      settings.computerActionDelayMs,
      MIN_COMPUTER_ACTION_DELAY_MS,
      MAX_COMPUTER_ACTION_DELAY_MS,
      DEFAULT_COMPUTER_ACTION_DELAY_MS,
    ),
    nextHandDelayMs: clamp(settings.nextHandDelayMs, MIN_NEXT_HAND_DELAY_MS, MAX_NEXT_HAND_DELAY_MS, DEFAULT_NEXT_HAND_DELAY_MS),
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
    deck: [],
    players: state.players.map((player) => {
      const revealCards = player.id === playerId || (revealShowdownCards && !player.folded);
      return {
        ...player,
        computerStyle: showComputerStyles || player.isHuman ? player.computerStyle : null,
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
    showComputerStyles: room.game.showComputerStyles,
    computerActionDelayMs: room.game.computerActionDelayMs,
    nextHandDelayMs: room.game.nextHandDelayMs,
  };
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
    scheduleEmptyRoomCleanup(room);
  } else {
    broadcastRoom(room);
  }
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
      label: `사람 슬롯 ${index + 1}`,
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
    sendError(socket, "빈 사람 슬롯이 없습니다.");
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

function buildRoomGame(room, payload) {
  const settings = normalizeRoomSettings(room, payload);
  const humanStartingBalance = settings.humanStartingBalance;
  const computerPlayers = settings.computerPlayers.map((player, index) => ({
    id: `cpu-${index + 1}`,
    name: sanitizeName(player.name, `컴퓨터 ${index + 1}`),
    isHuman: false,
    startingBalance: Math.max(0, Number(player.startingBalance) || DEFAULT_STARTING_BALANCE),
    computerStyle: resolveComputerStyleKey(player.computerStyle),
  }));
  if (room.humanSlots + computerPlayers.length > MAX_TOTAL_PLAYERS) {
    throw new Error(`사람 슬롯과 컴퓨터 플레이어를 합쳐 최대 ${MAX_TOTAL_PLAYERS}명까지만 구성할 수 있습니다.`);
  }
  const totalSeatCount = room.humanSlots + computerPlayers.length;
  const humanTableSeats = settings.randomizeHumanSeats
    ? shuffledTableSeats(totalSeatCount).slice(0, room.humanSlots)
    : settings.humanSeatPlacements;
  const connectedHumans = room.seats
    .map((seat, index) => ({
      id: seat.playerId,
      name: seat.name || `플레이어 ${index + 1}`,
      isHuman: true,
      startingBalance: humanStartingBalance,
      tableSeatIndex: humanTableSeats[index],
      connected: seat.connected,
    }))
    .filter((seat) => seat.id && seat.connected);
  const computersByOrder = [...computerPlayers];
  const playersByTableSeat = [];

  for (const seatIndex of tableSeatOptions(totalSeatCount)) {
    const human = connectedHumans.find((player) => player.tableSeatIndex === seatIndex);
    if (human) {
      playersByTableSeat.push(human);
      continue;
    }

    const computer = computersByOrder.shift();
    if (computer) {
      playersByTableSeat.push(computer);
    }
  }

  const orderedPlayers = [...playersByTableSeat, ...computersByOrder];
  const playerConfigs = orderedPlayers.map(({ id, name, isHuman }) => ({ id, name, isHuman }));

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
  const state = startNewHand({
    cpuCount: computerPlayers.length,
    includeHuman: false,
    dealerIndex: 0,
    chipTotals,
    feeTotal: 0,
    handNumber: 1,
    computerStyles,
    playerConfigs,
  });

  return {
    playerConfigs,
    cpuCount: computerPlayers.length,
    computerStyles,
    state,
    autoNextHand: settings.autoNextHand,
    showComputerStyles: settings.showComputerStyles,
    computerActionDelayMs: settings.computerActionDelayMs,
    nextHandDelayMs: settings.nextHandDelayMs,
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
    room.settings = normalizeRoomSettings(room, { ...room.settings, ...payload });
    room.game = buildRoomGame(room, room.settings);
    broadcastRoom(room);
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
  room.game.state = startNewHand({
    cpuCount: room.game.cpuCount,
    includeHuman: false,
    dealerIndex: nextDealerIndex,
    chipTotals: currentState.chipTotals,
    feeTotal: currentState.feeTotal,
    handNumber: (currentState.handNumber ?? 0) + 1,
    computerStyles: room.game.computerStyles,
    playerStats: currentState.playerStats ?? {},
    playerConfigs: room.game.playerConfigs,
  });
  broadcastRoom(room);
  scheduleRoomAutomation(room);
}

function applyRoomAction(room, actionKey, actorPlayerId = null) {
  if (!room.game?.state || room.game.state.finished) {
    return false;
  }

  const actorIndex = actorPlayerId
    ? room.game.state.players.findIndex((player) => player.id === actorPlayerId)
    : room.game.state.currentPlayerIndex;
  const nextState = applyAction(room.game.state, actionKey, actorIndex);
  if (nextState === room.game.state) {
    return false;
  }

  room.game.state = nextState;
  room.game.computerStyles = nextState.computerStyles ?? room.game.computerStyles;
  broadcastRoom(room);
  scheduleRoomAutomation(room);
  return true;
}

function scheduleRoomAutomation(room) {
  if (room.automationTimer) {
    clearTimeout(room.automationTimer);
    room.automationTimer = null;
  }
  if (!room.game?.state || room.clients.size === 0) {
    return;
  }

  const state = room.game.state;
  if (state.finished) {
    if (room.game.autoNextHand && !state.gameOver) {
      room.automationTimer = setTimeout(() => startNextRoomHand(room), room.game.nextHandDelayMs);
    }
    return;
  }

  const actor = state.players[state.currentPlayerIndex];
  if (actor && !actor.isHuman) {
    room.automationTimer = setTimeout(() => {
      const action = chooseComputerAction(room.game.state);
      applyRoomAction(room, action);
    }, room.game.computerActionDelayMs);
  }
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
  if (!isRoomHost(room, socket)) {
    sendError(socket, "방장만 다음 핸드를 시작할 수 있습니다.");
    return;
  }
  if (!room.game.state.finished || room.game.state.gameOver) {
    sendError(socket, "다음 핸드를 시작할 수 있는 상태가 아닙니다.");
    return;
  }
  startNextRoomHand(room);
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

  room.settings = normalizeRoomSettings(room, { ...room.settings, ...(payload.settings ?? payload) });
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
  if (Object.hasOwn(payload, "showComputerStyles")) {
    room.game.showComputerStyles = Boolean(payload.showComputerStyles);
  }
  room.settings = normalizeRoomSettings(room, {
    ...room.settings,
    autoNextHand: room.game.autoNextHand,
    showComputerStyles: room.game.showComputerStyles,
    computerActionDelayMs: room.game.computerActionDelayMs,
    nextHandDelayMs: room.game.nextHandDelayMs,
  });
  broadcastRoom(room);
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
