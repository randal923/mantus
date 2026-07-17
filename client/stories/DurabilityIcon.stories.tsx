import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DurabilityIcon } from "../components/inventory/DurabilityIcon";

const meta = {
  title: "DurabilityIcon",
  component: DurabilityIcon,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-panel-frame p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DurabilityIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { className: "text-ui-text" },
};

export const Gold: Story = {
  args: { className: "text-ui-gold" },
};

export const Warning: Story = {
  args: { className: "text-red-400" },
};
