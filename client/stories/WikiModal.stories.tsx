import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { WikiModal } from "../components/wiki/WikiModal";
import {
  WIKI_BOSS,
  WIKI_BOSSES,
  WIKI_CREATURES,
  WIKI_ITEM_SOURCES,
  WIKI_MONSTER,
} from "./wikiFixtures";

const meta = {
  title: "Game/Wiki/WikiModal",
  component: WikiModal,
  parameters: { layout: "fullscreen" },
  args: {
    creatures: WIKI_CREATURES,
    monster: WIKI_MONSTER,
    bosses: WIKI_BOSSES,
    boss: WIKI_BOSS,
    itemSources: WIKI_ITEM_SOURCES,
    bestiaryPending: false,
    bosstiaryPending: false,
    itemSourcesPending: false,
    bestiaryError: null,
    bosstiaryError: null,
    onRequestBestiary: fn(),
    onRequestMonster: fn(),
    onRequestBosstiary: fn(),
    onRequestBoss: fn(),
    onRequestItemSources: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof WikiModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bestiary: Story = {};

export const Items: Story = {
  args: { initialTab: "items" },
};

export const Bosstiary: Story = {
  args: { initialTab: "bosstiary" },
};

export const Loading: Story = {
  args: {
    creatures: null,
    bosses: null,
    boss: null,
    itemSources: null,
    bestiaryPending: true,
    bosstiaryPending: true,
  },
};
