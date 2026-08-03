import type {
  AnimusStateMessage,
  CyclopediaCombatStateMessage,
  CyclopediaDeathsStateMessage,
  CyclopediaItemSummaryStateMessage,
  CyclopediaPvpKillsStateMessage,
  OwnCharacterState,
  ProfileStateMessage,
} from "@tibia/protocol";

export const OWN_CHARACTER: OwnCharacterState = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "Deceius",
  vocation: "Knight",
  definitionVersion: 1,
  level: 47,
  experience: "1842000",
  experienceForCurrentLevel: "1780000",
  experienceForNextLevel: "1920000",
  experienceRate: {
    basePercent: 500,
    xpBoostPercent: 50,
    xpBoostRemainingMs: 1_800_000,
    staminaPercent: 150,
    totalPercent: 1_125,
  },
  magicLevel: 8,
  manaSpent: 2_100,
  manaSpentForNextMagicLevel: 4_800,
  health: 720,
  maxHealth: 840,
  mana: 210,
  maxMana: 285,
  capacity: 1_550,
  soul: 78,
  maxSoul: 100,
  stamina: 2_520,
  maxStamina: 2_520,
  staminaBonusPercent: 100,
  speed: 156,
  attackSpeedMs: 2_000,
  healthRegeneration: { amount: 1, intervalMs: 6_000 },
  manaRegeneration: { amount: 2, intervalMs: 6_000 },
  soulRegeneration: { amount: 1, intervalMs: 120_000 },
  skills: [
    { skill: "fist", level: 18, tries: 12, triesForNextLevel: 106 },
    { skill: "club", level: 22, tries: 33, triesForNextLevel: 157 },
    { skill: "sword", level: 61, tries: 3_820, triesForNextLevel: 6_456 },
    { skill: "axe", level: 24, tries: 58, triesForNextLevel: 190 },
    { skill: "distance", level: 31, tries: 104, triesForNextLevel: 2_065 },
    { skill: "shielding", level: 58, tries: 2_018, triesForNextLevel: 9_702 },
    { skill: "fishing", level: 14, tries: 8, triesForNextLevel: 29 },
  ],
  equipmentBonuses: {
    magicLevel: 0,
    maxHealth: 0,
    maxMana: 0,
    capacity: 0,
    speed: 0,
    attackSpeedMs: 0,
  },
  outfit: {
    lookType: 128,
    head: 78,
    body: 68,
    legs: 58,
    feet: 76,
    addons: 0,
  },
  position: { x: 100, y: 100, z: 7 },
  direction: "south",
  townId: 1,
  lastLoginAt: null,
};

export const CYCLOPEDIA_COMBAT: CyclopediaCombatStateMessage = {
  type: "cyclopedia-combat-state",
  criticalChancePercent: 10.5,
  criticalDamagePercent: 24,
  lifeLeechPercent: 5,
  manaLeechPercent: 2.5,
  attackSkill: 61,
  attackValue: 48,
  defenseValue: 39,
  armorValue: 52,
  mitigationPercent: 8.42,
  onslaughtPercent: 6.5,
  rusePercent: 0,
  momentumPercent: 4,
  absorbs: [
    { element: "fire", percent: 12 },
    { element: "ice", percent: 5 },
    { element: "death", percent: -8 },
  ],
};

export const CYCLOPEDIA_DEATHS: CyclopediaDeathsStateMessage = {
  type: "cyclopedia-deaths-state",
  page: 0,
  totalPages: 2,
  entries: [
    {
      at: 1_753_400_000_000,
      level: 47,
      cause: "Killed at level 47 by a dragon lord.",
    },
    {
      at: 1_753_300_000_000,
      level: 46,
      cause: "Killed at level 46 by a giant spider and a poison spider.",
    },
  ],
};

export const CYCLOPEDIA_PVP_KILLS: CyclopediaPvpKillsStateMessage = {
  type: "cyclopedia-pvp-kills-state",
  page: 0,
  totalPages: 1,
  entries: [
    {
      at: 1_753_350_000_000,
      description: "Killed Ghazbaran's Minion.",
      status: "unjustified",
    },
    {
      at: 1_753_250_000_000,
      description: "Killed Morgur the Wild.",
      status: "justified",
    },
  ],
};

export const CYCLOPEDIA_ITEM_SUMMARY: CyclopediaItemSummaryStateMessage = {
  type: "cyclopedia-item-summary-state",
  carried: [
    { itemTypeId: 3031, tier: 0, count: 4_250 },
    { itemTypeId: 3366, tier: 2, count: 1 },
    { itemTypeId: 236, tier: 0, count: 35 },
  ],
  depot: [
    { itemTypeId: 3364, tier: 0, count: 1 },
    { itemTypeId: 3079, tier: 0, count: 2 },
  ],
  inbox: [{ itemTypeId: 3554, tier: 1, count: 1 }],
  stash: [{ itemTypeId: 3725, tier: 0, count: 318 }],
};

export const ANIMUS_STATE: AnimusStateMessage = {
  type: "animus-state",
  raceIds: [21, 34],
  bonusTenthsPercent: 20,
};

export const CYCLOPEDIA_PROFILE: ProfileStateMessage = {
  type: "profile-state",
  achievements: [
    {
      achievementId: "annihilator",
      name: "Annihilator",
      description: "You defeated the four bosses of the Annihilator room.",
      grade: 2,
      points: 5,
      secret: false,
      granted: true,
    },
    {
      achievementId: "backpack-tourist",
      name: "Backpack Tourist",
      description: "You looted your first hundred containers.",
      grade: 1,
      points: 1,
      secret: false,
      granted: false,
    },
  ],
  titles: [
    { titleId: "annihilator", name: "Annihilator", granted: true },
    { titleId: "creature-of-habit", name: "Creature of Habit", granted: false },
  ],
  badges: [{ badgeId: "loyalty-1", name: "Fledgeling Hero" }],
  selectedTitle: "annihilator",
  points: 15,
};
