import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { HouseListMessage, HouseState } from "@tibia/protocol";
import { HouseModal } from "../components/house/HouseModal";

const GUEST_ID = "00000000-0000-4000-8000-000000000002";
const SUBOWNER_ID = "00000000-0000-4000-8000-000000000003";

const UNOWNED_HOUSE: HouseState = {
  houseId: 2630,
  name: "Underwood 9",
  size: 14,
  rent: 50_000,
  townId: 5,
  townName: "Ab'Dendriel",
  entry: { x: 32712, y: 31665, z: 7 },
  guildhall: false,
  beds: 1,
  price: 14_000,
  ownerName: null,
  myAccess: "none",
};

const OWNED_HOUSE: HouseState = {
  ...UNOWNED_HOUSE,
  ownerName: "Deceius",
  myAccess: "owner",
  paidUntil: Date.parse("2026-08-18T12:00:00Z"),
  rentWarnings: 1,
  guests: [{ characterId: GUEST_ID, name: "Mirella" }],
  subowners: [{ characterId: SUBOWNER_ID, name: "Thorgal" }],
};

const OWNED_WITH_TRANSFER: HouseState = {
  ...OWNED_HOUSE,
  pendingTransfer: { targetName: "Elyra", price: 250_000 },
};

const LIST: HouseListMessage = {
  type: "house-list",
  entries: [
    {
      houseId: 2630,
      name: "Underwood 9",
      size: 14,
      rent: 50_000,
      townId: 5,
      townName: "Ab'Dendriel",
      guildhall: false,
      ownerName: null,
    },
    {
      houseId: 2628,
      name: "Castle of the Winds",
      size: 514,
      rent: 500_000,
      townId: 5,
      townName: "Ab'Dendriel",
      guildhall: true,
      ownerName: "Deceius",
    },
  ],
  towns: [{ townId: 5, townName: "Ab'Dendriel" }],
  page: 0,
  totalPages: 1,
  townId: 5,
};

const handlers = {
  onClose: fn(),
  onBuy: fn(),
  onAbandon: fn(),
  onOfferTransfer: fn(),
  onRespondOffer: fn(),
  onCancelTransfer: fn(),
  onSetAccess: fn(),
  onKick: fn(),
  onBrowse: fn(),
  onOpenHouse: fn(),
};

const meta = {
  title: "Game/HouseModal",
  component: HouseModal,
  parameters: { layout: "fullscreen" },
  args: {
    mapName: "otservbr",
    error: null,
    ...handlers,
  },
} satisfies Meta<typeof HouseModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnownedAtEntry: Story = {
  args: {
    session: {
      house: UNOWNED_HOUSE,
      list: null,
      incomingOffers: [],
      pending: false,
      error: null,
    },
  },
};

export const OwnerView: Story = {
  args: {
    session: {
      house: OWNED_HOUSE,
      list: LIST,
      incomingOffers: [],
      pending: false,
      error: null,
    },
  },
};

export const OwnerWithPendingTransfer: Story = {
  args: {
    session: {
      house: OWNED_WITH_TRANSFER,
      list: LIST,
      incomingOffers: [],
      pending: false,
      error: null,
    },
  },
};

export const IncomingOffer: Story = {
  args: {
    session: {
      house: null,
      list: LIST,
      incomingOffers: [
        {
          type: "house-transfer-incoming",
          houseId: 2631,
          houseName: "Treetop 13",
          fromName: "Deceius",
          price: 300_000,
        },
      ],
      pending: false,
      error: null,
    },
  },
};

export const WithError: Story = {
  args: {
    session: {
      house: UNOWNED_HOUSE,
      list: null,
      incomingOffers: [],
      pending: false,
      error: "insufficient-funds",
    },
    error: "Your bank account cannot cover this.",
  },
};
