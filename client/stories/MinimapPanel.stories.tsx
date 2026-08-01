import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { CreatureState } from "@tibia/protocol";
import { expect, fn, within } from "storybook/test";

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
    mapMarkers: [],
    onLayoutChange: fn(),
    onWalkTo: fn(),
    onToggleMarker: fn(),
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

export const TrackedDarashiaWayPath: Story = {
  args: {
    ownPosition: { x: 33220, y: 32420, z: 7 },
    creatures: [],
    trackedRoute: {
      name: "Darashia Dragon Lair",
      destination: { x: 33231, y: 32263, z: 10 },
      coordinates: {
        7: [
          [
            { x: 33213, y: 32450, z: 7 },
            { x: 33265, y: 32281, z: 7 },
          ],
        ],
        8: [[{ x: 33265, y: 32275, z: 8 }, { x: 33264, y: 32274, z: 8 }]],
        9: [[{ x: 33262, y: 32275, z: 9 }, { x: 33260, y: 32275, z: 9 }]],
        10: [[{ x: 33258, y: 32275, z: 10 }, { x: 33256, y: 32278, z: 10 }]],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("33220, 32420, 7")).toBeVisible();
  },
};
