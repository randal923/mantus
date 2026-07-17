import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { CharacterSummary } from "@tibia/protocol";
import { CharacterListItem } from "../components/characters/CharacterListItem";

const CHARACTER: CharacterSummary = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Avara Stormblade",
  level: 42,
  vocation: "Knight",
  outfit: { lookType: 128, head: 78, body: 68, legs: 58, feet: 76, addons: 0 },
  lastLoginAt: "2026-07-15T12:00:00.000Z",
};

const meta = {
  title: "Game/Characters/CharacterListItem",
  component: CharacterListItem,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop w-96 rounded-xl p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    character: CHARACTER,
    selected: false,
    onSelect: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof CharacterListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
  args: { selected: true },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const LongName: Story = {
  args: {
    character: {
      ...CHARACTER,
      id: "00000000-0000-4000-8000-000000000002",
      name: "Maximilianus von Thunderbluff the Everlasting",
      vocation: "Druid",
      level: 117,
    },
  },
};
