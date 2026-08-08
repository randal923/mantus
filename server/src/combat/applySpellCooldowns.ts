import type { Session } from "../Session";
import type { CombatFeedback } from "./CombatFeedback";
import type { SpellDefinition } from "./Spell";

/**
 * Wheel augments shorten the spell cooldown and the *secondary* group's
 * cooldown; like Canary, the reduction never pushes a cooldown below half
 * its base (spells.cpp:826-827, 849-851). The reductions come from the
 * server-owned wheel allocation, never the client.
 */
export interface SpellCooldownReductions {
  readonly spellMs?: number;
  readonly secondaryGroupMs?: number;
  /**
   * Multiplier on the spell's final cooldown, applied after the half-base
   * floor so the premium avatar discount still bites at max wheel grade
   * (where the flat reductions already sit exactly on the floor).
   */
  readonly spellMultiplier?: number;
}

const reduced = (baseMs: number, reductionMs: number): number =>
  reductionMs > 0
    ? Math.max(Math.floor(baseMs / 2), baseMs - reductionMs)
    : baseMs;

export function applySpellCooldowns(
  feedback: CombatFeedback,
  session: Session,
  spell: SpellDefinition,
  now: number,
  reductions: SpellCooldownReductions = {},
): void {
  feedback.setCooldown(
    session,
    `spell:${spell.id}`,
    Math.round(
      reduced(spell.cooldownMs, reductions.spellMs ?? 0) *
        (reductions.spellMultiplier ?? 1),
    ),
    now,
  );
  for (let index = 0; index < spell.groups.length; index++) {
    const group = spell.groups[index];
    const baseMs = spell.groupCooldownMs[index] ?? 0;
    const totalMs =
      index === 1
        ? reduced(baseMs, reductions.secondaryGroupMs ?? 0)
        : baseMs;
    if (group && totalMs > 0) {
      feedback.setCooldown(session, `group:${group}`, totalMs, now);
    }
  }
}
