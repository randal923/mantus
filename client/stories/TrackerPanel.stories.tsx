import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { TrackerPanel } from "../components/tracker/TrackerPanel";
import {
  TRACKER_BESTIARY_ENTRIES,
  TRACKER_BOSSTIARY_ENTRIES,
} from "./trackerFixtures";

const meta = {
  title: "Game/Tracker/TrackerPanel",
  component: TrackerPanel,
  args: {
    bestiaryEntries: TRACKER_BESTIARY_ENTRIES,
    bosstiaryEntries: TRACKER_BOSSTIARY_ENTRIES,
    onRemove: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof TrackerPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Dragon")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Stop tracking Dragon" }),
    );
    await expect(args.onRemove).toHaveBeenCalledWith("bestiary", 34);
  },
};

export const BestiaryOnly: Story = {
  args: { bosstiaryEntries: [] },
};
