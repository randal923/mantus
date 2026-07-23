import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ActionBarAction } from "@tibia/protocol";
import { expect, fn, userEvent } from "storybook/test";
import { ActionBar } from "../components/action-bar/ActionBar";

const SLOTS = Array.from({ length: 18 }, (_, index) => {
  const hotkey =
    index < 9 ? `Digit${index + 1}` : `Shift+Digit${index - 8}`;
  const hotkeyLabel =
    index < 9 ? String(index + 1) : `⇧${index - 8}`;
  const action: ActionBarAction | null =
    index < 7
      ? {
          kind: "spell",
          spellId: `action-${index + 1}`,
          targetMode: "self",
        }
      : null;
  return {
    action,
    hotkey,
    hotkeyLabel,
    emptyTitle: `Empty slot ${index + 1}`,
    emptyAriaLabel: `Empty slot ${index + 1}`,
    item:
      action
        ? {
            icon: <span aria-hidden>✦</span>,
            title: `Action ${index + 1} (${hotkeyLabel})`,
            ariaLabel: `Action ${index + 1}, shortcut ${hotkeyLabel}`,
            badge: 20 + index * 5,
            badgeTone: "mana" as const,
            ...(index === 3
              ? {
                  cooldownReadyAt: Date.now() + 3_000,
                  cooldownTotalMs: 6_000,
                }
              : {}),
          }
        : null,
  };
});

const meta = {
  title: "ActionBar",
  component: ActionBar,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop p-8">
        <div className="ui-action-cluster relative w-max p-2">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    ariaLabel: "Action bar",
    slots: SLOTS,
    onActivate: fn(),
    onConfigure: fn(),
    onChangeHotkey: fn(),
    onClearAction: fn(),
    onMoveAction: fn(),
    onDropItem: fn(),
    hotkeysEnabled: true,
  },
} satisfies Meta<typeof ActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args }) => {
    await userEvent.keyboard("1");
    await expect(args.onActivate).toHaveBeenCalledWith(0);
    await userEvent.keyboard("8");
    await expect(args.onActivate).toHaveBeenCalledTimes(1);
  },
};

export const ShiftHotkeys: Story = {
  args: {
    slots: SLOTS.map((slot, index) => ({
      ...slot,
      hotkey: `Shift+Digit${(index % 9) + 1}`,
      hotkeyLabel: `⇧${(index % 9) + 1}`,
    })),
  },
};

export const Empty: Story = {
  args: {
    slots: SLOTS.map((slot) => ({ ...slot, item: null })),
  },
  play: async ({ args, canvas }) => {
    const emptySlots = await canvas.findAllByRole("button");
    await userEvent.click(emptySlots[0]!);
    await expect(args.onConfigure).toHaveBeenCalledWith(0, "spell");
  },
};
