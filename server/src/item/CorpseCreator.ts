import type { Position } from "@tibia/protocol";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import type { DecayManager } from "./DecayManager";
import type { ItemOutcomeQueue } from "./ItemOutcomeQueue";
import type { ItemStore } from "./ItemStore";
import type { LootItemCreation } from "./LootItemCreation";
import { PendingItemOperations } from "./PendingItemOperations";

/** Creates corpses with loot in the store, deduplicated per kill event id. */
export class CorpseCreator {
  private readonly pending = new PendingItemOperations();

  constructor(
    private readonly store: ItemStore,
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly outcomes: ItemOutcomeQueue,
    private readonly decay?: DecayManager,
  ) {}

  create(
    characterId: string | null,
    eventId: string,
    position: Position,
    stackIndex: number,
    corpseTypeId: number,
    loot: ReadonlyArray<LootItemCreation>,
  ): void {
    if (this.pending.has(eventId)) return;
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
        this.outcomes.push((now) => {
          const positions = this.world.applyCreatedWorldItems(items);
          this.visibility.onMapItemsChanged(positions);
          this.decay?.observeCreated(items, now);
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`corpse creation failed for ${eventId}: ${reason}`);
      });
    this.pending.track(eventId, resolution);
  }
}
