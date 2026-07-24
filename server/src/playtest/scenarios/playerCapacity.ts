import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Direction } from "@tibia/protocol";
import { LoadTestClient } from "../LoadTestClient";
import { runPlayerActivity } from "../runPlayerActivity";

interface ServerMetrics {
  readonly at: number;
  readonly sessions: number;
  readonly players: number;
  readonly rssBytes: number;
  readonly heapUsedBytes: number;
  readonly eventLoopP99Ms: number;
  readonly eventLoopMaxMs: number;
}

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const targetPlayers = Number(process.env.LOAD_TEST_PLAYERS ?? 2_000);
const externalUrl = process.env.LOAD_TEST_URL;
const maxProbeP95Ms = Number(process.env.LOAD_TEST_MAX_P95_MS ?? 1_000);
const activitySeconds = Number(process.env.LOAD_TEST_ACTIVITY_SECONDS ?? 0);
const activePercent = Number(process.env.LOAD_TEST_ACTIVE_PERCENT ?? 30);
const actionsPerActivePlayerSecond = Number(
  process.env.LOAD_TEST_ACTIONS_PER_ACTIVE_PLAYER_SECOND ?? 2,
);
const maxEventLoopDelayMs = Number(
  process.env.LOAD_TEST_MAX_EVENT_LOOP_MS ?? 500,
);
const maxRssBytes =
  Number(process.env.LOAD_TEST_MAX_RSS_MB ?? 1_500) * 1024 * 1024;
if (
  !Number.isSafeInteger(targetPlayers) ||
  targetPlayers < 1 ||
  targetPlayers > 10_000
) {
  throw new Error("LOAD_TEST_PLAYERS must be an integer from 1 to 10000");
}
if (!Number.isFinite(activitySeconds) || activitySeconds < 0) {
  throw new Error("LOAD_TEST_ACTIVITY_SECONDS must be non-negative");
}
if (
  !Number.isFinite(activePercent) ||
  activePercent <= 0 ||
  activePercent > 100
) {
  throw new Error("LOAD_TEST_ACTIVE_PERCENT must be from 0 to 100");
}
if (
  !Number.isFinite(actionsPerActivePlayerSecond) ||
  actionsPerActivePlayerSecond <= 0 ||
  actionsPerActivePlayerSecond > 10
) {
  throw new Error(
    "LOAD_TEST_ACTIONS_PER_ACTIVE_PLAYER_SECOND must be from 0 to 10",
  );
}

const configuredStages = process.env.LOAD_TEST_STAGES?.split(",").map(Number);
const stages = [
  ...new Set(
    (configuredStages ?? [100, 300, 500, 1_000, 2_000, targetPlayers])
      .filter(
        (count) =>
          Number.isSafeInteger(count) &&
          count > 0 &&
          count <= targetPlayers,
      )
      .concat(targetPlayers)
      .sort((left, right) => left - right),
  ),
];
const child: ChildProcess | null = externalUrl
  ? null
  : spawn(
      process.execPath,
      ["--import", "tsx", "src/playtest/playerLoadServer.ts"],
      {
        cwd: serverRoot,
        env: {
          ...process.env,
          LOAD_TEST_PLAYERS: String(targetPlayers),
          LOAD_TEST_PORT: process.env.LOAD_TEST_PORT ?? "4125",
        },
        stdio: ["ignore", "pipe", "inherit"],
      },
    );

const metrics: ServerMetrics[] = [];
let output = "";
let readyUrl = externalUrl ?? "";
const ready = new Promise<void>((resolve, reject) => {
  if (!child) {
    console.log(`PLAYER_LOAD_EXTERNAL_SERVER ${readyUrl}`);
    resolve();
    return;
  }
  child.once("error", reject);
  child.once("exit", (code) => {
    if (!readyUrl) {
      reject(new Error(`player load server exited with code ${String(code)}`));
    }
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    output += chunk.toString();
    const lines = output.split("\n");
    output = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("PLAYER_LOAD_SERVER_READY ")) {
        readyUrl = line.slice("PLAYER_LOAD_SERVER_READY ".length).trim();
        resolve();
      }
      if (!line.startsWith("LOAD_SERVER_METRICS ")) continue;
      metrics.push(
        JSON.parse(line.slice("LOAD_SERVER_METRICS ".length)) as ServerMetrics,
      );
    }
  });
});

const clients: LoadTestClient[] = [];
let failed = false;

