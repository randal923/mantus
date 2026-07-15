import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ItemTooltip } from "../components/inventory/ItemTooltip";
import { PLACEHOLDER_TOOLTIP_ITEMS } from "../components/inventory/placeholderTooltipItems";

const meta = {
  title: "Game/ItemTooltip",
  component: ItemTooltip,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof ItemTooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sword: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.sword },
};

export const Axe: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.axe },
};

export const Club: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.club },
};

export const Bow: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.bow },
};

export const Crossbow: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.crossbow },
};

export const Wand: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.wand },
};

export const Shield: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.shield },
};

export const Helmet: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.helmet },
};

export const Armor: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.armor },
};

export const Legs: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.legs },
};

export const Boots: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.boots },
};

export const Ring: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.ring },
};

export const Amulet: Story = {
  args: { item: PLACEHOLDER_TOOLTIP_ITEMS.amulet },
};
