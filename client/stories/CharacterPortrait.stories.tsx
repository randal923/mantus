import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { CharacterPortrait } from "../components/navigation/CharacterPortrait";

const meta = {
  title: "Game/Navigation/CharacterPortrait",
  component: CharacterPortrait,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    characterName: "Deceius",
    level: 47,
    outfit: {
      lookType: 128,
      head: 78,
      body: 68,
      legs: 58,
      feet: 76,
      addons: 0,
    },
    onClick: fn(),
  },
} satisfies Meta<typeof CharacterPortrait>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MaxLevel: Story = {
  args: {
    level: 999,
  },
};

export const Disabled: Story = {
  args: {
    onClick: undefined,
  },
};
