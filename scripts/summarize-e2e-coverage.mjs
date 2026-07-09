import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const v8ToIstanbul = require("v8-to-istanbul");
const { FlattenMap } = require("@jridgewell/trace-mapping");

const coverageRoot = path.join(process.cwd(), "coverage", "e2e");
const clientRawDir = path.join(coverageRoot, "raw", "client");
const serverRawDir = path.join(coverageRoot, "raw", "server-v8");
const repoRoot = process.cwd();
const authoredSourcePatterns = [/^app\/.+\.js$/, /^components\/.+\.jsx$/, /^lib\/.+\.js$/, /^server\.mjs$/];

function percent(covered, total) {
  return total > 0 ? Number(((covered / total) * 100).toFixed(2)) : 0;
}

function hashText(text) {
  return crypto.createHash("sha1").update(text || "").digest("hex").slice(0, 12);
}

function mergeRanges(target, ranges) {
  for (const range of ranges) {
    const start = Number(range.start ?? range.startOffset);
    const end = Number(range.end ?? range.endOffset);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      target.push([start, end]);
    }
  }
}

function unionBytes(ranges) {
  if (ranges.length === 0) {
    return 0;
  }

  const sortedRanges = ranges
    .filter(([start, end]) => end > start)
    .sort(([leftStart, leftEnd], [rightStart, rightEnd]) => leftStart - rightStart || leftEnd - rightEnd);
  let bytes = 0;
  let [currentStart, currentEnd] = sortedRanges[0];

  for (const [start, end] of sortedRanges.slice(1)) {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
      continue;
    }
    bytes += currentEnd - currentStart;
    currentStart = start;
    currentEnd = end;
  }

  return bytes + currentEnd - currentStart;
}

function createResourceSummary(resources) {
  let coveredBytes = 0;
  let totalBytes = 0;
  let coveredRanges = 0;
  let totalRanges = 0;
  const resourceSummaries = [];

  for (const resource of resources.values()) {
    const resourceTotalBytes = resource.totalBytes || unionBytes(resource.totalRanges);
    const resourceCoveredBytes = unionBytes(resource.coveredRanges);
    totalBytes += resourceTotalBytes;
    coveredBytes += Math.min(resourceCoveredBytes, resourceTotalBytes);
    coveredRanges += resource.coveredRangeCount;
    totalRanges += resource.totalRangeCount;
    resourceSummaries.push({
      url: resource.url,
      coveredBytes: Math.min(resourceCoveredBytes, resourceTotalBytes),
      totalBytes: resourceTotalBytes,
      percentage: percent(Math.min(resourceCoveredBytes, resourceTotalBytes), resourceTotalBytes),
      coveredRanges: resource.coveredRangeCount,
      totalRanges: resource.totalRangeCount,
    });
  }

  resourceSummaries.sort((left, right) => right.totalBytes - left.totalBytes || left.url.localeCompare(right.url));

  return {
    coveredBytes,
    totalBytes,
    percentage: percent(coveredBytes, totalBytes),
    coveredRanges,
    totalRanges,
    resources: resourceSummaries.length,
    resourceSummaries,
  };
}

function createCssResourceSummary(resources) {
  let coveredBytes = 0;
  let totalBytes = 0;
  let sourceBytes = 0;
  let coveredRanges = 0;
  let totalRanges = 0;
  const resourceSummaries = [];

  for (const resource of resources.values()) {
    const resourceCoveredBytes = unionBytes(resource.coveredRanges);
    coveredBytes += resourceCoveredBytes;
    totalBytes += resourceCoveredBytes;
    sourceBytes += resource.totalBytes;
    coveredRanges += resource.coveredRangeCount;
    totalRanges += resource.totalRangeCount;
    resourceSummaries.push({
      url: resource.url,
      coveredBytes: resourceCoveredBytes,
      totalBytes: resourceCoveredBytes,
      sourceBytes: resource.totalBytes,
      percentage: percent(resourceCoveredBytes, resourceCoveredBytes),
      coveredRanges: resource.coveredRangeCount,
      totalRanges: resource.totalRangeCount,
    });
  }

  resourceSummaries.sort((left, right) => right.sourceBytes - left.sourceBytes || left.url.localeCompare(right.url));

  return {
    coveredBytes,
    totalBytes,
    sourceBytes,
    percentage: percent(coveredBytes, totalBytes),
    coveredRanges,
    totalRanges,
    resources: resourceSummaries.length,
    resourceSummaries,
  };
}

