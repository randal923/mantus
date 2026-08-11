import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: the way back out of the Cults of Tibia Carlin hideout. The crypt
 * portal at (32403,31810,8) is a static map teleport into the hideout; the
 * exit at (32351,31679,8) has no OTBM destination (Canary drives it from a
 * Lua MoveEvent), so QUEST_TELEPORTS must return the player to the crypt at
 * (32403,31813,8). From there the decaying wall blocks the corridor north,
 * and the inside sconce at (32395,31808,8) (OTBM aid 5524, same as the
 * north torch) must grind it away. Run with: yarn playtest:carlin-portal
 */
const ARRIVAL = { x: 32351, y: 31676, z: 8 };
const LANDING = { x: 32403, y: 31813, z: 8 };
const SCONCE = { x: 32395, y: 31808, z: 8 };
const SCONCE_STAND = { x: 32396, y: 31808, z: 8 };
const WALL = { x: 32396, y: 31806, z: 8 };
const GRINDING =
  "You hear a loud grinding sound not very far from you. something very heavy seems to have moved.";

// The playtest database persists between runs, so every run brings a fresh
// per-run account token and character (letters only in character names).
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
  await client.enter(`dev-carlin-portal-${suffix}`, `Portal Tester ${suffix}`);
  console.log("entered as", client.playerId);

  const before = client.mark();
  client.say(`/goto ${ARRIVAL.x} ${ARRIVAL.y} ${ARRIVAL.z}`);
  const reply = await client.waitFor(
    (m): m is Extract<typeof m, { type: "gm-response" }> =>
      m.type === "gm-response",
    "gm-response for goto",
    { since: before },
  );
  if (!reply.ok) throw new Error(`/goto failed: ${reply.text}`);
  console.log("at the hideout arrival spot:", reply.text);

  // Walk south two tiles, then step onto the exit portal on the third.
  for (let i = 0; i < 2; i++) {
    const stepMark = client.mark();
    client.send({ type: "move", direction: "south", queueStep: true });
    await client.waitFor(
      (m): m is Extract<typeof m, { type: "creature-moved" }> =>
        m.type === "creature-moved" &&
        m.creatureId === client.playerId &&
        m.position.y === ARRIVAL.y + i + 1,
      `step south ${i + 1}`,
      { since: stepMark },
    );
  }
  const portalStep = client.mark();
  client.send({ type: "move", direction: "south", queueStep: true });
  const landed = await client.waitFor(
    (m): m is Extract<typeof m, { type: "creature-moved" }> =>
      m.type === "creature-moved" &&
      m.creatureId === client.playerId &&
      m.position.x === LANDING.x &&
      m.position.y === LANDING.y &&
      m.position.z === LANDING.z,
    "teleport to the crypt landing",
    { since: portalStep, timeoutMs: 5_000 },
  );
  console.log("landed at", JSON.stringify(landed.position));

  // From the landing, the decaying wall blocks the way north; the inside
  // sconce must remove it.
  const standMark = client.mark();
  client.say(`/goto ${SCONCE_STAND.x} ${SCONCE_STAND.y} ${SCONCE_STAND.z}`);
  const standReply = await client.waitFor(
    (m): m is Extract<typeof m, { type: "gm-response" }> =>
      m.type === "gm-response",
    "gm-response for goto beside the sconce",
    { since: standMark },
  );
  if (!standReply.ok) throw new Error(`/goto failed: ${standReply.text}`);
  console.log("standing beside the inside sconce:", standReply.text);

  const touchMark = client.mark();
  client.send({ type: "use-map", position: SCONCE });
  const grind = await client.waitFor(
    (m): m is Extract<typeof m, { type: "combat-log" }> =>
      m.type === "combat-log",
    "combat-log after touching the inside sconce",
    { since: touchMark },
  );
  if (grind.text !== GRINDING) {
    throw new Error(`expected the grinding line, got: "${grind.text}"`);
  }
  console.log("inside sconce ground the wall away");

  for (let i = 0; i < 2; i++) {
    const stepMark = client.mark();
    client.send({ type: "move", direction: "north", queueStep: true });
    await client.waitFor(
      (m): m is Extract<typeof m, { type: "creature-moved" }> =>
        m.type === "creature-moved" &&
        m.creatureId === client.playerId &&
        m.position.y === SCONCE_STAND.y - i - 1,
      `step north ${i + 1} toward the wall`,
      { since: stepMark },
    );
  }
  console.log(`walked through the removed wall onto (${WALL.x},${WALL.y})`);

  console.log(
    "\nPASS: hideout exit portal + inside sconce free a trapped player",
  );
} catch (error) {
  failed = true;
  console.error("\nFAIL:", error);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
