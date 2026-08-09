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
const CRYPT_DOOR_LOCKED = 6_248;
const CRYPT_DOOR_OPEN = 6_250;
// Cults of Tibia touch: the torch bearer removes the decaying wall.
const TORCH = { x: 32400, y: 31793, z: 8 };
const WALL = { x: 32396, y: 31806, z: 8 };
const STONE_WALL = 1_295;
const GRINDING =
  "You hear a loud grinding sound not very far from you. something very heavy seems to have moved.";
const BONE_KEY = 2_973;
const TOKEN = "dev-cultist-key-scenario";
// The playtest database persists between runs and the box is once-per-
// character, so every run brings a fresh character (letters only: character
// names reject digits).
const CHARACTER = `Key Tester ${[...String(Date.now() % 1_000_000)]
  .map((digit) => "abcdefghij"[Number(digit)])
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

  // The playtest database persists between runs, so a previous run may have
  // left the crypt door unlocked (closed 6249) or standing open (6250); the
  // locked/unlock legs only make sense against the pristine locked door.
  const waitForDoorChange = async (since: number, label: string) => {
    const changed = await client.waitFor(
      (m): m is Extract<typeof m, { type: "tile-states" }> =>
        m.type === "tile-states" &&
        m.visible.some(
          (tile) =>
            tile.position.x === DOOR.x &&
            tile.position.y === DOOR.y &&
            tile.position.z === DOOR.z &&
            tile.items.some((item) => !closedIds.includes(item.itemId)),
        ),
      label,
      { since },
    );
    const doorTile = changed.visible.find(
      (tile) => tile.position.x === DOOR.x && tile.position.y === DOOR.y,
    );
    ok(
      `door tile now holds [${doorTile?.items.map((i) => i.itemId).join(", ")}]`,
    );
  };
  if (closedIds.includes(CRYPT_DOOR_OPEN)) {
    ok("door already open from an earlier run; skipping the locked checks");
  } else if (!closedIds.includes(CRYPT_DOOR_LOCKED)) {
    step("opening the already-unlocked door from an earlier run");
    await useExhaust();
    const beforeOpen = client.mark();
    client.send({ type: "use-map", position: DOOR });
    await waitForDoorChange(beforeOpen, "tile-states with the opened door");
  } else {
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
    await waitForDoorChange(beforeUnlock, "tile-states with the unlocked door");
  }

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

  step("walking to the torch bearer");
  const torchCandidates = [
    { x: TORCH.x, y: TORCH.y - 1 },
    { x: TORCH.x, y: TORCH.y + 1 },
    { x: TORCH.x - 1, y: TORCH.y },
    { x: TORCH.x + 1, y: TORCH.y },
  ];
  let torchStand: { x: number; y: number } | undefined;
  for (const candidate of torchCandidates) {
    try {
      const reply = await goto(candidate.x, candidate.y, TORCH.z);
      if (reply.includes(`${candidate.x}, ${candidate.y}, ${TORCH.z}`)) {
        torchStand = candidate;
        break;
      }
    } catch {
      // Unwalkable candidate; try the next one.
    }
  }
  if (!torchStand) throw new Error("no walkable tile beside the torch");
  ok(`standing at (${torchStand.x},${torchStand.y},${TORCH.z})`);

  step("using the torch (must grind the wall away)");
  await useExhaust();
  const beforeTorch = client.mark();
  client.send({ type: "use-map", position: TORCH });
  const grinding = await statusText(beforeTorch);
  if (grinding !== GRINDING) {
    throw new Error(`expected the grinding line, got: "${grinding}"`);
  }
  ok(`server said: "${grinding}"`);

  step("using the torch again inside the cooldown (must stay silent)");
  await useExhaust();
  const beforeSecond = client.mark();
  client.send({ type: "use-map", position: TORCH });
  const puff = await client.waitFor(
    (m): m is Extract<typeof m, { type: "magic-effect" }> =>
      m.type === "magic-effect" &&
      m.position.x === torchStand!.x &&
      m.position.y === torchStand!.y,
    "poff at the player during the cooldown",
    { since: beforeSecond },
  );
  ok(`cooldown puffed effect ${puff.effectId} at the player`);
  let sawCooldownLog: string | undefined;
  try {
    const leaked = await client.waitFor(
      (m): m is Extract<typeof m, { type: "combat-log" }> =>
        m.type === "combat-log",
      "combat-log inside the cooldown",
      { since: beforeSecond, timeoutMs: 1_000 },
    );
    sawCooldownLog = leaked.text;
  } catch {
    // Expected: the cooldown answers with the poff only.
  }
  if (sawCooldownLog !== undefined) {
    throw new Error(
      `expected silence inside the cooldown, got: "${sawCooldownLog}"`,
    );
  }
  ok("no combat-log during the cooldown");

  step("walking to the decaying wall");
  // The wall was visible from the door earlier, so only tile-states sent
  // after walking back count — the pre-removal ones still hold the wall.
  const beforeWallLook = client.mark();
  const wallCandidates = [
    { x: WALL.x, y: WALL.y - 1 },
    { x: WALL.x, y: WALL.y + 1 },
    { x: WALL.x - 1, y: WALL.y },
    { x: WALL.x + 1, y: WALL.y },
  ];
  let wallStand: { x: number; y: number } | undefined;
  for (const candidate of wallCandidates) {
    try {
      const reply = await goto(candidate.x, candidate.y, WALL.z);
      if (reply.includes(`${candidate.x}, ${candidate.y}, ${WALL.z}`)) {
        wallStand = candidate;
        break;
      }
    } catch {
      // Unwalkable candidate; try the next one.
    }
  }
  if (!wallStand) throw new Error("no walkable tile beside the wall");
  ok(`standing at (${wallStand.x},${wallStand.y},${WALL.z})`);

  step("checking the wall tile no longer holds the stone wall");
  // A removed wall leaves the tile without server items, so it simply stops
  // appearing in tile-states; wait for the post-teleport snapshot (the crypt
  // door two tiles away is a server item, so one always arrives), then
  // assert no fresh tile-states still carries the wall.
  await client.waitFor(
    (m): m is Extract<typeof m, { type: "tile-states" }> =>
      m.type === "tile-states",
    "tile-states after arriving at the wall",
    { since: beforeWallLook },
  );
  const staleWall = client.messages
    .slice(beforeWallLook)
    .filter((m) => m.type === "tile-states")
    .flatMap((m) => m.visible)
    .find(
      (tile) =>
        tile.position.x === WALL.x &&
        tile.position.y === WALL.y &&
        tile.position.z === WALL.z &&
        tile.items.some((item) => item.itemId === STONE_WALL),
    );
  if (staleWall) {
    throw new Error(
      `the stone wall is still placed: [${staleWall.items
        .map((item) => item.itemId)
        .join(", ")}]`,
    );
  }
  ok(`no fresh tile-states carries item ${STONE_WALL} on the wall tile`);

  step("stepping onto the opened wall tile");
  const wallDirection =
    wallStand.y < WALL.y
      ? "south"
      : wallStand.y > WALL.y
        ? "north"
        : wallStand.x < WALL.x
          ? "east"
          : "west";
  const beforeWallStep = client.mark();
  client.send({ type: "move", direction: wallDirection, queueStep: true });
  await client.waitFor(
    (m): m is Extract<typeof m, { type: "creature-moved" }> =>
      m.type === "creature-moved" &&
      m.creatureId === client.playerId &&
      m.position.x === WALL.x &&
      m.position.y === WALL.y,
    "step onto the wall tile",
    { since: beforeWallStep },
  );
  ok("stepped through the removed wall");

  console.log("\nPASS: cultist key chain works end to end");
} catch (error) {
  failed = true;
  console.error("\nFAIL:", error);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
