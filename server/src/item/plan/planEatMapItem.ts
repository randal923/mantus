import type { Position } from "@tibia/protocol";
import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { CarriedPlan } from "./CarriedPlan";
import { materializeWorldSource } from "./materializeWorldSource";
import type { WorldItemsView } from "./WorldItemsView";

/**
 * Eats one unit from a food item lying on the ground (Canary's foods.lua
 * works on floor items). A stack shrinks in place; the last unit removes the
 * item. A fully eaten pristine seed writes no row: the in-memory removal
 * hides the seed for this uptime and a restart restores the map placement,
 * the same map-reset semantics a Canary reboot has.
 */
export function planEatMapItem(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly world: WorldItemsView;
  readonly instanceId: string;
  readonly position: Position;
  readonly expectedVersion: number;
}): CarriedPlan | null {
  const { characterId, catalog, world, position } = input;
  const mapItem = world
    .getMapItems(position)
    .find((candidate) => candidate.instanceId === input.instanceId);
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
      world.getWorldSubtree(root.id).length !== 1
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
  if (!catalog.get(root.typeId)?.food) return null;

  const rowOps: CarriedPersistRowOp[] = [];
  const audits: CarriedPersistAudit[] = [];
  const origin = world.lootOrigin(root.id);
  if (root.count > 1) {
    const final: Item = {
      ...root,
      count: root.count - 1,
      version: root.version + 1,
    };
    if (pristine) {
      rowOps.push({ kind: "insert", item: final, seed: pristine.seed });
    } else if (origin) {
      // First touch of memory-only kill loot: the shrunk stack becomes the
      // row, and its creation is audited so the ledger starts from the drop.
      rowOps.push({ kind: "insert", item: final });
      audits.push({
        kind: "loot-created",
        itemId: root.id,
        eventId: origin.eventId,
        killerCharacterId: origin.killerCharacterId,
        typeId: root.typeId,
        count: root.count,
      });
    } else {
      rowOps.push({ kind: "write", expectedVersion: root.version, item: final });
    }
    audits.push({
      kind: "destruction",
      itemId: root.id,
      typeId: root.typeId,
      count: 1,
      reason: "food",
    });
    return {
      mutation: { before: root, after: [final] },
      persist: { characterId, rowOps, audits },
    };
  }
  // Last unit: memory-only items (pristine seeds, untouched loot) have no row.
  if (!pristine && origin === undefined) {
    rowOps.push({
      kind: "delete",
      itemId: root.id,
      expectedVersion: root.version,
    });
  }
  audits.push({
    kind: "destruction",
    itemId: root.id,
    typeId: root.typeId,
    count: 1,
    reason: "food",
  });
  return {
    mutation: { before: root, after: [], removedItemIds: [root.id] },
    persist: { characterId, rowOps, audits },
  };
}
