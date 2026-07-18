import type { Visibility } from "../Visibility";
import type { World } from "../World";
import type { DecayManager, DecayRecord } from "./DecayManager";
import type { Item } from "./Item";
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
    const operation = this.store.decayWorldItem(record.itemId, record.version);
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
}
