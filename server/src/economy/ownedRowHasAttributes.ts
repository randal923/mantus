import type { OwnedItemRow } from "./OwnedItemRow";

export function ownedRowHasAttributes(
  row: OwnedItemRow,
  expected: Readonly<Record<string, unknown>>,
): boolean {
  if (
    !row.attributes ||
    typeof row.attributes !== "object" ||
    Array.isArray(row.attributes)
  ) {
    throw new Error(`item ${row.id} has invalid attributes`);
  }
  const attributes = row.attributes as Record<string, unknown>;
  const expectedEntries = Object.entries(expected);
  return (
    Object.keys(attributes).length === expectedEntries.length &&
    expectedEntries.every(([key, value]) => attributes[key] === value)
  );
}
