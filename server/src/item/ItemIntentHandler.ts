import { randomUUID } from "node:crypto";
import type {
  ActionBarItemMode,
  InventoryState,
  Position,
} from "@tibia/protocol";
import type { Session } from "../Session";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import type { CharacterWriteLane } from "../character/CharacterWriteLane";
import type { ImbuementCatalog } from "../imbuement/ImbuementCatalog";
import {
  playerImbuementEffects,
  type PlayerImbuementEffects,
} from "../imbuement/playerImbuementEffects";
import {
  EMPTY_AFFIX_EFFECTS,
  playerAffixEffects,
  type PlayerAffixEffects,
} from "../rarity/playerAffixEffects";
import { monotonicNow } from "../monotonicNow";
import type { CarriedPersistPlan } from "./CarriedPersistPlan";
import { chargesOf } from "./chargesOf";
import { CorpseCreator } from "./CorpseCreator";
import type { DecayManager } from "./DecayManager";
import { dropUnknownItemTypes } from "./dropUnknownItemTypes";
import { InventoryCacheManager } from "./InventoryCacheManager";
import { isNear } from "./isNear";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemIntent } from "./ItemIntent";
import type { ItemMutation } from "./ItemMutation";
import { ItemOperationRunner } from "./ItemOperationRunner";
import { ResolvedOutcomes } from "../ResolvedOutcomes";
import type { ItemStore } from "./ItemStore";
import type { ItemType } from "./ItemType";
import type { LoadedInventory } from "./LoadedInventory";
import type { LootItemCreation } from "./LootItemCreation";
import type { PotionUseResult } from "./PotionUseResult";
import { restoreUnpersistedOrigins } from "./restoreUnpersistedOrigins";
import type { CarriedPlan } from "./plan/CarriedPlan";
import { compareContainerSortOrder } from "./plan/compareContainerSortOrder";
import { containerChildren } from "./plan/containerChildren";
import { findContainerMergeStep } from "./plan/findContainerMergeStep";
import { planCarriedIntent } from "./plan/planCarriedIntent";
import { planMoveToContainer } from "./plan/planMoveToContainer";
import { planCarriedDecay } from "./plan/planCarriedDecay";
import { planConsume } from "./plan/planConsume";
import { firstFreeWorldStackIndex } from "./plan/firstFreeWorldStackIndex";
import { planLoot } from "./plan/planLoot";
import { planPotionUse } from "./plan/planPotionUse";
import { quickLootCategory } from "./quickLootCategory";
import { validateItemIntentTarget } from "./validateItemIntentTarget";
import { WorldContainerViews } from "./WorldContainerViews";
import { WorldItemDecayRunner } from "./WorldItemDecayRunner";

interface PendingPotionUse {
  readonly targetCharacterId: string;
  readonly itemId: string;
  readonly expectedItemVersion: number;
  readonly expectedTargetHealth: number;
  readonly expectedTargetMana: number;
  readonly targetMaxHealth: number;
  readonly targetMaxMana: number;
  readonly healthRestore: number;
  readonly manaRestore: number;
}

export class ItemIntentHandler {
  private readonly outcomes = new ResolvedOutcomes<[number]>();
  private readonly inventories: InventoryCacheManager;
  private readonly operations: ItemOperationRunner;
  private readonly corpses: CorpseCreator;
  private readonly decayRunner: WorldItemDecayRunner;
  private readonly worldContainers: WorldContainerViews;
  /**
   * One global write lane: world items pass between characters (drop, then
   * another player's pickup), so persist order must be total across the
   * server, not just per character.
   */
  private persistChain: Promise<void> = Promise.resolve();
  private readonly equipmentByItems = new WeakMap<
    ReadonlyArray<Item>,
    ReadonlyArray<{ item: Item; type: ItemType }>
  >();
  private imbuementCatalog?: ImbuementCatalog;
  private readBankBalance?: (characterId: string) => Promise<number>;
  private readonly imbuementEffectsByItems = new WeakMap<
    ReadonlyArray<Item>,
    PlayerImbuementEffects
  >();
  private readonly affixEffectsByItems = new WeakMap<
    ReadonlyArray<Item>,
    PlayerAffixEffects
  >();
  private readonly poisonedPersistCharacters = new Set<string>();
  private readonly pendingPersistOperations = new Set<Promise<void>>();
  /** House-tile authorization, consulted at execution time when set. */
  /**
   * Hunt-session observers for the party analyzer. Called synchronously inside
   * the tick right after the server's own mutation has been applied, so every
   * total the analyzer shows comes from an outcome the server produced.
   */
  private analyzerHooks:
    | {
        readonly onLooted: (
          characterId: string,
          typeId: number,
          count: number,
        ) => void;
        readonly onSupplyConsumed: (
          characterId: string,
          typeId: number,
          count: number,
        ) => void;
      }
    | null = null;

  private housePolicy:
    | ((characterId: string, position: Position) => boolean)
    | null = null;
  /** Rebuilds a poisoned character's caches from the DB; unset ⇒ disconnect. */
  private persistResync:
    | ((session: Session, characterId: string) => void)
    | null = null;
  /** Orders persists against the character's own snapshot saves; unset ⇒ none. */
  private characterWriteLane: CharacterWriteLane | null = null;

  setCharacterWriteLane(lane: CharacterWriteLane): void {
    this.characterWriteLane = lane;
  }

  setHousePolicy(
    policy: (characterId: string, position: Position) => boolean,
  ): void {
    this.housePolicy = policy;
  }

  setAnalyzerHooks(hooks: {
    readonly onLooted: (
      characterId: string,
      typeId: number,
      count: number,
    ) => void;
    readonly onSupplyConsumed: (
      characterId: string,
      typeId: number,
      count: number,
    ) => void;
  }): void {
    this.analyzerHooks = hooks;
  }

