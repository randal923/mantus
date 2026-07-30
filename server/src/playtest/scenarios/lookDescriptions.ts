import type { LookTarget, Position } from "@tibia/protocol";
import { loadHouseContent } from "../../house/loadHouseContent";
import { loadItemCatalog } from "../../item/loadItemCatalog";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: Tibia's look (left+right click) end to end — the server composes
 * every "You see ..." line for own character, a summoned monster, a dropped
 * item, static scenery, and a house door, and refuses an out-of-view tile.
 * Run with: yarn playtest:look
 */
const STAND = { x: 32_369, y: 32_241, z: 7 };
const FIRE_SWORD = 3_280;
const TOKEN = "dev-look-scenario";
const CHARACTER = "Look Tester";

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const catalog = await loadItemCatalog();
const houses = loadHouseContent("otservbr");
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let failed = false;

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const client = await PlaytestClient.connect(url);
  await client.enter(TOKEN, CHARACTER, "Sorcerer");
  const playerId = client.playerId;
  if (!playerId) throw new Error("world entry produced no player id");
  ok(`entered world as ${playerId}`);

  const lookText = async (target: LookTarget, label: string) => {
    const since = client.mark();
    client.send({ type: "look", target });
    const message = await client.waitFor(
      (m): m is Extract<typeof m, { type: "look-text" }> =>
        m.type === "look-text",
      `look-text for ${label}`,
      { since },
    );
    return message.text;
  };

  const gmCommand = async (text: string) => {
    const since = client.mark();
    client.say(text);
    const reply = await client.waitFor(
      (m): m is Extract<typeof m, { type: "gm-response" }> =>
        m.type === "gm-response",
      `gm-response for ${text}`,
      { since },
    );
    if (!reply.ok) throw new Error(`${text} failed: ${reply.text}`);
    return reply.text;
  };

  const tileAt = async (position: Position, label: string) => {
    const state = await client.waitFor(
      (m): m is Extract<typeof m, { type: "tile-states" }> =>
        m.type === "tile-states" &&
        m.visible.some(
          (tile) =>
            tile.position.x === position.x &&
            tile.position.y === position.y &&
            tile.position.z === position.z &&
            tile.items.length > 0,
        ),
      `tile-states for ${label}`,
    );
    return (
      state.visible.find(
        (tile) =>
          tile.position.x === position.x &&
          tile.position.y === position.y &&
          tile.position.z === position.z,
      )?.items ?? []
    );
  };

  step(`teleporting to (${STAND.x},${STAND.y},${STAND.z})`);
  ok(await gmCommand(`/goto ${STAND.x} ${STAND.y} ${STAND.z}`));

  step("looking at own character");
  ok(await lookText({ kind: "creature", creatureId: playerId }, "self"));

  step("promoting, then looking again (the line follows live state)");
  ok(await gmCommand("/level 30"));
  ok(await lookText({ kind: "creature", creatureId: playerId }, "self"));

  step("summoning a rat and looking at it");
  const beforeSpawn = client.mark();
  client.say("/spawn rat");
  const rat = await client.waitForCreatureNamed("Rat", { since: beforeSpawn });
  ok(await lookText({ kind: "creature", creatureId: rat.id }, "rat"));

  step("dropping a fire sword and looking at it on the ground");
  await gmCommand("/i fire sword");
  const inventory = await client.waitFor(
    (m): m is Extract<typeof m, { type: "inventory-updated" }> =>
      m.type === "inventory-updated" &&
      (m.inventory.containers ?? []).some((container) =>
        container.items.some((entry) => entry.item.name === "fire sword"),
      ),
    "inventory holding the fire sword",
  );
  const sword = (inventory.inventory.containers ?? [])
    .flatMap((container) => container.items)
    .map((entry) => entry.item)
    .find((item) => item.name === "fire sword");
  if (!sword) throw new Error("fire sword missing from the inventory");
  const beforeDrop = client.mark();
  client.send({
    type: "drop-item",
    itemId: sword.id,
    revision: sword.revision,
    position: STAND,
  });
  await client.waitFor(
    (m): m is Extract<typeof m, { type: "tile-states" }> =>
      m.type === "tile-states" &&
      m.visible.some(
        (tile) =>
          tile.position.x === STAND.x &&
          tile.position.y === STAND.y &&
          tile.items.some((item) => item.itemId === FIRE_SWORD),
      ),
    "tile-states with the dropped fire sword",
    { since: beforeDrop },
  );
  ok(
    await lookText(
      { kind: "map", position: STAND, itemId: FIRE_SWORD },
      "fire sword on the ground",
    ),
  );

  step("looking at static scenery the server never tracks");
  const scenery = catalog.require(431);
  ok(
    await lookText(
      { kind: "map", position: STAND, itemId: scenery.id },
      scenery.name,
    ),
  );

  step("finding a house door and looking at it");
  const house = [...houses.values()].find((entry) => !entry.guildhall);
  if (!house) throw new Error("no house content to look at");
  ok(await gmCommand(`/goto ${house.entry.x} ${house.entry.y} ${house.entry.z}`));
  const doorTileItems = await tileAt(house.entry, `${house.name} entry`);
  ok(
    `entry tile holds [${doorTileItems
      .map((item) => `${item.itemId} (${catalog.get(item.itemId)?.name ?? "?"})`)
      .join(", ")}]`,
  );
  const door = doorTileItems.find((item) => catalog.get(item.itemId)?.door);
  if (!door) throw new Error(`no door item on the entry of ${house.name}`);
  const doorText = await lookText(
    { kind: "map", position: house.entry, itemId: door.itemId },
    "house door",
  );
  ok(doorText);
  if (!doorText.includes(`It belongs to house '${house.name}'`)) {
    throw new Error("the door look is missing its house ownership text");
  }

  step("looking at a tile far outside the view range (must answer nothing)");
  const beforeFar = client.mark();
  client.send({
    type: "look",
    target: { kind: "map", position: { x: 1_000, y: 1_000, z: 7 }, itemId: 431 },
  });
  let answered = false;
  try {
    await client.waitFor(
      (m): m is Extract<typeof m, { type: "look-text" }> =>
        m.type === "look-text",
      "look-text that must not arrive",
      { since: beforeFar, timeoutMs: 1_500 },
    );
    answered = true;
  } catch {
    ok("no description for a tile the player cannot see");
  }
  if (answered) throw new Error("an out-of-view look was described");

  console.log("\nPASS: look descriptions are composed server-side end to end");
} catch (error) {
  failed = true;
  console.error("\nFAIL:", error);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
