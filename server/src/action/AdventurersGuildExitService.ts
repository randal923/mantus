import type { Position } from "@tibia/protocol";
import { getMagicEffectId } from "../combat/getMagicEffectId";
import type { Player } from "../Player";
import type { Session } from "../Session";
import {
  ADVENTURERS_STONE_STORAGE_KEY,
  GUILD_EXIT_PORTALS,
} from "./adventurersStoneTables";
import { positionKey } from "../positionKey";
import { resolveStoredTempleDestination } from "./resolveStoredTempleDestination";

const TELEPORT = getMagicEffectId("CONST_ME_TELEPORT");

export interface AdventurersGuildExitHooks {
  /** Teleports near the destination; false when no free tile was found. */
  teleport(session: Session, player: Player, destination: Position): boolean;
  effect(position: Position, effectId: number): void;
  setStorageValue(player: Player, key: string, value: number): void;
  fallbackTemple(): Position;
}

/**
 * The Adventurers Guild exit portals (Canary
 * `movements/teleport/adventurers_guild.lua`): stepping into one returns the
 * player to the temple of the town they used the stone in, then forgets it.
 * Unconditional in Canary — no protection-zone or pz-lock check — and the
 * destination is resolved here in the tick from the player's live storage.
 */
export class AdventurersGuildExitService {
  private readonly portals: ReadonlySet<string> = new Set(
    GUILD_EXIT_PORTALS.map(positionKey),
  );

  constructor(private readonly hooks: AdventurersGuildExitHooks) {}

  /** True when the player stepped onto an exit portal and was teleported. */
  onStepIn(session: Session, player: Player): boolean {
    if (!this.portals.has(positionKey(player.position))) return false;
    const origin = player.position;
    const destination = resolveStoredTempleDestination({
      storedTownId: player.storageValue(ADVENTURERS_STONE_STORAGE_KEY),
      homeTownId: player.townId,
      fallbackTemple: this.hooks.fallbackTemple(),
    });
    if (!this.hooks.teleport(session, player, destination)) return false;
    this.hooks.setStorageValue(player, ADVENTURERS_STONE_STORAGE_KEY, -1);
    this.hooks.effect(origin, TELEPORT);
    this.hooks.effect(player.position, TELEPORT);
    return true;
  }
}
