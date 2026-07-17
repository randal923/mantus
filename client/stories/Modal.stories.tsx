import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";

const meta = {
  title: "Modal",
  component: Modal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    onClose: fn(),
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    title: "Server Message",
    children: "Your account will be banished for 7 days if you continue to push other players into fields.",
  },
};

export const WithFooter: Story = {
  args: {
    title: "Delete Character",
    children: "Do you really want to delete the character Gandalf? This cannot be undone.",
    footer: (
      <>
        <Button>Cancel</Button>
        <Button variant="danger">Delete</Button>
      </>
    ),
  },
};

export const WithInput: Story = {
  args: {
    title: "Create Character",
    children: <Input label="Name" placeholder="Character name" />,
    footer: (
      <>
        <Button>Cancel</Button>
        <Button variant="primary">Create</Button>
      </>
    ),
  },
};
