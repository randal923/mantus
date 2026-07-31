import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ImbuementModal } from "../components/imbuement/ImbuementModal";
import { IMBUEMENT_WINDOW } from "./forgeFixtures";

const meta = {
  title: "Game/Forge/ImbuementModal",
  component: ImbuementModal,
  parameters: { layout: "fullscreen" },
  args: {
    window: IMBUEMENT_WINDOW,
    itemName: "magic plate armor",
    itemSpriteId: 1652,
    imbuableItems: [],
    spriteIdOf: () => 1652,
    pending: false,
    error: null,
    onPickItem: fn(),
    onSelectMode: fn(),
    onApply: fn(),
    onClear: fn(),
    onForgeScroll: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ImbuementModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Slot 1 is empty, so the window opens on the imbue action for that slot. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Basic Vampirism"));
    await userEvent.click(await canvas.findByRole("button", { name: "Imbue" }));
    await expect(args.onApply).toHaveBeenCalledWith(1, 1);
  },
};

/** A blocked tier stays listed and says why, rather than disappearing. */
export const BlockedOption: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Intricate" }));
    await expect(
      await canvas.findByText("You do not have the required materials."),
    ).toBeVisible();
  },
};

/** Selecting the occupied slot swaps the action panel over to clearing. */
export const ClearSlot: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Slot 1" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Clear" }));
    await expect(args.onClear).toHaveBeenCalledWith(0);
  },
};

export const WithError: Story = {
  args: { error: "You must stand next to an imbuement shrine." },
};

export const Loading: Story = {
  args: { window: null },
};
