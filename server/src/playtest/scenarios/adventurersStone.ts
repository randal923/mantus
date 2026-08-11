import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";
import {
  GUILD_AREA,
  GUILD_ARRIVAL,
} from "../../action/adventurersStoneTables";
import { ADVENTURERS_STONE_TYPE_ID } from "../../item/adventurersStoneTypeId";

/**
 * Scenario: the Adventurer's Stone (Canary
 * `actions/adventurers_guild/adventurers_stone.lua`). A fresh character owns
 * the stone in the bound container; using it away from a temple only puffs,
 * using it inside the Thais temple teleports to the Adventurers Guild, and
 * using it at the guild returns to the Thais temple. The guild's own exit
 * portal (a step-in teleporter with no OTBM destination) must send the player
 * to the same temple. Run with: yarn playtest:adventurers-stone
 */
const THAIS_TEMPLE = { x: 32369, y: 32241, z: 7 };
const NOWHERE = { x: 32345, y: 32222, z: 7 }; // Thais street, no PZ
// One tile south of the western guild exit portal (32209,32292,6).
const PORTAL_APPROACH = { x: 32209, y: 32293, z: 6 };

// Fresh letters-only character per run: playtest databases persist, and only
// a post-stone character is guaranteed to carry the item.
const suffix = [...String(Date.now() % 1_000_000)]
  .map((digit) => "abcdefghij"[Number(digit)])
  .join("");
const TOKEN = `dev-advstone-${suffix}`;
const CHARACTER = `Stone Tester ${suffix}`;

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const useExhaust = () => new Promise((resolve) => setTimeout(resolve, 400));

type Vec3 = { x: number; y: number; z: number };

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl
  ? null
  : await startPlaytestServer({ log: false, disableCreatures: true });
const url = externalUrl ?? server!.url;
let failed = false;

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const client = await PlaytestClient.connect(url);
  await client.enter(TOKEN, CHARACTER);
  ok(`entered world as ${client.playerId}`);

  step("finding the adventurer's stone inside the bound container");
  const welcome = await client.waitFor(
    (m): m is Extract<typeof m, { type: "welcome" }> => m.type === "welcome",
    "welcome with the initial inventory",
  );
  const bound = welcome.inventory.equipment.bound;
  if (!bound) throw new Error("fresh character has no bound container");
  const beforeOpen = client.mark();
  client.send({
    type: "open-container",
    itemId: bound.id,
    revision: bound.revision,
  });
  const opened = await client.waitFor(
    (m): m is Extract<typeof m, { type: "inventory-updated" }> =>
      m.type === "inventory-updated" &&
      (m.inventory.containers ?? []).some(
        (container) =>
          container.container.id === bound.id &&
          container.items.some(
            (slot) => slot.item.typeId === ADVENTURERS_STONE_TYPE_ID,
          ),
      ),
    "bound container opened with the stone inside",
    { since: beforeOpen },
  );
  const stone = (opened.inventory.containers ?? [])
    .find((container) => container.container.id === bound.id)!
    .items.find(
      (slot) => slot.item.typeId === ADVENTURERS_STONE_TYPE_ID,
    )!.item;
  ok(`stone ${stone.id} (revision ${stone.revision})`);

  const goto = async (position: Vec3, label: string) => {
    const before = client.mark();
    client.say(`/goto ${position.x} ${position.y} ${position.z}`);
    const reply = await client.waitFor(
      (m): m is Extract<typeof m, { type: "gm-response" }> =>
        m.type === "gm-response",
      `gm-response for /goto ${label}`,
      { since: before },
    );
    if (!reply.ok) throw new Error(`/goto ${label} failed: ${reply.text}`);
    ok(reply.text);
  };

  const useStone = () =>
    client.send({ type: "use-item", itemId: stone.id, revision: stone.revision });

  const waitForArrival = (
    test: (position: Vec3) => boolean,
    label: string,
    since: number,
  ) =>
    client.waitFor(
      (m): m is Extract<typeof m, { type: "creature-moved" }> =>
        m.type === "creature-moved" &&
        m.creatureId === client.playerId &&
        m.durationMs === 0 &&
        test(m.position),
      label,
      { since },
    );

  step("using the stone away from any temple (must refuse with the hint)");
  await goto(NOWHERE, "a Thais street");
  const beforeRefusal = client.mark();
  useStone();
  await client.waitFor(
    (m): m is Extract<typeof m, { type: "combat-log" }> =>
      m.type === "combat-log" &&
      m.text.startsWith("Try to move more to the center of a temple"),
    "refusal hint",
    { since: beforeRefusal },
  );
  ok("refused outside the temple");

  step("using the stone inside the Thais temple (must reach the guild)");
  await goto(THAIS_TEMPLE, "the Thais temple");
  await useExhaust();
  const beforeOutbound = client.mark();
  useStone();
  const arrival = await waitForArrival(
    (p) =>
      p.x >= GUILD_AREA.from.x &&
      p.x <= GUILD_AREA.to.x &&
      p.y >= GUILD_AREA.from.y &&
      p.y <= GUILD_AREA.to.y &&
      p.z === GUILD_ARRIVAL.z,
    "teleport to the Adventurers Guild",
    beforeOutbound,
  );
  ok(`arrived at the guild (${arrival.position.x},${arrival.position.y},${arrival.position.z})`);

  step("using the stone at the guild (must return to the Thais temple)");
  await useExhaust();
  const beforeReturn = client.mark();
  useStone();
  const home = await waitForArrival(
    (p) =>
      Math.abs(p.x - THAIS_TEMPLE.x) <= 2 &&
      Math.abs(p.y - THAIS_TEMPLE.y) <= 2 &&
      p.z === THAIS_TEMPLE.z,
    "teleport back to the Thais temple",
    beforeReturn,
  );
  ok(`returned to the temple (${home.position.x},${home.position.y},${home.position.z})`);

  step("stepping into the guild exit portal (must also return to the temple)");
  await useExhaust();
  const beforeSecondTrip = client.mark();
  useStone();
  await waitForArrival(
    (p) => p.z === GUILD_ARRIVAL.z && p.y >= GUILD_AREA.from.y,
    "second teleport to the Adventurers Guild",
    beforeSecondTrip,
  );
  await goto(PORTAL_APPROACH, "the tile below the guild exit portal");
  const beforePortal = client.mark();
  client.send({ type: "move", direction: "north", queueStep: true });
  const exited = await waitForArrival(
    (p) =>
      Math.abs(p.x - THAIS_TEMPLE.x) <= 2 &&
      Math.abs(p.y - THAIS_TEMPLE.y) <= 2 &&
      p.z === THAIS_TEMPLE.z,
    "exit portal teleport back to the Thais temple",
    beforePortal,
  );
  ok(`walked out through the portal (${exited.position.x},${exited.position.y},${exited.position.z})`);

  console.log("\nPASS: adventurer's stone and the guild exit portal both work");
} catch (error) {
  failed = true;
  console.error("\nFAIL:", error);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
