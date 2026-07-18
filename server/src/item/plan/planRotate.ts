import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { CarriedPlan } from "./CarriedPlan";

export function planRotate(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly items: ReadonlyArray<Item>;
  readonly itemId: string;
  readonly expectedVersion: number;
}): CarriedPlan | null {
  const { characterId, catalog, items } = input;
  const item = items.find((candidate) => candidate.id === input.itemId);
  if (!item || item.version !== input.expectedVersion) return null;
  const targetTypeId = catalog.require(item.typeId).rotateTo;
  if (!targetTypeId || !catalog.get(targetTypeId)) return null;
  const after: Item = {
    ...item,
    typeId: targetTypeId,
    version: item.version + 1,
  };
  return {
    mutation: { before: item, after: [after] },
    persist: {
      characterId,
      rowOps: [{ kind: "write", expectedVersion: item.version, item: after }],
      audits: [
        {
          kind: "transform",
          itemId: item.id,
          fromTypeId: item.typeId,
          toTypeId: targetTypeId,
        },
      ],
    },
  };
}
