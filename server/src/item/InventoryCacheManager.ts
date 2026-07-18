import type { InventoryState } from "@tibia/protocol";
import { collectReachableItemIds } from "./collectReachableItemIds";
import type { InventoryCache } from "./InventoryCache";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemMutation } from "./ItemMutation";
import type { LoadedInventory } from "./LoadedInventory";
import { projectInventory } from "./projectInventory";

/** Per-character in-memory inventory caches and their client projections. */
export class InventoryCacheManager {
  private readonly inventories = new Map<string, InventoryCache>();

  constructor(private readonly catalog: ItemCatalog) {}

  attach(loaded: LoadedInventory): InventoryState {
    const cache = {
      capacityMax: loaded.capacityMax,
      items: loaded.items,
      revision: 0,
      openContainerIds: new Set<string>(),
    };
    this.inventories.set(loaded.characterId, cache);
    return this.project(cache);
  }

  detach(characterId: string): void {
    this.inventories.delete(characterId);
  }

  get(characterId: string): InventoryCache | undefined {
    return this.inventories.get(characterId);
  }

  snapshot(
    characterId: string,
  ): { items: ReadonlyArray<Item>; capacityMax: number } | null {
    const cache = this.inventories.get(characterId);
    return cache
      ? { items: cache.items, capacityMax: cache.capacityMax }
      : null;
  }

  updateCapacity(
    characterId: string,
    capacityMax: number,
  ): InventoryState | null {
    const cache = this.inventories.get(characterId);
    if (!cache || cache.capacityMax === capacityMax) return null;
    const updated = {
      ...cache,
      capacityMax,
      revision: cache.revision + 1,
    };
    this.inventories.set(characterId, updated);
    return this.project(updated);
  }

  openContainer(characterId: string, item: Item): InventoryState | null {
    const cache = this.inventories.get(characterId);
    if (!cache) return null;
    if (this.catalog.require(item.typeId).containerCapacity === undefined) {
      return null;
    }
    const openContainerIds = new Set(cache.openContainerIds);
    if (!openContainerIds.has(item.id) && openContainerIds.size >= 16) {
      return null;
    }
    openContainerIds.add(item.id);
    const updated = {
      ...cache,
      openContainerIds,
      revision: cache.revision + 1,
    };
    this.inventories.set(characterId, updated);
    return this.project(updated);
  }

  closeContainer(
    characterId: string,
    containerId: string,
  ): InventoryState | null {
    const cache = this.inventories.get(characterId);
    if (!cache) return null;
    const container = cache.items.find((item) => item.id === containerId);
    if (
      !container ||
      this.catalog.require(container.typeId).containerCapacity === undefined
    ) {
      return null;
    }
    const openContainerIds = new Set(cache.openContainerIds);
    openContainerIds.delete(container.id);
    const updated = {
      ...cache,
      openContainerIds,
      revision: cache.revision + 1,
    };
    this.inventories.set(characterId, updated);
    return this.project(updated);
  }

  applyMutation(
    characterId: string,
    mutation: ItemMutation,
  ): InventoryState | null {
    const current = this.inventories.get(characterId);
    if (!current) return null;
    const afterById = new Map(mutation.after.map((item) => [item.id, item]));
    const removed = new Set(mutation.removedItemIds ?? []);
    const candidates = current.items
      .filter(
        (item) =>
          item.id !== mutation.before?.id && !removed.has(item.id),
      )
      .map((item) => afterById.get(item.id) ?? item);
    for (const after of mutation.after) {
      if (
        after.location.kind === "world" ||
        candidates.some((item) => item.id === after.id)
      ) {
        continue;
      }
      candidates.push(after);
    }
    const reachable = collectReachableItemIds(candidates, characterId);
    const items = candidates.filter((item) => reachable.has(item.id));
    const next = {
      ...current,
      items,
      openContainerIds: new Set(
        [...current.openContainerIds].filter((containerId) => {
          const container = items.find((item) => item.id === containerId);
          return (
            container !== undefined &&
            this.catalog.require(container.typeId).containerCapacity !==
              undefined
          );
        }),
      ),
      revision: current.revision + 1,
    };
    this.inventories.set(characterId, next);
    return this.project(next);
  }

  private project(cache: InventoryCache): InventoryState {
    return projectInventory(
      cache.items,
      this.catalog,
      cache.capacityMax,
      cache.revision,
      cache.openContainerIds,
    );
  }
}
