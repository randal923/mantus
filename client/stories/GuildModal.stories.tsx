import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { GuildState } from "@tibia/protocol";
import { GuildModal } from "../components/guild/GuildModal";

const OWN_PLAYER_ID = "00000000-0000-4000-8000-000000000001";
const VICE_ID = "00000000-0000-4000-8000-000000000002";
const MEMBER_ID = "00000000-0000-4000-8000-000000000003";
const GUILD_ID = "00000000-0000-4000-8000-00000000000f";

const RANKS: GuildState["ranks"] = [
  { level: 3, name: "The Leader" },
  { level: 2, name: "Vice-Leader" },
  { level: 1, name: "Member" },
];

const MEMBERS: GuildState["members"] = [
  {
    characterId: OWN_PLAYER_ID,
    name: "Deceius",
    rankLevel: 3,
    nick: "Founder",
    online: true,
  },
  {
    characterId: VICE_ID,
    name: "Mirella",
    rankLevel: 2,
    nick: "",
    online: true,
  },
  {
    characterId: MEMBER_ID,
    name: "Thorgal",
    rankLevel: 1,
    nick: "the Quiet",
    online: false,
  },
];

const WARS: GuildState["wars"] = [
  {
    warId: "00000000-0000-4000-8000-0000000000aa",
    enemyGuildName: "Crimson Blades",
    status: "active",
    fragLimit: 25,
    myKills: 7,
    enemyKills: 11,
    initiatedByUs: true,
  },
  {
    warId: "00000000-0000-4000-8000-0000000000ab",
    enemyGuildName: "Night Watch",
    status: "pending",
    fragLimit: 10,
    myKills: 0,
    enemyKills: 0,
    initiatedByUs: false,
  },
];

const LEADER_GUILD: GuildState = {
  id: GUILD_ID,
  name: "Iron Pact",
  motd: "Rally at the depot before the hunt on Saturday.",
  myRankLevel: 3,
  ranks: RANKS,
  members: MEMBERS,
  invites: [
    { characterId: "00000000-0000-4000-8000-000000000004", name: "Elyra" },
  ],
  wars: WARS,
};

const MEMBER_GUILD: GuildState = {
  ...LEADER_GUILD,
  myRankLevel: 1,
  members: MEMBERS.map((member) =>
    member.characterId === OWN_PLAYER_ID
      ? { ...member, rankLevel: 1 }
      : member.characterId === VICE_ID
        ? { ...member, rankLevel: 3 }
        : member,
  ),
};
delete (MEMBER_GUILD as { invites?: unknown }).invites;

const handlers = {
  onClose: fn(),
  onCreate: fn(),
  onRespondInvitation: fn(),
  onInvite: fn(),
  onRevokeInvite: fn(),
  onKick: fn(),
  onPromote: fn(),
  onDemote: fn(),
  onSetNick: fn(),
  onSetMotd: fn(),
  onSetRankName: fn(),
  onPassLeadership: fn(),
  onDisband: fn(),
  onLeave: fn(),
  onDeclareWar: fn(),
  onRespondWar: fn(),
  onEndWar: fn(),
};

const meta = {
  title: "Game/GuildModal",
  component: GuildModal,
  parameters: { layout: "fullscreen" },
  args: {
    ownPlayerId: OWN_PLAYER_ID,
    error: null,
    ...handlers,
  },
} satisfies Meta<typeof GuildModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoGuild: Story = {
  args: {
    session: {
      guild: null,
      invitations: [
        {
          guildId: GUILD_ID,
          guildName: "Iron Pact",
          inviterName: "Mirella",
        },
      ],
      pending: false,
      error: null,
    },
  },
};

export const MemberView: Story = {
  args: {
    session: {
      guild: MEMBER_GUILD,
      invitations: [],
      pending: false,
      error: null,
    },
  },
};

export const LeaderView: Story = {
  args: {
    session: {
      guild: LEADER_GUILD,
      invitations: [],
      pending: false,
      error: null,
    },
  },
};

export const WithError: Story = {
  args: {
    session: {
      guild: LEADER_GUILD,
      invitations: [],
      pending: false,
      error: "name-taken",
    },
    error: "This guild name is already taken.",
  },
};
