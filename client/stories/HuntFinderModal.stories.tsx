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
      within(dialog).getByRole("button", {
        name: "Track path on the map",
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

/**
 * A hunt with several caves tracks the one being read: ticking "track" while
 * looking at the north cave must draw the way to *that* hole.
 */
export const TracksTheChosenCave: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole("dialog", { name: "Hunt Finder" });
    const search = within(dialog).getByRole("textbox", { name: "Search" });
    await userEvent.type(search, "Darashia Rotworm Caves");
    await userEvent.click(
      await within(dialog).findByRole("button", {
        name: /Darashia Rotworm Caves/,
      }),
    );
    await userEvent.click(
      await within(dialog).findByRole("button", {
        name: /^North Cave — enter at/,
      }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Track path on the map",
      }),
    );
    await expect(args.onTrackedRouteChange).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Darashia Rotworm Caves · North Cave",
      }),
    );
  },
};

/**
 * The hunt the live map is tracking is pinned in its own section above the
 * catalog, and its card leaves the grid below so it appears exactly once.
 */
export const TrackedHuntPinned: Story = {
  args: {
    trackedRoute: {
      name: "Darashia Rotworm Caves · North Cave",
      coordinates: {},
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole("dialog", { name: "Hunt Finder" });
    await expect(
      await within(dialog).findByText("Tracking on the live map"),
    ).toBeVisible();
    const cards = await within(dialog).findAllByRole("button", {
      name: /Darashia Rotworm Caves/,
    });
    await expect(cards).toHaveLength(1);
  },
};
