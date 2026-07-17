import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ItemAffixLine } from "../components/inventory/ItemAffixLine";

const meta = {
  title: "ItemAffixLine",
  component: ItemAffixLine,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-panel-frame w-72 p-4 font-tibia">
        <ul className="space-y-1">
          <Story />
        </ul>
      </div>
    ),
  ],
} satisfies Meta<typeof ItemAffixLine>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    affix: { text: "Atk: 12, Def: 5" },
  },
};

export const LongText: Story = {
  args: {
    affix: {
      text: "Protection: physical +5%, fire +3%, energy +3%, death -2%",
    },
  },
};

export const Multiple: Story = {
  args: {
    affix: { text: "Atk: 12, Def: 5" },
  },
  render: () => (
    <>
      <ItemAffixLine affix={{ text: "Atk: 12, Def: 5" }} />
      <ItemAffixLine affix={{ text: "Sword fighting +2" }} />
      <ItemAffixLine affix={{ text: "Faster regeneration" }} />
    </>
  ),
};
