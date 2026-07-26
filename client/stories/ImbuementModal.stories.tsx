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
    pending: false,
    error: null,
    onApply: fn(),
    onClear: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ImbuementModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const applyButtons = await canvas.findAllByRole("button", {
      name: "Apply",
    });
    const enabled = applyButtons.find((button) => !button.hasAttribute("disabled"));
    await expect(enabled).toBeDefined();
    if (enabled) {
      await userEvent.click(enabled);
      await expect(args.onApply).toHaveBeenCalledWith(1, 1);
    }
  },
};

export const MissingMaterials: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/bloody pincers 4\/15/i),
    ).toBeVisible();
  },
};

export const WithError: Story = {
  args: { error: "You must stand next to an imbuement shrine." },
};

export const Loading: Story = {
  args: { window: null },
};
