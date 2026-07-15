import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { CharacterSelectModal } from "../components/characters/CharacterSelectModal";
import type { CharacterSummary } from "../components/characters/characterTypes";
import { PLACEHOLDER_CHARACTERS } from "../components/characters/placeholderCharacters";

const FULL_ROSTER: ReadonlyArray<CharacterSummary> = [
  ...PLACEHOLDER_CHARACTERS,
  {
    id: "char-4",
    name: "Thalia Emberveil",
    level: 88,
    vocation: "Sorcerer",
    portraitSpriteId: 67704,
  },
  {
    id: "char-5",
    name: "Bram Oakenshield",
    level: 8,
    vocation: "None",
    portraitSpriteId: 71091,
  },
];

const meta = {
  title: "Game/Characters/CharacterSelectModal",
  component: CharacterSelectModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    characters: PLACEHOLDER_CHARACTERS,
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
