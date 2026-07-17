import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { OwnCharacterState } from "@tibia/protocol";
import { fn } from "storybook/test";

import { GameHud } from "../components/GameHud";

const meta = {
  title: "GameHud",
  component: GameHud,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    visibleCreatures: [],
    ownCharacter: {
      id: "player",
      vocation: "Knight",
      level: 20,
    } as OwnCharacterState,
    fightState: {
      attackTargetId: null,
      mode: { attack: "balanced", chase: true, secure: true },
      conditions: [
        { type: "combat-lock", remainingMs: 24_000, stacks: 1 },
      ],
      cooldowns: [],
    },
    hasWeapon: true,
    spells: [
      {
        id: "exura-infir-ico",
        origin: "spell",
        runeItemTypeId: null,
        name: "Bruise Bane",
        words: "exura infir ico",
        damageType: "healing",
        effectId: 13,
        manaCost: 10,
        soulCost: 0,
        requiredLevel: 1,
        requiredMagicLevel: 0,
        needWeapon: false,
        cooldownMs: 1_000,
        cooldownGroups: [
          "spell:exura-infir-ico",
          "group:healing",
        ],
        targetKind: "self",
      },
    ],
    combatLog: ["You gained 5 experience."],
    onFightModeChange: fn(),
    onCast: fn(),
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop relative h-dvh overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-radial from-ui-stone/10 to-transparent"
        />
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GameHud>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
