import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EffectArtwork } from "../components/spells/EffectArtwork";
import { SPELL_ARTWORK_BY_EFFECT } from "../components/spells/spellArtwork";

const meta = {
  title: "EffectArtwork",
  component: EffectArtwork,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="flex size-16 items-center justify-center overflow-hidden rounded-md border border-ui-accent-light/35 bg-ui-accent-deep/55 shadow-inner shadow-black/60">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EffectArtwork>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleTile: Story = {
  args: { ...SPELL_ARTWORK_BY_EFFECT[1] },
};

export const TwoByTwo: Story = {
  args: { ...SPELL_ARTWORK_BY_EFFECT[7] },
};

export const Wide: Story = {
  args: { ...SPELL_ARTWORK_BY_EFFECT[39] },
};

export const Tall: Story = {
  args: { ...SPELL_ARTWORK_BY_EFFECT[40] },
};

export const WithEmptyTile: Story = {
  args: { ...SPELL_ARTWORK_BY_EFFECT[45] },
};

export const Enlarged: Story = {
  args: { ...SPELL_ARTWORK_BY_EFFECT[7], size: 64 },
};
