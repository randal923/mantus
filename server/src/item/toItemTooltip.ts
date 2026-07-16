import type { ItemTooltipData } from "@tibia/protocol";
import type { ItemType } from "./ItemType";

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
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

export function toItemTooltip(item: ItemType): ItemTooltipData {
  const headline: string[] = [];
  if (item.attack !== undefined) headline.push(`Attack ${item.attack}`);
  if (item.defense !== undefined) headline.push(`Defense ${item.defense}`);
  if (item.armor !== undefined) headline.push(`Armor ${item.armor}`);
  if (item.minimumDamage !== undefined && item.maximumDamage !== undefined) {
    headline.push(`Damage ${item.minimumDamage}-${item.maximumDamage}`);
  }

  const affixes: ItemTooltipData["affixes"] = [];
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
  if (item.imbuementSlots !== undefined) {
    affixes.push({ text: `Imbuement Slots ${item.imbuementSlots}` });
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
    affixes.push({ text: `Critical Hit Chance ${signed(item.criticalHitChance)}%` });
  }
  if (item.criticalHitDamage !== undefined) {
    affixes.push({ text: `Critical Hit Damage ${signed(item.criticalHitDamage)}%` });
  }
  if (item.lifeLeechChance !== undefined) {
    affixes.push({ text: `Life Leech Chance ${signed(item.lifeLeechChance)}%` });
  }
  if (item.lifeLeechAmount !== undefined) {
    affixes.push({ text: `Life Leech Amount ${signed(item.lifeLeechAmount)}%` });
  }
  if (item.manaLeechChance !== undefined) {
    affixes.push({ text: `Mana Leech Chance ${signed(item.manaLeechChance)}%` });
  }
  if (item.manaLeechAmount !== undefined) {
    affixes.push({ text: `Mana Leech Amount ${signed(item.manaLeechAmount)}%` });
  }

  return {
    name: titleCase(item.name),
    typeLine: titleCase(itemTypeLine(item)),
    spriteId: item.spriteId,
    ...(headline.length > 0 ? { primaryStat: headline.join(" · ") } : {}),
    affixes,
    ...(item.requirements?.level
      ? { requiredLevel: item.requirements.level }
      : {}),
    ...(item.requirements?.vocations
      ? { vocations: [...item.requirements.vocations] }
      : {}),
    weight: item.weight,
    ...(item.description ? { description: item.description } : {}),
    ...(item.charges !== undefined ? { charges: item.charges } : {}),
    ...(item.containerCapacity !== undefined
      ? { containerCapacity: item.containerCapacity }
      : {}),
  };
}
