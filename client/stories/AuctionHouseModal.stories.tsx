import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AuctionHouseModal } from "../components/auction/AuctionHouseModal";
import type {
  AuctionHistoryEntry,
  AuctionHouseItem,
  AuctionOffer,
  AuctionOwnOffer,
} from "../components/auction/auctionTypes";

const items: ReadonlyArray<AuctionHouseItem> = [
  {
    id: "dragon-shield",
    name: "Dragon Shield",
    category: "shields",
    spriteId: 7902,
    ownedCount: 2,
    averagePrice: 43_000,
  },
  {
    id: "demon-shield",
    name: "Demon Shield",
    category: "shields",
    spriteId: 7912,
    ownedCount: 0,
    averagePrice: 31_500,
  },
  {
    id: "crown-shield",
    name: "Crown Shield",
    category: "shields",
    spriteId: 7911,
    ownedCount: 1,
    averagePrice: 51_250,
  },
  {
    id: "dark-shield",
    name: "Dark Shield",
    category: "shields",
    spriteId: 7913,
    ownedCount: 0,
    averagePrice: 6_450,
  },
  {
    id: "fire-sword",
    name: "Fire Sword",
    category: "weapons",
    spriteId: 7749,
    ownedCount: 1,
    averagePrice: 8_250,
  },
  {
    id: "magic-plate-armor",
    name: "Magic Plate Armor",
    category: "armor",
    spriteId: 7852,
    ownedCount: 0,
    averagePrice: 780_000,
  },
  {
    id: "spellbook",
    name: "Spellbook",
    category: "spellbooks",
    spriteId: 4970,
    ownedCount: 3,
    averagePrice: 800,
  },
  {
    id: "great-health-potion",
    name: "Great Health Potion",
    category: "consumables",
    spriteId: 4344,
    ownedCount: 20,
    averagePrice: 190,
  },
  {
    id: "sudden-death-rune",
    name: "Sudden Death Rune",
    category: "runes",
    spriteId: 7622,
    ownedCount: 8,
    averagePrice: 3_250,
  },
  {
    id: "crystal-coin",
    name: "Crystal Coin",
    category: "valuables",
    spriteId: 7435,
    ownedCount: 12,
    averagePrice: 10_000,
  },
];

const offers: ReadonlyArray<AuctionOffer> = [
  {
    id: "dragon-sell-1",
    itemId: "dragon-shield",
    side: "sell",
    amount: 2,
    pricePerItem: 43_000,
    expiresAt: "2026-07-23T16:00:00.000Z",
  },
  {
    id: "dragon-sell-2",
    itemId: "dragon-shield",
    side: "sell",
    amount: 5,
    pricePerItem: 44_750,
    expiresAt: "2026-07-24T18:30:00.000Z",
  },
  {
    id: "dragon-sell-3",
    itemId: "dragon-shield",
    side: "sell",
    amount: 1,
    pricePerItem: 49_900,
    expiresAt: "2026-07-26T09:15:00.000Z",
  },
  {
    id: "dragon-buy-1",
    itemId: "dragon-shield",
    side: "buy",
    amount: 1,
    pricePerItem: 40_500,
    expiresAt: "2026-07-22T20:00:00.000Z",
  },
  {
    id: "dragon-buy-2",
    itemId: "dragon-shield",
    side: "buy",
    amount: 2,
    pricePerItem: 39_000,
    expiresAt: "2026-07-25T11:45:00.000Z",
  },
  {
    id: "rune-sell-1",
    itemId: "sudden-death-rune",
    side: "sell",
    amount: 20,
    pricePerItem: 3_300,
    expiresAt: "2026-07-27T12:00:00.000Z",
  },
  {
    id: "rune-buy-1",
    itemId: "sudden-death-rune",
    side: "buy",
    amount: 5,
    pricePerItem: 3_100,
    expiresAt: "2026-07-21T13:00:00.000Z",
  },
  {
    id: "fire-sword-sell-1",
    itemId: "fire-sword",
    side: "sell",
    amount: 1,
    pricePerItem: 8_500,
    expiresAt: "2026-07-28T14:00:00.000Z",
  },
  {
    id: "dragon-sell-mine",
    itemId: "dragon-shield",
    side: "sell",
    amount: 1,
    pricePerItem: 45_500,
    expiresAt: "2026-07-29T10:00:00.000Z",
    mine: true,
  },
];

