import type { Position, UseItemMessage } from "@tibia/protocol";
import { getMagicEffectId } from "../combat/getMagicEffectId";
import { ADVENTURERS_STONE_TYPE_ID } from "../item/adventurersStoneTypeId";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { Session } from "../Session";
import { ADVENTURERS_STONE_STORAGE_KEY } from "./adventurersStoneTables";
import { resolveAdventurersStoneTeleport } from "./resolveAdventurersStoneTeleport";

const TELEPORT = getMagicEffectId("CONST_ME_TELEPORT");
const POFF = getMagicEffectId("CONST_ME_POFF");

const NOT_AT_TEMPLE_MESSAGE =
  "Try to move more to the center of a temple to use the spiritual energy " +
  "for a teleport.";

export interface AdventurersStoneHooks {
  getPlayer(characterId: string): Player | undefined;
  isProtectionZone(position: Position): boolean;
  isHouse(position: Position): boolean;
  /** Teleports near the destination; false when no free tile was found. */
  teleport(session: Session, player: Player, destination: Position): boolean;
  effect(position: Position, effectId: number): void;
  setStorageValue(player: Player, key: string, value: number): void;
  fallbackTemple(): Position;
}

/**
 * The Adventurer's Stone (Canary's `adventurers_stone.lua`): used inside a
 * city temple it teleports to the Adventurers Guild; used at the guild it
 * returns to the stored temple. All checks read live state at execution
 * time inside the tick; the client only ever sent a use intent.
 */
export class AdventurersStoneService {
  constructor(
    private readonly items: ItemIntentHandler,
    private readonly hooks: AdventurersStoneHooks,
  ) {}

  /** True when the intent was consumed as an Adventurer's Stone use. */
  handleUseItem(session: Session, intent: UseItemMessage): boolean {
    const characterId = session.playerId;
    if (!characterId) return false;
    const item = this.items
      .inventorySnapshot(characterId)
      ?.items.find((candidate) => candidate.id === intent.itemId);
    if (!item || item.version !== intent.revision) return false;
    if (item.typeId !== ADVENTURERS_STONE_TYPE_ID) return false;
    const player = this.hooks.getPlayer(characterId);
    if (!player) return true;
    if (session.itemOperationPending || session.travelOperationPending) {
      session.sendError("item-action-failed");
      return true;
    }

    const decision = resolveAdventurersStoneTeleport({
      position: player.position,
      inProtectionZone: this.hooks.isProtectionZone(player.position),
      inHouse: this.hooks.isHouse(player.position),
      pzLocked: player.conditions.has("pz-lock"),
      storedTownId: player.storageValue(ADVENTURERS_STONE_STORAGE_KEY),
      homeTownId: player.townId,
      fallbackTemple: this.hooks.fallbackTemple(),
    });
    if (decision.kind === "refuse") {
      this.hooks.effect(player.position, POFF);
      session.send({
        type: "combat-log",
        kind: "condition",
        text: NOT_AT_TEMPLE_MESSAGE,
      });
      return true;
    }

    const origin = player.position;
    if (!this.hooks.teleport(session, player, decision.destination)) {
      session.sendError("item-action-failed");
      return true;
    }
    this.hooks.setStorageValue(
      player,
      ADVENTURERS_STONE_STORAGE_KEY,
      decision.kind === "to-guild" ? decision.townId : -1,
    );
    this.hooks.effect(origin, TELEPORT);
    this.hooks.effect(player.position, TELEPORT);
    return true;
  }
}
