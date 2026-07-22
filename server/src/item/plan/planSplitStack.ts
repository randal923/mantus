import { randomUUID } from "node:crypto";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { ItemLocation } from "../ItemLocation";
import type { CarriedPlan } from "./CarriedPlan";
import { firstFreeContainerSlot } from "./firstFreeContainerSlot";

const MAX_CARRIED_ITEMS = 500;

export function planSplitStack(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly items: ReadonlyArray<Item>;
  readonly itemId: string;
  readonly expectedVersion: number;
  readonly count: number;
}): CarriedPlan | null {
  const { characterId, catalog, items, count } = input;
  const item = items.find((candidate) => candidate.id === input.itemId);
  if (!item || item.version !== input.expectedVersion) return null;
  const type = catalog.require(item.typeId);
  if (!type.stackable || count < 1 || count >= item.count) return null;
  if (items.length >= MAX_CARRIED_ITEMS) return null;
  if (item.location.kind !== "container") return null;
  const sourceContainerId = item.location.containerId;
  const container = items.find(
    (candidate) => candidate.id === sourceContainerId,
  );
  if (!container) return null;
  const destinationSlot = firstFreeContainerSlot(catalog, items, container);
  if (destinationSlot === null) return null;
  const destination: ItemLocation = {
    kind: "container",
    containerId: container.id,
    slot: destinationSlot,
  };
  const sourceAfter: Item = {
    ...item,
    count: item.count - count,
    version: item.version + 1,
  };
  const created: Item = {
    id: randomUUID(),
    typeId: item.typeId,
    count,
    attributes: item.attributes,
    version: 1,
    location: destination,
  };
  return {
    mutation: { before: item, after: [sourceAfter, created] },
    persist: {
      characterId,
      rowOps: [
        { kind: "write", expectedVersion: item.version, item: sourceAfter },
        { kind: "insert", item: created },
      ],
      audits: [
        {
          kind: "split",
          itemId: item.id,
          originalCount: item.count,
          remainingCount: sourceAfter.count,
          createdItemId: created.id,
          createdCount: created.count,
          destination,
        },
      ],
    },
  };
}
