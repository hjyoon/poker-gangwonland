import { applyAction, createDeck } from "../lib/poker.js";

const deck = createDeck();
const cardById = new Map(deck.map((card) => [card.id, card]));
const card = (rank, suit) => cardById.get(`${rank}${suit}`);

function player({ id, name, cards, totalContribution, folded = false, chipBalance = 0 }) {
  return {
    id,
    name,
    isHuman: true,
    cards: folded ? [] : cards,
    folded,
    eliminated: false,
    actionLocked: chipBalance === 0,
    streetContribution: 0,
    totalContribution,
    chipBalance,
    chipsWon: 0,
    lastAction: folded ? "폴드" : "대기",
  };
}

function showdownState({ players, pot, revealOrder, handId }) {
  return {
    deck: [],
    players,
    dealerIndex: 0,
    smallBlindIndex: 0,
    bigBlindIndex: 1,
    currentPlayerIndex: players.findIndex((entry) => revealOrder[0] === entry.id),
    pendingIndices: revealOrder.map((id) => players.findIndex((entry) => entry.id === id)).filter((index) => index >= 0),
    streetIndex: 3,
    communityCards: [card("9", "S"), card("4", "S"), card("2", "D"), card("3", "H"), card("6", "H")],
    pot,
    currentBet: 0,
    currentHandFee: 0,
    feeTotal: 0,
    handNumber: 1,
    handId,
    winnerIds: [],
    finished: false,
    gameOver: false,
    waitingForHuman: true,
    showdownPending: true,
    revealOrder,
    muckIds: [],
    showdownResults: [],
    log: ["쇼다운 공개를 시작합니다."],
    lastAggressorIndex: 1,
    chipTotals: {},
    playerStats: {},
  };
}

function runShowdown(state) {
  return state.revealOrder.reduce((nextState, playerId) => {
    const playerIndex = nextState.players.findIndex((entry) => entry.id === playerId);
    return applyAction(nextState, "show", playerIndex);
  }, state);
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const uncalledReturnState = runShowdown(
  showdownState({
    handId: "uncalled-return",
    pot: 250,
    revealOrder: ["ghost", "idepix"],
    players: [
      player({
        id: "ghost",
        name: "GHOST",
        cards: [card("9", "C"), card("A", "D")],
        totalContribution: 100,
      }),
      player({
        id: "idepix",
        name: "IDEPIX",
        cards: [card("4", "C"), card("K", "D")],
        totalContribution: 150,
      }),
    ],
  }),
);

expect(JSON.stringify(uncalledReturnState.winnerIds) === JSON.stringify(["ghost"]), "미콜 반환 플레이어가 승자에 포함되면 안 됩니다.");
expect(uncalledReturnState.currentHandFee === 10, "미콜 반환 금액에는 수수료가 붙으면 안 됩니다.");
expect(uncalledReturnState.players.find((entry) => entry.id === "ghost").chipBalance === 190, "승자는 경쟁 팟 순수령액만 받아야 합니다.");
expect(uncalledReturnState.players.find((entry) => entry.id === "idepix").chipBalance === 50, "미콜 초과 금액은 원 플레이어에게 반환되어야 합니다.");
expect(uncalledReturnState.players.find((entry) => entry.id === "idepix").chipsWon === 0, "미콜 반환은 누적 승리에 포함되면 안 됩니다.");

const foldedSidePotState = runShowdown(
  showdownState({
    handId: "folded-side-pot",
    pot: 400,
    revealOrder: ["a", "b"],
    players: [
      player({
        id: "a",
        name: "A",
        cards: [card("9", "C"), card("A", "D")],
        totalContribution: 100,
      }),
      player({
        id: "b",
        name: "B",
        cards: [card("4", "C"), card("K", "D")],
        totalContribution: 150,
      }),
      player({
        id: "c",
        name: "C",
        cards: [card("2", "C"), card("Q", "D")],
        totalContribution: 150,
        folded: true,
      }),
    ],
  }),
);

expect(foldedSidePotState.winnerIds.includes("a"), "메인 팟 승자가 누락되면 안 됩니다.");
expect(foldedSidePotState.winnerIds.includes("b"), "폴드한 플레이어가 낸 사이드팟은 남은 eligible 플레이어가 이겨야 합니다.");
expect(!foldedSidePotState.log.some((line) => line.startsWith("반환:")), "폴드 기여금이 있는 사이드팟은 미콜 반환으로 처리하면 안 됩니다.");

console.log("쇼다운 정산 검증 통과: 2건");
