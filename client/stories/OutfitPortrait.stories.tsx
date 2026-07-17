import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { OutfitPortrait } from "../components/characters/OutfitPortrait";

const meta = {
  title: "OutfitPortrait",
  component: OutfitPortrait,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop flex items-center justify-center rounded-xl p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OutfitPortrait>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CitizenMale: Story = {
  args: {
    outfit: { lookType: 128, head: 78, body: 68, legs: 58, feet: 76, addons: 0 },
  },
};

export const CitizenFemale: Story = {
  args: {
    outfit: { lookType: 136, head: 78, body: 68, legs: 58, feet: 76, addons: 0 },
  },
};

export const Large: Story = {
  args: {
    outfit: { lookType: 128, head: 114, body: 94, legs: 78, feet: 79, addons: 0 },
    scale: 4,
  },
};
