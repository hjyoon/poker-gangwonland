const SUITS = ["S", "H", "D", "C"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export const STREETS = [
  {
    key: "preflop",
    label: "프리 플랍 (Pre-flop)",
    firstBet: 5000,
    raiseSize: 5000,
    maxBet: 15000,
    example: "5,000 → 10,000 → 15,000",
  },
  {
    key: "flop",
    label: "플랍 (Flop)",
    firstBet: 5000,
    raiseSize: 5000,
    maxBet: 15000,
    example: "5,000 → 10,000 → 15,000",
  },
  {
    key: "turn",
    label: "턴 (Turn)",
    firstBet: 10000,
    raiseSize: 10000,
    maxBet: 30000,
    example: "10,000 → 20,000 → 30,000",
  },
  {
    key: "river",
    label: "리버 (River)",
    firstBet: 10000,
    raiseSize: 10000,
    maxBet: 40000,
    example: "10,000 → 20,000 → 30,000 → 40,000(캡)",
  },
];

const HAND_LABELS = [
  "하이 카드",
  "원 페어",
  "투 페어",
  "쓰리 오브 카인드",
  "스트레이트",
  "플러쉬",
  "풀 하우스",
  "포 오브 카인드",
  "스트레이트 플러쉬",
  "로열 플러쉬",
];

function rankValue(rank) {
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return Number(rank);
}

export function formatMoney(value) {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function createDeck() {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      id: `${rank}${suit}`,
      rank,
      suit,
      value: rankValue(rank),
    })),
  );
}

export function shuffleDeck(deck) {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function createPlayer(index, isHuman) {
  return {
    id: isHuman ? "human" : `cpu-${index}`,
    name: isHuman ? "플레이어" : `컴퓨터 ${index}`,
    isHuman,
    cards: [],
    folded: false,
    streetContribution: 0,
    totalContribution: 0,
    chipsWon: 0,
    lastAction: "대기",
  };
}

export function createPlayers(cpuCount) {
  return [createPlayer(0, true), ...Array.from({ length: cpuCount }, (_, i) => createPlayer(i + 1, false))];
}

function nextActiveIndex(players, fromIndex) {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (fromIndex + offset) % players.length;
    if (!players[index].folded) {
      return index;
    }
  }
  return fromIndex;
}

function activePlayers(players) {
  return players.filter((player) => !player.folded);
}

function buildPendingOrder(players, startIndex, stopBeforeIndex = null) {
  const order = [];
  let index = startIndex;
  let steps = 0;
  while (steps < players.length) {
    if (index === stopBeforeIndex) {
      break;
    }
    if (!players[index].folded) {
      order.push(index);
    }
    index = (index + 1) % players.length;
    steps += 1;
  }
  return order;
}

function getStreetConfig(streetIndex) {
  return STREETS[streetIndex];
}

function clonePlayers(players) {
  return players.map((player) => ({ ...player, cards: [...player.cards] }));
}

export function createInitialState(cpuCount = 3) {
  return startNewHand({
    cpuCount,
    dealerIndex: 0,
    chipTotals: {},
  });
}

export function startNewHand({ cpuCount, dealerIndex, chipTotals }) {
  const deck = shuffleDeck(createDeck());
  const players = createPlayers(cpuCount).map((player) => ({
    ...player,
    chipsWon: chipTotals[player.id] ?? 0,
  }));

  players.forEach((player) => {
    player.cards = [deck.pop(), deck.pop()];
  });

  const smallBlindIndex = (dealerIndex + 1) % players.length;
  const bigBlindIndex = (dealerIndex + 2) % players.length;
  const firstTurnIndex = (dealerIndex + 3) % players.length;

  players[smallBlindIndex].streetContribution = 2000;
  players[smallBlindIndex].totalContribution = 2000;
  players[smallBlindIndex].lastAction = "스몰 블라인드";

  players[bigBlindIndex].streetContribution = 5000;
  players[bigBlindIndex].totalContribution = 5000;
  players[bigBlindIndex].lastAction = "빅 블라인드";

  const pendingIndices = buildPendingOrder(players, firstTurnIndex);

  return {
    deck,
    players,
    dealerIndex,
    smallBlindIndex,
    bigBlindIndex,
    currentPlayerIndex: firstTurnIndex,
    pendingIndices,
    streetIndex: 0,
    communityCards: [],
    pot: 7000,
    currentBet: 5000,
    winnerIds: [],
    finished: false,
    waitingForHuman: players[firstTurnIndex].isHuman,
    revealOrder: [],
    showdownResults: [],
    log: [
      `새 핸드를 시작했습니다. 스몰 블라인드 ${players[smallBlindIndex].name}: ${formatMoney(2000)}`,
      `빅 블라인드 ${players[bigBlindIndex].name}: ${formatMoney(5000)}`,
      "프리 플랍 (Pre-flop)부터 진행합니다.",
    ],
    lastAggressorIndex: bigBlindIndex,
    chipTotals,
    note:
      "카드 서열 표시는 AGENTS.md 기준을 우선 따릅니다. 하이 카드는 화면 판정용 내부 보조 값이며, 원문 기준 카드 서열에는 포함되지 않습니다.",
  };
}

