import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ItemSlot } from "../components/inventory/ItemSlot";

const meta = {
  title: "Game/ItemSlot",
  component: ItemSlot,
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
} satisfies Meta<typeof ItemSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithItem: Story = {
  args: {
    item: { id: "it-1", clientId: 3280, spriteId: 7749, name: "fire sword", count: 1 },
  },
};

export const Stacked: Story = {
  args: {
    item: { id: "it-2", clientId: 3031, spriteId: 7384, name: "gold coin", count: 100 },
  },
};

export const Empty: Story = {
  args: {},
};

export const EmptyWithPlaceholder: Story = {
  args: {
    placeholderSpriteId: 7843,
  },
};
