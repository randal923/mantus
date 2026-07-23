import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
} from "@tibia/protocol";
import { expect, fn, userEvent, within } from "storybook/test";

import { ActionBarModal } from "../components/action-bar/ActionBarModal";

const actionBar = createDefaultActionBar();
actionBar[0] = {
  ...actionBar[0]!,
  action: {
    kind: "spell",
    spellId: "exura-infir-ico",
    targetMode: "self",
  },
};

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
    inventory: null,
    actionBar,
    botSettings: DEFAULT_ACTION_BOT_SETTINGS,
    request: { slotIndex: 1, section: "spell" },
    onActionBarChange: fn(),
    onBotSettingsChange: fn(),
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
    const search = canvas.getByRole("searchbox", { name: "Search spells" });
    await userEvent.type(search, "exori infir min");
    await expect(canvas.queryByText("Bruise Bane")).not.toBeInTheDocument();
    const row = canvas.getByRole("button", { name: /Lesser Front Sweep/ });
    await row.click();
    await expect(args.onActionBarChange).toHaveBeenCalled();
  },
};

export const EmptyBar: Story = {
  args: {
    actionBar: createDefaultActionBar(),
    request: { slotIndex: 0, section: "spell" },
  },
};
