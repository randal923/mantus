import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { HealthManaBars } from "../components/navigation/HealthManaBars";

const meta = {
  title: "Game/Navigation/HealthManaBars",
  component: HealthManaBars,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop w-80 p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    health: 1240,
    maxHealth: 1580,
    mana: 390,
    maxMana: 620,
  },
} satisfies Meta<typeof HealthManaBars>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Full: Story = {
  args: {
    health: 1580,
    mana: 620,
  },
};

export const Critical: Story = {
  args: {
    health: 126,
    mana: 48,
  },
};

export const Empty: Story = {
  args: {
    health: 0,
    mana: 0,
  },
};
