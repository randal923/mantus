import type { ServerMessage } from "@tibia/protocol";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";
import { TEMPLE_SCROLL_IN_FIGHT_MESSAGE } from "../../action/TempleTeleportScrollService";
import { TEMPLE_TELEPORT_SCROLL_TYPE_ID } from "../../item/templeTeleportScrollTypeId";

/**
 * Scenario: the temple teleport scroll (Canary `actions/other/temple_scroll.lua`,
 * the item the store's "Temple Teleport" offer delivers). A fresh character
 * conjures one, uses it on a Thais street and lands at their home temple with
 * the scroll gone; a second scroll used while fighting a rat is refused with
 * Canary's message — on the street and, stricter than Canary, inside the
 * temple's protection zone too — and stays in the inventory.
 * Run with: yarn playtest:temple-scroll
 */
// config.yml starterTownId 1 = Dawnport Tutorial; its temple is the world
// spawn in otservbr.map.json.
const HOME_TEMPLE = { x: 32069, y: 31901, z: 6 };
// South of the Thais temple, outside its protection zone (monsters may spawn).
const THAIS_STREET = { x: 32369, y: 32260, z: 7 };
const THAIS_TEMPLE = { x: 32369, y: 32241, z: 7 };

// Fresh letters-only character per run: playtest databases persist.
const suffix = [...String(Date.now() % 1_000_000)]
  .map((digit) => "abcdefghij"[Number(digit)])
  .join("");
const TOKEN = `dev-templescroll-${suffix}`;
const CHARACTER = `Scroll Tester ${suffix}`;

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isType =
  <T extends ServerMessage["type"]>(type: T) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: T }> =>
    m.type === type;

type Vec3 = { x: number; y: number; z: number };
type Carried = { id: string; revision: number };

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let failed = false;

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const client = await PlaytestClient.connect(url);
  await client.enter(TOKEN, CHARACTER);
  ok(`entered world as ${client.playerId}`);

  step("opening the backpack (conjured items land there; only open containers are listed)");
  const welcome = await client.waitFor(isType("welcome"), "welcome with the initial inventory");
  const backpack = welcome.inventory.equipment.backpack;
  if (!backpack) throw new Error("fresh character has no backpack");
  const beforeOpen = client.mark();
  client.send({ type: "open-container", itemId: backpack.id, revision: backpack.revision });
  await client.waitFor(
    (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
      m.type === "inventory-updated" &&
      (m.inventory.containers ?? []).some((c) => c.container.id === backpack.id),
    "backpack opened",
    { since: beforeOpen },
  );
  ok("backpack open");

  const gm = async (command: string) => {
    const before = client.mark();
    client.say(command);
    const reply = await client.waitFor(isType("gm-response"), `gm-response for ${command}`, {
      since: before,
    });
    if (!reply.ok) throw new Error(`${command} failed: ${reply.text}`);
    ok(reply.text);
  };

  const carriedScroll = (m: Extract<ServerMessage, { type: "inventory-updated" }>) =>
    (m.inventory.containers ?? [])
      .flatMap((container) => container.items)
      .map((entry) => entry.item)
      .find((item) => item.typeId === TEMPLE_TELEPORT_SCROLL_TYPE_ID);

  const conjureScroll = async (): Promise<Carried> => {
    const before = client.mark();
    await gm(`/i ${TEMPLE_TELEPORT_SCROLL_TYPE_ID}`);
    const update = await client.waitFor(
      (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
        m.type === "inventory-updated" && carriedScroll(m) !== undefined,
      "inventory holding the temple teleport scroll",
      { since: before },
    );
    const scroll = carriedScroll(update)!;
    ok(`carrying scroll ${scroll.id} (revision ${scroll.revision})`);
    // The conjure's persist lane drains behind the tick; a use that lands
    // while it is still pending is refused as a busy item operation.
    await sleep(500);
    return { id: scroll.id, revision: scroll.revision };
  };

  const useScroll = (scroll: Carried) =>
    client.send({ type: "use-item", itemId: scroll.id, revision: scroll.revision });

  const teleportedTo = (test: (position: Vec3) => boolean) =>
    (m: ServerMessage): m is Extract<ServerMessage, { type: "creature-moved" }> =>
      m.type === "creature-moved" &&
      m.creatureId === client.playerId &&
      m.durationMs === 0 &&
      test(m.position);

  const nearHomeTemple = (p: Vec3) =>
    Math.abs(p.x - HOME_TEMPLE.x) <= 2 &&
    Math.abs(p.y - HOME_TEMPLE.y) <= 2 &&
    p.z === HOME_TEMPLE.z;

  const expectRefusal = async (scroll: Carried, where: string) => {
    const before = client.mark();
    useScroll(scroll);
    await client.waitFor(
      (m): m is Extract<ServerMessage, { type: "combat-log" }> =>
        m.type === "combat-log" && m.text === TEMPLE_SCROLL_IN_FIGHT_MESSAGE,
      `in-fight refusal ${where}`,
      { since: before },
    );
    await sleep(1_000);
    const later = client.messages.slice(before);
    if (later.some(teleportedTo(() => true))) {
      throw new Error(`the scroll teleported a fighting player ${where}`);
    }
    if (
      later.some(
        (m) => m.type === "inventory-updated" && carriedScroll(m) === undefined,
      )
    ) {
      throw new Error(`the refused scroll was consumed ${where}`);
    }
    ok(`refused ${where}; scroll kept`);
  };

  step("conjuring a scroll and using it on a Thais street, out of any fight");
  const first = await conjureScroll();
  await gm(`/goto ${THAIS_STREET.x} ${THAIS_STREET.y} ${THAIS_STREET.z}`);
  const beforeTrip = client.mark();
  useScroll(first);
  const arrival = await client.waitFor(
    teleportedTo(nearHomeTemple),
    "teleport to the home temple",
    { since: beforeTrip },
  );
  ok(`arrived at the home temple (${arrival.position.x},${arrival.position.y},${arrival.position.z})`);
  await client.waitFor(
    (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
      m.type === "inventory-updated" && carriedScroll(m) === undefined,
    "inventory without the spent scroll",
    { since: beforeTrip },
  );
  ok("scroll consumed by the trip");

  step("conjuring a second scroll and picking a fight with a rat on the street");
  const second = await conjureScroll();
  await gm(`/goto ${THAIS_STREET.x} ${THAIS_STREET.y} ${THAIS_STREET.z}`);
  const beforeSpawn = client.mark();
  await gm("/spawn rat");
  const rat = await client.waitForCreatureNamed("Rat", {
    timeoutMs: 10_000,
    since: beforeSpawn,
  });
  const beforeAttack = client.mark();
  client.send({ type: "attack-target", creatureId: rat.id });
  await client.waitFor(
    (m): m is Extract<ServerMessage, { type: "fight-state" }> =>
      m.type === "fight-state" &&
      m.fightState.conditions.some((c) => c.type === "combat-lock"),
    "combat lock from the fight",
    { since: beforeAttack, timeoutMs: 15_000 },
  );
  ok("combat-locked");

  step("using the scroll while fighting (must refuse and keep the scroll)");
  await expectRefusal(second, "on the street");

  step("using it inside the Thais temple while still combat-locked (must refuse too)");
  await gm(`/goto ${THAIS_TEMPLE.x} ${THAIS_TEMPLE.y} ${THAIS_TEMPLE.z}`);
  await sleep(400);
  await expectRefusal(second, "inside the protection zone");
  await gm("/despawn");

  console.log("\nPASS: the temple teleport scroll teleports out of a fight and never in one");
} catch (error) {
  failed = true;
  console.error("\nFAIL:", error);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
