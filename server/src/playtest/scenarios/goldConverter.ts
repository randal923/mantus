import type { ServerMessage } from "@tibia/protocol";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "@tibia/protocol";
import { USE_EXHAUST_MS } from "../../Session";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: the gold converter (Canary `actions/items/gold_converter.lua`,
 * the store's "Gold Converter" offer). A fresh character conjures one and
 * uses it on carried coin stacks: 100 gold become 1 platinum, 100 platinum
 * become 1 crystal, a crystal breaks back into 100 platinum, a short gold
 * stack is refused, and replaying the exact intent converts nothing twice.
 * Run with: yarn playtest:gold-converter
 */
const GOLD_CONVERTER = 23722;

// Fresh letters-only character per run: playtest databases persist.
const suffix = [...String(Date.now() % 1_000_000)]
  .map((digit) => "abcdefghij"[Number(digit)])
  .join("");
const TOKEN = `dev-goldconv-${suffix}`;
const CHARACTER = `Minter ${suffix}`;

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isType =
  <T extends ServerMessage["type"]>(type: T) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: T }> =>
    m.type === type;
type Inventory = Extract<ServerMessage, { type: "inventory-updated" }>;
type Carried = { id: string; revision: number; count: number; typeId: number };

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
  client.send({ type: "open-container", itemId: backpack.id, revision: backpack.revision });
  let inventory = await client.waitFor(
    (m): m is Inventory =>
      m.type === "inventory-updated" &&
      (m.inventory.containers ?? []).some((c) => c.container.id === backpack.id),
    "backpack opened",
  );
  ok("backpack open");

  const carried = (m: Inventory, typeId: number): Carried[] =>
    (m.inventory.containers ?? [])
      .flatMap((container) => container.items)
      .map((entry) => entry.item)
      .filter((item) => item.typeId === typeId)
      .map((item) => ({ id: item.id, revision: item.revision, count: item.count, typeId }));
  const total = (m: Inventory, typeId: number) =>
    carried(m, typeId).reduce((sum, item) => sum + item.count, 0);

  const gm = async (command: string) => {
    const before = client.mark();
    client.say(command);
    const reply = await client.waitFor(isType("gm-response"), `gm-response for ${command}`, { since: before });
    if (!reply.ok) throw new Error(`${command} failed: ${reply.text}`);
    ok(reply.text);
  };
  const conjure = async (typeId: number, count: number) => {
    const before = client.mark();
    await gm(`/i ${typeId} ${count}`);
    inventory = await client.waitFor(
      (m): m is Inventory => m.type === "inventory-updated" && total(m, typeId) >= count,
      `inventory holding ${count}x ${typeId}`,
      { since: before },
    );
    // The conjure's persist lane drains behind the tick.
    await sleep(500);
  };
  const converter = () => {
    const [tool] = carried(inventory, GOLD_CONVERTER);
    if (!tool) throw new Error("the converter is gone");
    return tool;
  };
  const useOn = (target: Carried) => {
    const tool = converter();
    const intent = {
      type: "use-item-on-item" as const,
      itemId: tool.id,
      revision: tool.revision,
      targetItemId: target.id,
      targetRevision: target.revision,
    };
    client.send(intent);
    return intent;
  };
  // Every use is exhaust-gated (Session.USE_EXHAUST_MS); the scenario proves
  // the version checks, so it never leans on the exhaust refusal.
  const expectConversion = async (
    label: string,
    target: Carried,
    check: (m: Inventory) => boolean,
  ) => {
    await sleep(USE_EXHAUST_MS + 100);
    const before = client.mark();
    const intent = useOn(target);
    try {
      inventory = await client.waitFor(
        (m): m is Inventory => m.type === "inventory-updated" && check(m),
        label,
        { since: before },
      );
    } catch (error) {
      const last = client.messages
        .slice(before)
        .filter((m): m is Inventory => m.type === "inventory-updated")
        .at(-1);
      const errors = client.messages
        .slice(before)
        .filter((m): m is Extract<ServerMessage, { type: "error" }> => m.type === "error")
        .map((m) => m.code);
      throw new Error(
        `${String(error)}; last inventory gold=${last ? total(last, GOLD_COIN_TYPE_ID) : "?"} ` +
          `platinum=${last ? JSON.stringify(carried(last, PLATINUM_COIN_TYPE_ID).map((c) => c.count)) : "?"} ` +
          `crystal=${last ? JSON.stringify(carried(last, CRYSTAL_COIN_TYPE_ID)) : "?"}; errors=${errors.join(",") || "none"}`,
      );
    }
    if (client.messages.slice(before).some((m) => m.type === "error")) {
      throw new Error(`${label}: the server also reported an error`);
    }
    return intent;
  };
  const expectRefusal = async (label: string, send: () => void) => {
    await sleep(USE_EXHAUST_MS + 100);
    const before = client.mark();
    send();
    await client.waitFor(
      (m): m is Extract<ServerMessage, { type: "error" }> =>
        m.type === "error" && m.code === "item-action-failed",
      `${label} refused`,
      { since: before },
    );
    await sleep(500);
    const later = client.messages.slice(before);
    if (later.some((m) => m.type === "inventory-updated")) {
      throw new Error(`${label}: the inventory changed on a refused use`);
    }
    ok(`${label} refused, inventory untouched`);
  };

  step("conjuring a gold converter and 100 gold coins");
  await conjure(GOLD_CONVERTER, 1);
  await conjure(GOLD_COIN_TYPE_ID, 100);
  ok(`carrying ${total(inventory, GOLD_COIN_TYPE_ID)} gold (starter kit: ${total(inventory, CRYSTAL_COIN_TYPE_ID)} crystal)`);

  step("100 gold -> 1 platinum");
  const goldStack = carried(inventory, GOLD_COIN_TYPE_ID)[0]!;
  const firstIntent = await expectConversion(
    "platinum minted",
    goldStack,
    (m) => total(m, GOLD_COIN_TYPE_ID) === 0 && total(m, PLATINUM_COIN_TYPE_ID) === 1,
  );
  ok(`gold=${total(inventory, GOLD_COIN_TYPE_ID)} platinum=${total(inventory, PLATINUM_COIN_TYPE_ID)}`);

  step("replaying the exact same intent converts nothing (the stack and revision are gone)");
  await expectRefusal("replay", () => client.send(firstIntent));

  step("a short gold stack is refused");
  await conjure(GOLD_COIN_TYPE_ID, 99);
  await expectRefusal("99 gold", () => useOn(carried(inventory, GOLD_COIN_TYPE_ID)[0]!));

  step("100 platinum -> 1 crystal (tops up the starter crystal stack; the minted platinum stays)");
  // GM conjures open their own stack rather than topping up the minted coin.
  await conjure(PLATINUM_COIN_TYPE_ID, 100);
  const platinumStack = carried(inventory, PLATINUM_COIN_TYPE_ID).find((s) => s.count === 100);
  if (!platinumStack) throw new Error(`no full platinum stack: ${JSON.stringify(carried(inventory, PLATINUM_COIN_TYPE_ID))}`);
  const crystalBefore = total(inventory, CRYSTAL_COIN_TYPE_ID);
  await expectConversion(
    "crystal minted",
    platinumStack,
    (m) =>
      total(m, CRYSTAL_COIN_TYPE_ID) === crystalBefore + 1 &&
      total(m, PLATINUM_COIN_TYPE_ID) === 1,
  );
  ok(`platinum=${total(inventory, PLATINUM_COIN_TYPE_ID)} crystal=${crystalBefore}->${total(inventory, CRYSTAL_COIN_TYPE_ID)}`);

  step("1 crystal -> 100 platinum (break-down off a partial stack)");
  await expectConversion(
    "crystal broken down",
    carried(inventory, CRYSTAL_COIN_TYPE_ID)[0]!,
    (m) =>
      total(m, CRYSTAL_COIN_TYPE_ID) === crystalBefore &&
      total(m, PLATINUM_COIN_TYPE_ID) === 101,
  );
  ok(`crystal=${total(inventory, CRYSTAL_COIN_TYPE_ID)} platinum=${total(inventory, PLATINUM_COIN_TYPE_ID)}`);

  step("the converter survives with charges spent (3 uses)");
  ok(`converter ${converter().id} still carried at revision ${converter().revision}`);

  step("relogging: the conversions were persisted, not just cached");
  client.terminate();
  const again = await PlaytestClient.connect(url);
  await again.enter(TOKEN, CHARACTER);
  const welcomeAgain = await again.waitFor(isType("welcome"), "welcome after relogin");
  const bp = welcomeAgain.inventory.equipment.backpack!;
  again.send({ type: "open-container", itemId: bp.id, revision: bp.revision });
  const reloaded = await again.waitFor(
    (m): m is Inventory =>
      m.type === "inventory-updated" &&
      (m.inventory.containers ?? []).some((c) => c.container.id === bp.id),
    "backpack reopened",
  );
  const after = {
    gold: total(reloaded, GOLD_COIN_TYPE_ID),
    platinum: total(reloaded, PLATINUM_COIN_TYPE_ID),
    crystal: total(reloaded, CRYSTAL_COIN_TYPE_ID),
    converters: carried(reloaded, GOLD_CONVERTER).length,
  };
  if (after.gold !== 99 || after.platinum !== 101 || after.crystal !== crystalBefore || after.converters !== 1) {
    throw new Error(`persisted inventory mismatch: ${JSON.stringify(after)}`);
  }
  ok(`persisted: ${JSON.stringify(after)}`);
  again.terminate();
} catch (error) {
  failed = true;
  console.error("\n✗ FAILED", error);
} finally {
  await server?.stop();
}
process.exit(failed ? 1 : 0);
