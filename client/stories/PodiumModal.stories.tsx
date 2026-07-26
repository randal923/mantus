import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { PodiumWindowMessage } from "@tibia/protocol";
import { PodiumModal } from "../components/podium/PodiumModal";

const RENOWN_WINDOW: PodiumWindowMessage = {
  type: "podium-window",
  itemId: "podium-1",
  revision: 1,
  position: { x: 100, y: 100, z: 7 },
  family: "renown",
  current: {
    podiumVisible: true,
    direction: 2,
    lookType: 128,
    head: 78,
    body: 69,
    legs: 58,
    feet: 76,
    addons: 1,
    mountLookType: 0,
    raceId: 0,
    monsterVisible: true,
  },
  outfits: [
    { lookType: 128, name: "Citizen", addons: 3 },
    { lookType: 129, name: "Hunter", addons: 1 },
  ],
  mounts: [{ mountId: 1, name: "Widow Queen", lookType: 368, speed: 10 }],
  races: [],
};

const VIGOUR_WINDOW: PodiumWindowMessage = {
  ...RENOWN_WINDOW,
  family: "vigour",
  current: { ...RENOWN_WINDOW.current, lookType: 0, raceId: 2216 },
  outfits: [],
  mounts: [],
  races: [
    {
      raceId: 2216,
      name: "Grand Master Oberon",
      outfit: { lookType: 1292, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
    },
    {
      raceId: 1447,
      name: "Gaz'haragoth",
      outfit: { lookType: 875, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
    },
  ],
};

const meta = {
  title: "Game/PodiumModal",
  component: PodiumModal,
  parameters: { layout: "fullscreen" },
  args: {
    window: RENOWN_WINDOW,
    error: null,
    onApply: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof PodiumModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Renown: owned outfits, colours, addons, mounts, direction, visibility. */
export const Renown: Story = {};

/** Vigour: unlocked bosses only; looks are copied server-side. */
export const Vigour: Story = {
  args: { window: VIGOUR_WINDOW },
};

/** A rejected edit surfaces the server reason inline. */
export const WithError: Story = {
  args: { error: "You have not unlocked that display." },
};
