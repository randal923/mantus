import type { Position, ViewRange } from "@tibia/protocol";
import {
  OPEN_SHOVEL_HOLE_IDS,
  SHOVEL_HOLE_PAIRS,
} from "../action/shovelHolePairs";
import { getFirstVisibleFloor } from "../getFirstVisibleFloor";
import type { Item } from "../item/Item";
import type { ItemMutation } from "../item/ItemMutation";
import type { LootOrigin } from "../item/LootOrigin";
import type { WorldItemDeltas } from "../item/WorldItemDeltas";
import type { MapData } from "../MapData";
import type { MapItem } from "../MapItem";
import type { MapTransition } from "../MapTransition";
import { positionKey } from "../positionKey";

const GROUND_FLOOR = 7;

export interface TilePassabilityOverride {
  readonly walkable: boolean;
  readonly blocksProjectile: boolean;
}

export class DynamicMapItems {
  private readonly hiddenMapItemIds = new Set<string>();
  private readonly dynamicMapItems = new Map<string, MapItem[]>();
  private readonly tileItemRevisions = new Map<string, number>();
  /** Full item state for world roots and their container subtrees. */
  private readonly worldItems = new Map<string, Item>();
  private readonly seedKeyToId = new Map<string, string>();
  /**
   * Corpse/loot items that exist only in memory: no DB row until a player
   * first touches them (the plan then inserts the row and its creation
   * audit). Cleared automatically when a mutation covers the item, so every
   * unpersisted item a plan mutates MUST be materialized by that plan.
   */
  private readonly unpersistedLootOrigins = new Map<string, LootOrigin>();
  /**
   * Tiles whose passability is owned by a stateful item (a door): the static
   * navigation bitset baked the map's placed state, so open/closed changes
   * are overlaid here.
   */
  private readonly tileOverrides = new Map<string, TilePassabilityOverride>();

  constructor(
    private readonly map: MapData,
    private readonly weightForItemId: (
      itemId: number,
    ) => number | undefined = () => undefined,
    private readonly doorPassabilityForItemId: (
      itemId: number,
    ) => boolean | undefined = () => undefined,
  ) {}

  getTileOverride(position: Position): TilePassabilityOverride | undefined {
    return this.tileOverrides.get(positionKey(position));
  }

  /**
   * A shovel-opened hole is a dynamic item, so its step-through fall cannot
   * be baked into the static transition table; movement consults this before
   * the static lookup. Statically-placed open holes keep their baked
   * transitions and never appear in the dynamic layer.
   */
  getHoleTransition(position: Position): MapTransition | undefined {
    if (position.z >= 15) return undefined;
    for (const item of this.dynamicMapItems.get(positionKey(position)) ?? []) {
      if (!OPEN_SHOVEL_HOLE_IDS.has(item.itemId)) continue;
      return {
        kind: "hole",
        activation: "step",
        source: { ...position },
        destination: { x: position.x, y: position.y, z: position.z + 1 },
        itemId: item.itemId,
      };
    }
    return undefined;
  }

  private passabilityForItemId(itemId: number): boolean | undefined {
    if (SHOVEL_HOLE_PAIRS.has(itemId)) return false;
    if (OPEN_SHOVEL_HOLE_IDS.has(itemId)) return true;
    return this.doorPassabilityForItemId(itemId);
  }

  private refreshTileOverride(position: Position): void {
    let override: TilePassabilityOverride | undefined;
    for (const item of this.getMapItems(position)) {
      const passable = this.passabilityForItemId(item.itemId);
      if (passable === undefined) continue;
      override = { walkable: passable, blocksProjectile: !passable };
    }
    const key = positionKey(position);
    if (override) this.tileOverrides.set(key, override);
    else this.tileOverrides.delete(key);
  }

  hideSeed(seedKey: string): void {
    this.hiddenMapItemIds.add(seedKey);
  }

  /** Marks memory-only loot items awaiting their first-touch row insert. */
  registerUnpersistedLootItems(
    items: ReadonlyArray<Item>,
    origin: LootOrigin,
  ): void {
    for (const item of items) this.unpersistedLootOrigins.set(item.id, origin);
  }

