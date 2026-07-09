import {
  COMPUTER_LEVELS,
  COMPUTER_STYLES,
  PREFLOP_CONNECTOR_TEST_CASES,
  PREFLOP_RANK_TEST_CASES,
  applyAction,
  calculateFee,
  chooseComputerAction,
  computerCardPeekPlan,
  compareEvaluations,
  createDeck,
  createInitialState,
  createPlayers,
  describePreflopHand,
  estimateHoldemWinRate,
  evaluateSevenCards,
  formatCard,
  formatMoney,
  getAvailableActions,
  pokerRandom,
  randomIndex,
  resolveComputerLevelKey,
  resolveComputerStyleKey,
  shuffleDeck,
  startNewHand,
} from "../lib/poker.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createSeededRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

globalThis.__POKER_TEST_RANDOM__ = createSeededRandom("exercise-poker-coverage");

const deck = createDeck();
const cardById = new Map(deck.map((card) => [card.id, card]));
const card = (id) => cardById.get(id);
const hand = (...ids) => ids.map(card);

function exerciseBasics() {
  const seededRandom = globalThis.__POKER_TEST_RANDOM__;
  delete globalThis.__POKER_TEST_RANDOM__;
  assert(pokerRandom() >= 0 && pokerRandom() < 1, "pokerRandom should fall back to Math.random");
  globalThis.__POKER_TEST_RANDOM__ = () => Number.NaN;
  assert(pokerRandom() >= 0 && pokerRandom() < 1, "pokerRandom should tolerate non-finite test random");
  globalThis.__POKER_TEST_RANDOM__ = () => -1;
  assert(pokerRandom() === 0, "pokerRandom should clamp low deterministic values");
  globalThis.__POKER_TEST_RANDOM__ = () => 2;
  assert(pokerRandom() < 1, "pokerRandom should clamp high deterministic values");
  globalThis.__POKER_TEST_RANDOM__ = seededRandom;

  assert(formatMoney(120000) === "₩120,000", "formatMoney should format KRW");
  assert(calculateFee(101) === 6, "calculateFee should round fee down from payout");
  assert(formatCard(null) === "??", "formatCard should tolerate missing cards");
  assert(formatCard(card("AH")) === "A♥", "formatCard should render suit");
  assert(randomIndex(3) >= 0, "randomIndex should return an index");
  assert(shuffleDeck(deck).length === 52, "shuffleDeck should keep deck size");
  assert(createPlayers(2, true).length === 3, "createPlayers should include human");
  assert(createPlayers(2, false).every((player) => !player.isHuman), "createPlayers should support computer-only");
  assert(createPlayers(0, true, [{ id: "h1", name: "H", isHuman: true }])[0].id === "h1", "createPlayers should honor configs");
  assert(resolveComputerStyleKey("unknown") === "balanced", "unknown style should resolve to fallback");
  assert(resolveComputerLevelKey("unknown") === "intermediate", "unknown level should resolve to fallback");
  assert(COMPUTER_STYLES.some((style) => style.key === resolveComputerStyleKey("random")), "random style should resolve");
  assert(COMPUTER_LEVELS.some((level) => level.key === resolveComputerLevelKey("random")), "random level should resolve");
}

function exercisePreflop() {
  Object.keys(PREFLOP_RANK_TEST_CASES).forEach((key) => {
    const sampleCards = {
      AA: hand("AS", "AH"),
      AKs: hand("AS", "KS"),
      AKo: hand("AS", "KC"),
      QJs: hand("QS", "JS"),
      A2s: hand("AS", "2S"),
      J8s: hand("JS", "8S"),
      QTo: hand("QS", "10C"),
      "22": hand("2S", "2C"),
      "72s": hand("7S", "2S"),
      "82o": hand("8S", "2C"),
      "72o": hand("7S", "2C"),
    }[key];
    assert(describePreflopHand(sampleCards)?.rank === PREFLOP_RANK_TEST_CASES[key], `preflop rank ${key}`);
  });
  Object.keys(PREFLOP_CONNECTOR_TEST_CASES).forEach((key) => {
    const sampleCards = {
      AKs: hand("AS", "KS"),
      QJs: hand("QS", "JS"),
      "72s": hand("7S", "2S"),
      A2s: hand("AS", "2S"),
      "22": hand("2S", "2C"),
    }[key];
    assert(describePreflopHand(sampleCards)?.connector === PREFLOP_CONNECTOR_TEST_CASES[key], `preflop connector ${key}`);
  });
  assert(describePreflopHand([]) === null, "invalid preflop hand should return null");
  assert(describePreflopHand([card("AS"), null]) === null, "missing preflop card should return null");
}

function exerciseHandEvaluation() {
  const cases = [
    ["royal flush", hand("AS", "KS", "QS", "JS", "10S", "2D", "3C"), 9],
    ["straight flush", hand("9S", "8S", "7S", "6S", "5S", "2D", "3C"), 8],
    ["four of a kind", hand("AS", "AH", "AD", "AC", "2S", "3D", "4C"), 7],
    ["full house", hand("KS", "KH", "KD", "2C", "2S", "3D", "4C"), 6],
    ["flush", hand("AS", "9S", "7S", "4S", "2S", "3D", "5C"), 5],
    ["wheel straight", hand("AS", "2H", "3D", "4C", "5S", "9D", "KC"), 4],
    ["three of a kind", hand("QS", "QH", "QD", "8C", "6S", "3D", "2C"), 3],
    ["two pair", hand("JS", "JH", "8D", "8C", "6S", "3D", "2C"), 2],
    ["one pair", hand("10S", "10H", "8D", "7C", "6S", "3D", "2C"), 1],
    ["high card", hand("AS", "KH", "8D", "7C", "6S", "3D", "2C"), 0],
  ];
  const evaluations = cases.map(([label, cards, score]) => {
    const evaluation = evaluateSevenCards(cards);
    assert(evaluation.score === score, `${label} should score ${score}`);
    return evaluation;
  });
  assert(compareEvaluations(evaluations[0], evaluations[1]) > 0, "royal flush should beat straight flush");
  assert(compareEvaluations(evaluations.at(-1), evaluations.at(-1)) === 0, "same hand should tie");
  assert(compareEvaluations(evaluations[8], evaluations[9]) > 0, "pair should beat high card");
}

function exerciseWinRate() {
  assert(estimateHoldemWinRate({ playerCards: [] }) === null, "invalid win-rate input should return null");
  assert(estimateHoldemWinRate({ playerCards: hand("AS", "AH"), opponentCount: 0 }).percent === 100, "zero opponents should be certain");
  assert(
    estimateHoldemWinRate({ playerCards: hand("AS", "AH"), opponentCount: 30 }) === null,
    "impossible win-rate deal should return null",
  );
  assert(
    estimateHoldemWinRate({
      playerCards: hand("AS", "AH"),
      communityCards: hand("KS", "QS", "JS"),
      opponentCount: 2,
      samples: 6,
    }).samples === 6,
    "win-rate should run requested samples",
  );
  assert(
    estimateHoldemWinRate({
      playerCards: hand("2D", "3C"),
      communityCards: hand("AS", "KS", "QS", "JS", "10S"),
      opponentCount: 1,
      samples: 1,
    }).percent === 50,
    "board royal flush should split simulated equity",
  );
}

