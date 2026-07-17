import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { NavigationIconButton } from "../components/navigation/NavigationIconButton";

const inventoryIcon = (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    className="size-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinejoin="round"
  >
    <path d="M5 8.5h14v11H5z" />
    <path d="M8.5 8.5V6.7A3.3 3.3 0 0 1 12 3.5a3.3 3.3 0 0 1 3.5 3.2v1.8M9 12h6" />
  </svg>
);

const meta = {
  title: "NavigationIconButton",
  component: NavigationIconButton,
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
    label: "Inventory",
    children: inventoryIcon,
    onClick: fn(),
  },
} satisfies Meta<typeof NavigationIconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Active: Story = {
  args: {
    active: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
