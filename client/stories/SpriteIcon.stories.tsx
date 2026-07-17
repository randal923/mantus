import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SpriteIcon } from "../components/inventory/SpriteIcon";

const meta = {
  title: "SpriteIcon",
  component: SpriteIcon,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-panel-frame p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SpriteIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sabre: Story = {
  args: { spriteId: 7742 },
};

export const GoldCoin: Story = {
  args: { spriteId: 7384 },
};

export const Backpack: Story = {
  args: { spriteId: 7137 },
};

export const NativeSize: Story = {
  args: { spriteId: 7742, scale: 1 },
};

export const Large: Story = {
  args: { spriteId: 7742, scale: 4 },
};
