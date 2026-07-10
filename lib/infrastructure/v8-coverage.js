import v8 from "node:v8";

export function flushV8Coverage(env = process.env) {
  if (env.NODE_V8_COVERAGE) {
    v8.takeCoverage();
  }
}

export function startPeriodicV8CoverageFlush(env = process.env, intervalMs = 1_000) {
  if (!env.NODE_V8_COVERAGE) {
    return null;
  }

  const timer = setInterval(() => flushV8Coverage(env), intervalMs);
  timer.unref();
  return timer;
}
