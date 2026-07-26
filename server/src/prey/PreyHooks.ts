import type { Monster } from "../creature/Monster";

/**
 * Combat/death-side surface of the prey system. Every method reads the
 * live in-memory slot state at execution time (charter rule 4) — a bonus
 * that expired or was rerolled between enqueue and execution returns 0.
 */
export interface PreyHooks {
  /** Extra outgoing damage % when the attacker's active prey matches. */
  damageBoostPercent(attackerId: string, monster: Monster): number;
  /** Incoming damage reduction % when the defender's active prey matches. */
  damageReductionPercent(defenderId: string, monster: Monster): number;
  /** Extra hunt experience % for this recipient against this monster. */
  experienceBonusPercent(recipientId: string, monster: Monster): number;
  /** Chance % of one extra full loot roll on the corpse. */
  improvedLootPercent(killerId: string, monster: Monster): number;
  /** Drains prey hunting time in Canary's 60/120 s exp-gain chunks. */
  onHuntExperienceGained(recipientId: string, now: number): void;
}
