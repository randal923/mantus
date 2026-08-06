import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { HuntingBotModal } from "../components/hunting-bot/HuntingBotModal";

const ROUTE = {
  huntName: "Amazon Camp",
  waypoints: [
    { x: 32_837, y: 31_927, z: 7 },
    { x: 32_845, y: 31_927, z: 7 },
    { x: 32_845, y: 31_935, z: 7 },
  ],
};

const meta = {
  title: "Game/HuntingBotModal",
  component: HuntingBotModal,
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
    ownPosition: { x: 32_837, y: 31_927, z: 7 },
    creatures: [],
    route: { huntName: "", waypoints: [] },
    status: null,
    error: null,
    onRouteChange: fn(),
    onStart: fn(),
    onStop: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof HuntingBotModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The browsing half: the same catalog and filters as the Hunt Finder. */
export const ChooseHunt: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole("dialog", { name: "Hunting Bot" });
    const search = within(dialog).getByRole("textbox", { name: "Search" });
    await userEvent.type(search, "Amazon Camp");
    await expect(
      await within(dialog).findByRole("button", { name: /Amazon Camp/ }),
    ).toBeVisible();
  },
};

/** A saved route opens straight into the editor. */
export const Editing: Story = {
  args: { route: ROUTE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole("dialog", { name: "Hunting Bot" });
    await expect(
      await within(dialog).findByRole("button", { name: "Start hunt" }),
    ).toBeEnabled();
    await expect(await within(dialog).findByText("3 waypoints")).toBeVisible();
  },
};

/** While it runs the button stops the hunt and the current waypoint shows. */
export const Running: Story = {
  args: {
    route: ROUTE,
    status: { enabled: true, waypointIndex: 1, stopReason: null },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole("dialog", { name: "Hunting Bot" });
    await expect(
      await within(dialog).findByText("Heading to waypoint 2 of 3"),
    ).toBeVisible();
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Stop hunt" }),
    );
    await expect(args.onStop).toHaveBeenCalled();
  },
};

/** Arming from outside the hunting ground is refused, and says so. */
export const OutOfRange: Story = {
  args: { route: ROUTE, error: "hunting-bot-out-of-range" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole("dialog", { name: "Hunting Bot" });
    await expect(
      await within(dialog).findByRole("alert"),
    ).toHaveTextContent("No walkable path reaches the route from here.");
  },
};

/**
 * A city's caves are one hunt: picking it asks which cave first, on a map of
 * every entrance, and the pin opens that cave's waypoints.
 */
export const ChooseCave: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole("dialog", { name: "Hunting Bot" });
    const search = within(dialog).getByRole("textbox", { name: "Search" });
    await userEvent.type(search, "Darashia Rotworm Caves");
    await userEvent.click(
      await within(dialog).findByRole("button", {
        name: /Darashia Rotworm Caves/,
      }),
    );
    const pin = await within(dialog).findByRole("button", {
      name: /^North Cave — enter at/,
    });
    await expect(pin).toBeVisible();
    await userEvent.click(pin);
    await expect(
      await within(dialog).findByText(
        "Editing Darashia Rotworm Caves · North Cave",
      ),
    ).toBeVisible();
    await expect(args.onRouteChange).toHaveBeenCalledWith(
      expect.objectContaining({
        huntName: "Darashia Rotworm Caves · North Cave",
      }),
    );
    // A cave dug through two floors seeds a ring on each: the bot walks
    // whichever floor the character stands on.
    const seeded = args.onRouteChange.mock.calls.at(-1)?.[0];
    await expect(
      new Set(seeded?.waypoints.map((waypoint: { z: number }) => waypoint.z))
        .size,
    ).toBeGreaterThan(1);
  },
};

const CAVE_ROUTE = {
  huntName: "Darashia Rotworm Caves · Far NorthWest Cave",
  waypoints: [
    { x: 33_010, y: 32_349, z: 8 },
    { x: 33_025, y: 32_349, z: 8 },
    { x: 33_059, y: 32_364, z: 8 },
    { x: 33_052, y: 32_369, z: 8 },
    { x: 33_043, y: 32_375, z: 8 },
    { x: 33_029, y: 32_371, z: 8 },
    { x: 33_017, y: 32_358, z: 8 },
  ],
};

/** Counts the map pixels that are not the automap's unexplored black. */
const litPixels = (canvas: HTMLCanvasElement): number => {
  const data = canvas
    .getContext("2d")!
    .getImageData(0, 0, canvas.width, canvas.height).data;
  let lit = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index]! + data[index + 1]! + data[index + 2]! > 30) lit += 1;
  }
  return lit;
};

/**
 * A cave floor is a warren of unrelated caves that all look alike on a baked
 * minimap, so the editor lights only the ground its route reaches.
 */
export const IsolatedRoute: Story = {
  args: { route: CAVE_ROUTE, ownPosition: { x: 33_010, y: 32_349, z: 8 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole("dialog", { name: "Hunting Bot" });
    const map = await within(dialog).findByLabelText(
      /Editable route map for Darashia Rotworm Caves/,
    );
    const toggle = within(dialog).getByRole("checkbox", {
      name: "Isolate hunt",
    });
    await expect(toggle).toBeChecked();
    await waitFor(() =>
      expect(litPixels(map as HTMLCanvasElement)).toBeGreaterThan(0),
    );
    const isolated = litPixels(map as HTMLCanvasElement);

    await userEvent.click(toggle);
    await waitFor(() =>
      expect(litPixels(map as HTMLCanvasElement)).toBeGreaterThan(isolated * 3),
    );
  },
};
