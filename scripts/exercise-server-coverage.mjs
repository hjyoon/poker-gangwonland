import crypto from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { recordMeaningfulCoverage } from "./e2e-meaningful-coverage.mjs";

const coverageDir = "coverage/e2e/raw/server-v8";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findOpenPort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  server.close();
  await once(server, "close");
  return port;
}

function parseServerFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    let length = second & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (offset + 4 > buffer.length) {
        break;
      }
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    }
    if (length === 127 || offset + headerLength + length > buffer.length) {
      break;
    }

    const payload = buffer.subarray(offset + headerLength, offset + headerLength + length);
    if (opcode === 0x1) {
      frames.push({ type: "text", payload: payload.toString("utf8") });
    } else if (opcode === 0x8) {
      frames.push({ type: "close" });
    } else if (opcode === 0x0a) {
      frames.push({ type: "pong", payload });
    }
    offset += headerLength + length;
  }

  return { frames, remaining: buffer.subarray(offset) };
}

function makeClientFrame(payload, opcode = 0x1) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const firstByte = 0x80 | opcode;
  const mask = crypto.randomBytes(4);
  const lengthBytes = body.length < 126 ? [0x80 | body.length] : [0x80 | 126, body.length >> 8, body.length & 0xff];
  const maskedBody = Buffer.from(body);
  for (let index = 0; index < maskedBody.length; index += 1) {
    maskedBody[index] ^= mask[index % 4];
  }
  return Buffer.concat([Buffer.from([firstByte, ...lengthBytes]), mask, maskedBody]);
}

class WsClient {
  constructor(port, label) {
    this.port = port;
    this.label = label;
    this.socket = null;
    this.connected = false;
    this.buffer = Buffer.alloc(0);
    this.messages = [];
    this.waiters = [];
  }

  async connect() {
    this.socket = net.createConnection({ host: "127.0.0.1", port: this.port });
    await once(this.socket, "connect");
    this.socket.on("data", (chunk) => this.handleData(chunk));
    this.socket.on("error", (error) => {
      throw new Error(`${this.label} socket error: ${error.message}`);
    });

    const key = crypto.randomBytes(16).toString("base64");
    this.socket.write(
      [
        "GET /ws HTTP/1.1",
        `Host: 127.0.0.1:${this.port}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n"),
    );

    await this.waitFor((message) => message.type === "connected");
    return this;
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.connected) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        return;
      }
      this.connected = true;
      this.buffer = this.buffer.subarray(headerEnd + 4);
    }

    const parsed = parseServerFrames(this.buffer);
    this.buffer = parsed.remaining;
    for (const frame of parsed.frames) {
      if (frame.type === "pong") {
        this.messages.push({ type: "pong", payload: frame.payload.toString("utf8") });
        this.resolveWaiters();
        continue;
      }
      if (frame.type !== "text") {
        continue;
      }
      const message = JSON.parse(frame.payload);
      this.messages.push(message);
      this.resolveWaiters();
    }
  }

  send(message) {
    this.socket.write(makeClientFrame(JSON.stringify(message)));
  }

  sendInvalidJson() {
    this.socket.write(makeClientFrame("{"));
  }

  ping() {
    this.socket.write(makeClientFrame("coverage-ping", 0x9));
  }

  sendRaw(buffer) {
    this.socket.write(buffer);
  }

  close() {
    this.socket?.write(makeClientFrame(Buffer.alloc(0), 0x8));
    this.socket?.end();
  }

  waitFor(predicate, timeoutMs = 8_000) {
    const existing = this.messages.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((entry) => entry !== waiter);
          const recentMessages = this.messages
            .slice(-5)
            .map((message) => `${message.type}${message.message ? `:${message.message}` : ""}${message.room?.id ? `:${message.room.id}` : ""}`)
            .join(", ");
          reject(new Error(`${this.label} timed out waiting for WebSocket message. Recent messages: ${recentMessages}`));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  resolveWaiters() {
    for (const waiter of [...this.waiters]) {
      const message = this.messages.find(waiter.predicate);
      if (!message) {
        continue;
      }
      clearTimeout(waiter.timer);
      this.waiters = this.waiters.filter((entry) => entry !== waiter);
      waiter.resolve(message);
    }
  }
}

async function startCoverageServer(port) {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      E2E_RANDOM_SEED: "playwright-e2e",
      NODE_V8_COVERAGE: coverageDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const deadline = Date.now() + 30_000;
  while (!output.includes(`Ready on http://127.0.0.1:${port}`)) {
    if (child.exitCode !== null) {
      throw new Error(`coverage server exited early:\n${output}`);
    }
    if (Date.now() > deadline) {
      child.kill("SIGTERM");
      throw new Error(`coverage server did not become ready:\n${output}`);
    }
    await delay(100);
  }

  return child;
}

async function stopCoverageServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 8_000);
  await once(child, "exit");
  clearTimeout(timeout);
}

async function waitForSocketToSettle(socket, timeoutMs = 500) {
  await new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      socket.off("close", finish);
      socket.off("end", finish);
      socket.off("error", finish);
      resolve();
    };
    const timeout = setTimeout(finish, timeoutMs);
    socket.once("close", finish);
    socket.once("end", finish);
    socket.once("error", finish);
  });
}

