import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { ReportPlayerModal } from "../components/social/ReportPlayerModal";

const meta = {
  title: "Game/ReportPlayerModal",
  component: ReportPlayerModal,
  parameters: { layout: "fullscreen" },
  args: {
    initialTargetName: "Mirella",
    pending: false,
    error: null,
    sent: false,
    onSubmit: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ReportPlayerModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Prefilled: Story = {};

export const EmptyTarget: Story = {
  args: { initialTargetName: "" },
};

export const Sent: Story = {
  args: { sent: true },
};

export const RateLimited: Story = {
  args: { error: "You are reporting too quickly. Try again later." },
};
