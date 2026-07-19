import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { ActionBarModal } from "../components/spells/ActionBarModal";

const meta = {
  title: "ActionBarModal",
  component: ActionBarModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
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
      {
        id: "exori-infir-min",
        origin: "spell",
        runeItemTypeId: null,
        name: "Lesser Front Sweep",
        words: "exori infir min",
        damageType: "physical",
        effectId: 10,
        manaCost: 6,
        soulCost: 0,
        requiredLevel: 1,
        requiredMagicLevel: 0,
        needWeapon: true,
        cooldownMs: 6_000,
        cooldownGroups: [
          "spell:exori-infir-min",
          "group:attack",
        ],
        targetKind: "direction",
      },
    ],
    actionBar: ["exura-infir-ico"],
    initialSlot: 1,
    onChange: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ActionBarModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("dialog", { name: "Action Bar" }),
    ).toBeInTheDocument();
    const row = canvas.getByRole("button", {
      name: "Assign Lesser Front Sweep to slot 2",
    });
    await row.click();
    await expect(args.onChange).toHaveBeenCalledWith([
      "exura-infir-ico",
      "exori-infir-min",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  },
};

export const EmptyBar: Story = {
  args: {
    actionBar: [],
    initialSlot: 0,
  },
};
