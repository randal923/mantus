import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { PartyInvitationToast } from "../components/party/PartyInvitationToast";

const meta = {
  title: "Game/PartyInvitationToast",
  component: PartyInvitationToast,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop p-8 font-tibia">
        <Story />
      </div>
    ),
  ],
  args: {
    leaderName: "Avara Stormblade",
    onAccept: fn(),
    onDecline: fn(),
  },
} satisfies Meta<typeof PartyInvitationToast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
