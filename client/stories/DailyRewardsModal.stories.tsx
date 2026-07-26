import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { DailyRewardsStateMessage } from "@tibia/protocol";
import { DailyRewardsModal } from "../components/daily/DailyRewardsModal";

const ITEM_DAY: DailyRewardsStateMessage = {
  type: "daily-rewards-state",
  streakPosition: 0,
  streakLevel: 12,
  jokerTokens: 2,
  claimableToday: true,
  missedDays: 0,
  xpBoostUntilMs: 0,
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

const meta = {
  title: "Game/DailyRewardsModal",
  component: DailyRewardsModal,
  parameters: { layout: "fullscreen" },
  args: {
    state: ITEM_DAY,
    error: null,
    onClaim: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof DailyRewardsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Day 1: pick supplies from the vocation pool. */
export const ItemDay: Story = {};

/** Day 3: prey wildcards, nothing to pick. */
export const WildcardDay: Story = {
  args: { state: WILDCARD_DAY },
};

/** Already claimed; jokers displayed, claim disabled. */
export const Claimed: Story = {
  args: {
    state: { ...ITEM_DAY, claimableToday: false, missedDays: 1 },
  },
};
