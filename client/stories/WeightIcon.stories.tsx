import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { WeightIcon } from "../components/inventory/WeightIcon";

const meta = {
  title: "WeightIcon",
  component: WeightIcon,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-panel-frame p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WeightIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { className: "text-ui-muted" },
};

export const Gold: Story = {
  args: { className: "text-ui-gold" },
};
