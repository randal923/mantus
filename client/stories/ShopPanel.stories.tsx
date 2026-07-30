import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ShopEntryProjection } from "@tibia/protocol";
import { expect, fn, userEvent, within } from "storybook/test";
import { ShopPanel } from "../components/shop/ShopPanel";

const entry = (
  overrides: Partial<ShopEntryProjection> & { offerId: string; name: string },
): ShopEntryProjection => ({
  itemTypeId: 3274,
  clientId: 3274,
  spriteId: 3274,
  stackable: false,
  maxCount: 1,
  weight: 1_800,
  minimumAmount: 1,
  maximumAmount: 100,
  owned: 0,
  buyPrice: 20,
  sellPrice: 7,
  ...overrides,
});

const entries: ShopEntryProjection[] = [
  entry({ offerId: "backpack", name: "backpack", itemTypeId: 1988, clientId: 1988, spriteId: 1988 }),
  entry({ offerId: "axe", name: "axe", owned: 3 }),
  entry({
    offerId: "rope",
    name: "rope",
    itemTypeId: 3003,
    clientId: 3003,
    spriteId: 3003,
    stackable: true,
    maxCount: 100,
    weight: 1_000,
    buyPrice: 50,
    sellPrice: undefined,
  }),
  entry({
    offerId: "battle-shield",
    name: "battle shield",
    itemTypeId: 3413,
    clientId: 3413,
    spriteId: 3413,
    buyPrice: undefined,
    sellPrice: 95,
    owned: 1,
  }),
];

const meta = {
  title: "Game/ShopPanel",
  component: ShopPanel,
  parameters: { layout: "fullscreen" },
  args: {
    npcName: "Sam",
    entries,
    selectedOfferId: "axe",
    availableMoney: 715_643_119,
    freeCapacity: 400_00,
    currencyName: "gold coin",
    currencySpriteId: 3031,
    error: null,
    lastTransaction: null,
    onSelect: fn(),
    onBuy: fn(),
    onSell: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ShopPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithError: Story = {
  args: { error: "insufficient-funds" },
};

/** The amount slider caps at what the remaining money can cover. */
export const ClampedByMoney: Story = {
  args: { availableMoney: 137 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const slider = await canvas.findByRole("slider", { name: /amount/i });
    // 137 gold at 20 each buys 6.
    await expect(slider).toHaveAttribute("max", "6");
  },
};

/** With no room left, the offer cannot be traded at any amount. */
export const ClampedByCapacity: Story = {
  args: { freeCapacity: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buy = await canvas.findByRole("button", { name: /buy axe/i });
    await expect(buy).toBeDisabled();
  },
};

export const BuysTheSelectedOffer: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const slider = await canvas.findByRole("slider", { name: /amount/i });
    await userEvent.click(slider);
    await userEvent.click(
      await canvas.findByRole("button", { name: /buy axe/i }),
    );
    await expect(args.onBuy).toHaveBeenCalledWith("axe", expect.any(Number));
  },
};

export const SellsFromTheOwnedCount: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: /sell/i }));
    await userEvent.click(
      await canvas.findByRole("button", { name: /sell axe/i }),
    );
    await expect(args.onSell).toHaveBeenCalledWith("axe", expect.any(Number));
  },
};
