import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import type { Item } from "../Item";

interface ContainerFrontInsertionPlan {
  readonly after: ReadonlyArray<Item>;
  readonly stageOps: ReadonlyArray<CarriedPersistRowOp>;
  readonly writeOps: ReadonlyArray<CarriedPersistRowOp>;
  readonly audits: ReadonlyArray<CarriedPersistAudit>;
}

/** Plans both halves of a collision-safe persisted insert at container slot 0. */
export function planContainerFrontInsertion(input: {
  readonly characterId: string;
  readonly items: ReadonlyArray<Item>;
  readonly containerId: string;
  readonly capacity: number;
  readonly sourceItemId: string;
}): ContainerFrontInsertionPlan | null {
  const occupants = input.items.filter(
    (item) =>
      item.id !== input.sourceItemId &&
      (item.location.kind === "container" ||
        item.location.kind === "corpse") &&
      item.location.containerId === input.containerId,
  );
  const bySlot = new Map<number, Item>();
  for (const item of occupants) {
    if (
      item.location.kind === "container" ||
      item.location.kind === "corpse"
    ) {
      bySlot.set(item.location.slot, item);
    }
  }
  const firstFreeSlot = Array.from(
    { length: input.capacity },
    (_, slot) => slot,
  ).find((slot) => !bySlot.has(slot));
  if (firstFreeSlot === undefined) return null;

  const before = Array.from({ length: firstFreeSlot }, (_, slot) =>
    bySlot.get(slot),
  ).filter((item): item is Item => item !== undefined);
  const after = before.map((item) => ({
    ...item,
    location: {
      kind: "container" as const,
      containerId: input.containerId,
      slot:
        item.location.kind === "container" ||
        item.location.kind === "corpse"
          ? item.location.slot + 1
          : 0,
    },
    version: item.version + 1,
  }));

  return {
    after,
    stageOps: before.map((item, slot) => ({
      kind: "stage",
      itemId: item.id,
      expectedVersion: item.version,
      nextVersion: item.version + 1,
      characterId: input.characterId,
      slot,
    })),
    writeOps: after.map((item) => ({
      kind: "write",
      expectedVersion: item.version,
      item,
    })),
    audits: after.map((item, index) => ({
      kind: "transfer",
      itemId: item.id,
      from: before[index]!.location,
      to: item.location,
      count: item.count,
    })),
  };
}
