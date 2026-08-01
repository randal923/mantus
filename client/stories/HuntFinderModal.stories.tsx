import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { HuntFinderModal } from "../components/hunt-finder/HuntFinderModal";

const meta = {
  title: "Game/HuntFinderModal",
  component: HuntFinderModal,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop min-h-dvh">
        <Story />
      </div>
    ),
  ],
  args: {
    characterLevel: 8,
    characterVocation: "Knight",
    mapName: "otservbr",
    creatures: [],
    trackedRoute: null,
    onTrackedRouteChange: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof HuntFinderModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Catalog: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole("dialog", { name: "Hunt Finder" });
    const search = within(dialog).getByRole("textbox", { name: "Search" });
    await userEvent.type(search, "Amazon Camp");
    const result = await within(dialog).findByRole("button", {
      name: /Amazon Camp/,
    });
    await userEvent.click(result);
    await expect(
      within(dialog).getByRole("heading", { name: "Amazon Camp" }),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Hunt route" }),
    );
    await userEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "Track the path on the live map",
      }),
    );
    await expect(args.onTrackedRouteChange).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Amazon Camp",
        destination: { x: 32837, y: 31927, z: 7 },
      }),
    );
  },
};