function drawCommunityCards(deck, streetIndex) {
  const nextDeck = [...deck];
  nextDeck.pop();
  const count = streetIndex === 1 ? 3 : 1;
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    cards.push(nextDeck.pop());
  }
  return { nextDeck, cards };
}

function combinations(cards, count) {
  const result = [];
  const current = [];
  function walk(start) {
    if (current.length === count) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < cards.length; i += 1) {
      current.push(cards[i]);
      walk(i + 1);
      current.pop();
    }
  }
  walk(0);
  return result;
}

function evaluateFiveCards(cards) {
  const values = cards.map((card) => card.value).sort((a, b) => b - a);
  const counts = new Map();
  cards.forEach((card) => {
    counts.set(card.value, (counts.get(card.value) ?? 0) + 1);
  });
  const countPairs = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const flush = cards.every((card) => card.suit === cards[0].suit);
  const uniqueValues = [...new Set(values)];
  let straightHigh = 0;
  if (uniqueValues.length === 5) {
    if (uniqueValues[0] - uniqueValues[4] === 4) {
      straightHigh = uniqueValues[0];
    } else if (JSON.stringify(uniqueValues) === JSON.stringify([14, 5, 4, 3, 2])) {
      straightHigh = 5;
    }
  }

  if (flush && straightHigh === 14) {
    return { score: 9, tiebreakers: [14], label: HAND_LABELS[9] };
  }
  if (flush && straightHigh) {
    return { score: 8, tiebreakers: [straightHigh], label: HAND_LABELS[8] };
  }
  if (countPairs[0][1] === 4) {
    return { score: 7, tiebreakers: [countPairs[0][0], countPairs[1][0]], label: HAND_LABELS[7] };
  }
  if (countPairs[0][1] === 3 && countPairs[1][1] === 2) {
    return { score: 6, tiebreakers: [countPairs[0][0], countPairs[1][0]], label: HAND_LABELS[6] };
  }
  if (flush) {
    return { score: 5, tiebreakers: values, label: HAND_LABELS[5] };
  }
  if (straightHigh) {
    return { score: 4, tiebreakers: [straightHigh], label: HAND_LABELS[4] };
  }
  if (countPairs[0][1] === 3) {
    return {
      score: 3,
      tiebreakers: [countPairs[0][0], ...countPairs.slice(1).map((entry) => entry[0])],
      label: HAND_LABELS[3],
    };
  }
  if (countPairs[0][1] === 2 && countPairs[1][1] === 2) {
    return {
      score: 2,
      tiebreakers: [countPairs[0][0], countPairs[1][0], countPairs[2][0]],
      label: HAND_LABELS[2],
    };
  }
  if (countPairs[0][1] === 2) {
    return {
      score: 1,
      tiebreakers: [countPairs[0][0], ...countPairs.slice(1).map((entry) => entry[0])],
      label: HAND_LABELS[1],
    };
  }
  return { score: 0, tiebreakers: values, label: HAND_LABELS[0] };
}

