import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { WikiBosstiary } from "../components/wiki/WikiBosstiary";
import { WIKI_BOSS, WIKI_BOSSES } from "./wikiFixtures";

const meta = {
  title: "Game/Wiki/Bosstiary",
  component: WikiBosstiary,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="ui-panel-frame p-6"><Story /></div>],
  args: {
    bosses: WIKI_BOSSES,
    boss: WIKI_BOSS,
    pending: false,
    error: null,
    onRequestBoss: fn(),
  },
} satisfies Meta<typeof WikiBosstiary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bosses: Story = {};

export const BossDetails: Story = {
  args: { initialRaceId: WIKI_BOSS.raceId },
};

export const Empty: Story = {
  args: {
    bosses: { type: "bosstiary-state", bossPoints: 0, entries: [] },
  },
};
