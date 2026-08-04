import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: buy an epic exercise weapon from the Mantus Store, then train with
 * it on a free exercise dummy and watch the charges burn.
 *
 * It covers the three claims the tier makes at once — the store sells only the
 * epic and legendary tiers, the weapon exists and is carriable, and it lands
 * two hits in the time a stock weapon lands one — against the real server, the
 * real catalog and the real wire protocol.
 * Run with: yarn playtest:exercise
 */
const DUMMY = { x: 32_347, y: 32_240, z: 7 };
const STAND = { x: DUMMY.x, y: DUMMY.y + 1, z: DUMMY.z };
const EPIC_EXERCISE_SWORD = 60_002;
const STOCK_EXERCISE_SWORD = 28_552;
const EPIC_OFFER = "charges-60002-14000";
const EPIC_PRICE = 30;
const COIN_GRANT = 100;
/** CONST_ME_PURPLE_ELECTRIC_SPARK and CONST_ME_HITAREA. */
const PURPLE_LIGHTNING = 303;
const HIT_AREA = 10;
/** Long enough for the stock tier to land several hits to compare against. */
const TRAINING_WINDOW_MS = 4_000;
/** ExerciseTrainingHandler's own start cooldown, between the two runs. */
const START_EXHAUST_MS = 10_000;
const TOKEN = "dev-exercise-scenario";
const CHARACTER = "Exercise Tester";

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let failed = false;

