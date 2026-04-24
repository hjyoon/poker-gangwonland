import { createDeck, describePreflopHand, PREFLOP_RANK_TEST_CASES } from "../lib/poker.js";

const deck = createDeck();
const cardById = new Map(deck.map((card) => [card.id, card]));
const sampleCardsByHand = {
  AA: ["AH", "AD"],
  AKs: ["AS", "KS"],
  AKo: ["AS", "KC"],
  QJs: ["QS", "JS"],
  A2s: ["AS", "2S"],
  J8s: ["JS", "8S"],
  QTo: ["QS", "10C"],
  "22": ["2S", "2C"],
  "72s": ["7S", "2S"],
  "82o": ["8S", "2C"],
  "72o": ["7S", "2C"],
};

const failures = Object.entries(PREFLOP_RANK_TEST_CASES)
  .map(([handKey, expectedRank]) => {
    const cards = sampleCardsByHand[handKey]?.map((id) => cardById.get(id));
    const actual = describePreflopHand(cards);
    return actual?.rank === expectedRank
      ? null
      : `${handKey}: expected ${expectedRank}, received ${actual?.rank ?? "unknown"}`;
  })
  .filter(Boolean);

if (failures.length > 0) {
  console.error(["프리플랍 랭킹 검증 실패", ...failures].join("\n"));
  process.exit(1);
}

console.log(`프리플랍 랭킹 검증 통과: ${Object.keys(PREFLOP_RANK_TEST_CASES).length}건`);
