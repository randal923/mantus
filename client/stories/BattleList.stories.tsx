import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { CreatureState } from "@tibia/protocol";
import { BattleList } from "../components/creatures/BattleList";

const OWN_PLAYER_ID = "player-own";

function makeCreature(input: {
  id: string;
  kind: CreatureState["kind"];
  name: string;
  healthPercent: number | null;
}): CreatureState {
  return {
    ...input,
    position: { x: 100, y: 100, z: 7 },
    positionRevision: 1,
    direction: "south",
    outfit: { lookType: 21, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
  };
}

const CREATURES: ReadonlyArray<CreatureState> = [
  makeCreature({ id: OWN_PLAYER_ID, kind: "player", name: "Deceius", healthPercent: 100 }),
  makeCreature({ id: "monster-1", kind: "monster", name: "Troll", healthPercent: 62 }),
  makeCreature({ id: "monster-2", kind: "monster", name: "Rat", healthPercent: 100 }),
  makeCreature({ id: "monster-3", kind: "monster", name: "Cave Rat", healthPercent: 14 }),
  makeCreature({ id: "player-2", kind: "player", name: "Avara Stormblade", healthPercent: null }),
];

const meta = {
  title: "Game/Creatures/BattleList",
  component: BattleList,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop relative h-dvh font-tibia">
        <Story />
      </div>
    ),
  ],
  args: {
    title: "Battle",
    creatures: CREATURES,
    ownPlayerId: OWN_PLAYER_ID,
    attackTargetId: null,
  },
} satisfies Meta<typeof BattleList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Attacking: Story = {
  args: { attackTargetId: "monster-1" },
};

export const SingleCreature: Story = {
  args: {
    creatures: [
      makeCreature({ id: "monster-1", kind: "monster", name: "Troll", healthPercent: 62 }),
    ],
  },
};
