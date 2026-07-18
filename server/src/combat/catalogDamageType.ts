import type { DamageType } from "@tibia/protocol";
import type { ItemType } from "../item/ItemType";

export type CatalogDamageType = keyof NonNullable<ItemType["absorbPercent"]>;

export function catalogDamageType(type: DamageType): CatalogDamageType {
  if (type === "life-drain") return "lifedrain";
  if (type === "mana-drain") return "manadrain";
  if (type === "healing") return "physical";
  return type;
}
