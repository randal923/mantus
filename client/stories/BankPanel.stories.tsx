import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { BankPanel } from "../components/bank/BankPanel";

const meta = {
  title: "Game/BankPanel",
  component: BankPanel,
  parameters: { layout: "fullscreen" },
  args: {
    npcName: "Naji",
    balance: 152_430,
    carriedGold: 74,
    carriedPlatinum: 12,
    carriedCrystal: 1,
    pending: false,
    error: null,
    onDeposit: fn(),
    onWithdraw: fn(),
    onTransfer: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof BankPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithError: Story = {
  args: { error: "insufficient-balance" },
};

export const Pending: Story = {
  args: { pending: true },
};

export const DepositsAnAmount: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const [amountInput] = await canvas.findAllByLabelText(/amount/i);
    await userEvent.type(amountInput, "500");
    const depositSection = canvas.getByRole("region", { name: /deposit/i });
    await userEvent.click(
      within(depositSection).getByRole("button", { name: /deposit/i }),
    );
    await expect(args.onDeposit).toHaveBeenCalledWith(500);
  },
};

export const TransfersToACharacter: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText(/recipient/i),
      "Saver Beta",
    );
    const transferSection = canvas.getByRole("region", { name: /transfer/i });
    await userEvent.type(
      within(transferSection).getByLabelText(/amount/i),
      "1000",
    );
    await userEvent.click(
      within(transferSection).getByRole("button", { name: /transfer/i }),
    );
    await expect(args.onTransfer).toHaveBeenCalledWith("Saver Beta", 1000);
  },
};
