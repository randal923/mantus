import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { WikiItemDetails } from "../components/wiki/WikiItemDetails";
import { WIKI_ITEM, WIKI_ITEM_SOURCES } from "./wikiFixtures";

const meta = {
  title: "Game/Wiki/ItemDetails",
  component: WikiItemDetails,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="ui-backdrop relative min-h-dvh"><Story /></div>],
  args: {
    item: WIKI_ITEM,
    sources: WIKI_ITEM_SOURCES.sources,
    sourcesPending: false,
    onSelectSource: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof WikiItemDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Details: Story = {};

export const LoadingSources: Story = {
  args: { sources: [], sourcesPending: true },
};
