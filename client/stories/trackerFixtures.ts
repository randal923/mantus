import type {
  BoostedStateMessage,
  BossSlotsStateMessage,
  TrackerEntry,
} from "@tibia/protocol";

export const TRACKER_BESTIARY_ENTRIES: ReadonlyArray<TrackerEntry> = [
  {
    raceId: 21,
    name: "Rat",
    kills: 612,
    firstUnlock: 10,
    secondUnlock: 100,
    toKill: 250,
    completed: true,
  },
  {
    raceId: 34,
    name: "Dragon",
    kills: 40,
    firstUnlock: 25,
    secondUnlock: 250,
    toKill: 1000,
    completed: false,
  },
  {
    raceId: 27,
    name: "Wolf",
    kills: 4,
    firstUnlock: 10,
    secondUnlock: 100,
    toKill: 250,
    completed: false,
  },
];

export const TRACKER_BOSSTIARY_ENTRIES: ReadonlyArray<TrackerEntry> = [
  {
    raceId: 46,
    name: "Black Knight",
    kills: 112,
    firstUnlock: 25,
    secondUnlock: 100,
    toKill: 300,
    completed: false,
  },
];

export const BOOSTED_STATE: BoostedStateMessage = {
  type: "boosted-state",
  creature: { raceId: 34, name: "Dragon", lookTypeId: 34 },
  boss: { raceId: 478, name: "The Horned Fox", lookTypeId: 22 },
};

export const BOSS_SLOTS_STATE: BossSlotsStateMessage = {
  type: "boss-slots-state",
  slotOneUnlocked: true,
  slotTwoUnlocked: false,
  bossPoints: 50,
  slots: [
    {
      slot: 0,
      raceId: 46,
      kills: 112,
      lootBonusPercent: 30,
      inactive: false,
    },
    { slot: 1, raceId: null, kills: 0, lootBonusPercent: 0, inactive: false },
  ],
  nextRemovePriceGold: 0,
  unlockedRaceIds: [46, 205, 478],
  boosted: {
    raceId: 478,
    kills: 7,
    killBonus: 3,
    lootBonusPercent: 250,
  },
};
