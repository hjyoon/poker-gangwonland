import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;
const e2eRandomSeed = "playwright-e2e";
const e2eCoverage = process.env.E2E_COVERAGE === "1";
const nodeV8CoverageEnv = e2eCoverage ? "NODE_V8_COVERAGE=coverage/e2e/raw/server-v8 " : "";
const webServerCommand = e2eCoverage
  ? `${nodeV8CoverageEnv}E2E_RANDOM_SEED=${e2eRandomSeed} HOSTNAME=127.0.0.1 PORT=${PORT} exec node server.mjs`
  : `E2E_RANDOM_SEED=${e2eRandomSeed} HOSTNAME=127.0.0.1 PORT=${PORT} npm run dev`;

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
