import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { SpellListModal } from "../components/spells/SpellListModal";

const meta = {
  title: "Game/Spells/SpellListModal",
  component: SpellListModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    vocation: "Knight",
    onClose: fn(),
  },
} satisfies Meta<typeof SpellListModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Knight: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scrollRegion = canvasElement.querySelector(".ui-scrollbar");

    await expect(
      canvas.getByRole("dialog", { name: "Knight Spells" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Wound Cleansing")).toBeInTheDocument();
    await expect(canvas.getAllByRole("listitem")).toHaveLength(37);
    await expect(scrollRegion).not.toBeNull();
    await expect(scrollRegion?.scrollHeight).toBeGreaterThan(
      scrollRegion?.clientHeight ?? 0,
    );
  },
};

export const Paladin: Story = {
  args: {
    vocation: "Paladin",
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole("listitem")).toHaveLength(
      49,
    );
  },
};

export const Sorcerer: Story = {
  args: {
    vocation: "Sorcerer",
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole("listitem")).toHaveLength(
      79,
    );
  },
};

export const Druid: Story = {
  args: {
    vocation: "Druid",
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole("listitem")).toHaveLength(
      83,
    );
  },
};