async function jsonFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function waitForJsonFiles(dir, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const files = await jsonFiles(dir);
    if (files.length > 0) {
      return files;
    }
    await delay(250);
  }
  return jsonFiles(dir);
}

function upsertResource(resources, key, url, totalBytes = 0) {
  if (!resources.has(key)) {
    resources.set(key, {
      url: url || "(anonymous)",
      totalBytes,
      totalRanges: [],
      coveredRanges: [],
      totalRangeCount: 0,
      coveredRangeCount: 0,
    });
  }
  const resource = resources.get(key);
  resource.totalBytes = Math.max(resource.totalBytes, totalBytes);
  return resource;
}

function relativeRepoPath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function isAuthoredSource(filePath) {
  const relativePath = relativeRepoPath(filePath);
  return authoredSourcePatterns.some((pattern) => pattern.test(relativePath));
}

function isLocalProjectSource(filePath) {
  const relativePath = relativeRepoPath(filePath);
  return (
    filePath.startsWith(repoRoot) &&
    !relativePath.startsWith("coverage/") &&
    !relativePath.startsWith("node_modules/") &&
    !relativePath.startsWith("test-results/") &&
    !relativePath.startsWith("tests/") &&
    !relativePath.startsWith("scripts/")
  );
}

function localPathFromClientUrl(url) {
  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.pathname.startsWith("/_next/static/")) {
      return "";
    }
    const staticPath = decodeURIComponent(parsedUrl.pathname.slice("/_next/static/".length));
    return path.join(repoRoot, ".next", "dev", "static", staticPath);
  } catch {
    return "";
  }
}

function localPathFromFileUrl(url) {
  try {
    if (!url.startsWith("file://")) {
      return "";
    }
    return fileURLToPath(url);
  } catch {
    return "";
  }
}

async function readSourceMapForPath(filePath) {
  const mapPath = `${filePath}.map`;
  if (!existsSync(mapPath)) {
    return null;
  }

  const sourceMap = JSON.parse(await readFile(mapPath, "utf8"));
  return sourceMap.sections ? FlattenMap(sourceMap) : sourceMap;
}

function mergeV8FunctionCoverage(entries) {
  const functions = new Map();

  for (const entry of entries) {
    for (const fn of entry.functions || []) {
      const ranges = (fn.ranges || []).map((range) => ({
        startOffset: Number(range.startOffset),
        endOffset: Number(range.endOffset),
        count: Number(range.count) || 0,
      }));
      const key = [
        fn.functionName || "",
        fn.isBlockCoverage ? "1" : "0",
        ranges.map((range) => `${range.startOffset}:${range.endOffset}`).join(","),
      ].join("|");

      if (!functions.has(key)) {
        functions.set(key, {
          functionName: fn.functionName || "",
          isBlockCoverage: Boolean(fn.isBlockCoverage),
          ranges: ranges.map((range) => ({ ...range, count: 0 })),
        });
      }

      const mergedFunction = functions.get(key);
      ranges.forEach((range, index) => {
        mergedFunction.ranges[index].count += range.count;
      });
    }
  }

  return [...functions.values()];
}

