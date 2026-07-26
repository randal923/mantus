import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { PreySlot, PreyStateMessage } from "@tibia/protocol";
import { PreyModal } from "../components/prey/PreyModal";

type PreyMonster = PreySlot["grid"][number];

const monster = (
  raceId: number,
  name: string,
  lookTypeId: number,
): PreyMonster => ({ raceId, name, lookTypeId });

const GRID: PreyMonster[] = [
  monster(21, "Rat", 21),
  monster(56, "Cave Rat", 56),
  monster(26, "Rotworm", 26),
  monster(22, "Cyclops", 22),
  monster(15, "Troll", 15),
  monster(30, "Poison Spider", 30),
  monster(44, "Wasp", 44),
  monster(16, "Bear", 16),
  monster(27, "Wolf", 27),
];

const POOL: PreyMonster[] = [
  ...GRID,
  monster(34, "Dragon", 34),
  monster(39, "Dragon Lord", 39),
  monster(35, "Demon", 35),
];

const ACTIVE_SLOT: PreySlot = {
  slot: 0,
  state: "active",
  unlock: null,
  grid: GRID.slice(0, 8),
  selected: monster(34, "Dragon", 34),
  bonus: { type: "damage", rarity: 7, percentage: 22 },
  bonusTimeLeftSeconds: 5_340,
  freeRerollInSeconds: 0,
  option: "auto-reroll",
};

const SELECTION_SLOT: PreySlot = {
  slot: 1,
  state: "selection",
  unlock: null,
  grid: GRID,
  selected: null,
  bonus: null,
  bonusTimeLeftSeconds: 0,
  freeRerollInSeconds: 61_200,
  option: "none",
};

const LOCKED_SLOT: PreySlot = {
  slot: 2,
  state: "locked",
  unlock: "store",
  grid: [],
  selected: null,
  bonus: null,
  bonusTimeLeftSeconds: 0,
  freeRerollInSeconds: 0,
  option: "none",
};

const OVERVIEW: PreyStateMessage = {
  type: "prey-state",
  slots: [ACTIVE_SLOT, SELECTION_SLOT, LOCKED_SLOT],
  wildcards: 12,
  listRerollPriceGold: 16_400,
  listSelectionPool: null,
};

const LIST_SELECTION: PreyStateMessage = {
  ...OVERVIEW,
  slots: [
    ACTIVE_SLOT,
    { ...SELECTION_SLOT, state: "list-selection", grid: [] },
    LOCKED_SLOT,
  ],
  listSelectionPool: POOL,
};

const meta = {
  title: "Game/PreyModal",
  component: PreyModal,
  parameters: { layout: "fullscreen" },
  args: {
    prey: OVERVIEW,
    pending: false,
    error: null,
    onAction: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof PreyModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LockedSelectionActive: Story = {};

export const FullListSelection: Story = {
  args: { prey: LIST_SELECTION },
};

export const ActionError: Story = {
  args: {
    prey: { ...OVERVIEW, wildcards: 0 },
    error: "You do not have enough Prey Wildcards.",
  },
};

export const Loading: Story = {
  args: { prey: null },
};
