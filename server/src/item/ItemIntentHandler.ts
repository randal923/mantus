import type {
  EquipmentSlot,
  InventoryState,
  Position,
} from "@tibia/protocol";
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
import { planCarriedIntent } from "./plan/planCarriedIntent";
import { planEquip } from "./plan/planEquip";
import { validateItemIntentTarget } from "./validateItemIntentTarget";
import { WorldItemDecayRunner } from "./WorldItemDecayRunner";

interface PersistQueueState {
  chain: Promise<void>;
  depth: number;
  poisoned: boolean;
}

export class ItemIntentHandler {
  private readonly outcomes = new ItemOutcomeQueue();
  private readonly inventories: InventoryCacheManager;
  private readonly operations: ItemOperationRunner;
  private readonly corpses: CorpseCreator;
  private readonly decayRunner: WorldItemDecayRunner;
  private readonly persistQueues = new Map<string, PersistQueueState>();
  private readonly pendingPersistOperations = new Set<Promise<void>>();

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
      session.itemPersistsPending > 0 ||
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
    if (
      !characterId ||
      session.itemOperationPending ||
      session.itemPersistsPending > 0
    ) {
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

  /**
   * Queues the DB write behind an already-applied memory mutation (depot or
   * carried). Writes for one character run strictly in order; a failed write
   * poisons the queue, skips the rest, and disconnects the session so the
   * next login reloads authoritative state from the DB.
   */
  enqueuePersist(
    session: Session,
    characterId: string,
    persist: () => Promise<void>,
  ): void {
    const state = this.persistQueues.get(characterId) ?? {
      chain: Promise.resolve(),
      depth: 0,
      poisoned: false,
    };
    this.persistQueues.set(characterId, state);
    state.depth += 1;
    session.itemPersistsPending += 1;
    state.chain = state.chain
      .then(async () => {
        if (state.poisoned) return;
        await persist();
      })
      .then(
        () => {
          this.outcomes.push(() =>
            this.finishPersist(session, characterId, state),
          );
        },
        (cause: unknown) => {
          state.poisoned = true;
          const reason = cause instanceof Error ? cause.message : "unknown";
          this.outcomes.push(() => {
            this.finishPersist(session, characterId, state);
            console.error(
              `item persist failed for ${characterId}: ${reason}; disconnecting to resync from DB`,
            );
            session.terminate();
          });
        },
      );
    const settled = state.chain;
    this.operations.pending.trackSwallowingErrors(characterId, settled);
    this.pendingPersistOperations.add(settled);
    void settled.finally(() => this.pendingPersistOperations.delete(settled));
  }

  isPersistPoisoned(characterId: string): boolean {
    return this.persistQueues.get(characterId)?.poisoned ?? false;
  }

  clearPersistState(characterId: string): void {
    this.persistQueues.delete(characterId);
  }

  async stopPersists(): Promise<void> {
    await Promise.allSettled([...this.pendingPersistOperations]);
  }

  private finishPersist(
    session: Session,
    characterId: string,
    state: PersistQueueState,
  ): void {
    state.depth -= 1;
    session.itemPersistsPending = Math.max(0, session.itemPersistsPending - 1);
    if (
      state.depth === 0 &&
      !state.poisoned &&
      this.persistQueues.get(characterId) === state
    ) {
      this.persistQueues.delete(characterId);
    }
  }

  private consumeForUse(
    session: Session,
    itemId: string,
    revision: number,
    onCommitted: (now: number) => void,
  ): void {
    const characterId = session.playerId;
    if (
      !characterId ||
      session.itemOperationPending ||
      session.itemPersistsPending > 0
    ) {
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
    const planned = planCarriedIntent({
      intent,
      item,
      items: cache.items,
      catalog: this.catalog,
      characterId: playerId,
      level: player.level,
      vocation: player.vocation,
    });
    if (planned.kind === "rejected") {
      session.sendError("item-action-failed");
      return;
    }
    if (planned.kind === "planned") {
      const inventory = this.operations.applyMutation(
        playerId,
        planned.plan.mutation,
        now,
      );
      if (inventory && session.playerId === playerId) {
        session.send({ type: "inventory-updated", inventory });
      }
      const persist = planned.plan.persist;
      this.enqueuePersist(session, playerId, () => this.store.persist(persist));
      return;
    }
    // DB-first ops (world interactions) must stay ordered behind any
    // memory-first writes still flushing for this character.
    if (session.itemPersistsPending > 0) {
      session.sendError("item-action-failed");
      return;
    }
    const operation = operationForItemIntent(
      this.store,
      this.world,
      playerId,
      intent,
    );
    if (!operation) {
      session.sendError("item-action-failed");
      return;
    }
    session.itemOperationPending = true;
    const equipSlot =
      intent.type === "pickup-item" ? intent.equipSlot : undefined;
    this.operations.run(session, playerId, operation, {
      errorCode: "item-action-failed",
      logLabel: "item operation failed",
      ...(equipSlot
        ? {
            onMutationApplied: (mutation: ItemMutation, appliedAt: number) =>
              this.equipPickedItem(
                session,
                playerId,
                mutation,
                equipSlot,
                appliedAt,
              ),
          }
        : {}),
    });
  }

  /**
   * Equip-after-pickup: once the pickup commit lands in memory, run the
   * regular equip planner on the picked item. If the equip is not possible
   * the item simply stays picked up.
   */
  private equipPickedItem(
    session: Session,
    characterId: string,
    mutation: ItemMutation,
    slot: EquipmentSlot,
    now: number,
  ): void {
    const cache = this.inventories.get(characterId);
    const player = this.world.getPlayer(characterId);
    const rootId = mutation.before?.id;
    if (!cache || !player || !rootId) return;
    const item = cache.items.find((candidate) => candidate.id === rootId);
    if (!item) return;
    const plan = planEquip({
      characterId,
      catalog: this.catalog,
      items: cache.items,
      level: player.level,
      vocation: player.vocation,
      itemId: item.id,
      expectedVersion: item.version,
      slot,
    });
    if (!plan) return;
    const inventory = this.operations.applyMutation(
      characterId,
      plan.mutation,
      now,
    );
    if (inventory && session.playerId === characterId) {
      session.send({ type: "inventory-updated", inventory });
    }
    const persist = plan.persist;
    this.enqueuePersist(session, characterId, () => this.store.persist(persist));
  }
}
