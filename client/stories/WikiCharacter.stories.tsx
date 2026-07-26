import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { WikiCharacter } from "../components/wiki/WikiCharacter";
import {
  CYCLOPEDIA_COMBAT,
  CYCLOPEDIA_DEATHS,
  CYCLOPEDIA_ITEM_SUMMARY,
  CYCLOPEDIA_PROFILE,
  CYCLOPEDIA_PVP_KILLS,
  OWN_CHARACTER,
} from "./cyclopediaFixtures";

const meta = {
  title: "Game/Wiki/WikiCharacter",
  component: WikiCharacter,
  parameters: { layout: "fullscreen" },
  args: {
    activeTab: "character",
    character: OWN_CHARACTER,
    capacityUsed: 320,
    combat: CYCLOPEDIA_COMBAT,
    deaths: CYCLOPEDIA_DEATHS,
    pvpKills: CYCLOPEDIA_PVP_KILLS,
    itemSummary: CYCLOPEDIA_ITEM_SUMMARY,
    cyclopediaPending: false,
    cyclopediaError: null,
    profile: CYCLOPEDIA_PROFILE,
    onRequestCyclopedia: fn(),
    onSelectTab: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof WikiCharacter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const General: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Sword Fighting · 61/)).toBeVisible();
    await expect(canvas.getByText("320 / 1,550")).toBeVisible();
  },
};

export const Combat: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Combat" }));
    await expect(canvas.getByText("10.5%")).toBeVisible();
    await expect(canvas.getByText("8.42%")).toBeVisible();
    await expect(canvas.getByText("-8%")).toBeVisible();
    // Already loaded, so no refetch on the first visit.
    await expect(args.onRequestCyclopedia).not.toHaveBeenCalled();
  },
};

export const CombatLazyFetch: Story = {
  args: { combat: null },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Combat" }));
    await expect(args.onRequestCyclopedia).toHaveBeenCalledWith("combat");
  },
};

export const Deaths: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Deaths" }));
    await expect(
      canvas.getByText("Killed at level 47 by a dragon lord."),
    ).toBeVisible();
    await expect(canvas.getByText("Page 1 of 2")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(args.onRequestCyclopedia).toHaveBeenCalledWith("deaths", 1);
  },
};

export const PvpKills: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "PvP Kills" }));
    await expect(canvas.getByText("Unjustified")).toBeVisible();
    await expect(canvas.getByText("Justified")).toBeVisible();
  },
};

export const Items: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Items" }));
    await expect(await canvas.findByText("gold coin")).toBeVisible();
    await expect(canvas.getByText("T2")).toBeVisible();
    await expect(canvas.getByText("×4,250")).toBeVisible();
  },
};

export const Achievements: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Achievements" }),
    );
    // "Annihilator" is both a granted achievement and the selected title.
    await expect(canvas.getAllByText("Annihilator")).toHaveLength(2);
    await expect(canvas.getByText("Selected")).toBeVisible();
    await expect(canvas.getByText("Locked")).toBeVisible();
  },
};
