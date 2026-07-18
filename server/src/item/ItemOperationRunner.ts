import type { InventoryState } from "@tibia/protocol";
import type { Session } from "../Session";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import type { DecayManager } from "./DecayManager";
import type { InventoryCacheManager } from "./InventoryCacheManager";
import type { ItemMutation } from "./ItemMutation";
import type { ItemOutcomeQueue } from "./ItemOutcomeQueue";
import { PendingItemOperations } from "./PendingItemOperations";

export interface ItemOperationOptions {
  readonly errorCode: "item-action-failed" | "combat-action-failed";
  readonly logLabel: string;
  readonly onCommitted?: (now: number) => void;
  /** Runs inside the tick right after the committed mutation hits memory. */
  readonly onMutationApplied?: (mutation: ItemMutation, now: number) => void;
}

/**
 * Runs item store operations for a character, serializes them via the pending
 * map, and defers their outcome application to the tick's outcome queue.
 */
export class ItemOperationRunner {
  readonly pending = new PendingItemOperations();

  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly inventories: InventoryCacheManager,
    private readonly outcomes: ItemOutcomeQueue,
    private readonly decay?: DecayManager,
  ) {}

  applyMutation(
    characterId: string,
    mutation: ItemMutation,
    now: number,
  ): InventoryState | null {
    const changedWorldTiles = this.world.applyItemMutation(mutation);
    this.visibility.onMapItemsChanged(changedWorldTiles);
    this.decay?.observeMutation(mutation, now);
    return this.inventories.applyMutation(characterId, mutation);
  }

  run(
    session: Session,
    characterId: string,
    operation: Promise<ItemMutation>,
    options: ItemOperationOptions,
  ): void {
    this.pending.track(
      characterId,
      this.resolve(session, characterId, operation, options),
    );
  }

  private async resolve(
    session: Session,
    characterId: string,
    operation: Promise<ItemMutation>,
    options: ItemOperationOptions,
  ): Promise<void> {
    try {
      const mutation = await operation;
      this.outcomes.push((now) => {
        session.itemOperationPending = false;
        const inventory = this.applyMutation(characterId, mutation, now);
        if (inventory && session.playerId === characterId) {
          session.send({ type: "inventory-updated", inventory });
        }
        if (options.onMutationApplied && session.playerId === characterId) {
          options.onMutationApplied(mutation, now);
        }
        if (options.onCommitted && session.playerId === characterId) {
          options.onCommitted(now);
        }
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `${options.logLabel} for character ${characterId}: ${reason}`,
      );
      this.outcomes.push(() => {
        session.itemOperationPending = false;
        if (session.playerId === characterId) {
          session.sendError(options.errorCode);
        }
      });
    }
  }
}
