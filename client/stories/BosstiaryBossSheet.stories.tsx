import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BosstiaryBossSheet } from "../components/bestiary/BosstiaryBossSheet";
import { WIKI_BOSS } from "./wikiFixtures";

const meta = {
  title: "Game/Wiki/BossDetails",
  component: BosstiaryBossSheet,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="ui-panel-frame max-w-7xl p-6">
        <Story />
      </div>
    ),
  ],
  args: { boss: WIKI_BOSS },
} satisfies Meta<typeof BosstiaryBossSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Details: Story = {};
