export function validateShopCurrency(
  itemTypeId: number | undefined,
  maxCount: number | undefined,
): void {
  if (itemTypeId === undefined && maxCount === undefined) return;
  if (
    itemTypeId === undefined ||
    maxCount === undefined ||
    !Number.isInteger(itemTypeId) ||
    itemTypeId < 1 ||
    itemTypeId > 65_535 ||
    !Number.isInteger(maxCount) ||
    maxCount < 1 ||
    maxCount > 100
  ) {
    throw new Error("invalid shop currency");
  }
}
