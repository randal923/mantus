import type { Position, UseItemMessage } from "@tibia/protocol";
import { getMagicEffectId } from "../combat/getMagicEffectId";
import { isPlayerInFight } from "../combat/isPlayerInFight";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { TEMPLE_TELEPORT_SCROLL_TYPE_ID } from "../item/templeTeleportScrollTypeId";
import type { Player } from "../Player";
import type { Session } from "../Session";

const TELEPORT = getMagicEffectId("CONST_ME_TELEPORT");
const POFF = getMagicEffectId("CONST_ME_POFF");

export const TEMPLE_SCROLL_IN_FIGHT_MESSAGE =
  "You can't use this when you're in a fight.";

export interface TempleTeleportScrollHooks {
  getPlayer(characterId: string): Player | undefined;
  /** The temple of the player's home town, or the world temple without one. */
  homeTemple(player: Player): Position;
  /** Teleports near the destination; false when no free tile was found. */
  teleport(session: Session, player: Player, destination: Position): boolean;
  effect(position: Position, effectId: number): void;
}

/**
 * The temple teleport scroll (Canary's `temple_scroll.lua`): used from the
 * inventory it spends its single charge and teleports the player to their
 * home temple. Never while in a fight — Canary exempts protection-zone
 * tiles, this server does not: a fight is a fight wherever the player
 * stands. Every check reads live state inside the tick; the client only ever
 * sent a use intent for an item id it may not even own.
 */
export class TempleTeleportScrollService {
  constructor(
    private readonly items: ItemIntentHandler,
    private readonly hooks: TempleTeleportScrollHooks,
  ) {}

  /** True when the intent was consumed as a temple teleport scroll use. */
  handleUseItem(session: Session, intent: UseItemMessage, now: number): boolean {
    const characterId = session.playerId;
    if (!characterId) return false;
    const item = this.items
      .inventorySnapshot(characterId)
      ?.items.find((candidate) => candidate.id === intent.itemId);
    if (!item || item.version !== intent.revision) return false;
    if (item.typeId !== TEMPLE_TELEPORT_SCROLL_TYPE_ID) return false;
    const player = this.hooks.getPlayer(characterId);
    if (!player) return true;
    if (this.refuseInFight(session, player, now)) return true;
    if (session.itemOperationPending || session.travelOperationPending) {
      session.sendError("item-action-failed");
      return true;
    }

    // The scroll's one charge is spent first and the teleport rides on the
    // committed write: a replayed or racing intent finds no charge left, so
    // one scroll can never carry two trips (charter rule 2).
    const started = this.items.consumeCharges(
      session,
      item.id,
      item.version,
      1,
      (spent, committedAt) => {
        if (spent < 1) return;
        const traveller = this.hooks.getPlayer(characterId);
        if (!traveller) return;
        // Re-checked at execution time: a fight may have started while the
        // charge was being written (charter rule 4). The scroll is gone
        // either way; escaping a fight is what must never happen.
        if (this.refuseInFight(session, traveller, committedAt)) return;
        const origin = traveller.position;
        const destination = this.hooks.homeTemple(traveller);
        if (!this.hooks.teleport(session, traveller, destination)) {
          session.sendError("item-action-failed");
          return;
        }
        this.hooks.effect(origin, TELEPORT);
        this.hooks.effect(traveller.position, TELEPORT);
      },
    );
    if (!started) session.sendError("item-action-failed");
    return true;
  }

  private refuseInFight(session: Session, player: Player, now: number): boolean {
    if (!isPlayerInFight(player, now)) return false;
    this.hooks.effect(player.position, POFF);
    session.send({
      type: "combat-log",
      kind: "condition",
      text: TEMPLE_SCROLL_IN_FIGHT_MESSAGE,
    });
    return true;
  }
}
