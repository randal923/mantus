import type { Position } from "@tibia/protocol";
import { PODIUM_DEFINITIONS } from "../../podium/PodiumDefinition";
import type { PodiumStored } from "../../podium/podiumStateOf";
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
 * Writes a podium's show-off state onto its item row: same row, new
 * `podium` attribute bag, version bump. Mirrors `planWriteMapItem` so the
 * claimed revision and tile contents are re-checked at execution time and
 * two concurrent editors leave one row with one coherent display.
 */
export function planSetPodiumMapItem(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly world: WorldItemsView;
  readonly instanceId: string;
  readonly position: Position;
  readonly stored: PodiumStored;
  readonly expectedVersion: number;
}): CarriedPlan | null {
  const { catalog, world, position } = input;
  const mapItem = world
    .getMapItems(position)
    .find((candidate) => candidate.instanceId === input.instanceId);
  if (!mapItem) return null;
  if (!PODIUM_DEFINITIONS.has(mapItem.itemId)) return null;
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
  const attributes = { ...root.attributes, podium: input.stored };
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
  return {
    mutation: { before: root, after: [final, ...children] },
    persist: { characterId: input.characterId, rowOps, audits },
  };
}
