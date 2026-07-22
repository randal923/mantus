import { performance } from "node:perf_hooks";

export function monotonicNow(): number {
  return Math.floor(performance.timeOrigin + performance.now());
}
