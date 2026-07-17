import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { CombatLog } from "../components/combat/CombatLog";

const meta = {
  title: "CombatLog",
  component: CombatLog,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop relative h-80 overflow-hidden">
        <Story />
      </div>
    ),
  ],
  args: {
    entries: [
      "Rat: 6 physical.",
      "You gained 5 experience.",
      "poison applied.",
      "You missed Cave Spider.",
    ],
  },
} satisfies Meta<typeof CombatLog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecentCombat: Story = {};

export const BusyFight: Story = {
  args: {
    entries: [
      "Dragon: 82 ice.",
      "Dragon: 41 physical.",
      "You gained 700 experience.",
      "magic-shield applied.",
      "Dragon: 125 fire.",
      "You missed Dragon.",
    ],
  },
};

export const Empty: Story = {
  args: {
    entries: [],
  },
};
