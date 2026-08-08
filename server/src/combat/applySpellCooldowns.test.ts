import { describe, expect, it } from "vitest";
import type { Session } from "../Session";
import { applySpellCooldowns } from "./applySpellCooldowns";
import type { CombatFeedback } from "./CombatFeedback";
import type { SpellDefinition } from "./Spell";

/** An avatar-shaped spell: 2 h base cooldown, no groups. */
const AVATAR = {
  id: "uteta-res-eq",
  cooldownMs: 7_200_000,
  groups: [],
  groupCooldownMs: [],
} as unknown as SpellDefinition;

function record() {
  const cooldowns: Array<{ key: string; ms: number }> = [];
  const feedback = {
    setCooldown: (_session: Session, key: string, ms: number) =>
      cooldowns.push({ key, ms }),
  } as unknown as CombatFeedback;
  return { cooldowns, feedback };
}

describe("applySpellCooldowns", () => {
  it("floors flat reductions at half the base cooldown", () => {
    const { cooldowns, feedback } = record();
    applySpellCooldowns(feedback, {} as Session, AVATAR, 0, {
      spellMs: 4_000_000,
    });

    expect(cooldowns).toEqual([{ key: "spell:uteta-res-eq", ms: 3_600_000 }]);
  });

  it("applies the premium multiplier after the floor so it bites at max grade", () => {
    const { cooldowns, feedback } = record();
    // Grade 3 avatar: two 30-minute steps land exactly on the 1 h floor;
    // premium still takes its 30% off the final figure.
    applySpellCooldowns(feedback, {} as Session, AVATAR, 0, {
      spellMs: 3_600_000,
      spellMultiplier: 0.7,
    });

    expect(cooldowns).toEqual([{ key: "spell:uteta-res-eq", ms: 2_520_000 }]);
  });

  it("multiplies the unreduced base when no flat reduction applies", () => {
    const { cooldowns, feedback } = record();
    applySpellCooldowns(feedback, {} as Session, AVATAR, 0, {
      spellMultiplier: 0.7,
    });

    expect(cooldowns).toEqual([{ key: "spell:uteta-res-eq", ms: 5_040_000 }]);
  });
});
