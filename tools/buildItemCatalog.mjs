import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const sourceManifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const semanticsDocument = JSON.parse(
  await readFile(join(repoRoot, "content/canary-item-semantics.json"), "utf8"),
);
const appearancesDocument = JSON.parse(
  await readFile(join(repoRoot, "client/public/assets/objects.json"), "utf8"),
);

if (sourceManifest.converters.itemCatalog !== 1) {
  throw new Error("source manifest does not declare item catalog version 1");
}
if (
  semanticsDocument.formatVersion !== sourceManifest.converters.canaryItems ||
  semanticsDocument.source?.canaryCommit !==
    sourceManifest.sources.canaryItems.commit ||
  semanticsDocument.source?.sha256 !== sourceManifest.sources.canaryItems.sha256
) {
  throw new Error("Canary item semantics do not match the pinned source manifest");
}
if (
  appearancesDocument.formatVersion !== sourceManifest.converters.assets ||
  appearancesDocument.source?.datSha256 !== sourceManifest.sources.dat.sha256 ||
  appearancesDocument.source?.sprSha256 !== sourceManifest.sources.spr.sha256
) {
  throw new Error("DAT appearances do not match the pinned source manifest");
}

const EQUIPMENT_SLOT_BY_SOURCE = {
  head: "helmet",
  necklace: "amulet",
  backpack: "backpack",
  armor: "armor",
  hand: "weapon",
  shield: "shield",
  legs: "legs",
  feet: "boots",
  ring: "ring",
  ammo: "ammo",
};

const CURRENCY_WORTH = {
  3031: 1,
  3035: 100,
  3043: 10_000,
};

function equipmentSlot(semantics) {
  if (semantics.weaponType === "shield") return "shield";
  if (semantics.weaponType === "ammunition") return "ammo";
  const mapped = EQUIPMENT_SLOT_BY_SOURCE[semantics.equipmentSlot];
  if (mapped) return mapped;
  if (semantics.weaponType) return "weapon";
  return undefined;
}

function renderFlags(flags) {
  return {
    ground: flags.ground,
    groundBorder: flags.groundBorder,
    onBottom: flags.onBottom,
    onTop: flags.onTop,
    stackable: flags.stackable,
    fluidContainer: flags.fluidContainer,
    splash: flags.splash,
    hangable: flags.hangable,
    hookSouth: flags.hookSouth,
    hookEast: flags.hookEast,
    lyingCorpse: flags.lyingCorpse,
    animateAlways: flags.animateAlways,
    topEffect: flags.topEffect,
  };
}

