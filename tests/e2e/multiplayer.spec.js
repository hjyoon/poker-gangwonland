import { expect, test } from "@playwright/test";
import {
  clickIfEnabledAction,
  createRoom,
  gotoRoot,
  joinRoomInContext,
  openSetupTab,
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

  test("syncs host room settings, guest name changes, share URL, and same-browser rejoin", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const roomCode = await createRoom(hostPage, { name: "Host", computerCount: 1 });
    const guestPage = await joinRoomInContext(guestContext, roomCode, { name: "Guest", viaDeepLink: true });

    await guestPage.getByLabel("표시 이름").fill("Renamed Guest");
    await guestPage.keyboard.press("Tab");
    await expect(hostPage.getByText("Renamed Guest").first()).toBeVisible();

    await openSetupTab(hostPage, "게임 설정");
    await hostPage.getByLabel("모든 플레이어 랜덤 배치").check();
    await hostPage.getByLabel("플레이어 카드 누적 승리 표시").uncheck();
    await openSetupTab(hostPage, "멀티플레이");
    await expect(guestPage.getByText("게임 시작 시 모든 플레이어 순서는 랜덤으로 확정됩니다.")).toBeVisible();

    await expect(hostPage.getByLabel("룸 참가 URL")).toHaveValue(new RegExp(`[?&]room=${roomCode}`));
    await hostPage.getByRole("button", { name: "URL 복사" }).click();
    await expect(hostPage.getByText(/URL을 복사했습니다\.|복사할 수 없습니다\./)).toBeVisible();

    await guestPage.goto(`/?room=${roomCode}`);
    await expect(guestPage.getByText(`룸 코드: ${roomCode}`)).toBeVisible();
    await expect(guestPage.getByText("룸을 찾을 수 없습니다.")).toHaveCount(0);
    await expect(hostPage.locator(".room-slot").filter({ hasText: "참가 중" })).toHaveCount(2);

    await startMultiplayerGame(hostPage, [guestPage]);
    await expect(guestPage.locator(".seat").first().getByText("누적 승리")).toHaveCount(0);

    await hostContext.close();
    await guestContext.close();
  });

  test("protects connected human slots while allowing empty human slot conversion and removal", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const roomCode = await createRoom(hostPage, { name: "Host", computerCount: 1 });
    await joinRoomInContext(guestContext, roomCode, { name: "Guest", viaDeepLink: true });

    await openSetupTab(hostPage, "게임 설정");
    const connectedGuestCard = hostPage.getByRole("group", { name: "Guest 설정 카드" });
    await expect(connectedGuestCard.getByRole("button", { name: "Guest 제거" })).toHaveCount(0);
    await expect
      .poll(async () =>
        connectedGuestCard.getByLabel("플레이어 유형").evaluate((select) => select.querySelector("option[value='computer']")?.disabled ?? false),
      )
      .toBe(true);

    await hostPage.getByRole("button", { name: "플레이어 카드 추가" }).click();
    await hostPage.getByRole("group", { name: "컴퓨터 2 설정 카드" }).getByLabel("플레이어 유형").selectOption("human");
    const emptyHumanCard = hostPage.getByRole("group", { name: "빈 자리 3 설정 카드" });
    await expect(emptyHumanCard).toBeVisible();
    await expect(emptyHumanCard.getByRole("button", { name: "빈 자리 3 제거" })).toBeVisible();
    await expect
      .poll(async () =>
        emptyHumanCard.getByLabel("플레이어 유형").evaluate((select) => select.querySelector("option[value='computer']")?.disabled ?? true),
      )
      .toBe(false);
    await emptyHumanCard.getByLabel("플레이어 유형").selectOption("computer");
    await expect(hostPage.getByRole("group", { name: "빈 자리 3 설정 카드" })).toHaveCount(0);

    await hostPage.getByRole("button", { name: "플레이어 카드 추가" }).click();
    await hostPage.getByRole("group", { name: "컴퓨터 3 설정 카드" }).getByLabel("플레이어 유형").selectOption("human");
    await hostPage.getByRole("button", { name: "빈 자리 3 제거" }).click();
    await expect(hostPage.getByRole("group", { name: "빈 자리 3 설정 카드" })).toHaveCount(0);

    await hostContext.close();
    await guestContext.close();
  });
});
