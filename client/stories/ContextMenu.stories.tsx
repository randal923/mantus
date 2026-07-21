import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { ContextMenu } from "../components/ui/ContextMenu";

const meta = {
  title: "ContextMenu",
  component: ContextMenu,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop min-h-96">
        <Story />
      </div>
    ),
  ],
  args: {
    x: 120,
    y: 80,
    items: [
      { id: "look", label: "Look", onSelect: fn() },
      { id: "use", label: "Use", onSelect: fn() },
      { id: "attack", label: "Attack", onSelect: fn() },
    ],
    onClose: fn(),
  },
} satisfies Meta<typeof ContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CreatureTarget: Story = {
  args: {
    items: [
      { id: "look", label: "Look", onSelect: fn() },
      { id: "stop-attack", label: "Stop Attack", onSelect: fn() },
    ],
  },
};
