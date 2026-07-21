import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { WikiItems } from "../components/wiki/WikiItems";
import { WIKI_ITEM_SOURCES } from "./wikiFixtures";

const meta = {
  title: "Game/Wiki/Items",
  component: WikiItems,
  parameters: { layout: "fullscreen" },
  args: {
    activeTab: "items",
    itemSources: WIKI_ITEM_SOURCES,
    sourcesPending: false,
    onRequestItemSources: fn(),
    onSelectSource: fn(),
    onSelectTab: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof WikiItems>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Catalog: Story = {};