try {
  await ready;
  console.log(`\n▶ ramping real WebSocket players to ${targetPlayers}`);
  for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
    const stage = stages[stageIndex]!;
    const rampStartedAt = performance.now();
    for (let start = clients.length; start < stage; start += 100) {
      const end = Math.min(stage, start + 100);
      const batch = Array.from(
        { length: end - start },
        (_, offset) => LoadTestClient.connect(readyUrl, start + offset),
      );
      clients.push(...await Promise.all(batch));
    }
    const rampMs = performance.now() - rampStartedAt;
    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const metricsMark = metrics.length;
    const directions: Direction[] = ["east", "north", "west", "south"];
    const probeRounds = stage === targetPlayers ? 3 : 1;
    const latencies: number[] = [];
    for (let round = 0; round < probeRounds; round++) {
      const direction = directions[(stageIndex + round) % directions.length]!;
      latencies.push(
        ...await Promise.all(
          clients.map((client) => client.probe(direction)),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const sorted = [...latencies].sort((left, right) => left - right);
    const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0;
    const worst = sorted.at(-1) ?? 0;
    const stageMetrics = metrics.slice(metricsMark);
    const latest = stageMetrics.at(-1);
    const eventLoopMax = Math.max(
      0,
      ...stageMetrics.map((sample) => sample.eventLoopMaxMs),
    );
    const rssBytes = Math.max(
      0,
      ...stageMetrics.map((sample) => sample.rssBytes),
    );

    if (
      child &&
      (!latest || latest.sessions !== stage || latest.players !== stage)
    ) {
      throw new Error(
        `${stage} clients welcomed, but server metrics reported ` +
          `${latest?.sessions ?? 0} sessions/${latest?.players ?? 0} players`,
      );
    }
    if (clients.some((client) => !client.isConnected)) {
      throw new Error(`a client disconnected during the ${stage}-player stage`);
    }
    if (p95 > maxProbeP95Ms) {
      throw new Error(
        `${stage}-player turn latency p95 ${p95.toFixed(1)}ms exceeded ` +
          `${maxProbeP95Ms}ms`,
      );
    }
    if (child && eventLoopMax > maxEventLoopDelayMs) {
      throw new Error(
        `${stage}-player server event-loop delay ${eventLoopMax.toFixed(1)}ms ` +
          `exceeded ${maxEventLoopDelayMs}ms`,
      );
    }
    if (child && rssBytes > maxRssBytes) {
      throw new Error(
        `${stage}-player server RSS ${(rssBytes / 1024 / 1024).toFixed(0)}MB ` +
          `exceeded ${(maxRssBytes / 1024 / 1024).toFixed(0)}MB`,
      );
    }
    const serverMetrics = child
      ? `, event-loop max ${eventLoopMax.toFixed(1)}ms, ` +
        `RSS ${(rssBytes / 1024 / 1024).toFixed(0)}MB`
      : "";
    console.log(
      `  ✓ ${stage} online: ramp ${rampMs.toFixed(0)}ms, ` +
        `${probeRounds} turn burst${probeRounds === 1 ? "" : "s"} p95 ` +
        `${p95.toFixed(1)}ms (worst ${worst.toFixed(1)}ms)` +
        serverMetrics,
    );
    if (stage === targetPlayers && activitySeconds > 0) {
      const activity = await runPlayerActivity(clients, {
        durationMs: activitySeconds * 1_000,
        activeFraction: activePercent / 100,
        actionsPerActivePlayerSecond,
      });
      if (activity.probeFailures > 0) {
        throw new Error(
          `${activity.probeFailures} mixed-activity latency probes failed`,
        );
      }
      if (activity.p95Ms > maxProbeP95Ms) {
        throw new Error(
          `mixed-activity latency p95 ${activity.p95Ms.toFixed(1)}ms exceeded ` +
            `${maxProbeP95Ms}ms`,
        );
      }
      console.log(
        `  ✓ mixed activity: ${activity.actions} actions, ` +
          `${activity.actionsPerSecond.toFixed(1)}/s, ` +
          `${activePercent}% active at ` +
          `${actionsPerActivePlayerSecond}/s; latency p50 ` +
          `${activity.p50Ms.toFixed(1)}ms, p95 ` +
          `${activity.p95Ms.toFixed(1)}ms, p99 ` +
          `${activity.p99Ms.toFixed(1)}ms, worst ` +
          `${activity.worstMs.toFixed(1)}ms`,
      );
    }
  }
  console.log(
    `\nPASS: ${targetPlayers} concurrent players stayed online and responsive\n`,
  );
} catch (cause) {
  failed = true;
  console.error(
    `\nFAIL: ${cause instanceof Error ? cause.message : String(cause)}\n`,
  );
} finally {
  for (const client of clients) client.terminate();
  if (child) {
    child.kill("SIGINT");
    const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
    if (child.exitCode === null && child.signalCode === null) {
      await once(child, "exit").catch(() => undefined);
    }
    clearTimeout(timeout);
  }
}

process.exit(failed ? 1 : 0);
