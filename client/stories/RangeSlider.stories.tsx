import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { RangeSlider } from "../components/ui/RangeSlider";

function InteractiveRangeSlider() {
  const [value, setValue] = useState(65);

  return (
    <RangeSlider
      label="Master Volume"
      value={value}
      min={0}
      max={100}
      unit="%"
      onChange={setValue}
    />
  );
}

const meta = {
  title: "RangeSlider",
  component: RangeSlider,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop w-80 p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    label: "Master Volume",
    value: 65,
    min: 0,
    max: 100,
    unit: "%",
    onChange: () => undefined,
  },
} satisfies Meta<typeof RangeSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: () => <InteractiveRangeSlider />,
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