function player(id, options = {}) {
  return {
    id,
    name: options.name ?? id,
    isHuman: options.isHuman ?? false,
    cards: options.cards ?? hand("AS", "AH"),
    folded: options.folded ?? false,
    eliminated: options.eliminated ?? false,
    actionLocked: options.actionLocked ?? false,
    streetContribution: options.streetContribution ?? 0,
    totalContribution: options.totalContribution ?? 0,
    chipBalance: options.chipBalance ?? 100000,
    chipsWon: options.chipsWon ?? 0,
    lastAction: options.lastAction ?? "대기",
    computerStyle: options.computerStyle ?? "balanced",
    computerLevel: options.computerLevel ?? "intermediate",
  };
}

function actionState(overrides = {}) {
  const players = overrides.players ?? [
    player("human", { isHuman: true, cards: hand("AS", "AH") }),
    player("cpu-1", { cards: hand("KS", "KH") }),
    player("cpu-2", { cards: hand("QS", "QH") }),
  ];
  return {
    deck: deck.slice(10),
    players,
    dealerIndex: 0,
    smallBlindIndex: 1,
    bigBlindIndex: 2,
    currentPlayerIndex: overrides.currentPlayerIndex ?? 0,
    pendingIndices: overrides.pendingIndices ?? [0, 1, 2],
    streetIndex: overrides.streetIndex ?? 0,
    communityCards: overrides.communityCards ?? [],
    pot: overrides.pot ?? 7000,
    currentBet: overrides.currentBet ?? 5000,
    currentHandFee: 0,
    feeTotal: 0,
    handNumber: 1,
    handId: overrides.handId ?? "exercise-hand",
    winnerIds: [],
    finished: overrides.finished ?? false,
    gameOver: false,
    waitingForHuman: true,
    showdownPending: overrides.showdownPending ?? false,
    revealOrder: overrides.revealOrder ?? [],
    muckIds: overrides.muckIds ?? [],
    showdownResults: overrides.showdownResults ?? [],
    log: [],
    lastAggressorIndex: overrides.lastAggressorIndex ?? 2,
    chipTotals: {},
    playerStats: overrides.playerStats ?? {},
    cardPeekPlayerIds: overrides.cardPeekPlayerIds ?? [],
    computerCardCheckedPlayerIds: overrides.computerCardCheckedPlayerIds ?? [],
  };
}

function exerciseActions() {
  assert(applyAction({ ...actionState(), finished: true }, "fold", 0).finished, "finished action should be ignored");
  assert(applyAction(actionState(), "fold", 99) !== null, "missing actor should be ignored without throwing");
  assert(getAvailableActions({ ...actionState(), finished: true }, 0).length === 0, "finished state has no actions");
  assert(getAvailableActions(actionState(), 99).length === 0, "missing player has no actions");
  assert(
    getAvailableActions(
      actionState({
        players: [player("human", { isHuman: true }), player("cpu-1", { folded: true })],
        pendingIndices: [0],
      }),
      0,
    ).length === 0,
    "single actionable player should have no betting actions",
  );

  const openingActions = getAvailableActions(
    actionState({
      currentBet: 0,
      streetIndex: 1,
      players: [
        player("human", { isHuman: true, streetContribution: 0 }),
        player("cpu-1", { streetContribution: 0 }),
      ],
      pendingIndices: [0, 1],
    }),
    0,
  );
  assert(openingActions.some((action) => action.key === "bet" && action.enabled), "opening street should allow bet");

  let state = actionState();
  assert(getAvailableActions(state, 0).some((action) => action.key === "call" && action.enabled), "human can call");
  state = applyAction(state, "call", 0);
  state = applyAction({ ...state, currentPlayerIndex: 1 }, "call", 1);
  state = applyAction({ ...state, currentPlayerIndex: 2, currentBet: 0, streetIndex: 1 }, "bet", 2);
  state = applyAction({ ...state, currentPlayerIndex: 0 }, "raise", 0);
  state = applyAction({ ...state, currentPlayerIndex: 1 }, "fold", 1);
  assert(state.log.length > 0, "actions should log progress");

  const checkState = actionState({
    currentBet: 0,
    streetIndex: 1,
    players: [
      player("human", { isHuman: true, streetContribution: 0 }),
      player("cpu-1", { streetContribution: 0 }),
    ],
    pendingIndices: [0, 1],
  });
  assert(applyAction(checkState, "check", 0).players[0].lastAction === "체크", "check should apply when no call is needed");
  assert(applyAction(checkState, "call", 0) === checkState, "call with no amount should be ignored");

  const checkedStats = applyAction({ ...checkState, playerStats: {} }, "check", 0);
  assert(checkedStats.playerStats.human.checks === 1, "check action should update player stats");
  const betStatsState = actionState({
    currentBet: 0,
    streetIndex: 1,
    players: [
      player("human", { isHuman: true, streetContribution: 0 }),
      player("cpu-1", { streetContribution: 0 }),
    ],
    pendingIndices: [0, 1],
    playerStats: {},
  });
  const betStats = applyAction(betStatsState, "bet", 0);
  assert(betStats.playerStats.human.bets === 1 && betStats.playerStats.human.aggressiveActions === 1, "bet action should update player stats");
  const raiseStats = applyAction({ ...actionState(), playerStats: {} }, "raise", 0);
  assert(raiseStats.playerStats.human.raises === 1 && raiseStats.playerStats.human.aggressiveActions === 1, "raise action should update player stats");

  const noChipsCallState = actionState({
    players: [
      player("human", { isHuman: true, chipBalance: 0, actionLocked: false, streetContribution: 0 }),
      player("cpu-1", { streetContribution: 5000 }),
    ],
    pendingIndices: [0, 1],
    lastAggressorIndex: 1,
  });
  assert(applyAction(noChipsCallState, "call", 0) === noChipsCallState, "zero-spend call should be ignored");

  const shortStackState = actionState({
    players: [
      player("human", { isHuman: true, chipBalance: 3000, streetContribution: 0 }),
      player("cpu-1", { chipBalance: 100000, streetContribution: 5000 }),
    ],
    pendingIndices: [0, 1],
    lastAggressorIndex: 1,
  });
  const allInCall = applyAction(shortStackState, "call", 0);
  assert(allInCall.players[0].actionLocked, "short-stack call should lock action");

  const streetAdvanceState = actionState({
    players: [
      player("human", { isHuman: true, streetContribution: 0 }),
      player("cpu-1", { streetContribution: 5000 }),
    ],
    currentPlayerIndex: 0,
    pendingIndices: [0],
    lastAggressorIndex: 1,
  });
  assert(applyAction(streetAdvanceState, "call", 0).streetIndex === 1, "last call should advance the street");

  const foldWinState = actionState({
    players: [
      player("human", { isHuman: true }),
      player("cpu-1", { cards: hand("KS", "KH") }),
    ],
    currentPlayerIndex: 0,
    pendingIndices: [0],
    lastAggressorIndex: 1,
  });
  assert(applyAction(foldWinState, "fold", 0).finished, "fold leaving one player should finish");
}