  setPersistResync(
    resync: (session: Session, characterId: string) => void,
  ): void {
    this.persistResync = resync;
  }

  constructor(
    private readonly store: ItemStore,
    private readonly catalog: ItemCatalog,
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly decay?: DecayManager,
    /** Resolves the owner's live session for tick-owned work (carried decay). */
    private readonly sessionFor?: (characterId: string) => Session | undefined,
  ) {
    this.inventories = new InventoryCacheManager(catalog);
    this.operations = new ItemOperationRunner(
      world,
      visibility,
      this.inventories,
      this.outcomes,
      decay,
    );
    this.corpses = new CorpseCreator(catalog, world, visibility, decay);
    this.worldContainers = new WorldContainerViews(world, catalog);
    this.decayRunner = new WorldItemDecayRunner(
      store,
      world,
      visibility,
      this.outcomes,
      (operation) => this.runOrderedInternalOperation(operation),
      catalog,
      decay,
    );
  }

  async load(characterId: string, capacityMax: number): Promise<LoadedInventory> {
    await this.operations.pending.get(characterId);
    const items = await this.store.loadForCharacter(characterId);
    // Row ages come from the database clock, so a burning ring resumes where
    // it left off instead of restarting its duration on every login.
    const agesMs = await this.store.carriedAgesMs?.(characterId);
    // Money loads with the items so a purchase can plan its carried and bank
    // legs from one consistent snapshot.
    const bankBalance = (await this.readBankBalance?.(characterId)) ?? 0;
    return {
      characterId,
      capacityMax,
      items: dropUnknownItemTypes(items, this.catalog, characterId),
      bankBalance,
      ...(agesMs ? { agesMs } : {}),
    };
  }

  attach(loaded: LoadedInventory, now = monotonicNow()): InventoryState {
    const state = this.inventories.attach(loaded);
    this.decay?.observeCarriedLoaded(
      loaded.characterId,
      loaded.items,
      loaded.agesMs,
      now,
    );
    return state;
  }

  /**
   * Whether this character's inventory is attached. False around login and
   * logout — readers deriving stats must treat that as "unknown", never as
   * "wearing nothing", or a logout tick clamps health before the final save.
   */
  hasLoadedInventory(characterId: string): boolean {
    return this.inventories.get(characterId) !== undefined;
  }

  detach(characterId: string): void {
    this.inventories.detach(characterId);
    this.decay?.forgetCarried(characterId);
  }

  inventorySnapshot(
    characterId: string,
  ): {
    items: ReadonlyArray<Item>;
    capacityMax: number;
    bankBalance: number;
  } | null {
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
    // Inventory caches are replaced immutably on every mutation, so the items
    // array identity is a complete invalidation key for this per-hit lookup.
    const memoized = this.equipmentByItems.get(cache.items);
    if (memoized) return memoized;
    const equipment = cache.items.flatMap((item) =>
      item.location.kind === "equipment"
        ? [{ item, type: this.catalog.require(item.typeId) }]
        : [],
    );
    this.equipmentByItems.set(cache.items, equipment);
    return equipment;
  }

  setImbuementCatalog(catalog: ImbuementCatalog): void {
    this.imbuementCatalog = catalog;
    // The Pg store folds Featherweight into transactional capacity checks
    // from the same catalog, so DB-side limits cannot drift from live ones.
    this.store.setImbuementCatalog?.(catalog);
  }

  /**
   * Supplies the committed bank balance for `load`. Injected rather than taking
   * a BankStore dependency, and read inside `load` so both login and the
   * resync path rebuild the balance from the DB alongside the items.
   */
  setBankBalanceReader(
    read: (characterId: string) => Promise<number>,
  ): void {
    this.readBankBalance = read;
  }

  /**
   * Overwrites the cached balance after a committed money mutation. The
   * economy services are its only writers, as with the inventory itself.
   */
  setBankBalance(characterId: string, balance: number): void {
    this.inventories.setBankBalance(characterId, balance);
  }

  /** Rolled rarity-affix effects for combat reads, memoized like equipment. */
  affixEffects(characterId: string): PlayerAffixEffects {
    const cache = this.inventories.get(characterId);
    if (!cache) return EMPTY_AFFIX_EFFECTS;
    const memoized = this.affixEffectsByItems.get(cache.items);
    if (memoized) return memoized;
    const effects = playerAffixEffects(this.combatEquipment(characterId));
    this.affixEffectsByItems.set(cache.items, effects);
    return effects;
  }

