import type { ProficiencyStateMessage } from "@tibia/protocol";

/**
 * Ids 6, 8, and 101 are real profiles in public/assets/proficiencies.json
 * ("Sanguine 1H Sword" / "Sanguine 1H Axe" / the three-level "Crude Umbral
 * 1H Club"), so stories render actual perk tables; 9_999 exercises the
 * missing-profile fallback.
 */
export const PROFICIENCY_STATE: ProficiencyStateMessage = {
  type: "proficiency-state",
  weapons: [
    {
      proficiencyId: 6,
      experience: 42_000,
      mastered: false,
      unlockedLevels: 2,
      nextLevelExperience: 100_000,
      selections: [{ level: 0, index: 0 }],
    },
    {
      proficiencyId: 101,
      experience: 5_000,
      mastered: false,
      unlockedLevels: 1,
      nextLevelExperience: 25_000,
      selections: [],
    },
    {
      proficiencyId: 8,
      experience: 95_000_000,
      mastered: true,
      unlockedLevels: 7,
      nextLevelExperience: null,
      selections: [
        { level: 0, index: 0 },
        { level: 1, index: 2 },
      ],
    },
    {
      proficiencyId: 9_999,
      experience: 500,
      mastered: false,
      unlockedLevels: 0,
      nextLevelExperience: 1_750,
      selections: [],
    },
  ],
};

export const PROFICIENCY_STATE_EMPTY: ProficiencyStateMessage = {
  type: "proficiency-state",
  weapons: [],
};
