import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ImbuementModal } from "../components/imbuement/ImbuementModal";
import { FORGE_INVENTORY, IMBUEMENT_WINDOW } from "./forgeFixtures";

const MATERIAL_SPRITE_IDS = new Map([
  [9685, 13587],
  [9633, 13547],
  [9663, 13579],
  [9640, 13556],
]);

const meta = {
  title: "Game/Forge/ImbuementModal",
  component: ImbuementModal,
  parameters: { layout: "fullscreen" },
  args: {
    window: IMBUEMENT_WINDOW,
    imbuableItems: FORGE_INVENTORY.items.map((entry, index) => ({
      item: entry.item,
      equipped: index === 0,
    })),
    spriteIdOf: (itemTypeId) => MATERIAL_SPRITE_IDS.get(itemTypeId),
    pending: false,
    error: null,
    onPickItem: fn(),
    onApply: fn(),
    onClear: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ImbuementModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Slot 1 is empty, so the window opens on the imbue action for that slot. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Basic Vampirism" }),
    );
    await userEvent.click(await canvas.findByRole("button", { name: "Imbue" }));
    await expect(args.onApply).toHaveBeenCalledWith(1, 1);
  },
};

/** A blocked tier stays listed and exposes its missing material counts. */
export const BlockedOption: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("tab", { name: /Intricate/ }),
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Intricate Vampirism" }),
    );
    await expect(await canvas.findByText("4/15")).toBeVisible();
    await expect(await canvas.findByRole("button", { name: "Imbue" })).toBeDisabled();
  },
};

/**
 * Hovering an astral source opens the same server-authored item card the
 * inventory uses, with the stash share of what is held spelled out.
 */
export const MaterialTooltip: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(await canvas.findByRole("tab", { name: /Intricate/ }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Intricate Vampirism" }),
    );

    const box = (await canvas.findByText("4/15")).closest("li");
    await userEvent.hover(box!);
    await expect(
      await body.findByRole("tooltip", { name: "Bloody Pincers" }),
    ).toBeVisible();
    await expect(
      await body.findByText("4 of these come from your stash."),
    ).toBeVisible();

    await userEvent.unhover(box!);
    await waitFor(() =>
      expect(body.queryByRole("tooltip", { name: "Bloody Pincers" })).toBeNull(),
    );
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

export const PickItem: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Equipped")).toBeVisible();
    await userEvent.click(
      await canvas.findByRole("button", { name: "crown armor" }),
    );
    await expect(args.onPickItem).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000003",
    );
  },
};

export const WithError: Story = {
  args: { error: "You must stand next to an imbuement shrine." },
};

export const Loading: Story = {
  args: { window: null },
};
