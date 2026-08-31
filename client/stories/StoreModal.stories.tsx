import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { StoreCategory, StoreProduct } from "@tibia/protocol";
import { expect, fn, userEvent, within } from "storybook/test";
import { StoreModal } from "../components/store/StoreModal";

const OUTFIT_ICON = { kind: "outfit", lookType: 1449, addons: 3 } as const;
const MOUNT_ICON = { kind: "mount", lookType: 426 } as const;

const CATEGORIES: StoreCategory[] = [
  {
    id: "premium-time",
    name: "Premium Time",
    parentId: null,
    icon: { kind: "symbol", symbol: "premium" },
  },
  { id: "cosmetics", name: "Cosmetics", parentId: null, icon: OUTFIT_ICON },
  { id: "outfits", name: "Outfits", parentId: "cosmetics", icon: OUTFIT_ICON },
  { id: "mounts", name: "Mounts", parentId: "cosmetics", icon: MOUNT_ICON },
  {
    id: "extras",
    name: "Extras",
    parentId: null,
    icon: { kind: "symbol", symbol: "name-change" },
  },
  {
    id: "extra-services",
    name: "Extra Services",
    parentId: "extras",
    icon: { kind: "symbol", symbol: "name-change" },
  },
];

const PREMIUM: StoreProduct = {
  id: "premium-time",
  name: "Premium Time",
  kind: "premium",
  icon: { kind: "symbol", symbol: "premium" },
  subOffers: [
    { id: "premium-30", price: 250 },
    { id: "premium-90", price: 750 },
    { id: "premium-180", price: 1_500 },
    { id: "premium-360", price: 3_000 },
  ],
};

const POTIONS: StoreProduct = {
  id: "potions-great-health-potion",
  name: "Great Health Potion",
  kind: "stackable",
  icon: { kind: "item", spriteId: 7145, clientId: 2874 },
  subOffers: [
    { id: "item-239-100", price: 18, count: 100 },
    { id: "item-239-250", price: 41, count: 250 },
  ],
};

const OWNED_MOUNT: StoreProduct = {
  id: "mounts-armoured-war-horse",
  name: "Armoured War Horse",
  kind: "mount",
  icon: MOUNT_ICON,
  subOffers: [
    {
      id: "mount-23",
      price: 870,
      disabled: true,
      disabledReason: "You already own this mount.",
    },
  ],
};

const NAME_CHANGE: StoreProduct = {
  id: "extra-services-character-name-change",
  name: "Character Name Change",
  kind: "name-change",
  icon: { kind: "symbol", symbol: "name-change" },
  subOffers: [{ id: "name-change", price: 250 }],
};

const meta = {
  title: "Game/StoreModal",
  component: StoreModal,
  parameters: { layout: "fullscreen" },
  args: {
    balance: 5_228,
    premiumDaysRemaining: 12,
    session: {
      categories: CATEGORIES,
      home: [PREMIUM, POTIONS, OWNED_MOUNT],
      categoryId: null,
      products: [],
      page: 0,
      pageCount: 1,
      selectedProductId: "premium-time",
      description:
      "Enhance your gaming experience:\n{usablebyallicon} valid for all characters on this account\n{activated}",
      pending: false,
      pendingOfferId: null,
      purchasedOfferId: null,
      error: null,
    },
    onClose: fn(),
    onOpenCategory: fn(),
    onOpenHome: fn(),
    onSelectProduct: fn(),
    onPurchase: fn(),
    coinOrderSession: null,
    onOpenCoinOrders: fn(),
    onCloseCoinOrders: fn(),
    onBuyCoins: fn(),
    onCancelCoinOrder: fn(),
    onCheckCoinOrder: fn(),
  },
} satisfies Meta<typeof StoreModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {};

export const ConfirmsPurchase: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Buy for 250 Mantus Coins" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Confirm purchase" }),
    );
    await expect(args.onPurchase).toHaveBeenCalledWith(
      "premium-30",
      undefined,
    );
  },
};

/** The server greys the offer and says why; the client only renders it. */
export const AlreadyOwned: Story = {
  args: {
    session: {
      ...meta.args.session,
      selectedProductId: "mounts-armoured-war-horse",
      description: "A dangerous black beauty.",
    },
  },
};

export const NameChangeAsksForAName: Story = {
  args: {
    session: {
      ...meta.args.session,
      categoryId: "extra-services",
      products: [NAME_CHANGE],
      selectedProductId: "extra-services-character-name-change",
      description: "Tired of your current character name? Purchase a new one!",
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Character Name Change" }),
    );
    await expect(
      canvas.getByRole("dialog", { name: "Confirm purchase" }),
    ).toBeVisible();
    const field = canvas.getByLabelText("New character name");
    await userEvent.type(field, "Fresh Start");
    await userEvent.click(
      canvas.getByRole("button", { name: "Confirm purchase" }),
    );
    await expect(args.onPurchase).toHaveBeenCalledWith(
      "name-change",
      "Fresh Start",
    );
  },
};

/** A full page of a paged category — mounts run to a dozen pages. */
const MOUNT_PAGE: StoreProduct[] = [
  "Armoured War Horse",
  "Arctic Unicorn",
  "Batcat",
  "Battle Badger",
  "Black Stag",
  "Blackpelt",
  "Blazebringer",
  "Cold Percht Sleigh",
  "Crystal Wolf",
  "Death Crawler",
  "Donkey",
  "Draptor",
].map((name, index) => ({
  id: `mounts-${index}`,
  name,
  kind: "mount" as const,
  icon: MOUNT_ICON,
  subOffers: [
    index === 0
      ? {
          id: "mount-23",
          price: 870,
          disabled: true,
          disabledReason: "You already own this mount.",
        }
      : { id: `mount-${index}`, price: 750 + index * 30 },
  ],
}));

export const PagedCategory: Story = {
  args: {
    session: {
      ...meta.args.session,
      categoryId: "mounts",
      products: MOUNT_PAGE,
      page: 1,
      pageCount: 12,
      selectedProductId: "mounts-0",
      description:
        "{character}\n{speedboost}\n\nThe Armoured War Horse is a dangerous black beauty! Protected by its heavy armour plates, the warhorse is the perfect partner for dangerous hunting sessions.",
    },
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
