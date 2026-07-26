import { loadCanaryAchievements } from "./loadCanaryAchievements";

/**
 * The achievement catalog: a handful of pinned mantus definitions plus the
 * full imported Canary catalog (content/profile/canary-achievements.json).
 * Definitions are static content — ids are stable strings and never come from
 * the network — and every grant path resolves through this map, so a
 * client-supplied id that is not here simply has no achievement to grant
 * (charter rule 1).
 *
 * `levelRequirement` is the only self-driving source today: the profile sweep
 * grants those from the server's own level. Everything else is granted by the
 * system that owns the event, through `ProfileService.grant`; Canary entries
 * without a mantus grant hook are visible catalog progress, not yet earnable.
 */
export interface AchievementDefinition {
  readonly achievementId: string;
  readonly name: string;
  readonly description: string;
  readonly grade: 1 | 2 | 3 | 4;
  readonly points: number;
  /** Secret in Canary's catalog; the client hides it until granted. */
  readonly secret?: boolean;
  /** Granted automatically once the character reaches this level. */
  readonly levelRequirement?: number;
  /** Title unlocked together with the achievement. */
  readonly titleId?: string;
}

const DEFINITIONS: ReadonlyArray<AchievementDefinition> = [
  {
    achievementId: "first-steps",
    name: "First Steps",
    description: "Reach level 10.",
    grade: 1,
    points: 1,
    levelRequirement: 10,
  },
  {
    achievementId: "seasoned-traveller",
    name: "Seasoned Traveller",
    description: "Reach level 50.",
    grade: 1,
    points: 2,
    levelRequirement: 50,
    titleId: "traveller",
  },
  {
    achievementId: "veteran",
    name: "Veteran",
    description: "Reach level 100.",
    grade: 2,
    points: 3,
    levelRequirement: 100,
    titleId: "veteran",
  },
  {
    achievementId: "living-legend",
    name: "Living Legend",
    description: "Reach level 200.",
    grade: 3,
    points: 5,
    levelRequirement: 200,
    titleId: "legend",
  },
  {
    achievementId: "landlord",
    name: "Landlord",
    description: "Own a house.",
    grade: 1,
    points: 2,
    titleId: "landlord",
  },
  {
    achievementId: "big-spender",
    name: "Big Spender",
    description: "Win a house auction.",
    grade: 2,
    points: 3,
  },
  {
    achievementId: "guild-founder",
    name: "Guild Founder",
    description: "Found a guild.",
    grade: 1,
    points: 2,
    titleId: "founder",
  },
];

const CANARY_DEFINITIONS = loadCanaryAchievements();

export const ACHIEVEMENTS: ReadonlyMap<string, AchievementDefinition> = new Map(
  [...DEFINITIONS, ...CANARY_DEFINITIONS].map((definition) => [
    definition.achievementId,
    definition,
  ]),
);

if (ACHIEVEMENTS.size !== DEFINITIONS.length + CANARY_DEFINITIONS.length) {
  // A Canary slug shadowing a pinned id would silently drop a definition and
  // orphan its granted rows; fail at boot instead.
  throw new Error("achievement catalog ids collide");
}

/** Display names for every title the catalog can unlock. */
export const TITLE_NAMES: ReadonlyMap<string, string> = new Map([
  ["traveller", "the Traveller"],
  ["veteran", "the Veteran"],
  ["legend", "the Living Legend"],
  ["landlord", "the Landlord"],
  ["founder", "the Founder"],
]);

/** Display names for every badge the server can grant. */
export const BADGE_NAMES: ReadonlyMap<string, string> = new Map([
  ["premium", "Premium"],
  ["staff", "Staff"],
]);
