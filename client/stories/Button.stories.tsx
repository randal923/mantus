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
      <div className="ui-backdrop p-8">
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

export const Secondary: Story = {
  args: {
    children: "Cancel",
  },
};

export const Primary: Story = {
  args: {
    children: "Confirm",
    variant: "primary",
  },
};

export const Danger: Story = {
  args: {
    children: "Exit to Desktop",
    variant: "danger",
  },
};

export const Small: Story = {
  args: {
    children: "Sort",
    size: "sm",
  },
};

export const Disabled: Story = {
  args: {
    children: "Sort",
    disabled: true,
  },
};
