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
    fightMode: {
      attack: "offensive",
      chase: false,
      secure: true,
    },
    battleListVisible: true,
    minimapVisible: true,
    trackerVisible: false,
    imbuementTrackerVisible: false,
    vipVisible: false,
    partyVisible: false,
    gold: 5_228,
    bankBalance: 1_240_500,
    mantusCoins: 340,
    storeOpen: false,
    activePanel: "inventory",
    onCharacter: fn(),
    onInventory: fn(),
    onVip: fn(),
    onParty: fn(),
    onQuests: fn(),
    onWiki: fn(),
    onHuntFinder: fn(),
    onImbuementTracker: fn(),
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

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const openMenu = async () =>
      userEvent.click(canvas.getByRole("button", { name: "Character Menu" }));

    // The character's own panels moved behind the dropdown; picking one
    // fires its handler and closes the menu again.
    await openMenu();
    await userEvent.click(
      canvas.getByRole("menuitemcheckbox", { name: "VIP List" }),
    );
    await expect(args.onVip).toHaveBeenCalledOnce();
    await expect(canvas.queryByRole("menu")).toBeNull();

    await openMenu();
    await userEvent.click(
      canvas.getByRole("menuitemcheckbox", { name: "Imbuement Tracker" }),
    );
    await expect(args.onImbuementTracker).toHaveBeenCalledOnce();

    await userEvent.click(
      canvas.getByRole("button", { name: "Hunt Finder" }),
    );
    await expect(args.onHuntFinder).toHaveBeenCalledOnce();
  },
};

export const WikiActive: Story = {
  args: { activePanel: "wiki" },
};

export const NoPanelOpen: Story = {
  args: { activePanel: undefined },
};
