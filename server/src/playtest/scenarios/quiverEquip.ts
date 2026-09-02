import type { EquipmentSlot, ServerMessage } from "@tibia/protocol";
import { exura } from "../../combat/spells/healing/exura";
import { ParityRig } from "../ParityRig";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: quivers over the real wire, checked against Canary's hand rules
 * (player.cpp CONST_SLOT_RIGHT / CONST_SLOT_LEFT, getQuiverAmmoOfType) —
 * a quiver dresses the shield hand, refuses the weapon hand, shares hands
 * with a bow but not with a two-handed melee weapon, opens as a container
 * that holds arrows, feeds the bow those arrows, survives a relog, obeys its
 * level and vocation gates, and the alicorn quiver's +1 magic level reaches
 * both the character panel and the healing formula.
 * Run with: yarn playtest:quivers
 */

// Fresh dev account per run: accounts cap at 5 characters.
const TOKEN = `dev-quiver-${Math.random().toString(36).slice(2, 8)}`;
const SPOT = { x: 32_369, y: 32_260, z: 7 };

const QUIVER = 35_562; // plain quiver, 6 slots, Paladin/None
const ALICORN_QUIVER = 39_150; // level 400 Paladin, magic level +1
const BOW = 3_350; // two-handed distance weapon, ammo arrow
const ARROW = 3_447;
const WOODEN_SHIELD = 3_412;
const HALBERD = 3_269; // two-handed melee, level 25, no vocation gate
const ARROWS_GIVEN = 50;
const HEAL_CASTS_WITH_BONUS = 30;
const HEAL_CASTS_WITHOUT_BONUS = 10;

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

/**
 * Sends one equip intent for a carried item and reports how the server
 * answered: `item-action-failed` is a rule rejection, `combat-action-failed`
 * only means a persist is still draining, so it is retried.
 */
async function tryEquip(
  rig: ParityRig,
  typeId: number,
  slot: EquipmentSlot,
): Promise<"equipped" | "rejected"> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const carried = rig.findCarriedItem(typeId);
    if (!carried) throw new Error(`${rig.name}: item ${typeId} not carried`);
    const since = rig.client.mark();
    rig.client.send({
      type: "equip-item",
      itemId: carried.id,
      revision: carried.revision,
      slot,
    });
    const outcome = await Promise.race([
      rig.client
        .waitFor(
          (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
            m.type === "inventory-updated" &&
            m.inventory.equipment[slot]?.typeId === typeId,
          `equip ${typeId} into ${slot}`,
          { since, timeoutMs: 5_000 },
        )
        .then(() => "equipped" as const),
      rig.client
        .waitFor(isType("error"), "equip error", { since, timeoutMs: 5_000 })
        .then((m) =>
          m.code === "item-action-failed"
            ? ("rejected" as const)
            : ("busy" as const),
        ),
    ]);
    if (outcome !== "busy") return outcome;
    await sleep(400);
  }
  throw new Error(`${rig.name}: equip ${typeId} into ${slot} stayed busy`);
}

