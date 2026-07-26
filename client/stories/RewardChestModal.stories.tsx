import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { RewardChestStateMessage } from "@tibia/protocol";
import { RewardChestModal } from "../components/reward/RewardChestModal";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

const STATE: RewardChestStateMessage = {
  type: "reward-chest-state",
  bags: [
    {
      bagId: "00000000-0000-4000-8000-000000000201",
      createdAtMs: NOW - DAY,
      expiresAtMs: NOW + 6 * DAY,
      bossName: "Grand Master Oberon",
      items: [
        {
          itemId: "00000000-0000-4000-8000-000000000202",
          itemTypeId: 3031,
          count: 74,
          name: "gold coin",
          spriteId: 3031,
        },
        {
          itemId: "00000000-0000-4000-8000-000000000203",
          itemTypeId: 3357,
          count: 1,
          name: "plate armor",
          spriteId: 3357,
        },
      ],
    },
    {
      bagId: "00000000-0000-4000-8000-000000000204",
      createdAtMs: NOW - 6 * DAY - 20 * 3_600_000,
      expiresAtMs: NOW + 4 * 3_600_000,
      bossName: "Gaz'haragoth",
      items: [
        {
          itemId: "00000000-0000-4000-8000-000000000205",
          itemTypeId: 3035,
          count: 12,
          name: "platinum coin",
          spriteId: 3035,
        },
      ],
    },
  ],
};

const meta = {
  title: "Game/RewardChestModal",
  component: RewardChestModal,
  parameters: { layout: "fullscreen" },
  args: {
    state: STATE,
    nowMs: NOW,
    error: null,
    onCollect: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof RewardChestModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two bags: one fresh, one hours from expiry. */
export const WithBags: Story = {};

/** Nothing to collect. */
export const Empty: Story = {
  args: { state: { type: "reward-chest-state", bags: [] } },
};

/** A rejected collect surfaces the server reason. */
export const WithError: Story = {
  args: { error: "You have no room to take it." },
};
