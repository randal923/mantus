import type {
  ClientMessage,
  EquipmentSlot,
  InventoryState,
  Position,
} from "@tibia/protocol";
import type { Session } from "../Session";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemMutation } from "./ItemMutation";
import type { ItemStore } from "./ItemStore";
import type { ItemType } from "./ItemType";
import type { LoadedInventory } from "./LoadedInventory";
import type { LootItemCreation } from "./LootItemCreation";
import { projectInventory } from "./projectInventory";

interface InventoryCache {
  readonly capacityMax: number;
  readonly items: ReadonlyArray<Item>;
  readonly revision: number;
  readonly openContainerIds: ReadonlySet<string>;
}

type ItemIntent = Extract<
  ClientMessage,
  {
    type:
      | "equip-item"
      | "unequip-item"
      | "pickup-item"
      | "drop-item"
      | "open-container"
      | "close-container"
      | "use-item"
      | "use-item-with"
      | "split-stack"
      | "rotate-item"
      | "move-item"
      | "move-map-item"
      | "write-item";
  }
>;

/** Furthest tile a map item may be thrown to, in tiles from the player. */
const THROW_RANGE = 7;

function isNear(left: Position, right: Position): boolean {
  return (
    left.z === right.z &&
    Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) <= 1
  );
}

export class ItemIntentHandler {
  private readonly inventories = new Map<string, InventoryCache>();
  private readonly pendingOperations = new Map<string, Promise<void>>();
  private readonly pendingCorpseOperations = new Map<string, Promise<void>>();
  private readonly outcomes: Array<(now: number) => void> = [];

  constructor(
    private readonly store: ItemStore,
    private readonly catalog: ItemCatalog,
    private readonly world: World,
    private readonly visibility: Visibility,
  ) {}

  async load(characterId: string, capacityMax: number): Promise<LoadedInventory> {
    await this.pendingOperations.get(characterId);
    return {
      characterId,
      capacityMax,
      items: await this.store.loadForCharacter(characterId),
    };
  }

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

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  combatEquipment(
    characterId: string,
  ): ReadonlyArray<{ item: Item; type: ItemType }> {
    const cache = this.inventories.get(characterId);
    if (!cache) return [];
    return cache.items.flatMap((item) =>
      item.location.kind === "equipment"
        ? [{ item, type: this.catalog.require(item.typeId) }]
        : [],
    );
  }

  itemType(itemTypeId: number): ItemType | undefined {
    return this.catalog.get(itemTypeId);
  }

  itemTypeByName(name: string): ItemType | undefined {
    return this.catalog.findByName(name);
  }

  combatItem(
    characterId: string,
    itemId: string,
    revision: number,
  ): { item: Item; type: ItemType } | null {
    const item = this.inventories
      .get(characterId)
      ?.items.find(
        (candidate) =>
          candidate.id === itemId && candidate.version === revision,
      );
    return item ? { item, type: this.catalog.require(item.typeId) } : null;
  }

  consumeForCombat(
    session: Session,
    itemId: string,
    revision: number,
    reason: "rune" | "ammunition" | "break",
    onCommitted: (now: number) => void,
  ): boolean {
    const characterId = session.playerId;
    const combatItem = characterId
      ? this.combatItem(characterId, itemId, revision)
      : null;
    if (
      !characterId ||
      !combatItem ||
      session.itemOperationPending ||
      combatItem.item.count < 1
    ) {
      session.sendError("combat-action-failed");
      return false;
    }
    session.itemOperationPending = true;
    const operation = this.store.consume(
      characterId,
      itemId,
      revision,
      1,
      reason,
    );
    const resolution = this.resolveCombatConsumption(
      session,
      characterId,
      operation,
      onCommitted,
    );
    this.pendingOperations.set(characterId, resolution);
    void resolution.finally(() => {
      if (this.pendingOperations.get(characterId) === resolution) {
        this.pendingOperations.delete(characterId);
      }
    });
    return true;
  }

