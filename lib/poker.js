const SUITS = ["S", "H", "D", "C"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export const MIN_PLAYABLE_BALANCE = 5000;
export const RANDOM_COMPUTER_STYLE_KEY = "random";
export const RANDOM_COMPUTER_STYLE_OPTION = {
  key: RANDOM_COMPUTER_STYLE_KEY,
  label: "랜덤",
  description: "게임 시작 시 기본형, 신중형, 공격형, 적응형 중 하나로 무작위 확정합니다.",
};

export const COMPUTER_STYLES = [
  {
    key: "balanced",
    label: "기본형",
    description: "패 강도와 콜 비용을 함께 보고 콜과 베팅을 균형 있게 선택합니다.",
    foldBelow: 48,
    wagerAbove: 82,
    openBetAbove: 36,
    hardFoldBelow: 24,
    pressureTolerance: 5,
    openingPressure: 5,
    bluffCatchBonus: 8,
    variance: 8,
  },
  {
    key: "cautious",
    label: "신중형",
    description: "약한 패를 더 자주 폴드하되, 콜 비용이 작으면 일정 범위에서 버팁니다.",
    foldBelow: 58,
    wagerAbove: 90,
    openBetAbove: 48,
    hardFoldBelow: 30,
    pressureTolerance: 2,
    openingPressure: 2,
    bluffCatchBonus: 4,
    variance: 4,
  },
  {
    key: "aggressive",
    label: "공격형",
    description: "더 넓은 패 범위에서 베팅, 레이즈, 콜을 선택합니다.",
    foldBelow: 38,
    wagerAbove: 70,
    openBetAbove: 28,
    hardFoldBelow: 20,
    pressureTolerance: 9,
    openingPressure: 9,
    bluffCatchBonus: 12,
    variance: 12,
  },
  {
    key: "adaptive",
    label: "적응형",
    description: "다른 플레이어의 누적 행동 패턴을 앱 진행 중 학습해 콜, 베팅, 레이즈 기준을 조정합니다.",
    foldBelow: 48,
    wagerAbove: 80,
    openBetAbove: 34,
    hardFoldBelow: 24,
    pressureTolerance: 5,
    openingPressure: 5,
    bluffCatchBonus: 8,
    variance: 8,
    adaptive: true,
  },
];
export const COMPUTER_STYLE_OPTIONS = [RANDOM_COMPUTER_STYLE_OPTION, ...COMPUTER_STYLES];

export const STREETS = [
  {
    key: "preflop",
    label: "프리 플랍 (Pre-flop)",
    firstBet: 5000,
    raiseSize: 5000,
    reraiseSize: 5000,
    maxBet: 15000,
    example: "5,000 → 10,000 → 15,000",
  },
  {
    key: "flop",
    label: "플랍 (Flop)",
    firstBet: 5000,
    raiseSize: 5000,
    reraiseSize: 5000,
    maxBet: 15000,
    example: "5,000 → 10,000 → 15,000",
  },
  {
    key: "turn",
    label: "턴 (Turn)",
    firstBet: 10000,
    raiseSize: 10000,
    reraiseSize: 10000,
    maxBet: 30000,
    example: "10,000 → 20,000 → 30,000",
  },
  {
    key: "river",
    label: "리버 (River)",
    firstBet: 10000,
    raiseSize: 10000,
    reraiseSize: 10000,
    maxBet: 40000,
    maxLabel: "40,000원(캡 포함)",
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

export function calculateFee(pot) {
  return pot - Math.floor(pot * 0.95);
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

function createPlayer(index, isHuman, config = {}) {
  const fallbackId = isHuman ? "human" : `cpu-${index}`;
  const fallbackName = isHuman ? "플레이어" : `컴퓨터 ${index}`;
  return {
    id: config.id ?? fallbackId,
    name: config.name ?? fallbackName,
    isHuman,
    cards: [],
    folded: false,
    eliminated: false,
    actionLocked: false,
    streetContribution: 0,
    totalContribution: 0,
    chipBalance: 0,
    chipsWon: 0,
    lastAction: "대기",
  };
}

export function createPlayers(cpuCount, includeHuman = true, playerConfigs) {
  if (Array.isArray(playerConfigs)) {
    return playerConfigs.map((config, index) => createPlayer(index + 1, Boolean(config.isHuman), config));
  }

  const cpuPlayers = Array.from({ length: cpuCount }, (_, index) => createPlayer(index + 1, false));
  return includeHuman ? [createPlayer(0, true), ...cpuPlayers] : cpuPlayers;
}

function nextActiveIndex(players, fromIndex) {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (fromIndex + offset) % players.length;
    if (canAct(players[index])) {
      return index;
    }
  }
  return fromIndex;
}

function activePlayers(players) {
  return players.filter((player) => !player.folded && !player.eliminated);
}

function canAct(player) {
  return !player.folded && !player.eliminated && !player.actionLocked;
}

function actionableActivePlayers(players) {
  return activePlayers(players).filter(canAct);
}

function buildPendingOrder(players, startIndex, stopBeforeIndex = null) {
  const order = [];
  let index = startIndex;
  let steps = 0;
  while (steps < players.length) {
    if (index === stopBeforeIndex) {
      break;
    }
    if (canAct(players[index])) {
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

function getComputerStyle(styleKey) {
  return COMPUTER_STYLES.find((style) => style.key === styleKey) ?? COMPUTER_STYLES[0];
}

export function resolveComputerStyleKey(styleKey) {
  if (styleKey === RANDOM_COMPUTER_STYLE_KEY) {
    return COMPUTER_STYLES[Math.floor(Math.random() * COMPUTER_STYLES.length)].key;
  }
  return getComputerStyle(styleKey).key;
}

function buildComputerStyleMap(cpuCount, computerStyles = {}, fallbackStyle = "balanced") {
  return buildComputerStyleMapForPlayers(createPlayers(cpuCount, false), computerStyles, fallbackStyle);
}

function buildComputerStyleMapForPlayers(players, computerStyles = {}, fallbackStyle = "balanced") {
  const fallback = getComputerStyle(fallbackStyle).key;
  const styleMap = computerStyles && typeof computerStyles === "object" ? computerStyles : {};
  return Object.fromEntries(
    players.filter((player) => !player.isHuman).map((player) => [player.id, resolveComputerStyleKey(styleMap[player.id] ?? fallback)]),
  );
}

function emptyPlayerStats() {
  return {
    actions: 0,
    folds: 0,
    calls: 0,
    checks: 0,
    bets: 0,
    raises: 0,
    aggressiveActions: 0,
    voluntaryChips: 0,
  };
}

function normalizePlayerStats(saved = {}) {
  return {
    ...emptyPlayerStats(),
    ...saved,
  };
}

function buildPlayerStats(players, saved = {}) {
  return Object.fromEntries(players.map((player) => [player.id, normalizePlayerStats(saved[player.id])]));
}

function updatePlayerStats(stats, playerId, actionKey, amount = 0) {
  const nextStats = {
    ...stats,
    [playerId]: normalizePlayerStats(stats?.[playerId]),
  };
  const playerStats = nextStats[playerId];
  playerStats.actions += 1;
  playerStats.voluntaryChips += amount;

  if (actionKey === "fold") {
    playerStats.folds += 1;
  }
  if (actionKey === "call") {
    playerStats.calls += 1;
  }
  if (actionKey === "check") {
    playerStats.checks += 1;
  }
  if (actionKey === "bet") {
    playerStats.bets += 1;
    playerStats.aggressiveActions += 1;
  }
  if (actionKey === "raise") {
    playerStats.raises += 1;
    playerStats.aggressiveActions += 1;
  }

  return nextStats;
}

function clonePlayers(players) {
  return players.map((player) => ({ ...player, cards: [...player.cards] }));
}

function readChipLedger(saved) {
  if (!saved) {
    return { chipBalance: 0, chipsWon: 0 };
  }
  if (typeof saved === "number") {
    return { chipBalance: saved, chipsWon: saved };
  }
  return {
    chipBalance: saved.chipBalance ?? 0,
    chipsWon: saved.chipsWon ?? 0,
  };
}

function buildChipTotals(players) {
  return Object.fromEntries(
    players.map((player) => [
      player.id,
      {
        chipBalance: player.chipBalance,
        chipsWon: player.chipsWon,
      },
    ]),
  );
}

function markEliminatedPlayers(players) {
  return players.map((player) => {
    if (player.eliminated || player.chipBalance >= MIN_PLAYABLE_BALANCE) {
      return player;
    }
    return {
      ...player,
      cards: [],
      folded: true,
      eliminated: true,
      lastAction: "탈락",
    };
  });
}

function newEliminationLog(beforePlayers, afterPlayers) {
  return afterPlayers
    .filter((player, index) => !beforePlayers[index]?.eliminated && player.eliminated)
    .map((player) => `${player.name}: 잔액 ${formatMoney(player.chipBalance)}으로 탈락`);
}

function nextPlayableIndex(players, fromIndex) {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (fromIndex + offset + players.length) % players.length;
    if (!players[index].eliminated) {
      return index;
    }
  }
  return -1;
}

export function createInitialState(cpuCount = 3, startingBalance = 100000, includeHuman = true) {
  const chipTotals = Object.fromEntries(
    createPlayers(cpuCount, includeHuman).map((player) => [
      player.id,
      {
        chipBalance: startingBalance,
        chipsWon: 0,
      },
    ]),
  );
  return startNewHand({
    cpuCount,
    includeHuman,
    dealerIndex: 0,
    chipTotals,
    feeTotal: 0,
    computerStyles: buildComputerStyleMap(cpuCount),
  });
}

export function startNewHand({
  cpuCount,
  includeHuman = true,
  dealerIndex,
  chipTotals,
  feeTotal = 0,
  handNumber = 1,
  computerStyle = "balanced",
  computerStyles,
  playerStats = {},
  playerConfigs,
}) {
  const deck = shuffleDeck(createDeck());
  const basePlayers = createPlayers(cpuCount, includeHuman, playerConfigs);
  const resolvedPlayerConfigs = basePlayers.map((player) => ({ id: player.id, name: player.name, isHuman: player.isHuman }));
  const resolvedComputerStyles = buildComputerStyleMapForPlayers(basePlayers, computerStyles, computerStyle);
  const players = basePlayers.map((player) => {
    const ledger = readChipLedger(chipTotals?.[player.id]);
    const eliminated = ledger.chipBalance < MIN_PLAYABLE_BALANCE;
    return {
      ...player,
      folded: eliminated,
      eliminated,
      chipBalance: ledger.chipBalance,
      chipsWon: ledger.chipsWon,
      lastAction: eliminated ? "탈락" : "대기",
      computerStyle: player.isHuman ? null : resolvedComputerStyles[player.id],
    };
  });
  const resolvedPlayerStats = buildPlayerStats(players, playerStats);

  players.forEach((player) => {
    if (!player.eliminated) {
      player.cards = [deck.pop(), deck.pop()];
    }
  });

  const playableCount = players.filter((player) => !player.eliminated).length;
  const eliminationLog = players
    .filter((player) => player.eliminated)
    .map((player) => `${player.name}: 잔액 ${formatMoney(player.chipBalance)}으로 탈락`);

  if (playableCount < 2) {
    return {
      deck,
      players,
      dealerIndex: 0,
      smallBlindIndex: -1,
      bigBlindIndex: -1,
      currentPlayerIndex: 0,
      pendingIndices: [],
      streetIndex: 0,
      communityCards: [],
      pot: 0,
      currentBet: 0,
      currentHandFee: 0,
      computerStyles: resolvedComputerStyles,
      playerConfigs: resolvedPlayerConfigs,
      handNumber,
      handId: `hand-${handNumber}`,
      winnerIds: players.filter((player) => !player.eliminated).map((player) => player.id),
      finished: true,
      gameOver: true,
      waitingForHuman: false,
      revealOrder: [],
      showdownResults: [],
      log: [...eliminationLog, "게임 종료: 진행 가능한 플레이어가 2명 미만입니다."],
      lastAggressorIndex: -1,
      chipTotals: buildChipTotals(players),
      playerStats: resolvedPlayerStats,
      feeTotal,
      note: `잔액 ${formatMoney(MIN_PLAYABLE_BALANCE)} 미만인 플레이어는 앱 진행용 탈락 처리됩니다.`,
    };
  }

  const normalizedDealerIndex = players[dealerIndex] && !players[dealerIndex].eliminated
    ? dealerIndex
    : nextPlayableIndex(players, dealerIndex - 1);
  const smallBlindIndex = nextPlayableIndex(players, normalizedDealerIndex);
  const bigBlindIndex = nextPlayableIndex(players, smallBlindIndex);
  const firstTurnIndex = nextPlayableIndex(players, bigBlindIndex);

  players[smallBlindIndex].streetContribution = 2000;
  players[smallBlindIndex].totalContribution = 2000;
  players[smallBlindIndex].chipBalance -= 2000;
  players[smallBlindIndex].lastAction = "스몰 블라인드";

  players[bigBlindIndex].streetContribution = 5000;
  players[bigBlindIndex].totalContribution = 5000;
  players[bigBlindIndex].chipBalance -= 5000;
  players[bigBlindIndex].lastAction = "빅 블라인드";

  const pendingIndices = buildPendingOrder(players, firstTurnIndex);

  return {
    deck,
    players,
    dealerIndex: normalizedDealerIndex,
    smallBlindIndex,
    bigBlindIndex,
    currentPlayerIndex: firstTurnIndex,
    pendingIndices,
    streetIndex: 0,
    communityCards: [],
    pot: 7000,
    currentBet: 5000,
    currentHandFee: 0,
    computerStyles: resolvedComputerStyles,
    playerConfigs: resolvedPlayerConfigs,
    handNumber,
    handId: `hand-${handNumber}`,
    winnerIds: [],
    finished: false,
    gameOver: false,
    waitingForHuman: players[firstTurnIndex].isHuman,
    revealOrder: [],
    showdownResults: [],
    log: [
      ...eliminationLog,
      `새 핸드를 시작했습니다. 스몰 블라인드 ${players[smallBlindIndex].name}: ${formatMoney(2000)}`,
      `빅 블라인드 ${players[bigBlindIndex].name}: ${formatMoney(5000)}`,
      "프리 플랍 (Pre-flop)부터 진행합니다.",
    ],
    lastAggressorIndex: bigBlindIndex,
    chipTotals: buildChipTotals(players),
    playerStats: resolvedPlayerStats,
    feeTotal,
    note: `카드 서열 표시는 AGENTS.md 기준을 우선 따릅니다. 잔액 ${formatMoney(MIN_PLAYABLE_BALANCE)} 미만인 플레이어는 앱 진행용 탈락 처리됩니다.`,
  };
}

function drawCommunityCards(deck, streetIndex) {
  const nextDeck = [...deck];
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

function rankLabel(value) {
  if (value === 14) return "A";
  if (value === 13) return "K";
  if (value === 12) return "Q";
  if (value === 11) return "J";
  return String(value);
}

function highestCard(cards) {
  return [...cards].sort((a, b) => b.value - a.value)[0];
}

function cardForValue(cards, value) {
  return cards.find((card) => card.value === value) ?? highestCard(cards);
}

function cardsForValueLabel(cards, value) {
  return cards
    .filter((card) => card.value === value)
    .sort((a, b) => b.value - a.value)
    .map(formatCard)
    .join(" ");
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
    return {
      score: 9,
      tiebreakers: [14],
      label: `${HAND_LABELS[9]} (${formatCard(cardForValue(cards, 14))} 하이)`,
    };
  }
  if (flush && straightHigh) {
    return {
      score: 8,
      tiebreakers: [straightHigh],
      label: `${HAND_LABELS[8]} (${formatCard(cardForValue(cards, straightHigh))} 하이)`,
    };
  }
  if (countPairs[0][1] === 4) {
    return {
      score: 7,
      tiebreakers: [countPairs[0][0], countPairs[1][0]],
      label: `${HAND_LABELS[7]} (${cardsForValueLabel(cards, countPairs[0][0])})`,
    };
  }
  if (countPairs[0][1] === 3 && countPairs[1][1] === 2) {
    return {
      score: 6,
      tiebreakers: [countPairs[0][0], countPairs[1][0]],
      label: `${HAND_LABELS[6]} (${cardsForValueLabel(cards, countPairs[0][0])} / ${cardsForValueLabel(cards, countPairs[1][0])})`,
    };
  }
  if (flush) {
    return {
      score: 5,
      tiebreakers: values,
      label: `${HAND_LABELS[5]} (${formatCard(highestCard(cards))} 하이)`,
    };
  }
  if (straightHigh) {
    return {
      score: 4,
      tiebreakers: [straightHigh],
      label: `${HAND_LABELS[4]} (${formatCard(cardForValue(cards, straightHigh))} 하이)`,
    };
  }
  if (countPairs[0][1] === 3) {
    return {
      score: 3,
      tiebreakers: [countPairs[0][0], ...countPairs.slice(1).map((entry) => entry[0])],
      label: `${HAND_LABELS[3]} (${cardsForValueLabel(cards, countPairs[0][0])})`,
    };
  }
  if (countPairs[0][1] === 2 && countPairs[1][1] === 2) {
    return {
      score: 2,
      tiebreakers: [countPairs[0][0], countPairs[1][0], countPairs[2][0]],
      label: `${HAND_LABELS[2]} (${cardsForValueLabel(cards, countPairs[0][0])} / ${cardsForValueLabel(cards, countPairs[1][0])})`,
    };
  }
  if (countPairs[0][1] === 2) {
    return {
      score: 1,
      tiebreakers: [countPairs[0][0], ...countPairs.slice(1).map((entry) => entry[0])],
      label: `${HAND_LABELS[1]} (${cardsForValueLabel(cards, countPairs[0][0])})`,
    };
  }
  return {
    score: 0,
    tiebreakers: values,
    label: `${HAND_LABELS[0]} (${formatCard(highestCard(cards))} 하이)`,
  };
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
  const fee = calculateFee(state.pot);
  const feeTotal = (state.feeTotal ?? 0) + fee;
  const playersAfterPayout = clonePlayers(state.players).map((player) =>
    player.id === winner.id
      ? { ...player, chipBalance: player.chipBalance + payout, chipsWon: player.chipsWon + payout, lastAction: "승리" }
      : player,
  );
  const players = markEliminatedPlayers(playersAfterPayout);
  const eliminationLog = newEliminationLog(playersAfterPayout, players);

  return {
    ...state,
    players,
    finished: true,
    waitingForHuman: false,
    pendingIndices: [],
    winnerIds: [winner.id],
    showdownResults: [],
    revealOrder: [],
    currentHandFee: fee,
    chipTotals: buildChipTotals(players),
    feeTotal,
    log: [
      ...state.log,
      `${winner.name} 승리. 수수료 5% 제외 후 ${formatMoney(payout)} 획득.`,
      `이번 핸드 수수료 ${formatMoney(fee)} / 누적 수수료 ${formatMoney(feeTotal)}`,
      ...eliminationLog,
    ],
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

function splitPotWithFees(pot, winners) {
  const baseShare = Math.floor(pot / winners.length);
  const remainder = pot % winners.length;
  return winners.map((winner, index) => {
    const gross = baseShare + (index < remainder ? 1 : 0);
    const fee = calculateFee(gross);
    return {
      id: winner.id,
      gross,
      fee,
      net: gross - fee,
    };
  });
}

function buildContributionPots(players) {
  const contributionLevels = [...new Set(players.map((player) => player.totalContribution).filter((amount) => amount > 0))].sort((a, b) => a - b);
  const pots = [];
  let previousLevel = 0;

  contributionLevels.forEach((level) => {
    const amount = players.reduce((total, player) => total + Math.max(0, Math.min(player.totalContribution, level) - previousLevel), 0);
    const eligiblePlayers = players.filter((player) => !player.folded && !player.eliminated && player.totalContribution >= level);
    if (amount > 0 && eligiblePlayers.length > 0) {
      pots.push({ amount, eligiblePlayers });
    }
    previousLevel = level;
  });

  return pots;
}

function aggregatePayouts(payouts) {
  const payoutMap = new Map();
  payouts.forEach((payout) => {
    const current = payoutMap.get(payout.id) ?? { id: payout.id, gross: 0, fee: 0, net: 0 };
    current.gross += payout.gross;
    current.fee += payout.fee;
    current.net += payout.net;
    payoutMap.set(payout.id, current);
  });
  return [...payoutMap.values()];
}

function finalizeShowdown(state) {
  const contenders = activePlayers(state.players).map((player) => ({
    ...player,
    hand: evaluateSevenCards([...player.cards, ...state.communityCards]),
  }));

  const contributionPots = buildContributionPots(state.players);
  const payouts = contributionPots.flatMap((pot) => {
    const eligibleContenders = contenders.filter((player) => pot.eligiblePlayers.some((eligiblePlayer) => eligiblePlayer.id === player.id));
    const potBest = eligibleContenders.reduce((winner, player) => {
      if (!winner) return player;
      return compareEvaluations(player.hand, winner.hand) > 0 ? player : winner;
    }, null);
    const potWinners = eligibleContenders.filter((player) => compareEvaluations(player.hand, potBest.hand) === 0);
    return splitPotWithFees(pot.amount, potWinners);
  });
  const aggregatedPayouts = aggregatePayouts(payouts);
  const fee = aggregatedPayouts.reduce((total, payout) => total + payout.fee, 0);
  const feeTotal = (state.feeTotal ?? 0) + fee;
  const playersAfterPayout = clonePlayers(state.players).map((player) => {
    const payout = aggregatedPayouts.find((entry) => entry.id === player.id);
    if (!payout) {
      return player;
    }
    return {
      ...player,
      chipBalance: player.chipBalance + payout.net,
      chipsWon: player.chipsWon + payout.net,
      lastAction: aggregatedPayouts.length === 1 ? "승리" : "정산",
    };
  });
  const players = markEliminatedPlayers(playersAfterPayout);
  const eliminationLog = newEliminationLog(playersAfterPayout, players);
  const resultLog =
    aggregatedPayouts.length === 1
      ? `${state.players.find((player) => player.id === aggregatedPayouts[0].id).name} 승리. 수수료 5% 제외 후 ${formatMoney(aggregatedPayouts[0].net)} 획득.`
      : `정산: ${aggregatedPayouts
          .map((payout) => {
            const winner = state.players.find((player) => player.id === payout.id);
            return `${winner.name} ${formatMoney(payout.gross)} 중 수수료 ${formatMoney(payout.fee)} 제외 후 ${formatMoney(payout.net)} 획득`;
          })
          .join(" / ")}`;

  return {
    ...state,
    players,
    finished: true,
    waitingForHuman: false,
    pendingIndices: [],
    winnerIds: aggregatedPayouts.map((payout) => payout.id),
    currentHandFee: fee,
    revealOrder: showdownOrder(state),
    showdownResults: contenders.map((player) => ({
      id: player.id,
      name: player.name,
      label: player.hand.label,
    })),
    chipTotals: buildChipTotals(players),
    feeTotal,
    log: [
      ...state.log,
      ...contenders.map((player) => `${player.name} 오픈: ${player.hand.label}`),
      resultLog,
      `이번 핸드 수수료 ${formatMoney(fee)} / 누적 수수료 ${formatMoney(feeTotal)}`,
      ...eliminationLog,
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
    lastAction: player.folded ? "폴드" : player.actionLocked ? "잔액 전액 콜" : "대기",
  }));
  const startIndex = (state.dealerIndex + 1) % players.length;
  const pendingIndices = actionableActivePlayers(players).length > 1 ? buildPendingOrder(players, startIndex) : [];

  const nextState = {
    ...state,
    deck: nextDeck,
    players,
    streetIndex: nextStreetIndex,
    communityCards: [...state.communityCards, ...cards],
    currentBet: 0,
    currentPlayerIndex: pendingIndices[0],
    pendingIndices,
    waitingForHuman: pendingIndices.length > 0 ? players[pendingIndices[0]].isHuman : false,
    log: [...state.log, `${STREETS[nextStreetIndex].label} 진행`, `공유 카드 공개: ${cards.map(formatCard).join(" ")}`],
  };

  if (pendingIndices.length === 0) {
    return advanceStreet({
      ...nextState,
      currentPlayerIndex: -1,
      waitingForHuman: false,
    });
  }

  return nextState;
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
  if (!player || !canAct(player)) {
    return [];
  }
  if (activePlayers(state.players).length <= 1 || actionableActivePlayers(state.players).length <= 1) {
    return [];
  }
  const street = getStreetConfig(state.streetIndex);
  const toCall = amountToCall(player, state);
  const canCheck = toCall === 0 && (state.currentBet === 0 || state.streetIndex === 0);
  const isOpeningBet = state.currentBet === 0;
  const nextWagerTarget = isOpeningBet ? street.firstBet : state.currentBet + street.raiseSize;
  const wagerAmount = nextWagerTarget - player.streetContribution;
  const callAmount = Math.min(toCall, player.chipBalance);
  const canCall = toCall > 0 && callAmount > 0;
  const canWager =
    wagerAmount > 0 &&
    wagerAmount <= player.chipBalance &&
    nextWagerTarget <= street.maxBet &&
    player.totalContribution + wagerAmount <= 100000;

  return [
    { key: "fold", label: "폴드 (Fold)", enabled: true },
    {
      key: "call",
      label:
        toCall > 0 && callAmount === player.chipBalance
          ? `콜 (Call) 보유 전액 ${formatMoney(callAmount)}`
          : toCall > 0
            ? `콜 (Call) ${formatMoney(toCall)}`
            : "콜 (Call)",
      enabled: canCall,
    },
    { key: "check", label: "체크 (Check)", enabled: canCheck },
    isOpeningBet
      ? { key: "bet", label: `베팅 (Bet) ${formatMoney(nextWagerTarget)}`, enabled: canWager }
      : { key: "raise", label: `레이즈 (Raise) ${formatMoney(nextWagerTarget)}`, enabled: canWager },
  ];
}

export function applyAction(state, actionKey, actorIndex = state.currentPlayerIndex) {
  if (state.finished) {
    return state;
  }
  const player = state.players[actorIndex];
  if (!player || !canAct(player)) {
    return state;
  }

  const players = clonePlayers(state.players);
  const actor = players[actorIndex];
  const street = getStreetConfig(state.streetIndex);
  const toCall = amountToCall(actor, state);
  let currentBet = state.currentBet;
  let pot = state.pot;
  let lastAggressorIndex = state.lastAggressorIndex;
  let statsActionKey = null;
  let statsAmount = 0;
  const log = [...state.log];
  let actionApplied = false;

  if (actionKey === "fold") {
    actor.folded = true;
    actor.lastAction = "폴드";
    log.push(`${actor.name}: 폴드`);
    statsActionKey = "fold";
    actionApplied = true;
  }

  if (actionKey === "call" && toCall > 0 && actor.chipBalance > 0) {
    const callAmount = Math.min(toCall, actor.chipBalance);
    actor.streetContribution += callAmount;
    actor.totalContribution += callAmount;
    actor.chipBalance -= callAmount;
    pot += callAmount;
    const spentRemainingBalance = actor.chipBalance === 0;
    actor.actionLocked = spentRemainingBalance;
    actor.lastAction = spentRemainingBalance ? "잔액 전액 콜" : "콜";
    log.push(
      spentRemainingBalance
        ? `${actor.name}: 잔액 전액 콜 ${formatMoney(callAmount)}`
        : `${actor.name}: 콜 ${formatMoney(toCall)}`,
    );
    statsActionKey = "call";
    statsAmount = callAmount;
    actionApplied = true;
  }

  if (actionKey === "check" && toCall === 0 && (currentBet === 0 || state.streetIndex === 0)) {
    actor.lastAction = "체크";
    log.push(`${actor.name}: 체크`);
    statsActionKey = "check";
    actionApplied = true;
  }

  if (actionKey === "bet" || actionKey === "raise") {
    const target =
      actionKey === "bet" && currentBet === 0
        ? street.firstBet
        : actionKey === "raise" && currentBet > 0
          ? currentBet + street.raiseSize
          : null;
    const actionLabel = actionKey === "bet" ? "베팅" : "레이즈";
    const amount = target === null ? 0 : target - actor.streetContribution;
    if (
      target !== null &&
      amount > 0 &&
      amount <= actor.chipBalance &&
      target <= street.maxBet &&
      actor.totalContribution + amount <= 100000
    ) {
      actor.streetContribution = target;
      actor.totalContribution += amount;
      actor.chipBalance -= amount;
      pot += amount;
      currentBet = target;
      actor.lastAction = actionLabel;
      lastAggressorIndex = actorIndex;
      log.push(`${actor.name}: ${actionLabel} ${formatMoney(target)}`);
      statsActionKey = actionKey;
      statsAmount = amount;
      actionApplied = true;
    }
  }

  if (!actionApplied) {
    return state;
  }

  const nextState = {
    ...state,
    players,
    currentBet,
    pot,
    lastAggressorIndex,
    chipTotals: buildChipTotals(players),
    playerStats: statsActionKey ? updatePlayerStats(state.playerStats ?? {}, actor.id, statsActionKey, statsAmount) : state.playerStats,
    log,
  };

  if (activePlayers(players).length <= 1) {
    return finalizeByFold(nextState);
  }

  if (actionableActivePlayers(players).length <= 1) {
    return advanceStreet({
      ...nextState,
      currentPlayerIndex: -1,
      pendingIndices: [],
      waitingForHuman: false,
    });
  }

  let pendingIndices = state.pendingIndices.filter((index) => index !== actorIndex && canAct(players[index]));

  if (actionKey === "bet" || actionKey === "raise") {
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

function hashToUnit(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function computerCallAdjustment(player, state, style, toCall) {
  if (toCall <= 0) {
    return 0;
  }

  const potAfterCall = state.pot + toCall;
  const callShare = potAfterCall > 0 ? toCall / potAfterCall : 1;
  const lastAggressor = state.players[state.lastAggressorIndex];
  const activeCount = activePlayers(state.players).length;
  const seed = `${state.handId ?? "hand"}:${player.id}:${state.streetIndex}:${state.currentBet}:${state.pot}`;
  const variance = Math.floor(hashToUnit(seed) * (style.variance + 1));
  let adjustment = style.pressureTolerance + variance;

  if (callShare <= 0.15) {
    adjustment += 12;
  } else if (callShare <= 0.25) {
    adjustment += 8;
  } else if (callShare <= 0.35) {
    adjustment += 4;
  }

  if (lastAggressor?.isHuman) {
    adjustment += style.bluffCatchBonus;
  }

  if (player.streetContribution > 0) {
    adjustment += Math.min(6, Math.floor(player.streetContribution / 5000) * 2);
  }

  if (state.streetIndex >= 2) {
    adjustment += 2;
  }

  if (activeCount > 2) {
    adjustment -= 4;
  }
  if (activeCount > 4) {
    adjustment -= 3;
  }
  if (toCall >= 20000) {
    adjustment -= 4;
  }

  return Math.max(0, adjustment);
}

function adaptiveStyleForPlayer(baseStyle, state, player) {
  if (!baseStyle.adaptive) {
    return baseStyle;
  }

  const opponentStats = state.playerStats ?? {};
  const activeOpponentIds = activePlayers(state.players)
    .filter((opponent) => opponent.id !== player.id)
    .map((opponent) => opponent.id);
  const activeOpponentStats = activeOpponentIds.map((id) => normalizePlayerStats(opponentStats[id]));
  const totalActions = activeOpponentStats.reduce((total, stats) => total + stats.actions, 0);

  if (totalActions < 4) {
    return baseStyle;
  }

  const totalFolds = activeOpponentStats.reduce((total, stats) => total + stats.folds, 0);
  const totalAggression = activeOpponentStats.reduce((total, stats) => total + stats.aggressiveActions, 0);
  const foldRate = totalFolds / totalActions;
  const aggressionRate = totalAggression / totalActions;
  const lastAggressor = state.players[state.lastAggressorIndex];
  const lastAggressorStats = lastAggressor ? normalizePlayerStats(opponentStats[lastAggressor.id]) : null;
  const lastAggressorRate =
    lastAggressorStats && lastAggressorStats.actions > 0
      ? lastAggressorStats.aggressiveActions / lastAggressorStats.actions
      : aggressionRate;

  let foldBelow = baseStyle.foldBelow;
  let wagerAbove = baseStyle.wagerAbove;
  let openBetAbove = baseStyle.openBetAbove;
  let pressureTolerance = baseStyle.pressureTolerance;
  let openingPressure = baseStyle.openingPressure;
  let bluffCatchBonus = baseStyle.bluffCatchBonus;

  if (foldRate >= 0.42) {
    openBetAbove -= 8;
    wagerAbove -= 6;
    openingPressure += 4;
  } else if (foldRate <= 0.18) {
    openBetAbove += 5;
    wagerAbove += 4;
  }

  if (aggressionRate >= 0.34 || lastAggressorRate >= 0.4) {
    foldBelow -= 8;
    pressureTolerance += 5;
    bluffCatchBonus += 6;
  } else if (aggressionRate <= 0.12 && lastAggressorRate <= 0.16) {
    foldBelow += 5;
    pressureTolerance -= 2;
    bluffCatchBonus -= 3;
  }

  return {
    ...baseStyle,
    foldBelow: Math.max(32, Math.min(62, foldBelow)),
    wagerAbove: Math.max(66, Math.min(92, wagerAbove)),
    openBetAbove: Math.max(24, Math.min(54, openBetAbove)),
    pressureTolerance: Math.max(1, pressureTolerance),
    openingPressure: Math.max(1, openingPressure),
    bluffCatchBonus: Math.max(0, bluffCatchBonus),
  };
}

function computerOpeningAdjustment(player, state, style) {
  const activeCount = activePlayers(state.players).length;
  const seed = `${state.handId ?? "hand"}:${player.id}:${state.streetIndex}:open:${state.pot}`;
  const variance = Math.floor(hashToUnit(seed) * (style.variance + 1));
  let adjustment = style.openingPressure + variance;

  if (state.streetIndex >= 2) {
    adjustment += 3;
  }
  if (activeCount <= 2) {
    adjustment += 5;
  }
  if (activeCount > 3) {
    adjustment -= 3;
  }
  if (activeCount > 5) {
    adjustment -= 3;
  }

  return Math.max(0, adjustment);
}

export function chooseComputerAction(state, actorIndex = state.currentPlayerIndex) {
  const player = state.players[actorIndex];
  const actions = getAvailableActions(state, actorIndex).filter((action) => action.enabled);
  const toCall = amountToCall(player, state);
  const strength = state.streetIndex === 0 ? preflopStrength(player.cards) : postflopStrength(player, state);
  const baseStyle = getComputerStyle(player.computerStyle ?? state.computerStyles?.[player.id] ?? state.computerStyle);
  const style = adaptiveStyleForPlayer(baseStyle, state, player);
  const adjustedCallStrength = strength + computerCallAdjustment(player, state, style, toCall);
  const openingAction = actions.find((action) => action.key === "bet");
  const adjustedOpeningStrength = strength + computerOpeningAdjustment(player, state, style);

  if (strength < style.hardFoldBelow && toCall > 0) {
    return "fold";
  }
  const aggressiveAction = actions.find((action) => action.key === "raise" || action.key === "bet");
  if (strength > style.wagerAbove && aggressiveAction) {
    return aggressiveAction.key;
  }
  if (adjustedCallStrength < style.foldBelow && toCall > 0) {
    return "fold";
  }
  if (toCall === 0 && openingAction && adjustedOpeningStrength >= style.openBetAbove) {
    return openingAction.key;
  }
  if (toCall > 0 && actions.some((action) => action.key === "call")) {
    return "call";
  }
  if (toCall > 0) {
    return "fold";
  }
  if (actions.some((action) => action.key === "check")) {
    return "check";
  }
  return actions[0]?.key ?? "fold";
}
