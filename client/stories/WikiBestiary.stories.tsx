import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { WikiBestiary } from "../components/wiki/WikiBestiary";
import { WIKI_CREATURES, WIKI_MONSTER } from "./wikiFixtures";

const meta = {
  title: "Game/Wiki/Bestiary",
  component: WikiBestiary,
  parameters: { layout: "fullscreen" },
  args: {
    activeTab: "bestiary",
    creatures: WIKI_CREATURES,
    monster: WIKI_MONSTER,
    pending: false,
    error: null,
    onRequestMonster: fn(),
    onSelectTab: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof WikiBestiary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreatureClasses: Story = {};

export const Loading: Story = {
  args: { creatures: null, pending: true },
};
