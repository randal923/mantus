import type { DepotService } from "../depot/DepotService";
import type { LoadedDepot } from "../depot/LoadedDepot";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { ItemIntentHandler } from "./ItemIntentHandler";
import type { LoadedInventory } from "./LoadedInventory";

interface ReloadedState {
  readonly inventory: LoadedInventory;
  readonly depot: LoadedDepot | null;
}

/**
 * Recovers a character whose memory-first persist lane failed. Once a write
 * misses, only committed DB rows are trustworthy, so both memory caches are
 * rebuilt in place from the database instead of disconnecting the player.
 *
 * The character stays poisoned for the whole reload — every queued and newly
 * enqueued write for them is skipped — so nothing can commit the diverged
 * state, and the reload replaces it wholesale. Intents accepted during the
 * window are therefore lost, never duplicated: conservation is preserved
 * because the DB never saw them.
 */
export class PersistResyncRunner {
  private readonly inFlight = new Set<string>();
  private readonly outcomes: Array<() => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();

  constructor(
    private readonly items: ItemIntentHandler,
    private readonly depot: DepotService,
    private readonly registry: SessionRegistry,
  ) {}

  applyResolvedOutcomes(): void {
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  start(session: Session, characterId: string): void {
    if (this.inFlight.has(characterId)) return;
    const snapshot = this.items.inventorySnapshot(characterId);
    if (!snapshot) {
      // Already detached: the next login rebuilds from the DB anyway.
      this.items.clearPersistState(characterId);
      return;
    }
    this.inFlight.add(characterId);
    console.error(
      `item persist failed for ${characterId}; resyncing caches from DB`,
    );
    // Ordered through the shared write lane so the reads run after every
    // write enqueued before the failure has been skipped or applied.
    const reload = this.items.runOrderedInternalOperation(
      async (): Promise<ReloadedState> => ({
        inventory: await this.items.load(characterId, snapshot.capacityMax),
        depot: await this.depot.load(characterId),
      }),
    );
    const settled = reload.then(
      (reloaded) => {
        this.outcomes.push(() => this.apply(session, characterId, reloaded));
      },
      (cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        this.outcomes.push(() => {
          this.inFlight.delete(characterId);
          console.error(
            `resync reload failed for ${characterId}: ${reason}; disconnecting`,
          );
          session.terminate();
        });
      },
    );
    // Deliberately not registered as a pending character operation: the
    // reload itself waits on that key, so tracking it there self-deadlocks.
    // Ordering already comes from the shared write lane above.
    this.pendingOperations.add(settled);
    void settled.finally(() => this.pendingOperations.delete(settled));
  }

  private apply(
    session: Session,
    characterId: string,
    reloaded: ReloadedState,
  ): void {
    this.inFlight.delete(characterId);
    if (this.registry.sessionFor(characterId) !== session) {
      // The player left or relogged mid-reload; their live caches belong to
      // the newer session (or to nobody) and must not be overwritten.
      return;
    }
    const inventory = this.items.attach(reloaded.inventory);
    if (reloaded.depot) this.depot.attach(reloaded.depot);
    this.items.clearPersistState(characterId);
    session.send({ type: "inventory-updated", inventory });
    // The reload also replaced the cached balance, so correct any open bank
    // panel; it is ignored when the player has none open.
    session.send({
      type: "bank-updated",
      balance: reloaded.inventory.bankBalance,
    });
    this.depot.closeStorageView(session);
  }
}
