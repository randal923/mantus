import type { SpellParameterKind } from "@tibia/protocol";
import type { SpellDefinition } from "./Spell";

/**
 * What a spell's spoken parameter names ('exani hur "up"', 'exura sio
 * "Friend"'), mirroring Canary's `hasParams` spells. The value is only ever a
 * reference the server resolves at cast time; this classification exists so
 * the client can offer the matching control on an action-bar slot.
 */
export function spellParameterKind(
  spell: SpellDefinition,
): SpellParameterKind {
  if (spell.worldAction === "levitate") return "direction";
  if (spell.worldAction) return "none";
  if (
    spell.playerAction === "summon-creature" ||
    spell.playerAction === "creature-illusion"
  ) {
    return "monster-name";
  }
  if (spell.playerAction === "mentor-other") return "player-name";
  if (spell.playerAction) return "none";
  return spell.targetKind === "target" ||
    spell.targetKind === "target-or-direction"
    ? "player-name"
    : "none";
}
