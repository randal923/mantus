import { MAX_CONTAINER_CAPACITY } from "@tibia/protocol";
import type { ItemType } from "../item/ItemType";
import { formatSigned } from "./formatSigned";
import { skillLookName } from "./skillLookName";

/**
 * Canary names element and absorb types through `getCombatName`, whose strings
 * are exactly the catalog's damage-type slugs ("fire", "lifedrain", ...), so
 * the slug is the display name.
 */
function protectionSegment(
  percents: Readonly<Partial<Record<string, number>>>,
  label: string,
): string | null {
  const entries = Object.entries(percents).filter(([, value]) => value !== 0);
  if (entries.length === 0) return null;
  const distinct = new Set(entries.map(([, value]) => value));
  // Canary collapses a uniform absorb across every combat type into "all".
  if (distinct.size === 1 && entries.length > 1) {
    return `${label} all ${formatSigned(entries[0]?.[1] as number)}%`;
  }
  const parts = entries.map(
    ([type, value]) => `${type} ${formatSigned(value as number)}%`,
  );
  return `${label} ${parts.join(", ")}`;
}

/**
 * The parenthesised stat group of an item's look line. Canary emits this in
 * two passes (the weapon/container/ring chain in `Item::getDescription`, then
 * `parseShowAttributesDescription`); its `showAttributes` flag is not in our
 * pinned catalog, so the passes are merged into one ordered group here — the
 * output is the single "(...)" real Tibia shows, and no stat prints twice.
 */
export function itemLookSegments(type: ItemType): ReadonlyArray<string> {
  const segments: string[] = [];

  if (type.containerCapacity !== undefined) {
    // A slot-unlimited container (the item pouch) looks infinite, not "500".
    segments.push(
      type.containerCapacity >= MAX_CONTAINER_CAPACITY
        ? "Vol:∞"
        : `Vol:${type.containerCapacity}`,
    );
  }

  if (type.weaponType === "distance" && type.ammoType) {
    // Canary's distance branch: the range first, then signed attack/hit chance.
    if (type.range !== undefined) segments.push(`Range: ${type.range}`);
    if (type.attack) segments.push(`Atk ${formatSigned(type.attack)}`);
    if (type.hitChance) segments.push(`Hit% ${formatSigned(type.hitChance)}`);
  } else if (type.weaponType !== "ammunition") {
    const element = Object.entries(type.elementDamage ?? {}).find(
      ([, value]) => value !== 0,
    );
    if (type.attack) {
      segments.push(
        element
          ? `Atk:${type.attack} physical + ${element[1]} ${element[0]}`
          : `Atk:${type.attack}`,
      );
    } else if (element) {
      segments.push(`${element[1]} ${element[0]}`);
    }
    if (type.defense || type.extraDefense) {
      const extra = type.extraDefense
        ? ` ${formatSigned(type.extraDefense)}`
        : "";
      segments.push(`Def:${type.defense ?? 0}${extra}`);
    }
  }

  if (type.armor) segments.push(`Arm:${type.armor}`);

  // Wands and rods: Canary drops these from the look line although it holds
  // the data; real Tibia shows them and our catalog carries both.
  if (type.weaponType === "wand") {
    if (type.range !== undefined) segments.push(`Range:${type.range}`);
    if (type.manaCost !== undefined) segments.push(`Mana:${type.manaCost}`);
  }

  for (const [skill, value] of Object.entries(type.skillModifiers ?? {})) {
    if (value) segments.push(`${skillLookName(skill)} ${formatSigned(value)}`);
  }
  if (type.magicLevelPoints) {
    segments.push(`magic level ${formatSigned(type.magicLevelPoints)}`);
  }
  // Crit and leech amounts are stored in hundredths of a percent
  // (Canary's scale: 1000 = 10%).
  if (type.criticalHitChance) {
    segments.push(`critical hit chance ${type.criticalHitChance / 100}%`);
  }
  if (type.criticalHitDamage) {
    segments.push(
      `critical extra damage ${formatSigned(type.criticalHitDamage / 100)}%`,
    );
  }
  if (type.lifeLeechAmount) {
    segments.push(`life leech ${formatSigned(type.lifeLeechAmount / 100)}%`);
  }
  if (type.manaLeechAmount) {
    segments.push(`mana leech ${formatSigned(type.manaLeechAmount / 100)}%`);
  }

  const protection = protectionSegment(type.absorbPercent ?? {}, "protection");
  if (protection) segments.push(protection);

  if (type.speed) segments.push(`speed ${formatSigned(type.speed)}`);

  return segments;
}