  /** Running imbuement effects for combat reads, memoized like equipment. */
  imbuementEffects(characterId: string): PlayerImbuementEffects {
    const cache = this.inventories.get(characterId);
    if (!cache) return playerImbuementEffects([], this.imbuementCatalog);
    const memoized = this.imbuementEffectsByItems.get(cache.items);
    if (memoized) return memoized;
    const effects = playerImbuementEffects(
      this.combatEquipment(characterId),
      this.imbuementCatalog,
    );
    this.imbuementEffectsByItems.set(cache.items, effects);
    return effects;
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

  combatItemByType(
    characterId: string,
    itemTypeId: number,
  ): { item: Item; type: ItemType } | null {
    const item = this.inventories
      .get(characterId)
      ?.items.find(
        (candidate) =>
          candidate.typeId === itemTypeId && candidate.count > 0,
      );
    return item ? { item, type: this.catalog.require(item.typeId) } : null;
  }

  activateOwnedItem(
    session: Session,
    itemTypeId: number,
    mode: Extract<ActionBarItemMode, "use" | "use-on-self" | "use-on-target" | "use-at-cursor" | "use-with-crosshair">,
    targetPosition: Position | null,
    now: number,
  ): boolean {
    if (session.itemOperationPending) return false;
    const characterId = session.playerId;
    const item = characterId
      ? this.combatItemByType(characterId, itemTypeId)?.item
      : undefined;
    if (!item) return false;
    if (
      mode === "use-on-self" ||
      mode === "use-on-target" ||
      mode === "use-at-cursor" ||
      mode === "use-with-crosshair"
    ) {
      if (!targetPosition) return false;
      // Action-bar item uses reach the tick outside handleIntent, so the
      // 200 ms generic use exhaust is applied here as well (charter rule 8).
      if (session.useExhausted(now)) return false;
      session.armUseExhaust(now);
      this.handle(
        session,
        {
          type: "use-item-with",
          itemId: item.id,
          revision: item.version,
          targetPosition,
        },
        now,
      );
      return true;
    }
    const type = this.catalog.require(item.typeId);
    // Opening a container is not a "use" and is not exhaust-gated.
    if (type.containerCapacity === undefined) {
      if (session.useExhausted(now)) return false;
      session.armUseExhaust(now);
    }
    this.handle(
      session,
      {
        type:
          type.containerCapacity !== undefined
            ? "open-container"
            : "use-item",
        itemId: item.id,
        revision: item.version,
      },
      now,
    );
    return true;
  }

  toggleEquippedItem(
    session: Session,
    configuredTypeId: number,
    equip: boolean | null,
    now: number,
  ): boolean {
    if (session.itemOperationPending) return false;
    const characterId = session.playerId;
    const cache = characterId ? this.inventories.get(characterId) : undefined;
    const configuredType = this.catalog.get(configuredTypeId);
    const carriedTypeId =
      configuredType?.transformDeEquipTo ?? configuredTypeId;
    const carriedType = this.catalog.get(carriedTypeId);
    const slot = configuredType?.equipmentSlot ?? carriedType?.equipmentSlot;
    if (!characterId || !cache || !configuredType || !carriedType || !slot) {
      return false;
    }
    const equippedTypeId = carriedType.transformEquipTo ?? carriedTypeId;
    const equipped = cache.items.find(
      (item) =>
        item.location.kind === "equipment" &&
        item.location.slot === slot &&
        (item.typeId === configuredTypeId ||
          item.typeId === carriedTypeId ||
          item.typeId === equippedTypeId),
    );
    const shouldEquip = equip ?? !equipped;
    if (!shouldEquip) {
      if (!equipped || slot === "backpack") return false;
      this.handle(
        session,
        {
          type: "unequip-item",
          itemId: equipped.id,
          revision: equipped.version,
          slot,
        },
        now,
      );
      return true;
    }
    if (equipped) return false;
    const carried = cache.items.find(
      (item) =>
        item.location.kind === "container" &&
        (item.typeId === configuredTypeId ||
          item.typeId === carriedTypeId ||
          item.typeId === equippedTypeId),
    );
    if (!carried) return false;
    this.handle(
      session,
      {
        type: "equip-item",
        itemId: carried.id,
        revision: carried.version,
        slot,
      },
      now,
    );
    return true;
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
    const consumedTypeId = combatItem.item.typeId;
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
      onCommitted: (committedAt) => {
        this.analyzerHooks?.onSupplyConsumed(characterId, consumedTypeId, 1);
        onCommitted(committedAt);
      },
    });
    return true;
  }

  /**
   * Spends one charge of a carried charged item (exercise weapons). The store
   * decides whether a charge is left and whether this was the last one, so a
   * replayed or racing tick can never over-spend the item.
   */
  /**
   * Spends up to `count` charges in one write. `onCommitted` receives how many
   * were actually spent, which is fewer than asked when that was all the item
   * had left.
   */
  consumeCharges(
    session: Session,
    itemId: string,
    revision: number,
    count: number,
    onCommitted: (spent: number, now: number) => void,
  ): boolean {
    const characterId = session.playerId;
    const held = characterId
      ? this.combatItem(characterId, itemId, revision)
      : null;
    if (
      !characterId ||
      !held ||
      session.itemOperationPending ||
      session.itemPersistsPending > 0
    ) {
      return false;
    }
    const before = chargesOf(held.item, held.type.charges);
    session.itemOperationPending = true;
    this.operations.run(
      session,
      characterId,
      this.store.consumeCharges(characterId, itemId, revision, count),
      {
        errorCode: "item-action-failed",
        logLabel: "charge consumption failed",
        // The store clamps to what the row really held, so what it cost is
        // read back from the committed rows rather than assumed.
        onCommitted: (now) => {
          const after = this.inventories
            .get(characterId)
            ?.items.find((candidate) => candidate.id === itemId);
          const left = after
            ? chargesOf(after, this.catalog.require(after.typeId).charges)
            : 0;
          onCommitted(Math.max(0, before - left), now);
        },
      },
    );
    return true;
  }

  usePotionForCombat(
    session: Session,
    request: PendingPotionUse,
    expectedTargetCharacterVersion: Promise<number>,
    onCommitted: (
      expectedTargetVersion: number,
      result: PotionUseResult,
      now: number,
    ) => void,
    onFailed: (cause: unknown, now: number) => void,
    now: number,
  ): boolean {
    const actorCharacterId = session.playerId;
    const cache = actorCharacterId
      ? this.inventories.get(actorCharacterId)
      : undefined;
    const planned =
      actorCharacterId && cache
        ? planPotionUse({
            characterId: actorCharacterId,
            catalog: this.catalog,
            items: cache.items,
            itemId: request.itemId,
            expectedVersion: request.expectedItemVersion,
          })
        : null;
    if (
      !actorCharacterId ||
      !planned ||
      session.itemOperationPending ||
      session.potionPersistPending
    ) {
      session.sendError("combat-action-failed");
      return false;
    }
    const inventory = this.operations.applyMutation(
      actorCharacterId,
      planned.mutation,
      now,
    );
    if (planned.mutation.before) {
      this.analyzerHooks?.onSupplyConsumed(
        actorCharacterId,
        planned.mutation.before.typeId,
        1,
      );
    }
    if (inventory && session.playerId === actorCharacterId) {
      session.send({ type: "inventory-updated", inventory });
    }
    session.potionPersistPending = true;
    session.itemPersistsPending += 1;
    const operation = this.persistChain.then(async () => {
      if (this.poisonedPersistCharacters.has(actorCharacterId)) {
        throw new Error("item persistence lane is poisoned");
      }
      const expectedTargetVersion = await expectedTargetCharacterVersion;
      return {
        expectedTargetVersion,
        result: await this.store.usePotion({
          actorCharacterId,
          targetCharacterId: request.targetCharacterId,
          itemPlan: planned.itemPlan,
          expectedTargetCharacterVersion: expectedTargetVersion,
          expectedTargetHealth: request.expectedTargetHealth,
          expectedTargetMana: request.expectedTargetMana,
          targetMaxHealth: request.targetMaxHealth,
          targetMaxMana: request.targetMaxMana,
          healthRestore: request.healthRestore,
          manaRestore: request.manaRestore,
        }),
      };
    });
    const settled = operation
      .then(({ expectedTargetVersion, result }) => {
        this.outcomes.push((committedAt) => {
          session.potionPersistPending = false;
          this.finishPersist(session);
          onCommitted(expectedTargetVersion, result, committedAt);
        });
      })
      .catch((cause: unknown) => {
        this.poisonedPersistCharacters.add(actorCharacterId);
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.error(
          `potion persist failed for character ${actorCharacterId}: ${reason}`,
        );
        this.outcomes.push((failedAt) => {
          session.potionPersistPending = false;
          this.finishPersist(session);
          onFailed(cause, failedAt);
          if (session.playerId === actorCharacterId) {
            session.sendError("combat-action-failed");
          }
          this.recoverFromPersistFailure(session, actorCharacterId);
        });
      });
    this.persistChain = settled;
    this.operations.pending.trackSwallowingErrors(actorCharacterId, settled);
    this.pendingPersistOperations.add(settled);
    void settled.finally(() => this.pendingPersistOperations.delete(settled));
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
    attributes: Readonly<Record<string, unknown>> | undefined,
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
        attributes,
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
   * carried or world). Writes run strictly in enqueue order; a failed write
   * poisons the character and skips their remaining writes, then hands the
   * session to the resync path, which rebuilds their caches from committed DB
   * state in place (or disconnects when no resync is wired).
   *
   * `onDropped` runs inside the tick when the write never reaches the DB —
   * failed or skipped — so the caller can undo memory state that assumed it
   * committed.
   */
  enqueuePersist(
    session: Session,
    characterId: string,
    persist: () => Promise<void>,
    onDropped?: () => void,
  ): void {
    session.itemPersistsPending += 1;
    const settled = this.persistChain
      .then(async () => {
        if (this.poisonedPersistCharacters.has(characterId)) {
          if (onDropped) this.outcomes.push(onDropped);
          return;
        }
        // Serialization conflicts (SQLSTATE 40001) come from racing a
        // concurrent character save on the same rows; the memory state is
        // already the source of truth, so re-running the write is safe.
        for (let attempt = 0; ; attempt++) {
          try {
            await this.runOnCharacterLane(characterId, persist);
            return;
          } catch (cause) {
            if (attempt >= 2 || !isSerializationFailure(cause)) throw cause;
            await new Promise((resolve) =>
              setTimeout(resolve, 25 * (attempt + 1)),
            );
          }
        }
      })
      .then(
        () => {
          this.outcomes.push(() => this.finishPersist(session));
        },
        (cause: unknown) => {
          this.poisonedPersistCharacters.add(characterId);
          const reason = cause instanceof Error ? cause.message : "unknown";
          this.outcomes.push(() => {
            this.finishPersist(session);
            onDropped?.();
            console.error(`item persist failed for ${characterId}: ${reason}`);
            this.recoverFromPersistFailure(session, characterId);
          });
        },
      );
    this.persistChain = settled;
    this.operations.pending.trackSwallowingErrors(characterId, settled);
    this.pendingPersistOperations.add(settled);
    void settled.finally(() => this.pendingPersistOperations.delete(settled));
  }

  /**
   * Queues an item-store plan. A plan that never commits gets the memory-only
   * origins it was going to materialize put back, so the corpse or field it
   * touched stays insertable on the next touch instead of becoming a row-less
   * phantom nothing can ever write.
   */
  private enqueueItemPersist(
    session: Session,
    characterId: string,
    plan: CarriedPersistPlan,
  ): void {
    this.enqueuePersist(
      session,
      characterId,
      () => this.store.persist(plan),
      () => restoreUnpersistedOrigins(this.world, plan),
    );
  }

  /**
   * Holds the character's shared write lane for the duration of the write, so
   * a snapshot save cannot commit against the same row mid-transaction and
   * abort it with a serialization failure. Unset (tests, memory store) means
   * nothing else writes that row concurrently.
   */
  private runOnCharacterLane(
    characterId: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    return this.characterWriteLane
      ? this.characterWriteLane.run(characterId, operation)
      : operation();
  }

  /**
   * Serializes a server-internal DB op (world decay) through the same write
   * lane so it cannot interleave with pending memory-first writes. Failures
   * are the caller's to observe on the returned promise.
   */
  runOrderedInternalOperation<T>(operation: () => Promise<T>): Promise<T> {
    const ordered = this.persistChain.then(operation);
    this.persistChain = ordered.then(
      () => undefined,
      () => undefined,
    );
    this.pendingPersistOperations.add(this.persistChain);
    const settled = this.persistChain;
    void settled.finally(() => this.pendingPersistOperations.delete(settled));
    return ordered;
  }

  isPersistPoisoned(characterId: string): boolean {
    return this.poisonedPersistCharacters.has(characterId);
  }

  /**
   * The character stays poisoned until the resync re-attaches committed state,
   * so no queued write can commit the diverged memory in the meantime.
   */
  private recoverFromPersistFailure(
    session: Session,
    characterId: string,
  ): void {
    const resync = this.persistResync;
    if (!resync) {
      session.terminate();
      return;
    }
    resync(session, characterId);
  }

  clearPersistState(characterId: string): void {
    this.poisonedPersistCharacters.delete(characterId);
  }

  async stopPersists(): Promise<void> {
    await Promise.allSettled([...this.pendingPersistOperations]);
  }

  private finishPersist(session: Session): void {
    session.itemPersistsPending = Math.max(0, session.itemPersistsPending - 1);
  }

  private consumeForUse(
    session: Session,
    itemId: string,
    revision: number,
    now: number,
    onCommitted: (now: number) => void,
  ): void {
    const characterId = session.playerId;
    const cache = characterId ? this.inventories.get(characterId) : undefined;
    const planned =
      characterId && cache
        ? planConsume({
            characterId,
            items: cache.items,
            itemId,
            expectedVersion: revision,
            count: 1,
            reason: "food",
          })
        : null;
    if (!characterId || !planned || session.itemOperationPending) {
      session.sendError("item-action-failed");
      return;
    }
    const inventory = this.operations.applyMutation(
      characterId,
      planned.mutation,
      now,
    );
    if (inventory && session.playerId === characterId) {
      session.send({ type: "inventory-updated", inventory });
    }
    onCommitted(now);
    const persist = planned.persist;
    this.enqueueItemPersist(session, characterId, persist);
  }

  /**
   * Sweeps one open world container into the backpack. Each item is planned
   * and applied on its own — a quick loot is a run of ordinary loot moves, so
   * every one keeps its expected-version guard and its own transaction, and a
   * sweep that runs out of room or hits a stale item simply stops there.
   * Nothing is re-read from the client: the eligible set is derived from the
   * live view inside this tick.
   */
  private quickLoot(
    session: Session,
    playerId: string,
    intent: Extract<ItemIntent, { type: "quick-loot" }>,
    now: number,
  ): void {
    const openRootId = this.worldContainers.rootFor(
      session,
      intent.containerId,
    );
    const rootId = openRootId ?? intent.containerId;
    const root = this.world.getWorldItem(rootId);
    const owner = root?.attributes.ownerCharacterId;
    if (typeof owner === "string" && owner !== playerId) {
      session.sendError("loot-protected");
      return;
    }
    if (!openRootId || !root) {
      session.sendError("item-action-failed");
      return;
    }
    const eligible = this.worldContainers
      .contents(session, intent.containerId)
      .filter((item) => {
        const category = quickLootCategory(this.catalog.require(item.typeId));
        return (
          category !== "none" &&
          (intent.category === undefined || category === intent.category)
        );
      });
    let taken = 0;
    for (const item of eligible) {
      const cache = this.inventories.get(playerId);
      if (!cache) break;
      const plan = planLoot({
        characterId: playerId,
        catalog: this.catalog,
        carried: { items: cache.items, capacityMax: cache.capacityMax },
        world: this.world,
        containerId: rootId,
        itemId: item.id,
        expectedVersion: item.version,
      });
      if (!plan) continue;
      const inventory = this.operations.applyMutation(
        playerId,
        plan.mutation,
        now,
      );
      if (inventory && session.playerId === playerId) {
        session.send({ type: "inventory-updated", inventory });
      }
      const persist = plan.persist;
      this.enqueueItemPersist(session, playerId, persist);
      this.analyzerHooks?.onLooted(playerId, item.typeId, item.count);
      taken += 1;
    }
    if (taken === 0) session.sendError("item-action-failed");
  }

  /**
   * Consolidates the partial stacks inside one carried container. Like quick
   * loot, the sweep is a run of ordinary container moves: each step re-reads
   * the live cache, plans one merge with its own version guards, applies it
   * and persists it on its own. The client contributes only the container
   * reference — which stacks merge and how much moves are server decisions.
   * An already-consolidated container is a silent no-op, not an error.
   */
  private stackContainer(
    session: Session,
    playerId: string,
    intent: Extract<ItemIntent, { type: "stack-container" }>,
    now: number,
  ): void {
    // Each merge fills a stack to its cap or removes an item, so the sweep
    // converges; the bound is a backstop, not the terminator.
    for (let step = 0; step < 200; step += 1) {
      const cache = this.inventories.get(playerId);
      if (!cache) return;
      const container = cache.items.find(
        (entry) => entry.id === intent.containerId,
      );
      if (!container) {
        if (step === 0) session.sendError("item-action-failed");
        return;
      }
      const merge = findContainerMergeStep(
        this.catalog,
        cache.items,
        container.id,
      );
      if (!merge) return;
      const plan = planMoveToContainer({
        characterId: playerId,
        catalog: this.catalog,
        items: cache.items,
        itemId: merge.source.id,
        expectedVersion: merge.source.version,
        destinationContainerId: container.id,
        destinationVersion: container.version,
        destinationSlot: merge.targetSlot,
        requestedCount: merge.count,
      });
      if (!plan) return;
      const inventory = this.operations.applyMutation(
        playerId,
        plan.mutation,
        now,
      );
      if (inventory && session.playerId === playerId) {
        session.send({ type: "inventory-updated", inventory });
      }
      this.enqueueItemPersist(session, playerId, plan.persist);
    }
  }

  /**
   * Reorders one carried container into the server's canonical order.
   * Selection sort over slots: each iteration re-reads the live cache, picks
   * the item that belongs at the next slot and issues one ordinary container
   * move (a plain move, swap or merge) with full version guards. The client
   * contributes only the container reference; a step that fails to plan just
   * stops the sweep, and an already-sorted container is a silent no-op.
   */
  private sortContainer(
    session: Session,
    playerId: string,
    intent: Extract<ItemIntent, { type: "sort-container" }>,
    now: number,
  ): void {
    const opening = this.inventories
      .get(playerId)
      ?.items.find((entry) => entry.id === intent.containerId);
    if (!opening) {
      session.sendError("item-action-failed");
      return;
    }
    const capacity =
      this.catalog.require(opening.typeId).containerCapacity ?? 0;
    for (let slot = 0; slot < capacity; ) {
      const cache = this.inventories.get(playerId);
      if (!cache) return;
      const container = cache.items.find(
        (entry) => entry.id === intent.containerId,
      );
      if (!container) return;
      const remaining = containerChildren(cache.items, container.id).filter(
        (child) => child.location.slot >= slot,
      );
      if (remaining.length === 0) return;
      const desired = remaining.reduce((best, candidate) =>
        compareContainerSortOrder(this.catalog, candidate, best) < 0
          ? candidate
          : best,
      );
      if (desired.location.slot === slot) {
        slot += 1;
        continue;
      }
      const plan = planMoveToContainer({
        characterId: playerId,
        catalog: this.catalog,
        items: cache.items,
        itemId: desired.id,
        expectedVersion: desired.version,
        destinationContainerId: container.id,
        destinationVersion: container.version,
        destinationSlot: slot,
      });
      if (!plan) return;
      const inventory = this.operations.applyMutation(
        playerId,
        plan.mutation,
        now,
      );
      if (inventory && session.playerId === playerId) {
        session.send({ type: "inventory-updated", inventory });
      }
      this.enqueueItemPersist(session, playerId, plan.persist);
      slot += 1;
    }
  }

  /**
   * Sweeps a freshly created corpse into the killer's backpack, honouring the
   * character's auto-loot blacklist. Nothing here comes from the client: the
   * corpse, its contents, the reach check and the ownership check are all read
   * from live world state inside the tick, and each take is the same
   * `planLoot` + apply + persist as a hand-made loot move. Failures are
   * silent — the sweep is automatic, so a full backpack is not an error the
   * player asked about.
   */
  autoLoot(
    session: Session,
    playerId: string,
    corpseId: string,
    now: number,
  ): void {
    const filter = session.lootFilter;
    if (!filter.enabled) return;
    const player = this.world.getPlayer(playerId);
    const corpse = this.world.getWorldItem(corpseId);
    if (!player || !corpse || corpse.location.kind !== "world") return;
    if (!isNear(player.position, corpse.location.position)) return;
    const owner = corpse.attributes.ownerCharacterId;
    if (typeof owner === "string" && owner !== playerId) return;
    const ignored = new Set(filter.ignoredItemTypeIds);
    const eligible = this.world
      .getWorldSubtree(corpseId)
      .filter(
        (item) =>
          item.location.kind === "corpse" &&
          item.location.containerId === corpseId &&
          !ignored.has(item.typeId) &&
          quickLootCategory(this.catalog.require(item.typeId)) !== "none",
      );
    for (const item of eligible) {
      const cache = this.inventories.get(playerId);
      if (!cache) break;
      const plan = planLoot({
        characterId: playerId,
        catalog: this.catalog,
        carried: { items: cache.items, capacityMax: cache.capacityMax },
        world: this.world,
        containerId: corpseId,
        itemId: item.id,
        expectedVersion: item.version,
      });
      if (!plan) continue;
      const inventory = this.operations.applyMutation(
        playerId,
        plan.mutation,
        now,
      );
      if (inventory && session.playerId === playerId) {
        session.send({ type: "inventory-updated", inventory });
      }
      const persist = plan.persist;
      this.enqueueItemPersist(session, playerId, persist);
      this.analyzerHooks?.onLooted(playerId, item.typeId, item.count);
    }
  }

  /** Creates the corpse in memory synchronously; rows appear on first touch. */
  createCorpse(
    characterId: string | null,
    eventId: string,
    position: Position,
    stackIndex: number,
    corpseTypeId: number,
    loot: ReadonlyArray<LootItemCreation>,
    now: number,
  ): string | null {
    return this.corpses.create(
      characterId,
      eventId,
      position,
      stackIndex,
      corpseTypeId,
      loot,
      now,
    );
  }

  createEventWorldItem(
    eventId: string,
    itemTypeId: number,
    position: Position,
    attributes: Readonly<Record<string, unknown>>,
    now: number,
  ): string | null {
    if (
      !/^[A-Za-z0-9:_-]{1,128}$/.test(eventId) ||
      !this.catalog.get(itemTypeId) ||
      !this.world.getTile(position)
    ) {
      return null;
    }
    const stackIndex = firstFreeWorldStackIndex(this.world.getMapItems(position));
    if (stackIndex === null) return null;
    const item: Item = {
      id: randomUUID(),
      typeId: itemTypeId,
      count: 1,
      attributes: { ...attributes },
      version: 1,
      location: { kind: "world", position: { ...position }, stackIndex },
    };
    const changed = this.world.applyCreatedWorldItems([item]);
    this.world.registerUnpersistedLootItems([item], {
      eventId,
      killerCharacterId: null,
    });
    this.visibility.onMapItemsChanged(changed);
    this.decay?.observeCreated([item], now);
    return item.id;
  }

  removeFirstWorldItemByTypeIds(
    center: Position,
    radius: number,
    itemTypeIds: ReadonlyArray<number>,
    now: number,
  ): boolean {
    const accepted = new Set(itemTypeIds);
    for (let x = center.x - radius; x <= center.x + radius; x++) {
      for (let y = center.y - radius; y <= center.y + radius; y++) {
        const position = { x, y, z: center.z };
        const top = this.world.getMapItems(position).at(-1);
        if (!top || !accepted.has(top.itemId)) continue;
        if (this.removeWorldItem(top.instanceId, position, now)) return true;
      }
    }
    return false;
  }

  removeWorldItem(
    instanceId: string,
    position: Position,
    now: number,
  ): boolean {
    const mapItem = this.world.getMapItems(position).find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (!mapItem) return false;
    const tracked = this.world.getWorldItem(instanceId);
    if (tracked) {
      const subtree = this.world.getWorldSubtree(tracked.id);
      const mutation: ItemMutation = {
        before: tracked,
        after: [],
        removedItemIds: subtree.map((item) => item.id),
      };
      const changed = this.world.applyItemMutation(mutation);
      this.visibility.onMapItemsChanged(changed);
      this.decay?.observeMutation(mutation, now);
      return true;
    }
    if (!this.world.removeMapItem(instanceId, position)) return false;
    this.visibility.onMapItemsChanged([position]);
    return true;
  }

  /**
   * Sweeps ground items away for the periodic map clean. The memory mutation
   * for every item runs synchronously here inside the tick (charter rule 3),
   * and the row deletes trail behind on the same ordered lane world decay
   * uses, so they can never overtake a pending write for the same item.
   * Memory-only loot simply has no row to delete.
   *
   * Returns how many items left the ground, contents included.
   */
  cleanWorldItems(items: ReadonlyArray<Item>, now: number): number {
    const removedItemIds: string[] = [];
    for (const item of items) {
      const live = this.world.getWorldItem(item.id);
      // Re-checked at execution: the list was collected before this tick's
      // mutations, so anything picked up or decayed since is skipped.
      if (
        !live ||
        live.location.kind !== "world" ||
        live.version !== item.version
      ) {
        continue;
      }
      // Only a container can hold anything, and the subtree walk scans every
      // tracked world item; most swept items are loose gold or gear, so the
      // sweep stays linear instead of quadratic in the size of the backlog.
      const subtree = this.catalog.require(live.typeId).containerCapacity
        ? this.world.getWorldSubtree(live.id)
        : [live];
      const mutation: ItemMutation = {
        before: live,
        after: [],
        removedItemIds: subtree.map((entry) => entry.id),
      };
      const changed = this.world.applyItemMutation(mutation);
      this.visibility.onMapItemsChanged(changed);
      this.decay?.observeMutation(mutation, now);
      removedItemIds.push(...subtree.map((entry) => entry.id));
    }
    if (removedItemIds.length === 0) return 0;
    const removal = this.runOrderedInternalOperation(() =>
      this.store.removeCleanedWorldItems(removedItemIds),
    );
    void removal.catch((cause: unknown) => {
      // The rows outlive their tiles until the next clean sweeps them again:
      // the items are gone from memory either way, so this never resurrects
      // one mid-session.
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`map clean persist failed: ${reason}`);
    });
    return removedItemIds.length;
  }

  transformEquippedItemForEvent(
    session: Session,
    characterId: string,
    fromTypeId: number,
    toTypeId: number,
    now: number,
  ): boolean {
    const cache = this.inventories.get(characterId);
    const item = cache?.items.find(
      (candidate) =>
        candidate.typeId === fromTypeId &&
        candidate.location.kind === "equipment",
    );
    if (
      !cache ||
      !item ||
      !this.catalog.get(toTypeId) ||
      session.itemOperationPending ||
      this.isPersistPoisoned(characterId)
    ) {
      return false;
    }
    const after: Item = {
      ...item,
      typeId: toTypeId,
      version: item.version + 1,
    };
    const mutation: ItemMutation = { before: item, after: [after] };
    const inventory = this.operations.applyMutation(characterId, mutation, now);
    if (inventory && session.playerId === characterId) {
      session.send({ type: "inventory-updated", inventory });
    }
    this.enqueueItemPersist(session, characterId, {
      characterId,
      rowOps: [{ kind: "write", expectedVersion: item.version, item: after }],
      audits: [{ kind: "transform", itemId: item.id, fromTypeId, toTypeId }],
    });
    return true;
  }

  /**
   * Arms decay deadlines for the world items loaded at boot, resuming each
   * from the age of its persisted row rather than a fresh full duration.
   */
  scheduleWorldDecay(
    items: ReadonlyArray<Item>,
    agesMs: ReadonlyMap<string, number>,
    now: number,
  ): void {
    this.decayRunner.schedule(items, agesMs, now);
  }

  tickDecay(now: number): void {
    this.decayRunner.tick(now);
    this.tickCarriedDecay(now);
  }

  /**
   * Applies every due carried/equipped decay inside the tick: the memory
   * mutation is synchronous and the row write trails on the persist lane, like
   * any other carried operation (charter rules 3 and 5). Each item is
   * re-checked against live inventory state before it is touched, so a record
   * for an item that was moved, transformed, or already destroyed does
   * nothing.
   */
  private tickCarriedDecay(now: number): void {
    if (!this.decay) return;
    for (const record of this.decay.collectDueCarried(now)) {
      const cache = this.inventories.get(record.characterId);
      const session = this.sessionFor?.(record.characterId);
      if (!cache || !session) {
        // The owner left mid-flight: nothing to mutate, and the deadline is
        // re-armed from the row age at their next login.
        continue;
      }
      const plan = planCarriedDecay({
        characterId: record.characterId,
        catalog: this.catalog,
        items: cache.items,
        itemId: record.itemId,
        expectedVersion: record.version,
        expectedTypeId: record.typeId,
      });
      if (!plan) continue;
      const inventory = this.operations.applyMutation(
        record.characterId,
        plan.mutation,
        now,
      );
      if (inventory && session.playerId === record.characterId) {
        session.send({ type: "inventory-updated", inventory });
      }
      const persist = plan.persist;
      this.enqueueItemPersist(session, record.characterId, persist);
    }
  }

  /**
   * Applies a validated world-action plan (door, lever, map rotation):
   * memory mutation synchronously in the tick, DB write behind the ordered
   * persist lane (charter rules 3, 5).
   */
  applyWorldPlan(
    session: Session,
    characterId: string,
    plan: CarriedPlan,
    now: number,
  ): void {
    const inventory = this.operations.applyMutation(
      characterId,
      plan.mutation,
      now,
    );
    if (inventory && session.playerId === characterId) {
      session.send({ type: "inventory-updated", inventory });
    }
    const persist = plan.persist;
    this.enqueueItemPersist(session, characterId, persist);
  }

  /** Opens a world container (corpse) at the tile if one is present. */
  handleMapOpen(session: Session, position: Position): boolean {
    return this.worldContainers.open(session, position);
  }

  tickWorldContainers(): void {
    this.worldContainers.tick();
  }

  detachSession(session: Session): void {
    this.worldContainers.detach(session);
  }

  handle(session: Session, intent: ItemIntent, now = monotonicNow()): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    const cache = playerId ? this.inventories.get(playerId) : undefined;
    if (!playerId || !player || !cache) {
      session.sendError("join-required");
      return;
    }
    if (intent.type === "close-world-container") {
      this.worldContainers.close(session, intent.containerId);
      return;
    }
    if (session.itemOperationPending) {
      session.sendError("item-action-failed");
      return;
    }
    if (intent.type === "open-world-container") {
      this.worldContainers.openChild(session, intent.containerId, intent.revision);
      return;
    }
    if (intent.type === "quick-loot") {
      this.quickLoot(session, playerId, intent, now);
      return;
    }
    if (intent.type === "stack-container") {
      this.stackContainer(session, playerId, intent, now);
      return;
    }
    if (intent.type === "sort-container") {
      this.sortContainer(session, playerId, intent, now);
      return;
    }
    // A view may be nested (a bag inside a corpse); the plans work from the
    // world root, which is also where loot protection lives.
    let lootIntent = intent;
    if (intent.type === "loot-item") {
      const rootId =
        this.worldContainers.rootFor(session, intent.containerId) ??
        intent.containerId;
      const owner = this.world.getWorldItem(rootId)?.attributes
        .ownerCharacterId;
      if (typeof owner === "string" && owner !== playerId) {
        session.sendError("loot-protected");
        return;
      }
      if (!this.worldContainers.has(session, intent.containerId)) {
        session.sendError("item-action-failed");
        return;
      }
      lootIntent = { ...intent, containerId: rootId };
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
      intent.type === "pickup-item" ||
      intent.type === "move-map-item" ||
      intent.type === "loot-item"
        ? undefined
        : cache.items.find((candidate) => candidate.id === intent.itemId);
    if (
      intent.type !== "pickup-item" &&
      intent.type !== "move-map-item" &&
      intent.type !== "loot-item" &&
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
          now,
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
        lootIntent,
        item,
        player.position,
        session.viewRange,
        cache,
        this.catalog,
        this.world,
        (position) => this.housePolicy?.(playerId, position) ?? true,
      )
    ) {
      session.sendError("item-action-failed");
      return;
    }
    const planned = planCarriedIntent({
      intent: lootIntent,
      item,
      items: cache.items,
      capacityMax: cache.capacityMax,
      world: this.world,
      catalog: this.catalog,
      characterId: playerId,
      level: player.level,
      vocation: player.vocation,
    });
    if (planned.kind !== "planned") {
      session.sendError("item-action-failed");
      return;
    }
    const inventory = this.operations.applyMutation(
      playerId,
      planned.plan.mutation,
      now,
    );
    const looted = planned.plan.mutation.before;
    if (lootIntent.type === "loot-item" && looted) {
      this.analyzerHooks?.onLooted(playerId, looted.typeId, looted.count);
    }
    if (inventory && session.playerId === playerId) {
      // Echo the client nonce so the optimistic drag queue can tell this
      // confirmation apart from an unsolicited mid-flight inventory change.
      const nonce = "nonce" in intent ? intent.nonce : undefined;
      session.send({ type: "inventory-updated", inventory, ...(nonce ? { nonce } : {}) });
    }
    if (planned.plan.effect) {
      this.visibility.broadcastMagicEffect(
        planned.plan.effect.position,
        planned.plan.effect.effectId,
      );
    }
    const persist = planned.plan.persist;
    this.enqueueItemPersist(session, playerId, persist);
  }
}

function isSerializationFailure(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    (("code" in cause && (cause as { code?: unknown }).code === "40001") ||
      cause.message.includes("could not serialize access"))
  );
}