function showdownState(overrides = {}) {
  const players = overrides.players ?? [
    player("a", { cards: hand("AS", "AH"), totalContribution: 10000, chipBalance: 90000 }),
    player("b", { cards: hand("KS", "KH"), totalContribution: 10000, chipBalance: 90000 }),
    player("c", { cards: hand("2S", "3H"), totalContribution: 10000, chipBalance: 90000 }),
  ];
  return actionState({
    players,
    currentPlayerIndex: overrides.currentPlayerIndex ?? 0,
    pendingIndices: [0, 1, 2],
    streetIndex: 3,
    communityCards: overrides.communityCards ?? hand("QS", "JS", "10S", "9D", "8C"),
    pot: 30000,
    currentBet: 0,
    showdownPending: true,
    revealOrder: overrides.revealOrder ?? ["a", "b", "c"],
    lastAggressorIndex: overrides.lastAggressorIndex ?? 1,
    playerStats: overrides.playerStats ?? {},
  });
}

function exerciseShowdown() {
  let state = showdownState();
  assert(getAvailableActions(state, 0).some((action) => action.key === "show"), "showdown can show");
  assert(applyAction(state, "fold", 0) === state, "non-showdown action should be ignored during showdown");
  assert(applyAction(state, "show", 1) === state, "wrong showdown actor should be ignored");
  state = applyAction(state, "show", 0);
  const openedAgainState = { ...state, currentPlayerIndex: 0, pendingIndices: [0] };
  assert(getAvailableActions(openedAgainState, 0).length === 0, "opened player should not act again");
  assert(applyAction(openedAgainState, "show", 0) === openedAgainState, "opened player showdown action should be ignored");
  state = applyAction({ ...state, currentPlayerIndex: 1 }, "muck", 1);
  state = applyAction({ ...state, currentPlayerIndex: 2 }, "show", 2);
  assert(state.finished, "showdown should finish after all contenders resolve");

  const noMuckState = showdownState({ revealOrder: ["a"], players: [player("a", { cards: hand("AS", "AH"), totalContribution: 10000 })] });
  assert(getAvailableActions({ ...noMuckState, players: [{ ...noMuckState.players[0], folded: true }] }, 0).length === 0, "folded showdown player cannot act");
  assert(
    applyAction({ ...noMuckState, players: [{ ...noMuckState.players[0], folded: true }] }, "show", 0).players[0].folded,
    "folded showdown actor should be ignored",
  );
  assert(getAvailableActions(noMuckState, 0).find((action) => action.key === "muck")?.enabled === false, "last contender cannot muck");
  assert(applyAction(noMuckState, "muck", 0) === noMuckState, "illegal muck should not mutate");

  const implicitSoloShowdown = showdownState({
    players: [player("solo", { cards: hand("AS", "AH"), totalContribution: 10000 }), player("folded", { folded: true, totalContribution: 10000 })],
    revealOrder: [],
    currentPlayerIndex: 0,
  });
  assert(getAvailableActions(implicitSoloShowdown, 0).some((action) => action.key === "show"), "implicit one-player showdown should build order");

  const foldedAggressorShowdown = showdownState({
    players: [
      player("folded-aggressor", { folded: true, totalContribution: 10000 }),
      player("active-a", { cards: hand("AS", "AH"), totalContribution: 10000 }),
      player("active-b", { cards: hand("KS", "KH"), totalContribution: 10000 }),
    ],
    revealOrder: [],
    currentPlayerIndex: 1,
    lastAggressorIndex: 0,
  });
  assert(getAvailableActions(foldedAggressorShowdown, 1).some((action) => action.key === "show"), "folded aggressor showdown should start with first active");

  const sidePotState = showdownState({
    players: [
      player("a", { cards: hand("AS", "KS"), totalContribution: 20000, chipBalance: 80000 }),
      player("b", { cards: hand("AH", "KH"), totalContribution: 10000, chipBalance: 90000 }),
      player("c", { cards: hand("2D", "3C"), totalContribution: 10000, chipBalance: 90000 }),
    ],
    communityCards: hand("QS", "JS", "10S", "9S", "8C"),
    pot: 40000,
    revealOrder: ["a", "b", "c"],
  });
  const sidePotFinished = applyAction(applyAction(applyAction(sidePotState, "show", 0), "show", 1), "show", 2);
  assert(sidePotFinished.log.some((entry) => entry.startsWith("반환:")), "uncalled side-pot contribution should be returned");

  const splitPotState = showdownState({
    players: [
      player("a", { cards: hand("2D", "3C"), totalContribution: 10000 }),
      player("b", { cards: hand("4D", "5C"), totalContribution: 10000 }),
      player("c", { cards: hand("6D", "7C"), totalContribution: 10000 }),
    ],
    communityCards: hand("AS", "KS", "QS", "JS", "10S"),
    pot: 30000,
    revealOrder: ["a", "b", "c"],
  });
  const splitPotFinished = applyAction(applyAction(applyAction(splitPotState, "show", 0), "show", 1), "show", 2);
  assert(splitPotFinished.winnerIds.length === 3, "board royal flush should split the pot");

  const weakShowdownState = showdownState({
    players: [
      player("weak-a", { cards: hand("2D", "7C"), totalContribution: 10000 }),
      player("weak-b", { cards: hand("3D", "8C"), totalContribution: 10000 }),
    ],
    communityCards: hand("AS", "KD", "QH", "9S", "4C"),
    pot: 20000,
    revealOrder: ["weak-a", "weak-b"],
  });
  const weakShowdownFinished = applyAction(applyAction(weakShowdownState, "show", 0), "show", 1);
  assert(weakShowdownFinished.playerStats["weak-a"].showdownWeakShows >= 1, "weak opened hands should update showdown stats");

  const allInLoserState = showdownState({
    players: [
      player("winner", { cards: hand("AS", "AH"), totalContribution: 10000, chipBalance: 90000 }),
      player("all-in-loser", { cards: hand("3D", "8C"), totalContribution: 10000, chipBalance: 0 }),
    ],
    communityCards: hand("KS", "QD", "9H", "5S", "4C"),
    pot: 20000,
    revealOrder: ["winner", "all-in-loser"],
  });
  const allInLoserFinished = applyAction(applyAction(allInLoserState, "show", 0), "show", 1);
  assert(allInLoserFinished.players.find((entry) => entry.id === "all-in-loser").eliminated, "busted showdown loser should be eliminated");

  const emptyPotState = showdownState({
    players: [
      player("a", { cards: hand("AS", "AH"), totalContribution: 0 }),
      player("b", { cards: hand("KS", "KH"), totalContribution: 0 }),
    ],
    pot: 0,
    revealOrder: ["a", "b"],
  });
  const emptyPotFinished = applyAction(applyAction(emptyPotState, "show", 0), "show", 1);
  assert(emptyPotFinished.log.includes("정산 대상 팟이 없습니다."), "empty showdown pot should be logged");
}

