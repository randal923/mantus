import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EquipmentPaperdoll } from "../components/inventory/EquipmentPaperdoll";
import type { Equipment } from "../components/inventory/inventoryTypes";
import { makeInventoryItem } from "./makeInventoryItem";

const equipment: Equipment = {
  helmet: makeInventoryItem({
    id: "00000000-0000-4000-8000-000000000001",
    clientId: 3355,
    spriteId: 7841,
    name: "Leather Helmet",
    count: 1,
    equipmentSlot: "helmet",
  }),
  backpack: makeInventoryItem({
    id: "00000000-0000-4000-8000-000000000002",
    clientId: 2854,
    spriteId: 7137,
    name: "Backpack",
    count: 1,
    equipmentSlot: "backpack",
  }),
  weapon: makeInventoryItem({
    id: "00000000-0000-4000-8000-000000000003",
    clientId: 3273,
    spriteId: 7742,
    name: "Sabre",
    count: 1,
    equipmentSlot: "weapon",
  }),
  shield: makeInventoryItem({
    id: "00000000-0000-4000-8000-000000000004",
    clientId: 3412,
    spriteId: 7898,
    name: "Wooden Shield",
    count: 1,
    equipmentSlot: "shield",
  }),
};

const meta = {
  title: "EquipmentPaperdoll",
  component: EquipmentPaperdoll,
  parameters: { layout: "centered" },
} satisfies Meta<typeof EquipmentPaperdoll>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Equipped: Story = { args: { equipment } };
export const Empty: Story = { args: { equipment: {} } };
