import { expect, test } from "@playwright/test";
import {
  clickIfEnabledAction,
  createRoom,
  gotoRoot,
  joinRoomInContext,
  startMultiplayerGame,
  waitForAnyTurn,
} from "./helpers/poker-app";

async function finishMultiplayerHandWithinLimit(pages, { maxActions = 120 } = {}) {
  for (let actionCount = 0; actionCount < maxActions; actionCount += 1) {
    for (const page of pages) {
      const nextHandButton = page.getByRole("button", { name: "다음 핸드", exact: true }).first();
      if ((await nextHandButton.count()) > 0 && (await nextHandButton.isVisible())) {
        return;
      }
    }

    for (const page of pages) {
      const clicked = await clickIfEnabledAction(page);
      if (clicked) {
        await page.waitForTimeout(100);
        continue;
      }
    }

    await pages[0].waitForTimeout(250);
  }

  const controls = await Promise.all(pages.map((page) => page.locator(".controls").innerText().catch(() => "controls not found")));
  throw new Error(`Multiplayer hand did not finish within the action limit.\n${controls.join("\n---\n")}`);
}

test.describe("root multiplayer flows", () => {
  test("handles lobby errors, room creation, deep-link join, and host permissions", async ({ page, browser }) => {
    await gotoRoot(page);
    await page.getByRole("radio", { name: "멀티플레이" }).click();
    await expect(page.getByText("룸 만들기 또는 룸 참가를 먼저 선택하세요.")).toBeVisible();

    await page.getByRole("radio", { name: "룸 참가" }).click();
    await page.getByRole("button", { name: "룸 참가" }).click();
    await expect(page.getByText("룸 코드를 입력하세요.")).toBeVisible();
    await page.getByLabel("룸 코드").fill("ABC123");
    await page.getByRole("button", { name: "룸 참가" }).click();
    await expect(page.getByText("룸을 찾을 수 없습니다.")).toBeVisible();

    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const roomCode = await createRoom(hostPage, { name: "Host" });
    const guestPage = await joinRoomInContext(guestContext, roomCode, { name: "Guest", viaDeepLink: true });

    await expect(hostPage.getByText("Guest").first()).toBeVisible();
    await expect(hostPage.getByRole("tab", { name: "게임 설정" })).toBeVisible();
    await expect(hostPage.getByRole("button", { name: "룸 게임 시작" })).toBeEnabled();
    await expect(guestPage.getByRole("tab", { name: "게임 설정" })).toHaveCount(0);
    await expect(guestPage.getByRole("button", { name: "룸 게임 시작" })).toHaveCount(0);

    await hostPage.getByRole("button", { name: "룸 나가기" }).click();
    await expect(hostPage.getByText("룸 만들기 또는 룸 참가를 먼저 선택하세요.")).toBeVisible();
    await hostContext.close();
    await guestContext.close();
  });

  test("syncs an active multiplayer table and next-hand readiness across contexts", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const roomCode = await createRoom(hostPage, { name: "Host", computerCount: 0 });
    const guestPage = await joinRoomInContext(guestContext, roomCode, { name: "Guest", viaDeepLink: true });

    await startMultiplayerGame(hostPage, [guestPage]);
    await expect(hostPage.locator(".seat")).toHaveCount(8);
    await expect(guestPage.locator(".seat")).toHaveCount(8);
    await waitForAnyTurn(hostPage);
    await waitForAnyTurn(guestPage);
    await expect(hostPage.getByText("내 참가 상태")).toBeVisible();
    await expect(hostPage.getByRole("button", { name: "룸 나가기" })).toBeVisible();
    await expect(hostPage.getByRole("button", { name: /자리 비움/ })).toBeVisible();
    await expect(hostPage.getByRole("button", { name: /게임에서 빠지기|게임 퇴장 예약 취소/ })).toBeVisible();

    const hostActionRow = hostPage.locator(".controls .action-row");
    const guestActionRow = guestPage.locator(".controls .action-row");
    await expect
      .poll(async () => {
        const hostText = await hostActionRow.innerText().catch(() => "");
        const guestText = await guestActionRow.innerText().catch(() => "");
        return `${hostText}\n${guestText}`;
      }, { timeout: 20_000 })
      .toMatch(/폴드|콜|체크|베팅|레이즈|오픈|머크|다음 핸드/);

    await finishMultiplayerHandWithinLimit([hostPage, guestPage]);
    await expect(hostPage.getByRole("button", { name: "다음 핸드", exact: true })).toBeEnabled();
    await expect(guestPage.getByRole("button", { name: "다음 핸드", exact: true })).toBeEnabled();

    await hostPage.getByRole("button", { name: "다음 핸드", exact: true }).click();
    await expect(hostPage.getByRole("button", { name: "다음 핸드 준비 완료", exact: true })).toBeDisabled();
    await expect(guestPage.getByText(/준비 1\/2명/)).toBeVisible();

    await guestPage.getByRole("button", { name: "다음 핸드", exact: true }).click();
    await expect(hostPage.getByText("먹(Pot)")).toBeVisible();
    await expect(guestPage.getByText("먹(Pot)")).toBeVisible();

    await hostPage.getByRole("button", { name: "룸 나가기" }).click();
    await expect(hostPage.getByRole("heading", { name: "게임 시작 설정" })).toBeVisible();
    await hostContext.close();
    await guestContext.close();
  });
});
