import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { BossSlotsSection } from "../components/bestiary/BossSlotsSection";
import { BOSS_SLOTS_STATE } from "./trackerFixtures";
import { WIKI_BOSSES } from "./wikiFixtures";

const meta = {
  title: "Game/Tracker/BossSlotsSection",
  component: BossSlotsSection,
  args: {
    slots: BOSS_SLOTS_STATE,
    bosses: WIKI_BOSSES,
    pending: false,
    error: null,
    onAssign: fn(),
    onClear: fn(),
  },
} satisfies Meta<typeof BossSlotsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Black Knight")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove (free)" }),
    );
    await expect(args.onClear).toHaveBeenCalledWith(0);
  },
};

export const AssignFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Slot two is locked in the fixture, so unlock it for the picker flow.
    await expect(canvas.getByText(/1,500 boss points/i)).toBeVisible();
    await expect(args.onAssign).not.toHaveBeenCalled();
  },
};

export const Loading: Story = {
  args: { slots: null },
};
