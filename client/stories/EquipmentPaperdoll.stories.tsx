import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { EquipmentPaperdoll } from "../components/inventory/EquipmentPaperdoll";
import type { Equipment } from "../components/inventory/inventoryTypes";

const knightEquipment: Equipment = {
  helmet: { id: "eq-1", clientId: 3351, spriteId: 7837, name: "steel helmet", count: 1 },
  amulet: { id: "eq-2", clientId: 3084, spriteId: 7522, name: "protection amulet", count: 1 },
  backpack: { id: "eq-3", clientId: 2854, spriteId: 7137, name: "backpack", count: 1 },
  armor: { id: "eq-4", clientId: 3357, spriteId: 7843, name: "plate armor", count: 1 },
  weapon: { id: "eq-5", clientId: 3280, spriteId: 7749, name: "fire sword", count: 1 },
  shield: { id: "eq-6", clientId: 3420, spriteId: 7912, name: "demon shield", count: 1 },
  legs: { id: "eq-7", clientId: 3557, spriteId: 8141, name: "plate legs", count: 1 },
  boots: { id: "eq-8", clientId: 3552, spriteId: 8125, name: "leather boots", count: 1 },
  ring: { id: "eq-9", clientId: 3092, spriteId: 7545, name: "ring", count: 1 },
  ammo: { id: "eq-10", clientId: 3447, spriteId: 7946, name: "arrow", count: 33 },
};

const meta = {
  title: "Game/EquipmentPaperdoll",
  component: EquipmentPaperdoll,
  decorators: [
    (Story) => (
      <div className="ui-backdrop p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EquipmentPaperdoll>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullyEquipped: Story = {
  args: { equipment: knightEquipment },
};

export const Empty: Story = {
  args: { equipment: {} },
};

export const PartiallyEquipped: Story = {
  args: {
    equipment: {
      weapon: knightEquipment.weapon,
      armor: knightEquipment.armor,
      backpack: knightEquipment.backpack,
    },
  },
};
