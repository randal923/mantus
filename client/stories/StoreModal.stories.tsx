import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { StoreModal } from "../components/store/StoreModal";

const meta = {
  title: "Game/StoreModal",
  component: StoreModal,
  parameters: { layout: "fullscreen" },
  args: {
    balance: 5_228,
    premiumDaysRemaining: 12,
    session: {
      categories: [
        {
          id: "premium-time",
          offers: [
            {
              id: "premium-30",
              price: 250,
              premiumDays: 30,
              featured: true,
            },
            { id: "premium-90", price: 750, premiumDays: 90 },
            { id: "premium-180", price: 1_500, premiumDays: 180 },
            { id: "premium-360", price: 3_000, premiumDays: 360 },
          ],
        },
      ],
      pending: false,
      pendingOfferId: null,
      purchasedOfferId: null,
      error: null,
    },
    onClose: fn(),
    onPurchase: fn(),
  },
} satisfies Meta<typeof StoreModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PremiumCatalog: Story = {};

export const ConfirmsPurchase: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole("button", { name: "Select" })[0]!);
    await expect(
      canvas.getByText("Add 30 days of Premium Time?"),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Confirm purchase" }),
    );
    await expect(args.onPurchase).toHaveBeenCalledWith("premium-30");
  },
};

export const InsufficientCoins: Story = {
  args: {
    balance: 100,
    session: {
      ...meta.args.session,
      error: "insufficient-coins",
    },
  },
};
