/**
 * Combat-facing surface of the party system. Every method is synchronous and
 * re-checks membership/eligibility from live state at call time, so the kill
 * and damage paths never act on stale party data (charter rule 4).
 */
export interface PartyHooks {
  /** Reads current party co-membership at the instant an action executes. */
  sameParty(playerIdA: string, playerIdB: string): boolean;
  /** Records a member's damage against a monster for the activity window. */
  recordMonsterDamage(sourceId: string, now: number): void;
  /** Records a heal from one party member onto another. */
  recordPartnerHeal(sourceId: string, targetId: string, now: number): void;
  /**
   * Returns the per-member experience split for a kill by `killerId`, or
   * null when shared experience does not apply (no party, toggled off, or
   * eligibility failed at this instant) — the caller then awards killer-only.
   */
  getExperienceShares(
    killerId: string,
    baseExperience: number,
    now: number,
  ): ReadonlyArray<{ playerId: string; amount: number }> | null;
  /** Online party participants credited by Canary's onDeathForParty helper. */
  getQuestParticipantIds(playerId: string): ReadonlyArray<string>;
}
