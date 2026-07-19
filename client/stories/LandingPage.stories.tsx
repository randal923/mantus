import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LandingPage } from "../components/landing/LandingPage";

const meta = {
  title: "LandingPage",
  component: LandingPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
