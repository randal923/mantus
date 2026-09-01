import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Spinner } from "../components/ui/Spinner";
import { Button } from "../components/ui/Button";

const meta = {
  title: "Spinner",
  component: Spinner,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop flex items-center gap-8 rounded-xl p-10 text-ui-text-bright">
        <Story />
      </div>
    ),
  ],
  args: { className: "size-12" },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Large: Story = {};

export const Sizes: Story = {
  render: () => (
    <>
      <Spinner className="size-3.5" />
      <Spinner className="size-6" />
      <Spinner className="size-10" />
      <Spinner className="size-16" />
    </>
  ),
};

export const InButtons: Story = {
  render: () => (
    <>
      <Button variant="primary" busy>
        Entering
      </Button>
      <Button busy>Creating</Button>
      <Button variant="danger" busy>
        Deleting
      </Button>
    </>
  ),
};
