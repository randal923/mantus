/**
 * Server-owned flood-control limits. The client's chat box may show whatever
 * it likes; these are the numbers that actually decide whether a line is
 * routed (charter rule 8). Defaults mirror Canary's message buffer.
 */
export interface ChatFloodLimits {
  /** Canary: maxMessageBuffer = 4 lines of burst. */
  readonly bufferCapacity: number;
  /** Canary: one buffer slot returns every 1.5 s. */
  readonly bufferDrainMs: number;
  /** Canary: the n-th offence mutes for base·n² milliseconds. */
  readonly muteBaseMs: number;
  /**
   * Clean-behaviour window that steps the escalation counter back down by
   * one, so a reformed player is not punished at level 5 forever. Canary has
   * no equivalent: it drops the counter entirely when the player logs out,
   * which rewards relogging. Ours never resets on relog and decays instead.
   */
  readonly escalationDecayMs: number;
}

export const DEFAULT_CHAT_FLOOD_LIMITS: ChatFloodLimits = {
  bufferCapacity: 4,
  bufferDrainMs: 1_500,
  muteBaseMs: 5_000,
  escalationDecayMs: 10 * 60_000,
};
