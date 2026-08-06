import { expect } from "../fixtures/coverage.js";

const HUMAN_ACTIONS = [/^오픈$/, /^체크$/, /^콜/, /^베팅/, /^레이즈/, /^폴드$/, /^머크$/];
const DEFAULT_RANDOM_SEED = "playwright-e2e";

export async function installDeterministicRandom(page, seed = DEFAULT_RANDOM_SEED) {
  await page.addInitScript((seedValue) => {
    function createSeededRandom(initialSeed) {
      let state = 2166136261;
      const seedText = String(initialSeed || "poker-e2e");
      for (let index = 0; index < seedText.length; index += 1) {
        state ^= seedText.charCodeAt(index);
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

    const seededRandom = createSeededRandom(seedValue);
    globalThis.__POKER_TEST_RANDOM__ = seededRandom;
  }, seed);
}

export async function gotoRoot(page, roomCode = "") {
  await installDeterministicRandom(page);
  await page.goto(roomCode ? `/?room=${roomCode}` : "/");
  await expect(page.getByRole("heading", { name: "게임 시작 설정" })).toBeVisible();
}

export async function openSetupTab(page, name) {
  await page.getByRole("tab", { name }).click();
}

export async function openActiveMenuItem(page, name) {
  await page.getByRole("button", { name: "게임 진행 메뉴 열기" }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

export function setupCard(page, name) {
  return page.getByRole("group", { name: `${name} 설정 카드` });
}

export async function setupCardOrder(page) {
  return page.locator(".setup-player-config .setup-player-card-header strong").allTextContents();
}

export async function expectSetupCardOrder(page, expectedNames) {
  await expect.poll(async () => setupCardOrder(page)).toEqual(expectedNames);
}

export async function dragSetupCardAfter(page, draggedName, targetName) {
  const handle = page.getByLabel(`${draggedName} 순서 변경`);
  const target = setupCard(page, targetName);
  await expect(handle).toBeVisible();
  await expect(target).toBeVisible();
  await handle.dragTo(target, { targetPosition: { x: 240, y: 80 } });
}

export function activeGameSettingsPanel(page) {
  return page.locator(".game-settings-panel");
}

export async function expectActiveGameSettingsEditable(page, editable) {
  const panel = activeGameSettingsPanel(page);
  for (const label of [
    "다음 핸드 자동 진행",
    "엔들리스 게임 모드",
    "인게임 컴퓨터 성향/수준 표시",
    "플레이어 카드 누적 승리 표시",
    "컴퓨터 행동 딜레이(ms)",
    "멀티플레이 제한 시간(ms)",
  ]) {
    const control = panel.getByLabel(label);
    if (editable) {
      await expect(control).toBeEnabled();
    } else {
      await expect(control).toBeDisabled();
    }
  }
}

export async function setFastDelays(page, { autoNext = false, multiplayer = false } = {}) {
  await page.getByLabel("컴퓨터 행동 딜레이(ms)").fill("100");
  if (autoNext) {
    await page.getByLabel("다음 핸드 자동 진행").check();
    await page.getByLabel("다음 핸드 딜레이(ms)").fill("500");
  }
  if (multiplayer) {
    await page.getByLabel("멀티플레이 제한 시간(ms)").fill("10000");
  }
}

export async function startSingleGame(page, options = {}) {
  const {
    autoNext = false,
    computerOnly = false,
    endless = false,
    randomOrder = false,
  } = options;

  await gotoRoot(page);
  await setFastDelays(page, { autoNext });

  if (randomOrder) {
    await page.getByLabel("모든 플레이어 랜덤 배치").check();
  }
  if (endless) {
    await page.getByLabel("엔들리스 게임 모드").check();
    await expect(page.getByLabel("엔들리스 신규 컴퓨터 성향")).toBeVisible();
    await page.getByLabel("엔들리스 신규 시작 금액").fill("120000");
  }
  if (computerOnly) {
    await page.getByRole("group", { name: "플레이어 설정 카드" }).getByLabel("플레이어 유형").selectOption("computer");
  }

  await page.getByRole("button", { name: "게임 시작" }).click();
  await expect(page.getByText("먹(Pot)")).toBeVisible();
  await expect(page.locator(".seat")).toHaveCount(8);
}

export async function clickIfEnabledAction(page, actionNames = HUMAN_ACTIONS) {
  for (const name of actionNames) {
    const button = page.locator(".controls .action-row").getByRole("button", { name }).first();
    if ((await button.count()) === 0) {
      continue;
    }
    if (await button.isEnabled()) {
      const label = (await button.innerText()).trim();
      await button.click();
      return label;
    }
  }
  return "";
}

export async function clickNamedAction(page, actionName) {
  const button = page.locator(".controls .action-row").getByRole("button", { name: actionName }).first();
  if ((await button.count()) === 0 || !(await button.isEnabled())) {
    return false;
  }

  await button.click();
  return true;
}

export async function finishHandWithinLimit(page, { maxActions = 80 } = {}) {
  for (let actionCount = 0; actionCount < maxActions; actionCount += 1) {
    const nextHandButton = page.getByRole("button", { name: "다음 핸드", exact: true }).first();
    if ((await nextHandButton.count()) > 0 && (await nextHandButton.isVisible())) {
      return;
    }

    const clicked = await clickIfEnabledAction(page);
    if (clicked) {
      await page.waitForTimeout(100);
      continue;
    }

    await page.waitForTimeout(250);
  }

  const controlsText = await page.locator(".controls").innerText().catch(() => "controls not found");
  throw new Error(`Hand did not finish within the action limit. Controls:\n${controlsText}`);
}

export async function createRoom(page, { name = "Host", autoNext = false, endless = false, computerCount = 3 } = {}) {
  await gotoRoot(page);
  await page.getByRole("radio", { name: "멀티플레이" }).click();
  await expect(page.getByText("멀티플레이 룸")).toBeVisible();
  await page.getByRole("radio", { name: "룸 만들기" }).click();
  await page.getByLabel("표시 이름").fill(name);
  await page.keyboard.press("Tab");
  await openSetupTab(page, "게임 설정");
  await setFastDelays(page, { autoNext, multiplayer: true });
  if (computerCount < 3) {
    for (const name of ["컴퓨터 3", "컴퓨터 2", "컴퓨터 1"].slice(0, Math.max(0, 3 - computerCount))) {
      const removeButton = page.getByRole("button", { name: `${name} 제거` });
      if ((await removeButton.count()) > 0) {
        await removeButton.click();
      }
    }
  }
  if (endless) {
    await page.getByLabel("엔들리스 게임 모드").check();
  }
  await openSetupTab(page, "멀티플레이");
  await page.getByRole("button", { name: "룸 만들기" }).click();
  await expect(page.getByText(/룸 코드: [A-F0-9]{6}/)).toBeVisible();
  return extractRoomCode(await page.locator(".room-state strong").first().innerText());
}

export async function joinRoomInContext(context, roomCode, { name = "Guest", viaDeepLink = false } = {}) {
  const page = await context.newPage();
  await gotoRoot(page, viaDeepLink ? roomCode : "");
  if (!viaDeepLink) {
    await page.getByRole("radio", { name: "멀티플레이" }).click();
    await page.getByRole("radio", { name: "룸 참가" }).click();
    await page.getByLabel("표시 이름").fill(name);
    await page.getByLabel("룸 코드").fill(roomCode);
    await page.getByRole("button", { name: "룸 참가" }).click();
  }
  await expect(page.getByText(`룸 코드: ${roomCode}`)).toBeVisible();
  await page.getByLabel("표시 이름").fill(name);
  await page.keyboard.press("Tab");
  await expect(page.getByText(name).first()).toBeVisible();
  return page;
}

export async function joinActiveRoomInContext(context, roomCode) {
  const page = await context.newPage();
  await installDeterministicRandom(page);
  await page.goto(`/?room=${roomCode}`);
  await expect(page.getByText("먹(Pot)")).toBeVisible();
  await expect(page.locator(".seat")).toHaveCount(8);
  return page;
}

export async function startMultiplayerGame(hostPage, participantPages = []) {
  await hostPage.getByRole("button", { name: "룸 게임 시작" }).click();
  await expect(hostPage.getByText("먹(Pot)")).toBeVisible();
  for (const page of participantPages) {
    await expect(page.getByText("먹(Pot)")).toBeVisible();
  }
}

export async function waitForAnyTurn(page) {
  await expect
    .poll(async () => page.locator(".controls").innerText(), { timeout: 20_000 })
    .toMatch(/내 차례입니다|차례입니다|컴퓨터 진행|관전 중|쇼다운|핸드가 종료/);
}

export function extractRoomCode(text) {
  const match = /([A-F0-9]{6})/.exec(text);
  if (!match) {
    throw new Error(`Room code not found in text: ${text}`);
  }
  return match[1];
}
