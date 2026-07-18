import type { ItemRow } from "./ItemRow";

export function requireVersion(row: ItemRow, expectedVersion: number): void {
  if (row.version !== expectedVersion) throw new Error("stale item revision");
}
