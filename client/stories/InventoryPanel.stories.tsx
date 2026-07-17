import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { OwnCharacterState } from "@tibia/protocol";
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
  {
    slot: 0,
    item: makeInventoryItem({
      id: "00000000-0000-4000-8000-000000000003",
      clientId: 3031,
      spriteId: 7384,
      name: "Gold Coin",
      count: 100,
    }),
  },
  {
    slot: 1,
    item: makeInventoryItem({
      id: "00000000-0000-4000-8000-000000000004",
      clientId: 266,
      spriteId: 4358,
      name: "Health Potion",
      count: 5,
    }),
  },
];

const character: OwnCharacterState = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "Deceius",
  vocation: "Knight",
  definitionVersion: 1,
  level: 47,
  experience: 1_842_000,
  experienceForCurrentLevel: 1_780_000,
  experienceForNextLevel: 1_920_000,
  magicLevel: 8,
  manaSpent: 2_100,
  manaSpentForNextMagicLevel: 4_800,
  health: 720,
  maxHealth: 840,
  mana: 210,
  maxMana: 285,
  capacity: 1_550,
  soul: 78,
  maxSoul: 100,
  speed: 156,
  attackSpeedMs: 2_000,
  healthRegeneration: { amount: 1, intervalMs: 6_000 },
  manaRegeneration: { amount: 2, intervalMs: 6_000 },
  soulRegeneration: { amount: 1, intervalMs: 120_000 },
  skills: [
    { skill: "fist", level: 18, tries: 12, triesForNextLevel: 106 },
    { skill: "club", level: 22, tries: 33, triesForNextLevel: 157 },
    { skill: "sword", level: 61, tries: 3_820, triesForNextLevel: 6_456 },
    { skill: "axe", level: 24, tries: 58, triesForNextLevel: 190 },
    { skill: "distance", level: 31, tries: 104, triesForNextLevel: 2_065 },
    { skill: "shielding", level: 58, tries: 2_018, triesForNextLevel: 9_702 },
    { skill: "fishing", level: 14, tries: 8, triesForNextLevel: 29 },
  ],
  outfit: {
    lookType: 128,
    head: 78,
    body: 68,
    legs: 58,
    feet: 76,
    addons: 0,
  },
  position: { x: 100, y: 100, z: 7 },
  direction: "south",
  townId: 1,
  lastLoginAt: null,
};

const meta = {
  title: "Game/InventoryPanel",
  component: InventoryPanel,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop flex h-dvh items-start justify-center p-6">
        <div className="h-full w-full max-w-3xl">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    onClose: fn(),
    onStack: fn(),
    onSort: fn(),
    onToggleCharacterStats: fn(),
  },
} satisfies Meta<typeof InventoryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Knight: Story = {
  args: {
    characterName: "Deceius",
    character,
    equipment,
    items,
    gold: 100,
    platinum: 0,
    capacityUsed: 214,
    capacityMax: 400,
    slotCount: 20,
  },
};

export const CharacterDetails: Story = {
  args: {
    ...Knight.args,
    characterStatsOpen: true,
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
