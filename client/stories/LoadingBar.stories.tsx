import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { LoadingBar } from "../components/ui/LoadingBar";

function AnimatedLoadingBar() {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setValue((current) => (current >= 100 ? 0 : current + 1));
    }, 40);
    return () => window.clearInterval(interval);
  }, []);

  return <LoadingBar label="Entering World" value={value} />;
}

const meta = {
  title: "Game/LoadingBar",
  component: LoadingBar,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop w-96 p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    value: 42,
  },
} satisfies Meta<typeof LoadingBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Complete: Story = {
  args: {
    value: 100,
  },
};

export const Animated: Story = {
  render: () => <AnimatedLoadingBar />,
};
