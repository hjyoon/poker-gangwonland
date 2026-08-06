import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const coverageRoot = path.join(process.cwd(), "coverage", "e2e");
const meaningfulDir = path.join(coverageRoot, "meaningful");

export const MEANINGFUL_E2E_TARGETS = [
  { id: "mock.lobby-status-commands", area: "mock-ui", description: "Mocked lobby room statuses and room command protocol rendering." },
  { id: "mock.active-participation-card-overlay", area: "mock-ui", description: "Mocked active table participation controls and card insight overlay." },
  { id: "mock.active-status-hints", area: "mock-ui", description: "Mocked active table status text and human action hint branches." },
  { id: "multiplayer.lobby-errors-deeplink-permissions", area: "multiplayer", description: "Room creation, join errors, deep-link join, and host-only permissions." },
  { id: "multiplayer.active-sync-next-hand", area: "multiplayer", description: "Active table synchronization and next-hand readiness across browser contexts." },
  { id: "multiplayer.late-seat-reservation", area: "multiplayer", description: "Late participant reservation for an empty human seat." },
  { id: "multiplayer.endless-waiting-cancel-restore", area: "multiplayer", description: "Endless waiting reservation cancellation and restoration." },
  { id: "multiplayer.settings-share-rejoin", area: "multiplayer", description: "Host settings synchronization, share URL, name changes, and same-browser rejoin." },
  { id: "multiplayer.active-info-endless-leave", area: "multiplayer", description: "Active multiplayer info tabs, endless settings, and menu leave." },
  { id: "multiplayer.protected-slots-conversion", area: "multiplayer", description: "Connected human slot protection and empty slot conversion/removal." },
  { id: "setup.mode-switch-route", area: "setup", description: "Setup mode switching while preserving the root route tree." },
  { id: "setup.deterministic-controls-disabled-start", area: "setup", description: "Deterministic setup controls and disabled start state." },
  { id: "setup.multiplayer-limits-timeout", area: "setup", description: "Multiplayer player limits, human slot conversion, and timeout clamps." },
  { id: "setup.drag-reorder-computer-profile", area: "setup", description: "Setup card drag reorder and selected computer profile start." },
  { id: "setup.max-cards-human-uniqueness-clamps", area: "setup", description: "Maximum cards, singleplay human uniqueness, type conversion, and input clamps." },
  { id: "setup.personal-rules-tabs", area: "setup", description: "Setup personal settings and rules summary tabs." },
  { id: "singleplay.start-menu-history", area: "singleplay", description: "Singleplay table start, active menu branches, and hand history." },
  { id: "singleplay.street-showdown-fees-overlay", area: "singleplay", description: "Street progression, showdown controls, fee display, and card overlay." },
  { id: "singleplay.fold-reset", area: "singleplay", description: "Explicit fold and reset from active game to setup." },
  { id: "singleplay.active-settings-clamps", area: "singleplay", description: "Active game settings changes and delay clamps." },
  { id: "singleplay.personal-settings-empty-history", area: "singleplay", description: "Active personal settings and empty history info states." },
  { id: "singleplay.short-stack-all-in-lock", area: "singleplay", description: "Short-stack call shown as all-in and locked action." },
  { id: "singleplay.game-over-too-few", area: "singleplay", description: "Game-over path when fewer than two players remain playable." },
  { id: "singleplay.computer-only-random-endless", area: "singleplay", description: "Computer-only, random-order, and endless setup branches." },
  { id: "singleplay.multi-table-tournament", area: "singleplay", description: "Immediate single-player multi-table tournament start, standings, and timer-free human action." },
  { id: "server.websocket-handshake-protocol", area: "server", description: "WebSocket handshake, malformed frame, ping/pong, and protocol error handling." },
  { id: "server.room-lifecycle-settings", area: "server", description: "Room lifecycle, host settings, lobby synchronization, and reconnection." },
  { id: "server.seat-reservations-missed-blinds", area: "server", description: "Seat reservations, stand-up/away states, endless waiting, and missed blinds." },
  { id: "server.game-actions-next-hand", area: "server", description: "Server game actions, showdown, next-hand readiness, and table progression." },
  { id: "poker.preflop-evaluation-winrate", area: "poker-engine", description: "Preflop descriptions, hand evaluation, comparison, and win-rate simulation." },
  { id: "poker.actions-showdown-settlement", area: "poker-engine", description: "Player actions, showdown choices, side-pot settlement, fees, and eliminations." },
  { id: "poker.computer-decisions", area: "poker-engine", description: "Computer action selection across styles, levels, board texture, position, and peek behavior." },
  { id: "poker.hand-lifecycle-endless", area: "poker-engine", description: "Hand lifecycle, blind handling, game over, and endless replacement." },
];

const targetById = new Map(MEANINGFUL_E2E_TARGETS.map((target) => [target.id, target]));

function safeFilename(id) {
  return id.replace(/[^a-z0-9_.-]/gi, "_");
}

export async function recordMeaningfulCoverage(id, details = {}) {
  if (process.env.E2E_COVERAGE !== "1") {
    return;
  }

  const target = targetById.get(id);
  if (!target) {
    throw new Error(`Unknown meaningful e2e coverage target: ${id}`);
  }

  await mkdir(meaningfulDir, { recursive: true });
  await writeFile(
    path.join(meaningfulDir, `${safeFilename(id)}.json`),
    `${JSON.stringify(
      {
        ...target,
        details,
        recordedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

async function readRecordedTargets() {
  try {
    const files = await readdir(meaningfulDir, { withFileTypes: true });
    const records = [];
    for (const entry of files) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const record = JSON.parse(await readFile(path.join(meaningfulDir, entry.name), "utf8"));
      if (targetById.has(record.id)) {
        records.push(record);
      }
    }
    return records;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function summarizeMeaningfulCoverage() {
  const records = await readRecordedTargets();
  const coveredIds = new Set(records.map((record) => record.id));
  const missingTargets = MEANINGFUL_E2E_TARGETS.filter((target) => !coveredIds.has(target.id));
  const coveredTargets = MEANINGFUL_E2E_TARGETS.filter((target) => coveredIds.has(target.id));
  const total = MEANINGFUL_E2E_TARGETS.length;
  const covered = coveredTargets.length;
  return {
    covered,
    total,
    percentage: total > 0 ? Number(((covered / total) * 100).toFixed(2)) : 0,
    coveredTargets,
    missingTargets,
    records,
  };
}