function mergeIstanbulCoverage(target, source) {
  for (const [filePath, coverage] of Object.entries(source)) {
    if (!isAuthoredSource(filePath)) {
      continue;
    }

    if (!target[filePath]) {
      target[filePath] = JSON.parse(JSON.stringify(coverage));
      continue;
    }

    const existing = target[filePath];
    for (const [key, count] of Object.entries(coverage.s || {})) {
      existing.s[key] = Math.max(Number(existing.s[key]) || 0, Number(count) || 0);
    }
    for (const [key, count] of Object.entries(coverage.f || {})) {
      existing.f[key] = Math.max(Number(existing.f[key]) || 0, Number(count) || 0);
    }
    for (const [key, counts] of Object.entries(coverage.b || {})) {
      existing.b[key] = (counts || []).map((count, index) => Math.max(Number(existing.b[key]?.[index]) || 0, Number(count) || 0));
    }
  }
}

function summarizeIstanbulCoverage(coverageMap) {
  const files = [];
  const totals = {
    lines: { covered: 0, total: 0, convertedTotal: 0 },
    statements: { covered: 0, total: 0, convertedTotal: 0 },
    functions: { covered: 0, total: 0, convertedTotal: 0 },
    branches: { covered: 0, total: 0, convertedTotal: 0 },
  };

  for (const [filePath, coverage] of Object.entries(coverageMap)) {
    const lineCounts = new Map();
    for (const [statementId, location] of Object.entries(coverage.statementMap || {})) {
      const line = location.start?.line;
      if (!Number.isFinite(line)) {
        continue;
      }
      lineCounts.set(line, Math.max(lineCounts.get(line) || 0, Number(coverage.s?.[statementId]) || 0));
    }

    const statementCounts = Object.values(coverage.s || {});
    const functionCounts = Object.values(coverage.f || {});
    const branchCounts = Object.values(coverage.b || {}).flat();
    const fileSummary = {
      file: relativeRepoPath(filePath),
      lines: {
        covered: [...lineCounts.values()].filter((count) => count > 0).length,
        convertedTotal: lineCounts.size,
      },
      statements: {
        covered: statementCounts.filter((count) => Number(count) > 0).length,
        convertedTotal: statementCounts.length,
      },
      functions: {
        covered: functionCounts.filter((count) => Number(count) > 0).length,
        convertedTotal: functionCounts.length,
      },
      branches: {
        covered: branchCounts.filter((count) => Number(count) > 0).length,
        convertedTotal: branchCounts.length,
      },
    };

    for (const metric of ["lines", "statements", "functions", "branches"]) {
      fileSummary[metric].total = fileSummary[metric].covered;
      fileSummary[metric].uncoveredConverted = Math.max(0, fileSummary[metric].convertedTotal - fileSummary[metric].covered);
      fileSummary[metric].percentage = percent(fileSummary[metric].covered, fileSummary[metric].total);
      totals[metric].covered += fileSummary[metric].covered;
      totals[metric].total += fileSummary[metric].total;
      totals[metric].convertedTotal += fileSummary[metric].convertedTotal;
    }

    files.push(fileSummary);
  }

  files.sort((left, right) => left.file.localeCompare(right.file));

  for (const metric of Object.values(totals)) {
    metric.uncoveredConverted = Math.max(0, metric.convertedTotal - metric.covered);
    metric.percentage = percent(metric.covered, metric.total);
  }

  return {
    files: files.length,
    totals,
    fileSummaries: files,
  };
}

async function convertEntriesToIstanbul(groups) {
  const coverageMap = {};

  for (const { filePath, source, entries } of groups.values()) {
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      const sourceMap = await readSourceMapForPath(filePath);
      const sources = sourceMap
        ? { source: source || (await readFile(filePath, "utf8")), sourceMap: { sourcemap: sourceMap } }
        : source
          ? { source }
          : undefined;
      const converter = v8ToIstanbul(filePath, 0, sources);
      await converter.load();
      converter.applyCoverage(mergeV8FunctionCoverage(entries));
      mergeIstanbulCoverage(coverageMap, converter.toIstanbul());
    } catch (error) {
      console.warn(`[e2e coverage] skipped Istanbul conversion for ${relativeRepoPath(filePath)}: ${error.message}`);
    }
  }

  return coverageMap;
}

