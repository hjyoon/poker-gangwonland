import { expect, test } from "./fixtures/coverage.js";
import {
  activeGameSettingsPanel,
  clickIfEnabledAction,
  clickNamedAction,
  finishHandWithinLimit,
  gotoRoot,
  openActiveMenuItem,
  setFastDelays,
  setupCard,
  startSingleGame,
} from "./helpers/poker-app";

const PASSIVE_ACTION_ORDER = [/^체크$/, /^콜/, /^오픈$/, /^머크$/, /^베팅/, /^레이즈/, /^폴드$/];

async function playPassiveHandAndCollectBranches(page, { maxActions = 100 } = {}) {
  const streets = new Set();
  const clickedActions = [];

  for (let actionCount = 0; actionCount < maxActions; actionCount += 1) {
    const streetText = await page.locator(".table-header h2").innerText().catch(() => "");
    if (streetText) {
      streets.add(streetText);
    }

    const nextHandButton = page.getByRole("button", { name: "다음 핸드", exact: true }).first();
    if ((await nextHandButton.count()) > 0 && (await nextHandButton.isVisible())) {
      return { streets, clickedActions };
    }

    const clicked = await clickIfEnabledAction(page, PASSIVE_ACTION_ORDER);
    if (clicked) {
      clickedActions.push(clicked);
      await page.waitForTimeout(100);
      continue;
    }

    await page.waitForTimeout(250);
  }

  const controlsText = await page.locator(".controls").innerText().catch(() => "controls not found");
  throw new Error(`Passive hand did not finish within the action limit. Controls:\n${controlsText}`);
}

