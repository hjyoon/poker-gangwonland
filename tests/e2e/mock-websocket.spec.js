import { expect, test } from "./fixtures/coverage.js";
import { gotoRoot } from "./helpers/poker-app";

async function installMockWebSocket(page) {
  await page.addInitScript(() => {
    const sockets = [];
    const sentMessages = [];

    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor(url) {
        super();
        this.url = String(url);
        this.readyState = MockWebSocket.CONNECTING;
        sockets.push(this);
        window.__mockWsUrls = sockets.map((socket) => socket.url);
        window.setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
        }, 0);
      }

      send(payload) {
        try {
          sentMessages.push(JSON.parse(payload));
        } catch {
          sentMessages.push(payload);
        }
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.dispatchEvent(new CloseEvent("close"));
      }
    }

    window.__POKER_E2E_WEBSOCKET__ = MockWebSocket;
    window.__mockWsSent = sentMessages;
    window.__mockWsUrls = [];
    window.__mockWsEmit = (message, index = null) => {
      const socket = index === null ? [...sockets].reverse().find((entry) => entry.url.endsWith("/ws")) : sockets[index];
      if (!socket) {
        throw new Error("No mock WebSocket is connected");
      }
      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
    };
  });
}

async function emitWs(page, message) {
  await page.evaluate((payload) => window.__mockWsEmit(payload), message);
}

async function waitForAppSocket(page) {
  await page.waitForFunction(() => window.__mockWsUrls?.some((url) => url.endsWith("/ws")));
}

async function expectSentMessage(page, type) {
  await expect.poll(async () => page.evaluate((messageType) => window.__mockWsSent.some((message) => message?.type === messageType), type)).toBe(true);
}

function card(id) {
  const rank = id.slice(0, -1);
  const suit = id.slice(-1);
  const values = { J: 11, Q: 12, K: 13, A: 14 };
  return { id, rank, suit, value: values[rank] ?? Number(rank) };
}

function tablePlayer(id, overrides = {}) {
  return {
    id,
    name: overrides.name ?? id,
    isHuman: overrides.isHuman ?? true,
    cards: overrides.cards ?? [card("AS"), card("AH")],
    folded: overrides.folded ?? false,
    eliminated: overrides.eliminated ?? false,
    actionLocked: overrides.actionLocked ?? false,
    streetContribution: overrides.streetContribution ?? 0,
    totalContribution: overrides.totalContribution ?? 0,
    chipBalance: overrides.chipBalance ?? 100000,
    chipsWon: overrides.chipsWon ?? 0,
    lastAction: overrides.lastAction ?? "대기",
    computerStyle: overrides.computerStyle ?? null,
    computerLevel: overrides.computerLevel ?? null,
    missedBlindAmount: overrides.missedBlindAmount ?? 0,
    stateIndex: overrides.stateIndex,
    ...overrides,
  };
}

function roomSeat(id, overrides = {}) {
  return {
    id,
    label: overrides.label ?? id,
    playerId: overrides.playerId ?? null,
    name: overrides.name ?? null,
    connected: overrides.connected ?? false,
    away: overrides.away ?? false,
    pendingAway: overrides.pendingAway ?? false,
    pendingReturn: overrides.pendingReturn ?? false,
    pendingStandUp: overrides.pendingStandUp ?? false,
    pendingJoin: overrides.pendingJoin ?? false,
    pendingEndlessJoin: overrides.pendingEndlessJoin ?? false,
    missedBlindAmount: overrides.missedBlindAmount ?? 0,
    ...overrides,
  };
}

function baseSettings(overrides = {}) {
  return {
    humanStartingBalance: 100000,
    humanPlayers: Array.from({ length: 8 }, (_, index) => ({
      id: `human-slot-${index + 1}`,
      name: `빈 자리 ${index + 1}`,
      startingBalance: 100000,
    })),
    humanSeatPlacements: [0, 1, 2, 3, 4, 5, 6, 7],
    playerOrder: ["human-slot-1", "human-slot-2"],
    randomizePlayerOrder: false,
    randomizeHumanSeats: false,
    computerPlayers: [],
    autoNextHand: false,
    endlessMode: true,
    endlessReplacementComputerStyle: "balanced",
    endlessReplacementComputerLevel: "advanced",
    endlessReplacementStartingBalance: 120000,
    showComputerStyles: true,
    showCumulativeWins: true,
    computerActionDelayMs: 100,
    nextHandDelayMs: 500,
    humanActionTimeoutMs: 3000,
    ...overrides,
  };
}

