import { DAILY_REWARD_TABLE } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { ItemCatalog } from "../item/ItemCatalog";
import type { ItemType } from "../item/ItemType";
import { EXERCISE_WEAPON_POOL } from "./dailyRewardPools";
import { validateDailyRewardPicks } from "./validateDailyRewardPicks";

const EXERCISE_SWORD = 28_552;
const EXERCISE_AXE = 28_553;
const STARTER_TRAINING_SWORD = 28_540;

const makeItemType = (id: number): ItemType => ({
  id,
  clientId: id,
  name: `type-${id}`,
  spriteId: id,
  stackable: false,
  maxCount: 1,
  weight: 1_000,
  pickupable: true,
  movable: true,
  charges: 500,
  light: { intensity: 0, color: 0 },
  elevation: 0,
  render: {
    ground: false,
    groundBorder: false,
    onBottom: false,
    onTop: false,
    stackable: false,
    fluidContainer: false,
    splash: false,
    hangable: false,
    hookSouth: false,
    hookEast: false,
    lyingCorpse: false,
    animateAlways: false,
    topEffect: false,
  },
});

const catalog = new ItemCatalog([
  makeItemType(EXERCISE_SWORD),
  makeItemType(EXERCISE_AXE),
  makeItemType(STARTER_TRAINING_SWORD),
]);

describe("validateDailyRewardPicks", () => {
  it("keeps the seven-day cycle to prey cards, XP, and exercise weapons", () => {
    expect(DAILY_REWARD_TABLE.map((reward) => reward.kind)).toEqual([
      "wildcards",
      "xp-boost",
      "training-items",
      "wildcards",
      "xp-boost",
      "training-items",
      "wildcards",
    ]);
    expect(EXERCISE_WEAPON_POOL).toEqual([
      28_552,
      28_553,
      28_554,
      28_555,
      28_556,
      28_557,
      44_065,
      50_293,
    ]);
  });

  it("accepts one exercise weapon selected from the server pool", () => {
    expect(
      validateDailyRewardPicks(
        catalog,
        "Knight",
        "training-items",
        [{ itemTypeId: EXERCISE_SWORD, count: 1 }],
        1,
      ),
    ).toEqual([
      {
        typeId: EXERCISE_SWORD,
        count: 1,
        stackable: false,
        maxCount: 1,
      },
    ]);
  });

  it("rejects starter weapons, multiple choices, and forged quantities", () => {
    expect(
      validateDailyRewardPicks(
        catalog,
        "Knight",
        "training-items",
        [{ itemTypeId: STARTER_TRAINING_SWORD, count: 1 }],
        1,
      ),
    ).toBeNull();
    expect(
      validateDailyRewardPicks(
        catalog,
        "Knight",
        "training-items",
        [
          { itemTypeId: EXERCISE_SWORD, count: 1 },
          { itemTypeId: EXERCISE_AXE, count: 1 },
        ],
        1,
      ),
    ).toBeNull();
    expect(
      validateDailyRewardPicks(
        catalog,
        "Knight",
        "training-items",
        [{ itemTypeId: EXERCISE_SWORD, count: 2 }],
        1,
      ),
    ).toBeNull();
  });
});