async function summarizeIstanbul(clientFiles, serverFiles) {
  const clientGroups = new Map();
  const serverGroups = new Map();

  for (const file of clientFiles) {
    const artifact = JSON.parse(await readFile(file, "utf8"));
    for (const entry of artifact.js || []) {
      if (!entry.source?.includes("[project]/")) {
        continue;
      }
      const filePath = localPathFromClientUrl(entry.url);
      if (!filePath || !isLocalProjectSource(filePath)) {
        continue;
      }
      const relativePath = relativeRepoPath(filePath);
      if (relativePath.includes("turbopack") || relativePath.includes("hmr-client")) {
        continue;
      }
      const key = `${filePath}:${hashText(entry.source)}`;
      if (!clientGroups.has(key)) {
        clientGroups.set(key, { filePath, source: entry.source, entries: [] });
      }
      clientGroups.get(key).entries.push(entry);
    }
  }

  for (const file of serverFiles) {
    const artifact = JSON.parse(await readFile(file, "utf8"));
    for (const entry of artifact.result || []) {
      const filePath = localPathFromFileUrl(entry.url || "");
      if (!filePath || !isLocalProjectSource(filePath)) {
        continue;
      }
      const relativePath = relativeRepoPath(filePath);
      if (!isAuthoredSource(filePath) && !relativePath.startsWith(".next/dev/server/")) {
        continue;
      }
      if (!serverGroups.has(filePath)) {
        serverGroups.set(filePath, { filePath, entries: [] });
      }
      serverGroups.get(filePath).entries.push(entry);
    }
  }

  const clientCoverage = await convertEntriesToIstanbul(clientGroups);
  const serverCoverage = await convertEntriesToIstanbul(serverGroups);

  return {
    client: {
      coverage: clientCoverage,
      summary: summarizeIstanbulCoverage(clientCoverage),
    },
    server: {
      coverage: serverCoverage,
      summary: summarizeIstanbulCoverage(serverCoverage),
    },
  };
}

async function summarizeClientCoverage(files) {
  const jsResources = new Map();
  const cssResources = new Map();

  for (const file of files) {
    const artifact = JSON.parse(await readFile(file, "utf8"));

    for (const entry of artifact.js || []) {
      const source = entry.source || "";
      const url = entry.url || "(anonymous script)";
      const key = `js:${url}:${hashText(source)}`;
      const resource = upsertResource(jsResources, key, url, source.length);

      for (const fn of entry.functions || []) {
        for (const range of fn.ranges || []) {
          resource.totalRangeCount += 1;
          mergeRanges(resource.totalRanges, [range]);
          if (Number(range.count) > 0) {
            resource.coveredRangeCount += 1;
            mergeRanges(resource.coveredRanges, [range]);
          }
        }
      }
    }

    for (const entry of artifact.css || []) {
      const text = entry.text || "";
      const url = entry.url || "(inline css)";
      const key = `css:${url}:${hashText(text)}`;
      const resource = upsertResource(cssResources, key, url, text.length);
      const ranges = entry.ranges || [];
      resource.totalRangeCount += ranges.length;
      resource.coveredRangeCount += ranges.length;
      mergeRanges(resource.coveredRanges, ranges);
    }
  }

  return {
    js: createResourceSummary(jsResources),
    css: createCssResourceSummary(cssResources),
  };
}

async function summarizeServerCoverage(files) {
  const resources = new Map();

  for (const file of files) {
    const artifact = JSON.parse(await readFile(file, "utf8"));
    for (const entry of artifact.result || []) {
      const url = entry.url || "(anonymous script)";
      const key = `server:${url}`;
      const resource = upsertResource(resources, key, url);

      for (const fn of entry.functions || []) {
        for (const range of fn.ranges || []) {
          resource.totalRangeCount += 1;
          mergeRanges(resource.totalRanges, [range]);
          if (Number(range.count) > 0) {
            resource.coveredRangeCount += 1;
            mergeRanges(resource.coveredRanges, [range]);
          }
        }
      }
    }
  }

  return createResourceSummary(resources);
}

