import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { MountEntitlement, OutfitEntitlement } from "@tibia/protocol";
import { OutfitModal } from "../components/outfit/OutfitModal";

const OUTFITS: OutfitEntitlement[] = [
  { lookType: 128, name: "Citizen", addons: 3 },
  { lookType: 136, name: "Citizen", addons: 0 },
  { lookType: 129, name: "Hunter", addons: 1 },
];

const MOUNTS: MountEntitlement[] = [
  { mountId: 1, name: "Widow Queen", lookType: 368, speed: 10 },
  { mountId: 5, name: "Midnight Panther", lookType: 372, speed: 20 },
];

const meta = {
  title: "Game/OutfitModal",
  component: OutfitModal,
  parameters: { layout: "fullscreen" },
  args: {
    outfits: OUTFITS,
    mounts: MOUNTS,
    initial: {
      lookType: 128,
      head: 78,
      body: 69,
      legs: 58,
      feet: 76,
      addons: 1,
      mountId: 0,
    },
    pending: false,
    error: null,
    onConfirm: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof OutfitModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Citizen with both addons granted; the Hunter row has only the first. */
export const Entitled: Story = {};

/** Only the two starter outfits: the empty-state note explains why. */
export const StartersOnly: Story = {
  args: {
    outfits: [
      { lookType: 128, name: "Citizen", addons: 0 },
      { lookType: 136, name: "Citizen", addons: 0 },
    ],
    mounts: [],
  },
};

/** An ungranted addon checkbox renders disabled rather than sending a doomed bit. */
export const PartialAddons: Story = {
  args: {
    initial: {
      lookType: 129,
      head: 78,
      body: 69,
      legs: 58,
      feet: 76,
      addons: 0,
      mountId: 0,
    },
  },
};

export const Saving: Story = {
  args: { pending: true },
};

export const Refused: Story = {
  args: { error: "You do not own that outfit or mount." },
};
