import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { InventoryPanel } from "../components/inventory/InventoryPanel";
import type { Equipment, InventoryItem } from "../components/inventory/inventoryTypes";

const knightEquipment: Equipment = {
  helmet: { id: "eq-1", clientId: 3351, spriteId: 428, name: "steel helmet", count: 1 },
  amulet: { id: "eq-2", clientId: 3084, spriteId: 3810, name: "protection amulet", count: 1 },
  backpack: { id: "eq-3", clientId: 2854, spriteId: 185, name: "backpack", count: 1 },
  armor: { id: "eq-4", clientId: 3357, spriteId: 3829, name: "plate armor", count: 1 },
  weapon: { id: "eq-5", clientId: 3280, spriteId: 188, name: "fire sword", count: 1 },
  shield: { id: "eq-6", clientId: 3420, spriteId: 1986, name: "demon shield", count: 1 },
  legs: { id: "eq-7", clientId: 3557, spriteId: 3830, name: "plate legs", count: 1 },
  boots: { id: "eq-8", clientId: 3552, spriteId: 438, name: "leather boots", count: 1 },
  ring: { id: "eq-9", clientId: 3092, spriteId: 3816, name: "ring", count: 1 },
  ammo: { id: "eq-10", clientId: 3447, spriteId: 884, name: "arrow", count: 33 },
};

const backpackItems: InventoryItem[] = [
  { id: "it-1", clientId: 3031, spriteId: 350, name: "gold coin", count: 100 },
  { id: "it-2", clientId: 3035, spriteId: 342, name: "platinum coin", count: 46 },
  { id: "it-3", clientId: 3043, spriteId: 5389, name: "crystal coin", count: 3 },
  { id: "it-4", clientId: 3155, spriteId: 1227, name: "sudden death rune", count: 30 },
  { id: "it-5", clientId: 3160, spriteId: 1176, name: "ultimate healing rune", count: 90 },
  { id: "it-6", clientId: 3161, spriteId: 1177, name: "great fireball rune", count: 15 },
  { id: "it-7", clientId: 3147, spriteId: 1167, name: "blank rune", count: 6 },
  { id: "it-8", clientId: 239, spriteId: 16366, name: "great health potion", count: 41 },
  { id: "it-9", clientId: 238, spriteId: 16365, name: "great mana potion", count: 12 },
  { id: "it-10", clientId: 3446, spriteId: 13700, name: "bolt", count: 72 },
  { id: "it-11", clientId: 3449, spriteId: 1671, name: "burst arrow", count: 58 },
  { id: "it-12", clientId: 3450, spriteId: 13740, name: "power bolt", count: 25 },
  { id: "it-13", clientId: 3265, spriteId: 114, name: "two handed sword", count: 1 },
  { id: "it-14", clientId: 3360, spriteId: 1698, name: "golden armor", count: 1 },
  { id: "it-15", clientId: 3364, spriteId: 1418, name: "golden legs", count: 1 },
  { id: "it-16", clientId: 3555, spriteId: 420, name: "golden boots", count: 1 },
  { id: "it-17", clientId: 3577, spriteId: 1654, name: "meat", count: 8 },
  { id: "it-18", clientId: 3578, spriteId: 150, name: "fish", count: 5 },
  { id: "it-19", clientId: 3585, spriteId: 1128, name: "apple", count: 2 },
  { id: "it-20", clientId: 3600, spriteId: 358, name: "bread", count: 1 },
  { id: "it-21", clientId: 2853, spriteId: 43, name: "bag", count: 1 },
];

const meta = {
  title: "Game/InventoryPanel",
  component: InventoryPanel,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="flex h-dvh items-start justify-center bg-neutral-900 p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    onClose: fn(),
    onStack: fn(),
    onSort: fn(),
  },
} satisfies Meta<typeof InventoryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Knight: Story = {
  args: {
    characterName: "Deceius",
    equipment: knightEquipment,
    items: backpackItems,
    gold: 4620,
    platinum: 780,
    capacityUsed: 152,
    capacityMax: 420,
    totalValue: 42077,
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
    totalValue: 0,
  },
};

export const Overloaded: Story = {
  args: {
    characterName: "Deceius",
    equipment: knightEquipment,
    items: backpackItems,
    gold: 4620,
    platinum: 780,
    capacityUsed: 405,
    capacityMax: 420,
    totalValue: 42077,
  },
};