function printMetric(label, metric) {
  const sourceBytes = metric.sourceBytes ? `, ${metric.sourceBytes} emitted source bytes` : "";
  console.log(
    `${label}: ${metric.coveredBytes}/${metric.totalBytes} bytes (${metric.percentage}%), ` +
      `${metric.coveredRanges}/${metric.totalRanges} ranges, ${metric.resources} resources${sourceBytes}`,
  );
}

const clientFiles = await jsonFiles(clientRawDir);
const serverFiles = await waitForJsonFiles(serverRawDir);
const client = await summarizeClientCoverage(clientFiles);
const serverNodeV8 = await summarizeServerCoverage(serverFiles);
const istanbul = await summarizeIstanbul(clientFiles, serverFiles);

const summary = {
  generatedAt: new Date().toISOString(),
  rawFiles: {
    client: clientFiles.map((file) => path.relative(process.cwd(), file)),
    serverV8: serverFiles.map((file) => path.relative(process.cwd(), file)),
  },
  client: {
    js: {
      coveredBytes: client.js.coveredBytes,
      totalBytes: client.js.totalBytes,
      percentage: client.js.percentage,
      coveredRanges: client.js.coveredRanges,
      totalRanges: client.js.totalRanges,
      resources: client.js.resources,
    },
    css: {
      coveredBytes: client.css.coveredBytes,
      totalBytes: client.css.totalBytes,
      sourceBytes: client.css.sourceBytes,
      percentage: client.css.percentage,
      coveredRanges: client.css.coveredRanges,
      totalRanges: client.css.totalRanges,
      resources: client.css.resources,
    },
  },
  server: {
    nodeV8: {
      coveredBytes: serverNodeV8.coveredBytes,
      totalBytes: serverNodeV8.totalBytes,
      percentage: serverNodeV8.percentage,
      coveredRanges: serverNodeV8.coveredRanges,
      totalRanges: serverNodeV8.totalRanges,
      resources: serverNodeV8.resources,
    },
  },
  limitations: [
    "Chromium-only browser coverage.",
    "Byte/range coverage, not statement/branch/function/line coverage.",
    "v8-to-istanbul JS conversion is emitted as a diagnostic artifact for authored files.",
    "Client JS is measured as browser-executed Next.js/dev bundled code, not clean authored component line coverage.",
    "CSS headline percentage is normalized to Playwright-reported used ranges; emitted source bytes are also recorded.",
    "Server coverage includes raw Node V8 coverage from the custom server and dev-server behavior.",
    "No thresholds are enforced.",
  ],
};

await writeFile(path.join(coverageRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(
  path.join(coverageRoot, "client-coverage.json"),
  `${JSON.stringify({ generatedAt: summary.generatedAt, js: client.js, css: client.css }, null, 2)}\n`,
);
await writeFile(
  path.join(coverageRoot, "istanbul-coverage.json"),
  `${JSON.stringify({ generatedAt: summary.generatedAt, client: istanbul.client.coverage, server: istanbul.server.coverage }, null, 2)}\n`,
);
await writeFile(
  path.join(coverageRoot, "istanbul-summary.json"),
  `${JSON.stringify({ generatedAt: summary.generatedAt, client: istanbul.client.summary, server: istanbul.server.summary }, null, 2)}\n`,
);

console.log("E2E coverage summary");
console.log(`Raw client files: ${clientFiles.length}`);
console.log(`Raw server V8 files: ${serverFiles.length}`);
printMetric("Client JS", client.js);
printMetric("Client CSS", client.css);
printMetric("Server Node raw V8", serverNodeV8);
console.log(`Istanbul authored JS diagnostics: client ${istanbul.client.summary.files} files, server ${istanbul.server.summary.files} files`);
console.log(`Wrote ${path.relative(process.cwd(), path.join(coverageRoot, "summary.json"))}`);
