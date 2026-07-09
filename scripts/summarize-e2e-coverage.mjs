import { readdir, readFile, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const coverageRoot = path.join(process.cwd(), "coverage", "e2e");
const clientRawDir = path.join(coverageRoot, "raw", "client");
const serverRawDir = path.join(coverageRoot, "raw", "server-v8");

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
    css: createResourceSummary(cssResources),
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
  console.log(
    `${label}: ${metric.coveredBytes}/${metric.totalBytes} bytes (${metric.percentage}%), ` +
      `${metric.coveredRanges}/${metric.totalRanges} ranges, ${metric.resources} resources`,
  );
}

const clientFiles = await jsonFiles(clientRawDir);
const serverFiles = await waitForJsonFiles(serverRawDir);
const client = await summarizeClientCoverage(clientFiles);
const serverNodeV8 = await summarizeServerCoverage(serverFiles);

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
    "Client JS is measured as browser-executed Next.js/dev bundled code, not clean authored component line coverage.",
    "CSS coverage may not map to authored lines.",
    "Server coverage includes raw Node V8 coverage from the custom server and dev-server behavior.",
    "No thresholds are enforced.",
  ],
};

await writeFile(path.join(coverageRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(
  path.join(coverageRoot, "client-coverage.json"),
  `${JSON.stringify({ generatedAt: summary.generatedAt, js: client.js, css: client.css }, null, 2)}\n`,
);

console.log("E2E coverage summary");
console.log(`Raw client files: ${clientFiles.length}`);
console.log(`Raw server V8 files: ${serverFiles.length}`);
printMetric("Client JS", client.js);
printMetric("Client CSS", client.css);
printMetric("Server Node raw V8", serverNodeV8);
console.log(`Wrote ${path.relative(process.cwd(), path.join(coverageRoot, "summary.json"))}`);
