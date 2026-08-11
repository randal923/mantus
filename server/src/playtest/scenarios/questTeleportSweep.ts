import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Position } from "@tibia/protocol";
import { QUEST_TELEPORTS } from "../../action/questTeleportTables";
import { readMapWalkability } from "../../readMapWalkability";
import { gotoTile } from "../gotoTile";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: every script-driven portal in `QUEST_TELEPORTS`. For each entry the
 * character is teleported next to the portal, then *walks* into it — the only
 * way the step-in handler fires — and must land on the table's destination.
 * Portals with no walkable neighbour are reported instead of silently skipped.
 * Run with: yarn playtest:quest-teleports
 */
const dataDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "data",
);
const tileAt = readMapWalkability(join(dataDir, "otservbr.map.bin"));

const NEIGHBOURS: ReadonlyArray<{
  direction: "north" | "south" | "east" | "west";
  dx: number;
  dy: number;
}> = [
  { direction: "north", dx: 0, dy: 1 },
  { direction: "south", dx: 0, dy: -1 },
  { direction: "east", dx: -1, dy: 0 },
  { direction: "west", dx: 1, dy: 0 },
];

/** `positionKey` is "z:x,y". */
const parseKey = (key: string): Position => {
  const [floor, plane] = key.split(":");
  const [x, y] = plane!.split(",").map(Number);
  return { x: x!, y: y!, z: Number(floor) };
};

const portals = [...QUEST_TELEPORTS.entries()].map(([key, definition]) => ({
  source: parseKey(key),
  destination: definition.destination,
}));

const suffix = [...String(Date.now() % 1_000_000)]
  .map((digit) => "abcdefghij"[Number(digit)])
  .join("");

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl
  ? null
  : await startPlaytestServer({ log: false, disableCreatures: true });
const url = externalUrl ?? server!.url;
let failed = false;

try {
  const client = await PlaytestClient.connect(url);
  await client.enter(`dev-teleports-${suffix}`, `Sweeper ${suffix}`);
  console.log(`entered as ${client.playerId}; ${portals.length} portals to walk`);

  const failures: string[] = [];
  const skipped: string[] = [];
  let passed = 0;
  // One `/goto` plus one step per portal would breach the protocol message
  // rate (30/s) and the chat flood buffer well before the table is done, and
  // the server disconnects on breach — so the sweep paces itself.
  const pace = () => new Promise((resolve) => setTimeout(resolve, 300));
  for (const portal of portals) {
    await pace();
    const label = `${portal.source.x},${portal.source.y},${portal.source.z}`;
    const approach = NEIGHBOURS.map((neighbour) => ({
      ...neighbour,
      position: {
        x: portal.source.x + neighbour.dx,
        y: portal.source.y + neighbour.dy,
        z: portal.source.z,
      },
    })).find((candidate) => tileAt(candidate.position) === "walkable");
    if (!approach) {
      // Portals inside sealed arenas (quest scenery blocks every neighbour)
      // cannot be walked into from a fresh map, so they are reported, not
      // failed: the table test already proved the tile and destination.
      skipped.push(`${label}: no walkable tile beside the portal`);
      continue;
    }
    const gotoFailure = await gotoTile(client, approach.position, label);
    if (gotoFailure) {
      failures.push(`${label}: ${gotoFailure}`);
      continue;
    }
    const stepMark = client.mark();
    client.send({ type: "move", direction: approach.direction, queueStep: true });
    try {
      const landed = await client.waitFor(
        (m): m is Extract<typeof m, { type: "creature-moved" }> =>
          m.type === "creature-moved" &&
          m.creatureId === client.playerId &&
          Math.abs(m.position.x - portal.destination.x) <= 2 &&
          Math.abs(m.position.y - portal.destination.y) <= 2 &&
          m.position.z === portal.destination.z,
        `teleport from ${label}`,
        { since: stepMark, timeoutMs: 4_000 },
      );
      passed++;
      console.log(
        `  ✓ ${label} -> ${landed.position.x},${landed.position.y},${landed.position.z}`,
      );
    } catch {
      failures.push(
        `${label}: stepping ${approach.direction} did not land near ${portal.destination.x},${portal.destination.y},${portal.destination.z}`,
      );
    }
  }

  console.log(`\n${passed}/${portals.length} portals teleported`);
  for (const skip of skipped) console.log(`  – skipped ${skip}`);
  if (failures.length > 0) {
    failed = true;
    console.error("\nFAIL:");
    for (const failure of failures) console.error(`  ✗ ${failure}`);
  } else {
    console.log("\nPASS: every quest teleport moved the player");
  }
} catch (error) {
  failed = true;
  console.error("\nFAIL:", error);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
