import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { WikiItems } from "../components/wiki/WikiItems";
import { WIKI_ITEM_SOURCES } from "./wikiFixtures";

const meta = {
  title: "Game/Wiki/Items",
  component: WikiItems,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="ui-panel-frame p-6"><Story /></div>],
  args: {
    itemSources: WIKI_ITEM_SOURCES,
    sourcesPending: false,
    onRequestItemSources: fn(),
    onSelectSource: fn(),
  },
} satisfies Meta<typeof WikiItems>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Catalog: Story = {};
