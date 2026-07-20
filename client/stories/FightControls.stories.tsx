import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { FightControls } from "../components/combat/FightControls";

const meta = {
  title: "FightControls",
  component: FightControls,
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
    mode: {
      attack: "offensive",
      chase: false,
      secure: true,
    },
    onChange: fn(),
  },
} satisfies Meta<typeof FightControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BalancedSecure: Story = {
  args: {
    mode: {
      attack: "balanced",
      chase: true,
      secure: true,
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Offensive fighting" }),
    );
    await expect(args.onChange).toHaveBeenCalledWith({
      attack: "offensive",
      chase: true,
      secure: true,
    });
  },
};

export const OffensiveChaseOff: Story = {
  args: {
    mode: {
      attack: "offensive",
      chase: false,
      secure: true,
    },
  },
};

export const DefensivePvp: Story = {
  args: {
    mode: {
      attack: "defensive",
      chase: true,
      secure: false,
    },
  },
};
