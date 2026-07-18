import type { ItemType } from "../item/ItemType";
import { getMissileId } from "./getMissileId";

export function missileForItem(type: ItemType | undefined): number | undefined {
  if (!type?.shootType) return undefined;
  return getMissileId(`CONST_ANI_${type.shootType.toUpperCase()}`);
}
