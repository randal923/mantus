import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { TopNavigationBar } from "../components/navigation/TopNavigationBar";

const meta = {
  title: "TopNavigationBar",
  component: TopNavigationBar,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop min-h-dvh">
        <Story />
      </div>
    ),
  ],
  args: {
    characterName: "Deceius",
    level: 47,
    vocation: "Elite Knight",
    outfit: {
      lookType: 128,
      head: 78,
      body: 68,
      legs: 58,
      feet: 76,
      addons: 0,
    },
    health: 1240,
    maxHealth: 1580,
    mana: 390,
    maxMana: 620,
    connectionStatus: "connected",
    fightMode: {
      attack: "balanced",
      chase: true,
      secure: true,
    },
    battleListVisible: true,
    minimapVisible: true,
    activePanel: "inventory",
    onCharacter: fn(),
    onInventory: fn(),
    onQuests: fn(),
    onFightModeChange: fn(),
    onBattleList: fn(),
    onMinimap: fn(),
    onMarket: fn(),
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