const items = {};
for (const appearance of appearancesDocument.objects) {
  if (appearance.category !== "item") continue;
  const spriteId = appearance.sprites[0];
  if (!Number.isInteger(spriteId) || spriteId <= 0) continue;
  const semantics = semanticsDocument.items[appearance.clientId];
  if (!semantics?.name) continue;
  const slot = equipmentSlot(semantics);
  items[appearance.clientId] = {
    id: appearance.clientId,
    clientId: appearance.clientId,
    name: semantics.name,
    ...(semantics.article ? { article: semantics.article } : {}),
    ...(semantics.plural ? { plural: semantics.plural } : {}),
    ...(semantics.description ? { description: semantics.description } : {}),
    ...(semantics.primaryType ? { primaryType: semantics.primaryType } : {}),
    spriteId,
    stackable: appearance.flags.stackable,
    maxCount: appearance.flags.stackable ? 100 : 1,
    weight: Math.max(0, semantics.weight ?? 0),
    ...(CURRENCY_WORTH[appearance.clientId]
      ? { worth: CURRENCY_WORTH[appearance.clientId] }
      : {}),
    ...(slot ? { equipmentSlot: slot } : {}),
    ...(semantics.slotType ? { slotType: semantics.slotType } : {}),
    ...(semantics.weaponType ? { weaponType: semantics.weaponType } : {}),
    ...(semantics.ammoType ? { ammoType: semantics.ammoType } : {}),
    ...(semantics.shootType ? { shootType: semantics.shootType } : {}),
    ...(semantics.attack !== undefined ? { attack: semantics.attack } : {}),
    ...(semantics.defense !== undefined ? { defense: semantics.defense } : {}),
    ...(semantics.extraDefense !== undefined
      ? { extraDefense: semantics.extraDefense }
      : {}),
    ...(semantics.armor !== undefined ? { armor: semantics.armor } : {}),
    ...(semantics.range !== undefined ? { range: semantics.range } : {}),
    ...(semantics.hitChance !== undefined
      ? { hitChance: semantics.hitChance }
      : {}),
    ...(semantics.maxHitChance !== undefined
      ? { maxHitChance: semantics.maxHitChance }
      : {}),
    ...(semantics.manaCost !== undefined ? { manaCost: semantics.manaCost } : {}),
    ...(semantics.minimumDamage !== undefined
      ? { minimumDamage: semantics.minimumDamage }
      : {}),
    ...(semantics.maximumDamage !== undefined
      ? { maximumDamage: semantics.maximumDamage }
      : {}),
    ...(semantics.wandType ? { wandType: semantics.wandType } : {}),
    ...(semantics.breakChance !== undefined
      ? { breakChance: semantics.breakChance }
      : {}),
    ...(semantics.imbuementSlots !== undefined
      ? { imbuementSlots: semantics.imbuementSlots }
      : {}),
    ...(semantics.containerSize !== undefined
      ? { containerCapacity: semantics.containerSize }
      : appearance.flags.container
        ? { containerCapacity: 0 }
        : {}),
    pickupable: semantics.pickupable ?? appearance.flags.pickupable,
    movable: semantics.movable ?? !appearance.flags.notMoveable,
    ...(semantics.decayTo !== undefined || semantics.duration !== undefined
      ? {
          decay: {
            ...(semantics.duration !== undefined
              ? { durationSeconds: semantics.duration }
              : {}),
            ...(semantics.decayTo !== undefined
              ? { targetId: semantics.decayTo }
              : {}),
          },
        }
      : {}),
    ...(semantics.transformEquipTo !== undefined
      ? { transformEquipTo: semantics.transformEquipTo }
      : {}),
    ...(semantics.transformDeEquipTo !== undefined
      ? { transformDeEquipTo: semantics.transformDeEquipTo }
      : {}),
    ...(semantics.rotateTo !== undefined ? { rotateTo: semantics.rotateTo } : {}),
    ...(semantics.type ? { kind: semantics.type } : {}),
    ...(semantics.levelDoor !== undefined
      ? { levelDoor: semantics.levelDoor }
      : {}),
    ...(semantics.field ? { field: semantics.field } : {}),
    ...(semantics.charges !== undefined ? { charges: semantics.charges } : {}),
    ...(semantics.writeable !== undefined ||
    semantics.readable !== undefined ||
    semantics.maxTextLength !== undefined
      ? {
          text: {
            readable: semantics.readable ?? true,
            writeable: semantics.writeable ?? false,
            allowDistanceRead: semantics.allowDistanceRead ?? false,
            maxLength: semantics.maxTextLength ?? 0,
          },
        }
      : {}),
    ...(semantics.requiredLevel !== undefined || semantics.vocations
      ? {
          requirements: {
            ...(semantics.requiredLevel !== undefined
              ? { level: semantics.requiredLevel }
              : {}),
            ...(semantics.vocations ? { vocations: semantics.vocations } : {}),
          },
        }
      : {}),
    ...(semantics.elementDamage
      ? { elementDamage: semantics.elementDamage }
      : {}),
    ...(semantics.absorbPercent
      ? { absorbPercent: semantics.absorbPercent }
      : {}),
    ...(semantics.skillModifiers
      ? { skillModifiers: semantics.skillModifiers }
      : {}),
    ...(semantics.magicLevelPoints !== undefined
      ? { magicLevelPoints: semantics.magicLevelPoints }
      : {}),
    ...(semantics.speed !== undefined ? { speed: semantics.speed } : {}),
    ...(semantics.criticalHitChance !== undefined
      ? { criticalHitChance: semantics.criticalHitChance }
      : {}),
    ...(semantics.criticalHitDamage !== undefined
      ? { criticalHitDamage: semantics.criticalHitDamage }
      : {}),
    ...(semantics.lifeLeechAmount !== undefined
      ? { lifeLeechAmount: semantics.lifeLeechAmount }
      : {}),
    ...(semantics.lifeLeechChance !== undefined
      ? { lifeLeechChance: semantics.lifeLeechChance }
      : {}),
    ...(semantics.manaLeechAmount !== undefined
      ? { manaLeechAmount: semantics.manaLeechAmount }
      : {}),
    ...(semantics.manaLeechChance !== undefined
      ? { manaLeechChance: semantics.manaLeechChance }
      : {}),
    light: {
      intensity: appearance.flags.lightIntensity,
      color: appearance.flags.lightColor,
    },
    elevation: appearance.flags.elevation,
    render: renderFlags(appearance.flags),
  };
}

const output = {
  formatVersion: sourceManifest.converters.itemCatalog,
  source: {
    assetEra: sourceManifest.assetEra,
    canaryCommit: sourceManifest.sources.canaryItems.commit,
    canaryItemsSha256: sourceManifest.sources.canaryItems.sha256,
    datSha256: sourceManifest.sources.dat.sha256,
    sprSha256: sourceManifest.sources.spr.sha256,
  },
  items,
};
const serialized = `${JSON.stringify(output)}\n`;
await writeFile(join(repoRoot, "server/data/item-catalog.json"), serialized);
console.log(
  `built ${Object.keys(items).length} item types (${createHash("sha256")
    .update(serialized)
    .digest("hex")})`,
);
