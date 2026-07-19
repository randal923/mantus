import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { CreatureState } from "@tibia/protocol";
import { fn } from "storybook/test";

import { MinimapPanel } from "../components/minimap/MinimapPanel";

const creature = (
  id: string,
  kind: CreatureState["kind"],
  name: string,
  x: number,
  y: number,
): CreatureState =>
  ({
    id,
    kind,
    name,
    position: { x, y, z: 6 },
    positionRevision: 1,
    direction: "south",
    healthPercent: kind === "npc" ? null : 80,
  }) as CreatureState;

const meta = {
  title: "MinimapPanel",
  component: MinimapPanel,
  args: {
    mapName: "otservbr",
    layout: null,
    onLayoutChange: fn(),
    ownPlayerId: "player",
    ownPosition: { x: 32069, y: 31901, z: 6 },
    creatures: [
      creature("npc-1", "npc", "Sam", 32062, 31896),
      creature("npc-2", "npc", "Frodo", 32075, 31905),
      creature("monster-1", "monster", "Rat", 32066, 31910),
      creature("monster-2", "monster", "Orc", 32079, 31894),
      creature("player-2", "player", "Alice", 32060, 31908),
    ],
  },
} satisfies Meta<typeof MinimapPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AtSpawn: Story = {};

export const NoCreatures: Story = {
  args: { creatures: [] },
};
