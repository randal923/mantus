import type { OwnedItemRow } from "./OwnedItemRow";
import { ownedRowHasAttributes } from "./ownedRowHasAttributes";
import { shopSubtypeAttributes } from "./shopSubtypeAttributes";
import type { ShopItemSubtype } from "./ShopStore";

export function ownedRowHasSubtype(
  row: OwnedItemRow,
  subtype?: ShopItemSubtype,
): boolean {
  if (!subtype) return true;
  return ownedRowHasAttributes(row, shopSubtypeAttributes(subtype));
}
