import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import { SpellBar } from "../components/spells/SpellBar";

const SLOTS = [
  {
    shortcut: "1",
    spell: { id: "exura", name: "Light Healing", manaCost: 20 },
  },
  {
    shortcut: "2",
    spell: { id: "exori-vis", name: "Energy Strike", manaCost: 35 },
  },
  {
    shortcut: "3",
    spell: { id: "exevo-frigo-hur", name: "Ice Wave", manaCost: 55 },
  },
  {
    shortcut: "4",
    spell: {
      id: "adevo-mas-flam",
      name: "Fire Bomb",
      manaCost: 85,
      cooldownReadyAt: Date.now() + 3_000,
      cooldownTotalMs: 6_000,
    },
  },
  {
    shortcut: "5",
    spell: { id: "utani-hur", name: "Haste", manaCost: 60 },
  },
  {
    shortcut: "6",
    spell: { id: "utamo-vita", name: "Magic Shield", manaCost: 50 },
  },
  {
    shortcut: "7",
    spell: { id: "exura-vita", name: "Ultimate Healing", manaCost: 160 },
  },
  { shortcut: "8", spell: null },
  { shortcut: "9", spell: null },
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
    slots: SLOTS,
    onCast: fn(),
    onConfigure: fn(),
    hotkeysEnabled: true,
  },
} satisfies Meta<typeof SpellBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args }) => {
    await userEvent.keyboard("1");
    await expect(args.onCast).toHaveBeenCalledWith("exura");
    await userEvent.keyboard("8");
    await expect(args.onCast).toHaveBeenCalledTimes(1);
  },
};

export const Ready: Story = {
  args: {
    slots: SLOTS.map((slot) => ({
      ...slot,
      spell: slot.spell
        ? { ...slot.spell, cooldownReadyAt: 0, cooldownTotalMs: 0 }
        : null,
    })),
  },
};

export const Empty: Story = {
  args: {
    slots: Array.from({ length: 9 }, (_, index) => ({
      shortcut: String(index + 1),
      spell: null,
    })),
  },
  play: async ({ args, canvas }) => {
    const emptySlots = await canvas.findAllByRole("button");
    await userEvent.click(emptySlots[0]!);
    await expect(args.onConfigure).toHaveBeenCalledWith(0);
  },
};
