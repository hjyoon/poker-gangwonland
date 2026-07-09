import { expect, test } from "@playwright/test";
import { gotoRoot, openSetupTab, setFastDelays } from "./helpers/poker-app";

test.describe("root setup shell", () => {
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
