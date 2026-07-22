import type {
  CombatTarget,
  Position,
  ServerMessage,
  StarterVocation,
} from "@tibia/protocol";
import { STARTER_VOCATIONS } from "@tibia/protocol";
import { areaPositions } from "../../combat/areaPositions";
import { evaluateSpellExpression } from "../../combat/evaluateSpellExpression";
import { loadCanarySpellCatalog } from "../../combat/loadCanarySpellCatalog";
import type { SpellDefinition } from "../../combat/Spell";
import { ParityRig } from "../ParityRig";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: cast every supported Canary spell (including runes) over the real
 * wire protocol and verify the observable outcome — typed rejections never
 * fire on a legal cast, cooldowns start, mana/soul are spent, damage and
 * healing numbers stay inside the Canary formula bounds, the catalog magic
 * effect and missile appear on screen, conditions land, and conjured items
 * materialize. Damage spells are verified against a second player standing in
 * the spell's area (PvP halves damage deterministically; a naked victim has
 * no absorbs), so every number is checkable.
 * Run with: yarn playtest:spells
 */

// Fresh dev accounts per run: accounts cap at 5 characters.
const TOKEN_PREFIX = `dev-spell-parity-${Math.random().toString(36).slice(2, 8)}`;
const BASE_SPOT = { x: 32_369, y: 32_260, z: 7 };
/** Probed street tiles around Thais where combat is allowed (non-PZ). */
const STATION_SPOTS = [
  { x: 32_309, y: 32_260 },
  { x: 32_339, y: 32_260 },
  { x: 32_369, y: 32_260 },
  { x: 32_423, y: 32_260 },
  { x: 32_369, y: 32_272 },
] as const;
const VICTIM_LEVEL = 800;
const CASTER_LEVEL = 300;
const WEAPON_BY_VOCATION: Partial<
  Record<StarterVocation, { typeId: number; attack: number; skill: string }>
> = {
  Knight: { typeId: 3_264, attack: 14, skill: "sword" },
  Monk: { typeId: 3_264, attack: 14, skill: "sword" },
  Paladin: { typeId: 3_277, attack: 25, skill: "distance" },
  Sorcerer: { typeId: 3_264, attack: 14, skill: "sword" },
  Druid: { typeId: 3_264, attack: 14, skill: "sword" },
};
const BLANK_RUNE_TYPE_ID = 3_147;
/** Fist defense (7) fully rolled plus rounding slack on a naked victim. */
const PHYSICAL_DEFENSE_SLACK = 10;
/** Conditions the server projects into the caster's own fight-state. */
const FIGHT_STATE_CONDITIONS = new Set([
  "haste",
  "paralyze",
  "magic-shield",
  "invisible",
  "regeneration",
  "fire",
  "poison",
  "energy",
  "curse",
  "bleed",
  "drown",
  "freeze",
  "dazzle",
]);

interface SpellResult {
  spellId: string;
  vocation: string;
  status: "pass" | "fail" | "skip";
  detail: string;
}

const randomName = (prefix: string) =>
  `${prefix} ${Array.from({ length: 8 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26)),
  ).join("")}`;

const isType = <T extends ServerMessage["type"]>(type: T) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: T }> =>
    m.type === type;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const groupsOf = (spell: SpellDefinition): string[] => [
  `spell:${spell.id}`,
  ...spell.groups.map((group) => `group:${group}`),
];

function formulaBounds(
  spell: SpellDefinition,
  variables: { level: number; magicLevel: number; skill: number; attack: number },
): { minimum: number; maximum: number } {
  const minimum = Math.max(
    0,
    Math.floor(Math.abs(evaluateSpellExpression(spell.formula.minimum, variables))),
  );
  const maximum = Math.max(
    minimum,
    Math.floor(Math.abs(evaluateSpellExpression(spell.formula.maximum, variables))),
  );
  return { minimum, maximum };
}

