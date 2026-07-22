import type { ServerMessage } from "@tibia/protocol";
import { Client } from "pg";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: allocate Wheel of Destiny points over the real wire protocol —
 * the premium/level gate, a valid save applying dedication stats, the
 * over-budget and disconnected-slice rejections, rate limiting, and
 * persistence across relogin.
 * Run with: yarn playtest:wheel
 */
const TOKEN = "dev-wheel-scenario";
const CHARACTER = `Wheel ${Array.from(
  { length: 8 },
  () => String.fromCharCode(97 + Math.floor(Math.random() * 26)),
).join("")}`;
/** Purple root slice: 50 points of +3 HP each for a knight. */
const HEALTH_ROOT = 22;

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = () => crypto.randomUUID();

const slices = (points: Readonly<Record<number, number>>): number[] => {
  const result = new Array<number>(36).fill(0);
  for (const [id, value] of Object.entries(points)) {
    result[Number(id) - 1] = value;
  }
  return result;
};

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let failed = false;

const isType = <T extends ServerMessage["type"]>(type: T) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: T }> =>
    m.type === type;

async function grantPremiumAndPromotion(): Promise<void> {
  const adminUrl =
    process.env.PLAYTEST_ADMIN_URL ??
    "postgres://tibia:tibia_dev_only@localhost:5432/postgres";
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${process.env.PLAYTEST_DATABASE ?? "playtest"}`;
  const db = new Client({ connectionString: databaseUrl.toString() });
  await db.connect();
  try {
    const result = await db.query(
      "UPDATE accounts SET premium_until = now() + interval '30 days' WHERE supabase_user_id = $1",
      [`dev:${TOKEN}`],
    );
    if (result.rowCount !== 1) {
      throw new Error(`expected 1 premium update, got ${String(result.rowCount)}`);
    }
    const promoted = await db.query(
      `UPDATE characters
       SET vocation = 'Elite Knight', version = version + 1, updated_at = now()
       WHERE normalized_name = lower($1) AND vocation = 'Knight'`,
      [CHARACTER],
    );
    if (promoted.rowCount !== 1) {
      throw new Error(`expected 1 promotion update, got ${String(promoted.rowCount)}`);
    }
  } finally {
    await db.end();
  }
}

try {
  step(`connecting to ${url} as ${CHARACTER} (free account)`);
  const client = await PlaytestClient.connect(url);
  await client.enter(TOKEN, CHARACTER);
  ok(`entered world as ${client.playerId}`);

  step("wheel-get on a fresh level-1 free character");
  const freshMark = client.mark();
  client.send({ type: "wheel-get" });
  const fresh = await client.waitFor(isType("wheel-state"), "wheel-state", {
    since: freshMark,
  });
  if (fresh.unlocked || fresh.totalPoints !== 0) {
    throw new Error(`expected a locked empty wheel, got ${JSON.stringify(fresh)}`);
  }
  if (fresh.slices.some((points) => points !== 0)) {
    throw new Error("fresh character already has wheel points");
  }
  ok("wheel is locked with 0 points and an empty allocation");

  step("boosting to level 200 (150 wheel points once premium)");
  client.say("/level 200");
  await client.waitFor(isType("gm-response"), "gm-response for /level");

  step("probe: saving on a free account must be refused");
  await sleep(1_100);
  const freeMark = client.mark();
  client.send({
    type: "wheel-save",
    requestId: uuid(),
    slices: slices({ [HEALTH_ROOT]: 50 }),
  });
  const freeFail = await client.waitFor(
    isType("wheel-action-failed"),
    "wheel-action-failed for free account",
    { since: freeMark },
  );
  if (freeFail.reason !== "unavailable") {
    throw new Error(`expected unavailable, got ${freeFail.reason}`);
  }
  ok("free-account save refused with reason=unavailable");

  step("granting premium and promotion in the playtest database, then relogging");
  await grantPremiumAndPromotion();
  client.terminate();
  const premium = await PlaytestClient.connect(url);
  await premium.enter(TOKEN, CHARACTER);
  const premiumWelcome = premium.messages.find(isType("welcome"));
  if (!premiumWelcome) throw new Error("missing welcome after relogin");
  const baseMaxHealth = premiumWelcome.character.maxHealth;
  ok(`relogged with premium; base max health ${baseMaxHealth}`);

  step("wheel-get now reports an unlocked wheel with level-derived points");
  await sleep(350);
  const unlockedMark = premium.mark();
  premium.send({ type: "wheel-get" });
  const unlocked = await premium.waitFor(
    isType("wheel-state"),
    "wheel-state after premium",
    { since: unlockedMark },
  );
  if (!unlocked.unlocked || unlocked.totalPoints !== 150) {
    throw new Error(`expected 150 unlocked points, got ${JSON.stringify(unlocked)}`);
  }
  ok("wheel unlocked with 150 promotion points");

  step("probe: allocating beyond the earned budget must be refused");
  await sleep(1_100);
  const overMark = premium.mark();
  premium.send({
    type: "wheel-save",
    requestId: uuid(),
    // All four roots = 200 points against a 150 budget.
    slices: slices({ 15: 50, 16: 50, 21: 50, 22: 50 }),
  });
  const overFail = await premium.waitFor(
    isType("wheel-action-failed"),
    "wheel-action-failed for over-budget",
    { since: overMark },
  );
  if (overFail.reason !== "invalid-allocation") {
    throw new Error(`expected invalid-allocation, got ${overFail.reason}`);
  }
  ok("over-budget allocation refused with reason=invalid-allocation");

  step("probe: a slice with no full neighbor must be refused");
  await sleep(1_100);
  const islandMark = premium.mark();
  premium.send({
    type: "wheel-save",
    requestId: uuid(),
    // Slice 9 (ring 2) with its root at 0 points.
    slices: slices({ 9: 75 }),
  });
  const islandFail = await premium.waitFor(
    isType("wheel-action-failed"),
    "wheel-action-failed for disconnected slice",
    { since: islandMark },
  );
  if (islandFail.reason !== "invalid-allocation") {
    throw new Error(`expected invalid-allocation, got ${islandFail.reason}`);
  }
  ok("disconnected slice refused with reason=invalid-allocation");

  step("saving a valid allocation (50 points into the +3 HP root)");
  await sleep(1_100);
  const saveMark = premium.mark();
  premium.send({
    type: "wheel-save",
    requestId: uuid(),
    slices: slices({ [HEALTH_ROOT]: 50 }),
  });
  const saved = await premium.waitFor(
    isType("wheel-state"),
    "wheel-state after save",
    { since: saveMark },
  );
  if (saved.slices[HEALTH_ROOT - 1] !== 50) {
    throw new Error(`save was not applied: ${JSON.stringify(saved.slices)}`);
  }
  const progressed = await premium.waitFor(
    isType("progression-updated"),
    "progression-updated after save",
    { since: saveMark },
  );
  const boosted = progressed.progression.maxHealth;
  if (boosted !== baseMaxHealth + 150) {
    throw new Error(
      `expected max health ${baseMaxHealth + 150}, got ${boosted}`,
    );
  }
  ok(`allocation applied; max health ${baseMaxHealth} -> ${boosted} (+150)`);

  step("probe: back-to-back saves must be rate limited");
  const rateMark = premium.mark();
  premium.send({
    type: "wheel-save",
    requestId: uuid(),
    slices: slices({ [HEALTH_ROOT]: 50 }),
  });
  const rateFail = await premium.waitFor(
    isType("wheel-action-failed"),
    "wheel-action-failed for rate limit",
    { since: rateMark },
  );
  if (rateFail.reason !== "rate-limited") {
    throw new Error(`expected rate-limited, got ${rateFail.reason}`);
  }
  ok("immediate second save refused with reason=rate-limited");

  step("probe: the allocation and stats must survive a relogin");
  premium.terminate();
  await sleep(500);
  const third = await PlaytestClient.connect(url);
  await third.enter(TOKEN, CHARACTER);
  const thirdWelcome = third.messages.find(isType("welcome"));
  if (thirdWelcome?.character.maxHealth !== boosted) {
    throw new Error(
      `boosted max health did not survive relogin: ${String(
        thirdWelcome?.character.maxHealth,
      )}`,
    );
  }
  await sleep(350);
  const persistedMark = third.mark();
  third.send({ type: "wheel-get" });
  const persisted = await third.waitFor(
    isType("wheel-state"),
    "wheel-state after relogin",
    { since: persistedMark },
  );
  if (persisted.slices[HEALTH_ROOT - 1] !== 50) {
    throw new Error(
      `allocation did not persist: ${JSON.stringify(persisted.slices)}`,
    );
  }
  ok(
    `after relogin the allocation persists and max health is still ${boosted}`,
  );

  third.terminate();
  console.log("\nPASS: wheel gates, applies, rejects, and persists over the wire\n");
} catch (cause) {
  failed = true;
  console.error("\nFAIL:", cause instanceof Error ? cause.message : cause);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
