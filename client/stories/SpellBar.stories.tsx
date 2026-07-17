import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import { SpellBar } from "../components/spells/SpellBar";

const SPELLS = [
  { id: "exura", name: "Light Healing", shortcut: "1", manaCost: 20 },
  { id: "exori-vis", name: "Energy Strike", shortcut: "2", manaCost: 35 },
  { id: "exevo-frigo-hur", name: "Ice Wave", shortcut: "3", manaCost: 55 },
  {
    id: "adevo-mas-flam",
    name: "Fire Bomb",
    shortcut: "4",
    manaCost: 85,
    cooldownReadyAt: Date.now() + 3_000,
    cooldownTotalMs: 6_000,
  },
  { id: "utani-hur", name: "Haste", shortcut: "5", manaCost: 60 },
  { id: "utamo-vita", name: "Magic Shield", shortcut: "6", manaCost: 50 },
  { id: "exura-vita", name: "Ultimate Healing", shortcut: "7", manaCost: 160 },
  { id: "empty", name: "Empty Slot", shortcut: "8", disabled: true },
];

const meta = {
  title: "SpellBar",
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
    await expect(args.onCast).toHaveBeenCalledWith("exura");
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
