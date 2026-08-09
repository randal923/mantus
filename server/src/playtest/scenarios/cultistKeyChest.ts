import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: the Carlin cultist-cemetery key chain, end to end. The box on
 * Theater Avenue (Canary ChestUnique 5018) yields a bone key with ActionId
 * 3520 once and says "The box is empty." after; the key then unlocks the
 * cemetery crypt door at (32398,31804,8), which is stamped with ActionId
 * 3520 by the door_key import. Run with: yarn playtest:cultist-key
 */
const BOX = { x: 32376, y: 31802, z: 7 };
const STAND = { x: 32376, y: 31803, z: 7 };
const DOOR = { x: 32398, y: 31804, z: 8 };
const BONE_KEY = 2_973;
const TOKEN = "dev-cultist-key-scenario";
// The playtest database persists between runs and the box is once-per-
// character, so every run brings a fresh character (letters only: character
// names reject digits).
const CHARACTER = `Key Tester ${[...String(Date.now() % 1_000_000)]
  .map((digit) => "Abcdefghij"[Number(digit)])
  .join("")}`;

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let failed = false;

const useExhaust = () => new Promise((resolve) => setTimeout(resolve, 400));

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const client = await PlaytestClient.connect(url);
  await client.enter(TOKEN, CHARACTER);
  ok(`entered world as ${client.playerId}`);

  const goto = async (x: number, y: number, z: number) => {
    const before = client.mark();
    client.say(`/goto ${x} ${y} ${z}`);
    const reply = await client.waitFor(
      (m): m is Extract<typeof m, { type: "gm-response" }> =>
        m.type === "gm-response",
      `gm-response for /goto ${x} ${y} ${z}`,
      { since: before },
    );
    if (!reply.ok) throw new Error(`/goto failed: ${reply.text}`);
    return reply.text;
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

  step(`teleporting next to the box (${STAND.x},${STAND.y},${STAND.z})`);
  ok(await goto(STAND.x, STAND.y, STAND.z));

  step("using the box (must yield the bone key)");
  const beforeLoot = client.mark();
  client.send({ type: "use-map", position: BOX });
  const found = await statusText(beforeLoot);
  if (found !== "You have found a bone key.") {
    throw new Error(`expected the bone key find, got: "${found}"`);
  }
  ok(`server said: "${found}"`);

  step("checking the granted key landed in the backpack");
  const carried = await client.waitFor(
    (m): m is Extract<typeof m, { type: "inventory-updated" }> =>
      m.type === "inventory-updated" &&
      m.inventory.items.some((entry) => entry.item.typeId === BONE_KEY),
    "inventory with the bone key",
  );
  const key = carried.inventory.items.find(
    (entry) => entry.item.typeId === BONE_KEY,
  )!.item;
  ok(`carrying bone key ${key.id} (revision ${key.revision})`);

  step("using the box again (must say it is empty)");
  await useExhaust();
  const beforeEmpty = client.mark();
  client.send({ type: "use-map", position: BOX });
  const empty = await statusText(beforeEmpty);
  if (empty !== "The box is empty.") {
    throw new Error(`expected "The box is empty.", got: "${empty}"`);
  }
  ok(`server said: "${empty}"`);

  step("walking to the cemetery crypt door");
  const candidates = [
    { x: DOOR.x, y: DOOR.y - 1 },
    { x: DOOR.x, y: DOOR.y + 1 },
    { x: DOOR.x - 1, y: DOOR.y },
    { x: DOOR.x + 1, y: DOOR.y },
  ];
  let stand: { x: number; y: number } | undefined;
  for (const candidate of candidates) {
    try {
      const reply = await goto(candidate.x, candidate.y, DOOR.z);
      if (reply.includes(`${candidate.x}, ${candidate.y}, ${DOOR.z}`)) {
        stand = candidate;
        break;
      }
    } catch {
      // Unwalkable candidate; try the next one.
    }
  }
  if (!stand) throw new Error("no walkable tile beside the door");
  ok(`standing at (${stand.x},${stand.y},${DOOR.z})`);
  const doorTiles = await client.waitFor(
    (m): m is Extract<typeof m, { type: "tile-states" }> =>
      m.type === "tile-states" &&
      m.visible.some(
        (tile) =>
          tile.position.x === DOOR.x &&
          tile.position.y === DOOR.y &&
          tile.position.z === DOOR.z,
      ),
    "tile-states covering the door",
  );
  const closedDoorTile = doorTiles.visible.find(
    (tile) => tile.position.x === DOOR.x && tile.position.y === DOOR.y,
  );
  const closedIds = closedDoorTile?.items.map((item) => item.itemId) ?? [];
  ok(`door tile holds [${closedIds.join(", ")}]`);

  step("using the locked door directly (must refuse)");
  await useExhaust();
  const beforeDoorUse = client.mark();
  client.send({ type: "use-map", position: DOOR });
  const locked = await statusText(beforeDoorUse);
  if (locked !== "It is locked.") {
    throw new Error(`expected "It is locked.", got: "${locked}"`);
  }
  ok(`server said: "${locked}"`);

  step("using the bone key on the door (must unlock)");
  await useExhaust();
  const beforeUnlock = client.mark();
  client.send({
    type: "use-item-with",
    itemId: key.id,
    revision: key.revision,
    targetPosition: DOOR,
  });
  const unlocked = await client.waitFor(
    (m): m is Extract<typeof m, { type: "tile-states" }> =>
      m.type === "tile-states" &&
      m.visible.some(
        (tile) =>
          tile.position.x === DOOR.x &&
          tile.position.y === DOOR.y &&
          tile.position.z === DOOR.z &&
          tile.items.some((item) => !closedIds.includes(item.itemId)),
      ),
    "tile-states with the transformed door",
    { since: beforeUnlock },
  );
  const openTile = unlocked.visible.find(
    (tile) => tile.position.x === DOOR.x && tile.position.y === DOOR.y,
  );
  ok(`door tile now holds [${openTile?.items.map((i) => i.itemId).join(", ")}]`);

  step("walking through the opened door");
  const direction =
    stand.y < DOOR.y
      ? "south"
      : stand.y > DOOR.y
        ? "north"
        : stand.x < DOOR.x
          ? "east"
          : "west";
  const beforeStep = client.mark();
  client.send({ type: "move", direction, queueStep: true });
  await client.waitFor(
    (m): m is Extract<typeof m, { type: "creature-moved" }> =>
      m.type === "creature-moved" &&
      m.creatureId === client.playerId &&
      m.position.x === DOOR.x &&
      m.position.y === DOOR.y,
    "step onto the door tile",
    { since: beforeStep },
  );
  ok("stepped onto the opened door tile");

  console.log("\nPASS: cultist key chain works end to end");
} catch (error) {
  failed = true;
  console.error("\nFAIL:", error);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
