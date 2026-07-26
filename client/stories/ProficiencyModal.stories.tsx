import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ProficiencyModal } from "../components/proficiency/ProficiencyModal";
import {
  PROFICIENCY_STATE,
  PROFICIENCY_STATE_EMPTY,
} from "./proficiencyFixtures";

const meta = {
  title: "Game/Proficiency/ProficiencyModal",
  component: ProficiencyModal,
  parameters: { layout: "fullscreen" },
  args: {
    proficiency: PROFICIENCY_STATE,
    pending: false,
    error: null,
    onSelect: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ProficiencyModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PerkSelection: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Catalog names load from the static asset; progress is the fixture's.
    await canvas.findAllByText("Sanguine 1H Sword");
    const perk = await canvas.findByRole("radio", {
      name: "+3% Life Leech",
    });
    await expect(perk).toBeEnabled();
    await userEvent.click(perk);
    await userEvent.click(canvas.getByRole("button", { name: "Apply" }));
    await expect(args.onSelect).toHaveBeenCalledWith(6, [
      { level: 0, index: 0 },
      { level: 1, index: 2 },
    ]);
  },
};

export const LockedLevels: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findAllByText("Sanguine 1H Sword");
    // Level 3 is beyond unlockedLevels: 2, so it shows the next threshold.
    await expect(
      await canvas.findByText("Unlocks at 100,000 XP"),
    ).toBeVisible();
    const locked = await canvas.findByRole("radio", {
      name: "+3% Damage vs. Powerful Foes",
    });
    await expect(locked).toBeDisabled();
  },
};

export const Mastered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /Sanguine 1H Axe/ }),
    );
    await expect(canvas.getByText("Mastered")).toBeVisible();
  },
};

export const Failure: Story = {
  args: { error: "level-locked" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("That perk level is not unlocked yet."),
    ).toBeVisible();
  },
};

export const Empty: Story = {
  args: { proficiency: PROFICIENCY_STATE_EMPTY },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        "Kill monsters with a weapon equipped to accrue proficiency.",
      ),
    ).toBeVisible();
  },
};
