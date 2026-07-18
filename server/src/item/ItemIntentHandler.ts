import type { InventoryState, Position } from "@tibia/protocol";
import type { Session } from "../Session";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { CorpseCreator } from "./CorpseCreator";
import type { DecayManager } from "./DecayManager";
import { InventoryCacheManager } from "./InventoryCacheManager";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemIntent } from "./ItemIntent";
import type { ItemMutation } from "./ItemMutation";
import { ItemOperationRunner } from "./ItemOperationRunner";
import { ItemOutcomeQueue } from "./ItemOutcomeQueue";
import type { ItemStore } from "./ItemStore";
import type { ItemType } from "./ItemType";
import type { LoadedInventory } from "./LoadedInventory";
import type { LootItemCreation } from "./LootItemCreation";
import { operationForItemIntent } from "./operationForItemIntent";
import { validateItemIntentTarget } from "./validateItemIntentTarget";
import { WorldItemDecayRunner } from "./WorldItemDecayRunner";

export class ItemIntentHandler {
  private readonly outcomes = new ItemOutcomeQueue();
  private readonly inventories: InventoryCacheManager;
  private readonly operations: ItemOperationRunner;
  private readonly corpses: CorpseCreator;
  private readonly decayRunner: WorldItemDecayRunner;

  constructor(
    private readonly store: ItemStore,
    private readonly catalog: ItemCatalog,
    private readonly world: World,
    visibility: Visibility,
    decay?: DecayManager,
  ) {
    this.inventories = new InventoryCacheManager(catalog);
    this.operations = new ItemOperationRunner(
      world,
      visibility,
      this.inventories,
      this.outcomes,
      decay,
    );
    this.corpses = new CorpseCreator(
      store,
      world,
      visibility,
      this.outcomes,
      decay,
    );
    this.decayRunner = new WorldItemDecayRunner(
      store,
      world,
      visibility,
      this.outcomes,
      decay,
    );
  }

  async load(characterId: string, capacityMax: number): Promise<LoadedInventory> {
    await this.operations.pending.get(characterId);
    return {
      characterId,
      capacityMax,
      items: await this.store.loadForCharacter(characterId),
    };
  }

  attach(loaded: LoadedInventory): InventoryState {
    return this.inventories.attach(loaded);
  }

  detach(characterId: string): void {
    this.inventories.detach(characterId);
  }

  inventorySnapshot(
    characterId: string,
  ): { items: ReadonlyArray<Item>; capacityMax: number } | null {
    return this.inventories.snapshot(characterId);
  }

  updateCapacity(
    characterId: string,
    capacityMax: number,
  ): InventoryState | null {
    return this.inventories.updateCapacity(characterId, capacityMax);
  }

  applyResolvedOutcomes(now: number): void {
    this.outcomes.applyAll(now);
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

  itemTypesByName(query: string): ReadonlyArray<ItemType> {
    return this.catalog.searchByName(query);
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
    this.operations.run(session, characterId, operation, {
      errorCode: "combat-action-failed",
      logLabel: "combat item consumption failed",
      onCommitted,
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
          const inventory = this.operations.applyMutation(
            characterId,
            result.mutation,
            now,
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
    this.operations.pending.track(characterId, resolution);
    return true;
  }

  applyCommittedMutation(
    session: Session,
    characterId: string,
    mutation: ItemMutation,
    now: number,
  ): void {
    const inventory = this.operations.applyMutation(characterId, mutation, now);
    if (inventory && session.playerId === characterId) {
      session.send({ type: "inventory-updated", inventory });
    }
  }

  trackExternalOperation(
    characterId: string,
    operation: Promise<void>,
  ): void {
    this.operations.pending.trackSwallowingErrors(characterId, operation);
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
    this.operations.run(session, characterId, operation, {
      errorCode: "item-action-failed",
      logLabel: "item use consumption failed",
      onCommitted,
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
    this.corpses.create(
      characterId,
      eventId,
      position,
      stackIndex,
      corpseTypeId,
      loot,
    );
  }

  /** Arms decay deadlines for world items loaded or created outside intents. */
  scheduleWorldDecay(items: ReadonlyArray<Item>, now: number): void {
    this.decayRunner.schedule(items, now);
  }

  tickDecay(now: number): void {
    this.decayRunner.tick(now);
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
      const inventory = this.inventories.closeContainer(
        playerId,
        intent.containerId,
      );
      if (!inventory) {
        session.sendError("item-action-failed");
        return;
      }
      session.send({ type: "inventory-updated", inventory });
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
      const inventory = this.inventories.openContainer(playerId, item!);
      if (!inventory) {
        session.sendError("item-action-failed");
        return;
      }
      session.send({ type: "inventory-updated", inventory });
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
    if (
      !validateItemIntentTarget(
        intent,
        item,
        player.position,
        cache,
        this.catalog,
        this.world,
      )
    ) {
      session.sendError("item-action-failed");
      return;
    }
    const operation = operationForItemIntent(
      this.store,
      this.catalog,
      this.world,
      playerId,
      intent,
      item,
    );
    if (!operation) {
      session.sendError("item-action-failed");
      return;
    }
    session.itemOperationPending = true;
    this.operations.run(session, playerId, operation, {
      errorCode: "item-action-failed",
      logLabel: "item operation failed",
    });
  }
}
