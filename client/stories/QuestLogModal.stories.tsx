import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { QuestLineMessage, QuestLogMessage } from "@tibia/protocol";
import { QuestLogModal } from "../components/quest/QuestLogModal";

const LOG: QuestLogMessage = {
  type: "quest-log",
  quests: [
    { questId: 1, name: "The Queen of the Banshees", completed: true },
    { questId: 2, name: "The Paradox Tower", completed: false },
    { questId: 3, name: "The Postman Missions", completed: false },
  ],
};

const LINE: QuestLineMessage = {
  type: "quest-line",
  questId: 2,
  name: "The Paradox Tower",
  missions: [
    {
      missionId: 1,
      name: "The Riddler",
      completed: true,
      description: "You answered the riddler's questions.",
    },
    {
      missionId: 2,
      name: "The Mathemagics",
      completed: false,
      description: "Solve the paradox of the tower's uppermost floor.",
    },
  ],
};

const meta = {
  title: "Game/QuestLogModal",
  component: QuestLogModal,
  parameters: { layout: "fullscreen" },
  args: {
    log: LOG,
    line: LINE,
    error: null,
    onSelectQuest: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof QuestLogModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Started quests with one selected quest line. */
export const WithSelection: Story = {};

/** Nothing started yet. */
export const Empty: Story = {
  args: { log: { type: "quest-log", quests: [] }, line: null },
};

/** Log still loading. */
export const Loading: Story = {
  args: { log: null, line: null },
};