async function unequip(rig: ParityRig, slot: EquipmentSlot): Promise<void> {
  const equipped = rig.equippedItem(slot);
  if (!equipped) return;
  const since = rig.client.mark();
  rig.client.send({
    type: "unequip-item",
    itemId: equipped.id,
    revision: equipped.revision,
    slot,
  });
  await rig.client.waitFor(
    (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
      m.type === "inventory-updated" && m.inventory.equipment[slot] === undefined,
    `unequip ${slot}`,
    { since },
  );
}

/** Opens the container item at the given equipment slot; returns its state. */
async function openEquippedContainer(rig: ParityRig, slot: EquipmentSlot) {
  const equipped = rig.equippedItem(slot);
  if (!equipped) throw new Error(`${rig.name}: nothing equipped in ${slot}`);
  const since = rig.client.mark();
  rig.client.send({
    type: "open-container",
    itemId: equipped.id,
    revision: equipped.revision,
  });
  const updated = await rig.client.waitFor(
    (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
      m.type === "inventory-updated" &&
      (m.inventory.containers ?? []).some(
        (container) => container.container.id === equipped.id,
      ),
    `open ${slot} container`,
    { since },
  );
  return updated.inventory.containers!.find(
    (container) => container.container.id === equipped.id,
  )!;
}

const arrowsCarried = (rig: ParityRig): number =>
  rig.inventory.carried?.find((entry) => entry.typeId === ARROW)?.count ?? 0;

const quiverContents = (rig: ParityRig) => {
  const quiver = rig.equippedItem("shield");
  return (rig.inventory.containers ?? []).find(
    (container) => container.container.id === quiver?.id,
  );
};

/** Casts exura repeatedly from a low-health floor; returns each heal amount. */
async function observeHeals(rig: ParityRig, casts: number): Promise<number[]> {
  const heals: number[] = [];
  for (let i = 0; i < casts; i++) {
    await rig.waitForCooldowns(["spell:exura", "group:healing"]);
    await rig.setHealth(Math.max(1, rig.progression.maxHealth - 1_000));
    const outcome = await rig.cast("exura", { kind: "self" });
    if (outcome.errorCode) {
      throw new Error(`${rig.name}: exura rejected with ${outcome.errorCode}`);
    }
    const position = rig.position;
    const heal = outcome.combatTexts.find(
      (text) =>
        text.damageType === "healing" &&
        text.position.x === position.x &&
        text.position.y === position.y,
    );
    if (heal) heals.push(heal.value);
  }
  return heals;
}

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let crashed = false;

try {
  console.log("▶ quiver hand rules (paladin)");
  const paladinName = randomName("Quiverarms");
  let paladin = await ParityRig.create(url, `${TOKEN}-paladin`, paladinName, "Paladin");
  await paladin.goto(SPOT.x, SPOT.y, SPOT.z);

  // Level 1: the alicorn quiver's level-400 gate must hold before anything else.
  await paladin.give(String(ALICORN_QUIVER));
  const alicornTooEarly = await tryEquip(paladin, ALICORN_QUIVER, "shield");
  check(
    "alicorn-level-gate",
    alicornTooEarly === "rejected",
    `level ${paladin.progression.level} paladin -> ${alicornTooEarly} (needs 400)`,
  );

  await paladin.setupStats({ level: 400, skills: { distance: 60 } });

  await paladin.give(String(QUIVER));
  const quiverInWeaponHand = await tryEquip(paladin, QUIVER, "weapon");
  check(
    "quiver-refuses-weapon-hand",
    quiverInWeaponHand === "rejected",
    `equip-item slot=weapon -> ${quiverInWeaponHand}`,
  );
  const quiverInShieldHand = await tryEquip(paladin, QUIVER, "shield");
  check(
    "quiver-equips-shield-hand",
    quiverInShieldHand === "equipped" &&
      paladin.equippedItem("shield")?.typeId === QUIVER,
    `equip-item slot=shield -> ${quiverInShieldHand}`,
  );

  const opened = await openEquippedContainer(paladin, "shield");
  check(
    "quiver-opens-as-container",
    opened.capacity === 6 && opened.items.length === 0,
    `capacity ${opened.capacity}, ${opened.items.length} items`,
  );

  await paladin.give(String(ARROW), ARROWS_GIVEN);
  const arrows = paladin.findCarriedItem(ARROW);
  const quiverItem = paladin.equippedItem("shield")!;
  let since = paladin.client.mark();
  paladin.client.send({
    type: "move-item",
    itemId: arrows!.id,
    revision: arrows!.revision,
    destinationContainerId: quiverItem.id,
    destinationRevision: quiverItem.revision,
    destinationSlot: 0,
  });
  await paladin.client.waitFor(
    (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
      m.type === "inventory-updated" &&
      (m.inventory.containers ?? []).some(
        (container) =>
          container.container.id === quiverItem.id &&
          container.items.some((entry) => entry.item.typeId === ARROW),
      ),
    "arrows inside quiver",
    { since },
  );
  const stored = quiverContents(paladin)?.items.find(
    (entry) => entry.item.typeId === ARROW,
  );
  check(
    "quiver-holds-arrows",
    stored?.item.count === ARROWS_GIVEN && paladin.equippedItem("ammo") === null,
    `${stored?.item.count ?? 0} arrows in quiver slot ${stored?.slot ?? "-"}, ammo slot empty`,
  );

  // Canary RETURNVALUE_ONLYAMMOINQUIVER: nothing but ammunition goes inside.
  await paladin.give(String(WOODEN_SHIELD));
  const shieldItem = paladin.findCarriedItem(WOODEN_SHIELD)!;
  const quiverNow = paladin.equippedItem("shield")!;
  since = paladin.client.mark();
  paladin.client.send({
    type: "move-item",
    itemId: shieldItem.id,
    revision: shieldItem.revision,
    destinationContainerId: quiverNow.id,
    destinationRevision: quiverNow.revision,
    destinationSlot: 1,
  });
  const shieldIntoQuiver = await Promise.race([
    paladin.client
      .waitFor(isType("error"), "move refused", { since, timeoutMs: 5_000 })
      .then((m) => m.code),
    paladin.client
      .waitFor(
        (m): m is Extract<ServerMessage, { type: "inventory-updated" }> =>
          m.type === "inventory-updated" &&
          (m.inventory.containers ?? []).some(
            (container) =>
              container.container.id === quiverNow.id &&
              container.items.some((entry) => entry.item.typeId === WOODEN_SHIELD),
          ),
        "shield inside quiver",
        { since, timeoutMs: 5_000 },
      )
      .then(() => "accepted"),
  ]);
  check(
    "quiver-refuses-non-ammunition",
    shieldIntoQuiver === "item-action-failed",
    `wooden shield into quiver -> ${shieldIntoQuiver}`,
  );

  await paladin.give(String(BOW));
  const bowBesideQuiver = await tryEquip(paladin, BOW, "weapon");
  check(
    "bow-equips-beside-quiver",
    bowBesideQuiver === "equipped" &&
      paladin.equippedItem("shield")?.typeId === QUIVER,
    `bow -> ${bowBesideQuiver}, shield hand still ${paladin.equippedItem("shield")?.typeId}`,
  );

  const shieldBesideBow = await tryEquip(paladin, WOODEN_SHIELD, "shield");
  check(
    "real-shield-refused-beside-bow",
    shieldBesideBow === "rejected" &&
      paladin.equippedItem("shield")?.typeId === QUIVER,
    `wooden shield -> ${shieldBesideBow}`,
  );

  console.log("▶ relog keeps the loadout");
  paladin.client.terminate();
  await sleep(1_500);
  paladin = await ParityRig.create(url, `${TOKEN}-paladin`, paladinName, "Paladin");
  const reloggedQuiver = await openEquippedContainer(paladin, "shield").catch(
    () => null,
  );
  const reloggedArrows = reloggedQuiver?.items.find(
    (entry) => entry.item.typeId === ARROW,
  );
  check(
    "relog-keeps-quiver-bow-arrows",
    paladin.equippedItem("shield")?.typeId === QUIVER &&
      paladin.equippedItem("weapon")?.typeId === BOW &&
      reloggedArrows?.item.count === ARROWS_GIVEN,
    `shield=${paladin.equippedItem("shield")?.typeId} weapon=${paladin.equippedItem("weapon")?.typeId} arrows=${reloggedArrows?.item.count ?? 0}`,
  );

  console.log("▶ bow draws arrows from the quiver");
  await paladin.goto(SPOT.x, SPOT.y, SPOT.z);
  paladin.client.send({
    type: "set-fight-mode",
    mode: { attack: "offensive", chase: true, secure: true },
  });
  const arrowsBefore = arrowsCarried(paladin);
  const target = await paladin.spawnMonster("rotworm", "Rotworm");
  const combatMark = paladin.mark();
  await paladin.attackTarget(target.id);
  await sleep(9_000);
  await paladin.cancelAttack();
  await paladin.gm("/despawn").catch(() => undefined);
  const combatLines = paladin
    .messagesSince(combatMark)
    .filter(isType("combat-log"))
    .map((m) => m.text);
  const hits = combatLines.filter((text) => /^Rotworm: \d+ /.test(text)).length;
  const misses = combatLines.filter((text) => text === "You missed Rotworm.").length;
  const missiles = paladin.messagesSince(combatMark).filter(isType("distance-missile"));
  const arrowsAfter = arrowsCarried(paladin);
  check(
    "bow-shoots-from-quiver",
    hits + misses > 0 && missiles.length > 0,
    `${hits} hits, ${misses} misses, ${missiles.length} missiles`,
  );
  check(
    "quiver-arrows-consumed",
    arrowsAfter < arrowsBefore,
    `${arrowsBefore} -> ${arrowsAfter} arrows carried (${hits + misses} shots)`,
  );
  await paladin.heal();

  console.log("▶ two-handed melee still needs both hands");
  await unequip(paladin, "weapon");
  await paladin.give(String(HALBERD));
  const halberdBesideQuiver = await tryEquip(paladin, HALBERD, "weapon");
  check(
    "two-handed-melee-refused-beside-quiver",
    halberdBesideQuiver === "rejected",
    `halberd with quiver in shield hand -> ${halberdBesideQuiver}`,
  );

  console.log("▶ vocation gate (knight)");
  const knight = await ParityRig.create(url, `${TOKEN}-knight`, randomName("Quiverless"), "Knight");
  await knight.give(String(QUIVER));
  const knightQuiver = await tryEquip(knight, QUIVER, "shield");
  check(
    "quiver-vocation-gate",
    knightQuiver === "rejected",
    `knight equip quiver -> ${knightQuiver}`,
  );
  knight.client.terminate();

  console.log("▶ alicorn quiver: +1 magic level");
  const baseMagicLevel = paladin.progression.magicLevel;
  since = paladin.mark();
  const alicornEquipped = await tryEquip(paladin, ALICORN_QUIVER, "shield");
  await paladin.client
    .waitFor(
      (m): m is Extract<ServerMessage, { type: "progression-updated" }> =>
        m.type === "progression-updated" &&
        m.progression.equipmentBonuses.magicLevel === 1,
      "magic level bonus in progression",
      { since, timeoutMs: 3_000 },
    )
    .catch(() => undefined);
  const withBonus = paladin.progression;
  check(
    "alicorn-equips-at-level-400",
    alicornEquipped === "equipped" &&
      paladin.equippedItem("shield")?.typeId === ALICORN_QUIVER &&
      paladin.findCarriedItem(QUIVER) !== null,
    `alicorn -> ${alicornEquipped}, plain quiver displaced to backpack: ${paladin.findCarriedItem(QUIVER) !== null}`,
  );
  check(
    "alicorn-panel-shows-plus-one-ml",
    withBonus.equipmentBonuses.magicLevel === 1 &&
      withBonus.boostedMagicLevel === baseMagicLevel + 1,
    `equipmentBonuses.magicLevel=${withBonus.equipmentBonuses.magicLevel}, boosted ${withBonus.boostedMagicLevel} vs base ${baseMagicLevel}`,
  );

  const level = paladin.progression.level;
  const bounds = (magicLevel: number) => ({
    minimum: Math.floor(exura.formula.minimum({ level, magicLevel, skill: 0, attack: 0 })),
    maximum: Math.floor(exura.formula.maximum({ level, magicLevel, skill: 0, attack: 0 })),
  });
  const base = bounds(baseMagicLevel);
  const boosted = bounds(baseMagicLevel + 1);
  const healsWithBonus = await observeHeals(paladin, HEAL_CASTS_WITH_BONUS);
  const maxWithBonus = Math.max(...healsWithBonus, 0);
  const minWithBonus = Math.min(...healsWithBonus, Number.MAX_SAFE_INTEGER);
  check(
    "alicorn-heals-use-plus-one-ml",
    healsWithBonus.length === HEAL_CASTS_WITH_BONUS &&
      minWithBonus >= boosted.minimum &&
      maxWithBonus <= boosted.maximum &&
      maxWithBonus > base.maximum,
    `${healsWithBonus.length} exura casts healed ${minWithBonus}..${maxWithBonus}; expected ${boosted.minimum}..${boosted.maximum} with +1 ml (base ${base.minimum}..${base.maximum})`,
  );

  await unequip(paladin, "shield");
  since = paladin.mark();
  await paladin.client
    .waitFor(
      (m): m is Extract<ServerMessage, { type: "progression-updated" }> =>
        m.type === "progression-updated" &&
        m.progression.equipmentBonuses.magicLevel === 0,
      "magic level bonus cleared",
      { since, timeoutMs: 3_000 },
    )
    .catch(() => undefined);
  const healsWithout = await observeHeals(paladin, HEAL_CASTS_WITHOUT_BONUS);
  const maxWithout = Math.max(...healsWithout, 0);
  const minWithout = Math.min(...healsWithout, Number.MAX_SAFE_INTEGER);
  check(
    "alicorn-bonus-gone-after-unequip",
    paladin.progression.equipmentBonuses.magicLevel === 0 &&
      paladin.progression.boostedMagicLevel === baseMagicLevel &&
      healsWithout.length === HEAL_CASTS_WITHOUT_BONUS &&
      minWithout >= base.minimum &&
      maxWithout <= base.maximum,
    `bonus ${paladin.progression.equipmentBonuses.magicLevel}, heals ${minWithout}..${maxWithout} (base ${base.minimum}..${base.maximum})`,
  );
  paladin.client.terminate();
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
