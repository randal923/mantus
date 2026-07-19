import type { PvpPolicy } from "./PvpPolicy";
import type { SkullState } from "./SkullState";

export interface KillJustificationContext {
  /** Victim's persistent skull at the moment of death. */
  readonly victimSkull: SkullState;
  /** Victim aggressed the killer during the current in-fight window. */
  readonly victimAttackedKiller: boolean;
  readonly sameParty: boolean;
  readonly sameGuild: boolean;
  readonly atWar: boolean;
  readonly inPvpZone: boolean;
  /** Victim has an unavenged unjustified kill on the killer in the window. */
  readonly victimHasUnavengedKillOnKiller: boolean;
}

export type KillJustification =
  | "unjustified"
  | "justified"
  | "justified-avenge";

/**
 * Pure kill-justification resolver, evaluated inside the death path with
 * relations re-read at that instant (never from enqueue-time state).
 */
export function resolveKillJustification(
  policy: PvpPolicy,
  context: KillJustificationContext,
): KillJustification {
  if (policy.worldType !== "pvp") return "justified";
  if (context.victimHasUnavengedKillOnKiller) return "justified-avenge";
  const unjustified =
    context.victimSkull === "none" &&
    !context.victimAttackedKiller &&
    !context.sameParty &&
    !context.sameGuild &&
    !context.atWar &&
    !context.inPvpZone;
  return unjustified ? "unjustified" : "justified";
}
