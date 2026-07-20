import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { WHEEL_LIMITS, type WheelStateMessage } from "@tibia/protocol";
import { WheelModal } from "../components/wheel/WheelModal";

const slices = (points: Readonly<Record<number, number>>): number[] => {
  const result = new Array<number>(WHEEL_LIMITS.sliceCount).fill(0);
  for (const [id, value] of Object.entries(points)) {
    result[Number(id) - 1] = value;
  }
  return result;
};

const EMPTY_WHEEL: WheelStateMessage = {
  type: "wheel-state",
  slices: slices({}),
  totalPoints: 455,
  unlocked: true,
};

/** A red-domain push toward revelation stage 1, like a fresh sorcerer build. */
const RED_BUILD: WheelStateMessage = {
  type: "wheel-state",
  slices: slices({ 16: 50, 10: 75, 17: 75, 4: 100, 11: 100, 18: 50 }),
  totalPoints: 455,
  unlocked: true,
};

const meta = {
  title: "Game/WheelModal",
  component: WheelModal,
  parameters: { layout: "fullscreen" },
  args: {
    wheel: EMPTY_WHEEL,
    vocation: "Sorcerer",
    pending: false,
    error: null,
    onSave: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof WheelModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const RedDomainBuild: Story = {
  args: { wheel: RED_BUILD },
};

export const KnightBuild: Story = {
  args: {
    wheel: {
      type: "wheel-state",
      slices: slices({ 22: 50, 23: 75, 28: 75, 15: 50, 14: 75 }),
      totalPoints: 325,
      unlocked: true,
    },
    vocation: "Elite Knight",
  },
};

export const Locked: Story = {
  args: {
    wheel: {
      type: "wheel-state",
      slices: slices({}),
      totalPoints: 0,
      unlocked: false,
    },
    vocation: "Druid",
  },
};

export const SaveRejected: Story = {
  args: { wheel: RED_BUILD, error: "invalid-allocation" },
};
