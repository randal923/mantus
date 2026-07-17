import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { MantusLogo } from "../components/ui/MantusLogo";

const meta = {
  title: "MantusLogo",
  component: MantusLogo,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop p-12">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MantusLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
