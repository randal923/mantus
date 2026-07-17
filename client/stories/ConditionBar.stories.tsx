import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ConditionBar } from "../components/combat/ConditionBar";

const meta = {
  title: "ConditionBar",
  component: ConditionBar,
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
    conditions: [
      { type: "poison", remainingMs: 12_000, stacks: 3 },
      { type: "fire", remainingMs: 8_000, stacks: 1 },
      { type: "energy", remainingMs: 6_000, stacks: 2 },
      { type: "paralyze", remainingMs: 4_000, stacks: 1 },
    ],
  },
} satisfies Meta<typeof ConditionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DamageConditions: Story = {};

export const UtilityAndLocks: Story = {
  args: {
    conditions: [
      { type: "haste", remainingMs: 30_000, stacks: 1 },
      { type: "regeneration", remainingMs: 45_000, stacks: 1 },
      { type: "light", remainingMs: 60_000, stacks: 1 },
      { type: "invisible", remainingMs: 15_000, stacks: 1 },
      { type: "magic-shield", remainingMs: 60_000, stacks: 1 },
      { type: "combat-lock", remainingMs: 52_000, stacks: 1 },
      { type: "pz-lock", remainingMs: 52_000, stacks: 1 },
    ],
  },
};

export const Empty: Story = {
  args: {
    conditions: [],
  },
};
