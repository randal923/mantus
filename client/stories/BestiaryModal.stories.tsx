import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type {
  BestiaryCreaturesStateMessage,
  BestiaryMonsterStateMessage,
} from "@tibia/protocol";
import { BestiaryModal } from "../components/bestiary/BestiaryModal";

const outfit = (lookType: number) => ({
  lookType,
  head: 0,
  body: 0,
  legs: 0,
  feet: 0,
  addons: 0,
});

const CREATURES: BestiaryCreaturesStateMessage = {
  type: "bestiary-creatures-state",
  charmPoints: 40,
  entries: [
    { raceId: 34, name: "Dragon", className: "Dragon", outfit: outfit(34), stage: 2, kills: 40 },
    { raceId: 22, name: "Cyclops", className: "Giant", outfit: outfit(22), stage: 3, kills: 720 },
    { raceId: 16, name: "Bear", className: "Mammal", outfit: outfit(16), stage: 0, kills: 0 },
    { raceId: 56, name: "Cave Rat", className: "Mammal", outfit: outfit(56), stage: 2, kills: 55 },
    { raceId: 21, name: "Rat", className: "Mammal", outfit: outfit(21), stage: 4, kills: 612 },
    { raceId: 27, name: "Wolf", className: "Mammal", outfit: outfit(27), stage: 1, kills: 4 },
    { raceId: 18, name: "Ghoul", className: "Undead", outfit: outfit(18), stage: 1, kills: 3 },
  ],
};

const MONSTER: BestiaryMonsterStateMessage = {
  type: "bestiary-monster-state",
  raceId: 21,
  name: "Rat",
  className: "Mammal",
  outfit: outfit(21),
  stage: 4,
  kills: 612,
  firstUnlock: 10,
  secondUnlock: 100,
  toKill: 250,
  stars: 1,
  occurrence: 0,
  charmPoints: 5,
  loot: [
    { itemTypeId: 3031, spriteId: 1704, name: "gold coin", rarity: 0 },
    { itemTypeId: 3607, spriteId: 2296, name: "cheese", rarity: 1 },
    { itemTypeId: 3577, spriteId: 2229, name: "meat", rarity: 1 },
    { itemTypeId: 2920, spriteId: 1521, name: "torch", rarity: 2 },
    { itemTypeId: 0, spriteId: 0, rarity: 3 },
    { itemTypeId: 0, spriteId: 0, rarity: 4 },
  ],
  stats: {
    maxHealth: 20,
    experience: 5,
    speed: 67,
    armor: 1,
    mitigation: 0.07,
  },
  resistances: [
    { element: "physical", percent: 100 },
    { element: "energy", percent: 100 },
    { element: "earth", percent: 80 },
    { element: "fire", percent: 100 },
    { element: "ice", percent: 110 },
    { element: "holy", percent: 80 },
    { element: "death", percent: 110 },
    { element: "healing", percent: 100 },
  ],
  locations: "Rookgaard and Mainland, in most sewers and caves near towns.",
};

const meta = {
  title: "Game/BestiaryModal",
  component: BestiaryModal,
  parameters: { layout: "fullscreen" },
  args: {
    creatures: CREATURES,
    monster: MONSTER,
    pending: false,
    error: null,
    onRequestMonster: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof BestiaryModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllCreatures: Story = {};

export const Loading: Story = {
  args: { creatures: null, pending: true },
};

export const WithError: Story = {
  args: { creatures: null, error: "unavailable" },
};
