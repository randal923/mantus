import type { ServerMessage } from "@tibia/protocol";
import { ParityRig } from "../ParityRig";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: auto-attack parity for the weapon classes over the real wire —
 * melee (sword), distance (bow + arrows), throwable (spear), and wand.
 * Verifies Canary damage bounds, missile ids, ammunition consumption, the
 * 2000 ms attack interval, skill training, experience awards, and that
 * vocation requirements gate wand attacks.
 * Run with: yarn playtest:weapons
 */

// Fresh dev account per run: accounts cap at 5 characters.
const TOKEN = `dev-weapon-parity-${Math.random().toString(36).slice(2, 8)}`;
const SPOT = { x: 32_369, y: 32_260, z: 7 };

const SWORD = 3_264; // attack 14
const BOW = 3_350; // no attack, ammo arrow, range 6
const ARROW = 3_447; // attack 25, missile 3, flat 91% hit chance
const SPEAR = 3_277; // attack 25, missile 1, break 3%
const WAND_OF_VORTEX = 3_074; // energy 8..18, mana 1, range 3

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

interface AttackObservation {
  hits: number[];
  misses: number;
  hitTimes: number[];
  kills: number;
}

/**
 * Attacks freshly spawned monsters of one type until `minHits` damage lines
 * are observed (respawning as needed), reading the attacker-only combat-log.
 */
async function observeAttacks(
  rig: ParityRig,
  monsterTypeId: string,
  monsterName: string,
  minHits: number,
  maxRounds = 30,
): Promise<AttackObservation> {
  const observation: AttackObservation = {
    hits: [],
    misses: 0,
    hitTimes: [],
    kills: 0,
  };
  const damageLine = new RegExp(`^${monsterName}: (\\d+) (\\w[\\w-]*)\\.$`);
  const missLine = `You missed ${monsterName}.`;
  let cursor = rig.mark();
  let target: { id: string } | null = null;
  for (let round = 0; round < maxRounds; round++) {
    if (!target || !rig.creatureAlive(target.id)) {
      if (target) observation.kills++;
      target = await rig.spawnMonster(monsterTypeId, monsterName);
      await rig.attackTarget(target.id);
    }
    await sleep(700);
    const messages = rig.client.messages;
    for (; cursor < messages.length; cursor++) {
      const message = messages[cursor];
      if (message?.type !== "combat-log") continue;
      const match = damageLine.exec(message.text);
      if (match) {
        observation.hits.push(Number(match[1]));
        observation.hitTimes.push(rig.client.receivedAt[cursor] ?? 0);
      } else if (message.text === missLine) {
        observation.misses++;
      }
    }
    if (observation.hits.length + observation.misses >= minHits) break;
  }
  if (target && !rig.creatureAlive(target.id)) observation.kills++;
  await rig.cancelAttack();
  // Put down any survivor so phases stay isolated.
  if (target && rig.creatureAlive(target.id)) {
    await rig.attackTarget(target.id).catch(() => undefined);
    for (let i = 0; i < 20 && rig.creatureAlive(target.id); i++) {
      await sleep(700);
    }
    await rig.cancelAttack();
  }
  return observation;
}

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let crashed = false;

const randomName = (prefix: string) =>
  `${prefix} ${Array.from({ length: 8 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26)),
  ).join("")}`;