const ownOffers: ReadonlyArray<AuctionOwnOffer> = [
  {
    id: "dragon-sell-mine",
    itemId: "dragon-shield",
    side: "sell",
    name: "Dragon Shield",
    spriteId: 7902,
    amount: 1,
    pricePerItem: 45_500,
    expiresAt: "2026-07-29T10:00:00.000Z",
  },
  {
    id: "rune-buy-mine",
    itemId: "sudden-death-rune",
    side: "buy",
    name: "Sudden Death Rune",
    spriteId: 7622,
    amount: 50,
    pricePerItem: 3_000,
    expiresAt: "2026-08-02T08:30:00.000Z",
  },
];

const history: ReadonlyArray<AuctionHistoryEntry> = [
  {
    itemId: "fire-sword",
    side: "sell",
    name: "Fire Sword",
    spriteId: 7749,
    amount: 1,
    pricePerItem: 8_400,
    state: "accepted",
    occurredAt: "2026-07-15T19:20:00.000Z",
  },
  {
    itemId: "great-health-potion",
    side: "buy",
    name: "Great Health Potion",
    spriteId: 4344,
    amount: 100,
    pricePerItem: 180,
    state: "cancelled",
    occurredAt: "2026-07-12T11:05:00.000Z",
  },
  {
    itemId: "spellbook",
    side: "sell",
    name: "Spellbook",
    spriteId: 4970,
    amount: 1,
    pricePerItem: 850,
    state: "expired",
    occurredAt: "2026-06-30T09:00:00.000Z",
  },
];

const meta = {
  title: "Auction House/AuctionHouseModal",
  component: AuctionHouseModal,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop min-h-dvh">
        <Story />
      </div>
    ),
  ],
  args: {
    items,
    offers,
    goldBalance: 298_765,
    initialItemId: "dragon-shield",
    ownOffers,
    history,
    onClose: fn(),
    onSelectItem: fn(),
    onAcceptOffer: fn(),
    onCreateOrder: fn(),
    onCancelOffer: fn(),
  },
} satisfies Meta<typeof AuctionHouseModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Market: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("dialog", { name: "Auction House" }),
    ).toBeInTheDocument();
    await expect(canvas.getAllByText("Dragon Shield").length).toBeGreaterThan(1);
    await expect(canvas.getByText("For Sale")).toBeInTheDocument();
    await expect(canvas.getByText("Wanted")).toBeInTheDocument();

    await userEvent.type(canvas.getByRole("searchbox", { name: "Search" }), "demon");
    await expect(canvas.getByText("Demon Shield")).toBeInTheDocument();
    await expect(canvas.queryByText("Crown Shield")).not.toBeInTheDocument();

    await userEvent.clear(canvas.getByRole("searchbox", { name: "Search" }));
    await userEvent.click(canvas.getByRole("button", { name: "Runes" }));
    await userEvent.click(
      canvas.getByRole("button", { name: /Sudden Death Rune/ }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Create Offer" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Buy" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Create Buy Offer" }),
    );

    await expect(args.onCreateOrder).toHaveBeenCalledWith({
      itemId: "sudden-death-rune",
      side: "buy",
      amount: 1,
      pricePerItem: 3_250,
    });
  },
};

export const EmptyOrderBook: Story = {
  args: {
    offers: [],
    initialItemId: "crown-shield",
  },
};

export const CreateOffer: Story = {
  args: {
    initialItemId: "fire-sword",
    initialTab: "create",
  },
};

export const MyOffers: Story = {
  args: {
    initialTab: "mine",
  },
};

export const ActionFailed: Story = {
  args: {
    error: "Your bank balance cannot cover that amount.",
  },
};

export const NoItems: Story = {
  args: {
    items: [],
    offers: [],
    initialItemId: undefined,
  },
};
