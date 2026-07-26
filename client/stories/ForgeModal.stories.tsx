import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ForgeModal } from "../components/forge/ForgeModal";
import {
  FORGE_HISTORY,
  FORGE_INVENTORY,
  FORGE_RESULT,
  FORGE_STATE,
} from "./forgeFixtures";

const meta = {
  title: "Game/Forge/ForgeModal",
  component: ForgeModal,
  parameters: { layout: "fullscreen" },
  args: {
    forge: FORGE_STATE,
    history: FORGE_HISTORY,
    result: null,
    inventory: FORGE_INVENTORY,
    pending: false,
    error: null,
    onFusion: fn(),
    onTransfer: fn(),
    onConversion: fn(),
    onRequestHistory: fn(),
    onDismissResult: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ForgeModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fusion: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /magic plate armor/i }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Fuse" }));
    await expect(args.onFusion).toHaveBeenCalledWith({
      firstItemId: "00000000-0000-4000-8000-000000000001",
      secondItemId: "00000000-0000-4000-8000-000000000002",
      usedCore: false,
      reduceTierLoss: false,
      convergence: false,
    });
  },
};

export const Transfer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Transfer" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: /crown armor/i }),
    );
    await expect(
      await canvas.findByRole("button", { name: /plate armor/i }),
    ).toBeVisible();
  },
};

export const Conversion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Conversion" }));
    await expect(
      await canvas.findByText(/60 dust → 3 slivers/i),
    ).toBeVisible();
  },
};

export const History: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "History" }));
    await expect(
      await canvas.findByText(/magic plate armor \(tier 1 -> 2\)/i),
    ).toBeVisible();
  },
};

export const WithResult: Story = {
  args: { result: FORGE_RESULT },
};

export const Loading: Story = {
  args: { forge: null, history: null },
};
