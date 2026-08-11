import type { Position } from "@tibia/protocol";
import {
  ELEMENTAL_SHRINE_DESTINATIONS,
  ELEMENTAL_SHRINE_LEVEL,
} from "../../action/elementalShrineTables";
import { gotoTile } from "../gotoTile";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: the elemental shrine flames outside the Thais temple (Canary
 * `movements/teleport/shrine_entrance.lua` / `shrine_exit.lua`). Below level 30
 * the flame pushes the character straight back with the refusal line; at level
 * 30 it carries them to the ice shrine, and the shrine's own flame returns them
 * to Thais. Run with: yarn playtest:shrines
 */
const THAIS_ICE_FLAME: Position = { x: 32358, y: 32242, z: 6 };
// The temple's flames are walled in on three sides; only the east tile is free.
const FLAME_APPROACH: Position = { x: 32359, y: 32242, z: 6 };
const ICE_EXIT_FLAME: Position = { x: 32191, y: 31419, z: 2 };
const ICE_EXIT_APPROACH: Position = { x: 32191, y: 31420, z: 2 };
const THAIS_RETURN: Position = { x: 32369, y: 32242, z: 6 };

const suffix = [...String(Date.now() % 1_000_000)]
  .map((digit) => "abcdefghij"[Number(digit)])
  .join("");

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const pace = () => new Promise((resolve) => setTimeout(resolve, 300));

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl
  ? null
  : await startPlaytestServer({ log: false, disableCreatures: true });
const url = externalUrl ?? server!.url;
let failed = false;

try {
  const client = await PlaytestClient.connect(url);
  await client.enter(`dev-shrines-${suffix}`, `Shrine ${suffix}`);
  console.log(`entered as ${client.playerId}`);

  const command = async (line: string, label: string) => {
    const mark = client.mark();
    client.say(line);
    const reply = await client.waitFor(
      (m): m is Extract<typeof m, { type: "gm-response" }> =>
        m.type === "gm-response",
      `gm-response for ${label}`,
      { since: mark },
    );
    if (!reply.ok) throw new Error(`${label} failed: ${reply.text}`);
    return reply.text;
  };

  const walkInto = async (
    approach: Position,
    direction: "north" | "west",
  ) => {
    await pace();
    const failure = await gotoTile(
      client,
      approach,
      `beside ${approach.x},${approach.y},${approach.z}`,
    );
    if (failure) throw new Error(failure);
    const mark = client.mark();
    client.send({ type: "move", direction, queueStep: true });
    return mark;
  };

  step(`stepping into the Thais ice flame below level ${ELEMENTAL_SHRINE_LEVEL}`);
  const beforeRefusal = await walkInto(FLAME_APPROACH, "west");
  await client.waitFor(
    (m): m is Extract<typeof m, { type: "combat-log" }> =>
      m.type === "combat-log" &&
      m.text.startsWith("Only players of level 30 or higher"),
    "refusal line",
    { since: beforeRefusal },
  );
  ok("refused and pushed back");

  step(`raising the character to level ${ELEMENTAL_SHRINE_LEVEL}`);
  await pace();
  ok(await command(`/level ${ELEMENTAL_SHRINE_LEVEL}`, "/level"));

  step("stepping into the flame again (must reach the ice shrine)");
  const beforeEntry = await walkInto(FLAME_APPROACH, "west");
  const arrival = await client.waitFor(
    (m): m is Extract<typeof m, { type: "creature-moved" }> =>
      m.type === "creature-moved" &&
      m.creatureId === client.playerId &&
      Math.abs(m.position.x - ELEMENTAL_SHRINE_DESTINATIONS.ice.x) <= 2 &&
      Math.abs(m.position.y - ELEMENTAL_SHRINE_DESTINATIONS.ice.y) <= 2 &&
      m.position.z === ELEMENTAL_SHRINE_DESTINATIONS.ice.z,
    "teleport to the ice shrine",
    { since: beforeEntry, timeoutMs: 5_000 },
  );
  ok(`arrived at the ice shrine (${arrival.position.x},${arrival.position.y},${arrival.position.z})`);

  step("stepping into the shrine flame (must return to Thais)");
  const beforeExit = await walkInto(ICE_EXIT_APPROACH, "north");
  const back = await client.waitFor(
    (m): m is Extract<typeof m, { type: "creature-moved" }> =>
      m.type === "creature-moved" &&
      m.creatureId === client.playerId &&
      Math.abs(m.position.x - THAIS_RETURN.x) <= 2 &&
      Math.abs(m.position.y - THAIS_RETURN.y) <= 2 &&
      m.position.z === THAIS_RETURN.z,
    `teleport back to Thais from ${ICE_EXIT_FLAME.x},${ICE_EXIT_FLAME.y},${ICE_EXIT_FLAME.z}`,
    { since: beforeExit, timeoutMs: 5_000 },
  );
  ok(`returned to Thais (${back.position.x},${back.position.y},${back.position.z})`);

  console.log("\nPASS: elemental shrine flames gate, carry and return");
} catch (error) {
  failed = true;
  console.error("\nFAIL:", error);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