function exerciseComputerDecisions() {
  const styles = ["balanced", "cautious", "aggressive", "adaptive", "chaotic"];
  const levels = ["beginner", "intermediate", "advanced"];
  styles.forEach((style, styleIndex) => {
    levels.forEach((level, levelIndex) => {
      const actor = player(`cpu-${style}-${level}`, {
        cards: styleIndex % 2 === 0 ? hand("AS", "KS") : hand("7S", "2C"),
        computerStyle: style,
        computerLevel: level,
        streetContribution: levelIndex === 0 ? 0 : 5000,
      });
      const state = actionState({
        players: [
          player("human", { isHuman: true, cards: hand("2S", "2H"), streetContribution: 5000 }),
          actor,
          player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 5000 }),
        ],
        currentPlayerIndex: 1,
        pendingIndices: [1, 2, 0],
        streetIndex: styleIndex >= 2 ? 2 : 0,
        communityCards: styleIndex >= 2 ? hand("QS", "JS", "4S", "3D") : [],
        currentBet: levelIndex === 2 ? 10000 : 5000,
        pot: 24000 + styleIndex * 1000,
        lastAggressorIndex: 0,
        cardPeekPlayerIds: ["human"],
        playerStats: {
          human: {
            actions: 6,
            folds: styleIndex,
            calls: 1,
            checks: 0,
            bets: 2,
            raises: 2,
            aggressiveActions: 4,
            voluntaryChips: 25000,
            showdownOpens: 2,
            showdownMucks: 1,
            showdownWins: 1,
            showdownStrengthTotal: style === "adaptive" ? 40 : 110,
            showdownHoleStrengthTotal: style === "adaptive" ? 40 : 140,
            showdownStrongShows: style === "adaptive" ? 0 : 2,
            showdownWeakShows: style === "adaptive" ? 2 : 0,
            showdownSamples: [],
          },
        },
      });
      assert(typeof chooseComputerAction(state, 1) === "string", `computer action ${style}/${level}`);
      const peekPlan = computerCardPeekPlan(state, 1, 900);
      assert(typeof peekPlan.shouldPeek === "boolean", `peek plan ${style}/${level}`);
    });
  });

  [
    hand("AS", "KS"),
    hand("AS", "QS"),
    hand("AS", "JS"),
    hand("AS", "8C"),
    hand("AS", "5S"),
    hand("7S", "2C"),
  ].forEach((cards, index) => {
    const state = actionState({
      players: [
        player("human", { isHuman: true, cards: hand("2S", "2H"), streetContribution: 5000 }),
        player(`cpu-gap-${index}`, { cards, streetContribution: 5000, computerStyle: "balanced", computerLevel: "advanced" }),
        player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 5000 }),
      ],
      currentPlayerIndex: 1,
      pendingIndices: [1, 2, 0],
      currentBet: 5000,
    });
    assert(typeof chooseComputerAction(state, 1) === "string", `preflop gap branch ${index}`);
  });

  ["balanced", "cautious", "aggressive", "adaptive", "chaotic"].forEach((style) => {
    const state = actionState({
      players: [
        player("human", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 10000 }),
        player(`cpu-post-${style}`, {
          cards: style === "cautious" ? hand("AS", "AH") : hand("9S", "8S"),
          streetContribution: 5000,
          computerStyle: style,
          computerLevel: "advanced",
        }),
        player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 10000 }),
      ],
      currentPlayerIndex: 1,
      pendingIndices: [1, 2, 0],
      streetIndex: 2,
      communityCards: style === "balanced" ? hand("AC", "KD", "7H", "2C") : hand("QS", "JS", "4S", "4D"),
      currentBet: 10000,
      pot: 45000,
      lastAggressorIndex: 0,
      cardPeekPlayerIds: ["human"],
      playerStats: {
        human: {
          actions: 5,
          folds: 3,
          calls: 1,
          checks: 0,
          bets: 1,
          raises: 0,
          aggressiveActions: 1,
          voluntaryChips: 10000,
          showdownOpens: 2,
          showdownMucks: 1,
          showdownWins: 0,
          showdownStrengthTotal: style === "adaptive" ? 60 : 30,
          showdownHoleStrengthTotal: style === "adaptive" ? 80 : 40,
          showdownStrongShows: style === "adaptive" ? 2 : 0,
          showdownWeakShows: style === "adaptive" ? 0 : 2,
          showdownSamples: [],
        },
      },
    });
    assert(typeof chooseComputerAction(state, 1) === "string", `postflop board branch ${style}`);
  });

  [
    {
      label: "straight texture and small call share",
      board: hand("2S", "3H", "4D"),
      actorCards: hand("AS", "5S"),
      playerCount: 3,
      currentBet: 7000,
      streetContribution: 5000,
      chipBalance: 95000,
      pot: 65000,
      lastAggressorStats: { actions: 3, aggressiveActions: 1, raises: 0 },
    },
    {
      label: "four-run texture and multiway pressure",
      board: hand("2S", "3H", "4D", "5C"),
      actorCards: hand("9S", "9D"),
      playerCount: 6,
      currentBet: 30000,
      streetContribution: 0,
      chipBalance: 30000,
      pot: 40000,
      lastAggressorStats: { actions: 4, aggressiveActions: 3, raises: 2 },
    },
    {
      label: "paired flush-pressure board",
      board: hand("QS", "JS", "4S", "4D"),
      actorCards: hand("AS", "2C"),
      playerCount: 4,
      currentBet: 10000,
      streetContribution: 0,
      chipBalance: 15000,
      pot: 25000,
      lastAggressorStats: { actions: 5, aggressiveActions: 1, raises: 0 },
    },
  ].forEach((scenario, scenarioIndex) => {
    const opponents = Array.from({ length: scenario.playerCount - 2 }, (_, index) =>
      player(`cpu-extra-${scenarioIndex}-${index}`, {
        cards: index % 2 === 0 ? hand("KD", "KC") : hand("7D", "6D"),
        streetContribution: scenario.currentBet,
        totalContribution: scenario.currentBet,
      }),
    );
    const state = actionState({
      players: [
        player("human", { isHuman: true, cards: hand("2D", "7C"), streetContribution: scenario.currentBet, totalContribution: scenario.currentBet }),
        player(`cpu-texture-${scenarioIndex}`, {
          cards: scenario.actorCards,
          streetContribution: scenario.streetContribution,
          totalContribution: scenario.streetContribution,
          chipBalance: scenario.chipBalance,
          computerStyle: scenarioIndex === 2 ? "adaptive" : "balanced",
          computerLevel: "advanced",
        }),
        player("cpu-last-aggressor", { cards: hand("QD", "QC"), streetContribution: scenario.currentBet, totalContribution: scenario.currentBet }),
        ...opponents,
      ],
      currentPlayerIndex: 1,
      pendingIndices: [1, 2, 0, ...opponents.map((_, index) => index + 3)],
      streetIndex: scenario.board.length === 3 ? 1 : 2,
      communityCards: scenario.board,
      currentBet: scenario.currentBet,
      pot: scenario.pot,
      lastAggressorIndex: 2,
      cardPeekPlayerIds: new Set(["human", "cpu-last-aggressor"]),
      playerStats: {
        "cpu-last-aggressor": {
          folds: 0,
          calls: 1,
          checks: 0,
          bets: 1,
          voluntaryChips: 20000,
          showdownOpens: 0,
          showdownMucks: 0,
          showdownWins: 0,
          showdownStrengthTotal: 0,
          showdownHoleStrengthTotal: 0,
          showdownStrongShows: 0,
          showdownWeakShows: 0,
          showdownSamples: [],
          ...scenario.lastAggressorStats,
        },
      },
    });
    assert(typeof chooseComputerAction(state, 1) === "string", `texture computer branch ${scenario.label}`);
    assert(typeof computerCardPeekPlan(state, 1, 1200).shouldPeek === "boolean", `texture peek branch ${scenario.label}`);
  });

  [
    { label: "tiny call share", opponentCount: 6, streetContribution: 5000, currentBet: 6000, chipBalance: 95000 },
    { label: "quarter call share", opponentCount: 2, streetContribution: 5000, currentBet: 6000, chipBalance: 95000 },
    { label: "third call share", opponentCount: 1, streetContribution: 5000, currentBet: 6000, chipBalance: 95000 },
    { label: "short all-in call", opponentCount: 6, streetContribution: 0, currentBet: 5000, chipBalance: 1000 },
    { label: "heads-up full stack call", opponentCount: 1, streetContribution: 0, currentBet: 5000, chipBalance: 1000 },
    { label: "large stack commitment", opponentCount: 2, streetContribution: 5000, currentBet: 6000, chipBalance: 1250 },
  ].forEach((scenario, scenarioIndex) => {
    const extraOpponents = Array.from({ length: scenario.opponentCount }, (_, index) =>
      player(`cpu-call-extra-${scenarioIndex}-${index}`, {
        cards: index % 2 === 0 ? hand("JD", "JC") : hand("9D", "9C"),
        streetContribution: scenario.currentBet,
        totalContribution: scenario.currentBet,
      }),
    );
    const state = actionState({
      players: [
        player("human-call-lead", {
          isHuman: true,
          cards: hand("2D", "7C"),
          streetContribution: scenario.currentBet,
          totalContribution: scenario.currentBet,
        }),
        player(`cpu-call-${scenarioIndex}`, {
          cards: hand("AS", "QS"),
          streetContribution: scenario.streetContribution,
          totalContribution: scenario.streetContribution,
          chipBalance: scenario.chipBalance,
          computerStyle: "balanced",
          computerLevel: "advanced",
        }),
        ...extraOpponents,
      ],
      currentPlayerIndex: 1,
      pendingIndices: [1, 0, ...extraOpponents.map((_, index) => index + 2)],
      currentBet: scenario.currentBet,
      pot: scenario.currentBet * (scenario.opponentCount + 2),
      lastAggressorIndex: 0,
    });
    assert(typeof chooseComputerAction(state, 1) === "string", `call pressure branch ${scenario.label}`);
  });

  const zeroChipPressureState = actionState({
    players: [
      player("human", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 5000 }),
      player("cpu-zero-chip", {
        cards: hand("AS", "AH"),
        chipBalance: 0,
        streetContribution: 0,
        computerStyle: "balanced",
        computerLevel: "advanced",
      }),
    ],
    currentPlayerIndex: 1,
    pendingIndices: [1, 0],
    currentBet: 5000,
    pot: 10000,
    lastAggressorIndex: -1,
  });
  assert(chooseComputerAction(zeroChipPressureState, 1) === "fold", "computer without callable chips should fold to pressure");

  [
    {
      label: "no last aggressor",
      lastAggressorIndex: -1,
      lastAggressorStats: {},
    },
    {
      label: "quiet computer aggressor",
      lastAggressorIndex: 2,
      lastAggressorStats: {},
    },
    {
      label: "moderately aggressive computer",
      lastAggressorIndex: 2,
      lastAggressorStats: { actions: 5, aggressiveActions: 2, raises: 1 },
    },
    {
      label: "single sharp computer action",
      lastAggressorIndex: 2,
      lastAggressorStats: { actions: 2, aggressiveActions: 1, raises: 0 },
    },
  ].forEach((scenario, scenarioIndex) => {
    const state = actionState({
      players: [
        player("human-call-source", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 5000, totalContribution: 5000 }),
        player(`cpu-bluff-catch-${scenarioIndex}`, {
          cards: hand("AS", "QS"),
          streetContribution: 0,
          totalContribution: 0,
          chipBalance: 95000,
          computerStyle: "balanced",
          computerLevel: "advanced",
        }),
        player("cpu-last-source", { cards: hand("QD", "QC"), streetContribution: 5000, totalContribution: 5000 }),
      ],
      currentPlayerIndex: 1,
      pendingIndices: [1, 2, 0],
      currentBet: 5000,
      pot: 15000,
      lastAggressorIndex: scenario.lastAggressorIndex,
      playerStats: {
        "cpu-last-source": {
          actions: 0,
          folds: 0,
          calls: 0,
          checks: 0,
          bets: 0,
          raises: 0,
          aggressiveActions: 0,
          voluntaryChips: 0,
          showdownOpens: 0,
          showdownMucks: 0,
          showdownWins: 0,
          showdownStrengthTotal: 0,
          showdownHoleStrengthTotal: 0,
          showdownStrongShows: 0,
          showdownWeakShows: 0,
          showdownSamples: [],
          ...scenario.lastAggressorStats,
        },
      },
    });
    assert(typeof chooseComputerAction(state, 1) === "string", `bluff-catch profile branch ${scenario.label}`);
  });

  [
    {
      label: "vulnerable pair call",
      streetIndex: 1,
      currentBet: 10000,
      streetContribution: 5000,
      board: hand("AS", "9S", "6S"),
    },
    {
      label: "river high-card call",
      streetIndex: 3,
      currentBet: 10000,
      streetContribution: 5000,
      board: hand("AS", "KD", "QH", "9S", "4C"),
    },
    {
      label: "vulnerable pair open",
      streetIndex: 1,
      currentBet: 0,
      streetContribution: 0,
      board: hand("AS", "9S", "6S"),
    },
  ].forEach((scenario) => {
    const state = actionState({
      players: [
        player("human-texture", { isHuman: true, cards: hand("2D", "7C"), streetContribution: scenario.currentBet, totalContribution: scenario.currentBet }),
        player(`cpu-${scenario.label}`, {
          cards: scenario.label === "river high-card call" ? hand("2D", "7C") : hand("9D", "2C"),
          streetContribution: scenario.streetContribution,
          totalContribution: scenario.streetContribution,
          chipBalance: 95000,
          computerStyle: "balanced",
          computerLevel: "advanced",
        }),
        player("cpu-texture-x", { cards: hand("JD", "JC"), streetContribution: scenario.currentBet, totalContribution: scenario.currentBet }),
        player("cpu-texture-y", { cards: hand("8D", "8C"), streetContribution: scenario.currentBet, totalContribution: scenario.currentBet }),
      ],
      currentPlayerIndex: 1,
      pendingIndices: [1, 2, 3, 0],
      streetIndex: scenario.streetIndex,
      communityCards: scenario.board,
      currentBet: scenario.currentBet,
      pot: Math.max(12000, scenario.currentBet * 4),
      lastAggressorIndex: 0,
    });
    assert(typeof chooseComputerAction(state, 1) === "string", `board texture branch ${scenario.label}`);
  });

  const noStatsAdaptiveState = actionState({
    players: [
      player("human", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 0 }),
      player("cpu-adaptive-quiet", {
        cards: hand("AS", "KS"),
        streetContribution: 0,
        computerStyle: "adaptive",
        computerLevel: "advanced",
      }),
    ],
    currentPlayerIndex: 1,
    pendingIndices: [1, 0],
    currentBet: 0,
    pot: 10000,
    lastAggressorIndex: -1,
    playerStats: {},
  });
  delete noStatsAdaptiveState.cardPeekPlayerIds;
  assert(typeof chooseComputerAction(noStatsAdaptiveState, 1) === "string", "adaptive style without patterns should keep base style");

  const passiveAdaptiveState = actionState({
    players: [
      player("human-passive", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 5000 }),
      player("cpu-adaptive-passive", {
        cards: hand("KS", "QS"),
        streetContribution: 0,
        computerStyle: "adaptive",
        computerLevel: "advanced",
      }),
      player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 5000 }),
    ],
    currentPlayerIndex: 1,
    pendingIndices: [1, 2, 0],
    currentBet: 5000,
    pot: 22000,
    lastAggressorIndex: 0,
    playerStats: {
      "human-passive": {
        actions: 8,
        folds: 1,
        calls: 5,
        checks: 2,
        bets: 0,
        raises: 0,
        aggressiveActions: 0,
        voluntaryChips: 18000,
        showdownOpens: 0,
        showdownMucks: 0,
        showdownWins: 0,
        showdownStrengthTotal: 0,
        showdownHoleStrengthTotal: 0,
        showdownStrongShows: 0,
        showdownWeakShows: 0,
        showdownSamples: [],
      },
    },
  });
  assert(typeof chooseComputerAction(passiveAdaptiveState, 1) === "string", "adaptive style should tighten against passive fields");

  [
    { label: "heads-up first", totalPlayers: 2, pendingIndices: [1, 0] },
    { label: "late quarter", totalPlayers: 5, pendingIndices: [0, 2, 3, 1, 4] },
    { label: "middle half", totalPlayers: 5, pendingIndices: [0, 2, 1, 3, 4] },
    { label: "early three-quarter", totalPlayers: 5, pendingIndices: [0, 1, 2, 3, 4] },
  ].forEach((scenario, scenarioIndex) => {
    const players = [
      player("human-position", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 5000 }),
      player(`cpu-position-${scenarioIndex}`, {
        cards: hand("AS", "QS"),
        streetContribution: 0,
        computerStyle: "balanced",
        computerLevel: "advanced",
      }),
      ...Array.from({ length: scenario.totalPlayers - 2 }, (_, index) =>
        player(`cpu-position-extra-${scenarioIndex}-${index}`, {
          cards: index % 2 === 0 ? hand("JD", "JC") : hand("9D", "9C"),
          streetContribution: 5000,
        }),
      ),
    ];
    const state = actionState({
      players,
      currentPlayerIndex: 1,
      pendingIndices: scenario.pendingIndices,
      currentBet: 5000,
      pot: 5000 * players.length,
      lastAggressorIndex: 0,
    });
    assert(typeof chooseComputerAction(state, 1) === "string", `position context branch ${scenario.label}`);
  });

  const cautiousNoWagerState = actionState({
    players: [
      player("human", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 15000 }),
      player("cpu-cautious-no-wager", {
        cards: hand("AS", "AH"),
        streetContribution: 15000,
        totalContribution: 99000,
        computerStyle: "cautious",
        computerLevel: "advanced",
      }),
      player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 15000 }),
    ],
    currentPlayerIndex: 1,
    pendingIndices: [1, 2, 0],
    currentBet: 15000,
    pot: 45000,
    lastAggressorIndex: 0,
  });
  assert(typeof chooseComputerAction(cautiousNoWagerState, 1) === "string", "cautious pressure should tolerate no aggressive action");

  const cautiousPremiumOpenState = actionState({
    players: [
      player("human", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 0 }),
      player("cpu-cautious-premium", {
        cards: hand("AS", "AH"),
        streetContribution: 0,
        computerStyle: "cautious",
        computerLevel: "advanced",
      }),
      player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 0 }),
    ],
    currentPlayerIndex: 1,
    pendingIndices: [1, 2, 0],
    currentBet: 0,
    pot: 12000,
    lastAggressorIndex: -1,
  });
  assert(chooseComputerAction(cautiousPremiumOpenState, 1) === "bet", "cautious premium hand should value bet");

  const cautiousPremiumCallState = actionState({
    players: [
      player("human", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 15000 }),
      player("cpu-cautious-call", {
        cards: hand("AS", "AH"),
        streetContribution: 10000,
        computerStyle: "cautious",
        computerLevel: "advanced",
      }),
      player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 15000 }),
    ],
    currentPlayerIndex: 1,
    pendingIndices: [1, 2, 0],
    currentBet: 15000,
    pot: 45000,
    lastAggressorIndex: 0,
  });
  assert(chooseComputerAction(cautiousPremiumCallState, 1) === "call", "cautious strong hand should call capped pressure");

  const adaptiveNoAggressorPatternState = actionState({
    players: [
      player("human-calm", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 5000 }),
      player("cpu-adaptive-no-counter", {
        cards: hand("KS", "QS"),
        streetContribution: 0,
        computerStyle: "adaptive",
        computerLevel: "advanced",
      }),
      player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 5000 }),
    ],
    currentPlayerIndex: 1,
    pendingIndices: [1, 2, 0],
    currentBet: 5000,
    pot: 22000,
    lastAggressorIndex: 0,
    playerStats: {
      "human-calm": {
        actions: 5,
        folds: 1,
        calls: 3,
        checks: 1,
        bets: 0,
        raises: 0,
        aggressiveActions: 0,
        voluntaryChips: 15000,
        showdownOpens: 0,
        showdownMucks: 0,
        showdownWins: 0,
        showdownStrengthTotal: 0,
        showdownHoleStrengthTotal: 0,
        showdownStrongShows: 0,
        showdownWeakShows: 0,
        showdownSamples: [],
      },
    },
    cardPeekPlayerIds: [],
  });
  assert(typeof chooseComputerAction(adaptiveNoAggressorPatternState, 1) === "string", "adaptive counter should ignore calm aggressor");

  const aggressiveOpenState = actionState({
    players: [
      player("human", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 0 }),
      player("cpu-open", {
        cards: hand("KS", "QS"),
        streetContribution: 0,
        computerStyle: "aggressive",
        computerLevel: "advanced",
      }),
      player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 0 }),
    ],
    currentPlayerIndex: 1,
    pendingIndices: [1, 2, 0],
    currentBet: 0,
    pot: 10000,
    lastAggressorIndex: -1,
  });
  assert(chooseComputerAction(aggressiveOpenState, 1) === "bet", "strong aggressive hand should open bet");

  const noCallActionState = actionState({
    players: [
      player("human", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 5000 }),
      player("cpu-no-call", {
        cards: hand("AS", "AH"),
        chipBalance: 0,
        streetContribution: 0,
        computerStyle: "aggressive",
        computerLevel: "advanced",
      }),
      player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 5000 }),
    ],
    currentPlayerIndex: 1,
    pendingIndices: [1, 2, 0],
    currentBet: 5000,
    pot: 15000,
    lastAggressorIndex: 0,
  });
  assert(chooseComputerAction(noCallActionState, 1) === "fold", "computer should fold when facing a bet without a call action");

  for (let seedIndex = 0; seedIndex < 100; seedIndex += 1) {
    const noWeightedChaosActionState = actionState({
      handId: `chaos-no-actions-${seedIndex}`,
      players: [
        player("cpu-chaos-no-actions", {
          cards: hand("7S", "2C"),
          actionLocked: true,
          computerStyle: "chaotic",
          computerLevel: "beginner",
        }),
        player("human", { isHuman: true, folded: true }),
      ],
      currentPlayerIndex: 0,
      pendingIndices: [],
      currentBet: 0,
      pot: 5000,
    });
    assert(chooseComputerAction(noWeightedChaosActionState, 0) === "fold", "chaotic weighted choice should tolerate no available actions");
  }

  const invalidMemoryPlan = computerCardPeekPlan(
    actionState({
      players: [player("cpu-invalid-memory", { cards: [null, null] }), player("human", { isHuman: true })],
      currentPlayerIndex: 0,
      pendingIndices: [0, 1],
    }),
    0,
  );
  assert(typeof invalidMemoryPlan.shouldPeek === "boolean", "invalid computer cards should still produce a peek plan");

  let sawCheckedComputerSkipPeek = false;
  for (let seedIndex = 0; seedIndex < 60; seedIndex += 1) {
    const checkedState = actionState({
      handId: `checked-peek-${seedIndex}`,
      players: [player("cpu-checked", { cards: hand("7S", "2C"), computerStyle: "aggressive" }), player("human", { isHuman: true })],
      currentPlayerIndex: 0,
      pendingIndices: [0, 1],
      computerCardCheckedPlayerIds: new Set(["cpu-checked"]),
    });
    if (!computerCardPeekPlan(checkedState, 0, 900).shouldPeek) {
      sawCheckedComputerSkipPeek = true;
      break;
    }
  }
  assert(sawCheckedComputerSkipPeek, "checked computer should sometimes skip repeat peeking");

  let sawChaoticOverride = false;
  for (let seedIndex = 0; seedIndex < 80; seedIndex += 1) {
    const chaoticState = actionState({
      handId: `chaos-${seedIndex}`,
      players: [
        player("human", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 5000 }),
        player("cpu-chaos", {
          cards: hand("8S", "3C"),
          streetContribution: 0,
          computerStyle: "chaotic",
          computerLevel: "beginner",
        }),
        player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 5000 }),
      ],
      currentPlayerIndex: 1,
      pendingIndices: [1, 2, 0],
      currentBet: 5000,
      pot: 15000,
      lastAggressorIndex: 2,
    });
    const action = chooseComputerAction(chaoticState, 1);
    if (["call", "raise", "fold"].includes(action)) {
      sawChaoticOverride = true;
    }
  }
  assert(sawChaoticOverride, "chaotic style should exercise weighted override choices");

  let sawChaoticCheckedOverride = false;
  for (let seedIndex = 0; seedIndex < 120; seedIndex += 1) {
    const chaoticCheckedState = actionState({
      handId: `chaos-checked-${seedIndex}`,
      players: [
        player("human", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 0 }),
        player("cpu-chaos-open", {
          cards: hand("8S", "3C"),
          streetContribution: 0,
          computerStyle: "chaotic",
          computerLevel: "beginner",
        }),
        player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 0 }),
      ],
      currentPlayerIndex: 1,
      pendingIndices: [1, 2, 0],
      currentBet: 0,
      streetIndex: 1,
      communityCards: hand("2S", "6H", "10D"),
      pot: 15000,
      lastAggressorIndex: -1,
    });
    const action = chooseComputerAction(chaoticCheckedState, 1);
    if (["bet", "check", "fold"].includes(action)) {
      sawChaoticCheckedOverride = true;
    }
  }
  assert(sawChaoticCheckedOverride, "chaotic style should exercise checked weighted override choices");

  const noActionState = actionState({
    players: [
      player("cpu-only", { cards: hand("7S", "2C"), actionLocked: true, computerStyle: "balanced" }),
      player("human", { isHuman: true, folded: true }),
    ],
    currentPlayerIndex: 0,
    pendingIndices: [],
    currentBet: 0,
  });
  assert(chooseComputerAction(noActionState, 0) === "fold", "computer should fall back when no actions are available");

  const checkFallbackState = actionState({
    players: [
      player("human", { isHuman: true, cards: hand("2D", "7C"), streetContribution: 0 }),
      player("cpu-check", { cards: hand("7S", "2C"), streetContribution: 0, computerStyle: "cautious", computerLevel: "beginner" }),
      player("cpu-x", { cards: hand("QD", "QC"), streetContribution: 0 }),
    ],
    currentPlayerIndex: 1,
    pendingIndices: [1, 2, 0],
    currentBet: 0,
    streetIndex: 1,
    communityCards: hand("AS", "KD", "9H"),
    pot: 15000,
  });
  assert(["check", "bet"].includes(chooseComputerAction(checkFallbackState, 1)), "computer should handle checkable fallback branch");

  const onlyShowState = showdownState({
    players: [player("cpu-show-only", { cards: hand("AS", "AH"), computerStyle: "balanced", computerLevel: "advanced" })],
    revealOrder: ["cpu-show-only"],
    currentPlayerIndex: 0,
  });
  assert(chooseComputerAction(onlyShowState, 0) === "show", "computer should show when muck is unavailable");

  const openedBetterShowdown = applyAction(
    showdownState({
      players: [
        player("opened-strong", { cards: hand("AS", "KS"), totalContribution: 10000 }),
        player("cpu-losing-showdown", { cards: hand("2D", "3C"), totalContribution: 10000, computerStyle: "chaotic", computerLevel: "advanced" }),
      ],
      communityCards: hand("QS", "JS", "10S", "9D", "8C"),
      revealOrder: ["opened-strong", "cpu-losing-showdown"],
      currentPlayerIndex: 0,
    }),
    "show",
    0,
  );
  assert(["show", "muck"].includes(chooseComputerAction(openedBetterShowdown, 1)), "computer should compare against an opened stronger showdown hand");

  const openedKickerShowdown = applyAction(
    showdownState({
      players: [
        player("opened-ace", { cards: hand("AS", "3D"), totalContribution: 10000 }),
        player("cpu-kicker-loser", { cards: hand("KS", "JD"), totalContribution: 10000, computerStyle: "balanced", computerLevel: "advanced" }),
      ],
      communityCards: hand("QS", "9H", "7D", "5C", "2S"),
      revealOrder: ["opened-ace", "cpu-kicker-loser"],
      currentPlayerIndex: 0,
    }),
    "show",
    0,
  );
  assert(["show", "muck"].includes(chooseComputerAction(openedKickerShowdown, 1)), "computer should compare same-score showdown kickers");

  const invalidPeek = computerCardPeekPlan(actionState({ currentPlayerIndex: 0 }), 0);
  assert(!invalidPeek.shouldPeek, "human should not peek as computer");

  ["aggressive", "chaotic", "adaptive"].forEach((style) => {
    let state = showdownState({
      players: [
        player("cpu-a", { cards: hand("AS", "AH"), computerStyle: style, computerLevel: "advanced" }),
        player("cpu-b", { cards: hand("2S", "3H"), computerStyle: "cautious", computerLevel: "beginner" }),
      ],
      revealOrder: ["cpu-a", "cpu-b"],
      currentPlayerIndex: 0,
      playerStats: {
        "cpu-b": {
          actions: 6,
          folds: style === "adaptive" ? 4 : 1,
          calls: 1,
          checks: 0,
          bets: 1,
          raises: 2,
          aggressiveActions: 3,
          voluntaryChips: 30000,
          showdownOpens: 2,
          showdownMucks: 2,
          showdownWins: 0,
          showdownStrengthTotal: style === "adaptive" ? 40 : 120,
          showdownHoleStrengthTotal: style === "adaptive" ? 40 : 140,
          showdownStrongShows: style === "adaptive" ? 0 : 2,
          showdownWeakShows: style === "adaptive" ? 2 : 0,
          showdownSamples: [],
        },
      },
    });
    assert(["show", "muck"].includes(chooseComputerAction(state, 0)), `computer showdown action ${style}`);
    state = applyAction(state, chooseComputerAction(state, 0), 0);
    if (!state.finished) {
      assert(["show", "muck"].includes(chooseComputerAction(state, state.currentPlayerIndex)), `second computer showdown action ${style}`);
    }
  });

  [
    {
      label: "no patterns",
      stats: {},
    },
    {
      label: "passive action pattern",
      stats: {
        actions: 10,
        folds: 1,
        calls: 7,
        checks: 2,
        bets: 0,
        raises: 0,
        aggressiveActions: 0,
      },
    },
    {
      label: "strong showdown pattern",
      stats: {
        actions: 6,
        folds: 3,
        calls: 1,
        checks: 0,
        bets: 1,
        raises: 1,
        aggressiveActions: 2,
        showdownOpens: 2,
        showdownMucks: 0,
        showdownStrengthTotal: 120,
        showdownHoleStrengthTotal: 140,
        showdownStrongShows: 2,
        showdownWeakShows: 0,
      },
    },
  ].forEach((scenario) => {
    const state = showdownState({
      players: [
        player("cpu-adaptive-showdown", { cards: hand("KS", "QH"), computerStyle: "adaptive", computerLevel: "advanced" }),
        player("showdown-opponent", { cards: hand("2S", "3H"), computerStyle: "balanced", computerLevel: "beginner" }),
      ],
      revealOrder: ["cpu-adaptive-showdown", "showdown-opponent"],
      currentPlayerIndex: 0,
      playerStats: {
        "showdown-opponent": {
          actions: 0,
          folds: 0,
          calls: 0,
          checks: 0,
          bets: 0,
          raises: 0,
          aggressiveActions: 0,
          voluntaryChips: 0,
          showdownOpens: 0,
          showdownMucks: 0,
          showdownWins: 0,
          showdownStrengthTotal: 0,
          showdownHoleStrengthTotal: 0,
          showdownStrongShows: 0,
          showdownWeakShows: 0,
          showdownSamples: [],
          ...scenario.stats,
        },
      },
    });
    assert(["show", "muck"].includes(chooseComputerAction(state, 0)), `adaptive showdown adjustment ${scenario.label}`);
  });
}

