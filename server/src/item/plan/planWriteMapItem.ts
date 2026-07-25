import type { Position } from "@tibia/protocol";
import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import { appendUnpersistedLootInserts } from "./appendUnpersistedLootInserts";
import type { CarriedPlan } from "./CarriedPlan";
import { materializeWorldSource } from "./materializeWorldSource";
import type { WorldItemsView } from "./WorldItemsView";

const MAX_ATTRIBUTE_BYTES = 4_096;

/**
 * Writes text onto a map item (blackboards, tombstones): same row, new
 * attributes, version bump. Pristine seeds materialize into rows atomically
 * with the write, exactly as `planTransformMapItem` does, so two concurrent
 * writers leave one row with one coherent text.
 */
export function planWriteMapItem(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly world: WorldItemsView;
  readonly instanceId: string;
  readonly position: Position;
  readonly text: string;
  readonly expectedVersion: number;
}): CarriedPlan | null {
  const { catalog, world, position } = input;
  const mapItem = world
    .getMapItems(position)
    .find((candidate) => candidate.instanceId === input.instanceId);
  if (!mapItem) return null;
  const type = catalog.get(mapItem.itemId);
  if (!type?.text?.writeable) return null;
  if (input.text.length > type.text.maxLength) return null;
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
  if (root.version !== input.expectedVersion) return null;
  const attributes = { ...root.attributes, text: input.text };
  if (Buffer.byteLength(JSON.stringify(attributes)) > MAX_ATTRIBUTE_BYTES) {
    return null;
  }
  const final: Item = {
    ...root,
    attributes,
    version: root.version + 1,
  };
  const rowOps: CarriedPersistRowOp[] = [];
  const audits: CarriedPersistAudit[] = [];
  const origin = world.lootOrigin(root.id);
  if (pristine) {
    rowOps.push({ kind: "insert", item: final, seed: pristine.seed });
    for (const content of pristine.contents) {
      rowOps.push({ kind: "insert", item: content, seed: pristine.seed });
    }
  } else if (origin) {
    rowOps.push({ kind: "insert", item: final });
    audits.push({
      kind: "loot-created",
      itemId: root.id,
      eventId: origin.eventId,
      killerCharacterId: origin.killerCharacterId,
      typeId: root.typeId,
      count: root.count,
    });
    appendUnpersistedLootInserts(world, children, rowOps, audits);
  } else {
    rowOps.push({ kind: "write", expectedVersion: root.version, item: final });
  }
  const previous = root.attributes.text;
  audits.push({
    kind: "written",
    itemId: root.id,
    previousLength: typeof previous === "string" ? previous.length : 0,
    length: input.text.length,
  });
  return {
    mutation: { before: root, after: [final, ...children] },
    persist: { characterId: input.characterId, rowOps, audits },
  };
}