try {
  console.log(`▶ melee phase (knight, sword, skill 60, level 100)`);
  const knight = await ParityRig.create(url, `${TOKEN}-knight`, randomName("Meleearms"), "Knight");
  await knight.goto(SPOT.x, SPOT.y, SPOT.z);
  await knight.setupStats({ level: 100, skills: { sword: 60 } });
  await knight.giveAndEquip(SWORD, "weapon");
  knight.client.send({
    type: "set-fight-mode",
    mode: { attack: "offensive", chase: true, secure: true },
  });
  const swordTriesBefore =
    knight.progression.skills.find((s) => s.skill === "sword")?.tries ?? 0;
  const swordLevelBefore =
    knight.progression.skills.find((s) => s.skill === "sword")?.level ?? 10;
  const xpBefore = knight.progression.experience;
  const meleeMark = knight.mark();
  const melee = await observeAttacks(knight, "rotworm", "Rotworm", 8);
  // Canary: max = round(0.085 * 1.0 * attack 14 * skill 60 + level/5) = 91.
  check(
    "melee-max-damage",
    melee.hits.length > 0 && melee.hits.every((hit) => hit <= 91),
    `${melee.hits.length} hits, max ${Math.max(...melee.hits, 0)} (cap 91)`,
  );
  check(
    "melee-lands-damage",
    melee.hits.some((hit) => hit >= 3),
    `best hit ${Math.max(...melee.hits, 0)}`,
  );
  const meleeGaps = melee.hitTimes
    .slice(1)
    .map((time, index) => time - (melee.hitTimes[index] ?? 0))
    .filter((gap) => gap > 0 && gap < 30_000);
  check(
    "melee-attack-interval",
    meleeGaps.every((gap) => gap >= 1_600),
    `smallest gap ${Math.min(...meleeGaps, 99_999)}ms (attack speed 2000ms)`,
  );
  const attackCooldown = knight
    .messagesSince(meleeMark)
    .filter(isType("fight-state"))
    .flatMap((m) => m.fightState.cooldowns)
    .find((cooldown) => cooldown.group === "attack");
  check(
    "melee-attack-cooldown",
    attackCooldown?.totalMs === 2_000,
    `attack cooldown totalMs ${attackCooldown?.totalMs ?? "missing"}`,
  );
  const swordAfter = knight.progression.skills.find((s) => s.skill === "sword");
  check(
    "melee-skill-training",
    (swordAfter?.tries ?? 0) > swordTriesBefore ||
      (swordAfter?.level ?? 10) > swordLevelBefore,
    `sword tries ${swordTriesBefore} -> ${swordAfter?.tries ?? 0}`,
  );
  const xpTexts = knight
    .messagesSince(meleeMark)
    .filter(isType("experience-text"))
    .map((m) => m.value);
  check(
    "melee-kill-experience",
    melee.kills > 0 && xpTexts.filter((value) => value === 40).length >= melee.kills,
    `${melee.kills} rotworm kills, experience texts ${JSON.stringify(xpTexts)} (rotworm = 40)`,
  );
  check(
    "melee-experience-progression",
    knight.progression.experience - xpBefore >= melee.kills * 40,
    `experience ${xpBefore} -> ${knight.progression.experience}`,
  );
  knight.client.terminate();

  console.log(`▶ distance phase (paladin, bow + arrows, skill 60, level 100)`);
  const paladin = await ParityRig.create(url, `${TOKEN}-paladin`, randomName("Bowarms"), "Paladin");
  await paladin.goto(32_339, SPOT.y, SPOT.z);
  await paladin.setupStats({ level: 100, skills: { distance: 60 } });
  await paladin.giveAndEquip(BOW, "weapon");
  await paladin.giveAndEquip(ARROW, "ammo", 90);
  paladin.client.send({
    type: "set-fight-mode",
    mode: { attack: "offensive", chase: true, secure: true },
  });
  const arrowsBefore = paladin.equippedItem("ammo")?.count ?? 0;
  const bowMark = paladin.mark();
  const bow = await observeAttacks(paladin, "rotworm", "Rotworm", 8);
  // Canary: bow contributes no attack; arrow attack 25.
  // max = round(0.09 * 1.0 * skill 60 * attack 25 + level/5 20) = 155.
  check(
    "bow-max-damage",
    bow.hits.length > 0 && bow.hits.every((hit) => hit <= 155),
    `${bow.hits.length} hits, max ${Math.max(...bow.hits, 0)} (cap 155, would be 193 if the bow wrongly added fist attack 7)`,
  );
  const bowMissiles = paladin
    .messagesSince(bowMark)
    .filter(isType("distance-missile"));
  check(
    "bow-arrow-missile",
    bowMissiles.length > 0 && bowMissiles.every((m) => m.missileId === 3),
    `${bowMissiles.length} missiles, ids ${[...new Set(bowMissiles.map((m) => m.missileId))].join(",")} (arrow = 3)`,
  );
  const arrowsAfter = paladin.equippedItem("ammo")?.count ?? 0;
  const shots = bow.hits.length + bow.misses;
  check(
    "bow-ammo-consumption",
    arrowsBefore - arrowsAfter === shots,
    `${shots} shots consumed ${arrowsBefore - arrowsAfter} arrows (${arrowsBefore} -> ${arrowsAfter})`,
  );

  console.log(`▶ throwable phase (same paladin, spears)`);
  await paladin.giveAndEquip(SPEAR, "weapon", 50);
  const spearsBefore = paladin.equippedItem("weapon")?.count ?? 0;
  const spearMark = paladin.mark();
  const spear = await observeAttacks(paladin, "rotworm", "Rotworm", 6);
  check(
    "spear-max-damage",
    spear.hits.length > 0 && spear.hits.every((hit) => hit <= 155),
    `${spear.hits.length} hits, max ${Math.max(...spear.hits, 0)} (cap 155)`,
  );
  const spearMissiles = paladin
    .messagesSince(spearMark)
    .filter(isType("distance-missile"));
  check(
    "spear-missile",
    spearMissiles.length > 0 && spearMissiles.every((m) => m.missileId === 1),
    `missile ids ${[...new Set(spearMissiles.map((m) => m.missileId))].join(",")} (spear = 1)`,
  );
  const spearsAfter = paladin.equippedItem("weapon")?.count ?? 0;
  const spearShots = spear.hits.length + spear.misses;
  check(
    "spear-break-chance",
    spearsAfter <= spearsBefore && spearsBefore - spearsAfter <= spearShots,
    `${spearShots} throws, spears ${spearsBefore} -> ${spearsAfter} (3% break chance)`,
  );

  console.log(`▶ wand vocation gate (paladin cannot equip a sorcerer wand)`);
  let wandGateRejected = false;
  try {
    await paladin.giveAndEquip(WAND_OF_VORTEX, "weapon");
  } catch {
    wandGateRejected = true;
  }
  check(
    "wand-vocation-gate",
    wandGateRejected,
    wandGateRejected
      ? "equip of a Sorcerer-only wand was refused server-side"
      : "paladin equipped a Sorcerer-only wand",
  );
  paladin.client.terminate();

  console.log(`▶ wand phase (sorcerer, wand of vortex, level 10)`);
  const sorcerer = await ParityRig.create(url, `${TOKEN}-sorc`, randomName("Wandarms"), "Sorcerer");
  await sorcerer.goto(32_423, SPOT.y, SPOT.z);
  await sorcerer.setupStats({ level: 10 });
  await sorcerer.giveAndEquip(WAND_OF_VORTEX, "weapon");
  sorcerer.client.send({
    type: "set-fight-mode",
    mode: { attack: "offensive", chase: true, secure: true },
  });
  const wandMark = sorcerer.mark();
  const wand = await observeAttacks(sorcerer, "husky", "Husky", 6);
  // Wand of vortex rolls 8..18 energy; husky mitigation 0.13% floors 8 to 7.
  check(
    "wand-damage-bounds",
    wand.hits.length > 0 && wand.hits.every((hit) => hit >= 7 && hit <= 18),
    `${wand.hits.length} hits, range ${Math.min(...wand.hits, 99)}..${Math.max(...wand.hits, 0)} (expected 7..18)`,
  );
  const wandMissiles = sorcerer
    .messagesSince(wandMark)
    .filter(isType("distance-missile"));
  check(
    "wand-energy-missile",
    wandMissiles.length > 0 && wandMissiles.every((m) => m.missileId === 5),
    `missile ids ${[...new Set(wandMissiles.map((m) => m.missileId))].join(",")} (energy = 5)`,
  );
  const huskyDamageLines = sorcerer
    .messagesSince(wandMark)
    .filter(isType("combat-log"))
    .filter((m) => /^Husky: \d+ /.test(m.text));
  check(
    "wand-damage-type",
    huskyDamageLines.length > 0 &&
      huskyDamageLines.every((m) => / energy\.$/.test(m.text)),
    `${huskyDamageLines.length} wand hits, all energy: ${huskyDamageLines.every((m) => / energy\.$/.test(m.text))}`,
  );
  const manaDip = sorcerer
    .messagesSince(wandMark)
    .filter(isType("progression-updated"))
    .some((m) => m.progression.mana < m.progression.maxMana);
  check(
    "wand-mana-cost",
    manaDip,
    manaDip ? "mana dipped below max while shooting" : "mana never spent",
  );
  sorcerer.client.terminate();
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
