import { Client } from "pg";
import type {
  EquipmentSlot,
  InventoryItem,
  ServerMessage,
} from "@tibia/protocol";
import { ParityRig } from "../ParityRig";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: item rarity end to end over the real wire — dev-conjured graded
 * items (`/rare`) for every affix, equipping them, and verifying each stat
 * lands where combat and the panels read it: progression max HP/mana, attack
 * speed, skills, magic level, the Character Details combat block (crit,
 * leech, resistances), the cyclopedia attack/defense values, the crit burst
 * effect in live combat, and finally the drop path itself with forced
 * legendary chances. Run with: yarn playtest:rarity
 */

// Fresh dev account per run: accounts cap at 5 characters.
const TOKEN = `dev-rarity-${Math.random().toString(36).slice(2, 8)}`;
/** Probed non-PZ ground near the Thais spawn (same tile weaponParity uses). */
const SPOT = { x: 32_369, y: 32_260, z: 7 };

const LEATHER_ARMOR = 3_361;
const LEATHER_HELMET = 3_355;
const SWORD = 3_264;
const KNIGHT_ATTACK_SPEED_MS = 2_000;
const CRITICAL_DAMAGE_EFFECT_ID = 173;

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

/** Polls until `test` holds, so tick-cadence progression pushes can land. */
async function eventually(
  test: () => boolean,
  timeoutMs = 4_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (test()) return true;
    if (Date.now() >= deadline) return test();
    await sleep(120);
  }
}

/** Every carried (non-equipped) item across the backpack and open bags. */
function carriedItems(rig: ParityRig): InventoryItem[] {
  const inventory = rig.inventory;
  return [
    ...inventory.items.map((entry) => entry.item),
    ...(inventory.containers ?? []).flatMap((container) =>
      container.items.map((entry) => entry.item),
    ),
  ];
}

const seenRareIds = new Set<string>();

/**
 * Discards every carried leather armor by throwing them over a ring of
 * nearby tiles — a single tile's item cap would fill long before the
 * scenario's ~17 conjured armors run out.
 */
const DROP_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2],
];
let dropCursor = 0;
async function discardRareArmors(
  rig: ParityRig,
  typeIds: ReadonlyArray<number> = [LEATHER_ARMOR, LEATHER_HELMET],
): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const target = carriedItems(rig).find((item) =>
      typeIds.includes(item.typeId),
    );
    if (!target) return;
    const offset = DROP_OFFSETS[dropCursor % DROP_OFFSETS.length] ?? [0, 0];
    dropCursor += 1;
    const base = rig.position;
    const since = rig.client.mark();
    rig.client.send({
      type: "drop-item",
      itemId: target.id,
      revision: target.revision,
      position: { x: base.x + offset[0], y: base.y + offset[1], z: base.z },
    });
    const outcome = await Promise.race([
      rig.client
        .waitFor(isType("inventory-updated"), "drop result", {
          since,
          timeoutMs: 3_000,
        })
        .then(() => "dropped" as const),
      rig.client
        .waitFor(isType("error"), "drop error", { since, timeoutMs: 3_000 })
        .then(() => "rejected" as const),
    ]).catch(() => "rejected" as const);
    // Stay under the per-session intent rate cap: pace successes, back off
    // harder on rejections.
    await sleep(outcome === "rejected" ? 700 : 250);
  }
  if (carriedItems(rig).some((item) => typeIds.includes(item.typeId))) {
    const codes = rig.client.messages
      .filter(isType("error"))
      .slice(-6)
      .map((m) => m.code);
    throw new Error(
      `could not discard the conjured gear (recent errors: ${codes.join(",")})`,
    );
  }
}

