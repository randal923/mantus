import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { GameHuntFinderOverlay } from "../components/game-window/GameHuntFinderOverlay";
import { GameWindowStoreProvider } from "../components/game-window/store/GameWindowStoreProvider";

const meta = {
  title: "Game/GameHuntFinderOverlay",
  component: GameHuntFinderOverlay,
  decorators: [
    (Story) => (
      <GameWindowStoreProvider accessToken="storybook" onLogout={async () => {}}>
        <Story />
      </GameWindowStoreProvider>
    ),
  ],
} satisfies Meta<typeof GameHuntFinderOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BestiaryNotLoaded: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toBeInTheDocument();
  },
};
