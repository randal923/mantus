import type { EquipmentSlot, Position } from "@tibia/protocol";
import type { Item } from "./Item";
import type { ItemMutation } from "./ItemMutation";
import type { ItemStore } from "./ItemStore";
import type { WorldItemDeltas } from "./WorldItemDeltas";
import type { WorldItemSource } from "./WorldItemSource";

export class MemoryItemStore implements ItemStore {
  private readonly items = new Map<string, Item>();

  seed(item: Item): void {
    this.items.set(item.id, item);
  }

  async loadForCharacter(characterId: string): Promise<ReadonlyArray<Item>> {
    const owned = new Set(
      [...this.items.values()]
        .filter(
          (item) =>
            (item.location.kind === "equipment" ||
              item.location.kind === "inventory") &&
            item.location.characterId === characterId,
        )
        .map((item) => item.id),
    );
    for (let depth = 0; depth < 8; depth++) {
      let changed = false;
      for (const item of this.items.values()) {
        if (
          (item.location.kind === "container" ||
            item.location.kind === "corpse") &&
          owned.has(item.location.containerId) &&
          !owned.has(item.id)
        ) {
          owned.add(item.id);
          changed = true;
        }
      }
      if (!changed) break;
    }
    return [...owned].flatMap((id) => {
      const item = this.items.get(id);
      return item ? [item] : [];
    });
  }

  async equip(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    slot: EquipmentSlot,
  ): Promise<ItemMutation> {
    const before = this.requireOwned(characterId, itemId, expectedVersion);
    if (
      [...this.items.values()].some(
        (item) =>
          item.id !== itemId &&
          item.location.kind === "equipment" &&
          item.location.characterId === characterId &&
          item.location.slot === slot,
      )
    ) {
      throw new Error("equipment slot is occupied");
    }
    const after = {
      ...before,
      version: before.version + 1,
      location: { kind: "equipment", characterId, slot } as const,
    };
    this.items.set(itemId, after);
    return { before, after: [after] };
  }

  async unequip(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    slot: EquipmentSlot,
  ): Promise<ItemMutation> {
    const before = this.requireOwned(characterId, itemId, expectedVersion);
    if (
      before.location.kind !== "equipment" ||
      before.location.slot !== slot
    ) {
      throw new Error("item is not equipped in slot");
    }
    const destinationSlot = [...this.items.values()].filter(
      (item) =>
        item.location.kind === "inventory" &&
        item.location.characterId === characterId,
    ).length;
    const after = {
      ...before,
      version: before.version + 1,
      location: {
        kind: "inventory",
        characterId,
        slot: destinationSlot,
      } as const,
    };
    this.items.set(itemId, after);
    return { before, after: [after] };
  }

  pickup(
    _characterId: string,
    _itemReference: string,
    _expectedVersion: number,
    _position: Position,
    _source?: WorldItemSource,
  ): Promise<ItemMutation> {
    return Promise.reject(new Error("memory pickup is not configured"));
  }

  drop(
    _characterId: string,
    _itemId: string,
    _expectedVersion: number,
    _position: Position,
    _count?: number,
  ): Promise<ItemMutation> {
    return Promise.reject(new Error("memory drop is not configured"));
  }

  split(
    _characterId: string,
    _itemId: string,
    _expectedVersion: number,
    _count: number,
  ): Promise<ItemMutation> {
    return Promise.reject(new Error("memory split is not configured"));
  }

  rotate(
    _characterId: string,
    _itemId: string,
    _expectedVersion: number,
  ): Promise<ItemMutation> {
    return Promise.reject(new Error("memory rotate is not configured"));
  }

  async loadWorldDeltas(
    _mapName: string,
    _mapVersion: string,
  ): Promise<WorldItemDeltas> {
    return { hiddenSeedKeys: [], items: [] };
  }

  private requireOwned(
    characterId: string,
    itemId: string,
    expectedVersion: number,
  ): Item {
    const item = this.items.get(itemId);
    if (!item || item.version !== expectedVersion) {
      throw new Error("item is missing or stale");
    }
    if (
      (item.location.kind !== "equipment" &&
        item.location.kind !== "inventory") ||
      item.location.characterId !== characterId
    ) {
      throw new Error("item is not owned by character");
    }
    return item;
  }
}
