import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CapacityBar } from "../components/inventory/CapacityBar";

const meta = {
  title: "Game/CapacityBar",
  component: CapacityBar,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-panel-frame w-80 p-4 font-tibia">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CapacityBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HalfFull: Story = {
  args: { used: 214, max: 400 },
};

export const NearlyFull: Story = {
  args: { used: 385, max: 400 },
};

export const Empty: Story = {
  args: { used: 0, max: 400 },
};

export const Overloaded: Story = {
  args: { used: 512, max: 400 },
};
