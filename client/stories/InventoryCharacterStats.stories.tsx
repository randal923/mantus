import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { OwnCharacterState } from "@tibia/protocol";
import { InventoryCharacterStats } from "../components/inventory/InventoryCharacterStats";

const CHARACTER: OwnCharacterState = {
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
  title: "Game/InventoryCharacterStats",
  component: InventoryCharacterStats,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop flex h-dvh justify-center p-6 font-tibia text-ui-text">
        <div className="h-full w-full max-w-sm">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    character: CHARACTER,
    capacityUsed: 214,
  },
} satisfies Meta<typeof InventoryCharacterStats>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Knight: Story = {};

export const MaxedMagicLevel: Story = {
  args: {
    character: {
      ...CHARACTER,
      magicLevel: 10,
      manaSpent: 0,
      manaSpentForNextMagicLevel: 0,
    },
  },
};
