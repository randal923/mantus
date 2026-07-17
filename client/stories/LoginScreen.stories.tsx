import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LoginScreen } from "../components/auth/LoginScreen";

const meta = {
  title: "Game/LoginScreen",
  component: LoginScreen,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LoginScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
