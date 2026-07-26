import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { ProfileStateMessage } from "@tibia/protocol";
import { ProfileModal } from "../components/profile/ProfileModal";

const PROFILE: ProfileStateMessage = {
  type: "profile-state",
  achievements: [
    {
      achievementId: "annihilator",
      name: "Annihilator",
      description: "You defeated the four bosses of the Annihilator room.",
      grade: 2,
      points: 5,
      secret: false,
      granted: true,
    },
    {
      achievementId: "backpack-tourist",
      name: "Backpack Tourist",
      description: "You looted your first hundred containers.",
      grade: 1,
      points: 1,
      secret: false,
      granted: false,
    },
    {
      achievementId: "demonic-barkeeper",
      name: "Demonic Barkeeper",
      description: "You served the special drink.",
      grade: 3,
      points: 6,
      secret: true,
      granted: false,
    },
    {
      achievementId: "here-comes-the-sun",
      name: "Here Comes the Sun",
      description: "You banished the eternal winter.",
      grade: 4,
      points: 10,
      secret: true,
      granted: true,
    },
  ],
  titles: [
    { titleId: "annihilator", name: "Annihilator", granted: true },
    { titleId: "creature-of-habit", name: "Creature of Habit", granted: false },
  ],
  badges: [{ badgeId: "loyalty-1", name: "Fledgeling Hero" }],
  selectedTitle: "annihilator",
  points: 15,
};

const handlers = {
  onSelectTitle: fn(),
  onClose: fn(),
};

const meta = {
  title: "Game/ProfileModal",
  component: ProfileModal,
  parameters: { layout: "fullscreen" },
  args: {
    profile: PROFILE,
    characterName: "Deceius",
    level: 47,
    vocation: "Elite Knight",
    pending: false,
    error: null,
    ...handlers,
  },
} satisfies Meta<typeof ProfileModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Granted first, then by name; the ungranted secret entry stays "???". */
export const Achievements: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("???")).toBeVisible();
    await expect(canvas.queryByText("Demonic Barkeeper")).toBeNull();
  },
};

/** An ungranted title renders as a disabled radio: never selectable. */
export const Titles: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Titles" }));
    const locked = await canvas.findByRole("radio", {
      name: /Creature of Habit/,
    });
    await expect(locked).toBeDisabled();
    await expect(
      canvas.getByRole("radio", { name: /Annihilator/ }),
    ).toBeChecked();
    await expect(args.onSelectTitle).not.toHaveBeenCalled();
  },
};

export const AwaitingState: Story = {
  args: { profile: null },
};

export const WithError: Story = {
  args: { error: "You have not earned that title yet." },
};