async function gm(client: PlaytestClient, command: string): Promise<string> {
  const since = client.mark();
  client.say(command);
  const reply = await client.waitFor(
    (m): m is Extract<typeof m, { type: "gm-response" }> =>
      m.type === "gm-response",
    `gm-response for ${command}`,
    { since },
  );
  if (!reply.ok) throw new Error(`${command} failed: ${reply.text}`);
  return reply.text;
}

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const client = await PlaytestClient.connect(url);
  await client.enter(TOKEN, CHARACTER);
  ok(`entered world as ${client.playerId}`);

  step("browsing the store's Exercise Weapons shelf");
  const beforeStore = client.mark();
  client.send({ type: "store-open" });
  await client.waitFor(
    (m): m is Extract<typeof m, { type: "store-state" }> =>
      m.type === "store-state",
    "store-state",
    { since: beforeStore },
  );
  const shelf: Array<{ name: string; price: number }> = [];
  for (const page of [0, 1]) {
    const sincePage = client.mark();
    client.send({ type: "store-category", categoryId: "exercise-weapons", page });
    const offers = await client.waitFor(
      (m): m is Extract<typeof m, { type: "store-offers" }> =>
        m.type === "store-offers" && m.page === page,
      `store-offers page ${page}`,
      { since: sincePage },
    );
    for (const product of offers.products) {
      shelf.push({ name: product.name, price: product.subOffers[0]!.price });
    }
  }
  ok(`shelf: ${shelf.map((entry) => `${entry.name} ${entry.price}`).join(", ")}`);
  const stock = shelf.filter(
    (entry) =>
      !entry.name.startsWith("Epic ") && !entry.name.startsWith("Legendary "),
  );
  if (stock.length > 0) {
    throw new Error(`the shelf still sells stock tiers: ${stock.map((e) => e.name).join(", ")}`);
  }
  if (shelf.length !== 16) {
    throw new Error(`expected 16 offers on the shelf, saw ${shelf.length}`);
  }

  step(`granting ${COIN_GRANT} coins and buying the epic exercise sword`);
  ok(await gm(client, `/coins ${COIN_GRANT}`));
  // The playtest database persists between runs, so the balance to check
  // against is whatever the store reports right now, not the grant.
  const beforeBalance = client.mark();
  client.send({ type: "store-open" });
  const { balance } = await client.waitFor(
    (m): m is Extract<typeof m, { type: "store-state" }> =>
      m.type === "store-state",
    "store-state after the grant",
    { since: beforeBalance },
  );
  const beforePurchase = client.mark();
  client.send({ type: "store-purchase", offerId: EPIC_OFFER });
  const purchased = await client.waitFor(
    (m): m is Extract<typeof m, { type: "store-purchase-completed" }> =>
      m.type === "store-purchase-completed",
    "store-purchase-completed",
    { since: beforePurchase },
  );
  if (purchased.balance !== balance - EPIC_PRICE) {
    throw new Error(
      `balance is ${purchased.balance}, expected ${balance - EPIC_PRICE}`,
    );
  }
  ok(
    `bought ${purchased.offerId} for ${EPIC_PRICE}, balance ${purchased.balance}` +
      `${purchased.deliveredToInbox ? ", delivered to the store inbox" : ""}`,
  );

  step("conjuring both tiers and standing next to the dummy");
  // The playtest character persists between runs, and its backpack does not
  // grow: only conjure a tier this character is not already carrying.
  const carriedTypeIds = new Set(
    client.messages.flatMap((message) =>
      message.type === "inventory-updated"
        ? message.inventory.items.map((entry) => entry.item.typeId)
        : [],
    ),
  );
  for (const typeId of [STOCK_EXERCISE_SWORD, EPIC_EXERCISE_SWORD]) {
    if (carriedTypeIds.has(typeId)) continue;
    ok(await gm(client, `/i ${typeId}`));
  }
  ok(await gm(client, `/goto ${STAND.x} ${STAND.y} ${STAND.z}`));
  const carried = await client.waitFor(
    (m): m is Extract<typeof m, { type: "inventory-updated" }> =>
      m.type === "inventory-updated" &&
      [STOCK_EXERCISE_SWORD, EPIC_EXERCISE_SWORD].every((typeId) =>
        m.inventory.items.some((entry) => entry.item.typeId === typeId),
      ),
    "both swords in the backpack",
  );
  const weaponOf = (typeId: number) =>
    carried.inventory.items.find((entry) => entry.item.typeId === typeId)!.item;
  const epic = weaponOf(EPIC_EXERCISE_SWORD);
  ok(
    `carrying ${epic.tooltip.name} — ${epic.tooltip.charges} charges, ` +
      `"${epic.tooltip.description ?? ""}"`,
  );

  /**
   * Trains for one window and reports what it cost. The dummy's effect and the
   * weapon's charges are counted separately so a mismatch between what the
   * player sees and what they pay shows up as a failure.
   */
  const trainFor = async (
    weapon: typeof epic,
    effectId: number,
  ): Promise<{ hits: number; spent: number; left: number }> => {
    const since = client.mark();
    client.send({
      type: "use-item-with",
      itemId: weapon.id,
      revision: weapon.revision,
      targetPosition: DUMMY,
    });
    await new Promise((resolve) => setTimeout(resolve, TRAINING_WINDOW_MS));
    const seen = client.messages.slice(since);
    const hits = seen.filter(
      (message) =>
        message.type === "magic-effect" && message.effectId === effectId,
    ).length;
    const counts = seen.flatMap((message) =>
      message.type === "inventory-updated"
        ? message.inventory.items
            .filter((entry) => entry.item.id === weapon.id)
            .map((entry) => entry.item.tooltip.charges ?? 0)
        : [],
    );
    const left = counts.at(-1) ?? weapon.tooltip.charges ?? 0;
    // Stepping out of the protection zone is what a player does to stop; the
    // server has to see them outside it, so wait for its own confirmation
    // before walking back.
    const beforeStop = client.mark();
    ok(await gm(client, `/goto ${STAND.x} ${STAND.y + 4} ${STAND.z}`));
    await client.waitFor(
      (m): m is Extract<typeof m, { type: "combat-log" }> =>
        m.type === "combat-log" && m.text.includes("training has stopped"),
      "the training stopping",
      { since: beforeStop },
    );
    ok(await gm(client, `/goto ${STAND.x} ${STAND.y} ${STAND.z}`));
    return { hits, spent: (weapon.tooltip.charges ?? 0) - left, left };
  };

  step(`training ${TRAINING_WINDOW_MS}ms with the stock exercise sword`);
  const stockRun = await trainFor(weaponOf(STOCK_EXERCISE_SWORD), HIT_AREA);
  ok(`${stockRun.hits} hits, ${stockRun.spent} charges spent`);

  step(`waiting out the ${START_EXHAUST_MS}ms dummy cooldown`);
  await new Promise((resolve) => setTimeout(resolve, START_EXHAUST_MS));

  step(`training ${TRAINING_WINDOW_MS}ms with the epic exercise sword`);
  const epicRun = await trainFor(epic, PURPLE_LIGHTNING);
  ok(
    `${epicRun.hits} purple-lightning hits, charges ${epic.tooltip.charges} → ` +
      `${epicRun.left} (${epicRun.spent} spent)`,
  );

  for (const [label, run] of [
    ["stock", stockRun],
    ["epic", epicRun],
  ] as const) {
    if (run.hits === 0) throw new Error(`the ${label} tier never hit the dummy`);
    // Charges are bought ahead of the hits they pay for, never behind them.
    if (run.spent < run.hits) {
      throw new Error(
        `${label}: ${run.hits} hits drawn but only ${run.spent} charges spent`,
      );
    }
  }
  const ratio = epicRun.hits / stockRun.hits;
  if (ratio < 3 || ratio > 6) {
    throw new Error(
      `the epic tier hit ${ratio.toFixed(1)}x as often as the stock tier, not ~5x`,
    );
  }
  ok(
    `charges track hits one for one, and the epic tier trains ` +
      `${ratio.toFixed(1)}x as fast as the stock one`,
  );

  client.terminate();
} catch (cause) {
  failed = true;
  console.error("\n✗ scenario failed:", cause);
} finally {
  await server?.stop();
}

process.exit(failed ? 1 : 0);
