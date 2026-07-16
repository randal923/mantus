import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import { SpellBar } from "../components/spells/SpellBar";

const SPELLS = [
  { id: "heal", name: "Light Healing", effectId: 13, glyph: "✚", shortcut: "1", manaCost: 20 },
  { id: "energy", name: "Energy Strike", effectId: 38, glyph: "ϟ", shortcut: "2", manaCost: 35 },
  { id: "ice", name: "Ice Wave", effectId: 42, glyph: "❄", shortcut: "3", manaCost: 55 },
  {
    id: "fire",
    name: "Fire Bomb",
    effectId: 7,
    glyph: "✦",
    shortcut: "4",
    manaCost: 85,
    cooldownReadyAt: Date.now() + 3_000,
    cooldownTotalMs: 6_000,
  },
  { id: "haste", name: "Haste", effectId: 15, glyph: "»", shortcut: "5", manaCost: 60 },
  { id: "shield", name: "Magic Shield", effectId: 13, glyph: "◇", shortcut: "6", manaCost: 50 },
  { id: "ultimate", name: "Ultimate Healing", effectId: 13, glyph: "✥", shortcut: "7", manaCost: 160 },
  { id: "empty", name: "Empty Slot", effectId: 3, glyph: "", shortcut: "8", disabled: true },
];

const meta = {
  title: "Game/Spells/SpellBar",
  component: SpellBar,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    spells: SPELLS,
    onCast: fn(),
    hotkeysEnabled: true,
  },
} satisfies Meta<typeof SpellBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args }) => {
    await userEvent.keyboard("1");
    await expect(args.onCast).toHaveBeenCalledWith("heal");
  },
};

export const Ready: Story = {
  args: {
    spells: SPELLS.map((spell) => ({
      ...spell,
      cooldownReadyAt: 0,
      cooldownTotalMs: 0,
    })),
  },
};