function casterVariables(
  caster: ParityRig,
  spell: SpellDefinition,
  vocation: StarterVocation,
): { level: number; magicLevel: number; skill: number; attack: number } {
  const progression = caster.progression;
  const weapon = WEAPON_BY_VOCATION[vocation];
  const hasWeapon = weapon && caster.equippedItem("weapon")?.typeId === weapon.typeId;
  const skillName = hasWeapon ? weapon.skill : "fist";
  const skill =
    progression.skills.find((entry) => entry.skill === skillName)?.level ?? 10;
  return {
    level: progression.level,
    magicLevel: progression.magicLevel,
    skill,
    attack: hasWeapon ? weapon.attack : 7,
  };
}

class SpellStation {
  /** Reachable tile adjacent to the caster where the victim parks. */
  victimSpot: Position;

  constructor(
    readonly vocation: StarterVocation,
    readonly caster: ParityRig,
    readonly victim: ParityRig,
    readonly spot: Position,
  ) {
    this.victimSpot = { x: spot.x + 1, y: spot.y, z: spot.z };
  }
}

async function setupStation(
  url: string,
  vocation: StarterVocation,
  index: number,
  spells: ReadonlyArray<SpellDefinition>,
): Promise<SpellStation> {
  const caster = await ParityRig.create(
    url,
    `${TOKEN_PREFIX}-caster-${index}`,
    randomName("Cast"),
    vocation,
  );
  const victim = await ParityRig.create(
    url,
    `${TOKEN_PREFIX}-victim-${index}`,
    randomName("Vict"),
    "Knight",
  );
  const stationSpot = STATION_SPOTS[index % STATION_SPOTS.length] ?? BASE_SPOT;
  const spot = await caster.goto(stationSpot.x, stationSpot.y, BASE_SPOT.z);
  const station = new SpellStation(vocation, caster, victim, spot);
  const magicTarget = Math.min(
    30,
    Math.max(5, ...spells.map((spell) => spell.requiredMagicLevel + 2)),
  );
  const weapon = WEAPON_BY_VOCATION[vocation];
  const needsWeapon = spells.some(
    (spell) => spell.needWeapon || spell.formula.kind === "skill",
  );
  await caster.setupStats({
    level: CASTER_LEVEL,
    magicLevel: magicTarget,
    skills: needsWeapon && weapon ? { [weapon.skill]: 90 } : {},
  });
  if (weapon && needsWeapon) {
    await caster.giveAndEquip(weapon.typeId, "weapon");
  }
  caster.client.send({
    type: "set-fight-mode",
    mode: { attack: "offensive", chase: false, secure: false },
  });
  await victim.setupStats({ level: VICTIM_LEVEL });
  await victim.goto(spot.x + 1, spot.y, spot.z);
  const candidates: Position[] = [
    { x: spot.x + 1, y: spot.y, z: spot.z },
    { x: spot.x - 1, y: spot.y, z: spot.z },
    { x: spot.x, y: spot.y + 1, z: spot.z },
    { x: spot.x, y: spot.y - 1, z: spot.z },
  ];
  for (const candidate of candidates) {
    if (await victim.walkTo(candidate)) {
      station.victimSpot = candidate;
      return station;
    }
  }
  throw new Error(
    `${vocation}: victim could not park on any tile adjacent to ${JSON.stringify(spot)}`,
  );
}

/** Walks the victim back to its parking tile, teleporting if stuck. */
async function parkVictim(station: SpellStation): Promise<boolean> {
  if (await station.victim.walkTo(station.victimSpot)) return true;
  await station.victim.goto(
    station.victimSpot.x,
    station.victimSpot.y,
    station.victimSpot.z,
  );
  return station.victim.walkTo(station.victimSpot);
}

/**
 * Casts with a bounded retry on spell-exhausted: the rig's cooldown view can
 * be stale (fight-state only refreshes on combat traffic), so nudge a fresh
 * fight-state via set-fight-mode and wait the cooldowns out again.
 */
