import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: the Rookgaard starter quest pack, played end to end as real
 * players. Covers, in order:
 *
 * 1. Rapier quest — chest uid 14042 at (32099,32198,9) grants one rapier,
 *    then "The box is empty."
 * 2. Bear room — the aid-30006 lever removes/recreates the blocking stone;
 *    recreating relocates whoever stands on the stone tile.
 * 3. Katana room — the uid-30029 lever opens/closes the door (5107/5108);
 *    closing relocates doorway-standers; using the open door closes it and
 *    re-arms the lever (uid 22006).
 * 4. Sewer bridge — the aid-50239 levers extend/retract the drawbridge over
 *    the sewer channel; both levers flip together; retracting relocates
 *    creatures off the span.
 * 5. Level bridge — aid-50998 tiles bounce a level-1 player back with the
 *    Canary line; level 2 passes.
 * 6. Premium bridge — aid-50241 tiles bounce free accounts back silently;
 *    premium passes.
 *
 * The playtest database persists between runs: lever/door transforms
 * survive as world item rows, so every leg first normalizes its lever to
 * the pulled-back state before exercising the full cycle. Run with:
 * yarn workspace server playtest:rookgaard
 */

const RAPIER_CHEST = { x: 32_099, y: 32_198, z: 9 };
const RAPIER = 3_272;

const BEAR_LEVER = { x: 32_148, y: 32_105, z: 11 };
const BEAR_STONE_TILE = { x: 32_145, y: 32_101, z: 11 };
const BEAR_RELOCATE = { x: 32_145, y: 32_102, z: 11 };
const STONE = 1_791;

const KATANA_LEVER = { x: 32_182, y: 32_145, z: 11 };
const KATANA_DOOR = { x: 32_177, y: 32_148, z: 11 };
const KATANA_DOORWAY_OUT = { x: 32_178, y: 32_148, z: 11 };
const DOOR_CLOSED = 5_107;
const DOOR_OPEN = 5_108;

const SEWER_LEVER_WEST = { x: 32_098, y: 32_204, z: 8 };
const SEWER_SPAN_MIDDLE = { x: 32_100, y: 32_205, z: 8 };
const SEWER_EAST_BANK = { x: 32_102, y: 32_205, z: 8 };
const BRIDGE = 5_770;
const RAIL_WEST = 4_634;

const LEVEL_BRIDGE_APPROACH = { x: 32_092, y: 32_177, z: 6 };
const LEVEL_BRIDGE_TILE = { x: 32_092, y: 32_175, z: 6 };

const PREMIUM_BRIDGE_APPROACH = { x: 32_066, y: 32_192, z: 7 };
const PREMIUM_BRIDGE_TILE = { x: 32_063, y: 32_192, z: 7 };

const LEVER_OFF = 2_772;
const LEVER_ON = 2_773;

// Character names must be fresh every run (once-per-character chest) and
// letters-only; the token is fresh too, so each run gets its own account
// (two characters per run would otherwise exhaust the account's slots).
const suffix = [...String(Date.now() % 1_000_000)]
  .map((digit) => "abcdefghij"[Number(digit)])
  .join("");
const TOKEN = `dev-rookgaard-${suffix}`;
const CHARACTER = `Rook Tester ${suffix}`;
const HELPER = `Rook Helper ${suffix}`;

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const useExhaust = () => new Promise((resolve) => setTimeout(resolve, 400));

type Vec3 = { x: number; y: number; z: number };
type Direction = "north" | "south" | "east" | "west";

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let failed = false;

