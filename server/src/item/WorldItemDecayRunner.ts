import type { Visibility } from "../Visibility";
import type { World } from "../World";
import type { DecayManager, DecayRecord } from "./DecayManager";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemMutation } from "./ItemMutation";
import type { ItemOutcomeQueue } from "./ItemOutcomeQueue";
import type { ItemStore } from "./ItemStore";
import { PendingItemOperations } from "./PendingItemOperations";

/** Executes due world-item decays against the store and queues their outcomes. */
export class WorldItemDecayRunner {
  private readonly pending = new PendingItemOperations();

  constructor(
    private readonly store: ItemStore,
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly outcomes: ItemOutcomeQueue,
    /** Serializes the decay write behind pending memory-first persists. */
    private readonly runOrdered: <T>(operation: () => Promise<T>) => Promise<T>,
    private readonly catalog: ItemCatalog,
    private readonly decay?: DecayManager,
  ) {}

  /** Arms decay deadlines for world items loaded or created outside intents. */
  schedule(items: ReadonlyArray<Item>, now: number): void {
    this.decay?.observeCreated(items, now);
  }

  tick(now: number): void {
    if (!this.decay) return;
    for (const record of this.decay.collectDue(now)) {
      this.start(record);
    }
  }

  private start(record: DecayRecord): void {
    if (this.pending.has(record.itemId)) return;
    const current = this.world
      .getMapItems(record.position)
      .find((candidate) => candidate.instanceId === record.instanceId);
    // Identity re-check at execution: a moved or transformed item carries its
    // own rescheduled deadline, so a record for an older version is stale and
    // must not touch the item now living under this instance id.
    if (
      !current ||
      (current.revision ?? 1) !== record.version ||
      current.itemId !== record.typeId
    ) {
      return;
    }
    if (this.world.lootOrigin(record.itemId)) {
      // Memory-only kill loot has no DB row: the decay outcome is computed
      // and applied purely in memory, mirroring PgDecayOps semantics.
      this.outcomes.push((appliedAt) => this.decayInMemory(record, appliedAt));
      return;
    }
    const operation = this.runOrdered(() =>
      this.store.decayWorldItem(record.itemId, record.version),
    );
    const resolution = operation
      .then((mutation) => {
        this.outcomes.push((appliedAt) => {
          const changedWorldTiles = this.world.applyItemMutation(mutation);
          this.visibility.onMapItemsChanged(changedWorldTiles);
          this.decay?.observeMutation(mutation, appliedAt);
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`decay failed for item ${record.itemId}: ${reason}`);
        this.outcomes.push((appliedAt) => {
          this.decay?.restore(record, appliedAt);
        });
      });
    this.pending.track(record.itemId, resolution);
  }

  private decayInMemory(record: DecayRecord, appliedAt: number): void {
    const root = this.world.getWorldItem(record.itemId);
    const origin = this.world.lootOrigin(record.itemId);
    if (
      !root ||
      root.location.kind !== "world" ||
      root.version !== record.version ||
      root.typeId !== record.typeId
    ) {
      return;
    }
    if (!origin) {
      // Materialized between scheduling and execution; retry via the store.
      this.decay?.restore(record, appliedAt);
      return;
    }
    const decay = this.catalog.require(root.typeId).decay;
    if (!decay || decay.durationSeconds === undefined) return;
    const subtree = this.world.getWorldSubtree(root.id);
    const targetTypeId = decay.targetId || undefined;
    let mutation: ItemMutation;
    let transformed: Item | undefined;
    if (targetTypeId === undefined) {
      mutation = {
        before: root,
        after: [],
        removedItemIds: subtree.map((item) => item.id),
      };
    } else {
      const keepSlots =
        this.catalog.require(targetTypeId).containerCapacity ?? 0;
      const doomedIds = new Set<string>();
      for (const item of subtree) {
        if (
          (item.location.kind !== "corpse" &&
            item.location.kind !== "container") ||
          item.location.containerId !== root.id ||
          item.location.slot < keepSlots
        ) {
          continue;
        }
        for (const doomed of this.world.getWorldSubtree(item.id)) {
          doomedIds.add(doomed.id);
        }
      }
      transformed = {
        ...root,
        typeId: targetTypeId,
        attributes: {},
        version: root.version + 1,
      };
      mutation = {
        before: root,
        after: [transformed],
        removedItemIds: [...doomedIds],
      };
    }
    const changedWorldTiles = this.world.applyItemMutation(mutation);
    this.visibility.onMapItemsChanged(changedWorldTiles);
    this.decay?.observeMutation(mutation, appliedAt);
    if (transformed) {
      // Still memory-only: the next decay stage (or first touch) needs the
      // origin back after applyItemMutation cleared it.
      this.world.registerUnpersistedLootItems([transformed], origin);
    }
  }
}
