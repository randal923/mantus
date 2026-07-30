import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type {
  DailyRewardHistoryEntry,
  DailyRewardsStateMessage,
} from "@tibia/protocol";
import { DailyRewardsModal } from "../components/daily/DailyRewardsModal";

/** Fixed so the countdown renders the same string in every snapshot. */
const DAY_ENDS_AT = Date.now() + 80_460_000;

const ITEM_DAY: DailyRewardsStateMessage = {
  type: "daily-rewards-state",
  streakPosition: 0,
  streakLevel: 12,
  jokerTokens: 2,
  claimableToday: true,
  missedDays: 0,
  xpBoostUntilMs: 0,
  dayEndsAtMs: DAY_ENDS_AT,
  accountTier: "premium",
  pool: [
    { itemTypeId: 266, name: "health potion", spriteId: 266 },
    { itemTypeId: 268, name: "mana potion", spriteId: 268 },
    { itemTypeId: 236, name: "strong health potion", spriteId: 236 },
    { itemTypeId: 3203, name: "animate dead rune", spriteId: 3203 },
  ],
  allowance: 5,
};

const WILDCARD_DAY: DailyRewardsStateMessage = {
  ...ITEM_DAY,
  streakPosition: 2,
  pool: [],
  allowance: 2,
};

const HISTORY: ReadonlyArray<DailyRewardHistoryEntry> = [
  {
    claimedAtMs: DAY_ENDS_AT - 90_000_000,
    rewardDay: 2,
    kind: "vocation-items",
    allowance: 10,
    items: [
      { itemTypeId: 266, name: "health potion", count: 6 },
      { itemTypeId: 268, name: "mana potion", count: 4 },
    ],
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
    state: ITEM_DAY,
    error: null,
    onClaim: fn(),
    onRequestHistory: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof DailyRewardsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Day 1: pick supplies from the vocation pool, every bonus unlocked. */
export const ItemDay: Story = {};

/** Day 3: prey wildcards, nothing to pick. */
export const WildcardDay: Story = {
  args: { state: WILDCARD_DAY },
};

/** Already claimed today; the whole run up to here shows as collected. */
export const Claimed: Story = {
  args: {
    state: { ...ITEM_DAY, streakPosition: 3, claimableToday: false },
  },
};

/** A missed day: the streak is one claim away from resetting. */
export const StreakAtRisk: Story = {
  args: {
    state: { ...ITEM_DAY, streakPosition: 4, missedDays: 1, jokerTokens: 0 },
  },
};

/** A free account: rewards are halved and no resting bonus is active. */
export const FreeAccount: Story = {
  args: {
    state: { ...ITEM_DAY, accountTier: "free", streakLevel: 3, allowance: 5 },
  },
};

/** The History panel, already answered by the server. */
export const History: Story = {
  args: { history: HISTORY },
};
