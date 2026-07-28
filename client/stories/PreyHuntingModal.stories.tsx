import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type {
  PreySlot,
  PreyStateMessage,
  TaskHuntingSlot,
  TaskHuntingStateMessage,
} from "@tibia/protocol";
import { PreyHuntingModal } from "../components/prey/PreyHuntingModal";

type PreyMonster = PreySlot["grid"][number];
type TaskMonster = TaskHuntingSlot["grid"][number];

const preyMonster = (
  raceId: number,
  name: string,
  lookTypeId: number,
): PreyMonster => ({ raceId, name, lookTypeId });

const taskMonster = (
  raceId: number,
  name: string,
  lookTypeId: number,
  stars: number,
  upgradeUnlocked: boolean,
): TaskMonster => ({ raceId, name, lookTypeId, stars, upgradeUnlocked });

const PREY_GRID: PreyMonster[] = [
  preyMonster(21, "Rat", 21),
  preyMonster(56, "Cave Rat", 56),
  preyMonster(26, "Rotworm", 26),
  preyMonster(22, "Cyclops", 22),
  preyMonster(15, "Troll", 15),
  preyMonster(30, "Poison Spider", 30),
  preyMonster(44, "Wasp", 44),
  preyMonster(16, "Bear", 16),
  preyMonster(27, "Wolf", 27),
];

const PREY_POOL: PreyMonster[] = [
  ...PREY_GRID,
  preyMonster(34, "Dragon", 34),
  preyMonster(39, "Dragon Lord", 39),
  preyMonster(35, "Demon", 35),
];

const PREY_ACTIVE_SLOT: PreySlot = {
  slot: 0,
  state: "active",
  unlock: null,
  grid: PREY_GRID.slice(0, 8),
  selected: preyMonster(34, "Dragon", 34),
  bonus: { type: "damage", rarity: 7, percentage: 22 },
  bonusTimeLeftSeconds: 5_340,
  freeRerollInSeconds: 0,
  option: "auto-reroll",
};

const PREY_SELECTION_SLOT: PreySlot = {
  slot: 1,
  state: "selection",
  unlock: null,
  grid: PREY_GRID,
  selected: null,
  bonus: null,
  bonusTimeLeftSeconds: 0,
  freeRerollInSeconds: 61_200,
  option: "none",
};

const PREY_LOCKED_SLOT: PreySlot = {
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

const PREY_OVERVIEW: PreyStateMessage = {
  type: "prey-state",
  slots: [PREY_ACTIVE_SLOT, PREY_SELECTION_SLOT, PREY_LOCKED_SLOT],
  wildcards: 12,
  listRerollPriceGold: 16_400,
  listSelectionPool: null,
};

const TASK_GRID: TaskMonster[] = [
  taskMonster(21, "Rat", 21, 1, true),
  taskMonster(56, "Cave Rat", 56, 1, false),
  taskMonster(26, "Rotworm", 26, 2, true),
  taskMonster(22, "Cyclops", 22, 3, false),
  taskMonster(15, "Troll", 15, 1, true),
  taskMonster(30, "Poison Spider", 30, 2, false),
  taskMonster(44, "Wasp", 44, 2, true),
  taskMonster(16, "Bear", 16, 3, false),
  taskMonster(27, "Wolf", 27, 2, true),
];

const TASK_POOL: TaskMonster[] = [
  ...TASK_GRID,
  taskMonster(34, "Dragon", 34, 4, true),
  taskMonster(39, "Dragon Lord", 39, 5, false),
];

/** Medium (3★ monster) at slot rarity 4: 100 kills → 77 pts (×2 upgraded). */
const TASK_ACTIVE_SLOT: TaskHuntingSlot = {
  slot: 0,
  state: "active",
  unlock: null,
  grid: TASK_GRID.slice(0, 8),
  selected: taskMonster(34, "Dragon", 34, 3, true),
  upgrade: false,
  rarity: 4,
  kills: 37,
  goalKills: 100,
  goalPoints: 77,
  disabledForSeconds: 0,
  freeRerollInSeconds: 0,
};

const TASK_SELECTION_SLOT: TaskHuntingSlot = {
  slot: 1,
  state: "selection",
  unlock: null,
  grid: TASK_GRID,
  selected: null,
  upgrade: false,
  rarity: 3,
  kills: 0,
  goalKills: null,
  goalPoints: null,
  disabledForSeconds: 0,
  freeRerollInSeconds: 43_200,
};

const TASK_LOCKED_SLOT: TaskHuntingSlot = {
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

const TASK_COMPLETED_SLOT: TaskHuntingSlot = {
  ...TASK_ACTIVE_SLOT,
  state: "completed",
  upgrade: true,
  kills: 213,
  goalKills: 200,
  goalPoints: 154,
};

const TASK_EXHAUSTED_SLOT: TaskHuntingSlot = {
  ...TASK_SELECTION_SLOT,
  slot: 2,
  state: "inactive",
  grid: [],
  disabledForSeconds: 64_800,
};

const TASK_OVERVIEW: TaskHuntingStateMessage = {
  type: "hunting-tasks-state",
  slots: [TASK_ACTIVE_SLOT, TASK_SELECTION_SLOT, TASK_LOCKED_SLOT],
  taskPoints: 120,
  rerollPriceGold: 16_400,
  listSelectionPool: null,
};

const meta = {
  title: "Game/PreyHuntingModal",
  component: PreyHuntingModal,
  parameters: { layout: "fullscreen" },
  args: {
    tab: "prey",
    onTabChange: fn(),
    prey: PREY_OVERVIEW,
    preyPending: false,
    preyError: null,
    onPreyAction: fn(),
    tasks: TASK_OVERVIEW,
    tasksPending: false,
    tasksError: null,
    onTaskAction: fn(),
    gold: 12_899_118,
    onClose: fn(),
  },
} satisfies Meta<typeof PreyHuntingModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PreyTab: Story = {};

export const PreyFullListSelection: Story = {
  args: {
    prey: {
      ...PREY_OVERVIEW,
      slots: [
        PREY_ACTIVE_SLOT,
        { ...PREY_SELECTION_SLOT, state: "list-selection", grid: [] },
        PREY_LOCKED_SLOT,
      ],
      listSelectionPool: PREY_POOL,
    },
  },
};

export const PreyActionError: Story = {
  args: {
    prey: { ...PREY_OVERVIEW, wildcards: 0 },
    preyError: "You do not have enough Prey Wildcards.",
  },
};

export const HuntingTasksTab: Story = {
  args: { tab: "hunting-tasks" },
};

export const TasksCompletedClaim: Story = {
  args: {
    tab: "hunting-tasks",
    tasks: {
      ...TASK_OVERVIEW,
      slots: [TASK_COMPLETED_SLOT, TASK_SELECTION_SLOT, TASK_EXHAUSTED_SLOT],
    },
  },
};

export const TasksFullListSelection: Story = {
  args: {
    tab: "hunting-tasks",
    tasks: {
      ...TASK_OVERVIEW,
      slots: [
        TASK_ACTIVE_SLOT,
        { ...TASK_SELECTION_SLOT, state: "list-selection", grid: [] },
        TASK_LOCKED_SLOT,
      ],
      listSelectionPool: TASK_POOL,
    },
  },
};

export const TasksActionError: Story = {
  args: {
    tab: "hunting-tasks",
    tasksError: "You have not reached the kill goal yet.",
  },
};

export const Loading: Story = {
  args: { prey: null, tasks: null },
};
