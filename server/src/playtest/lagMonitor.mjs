// Injected into the game-server child via NODE_OPTIONS=--import by the
// tick-stall playtest. Appends one JSON line per event-loop stall or long GC
// pause to LAG_LOG_PATH so the scenario can assert on server responsiveness.
// Plain .mjs: it must load before tsx registers.
import { appendFileSync } from "node:fs";
import { PerformanceObserver } from "node:perf_hooks";

const logPath = process.env.LAG_LOG_PATH;
if (logPath) {
  const record = (event) => {
    appendFileSync(logPath, `${JSON.stringify({ at: Date.now(), ...event })}\n`);
  };

  let last = process.hrtime.bigint();
  const interval = setInterval(() => {
    const now = process.hrtime.bigint();
    const stallMs = Number(now - last) / 1e6 - 25;
    last = now;
    if (stallMs > 40) {
      record({ kind: "stall", durationMs: Math.round(stallMs * 10) / 10 });
    }
  }, 25);
  interval.unref();

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration > 20) {
        record({
          kind: "gc",
          durationMs: Math.round(entry.duration * 10) / 10,
        });
      }
    }
  });
  observer.observe({ entryTypes: ["gc"] });
}
