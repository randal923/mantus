import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { PublicGuildProfileData } from "@tibia/protocol";
import { GuildProfilePage } from "../components/public-site/GuildProfilePage";

const SAMPLE_GUILD: PublicGuildProfileData = {
  name: "Crimson Vanguard",
  motd: "Open PvP raids every weekend. Level 80+ fighters welcome.",
  level: 4,
  createdAt: "2026-05-11T18:20:00.000Z",
  membersOnline: 3,
  members: [
    {
      name: "Aster Blackmane",
      nick: "Iron Wall",
      rankName: "Warlord",
      rankLevel: 3,
      vocation: "Elite Knight",
      level: 214,
      joinedAt: "2026-05-11T18:20:00.000Z",
      online: true,
    },
    {
      name: "Briar Thornsong",
      nick: "",
      rankName: "Captain",
      rankLevel: 2,
      vocation: "Royal Paladin",
      level: 187,
      joinedAt: "2026-05-12T10:05:00.000Z",
      online: false,
    },
    {
      name: "Cinder Vex",
      nick: "The Torch",
      rankName: "Captain",
      rankLevel: 2,
      vocation: "Master Sorcerer",
      level: 173,
      joinedAt: "2026-05-20T21:40:00.000Z",
      online: true,
    },
    {
      name: "Dorian Ashfall",
      nick: "",
      rankName: "Raider",
      rankLevel: 1,
      vocation: "Elder Druid",
      level: 142,
      joinedAt: "2026-06-01T14:00:00.000Z",
      online: false,
    },
    {
      name: "Elowen Frost",
      nick: "",
      rankName: "Raider",
      rankLevel: 1,
      vocation: "Druid",
      level: 96,
      joinedAt: "2026-06-18T19:30:00.000Z",
      online: true,
    },
    {
      name: "Fenrik Stonejaw",
      nick: "Pup",
      rankName: "Raider",
      rankLevel: 1,
      vocation: "Knight",
      level: 61,
      joinedAt: "2026-07-22T08:15:00.000Z",
      online: false,
    },
  ],
  generatedAt: "2026-08-05T12:00:00.000Z",
};

// Serve the guild endpoint from the fixture; every other request (sprites,
// atlas) still goes to the network.
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (url.includes("/api/public/guilds")) {
    return new Response(JSON.stringify(SAMPLE_GUILD), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
}) as typeof fetch;

const meta = {
  title: "GuildProfilePage",
  component: GuildProfilePage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof GuildProfilePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { name: "Crimson Vanguard" },
};
