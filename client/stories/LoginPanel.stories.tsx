import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { LoginPanel } from "../components/auth/LoginPanel";

const meta = {
  title: "Game/LoginPanel",
  component: LoginPanel,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="flex w-lg items-center justify-center bg-neutral-950 p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    onSignIn: fn(),
    onSignUp: fn(),
    onGoogle: fn(),
  },
} satisfies Meta<typeof LoginPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Busy: Story = {
  args: {
    busy: true,
  },
};

export const WithError: Story = {
  args: {
    error: "Invalid login credentials",
  },
};

export const WithNotice: Story = {
  args: {
    notice: "Check your email to confirm your account.",
  },
};