async function sendUpgradeWithoutKey(port) {
  const socket = net.createConnection({ host: "127.0.0.1", port });
  await once(socket, "connect");
  socket.write(
    [
      "GET /ws HTTP/1.1",
      `Host: 127.0.0.1:${port}`,
      "Upgrade: websocket",
      "Connection: Upgrade",
      "Sec-WebSocket-Version: 13",
      "",
      "",
    ].join("\r\n"),
  );
  await waitForSocketToSettle(socket);
  socket.destroy();
}

async function sendUpgradeWithBufferedHeadFrame(port) {
  const socket = net.createConnection({ host: "127.0.0.1", port });
  await once(socket, "connect");
  const key = crypto.randomBytes(16).toString("base64");
  const headers = [
    "GET /ws HTTP/1.1",
    `Host: 127.0.0.1:${port}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    "",
    "",
  ].join("\r\n");
  const largeUnknownMessage = JSON.stringify({ type: "unknownMessage", filler: "x".repeat(140) });
  socket.write(Buffer.concat([Buffer.from(headers), makeClientFrame(largeUnknownMessage)]));
  await waitForSocketToSettle(socket);
  socket.end();
}

async function sendMalformedFrameCases(port) {
  const partialExtended = await new WsClient(port, "partial-extended-frame").connect();
  partialExtended.sendRaw(Buffer.from([0x81, 0xfe, 0x00]));
  await delay(20);
  partialExtended.socket.destroy();

  const length127 = await new WsClient(port, "length-127-frame").connect();
  length127.sendRaw(Buffer.from([0x81, 0xff]));
  await delay(20);
  length127.socket.destroy();

  const incompleteMasked = await new WsClient(port, "incomplete-masked-frame").connect();
  incompleteMasked.sendRaw(Buffer.from([0x81, 0x85, 0, 1, 2, 3, 0x41, 0x42]));
  await delay(20);
  incompleteMasked.socket.destroy();

  const explicitClose = await new WsClient(port, "explicit-close-frame").connect();
  explicitClose.sendRaw(makeClientFrame(Buffer.alloc(0), 0x8));
  await waitForSocketToSettle(explicitClose.socket);
}

async function expectError(client, message, expectedMessage = null) {
  const seenMessages = client.messages.length;
  client.send(message);
  await client.waitFor(() =>
    client.messages.slice(seenMessages).some((entry) => entry.type === "error" && (!expectedMessage || entry.message === expectedMessage)),
  );
  const error = client.messages.slice(seenMessages).find((entry) => entry.type === "error" && (!expectedMessage || entry.message === expectedMessage));
  assert(typeof error.message === "string" && error.message.length > 0, "server should return an error message");
  return error;
}

async function waitForRoomState(client, roomId, count) {
  await client.waitFor(() => client.messages.filter((message) => message.type === "roomState" && message.room?.id === roomId).length >= count);
  return client.messages.filter((message) => message.type === "roomState" && message.room?.id === roomId).at(-1);
}

function roomStateMessages(client, roomId) {
  return client.messages.filter((message) => message.type === "roomState" && message.room?.id === roomId);
}

function latestRoom(client, roomId) {
  return roomStateMessages(client, roomId).at(-1)?.room ?? null;
}

async function waitForRoomUpdate(client, roomId, previousCount, predicate = () => true) {
  await client.waitFor(
    () => roomStateMessages(client, roomId).length > previousCount && Boolean(predicate(latestRoom(client, roomId))),
    10_000,
  );
  return latestRoom(client, roomId);
}

async function finishRoomHand(observer, roomId, playerClientsById, maxActions = 80) {
  let seenCount = roomStateMessages(observer, roomId).length;

  for (let actionCount = 0; actionCount < maxActions; actionCount += 1) {
    const room = latestRoom(observer, roomId) ?? (await waitForRoomUpdate(observer, roomId, seenCount, (entry) => entry?.gameState));
    seenCount = roomStateMessages(observer, roomId).length;
    const state = room?.gameState;
    if (!state) {
      await delay(100);
      continue;
    }
    if (state.finished) {
      return state;
    }

    const actor = state.players[state.currentPlayerIndex];
    const actorClient = playerClientsById.get(actor?.id);
    if (!actor || !actorClient) {
      await waitForRoomUpdate(observer, roomId, seenCount, (entry) => entry?.gameState);
      continue;
    }

    const toCall = Math.max(0, Number(state.currentBet) - Number(actor.streetContribution));
    const action = state.showdownPending ? "show" : toCall > 0 ? "call" : "check";
    actorClient.send({ type: "gameAction", action });
    await waitForRoomUpdate(observer, roomId, seenCount, (entry) => entry?.gameState);
  }

  throw new Error("room hand did not finish within action limit");
}

const port = await findOpenPort();
const server = await startCoverageServer(port);
const clients = [];

try {
  const probe = await new WsClient(port, "probe").connect();
  clients.push(probe);
  probe.sendInvalidJson();
  await probe.waitFor((message) => message.type === "error" && message.message === "메시지를 처리할 수 없습니다.");
  probe.ping();
  await probe.waitFor((message) => message.type === "pong" && message.payload === "coverage-ping");
  await expectError(probe, { type: "unknownMessage" });
  await expectError(probe, { type: "updatePlayerName", playerName: "No room" });
  await expectError(probe, { type: "startGame" });
  await expectError(probe, { type: "gameAction", action: "fold" });
  await expectError(probe, { type: "requestNextHand" });
  await expectError(probe, { type: "setSeatAway", away: true });
  await expectError(probe, { type: "standUpFromGame" });
  await expectError(probe, { type: "reserveEndlessSeat" });
  await expectError(probe, { type: "joinGameSeat", tableSeatIndex: 0 });
  await expectError(probe, { type: "updateRoomSettings", settings: {} });
  await expectError(probe, { type: "updateGameOptions", autoNextHand: true });
  await sendUpgradeWithoutKey(port);
  await sendUpgradeWithBufferedHeadFrame(port);
  await sendMalformedFrameCases(port);

  const defaultsHost = await new WsClient(port, "defaults-host").connect();
  clients.push(defaultsHost);
  defaultsHost.send({ type: "createRoom", playerName: "   ", humanSlots: 3 });
  const defaultsJoined = await defaultsHost.waitFor((message) => message.type === "joinedRoom");
  const defaultsRoomId = defaultsJoined.roomId;
  assert(defaultsRoomId, "default room should be created");
  const defaultRoomState = await waitForRoomState(defaultsHost, defaultsRoomId, 1);
  assert(defaultRoomState.room.settings.computerPlayers.length === 3, "default room should create default computer settings");
  assert(defaultRoomState.room.settings.humanPlayers.length === 3, "default room should create default human settings");
  assert(defaultRoomState.room.seats[0].name === "방장", "blank host name should use the host fallback");

  defaultsHost.send({
    type: "updateRoomSettings",
    settings: {
      humanPlayers: [
        { name: "Alpha", startingBalance: -50 },
        { name: "Beta", startingBalance: 25000 },
        { name: "", startingBalance: "bad" },
      ],
      humanSeatPlacements: [0, 0, 99],
      computerPlayers: [
        { name: "", startingBalance: -100, computerStyle: "bad-style", computerLevel: "bad-level" },
        { name: "Computer B", startingBalance: 30000, computerStyle: "aggressive", computerLevel: "advanced" },
      ],
      playerOrder: ["cpu-2", "cpu-2", "missing", "human-slot-3", "human-slot-1"],
      randomizePlayerOrder: true,
      computerActionDelayMs: 1,
      nextHandDelayMs: 999999,
      humanActionTimeoutMs: "bad",
    },
  });
  const normalizedDefaults = await waitForRoomState(defaultsHost, defaultsRoomId, 2);
  assert(normalizedDefaults.room.settings.randomizePlayerOrder === true, "randomized player order should be stored");
  assert(normalizedDefaults.room.settings.computerPlayers.length === 2, "custom computer settings should replace defaults");
  assert(normalizedDefaults.room.settings.humanPlayers[0].startingBalance === 0, "negative human balance should clamp to zero");
  assert(normalizedDefaults.room.settings.computerPlayers[0].computerStyle === "random", "invalid computer style should fall back");
  assert(normalizedDefaults.room.settings.computerPlayers[0].computerLevel === "random", "invalid computer level should fall back");

  defaultsHost.send({
    type: "updateRoomSettings",
    settings: {
      humanPlayers: [
        { name: "Alpha", startingBalance: 25000 },
        { name: "Beta", startingBalance: 25000 },
      ],
      removedHumanSlotIds: ["human-slot-3"],
      computerPlayers: [],
    },
  });
  await defaultsHost.waitFor((message) => message.type === "roomState" && message.room?.humanSlots === 2);
  defaultsHost.send({
    type: "updateRoomSettings",
    settings: {
      humanPlayers: [
        { name: "Alpha", startingBalance: 25000 },
        { name: "Beta", startingBalance: 25000 },
        { name: "Gamma", startingBalance: 25000 },
        { name: "Delta", startingBalance: 25000 },
      ],
      computerPlayers: [],
    },
  });
  await defaultsHost.waitFor((message) => message.type === "roomState" && message.room?.humanSlots === 4 && message.room?.seats?.length === 4);

  defaultsHost.close();

  const tooFewHost = await new WsClient(port, "too-few-host").connect();
  clients.push(tooFewHost);
  tooFewHost.send({
    type: "createRoom",
    playerName: "Solo",
    humanSlots: 1,
    settings: {
      humanPlayers: [{ name: "Solo", startingBalance: 100000 }],
      computerPlayers: [],
    },
  });
  await tooFewHost.waitFor((message) => message.type === "joinedRoom");
  await expectError(tooFewHost, { type: "startGame" }, "게임 시작에는 연결된 인간 또는 컴퓨터가 2명 이상 필요합니다.");
  tooFewHost.close();

  const fullRoomHost = await new WsClient(port, "full-room-host").connect();
  const fullRoomGuest = await new WsClient(port, "full-room-guest").connect();
  clients.push(fullRoomHost, fullRoomGuest);
  fullRoomHost.send({
    type: "createRoom",
    playerName: "Only Host",
    humanSlots: 1,
    settings: {
      humanPlayers: [{ name: "Only Host", startingBalance: 100000 }],
      computerPlayers: [],
    },
  });
  const fullRoomJoined = await fullRoomHost.waitFor((message) => message.type === "joinedRoom");
  fullRoomGuest.send({ type: "joinRoom", roomId: fullRoomJoined.roomId, playerName: "No Seat" });
  await fullRoomGuest.waitFor((message) => message.type === "error" && message.message === "빈 자리가 없습니다.");
  fullRoomGuest.close();
  fullRoomHost.close();

  const leaveHost = await new WsClient(port, "leave-host").connect();
  clients.push(leaveHost);
  leaveHost.send({
    type: "createRoom",
    playerName: "Leaving Host",
    humanSlots: 1,
    settings: {
      humanPlayers: [{ name: "Leaving Host", startingBalance: 100000 }],
      computerPlayers: [{ name: "Leave Computer", startingBalance: 100000 }],
    },
  });
  const leaveJoined = await leaveHost.waitFor((message) => message.type === "joinedRoom");
  leaveHost.send({ type: "leaveRoom" });
  await leaveHost.waitFor((message) => message.type === "leftRoom");
  await delay(50);
  const cleanupJoiner = await new WsClient(port, "cleanup-joiner").connect();
  clients.push(cleanupJoiner);
  cleanupJoiner.send({ type: "joinRoom", roomId: leaveJoined.roomId, playerName: "Cleanup Joiner" });
  await cleanupJoiner.waitFor((message) => message.type === "joinedRoom");
  cleanupJoiner.close();
  leaveHost.close();

  const replacementHost = await new WsClient(port, "replacement-host").connect();
  const replacementGuest = await new WsClient(port, "replacement-guest").connect();
  const replacementLate = await new WsClient(port, "replacement-late").connect();
  clients.push(replacementHost, replacementGuest, replacementLate);
  replacementHost.send({
    type: "createRoom",
    playerName: "Replacement Host",
    humanSlots: 2,
    settings: {
      humanPlayers: [
        { name: "Replacement Host", startingBalance: 100000 },
        { name: "Replacement Guest", startingBalance: 100000 },
      ],
      computerPlayers: [{ name: "Short Computer", startingBalance: 1, computerStyle: "balanced", computerLevel: "intermediate" }],
      endlessMode: true,
      endlessReplacementStartingBalance: 50000,
      computerActionDelayMs: 100,
      nextHandDelayMs: 500,
      humanActionTimeoutMs: 3000,
    },
  });
  const replacementHostJoined = await replacementHost.waitFor((message) => message.type === "joinedRoom");
  const replacementRoomId = replacementHostJoined.roomId;
  replacementGuest.send({ type: "joinRoom", roomId: replacementRoomId, playerName: "Replacement Guest" });
  const replacementGuestJoined = await replacementGuest.waitFor((message) => message.type === "joinedRoom");
  replacementHost.send({ type: "startGame" });
  await replacementHost.waitFor((message) => message.type === "roomState" && message.room?.gameState);
  replacementLate.send({ type: "joinRoom", roomId: replacementRoomId, playerName: "Replacement Late" });
  const replacementLateJoined = await replacementLate.waitFor((message) => message.type === "joinedRoom");
  await replacementLate.waitFor((message) => message.type === "roomState" && message.room?.waitingParticipants?.some((participant) => participant.playerId === replacementLateJoined.playerId));
  const replacementComputerSeatIndex = latestRoom(replacementHost, replacementRoomId).gameState.tableSeats.findIndex((seat) => !seat.isHuman && !seat.isEmptySeat);
  await expectError(
    replacementLate,
    { type: "joinGameSeat", tableSeatIndex: replacementComputerSeatIndex, playerName: "Replacement Late" },
    "참여할 수 있는 인간 플레이어 빈 자리가 아닙니다.",
  );
  const replacementPlayersById = new Map([
    [replacementHostJoined.playerId, replacementHost],
    [replacementGuestJoined.playerId, replacementGuest],
  ]);
  const replacementFinished = await finishRoomHand(replacementHost, replacementRoomId, replacementPlayersById, 120);
  assert(
    replacementFinished.players.some((player) => !player.isHuman && player.eliminated),
    `replacement exercise should eliminate the short computer: ${JSON.stringify(
      replacementFinished.players.map((player) => ({
        id: player.id,
        isHuman: player.isHuman,
        chipBalance: player.chipBalance,
        chipsWon: player.chipsWon,
        eliminated: player.eliminated,
        lastAction: player.lastAction,
      })),
    )}`,
  );
  const replacementFinishedRoom = latestRoom(replacementHost, replacementRoomId);
  for (const playerId of replacementFinishedRoom?.nextHandRequiredPlayerIds ?? []) {
    replacementPlayersById.get(playerId)?.send({ type: "requestNextHand" });
  }
  await replacementHost.waitFor(
    (message) =>
      message.type === "roomState" &&
      message.room?.id === replacementRoomId &&
      message.room?.gameState?.handNumber === 2 &&
      message.room.gameState.players.some((player) => player.id === replacementLateJoined.playerId && player.isHuman),
    12_000,
  );
  replacementLate.close();
  replacementGuest.close();
  replacementHost.close();

  const seatHost = await new WsClient(port, "seat-host").connect();
  const seatGuest = await new WsClient(port, "seat-guest").connect();
  const seatLate = await new WsClient(port, "seat-late").connect();
  const seatOther = await new WsClient(port, "seat-other").connect();
  clients.push(seatHost, seatGuest, seatLate, seatOther);
  seatHost.send({
    type: "createRoom",
    playerName: "Seat Host",
    humanSlots: 4,
    settings: {
      humanPlayers: [
        { name: "Seat Host", startingBalance: 100000 },
        { name: "Seat Guest", startingBalance: 100000 },
        { name: "Seat Three", startingBalance: 100000 },
        { name: "Seat Four", startingBalance: 100000 },
      ],
      computerPlayers: [],
      playerOrder: ["human-slot-1", "human-slot-2", "human-slot-3", "human-slot-4"],
      endlessMode: true,
      humanActionTimeoutMs: 3000,
    },
  });
  const seatHostJoined = await seatHost.waitFor((message) => message.type === "joinedRoom");
  const seatRoomId = seatHostJoined.roomId;
  seatGuest.send({ type: "joinRoom", roomId: seatRoomId, playerName: "Seat Guest" });
  const seatGuestJoined = await seatGuest.waitFor((message) => message.type === "joinedRoom");
  seatHost.send({ type: "startGame" });
  await seatHost.waitFor((message) => message.type === "roomState" && message.room?.gameState);
  const seatRoom = latestRoom(seatHost, seatRoomId);
  const seatFourIndex = seatRoom.gameState.tableSeats.findIndex((seat) => seat.setupPlayerId === "human-slot-4");
  assert(seatFourIndex >= 0, "seat exercise should expose the fourth human setup seat");
  await expectError(seatGuest, { type: "joinGameSeat", tableSeatIndex: seatFourIndex, playerName: "Seat Guest" }, "이미 현재 게임에 참여 중입니다.");
  seatLate.send({ type: "joinRoom", roomId: seatRoomId, playerName: "Seat Late" });
  const seatLateJoined = await seatLate.waitFor((message) => message.type === "joinedRoom");
  seatLate.send({ type: "reserveEndlessSeat", playerName: "Seat Late Endless" });
  await seatLate.waitFor(
    (message) =>
      message.type === "roomState" &&
      message.room?.seats?.some((seat) => seat.playerId === seatLateJoined.playerId && seat.pendingEndlessJoin),
  );
  seatLate.send({ type: "reserveEndlessSeat", cancel: true });
  await seatLate.waitFor(
    (message) =>
      message.type === "roomState" &&
      message.room?.seats?.some((seat) => seat.playerId === seatLateJoined.playerId && !seat.pendingEndlessJoin),
  );
  seatLate.send({ type: "joinGameSeat", tableSeatIndex: seatFourIndex, playerName: "Moved Late" });
  await seatLate.waitFor(
    (message) =>
      message.type === "roomState" &&
      message.room?.seats?.some((seat) => seat.name === "Moved Late" && seat.pendingJoin) &&
      message.room?.gameState?.tableSeats?.[seatFourIndex]?.name === "Moved Late",
  );
  await expectError(seatLate, { type: "joinGameSeat", tableSeatIndex: seatFourIndex, playerName: "Moved Late" }, "이미 다음 핸드 참가가 예약되어 있습니다.");
  seatOther.send({ type: "joinRoom", roomId: seatRoomId, playerName: "Seat Other" });
  await seatOther.waitFor((message) => message.type === "joinedRoom");
  await expectError(seatOther, { type: "joinGameSeat", tableSeatIndex: seatFourIndex, playerName: "Seat Other" }, "이미 다른 참가자가 예약한 자리입니다.");
  seatOther.close();
  const seatPlayersById = new Map([
    [seatHostJoined.playerId, seatHost],
    [seatGuestJoined.playerId, seatGuest],
  ]);
  const seatFinished = await finishRoomHand(seatHost, seatRoomId, seatPlayersById, 80);
  assert(seatFinished.finished, "seat reservation exercise should finish the active hand");
  const seatFinishedRoom = latestRoom(seatHost, seatRoomId);
  for (const playerId of seatFinishedRoom?.nextHandRequiredPlayerIds ?? []) {
    seatPlayersById.get(playerId)?.send({ type: "requestNextHand" });
  }
  await seatHost.waitFor(
    (message) =>
      message.type === "roomState" &&
      message.room?.id === seatRoomId &&
      message.room?.gameState?.handNumber === 2 &&
      message.room.gameState.players.some((player) => player.id === seatLateJoined.playerId),
    12_000,
  );
  seatLate.close();
  seatGuest.close();
  seatHost.close();

  const blindHost = await new WsClient(port, "blind-host").connect();
  const blindGuest = await new WsClient(port, "blind-guest").connect();
  const blindThird = await new WsClient(port, "blind-third").connect();
  const blindFourth = await new WsClient(port, "blind-fourth").connect();
  clients.push(blindHost, blindGuest, blindThird, blindFourth);
  blindHost.send({
    type: "createRoom",
    playerName: "Blind Host",
    humanSlots: 4,
    settings: {
      humanPlayers: [
        { name: "Blind Host", startingBalance: 100000 },
        { name: "Blind Guest", startingBalance: 100000 },
        { name: "Blind Third", startingBalance: 100000 },
        { name: "Blind Fourth", startingBalance: 100000 },
      ],
      computerPlayers: [],
      playerOrder: ["human-slot-1", "human-slot-2", "human-slot-3", "human-slot-4"],
      randomizePlayerOrder: false,
      computerActionDelayMs: 100,
      nextHandDelayMs: 500,
      humanActionTimeoutMs: 3000,
    },
  });
  const blindHostJoined = await blindHost.waitFor((message) => message.type === "joinedRoom");
  const blindRoomId = blindHostJoined.roomId;
  blindGuest.send({ type: "joinRoom", roomId: blindRoomId, playerName: "Blind Guest" });
  const blindGuestJoined = await blindGuest.waitFor((message) => message.type === "joinedRoom");
  blindThird.send({ type: "joinRoom", roomId: blindRoomId, playerName: "Blind Third" });
  const blindThirdJoined = await blindThird.waitFor((message) => message.type === "joinedRoom");
  blindFourth.send({ type: "joinRoom", roomId: blindRoomId, playerName: "Blind Fourth" });
  const blindFourthJoined = await blindFourth.waitFor((message) => message.type === "joinedRoom");
  blindHost.send({ type: "startGame" });
  await blindHost.waitFor((message) => message.type === "roomState" && message.room?.gameState?.handNumber === 1);
  blindThird.send({ type: "setSeatAway", away: true });
  blindFourth.send({ type: "setSeatAway", away: true });
  await blindHost.waitFor(
    (message) =>
      message.type === "roomState" &&
      message.room?.seats?.some((seat) => seat.playerId === blindThirdJoined.playerId && seat.pendingAway) &&
      message.room?.seats?.some((seat) => seat.playerId === blindFourthJoined.playerId && seat.pendingAway),
  );

  const blindPlayersById = new Map([
    [blindHostJoined.playerId, blindHost],
    [blindGuestJoined.playerId, blindGuest],
    [blindThirdJoined.playerId, blindThird],
    [blindFourthJoined.playerId, blindFourth],
  ]);
  const blindFirstFinished = await finishRoomHand(blindHost, blindRoomId, blindPlayersById, 100);
  assert(blindFirstFinished.finished, "missed blind exercise should finish first hand");
  const blindFirstFinishedRoom = latestRoom(blindHost, blindRoomId);
  for (const playerId of blindFirstFinishedRoom?.nextHandRequiredPlayerIds ?? []) {
    blindPlayersById.get(playerId)?.send({ type: "requestNextHand" });
  }
  await blindHost.waitFor(
    (message) =>
      message.type === "roomState" &&
      message.room?.id === blindRoomId &&
      message.room?.gameState?.handNumber === 2 &&
      message.room.seats.some((seat) => seat.playerId === blindThirdJoined.playerId && seat.away && seat.missedBlindAmount > 0) &&
      message.room.seats.some((seat) => seat.playerId === blindFourthJoined.playerId && seat.away && seat.missedBlindAmount > 0),
    12_000,
  );

  blindThird.send({ type: "setSeatAway", away: false });
  blindFourth.send({ type: "setSeatAway", away: false });
  await blindHost.waitFor(
    (message) =>
      message.type === "roomState" &&
      message.room?.seats?.some((seat) => seat.playerId === blindThirdJoined.playerId && seat.pendingReturn) &&
      message.room?.seats?.some((seat) => seat.playerId === blindFourthJoined.playerId && seat.pendingReturn),
  );
  const blindSecondFinished = await finishRoomHand(blindGuest, blindRoomId, blindPlayersById, 100);
  assert(blindSecondFinished.finished, "missed blind exercise should finish second hand");
  const blindSecondFinishedRoom = latestRoom(blindHost, blindRoomId);
  for (const playerId of blindSecondFinishedRoom?.nextHandRequiredPlayerIds ?? []) {
    blindPlayersById.get(playerId)?.send({ type: "requestNextHand" });
  }
  await blindHost.waitFor(
    (message) =>
      message.type === "roomState" &&
      message.room?.id === blindRoomId &&
      message.room?.gameState?.handNumber === 3 &&
      message.room.gameState.log.some((entry) => entry.includes("미스드 블라인드")),
    12_000,
  );
  blindFourth.close();
  blindThird.close();
  blindGuest.close();
  blindHost.close();

  const host = await new WsClient(port, "host").connect();
  const guest = await new WsClient(port, "guest").connect();
  const late = await new WsClient(port, "late").connect();
  clients.push(host, guest, late);

  guest.send({ type: "joinRoom", roomId: "BAD999", playerName: "Guest" });
  await guest.waitFor((message) => message.type === "error" && message.message === "룸을 찾을 수 없습니다.");

  host.send({
    type: "createRoom",
    playerName: "Host",
    humanSlots: 2,
    settings: {
      humanPlayers: [
        { name: "Host", startingBalance: 100000 },
        { name: "Guest", startingBalance: 100000 },
      ],
      computerPlayers: [{ name: "Computer", startingBalance: 100000, computerStyle: "balanced", computerLevel: "intermediate" }],
      computerActionDelayMs: 100,
      nextHandDelayMs: 500,
      humanActionTimeoutMs: 3000,
      showComputerStyles: true,
      showCumulativeWins: true,
    },
  });
  const joinedHost = await host.waitFor((message) => message.type === "joinedRoom");
  const roomId = joinedHost.roomId;
  assert(roomId, "host should create a room");

  guest.send({ type: "joinRoom", roomId, playerName: "Guest" });
  const joinedGuest = await guest.waitFor((message) => message.type === "joinedRoom");
  assert(joinedGuest.playerId, "guest should join the room");

  const duplicate = await new WsClient(port, "duplicate").connect();
  clients.push(duplicate);
  duplicate.send({ type: "joinRoom", roomId, playerName: "Guest again", playerId: joinedGuest.playerId });
  await duplicate.waitFor((message) => message.type === "error" && message.message === "이미 연결된 참가자입니다.");
  await expectError(
    duplicate,
    { type: "rejoinRoom", roomId, playerName: "Guest again", playerId: joinedGuest.playerId },
    "이미 연결된 참가자입니다.",
  );

  await expectError(guest, { type: "updateRoomSettings", settings: { autoNextHand: true } });
  await expectError(guest, { type: "startGame" });
  await expectError(
    host,
    { type: "updateRoomSettings", settings: { humanPlayers: [{ name: "Host", startingBalance: 100000 }] } },
    "참가자가 있는 인간 플레이어는 컴퓨터로 변경하거나 삭제할 수 없습니다.",
  );

  host.send({
    type: "updateRoomSettings",
    settings: {
      randomizePlayerOrder: true,
      humanPlayers: [
        { name: "Host", startingBalance: 100000 },
        { name: "Guest", startingBalance: 100000 },
      ],
      computerPlayers: [],
    },
  });
  await host.waitFor((message) => message.type === "roomState" && message.room?.settings?.randomizePlayerOrder === true);

  host.send({ type: "startGame" });
  await host.waitFor((message) => message.type === "roomState" && message.room?.gameState);
  await guest.waitFor((message) => message.type === "roomState" && message.room?.gameState);

  {
    const initialRoom = latestRoom(host, roomId);
    const initialActor = initialRoom?.gameState?.players?.[initialRoom.gameState.currentPlayerIndex];
    const initialActorClient = new Map([
      [joinedHost.playerId, host],
      [joinedGuest.playerId, guest],
    ]).get(initialActor?.id);
    if (initialActor?.isHuman && initialActorClient) {
      await expectError(initialActorClient, { type: "gameAction", action: "not-real" }, "해당 행동을 적용할 수 없습니다.");
    }
  }

  host.send({ type: "updatePlayerName", playerName: "Renamed Host" });
  await host.waitFor((message) => message.type === "roomState" && message.room?.gameState?.players?.some((player) => player.id === joinedHost.playerId && player.name === "Renamed Host"));
  await expectError(host, { type: "updateRoomSettings", settings: { autoNextHand: false } });
  await expectError(guest, { type: "updateGameOptions", autoNextHand: true });
  host.send({
    type: "updateGameOptions",
    autoNextHand: true,
    endlessMode: true,
    endlessReplacementComputerStyle: "chaotic",
    endlessReplacementComputerLevel: "advanced",
    endlessReplacementStartingBalance: 120000,
    computerActionDelayMs: 100,
    nextHandDelayMs: 500,
    humanActionTimeoutMs: 3000,
    showComputerStyles: false,
    showCumulativeWins: false,
  });
  await host.waitFor((message) => message.type === "roomState" && message.room?.settings?.endlessMode === true);

  host.send({ type: "cardPeekState", peeking: true });
  await host.waitFor((message) => message.type === "roomState" && message.room?.cardPeekPlayerIds?.includes(joinedHost.playerId));
  host.send({ type: "cardPeekState", peeking: false });

  await expectError(guest, { type: "gameAction", action: "not-real" });
  await expectError(host, { type: "requestNextHand" });
  host.send({ type: "setSeatAway", away: true });
  await host.waitFor((message) => message.type === "roomState" && message.room?.seats?.some((seat) => seat.pendingAway));
  host.send({ type: "setSeatAway", away: false });
  host.send({ type: "standUpFromGame", cancel: true });
  await host.waitFor((message) => message.type === "error" && message.message === "취소할 게임 퇴장 예약이 없습니다.");
  host.send({ type: "standUpFromGame" });
  await host.waitFor((message) => message.type === "roomState" && message.room?.seats?.some((seat) => seat.pendingStandUp));
  host.send({ type: "standUpFromGame", cancel: true });

  late.send({ type: "joinRoom", roomId, playerName: "Late" });
  const joinedLate = await late.waitFor((message) => message.type === "joinedRoom");
  assert(joinedLate.playerId, "late endless participant should get a player id");
  await late.waitFor((message) => message.type === "roomState" && message.room?.waitingParticipants?.some((participant) => participant.playerId === joinedLate.playerId));
  late.close();

  const lateReconnect = await new WsClient(port, "late-reconnect").connect();
  clients.push(lateReconnect);
  lateReconnect.send({ type: "joinRoom", roomId, playerName: "Late Again", playerId: joinedLate.playerId });
  await lateReconnect.waitFor((message) => message.type === "joinedRoom" && message.playerId === joinedLate.playerId);
  await lateReconnect.waitFor(
    (message) =>
      message.type === "roomState" &&
      message.room?.waitingParticipants?.some((participant) => participant.playerId === joinedLate.playerId && participant.connected),
  );
  lateReconnect.send({ type: "updatePlayerName", playerName: "Late Renamed" });
  await lateReconnect.waitFor((message) => message.type === "roomState" && message.room?.waitingParticipants?.some((participant) => participant.name === "Late Renamed"));
  await expectError(lateReconnect, { type: "setSeatAway", away: true }, "참가자 자리를 찾을 수 없습니다.");
  await expectError(lateReconnect, { type: "standUpFromGame" }, "현재 게임 좌석에 앉아 있지 않습니다.");
  const lateLeave = await new WsClient(port, "late-leave").connect();
  clients.push(lateLeave);
  lateLeave.send({ type: "joinRoom", roomId, playerName: "Late Leave" });
  const joinedLateLeave = await lateLeave.waitFor((message) => message.type === "joinedRoom");
  assert(joinedLateLeave.playerId, "late leave participant should get a waiting id");
  lateLeave.send({ type: "leaveRoom" });
  await lateLeave.waitFor((message) => message.type === "leftRoom");
  lateLeave.close();
  lateReconnect.send({ type: "reserveEndlessSeat", playerName: "Late" });
  await lateReconnect.waitFor((message) => message.type === "roomState" && message.room?.waitingParticipants?.some((participant) => participant.pendingEndlessJoin));
  lateReconnect.send({ type: "reserveEndlessSeat", cancel: true });
  await expectError(lateReconnect, { type: "joinGameSeat", tableSeatIndex: -1, playerName: "Late" });

  const playersById = new Map([
    [joinedHost.playerId, host],
    [joinedGuest.playerId, guest],
  ]);
  const finishedState = await finishRoomHand(host, roomId, playersById);
  assert(finishedState.finished, "raw server exercise should finish an active room hand");
  await expectError(lateReconnect, { type: "requestNextHand" }, "다음 핸드 진행 확인 대상이 아닙니다.");
  host.send({ type: "setSeatAway", away: true });
  await host.waitFor((message) => message.type === "roomState" && message.room?.seats?.some((seat) => seat.playerId === joinedHost.playerId && seat.away));
  host.send({ type: "setSeatAway", away: false });
  await host.waitFor((message) => message.type === "roomState" && message.room?.seats?.some((seat) => seat.playerId === joinedHost.playerId && !seat.away));
  guest.send({ type: "standUpFromGame" });
  await guest.waitFor((message) => message.type === "roomState" && message.room?.seats?.some((seat) => seat.playerId === joinedGuest.playerId && seat.pendingStandUp));
  guest.send({ type: "standUpFromGame", cancel: true });
  await guest.waitFor((message) => message.type === "roomState" && message.room?.seats?.some((seat) => seat.playerId === joinedGuest.playerId && !seat.pendingStandUp));
  const nextHandRoom = latestRoom(host, roomId);
  for (const playerId of nextHandRoom?.nextHandRequiredPlayerIds ?? []) {
    playersById.get(playerId)?.send({ type: "requestNextHand" });
  }
  await host.waitFor(
    (message) =>
      message.type === "roomState" &&
      message.room?.id === roomId &&
      (message.room.gameState?.handNumber === 2 || message.room.gameState?.gameOver),
    12_000,
  );

  await recordMeaningfulCoverage("server.websocket-handshake-protocol", { script: "exercise-server-coverage.mjs" });
  await recordMeaningfulCoverage("server.room-lifecycle-settings", { script: "exercise-server-coverage.mjs" });
  await recordMeaningfulCoverage("server.seat-reservations-missed-blinds", { script: "exercise-server-coverage.mjs" });
  await recordMeaningfulCoverage("server.game-actions-next-hand", { script: "exercise-server-coverage.mjs" });

  probe.close();
  duplicate.close();
  lateReconnect.close();
  guest.close();
  host.close();
  await delay(200);
} finally {
  clients.forEach((client) => client.close());
  await stopCoverageServer(server);
}

console.log("멀티플레이 서버 coverage exercise 통과");