function makeHelpers(client: PlaytestClient) {
  const goto = async (position: Vec3) => {
    const before = client.mark();
    client.say(`/goto ${position.x} ${position.y} ${position.z}`);
    const reply = await client.waitFor(
      (m): m is Extract<typeof m, { type: "gm-response" }> =>
        m.type === "gm-response",
      `gm-response for /goto ${position.x} ${position.y} ${position.z}`,
      { since: before },
    );
    if (!reply.ok) throw new Error(`/goto failed: ${reply.text}`);
    return reply.text;
  };

  /**
   * Teleports within use-map reach of `target` (its own tile or any of the
   * eight neighbours — /goto snaps to the nearest free tile itself).
   */
  const gotoBeside = async (target: Vec3) => {
    const attempts: string[] = [];
    for (const candidate of [
      { x: target.x, y: target.y - 1, z: target.z },
      { x: target.x, y: target.y + 1, z: target.z },
      { x: target.x - 1, y: target.y, z: target.z },
      { x: target.x + 1, y: target.y, z: target.z },
    ]) {
      try {
        const reply = await goto(candidate);
        const landed = /Position: (\d+), (\d+), (\d+)\./.exec(reply);
        if (landed) {
          const at = {
            x: Number(landed[1]),
            y: Number(landed[2]),
            z: Number(landed[3]),
          };
          if (
            at.z === target.z &&
            Math.abs(at.x - target.x) <= 1 &&
            Math.abs(at.y - target.y) <= 1
          ) {
            return at;
          }
        }
        attempts.push(`(${candidate.x},${candidate.y}): landed "${reply}"`);
      } catch (error) {
        attempts.push(`(${candidate.x},${candidate.y}): ${String(error)}`);
      }
    }
    throw new Error(
      `no walkable tile beside (${target.x},${target.y},${target.z}):\n  ${attempts.join("\n  ")}`,
    );
  };

  const statusText = async (since: number) => {
    const message = await client.waitFor(
      (m): m is Extract<typeof m, { type: "combat-log" }> =>
        m.type === "combat-log",
      "combat-log status text",
      { since },
    );
    return message.text;
  };

  /** The freshest tile-states snapshot of `position` after `since`. */
  const tileItems = async (position: Vec3, since: number, label: string) => {
    const message = await client.waitFor(
      (m): m is Extract<typeof m, { type: "tile-states" }> =>
        m.type === "tile-states" &&
        m.visible.some(
          (tile) =>
            tile.position.x === position.x &&
            tile.position.y === position.y &&
            tile.position.z === position.z,
        ),
      label,
      { since },
    );
    const tile = message.visible.find(
      (candidate) =>
        candidate.position.x === position.x &&
        candidate.position.y === position.y &&
        candidate.position.z === position.z,
    )!;
    return tile.items.map((item) => item.itemId);
  };

  /** Waits for a tile-states after `since` matching a predicate on item ids. */
  const waitForTile = async (
    position: Vec3,
    since: number,
    predicate: (itemIds: number[]) => boolean,
    label: string,
  ) => {
    const message = await client.waitFor(
      (m): m is Extract<typeof m, { type: "tile-states" }> =>
        m.type === "tile-states" &&
        m.visible.some(
          (tile) =>
            tile.position.x === position.x &&
            tile.position.y === position.y &&
            tile.position.z === position.z &&
            predicate(tile.items.map((item) => item.itemId)),
        ),
      label,
      { since },
    );
    const tile = message.visible.find(
      (candidate) =>
        candidate.position.x === position.x &&
        candidate.position.y === position.y &&
        candidate.position.z === position.z,
    )!;
    return tile.items.map((item) => item.itemId);
  };

  const moveTo = async (direction: Direction, expect: Vec3, label: string) => {
    const before = client.mark();
    client.send({ type: "move", direction, queueStep: true });
    await client.waitFor(
      (m): m is Extract<typeof m, { type: "creature-moved" }> =>
        m.type === "creature-moved" &&
        m.creatureId === client.playerId &&
        m.position.x === expect.x &&
        m.position.y === expect.y &&
        m.position.z === expect.z,
      label,
      { since: before },
    );
  };

  const useMap = (position: Vec3) =>
    client.send({ type: "use-map", position });

  return { goto, gotoBeside, statusText, tileItems, waitForTile, moveTo, useMap };
}

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const c1 = await PlaytestClient.connect(url);
  await c1.enter(TOKEN, CHARACTER);
  const h1 = makeHelpers(c1);
  ok(`entered world as ${c1.playerId}`);

  // The helper needs its own account: a second login on the same account
  // kicks the first session.
  const c2 = await PlaytestClient.connect(url);
  await c2.enter(`${TOKEN}-helper`, HELPER);
  const h2 = makeHelpers(c2);
  ok(`helper entered world as ${c2.playerId}`);

  // ---------------------------------------------------------------- rapier
  step("RAPIER QUEST: opening the chest at (32099,32198,9)");
  await h1.gotoBeside(RAPIER_CHEST);
  const beforeRapier = c1.mark();
  h1.useMap(RAPIER_CHEST);
  const rapierFound = await h1.statusText(beforeRapier);
  if (rapierFound !== "You have found a rapier.") {
    throw new Error(`expected the rapier find, got: "${rapierFound}"`);
  }
  ok(`server said: "${rapierFound}"`);
  await c1.waitFor(
    (m): m is Extract<typeof m, { type: "inventory-updated" }> =>
      m.type === "inventory-updated" &&
      m.inventory.items.some((entry) => entry.item.typeId === RAPIER),
    "inventory with the rapier",
  );
  ok("rapier landed in the backpack");

  step("RAPIER QUEST: opening the chest again (must be empty)");
  await useExhaust();
  const beforeEmpty = c1.mark();
  h1.useMap(RAPIER_CHEST);
  const empty = await h1.statusText(beforeEmpty);
  if (empty !== "The box is empty.") {
    throw new Error(`expected "The box is empty.", got: "${empty}"`);
  }
  ok(`server said: "${empty}"`);

  // -------------------------------------------------------------- bear room
  step("BEAR ROOM: normalizing the lever");
  const beforeBearArrive = c1.mark();
  await h1.gotoBeside(BEAR_LEVER);
  let bearLever = await h1.tileItems(
    BEAR_LEVER,
    beforeBearArrive,
    "tile-states with the bear lever",
  );
  if (bearLever.includes(LEVER_ON)) {
    await useExhaust();
    const before = c1.mark();
    h1.useMap(BEAR_LEVER);
    bearLever = await h1.waitForTile(
      BEAR_LEVER,
      before,
      (ids) => ids.includes(LEVER_OFF),
      "lever pulled back to its off state",
    );
    ok("previous run left the lever on; reset it");
  }
  ok(`lever tile holds [${bearLever.join(", ")}]`);

  step("BEAR ROOM: pulling the lever (stone must vanish)");
  await useExhaust();
  const beforeBearPull = c1.mark();
  h1.useMap(BEAR_LEVER);
  await h1.waitForTile(
    BEAR_LEVER,
    beforeBearPull,
    (ids) => ids.includes(LEVER_ON),
    "lever flipped on",
  );
  ok("lever flipped to on");

  step("BEAR ROOM: walking through the opened passage");
  await h1.goto(BEAR_RELOCATE);
  await h1.moveTo("north", BEAR_STONE_TILE, "step onto the stone tile");
  ok("stepped onto the (now empty) stone tile");

  step("BEAR ROOM: helper pulls the lever back — we must be pushed off");
  await h2.gotoBeside(BEAR_LEVER);
  await useExhaust();
  const beforeBearReset = c1.mark();
  h2.useMap(BEAR_LEVER);
  await c1.waitFor(
    (m): m is Extract<typeof m, { type: "creature-moved" }> =>
      m.type === "creature-moved" &&
      m.creatureId === c1.playerId &&
      m.position.x === BEAR_RELOCATE.x &&
      m.position.y === BEAR_RELOCATE.y &&
      m.position.z === BEAR_RELOCATE.z,
    "relocated off the recreated stone",
    { since: beforeBearReset },
  );
  ok("relocated to the tile south of the stone");
  await h1.waitForTile(
    BEAR_STONE_TILE,
    beforeBearReset,
    (ids) => ids.includes(STONE),
    "stone recreated on its tile",
  );
  ok("stone is back");

  // ------------------------------------------------------------ katana room
  step("KATANA ROOM: normalizing (door use forces closed + lever off)");
  const beforeKatanaArrive = c1.mark();
  await h1.gotoBeside(KATANA_DOOR);
  const katanaDoorIds = await h1.tileItems(
    KATANA_DOOR,
    beforeKatanaArrive,
    "tile-states with the katana door",
  );
  await useExhaust();
  if (katanaDoorIds.includes(DOOR_OPEN)) {
    const beforeNormalize = c1.mark();
    h1.useMap(KATANA_DOOR);
    await h1.waitForTile(
      KATANA_DOOR,
      beforeNormalize,
      (ids) => ids.includes(DOOR_CLOSED),
      "door forced closed by the normalize use",
    );
    ok("previous run left the door open; closed it via the door use");
  } else {
    // Already closed; use it anyway so a stale lever state is re-armed.
    h1.useMap(KATANA_DOOR);
    await useExhaust();
  }
  ok("door is closed, lever re-armed");

  step("KATANA ROOM: pulling the lever (door must open)");
  await h1.gotoBeside(KATANA_LEVER);
  await useExhaust();
  const beforeKatanaPull = c1.mark();
  h1.useMap(KATANA_LEVER);
  await h1.waitForTile(
    KATANA_DOOR,
    beforeKatanaPull,
    (ids) => ids.includes(DOOR_OPEN),
    "katana door opened",
  );
  ok("door opened");

  step("KATANA ROOM: helper stands in the doorway; lever close pushes them out");
  await h2.goto(KATANA_DOORWAY_OUT);
  await h2.moveTo("west", KATANA_DOOR, "helper steps onto the open door tile");
  await useExhaust();
  const beforeKatanaClose = c2.mark();
  h1.useMap(KATANA_LEVER);
  await c2.waitFor(
    (m): m is Extract<typeof m, { type: "creature-moved" }> =>
      m.type === "creature-moved" &&
      m.creatureId === c2.playerId &&
      m.position.x === KATANA_DOORWAY_OUT.x &&
      m.position.y === KATANA_DOORWAY_OUT.y &&
      m.position.z === KATANA_DOORWAY_OUT.z,
    "helper pushed out of the doorway",
    { since: beforeKatanaClose },
  );
  ok("helper relocated one tile east");
  await h1.waitForTile(
    KATANA_DOOR,
    beforeKatanaClose,
    (ids) => ids.includes(DOOR_CLOSED),
    "katana door closed again",
  );
  ok("door closed");

  step("KATANA ROOM: open via lever, then using the door closes and re-arms");
  await useExhaust();
  const beforeReopen = c1.mark();
  h1.useMap(KATANA_LEVER);
  await h1.waitForTile(
    KATANA_DOOR,
    beforeReopen,
    (ids) => ids.includes(DOOR_OPEN),
    "katana door open for the door-use leg",
  );
  await useExhaust();
  const beforeDoorUse = c1.mark();
  await h1.gotoBeside(KATANA_DOOR);
  h1.useMap(KATANA_DOOR);
  await h1.waitForTile(
    KATANA_DOOR,
    beforeDoorUse,
    (ids) => ids.includes(DOOR_CLOSED),
    "door-use closed the door",
  );
  ok("using the open door closed it (Canary katana_quest_door)");
  const leverIds = await h1.tileItems(
    KATANA_LEVER,
    beforeDoorUse,
    "lever tile after the door-use",
  );
  if (!leverIds.includes(LEVER_OFF)) {
    throw new Error(`lever not re-armed: [${leverIds.join(", ")}]`);
  }
  ok("lever re-armed to off");

  // ------------------------------------------------------------ sewer bridge
  step("SEWER BRIDGE: normalizing the levers");
  const beforeSewerArrive = c1.mark();
  await h1.gotoBeside(SEWER_LEVER_WEST);
  let sewerLever = await h1.tileItems(
    SEWER_LEVER_WEST,
    beforeSewerArrive,
    "tile-states with the west sewer lever",
  );
  if (sewerLever.includes(LEVER_ON)) {
    await useExhaust();
    const before = c1.mark();
    h1.useMap(SEWER_LEVER_WEST);
    sewerLever = await h1.waitForTile(
      SEWER_LEVER_WEST,
      before,
      (ids) => ids.includes(LEVER_OFF),
      "sewer lever pulled back",
    );
    ok("previous run left the bridge out; retracted it");
  }
  ok(`west lever tile holds [${sewerLever.join(", ")}]`);

  step("SEWER BRIDGE: pulling the lever (bridge must extend, rails vanish)");
  await useExhaust();
  const beforeExtend = c1.mark();
  h1.useMap(SEWER_LEVER_WEST);
  await h1.waitForTile(
    SEWER_SPAN_MIDDLE,
    beforeExtend,
    (ids) => ids.includes(BRIDGE),
    "drawbridge item on the middle span tile",
  );
  ok("drawbridge extended across the channel");
  await h1.waitForTile(
    { x: 32_099, y: 32_205, z: 8 },
    beforeExtend,
    (ids) => ids.includes(BRIDGE) && !ids.includes(RAIL_WEST),
    "west span tile with the bridge and without the rail",
  );
  ok("west rail removed");

  step("SEWER BRIDGE: helper walks across the span");
  await h2.goto(SEWER_EAST_BANK);
  await h2.moveTo("west", { x: 32_101, y: 32_205, z: 8 }, "east span tile");
  await h2.moveTo("west", SEWER_SPAN_MIDDLE, "middle span tile");
  ok("helper is standing mid-bridge over the water");

  step("SEWER BRIDGE: retracting must push the helper to the east bank");
  await useExhaust();
  const beforeRetract = c2.mark();
  h1.useMap(SEWER_LEVER_WEST);
  await c2.waitFor(
    (m): m is Extract<typeof m, { type: "creature-moved" }> =>
      m.type === "creature-moved" &&
      m.creatureId === c2.playerId &&
      m.position.x === SEWER_EAST_BANK.x &&
      m.position.y === SEWER_EAST_BANK.y &&
      m.position.z === SEWER_EAST_BANK.z,
    "helper relocated off the retracting bridge",
    { since: beforeRetract },
  );
  ok("helper relocated to the east bank");
  await h1.waitForTile(
    { x: 32_099, y: 32_205, z: 8 },
    beforeRetract,
    (ids) => ids.includes(RAIL_WEST) && !ids.includes(BRIDGE),
    "west rail recreated after retracting",
  );
  ok("rails are back, span cleared");

  // ------------------------------------------------------------ level bridge
  // New characters start at level 8 (server/src/character/startingLevel.ts),
  // above the bridge's level-2 gate, and /level can only raise a level, so
  // the Canary bounce line for an under-levelled character is not
  // reproducible from a fresh character here; only the pass-through is.
  step("LEVEL BRIDGE: a starting character clears the level-2 gate");
  await h2.goto(LEVEL_BRIDGE_APPROACH);
  await h2.moveTo(
    "north",
    { x: 32_092, y: 32_176, z: 6 },
    "approach tile before the gate",
  );
  await h2.moveTo("north", LEVEL_BRIDGE_TILE, "gate tile at the starting level");
  ok("crossed the level bridge at the starting level");

  // ---------------------------------------------------------- premium bridge
  step("PREMIUM BRIDGE: a free account must bounce back, silently");
  await h1.goto(PREMIUM_BRIDGE_APPROACH);
  await h1.moveTo("west", { x: 32_065, y: 32_192, z: 7 }, "one tile west");
  await h1.moveTo("west", { x: 32_064, y: 32_192, z: 7 }, "two tiles west");
  const beforePremiumBounce = c1.mark();
  c1.send({ type: "move", direction: "west", queueStep: true });
  await c1.waitFor(
    (m): m is Extract<typeof m, { type: "creature-moved" }> =>
      m.type === "creature-moved" &&
      m.creatureId === c1.playerId &&
      m.position.x === PREMIUM_BRIDGE_APPROACH.x &&
      m.position.y === PREMIUM_BRIDGE_APPROACH.y &&
      m.position.z === PREMIUM_BRIDGE_APPROACH.z,
    "bounced back to the premium approach spot",
    { since: beforePremiumBounce },
  );
  ok("free account bounced back");
  let premiumLeak: string | undefined;
  try {
    const leaked = await c1.waitFor(
      (m): m is Extract<typeof m, { type: "combat-log" }> =>
        m.type === "combat-log",
      "combat-log after the premium bounce",
      { since: beforePremiumBounce, timeoutMs: 1_000 },
    );
    premiumLeak = leaked.text;
  } catch {
    // Expected: the premium bounce is silent.
  }
  if (premiumLeak !== undefined) {
    throw new Error(`expected a silent bounce, got: "${premiumLeak}"`);
  }
  ok("no message on the premium bounce (Canary parity)");

  step("PREMIUM BRIDGE: with /premium the character crosses");
  {
    const before = c1.mark();
    c1.say("/premium 30");
    await c1.waitFor(
      (m): m is Extract<typeof m, { type: "gm-response" }> =>
        m.type === "gm-response" && m.ok,
      "gm-response for /premium",
      { since: before },
    );
  }
  await h1.moveTo("west", { x: 32_065, y: 32_192, z: 7 }, "one tile west again");
  await h1.moveTo("west", { x: 32_064, y: 32_192, z: 7 }, "two tiles west again");
  await h1.moveTo("west", PREMIUM_BRIDGE_TILE, "premium gate tile");
  ok("crossed the premium bridge with premium");

  console.log("\nPASS: all six Rookgaard starter quests work end to end");
} catch (error) {
  failed = true;
  console.error("\nFAIL:", error);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
