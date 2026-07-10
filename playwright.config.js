import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT || 3100);
const baseURL = `http://127.0.0.1:${PORT}`;
const e2eRandomSeed = "playwright-e2e";
const goServerEnv = [
  `GOCACHE=${process.env.GOCACHE || "/tmp/go-build-cache"}`,
  `E2E_RANDOM_SEED=${e2eRandomSeed}`,
  "HOSTNAME=127.0.0.1",
  `PORT=${PORT}`,
  "STATIC_DIR=../dist",
  "POKER_JS_DIR=../lib",
].join(" ");
const webServerCommand = `npm run build && cd backend && ${goServerEnv} go run .`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
