import { expect, test } from "./fixtures/coverage.js";
import { dragSetupCardAfter, expectSetupCardOrder, gotoRoot, openSetupTab, setFastDelays, setupCard } from "./helpers/poker-app";

test.describe("root setup shell", () => {
  test("switches setup modes and preserves the route tree from root", async ({ page }) => {
    await gotoRoot(page);

    await expect(page.getByRole("tab", { name: "게임 설정" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "멀티플레이" })).toHaveCount(0);

    await page.getByRole("radio", { name: "멀티플레이" }).click();
    await expect(page.getByRole("radio", { name: "멀티플레이" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("tab", { name: "멀티플레이" })).toBeVisible();
    await expect(page.getByText("룸 만들기 또는 룸 참가를 먼저 선택하세요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "룸 만들기" })).toHaveCount(0);

    await page.getByRole("radio", { name: "룸 참가" }).click();
    await expect(page.getByRole("tab", { name: "게임 설정" })).toHaveCount(0);
    await expect(page.getByLabel("룸 코드")).toBeVisible();

    await page.getByRole("radio", { name: "싱글플레이" }).click();
    await expect(page.getByRole("radio", { name: "싱글플레이" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("tab", { name: "게임 설정" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "게임 시작 설정" })).toBeVisible();

    await page.getByRole("radio", { name: "멀티플레이" }).click();
    await page.getByRole("radio", { name: "룸 만들기" }).click();
    await expect(page.getByRole("tab", { name: "게임 설정" })).toBeVisible();
    await openSetupTab(page, "게임 설정");
    await expect(page.getByLabel("멀티플레이 제한 시간(ms)")).toBeVisible();
  });

  test("covers deterministic game setup controls and disabled start state", async ({ page }) => {
    await gotoRoot(page);

    await expect(page.getByRole("radio", { name: "싱글플레이" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("heading", { name: "게임 시작 설정" })).toBeVisible();

    await page.getByLabel("모든 플레이어 랜덤 배치").check();
    await page.getByLabel("다음 핸드 자동 진행").check();
    await page.getByLabel("다음 핸드 딜레이(ms)").fill("500");
    await page.getByLabel("엔들리스 게임 모드").check();
    await expect(page.getByLabel("엔들리스 신규 컴퓨터 성향")).toBeVisible();
    await expect(page.getByLabel("엔들리스 신규 컴퓨터 수준")).toBeVisible();
    await page.getByLabel("엔들리스 신규 시작 금액").fill("120000");

    await setFastDelays(page);
    await expect(page.getByRole("group", { name: "플레이어 설정 카드" })).toBeVisible();
    await page.getByRole("button", { name: "플레이어 카드 추가" }).click();
    await expect(page.getByRole("group", { name: "컴퓨터 4 설정 카드" })).toBeVisible();
    await page.getByRole("button", { name: "컴퓨터 4 제거" }).click();

    for (const name of ["컴퓨터 1", "컴퓨터 2", "컴퓨터 3"]) {
      await page.getByRole("group", { name: `${name} 설정 카드` }).getByLabel("시작 금액").fill("0");
    }

    await expect(page.getByRole("button", { name: "게임 시작" })).toBeDisabled();
    await expect(page.getByText("진행 가능한 플레이어가 2명 이상 필요합니다.")).toBeVisible();
  });

  test("reorders setup cards by drag handle and starts with selected computer profile", async ({ page }) => {
    await gotoRoot(page);
    await setFastDelays(page);

    await expectSetupCardOrder(page, ["플레이어", "컴퓨터 1", "컴퓨터 2", "컴퓨터 3"]);
    await setupCard(page, "컴퓨터 3").getByLabel("컴퓨터 플레이 성향").selectOption({ label: "공격형" });
    await setupCard(page, "컴퓨터 3").getByLabel("컴퓨터 판단 수준").selectOption({ label: "고급" });

    await dragSetupCardAfter(page, "컴퓨터 3", "플레이어");
    await expectSetupCardOrder(page, ["플레이어", "컴퓨터 3", "컴퓨터 1", "컴퓨터 2"]);

    await page.getByRole("button", { name: "게임 시작" }).click();
    await expect(page.getByText("먹(Pot)")).toBeVisible();
    await expect(page.locator(".seat header strong")).toHaveText(["플레이어", "컴퓨터 3", "컴퓨터 1", "컴퓨터 2", "빈 자리", "빈 자리", "빈 자리", "빈 자리"]);
    await expect(page.locator(".seat").filter({ hasText: "컴퓨터 3" }).getByText("공격형 · 고급")).toBeVisible();
  });

  test("enforces max setup cards, singleplay human uniqueness, type conversion, and input clamps", async ({ page }) => {
    await gotoRoot(page);

    await page.getByLabel("컴퓨터 행동 딜레이(ms)").fill("1");
    await expect(page.getByLabel("컴퓨터 행동 딜레이(ms)")).toHaveValue("100");
    await page.getByLabel("컴퓨터 행동 딜레이(ms)").fill("999999");
    await expect(page.getByLabel("컴퓨터 행동 딜레이(ms)")).toHaveValue("3000");

    await expect(page.getByLabel("다음 핸드 딜레이(ms)")).toBeDisabled();
    await page.getByLabel("다음 핸드 자동 진행").check();
    await page.getByLabel("다음 핸드 딜레이(ms)").fill("1");
    await expect(page.getByLabel("다음 핸드 딜레이(ms)")).toHaveValue("500");
    await page.getByLabel("다음 핸드 딜레이(ms)").fill("999999");
    await expect(page.getByLabel("다음 핸드 딜레이(ms)")).toHaveValue("10000");

    await page.getByRole("group", { name: "플레이어 설정 카드" }).getByLabel("시작 금액").fill("-5000");
    await expect(page.getByRole("group", { name: "플레이어 설정 카드" }).getByLabel("시작 금액")).toHaveValue("0");

    for (let index = 0; index < 4; index += 1) {
      await page.getByRole("button", { name: "플레이어 카드 추가" }).click();
    }
    await expect(page.getByRole("group", { name: /설정 카드$/ })).toHaveCount(8);
    await expect(page.getByRole("button", { name: "플레이어 카드 추가" })).toHaveCount(0);
    await expect(page.getByText("전체 플레이어는 최대 8명입니다.")).toBeVisible();

    await expect(page.getByText("인간 플레이어는 직접 행동을 선택합니다.")).toHaveCount(1);
    await page.getByRole("group", { name: "컴퓨터 4 설정 카드" }).getByLabel("플레이어 유형").selectOption("human");
    await expect(page.getByText("인간 플레이어는 직접 행동을 선택합니다.")).toHaveCount(1);
    await expect(page.getByRole("group", { name: "플레이어 설정 카드" }).getByLabel("플레이어 유형")).toHaveValue("human");

    await page.getByRole("group", { name: "플레이어 설정 카드" }).getByLabel("플레이어 유형").selectOption("computer");
    await expect(page.getByText("인간 플레이어는 직접 행동을 선택합니다.")).toHaveCount(0);
    await expect(page.getByRole("group", { name: /설정 카드$/ }).getByLabel("컴퓨터 플레이 성향")).toHaveCount(8);
    await expect(page.getByRole("button", { name: "게임 시작" })).toBeEnabled();

    await page.getByLabel("모든 플레이어 랜덤 배치").check();
    await expect(page.getByText("게임 시작 시 모든 플레이어 순서가 랜덤으로 확정됩니다.")).toBeVisible();
  });

  test("covers personal settings and rules summary tabs", async ({ page }) => {
    await gotoRoot(page);

    await openSetupTab(page, "개인 설정");
    await expect(page.getByRole("heading", { name: "개인 설정" })).toBeVisible();
    await page.getByLabel("핸드 랭킹 표시").uncheck();
    await page.getByLabel("승률 표시").uncheck();
    await page.getByLabel("핸드 별칭 표시").uncheck();
    await expect(page.getByLabel("핸드 랭킹 표시")).not.toBeChecked();
    await expect(page.getByLabel("승률 표시")).not.toBeChecked();
    await expect(page.getByLabel("핸드 별칭 표시")).not.toBeChecked();

    await openSetupTab(page, "규칙 요약");
    await expect(page.getByRole("heading", { name: "강원랜드 기준 요약" })).toBeVisible();
    await expect(page.getByText("스몰 블라인드 (Small Blind): ₩2,000")).toBeVisible();
    await expect(page.getByText("빅 블라인드 (Big Blind): ₩5,000")).toBeVisible();
    await expect(page.getByRole("cell", { name: "프리 플랍 (Pre-flop)" })).toBeVisible();
    await expect(page.getByText("승자는 정산 대상 금액에서 수수료 5%를 제외한 칩스를 가져갑니다.")).toBeVisible();
  });
});
