import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type {
  TaskHuntingSlot,
  TaskHuntingStateMessage,
} from "@tibia/protocol";
import { HuntingTasksModal } from "../components/hunting/HuntingTasksModal";

type TaskMonster = TaskHuntingSlot["grid"][number];

const monster = (
  raceId: number,
  name: string,
  lookTypeId: number,
  stars: number,
  upgradeUnlocked: boolean,
): TaskMonster => ({ raceId, name, lookTypeId, stars, upgradeUnlocked });

const GRID: TaskMonster[] = [
  monster(21, "Rat", 21, 1, true),
  monster(56, "Cave Rat", 56, 1, false),
  monster(26, "Rotworm", 26, 2, true),
  monster(22, "Cyclops", 22, 3, false),
  monster(15, "Troll", 15, 1, true),
  monster(30, "Poison Spider", 30, 2, false),
  monster(44, "Wasp", 44, 2, true),
  monster(16, "Bear", 16, 3, false),
  monster(27, "Wolf", 27, 2, true),
];

const POOL: TaskMonster[] = [
  ...GRID,
  monster(34, "Dragon", 34, 4, true),
  monster(39, "Dragon Lord", 39, 5, false),
];

/** Medium (3★ monster) at slot rarity 4: 100 kills → 77 pts (×2 upgraded). */
const ACTIVE_SLOT: TaskHuntingSlot = {
  slot: 0,
  state: "active",
  unlock: null,
  grid: GRID.slice(0, 8),
  selected: monster(34, "Dragon", 34, 3, true),
  upgrade: false,
  rarity: 4,
  kills: 37,
  goalKills: 100,
  goalPoints: 77,
  disabledForSeconds: 0,
  freeRerollInSeconds: 0,
};

const SELECTION_SLOT: TaskHuntingSlot = {
  slot: 1,
  state: "selection",
  unlock: null,
  grid: GRID,
  selected: null,
  upgrade: false,
  rarity: 3,
  kills: 0,
  goalKills: null,
  goalPoints: null,
  disabledForSeconds: 0,
  freeRerollInSeconds: 43_200,
};

const LOCKED_SLOT: TaskHuntingSlot = {
  slot: 2,
  state: "locked",
  unlock: "premium",
  grid: [],
  selected: null,
  upgrade: false,
  rarity: 1,
  kills: 0,
  goalKills: null,
  goalPoints: null,
  disabledForSeconds: 0,
  freeRerollInSeconds: 0,
};

const COMPLETED_SLOT: TaskHuntingSlot = {
  ...ACTIVE_SLOT,
  state: "completed",
  upgrade: true,
  kills: 213,
  goalKills: 200,
  goalPoints: 154,
};

const EXHAUSTED_SLOT: TaskHuntingSlot = {
  ...SELECTION_SLOT,
  slot: 2,
  state: "inactive",
  grid: [],
  disabledForSeconds: 64_800,
};

const OVERVIEW: TaskHuntingStateMessage = {
  type: "hunting-tasks-state",
  slots: [ACTIVE_SLOT, SELECTION_SLOT, LOCKED_SLOT],
  taskPoints: 120,
  rerollPriceGold: 16_400,
  listSelectionPool: null,
};

const meta = {
  title: "Game/HuntingTasksModal",
  component: HuntingTasksModal,
  parameters: { layout: "fullscreen" },
  args: {
    tasks: OVERVIEW,
    pending: false,
    error: null,
    onAction: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof HuntingTasksModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LockedSelectionActive: Story = {};

export const CompletedClaim: Story = {
  args: {
    tasks: {
      ...OVERVIEW,
      slots: [COMPLETED_SLOT, SELECTION_SLOT, EXHAUSTED_SLOT],
    },
  },
};

export const FullListSelection: Story = {
  args: {
    tasks: {
      ...OVERVIEW,
      slots: [
        ACTIVE_SLOT,
        { ...SELECTION_SLOT, state: "list-selection", grid: [] },
        LOCKED_SLOT,
      ],
      listSelectionPool: POOL,
    },
  },
};

export const ActionError: Story = {
  args: {
    error: "You have not reached the kill goal yet.",
  },
};
