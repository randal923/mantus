import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { ItemTextModal } from "../components/inventory/ItemTextModal";

const meta = {
  title: "Game/ItemTextModal",
  component: ItemTextModal,
  parameters: { layout: "fullscreen" },
  args: {
    onClose: fn(),
    onSave: fn(),
  },
} satisfies Meta<typeof ItemTextModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnly: Story = {
  args: {
    item: {
      type: "item-text",
      itemId: "00000000-0000-4000-8000-000000000001",
      revision: 1,
      name: "Letter",
      text: "Dear adventurer,\n\nThe trolls have taken the bridge east of Thais. Bring a rope and a shovel — you will need both.\n\n— Meryl",
      writeable: false,
      maxLength: 0,
    },
  },
};

export const Writeable: Story = {
  args: {
    item: {
      type: "item-text",
      itemId: "00000000-0000-4000-8000-000000000002",
      revision: 1,
      name: "Blank Book",
      text: "",
      writeable: true,
      maxLength: 512,
    },
  },
};

export const WriteableWithText: Story = {
  args: {
    item: {
      type: "item-text",
      itemId: "00000000-0000-4000-8000-000000000003",
      revision: 3,
      name: "Journal",
      text: "Day 12. Sold the sabre, bought two health potions. The cave rats grow bolder every night.",
      writeable: true,
      maxLength: 512,
    },
  },
};
