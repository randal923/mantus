import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Input } from "../components/ui/Input";

const meta = {
  title: "Game/Input",
  component: Input,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop w-72 p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    label: "Name",
    placeholder: "Character name",
  },
};

export const Filled: Story = {
  args: {
    label: "Name",
    defaultValue: "Gandalf",
  },
};

export const NoLabel: Story = {
  args: {
    placeholder: "Search…",
  },
};

export const Password: Story = {
  args: {
    label: "Password",
    type: "password",
    defaultValue: "hunter2",
  },
};

export const Disabled: Story = {
  args: {
    label: "Name",
    defaultValue: "Gandalf",
    disabled: true,
  },
};
