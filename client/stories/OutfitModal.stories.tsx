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

/** No mounts unlocked: the mount tab shows its empty state. */
export const StartersOnly: Story = {
  args: {
    outfits: [{ lookType: 128, name: "Citizen", addons: 0 }],
    mounts: [],
  },
};

/** A full starter wardrobe: the grid scrolls and the search box filters it. */
export const FullWardrobe: Story = {
  args: {
    outfits: [
      { lookType: 128, name: "Citizen", addons: 3 },
      { lookType: 129, name: "Hunter", addons: 3 },
      { lookType: 130, name: "Mage", addons: 3 },
      { lookType: 131, name: "Knight", addons: 3 },
      { lookType: 132, name: "Nobleman", addons: 1 },
      { lookType: 133, name: "Summoner", addons: 0 },
      { lookType: 134, name: "Warrior", addons: 0 },
      { lookType: 143, name: "Barbarian", addons: 0 },
      { lookType: 144, name: "Druid", addons: 0 },
      { lookType: 145, name: "Wizard", addons: 0 },
      { lookType: 146, name: "Oriental", addons: 0 },
    ],
    mounts: [
      { mountId: 1, name: "Widow Queen", lookType: 368, speed: 10 },
      { mountId: 2, name: "Racing Bird", lookType: 369, speed: 10 },
      { mountId: 3, name: "War Bear", lookType: 370, speed: 10 },
      { mountId: 5, name: "Midnight Panther", lookType: 372, speed: 10 },
    ],
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
