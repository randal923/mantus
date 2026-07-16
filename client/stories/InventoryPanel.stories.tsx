import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { InventoryPanel } from "../components/inventory/InventoryPanel";
import type { Equipment } from "../components/inventory/inventoryTypes";
import { makeInventoryItem } from "./makeInventoryItem";

const equipment: Equipment = {
  backpack: makeInventoryItem({
    id: "00000000-0000-4000-8000-000000000001",
    clientId: 2854,
    spriteId: 7137,
    name: "Backpack",
    count: 1,
    equipmentSlot: "backpack",
  }),
  weapon: makeInventoryItem({
    id: "00000000-0000-4000-8000-000000000002",
    clientId: 3273,
    spriteId: 7742,
    name: "Sabre",
    count: 1,
    equipmentSlot: "weapon",
  }),
};

const items = [
  makeInventoryItem({
    id: "00000000-0000-4000-8000-000000000003",
    clientId: 3031,
    spriteId: 7384,
    name: "Gold Coin",
    count: 100,
  }),
  makeInventoryItem({
    id: "00000000-0000-4000-8000-000000000004",
    clientId: 266,
    spriteId: 4358,
    name: "Health Potion",
    count: 5,
  }),
];

const meta = {
  title: "Game/InventoryPanel",
  component: InventoryPanel,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop flex h-dvh items-start justify-center p-6">
        <Story />
      </div>
    ),
  ],
  args: { onClose: fn(), onStack: fn(), onSort: fn() },
} satisfies Meta<typeof InventoryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Knight: Story = {
  args: {
    characterName: "Deceius",
    equipment,
    items,
    gold: 100,
    platinum: 0,
    capacityUsed: 214,
    capacityMax: 400,
    slotCount: 20,
  },
};

export const FreshCharacter: Story = {
  args: {
    characterName: "Newbie",
    equipment: {},
    items: [],
    gold: 0,
    platinum: 0,
    capacityUsed: 0,
    capacityMax: 400,
    slotCount: 0,
  },
};
