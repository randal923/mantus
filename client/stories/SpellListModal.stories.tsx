import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { SpellListModal } from "../components/spells/SpellListModal";

const meta = {
  title: "SpellListModal",
  component: SpellListModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    vocation: "Knight",
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
    onClose: fn(),
  },
} satisfies Meta<typeof SpellListModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Knight: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scrollRegion = canvasElement.querySelector(".ui-scrollbar");

    await expect(
      canvas.getByRole("dialog", { name: "Knight Spells" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Wound Cleansing")).toBeInTheDocument();
    await expect(canvas.getAllByRole("listitem")).toHaveLength(2);
    await expect(scrollRegion).not.toBeNull();
  },
};

export const Paladin: Story = {
  args: {
    vocation: "Paladin",
  },
};

export const Sorcerer: Story = {
  args: {
    vocation: "Sorcerer",
  },
};

export const Druid: Story = {
  args: {
    vocation: "Druid",
  },
};
