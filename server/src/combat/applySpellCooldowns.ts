import type { Session } from "../Session";
import type { CombatFeedback } from "./CombatFeedback";
import type { SpellDefinition } from "./Spell";

export function applySpellCooldowns(
  feedback: CombatFeedback,
  session: Session,
  spell: SpellDefinition,
  now: number,
): void {
  feedback.setCooldown(
    session,
    `spell:${spell.id}`,
    spell.cooldownMs,
    now,
  );
  for (let index = 0; index < spell.groups.length; index++) {
    const group = spell.groups[index];
    const totalMs = spell.groupCooldownMs[index] ?? 0;
    if (group && totalMs > 0) {
      feedback.setCooldown(session, `group:${group}`, totalMs, now);
    }
  }
}
