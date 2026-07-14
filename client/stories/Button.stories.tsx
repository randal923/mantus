import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { Button } from "../components/ui/Button";

const meta = {
  title: "Game/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="bg-ui-panel p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    onClick: fn(),
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Steel: Story = {
  args: {
    children: "Cancel",
  },
};

export const Gold: Story = {
  args: {
    children: "Confirm",
    variant: "gold",
  },
};

export const Red: Story = {
  args: {
    children: "Exit to Desktop",
    variant: "red",
  },
};

export const Disabled: Story = {
  args: {
    children: "Sort",
    disabled: true,
  },
};
