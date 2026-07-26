import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { CharacterProfileMessage } from "@tibia/protocol";
import { PublicProfileModal } from "../components/profile/PublicProfileModal";

const PROFILE: CharacterProfileMessage = {
  type: "character-profile",
  name: "Mirella",
  level: 84,
  vocation: "Royal Paladin",
  guildName: "Red Rose",
  title: "Annihilator",
  points: 11,
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
      achievementId: "here-comes-the-sun",
      name: "Here Comes the Sun",
      description: "You banished the eternal winter.",
      grade: 4,
      points: 6,
      secret: true,
      granted: true,
    },
  ],
  badges: [
    { badgeId: "loyalty-1", name: "Fledgeling Hero" },
    { badgeId: "loyalty-2", name: "Veteran Hero" },
  ],
};

const handlers = {
  onClose: fn(),
};

const meta = {
  title: "Game/PublicProfileModal",
  component: PublicProfileModal,
  parameters: { layout: "fullscreen" },
  args: {
    profile: PROFILE,
    pending: false,
    error: null,
    ...handlers,
  },
} satisfies Meta<typeof PublicProfileModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The narrow public board: only granted achievements ever arrive here. */
export const Found: Story = {};

/** No guild and no display title: both lines simply stay absent. */
export const Guildless: Story = {
  args: {
    profile: { ...PROFILE, guildName: null, title: null, badges: [] },
  },
};

export const Loading: Story = {
  args: { profile: null, pending: true },
};

/** `not-found` is a normal outcome for a name that does not exist. */
export const NotFound: Story = {
  args: {
    profile: null,
    error: "No character by that name exists.",
  },
};