/** GM command with the busy-retry dance; returns the reply text verbatim. */
async function gmText(rig: ParityRig, command: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const since = rig.client.mark();
    rig.client.say(command);
    const outcome = await Promise.race([
      rig.client.waitFor(isType("gm-response"), `gm-response for ${command}`, {
        since,
      }),
      rig.client
        .waitFor(isType("error"), `busy for ${command}`, { since })
        .then(() => "busy" as const),
    ]);
    if (outcome !== "busy") return outcome.text;
    await sleep(400);
  }
  throw new Error(`${command} kept failing while items persisted`);
}

/**
 * Conjures one graded item via /rare and returns the new inventory row.
 * Retries while a trailing unequip persist keeps the conjure gate busy
 * (the same dance ParityRig.give does for /i).
 */
async function conjureRare(
  rig: ParityRig,
  command: string,
): Promise<InventoryItem> {
  // Whatever graded gear is already carried (e.g. auto-looted drops) must
  // not be mistaken for the conjured item.
  for (const item of carriedItems(rig)) {
    if (item.tooltip.rarity) seenRareIds.add(item.id);
  }
  let reply: string | null = null;
  for (let attempt = 0; attempt < 10 && reply === null; attempt++) {
    const since = rig.client.mark();
    rig.client.say(command);
    const outcome = await Promise.race([
      rig.client.waitFor(isType("gm-response"), `gm-response for ${command}`, {
        since,
      }),
      rig.client
        .waitFor(isType("error"), `busy for ${command}`, { since })
        .then(() => "busy" as const),
    ]);
    if (outcome === "busy") {
      await sleep(400);
      continue;
    }
    reply = outcome.text;
  }
  if (reply === null) {
    throw new Error(`${command} kept failing while items persisted`);
  }
  if (!reply.startsWith("Created")) {
    throw new Error(`${command} failed: ${reply}`);
  }
  let found: InventoryItem | null = null;
  await eventually(() => {
    found =
      carriedItems(rig).find(
        (item) => item.tooltip.rarity && !seenRareIds.has(item.id),
      ) ?? null;
    return found !== null;
  });
  if (!found) throw new Error(`no graded item appeared for: ${command}`);
  seenRareIds.add((found as InventoryItem).id);
  return found;
}

async function equipById(
  rig: ParityRig,
  item: InventoryItem,
  slot: EquipmentSlot,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    // Re-read the row each try: a rejected attempt may follow a revision bump.
    const current =
      carriedItems(rig).find((candidate) => candidate.id === item.id) ?? item;
    const since = rig.client.mark();
    rig.client.send({
      type: "equip-item",
      itemId: current.id,
      revision: current.revision,
      slot,
    });
    const outcome = await Promise.race([
      rig.client
        .waitFor(
          (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
            m.type === "inventory-updated" &&
            m.inventory.equipment[slot]?.id === item.id,
          `equip graded item into ${slot}`,
          { since, timeoutMs: 4_000 },
        )
        .then(() => "equipped" as const),
      rig.client
        .waitFor(isType("error"), "equip rejection", {
          since,
          timeoutMs: 4_000,
        })
        .then(() => "rejected" as const),
    ]).catch(() => "rejected" as const);
    if (outcome === "equipped") return;
    await sleep(500);
  }
  throw new Error(`equip of graded item into ${slot} kept failing`);
}

