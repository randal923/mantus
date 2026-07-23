import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { PartyMemberEntry, PartyState } from "@tibia/protocol";
import { PartyPanel } from "../components/party/PartyPanel";

const OWN_PLAYER_ID = "00000000-0000-4000-8000-000000000001";
const LEADER_ID = "00000000-0000-4000-8000-000000000002";

function makeMember(input: {
  id: string;
  name: string;
  level: number;
  vocation: PartyMemberEntry["vocation"];
  isLeader?: boolean;
  healthPercent?: number | null;
  manaPercent?: number | null;
  eligibleForSharedExp?: boolean;
}): PartyMemberEntry {
  return {
    id: input.id,
    name: input.name,
    level: input.level,
    vocation: input.vocation,
    isLeader: input.isLeader ?? false,
    healthPercent: input.healthPercent === undefined ? 100 : input.healthPercent,
    manaPercent: input.manaPercent === undefined ? 100 : input.manaPercent,
    eligibleForSharedExp: input.eligibleForSharedExp ?? true,
  };
}

const PARTY: PartyState = {
  partyId: "00000000-0000-4000-8000-00000000000f",
  leaderId: OWN_PLAYER_ID,
  sharedExpActive: true,
  sharedExpStatus: "ok",
  members: [
    makeMember({
      id: OWN_PLAYER_ID,
      name: "Deceius",
      level: 34,
      vocation: "Knight",
      isLeader: true,
      healthPercent: 86,
      manaPercent: 40,
    }),
    makeMember({
      id: "00000000-0000-4000-8000-000000000003",
      name: "Avara Stormblade",
      level: 28,
      vocation: "Druid",
      healthPercent: 55,
      manaPercent: 91,
    }),
    makeMember({
      id: "00000000-0000-4000-8000-000000000004",
      name: "Nimbus",
      level: 25,
      vocation: "Paladin",
      healthPercent: null,
      manaPercent: null,
      eligibleForSharedExp: false,
    }),
  ],
  invited: [
    { id: "00000000-0000-4000-8000-000000000005", name: "Loriel" },
  ],
};

const meta = {
  title: "Game/PartyPanel",
  component: PartyPanel,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop relative h-dvh p-6 font-tibia">
        <Story />
      </div>
    ),
  ],
  args: {
    party: PARTY,
    ownPlayerId: OWN_PLAYER_ID,
    error: null,
    onInvite: fn(),
    onRevokeInvite: fn(),
    onKick: fn(),
    onPassLeadership: fn(),
    onSetSharedExp: fn(),
    onLeave: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof PartyPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AsLeader: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const sharedExperience = canvas.getByRole("checkbox", {
      name: "Shared experience",
    });

    await expect(sharedExperience).toBeChecked();
    await userEvent.click(sharedExperience);
    await expect(args.onSetSharedExp).toHaveBeenCalledWith(false);
  },
};

export const AsMember: Story = {
  args: {
    party: {
      ...PARTY,
      leaderId: LEADER_ID,
      members: [
        makeMember({
          id: LEADER_ID,
          name: "Avara Stormblade",
          level: 28,
          vocation: "Druid",
          isLeader: true,
        }),
        makeMember({
          id: OWN_PLAYER_ID,
          name: "Deceius",
          level: 34,
          vocation: "Knight",
          healthPercent: 86,
          manaPercent: 40,
        }),
      ],
      invited: [],
    },
  },
};

export const SharedExpBlocked: Story = {
  args: {
    party: { ...PARTY, sharedExpStatus: "too-far-away" },
  },
};

export const NoParty: Story = {
  args: { party: null },
};

export const WithError: Story = {
  args: { party: null, error: "A player with this name is not online." },
};
