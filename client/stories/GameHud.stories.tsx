import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { GameHud } from "../components/GameHud";

const meta = {
  title: "Game/GameHud",
  component: GameHud,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop relative h-dvh overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-radial from-ui-stone/10 to-transparent"
        />
        <Story />
      </div>
    ),
  ],
  args: {
    connectionStatus: "connected",
  },
} satisfies Meta<typeof GameHud>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

export const Connecting: Story = {
  args: {
    connectionStatus: "connecting",
  },
};

export const Disconnected: Story = {
  args: {
    connectionStatus: "disconnected",
  },
};
