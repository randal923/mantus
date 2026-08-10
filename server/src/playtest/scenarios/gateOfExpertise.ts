import { Client } from "pg";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: the Darashia dragon-tower gate of expertise (level 40) refuses
 * a fresh character and opens once the character is level 65. Runs against
 * its own dedicated database (dropped and recreated every run): the level-1
 * refusal leg needs a fresh character AND a pristine still-closed gate, and
 * both persist across runs otherwise. Run with: yarn playtest:gate
 */
const GATE = { x: 33266, y: 32278, z: 7 };
const STAND = { x: 33266, y: 32279, z: 7 };
const OPEN_GATE_ID = 5_294;
const TOKEN = "dev-gate-scenario";
const CHARACTER = "Gate Tester";
const GATE_DATABASE = "playtest_gate";
const ADMIN_URL =
  process.env.PLAYTEST_ADMIN_URL ??
  "postgres://tibia:tibia_dev_only@localhost:5432/postgres";

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
// An exhausted use-map is silently treated as a walk-click, so back-to-back
// uses need the exhaust window to lapse in between.
const useExhaust = () => new Promise((resolve) => setTimeout(resolve, 450));

const externalUrl = process.env.PLAYTEST_SERVER_URL;
if (!externalUrl) {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${GATE_DATABASE} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
  process.env.PLAYTEST_DATABASE = GATE_DATABASE;
}
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let failed = false;

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const client = await PlaytestClient.connect(url);
  await client.enter(TOKEN, CHARACTER);
  ok(`entered world as ${client.playerId}`);

  step(`teleporting in front of the gate (${STAND.x},${STAND.y},${STAND.z})`);
  client.say(`/goto ${STAND.x} ${STAND.y} ${STAND.z}`);
  const gotoReply = await client.waitFor(
    (m): m is Extract<typeof m, { type: "gm-response" }> =>
      m.type === "gm-response",
    "gm-response for /goto",
  );
  if (!gotoReply.ok) throw new Error(`/goto failed: ${gotoReply.text}`);
  ok(gotoReply.text);

  step("using the gate at level 1 (must refuse)");
  const beforeLowLevel = client.mark();
  client.send({ type: "use-map", position: GATE });
  const refusal = await client.waitFor(
    (m): m is Extract<typeof m, { type: "combat-log" }> =>
      m.type === "combat-log",
    "combat-log refusal",
    { since: beforeLowLevel },
  );
  ok(`refused with: "${refusal.text}"`);

  step("raising level to 65");
  client.say("/level 65");
  const levelReply = await client.waitFor(
    (m): m is Extract<typeof m, { type: "gm-response" }> =>
      m.type === "gm-response",
    "gm-response for /level",
  );
  if (!levelReply.ok) throw new Error(`/level failed: ${levelReply.text}`);
  ok(levelReply.text);

  step("using the gate at level 65 (must open)");
  await useExhaust();
  const beforeOpen = client.mark();
  client.send({ type: "use-map", position: GATE });
  const opened = await client.waitFor(
    (m): m is Extract<typeof m, { type: "tile-states" }> =>
      m.type === "tile-states" &&
      m.visible.some(
        (tile) =>
          tile.position.x === GATE.x &&
          tile.position.y === GATE.y &&
          tile.position.z === GATE.z &&
          tile.items.some((item) => item.itemId === OPEN_GATE_ID),
      ),
    "tile-states with the open gate",
    { since: beforeOpen },
  );
  const gateTile = opened.visible.find(
    (tile) => tile.position.x === GATE.x && tile.position.y === GATE.y,
  );
  ok(
    `gate opened: tile now holds [${gateTile?.items
      .map((item) => item.itemId)
      .join(", ")}]`,
  );

  step("walking through the open gate");
  const beforeStep = client.mark();
  client.send({ type: "move", direction: "north", queueStep: true });
  await client.waitFor(
    (m): m is Extract<typeof m, { type: "creature-moved" }> =>
      m.type === "creature-moved" &&
      m.creatureId === client.playerId &&
      m.position.y === GATE.y,
    "step onto the gate tile",
    { since: beforeStep },
  );
  ok("stepped onto the opened gate tile");

  console.log("\nPASS: gate of expertise gating and opening work end to end");
} catch (error) {
  failed = true;
  console.error("\nFAIL:", error);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
