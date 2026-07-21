import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";
import { ActionBar } from "../components/action-bar/ActionBar";

const SLOTS = Array.from({ length: 9 }, (_, index) => {
  const shortcut = String(index + 1);
  return {
    shortcut,
    shortcutLabel: shortcut,
    emptyTitle: `Empty slot ${shortcut}`,
    emptyAriaLabel: `Empty slot ${shortcut}`,
    item:
      index < 7
        ? {
            id: `action-${index + 1}`,
            icon: <span aria-hidden>✦</span>,
            title: `Action ${index + 1} (${shortcut})`,
            ariaLabel: `Action ${index + 1}, shortcut ${shortcut}`,
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
        <Story />
      </div>
    ),
  ],
  args: {
    ariaLabel: "Action bar",
    slots: SLOTS,
    onActivate: fn(),
    onConfigure: fn(),
    hotkeysEnabled: true,
  },
} satisfies Meta<typeof ActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args }) => {
    await userEvent.keyboard("1");
    await expect(args.onActivate).toHaveBeenCalledWith("action-1", 0);
    await userEvent.keyboard("8");
    await expect(args.onActivate).toHaveBeenCalledTimes(1);
  },
};

export const ShiftHotkeys: Story = {
  args: {
    hotkeyModifier: "shift",
    slots: SLOTS.map((slot, index) => ({
      ...slot,
      shortcut: `Shift+${index + 1}`,
      shortcutLabel: `⇧${index + 1}`,
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
    await expect(args.onConfigure).toHaveBeenCalledWith(0);
  },
};
