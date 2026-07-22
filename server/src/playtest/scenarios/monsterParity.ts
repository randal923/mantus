import type { Position, ServerMessage } from "@tibia/protocol";
import { evaluateSpellExpression } from "../../combat/evaluateSpellExpression";
import { loadCanarySpellCatalog } from "../../combat/loadCanarySpellCatalog";
import { ParityRig } from "../ParityRig";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: monster combat parity against Canary data over the real wire.
 * - rat/dragon melee stays inside the catalog min/max and never "misses"
 * - scorpion melee poisons on hit and the poison ticks follow Canary's
 *   decaying ConditionDamage series (total 340 -> first tick 17, every 4 s)
 * - the dragon casts its fire spells (missile CONST_ANI_FIRE=4, area effect
 *   CONST_ME_FIREAREA=7), heals itself for 40..70, is immune to fire,
 *   weak to ice (-10), and 80% resistant to earth
 * - a hunter shoots arrows (missile CONST_ANI_ARROW=3)
 * Run with: yarn playtest:monsters
 */

// Fresh dev account per run: accounts cap at 5 characters.
const TOKEN = `dev-monster-parity-${Math.random().toString(36).slice(2, 8)}`;
const SPOT = { x: 32_369, y: 32_260, z: 7 };

interface CheckResult {
  name: string;
  status: "pass" | "fail";
  detail: string;
}

