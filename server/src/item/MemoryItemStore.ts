import { randomUUID } from "node:crypto";
import type {
  EquipmentSlot,
  ItemContainerDestination,
  Position,
} from "@tibia/protocol";
import type { Item } from "./Item";
import type { ConjureItemResult } from "./ConjureItemResult";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemMutation } from "./ItemMutation";
import type { ItemStore } from "./ItemStore";
import type { LootItemCreation } from "./LootItemCreation";
import type { WorldItemDeltas } from "./WorldItemDeltas";
import type { WorldItemSource } from "./WorldItemSource";

export class MemoryItemStore implements ItemStore {
  private readonly items = new Map<string, Item>();
  private readonly characterVersions = new Map<string, number>();
  private readonly characterMana = new Map<string, number>();
  private readonly characterSoul = new Map<string, number>();

  constructor(private readonly catalog?: ItemCatalog) {}

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
      before.location.kind !== "inventory" &&
      before.location.kind !== "container"
    ) {
      throw new Error("item cannot be equipped from this location");
    }
    const occupied = [...this.items.values()].find(
      (item) =>
        item.id !== itemId &&
        item.location.kind === "equipment" &&
        item.location.characterId === characterId &&
        item.location.slot === slot,
    );
    if (occupied && before.location.kind === "container") {
      this.requireContainerPlacement(occupied.id, before.location.containerId);
    }
    const after = {
      ...before,
      version: before.version + 1,
      location: { kind: "equipment", characterId, slot } as const,
    };
    const displaced = occupied
      ? {
          ...occupied,
          version: occupied.version + 1,
          location: before.location,
        }
      : undefined;
    this.items.set(itemId, after);
    if (displaced) this.items.set(displaced.id, displaced);
    return { before, after: displaced ? [after, displaced] : [after] };
  }

  async unequip(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    slot: EquipmentSlot,
    destination?: ItemContainerDestination,
  ): Promise<ItemMutation> {
    const before = this.requireOwned(characterId, itemId, expectedVersion);
    if (
      before.location.kind !== "equipment" ||
      before.location.slot !== slot
    ) {
      throw new Error("item is not equipped in slot");
    }
    if (destination) {
      const container = this.requireOwned(
        characterId,
        destination.containerId,
        destination.containerRevision,
      );
      if (destination.slot < 0 || destination.slot >= 100) {
        throw new Error("container slot is out of range");
      }
      if (
        [...this.items.values()].some(
          (item) =>
            item.location.kind === "container" &&
            item.location.containerId === container.id &&
            item.location.slot === destination.slot,
        )
      ) {
        throw new Error("container slot is occupied");
      }
      this.requireContainerPlacement(before.id, container.id);
      const after = {
        ...before,
        version: before.version + 1,
        location: {
          kind: "container",
          containerId: container.id,
          slot: destination.slot,
        } as const,
      };
      this.items.set(itemId, after);
      return { before, after: [after] };
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
    _destination?: ItemContainerDestination,
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

  async moveWorldItem(
    _characterId: string,
    itemReference: string,
    expectedVersion: number,
    fromPosition: Position,
    toPosition: Position,
    _source?: WorldItemSource,
  ): Promise<ItemMutation> {
    const before = this.items.get(itemReference);
    if (!before) throw new Error("item not found");
    if (before.version !== expectedVersion) {
      throw new Error("stale item revision");
    }
    if (
      before.location.kind !== "world" ||
      before.location.position.x !== fromPosition.x ||
      before.location.position.y !== fromPosition.y ||
      before.location.position.z !== fromPosition.z
    ) {
      throw new Error("item is not at the expected position");
    }
    const occupiedSlots = new Set(
      [...this.items.values()]
        .filter(
          (item) =>
            item.location.kind === "world" &&
            item.location.position.x === toPosition.x &&
            item.location.position.y === toPosition.y &&
            item.location.position.z === toPosition.z,
        )
        .map((item) =>
          item.location.kind === "world" ? item.location.stackIndex : 0,
        ),
    );
    const stackIndex = Array.from({ length: 16 }, (_, index) => index).find(
      (index) => !occupiedSlots.has(index),
    );
    if (stackIndex === undefined) {
      throw new Error("world tile has too many items");
    }
    const after = {
      ...before,
      version: before.version + 1,
      location: {
        kind: "world",
        position: { ...toPosition },
        stackIndex,
      } as const,
    };
    this.items.set(after.id, after);
    return { before, after: [after] };
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

  async moveToContainer(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    destinationContainerId: string,
    destinationVersion: number,
    destinationSlot: number,
    count?: number,
  ): Promise<ItemMutation> {
    const before = this.requireOwned(characterId, itemId, expectedVersion);
    const destination = this.requireOwned(
      characterId,
      destinationContainerId,
      destinationVersion,
    );
    if (before.id === destination.id) {
      throw new Error("an item cannot contain itself");
    }
    if (
      before.location.kind !== "inventory" &&
      before.location.kind !== "container"
    ) {
      throw new Error("item cannot move from this location");
    }
    this.requireContainerPlacement(before.id, destination.id);
    const movingCount = count ?? before.count;
    if (
      !Number.isInteger(movingCount) ||
      movingCount < 1 ||
      movingCount > before.count
    ) {
      throw new Error("invalid move count");
    }
    if (!Number.isInteger(destinationSlot) || destinationSlot < 0 || destinationSlot >= 100) {
      throw new Error("container slot is out of range");
    }
    if (
      before.location.kind === "container" &&
      before.location.containerId === destination.id &&
      before.location.slot === destinationSlot
    ) {
      throw new Error("item is already in destination slot");
    }
    const occupied = [...this.items.values()].find(
      (item) =>
        item.id !== before.id &&
        (item.location.kind === "container" ||
          item.location.kind === "corpse") &&
        item.location.containerId === destination.id &&
        item.location.slot === destinationSlot,
    );
    if (occupied && movingCount !== before.count) {
      throw new Error("cannot split into an occupied slot");
    }
    if (occupied && before.location.kind === "container") {
      this.requireContainerPlacement(occupied.id, before.location.containerId);
    }
    if (movingCount === before.count) {
      const after = {
        ...before,
        version: before.version + 1,
        location: {
          kind: "container",
          containerId: destination.id,
          slot: destinationSlot,
        } as const,
      };
      this.items.set(after.id, after);
      if (!occupied) return { before, after: [after] };
      const displaced = {
        ...occupied,
        version: occupied.version + 1,
        location: before.location,
      };
      this.items.set(displaced.id, displaced);
      return { before, after: [after, displaced] };
    }
    const sourceAfter = {
      ...before,
      count: before.count - movingCount,
      version: before.version + 1,
    };
    const { seedKey: _seedKey, ...copyable } = before;
    const created: Item = {
      ...copyable,
      id: randomUUID(),
      count: movingCount,
      version: 1,
      location: {
        kind: "container",
        containerId: destination.id,
        slot: destinationSlot,
      },
    };
    this.items.set(sourceAfter.id, sourceAfter);
    this.items.set(created.id, created);
    return { before, after: [sourceAfter, created] };
  }

  async writeText(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    text: string,
  ): Promise<ItemMutation> {
    const before = this.requireOwned(characterId, itemId, expectedVersion);
    const after = {
      ...before,
      attributes: { ...before.attributes, text },
      version: before.version + 1,
    };
    this.items.set(after.id, after);
    return { before, after: [after] };
  }

  async consume(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    count: number,
    _reason: "rune" | "ammunition" | "break" | "food",
  ): Promise<ItemMutation> {
    const before = this.requireOwned(characterId, itemId, expectedVersion);
    if (!Number.isInteger(count) || count < 1 || count > before.count) {
      throw new Error("invalid consume count");
    }
    if (count === before.count) {
      this.items.delete(itemId);
      return { before, after: [], removedItemIds: [itemId] };
    }
    const after = {
      ...before,
      count: before.count - count,
      version: before.version + 1,
    };
    this.items.set(itemId, after);
    return { before, after: [after] };
  }

  async conjure(
    characterId: string,
    expectedCharacterVersion: number,
    expectedMana: number,
    expectedSoul: number,
    manaCost: number,
    soulCost: number,
    sourceItemTypeId: number,
    targetItemTypeId: number,
    count: number,
  ): Promise<ConjureItemResult> {
    if (
      !Number.isInteger(expectedCharacterVersion) ||
      expectedCharacterVersion < 1 ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100 ||
      expectedMana < manaCost ||
      expectedSoul < soulCost
    ) {
      throw new Error("invalid conjure request");
    }
    const currentVersion =
      this.characterVersions.get(characterId) ?? expectedCharacterVersion;
    const currentMana = this.characterMana.get(characterId) ?? expectedMana;
    const currentSoul = this.characterSoul.get(characterId) ?? expectedSoul;
    if (
      currentVersion !== expectedCharacterVersion ||
      currentMana !== expectedMana ||
      currentSoul !== expectedSoul
    ) {
      throw new Error("character resources are stale");
    }
    const source =
      sourceItemTypeId === 0
        ? undefined
        : [...this.items.values()].find((item) => {
            if (item.typeId !== sourceItemTypeId) return false;
            try {
              this.requireOwned(characterId, item.id, item.version);
              return true;
            } catch {
              return false;
            }
          });
    if (sourceItemTypeId !== 0 && !source) {
      throw new Error("conjure source item is missing");
    }
    if (source?.count === 1) {
      const after = {
        ...source,
        typeId: targetItemTypeId,
        count,
        attributes: {},
        version: source.version + 1,
      };
      this.items.set(after.id, after);
      this.commitConjureResources(
        characterId,
        expectedCharacterVersion,
        expectedMana,
        expectedSoul,
        manaCost,
        soulCost,
      );
      return {
        mutation: { before: source, after: [after] },
        characterVersion: expectedCharacterVersion + 1,
      };
    }
    const backpack = [...this.items.values()].find(
      (item) =>
        item.location.kind === "equipment" &&
        item.location.characterId === characterId &&
        item.location.slot === "backpack",
    );
    if (!backpack) throw new Error("equipped backpack is missing");
    const occupied = new Set(
      [...this.items.values()].flatMap((item) =>
        item.location.kind === "container" &&
        item.location.containerId === backpack.id
          ? [item.location.slot]
          : [],
      ),
    );
    const slot = Array.from({ length: 100 }, (_, index) => index).find(
      (index) => !occupied.has(index),
    );
    if (slot === undefined) throw new Error("backpack is full");
    const after: Item[] = [];
    if (source) {
      const remaining = {
        ...source,
        count: source.count - 1,
        version: source.version + 1,
      };
      this.items.set(remaining.id, remaining);
      after.push(remaining);
    }
    const created: Item = {
      id: randomUUID(),
      typeId: targetItemTypeId,
      count,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: backpack.id, slot },
    };
    this.items.set(created.id, created);
    after.push(created);
    this.commitConjureResources(
      characterId,
      expectedCharacterVersion,
      expectedMana,
      expectedSoul,
      manaCost,
      soulCost,
    );
    return {
      mutation: { ...(source ? { before: source } : {}), after },
      characterVersion: expectedCharacterVersion + 1,
    };
  }

  private commitConjureResources(
    characterId: string,
    expectedCharacterVersion: number,
    expectedMana: number,
    expectedSoul: number,
    manaCost: number,
    soulCost: number,
  ): void {
    this.characterVersions.set(characterId, expectedCharacterVersion + 1);
    this.characterMana.set(characterId, expectedMana - manaCost);
    this.characterSoul.set(characterId, expectedSoul - soulCost);
  }

  async createCorpse(
    characterId: string | null,
    _eventId: string,
    position: Position,
    stackIndex: number,
    corpseTypeId: number,
    loot: ReadonlyArray<LootItemCreation>,
  ): Promise<ReadonlyArray<Item>> {
    const corpseId = randomUUID();
    const corpse: Item = {
      id: corpseId,
      typeId: corpseTypeId,
      count: 1,
      attributes: characterId ? { ownerCharacterId: characterId } : {},
      version: 1,
      location: { kind: "world", position: { ...position }, stackIndex },
    };
    const contents = loot.map<Item>((entry, slot) => ({
      id: randomUUID(),
      typeId: entry.typeId,
      count: entry.count,
      attributes: {},
      version: 1,
      location: { kind: "corpse", containerId: corpseId, slot },
    }));
    this.items.set(corpse.id, corpse);
    for (const item of contents) this.items.set(item.id, item);
    return [corpse, ...contents];
  }

  async decayWorldItem(
    itemId: string,
    expectedVersion: number,
  ): Promise<ItemMutation> {
    if (!this.catalog) throw new Error("memory decay is not configured");
    const before = this.items.get(itemId);
    if (!before || before.version !== expectedVersion) {
      throw new Error("item is missing or stale");
    }
    if (before.location.kind !== "world") {
      throw new Error("item is not on the map");
    }
    const decay = this.catalog.require(before.typeId).decay;
    if (!decay || decay.durationSeconds === undefined) {
      throw new Error("item does not decay");
    }
    const targetTypeId = decay.targetId || undefined;
    if (targetTypeId === undefined) {
      const removedItemIds = [before.id, ...this.descendantIds(before.id)];
      for (const id of removedItemIds) this.items.delete(id);
      return { before, after: [], removedItemIds };
    }
    const capacity = this.catalog.require(targetTypeId).containerCapacity ?? 0;
    const removedItemIds = this.descendantIds(before.id, capacity);
    for (const id of removedItemIds) this.items.delete(id);
    const after = {
      ...before,
      typeId: targetTypeId,
      attributes: {},
      version: before.version + 1,
    };
    this.items.set(after.id, after);
    return { before, after: [after], removedItemIds };
  }

  async loadWorldDeltas(
    _mapName: string,
    _mapVersion: string,
  ): Promise<WorldItemDeltas> {
    return { hiddenSeedKeys: [], items: [] };
  }

  /** Children in slots >= keepSlots plus their whole subtrees, depth-capped at 8. */
  private descendantIds(rootId: string, keepSlots = 0): string[] {
    const removed: string[] = [];
    let parents = new Set([rootId]);
    for (let depth = 0; depth < 8 && parents.size > 0; depth++) {
      const next = new Set<string>();
      for (const item of this.items.values()) {
        if (
          item.location.kind !== "container" &&
          item.location.kind !== "corpse"
        ) {
          continue;
        }
        if (!parents.has(item.location.containerId)) continue;
        if (
          depth === 0 &&
          item.location.containerId === rootId &&
          item.location.slot < keepSlots
        ) {
          continue;
        }
        removed.push(item.id);
        next.add(item.id);
      }
      parents = next;
    }
    return removed;
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
    let root = item;
    for (let depth = 0; depth < 8; depth++) {
      if (
        (root.location.kind === "equipment" ||
          root.location.kind === "inventory") &&
        root.location.characterId === characterId
      ) {
        return item;
      }
      if (
        root.location.kind !== "container" &&
        root.location.kind !== "corpse"
      ) {
        break;
      }
      const parent = this.items.get(root.location.containerId);
      if (!parent) break;
      root = parent;
    }
    throw new Error("item is not owned by character");
  }

  private requireContainerPlacement(
    itemId: string,
    destinationContainerId: string,
  ): void {
    let parent = this.items.get(destinationContainerId);
    for (let depth = 0; parent && depth < 8; depth++) {
      if (parent.id === itemId) throw new Error("item container cycle detected");
      parent =
        parent.location.kind === "container" ||
        parent.location.kind === "corpse"
          ? this.items.get(parent.location.containerId)
          : undefined;
    }
    if (parent) throw new Error("item container nesting exceeds 8 levels");
  }
}
