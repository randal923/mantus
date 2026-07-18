import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { Toast } from "../components/ui/Toast";

const meta = {
  title: "Toast",
  component: Toast,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop min-h-64">
        <Story />
      </div>
    ),
  ],
  args: {
    message: "Offer created — items/gold moved to market escrow.",
    onDismiss: fn(),
  },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
