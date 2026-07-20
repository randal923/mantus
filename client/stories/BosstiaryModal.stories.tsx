import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { BosstiaryStateMessage } from "@tibia/protocol";
import { BosstiaryModal } from "../components/bestiary/BosstiaryModal";

const outfit = (lookType: number) => ({
  lookType,
  head: 0,
  body: 0,
  legs: 0,
  feet: 0,
  addons: 0,
});

const BOSSES: BosstiaryStateMessage = {
  type: "bosstiary-state",
  bossPoints: 20,
  entries: [
    {
      raceId: 46,
      name: "Black Knight",
      outfit: outfit(131),
      category: "bane",
      kills: 112,
    },
    {
      raceId: 205,
      name: "Demodras",
      outfit: outfit(34),
      category: "bane",
      kills: 12,
    },
    {
      raceId: 477,
      name: "Ferumbras",
      outfit: outfit(35),
      category: "nemesis",
      kills: 0,
    },
  ],
};

const meta = {
  title: "Game/BosstiaryModal",
  component: BosstiaryModal,
  parameters: { layout: "fullscreen" },
  args: {
    bosses: BOSSES,
    pending: false,
    error: null,
    onClose: fn(),
  },
} satisfies Meta<typeof BosstiaryModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bosses: Story = {};

export const Loading: Story = {
  args: { bosses: null, pending: true },
};

export const Empty: Story = {
  args: {
    bosses: { type: "bosstiary-state", bossPoints: 0, entries: [] },
  },
};
