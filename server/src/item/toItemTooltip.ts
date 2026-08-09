import type { ItemTooltipData } from "@tibia/protocol";
import { itemImbuementsOf } from "../forge/itemImbuementsOf";
import { itemTierOf } from "../forge/itemTierOf";
import { formatAffixText } from "../rarity/formatAffixText";
import { isRarityEligible } from "../rarity/isRarityEligible";
import { itemAffixesOf } from "../rarity/itemAffixesOf";
import { itemRarityOf } from "../rarity/itemRarityOf";
import { chargesOf } from "./chargesOf";
import type { Item } from "./Item";
import type { ItemType } from "./ItemType";

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Canary stores crit and leech-amount values in hundredths of a percent
 * (sanguine coil's `criticalhitchance` 1000 = 10%); scale for display.
 */
function signedHundredths(value: number): string {
  const scaled = Math.round(value) / 100;
  return scaled > 0 ? `+${scaled}` : String(scaled);
}

function itemTypeLine(item: ItemType): string {
  if (item.primaryType) return item.primaryType;
  if (item.weaponType === "wand") return "wands";
  if (item.weaponType === "distance") return "distance weapons";
  if (item.weaponType === "shield") return "shields";
  if (item.weaponType === "ammunition") return "ammunition";
  if (item.weaponType) return `${item.weaponType} weapons`;
  if (item.kind) return item.kind;
  if (item.equipmentSlot) return item.equipmentSlot;
  return "item";
}

export function toItemTooltip(
  item: ItemType,
  instance?: Item,
): ItemTooltipData {
  const headline: string[] = [];
  if (item.attack !== undefined) headline.push(`Attack ${item.attack}`);
  if (item.defense !== undefined) headline.push(`Defense ${item.defense}`);
  if (item.armor !== undefined) headline.push(`Armor ${item.armor}`);
  if (item.minimumDamage !== undefined && item.maximumDamage !== undefined) {
    headline.push(`Damage ${item.minimumDamage}-${item.maximumDamage}`);
  }

  const affixes: ItemTooltipData["affixes"] = [];
  // Rolled rarity affixes lead the list; they are the lines a drop is
  // opened for.
  for (const affix of instance ? itemAffixesOf(instance) : []) {
    affixes.push({ text: formatAffixText(affix), kind: "rolled" });
  }
  if (item.extraDefense !== undefined) {
    affixes.push({ text: `Extra Defense ${signed(item.extraDefense)}` });
  }
  if (item.range !== undefined) affixes.push({ text: `Range ${item.range}` });
  if (item.hitChance !== undefined) {
    affixes.push({ text: `Hit Chance ${signed(item.hitChance)}%` });
  }
  if (item.maxHitChance !== undefined) {
    affixes.push({ text: `Maximum Hit Chance ${item.maxHitChance}%` });
  }
  if (item.manaCost !== undefined) {
    affixes.push({ text: `Mana Cost ${item.manaCost}` });
  }
  if (item.wandType) {
    affixes.push({ text: `${titleCase(item.wandType)} Damage` });
  }
  if (item.breakChance !== undefined) {
    affixes.push({ text: `Break Chance ${item.breakChance}%` });
  }
  if (item.imbuementSlots !== undefined && item.imbuementSlots > 0) {
    // One Canary-style line naming every slot: running imbuements show their
    // label and time left, the rest read "Empty Slot".
    const running = instance ? itemImbuementsOf(instance) : [];
    const slots = Array.from({ length: item.imbuementSlots }, (_, slot) => {
      const entry = running.find((imbuement) => imbuement.slot === slot);
      if (!entry) return "Empty Slot";
      const hours = Math.floor(entry.remainingSeconds / 3_600);
      const minutes = Math.floor((entry.remainingSeconds % 3_600) / 60);
      return `${entry.name ?? "Imbuement"} ${hours}:${String(minutes).padStart(2, "0")}h`;
    });
    affixes.push({
      text: `Imbuements: (${slots.join(", ")})`,
      kind: "imbuement",
    });
  }
  for (const [type, damage] of Object.entries(item.elementDamage ?? {})) {
    affixes.push({ text: `${titleCase(type)} Damage ${signed(damage)}` });
  }
  for (const [type, percent] of Object.entries(item.absorbPercent ?? {})) {
    affixes.push({ text: `${titleCase(type)} Protection ${signed(percent)}%` });
  }
  for (const [skill, value] of Object.entries(item.skillModifiers ?? {})) {
    affixes.push({ text: `${titleCase(skill)} Skill ${signed(value)}` });
  }
  if (item.magicLevelPoints !== undefined) {
    affixes.push({ text: `Magic Level ${signed(item.magicLevelPoints)}` });
  }
  if (item.speed !== undefined) {
    affixes.push({ text: `Speed ${signed(item.speed)}` });
  }
  if (item.criticalHitChance !== undefined) {
    affixes.push({
      text: `Critical Hit Chance ${signedHundredths(item.criticalHitChance)}%`,
    });
  }
  if (item.criticalHitDamage !== undefined) {
    affixes.push({
      text: `Critical Extra Damage ${signedHundredths(item.criticalHitDamage)}%`,
    });
  }
  // Leech chance is vestigial (both catalog scales mean "always applies"),
  // so only the amounts are shown, like the modern client.
  if (item.lifeLeechAmount !== undefined) {
    affixes.push({
      text: `Life Leech ${signedHundredths(item.lifeLeechAmount)}%`,
    });
  }
  if (item.manaLeechAmount !== undefined) {
    affixes.push({
      text: `Mana Leech ${signedHundredths(item.manaLeechAmount)}%`,
    });
  }
  // Instance state: forge classification/tier and running imbuements are
  // server-authored display lines (the client renders, never computes).
  if (item.classification !== undefined) {
    const tier = instance ? itemTierOf(instance) : 0;
    affixes.push({
      text: `Classification: ${item.classification} Tier: ${tier}`,
    });
  }
  // Gear that could have rolled a grade but didn't is labelled "common";
  // non-gradable items (runes, food, containers) show no grade at all.
  const rarity =
    (instance ? itemRarityOf(instance) : undefined) ??
    (isRarityEligible(item) ? ("common" as const) : undefined);

  return {
    name: titleCase(item.name),
    typeLine: titleCase(itemTypeLine(item)),
    spriteId: item.spriteId,
    clientId: item.clientId,
    ...(rarity ? { rarity } : {}),
    ...(headline.length > 0 ? { primaryStat: headline.join(" · ") } : {}),
    affixes,
    ...(item.requirements?.level
      ? { requiredLevel: item.requirements.level }
      : {}),
    ...(item.requirements?.vocations
      ? { vocations: [...item.requirements.vocations] }
      : {}),
    weight: item.weight,
    // A row-level description (a decoration kit naming its furniture) beats
    // the type's own text.
    ...(typeof instance?.attributes.description === "string"
      ? { description: instance.attributes.description }
      : item.description
        ? { description: item.description }
        : {}),
    // What this one has left, not what the type ships with: an item losing a
    // charge sends a fresh inventory, so the count ticks down while training.
    ...(item.charges !== undefined
      ? { charges: instance ? chargesOf(instance, item.charges) : item.charges }
      : {}),
    ...(item.containerCapacity !== undefined
      ? { containerCapacity: item.containerCapacity }
      : {}),
    ...(item.npcValue !== undefined && item.npcValue > 0
      ? { worth: item.npcValue }
      : {}),
    ...(item.imbuementSlots !== undefined
      ? { imbuementSlots: item.imbuementSlots }
      : {}),
  };
}
