import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { ContainerState } from "@tibia/protocol";
import { ContainerInventorySection } from "../components/inventory/ContainerInventorySection";
import { makeInventoryItem } from "./makeInventoryItem";

const BACKPACK: ContainerState = {
  container: makeInventoryItem({
    id: "00000000-0000-4000-8000-000000000001",
    clientId: 2854,
    spriteId: 7137,
    name: "Backpack",
    count: 1,
  }),
  parentContainerId: null,
  capacity: 8,
  items: [
    {
      slot: 0,
      item: makeInventoryItem({
        id: "00000000-0000-4000-8000-000000000002",
        clientId: 3031,
        spriteId: 7384,
        name: "Gold Coin",
        count: 100,
      }),
    },
    {
      slot: 1,
      item: makeInventoryItem({
        id: "00000000-0000-4000-8000-000000000003",
        clientId: 266,
        spriteId: 4358,
        name: "Health Potion",
        count: 5,
      }),
    },
    {
      slot: 3,
      item: makeInventoryItem({
        id: "00000000-0000-4000-8000-000000000004",
        clientId: 3273,
        spriteId: 7742,
        name: "Sabre",
        count: 1,
        equipmentSlot: "weapon",
      }),
    },
  ],
};

const meta = {
  title: "Game/ContainerInventorySection",
  component: ContainerInventorySection,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-panel-frame w-80 p-3 font-tibia">
        <Story />
      </div>
    ),
  ],
  args: {
    state: BACKPACK,
    onActivate: fn(),
    onDragStart: fn(),
    onDragEnd: fn(),
    onDrop: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ContainerInventorySection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithItems: Story = {};

export const Empty: Story = {
  args: {
    state: { ...BACKPACK, items: [] },
  },
};

export const Full: Story = {
  args: {
    state: {
      ...BACKPACK,
      items: Array.from({ length: 8 }, (_, slot) => ({
        slot,
        item: makeInventoryItem({
          id: `00000000-0000-4000-8000-0000000001${slot.toString().padStart(2, "0")}`,
          clientId: 3031,
          spriteId: 7384,
          name: "Gold Coin",
          count: 100,
        }),
      })),
    },
  },
};