const results: CheckResult[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  results.push({ name, status: ok ? "pass" : "fail", detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}: ${detail}`);
};

const isType = <T extends ServerMessage["type"]>(type: T) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: T }> =>
    m.type === type;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const randomName = (prefix: string) =>
  `${prefix} ${Array.from({ length: 8 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26)),
  ).join("")}`;

const atTile = (message: { position: Position }, tile: Position) =>
  message.position.x === tile.x &&
  message.position.y === tile.y &&
  message.position.z === tile.z;

/** Waits near a spawned monster, healing between polls, collecting messages. */
async function tank(
  rig: ParityRig,
  durationMs: number,
  healEveryMs = 6_000,
): Promise<void> {
  const start = Date.now();
  let lastHeal = 0;
  while (Date.now() - start < durationMs) {
    if (Date.now() - lastHeal > healEveryMs) {
      lastHeal = Date.now();
      await rig.gm("/heal").catch(() => undefined);
    }
    await sleep(500);
  }
}

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let crashed = false;

try {
  const catalog = loadCanarySpellCatalog();
  const runeBounds = (runeId: string, level: number, magicLevel: number) => {
    const spell = catalog.find((entry) => entry.id === runeId);
    if (!spell) throw new Error(`rune ${runeId} missing from catalog`);
    const variables = { level, magicLevel, skill: 10, attack: 7 };
    const minimum = Math.max(
      0,
      Math.floor(
        Math.abs(evaluateSpellExpression(spell.formula.minimum, variables)),
      ),
    );
    const maximum = Math.max(
      minimum,
      Math.floor(
        Math.abs(evaluateSpellExpression(spell.formula.maximum, variables)),
      ),
    );
    return { spell, minimum, maximum };
  };

  const rig = await ParityRig.create(url, TOKEN, randomName("Tanker"), "Knight");
  await rig.goto(SPOT.x, SPOT.y, SPOT.z);
  await rig.setupStats({ level: 300, magicLevel: 5 });
  rig.client.send({
    type: "set-fight-mode",
    mode: { attack: "offensive", chase: false, secure: true },
  });

  console.log("▶ rat: melee bounds");
  const ratMark = rig.mark();
  const rat = await rig.spawnMonster("rat", "Rat");
  await tank(rig, 9_000);
  const myTile = rig.position;
  const ratHits = rig
    .messagesSince(ratMark)
    .filter(isType("combat-text"))
    .filter((m) => atTile(m, myTile) && m.damageType === "physical");
  check(
    "rat-melee-bounds",
    ratHits.length > 0 && ratHits.every((m) => m.value <= 8),
    `${ratHits.length} rat hits, max ${Math.max(...ratHits.map((m) => m.value), 0)} (cap 8)`,
  );
  check(
    "monster-never-misses",
    ratHits.every((m) => m.block !== "miss"),
    "monster melee has no miss roll",
  );
  await rig.attackTarget(rat.id);
  for (let i = 0; i < 15 && rig.creatureAlive(rat.id); i++) await sleep(500);
  await rig.cancelAttack();

  console.log("▶ scorpion: on-hit poison (Canary condition series)");
  const scorpionMark = rig.mark();
  const scorpion = await rig.spawnMonster("scorpion", "Scorpion");
  const poisoned = await rig.client
    .waitFor(
      (m): m is Extract<ServerMessage, { type: "fight-state" }> =>
        m.type === "fight-state" &&
        m.fightState.conditions.some((c) => c.type === "poison"),
      "poison condition from scorpion melee",
      { since: scorpionMark, timeoutMs: 30_000 },
    )
    .then(() => true)
    .catch(() => false);
  check(
    "scorpion-poisons-on-hit",
    poisoned,
    poisoned
      ? "poison condition appeared in fight-state"
      : "no poison within 30s of scorpion melee",
  );
  await rig.attackTarget(scorpion.id);
  for (let i = 0; i < 20 && rig.creatureAlive(scorpion.id); i++) await sleep(500);
  await rig.cancelAttack();
  if (poisoned) {
    const tickMark = rig.mark();
    await sleep(13_000);
    const poisonTile = rig.position;
    const ticks = rig
      .messagesSince(tickMark)
      .filter(isType("combat-text"))
      .filter((m) => atTile(m, poisonTile) && m.damageType === "earth")
      .map((m) => m.value);
    // Canary series for totalDamage 340: starts at ceil(340/20) = 17,
    // decays toward 1, one tick every 4000 ms.
    check(
      "scorpion-poison-ticks",
      ticks.length >= 2 &&
        ticks.every((value) => value >= 1 && value <= 17),
      `ticks over 13s: ${JSON.stringify(ticks)} (expected 2-4 ticks of 1..17)`,
    );
  }
  await rig.gm("/heal");
  // Outrun the rest of the poison: it ticks harmlessly while we relocate.

  console.log("▶ dragon: spells, self-heal, resistances");
  await rig.goto(32_423, SPOT.y, SPOT.z);
  const dragonMark = rig.mark();
  const dragon = await rig.spawnMonster("dragon", "Dragon");
  // Chip the dragon so its self-heal has something to restore, while we
  // observe its fire spells.
  await rig.attackTarget(dragon.id);
  await tank(rig, 45_000, 4_000);
  await rig.cancelAttack();
  const dragonMessages = rig.messagesSince(dragonMark);
  const fireTexts = dragonMessages
    .filter(isType("combat-text"))
    .filter((m) => m.damageType === "fire");
  check(
    "dragon-casts-fire",
    fireTexts.length > 0,
    `${fireTexts.length} fire damage events within 45s`,
  );
  check(
    "dragon-fire-bounds",
    fireTexts.every((m) => m.value <= 170),
    `max fire hit ${Math.max(...fireTexts.map((m) => m.value), 0)} (wave cap 170)`,
  );
  const fireMissiles = dragonMessages
    .filter(isType("distance-missile"))
    .filter((m) => m.missileId === 4);
  const fireAreaEffects = dragonMessages
    .filter(isType("magic-effect"))
    .filter((m) => m.effectId === 7);
  check(
    "dragon-fire-visuals",
    fireAreaEffects.length >= 3,
    `${fireMissiles.length} CONST_ANI_FIRE missiles, ${fireAreaEffects.length} CONST_ME_FIREAREA effects`,
  );
  const fireEffectTiles = new Set(
    fireAreaEffects.map((m) => `${m.position.x}:${m.position.y}`),
  );
  check(
    "dragon-area-effect-spread",
    fireEffectTiles.size >= 3,
    `fire area effects covered ${fireEffectTiles.size} distinct tiles (area spell, not single-tile)`,
  );
  const dragonTile = () => rig.creaturePosition(dragon.id);
  const heals = dragonMessages
    .filter(isType("combat-text"))
    .filter((m) => m.damageType === "healing")
    .map((m) => m.value);
  check(
    "dragon-self-heal",
    heals.length > 0 && heals.every((value) => value <= 70),
    `${heals.length} heals, values ${JSON.stringify(heals.slice(0, 6))} (catalog 40..70, capped by missing health)`,
  );

  if (rig.creatureAlive(dragon.id)) {
    const dragonPosition = dragonTile();
    if (dragonPosition) {
      // Fire immunity: fireball rune must be fully absorbed.
      const fire = runeBounds("fireball-rune", 300, rig.progression.magicLevel);
      await rig.give(String(fire.spell.runeItemTypeId), 10);
      const fireOutcome = await rig.useRune(fire.spell.runeItemTypeId ?? 0, {
        kind: "creature",
        creatureId: dragon.id,
      });
      const immuneText = fireOutcome.combatTexts.find(
        (m) => m.damageType === "fire" && m.block === "immunity",
      );
      check(
        "dragon-fire-immunity",
        fireOutcome.errorCode === null &&
          immuneText !== undefined &&
          immuneText.value === 0,
        immuneText
          ? `fireball rune blocked as immunity, value ${immuneText.value}`
          : `no immunity combat-text (error ${fireOutcome.errorCode ?? "none"})`,
      );
      check(
        "dragon-immune-effect-still-visible",
        fireOutcome.effects.some((m) => m.effectId === fire.spell.effectId),
        `fireball effect id ${fire.spell.effectId} shown on an immune target`,
      );

      // Ice weakness: -10 resistance means up to +10% damage.
      const ice = runeBounds("icicle-rune", 300, rig.progression.magicLevel);
      await rig.give(String(ice.spell.runeItemTypeId), 10);
      await rig.waitForCooldowns(["group:attack"]);
      const iceOutcome = await rig.useRune(ice.spell.runeItemTypeId ?? 0, {
        kind: "creature",
        creatureId: dragon.id,
      });
      const iceHit = iceOutcome.combatTexts.find(
        (m) => m.damageType === "ice",
      );
      const iceCap = Math.ceil(ice.maximum * 1.1);
      check(
        "dragon-ice-weakness",
        iceHit !== undefined && iceHit.value <= iceCap && iceHit.block === "none",
        iceHit
          ? `ice hit ${iceHit.value} (cap ${iceCap} = max ${ice.maximum} +10% weakness)`
          : `no ice combat-text (error ${iceOutcome.errorCode ?? "none"})`,
      );

      // Earth resistance 80%.
      const earth = runeBounds("stalagmite-rune", 300, rig.progression.magicLevel);
      await rig.give(String(earth.spell.runeItemTypeId), 10);
      await rig.waitForCooldowns(["group:attack"]);
      const earthOutcome = await rig.useRune(earth.spell.runeItemTypeId ?? 0, {
        kind: "creature",
        creatureId: dragon.id,
      });
      const earthHit = earthOutcome.combatTexts.find(
        (m) => m.damageType === "earth",
      );
      const earthCap = Math.ceil(earth.maximum * 0.2) + 1;
      check(
        "dragon-earth-resistance",
        earthHit !== undefined && earthHit.value <= earthCap,
        earthHit
          ? `earth hit ${earthHit.value} (cap ${earthCap} = max ${earth.maximum} at 80% resist)`
          : `no earth combat-text (error ${earthOutcome.errorCode ?? "none"})`,
      );
    }
  } else {
    check("dragon-alive-for-resistances", false, "dragon died before rune checks");
  }

  console.log("▶ hunter: distance attacks");
  await rig.goto(32_309, SPOT.y, SPOT.z);
  await rig.gm("/heal");
  const hunterMark = rig.mark();
  await rig.spawnMonster("hunter", "Hunter");
  await tank(rig, 20_000);
  const hunterMessages = rig.messagesSince(hunterMark);
  const arrowMissiles = hunterMessages
    .filter(isType("distance-missile"))
    .filter((m) => m.missileId === 3);
  check(
    "hunter-arrow-missiles",
    arrowMissiles.length > 0,
    `${arrowMissiles.length} CONST_ANI_ARROW missiles within 20s`,
  );
  const hunterTile = rig.position;
  const hunterHits = hunterMessages
    .filter(isType("combat-text"))
    .filter((m) => atTile(m, hunterTile) && m.damageType === "physical");
  check(
    "hunter-damage-bounds",
    hunterHits.every((m) => m.value <= 100),
    `${hunterHits.length} physical hits, max ${Math.max(...hunterHits.map((m) => m.value), 0)} (arrow cap 100, melee cap 20)`,
  );

  rig.client.terminate();
} catch (cause) {
  crashed = true;
  console.error("\nSCENARIO CRASH:", cause);
} finally {
  const failures = results.filter((result) => result.status === "fail");
  console.log(
    `\n${results.length - failures.length} passed, ${failures.length} failed`,
  );
  for (const failure of failures) {
    console.log(`  FAIL ${failure.name}: ${failure.detail}`);
  }
  await server?.stop();
  process.exit(crashed || failures.length > 0 ? 1 : 0);
}
