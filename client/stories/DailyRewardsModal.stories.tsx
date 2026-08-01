import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type {
  DailyRewardHistoryEntry,
  DailyRewardsStateMessage,
} from "@tibia/protocol";
import { DailyRewardsModal } from "../components/daily/DailyRewardsModal";

/** Fixed so the countdown renders the same string in every snapshot. */
const DAY_ENDS_AT = Date.now() + 80_460_000;

const EXERCISE_WEAPON_DAY: DailyRewardsStateMessage = {
  type: "daily-rewards-state",
  streakPosition: 2,
  streakLevel: 12,
  jokerTokens: 2,
  claimableToday: true,
  missedDays: 0,
  xpBoostUntilMs: 0,
  dayEndsAtMs: DAY_ENDS_AT,
  accountTier: "premium",
  pool: [
    { itemTypeId: 28_552, name: "exercise sword", spriteId: 25_676 },
    { itemTypeId: 28_553, name: "exercise axe", spriteId: 25_681 },
    { itemTypeId: 28_554, name: "exercise club", spriteId: 25_686 },
    { itemTypeId: 28_555, name: "exercise bow", spriteId: 25_691 },
    { itemTypeId: 28_556, name: "exercise rod", spriteId: 25_696 },
    { itemTypeId: 28_557, name: "exercise wand", spriteId: 25_701 },
    { itemTypeId: 44_065, name: "exercise shield", spriteId: 41_861 },
    { itemTypeId: 50_293, name: "exercise wraps", spriteId: 45_290 },
  ],
  allowance: 1,
};

const WILDCARD_DAY: DailyRewardsStateMessage = {
  ...EXERCISE_WEAPON_DAY,
  streakPosition: 0,
  pool: [],
  allowance: 2,
};

const HISTORY: ReadonlyArray<DailyRewardHistoryEntry> = [
  {
    claimedAtMs: DAY_ENDS_AT - 90_000_000,
    rewardDay: 2,
    kind: "xp-boost",
    allowance: 30,
    items: [],
  },
  {
    claimedAtMs: DAY_ENDS_AT - 180_000_000,
    rewardDay: 1,
    kind: "wildcards",
    allowance: 2,
    items: [],
  },
];

const meta = {
  title: "Game/DailyRewardsModal",
  component: DailyRewardsModal,
  parameters: { layout: "fullscreen" },
  args: {
    state: EXERCISE_WEAPON_DAY,
    error: null,
    onClaim: fn(),
    onRequestHistory: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof DailyRewardsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Day 3: clicking the current card opens the exercise-weapon chooser. */
export const ExerciseWeaponDay: Story = {};

/** Day 1: clicking the current card claims prey wildcards. */
export const WildcardDay: Story = {
  args: { state: WILDCARD_DAY },
};

/** Already claimed today; the whole run up to here shows as collected. */
export const Claimed: Story = {
  args: {
    state: {
      ...EXERCISE_WEAPON_DAY,
      streakPosition: 3,
      claimableToday: false,
      pool: [],
    },
  },
};

/** A missed day: the streak is one claim away from resetting. */
export const StreakAtRisk: Story = {
  args: {
    state: {
      ...EXERCISE_WEAPON_DAY,
      streakPosition: 4,
      missedDays: 1,
      jokerTokens: 0,
      pool: [],
      allowance: 30,
    },
  },
};

/** A free account: rewards are halved and no resting bonus is active. */
export const FreeAccount: Story = {
  args: {
    state: {
      ...EXERCISE_WEAPON_DAY,
      accountTier: "free",
      streakLevel: 3,
    },
  },
};

/** The History panel, already answered by the server. */
export const History: Story = {
  args: { history: HISTORY },
};