function gameState(overrides = {}) {
  const host = tablePlayer("host", { name: "Host", isHuman: true, stateIndex: 0, streetContribution: 5000, totalContribution: 5000 });
  const guest = tablePlayer("guest", { name: "Guest", isHuman: true, stateIndex: 1, cards: [card("KS"), card("KH")] });
  return {
    deck: [],
    players: [host, guest],
    playerConfigs: [
      { id: "host", name: "Host", isHuman: true, startingBalance: 100000 },
      { id: "guest", name: "Guest", isHuman: true, startingBalance: 100000 },
    ],
    dealerIndex: 0,
    smallBlindIndex: 0,
    bigBlindIndex: 1,
    currentPlayerIndex: 0,
    pendingIndices: [0, 1],
    streetIndex: 0,
    communityCards: [],
    pot: 7000,
    currentBet: 5000,
    currentHandFee: 0,
    feeTotal: 0,
    handNumber: 1,
    handId: "mock-hand-1",
    winnerIds: [],
    finished: false,
    gameOver: false,
    waitingForHuman: true,
    showdownPending: false,
    revealOrder: [],
    muckIds: [],
    showdownResults: [],
    log: ["Mock hand started"],
    lastAggressorIndex: 1,
    chipTotals: {},
    playerStats: {},
    note: "Mock table note",
    tableSeats: [
      host,
      guest,
      tablePlayer("pending-join", { name: "Joiner", isPendingJoin: true, cards: [], stateIndex: -1, lastAction: "참가 예약" }),
      tablePlayer("pending-endless", { name: "Endless", isPendingEndlessJoin: true, cards: [], stateIndex: -1, lastAction: "엔들리스 대기" }),
      tablePlayer("pending-standup", { name: "Stand Up", isPendingStandUp: true, cards: [], stateIndex: -1, lastAction: "게임 퇴장 예약" }),
      tablePlayer("pending-return", { name: "Return", isAway: true, isPendingReturn: true, cards: [], stateIndex: -1, lastAction: "복귀 예약" }),
      tablePlayer("eliminated", { name: "Eliminated", eliminated: true, cards: [], stateIndex: -1, chipBalance: 0, lastAction: "탈락" }),
      {
        id: "empty-seat-8",
        name: "빈 자리",
        isEmptySeat: true,
        isJoinableHumanSeat: true,
        tableSeatIndex: 7,
        isHuman: false,
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
        missedBlindAmount: 0,
      },
    ],
    ...overrides,
  };
}

function room(overrides = {}) {
  return {
    id: "MOCK01",
    humanSlots: 8,
    hostPlayerId: "host",
    seats: [
      roomSeat("human-slot-1", { playerId: "host", name: "Host", connected: true, missedBlindAmount: 7000 }),
      roomSeat("human-slot-2", { playerId: "guest", name: "Guest", connected: true }),
      roomSeat("human-slot-3"),
      roomSeat("human-slot-4", { playerId: "joiner", name: "Joiner", connected: true, pendingJoin: true }),
      roomSeat("human-slot-5", { playerId: "endless-seat", name: "Endless Seat", connected: true, pendingEndlessJoin: true }),
      roomSeat("human-slot-6", { playerId: "stand-up", name: "Stand Up", connected: true, pendingStandUp: true }),
      roomSeat("human-slot-7", { playerId: "away", name: "Away", connected: true, away: true }),
      roomSeat("human-slot-8", { playerId: "disconnected-away", name: "Away Offline", connected: false, away: true }),
    ],
    waitingParticipants: [
      { playerId: "waiting-connected", name: "Waiting Connected", connected: true, pendingEndlessJoin: true, createdAt: 1 },
      { playerId: "waiting-offline", name: "Waiting Offline", connected: false, pendingEndlessJoin: true, createdAt: 2 },
    ],
    createdAt: Date.now(),
    settings: baseSettings(),
    showComputerStyles: true,
    showCumulativeWins: true,
    nextHandRequiredPlayerIds: [],
    nextHandReadyPlayerIds: [],
    nextHandDealerPlayerId: "host",
    canReserveStandUpFromGame: true,
    cardPeekPlayerIds: [],
    timer: null,
    gameState: null,
    ...overrides,
  };
}