  /** The kill event behind an item that has no DB row yet, if any. */
  lootOrigin(itemId: string): LootOrigin | undefined {
    return this.unpersistedLootOrigins.get(itemId);
  }

  /** The materialized item behind a tile instance id (id or seed key). */
  getWorldItem(instanceId: string): Item | undefined {
    return this.worldItems.get(this.seedKeyToId.get(instanceId) ?? instanceId);
  }

  /** A world root plus its contained subtree, parents before children. */
  getWorldSubtree(rootId: string): Item[] {
    const root = this.worldItems.get(rootId);
    if (!root) return [];
    const byContainer = new Map<string, Item[]>();
    for (const item of this.worldItems.values()) {
      if (
        item.location.kind !== "container" &&
        item.location.kind !== "corpse"
      ) {
        continue;
      }
      const children = byContainer.get(item.location.containerId) ?? [];
      children.push(item);
      byContainer.set(item.location.containerId, children);
    }
    const subtree: Item[] = [root];
    let frontier = [root.id];
    for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const containerId of frontier) {
        for (const child of byContainer.get(containerId) ?? []) {
          subtree.push(child);
          next.push(child.id);
        }
      }
      frontier = next;
    }
    return subtree;
  }

  /** Registers boot-loaded world trees (parents arrive before children). */
  registerLoadedWorldItems(items: ReadonlyArray<Item>): void {
    for (const item of items) {
      this.trackWorldItem(item);
      if (item.location.kind === "world") {
        this.addDynamicWorldItem(item);
        this.refreshTileOverride(item.location.position);
      }
    }
  }

  private trackWorldItem(item: Item): void {
    this.worldItems.set(item.id, item);
    if (item.seedKey) this.seedKeyToId.set(item.seedKey, item.id);
  }

  private untrackWorldItem(itemId: string): void {
    const item = this.worldItems.get(itemId);
    if (!item) return;
    this.worldItems.delete(itemId);
    if (item.seedKey) this.seedKeyToId.delete(item.seedKey);
  }

  getMapItems(position: Position) {
    const key = positionKey(position);
    return [
      ...this.map
        .getItems(position)
        .filter((item) => !this.hiddenMapItemIds.has(item.instanceId)),
      ...(this.dynamicMapItems.get(key) ?? []),
    ].sort((left, right) => left.stackIndex - right.stackIndex);
  }

  mapItemTilesVisibleFrom(position: Position, range: ViewRange) {
    const firstFloor = getFirstVisibleFloor(position, this.map);
    const floors =
      position.z > GROUND_FLOOR
        ? [position.z]
        : Array.from(
            { length: GROUND_FLOOR - firstFloor + 1 },
            (_, index) => firstFloor + index,
          );
    const tiles = [];
    for (const z of floors) {
      const shift = position.z - z;
      const centerX = position.x + shift;
      const centerY = position.y + shift;
      for (let y = centerY - range.y; y <= centerY + range.y; y++) {
        for (let x = centerX - range.x; x <= centerX + range.x; x++) {
          const tilePosition = { x, y, z };
          const items = this.getMapItems(tilePosition);
          if (items.length === 0) continue;
          tiles.push({
            position: tilePosition,
            revision: this.tileItemRevisions.get(positionKey(tilePosition)) ?? 0,
            items: items.map((item) => this.toMapItemState(item)),
          });
        }
      }
    }
    return tiles;
  }

  mapItemTileState(position: Position) {
    const items = this.getMapItems(position);
    return {
      position: { ...position },
      revision: this.tileItemRevisions.get(positionKey(position)) ?? 0,
      items: items.map((item) => this.toMapItemState(item)),
    };
  }

  private toMapItemState(item: MapItem) {
    const weight = this.weightForItemId(item.itemId);
    return {
      instanceId: item.instanceId,
      itemId: item.itemId,
      stackIndex: item.stackIndex,
      revision: item.revision ?? 1,
      count: item.count ?? 1,
      ...(weight !== undefined ? { weight } : {}),
    };
  }

  applyItemMutation(mutation: ItemMutation): Position[] {
    // Any mutation of an unpersisted loot item carries its row insert in the
    // same persist plan, so the item stops being memory-only right here.
    for (const item of mutation.after) {
      this.unpersistedLootOrigins.delete(item.id);
    }
    for (const removedId of mutation.removedItemIds ?? []) {
      this.unpersistedLootOrigins.delete(removedId);
    }
    const changed = new Map<string, Position>();
    if (mutation.before?.location.kind === "world") {
      const { position } = mutation.before.location;
      changed.set(positionKey(position), position);
      if (mutation.before.seedKey) {
        this.hiddenMapItemIds.add(mutation.before.seedKey);
        this.removeDynamicWorldItem(
          mutation.before.seedKey,
          mutation.before.location.position,
        );
      } else {
        this.removeDynamicWorldItem(mutation.before.id, position);
      }
    }
    for (const removedId of mutation.removedItemIds ?? []) {
      const removed = this.worldItems.get(removedId);
      if (removed?.location.kind === "world") {
        this.removeDynamicWorldItem(
          removed.seedKey ?? removed.id,
          removed.location.position,
        );
        changed.set(
          positionKey(removed.location.position),
          removed.location.position,
        );
      }
      this.untrackWorldItem(removedId);
    }
    for (const item of mutation.after) {
      if (item.location.kind === "world") {
        if (item.seedKey) this.hiddenMapItemIds.add(item.seedKey);
        this.removeDynamicWorldItem(item.id, item.location.position);
        if (item.seedKey) {
          this.removeDynamicWorldItem(item.seedKey, item.location.position);
        }
        this.addDynamicWorldItem(item);
        changed.set(positionKey(item.location.position), item.location.position);
        continue;
      }
      if (
        (item.location.kind === "container" ||
          item.location.kind === "corpse") &&
        this.worldItems.has(item.location.containerId)
      ) {
        // Contained under a world root (parents precede children in `after`).
        this.trackWorldItem(item);
        continue;
      }
      // The item left the world (picked up, equipped, consumed).
      this.untrackWorldItem(item.id);
    }
    for (const [key, position] of changed) {
      this.tileItemRevisions.set(key, (this.tileItemRevisions.get(key) ?? 0) + 1);
      this.refreshTileOverride(position);
    }
    return [...changed.values()];
  }

  applyCreatedWorldItems(items: ReadonlyArray<ItemMutation["after"][number]>): Position[] {
    const changed = new Map<string, Position>();
    for (const item of items) {
      if (item.location.kind !== "world") {
        if (
          (item.location.kind === "container" ||
            item.location.kind === "corpse") &&
          this.worldItems.has(item.location.containerId)
        ) {
          this.trackWorldItem(item);
        }
        continue;
      }
      this.addDynamicWorldItem(item);
      const key = positionKey(item.location.position);
      changed.set(key, item.location.position);
      this.tileItemRevisions.set(key, (this.tileItemRevisions.get(key) ?? 0) + 1);
      this.refreshTileOverride(item.location.position);
    }
    return [...changed.values()];
  }

  addDynamicWorldItem(item: WorldItemDeltas["items"][number]): void {
    if (item.location.kind !== "world") return;
    this.trackWorldItem(item);
    const key = positionKey(item.location.position);
    const current = this.dynamicMapItems.get(key) ?? [];
    const instanceId = item.seedKey ?? item.id;
    this.dynamicMapItems.set(key, [
      ...current.filter((candidate) => candidate.instanceId !== instanceId),
      {
        instanceId,
        itemId: item.typeId,
        stackIndex: item.location.stackIndex,
        mutable: true,
        revision: item.version,
        count: item.count,
      },
    ]);
  }

  private removeDynamicWorldItem(itemId: string, position: Position): void {
    const key = positionKey(position);
    const current = this.dynamicMapItems.get(key);
    if (!current) return;
    const filtered = current.filter(
      (candidate) => candidate.instanceId !== itemId,
    );
    if (filtered.length === 0) {
      this.dynamicMapItems.delete(key);
      return;
    }
    this.dynamicMapItems.set(key, filtered);
  }
}
