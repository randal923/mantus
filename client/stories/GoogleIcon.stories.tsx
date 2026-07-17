import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GoogleIcon } from "../components/auth/GoogleIcon";

const meta = {
  title: "Game/GoogleIcon",
  component: GoogleIcon,
  parameters: { layout: "centered" },
} satisfies Meta<typeof GoogleIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
