import type { Position } from "@tibia/protocol";
import type { CarriedPersistRowOp } from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { CarriedPlan } from "./CarriedPlan";
import { materializeWorldSource } from "./materializeWorldSource";
import type { WorldItemsView } from "./WorldItemsView";

/**
 * Transforms a map item in place (door open/close, lever flip, furniture
 * rotation): same row, new type id, version bump. Pristine seeds materialize
 * into rows atomically with the transform.
 */
export function planTransformMapItem(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly world: WorldItemsView;
  readonly instanceId: string;
  readonly position: Position;
  readonly toTypeId: number;
}): CarriedPlan | null {
  const { catalog, world, position } = input;
  const mapItem = world
    .getMapItems(position)
    .find((candidate) => candidate.instanceId === input.instanceId);
  if (!mapItem || !catalog.get(input.toTypeId)) return null;
  let root = world.getWorldItem(input.instanceId);
  let children: ReadonlyArray<Item> = [];
  let pristine: ReturnType<typeof materializeWorldSource> = null;
  if (root) {
    const location = root.location;
    if (
      location.kind !== "world" ||
      location.position.x !== position.x ||
      location.position.y !== position.y ||
      location.position.z !== position.z
    ) {
      return null;
    }
    children = world.getWorldSubtree(root.id).slice(1);
  } else {
    const source = mapItem.source;
    if (!source || source.seedKey !== input.instanceId) return null;
    pristine = materializeWorldSource(catalog, source);
    if (!pristine) return null;
    root = pristine.root;
    children = pristine.contents;
  }
  const final: Item = {
    ...root,
    typeId: input.toTypeId,
    version: root.version + 1,
  };
  const rowOps: CarriedPersistRowOp[] = [];
  if (pristine) {
    rowOps.push({ kind: "insert", item: final, seed: pristine.seed });
    for (const content of pristine.contents) {
      rowOps.push({ kind: "insert", item: content, seed: pristine.seed });
    }
  } else {
    rowOps.push({ kind: "write", expectedVersion: root.version, item: final });
  }
  return {
    mutation: { before: root, after: [final, ...children] },
    persist: {
      characterId: input.characterId,
      rowOps,
      audits: [
        {
          kind: "transform",
          itemId: root.id,
          fromTypeId: root.typeId,
          toTypeId: input.toTypeId,
        },
      ],
    },
  };
}
