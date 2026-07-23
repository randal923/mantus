import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { VitalOrb } from "../components/action-bar/VitalOrb";

const meta = {
  title: "VitalOrb",
  component: VitalOrb,
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
    kind: "health",
    value: 1240,
    max: 1580,
  },
} satisfies Meta<typeof VitalOrb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Health: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const orb = canvas.getByRole("progressbar", { name: "Health" });
    const dragon = orb.querySelector("img");

    await expect(orb).toHaveClass("z-10");
    await expect(orb).toHaveClass("bottom-7");
    await expect(orb).toHaveClass("-left-2");
    await expect(orb).toHaveClass("size-24");
    await expect(dragon).not.toBeNull();
    await expect(dragon).toHaveClass("size-44");
    await expect(dragon).toHaveClass("left-[46%]");
    await expect(dragon).not.toHaveClass("-scale-x-100");
  },
};

export const CriticalHealth: Story = {
  args: {
    value: 126,
  },
};

export const Mana: Story = {
  args: {
    kind: "mana",
    value: 390,
    max: 620,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const orb = canvas.getByRole("progressbar", { name: "Mana" });
    const dragon = orb.querySelector("img");

    await expect(orb).toHaveClass("z-10");
    await expect(orb).toHaveClass("bottom-7");
    await expect(orb).toHaveClass("left-2");
    await expect(orb).toHaveClass("size-24");
    await expect(dragon).toHaveClass("size-44");
    await expect(dragon).toHaveClass("left-[54%]");
    await expect(dragon).toHaveClass("-scale-x-100");
  },
};
