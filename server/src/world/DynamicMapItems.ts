import type { Position, ViewRange } from "@tibia/protocol";
import { getFirstVisibleFloor } from "../getFirstVisibleFloor";
import type { ItemMutation } from "../item/ItemMutation";
import type { WorldItemDeltas } from "../item/WorldItemDeltas";
import type { MapData } from "../MapData";
import type { MapItem } from "../MapItem";
import { positionKey } from "../positionKey";

export class DynamicMapItems {
  private readonly hiddenMapItemIds = new Set<string>();
  private readonly dynamicMapItems = new Map<string, MapItem[]>();
  private readonly tileItemRevisions = new Map<string, number>();

  constructor(
    private readonly map: MapData,
    private readonly weightForItemId: (
      itemId: number,
    ) => number | undefined = () => undefined,
  ) {}

  hideSeed(seedKey: string): void {
    this.hiddenMapItemIds.add(seedKey);
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
      position.z > 7
        ? [position.z]
        : Array.from(
            { length: position.z - firstFloor + 1 },
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
    for (const item of mutation.after) {
      if (item.location.kind !== "world") continue;
      if (item.seedKey) this.hiddenMapItemIds.add(item.seedKey);
      this.removeDynamicWorldItem(item.id, item.location.position);
      if (item.seedKey) {
        this.removeDynamicWorldItem(item.seedKey, item.location.position);
      }
      this.addDynamicWorldItem(item);
      changed.set(positionKey(item.location.position), item.location.position);
    }
    for (const key of changed.keys()) {
      this.tileItemRevisions.set(key, (this.tileItemRevisions.get(key) ?? 0) + 1);
    }
    return [...changed.values()];
  }

  applyCreatedWorldItems(items: ReadonlyArray<ItemMutation["after"][number]>): Position[] {
    const changed = new Map<string, Position>();
    for (const item of items) {
      if (item.location.kind !== "world") continue;
      this.addDynamicWorldItem(item);
      const key = positionKey(item.location.position);
      changed.set(key, item.location.position);
      this.tileItemRevisions.set(key, (this.tileItemRevisions.get(key) ?? 0) + 1);
    }
    return [...changed.values()];
  }

  addDynamicWorldItem(item: WorldItemDeltas["items"][number]): void {
    if (item.location.kind !== "world") return;
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
