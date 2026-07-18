import type { DamageType } from "@tibia/protocol";
import type { CatalogDamageType } from "./catalogDamageType";

export function protocolDamageType(type: CatalogDamageType): DamageType {
  if (type === "lifedrain") return "life-drain";
  if (type === "manadrain") return "mana-drain";
  if (type === "poison") return "earth";
  return type;
}
