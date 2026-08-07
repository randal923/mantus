import { randomUUID } from "node:crypto";
import type { Position } from "@tibia/protocol";
import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { CarriedPlan } from "./CarriedPlan";
import { firstFreeWorldStackIndex } from "./firstFreeWorldStackIndex";
import { materializeWorldSource } from "./materializeWorldSource";
import type { WorldItemsView } from "./WorldItemsView";

/**
 * Harvests a plant on the map: the plant transforms into its depleted type
 * (whose decay regrows it) and the yield drops onto the same tile, both in
 * one atomic plan. The yield is an audited creation — fruit enters the world
 * from nothing (charter rule 11).
 */
export function planHarvestMapItem(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly world: WorldItemsView;
  readonly instanceId: string;
  readonly position: Position;
  readonly expectedVersion: number;
  readonly toTypeId: number;
  readonly yieldTypeId: number;
  readonly yieldCount: number;
}): CarriedPlan | null {
  const { characterId, catalog, world, position } = input;
  const yieldType = catalog.get(input.yieldTypeId);
  if (!catalog.get(input.toTypeId) || !yieldType) return null;
  if (
    !Number.isInteger(input.yieldCount) ||
    input.yieldCount < 1 ||
    input.yieldCount > (yieldType.stackable ? yieldType.maxCount : 1)
  ) {
    return null;
  }
  const tileItems = world.getMapItems(position);
  const mapItem = tileItems.find(
    (candidate) => candidate.instanceId === input.instanceId,
  );
  if (!mapItem) return null;
  let root = world.getWorldItem(input.instanceId);
  let pristine: ReturnType<typeof materializeWorldSource> = null;
  if (root) {
    const location = root.location;
    if (
      location.kind !== "world" ||
      location.position.x !== position.x ||
      location.position.y !== position.y ||
      location.position.z !== position.z ||
      world.getWorldSubtree(root.id).length !== 1 ||
      world.lootOrigin(root.id) !== undefined
    ) {
      return null;
    }
  } else {
    const source = mapItem.source;
    if (!source || source.seedKey !== input.instanceId) return null;
    pristine = materializeWorldSource(catalog, source);
    if (!pristine || pristine.contents.length > 0) return null;
    root = pristine.root;
  }
  if (root.version !== input.expectedVersion) return null;
  const stackIndex = firstFreeWorldStackIndex(tileItems);
  if (stackIndex === null) return null;

  const depleted: Item = {
    ...root,
    typeId: input.toTypeId,
    version: root.version + 1,
  };
  const fruit: Item = {
    id: randomUUID(),
    typeId: input.yieldTypeId,
    count: input.yieldCount,
    attributes: {},
    version: 1,
    location: { kind: "world", position: { ...position }, stackIndex },
  };
  const rowOps: CarriedPersistRowOp[] = [];
  if (pristine) {
    rowOps.push({ kind: "insert", item: depleted, seed: pristine.seed });
  } else {
    rowOps.push({ kind: "write", expectedVersion: root.version, item: depleted });
  }
  rowOps.push({ kind: "insert", item: fruit });
  const audits: CarriedPersistAudit[] = [
    {
      kind: "transform",
      itemId: root.id,
      fromTypeId: root.typeId,
      toTypeId: input.toTypeId,
    },
    {
      kind: "creation",
      itemId: fruit.id,
      typeId: fruit.typeId,
      count: fruit.count,
      reason: "harvest",
    },
  ];
  return {
    mutation: { before: root, after: [depleted, fruit] },
    persist: { characterId, rowOps, audits },
  };
}
