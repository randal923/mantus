import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
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

export const Bestiary: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = canvas.getByRole("dialog", { name: "World Wiki" });
    const pagination = canvas.getByRole("navigation", { name: "Pagination" });
    const scrollRegion = canvas.getByRole("tabpanel");

    await expect(scrollRegion.contains(pagination)).toBe(false);
    await expect(pagination.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      dialog.getBoundingClientRect().bottom,
    );
    await expect(dialog.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    );
  },
};

export const Items: Story = {
  args: { initialTab: "items" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /25 years backpack/i }),
    );
    const detail = canvas.getByRole("dialog", {
      name: "25 years backpack",
    });

    await expect(detail).toHaveClass("overflow-hidden");
    await expect(detail.querySelector(".ui-scrollbar")).not.toBeNull();
    await expect(detail.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    await expect(detail.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    );
  },
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
