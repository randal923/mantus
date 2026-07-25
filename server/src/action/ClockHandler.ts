import type { UseItemMessage } from "@tibia/protocol";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import { CARRIED_WATCH_ITEM_IDS } from "./clockItemIds";
import { worldTimeOfDay } from "./worldTimeOfDay";

/**
 * Canary's watch action for the two carried watches. Ownership and the claimed
 * revision are re-checked at execution time; the reply is a pure read of the
 * server's own world clock, so nothing here can be forged.
 */
export class ClockHandler {
  constructor(
    private readonly items: ItemIntentHandler,
    private readonly clock: () => number = Date.now,
  ) {}

  /** True when the intent was answered as a watch read. */
  handleUseItem(session: Session, intent: UseItemMessage): boolean {
    const playerId = session.playerId;
    if (!playerId) return false;
    const item = this.items
      .inventorySnapshot(playerId)
      ?.items.find((candidate) => candidate.id === intent.itemId);
    if (!item || item.version !== intent.revision) return false;
    if (!CARRIED_WATCH_ITEM_IDS.has(item.typeId)) return false;
    session.send({
      type: "combat-log",
      kind: "condition",
      text: `The time is ${worldTimeOfDay(this.clock())}.`,
    });
    return true;
  }
}