function exerciseHandLifecycle() {
  assert(createInitialState(1, 100000, true).players.length === 2, "initial state should create players");
  assert(startNewHand({ cpuCount: 1, includeHuman: true, dealerIndex: 0 }).gameOver, "missing chip ledger should eliminate players");
  assert(
    startNewHand({
      cpuCount: 1,
      includeHuman: true,
      dealerIndex: 0,
      chipTotals: {
        human: { chipBalance: 100000, chipsWon: 0 },
        "cpu-1": { chipBalance: 100000, chipsWon: 0 },
      },
      forcedContributions: [
        { playerId: "missing", amount: 5000, label: "누락" },
        { playerId: "human", amount: 0, label: "제로" },
      ],
    }).players.length === 2,
    "invalid forced contributions should be ignored",
  );
  assert(
    startNewHand({
      cpuCount: 1,
      includeHuman: true,
      dealerIndex: 0,
      chipTotals: {
        human: 100000,
        "cpu-1": 100000,
      },
    }).players.every((entry) => entry.chipBalance > 0),
    "numeric chip ledger should be accepted for backward compatibility",
  );
  assert(
    startNewHand({
      cpuCount: 1,
      includeHuman: true,
      dealerIndex: 99,
      chipTotals: {
        human: { chipBalance: 1000, chipsWon: 0 },
        "cpu-1": { chipBalance: 1000, chipsWon: 0 },
      },
      handNumber: 3,
    }).showdownPending,
    "all-in blinds should auto-advance to showdown",
  );
  assert(
    startNewHand({
      cpuCount: 0,
      includeHuman: true,
      dealerIndex: 0,
      chipTotals: { human: { chipBalance: 0, chipsWon: 0 } },
    }).gameOver,
    "game should end with fewer than two playable players",
  );
  assert(
    startNewHand({
      cpuCount: 2,
      includeHuman: false,
      dealerIndex: 99,
      chipTotals: {
        "cpu-1": { chipBalance: 0, chipsWon: 0 },
        "cpu-2": { chipBalance: 50000, chipsWon: 0 },
      },
      playerConfigs: [
        { id: "cpu-1", name: "컴퓨터 1", isHuman: false, startingBalance: 100000 },
        { id: "cpu-2", name: "컴퓨터 2", isHuman: false, startingBalance: 100000 },
      ],
      endlessMode: true,
      handNumber: 2,
      endlessReplacementComputerStyle: "aggressive",
      endlessReplacementComputerLevel: "advanced",
      endlessReplacementStartingBalance: 120000,
      forcedContributions: [{ playerId: "cpu-2", amount: 7000, label: "미스드 블라인드" }],
    }).players.some((entry) => entry.id.startsWith("cpu-endless")),
    "endless mode should replace eliminated computer",
  );

  const oneActionableStreetState = actionState({
    players: [
      player("all-in-a", { actionLocked: true, streetContribution: 5000, totalContribution: 5000, chipBalance: 0 }),
      player("all-in-b", { actionLocked: true, streetContribution: 5000, totalContribution: 5000, chipBalance: 0 }),
    ],
    currentPlayerIndex: -1,
    pendingIndices: [],
    streetIndex: 0,
    currentBet: 5000,
    waitingForHuman: false,
  });
  const advancedAllIn = applyAction(oneActionableStreetState, "check", 0);
  assert(advancedAllIn === oneActionableStreetState, "locked all-in action should not mutate state");
}

exerciseBasics();
exercisePreflop();
exerciseHandEvaluation();
exerciseWinRate();
exerciseActions();
exerciseShowdown();
exerciseComputerDecisions();
exerciseHandLifecycle();

console.log("포커 authored-code coverage exercise 통과");
