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
import type { LoadedInventory } from "./LoadedInventory";
import { projectInventory } from "./projectInventory";

interface InventoryCache {
  readonly capacityMax: number;
  readonly items: ReadonlyArray<Item>;
  readonly revision: number;
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
      | "rotate-item";
  }
>;

function isNear(left: Position, right: Position): boolean {
  return (
    left.z === right.z &&
    Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) <= 1
  );
}

export class ItemIntentHandler {
  private readonly inventories = new Map<string, InventoryCache>();
  private readonly pendingOperations = new Map<string, Promise<void>>();
  private readonly outcomes: Array<() => void> = [];

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
    };
    this.inventories.set(loaded.characterId, cache);
    return this.project(cache);
  }

  detach(characterId: string): void {
    this.inventories.delete(characterId);
  }

  applyResolvedOutcomes(): void {
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  handle(session: Session, intent: ItemIntent): void {
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
      }
      return;
    }
    const item =
      intent.type === "pickup-item"
        ? undefined
        : cache.items.find((candidate) => candidate.id === intent.itemId);
    if (intent.type !== "pickup-item" && !item) {
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
      session.send({ type: "inventory-updated", inventory: this.project(cache) });
      return;
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
        );
      case "drop-item":
        return this.store.drop(
          characterId,
          intent.itemId,
          intent.revision,
          intent.position,
          intent.count,
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
        const changedWorldTiles = this.world.applyItemMutation(mutation);
        this.visibility.onMapItemsChanged(changedWorldTiles);
        if (session.playerId !== characterId) return;
        const current = this.inventories.get(characterId);
        if (!current) return;
        const afterById = new Map(mutation.after.map((item) => [item.id, item]));
        const removed = new Set(mutation.removedItemIds ?? []);
        const items = current.items
          .filter(
            (item) => item.id !== mutation.before.id && !removed.has(item.id),
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
          revision: current.revision + 1,
        };
        this.inventories.set(characterId, next);
        session.send({ type: "inventory-updated", inventory: this.project(next) });
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

  private project(cache: InventoryCache): InventoryState {
    return projectInventory(
      cache.items,
      this.catalog,
      cache.capacityMax,
      cache.revision,
    );
  }
}
