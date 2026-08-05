import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PvpWikiPage } from "../components/public-site/PvpWikiPage";

const meta = {
  title: "PvpWikiPage",
  component: PvpWikiPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PvpWikiPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
