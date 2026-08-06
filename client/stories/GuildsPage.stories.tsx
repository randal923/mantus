import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { PublicGuildsData } from "@tibia/protocol";
import { GuildsPage } from "../components/public-site/GuildsPage";

const SAMPLE_GUILDS: PublicGuildsData = {
  guilds: [
    {
      name: "Crimson Vanguard",
      motd: "Open PvP raids every weekend. Level 80+ fighters welcome.",
      level: 4,
      memberCount: 38,
      createdAt: "2026-05-11T18:20:00.000Z",
    },
    {
      name: "Moonlit Grove",
      motd: "A quiet home for druids and explorers of the deep wilds.",
      level: 2,
      memberCount: 17,
      createdAt: "2026-06-02T09:00:00.000Z",
    },
    {
      name: "Wardens of Mantus",
      motd: "",
      level: 1,
      memberCount: 5,
      createdAt: "2026-07-19T22:45:00.000Z",
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
    return new Response(JSON.stringify(SAMPLE_GUILDS), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
}) as typeof fetch;

const meta = {
  title: "GuildsPage",
  component: GuildsPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof GuildsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