test.describe("mocked multiplayer protocol rendering", () => {
  test("renders lobby room statuses and sends room commands", async ({ page }) => {
    await installMockWebSocket(page);
    await gotoRoot(page);
    await page.getByRole("radio", { name: "멀티플레이" }).click();
    await waitForAppSocket(page);

    await emitWs(page, { type: "joinedRoom", roomId: "MOCK01", playerId: "host" });
    await emitWs(page, { type: "roomState", room: room() });

    await expect(page.getByText("룸 코드: MOCK01")).toBeVisible();
    await expect(page.getByText("참가 예약")).toBeVisible();
    await expect(page.getByText("엔들리스 참가 대기").first()).toBeVisible();
    await expect(page.getByText("게임 퇴장 예약")).toBeVisible();
    await expect(page.getByText("자리 비움 · 연결 끊김")).toBeVisible();
    await expect(page.getByText("미스드 블라인드 ₩7,000")).toBeVisible();
    await expect(page.getByText("엔들리스 대기 · 연결 끊김")).toBeVisible();
    await expect(page.getByText("방장만 게임 설정을 변경할 수 있습니다.")).toBeVisible();

    await page.getByRole("button", { name: "룸 나가기" }).click();
    await expectSentMessage(page, "leaveRoom");
  });

  test("renders active mocked table states and sends participation commands", async ({ page }) => {
    await installMockWebSocket(page);
    await gotoRoot(page);
    await page.getByRole("radio", { name: "멀티플레이" }).click();
    await waitForAppSocket(page);

    await emitWs(page, { type: "joinedRoom", roomId: "MOCK01", playerId: "host" });
    await emitWs(page, { type: "roomState", room: room({ gameState: gameState() }) });

    await expect(page.getByText("먹(Pot)")).toBeVisible();
    await expect(page.locator(".seat").filter({ hasText: "참가 예약" })).toBeVisible();
    await expect(page.locator(".seat").filter({ hasText: "엔들리스 대기" })).toBeVisible();
    await expect(page.locator(".seat").filter({ hasText: "퇴장 예약" })).toBeVisible();
    await expect(page.locator(".seat").filter({ hasText: "복귀 예약" })).toBeVisible();
    await expect(page.locator(".seat").filter({ hasText: "탈락" })).toBeVisible();
    await expect(page.locator(".seat").filter({ hasText: "비어 있음" })).toBeVisible();
    await expect(page.getByText("현재 참가 중입니다. 자리 비움은 다음 핸드부터 적용됩니다.")).toBeVisible();

    await page.getByRole("button", { name: "다음 핸드부터 자리 비움" }).click();
    await expectSentMessage(page, "setSeatAway");
    await page.getByRole("button", { name: "게임에서 빠지기" }).click();
    await expectSentMessage(page, "standUpFromGame");

    await emitWs(page, {
      type: "roomState",
      room: room({
        seats: [
          roomSeat("human-slot-1", { playerId: "host", name: "Host", connected: true, pendingAway: true }),
          ...room().seats.slice(1),
        ],
        gameState: gameState(),
      }),
    });
    await expect(page.getByText("이번 핸드가 끝나면 자리 비움으로 전환됩니다.")).toBeVisible();

    await emitWs(page, {
      type: "roomState",
      room: room({
        seats: [
          roomSeat("human-slot-1", { playerId: "host", name: "Host", connected: true, away: true, pendingReturn: true }),
          ...room().seats.slice(1),
        ],
        gameState: gameState(),
      }),
    });
    await expect(page.getByText("이번 핸드가 끝나면 다시 참가합니다.")).toBeVisible();

    await emitWs(page, {
      type: "roomState",
      room: room({
        gameState: gameState({
          streetIndex: 3,
          communityCards: [card("QS"), card("JS"), card("10S"), card("9D"), card("8C")],
          currentBet: 0,
          pot: 50000,
          showdownPending: true,
          revealOrder: ["host", "guest"],
          waitingForHuman: true,
          currentPlayerIndex: 0,
        }),
      }),
    });
    await expect(page.getByText("내 쇼다운 공개 차례입니다.")).toBeVisible();
    await expect(page.getByRole("button", { name: "오픈" })).toBeVisible();
    await expect(page.getByRole("button", { name: "머크" })).toBeVisible();

    await emitWs(page, { type: "joinedRoom", roomId: "MOCK01", playerId: "spectator" });
    await emitWs(page, {
      type: "roomState",
      room: room({
        hostPlayerId: "host",
        seats: room().seats.map((seat) => (seat.playerId === "host" ? { ...seat, connected: true } : seat)),
        waitingParticipants: [],
        gameState: gameState(),
      }),
    });
    await expect(page.getByText("현재 게임에는 앉아 있지 않습니다. 다음 자리를 예약하면 컴퓨터 플레이어가 탈락한 좌석을 기다립니다.")).toBeVisible();
    await page.locator(".seat").filter({ hasText: "비어 있음" }).getByRole("button", { name: "다음 핸드부터 참여" }).click();
    await expectSentMessage(page, "joinGameSeat");
    await page.getByRole("button", { name: "다음 자리 예약" }).click();
    await expectSentMessage(page, "reserveEndlessSeat");
  });
});
