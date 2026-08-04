import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
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