test.describe("root singleplay table", () => {
  test("starts a human table, exposes menu branches, and records prior hand history", async ({ page }) => {
    await startSingleGame(page);

    await expect(page.getByRole("heading", { name: "프리 플랍 (Pre-flop)" })).toBeVisible();
    await expect(page.getByText("먹(Pot)")).toBeVisible();
    await expect(page.locator(".community .card.large")).toHaveCount(5);
    await expect(page.locator(".seat")).toHaveCount(8);

    await expect(page.getByLabel("개인 카드 확인")).toBeVisible();
    await page.getByLabel("개인 카드 확인").focus();
    const humanSeat = page.locator(".seat").filter({ hasText: "플레이어" });
    await expect(humanSeat.getByText("2♦")).toBeVisible();
    await expect(humanSeat.getByText("J♠")).toBeVisible();
    await expect(page.getByText("핸드 랭킹")).toBeVisible();
    await expect(page.getByText("155/169")).toBeVisible();

    await openActiveMenuItem(page, "게임 설정");
    await expect(page.getByRole("heading", { name: "게임 진행 설정" })).toBeVisible();
    await expect(page.getByLabel("다음 핸드 자동 진행")).toBeVisible();
    await expect(page.getByRole("button", { name: "새 게임 설정" })).toBeVisible();

    await openActiveMenuItem(page, "개인 설정");
    await expect(page.getByRole("heading", { name: "개인 설정" })).toBeVisible();

    await openActiveMenuItem(page, "보조 정보");
    await expect(page.getByRole("heading", { name: "보조 정보" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "진행 로그" })).toBeVisible();
    await page.getByRole("tab", { name: "규칙 요약" }).click();
    await expect(page.getByRole("heading", { name: "강원랜드 기준 요약" })).toBeVisible();
    await page.getByRole("tab", { name: "플레이 안내" }).click();
    await expect(page.getByText("멀티플레이에서는 방장이 게임 설정을 정하고")).toBeVisible();

    await openActiveMenuItem(page, "게임 테이블");
    await finishHandWithinLimit(page);
    await expect(page.getByRole("button", { name: "다음 핸드", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "다음 핸드", exact: true }).click();

    await openActiveMenuItem(page, "보조 정보");
    await page.getByRole("tab", { name: "진행 로그" }).click();
    await expect(page.getByText("이전 핸드 기록")).toBeVisible();
    await expect(page.locator(".history-list details")).toHaveCount(1);
  });

  test("covers street progression, showdown controls, fee display, and final-hand overlay", async ({ page }) => {
    await startSingleGame(page);

    const { streets, clickedActions } = await playPassiveHandAndCollectBranches(page);

    await expect(page.getByRole("button", { name: "다음 핸드", exact: true })).toBeEnabled();
    for (const street of ["프리 플랍 (Pre-flop)", "플랍 (Flop)", "턴 (Turn)", "리버 (River)"]) {
      expect(streets.has(street)).toBe(true);
    }
    expect(clickedActions.some((action) => /^콜/.test(action) || /^체크$/.test(action))).toBe(true);
    expect(clickedActions.some((action) => /^오픈$/.test(action) || /^머크$/.test(action))).toBe(true);

    await expect(page.getByText(/누적 수수료 .* 이번 핸드 수수료/)).toBeVisible();
    await expect(page.getByText("쇼다운 공개 순서:")).toBeVisible();

    const showdownCardPair = page.locator(".seat-card-pair[tabindex='0']").first();
    await showdownCardPair.focus();
    await expect(page.getByText("최종 패")).toBeVisible();
  });

  test("covers explicit fold and active reset back to setup", async ({ page }) => {
    await startSingleGame(page);

    let folded = false;
    for (let actionCount = 0; actionCount < 40; actionCount += 1) {
      folded = await clickNamedAction(page, /^폴드$/);
      if (folded) {
        break;
      }
      await clickIfEnabledAction(page, [/^콜/, /^체크$/, /^베팅/, /^레이즈/]);
      await page.waitForTimeout(200);
    }
    expect(folded).toBe(true);

    const humanSeat = page.locator(".seat").filter({ hasText: "플레이어" });
    await expect(humanSeat.getByText("폴드")).toBeVisible();
    await expect(humanSeat.getByText("카드 반납")).toBeVisible();

    await openActiveMenuItem(page, "게임 설정");
    await page.getByRole("button", { name: "새 게임 설정" }).click();
    await expect(page.getByRole("heading", { name: "게임 시작 설정" })).toBeVisible();
    await expect(page.getByRole("button", { name: "게임 시작" })).toBeVisible();
  });

  test("applies active game settings changes to the running table", async ({ page }) => {
    await startSingleGame(page);

    await expect(page.getByText(/(기본형|신중형|공격형|적응형|혼돈형) · (초급|중급|고급)/).first()).toBeVisible();
    await expect(page.locator(".seat").first().getByText("누적 승리")).toBeVisible();

    await openActiveMenuItem(page, "게임 설정");
    const settings = activeGameSettingsPanel(page);
    await settings.getByLabel("인게임 컴퓨터 성향/수준 표시").uncheck();
    await settings.getByLabel("플레이어 카드 누적 승리 표시").uncheck();
    await settings.getByLabel("다음 핸드 자동 진행").check();
    await settings.getByLabel("다음 핸드 딜레이(ms)").fill("500");
    await expect(settings.getByLabel("다음 핸드 딜레이(ms)")).toHaveValue("500");

    await openActiveMenuItem(page, "게임 테이블");
    await expect(page.getByText("설정 비공개").first()).toBeVisible();
    await expect(page.locator(".seat").first().getByText("누적 승리")).toHaveCount(0);
  });

  test("shows short-stack call as all-in and locks the player action", async ({ page }) => {
    await gotoRoot(page);
    await setFastDelays(page);
    await page.getByRole("group", { name: "플레이어 설정 카드" }).getByLabel("시작 금액").fill("3000");
    await page.getByRole("button", { name: "게임 시작" }).click();
    await expect(page.getByText("먹(Pot)")).toBeVisible();

    await expect
      .poll(async () => page.locator(".controls .action-row").innerText().catch(() => ""), { timeout: 20_000 })
      .toMatch(/올인/);
    await page.locator(".controls .action-row").getByRole("button", { name: /올인/ }).click();

    const humanSeat = page.locator(".seat").filter({ hasText: "플레이어" });
    await expect(humanSeat.getByText("올인")).toBeVisible();
    await expect(humanSeat.getByText(/콜|베팅|레이즈/)).toBeVisible();
  });

  test("ends the game when fewer than two players are playable on the next hand", async ({ page }) => {
    await gotoRoot(page);
    await setFastDelays(page);
    await page.getByRole("button", { name: "컴퓨터 3 제거" }).click();
    await page.getByRole("button", { name: "컴퓨터 2 제거" }).click();
    await page.getByRole("group", { name: "플레이어 설정 카드" }).getByLabel("시작 금액").fill("1000");
    await setupCard(page, "컴퓨터 1").getByLabel("시작 금액").fill("1000");
    await page.getByRole("button", { name: "게임 시작" }).click();
    await expect(page.getByText("먹(Pot)")).toBeVisible();

    await finishHandWithinLimit(page, { maxActions: 20 });
    await page.getByRole("button", { name: "다음 핸드", exact: true }).click();

    await expect(page.getByText("게임이 종료되었습니다.")).toBeVisible();
    await expect(page.locator(".seat").filter({ hasText: "플레이어" }).getByText("탈락").first()).toBeVisible();
    await openActiveMenuItem(page, "보조 정보");
    await page.getByRole("tab", { name: "진행 로그" }).click();
    await expect(page.getByText("게임 종료: 진행 가능한 플레이어가 2명 미만입니다.")).toBeVisible();
  });

  test("starts computer-only, random-order, and endless setup branches", async ({ page }) => {
    await startSingleGame(page, { computerOnly: true, randomOrder: true, endless: true, autoNext: true });

    await expect(page.getByText("컴퓨터 플레이어만으로 자동 진행 중입니다.").or(page.getByText("컴퓨터 진행 중입니다."))).toBeVisible();
    await expect(page.getByText("먹(Pot)")).toBeVisible();
    await expect(page.locator(".seat")).toHaveCount(8);
  });
});
