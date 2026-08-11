import type { Position } from "@tibia/protocol";
import { getMagicEffectId } from "../combat/getMagicEffectId";
import type { Player } from "../Player";
import type { Session } from "../Session";
import {
  ELEMENTAL_SHRINE_MESSAGE,
  ELEMENTAL_SHRINE_STORAGE_KEY,
} from "./elementalShrineTables";
import { resolveElementalShrineStep } from "./resolveElementalShrineStep";

const TELEPORT = getMagicEffectId("CONST_ME_TELEPORT");

export interface ElementalShrineHooks {
  /** Teleports near the destination; false when no free tile was found. */
  teleport(session: Session, player: Player, destination: Position): boolean;
  effect(position: Position, effectId: number): void;
  setStorageValue(player: Player, key: string, value: number): void;
  fallbackTemple(): Position;
}

/**
 * The elemental shrine flames in every city and inside the four shrines
 * (Canary `shrine_entrance.lua` / `shrine_exit.lua`). Level and stored city are
 * read from live player state inside the tick, so a client that fakes a step
 * onto a flame still faces the level-30 requirement here.
 */
export class ElementalShrineService {
  constructor(private readonly hooks: ElementalShrineHooks) {}

  /** True when the step was consumed by a shrine flame. */
  onStepIn(session: Session, player: Player, from: Position): boolean {
    const origin = player.position;
    const decision = resolveElementalShrineStep({
      position: origin,
      level: player.level,
      storedCityIndex: player.storageValue(ELEMENTAL_SHRINE_STORAGE_KEY),
      homeTownId: player.townId,
      fallbackTemple: this.hooks.fallbackTemple(),
    });
    if (decision.kind === "ignore") return false;
    if (decision.kind === "refuse") {
      if (!this.hooks.teleport(session, player, from)) return false;
      this.hooks.effect(player.position, TELEPORT);
      session.send({
        type: "combat-log",
        kind: "condition",
        text: ELEMENTAL_SHRINE_MESSAGE,
      });
      return true;
    }
    if (!this.hooks.teleport(session, player, decision.destination)) {
      return false;
    }
    // Canary only writes the storage on the way in, and only flashes the
    // teleport effect on the way back out.
    if (decision.kind === "enter") {
      this.hooks.setStorageValue(
        player,
        ELEMENTAL_SHRINE_STORAGE_KEY,
        decision.cityIndex,
      );
      return true;
    }
    this.hooks.effect(player.position, TELEPORT);
    return true;
  }
}
