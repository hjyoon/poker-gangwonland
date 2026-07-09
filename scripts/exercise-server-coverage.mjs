import crypto from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";

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
      frames.push({ type: "pong" });
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

async function expectError(client, message) {
  client.send(message);
  const error = await client.waitFor((entry) => entry.type === "error");
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

  defaultsHost.close();

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

  await expectError(guest, { type: "updateRoomSettings", settings: { autoNextHand: true } });
  await expectError(guest, { type: "startGame" });

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
  late.send({ type: "reserveEndlessSeat", playerName: "Late" });
  await late.waitFor((message) => message.type === "roomState" && message.room?.waitingParticipants?.some((participant) => participant.pendingEndlessJoin));
  late.send({ type: "reserveEndlessSeat", cancel: true });
  await expectError(late, { type: "joinGameSeat", tableSeatIndex: -1, playerName: "Late" });

  const playersById = new Map([
    [joinedHost.playerId, host],
    [joinedGuest.playerId, guest],
  ]);
  const finishedState = await finishRoomHand(host, roomId, playersById);
  assert(finishedState.finished, "raw server exercise should finish an active room hand");
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

  probe.close();
  duplicate.close();
  late.close();
  guest.close();
  host.close();
  await delay(200);
} finally {
  clients.forEach((client) => client.close());
  await stopCoverageServer(server);
}

console.log("멀티플레이 서버 coverage exercise 통과");
