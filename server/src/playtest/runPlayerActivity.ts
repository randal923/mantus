import type { Direction } from "@tibia/protocol";
import type { LoadTestClient } from "./LoadTestClient";

const SLICE_MS = 50;

export interface PlayerActivityMetrics {
  readonly actions: number;
  readonly actionsPerSecond: number;
  readonly latencySamples: number;
  readonly probeFailures: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly worstMs: number;
}

export async function runPlayerActivity(
  clients: ReadonlyArray<LoadTestClient>,
  options: {
    readonly durationMs: number;
    readonly activeFraction: number;
    readonly actionsPerActivePlayerSecond: number;
  },
): Promise<PlayerActivityMetrics> {
  const startedAt = performance.now();
  const deadline = startedAt + options.durationMs;
  const activeClientCount = Math.max(
    1,
    Math.floor(clients.length * options.activeFraction),
  );
  const actionsPerSlice =
    activeClientCount *
    options.actionsPerActivePlayerSecond *
    SLICE_MS /
    1_000;
  const directions: Direction[] = ["north", "east", "south", "west"];
  const pendingProbes: Array<Promise<number>> = [];
  let actionCredit = 0;
  let actionCursor = 0;
  let slice = 0;
  let actions = 0;

  while (performance.now() < deadline) {
    const sliceStartedAt = performance.now();
    actionCredit += actionsPerSlice;
    const count = Math.floor(actionCredit);
    actionCredit -= count;
    for (let offset = 0; offset < count; offset++) {
      const sequence = actionCursor++;
      const clientIndex = sequence % activeClientCount;
      const client = clients[clientIndex];
      if (!client) continue;
      const pattern =
        (Math.floor(sequence / clients.length) + clientIndex) % 4;
      if (pattern === 0) {
        pendingProbes.push(
          client
            .probe(directions[(slice + sequence) % directions.length]!, 10_000)
            .catch(() => Number.NaN),
        );
      } else if (pattern === 1) {
        client.sendActivity({
          type: "speak",
          mode: "say",
          text: `load-${slice % 1_000}`,
        });
      } else if (pattern === 2) {
        client.sendActivity({
          type: "move",
          direction: directions[(slice + sequence) % directions.length]!,
          queueStep: true,
        });
      } else {
        client.sendActivity({ type: "stop-move" });
      }
      actions++;
    }
    slice++;
    const waitMs = SLICE_MS - (performance.now() - sliceStartedAt);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  const probes = await Promise.all(pendingProbes);
  const latencies = probes
    .filter((latency) => Number.isFinite(latency))
    .sort((left, right) => left - right);
  const elapsedSeconds = Math.max(
    options.durationMs / 1_000,
    (performance.now() - startedAt) / 1_000,
  );
  const percentile = (fraction: number): number =>
    latencies[Math.floor((latencies.length - 1) * fraction)] ?? 0;
  return {
    actions,
    actionsPerSecond: actions / elapsedSeconds,
    latencySamples: latencies.length,
    probeFailures: probes.length - latencies.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    worstMs: latencies.at(-1) ?? 0,
  };
}
