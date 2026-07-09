import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test as base } from "@playwright/test";

const COVERAGE_ENABLED = process.env.E2E_COVERAGE === "1";
const CLIENT_RAW_DIR = path.join(process.cwd(), "coverage", "e2e", "raw", "client");
const coverageStates = new WeakMap();
let rawFileCounter = 0;

function sanitizeFilePart(value) {
  return String(value || "test")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "test";
}

async function writeClientCoverage(testInfo, page, reason, jsCoverage, cssCoverage, errors = []) {
  await mkdir(CLIENT_RAW_DIR, { recursive: true });
  rawFileCounter += 1;
  const fileName = [
    String(testInfo.workerIndex).padStart(2, "0"),
    String(testInfo.retry).padStart(2, "0"),
    String(rawFileCounter).padStart(4, "0"),
    sanitizeFilePart(testInfo.title),
  ].join("-");
  const artifact = {
    generatedAt: new Date().toISOString(),
    reason,
    test: {
      title: testInfo.title,
      file: testInfo.file,
      project: testInfo.project.name,
      workerIndex: testInfo.workerIndex,
      retry: testInfo.retry,
    },
    page: {
      url: page.url(),
    },
    js: jsCoverage,
    css: cssCoverage,
    errors,
  };

  await writeFile(path.join(CLIENT_RAW_DIR, `${fileName}.json`), `${JSON.stringify(artifact)}\n`);
}

async function startPageCoverage(page) {
  if (!COVERAGE_ENABLED || coverageStates.has(page) || !page.coverage) {
    return;
  }

  const state = {
    jsStarted: false,
    cssStarted: false,
    stopped: false,
    startErrors: [],
  };
  coverageStates.set(page, state);

  try {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    state.jsStarted = true;
  } catch (error) {
    state.startErrors.push(`startJSCoverage: ${error.message}`);
  }

  try {
    await page.coverage.startCSSCoverage({ resetOnNavigation: false });
    state.cssStarted = true;
  } catch (error) {
    state.startErrors.push(`startCSSCoverage: ${error.message}`);
  }
}

async function stopPageCoverage(page, testInfo, reason) {
  const state = coverageStates.get(page);
  if (!state || state.stopped) {
    return;
  }
  state.stopped = true;

  const errors = [...state.startErrors];
  let jsCoverage = [];
  let cssCoverage = [];

  if (state.jsStarted) {
    try {
      jsCoverage = await page.coverage.stopJSCoverage();
    } catch (error) {
      errors.push(`stopJSCoverage: ${error.message}`);
    }
  }

  if (state.cssStarted) {
    try {
      cssCoverage = await page.coverage.stopCSSCoverage();
    } catch (error) {
      errors.push(`stopCSSCoverage: ${error.message}`);
    }
  }

  if (jsCoverage.length > 0 || cssCoverage.length > 0 || errors.length > 0) {
    await writeClientCoverage(testInfo, page, reason, jsCoverage, cssCoverage, errors);
  }
}

async function instrumentPage(page, testInfo) {
  await startPageCoverage(page);

  if (page.__e2eCoverageClosePatched) {
    return page;
  }
  page.__e2eCoverageClosePatched = true;

  const originalClose = page.close.bind(page);
  page.close = async (...args) => {
    await stopPageCoverage(page, testInfo, "page-close");
    return originalClose(...args);
  };

  return page;
}

async function instrumentContext(context, testInfo, trackedPages) {
  if (context.__e2eCoveragePatched) {
    return context;
  }
  context.__e2eCoveragePatched = true;

  const trackPage = async (page) => {
    trackedPages.add(page);
    await instrumentPage(page, testInfo);
  };

  for (const page of context.pages()) {
    await trackPage(page);
  }

  const originalNewPage = context.newPage.bind(context);
  context.newPage = async (...args) => {
    const page = await originalNewPage(...args);
    await trackPage(page);
    return page;
  };

  context.on("page", (page) => {
    trackPage(page).catch((error) => {
      console.warn(`[e2e coverage] failed to instrument new page: ${error.message}`);
    });
  });

  const originalClose = context.close.bind(context);
  context.close = async (...args) => {
    for (const page of context.pages()) {
      await stopPageCoverage(page, testInfo, "context-close");
    }
    return originalClose(...args);
  };

  return context;
}

export const test = base.extend({
  _coverageBrowserContexts: [
    async ({ browser }, use, testInfo) => {
      if (!COVERAGE_ENABLED) {
        await use();
        return;
      }

      const trackedContexts = new Set();
      const trackedPages = new Set();
      const originalNewContext = browser.newContext.bind(browser);

      browser.newContext = async (...args) => {
        const context = await originalNewContext(...args);
        trackedContexts.add(context);
        await instrumentContext(context, testInfo, trackedPages);
        return context;
      };

      try {
        await use();
      } finally {
        for (const context of trackedContexts) {
          for (const page of context.pages()) {
            await stopPageCoverage(page, testInfo, "test-teardown");
          }
        }
        for (const page of trackedPages) {
          await stopPageCoverage(page, testInfo, "test-teardown");
        }
        browser.newContext = originalNewContext;
      }
    },
    { auto: true },
  ],

  page: async ({ page }, use, testInfo) => {
    if (!COVERAGE_ENABLED) {
      await use(page);
      return;
    }

    await instrumentPage(page, testInfo);
    await use(page);
    await stopPageCoverage(page, testInfo, "page-fixture-teardown");
  },
});

export { expect };
