import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { ChatPanel } from "../components/chat/ChatPanel";
import type { ChatChannel } from "../components/chat/chatTypes";

const CHANNELS: ReadonlyArray<ChatChannel> = [
  {
    id: "world",
    label: "World",
    kind: "world",
    description: "Realm-wide · 1,284 adventurers online",
    canSend: true,
    messages: [
      {
        id: "world:1",
        time: "18:41",
        tone: "notice",
        body: "Welcome to Mantus. Trade fairly and travel safely.",
      },
      {
        id: "world:2",
        time: "18:42",
        sender: "Rowan Blackthorn",
        body: "Anyone heading into the Ashen Crypt?",
      },
      {
        id: "world:3",
        time: "18:42",
        sender: "Meryl Dawnwhisper",
        body: "I can heal. Meet by the eastern gate.",
        isOwn: true,
      },
      {
        id: "world:4",
        time: "18:43",
        sender: "Cassian Vale",
        body: "Selling a fire sword — whisper me.",
      },
    ],
  },
  {
    id: "guild",
    label: "Guild",
    kind: "guild",
    description: "Iron Ravens · 12 members online",
    canSend: true,
    closable: true,
    unreadCount: 3,
    messages: [
      {
        id: "guild:1",
        time: "18:38",
        sender: "Aldren",
        body: "Guild hunt starts in twenty minutes.",
      },
      {
        id: "guild:2",
        time: "18:39",
        sender: "Sable",
        body: "Runes and supplies are in the hall depot.",
      },
    ],
  },
  {
    id: "whisper:aria",
    label: "Aria Vale",
    kind: "whisper",
    description: "Private conversation · Online",
    canSend: true,
    closable: true,
    unreadCount: 1,
    messages: [
      {
        id: "whisper:1",
        time: "18:40",
        sender: "Aria Vale",
        body: "Found the old map. I will show you after the hunt.",
      },
    ],
  },
  {
    id: "system",
    label: "System",
    kind: "system",
    description: "Combat, loot, and server notices",
    canSend: false,
    messages: [
      {
        id: "system:1",
        time: "18:37",
        tone: "combat",
        body: "Dragon: 82 fire damage.",
      },
      {
        id: "system:2",
        time: "18:37",
        tone: "loot",
        body: "Loot: 4 platinum coins, dragon ham.",
      },
      {
        id: "system:3",
        time: "18:38",
        tone: "notice",
        body: "You gained 700 experience.",
      },
    ],
  },
];

const meta = {
  title: "ChatPanel",
  component: ChatPanel,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop relative flex min-h-dvh items-end p-4">
        <div
          aria-hidden
          className="absolute inset-0 bg-radial from-ui-stone/10 to-transparent"
        />
        <div className="relative">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    channels: CHANNELS,
    initialChannelId: "world",
    pinnedOpen: false,
    onChannelSelect: fn(),
    onChannelClose: fn(),
    onSenderSelect: fn(),
    onSend: fn(),
    onPinnedOpenChange: fn(),
  },
} satisfies Meta<typeof ChatPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllChannels: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: /Guild/ }));
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message Guild" }),
      "Ready at the eastern gate",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Send message" }),
    );

    await expect(args.onChannelSelect).toHaveBeenCalledWith("guild");
    await expect(args.onSend).toHaveBeenCalledWith(
      "guild",
      "Ready at the eastern gate",
    );
  },
};

export const ClosedWithUnread: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const pinButton = canvas.getByRole("button", {
      name: "Keep chat open",
    });
    const content = canvasElement.ownerDocument.getElementById(
      pinButton.getAttribute("aria-controls") ?? "",
    );

    await expect(content).toHaveAttribute("aria-hidden", "true");
    await userEvent.hover(pinButton);
    await expect(content).toHaveAttribute("aria-hidden", "false");
    await userEvent.unhover(pinButton);
    await expect(content).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(pinButton);
    await expect(args.onPinnedOpenChange).toHaveBeenCalledWith(true);
  },
};

export const EnterReturnsFocusToGame: Story = {
  args: {
    channels: [CHANNELS[0]],
    pinnedOpen: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Message World" });

    await userEvent.click(input);
    await expect(input).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(input).not.toHaveFocus();
  },
};

export const EnterDoesNotOpenBehindModal: Story = {
  args: {
    channels: [CHANNELS[0]],
    pinnedOpen: true,
  },
  decorators: [
    (Story) => (
      <>
        <Story />
        <div role="dialog" aria-modal="true" aria-label="Example modal" />
      </>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Message World" });

    await userEvent.keyboard("{Enter}");
    await expect(input).not.toHaveFocus();
  },
};

export const EmptyWhisper: Story = {
  args: {
    channels: [
      {
        id: "whisper:new",
        label: "New whisper",
        kind: "whisper",
        description: "Private conversation",
        canSend: true,
        messages: [],
      },
    ],
  },
};

export const OpenPrivateConversation: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Start private conversation" }),
    );
    const chat = canvas.getByRole("region", { name: "Game chat" });
    const playerNameInput = canvas.getByRole("textbox", {
      name: "Player name",
    });
    const playerNamePanel = playerNameInput.closest("form");
    await expect(playerNamePanel).not.toBeNull();
    await expect(
      Math.abs(
        (playerNamePanel?.getBoundingClientRect().bottom ?? 0) -
          chat.getBoundingClientRect().top,
      ),
    ).toBeLessThanOrEqual(1);
    await expect(playerNameInput).toHaveAttribute(
      "data-1p-ignore",
      "true",
    );
    await userEvent.type(playerNameInput, "Cassian Vale");
    await userEvent.click(
      canvas.getByRole("button", { name: "Open private conversation" }),
    );

    await expect(args.onSenderSelect).toHaveBeenCalledWith("Cassian Vale");
  },
};

export const CloseConversation: Story = {
  args: {
    initialChannelId: "whisper:aria",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.queryByRole("button", { name: "Close World" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Close System" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Close Aria Vale" }),
    );

    await expect(args.onChannelClose).toHaveBeenCalledWith("whisper:aria");
  },
};

export const PlayerTextIsInert: Story = {
  args: {
    channels: [
      {
        id: "world",
        label: "World",
        kind: "world",
        canSend: true,
        messages: [
          {
            id: "world:unsafe-looking",
            sender: "Curious Rogue",
            body: '<script>alert("not executable")</script>',
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('<script>alert("not executable")</script>'),
    ).toBeInTheDocument();
  },
};