async function castWithRetry(
  station: SpellStation,
  spell: SpellDefinition,
  target: CombatTarget,
  settleMs = 350,
): Promise<import("../ParityRig").CastOutcome> {
  const { caster } = station;
  let outcome = await caster.cast(spell.id, target, settleMs, groupsOf(spell));
  for (let attempt = 0; attempt < 2; attempt++) {
    if (outcome.errorCode !== "spell-exhausted") return outcome;
    const since = caster.mark();
    caster.client.send({
      type: "set-fight-mode",
      mode: { attack: "offensive", chase: false, secure: false },
    });
    await caster.client
      .waitFor(isType("fight-state"), "fight-state refresh", {
        since,
        timeoutMs: 3_000,
      })
      .catch(() => undefined);
    await caster.waitForCooldowns(groupsOf(spell));
    outcome = await caster.cast(spell.id, target, settleMs, groupsOf(spell));
  }
  return outcome;
}

/** Turns the caster toward the victim's parked tile. */
async function faceVictim(station: SpellStation): Promise<void> {
  // Stepping into the victim's occupied tile cannot move the caster, so the
  // move intent only turns them — facing is then deterministic.
  const caster = station.caster.position;
  const dx = Math.sign(station.victimSpot.x - caster.x);
  const dy = Math.sign(station.victimSpot.y - caster.y);
  const direction =
    dx === 1 ? "east" : dx === -1 ? "west" : dy === 1 ? "south" : "north";
  await station.caster.step(direction);
}

async function placeVictimForArea(
  station: SpellStation,
  spell: SpellDefinition,
): Promise<Position | null> {
  const caster = station.caster;
  const origin = caster.position;
  const towardX = Math.sign(station.victimSpot.x - origin.x);
  const towardY = Math.sign(station.victimSpot.y - origin.y);
  const facingDx = towardX !== 0 ? towardX : 0;
  const facingDy = towardX !== 0 ? 0 : towardY !== 0 ? towardY : 1;
  const center =
    spell.targetKind === "direction" || spell.targetKind === "target-or-direction"
      ? { x: origin.x + facingDx, y: origin.y + facingDy, z: origin.z }
      : origin;
  const tiles = areaPositions(origin, center, spell.area)
    .filter((tile) => !(tile.x === origin.x && tile.y === origin.y))
    .sort(
      (left, right) =>
        Math.hypot(left.x - origin.x, left.y - origin.y) -
        Math.hypot(right.x - origin.x, right.y - origin.y),
    );
  for (const tile of tiles.slice(0, 6)) {
    if (await station.victim.walkTo(tile)) return tile;
  }
  return null;
}

async function runSpellTest(
  station: SpellStation,
  spell: SpellDefinition,
): Promise<SpellResult> {
  const { caster, vocation } = station;
  const cooldownGroups = [
    `spell:${spell.id}`,
    ...spell.groups.map((group) => `group:${group}`),
  ];
  await caster.waitForCooldowns(cooldownGroups);
  await caster.heal();
  if (spell.soulCost > 0) await caster.gm("/soul");

  if (spell.conjure) return runConjureTest(station, spell);
  if (spell.origin === "rune") return runRuneTest(station, spell);

  const variables = casterVariables(caster, spell, vocation);
  const bounds = formulaBounds(spell, variables);
  const manaBefore = caster.progression.mana;

  if (spell.damageType === "healing" && bounds.maximum > 0) {
    return runHealingTest(station, spell, bounds, manaBefore);
  }
  if (bounds.maximum > 0) {
    return runDamageTest(station, spell, bounds, manaBefore);
  }
  return runSupportTest(station, spell, manaBefore);
}