async function unequipSlot(rig: ParityRig, slot: EquipmentSlot): Promise<void> {
  const occupied = rig.equippedItem(slot);
  if (!occupied) return;
  const since = rig.client.mark();
  rig.client.send({
    type: "unequip-item",
    itemId: occupied.id,
    revision: occupied.revision,
    slot,
  });
  await rig.client.waitFor(
    (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
      m.type === "inventory-updated" &&
      m.inventory.equipment[slot] === undefined,
    `unequip ${slot}`,
    { since },
  );
}

async function combatView(rig: ParityRig) {
  // The cyclopedia enforces a per-session request cooldown; back off and
  // retry instead of racing it.
  for (let attempt = 0; ; attempt++) {
    const since = rig.client.mark();
    rig.client.send({ type: "cyclopedia-character-get", view: "combat" });
    const outcome = await Promise.race([
      rig.client.waitFor(
        isType("cyclopedia-combat-state"),
        "cyclopedia combat state",
        { since },
      ),
      rig.client
        .waitFor(isType("cyclopedia-action-failed"), "cyclopedia rejection", {
          since,
        })
        .then(() => "rejected" as const),
    ]);
    if (outcome !== "rejected") return outcome;
    if (attempt >= 8) throw new Error("cyclopedia combat view kept failing");
    await sleep(700);
  }
}

/** Attacks the creature until it dies (bounded), then clears the target. */
async function killCreature(rig: ParityRig, creatureId: string): Promise<void> {
  await rig.attackTarget(creatureId);
  for (let round = 0; round < 40 && rig.creatureAlive(creatureId); round++) {
    await sleep(700);
  }
  await rig.cancelAttack();
  if (rig.creatureAlive(creatureId)) {
    throw new Error("target survived the bounded kill loop");
  }
}

/**
 * The playtest world persists between runs, so discarded scenario armor
 * accumulates on the drop tiles until every throw is refused. Clearing those
 * ground rows before boot keeps re-runs deterministic; the database may not
 * exist yet on a first run.
 */
async function wipeLeftoverScenarioGear(): Promise<void> {
  const adminUrl =
    process.env.PLAYTEST_ADMIN_URL ??
    "postgres://tibia:tibia_dev_only@localhost:5432/postgres";
  const database = process.env.PLAYTEST_DATABASE ?? "playtest";
  try {
    const url = new URL(adminUrl);
    url.pathname = `/${database}`;
    const client = new Client({ connectionString: url.toString() });
    await client.connect();
    // Every unseeded ground item near the test spot plus its contents:
    // discarded armors AND the materialized corpses/loot of earlier kills.
    // Seeded map furniture (seed_key) stays untouched.
    await client.query(
      `WITH RECURSIVE doomed AS (
         SELECT id FROM items
          WHERE location_type = 'world' AND seed_key IS NULL
            AND world_z = $3
            AND world_x BETWEEN $1 - 8 AND $1 + 8
            AND world_y BETWEEN $2 - 8 AND $2 + 8
         UNION
         SELECT i.id FROM items i JOIN doomed d ON i.container_id = d.id
       )
       DELETE FROM items WHERE id IN (SELECT id FROM doomed)`,
      [SPOT.x, SPOT.y, SPOT.z],
    );
    await client.end();
  } catch {
    // First run: nothing to clean.
  }
}

const externalUrl = process.env.PLAYTEST_SERVER_URL;
if (!externalUrl) await wipeLeftoverScenarioGear();
const server = externalUrl
  ? null
  : await startPlaytestServer({
      log: false,
      // Every eligible drop rolls legendary, and the boosted loot rate turns
      // the minotaur's 5% sword into a guaranteed table hit.
      rarityChances: { uncommon: 0, rare: 0, epic: 0, legendary: 100 },
      lootRate: 50,
    });
const url = externalUrl ?? server!.url;
let crashed = false;

const randomName = (prefix: string) =>
  `${prefix} ${Array.from({ length: 8 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26)),
  ).join("")}`;

try {
  console.log("▶ setup (knight, level 100, sword 60)");
  const characterName = randomName("Rarityprobe");
  const rig = await ParityRig.create(url, TOKEN, characterName, "Knight");
  await rig.goto(SPOT.x, SPOT.y, SPOT.z);
  await rig.setupStats({ level: 100, skills: { sword: 60 } });

  console.log("▶ phase: /rare rolls the configured affix count per grade");
  for (const [grade, expected] of [
    ["uncommon", 1],
    ["rare", 2],
    ["epic", 3],
    ["legendary", 4],
  ] as const) {
    const item = await conjureRare(rig, `/rare ${grade} ${LEATHER_ARMOR}`);
    const rolled = item.tooltip.affixes.filter(
      (affix) => affix.kind === "rolled",
    );
    check(
      `${grade}-tooltip-grade`,
      item.tooltip.rarity === grade,
      `tooltip.rarity=${String(item.tooltip.rarity)}`,
    );
    check(
      `${grade}-affix-count`,
      rolled.length === expected,
      `${rolled.length} rolled lines (want ${expected}): ${rolled
        .map((affix) => affix.text)
        .join(" | ")}`,
    );
  }

  // Clear the grade-phase armors so the 20-slot backpack never overflows.
  await discardRareArmors(rig);

  console.log("▶ phase: every affix reaches its stat surface when equipped");
  const nakedProgression = rig.progression;
  const nakedCombatView = await combatView(rig);
  const baseline = {
    maxHealth: nakedProgression.maxHealth,
    maxMana: nakedProgression.maxMana,
    attackValue: nakedCombatView.attackValue,
    defenseValue: nakedCombatView.defenseValue,
  };

  interface AffixCase {
    name: string;
    spec: string;
    verify: () => Promise<{ ok: boolean; detail: string }>;
  }
  const cases: AffixCase[] = [
    {
      name: "affix-max-health",
      spec: "maxHealth=40",
      verify: async () => {
        const ok = await eventually(
          () =>
            rig.progression.maxHealth === baseline.maxHealth + 40 &&
            rig.progression.equipmentBonuses.maxHealth === 40,
        );
        return {
          ok,
          detail: `maxHealth ${rig.progression.maxHealth} (base ${baseline.maxHealth}), bonus ${rig.progression.equipmentBonuses.maxHealth}`,
        };
      },
    },
    {
      name: "affix-max-mana",
      spec: "maxMana=50",
      verify: async () => {
        const ok = await eventually(
          () =>
            rig.progression.maxMana === baseline.maxMana + 50 &&
            rig.progression.equipmentBonuses.maxMana === 50,
        );
        return {
          ok,
          detail: `maxMana ${rig.progression.maxMana} (base ${baseline.maxMana}), bonus ${rig.progression.equipmentBonuses.maxMana}`,
        };
      },
    },
    {
      name: "affix-attack-speed",
      spec: "attackSpeed=10",
      verify: async () => {
        const wanted = Math.round(KNIGHT_ATTACK_SPEED_MS * 0.9);
        const ok = await eventually(
          () =>
            rig.progression.attackSpeedMs === wanted &&
            rig.progression.equipmentBonuses.attackSpeedMs ===
              wanted - KNIGHT_ATTACK_SPEED_MS,
        );
        return {
          ok,
          detail: `attackSpeedMs ${rig.progression.attackSpeedMs} (want ${wanted}), bonus ${rig.progression.equipmentBonuses.attackSpeedMs}`,
        };
      },
    },
    {
      name: "affix-attack",
      spec: "attack=5",
      verify: async () => {
        const view = await combatView(rig);
        const ok = view.attackValue === baseline.attackValue + 5;
        return {
          ok,
          detail: `attackValue ${view.attackValue} (base ${baseline.attackValue})`,
        };
      },
    },
    {
      name: "affix-defense",
      spec: "defense=5",
      verify: async () => {
        const view = await combatView(rig);
        const ok = view.defenseValue === baseline.defenseValue + 5;
        return {
          ok,
          detail: `defenseValue ${view.defenseValue} (base ${baseline.defenseValue})`,
        };
      },
    },
    {
      name: "affix-life-leech",
      spec: "lifeLeech=3",
      verify: async () => {
        const ok = await eventually(
          () => rig.progression.combat?.lifeLeechPercent === 3,
        );
        return {
          ok,
          detail: `combat.lifeLeechPercent ${String(rig.progression.combat?.lifeLeechPercent)}`,
        };
      },
    },
    {
      name: "affix-mana-leech",
      spec: "manaLeech=2",
      verify: async () => {
        const ok = await eventually(
          () => rig.progression.combat?.manaLeechPercent === 2,
        );
        return {
          ok,
          detail: `combat.manaLeechPercent ${String(rig.progression.combat?.manaLeechPercent)}`,
        };
      },
    },
    {
      name: "affix-crit-chance",
      spec: "critChance=15",
      verify: async () => {
        const ok = await eventually(
          () => rig.progression.combat?.criticalChancePercent === 15,
        );
        return {
          ok,
          detail: `combat.criticalChancePercent ${String(rig.progression.combat?.criticalChancePercent)}`,
        };
      },
    },
    {
      name: "affix-crit-damage",
      spec: "critDamage=20",
      verify: async () => {
        // Base critical damage is the universal +50%.
        const ok = await eventually(
          () => rig.progression.combat?.criticalDamagePercent === 70,
        );
        return {
          ok,
          detail: `combat.criticalDamagePercent ${String(rig.progression.combat?.criticalDamagePercent)} (want 70)`,
        };
      },
    },
    {
      name: "affix-skill",
      spec: "skill=sword:3",
      verify: async () => {
        const ok = await eventually(
          () =>
            rig.progression.skills.find((entry) => entry.skill === "sword")
              ?.equipmentBonus === 3,
        );
        const sword = rig.progression.skills.find(
          (entry) => entry.skill === "sword",
        );
        return {
          ok,
          detail: `sword equipmentBonus ${String(sword?.equipmentBonus)}, boosted ${String(sword?.boostedLevel)}`,
        };
      },
    },
    {
      name: "affix-magic-level",
      spec: "magicLevel=2",
      verify: async () => {
        const ok = await eventually(
          () => rig.progression.equipmentBonuses.magicLevel === 2,
        );
        return {
          ok,
          detail: `equipmentBonuses.magicLevel ${rig.progression.equipmentBonuses.magicLevel}`,
        };
      },
    },
    {
      name: "affix-resistance",
      spec: "resistance=fire:6",
      verify: async () => {
        const ok = await eventually(() =>
          (rig.progression.combat?.resistances ?? []).some(
            (entry) => entry.element === "fire" && entry.percent === 6,
          ),
        );
        return {
          ok,
          detail: `resistances ${JSON.stringify(
            rig.progression.combat?.resistances ?? [],
          )}`,
        };
      },
    },
  ];

  for (const affixCase of cases) {
    const item = await conjureRare(
      rig,
      `/rare epic ${LEATHER_ARMOR} ${affixCase.spec}`,
    );
    await equipById(rig, item, "armor");
    const outcome = await affixCase.verify();
    check(affixCase.name, outcome.ok, outcome.detail);
    await unequipSlot(rig, "armor");
    await discardRareArmors(rig);
  }

  console.log("▶ phase: bonuses revert on unequip");
  const reverted = await eventually(
    () =>
      rig.progression.maxHealth === baseline.maxHealth &&
      rig.progression.equipmentBonuses.maxHealth === 0 &&
      rig.progression.attackSpeedMs === KNIGHT_ATTACK_SPEED_MS &&
      (rig.progression.combat?.criticalChancePercent ?? 0) === 0,
  );
  check(
    "unequip-reverts-bonuses",
    reverted,
    `maxHealth ${rig.progression.maxHealth}, attackSpeedMs ${rig.progression.attackSpeedMs}`,
  );

  console.log("▶ phase: edge cases — caps, stacking, clamp, refusals");
  // (a) a single 80% attack-speed roll is floored at half the vocation base.
  const capArmor = await conjureRare(
    rig,
    `/rare epic ${LEATHER_ARMOR} attackSpeed=80`,
  );
  await equipById(rig, capArmor, "armor");
  const capOk = await eventually(
    () => rig.progression.attackSpeedMs === KNIGHT_ATTACK_SPEED_MS / 2,
  );
  check(
    "edge-attack-speed-cap",
    capOk,
    `attackSpeedMs ${rig.progression.attackSpeedMs} (want ${KNIGHT_ATTACK_SPEED_MS / 2} — 50% floor from an 80% roll)`,
  );
  await unequipSlot(rig, "armor");
  await discardRareArmors(rig);

  // (b) leech totals cap at 100%.
  const leechArmor = await conjureRare(
    rig,
    `/rare epic ${LEATHER_ARMOR} lifeLeech=150`,
  );
  await equipById(rig, leechArmor, "armor");
  const leechCapOk = await eventually(
    () => rig.progression.combat?.lifeLeechPercent === 100,
  );
  check(
    "edge-leech-cap",
    leechCapOk,
    `combat.lifeLeechPercent ${String(rig.progression.combat?.lifeLeechPercent)} (want 100 from a 150 roll)`,
  );
  await unequipSlot(rig, "armor");
  await discardRareArmors(rig);

  // (c) affixes stack across slots.
  const stackArmor = await conjureRare(
    rig,
    `/rare epic ${LEATHER_ARMOR} maxHealth=40`,
  );
  await equipById(rig, stackArmor, "armor");
  const stackHelmet = await conjureRare(
    rig,
    `/rare epic ${LEATHER_HELMET} maxHealth=25`,
  );
  await equipById(rig, stackHelmet, "helmet");
  const stackedOk = await eventually(
    () =>
      rig.progression.equipmentBonuses.maxHealth === 65 &&
      rig.progression.maxHealth === baseline.maxHealth + 65,
  );
  check(
    "edge-two-slot-stacking",
    stackedOk,
    `maxHealth ${rig.progression.maxHealth} (base ${baseline.maxHealth}), bonus ${rig.progression.equipmentBonuses.maxHealth} (want 65)`,
  );

  // (d) unequipping at full health clamps back to the unbuffed maximum.
  await gmText(rig, "/heal");
  await eventually(
    () => rig.progression.health === baseline.maxHealth + 65,
  );
  await unequipSlot(rig, "armor");
  await unequipSlot(rig, "helmet");
  const clampedOk = await eventually(
    () =>
      rig.progression.maxHealth === baseline.maxHealth &&
      rig.progression.health === baseline.maxHealth,
  );
  check(
    "edge-unequip-clamps-health",
    clampedOk,
    `health ${rig.progression.health}/${rig.progression.maxHealth} (want ${baseline.maxHealth}/${baseline.maxHealth})`,
  );
  await discardRareArmors(rig);

  // (e) the dev command refuses ineligible items and malformed specs, so a
  // graded stackable can never sneak into the world through it.
  const coinReply = await gmText(rig, "/rare epic 3031");
  check(
    "edge-refuses-ineligible",
    coinReply.includes("cannot carry a rarity grade"),
    `reply: ${coinReply}`,
  );
  const duplicateReply = await gmText(
    rig,
    `/rare epic ${LEATHER_ARMOR} attack=1,attack=2`,
  );
  check(
    "edge-refuses-duplicate-affix",
    duplicateReply.includes("Duplicate affix"),
    `reply: ${duplicateReply}`,
  );

  console.log("▶ phase: crits fire and show their burst in live combat");
  // The starter weapon must be displaced while the last armor unequip's
  // trailing persist may still be settling; retry like the conjure path.
  for (let attempt = 0; ; attempt++) {
    await sleep(600);
    try {
      await rig.giveAndEquip(SWORD, "weapon");
      break;
    } catch (cause) {
      const errors = rig.client.messages
        .filter(isType("error"))
        .slice(-5)
        .map((m) => m.code);
      console.log(`  giveAndEquip retry ${attempt}: recent errors ${errors.join(",")}`);
      if (attempt >= 3) throw cause;
    }
  }
  const critArmor = await conjureRare(
    rig,
    `/rare epic ${LEATHER_ARMOR} critChance=100,critDamage=50`,
  );
  await equipById(rig, critArmor, "armor");
  await eventually(
    () => rig.progression.combat?.criticalChancePercent === 100,
  );
  const critMark = rig.client.mark();
  const rotworm = await rig.spawnMonster("rotworm", "Rotworm");
  await killCreature(rig, rotworm.id);
  const burstSeen = rig.client.messages
    .slice(critMark)
    .some(
      (m) =>
        m.type === "magic-effect" &&
        m.effectId === CRITICAL_DAMAGE_EFFECT_ID,
    );
  const landedHit = rig.client.messages
    .slice(critMark)
    .some(
      (m) => m.type === "combat-log" && /^Rotworm: \d+ /.test(m.text),
    );
  check(
    "crit-burst-effect",
    burstSeen && landedHit,
    `damage landed: ${landedHit}, effect ${CRITICAL_DAMAGE_EFFECT_ID} seen: ${burstSeen}`,
  );
  await unequipSlot(rig, "armor");
  await discardRareArmors(rig);

  console.log("▶ phase: forced-legendary drops come out of real kills");
  // Auto-loot ships disabled; the sweep is what carries the kill's loot into
  // the inventory this phase scans.
  rig.client.send({
    type: "update-loot-filter",
    filter: { enabled: true, ignoredItemTypeIds: [] },
  });
  await sleep(300);
  let drop: InventoryItem | null = null;
  for (let kill = 0; kill < 12 && !drop; kill++) {
    const minotaur = await rig.spawnMonster("minotaur", "Minotaur");
    await killCreature(rig, minotaur.id);
    await eventually(() => {
      drop =
        carriedItems(rig).find(
          (item) => item.tooltip.rarity && !seenRareIds.has(item.id),
        ) ?? null;
      return drop !== null;
    }, 2_000);
  }
  if (drop) seenRareIds.add((drop as InventoryItem).id);
  const dropItem = drop as InventoryItem | null;
  const droppedRolled =
    dropItem?.tooltip.affixes.filter((affix) => affix.kind === "rolled") ?? [];
  check(
    "drop-rolls-legendary",
    dropItem?.tooltip.rarity === "legendary" && droppedRolled.length === 4,
    dropItem
      ? `${String(dropItem.name)}: rarity ${String(dropItem.tooltip.rarity)}, ${droppedRolled.length} affixes: ${droppedRolled
          .map((affix) => affix.text)
          .join(" | ")}`
      : "no graded drop after 12 kills",
  );

  console.log("▶ phase: affix max health survives a relog at full health");
  const relogArmor = await conjureRare(
    rig,
    `/rare epic ${LEATHER_ARMOR} maxHealth=40`,
  );
  await equipById(rig, relogArmor, "armor");
  // The equipment sync runs on the next progression tick; healing before the
  // new maximum lands would top up against the stale one.
  await eventually(
    () => rig.progression.maxHealth === baseline.maxHealth + 40,
  );
  await gmText(rig, "/heal");
  await eventually(
    () => rig.progression.health === baseline.maxHealth + 40,
  );
  rig.client.terminate();
  await sleep(1_000);
  const rig2 = await ParityRig.create(url, TOKEN, characterName, "Knight");
  const relogOk = await eventually(
    () =>
      rig2.progression.maxHealth === baseline.maxHealth + 40 &&
      rig2.progression.health === baseline.maxHealth + 40 &&
      rig2.progression.equipmentBonuses.maxHealth === 40,
    8_000,
  );
  check(
    "edge-relog-keeps-affix-health",
    relogOk,
    `after relog: health ${rig2.progression.health}/${rig2.progression.maxHealth} (want ${baseline.maxHealth + 40} both), bonus ${rig2.progression.equipmentBonuses.maxHealth}`,
  );

  rig2.client.terminate();
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
