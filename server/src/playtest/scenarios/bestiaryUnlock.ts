import type { ServerMessage } from "@tibia/protocol";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: kill rats and watch the bestiary unlock stage by stage over the
 * real wire protocol — classes overview, milestone pushes, stage-gated
 * detail sheet, bosstiary list, and the rejection paths.
 * Run with: yarn playtest:bestiary
 */
const TOKEN = "dev-bestiary-scenario";
// Unique letters-only name per run: the playtest database persists between
// runs and the scenario asserts a fresh, zero-kill bestiary.
const CHARACTER = `Bestiary ${Array.from(
  { length: 8 },
  () => String.fromCharCode(97 + Math.floor(Math.random() * 26)),
).join("")}`;
const RAT_RACE_ID = 21;

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let failed = false;

const isType = <T extends ServerMessage["type"]>(type: T) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: T }> =>
    m.type === type;

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const client = await PlaytestClient.connect(url);
  await client.enter(TOKEN, CHARACTER);
  ok(`entered world as ${client.playerId}`);

  step("boosting to level 200 so rats die in one hit");
  client.say("/level 200");
  await client.waitFor(isType("gm-response"), "gm-response for /level");

  step("leaving the temple protection zone (targeting is blocked inside)");
  const gotoMark = client.mark();
  client.say("/goto 32369 32260 7");
  const gotoReply = await client.waitFor(
    isType("gm-response"),
    "gm-response for /goto",
    { since: gotoMark },
  );
  if (!gotoReply.ok) throw new Error(`/goto failed: ${gotoReply.text}`);
  ok(gotoReply.text);

  step("requesting the whole bestiary in one payload (fresh character)");
  const overviewMark = client.mark();
  client.send({ type: "bestiary-creatures-get" });
  const overview = await client.waitFor(
    isType("bestiary-creatures-state"),
    "bestiary-creatures-state",
    { since: overviewMark },
  );
  if (overview.entries.length < 600) {
    throw new Error(`expected the full bestiary, got ${overview.entries.length}`);
  }
  if (overview.entries.some((entry) => entry.kills !== 0)) {
    throw new Error("fresh character already has kills");
  }
  const classNames = new Set(overview.entries.map((entry) => entry.className));
  const mammalTotal = overview.entries.filter(
    (entry) => entry.className === "Mammal",
  ).length;
  ok(
    `${overview.entries.length} creatures across ${classNames.size} classes ` +
      `(${mammalTotal} Mammals), ${overview.charmPoints} charm points`,
  );

  const killRat = async (): Promise<
    Extract<ServerMessage, { type: "bestiary-entry-changed" }> | null
  > => {
    const spawnMark = client.mark();
    client.say("/spawn rat");
    await client.waitFor(isType("gm-response"), "gm-response for /spawn");
    const rat = await client.waitForCreatureNamed("Rat", {
      timeoutMs: 10_000,
      since: spawnMark,
    });
    const beforeAttack = client.mark();
    client.send({ type: "attack-target", creatureId: rat.id });
    const outcome = await Promise.race([
      client
        .waitFor(isType("bestiary-entry-changed"), "bestiary-entry-changed", {
          since: beforeAttack,
          timeoutMs: 15_000,
        })
        .catch(() => null),
      client
        .waitFor(
          (m): m is Extract<ServerMessage, { type: "creature-left" }> =>
            m.type === "creature-left" && m.creatureId === rat.id,
          "rat death",
          { since: spawnMark, timeoutMs: 15_000 },
        )
        .then(() => sleep(300))
        .then(() => {
          const pushes = client.messages
            .slice(beforeAttack)
            .filter(isType("bestiary-entry-changed"));
          return pushes.at(-1) ?? null;
        }),
    ]);
    return outcome;
  };

  step("killing the first rat and expecting a stage-1 milestone push");
  const firstPush = await killRat();
  if (
    !firstPush ||
    firstPush.raceId !== RAT_RACE_ID ||
    firstPush.kills !== 1 ||
    firstPush.stage !== 1
  ) {
    throw new Error(`expected stage-1 push, got ${JSON.stringify(firstPush)}`);
  }
  ok(`bestiary-entry-changed: ${firstPush.name} kills=1 stage=1`);

  step("re-requesting the bestiary (rat should be known now)");
  await sleep(350);
  const creaturesMark = client.mark();
  client.send({ type: "bestiary-creatures-get" });
  const creatures = await client.waitFor(
    isType("bestiary-creatures-state"),
    "bestiary-creatures-state",
    { since: creaturesMark },
  );
  const ratEntry = creatures.entries.find((e) => e.raceId === RAT_RACE_ID);
  if (!ratEntry || ratEntry.stage !== 1 || ratEntry.kills !== 1) {
    throw new Error(`unexpected rat entry ${JSON.stringify(ratEntry)}`);
  }
  const locked = creatures.entries.filter((e) => e.stage === 0).length;
  ok(
    `${creatures.entries.length} creatures, rat stage 1 with 1 kill, ` +
      `${locked} still locked`,
  );

  step("opening the rat sheet at stage 1 (stats and loot must be hidden)");
  await sleep(350);
  const sheetMark = client.mark();
  client.send({ type: "bestiary-monster-get", raceId: RAT_RACE_ID });
  const stageOneSheet = await client.waitFor(
    isType("bestiary-monster-state"),
    "bestiary-monster-state",
    { since: sheetMark },
  );
  if (stageOneSheet.stats || stageOneSheet.resistances || stageOneSheet.locations) {
    throw new Error("stage-1 sheet leaked stage-gated fields");
  }
  if (stageOneSheet.loot.some((entry) => entry.itemTypeId !== 0)) {
    throw new Error("stage-1 sheet leaked loot item ids");
  }
  ok(
    `sheet stage=${stageOneSheet.stage}: stats/resistances/locations absent, ` +
      `${stageOneSheet.loot.length} loot slots all masked`,
  );

  step("killing 9 more rats to cross the stage-2 threshold (10 kills)");
  let lastPush = firstPush;
  for (let count = 2; count <= 10; count++) {
    const push = await killRat();
    if (push) lastPush = push;
  }
  if (lastPush.kills !== 10 || lastPush.stage !== 2) {
    throw new Error(
      `expected a kills=10 stage=2 push, last was ${JSON.stringify(lastPush)}`,
    );
  }
  ok(`bestiary-entry-changed: kills=10 stage=2`);

  step("re-opening the rat sheet at stage 2 (stats + common loot revealed)");
  await sleep(350);
  const sheet2Mark = client.mark();
  client.send({ type: "bestiary-monster-get", raceId: RAT_RACE_ID });
  const stageTwoSheet = await client.waitFor(
    isType("bestiary-monster-state"),
    "bestiary-monster-state",
    { since: sheet2Mark },
  );
  if (!stageTwoSheet.stats || stageTwoSheet.stats.maxHealth !== 20) {
    throw new Error(`stage-2 stats missing: ${JSON.stringify(stageTwoSheet.stats)}`);
  }
  if (stageTwoSheet.resistances || stageTwoSheet.locations) {
    throw new Error("stage-2 sheet leaked stage-3 fields");
  }
  const visibleLoot = stageTwoSheet.loot.filter((e) => e.itemTypeId !== 0);
  const hiddenLoot = stageTwoSheet.loot.filter((e) => e.itemTypeId === 0);
  if (visibleLoot.length === 0 || visibleLoot.some((e) => e.rarity >= 2)) {
    throw new Error("stage-2 loot gating is wrong");
  }
  ok(
    `stats revealed (hp=${stageTwoSheet.stats.maxHealth}, exp=${stageTwoSheet.stats.experience}), ` +
      `${visibleLoot.length} common drops visible, ${hiddenLoot.length} rarer still masked`,
  );

  step("requesting the bosstiary");
  await sleep(350);
  const bossMark = client.mark();
  client.send({ type: "bosstiary-get" });
  const bosses = await client.waitFor(
    isType("bosstiary-state"),
    "bosstiary-state",
    { since: bossMark },
  );
  if (bosses.entries.length < 30 || bosses.bossPoints !== 0) {
    throw new Error(
      `unexpected bosstiary: ${bosses.entries.length} entries, ${bosses.bossPoints} points`,
    );
  }
  ok(`${bosses.entries.length} bosses listed, 0 boss points`);

  step("probe: detail sheet of an undiscovered creature must be refused");
  await sleep(350);
  const orcWarlordRaceId = 2;
  const lockedMark = client.mark();
  client.send({ type: "bestiary-monster-get", raceId: orcWarlordRaceId });
  const lockedFail = await client.waitFor(
    isType("bestiary-action-failed"),
    "bestiary-action-failed for locked race",
    { since: lockedMark },
  );
  if (lockedFail.reason !== "locked") {
    throw new Error(`expected locked, got ${lockedFail.reason}`);
  }
  ok("locked creature sheet refused with reason=locked");

  step("probe: unknown race id must be refused");
  await sleep(350);
  const unknownMark = client.mark();
  client.send({ type: "bestiary-monster-get", raceId: 60_000 });
  const unknownFail = await client.waitFor(
    isType("bestiary-action-failed"),
    "bestiary-action-failed for unknown race",
    { since: unknownMark },
  );
  if (unknownFail.reason !== "unknown-race") {
    throw new Error(`expected unknown-race, got ${unknownFail.reason}`);
  }
  ok("unknown race refused with reason=unknown-race");

  step("probe: back-to-back requests must be rate limited");
  await sleep(350);
  const rateMark = client.mark();
  client.send({ type: "bestiary-creatures-get" });
  client.send({ type: "bestiary-creatures-get" });
  const rateFail = await client.waitFor(
    isType("bestiary-action-failed"),
    "bestiary-action-failed for rate limit",
    { since: rateMark },
  );
  if (rateFail.reason !== "rate-limited") {
    throw new Error(`expected rate-limited, got ${rateFail.reason}`);
  }
  ok("second immediate request refused with reason=rate-limited");

  step("probe: kill counts must survive a relogin");
  client.terminate();
  const second = await PlaytestClient.connect(url);
  await second.enter(TOKEN, CHARACTER);
  await sleep(350);
  const reloginMark = second.mark();
  second.send({ type: "bestiary-creatures-get" });
  const reloginCreatures = await second.waitFor(
    isType("bestiary-creatures-state"),
    "bestiary-creatures-state after relogin",
    { since: reloginMark },
  );
  const persistedRat = reloginCreatures.entries.find(
    (e) => e.raceId === RAT_RACE_ID,
  );
  if (!persistedRat || persistedRat.kills < 10 || persistedRat.stage < 2) {
    throw new Error(
      `kills did not persist across relogin: ${JSON.stringify(persistedRat)}`,
    );
  }
  ok(
    `after relogin the rat still has ${persistedRat.kills} kills at stage ${persistedRat.stage}`,
  );

  second.terminate();
  console.log("\nPASS: bestiary unlocks, gates, and persists over the wire\n");
} catch (cause) {
  failed = true;
  console.error("\nFAIL:", cause instanceof Error ? cause.message : cause);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