function compareEvaluations(a, b) {
  if (a.score !== b.score) {
    return a.score - b.score;
  }
  const length = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (a.tiebreakers[i] ?? 0) - (b.tiebreakers[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function evaluateSevenCards(cards) {
  const hands = combinations(cards, 5).map(evaluateFiveCards);
  return hands.reduce((best, hand) => (best && compareEvaluations(best, hand) >= 0 ? best : hand), null);
}

function finalizeByFold(state) {
  const winner = activePlayers(state.players)[0];
  const payout = Math.floor(state.pot * 0.95);
  const players = clonePlayers(state.players).map((player) =>
    player.id === winner.id
      ? { ...player, chipsWon: player.chipsWon + payout, lastAction: "승리" }
      : player,
  );

  return {
    ...state,
    players,
    finished: true,
    waitingForHuman: false,
    pendingIndices: [],
    winnerIds: [winner.id],
    showdownResults: [],
    revealOrder: [],
    chipTotals: Object.fromEntries(players.map((player) => [player.id, player.chipsWon])),
    log: [...state.log, `${winner.name} 승리. 수수료 5% 제외 후 ${formatMoney(payout)} 획득.`],
  };
}

function showdownOrder(state) {
  const remaining = activePlayers(state.players);
  if (remaining.length <= 1) {
    return remaining.map((player) => player.id);
  }
  const start =
    state.lastAggressorIndex >= 0 && !state.players[state.lastAggressorIndex].folded
      ? state.lastAggressorIndex
      : remaining[0]
        ? state.players.findIndex((player) => player.id === remaining[0].id)
        : 0;
  const order = [];
  let index = start;
  for (let i = 0; i < state.players.length; i += 1) {
    const player = state.players[index];
    if (!player.folded) {
      order.push(player.id);
    }
    index = (index + 1) % state.players.length;
  }
  return order;
}

function finalizeShowdown(state) {
  const contenders = activePlayers(state.players).map((player) => ({
    ...player,
    hand: evaluateSevenCards([...player.cards, ...state.communityCards]),
  }));

  const best = contenders.reduce((winner, player) => {
    if (!winner) return player;
    return compareEvaluations(player.hand, winner.hand) > 0 ? player : winner;
  }, null);

  const winners = contenders.filter((player) => compareEvaluations(player.hand, best.hand) === 0);
  const payout = Math.floor((state.pot * 0.95) / winners.length);
  const players = clonePlayers(state.players).map((player) => {
    const winnerHit = winners.some((winner) => winner.id === player.id);
    return winnerHit ? { ...player, chipsWon: player.chipsWon + payout, lastAction: "승리" } : player;
  });

  return {
    ...state,
    players,
    finished: true,
    waitingForHuman: false,
    pendingIndices: [],
    winnerIds: winners.map((player) => player.id),
    revealOrder: showdownOrder(state),
    showdownResults: contenders.map((player) => ({
      id: player.id,
      name: player.name,
      label: player.hand.label,
    })),
    chipTotals: Object.fromEntries(players.map((player) => [player.id, player.chipsWon])),
    log: [
      ...state.log,
      ...contenders.map((player) => `${player.name} 오픈: ${player.hand.label}`),
      `${winners.map((winner) => winner.name).join(", ")} 승리. 수수료 5% 제외 후 각 ${formatMoney(payout)} 획득.`,
    ],
  };
}

function advanceStreet(state) {
  if (activePlayers(state.players).length <= 1) {
    return finalizeByFold(state);
  }
  if (state.streetIndex === STREETS.length - 1) {
    return finalizeShowdown(state);
  }

  const nextStreetIndex = state.streetIndex + 1;
  const { nextDeck, cards } = drawCommunityCards(state.deck, nextStreetIndex);
  const players = clonePlayers(state.players).map((player) => ({
    ...player,
    streetContribution: 0,
    lastAction: player.folded ? "폴드" : "대기",
  }));
  const startIndex = (state.dealerIndex + 1) % players.length;
  const pendingIndices = buildPendingOrder(players, startIndex);

  return {
    ...state,
    deck: nextDeck,
    players,
    streetIndex: nextStreetIndex,
    communityCards: [...state.communityCards, ...cards],
    currentBet: 0,
    currentPlayerIndex: pendingIndices[0],
    pendingIndices,
    waitingForHuman: players[pendingIndices[0]].isHuman,
    log: [...state.log, `${STREETS[nextStreetIndex].label} 진행`, `공유 카드 공개: ${cards.map(formatCard).join(" ")}`],
  };
}

export function formatCard(card) {
  if (!card) return "??";
  const suits = { S: "♠", H: "♥", D: "♦", C: "♣" };
  return `${card.rank}${suits[card.suit]}`;
}

function amountToCall(player, state) {
  return Math.max(0, state.currentBet - player.streetContribution);
}

export function getAvailableActions(state, playerIndex) {
  if (state.finished) {
    return [];
  }
  const player = state.players[playerIndex];
  if (!player || player.folded) {
    return [];
  }
  const street = getStreetConfig(state.streetIndex);
  const toCall = amountToCall(player, state);
  const canCheck = state.currentBet === 0 && state.streetIndex !== 0;
  const nextRaiseTarget = state.currentBet === 0 ? street.firstBet : state.currentBet + street.raiseSize;
  const canRaise = nextRaiseTarget <= street.maxBet && player.totalContribution + toCall + (nextRaiseTarget - state.currentBet) <= 100000;

  return [
    { key: "fold", label: "폴드 (Fold)", enabled: true },
    { key: "call", label: toCall > 0 ? `콜 (Call) ${formatMoney(toCall)}` : "콜 (Call)", enabled: toCall > 0 },
    { key: "check", label: "체크 (Check)", enabled: canCheck },
    { key: "raise", label: `레이즈 (Raise) ${formatMoney(nextRaiseTarget)}`, enabled: canRaise },
  ];
}

export function applyAction(state, actionKey, actorIndex = state.currentPlayerIndex) {
  if (state.finished) {
    return state;
  }
  const player = state.players[actorIndex];
  if (!player || player.folded) {
    return state;
  }

  const players = clonePlayers(state.players);
  const actor = players[actorIndex];
  const street = getStreetConfig(state.streetIndex);
  const toCall = amountToCall(actor, state);
  let currentBet = state.currentBet;
  let pot = state.pot;
  let lastAggressorIndex = state.lastAggressorIndex;
  const log = [...state.log];

  if (actionKey === "fold") {
    actor.folded = true;
    actor.lastAction = "폴드";
    log.push(`${actor.name}: 폴드`);
  }

  if (actionKey === "call" && toCall > 0) {
    actor.streetContribution += toCall;
    actor.totalContribution += toCall;
    pot += toCall;
    actor.lastAction = "콜";
    log.push(`${actor.name}: 콜 ${formatMoney(toCall)}`);
  }

  if (actionKey === "check" && currentBet === 0 && state.streetIndex !== 0) {
    actor.lastAction = "체크";
    log.push(`${actor.name}: 체크`);
  }

  if (actionKey === "raise") {
    const target = currentBet === 0 ? street.firstBet : currentBet + street.raiseSize;
    if (target <= street.maxBet) {
      const amount = target - actor.streetContribution;
      actor.streetContribution = target;
      actor.totalContribution += amount;
      pot += amount;
      currentBet = target;
      actor.lastAction = "레이즈";
      lastAggressorIndex = actorIndex;
      log.push(`${actor.name}: 레이즈 ${formatMoney(target)}`);
    }
  }

  const nextState = {
    ...state,
    players,
    currentBet,
    pot,
    lastAggressorIndex,
    log,
  };

  if (activePlayers(players).length <= 1) {
    return finalizeByFold(nextState);
  }

  let pendingIndices = state.pendingIndices.filter((index) => index !== actorIndex && !players[index].folded);

  if (actionKey === "raise") {
    const startIndex = nextActiveIndex(players, actorIndex);
    pendingIndices = buildPendingOrder(players, startIndex, actorIndex);
  }

  if (pendingIndices.length === 0) {
    return advanceStreet({
      ...nextState,
      pendingIndices: [],
    });
  }

  const nextIndex = pendingIndices[0];
  const progressed = {
    ...nextState,
    currentPlayerIndex: nextIndex,
    pendingIndices,
    waitingForHuman: players[nextIndex].isHuman,
  };

  return progressed;
}

function preflopStrength(cards) {
  const [a, b] = [...cards].sort((left, right) => right.value - left.value);
  const pair = a.value === b.value;
  const suited = a.suit === b.suit;
  const gap = Math.abs(a.value - b.value);
  if (pair && a.value >= 10) return 92;
  if (pair) return 78;
  if (suited && gap <= 2 && a.value >= 11) return 74;
  if (a.value >= 13 && b.value >= 10) return 66;
  if (suited) return 54;
  return 40 + a.value - gap;
}

function postflopStrength(player, state) {
  const hand = evaluateSevenCards([...player.cards, ...state.communityCards]);
  return hand.score * 15 + (hand.tiebreakers[0] ?? 0);
}

export function chooseComputerAction(state, actorIndex = state.currentPlayerIndex) {
  const player = state.players[actorIndex];
  const actions = getAvailableActions(state, actorIndex).filter((action) => action.enabled);
  const toCall = amountToCall(player, state);
  const strength = state.streetIndex === 0 ? preflopStrength(player.cards) : postflopStrength(player, state);

  if (strength < 48 && toCall > 0) {
    return "fold";
  }
  if (strength > 82 && actions.some((action) => action.key === "raise")) {
    return "raise";
  }
  if (toCall > 0) {
    return "call";
  }
  if (actions.some((action) => action.key === "check")) {
    return "check";
  }
  return actions[0]?.key ?? "fold";
}
