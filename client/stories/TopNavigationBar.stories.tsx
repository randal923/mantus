import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { TopNavigationBar } from "../components/navigation/TopNavigationBar";

const meta = {
  title: "Game/TopNavigationBar",
  component: TopNavigationBar,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-neutral-950">
        <Story />
      </div>
    ),
  ],
  args: {
    characterName: "Deceius",
    level: 47,
    vocation: "Elite Knight",
    portraitSpriteId: 67704,
    health: 1240,
    maxHealth: 1580,
    mana: 390,
    maxMana: 620,
    connectionStatus: "connected",
    activePanel: "inventory",
    onCharacter: fn(),
    onInventory: fn(),
    onQuests: fn(),
    onMap: fn(),
    onSettings: fn(),
  },
} satisfies Meta<typeof TopNavigationBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

export const Connecting: Story = {
  args: {
    connectionStatus: "connecting",
    activePanel: undefined,
  },
};

export const Disconnected: Story = {
  args: {
    connectionStatus: "disconnected",
    activePanel: undefined,
    health: 380,
    mana: 90,
  },
};
