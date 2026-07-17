import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ProgressionBar } from "../components/inventory/ProgressionBar";

const meta = {
  title: "ProgressionBar",
  component: ProgressionBar,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-panel-frame w-80 p-4 font-tibia">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProgressionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Experience: Story = {
  args: {
    label: "Experience",
    value: 62_000,
    max: 140_000,
    valueLabel: "62,000 / 140,000",
  },
};

export const MagicLevel: Story = {
  args: {
    label: "Magic Level · 8",
    value: 2_100,
    max: 4_800,
    valueLabel: "2,100 / 4,800",
    fillClassName: "from-ui-mana-light to-ui-mana",
  },
};

export const Skill: Story = {
  args: {
    label: "Sword · 61",
    value: 3_820,
    max: 6_456,
    valueLabel: "3,820 / 6,456",
    fillClassName: "from-ui-accent-light to-ui-accent",
  },
};

export const Maxed: Story = {
  args: {
    label: "Fishing · 200",
    value: 0,
    max: 0,
    valueLabel: "Maximum",
  },
};
