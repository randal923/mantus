import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { VitalOrb } from "../components/action-bar/VitalOrb";

const meta = {
  title: "VitalOrb",
  component: VitalOrb,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    kind: "health",
    value: 1240,
    max: 1580,
  },
} satisfies Meta<typeof VitalOrb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Health: Story = {};

export const CriticalHealth: Story = {
  args: {
    value: 126,
  },
};

export const Mana: Story = {
  args: {
    kind: "mana",
    value: 390,
    max: 620,
  },
};