async function runHealingTest(
  station: SpellStation,
  spell: SpellDefinition,
  bounds: { minimum: number; maximum: number },
  manaBefore: number,
): Promise<SpellResult> {
  const { caster, victim, vocation } = station;
  const targetsOther = spell.targetKind === "target";
  const patient = targetsOther ? victim : caster;
  const maxHealth = patient.progression.maxHealth;
  const floor = Math.max(1, maxHealth - bounds.maximum - 500);
  await patient.setHealth(floor);
  const target: CombatTarget = targetsOther
    ? { kind: "creature", creatureId: victim.playerId }
    : { kind: "self" };
  const outcome = await castWithRetry(station, spell, target);
  if (outcome.errorCode) {
    return fail(spell, vocation, `rejected with ${outcome.errorCode}`);
  }
  const patientPosition = targetsOther ? victim.position : caster.position;
  const heal = outcome.combatTexts.find(
    (text) =>
      text.damageType === "healing" &&
      text.position.x === patientPosition.x &&
      text.position.y === patientPosition.y,
  );
  if (!heal) {
    return fail(spell, vocation, "no healing combat-text at the patient tile");
  }
  if (heal.value < bounds.minimum || heal.value > bounds.maximum) {
    return fail(
      spell,
      vocation,
      `healed ${heal.value}, expected ${bounds.minimum}..${bounds.maximum}`,
    );
  }
  if (
    spell.effectId > 0 &&
    !outcome.effects.some((effect) => effect.effectId === spell.effectId)
  ) {
    return fail(spell, vocation, `magic effect ${spell.effectId} not seen`);
  }
  const manaIssue = assertManaSpent(caster, spell, manaBefore);
  if (manaIssue) return fail(spell, vocation, manaIssue);
  await patient.heal();
  return pass(spell, vocation, `healed ${heal.value} in [${bounds.minimum}..${bounds.maximum}]`);
}

async function runDamageTest(
  station: SpellStation,
  spell: SpellDefinition,
  bounds: { minimum: number; maximum: number },
  manaBefore: number,
): Promise<SpellResult> {
  const { caster, victim, vocation } = station;
  await victim.heal();
  let victimTile: Position | null = station.victimSpot;
  let target: CombatTarget;
  if (spell.targetKind === "target" || spell.targetKind === "target-or-direction") {
    if (!(await parkVictim(station))) {
      return fail(spell, vocation, "victim could not park adjacent");
    }
    target = { kind: "creature", creatureId: victim.playerId };
  } else if (spell.targetKind === "position") {
    if (!(await parkVictim(station))) {
      return fail(spell, vocation, "victim could not park adjacent");
    }
    target = { kind: "position", position: victim.position };
  } else if (spell.targetKind === "direction") {
    if (!(await parkVictim(station))) {
      return fail(spell, vocation, "victim could not park adjacent");
    }
    await faceVictim(station);
    victimTile = await placeVictimForArea(station, spell);
    if (!victimTile) {
      return fail(spell, vocation, "victim could not reach any area tile");
    }
    target = { kind: "direction" };
  } else {
    // Self-centered area (exori, mas spells, UEs).
    victimTile = await placeVictimForArea(station, spell);
    if (!victimTile) {
      return fail(spell, vocation, "victim could not reach any area tile");
    }
    target = { kind: "self" };
  }
  const outcome = await castWithRetry(station, spell, target);
  if (outcome.errorCode) {
    return fail(spell, vocation, `rejected with ${outcome.errorCode}`);
  }
  const halvedMin = Math.round(bounds.minimum / 2);
  const halvedMax = Math.round(bounds.maximum / 2);
  const low =
    spell.damageType === "physical"
      ? Math.max(0, halvedMin - PHYSICAL_DEFENSE_SLACK)
      : Math.max(0, halvedMin - 1);
  const hit = outcome.combatTexts.find(
    (text) =>
      text.damageType === spell.damageType &&
      victimTile &&
      text.position.x === victimTile.x &&
      text.position.y === victimTile.y,
  );
  if (!hit) {
    return fail(
      spell,
      vocation,
      `no ${spell.damageType} combat-text at the victim tile`,
    );
  }
  if (hit.block !== "none" && hit.block !== "shield" && hit.block !== "armor") {
    return fail(spell, vocation, `unexpected block ${hit.block}`);
  }
  if (hit.value < low || hit.value > halvedMax) {
    return fail(
      spell,
      vocation,
      `dealt ${hit.value}, expected ${low}..${halvedMax} (PvP-halved from ${bounds.minimum}..${bounds.maximum})`,
    );
  }
  if (
    spell.effectId > 0 &&
    !outcome.effects.some((effect) => effect.effectId === spell.effectId)
  ) {
    return fail(spell, vocation, `magic effect ${spell.effectId} not seen`);
  }
  if (
    spell.missileId &&
    (spell.targetKind === "target" || spell.targetKind === "target-or-direction") &&
    !outcome.missiles.some((missile) => missile.missileId === spell.missileId)
  ) {
    return fail(spell, vocation, `missile ${spell.missileId} not seen`);
  }
  const manaIssue = assertManaSpent(caster, spell, manaBefore);
  if (manaIssue) return fail(spell, vocation, manaIssue);
  await victim.heal();
  return pass(
    spell,
    vocation,
    `dealt ${hit.value} ${spell.damageType} in [${low}..${halvedMax}]`,
  );
}

