const SUITS = ["S", "H", "D", "C"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export const MIN_PLAYABLE_BALANCE = 1;
const DEFAULT_ENDLESS_REPLACEMENT_BALANCE = 100000;
const MAX_SHOWDOWN_SAMPLES = 12;
export const RANDOM_COMPUTER_STYLE_KEY = "random";
export const RANDOM_COMPUTER_STYLE_OPTION = {
  key: RANDOM_COMPUTER_STYLE_KEY,
  label: "랜덤",
  description: "게임 시작 시 기본형, 신중형, 공격형, 적응형, 혼돈형 중 하나로 무작위 확정합니다.",
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
    foldBelow: 52,
    wagerAbove: 74,
    openBetAbove: 38,
    hardFoldBelow: 26,
    pressureTolerance: 5,
    openingPressure: 4,
    bluffCatchBonus: 8,
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
  {
    key: "chaotic",
    label: "혼돈형",
    description: "판단 기준의 흔들림이 크고 같은 상황에서도 예측하기 어려운 행동을 선택합니다.",
    foldBelow: 44,
    wagerAbove: 66,
    openBetAbove: 26,
    hardFoldBelow: 14,
    pressureTolerance: 10,
    openingPressure: 12,
    bluffCatchBonus: 14,
    variance: 24,
    chaosRate: 0.28,
  },
];
export const COMPUTER_STYLE_OPTIONS = [RANDOM_COMPUTER_STYLE_OPTION, ...COMPUTER_STYLES];

export const RANDOM_COMPUTER_LEVEL_KEY = "random";
export const RANDOM_COMPUTER_LEVEL_OPTION = {
  key: RANDOM_COMPUTER_LEVEL_KEY,
  label: "랜덤",
  description: "게임 시작 시 초급, 중급, 고급 중 하나로 무작위 확정합니다.",
};

export const COMPUTER_LEVELS = [
  {
    key: "beginner",
    label: "초급",
    description: "자기 패 강도 위주로 판단하고 순번, 팟 규모, 상대 패턴 반영이 약합니다.",
    positionWeight: 0.35,
    callContextWeight: 0.55,
    opponentWeight: 0.2,
    drawWeight: 0.15,
    openingWeight: 0.65,
    varianceWeight: 1.35,
    noiseRange: 12,
    mistakeRate: 0.14,
    mistakeSwing: 14,
  },
  {
    key: "intermediate",
    label: "중급",
    description: "패 강도, 콜 비용, 행동 순번, 상대 패턴을 균형 있게 반영합니다.",
    positionWeight: 1,
    callContextWeight: 1,
    opponentWeight: 1,
    drawWeight: 0.45,
    openingWeight: 1,
    varianceWeight: 1,
    noiseRange: 5,
    mistakeRate: 0.05,
    mistakeSwing: 8,
  },
  {
    key: "advanced",
    label: "고급",
    description: "총 인원 대비 순번, 실제 콜 비용, 상대 패턴, 드로우 가능성을 더 정교하게 반영합니다.",
    positionWeight: 1.2,
    callContextWeight: 1.15,
    opponentWeight: 1.25,
    drawWeight: 1,
    openingWeight: 1.1,
    varianceWeight: 0.55,
    noiseRange: 2,
    mistakeRate: 0.015,
    mistakeSwing: 5,
  },
];
export const COMPUTER_LEVEL_OPTIONS = [RANDOM_COMPUTER_LEVEL_OPTION, ...COMPUTER_LEVELS];

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
    maxLabel: "₩40,000(캡 포함)",
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
const PREFLOP_RANK_ORDER = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
// 169개 프리플랍 핸드 전체 기준표. 개별 샘플 등수는 테스트 케이스에서만 검증한다.
const PREFLOP_RANKED_HANDS = `
AA KK QQ AKs JJ AQs KQs AJs KJs TT AKo ATs QJs KTs QTs JTs 99 AQo A9s KQo
88 K9s T9s A8s Q9s J9s AJo A5s 77 A7s KJo A4s A3s A6s QJo 66 K8s T8s A2s 98s
J8s ATo Q8s K7s KTo 55 JTo 87s QTo 44 33 22 K6s 97s K5s 76s T7s K4s K2s K3s
Q7s 86s 65s J7s 54s Q6s 75s 96s Q5s 64s Q4s Q3s T9o T6s Q2s A9o 53s 85s J6s J9o
K9o J5s Q9o 43s 74s J4s J3s 95s J2s 63s A8o 52s T5s 84s T4s T3s 42s T2s 98o T8o
A5o A7o 73s A4o 32s 94s 93s J8o A3o 62s 92s K8o A6o 87o Q8o 83s A2o 82s 97o 72s
76o K7o 65o T7o K6o 86o 54o K5o J7o 75o Q7o K4o K3o 96o K2o 64o Q6o 53o 85o T6o
Q5o 43o Q4o Q3o 74o Q2o J6o 63o J5o 95o 52o J4o J3o 42o J2o 84o T5o T4o 32o T3o
73o T2o 62o 94o 93o 92o 83o 82o 72o
`
  .trim()
  .split(/\s+/);
export const PREFLOP_RANK_TEST_CASES = {
  AA: 1,
  AKs: 4,
  AKo: 11,
  QJs: 13,
  A2s: 39,
  J8s: 41,
  QTo: 49,
  "22": 52,
  "72s": 120,
  "82o": 168,
  "72o": 169,
};
const PREFLOP_NICKNAMES = {
  AA: "로켓",
  KK: "카우보이",
  QQ: "레이디스",
  JJ: "후크",
  TT: "다임",
  "99": "웨인 그레츠키",
  "88": "스노우맨",
  "77": "하키 스틱",
  "55": "스피드 리밋",
  "44": "세일보트",
  "33": "크랩스",
  "22": "듀스",
  AKs: "빅 슬릭",
  AKo: "빅 슬릭",
  AQs: "빅 칙",
  AQo: "빅 칙",
  AJs: "블랙잭",
  AJo: "블랙잭",
  KQs: "로열 커플",
  KQo: "로열 커플",
  QJs: "매버릭",
};
const PREFLOP_RANK_MAP = buildPreflopRankMap();

function rankValue(rank) {
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  if (rank === "T") return 10;
  return Number(rank);
}

export function formatMoney(value) {
  return `₩${Number(value ?? 0).toLocaleString("ko-KR")}`;
}

function formatActionAmount(actionLabel, amount, allIn = false) {
  return `${actionLabel}(${formatMoney(amount)}${allIn ? " 올인" : ""})`;
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

function getComputerLevel(levelKey) {
  return COMPUTER_LEVELS.find((level) => level.key === levelKey) ?? COMPUTER_LEVELS[1];
}

export function resolveComputerStyleKey(styleKey) {
  if (styleKey === RANDOM_COMPUTER_STYLE_KEY) {
    return COMPUTER_STYLES[Math.floor(Math.random() * COMPUTER_STYLES.length)].key;
  }
  return getComputerStyle(styleKey).key;
}

export function resolveComputerLevelKey(levelKey) {
  if (levelKey === RANDOM_COMPUTER_LEVEL_KEY) {
    return COMPUTER_LEVELS[Math.floor(Math.random() * COMPUTER_LEVELS.length)].key;
  }
  return getComputerLevel(levelKey).key;
}

function buildComputerStyleMap(cpuCount, computerStyles = {}, fallbackStyle = RANDOM_COMPUTER_STYLE_KEY) {
  return buildComputerStyleMapForPlayers(createPlayers(cpuCount, false), computerStyles, fallbackStyle);
}

function buildComputerStyleMapForPlayers(players, computerStyles = {}, fallbackStyle = RANDOM_COMPUTER_STYLE_KEY) {
  const fallback = fallbackStyle === RANDOM_COMPUTER_STYLE_KEY ? RANDOM_COMPUTER_STYLE_KEY : getComputerStyle(fallbackStyle).key;
  const styleMap = computerStyles && typeof computerStyles === "object" ? computerStyles : {};
  return Object.fromEntries(
    players.filter((player) => !player.isHuman).map((player) => [player.id, resolveComputerStyleKey(styleMap[player.id] ?? fallback)]),
  );
}

function buildComputerLevelMap(cpuCount, computerLevels = {}, fallbackLevel = RANDOM_COMPUTER_LEVEL_KEY) {
  return buildComputerLevelMapForPlayers(createPlayers(cpuCount, false), computerLevels, fallbackLevel);
}

function buildComputerLevelMapForPlayers(players, computerLevels = {}, fallbackLevel = RANDOM_COMPUTER_LEVEL_KEY) {
  const fallback = fallbackLevel === RANDOM_COMPUTER_LEVEL_KEY ? RANDOM_COMPUTER_LEVEL_KEY : getComputerLevel(fallbackLevel).key;
  const levelMap = computerLevels && typeof computerLevels === "object" ? computerLevels : {};
  return Object.fromEntries(
    players.filter((player) => !player.isHuman).map((player) => [player.id, resolveComputerLevelKey(levelMap[player.id] ?? fallback)]),
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
    showdownOpens: 0,
    showdownMucks: 0,
    showdownWins: 0,
    showdownStrengthTotal: 0,
    showdownHoleStrengthTotal: 0,
    showdownStrongShows: 0,
    showdownWeakShows: 0,
    showdownSamples: [],
  };
}

function normalizePlayerStats(saved = {}) {
  return {
    ...emptyPlayerStats(),
    ...saved,
    showdownSamples: Array.isArray(saved.showdownSamples) ? saved.showdownSamples.slice(-MAX_SHOWDOWN_SAMPLES) : [],
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

function cardMemory(card) {
  return {
    id: card.id,
    rank: card.rank,
    suit: card.suit,
    value: card.value,
  };
}

function buildShowdownResult(player, hand, communityCards) {
  const privateCards = player.cards.map(cardMemory);
  return {
    id: player.id,
    name: player.name,
    label: hand.label,
    score: hand.score,
    tiebreakers: [...hand.tiebreakers],
    strength: showdownStrength(hand),
    privateCards,
    communityCards: communityCards.map(cardMemory),
    holeStrength: preflopStrength(privateCards),
  };
}

function updateShowdownStats(stats, showdownResults = [], muckIds = [], winnerIds = []) {
  const nextStats = { ...stats };
  const winnerIdSet = new Set(winnerIds);

  showdownResults.forEach((result) => {
    const playerStats = normalizePlayerStats(nextStats[result.id]);
    const strength = Number(result.strength ?? result.score * 15 + (result.tiebreakers?.[0] ?? 0));
    const holeStrength = Number(result.holeStrength ?? (Array.isArray(result.privateCards) ? preflopStrength(result.privateCards) : 0));
    playerStats.showdownOpens += 1;
    playerStats.showdownStrengthTotal += strength;
    playerStats.showdownHoleStrengthTotal += holeStrength;
    if ((result.score ?? 0) >= 2) {
      playerStats.showdownStrongShows += 1;
    }
    if ((result.score ?? 0) <= 1) {
      playerStats.showdownWeakShows += 1;
    }
    if (winnerIdSet.has(result.id)) {
      playerStats.showdownWins += 1;
    }
    playerStats.showdownSamples = [
      ...playerStats.showdownSamples,
      {
        privateCards: Array.isArray(result.privateCards) ? result.privateCards.map(cardMemory) : [],
        label: result.label,
        score: result.score ?? 0,
        strength,
        holeStrength,
        won: winnerIdSet.has(result.id),
      },
    ].slice(-MAX_SHOWDOWN_SAMPLES);
    nextStats[result.id] = playerStats;
  });

  muckIds.forEach((id) => {
    const playerStats = normalizePlayerStats(nextStats[id]);
    playerStats.showdownMucks += 1;
    nextStats[id] = playerStats;
  });

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

function normalizeStartingBalance(value, fallback = DEFAULT_ENDLESS_REPLACEMENT_BALANCE) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= MIN_PLAYABLE_BALANCE ? numericValue : fallback;
}

function normalizePlayerConfig(config, index) {
  const isHuman = Boolean(config.isHuman);
  return {
    id: config.id ?? (isHuman ? "human" : `cpu-${index + 1}`),
    name: config.name ?? (isHuman ? "플레이어" : `컴퓨터 ${index + 1}`),
    isHuman,
    startingBalance: normalizeStartingBalance(config.startingBalance),
  };
}

function computerNameNumber(name) {
  const match = /^컴퓨터\s+(\d+)$/.exec(String(name ?? "").trim());
  return match ? Number(match[1]) : 0;
}

function prepareEndlessReplacements({
  playerConfigs,
  chipTotals,
  computerStyles,
  computerLevels,
  endlessMode,
  endlessReplacementComputerStyle,
  endlessReplacementComputerLevel,
  endlessReplacementStartingBalance,
  handNumber,
}) {
  const normalizedConfigs = playerConfigs.map(normalizePlayerConfig);
  if (!endlessMode || handNumber <= 1) {
    return {
      playerConfigs: normalizedConfigs,
      chipTotals,
      computerStyles,
      computerLevels,
      replacementLog: [],
    };
  }

  const nextChipTotals = { ...(chipTotals ?? {}) };
  const nextComputerStyles = { ...(computerStyles ?? {}) };
  const nextComputerLevels = { ...(computerLevels ?? {}) };
  const replacementLog = [];
  let nextComputerNumber = normalizedConfigs.reduce((max, config) => Math.max(max, computerNameNumber(config.name)), 0) + 1;
  const nextPlayerConfigs = normalizedConfigs.map((config, index) => {
    const ledger = readChipLedger(nextChipTotals[config.id]);
    if (ledger.chipBalance >= MIN_PLAYABLE_BALANCE) {
      return config;
    }

    const replacementBalance = normalizeStartingBalance(endlessReplacementStartingBalance, config.startingBalance);
    const replacementId = `cpu-endless-${handNumber}-${index + 1}`;
    const replacementName = `컴퓨터 ${nextComputerNumber}`;
    nextComputerNumber += 1;
    const replacementConfig = {
      id: replacementId,
      name: replacementName,
      isHuman: false,
      startingBalance: replacementBalance,
    };
    nextChipTotals[replacementId] = {
      chipBalance: replacementBalance,
      chipsWon: 0,
    };
    nextComputerStyles[replacementId] = resolveComputerStyleKey(endlessReplacementComputerStyle ?? RANDOM_COMPUTER_STYLE_KEY);
    nextComputerLevels[replacementId] = resolveComputerLevelKey(endlessReplacementComputerLevel ?? RANDOM_COMPUTER_LEVEL_KEY);
    replacementLog.push(`${config.name}: 엔들리스 모드로 ${replacementName} 입장 (${formatMoney(replacementBalance)})`);
    return replacementConfig;
  });

  return {
    playerConfigs: nextPlayerConfigs,
    chipTotals: nextChipTotals,
    computerStyles: nextComputerStyles,
    computerLevels: nextComputerLevels,
    replacementLog,
  };
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
    computerLevels: buildComputerLevelMap(cpuCount),
  });
}

export function startNewHand({
  cpuCount,
  includeHuman = true,
  dealerIndex,
  chipTotals,
  feeTotal = 0,
  handNumber = 1,
  computerStyle = RANDOM_COMPUTER_STYLE_KEY,
  computerStyles,
  computerLevel = RANDOM_COMPUTER_LEVEL_KEY,
  computerLevels,
  endlessMode = false,
  endlessReplacementComputerStyle = RANDOM_COMPUTER_STYLE_KEY,
  endlessReplacementComputerLevel = RANDOM_COMPUTER_LEVEL_KEY,
  endlessReplacementStartingBalance = DEFAULT_ENDLESS_REPLACEMENT_BALANCE,
  playerStats = {},
  playerConfigs,
}) {
  const deck = shuffleDeck(createDeck());
  const initialPlayerConfigs = Array.isArray(playerConfigs)
    ? playerConfigs
    : createPlayers(cpuCount, includeHuman).map((player) => ({
        id: player.id,
        name: player.name,
        isHuman: player.isHuman,
        startingBalance: chipTotals?.[player.id]?.chipBalance ?? DEFAULT_ENDLESS_REPLACEMENT_BALANCE,
      }));
  const replacementState = prepareEndlessReplacements({
    playerConfigs: initialPlayerConfigs,
    chipTotals,
    computerStyles,
    computerLevels,
    endlessMode,
    endlessReplacementComputerStyle,
    endlessReplacementComputerLevel,
    endlessReplacementStartingBalance,
    handNumber,
  });
  const basePlayers = createPlayers(cpuCount, includeHuman, replacementState.playerConfigs);
  const resolvedPlayerConfigs = replacementState.playerConfigs;
  const resolvedComputerStyles = buildComputerStyleMapForPlayers(basePlayers, replacementState.computerStyles, computerStyle);
  const resolvedComputerLevels = buildComputerLevelMapForPlayers(basePlayers, replacementState.computerLevels, computerLevel);
  const players = basePlayers.map((player) => {
    const ledger = readChipLedger(replacementState.chipTotals?.[player.id]);
    const eliminated = ledger.chipBalance < MIN_PLAYABLE_BALANCE;
    return {
      ...player,
      folded: eliminated,
      eliminated,
      chipBalance: ledger.chipBalance,
      chipsWon: ledger.chipsWon,
      lastAction: eliminated ? "탈락" : "대기",
      computerStyle: player.isHuman ? null : resolvedComputerStyles[player.id],
      computerLevel: player.isHuman ? null : resolvedComputerLevels[player.id],
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
      computerLevels: resolvedComputerLevels,
      endlessMode,
      endlessReplacementComputerStyle,
      endlessReplacementComputerLevel,
      endlessReplacementStartingBalance: normalizeStartingBalance(endlessReplacementStartingBalance),
      playerConfigs: resolvedPlayerConfigs,
      handNumber,
      handId: `hand-${handNumber}`,
      winnerIds: players.filter((player) => !player.eliminated).map((player) => player.id),
      finished: true,
      gameOver: true,
      waitingForHuman: false,
      showdownPending: false,
      revealOrder: [],
      muckIds: [],
      showdownResults: [],
      log: [...eliminationLog, "게임 종료: 진행 가능한 플레이어가 2명 미만입니다."],
      lastAggressorIndex: -1,
      chipTotals: buildChipTotals(players),
      playerStats: resolvedPlayerStats,
      feeTotal,
      note: "잔액이 0원인 플레이어는 탈락 처리됩니다.",
    };
  }

  const normalizedDealerIndex = players[dealerIndex] && !players[dealerIndex].eliminated
    ? dealerIndex
    : nextPlayableIndex(players, dealerIndex - 1);
  const smallBlindIndex = nextPlayableIndex(players, normalizedDealerIndex);
  const bigBlindIndex = nextPlayableIndex(players, smallBlindIndex);
  const firstTurnIndex = nextPlayableIndex(players, bigBlindIndex);

  const smallBlindAmount = postBlind(players[smallBlindIndex], 2000, "스몰 블라인드");
  const bigBlindAmount = postBlind(players[bigBlindIndex], 5000, "빅 블라인드");

  const pendingIndices = actionableActivePlayers(players).length > 1 ? buildPendingOrder(players, firstTurnIndex) : [];

  const initialState = {
    deck,
    players,
    dealerIndex: normalizedDealerIndex,
    smallBlindIndex,
    bigBlindIndex,
    currentPlayerIndex: pendingIndices[0] ?? firstTurnIndex,
    pendingIndices,
    streetIndex: 0,
    communityCards: [],
    pot: smallBlindAmount + bigBlindAmount,
    currentBet: 5000,
    currentHandFee: 0,
    computerStyles: resolvedComputerStyles,
    computerLevels: resolvedComputerLevels,
    endlessMode,
    endlessReplacementComputerStyle,
    endlessReplacementComputerLevel,
    endlessReplacementStartingBalance: normalizeStartingBalance(endlessReplacementStartingBalance),
    playerConfigs: resolvedPlayerConfigs,
    handNumber,
    handId: `hand-${handNumber}`,
    winnerIds: [],
    finished: false,
    gameOver: false,
    waitingForHuman: pendingIndices.length > 0 ? players[pendingIndices[0]].isHuman : false,
    showdownPending: false,
    revealOrder: [],
    muckIds: [],
    showdownResults: [],
    log: [
      ...replacementState.replacementLog,
      ...eliminationLog,
      `새 핸드를 시작했습니다. 스몰 블라인드 ${players[smallBlindIndex].name}: ${formatMoney(smallBlindAmount)}`,
      `빅 블라인드 ${players[bigBlindIndex].name}: ${formatMoney(bigBlindAmount)}`,
      "프리 플랍 (Pre-flop)부터 진행합니다.",
    ],
    lastAggressorIndex: bigBlindIndex,
    chipTotals: buildChipTotals(players),
    playerStats: resolvedPlayerStats,
    feeTotal,
    note: "잔액이 0원인 플레이어는 탈락 처리됩니다.",
  };

  if (pendingIndices.length === 0) {
    return advanceStreet({
      ...initialState,
      currentPlayerIndex: -1,
      waitingForHuman: false,
    });
  }

  return initialState;
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

function preflopRankLabel(value) {
  return value === 10 ? "T" : rankLabel(value);
}

function ordinalLabel(value) {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

function preflopHandKeyFromCards(cards) {
  if (!Array.isArray(cards) || cards.length !== 2 || cards.some((card) => !card)) {
    return "";
  }

  const [a, b] = [...cards].sort((left, right) => {
    if (right.value !== left.value) {
      return right.value - left.value;
    }
    return String(left.suit).localeCompare(String(right.suit));
  });
  if (a.value === b.value) {
    return `${preflopRankLabel(a.value)}${preflopRankLabel(a.value)}`;
  }
  return `${preflopRankLabel(a.value)}${preflopRankLabel(b.value)}${a.suit === b.suit ? "s" : "o"}`;
}

function preflopCategoryLabel(cards) {
  if (!Array.isArray(cards) || cards.length !== 2 || cards.some((card) => !card)) {
    return "";
  }
  if (cards[0].value === cards[1].value) {
    return "포켓";
  }
  return cards[0].suit === cards[1].suit ? "수딧" : "오프수딧";
}

function allPreflopHandKeys() {
  const hands = [];
  PREFLOP_RANK_ORDER.forEach((highRank, highIndex) => {
    hands.push(`${highRank}${highRank}`);
    PREFLOP_RANK_ORDER.slice(highIndex + 1).forEach((lowRank) => {
      hands.push(`${highRank}${lowRank}s`, `${highRank}${lowRank}o`);
    });
  });
  return hands;
}

function buildPreflopRankMap() {
  const allHands = allPreflopHandKeys();
  const allHandSet = new Set(allHands);
  const rankedHandSet = new Set(PREFLOP_RANKED_HANDS);
  if (PREFLOP_RANKED_HANDS.length !== allHands.length || rankedHandSet.size !== allHands.length) {
    throw new Error("프리플랍 랭킹 기준표는 169개의 고유 핸드를 포함해야 합니다.");
  }
  for (const hand of PREFLOP_RANKED_HANDS) {
    if (!allHandSet.has(hand)) {
      throw new Error(`알 수 없는 프리플랍 핸드 랭킹입니다: ${hand}`);
    }
  }

  return new Map(PREFLOP_RANKED_HANDS.map((key, index) => [key, index + 1]));
}

export function describePreflopHand(cards) {
  const key = preflopHandKeyFromCards(cards);
  if (!key) {
    return null;
  }

  const rank = PREFLOP_RANK_MAP.get(key);
  return {
    key,
    rank,
    ordinal: rank ? ordinalLabel(rank) : "",
    total: PREFLOP_RANK_MAP.size,
    category: preflopCategoryLabel(cards),
    nickname: PREFLOP_NICKNAMES[key] ?? "",
  };
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

export function compareEvaluations(a, b) {
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

function seededShuffle(cards, seed) {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(hashToUnit(`${seed}:${index}`) * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function estimateHoldemWinRate({ playerCards, communityCards = [], opponentCount = 1, samples = 600 } = {}) {
  if (!Array.isArray(playerCards) || playerCards.length !== 2 || playerCards.some((card) => !card)) {
    return null;
  }

  const normalizedCommunityCards = Array.isArray(communityCards) ? communityCards.filter(Boolean) : [];
  const normalizedOpponentCount = Math.max(0, Math.floor(Number(opponentCount) || 0));
  if (normalizedOpponentCount === 0) {
    return { equity: 1, percent: 100, samples: 0 };
  }

  const knownCardIds = new Set([...playerCards, ...normalizedCommunityCards].map((card) => card.id));
  const availableDeck = createDeck().filter((card) => !knownCardIds.has(card.id));
  const missingBoardCount = Math.max(0, 5 - normalizedCommunityCards.length);
  const cardsNeeded = normalizedOpponentCount * 2 + missingBoardCount;
  if (availableDeck.length < cardsNeeded) {
    return null;
  }

  const sampleCount = Math.max(1, Math.floor(samples));
  const baseSeed = [...playerCards, ...normalizedCommunityCards]
    .map((card) => card.id)
    .join("-");
  let equityTotal = 0;

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const sampleDeck = seededShuffle(availableDeck, `${baseSeed}:${normalizedOpponentCount}:${sampleIndex}`);
    let cursor = 0;
    const opponentHands = [];
    for (let opponentIndex = 0; opponentIndex < normalizedOpponentCount; opponentIndex += 1) {
      opponentHands.push([sampleDeck[cursor], sampleDeck[cursor + 1]]);
      cursor += 2;
    }

    const board = [...normalizedCommunityCards, ...sampleDeck.slice(cursor, cursor + missingBoardCount)];
    const playerHand = evaluateSevenCards([...playerCards, ...board]);
    let betterOpponentCount = 0;
    let tiedOpponentCount = 0;

    opponentHands.forEach((opponentCards) => {
      const opponentHand = evaluateSevenCards([...opponentCards, ...board]);
      const comparison = compareEvaluations(playerHand, opponentHand);
      if (comparison < 0) {
        betterOpponentCount += 1;
      } else if (comparison === 0) {
        tiedOpponentCount += 1;
      }
    });

    if (betterOpponentCount === 0) {
      equityTotal += 1 / (tiedOpponentCount + 1);
    }
  }

  const equity = equityTotal / sampleCount;
  return {
    equity,
    percent: Math.round(equity * 1000) / 10,
    samples: sampleCount,
  };
}

function finalizeByFold(state) {
  const winner = activePlayers(state.players)[0];
  const payout = Math.floor(state.pot * 0.95);
  const fee = calculateFee(state.pot);
  const feeTotal = (state.feeTotal ?? 0) + fee;
  const playersAfterPayout = clonePlayers(state.players).map((player) =>
    player.id === winner.id
      ? { ...player, chipBalance: player.chipBalance + payout, chipsWon: player.chipsWon + payout }
      : player,
  );
  const players = markEliminatedPlayers(playersAfterPayout);
  const eliminationLog = newEliminationLog(playersAfterPayout, players);

  return {
    ...state,
    players,
    finished: true,
    waitingForHuman: false,
    showdownPending: false,
    pendingIndices: [],
    winnerIds: [winner.id],
    showdownResults: [],
    revealOrder: [],
    muckIds: [],
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

function showdownOpenedIds(state) {
  return new Set((state.showdownResults ?? []).map((result) => result.id));
}

function showdownMuckedIds(state) {
  return new Set(state.muckIds ?? []);
}

function showdownContenderIds(state) {
  const order = state.revealOrder?.length ? state.revealOrder : showdownOrder(state);
  return order.filter((id) => {
    const player = state.players.find((entry) => entry.id === id);
    return player && !player.folded && !player.eliminated;
  });
}

function nextShowdownActorIndex(state) {
  const openedIds = showdownOpenedIds(state);
  const muckedIds = showdownMuckedIds(state);
  const nextId = showdownContenderIds(state).find((id) => !openedIds.has(id) && !muckedIds.has(id));
  return nextId ? state.players.findIndex((player) => player.id === nextId) : -1;
}

function startShowdown(state) {
  const orderedIds = showdownOrder(state);
  const pendingIndices = orderedIds
    .map((id) => state.players.findIndex((player) => player.id === id))
    .filter((index) => index >= 0);
  const currentPlayerIndex = pendingIndices[0] ?? -1;

  return {
    ...state,
    showdownPending: true,
    revealOrder: orderedIds,
    muckIds: [],
    showdownResults: [],
    currentPlayerIndex,
    pendingIndices,
    waitingForHuman: currentPlayerIndex >= 0 ? state.players[currentPlayerIndex].isHuman : false,
    log: [...state.log, "쇼다운 공개를 시작합니다."],
  };
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

function buildContributionPots(players, excludedIds = new Set()) {
  const contributionLevels = [...new Set(players.map((player) => player.totalContribution).filter((amount) => amount > 0))].sort((a, b) => a - b);
  const pots = [];
  let previousLevel = 0;

  contributionLevels.forEach((level) => {
    const amount = players.reduce((total, player) => total + Math.max(0, Math.min(player.totalContribution, level) - previousLevel), 0);
    const originalEligiblePlayers = players.filter((player) => !player.folded && !player.eliminated && player.totalContribution >= level);
    const eligiblePlayers = originalEligiblePlayers.filter((player) => !excludedIds.has(player.id));
    const resolvedEligiblePlayers = eligiblePlayers.length > 0 ? eligiblePlayers : originalEligiblePlayers;
    if (amount > 0 && resolvedEligiblePlayers.length > 0) {
      pots.push({ amount, eligiblePlayers: resolvedEligiblePlayers });
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

function sortByShowdownOrder(players, orderedIds) {
  const orderIndex = new Map(orderedIds.map((id, index) => [id, index]));
  return [...players].sort((a, b) => (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

function finalizeShowdown(state) {
  const muckedIds = showdownMuckedIds(state);
  const orderedIds = state.revealOrder?.length ? state.revealOrder : showdownOrder(state);
  const contenders = activePlayers(state.players).map((player) => ({
    ...player,
    hand: evaluateSevenCards([...player.cards, ...state.communityCards]),
  }));

  const contributionPots = buildContributionPots(state.players, muckedIds);
  const payouts = contributionPots.flatMap((pot) => {
    const eligibleContenders = contenders.filter((player) => pot.eligiblePlayers.some((eligiblePlayer) => eligiblePlayer.id === player.id));
    const potBest = eligibleContenders.reduce((winner, player) => {
      if (!winner) return player;
      return compareEvaluations(player.hand, winner.hand) > 0 ? player : winner;
    }, null);
    if (!potBest) {
      return [];
    }
    const potWinners = eligibleContenders.filter((player) => compareEvaluations(player.hand, potBest.hand) === 0);
    return splitPotWithFees(pot.amount, potWinners);
  });
  const aggregatedPayouts = aggregatePayouts(payouts);
  const recordedResults = state.showdownResults ?? [];
  const recordedIds = new Set(recordedResults.map((result) => result.id));
  const openedContenders = sortByShowdownOrder(
    recordedResults.length > 0 ? contenders.filter((player) => recordedIds.has(player.id)) : contenders.filter((player) => !muckedIds.has(player.id)),
    orderedIds,
  );
  const resultMap = new Map(recordedResults.map((result) => [result.id, result]));
  const finalizedShowdownResults = openedContenders.map((player) => {
    const detailedResult = buildShowdownResult(player, player.hand, state.communityCards);
    const recordedResult = resultMap.get(player.id);
    return recordedResult
      ? {
          ...detailedResult,
          ...recordedResult,
          privateCards: recordedResult.privateCards ?? detailedResult.privateCards,
          communityCards: recordedResult.communityCards ?? detailedResult.communityCards,
          tiebreakers: recordedResult.tiebreakers ?? detailedResult.tiebreakers,
          strength: recordedResult.strength ?? detailedResult.strength,
          holeStrength: recordedResult.holeStrength ?? detailedResult.holeStrength,
          score: recordedResult.score ?? detailedResult.score,
        }
      : detailedResult;
  });
  const fee = aggregatedPayouts.reduce((total, payout) => total + payout.fee, 0);
  const feeTotal = (state.feeTotal ?? 0) + fee;
  const winnerIds = aggregatedPayouts.map((payout) => payout.id);
  const finalMuckIds = state.muckIds ?? [];
  const playerStats = updateShowdownStats(state.playerStats ?? {}, finalizedShowdownResults, finalMuckIds, winnerIds);
  const playersAfterPayout = clonePlayers(state.players).map((player) => {
    const payout = aggregatedPayouts.find((entry) => entry.id === player.id);
    if (!payout) {
      return player;
    }
    return {
      ...player,
      chipBalance: player.chipBalance + payout.net,
      chipsWon: player.chipsWon + payout.net,
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
    showdownPending: false,
    pendingIndices: [],
    winnerIds,
    currentHandFee: fee,
    revealOrder: orderedIds,
    muckIds: finalMuckIds,
    showdownResults: finalizedShowdownResults,
    chipTotals: buildChipTotals(players),
    playerStats,
    feeTotal,
    log: [
      ...state.log,
      ...(recordedResults.length > 0 || (state.muckIds ?? []).length > 0 ? [] : finalizedShowdownResults.map((result) => `${result.name} 오픈: ${result.label}`)),
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
    return startShowdown(state);
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

function remainingContributionCap(player) {
  return Math.max(0, 100000 - player.totalContribution);
}

function spendableBalance(player) {
  return Math.min(player.chipBalance, remainingContributionCap(player));
}

function postBlind(player, blindAmount, actionLabel) {
  const amount = Math.min(blindAmount, Math.max(0, player.chipBalance));
  player.streetContribution = amount;
  player.totalContribution = amount;
  player.chipBalance -= amount;
  player.actionLocked = player.chipBalance === 0;
  player.lastAction = actionLabel;
  return amount;
}

function wagerTargetForPlayer(player, state) {
  const street = getStreetConfig(state.streetIndex);
  const isOpeningBet = state.currentBet === 0;
  const standardTarget = isOpeningBet ? street.firstBet : state.currentBet + street.raiseSize;
  const available = spendableBalance(player);
  const maxTarget = player.streetContribution + available;
  const target = Math.min(standardTarget, maxTarget);
  return {
    isOpeningBet,
    standardTarget,
    target,
    amount: Math.max(0, target - player.streetContribution),
    isAllIn: available > 0 && target > 0 && target < standardTarget,
  };
}

export function getAvailableActions(state, playerIndex) {
  if (state.finished) {
    return [];
  }
  const player = state.players[playerIndex];
  if (state.showdownPending) {
    if (!player || player.folded || player.eliminated || playerIndex !== state.currentPlayerIndex) {
      return [];
    }
    const openedIds = showdownOpenedIds(state);
    const muckedIds = showdownMuckedIds(state);
    if (openedIds.has(player.id) || muckedIds.has(player.id)) {
      return [];
    }
    const remainingUnmuckedCount = showdownContenderIds(state).filter((id) => !muckedIds.has(id)).length;
    return [
      { key: "show", label: "오픈", enabled: true },
      { key: "muck", label: "머크", enabled: remainingUnmuckedCount > 1 },
    ];
  }
  if (!player || !canAct(player)) {
    return [];
  }
  if (activePlayers(state.players).length <= 1 || actionableActivePlayers(state.players).length <= 1) {
    return [];
  }
  const street = getStreetConfig(state.streetIndex);
  const toCall = amountToCall(player, state);
  const canCheck = toCall === 0 && (state.currentBet === 0 || state.streetIndex === 0);
  const { isOpeningBet, target: nextWagerTarget, amount: wagerAmount, isAllIn } = wagerTargetForPlayer(player, state);
  const callAmount = Math.min(toCall, spendableBalance(player));
  const canCall = toCall > 0 && callAmount > 0;
  const clearsCurrentBet = isOpeningBet ? nextWagerTarget > 0 : nextWagerTarget > state.currentBet;
  const canWager =
    clearsCurrentBet &&
    wagerAmount > 0 &&
    nextWagerTarget <= street.maxBet &&
    player.totalContribution + wagerAmount <= 100000;

  return [
    { key: "fold", label: "폴드", enabled: true },
    {
      key: "call",
      label: toCall > 0 ? formatActionAmount("콜", callAmount, callAmount === player.chipBalance) : "콜",
      enabled: canCall,
    },
    { key: "check", label: "체크", enabled: canCheck },
    isOpeningBet
      ? {
          key: "bet",
          label: formatActionAmount("베팅", nextWagerTarget, canWager && isAllIn),
          enabled: canWager,
        }
      : {
          key: "raise",
          label: formatActionAmount("레이즈", nextWagerTarget, canWager && isAllIn),
          enabled: canWager,
        },
  ];
}

function progressShowdown(state) {
  const nextIndex = nextShowdownActorIndex(state);
  if (nextIndex < 0) {
    return finalizeShowdown({
      ...state,
      currentPlayerIndex: -1,
      pendingIndices: [],
      waitingForHuman: false,
    });
  }

  const openedIds = showdownOpenedIds(state);
  const muckedIds = showdownMuckedIds(state);
  const pendingIndices = showdownContenderIds(state)
    .map((id) => state.players.findIndex((player) => player.id === id))
    .filter((index) => index >= 0 && !openedIds.has(state.players[index].id) && !muckedIds.has(state.players[index].id));

  return {
    ...state,
    currentPlayerIndex: nextIndex,
    pendingIndices,
    waitingForHuman: state.players[nextIndex].isHuman,
  };
}

function applyShowdownAction(state, actionKey, actorIndex = state.currentPlayerIndex) {
  if (!["show", "muck"].includes(actionKey) || actorIndex !== state.currentPlayerIndex) {
    return state;
  }

  const actor = state.players[actorIndex];
  if (!actor || actor.folded || actor.eliminated) {
    return state;
  }

  const openedIds = showdownOpenedIds(state);
  const muckedIds = showdownMuckedIds(state);
  if (openedIds.has(actor.id) || muckedIds.has(actor.id)) {
    return state;
  }

  const remainingUnmuckedCount = showdownContenderIds(state).filter((id) => !muckedIds.has(id)).length;
  const showdownResults = [...(state.showdownResults ?? [])];
  const muckIds = [...(state.muckIds ?? [])];
  const log = [...state.log];

  if (actionKey === "show") {
    const hand = evaluateSevenCards([...actor.cards, ...state.communityCards]);
    showdownResults.push(buildShowdownResult(actor, hand, state.communityCards));
    log.push(`${actor.name} 오픈: ${hand.label}`);
  }

  if (actionKey === "muck") {
    if (remainingUnmuckedCount <= 1) {
      return state;
    }
    muckIds.push(actor.id);
    log.push(`${actor.name} 머크`);
  }

  return progressShowdown({
    ...state,
    showdownResults,
    muckIds,
    log,
  });
}

export function applyAction(state, actionKey, actorIndex = state.currentPlayerIndex) {
  if (state.finished) {
    return state;
  }
  if (state.showdownPending) {
    return applyShowdownAction(state, actionKey, actorIndex);
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
    actor.cards = [];
    actor.lastAction = "폴드";
    log.push(`${actor.name}: 폴드, 카드 반납`);
    statsActionKey = "fold";
    actionApplied = true;
  }

  if (actionKey === "call" && toCall > 0) {
    const callAmount = Math.min(toCall, spendableBalance(actor));
    if (callAmount <= 0) {
      return state;
    }
    actor.streetContribution += callAmount;
    actor.totalContribution += callAmount;
    actor.chipBalance -= callAmount;
    pot += callAmount;
    const spentRemainingBalance = actor.chipBalance === 0;
    actor.actionLocked = spentRemainingBalance;
    actor.lastAction = spentRemainingBalance ? "잔액 전액 콜" : "콜";
    log.push(
      spentRemainingBalance
        ? `${actor.name}: ${formatActionAmount("콜", callAmount, true)}`
        : `${actor.name}: ${formatActionAmount("콜", callAmount)}`,
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
    const standardTarget =
      actionKey === "bet" && currentBet === 0
        ? street.firstBet
        : actionKey === "raise" && currentBet > 0
          ? currentBet + street.raiseSize
          : null;
    const actionLabel = actionKey === "bet" ? "베팅" : "레이즈";
    const available = spendableBalance(actor);
    const target = standardTarget === null ? null : Math.min(standardTarget, actor.streetContribution + available);
    const amount = target === null ? 0 : target - actor.streetContribution;
    const clearsCurrentBet = actionKey === "bet" ? target > 0 : target > currentBet;
    if (
      target !== null &&
      clearsCurrentBet &&
      amount > 0 &&
      target <= street.maxBet &&
      actor.totalContribution + amount <= 100000
    ) {
      actor.streetContribution = target;
      actor.totalContribution += amount;
      actor.chipBalance -= amount;
      pot += amount;
      currentBet = target;
      actor.actionLocked = actor.chipBalance === 0;
      actor.lastAction = actionLabel;
      lastAggressorIndex = actorIndex;
      log.push(`${actor.name}: ${formatActionAmount(actionLabel, target, actor.actionLocked)}`);
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

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function preflopStrength(cards) {
  const [a, b] = [...cards].sort((left, right) => right.value - left.value);
  const high = a.value;
  const low = b.value;
  const pair = a.value === b.value;
  const suited = a.suit === b.suit;
  const gap = high - low;

  if (pair && high >= 13) return 94;
  if (pair && high >= 10) return 88;
  if (pair && high >= 7) return 80;
  if (pair) return 68;

  let score = 18 + high * 2.2 + low * 1.2;
  if (suited) {
    score += 6;
  }
  if (gap === 1) {
    score += 7;
  } else if (gap === 2) {
    score += 4;
  } else if (gap === 3) {
    score += 1;
  } else if (gap >= 5) {
    score -= 6;
  }
  if (high >= 11 && low >= 10) {
    score += 5;
  }
  if (high === 14 && low >= 10) {
    score += 3;
  }
  if (high === 14 && low <= 5 && suited) {
    score += 2;
  }

  return Math.round(clampNumber(score, 24, 82));
}

function postflopStrength(player, state) {
  const hand = evaluateSevenCards([...player.cards, ...state.communityCards]);
  return hand.score * 15 + (hand.tiebreakers[0] ?? 0);
}

function levelBoardAwareness(level) {
  if (level.key === "beginner") {
    return 0.45;
  }
  if (level.key === "advanced") {
    return 1.22;
  }
  return 1;
}

function styleBoardPressureBias(style) {
  if (style.key === "cautious") {
    return { value: 1.16, draw: 0.68, risk: 1.18 };
  }
  if (style.key === "aggressive") {
    return { value: 1.04, draw: 1.18, risk: 0.78 };
  }
  if (style.key === "adaptive") {
    return { value: 1.08, draw: 1.02, risk: 1 };
  }
  if (style.key === "chaotic") {
    return { value: 0.92, draw: 1.16, risk: 0.66 };
  }
  return { value: 1, draw: 1, risk: 1 };
}

function straightTextureRisk(cards) {
  if (!cards.length) {
    return 0;
  }

  const values = new Set(cards.map((card) => card.value));
  if (values.has(14)) {
    values.add(1);
  }
  const uniqueValues = [...values].sort((left, right) => left - right);
  let risk = 0;

  for (let start = 1; start <= 10; start += 1) {
    const run = [start, start + 1, start + 2, start + 3, start + 4];
    const hits = run.filter((value) => uniqueValues.includes(value)).length;
    if (hits >= 4) {
      risk = Math.max(risk, 5);
    } else if (hits === 3) {
      risk = Math.max(risk, 2);
    }
  }

  return risk;
}

function boardTextureContext(player, state) {
  if (state.streetIndex === 0 || !Array.isArray(state.communityCards) || state.communityCards.length === 0) {
    return {
      hand: null,
      textureRisk: 0,
      drawPotential: 0,
      valueBonus: 0,
      weakMadeHand: false,
      vulnerablePair: false,
      multiwayPressure: 0,
    };
  }

  const board = state.communityCards;
  const hand = evaluateSevenCards([...player.cards, ...board]);
  const boardSuitCounts = board.reduce((counts, card) => {
    counts[card.suit] = (counts[card.suit] ?? 0) + 1;
    return counts;
  }, {});
  const maxBoardSuitCount = Math.max(0, ...Object.values(boardSuitCounts));
  const flushSuit = Object.entries(boardSuitCounts).find(([, count]) => count === maxBoardSuitCount)?.[0] ?? "";
  const playerFlushBlockers = player.cards.filter((card) => card.suit === flushSuit).length;
  const boardRankCounts = board.reduce((counts, card) => {
    counts[card.value] = (counts[card.value] ?? 0) + 1;
    return counts;
  }, {});
  const pairedBoard = Object.values(boardRankCounts).some((count) => count >= 2);
  const straightRisk = straightTextureRisk(board);
  const flushRisk = maxBoardSuitCount >= 3 ? (playerFlushBlockers > 0 ? 5 : 7) : maxBoardSuitCount === 2 ? 2 : 0;
  const pairedRisk = pairedBoard && hand.score < 6 ? 3 : 0;
  const playerHighCard = Math.max(...player.cards.map((card) => card.value));
  const boardOvercards = board.filter((card) => card.value > playerHighCard).length;
  const activeCount = activePlayers(state.players).length;
  const multiwayPressure = activeCount >= 5 ? 3 : activeCount >= 4 ? 2 : activeCount >= 3 ? 1 : 0;
  const drawPotential = postflopPotential(player, state);
  const madeScore = hand.score;
  const weakMadeHand = madeScore <= 1;
  const vulnerablePair = madeScore === 1 && (boardOvercards >= 1 || flushRisk >= 5 || straightRisk >= 5 || multiwayPressure >= 2);
  const valueBonus =
    madeScore >= 6
      ? 13
      : madeScore >= 4
        ? 10
        : madeScore === 3
          ? 8
          : madeScore === 2
            ? 5
            : madeScore === 1
              ? vulnerablePair
                ? 1
                : 3
              : 0;
  const textureRisk = clampNumber(flushRisk + straightRisk + pairedRisk + boardOvercards + multiwayPressure, 0, 18);

  return {
    hand,
    textureRisk,
    drawPotential,
    valueBonus,
    weakMadeHand,
    vulnerablePair,
    multiwayPressure,
  };
}

function computerPocketMemoryDifficulty(player, state) {
  if (!Array.isArray(player?.cards) || player.cards.length !== 2 || player.cards.some((card) => !card)) {
    return 0;
  }

  const [a, b] = [...player.cards].sort((left, right) => right.value - left.value);
  const high = a.value;
  const low = b.value;
  const pair = a.value === b.value;
  const suited = a.suit === b.suit;
  const gap = high - low;
  let difficulty = 0.3;

  if (pair) {
    difficulty -= 0.18;
  }
  if (high >= 11 && low >= 10) {
    difficulty -= 0.09;
  }
  if (high === 14) {
    difficulty -= 0.05;
  }
  if (suited) {
    difficulty -= 0.04;
  }
  if (!pair && gap <= 1) {
    difficulty -= 0.04;
  }
  if (!pair && !suited && high < 11 && low < 10) {
    difficulty += 0.12;
  }
  if (!pair && gap >= 5) {
    difficulty += 0.08;
  }

  const communityCards = Array.isArray(state?.communityCards) ? state.communityCards : [];
  if (communityCards.length > 0) {
    difficulty += communityCards.length * 0.025;

    const boardSuitCounts = communityCards.reduce((counts, card) => {
      counts[card.suit] = (counts[card.suit] ?? 0) + 1;
      return counts;
    }, {});
    const hasBoardFlushPressure = Object.values(boardSuitCounts).some((count) => count >= 2);
    const hasPocketSuitOnBoard = player.cards.some((card) => (boardSuitCounts[card.suit] ?? 0) >= 2);
    if (hasBoardFlushPressure && hasPocketSuitOnBoard) {
      difficulty += suited ? 0.1 : 0.14;
    }

    const rankCounts = communityCards.reduce((counts, card) => {
      counts[card.value] = (counts[card.value] ?? 0) + 1;
      return counts;
    }, {});
    if (Object.values(rankCounts).some((count) => count >= 2)) {
      difficulty += 0.04;
    }

    const uniqueValues = [...new Set([...player.cards, ...communityCards].map((card) => (card.value === 14 ? 1 : card.value)))].sort((left, right) => left - right);
    const hasCompactRun = uniqueValues.some((value, index) => index <= uniqueValues.length - 4 && uniqueValues[index + 3] - value <= 4);
    if (hasCompactRun) {
      difficulty += 0.08;
    }
  }

  return clampNumber(difficulty, 0.06, 0.82);
}

function computerPeekStyleBias(style) {
  if (style.key === "cautious") return 0.13;
  if (style.key === "adaptive") return 0.08;
  if (style.key === "aggressive") return -0.06;
  if (style.key === "chaotic") return 0.1;
  return 0.02;
}

function computerPeekLevelProfile(level) {
  if (level.key === "beginner") {
    return { bias: 0.18, difficultyWeight: 1.15, durationMultiplier: 1.2 };
  }
  if (level.key === "advanced") {
    return { bias: -0.14, difficultyWeight: 0.82, durationMultiplier: 0.72 };
  }
  return { bias: 0, difficultyWeight: 1, durationMultiplier: 1 };
}

export function computerCardPeekPlan(state, actorIndex = state?.currentPlayerIndex, actionDelayMs = 700) {
  const player = state?.players?.[actorIndex];
  if (!player || player.isHuman || player.folded || player.eliminated || player.actionLocked || state?.finished) {
    return { shouldPeek: false, durationMs: 0 };
  }

  const baseStyle = getComputerStyle(player.computerStyle ?? state.computerStyles?.[player.id] ?? state.computerStyle);
  const level = getComputerLevel(player.computerLevel ?? state.computerLevels?.[player.id] ?? state.computerLevel);
  const style = adaptiveStyleForPlayer(baseStyle, state, player, level);
  const memoryDifficulty = computerPocketMemoryDifficulty(player, state);
  const levelProfile = computerPeekLevelProfile(level);
  const seed = [
    state.handId ?? "hand",
    player.id,
    state.streetIndex ?? 0,
    state.currentBet ?? 0,
    state.pot ?? 0,
    player.streetContribution ?? 0,
    state.pendingIndices?.join("-") ?? "",
    "peek",
  ].join(":");
  const chaosVariance = style.key === "chaotic" ? (hashToUnit(`${seed}:chaos`) - 0.5) * 0.22 : 0;
  const threshold = clampNumber(
    memoryDifficulty * levelProfile.difficultyWeight + computerPeekStyleBias(style) + levelProfile.bias + chaosVariance,
    0.03,
    0.9,
  );

  if (hashToUnit(`${seed}:roll`) >= threshold) {
    return { shouldPeek: false, durationMs: 0 };
  }

  const delay = Math.max(0, Number(actionDelayMs) || 0);
  const baseDuration = (280 + memoryDifficulty * 760 + hashToUnit(`${seed}:duration`) * 180) * levelProfile.durationMultiplier;
  const durationMs = Math.round(clampNumber(baseDuration, 160, Math.max(160, delay - 80)));
  return { shouldPeek: true, durationMs };
}

function showdownStrength(hand) {
  return hand.score * 15 + (hand.tiebreakers[0] ?? 0);
}

function showdownGap(strongerHand, weakerHand) {
  if (strongerHand.score !== weakerHand.score) {
    return Math.abs(strongerHand.score - weakerHand.score) * 15;
  }

  const tiebreakerLength = Math.max(strongerHand.tiebreakers.length, weakerHand.tiebreakers.length);
  for (let index = 0; index < tiebreakerLength; index += 1) {
    const gap = Math.abs((strongerHand.tiebreakers[index] ?? 0) - (weakerHand.tiebreakers[index] ?? 0));
    if (gap > 0) {
      return gap;
    }
  }

  return 0;
}

function hashToUnit(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function eligiblePotAfterCall(player, state, callAmount) {
  const callerTotal = player.totalContribution + callAmount;
  if (callerTotal <= 0) {
    return callAmount;
  }

  return state.players.reduce((total, opponent) => {
    const contribution = opponent.id === player.id ? callerTotal : opponent.totalContribution;
    return total + Math.min(contribution, callerTotal);
  }, 0);
}

function computerCallAdjustment(player, state, style, level, toCall) {
  if (toCall <= 0) {
    return 0;
  }

  const callAmount = Math.min(toCall, player.chipBalance);
  if (callAmount <= 0) {
    return 0;
  }

  const eligiblePot = eligiblePotAfterCall(player, state, callAmount);
  const callShare = eligiblePot > 0 ? callAmount / eligiblePot : 1;
  const stackCommitment = player.chipBalance > 0 ? callAmount / player.chipBalance : 1;
  const lastAggressor = state.players[state.lastAggressorIndex];
  const activeCount = activePlayers(state.players).length;
  const seed = `${state.handId ?? "hand"}:${player.id}:${state.streetIndex}:${state.currentBet}:${state.pot}:${callAmount}`;
  const variance = Math.floor(hashToUnit(seed) * (style.variance + 1) * level.varianceWeight);
  let callContextAdjustment = style.pressureTolerance + variance;
  let opponentAdjustment = 0;

  if (callShare <= 0.15) {
    callContextAdjustment += 12;
  } else if (callShare <= 0.25) {
    callContextAdjustment += 8;
  } else if (callShare <= 0.35) {
    callContextAdjustment += 4;
  }

  opponentAdjustment += observedAggressorBluffCatchBonus(lastAggressor, state, style);

  if (player.streetContribution > 0) {
    callContextAdjustment += Math.min(6, Math.floor(player.streetContribution / 5000) * 2);
  }

  if (callAmount < toCall && callShare <= 0.25) {
    callContextAdjustment += 2;
  }

  if (stackCommitment >= 1 && callShare > 0.2) {
    callContextAdjustment -= 4;
  } else if (stackCommitment >= 0.7) {
    callContextAdjustment -= 2;
  }

  if (state.streetIndex >= 2) {
    callContextAdjustment += 2;
  }

  if (activeCount > 2) {
    callContextAdjustment -= 4;
  }
  if (activeCount > 4) {
    callContextAdjustment -= 3;
  }
  if (callAmount >= 20000) {
    callContextAdjustment -= 4;
  }

  return Math.max(0, Math.round(callContextAdjustment * level.callContextWeight + opponentAdjustment * level.opponentWeight));
}

function computerBoardCallAdjustment(player, state, style, level, toCall) {
  if (state.streetIndex === 0 || toCall <= 0) {
    return 0;
  }

  const context = boardTextureContext(player, state);
  const awareness = levelBoardAwareness(level);
  const styleBias = styleBoardPressureBias(style);
  const callAmount = Math.min(toCall, player.chipBalance);
  const expensiveCall = callAmount >= getStreetConfig(state.streetIndex).firstBet;
  let adjustment = context.valueBonus * styleBias.value;

  if (state.streetIndex < 3) {
    adjustment += context.drawPotential * 0.45 * level.drawWeight * styleBias.draw;
  }

  if (context.weakMadeHand) {
    adjustment -= (2 + context.textureRisk * 0.45) * styleBias.risk;
  } else if (context.vulnerablePair) {
    adjustment -= (1 + context.textureRisk * 0.35) * styleBias.risk;
  }

  if (context.textureRisk >= 10 && context.hand?.score <= 2 && expensiveCall) {
    adjustment -= 4 * styleBias.risk;
  }
  if (state.streetIndex === 3 && context.hand?.score <= 1) {
    adjustment -= 3 * styleBias.risk;
  }

  return Math.round(adjustment * awareness);
}

function computerWagerThresholdAdjustment(player, state, style, level) {
  if (state.streetIndex === 0) {
    return 0;
  }

  const context = boardTextureContext(player, state);
  const awareness = levelBoardAwareness(level);
  const styleBias = styleBoardPressureBias(style);
  let adjustment = 0;

  if (context.valueBonus >= 8) {
    adjustment -= context.valueBonus * 0.72 * styleBias.value;
  } else if (context.valueBonus >= 5) {
    adjustment -= 3 * styleBias.value;
  }

  if (state.streetIndex < 3 && context.drawPotential >= 5 && context.multiwayPressure <= 1) {
    adjustment -= 4 * level.drawWeight * styleBias.draw;
  }

  if (context.weakMadeHand && context.textureRisk >= 7) {
    adjustment += (4 + context.textureRisk * 0.45) * styleBias.risk;
  } else if (context.vulnerablePair && context.textureRisk >= 8) {
    adjustment += 3 * styleBias.risk;
  }

  if (context.multiwayPressure >= 2 && context.hand?.score < 2) {
    adjustment += 3 * styleBias.risk;
  }

  return Math.round(adjustment * awareness);
}

function showdownProfileFromStats(stats) {
  const normalizedStats = normalizePlayerStats(stats);
  const openCount = normalizedStats.showdownOpens;
  const showdownCount = openCount + normalizedStats.showdownMucks;

  return {
    openCount,
    showdownCount,
    averageStrength: openCount > 0 ? normalizedStats.showdownStrengthTotal / openCount : 0,
    averageHoleStrength: openCount > 0 ? normalizedStats.showdownHoleStrengthTotal / openCount : 0,
    strongShowRate: openCount > 0 ? normalizedStats.showdownStrongShows / openCount : 0,
    weakShowRate: openCount > 0 ? normalizedStats.showdownWeakShows / openCount : 0,
    winRate: openCount > 0 ? normalizedStats.showdownWins / openCount : 0,
    muckRate: showdownCount > 0 ? normalizedStats.showdownMucks / showdownCount : 0,
  };
}

function combinedShowdownProfile(statsList) {
  const totals = statsList.reduce(
    (summary, stats) => {
      const normalizedStats = normalizePlayerStats(stats);
      summary.openCount += normalizedStats.showdownOpens;
      summary.showdownCount += normalizedStats.showdownOpens + normalizedStats.showdownMucks;
      summary.strengthTotal += normalizedStats.showdownStrengthTotal;
      summary.holeStrengthTotal += normalizedStats.showdownHoleStrengthTotal;
      summary.strongShows += normalizedStats.showdownStrongShows;
      summary.weakShows += normalizedStats.showdownWeakShows;
      summary.wins += normalizedStats.showdownWins;
      summary.mucks += normalizedStats.showdownMucks;
      return summary;
    },
    {
      openCount: 0,
      showdownCount: 0,
      strengthTotal: 0,
      holeStrengthTotal: 0,
      strongShows: 0,
      weakShows: 0,
      wins: 0,
      mucks: 0,
    },
  );

  return {
    openCount: totals.openCount,
    showdownCount: totals.showdownCount,
    averageStrength: totals.openCount > 0 ? totals.strengthTotal / totals.openCount : 0,
    averageHoleStrength: totals.openCount > 0 ? totals.holeStrengthTotal / totals.openCount : 0,
    strongShowRate: totals.openCount > 0 ? totals.strongShows / totals.openCount : 0,
    weakShowRate: totals.openCount > 0 ? totals.weakShows / totals.openCount : 0,
    winRate: totals.openCount > 0 ? totals.wins / totals.openCount : 0,
    muckRate: totals.showdownCount > 0 ? totals.mucks / totals.showdownCount : 0,
  };
}

function aggressionProfileFromStats(stats) {
  const normalizedStats = normalizePlayerStats(stats);
  return {
    actions: normalizedStats.actions,
    aggressiveActions: normalizedStats.aggressiveActions,
    raises: normalizedStats.raises,
    aggressionRate: normalizedStats.actions > 0 ? normalizedStats.aggressiveActions / normalizedStats.actions : 0,
    raiseRate: normalizedStats.actions > 0 ? normalizedStats.raises / normalizedStats.actions : 0,
  };
}

function cardPeekPlayerIdSet(state) {
  const source = state?.cardPeekPlayerIds;
  if (source instanceof Set) {
    return source;
  }
  if (Array.isArray(source)) {
    return new Set(source);
  }
  return new Set();
}

function opponentCardPeekContext(state, playerId, activeOpponentIds, lastAggressor) {
  const peekIds = cardPeekPlayerIdSet(state);
  const peekingOpponentIds = activeOpponentIds.filter((id) => peekIds.has(id));
  const peekingCount = peekingOpponentIds.length;
  const peekingRatio = activeOpponentIds.length > 0 ? peekingCount / activeOpponentIds.length : 0;
  const lastAggressorPeeking = Boolean(lastAggressor && lastAggressor.id !== playerId && peekIds.has(lastAggressor.id));

  return {
    peekingCount,
    peekingRatio,
    lastAggressorPeeking,
    hasPeekingOpponent: peekingCount > 0 || lastAggressorPeeking,
  };
}

function observedAggressorBluffCatchBonus(lastAggressor, state, style) {
  if (!lastAggressor) {
    return 0;
  }
  if (lastAggressor.isHuman) {
    return style.bluffCatchBonus;
  }

  const profile = aggressionProfileFromStats(state.playerStats?.[lastAggressor.id]);
  if (profile.aggressiveActions <= 0) {
    return 0;
  }

  let bonus = 0;
  if (profile.aggressiveActions >= 3 && profile.aggressionRate >= 0.4) {
    bonus += style.bluffCatchBonus;
  } else if (profile.aggressiveActions >= 2 && profile.aggressionRate >= 0.34) {
    bonus += style.bluffCatchBonus * 0.75;
  } else if (profile.aggressiveActions >= 1 && profile.aggressionRate >= 0.5) {
    bonus += style.bluffCatchBonus * 0.45;
  }

  if (profile.raises >= 2 || profile.raiseRate >= 0.25) {
    bonus += 2;
  }

  return bonus;
}

function adaptiveStyleForPlayer(baseStyle, state, player, level) {
  if (!baseStyle.adaptive) {
    return baseStyle;
  }

  const opponentStats = state.playerStats ?? {};
  const activeOpponentIds = activePlayers(state.players)
    .filter((opponent) => opponent.id !== player.id)
    .map((opponent) => opponent.id);
  const activeOpponentStats = activeOpponentIds.map((id) => normalizePlayerStats(opponentStats[id]));
  const totalActions = activeOpponentStats.reduce((total, stats) => total + stats.actions, 0);
  const lastAggressor = state.players[state.lastAggressorIndex];
  const lastAggressorStats = lastAggressor ? normalizePlayerStats(opponentStats[lastAggressor.id]) : null;
  const combinedShowdown = combinedShowdownProfile(activeOpponentStats);
  const lastAggressorShowdown = lastAggressorStats ? showdownProfileFromStats(lastAggressorStats) : null;
  const peekContext = opponentCardPeekContext(state, player.id, activeOpponentIds, lastAggressor);
  const hasActionPattern = totalActions >= 4;
  const hasShowdownPattern = combinedShowdown.openCount >= 2 || lastAggressorShowdown?.openCount >= 1;
  const hasPeekPattern = peekContext.hasPeekingOpponent;

  if (!hasActionPattern && !hasShowdownPattern && !hasPeekPattern) {
    return baseStyle;
  }

  const totalFolds = activeOpponentStats.reduce((total, stats) => total + stats.folds, 0);
  const totalAggression = activeOpponentStats.reduce((total, stats) => total + stats.aggressiveActions, 0);
  const foldRate = hasActionPattern ? totalFolds / totalActions : 0;
  const aggressionRate = hasActionPattern ? totalAggression / totalActions : 0;
  const lastAggressorAggression = aggressionProfileFromStats(lastAggressorStats);
  const lastAggressorRate =
    lastAggressorAggression.actions > 0
      ? lastAggressorAggression.aggressionRate
      : aggressionRate;

  let foldBelow = baseStyle.foldBelow;
  let wagerAbove = baseStyle.wagerAbove;
  let openBetAbove = baseStyle.openBetAbove;
  let pressureTolerance = baseStyle.pressureTolerance;
  let openingPressure = baseStyle.openingPressure;
  let bluffCatchBonus = baseStyle.bluffCatchBonus;
  const opponentWeight = level.opponentWeight;

  if (hasPeekPattern) {
    const peekPressure = Math.min(1.4, peekContext.peekingRatio + (peekContext.lastAggressorPeeking ? 0.55 : 0));
    openBetAbove -= 4 * peekPressure * opponentWeight;
    wagerAbove -= 3 * peekPressure * opponentWeight;
    openingPressure += 3 * peekPressure * opponentWeight;

    if (peekContext.lastAggressorPeeking) {
      foldBelow -= 3 * opponentWeight;
      pressureTolerance += 2 * opponentWeight;
      bluffCatchBonus += 3 * opponentWeight;
    }
  }

  if (hasActionPattern) {
    if (foldRate >= 0.42) {
      openBetAbove -= 8 * opponentWeight;
      wagerAbove -= 6 * opponentWeight;
      openingPressure += 4 * opponentWeight;
    } else if (foldRate <= 0.18) {
      openBetAbove += 5 * opponentWeight;
      wagerAbove += 4 * opponentWeight;
    }
  }

  if ((hasActionPattern && aggressionRate >= 0.34) || lastAggressorRate >= 0.4) {
    foldBelow -= 8 * opponentWeight;
    pressureTolerance += 5 * opponentWeight;
    bluffCatchBonus += 6 * opponentWeight;
  } else if (hasActionPattern && aggressionRate <= 0.12 && lastAggressorRate <= 0.16) {
    foldBelow += 5 * opponentWeight;
    pressureTolerance -= 2 * opponentWeight;
    bluffCatchBonus -= 3 * opponentWeight;
  }

  if (lastAggressorAggression.aggressiveActions >= 1 && lastAggressorRate >= 0.5) {
    const fastResponse = lastAggressorAggression.aggressiveActions >= 2 ? 1 : 0.65;
    foldBelow -= 4 * fastResponse * opponentWeight;
    wagerAbove -= 5 * fastResponse * opponentWeight;
    pressureTolerance += 3 * fastResponse * opponentWeight;
    bluffCatchBonus += 5 * fastResponse * opponentWeight;
  }

  if (combinedShowdown.openCount >= 2) {
    const opponentsShowStrong =
      combinedShowdown.averageStrength >= 50 || combinedShowdown.averageHoleStrength >= 68 || combinedShowdown.strongShowRate >= 0.45;
    const opponentsShowWeak =
      combinedShowdown.averageStrength <= 34 || combinedShowdown.averageHoleStrength <= 48 || combinedShowdown.weakShowRate >= 0.45;

    if (opponentsShowStrong) {
      foldBelow += 5 * opponentWeight;
      wagerAbove += 4 * opponentWeight;
      openBetAbove += 3 * opponentWeight;
      pressureTolerance -= 2 * opponentWeight;
      bluffCatchBonus -= 3 * opponentWeight;
    } else if (opponentsShowWeak) {
      foldBelow -= 5 * opponentWeight;
      wagerAbove -= 4 * opponentWeight;
      openBetAbove -= 3 * opponentWeight;
      pressureTolerance += 3 * opponentWeight;
      bluffCatchBonus += 4 * opponentWeight;
    }

    if (combinedShowdown.muckRate >= 0.5) {
      openBetAbove -= 2 * opponentWeight;
      wagerAbove -= 2 * opponentWeight;
    }
  }

  if (lastAggressorShowdown?.openCount >= 1) {
    const lastAggressorShowsStrong =
      lastAggressorShowdown.averageStrength >= 50 || lastAggressorShowdown.averageHoleStrength >= 68 || lastAggressorShowdown.strongShowRate >= 0.5;
    const lastAggressorShowsWeak =
      lastAggressorShowdown.averageStrength <= 34 || lastAggressorShowdown.averageHoleStrength <= 48 || lastAggressorShowdown.weakShowRate >= 0.5;

    if (lastAggressorShowsStrong) {
      foldBelow += 3 * opponentWeight;
      pressureTolerance -= 3 * opponentWeight;
      bluffCatchBonus -= 4 * opponentWeight;
    } else if (lastAggressorShowsWeak) {
      foldBelow -= 3 * opponentWeight;
      pressureTolerance += 3 * opponentWeight;
      bluffCatchBonus += 4 * opponentWeight;
    }
  }

  return {
    ...baseStyle,
    foldBelow: Math.round(Math.max(32, Math.min(62, foldBelow))),
    wagerAbove: Math.round(Math.max(66, Math.min(92, wagerAbove))),
    openBetAbove: Math.round(Math.max(24, Math.min(54, openBetAbove))),
    pressureTolerance: Math.max(1, pressureTolerance),
    openingPressure: Math.max(1, openingPressure),
    bluffCatchBonus: Math.max(0, bluffCatchBonus),
  };
}

function computerPositionContext(state, actorIndex) {
  let order = Array.isArray(state.pendingIndices) ? state.pendingIndices.filter((index) => canAct(state.players[index])) : [];
  if (!order.includes(actorIndex)) {
    const startIndex = state.currentPlayerIndex >= 0 ? state.currentPlayerIndex : actorIndex;
    order = buildPendingOrder(state.players, startIndex);
  }

  const actorPosition = order.indexOf(actorIndex);
  const actionableCount = Math.max(1, actionableActivePlayers(state.players).length);
  const totalToAct = order.length || actionableCount;
  const remainingToAct = actorPosition >= 0 ? order.length - actorPosition - 1 : Math.max(0, totalToAct - 1);
  const remainingRatio = remainingToAct / Math.max(1, actionableCount - 1);

  if (remainingToAct === 0) {
    return { remainingToAct, remainingRatio, callAdjustment: 5, openingAdjustment: 7, wagerAdjustment: 5 };
  }
  if (actionableCount <= 2) {
    return { remainingToAct, remainingRatio, callAdjustment: 2, openingAdjustment: 3, wagerAdjustment: 2 };
  }
  if (remainingRatio <= 0.25) {
    return { remainingToAct, remainingRatio, callAdjustment: 3, openingAdjustment: 4, wagerAdjustment: 3 };
  }
  if (remainingRatio <= 0.5) {
    return { remainingToAct, remainingRatio, callAdjustment: 0, openingAdjustment: 0, wagerAdjustment: 0 };
  }
  if (remainingRatio <= 0.75) {
    return { remainingToAct, remainingRatio, callAdjustment: -2, openingAdjustment: -3, wagerAdjustment: -2 };
  }
  return { remainingToAct, remainingRatio, callAdjustment: -5, openingAdjustment: -6, wagerAdjustment: -5 };
}

function straightPotential(cards, playerCards) {
  const uniqueValues = [...new Set(cards.map((card) => card.value))];
  const playerValues = new Set(playerCards.map((card) => card.value));
  if (uniqueValues.includes(14)) {
    uniqueValues.push(1);
  }
  if (playerValues.has(14)) {
    playerValues.add(1);
  }
  let best = 0;
  for (let start = 1; start <= 10; start += 1) {
    const run = [start, start + 1, start + 2, start + 3, start + 4];
    const usesPlayerCard = run.some((value) => playerValues.has(value));
    if (!usesPlayerCard) {
      continue;
    }
    const hits = run.filter((value) => uniqueValues.includes(value)).length;
    if (hits >= 4) {
      best = Math.max(best, 5);
    } else if (hits === 3) {
      best = Math.max(best, 2);
    }
  }
  return best;
}

function postflopPotential(player, state) {
  if (state.streetIndex === 0 || state.streetIndex >= 3) {
    return 0;
  }

  const cards = [...player.cards, ...state.communityCards];
  const suitCounts = cards.reduce((counts, card) => ({ ...counts, [card.suit]: (counts[card.suit] ?? 0) + 1 }), {});
  const playerSuits = new Set(player.cards.map((card) => card.suit));
  const playerFlushPotential = Object.entries(suitCounts).reduce((best, [suit, count]) => {
    if (!playerSuits.has(suit)) {
      return best;
    }
    if (count >= 4) {
      return Math.max(best, 8);
    }
    if (count === 3) {
      return Math.max(best, 2);
    }
    return best;
  }, 0);
  const straightDraw = straightPotential(cards, player.cards);
  const boardHigh = state.communityCards.length > 0 ? Math.max(...state.communityCards.map((card) => card.value)) : 14;
  const overcards = player.cards.filter((card) => card.value > boardHigh).length;
  const overcardPotential = overcards === 2 ? 3 : overcards === 1 ? 1 : 0;

  return Math.min(14, playerFlushPotential + straightDraw + overcardPotential);
}

function judgedStrength(strength, state, player, level) {
  const seed = `${state.handId ?? "hand"}:${player.id}:${state.streetIndex}:${state.currentBet}:${state.pot}:level`;
  const noise = Math.round((hashToUnit(`${seed}:noise`) - 0.5) * level.noiseRange);
  const mistake =
    hashToUnit(`${seed}:mistake`) < level.mistakeRate
      ? Math.round((hashToUnit(`${seed}:swing`) < 0.5 ? -1 : 1) * level.mistakeSwing)
      : 0;
  return clampNumber(strength + noise + mistake, 0, 100);
}

function computerOpeningAdjustment(player, state, style, level) {
  const activeCount = activePlayers(state.players).length;
  const seed = `${state.handId ?? "hand"}:${player.id}:${state.streetIndex}:open:${state.pot}`;
  const variance = Math.floor(hashToUnit(seed) * (style.variance + 1) * level.varianceWeight);
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
  if (state.streetIndex > 0) {
    const context = boardTextureContext(player, state);
    const awareness = levelBoardAwareness(level);
    const styleBias = styleBoardPressureBias(style);
    adjustment += context.valueBonus * 0.55 * styleBias.value * awareness;
    if (state.streetIndex < 3 && context.drawPotential >= 5 && activeCount <= 3) {
      adjustment += context.drawPotential * 0.35 * level.drawWeight * styleBias.draw;
    }
    if (context.weakMadeHand && context.textureRisk >= 8) {
      adjustment -= context.textureRisk * 0.35 * styleBias.risk * awareness;
    }
    if (context.multiwayPressure >= 2 && context.hand?.score < 2) {
      adjustment -= 2 * styleBias.risk * awareness;
    }
  }

  return Math.max(0, Math.round(adjustment * level.openingWeight));
}

function cautiousPremiumContext(player, state, judged) {
  if (state.streetIndex === 0) {
    const [a, b] = [...player.cards].sort((left, right) => right.value - left.value);
    const pair = a.value === b.value;
    const suited = a.suit === b.suit;
    const premiumPair = pair && a.value >= 10;
    const strongPair = pair && a.value >= 7;
    const broadway = a.value >= 13 && b.value >= 10;
    const suitedAce = a.value === 14 && suited && b.value >= 9;
    return {
      premium: premiumPair || broadway || suitedAce || judged >= 84,
      strong: strongPair || a.value === 14 || judged >= 74,
    };
  }

  const hand = evaluateSevenCards([...player.cards, ...state.communityCards]);
  return {
    premium: hand.score >= 3 || judged >= 62,
    strong: hand.score >= 2 || judged >= 48,
  };
}

function cautiousValuePressureAction(state, actions, style, level, judged, toCall) {
  if (style.key !== "cautious") {
    return null;
  }

  const aggressiveAction = actions.find((action) => action.key === "raise" || action.key === "bet");
  if (!aggressiveAction) {
    return null;
  }

  const player = state.players[state.currentPlayerIndex];
  const premiumContext = cautiousPremiumContext(player, state, judged);
  if (premiumContext.premium) {
    return aggressiveAction.key;
  }

  const levelAdjustment = level.key === "beginner" ? 4 : level.key === "advanced" ? -3 : 0;
  const threshold = state.streetIndex === 0
    ? toCall > 0
      ? 84
      : 78
    : toCall > 0
      ? 52
      : 38;

  return judged >= threshold + levelAdjustment ? aggressiveAction.key : null;
}

function cautiousValueCallAction(state, actions, style, level, judged, toCall) {
  if (style.key !== "cautious" || toCall <= 0 || !actions.some((action) => action.key === "call")) {
    return null;
  }

  const player = state.players[state.currentPlayerIndex];
  const premiumContext = cautiousPremiumContext(player, state, judged);
  if (premiumContext.strong) {
    return "call";
  }

  const levelAdjustment = level.key === "beginner" ? 3 : level.key === "advanced" ? -2 : 0;
  const threshold = state.streetIndex === 0 ? 74 : 36;
  return judged >= threshold + levelAdjustment ? "call" : null;
}

function adaptiveCounterPressureAction(state, actorIndex, actions, style, level, judged, toCall) {
  if (!style.adaptive) {
    return null;
  }

  const lastAggressor = state.players[state.lastAggressorIndex];
  if (!lastAggressor || lastAggressor.id === state.players[actorIndex]?.id) {
    return null;
  }

  const profile = aggressionProfileFromStats(state.playerStats?.[lastAggressor.id]);
  const activeOpponentIds = activePlayers(state.players)
    .filter((opponent) => opponent.id !== state.players[actorIndex]?.id)
    .map((opponent) => opponent.id);
  const peekContext = opponentCardPeekContext(state, state.players[actorIndex]?.id, activeOpponentIds, lastAggressor);
  if (!peekContext.lastAggressorPeeking && (profile.aggressiveActions <= 0 || profile.aggressionRate < 0.5)) {
    return null;
  }

  const fastResponse = Math.min(1.35, (profile.aggressiveActions >= 2 ? 1 : 0.7) + (peekContext.lastAggressorPeeking ? 0.25 : 0));
  const levelAdjustment = level.key === "beginner" ? 4 : level.key === "advanced" ? -4 : 0;
  const aggressiveAction = actions.find((action) => action.key === "raise" || action.key === "bet");
  const counterThreshold = (state.streetIndex === 0 ? 76 : 44) + levelAdjustment - fastResponse * 4 * level.opponentWeight;
  if (aggressiveAction && judged >= counterThreshold) {
    return aggressiveAction.key;
  }

  const callThreshold = (state.streetIndex === 0 ? 50 : 28) + levelAdjustment - fastResponse * 5 * level.opponentWeight;
  if (toCall > 0 && actions.some((action) => action.key === "call") && judged >= callThreshold) {
    return "call";
  }

  return null;
}

function computerShowdownProfile(style) {
  if (style.key === "cautious") {
    return {
      firstMuckBelow: 24,
      aggressorMuckBias: 7,
      callerMuckBias: -1,
      losingShowChance: 0.01,
    };
  }
  if (style.key === "aggressive") {
    return {
      firstMuckBelow: 12,
      aggressorMuckBias: 1,
      callerMuckBias: -5,
      losingShowChance: 0.14,
    };
  }
  if (style.key === "chaotic") {
    return {
      firstMuckBelow: 20,
      aggressorMuckBias: -4,
      callerMuckBias: -8,
      losingShowChance: 0.26,
    };
  }
  return {
    firstMuckBelow: 18,
    aggressorMuckBias: 4,
    callerMuckBias: -3,
    losingShowChance: style.key === "adaptive" ? 0.05 : 0.04,
  };
}

function adaptiveShowdownAdjustment(style, state, player, level) {
  if (!style.adaptive) {
    return { threshold: 0, losingShowChance: 0 };
  }

  const opponentStats = state.playerStats ?? {};
  const activeOpponentStats = activePlayers(state.players)
    .filter((opponent) => opponent.id !== player.id)
    .map((opponent) => normalizePlayerStats(opponentStats[opponent.id]));
  const totalActions = activeOpponentStats.reduce((total, stats) => total + stats.actions, 0);
  const combinedShowdown = combinedShowdownProfile(activeOpponentStats);
  const hasActionPattern = totalActions >= 4;
  const hasShowdownPattern = combinedShowdown.openCount >= 2;

  if (!hasActionPattern && !hasShowdownPattern) {
    return { threshold: 0, losingShowChance: 0 };
  }

  const foldRate = hasActionPattern ? activeOpponentStats.reduce((total, stats) => total + stats.folds, 0) / totalActions : 0;
  const aggressionRate = hasActionPattern ? activeOpponentStats.reduce((total, stats) => total + stats.aggressiveActions, 0) / totalActions : 0;
  let threshold = 0;
  let losingShowChance = 0;

  if (hasActionPattern) {
    if (foldRate >= 0.42) {
      threshold += 4 * level.opponentWeight;
    } else if (foldRate <= 0.18) {
      threshold -= 3 * level.opponentWeight;
    }
  }

  if (hasActionPattern) {
    if (aggressionRate >= 0.34) {
      threshold -= 5 * level.opponentWeight;
      losingShowChance += 0.03 * level.opponentWeight;
    } else if (aggressionRate <= 0.12) {
      threshold += 2 * level.opponentWeight;
    }
  }

  if (combinedShowdown.openCount >= 2) {
    const opponentsShowStrong =
      combinedShowdown.averageStrength >= 50 || combinedShowdown.averageHoleStrength >= 68 || combinedShowdown.strongShowRate >= 0.45;
    const opponentsShowWeak =
      combinedShowdown.averageStrength <= 34 || combinedShowdown.averageHoleStrength <= 48 || combinedShowdown.weakShowRate >= 0.45;

    if (opponentsShowStrong) {
      threshold += 5 * level.opponentWeight;
      losingShowChance -= 0.02 * level.opponentWeight;
    } else if (opponentsShowWeak) {
      threshold -= 5 * level.opponentWeight;
      losingShowChance += 0.04 * level.opponentWeight;
    }

    if (combinedShowdown.muckRate >= 0.5) {
      threshold += 2 * level.opponentWeight;
    }
  }

  return { threshold, losingShowChance };
}

function chooseComputerShowdownAction(state, actorIndex, actions) {
  const player = state.players[actorIndex];
  if (!actions.some((action) => action.key === "muck")) {
    return actions.some((action) => action.key === "show") ? "show" : actions[0]?.key ?? "show";
  }

  const ownHand = evaluateSevenCards([...player.cards, ...state.communityCards]);
  const baseStyle = getComputerStyle(player.computerStyle ?? state.computerStyles?.[player.id] ?? state.computerStyle);
  const level = getComputerLevel(player.computerLevel ?? state.computerLevels?.[player.id] ?? state.computerLevel);
  const style = adaptiveStyleForPlayer(baseStyle, state, player, level);
  const profile = computerShowdownProfile(style);
  const openedIds = showdownOpenedIds(state);
  const seed = `${state.handId ?? "hand"}:${player.id}:showdown:${state.showdownResults?.length ?? 0}:${state.muckIds?.length ?? 0}`;

  if (openedIds.size === 0) {
    const adaptiveAdjustment = adaptiveShowdownAdjustment(style, state, player, level);
    const isLastAggressor = state.lastAggressorIndex === actorIndex;
    const threshold =
      profile.firstMuckBelow +
      adaptiveAdjustment.threshold +
      (isLastAggressor ? profile.aggressorMuckBias : profile.callerMuckBias);
    const noisyStrength =
      showdownStrength(ownHand) +
      Math.round((hashToUnit(`${seed}:strength-noise`) - 0.5) * level.noiseRange) +
      (hashToUnit(`${seed}:mistake`) < level.mistakeRate
        ? Math.round((hashToUnit(`${seed}:mistake-swing`) < 0.5 ? -1 : 1) * level.mistakeSwing)
        : 0);
    return noisyStrength < threshold ? "muck" : "show";
  }

  const openedHands = activePlayers(state.players)
    .filter((entry) => openedIds.has(entry.id))
    .map((entry) => evaluateSevenCards([...entry.cards, ...state.communityCards]));
  const bestOpenedHand = openedHands.reduce((best, hand) => (!best || compareEvaluations(hand, best) > 0 ? hand : best), null);
  const comparison = bestOpenedHand ? compareEvaluations(ownHand, bestOpenedHand) : 1;
  if (comparison >= 0) {
    return "show";
  }

  const gap = showdownGap(bestOpenedHand, ownHand);
  const closeHandRevealChance = gap <= 2 ? 0.1 : gap <= 6 ? 0.04 : 0;
  const adaptiveAdjustment = adaptiveShowdownAdjustment(style, state, player, level);
  const losingShowChance = Math.max(
    0,
    Math.min(0.35, profile.losingShowChance + closeHandRevealChance + adaptiveAdjustment.losingShowChance + level.mistakeRate * 0.5),
  );
  return hashToUnit(`${seed}:losing-show`) < losingShowChance ? "show" : "muck";
}

function weightedActionChoice(weightedActions, seed) {
  const availableActions = weightedActions.filter((entry) => entry.action);
  const totalWeight = availableActions.reduce((total, entry) => total + entry.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  let roll = hashToUnit(seed) * totalWeight;
  for (const entry of availableActions) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.action;
    }
  }

  return availableActions[availableActions.length - 1]?.action ?? null;
}

function chaoticActionOverride(state, actorIndex, actions, style, level, toCall) {
  if (!style.chaosRate) {
    return null;
  }

  const seed = `${state.handId ?? "hand"}:${actorIndex}:${state.streetIndex}:${state.currentBet}:${state.pot}:chaos`;
  const chaosRate = Math.min(0.45, style.chaosRate * level.varianceWeight);
  if (hashToUnit(`${seed}:trigger`) >= chaosRate) {
    return null;
  }

  const actionByKey = new Map(actions.map((action) => [action.key, action.key]));
  const aggressiveAction = actionByKey.get("raise") ?? actionByKey.get("bet");
  const checkAction = actionByKey.get("check");
  const callAction = actionByKey.get("call");
  const foldAction = actionByKey.get("fold");

  if (toCall > 0) {
    return weightedActionChoice(
      [
        { action: aggressiveAction, weight: 36 },
        { action: callAction, weight: 42 },
        { action: foldAction, weight: 22 },
      ],
      `${seed}:called`,
    );
  }

  return weightedActionChoice(
    [
      { action: aggressiveAction, weight: 56 },
      { action: checkAction, weight: 36 },
      { action: level.key === "beginner" ? foldAction : null, weight: 8 },
    ],
    `${seed}:checked`,
  );
}

export function chooseComputerAction(state, actorIndex = state.currentPlayerIndex) {
  const player = state.players[actorIndex];
  const actions = getAvailableActions(state, actorIndex).filter((action) => action.enabled);
  if (state.showdownPending) {
    return chooseComputerShowdownAction(state, actorIndex, actions);
  }
  const toCall = amountToCall(player, state);
  const strength = state.streetIndex === 0 ? preflopStrength(player.cards) : postflopStrength(player, state);
  const baseStyle = getComputerStyle(player.computerStyle ?? state.computerStyles?.[player.id] ?? state.computerStyle);
  const level = getComputerLevel(player.computerLevel ?? state.computerLevels?.[player.id] ?? state.computerLevel);
  const style = adaptiveStyleForPlayer(baseStyle, state, player, level);
  const chaoticAction = chaoticActionOverride(state, actorIndex, actions, style, level, toCall);
  if (chaoticAction) {
    return chaoticAction;
  }
  const positionContext = computerPositionContext(state, actorIndex);
  const judged = judgedStrength(strength, state, player, level);
  const drawAdjustment = postflopPotential(player, state) * level.drawWeight;
  const boardCallAdjustment = computerBoardCallAdjustment(player, state, style, level, toCall);
  const boardWagerThresholdAdjustment = computerWagerThresholdAdjustment(player, state, style, level);
  const adjustedCallStrength =
    judged +
    computerCallAdjustment(player, state, style, level, toCall) +
    boardCallAdjustment +
    positionContext.callAdjustment * level.positionWeight +
    drawAdjustment;
  const openingAction = actions.find((action) => action.key === "bet");
  const adjustedOpeningStrength =
    judged + computerOpeningAdjustment(player, state, style, level) + positionContext.openingAdjustment * level.positionWeight + drawAdjustment;
  const wagerThreshold = style.wagerAbove + boardWagerThresholdAdjustment - positionContext.wagerAdjustment * level.positionWeight - drawAdjustment * 0.5;
  const cautiousValueAction = cautiousValuePressureAction(state, actions, style, level, judged, toCall);
  if (cautiousValueAction) {
    return cautiousValueAction;
  }
  const cautiousCallAction = cautiousValueCallAction(state, actions, style, level, judged, toCall);
  if (cautiousCallAction) {
    return cautiousCallAction;
  }
  const adaptiveCounterAction = adaptiveCounterPressureAction(state, actorIndex, actions, style, level, judged, toCall);
  if (adaptiveCounterAction) {
    return adaptiveCounterAction;
  }

  if (judged < style.hardFoldBelow && toCall > 0) {
    return "fold";
  }
  const aggressiveAction = actions.find((action) => action.key === "raise" || action.key === "bet");
  if (judged > wagerThreshold && aggressiveAction) {
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
