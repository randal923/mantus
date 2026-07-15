import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type {
  CharacterCreationOptions,
  CharacterSummary,
} from "@tibia/protocol";

import { CharacterSelectModal } from "../components/characters/CharacterSelectModal";

const CREATION_OPTIONS: CharacterCreationOptions = {
  vocations: ["Knight", "Paladin", "Sorcerer", "Druid"],
  outfits: [
    { lookType: 128, label: "citizen-male" },
    { lookType: 136, label: "citizen-female" },
  ],
  maxCharacters: 5,
};

const STORY_CHARACTERS: ReadonlyArray<CharacterSummary> = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Avara Stormblade",
    level: 42,
    vocation: "Knight",
    outfit: { lookType: 128, head: 78, body: 68, legs: 58, feet: 76, addons: 0 },
    lastLoginAt: "2026-07-15T12:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Meryl Dawnwhisper",
    level: 27,
    vocation: "Druid",
    outfit: { lookType: 136, head: 78, body: 68, legs: 58, feet: 76, addons: 0 },
    lastLoginAt: null,
  },
];

const FULL_ROSTER: ReadonlyArray<CharacterSummary> = [
  ...STORY_CHARACTERS,
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Thalia Emberveil",
    level: 88,
    vocation: "Sorcerer",
    outfit: { lookType: 128, head: 78, body: 68, legs: 58, feet: 76, addons: 0 },
    lastLoginAt: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    name: "Bram Oakshield",
    level: 8,
    vocation: "Paladin",
    outfit: { lookType: 136, head: 78, body: 68, legs: 58, feet: 76, addons: 0 },
    lastLoginAt: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    name: "Rogan Swiftarrow",
    level: 15,
    vocation: "Paladin",
    outfit: { lookType: 128, head: 78, body: 68, legs: 58, feet: 76, addons: 0 },
    lastLoginAt: null,
  },
];

const meta = {
  title: "Game/Characters/CharacterSelectModal",
  component: CharacterSelectModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    characters: STORY_CHARACTERS,
    creationOptions: CREATION_OPTIONS,
    onClose: fn(),
    onSelectCharacter: fn(),
    onCreateCharacter: fn(),
  },
} satisfies Meta<typeof CharacterSelectModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectCharacter: Story = {};

export const CreateCharacter: Story = {
  args: {
    initialView: "create",
  },
};

export const EmptyAccount: Story = {
  args: {
    characters: [],
  },
};

export const FullRoster: Story = {
  args: {
    characters: FULL_ROSTER,
  },
};

export const EnteringWorld: Story = {
  args: {
    busy: true,
  },
};

export const NameTaken: Story = {
  args: {
    initialView: "create",
    error: "A character with that name already exists.",
  },
};
