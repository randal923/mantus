import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { HighscoresStateMessage } from "@tibia/protocol";
import { HighscoresModal } from "../components/social/HighscoresModal";

const PAGE: HighscoresStateMessage = {
  type: "highscores-state",
  category: "experience",
  page: 0,
  totalPages: 3,
  entries: [
    {
      rank: 1,
      name: "Deceius",
      level: 214,
      vocation: "Elite Knight",
      value: 130_764_211,
    },
    {
      rank: 2,
      name: "Mirella",
      level: 189,
      vocation: "Master Sorcerer",
      value: 89_421_733,
    },
    {
      rank: 3,
      name: "Thorgal",
      level: 173,
      vocation: "Royal Paladin",
      value: 67_118_902,
    },
    {
      rank: 4,
      name: "Elyra",
      level: 151,
      vocation: "Elder Druid",
      value: 44_530_180,
    },
  ],
};

const meta = {
  title: "Game/HighscoresModal",
  component: HighscoresModal,
  parameters: { layout: "fullscreen" },
  args: {
    page: PAGE,
    pending: false,
    error: null,
    onRequest: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof HighscoresModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstPage: Story = {};

export const Loading: Story = {
  args: { page: null, pending: true },
};

export const WithError: Story = {
  args: { error: "Highscores are unavailable right now." },
};
