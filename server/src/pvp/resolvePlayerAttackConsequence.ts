import type { PvpPolicy } from "./PvpPolicy";
import type { SkullState } from "./SkullState";

export interface PlayerAttackContext {
  readonly attackerLevel: number;
  readonly targetLevel: number;
  readonly attackerSkull: SkullState;
  /** Target's public persistent skull. */
  readonly targetSkull: SkullState;
  /** Target attacked the attacker first (retaliation right, yellow-to-me). */
  readonly targetHasAttackedAttacker: boolean;
  /**
   * Target shows ANY skull to this attacker: public white/red/black,
   * yellow-to-me, or orange-to-me. Secure mode and the black-skull
   * restriction key off this viewer-relative fact.
   */
  readonly targetMarkedToAttacker: boolean;
  readonly sameParty: boolean;
  readonly sameGuild: boolean;
  readonly atWar: boolean;
  readonly secureMode: boolean;
  readonly inPvpZone: boolean;
  readonly inNoPvpZone: boolean;
}

export type PlayerAttackConsequence =
  | {
      readonly kind: "refuse";
      readonly reason:
        | "world-no-pvp"
        | "no-pvp-zone"
        | "protection-level"
        | "black-skull"
        | "secure-mode";
    }
  | { readonly kind: "allow"; readonly assignsWhiteSkull: boolean };

/**
 * Pure attack-consequence resolver, evaluated at combat execution time.
 * Party members, guild mates, and war enemies stay attackable — those
 * relations only suppress skull assignment, never refusal.
 */
export function resolvePlayerAttackConsequence(
  policy: PvpPolicy,
  context: PlayerAttackContext,
): PlayerAttackConsequence {
  if (policy.worldType === "no-pvp" && !context.inPvpZone) {
    return { kind: "refuse", reason: "world-no-pvp" };
  }
  if (context.inNoPvpZone && !context.inPvpZone) {
    return { kind: "refuse", reason: "no-pvp-zone" };
  }
  if (
    context.attackerLevel < policy.protectionLevel ||
    context.targetLevel < policy.protectionLevel
  ) {
    return { kind: "refuse", reason: "protection-level" };
  }
  if (
    context.attackerSkull === "black" &&
    !context.targetMarkedToAttacker &&
    !context.inPvpZone
  ) {
    return { kind: "refuse", reason: "black-skull" };
  }
  if (
    context.secureMode &&
    !context.targetMarkedToAttacker &&
    !context.inPvpZone
  ) {
    return { kind: "refuse", reason: "secure-mode" };
  }
  // Canary parity: aggression is skull-worthy iff the target carries no
  // public skull, never attacked the aggressor, and shares no party,
  // guild, or war relation — orange (revenge) targets still cost a white
  // skull even though the eventual kill would be justified.
  const unprovoked =
    context.targetSkull === "none" &&
    !context.targetHasAttackedAttacker &&
    !context.sameParty &&
    !context.sameGuild &&
    !context.atWar &&
    !context.inPvpZone;
  return {
    kind: "allow",
    assignsWhiteSkull:
      policy.worldType === "pvp" &&
      unprovoked &&
      context.attackerSkull === "none",
  };
}
