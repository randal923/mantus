import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { OwnSkullIndicator } from "../components/pvp/OwnSkullIndicator";

const meta = {
  title: "OwnSkullIndicator",
  component: OwnSkullIndicator,
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
    skull: { kind: "white", remainingMs: 14 * 60_000 + 32_000 },
  },
} satisfies Meta<typeof OwnSkullIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WhiteSkull: Story = {};

export const RedSkull: Story = {
  args: {
    skull: { kind: "red", remainingMs: 23 * 3_600_000 + 15 * 60_000 },
  },
};

export const BlackSkull: Story = {
  args: {
    skull: { kind: "black", remainingMs: 70 * 3_600_000 },
  },
};
