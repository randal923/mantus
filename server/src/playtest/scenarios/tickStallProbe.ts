import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";
import { monotonicNow } from "../../monotonicNow";

/**
 * Scenario: play actively for 100 seconds and assert the game server's event
 * loop never stalls long enough to freeze the game ("the game freezes every
 * 20-30s"). A monitor injected via NODE_OPTIONS records every event-loop
 * stall >40ms, GC pause >20ms, and wall-clock correction >100ms inside the
 * real server process. The run spans the 30s character-save and heartbeat
 * periods matching the reported cadence. Run with: yarn playtest:tick-stall
 */
const TOKEN = "dev-stall-probe";
const CHARACTER = "Stall Probe";
const RUN_MS = Number(process.env.STALL_RUN_MS ?? 120_000);
/** Four missed 25ms ticks in a row reads as a visible hitch in-game. */
const MAX_STALL_MS = 100;

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);

const lagLogPath = join(mkdtempSync(join(tmpdir(), "tibia-lag-")), "lag.jsonl");
writeFileSync(lagLogPath, "");
const monitorPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../lagMonitor.mjs",
);
process.env.NODE_OPTIONS =
  `${process.env.NODE_OPTIONS ?? ""} --import ${monitorPath}`.trim();
process.env.LAG_LOG_PATH = lagLogPath;

const server = await startPlaytestServer({ log: false });
let failed = false;

try {
  step(`connecting to ${server.url} as ${CHARACTER}`);
  const client = await PlaytestClient.connect(server.url);
  await client.enter(TOKEN, CHARACTER);
  ok(`entered world as ${client.playerId}`);
  const enteredAt = monotonicNow();

  step(`walking for ${RUN_MS / 1000}s while the monitor records stalls`);
  const directions = ["east", "west"] as const;
  let flip = 0;
  while (monotonicNow() - enteredAt < RUN_MS) {
    client.send({
      type: "move",
      direction: directions[flip % 2]!,
      queueStep: true,
    });
    flip += 1;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  client.send({ type: "stop-move" });
  client.terminate();

  step("checking recorded server stalls");
  const events = readFileSync(lagLogPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(
      (line) =>
        JSON.parse(line) as { at: number; kind: string; durationMs: number },
    )
    // Startup (module loading, map parse) legitimately blocks the loop;
    // only stalls while a player is in the world can freeze the game.
    .filter((event) => event.at >= enteredAt);
  const stalls = events.filter((event) => event.kind !== "clock-adjustment");
  const clockAdjustments = events.filter(
    (event) => event.kind === "clock-adjustment",
  );
  const worst = stalls.reduce(
    (max, event) => Math.max(max, event.durationMs),
    0,
  );
  for (const event of events) {
    const secondsIn = ((event.at - enteredAt) / 1000).toFixed(1);
    console.log(`  t+${secondsIn}s ${event.kind} ${event.durationMs}ms`);
  }
  if (worst >= MAX_STALL_MS) {
    throw new Error(
      `server event loop stalled ${worst}ms during play (limit ${MAX_STALL_MS}ms)`,
    );
  }
  ok(
    `no stall reached ${MAX_STALL_MS}ms across ${RUN_MS / 1000}s ` +
      `(${stalls.length} minor stall/GC events, worst ${worst}ms; ` +
      `${clockAdjustments.length} wall-clock corrections)`,
  );

  console.log("\nPASS: server tick loop stays responsive during play\n");
} catch (cause) {
  failed = true;
  console.error(
    `\nFAIL: ${cause instanceof Error ? cause.message : String(cause)}\n`,
  );
} finally {
  // The child's exit event is occasionally never observed on WSL2, which
  // would leave this await unsettled and turn a PASS into exit code 13;
  // the harness has already SIGKILLed the child by the 15s fallback.
  await Promise.race([
    server.stop(),
    new Promise((resolve) => setTimeout(resolve, 20_000)),
  ]);
}
process.exit(failed ? 1 : 0);