  conjureForCombat(
    session: Session,
    expectedCharacterVersion: Promise<number>,
    expectedMana: number,
    expectedSoul: number,
    manaCost: number,
    soulCost: number,
    sourceItemTypeId: number,
    targetItemTypeId: number,
    count: number,
    onCommitted: (
      expectedVersion: number,
      characterVersion: number,
      now: number,
    ) => void,
    onFailed: (now: number) => void,
  ): boolean {
    const characterId = session.playerId;
    if (!characterId || session.itemOperationPending) {
      session.sendError("combat-action-failed");
      return false;
    }
    session.itemOperationPending = true;
    const operation = expectedCharacterVersion.then(async (version) => ({
      expectedVersion: version,
      result: await this.store.conjure(
        characterId,
        version,
        expectedMana,
        expectedSoul,
        manaCost,
        soulCost,
        sourceItemTypeId,
        targetItemTypeId,
        count,
      ),
    }));
    const resolution = operation
      .then(({ expectedVersion, result }) => {
        this.outcomes.push((now) => {
          session.itemOperationPending = false;
          onCommitted(
            expectedVersion,
            result.characterVersion,
            now,
          );
          const inventory = this.applyMutation(
            characterId,
            result.mutation,
          );
          if (inventory && session.playerId === characterId) {
            session.send({ type: "inventory-updated", inventory });
          }
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(
          `conjuring failed for character ${characterId}: ${reason}`,
        );
        this.outcomes.push((now) => {
          session.itemOperationPending = false;
          onFailed(now);
          if (session.playerId === characterId) {
            session.sendError("combat-action-failed");
          }
        });
      });
    this.pendingOperations.set(characterId, resolution);
    void resolution.finally(() => {
      if (this.pendingOperations.get(characterId) === resolution) {
        this.pendingOperations.delete(characterId);
      }
    });
    return true;
  }

  private consumeForUse(
    session: Session,
    itemId: string,
    revision: number,
    onCommitted: (now: number) => void,
  ): void {
    const characterId = session.playerId;
    if (!characterId || session.itemOperationPending) {
      session.sendError("item-action-failed");
      return;
    }
    session.itemOperationPending = true;
    const operation = this.store.consume(
      characterId,
      itemId,
      revision,
      1,
      "food",
    );
    const resolution = this.resolveUseConsumption(
      session,
      characterId,
      operation,
      onCommitted,
    );
    this.pendingOperations.set(characterId, resolution);
    void resolution.finally(() => {
      if (this.pendingOperations.get(characterId) === resolution) {
        this.pendingOperations.delete(characterId);
      }
    });
  }

  createCorpse(
    characterId: string | null,
    eventId: string,
    position: Position,
    stackIndex: number,
    corpseTypeId: number,
    loot: ReadonlyArray<LootItemCreation>,
  ): void {
    if (this.pendingCorpseOperations.has(eventId)) return;
    const operation = this.store.createCorpse(
      characterId,
      eventId,
      position,
      stackIndex,
      corpseTypeId,
      loot,
    );
    const resolution = operation
      .then((items) => {
        this.outcomes.push(() => {
          const positions = this.world.applyCreatedWorldItems(items);
          this.visibility.onMapItemsChanged(positions);
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`corpse creation failed for ${eventId}: ${reason}`);
      });
    this.pendingCorpseOperations.set(eventId, resolution);
    void resolution.finally(() => {
      if (this.pendingCorpseOperations.get(eventId) === resolution) {
        this.pendingCorpseOperations.delete(eventId);
      }
    });
  }

  handle(session: Session, intent: ItemIntent, now = Date.now()): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    const cache = playerId ? this.inventories.get(playerId) : undefined;
    if (!playerId || !player || !cache) {
      session.sendError("join-required");
      return;
    }
    if (session.itemOperationPending) {
      session.sendError("item-action-failed");
      return;
    }
    if (intent.type === "close-container") {
      const container = cache.items.find((item) => item.id === intent.containerId);
      if (!container || this.catalog.require(container.typeId).containerCapacity === undefined) {
        session.sendError("item-action-failed");
        return;
      }
      const openContainerIds = new Set(cache.openContainerIds);
      openContainerIds.delete(container.id);
      const updated = {
        ...cache,
        openContainerIds,
        revision: cache.revision + 1,
      };
      this.inventories.set(playerId, updated);
      session.send({
        type: "inventory-updated",
        inventory: this.project(updated),
      });
      return;
    }
    const item =
      intent.type === "pickup-item" || intent.type === "move-map-item"
        ? undefined
        : cache.items.find((candidate) => candidate.id === intent.itemId);
    if (
      intent.type !== "pickup-item" &&
      intent.type !== "move-map-item" &&
      !item
    ) {
      session.sendError("item-action-failed");
      return;
    }
    if (item && item.version !== intent.revision) {
      session.sendError("item-action-failed");
      return;
    }
    if (intent.type === "open-container") {
      if (this.catalog.require(item!.typeId).containerCapacity === undefined) {
        session.sendError("item-action-failed");
        return;
      }
      const openContainerIds = new Set(cache.openContainerIds);
      if (
        !openContainerIds.has(item!.id) &&
        openContainerIds.size >= 16
      ) {
        session.sendError("item-action-failed");
        return;
      }
      openContainerIds.add(item!.id);
      const updated = {
        ...cache,
        openContainerIds,
        revision: cache.revision + 1,
      };
      this.inventories.set(playerId, updated);
      session.send({
        type: "inventory-updated",
        inventory: this.project(updated),
      });
      return;
    }
    if (intent.type === "use-item") {
      const type = this.catalog.require(item!.typeId);
      if (type.food) {
        if (!player.canFeed(type.food.durationSeconds, now)) {
          session.sendError("player-full");
          return;
        }
        this.consumeForUse(
          session,
          item!.id,
          item!.version,
          (now) => {
            player.feed(type.food!.durationSeconds, now);
            session.send({
              type: "combat-log",
              kind: "condition",
              text: type.food!.message,
            });
          },
        );
        return;
      }
      if (type.text?.readable) {
        const text = item!.attributes.text;
        session.send({
          type: "item-text",
          itemId: item!.id,
          revision: item!.version,
          name: type.name,
          text: typeof text === "string" ? text : "",
          writeable: type.text.writeable,
          maxLength: type.text.maxLength,
        });
        return;
      }
    }
    if (intent.type === "move-item") {
      const destination = cache.items.find(
        (candidate) => candidate.id === intent.destinationContainerId,
      );
      if (
        !destination ||
        destination.version !== intent.destinationRevision ||
        this.catalog.require(destination.typeId).containerCapacity === undefined ||
        intent.destinationSlot >=
          (this.catalog.require(destination.typeId).containerCapacity ?? 0)
      ) {
        session.sendError("item-action-failed");
        return;
      }
      const type = this.catalog.require(item!.typeId);
      if (
        intent.count !== undefined &&
        (!type.stackable || intent.count > item!.count)
      ) {
        session.sendError("item-action-failed");
        return;
      }
    }
    if (
      (intent.type === "pickup-item" || intent.type === "unequip-item") &&
      intent.destination
    ) {
      const destination = cache.items.find(
        (candidate) => candidate.id === intent.destination!.containerId,
      );
      if (
        !destination ||
        destination.version !== intent.destination.containerRevision ||
        intent.destination.slot >=
          (this.catalog.require(destination.typeId).containerCapacity ?? 0)
      ) {
        session.sendError("item-action-failed");
        return;
      }
    }
    if (intent.type === "write-item") {
      const type = this.catalog.require(item!.typeId);
      if (
        !type.text?.writeable ||
        intent.text.length > type.text.maxLength
      ) {
        session.sendError("item-action-failed");
        return;
      }
    }
    if (
      (intent.type === "drop-item" || intent.type === "use-item-with") &&
      (!isNear(player.position, intent.type === "drop-item" ? intent.position : intent.targetPosition) ||
        !this.world.getTile(
          intent.type === "drop-item" ? intent.position : intent.targetPosition,
        ))
    ) {
      session.sendError("item-action-failed");
      return;
    }
    if (intent.type === "pickup-item") {
      const visible = this.world
        .getMapItems(intent.position)
        .find((candidate) => candidate.instanceId === intent.itemId);
      if (
        !isNear(player.position, intent.position) ||
        !visible ||
        (visible.revision ?? 1) !== intent.revision
      ) {
        session.sendError("item-action-failed");
        return;
      }
    }
    if (intent.type === "move-map-item") {
      const visible = this.world
        .getMapItems(intent.fromPosition)
        .find((candidate) => candidate.instanceId === intent.itemId);
      if (
        !isNear(player.position, intent.fromPosition) ||
        !visible ||
        (visible.revision ?? 1) !== intent.revision ||
        intent.toPosition.z !== player.position.z ||
        Math.max(
          Math.abs(intent.toPosition.x - player.position.x),
          Math.abs(intent.toPosition.y - player.position.y),
        ) > THROW_RANGE ||
        !this.world.getTile(intent.toPosition)
      ) {
        session.sendError("item-action-failed");
        return;
      }
    }
    const operation = this.operationFor(playerId, intent, item);
    if (!operation) {
      session.sendError("item-action-failed");
      return;
    }
    session.itemOperationPending = true;
    const resolution = this.resolve(session, playerId, operation);
    this.pendingOperations.set(playerId, resolution);
    void resolution.finally(() => {
      if (this.pendingOperations.get(playerId) === resolution) {
        this.pendingOperations.delete(playerId);
      }
    });
  }

  private operationFor(
    characterId: string,
    intent: ItemIntent,
    item: Item | undefined,
  ): Promise<ItemMutation> | null {
    switch (intent.type) {
      case "equip-item":
        return this.store.equip(
          characterId,
          intent.itemId,
          intent.revision,
          intent.slot,
        );
      case "unequip-item":
        return this.store.unequip(
          characterId,
          intent.itemId,
          intent.revision,
          intent.slot,
          intent.destination,
        );
      case "pickup-item":
        return this.store.pickup(
          characterId,
          intent.itemId,
          intent.revision,
          intent.position,
          this.world
            .getMapItems(intent.position)
            .find((candidate) => candidate.instanceId === intent.itemId)?.source,
          intent.destination,
        );
      case "drop-item":
        return this.store.drop(
          characterId,
          intent.itemId,
          intent.revision,
          intent.position,
          intent.count,
        );
      case "move-map-item":
        return this.store.moveWorldItem(
          characterId,
          intent.itemId,
          intent.revision,
          intent.fromPosition,
          intent.toPosition,
          this.world
            .getMapItems(intent.fromPosition)
            .find((candidate) => candidate.instanceId === intent.itemId)
            ?.source,
        );
      case "split-stack":
        return this.store.split(
          characterId,
          intent.itemId,
          intent.revision,
          intent.count,
        );
      case "rotate-item":
        return this.store.rotate(characterId, intent.itemId, intent.revision);
      case "move-item":
        return this.store.moveToContainer(
          characterId,
          intent.itemId,
          intent.revision,
          intent.destinationContainerId,
          intent.destinationRevision,
          intent.destinationSlot,
          intent.count,
        );
      case "write-item":
        return this.store.writeText(
          characterId,
          intent.itemId,
          intent.revision,
          intent.text,
        );
      case "use-item":
      case "use-item-with":
        if (!item || !this.catalog.require(item.typeId).rotateTo) return null;
        return this.store.rotate(characterId, intent.itemId, intent.revision);
      case "open-container":
      case "close-container":
        return null;
    }
  }

  private async resolve(
    session: Session,
    characterId: string,
    operation: Promise<ItemMutation>,
  ): Promise<void> {
    try {
      const mutation = await operation;
      this.outcomes.push(() => {
        session.itemOperationPending = false;
        const inventory = this.applyMutation(characterId, mutation);
        if (inventory && session.playerId === characterId) {
          session.send({ type: "inventory-updated", inventory });
        }
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`item operation failed for character ${characterId}: ${reason}`);
      this.outcomes.push(() => {
        session.itemOperationPending = false;
        if (session.playerId === characterId) {
          session.sendError("item-action-failed");
        }
      });
    }
  }

  private async resolveCombatConsumption(
    session: Session,
    characterId: string,
    operation: Promise<ItemMutation>,
    onCommitted: (now: number) => void,
  ): Promise<void> {
    try {
      const mutation = await operation;
      this.outcomes.push((now) => {
        session.itemOperationPending = false;
        const inventory = this.applyMutation(characterId, mutation);
        if (inventory && session.playerId === characterId) {
          session.send({ type: "inventory-updated", inventory });
        }
        if (session.playerId !== characterId) return;
        onCommitted(now);
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `combat item consumption failed for character ${characterId}: ${reason}`,
      );
      this.outcomes.push(() => {
        session.itemOperationPending = false;
        if (session.playerId === characterId) {
          session.sendError("combat-action-failed");
        }
      });
    }
  }

  private async resolveUseConsumption(
    session: Session,
    characterId: string,
    operation: Promise<ItemMutation>,
    onCommitted: (now: number) => void,
  ): Promise<void> {
    try {
      const mutation = await operation;
      this.outcomes.push((now) => {
        session.itemOperationPending = false;
        const inventory = this.applyMutation(characterId, mutation);
        if (inventory && session.playerId === characterId) {
          session.send({ type: "inventory-updated", inventory });
        }
        if (session.playerId === characterId) onCommitted(now);
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `item use consumption failed for character ${characterId}: ${reason}`,
      );
      this.outcomes.push(() => {
        session.itemOperationPending = false;
        if (session.playerId === characterId) {
          session.sendError("item-action-failed");
        }
      });
    }
  }

  private applyMutation(
    characterId: string,
    mutation: ItemMutation,
  ): InventoryState | null {
    const changedWorldTiles = this.world.applyItemMutation(mutation);
    this.visibility.onMapItemsChanged(changedWorldTiles);
    const current = this.inventories.get(characterId);
    if (!current) return null;
    const afterById = new Map(mutation.after.map((item) => [item.id, item]));
    const removed = new Set(mutation.removedItemIds ?? []);
    const items = current.items
      .filter(
        (item) =>
          item.id !== mutation.before?.id && !removed.has(item.id),
      )
      .map((item) => afterById.get(item.id) ?? item);
    for (const after of mutation.after) {
      if (
        after.location.kind === "world" ||
        items.some((item) => item.id === after.id)
      ) {
        continue;
      }
      items.push(after);
    }
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
