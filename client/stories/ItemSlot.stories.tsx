import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ItemSlot } from "../components/inventory/ItemSlot";
import { makeInventoryItem } from "./makeInventoryItem";

const meta = {
  title: "Game/ItemSlot",
  component: ItemSlot,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ItemSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Item: Story = {
  args: {
    item: makeInventoryItem({
      id: "00000000-0000-4000-8000-000000000001",
      clientId: 3273,
      spriteId: 7742,
      name: "Sabre",
      count: 1,
      equipmentSlot: "weapon",
    }),
  },
};

export const Stack: Story = {
  args: {
    item: makeInventoryItem({
      id: "00000000-0000-4000-8000-000000000002",
      clientId: 3031,
      spriteId: 7384,
      name: "Gold Coin",
      count: 100,
    }),
  },
};

export const Empty: Story = { args: {} };
