import type { ServerMessage } from "@tibia/protocol";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "@tibia/protocol";
import { GOLD_CONVERTER_NOTHING_MESSAGE } from "../../action/GoldConverterService";
import { USE_EXHAUST_MS } from "../../Session";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: the gold converter (the store's "Gold Converter" offer). A fresh
 * character conjures one plus coins spread over several stacks and uses it:
 * one use sweeps every carried coin by total (250 gold in three stacks ->
 * 2 platinum + 50 gold), reports what it converted, chains platinum into
 * crystal, answers a status line when nothing is left to convert, and the
 * result survives a relogin.
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

  const carried = (m: Inventory, typeId: number) =>
    (m.inventory.containers ?? [])
      .flatMap((container) => container.items)
      .map((entry) => entry.item)
      .filter((item) => item.typeId === typeId);
  const total = (m: Inventory, typeId: number) =>
    carried(m, typeId).reduce((sum, item) => sum + item.count, 0);
  const counts = (m: Inventory) => ({
    gold: total(m, GOLD_COIN_TYPE_ID),
    platinum: total(m, PLATINUM_COIN_TYPE_ID),
    crystal: total(m, CRYSTAL_COIN_TYPE_ID),
    goldStacks: carried(m, GOLD_COIN_TYPE_ID).length,
  });

  const gm = async (command: string) => {
    const before = client.mark();
    client.say(command);
    const reply = await client.waitFor(isType("gm-response"), `gm-response for ${command}`, { since: before });
    if (!reply.ok) throw new Error(`${command} failed: ${reply.text}`);
    ok(reply.text);
  };
  const conjure = async (typeId: number, count: number) => {
    const before = client.mark();
    const had = total(inventory, typeId);
    await gm(`/i ${typeId} ${count}`);
    inventory = await client.waitFor(
      (m): m is Inventory => m.type === "inventory-updated" && total(m, typeId) >= had + count,
      `inventory holding ${had + count}x ${typeId}`,
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
  // Every use is exhaust-gated (Session.USE_EXHAUST_MS); the scenario never
  // leans on that refusal.
  const use = async (label: string, expectText: string, check?: (m: Inventory) => boolean) => {
    await sleep(USE_EXHAUST_MS + 100);
    const before = client.mark();
    const tool = converter();
    client.send({ type: "use-item", itemId: tool.id, revision: tool.revision });
    const status = await client.waitFor(
      (m): m is Extract<ServerMessage, { type: "combat-log" }> =>
        m.type === "combat-log" && m.kind === "condition" && m.text.startsWith(expectText.slice(0, 9)),
      `${label}: status line`,
      { since: before },
    );
    if (status.text !== expectText) {
      throw new Error(`${label}: expected "${expectText}", got "${status.text}"`);
    }
    ok(`"${status.text}"`);
    if (check) {
      inventory = await client.waitFor(
        (m): m is Inventory => m.type === "inventory-updated" && check(m),
        `${label}: inventory`,
        { since: before },
      );
    } else {
      await sleep(500);
      if (client.messages.slice(before).some((m) => m.type === "inventory-updated")) {
        throw new Error(`${label}: the inventory changed although nothing should convert`);
      }
    }
    if (client.messages.slice(before).some((m) => m.type === "error")) {
      throw new Error(`${label}: the server also reported an error`);
    }
  };

  step("conjuring a gold converter and 250 gold in three stacks (100, 100, 50)");
  await conjure(GOLD_CONVERTER, 1);
  await conjure(GOLD_COIN_TYPE_ID, 100);
  await conjure(GOLD_COIN_TYPE_ID, 100);
  await conjure(GOLD_COIN_TYPE_ID, 50);
  const start = counts(inventory);
  ok(`carrying ${JSON.stringify(start)} (starter kit crystal: ${start.crystal})`);
  if (start.goldStacks !== 3) throw new Error(`expected 3 gold stacks, got ${start.goldStacks}`);

  step("one use sweeps by total: 250 gold -> 2 platinum + 50 gold in a single stack");
  await use(
    "sweep",
    "Converted 200 gold coins into 2 platinum coins.",
    (m) => {
      const c = counts(m);
      return c.gold === 50 && c.goldStacks === 1 && c.platinum === 2 && c.crystal === start.crystal;
    },
  );
  ok(JSON.stringify(counts(inventory)));

  step("nothing left to convert answers a status line, never an error");
  await use("nothing", GOLD_CONVERTER_NOTHING_MESSAGE);

  step("chaining: 98 more platinum + 100 gold -> 1 platinum minted, 100 platinum -> 1 crystal");
  await conjure(PLATINUM_COIN_TYPE_ID, 98);
  await conjure(GOLD_COIN_TYPE_ID, 50);
  await use(
    "chain",
    "Converted 100 gold coins into 1 platinum coin and 100 platinum coins into 1 crystal coin.",
    (m) => {
      const c = counts(m);
      return c.gold === 0 && c.platinum === 1 && c.crystal === start.crystal + 1;
    },
  );
  ok(JSON.stringify(counts(inventory)));

  step("the converter survives with charges spent");
  ok(`converter ${converter().id} still carried at revision ${converter().revision}`);

  step("relogging: the sweep was persisted, not just cached");
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
  const after = { ...counts(reloaded), converters: carried(reloaded, GOLD_CONVERTER).length };
  if (after.gold !== 0 || after.platinum !== 1 || after.crystal !== start.crystal + 1 || after.converters !== 1) {
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
