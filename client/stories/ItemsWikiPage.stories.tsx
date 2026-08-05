import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ItemsWikiPage } from "../components/public-site/ItemsWikiPage";

const meta = {
  title: "ItemsWikiPage",
  component: ItemsWikiPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ItemsWikiPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