async function runSupportTest(
  station: SpellStation,
  spell: SpellDefinition,
  manaBefore: number,
): Promise<SpellResult> {
  const { caster, victim, vocation } = station;
  let target: CombatTarget = { kind: "self" };
  if (spell.targetKind === "target") {
    target = { kind: "creature", creatureId: victim.playerId };
  } else if (spell.targetKind === "direction") {
    await faceVictim(station);
    target = { kind: "direction" };
  } else if (spell.targetKind === "position") {
    target = { kind: "position", position: victim.position };
  }
  const conditionMark =
    spell.condition && spell.targetKind === "self" ? caster.mark() : null;
  const outcome = await castWithRetry(station, spell, target);
  if (outcome.errorCode) {
    return fail(spell, vocation, `rejected with ${outcome.errorCode}`);
  }
  if (!outcome.cooldownStarted) {
    return fail(spell, vocation, "cooldown did not start");
  }
  if (
    spell.effectId > 0 &&
    !outcome.effects.some((effect) => effect.effectId === spell.effectId)
  ) {
    return fail(spell, vocation, `magic effect ${spell.effectId} not seen`);
  }
  if (
    conditionMark !== null &&
    spell.condition &&
    FIGHT_STATE_CONDITIONS.has(spell.condition.type)
  ) {
    const seen = await caster.client
      .waitFor(
        (m): m is Extract<ServerMessage, { type: "fight-state" }> =>
          m.type === "fight-state" &&
          m.fightState.conditions.some(
            (condition) => condition.type === spell.condition?.type,
          ),
        `condition ${spell.condition.type}`,
        { since: conditionMark, timeoutMs: 3_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (!seen) {
      return fail(
        spell,
        vocation,
        `condition ${spell.condition.type} not in fight-state`,
      );
    }
  }
  const manaIssue = assertManaSpent(caster, spell, manaBefore);
  if (manaIssue) return fail(spell, vocation, manaIssue);
  return pass(spell, vocation, "cast, cooldown and effects verified");
}

async function runConjureTest(
  station: SpellStation,
  spell: SpellDefinition,
): Promise<SpellResult> {
  const { caster, vocation } = station;
  const conjure = spell.conjure;
  if (!conjure) return fail(spell, vocation, "missing conjure data");
  // Keep the inventory lean: a run tests ~20 conjure spells and slots are
  // finite, so top the reagent up only when low and drop leftover products.
  if (
    conjure.sourceItemTypeId > 0 &&
    caster.countCarried(conjure.sourceItemTypeId) < 5
  ) {
    await caster.give(String(conjure.sourceItemTypeId), 20);
  }
  const soulBefore = caster.progression.soul;
  const countBefore = caster.countCarried(conjure.targetItemTypeId);
  let outcome = await castWithRetry(station, spell, { kind: "self" }, 600);
  if (outcome.errorCode === "combat-action-failed") {
    // Transient: a previous item persist was still draining.
    await sleep(900);
    outcome = await castWithRetry(station, spell, { kind: "self" }, 600);
  }
  if (outcome.errorCode) {
    return fail(spell, vocation, `rejected with ${outcome.errorCode}`);
  }
  const countAfter = caster.countCarried(conjure.targetItemTypeId);
  if (countAfter < countBefore + conjure.count) {
    return fail(
      spell,
      vocation,
      `conjured item ${conjure.targetItemTypeId}: count ${countBefore} -> ${countAfter}, expected +${conjure.count}`,
    );
  }
  const soulAfter = caster.progression.soul;
  if (spell.soulCost > 0 && soulAfter > soulBefore - spell.soulCost) {
    return fail(
      spell,
      vocation,
      `soul ${soulBefore} -> ${soulAfter}, expected -${spell.soulCost}`,
    );
  }
  await caster.dropCarried(conjure.targetItemTypeId);
  return pass(
    spell,
    vocation,
    `conjured ${conjure.count}x ${conjure.targetItemTypeId}, soul -${spell.soulCost}`,
  );
}

async function runRuneTest(
  station: SpellStation,
  spell: SpellDefinition,
): Promise<SpellResult> {
  const { caster, victim, vocation } = station;
  if (!spell.runeItemTypeId) {
    return fail(spell, vocation, "rune without runeItemTypeId");
  }
  await caster.give(String(spell.runeItemTypeId), 10);
  const before = caster.findCarriedItem(spell.runeItemTypeId);
  if (!before) return fail(spell, vocation, "rune not carried after /i");
  const totalBefore = caster.countCarried(spell.runeItemTypeId);
  await victim.heal();
  if (!(await parkVictim(station))) {
    return fail(spell, vocation, "victim could not park adjacent");
  }
  const variables = casterVariables(caster, spell, vocation);
  const bounds = formulaBounds(spell, variables);
  const healing = spell.damageType === "healing";
  if (healing && bounds.maximum > 0) {
    const floor = Math.max(
      1,
      victim.progression.maxHealth - bounds.maximum - 500,
    );
    await victim.setHealth(floor);
  }
  const conditionMark = spell.condition ? victim.mark() : null;
  const target: CombatTarget =
    spell.targetKind === "position"
      ? { kind: "position", position: victim.position }
      : { kind: "creature", creatureId: victim.playerId };
  const outcome = await caster.useRune(spell.runeItemTypeId, target, 500);
  if (outcome.errorCode) {
    return fail(spell, vocation, `rejected with ${outcome.errorCode}`);
  }
  const victimTile = victim.position;
  if (bounds.maximum > 0) {
    const halvedMin = Math.round(bounds.minimum / 2);
    const halvedMax = Math.round(bounds.maximum / 2);
    const low = healing
      ? bounds.minimum
      : spell.damageType === "physical"
        ? Math.max(0, halvedMin - PHYSICAL_DEFENSE_SLACK)
        : Math.max(0, halvedMin - 1);
    const high = healing ? bounds.maximum : halvedMax;
    const hit = outcome.combatTexts.find(
      (text) =>
        text.damageType === spell.damageType &&
        text.position.x === victimTile.x &&
        text.position.y === victimTile.y,
    );
    if (!hit) {
      return fail(
        spell,
        vocation,
        `no ${spell.damageType} combat-text at the victim tile`,
      );
    }
    if (hit.value < low || hit.value > high) {
      return fail(
        spell,
        vocation,
        `rune dealt ${hit.value}, expected ${low}..${high}`,
      );
    }
  }
  if (
    spell.effectId > 0 &&
    !outcome.effects.some((effect) => effect.effectId === spell.effectId)
  ) {
    return fail(spell, vocation, `magic effect ${spell.effectId} not seen`);
  }
  if (conditionMark !== null && spell.condition) {
    const seen = await victim.client
      .waitFor(
        (m): m is Extract<ServerMessage, { type: "fight-state" }> =>
          m.type === "fight-state" &&
          m.fightState.conditions.some(
            (condition) => condition.type === spell.condition?.type,
          ),
        `rune condition ${spell.condition.type}`,
        { since: conditionMark, timeoutMs: 3_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (!seen && FIGHT_STATE_CONDITIONS.has(spell.condition.type)) {
      return fail(
        spell,
        vocation,
        `rune condition ${spell.condition.type} not on the victim`,
      );
    }
  }
  const remaining = caster.countCarried(spell.runeItemTypeId);
  if (remaining !== totalBefore - 1) {
    return fail(
      spell,
      vocation,
      `rune count ${totalBefore} -> ${remaining}, expected exactly one charge spent`,
    );
  }
  await victim.heal();
  return pass(spell, vocation, "rune verified (damage/effect/charge)");
}

function assertManaSpent(
  caster: ParityRig,
  spell: SpellDefinition,
  manaBefore: number,
): string | null {
  if (spell.manaCost === 0) return null;
  const manaAfter = caster.progression.mana;
  const upper = manaBefore - spell.manaCost + 25;
  if (manaAfter > upper) {
    return `mana ${manaBefore} -> ${manaAfter}, expected roughly -${spell.manaCost}`;
  }
  return null;
}

const pass = (
  spell: SpellDefinition,
  vocation: string,
  detail: string,
): SpellResult => ({ spellId: spell.id, vocation, status: "pass", detail });
const fail = (
  spell: SpellDefinition,
  vocation: string,
  detail: string,
): SpellResult => ({ spellId: spell.id, vocation, status: "fail", detail });

async function runNegativeChecks(
  url: string,
  results: SpellResult[],
): Promise<void> {
  const probe = await ParityRig.create(
    url,
    `${TOKEN_PREFIX}-probe`,
    randomName("Probe"),
    "Knight",
  );
  const check = (id: string, ok: boolean, detail: string) =>
    results.push({
      spellId: `negative:${id}`,
      vocation: "Knight",
      status: ok ? "pass" : "fail",
      detail,
    });

  // Fresh level-2 knight: level gate.
  const spawn = probe.position;
  const low = await probe.cast("exori", { kind: "self" });
  check(
    "level-gate",
    low.errorCode === "spell-level-restricted",
    `exori at level 2 -> ${low.errorCode ?? "accepted"}`,
  );
  // Wrong vocation gate.
  const wrongVocation = await probe.cast("exura-vita", { kind: "self" });
  check(
    "vocation-gate",
    wrongVocation.errorCode === "spell-vocation-restricted",
    `exura-vita as knight -> ${wrongVocation.errorCode ?? "accepted"}`,
  );
  // Unknown spell id.
  const unknown = await probe.cast("not-a-spell", { kind: "self" });
  check(
    "unknown-spell",
    unknown.errorCode === "spell-unavailable",
    `unknown spell -> ${unknown.errorCode ?? "accepted"}`,
  );
  await probe.gm("/level 40");
  await probe.giveAndEquip(3_264, "weapon");
  // Harmful spell inside the temple protection zone.
  await probe.gm(`/goto ${spawn.x} ${spawn.y} ${spawn.z}`);
  const pz = await probe.cast("exori", { kind: "self" });
  check(
    "protection-zone",
    pz.errorCode === "spell-protection-zone",
    `exori in PZ -> ${pz.errorCode ?? "accepted"}`,
  );
  // Probed non-PZ tile south of the temple (y+4 is protected).
  await probe.goto(BASE_SPOT.x, BASE_SPOT.y + 12, BASE_SPOT.z);
  // Exhaust: the spell cooldown must reject an immediate recast.
  const first = await probe.cast("exori", { kind: "self" }, 100);
  const second = await probe.cast("exori", { kind: "self" }, 100);
  check(
    "exhaust",
    first.errorCode === null && second.errorCode === "spell-exhausted",
    `recast during cooldown -> ${second.errorCode ?? "accepted"}`,
  );
  // Mana gate: at level 40 a knight holds ~250 mana; two exori (115) drain it.
  await probe.waitForCooldowns(["spell:exori", "group:attack"]);
  await probe.cast("exori", { kind: "self" }, 100);
  await probe.waitForCooldowns(["spell:exori", "group:attack"]);
  const fourth = await probe.cast("exori", { kind: "self" }, 100);
  const manaNow = probe.progression.mana;
  check(
    "mana-gate",
    fourth.errorCode === "spell-mana-insufficient" && manaNow >= 0,
    `drained cast -> ${fourth.errorCode ?? "accepted"}, mana ${manaNow}`,
  );
  probe.client.terminate();
}

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
const results: SpellResult[] = [];
let crashed = false;

try {
  const catalog = loadCanarySpellCatalog();
  const assignments = new Map<StarterVocation, SpellDefinition[]>(
    STARTER_VOCATIONS.map((vocation) => [vocation, []]),
  );
  for (const spell of catalog) {
    const eligible = STARTER_VOCATIONS.filter((vocation) =>
      spell.vocations.includes(vocation),
    );
    if (eligible.length === 0) {
      results.push({
        spellId: spell.id,
        vocation: spell.vocations.join("/"),
        status: "skip",
        detail: "requires a promoted vocation; no promotion path exists yet",
      });
      continue;
    }
    const vocation = eligible.reduce((best, candidate) =>
      (assignments.get(candidate)?.length ?? 0) <
      (assignments.get(best)?.length ?? 0)
        ? candidate
        : best,
    );
    assignments.get(vocation)?.push(spell);
  }

  console.log(
    `Testing ${catalog.length} spells across ${STARTER_VOCATIONS.length} vocations at ${url}`,
  );
  const stationRuns = STARTER_VOCATIONS.map(async (vocation, index) => {
    const spells = assignments.get(vocation) ?? [];
    if (spells.length === 0) return;
    const station = await setupStation(url, vocation, index, spells);
    console.log(`▶ ${vocation}: ${spells.length} spells`);
    for (const spell of spells) {
      try {
        const result = await runSpellTest(station, spell);
        results.push(result);
        const tag = result.status === "pass" ? "✓" : "✗";
        console.log(`  ${tag} [${vocation}] ${spell.id}: ${result.detail}`);
      } catch (cause) {
        results.push({
          spellId: spell.id,
          vocation,
          status: "fail",
          detail: `threw: ${cause instanceof Error ? cause.message : String(cause)}`,
        });
        console.log(`  ✗ [${vocation}] ${spell.id}: threw ${String(cause)}`);
        await sleep(500);
      }
    }
    station.caster.client.terminate();
    station.victim.client.terminate();
  });
  await Promise.all(stationRuns);
  await runNegativeChecks(url, results);
} catch (cause) {
  crashed = true;
  console.error("\nSCENARIO CRASH:", cause);
} finally {
  const failures = results.filter((result) => result.status === "fail");
  const skips = results.filter((result) => result.status === "skip");
  const passes = results.filter((result) => result.status === "pass");
  console.log(
    `\n${passes.length} passed, ${failures.length} failed, ${skips.length} skipped`,
  );
  for (const skip of skips) {
    console.log(`  SKIP ${skip.spellId}: ${skip.detail}`);
  }
  for (const failure of failures) {
    console.log(`  FAIL [${failure.vocation}] ${failure.spellId}: ${failure.detail}`);
  }
  await server?.stop();
  process.exit(crashed || failures.length > 0 ? 1 : 0);
}
