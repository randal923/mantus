import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

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
    connectionStatus: "connected",
    fightMode: {
      attack: "offensive",
      chase: false,
      secure: true,
    },
    battleListVisible: true,
    minimapVisible: true,
    vipVisible: false,
    partyVisible: false,
    gold: 5_228,
    mantusCoins: 340,
    storeOpen: false,
    activePanel: "inventory",
    onCharacter: fn(),
    onInventory: fn(),
    onVip: fn(),
    onParty: fn(),
    onQuests: fn(),
    onWiki: fn(),
    onFightModeChange: fn(),
    onBattleList: fn(),
    onMinimap: fn(),
    onStore: fn(),
    onMarket: fn(),
    onSettings: fn(),
  },
} satisfies Meta<typeof TopNavigationBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "VIP List [V]" }),
    );
    await expect(args.onVip).toHaveBeenCalledOnce();

    await userEvent.click(
      canvas.getByRole("button", { name: "Party [P]" }),
    );
    await expect(args.onParty).toHaveBeenCalledOnce();
  },
};

export const WikiActive: Story = {
  args: { activePanel: "wiki" },
};

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
  },
};
