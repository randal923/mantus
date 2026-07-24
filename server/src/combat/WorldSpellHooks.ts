import type { Session } from "../Session";

/**
 * Movement-side executors for floor-moving spells. Each returns whether the
 * player actually moved; the spell pipeline spends resources only on success.
 */
export interface WorldSpellHooks {
  magicRope(session: Session, now: number): boolean;
  levitate(session: Session, parameter: "up" | "down", now: number): boolean;
}
