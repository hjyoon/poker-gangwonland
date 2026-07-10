import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const coverageRoot = path.join(process.cwd(), "coverage", "e2e");

await rm(coverageRoot, { recursive: true, force: true });
await mkdir(path.join(coverageRoot, "raw", "client"), { recursive: true });
await mkdir(path.join(coverageRoot, "raw", "engine-v8"), { recursive: true });
await mkdir(path.join(coverageRoot, "meaningful"), { recursive: true });

console.log(`Cleaned ${path.relative(process.cwd(), coverageRoot)}`);
