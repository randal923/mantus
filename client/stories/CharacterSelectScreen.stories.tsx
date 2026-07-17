import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type {
  CharacterCreationOptions,
  CharacterSummary,
} from "@tibia/protocol";
import { CharacterSelectScreen } from "../components/characters/CharacterSelectScreen";

const CREATION_OPTIONS: CharacterCreationOptions = {
  vocations: ["Knight", "Paladin", "Sorcerer", "Druid"],
  outfits: [
    { lookType: 128, label: "citizen-male" },
    { lookType: 136, label: "citizen-female" },
  ],
  maxCharacters: 5,
};

const CHARACTERS: ReadonlyArray<CharacterSummary> = [
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

const meta = {
  title: "Game/Characters/CharacterSelectScreen",
  component: CharacterSelectScreen,
  parameters: { layout: "fullscreen" },
  args: {
    status: "connected",
    characters: CHARACTERS,
    creationOptions: CREATION_OPTIONS,
    busy: false,
    error: null,
    onCreate: fn(),
    onSelect: fn(),
    onReconnect: fn(),
    onLogout: fn(),
  },
} satisfies Meta<typeof CharacterSelectScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};

export const Loading: Story = {
  args: {
    characters: null,
    creationOptions: null,
  },
};

export const Disconnected: Story = {
  args: {
    status: "disconnected",
    characters: null,
    creationOptions: null,
  },
};

export const WithError: Story = {
  args: {
    error: "That character is already online.",
  },
};
