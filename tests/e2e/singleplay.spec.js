import { expect, test } from "@playwright/test";
import { finishHandWithinLimit, openActiveMenuItem, startSingleGame } from "./helpers/poker-app";

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

  test("starts computer-only, random-order, and endless setup branches", async ({ page }) => {
    await startSingleGame(page, { computerOnly: true, randomOrder: true, endless: true, autoNext: true });

    await expect(page.getByText("컴퓨터 플레이어만으로 자동 진행 중입니다.").or(page.getByText("컴퓨터 진행 중입니다."))).toBeVisible();
    await expect(page.getByText("먹(Pot)")).toBeVisible();
    await expect(page.locator(".seat")).toHaveCount(8);
  });
});
