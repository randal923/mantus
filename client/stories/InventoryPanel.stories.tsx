import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { InventoryPanel } from "../components/inventory/InventoryPanel";
import type { Equipment, InventoryItem } from "../components/inventory/inventoryTypes";

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

const backpackItems: InventoryItem[] = [
  { id: "it-1", clientId: 3031, spriteId: 7384, name: "gold coin", count: 100 },
  { id: "it-2", clientId: 3035, spriteId: 7409, name: "platinum coin", count: 46 },
  { id: "it-3", clientId: 3043, spriteId: 7435, name: "crystal coin", count: 3 },
  { id: "it-4", clientId: 3155, spriteId: 7622, name: "sudden death rune", count: 30 },
  { id: "it-5", clientId: 3160, spriteId: 7627, name: "ultimate healing rune", count: 90 },
  { id: "it-6", clientId: 3161, spriteId: 7628, name: "great fireball rune", count: 15 },
  { id: "it-7", clientId: 3147, spriteId: 7614, name: "blank rune", count: 6 },
  { id: "it-8", clientId: 239, spriteId: 4344, name: "great health potion", count: 41 },
  { id: "it-9", clientId: 238, spriteId: 4343, name: "great mana potion", count: 12 },
  { id: "it-10", clientId: 3446, spriteId: 7938, name: "bolt", count: 72 },
  { id: "it-11", clientId: 3449, spriteId: 7958, name: "burst arrow", count: 58 },
  { id: "it-12", clientId: 3450, spriteId: 7964, name: "power bolt", count: 25 },
  { id: "it-13", clientId: 3265, spriteId: 7734, name: "two handed sword", count: 1 },
  { id: "it-14", clientId: 3360, spriteId: 7846, name: "golden armor", count: 1 },
  { id: "it-15", clientId: 3364, spriteId: 7850, name: "golden legs", count: 1 },
  { id: "it-16", clientId: 3555, spriteId: 8128, name: "golden boots", count: 1 },
  { id: "it-17", clientId: 3577, spriteId: 8161, name: "meat", count: 8 },
  { id: "it-18", clientId: 3578, spriteId: 8167, name: "fish", count: 5 },
  { id: "it-19", clientId: 3585, spriteId: 8196, name: "apple", count: 2 },
  { id: "it-20", clientId: 3600, spriteId: 8257, name: "bread", count: 1 },
  { id: "it-21", clientId: 2853, spriteId: 7136, name: "bag", count: 1 },
];

const meta = {
  title: "Game/InventoryPanel",
  component: InventoryPanel,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop flex h-dvh items-start justify-center p-6">
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
  },
};
