import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BestiaryMonsterSheet } from "../components/bestiary/BestiaryMonsterSheet";
import { WIKI_MONSTER } from "./wikiFixtures";

const meta = {
  title: "Game/Wiki/CreatureDetails",
  component: BestiaryMonsterSheet,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="ui-panel-frame max-w-5xl p-6"><Story /></div>],
  args: { monster: WIKI_MONSTER },
} satisfies Meta<typeof BestiaryMonsterSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompleteEntry: Story = {};
