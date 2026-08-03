import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ImbuementTrackerPanel } from "../components/imbuement/ImbuementTrackerPanel";
import { IMBUEMENT_TRACKER_INVENTORY } from "./imbuementTrackerFixtures";

const meta = {
  title: "Game/Imbuement/ImbuementTrackerPanel",
  component: ImbuementTrackerPanel,
  args: {
    inventory: IMBUEMENT_TRACKER_INVENTORY,
    inFight: true,
    inProtectionZone: false,
    onClose: fn(),
  },
} satisfies Meta<typeof ImbuementTrackerPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // One label per urgency band the official tracker colours by.
    await expect(await canvas.findByText("17h")).toBeVisible();
    await expect(await canvas.findByText("2h02")).toBeVisible();
    await expect(await canvas.findByText("45m")).toBeVisible();
    await expect(await canvas.findByText("45s")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Close imbuement tracker" }),
    );
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};

/** Nothing burns in a protection zone, so the aggressive slots hold still. */
export const InProtectionZone: Story = {
  args: { inProtectionZone: true },
};

export const NothingImbuable: Story = {
  args: {
    inventory: { ...IMBUEMENT_TRACKER_INVENTORY, equipment: {} },
  },
};
