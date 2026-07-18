import { randomUUID } from "node:crypto";
import type { PersistSeedData } from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type {
  WorldItemSource,
  WorldItemSourceContent,
} from "../WorldItemSource";

export interface MaterializedWorldTree {
  readonly root: Item;
  readonly contents: ReadonlyArray<Item>;
  readonly seed: PersistSeedData;
}

/**
 * Builds the item rows a pristine map seed materializes into, mirroring the
 * DB-side materializer: fresh uuids, derived content seed keys, stack counts
 * lifted out of the seed attributes. Null when the seed data is invalid.
 */
export function materializeWorldSource(
  catalog: ItemCatalog,
  source: WorldItemSource,
): MaterializedWorldTree | null {
  const rootState = persistedItemState(
    catalog,
    source.typeId,
    source.attributes,
  );
  if (!rootState) return null;
  const rootId = randomUUID();
  const root: Item = {
    id: rootId,
    typeId: source.typeId,
    count: rootState.count,
    attributes: rootState.attributes,
    version: 1,
    seedKey: source.seedKey,
    location: {
      kind: "world",
      position: { ...source.position },
      stackIndex: source.stackIndex,
    },
  };
  const contents: Item[] = [];
  const appendContents = (
    entries: ReadonlyArray<WorldItemSourceContent>,
    parentId: string,
    parentSeedKey: string,
  ): boolean => {
    for (const [slot, content] of entries.entries()) {
      const state = persistedItemState(
        catalog,
        content.typeId,
        content.attributes,
      );
      if (!state) return false;
      const id = randomUUID();
      const seedKey = `${parentSeedKey}:content:${slot}`;
      contents.push({
        id,
        typeId: content.typeId,
        count: state.count,
        attributes: state.attributes,
        version: 1,
        seedKey,
        location: { kind: "container", containerId: parentId, slot },
      });
      if (!appendContents(content.contents, id, seedKey)) return false;
    }
    return true;
  };
  if (!appendContents(source.contents, rootId, source.seedKey)) return null;
  return {
    root,
    contents,
    seed: {
      mapName: source.mapName,
      mapVersion: source.mapVersion,
      x: source.position.x,
      y: source.position.y,
      z: source.position.z,
      stackIndex: source.stackIndex,
    },
  };
}

function persistedItemState(
  catalog: ItemCatalog,
  typeId: number,
  attributes: Readonly<Record<string, unknown>>,
): { count: number; attributes: Readonly<Record<string, unknown>> } | null {
  const type = catalog.get(typeId);
  if (!type) return null;
  if (!type.stackable) {
    return { count: 1, attributes: { ...attributes } };
  }
  const rawCount = attributes.count;
  const count =
    rawCount === undefined || rawCount === 0 ? 1 : Number(rawCount);
  if (!Number.isInteger(count) || count < 1 || count > type.maxCount) {
    return null;
  }
  const { count: _count, ...persisted } = attributes;
  return { count, attributes: persisted };
}
