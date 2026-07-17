import type { ChatRejectedReason, ChatSpeechMode } from "@tibia/protocol";

export type ChatEntry =
  | {
      id: number;
      kind: "speech";
      sender: string;
      body: string;
      time: string;
      isOwn: boolean;
    }
  | {
      id: number;
      kind: "notice";
      reason: ChatRejectedReason;
      retryAfterMs?: number;
      time: string;
    };

export interface ChatChannelState {
  id: string;
  kind: "world" | "whisper";
  counterpart?: string;
  unreadCount: number;
  entries: ReadonlyArray<ChatEntry>;
}

export interface ChatState {
  ownPlayerId: string | null;
  ownName: string | null;
  activeChannelId: string;
  nextEntryId: number;
  channels: ReadonlyArray<ChatChannelState>;
}

export type ChatAction =
  | { type: "reset"; ownPlayerId: string | null; ownName: string | null }
  | {
      type: "spoke";
      creatureId: string;
      name: string;
      mode: ChatSpeechMode;
      body: string;
      time: string;
    }
  | {
      type: "private";
      direction: "incoming" | "outgoing";
      counterpart: string;
      body: string;
      time: string;
    }
  | {
      type: "rejected";
      reason: ChatRejectedReason;
      retryAfterMs?: number;
      time: string;
    }
  | { type: "select"; channelId: string }
  | { type: "close"; channelId: string }
  | { type: "open-private"; counterpart: string };

export const LOCAL_CHANNEL_ID = "local";
export const SYSTEM_CHANNEL_ID = "system";
const CHANNEL_HISTORY_LIMIT = 200;
const MAX_PRIVATE_CHANNELS = 10;

const localChannel: ChatChannelState = {
  id: LOCAL_CHANNEL_ID,
  kind: "world",
  unreadCount: 0,
  entries: [],
};

export const initialChatState: ChatState = {
  ownPlayerId: null,
  ownName: null,
  activeChannelId: LOCAL_CHANNEL_ID,
  nextEntryId: 1,
  channels: [localChannel],
};

export function privateChannelId(counterpart: string): string {
  return `private:${counterpart.toLowerCase()}`;
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "reset":
      return {
        ...initialChatState,
        ownPlayerId: action.ownPlayerId,
        ownName: action.ownName,
      };
    case "select": {
      if (state.activeChannelId === action.channelId) return state;
      return {
        ...state,
        activeChannelId: action.channelId,
        channels: state.channels.map((channel) =>
          channel.id === action.channelId && channel.unreadCount > 0
            ? { ...channel, unreadCount: 0 }
            : channel,
        ),
      };
    }
    case "close": {
      const channelIndex = state.channels.findIndex(
        (channel) =>
          channel.id === action.channelId && channel.kind === "whisper",
      );
      if (channelIndex === -1) return state;
      const channels = state.channels.filter(
        (channel) => channel.id !== action.channelId,
      );
      if (state.activeChannelId !== action.channelId) {
        return { ...state, channels };
      }
      return {
        ...state,
        activeChannelId:
          channels[Math.min(channelIndex, channels.length - 1)]?.id ??
          LOCAL_CHANNEL_ID,
        channels,
      };
    }
    case "spoke": {
      const entry: ChatEntry = {
        id: state.nextEntryId,
        kind: "speech",
        sender: action.name,
        body: action.body,
        time: action.time,
        isOwn: action.creatureId === state.ownPlayerId,
      };
      return appendEntry(
        { ...state, nextEntryId: state.nextEntryId + 1 },
        LOCAL_CHANNEL_ID,
        entry,
      );
    }
    case "private": {
      const channelId = privateChannelId(action.counterpart);
      const entry: ChatEntry = {
        id: state.nextEntryId,
        kind: "speech",
        sender:
          action.direction === "incoming"
            ? action.counterpart
            : (state.ownName ?? ""),
        body: action.body,
        time: action.time,
        isOwn: action.direction === "outgoing",
      };
      const withChannel = ensurePrivateChannel(
        { ...state, nextEntryId: state.nextEntryId + 1 },
        channelId,
        action.counterpart,
      );
      return appendEntry(withChannel, channelId, entry);
    }
    case "rejected": {
      const entry: ChatEntry = {
        id: state.nextEntryId,
        kind: "notice",
        reason: action.reason,
        time: action.time,
        ...(action.retryAfterMs === undefined
          ? {}
          : { retryAfterMs: action.retryAfterMs }),
      };
      const targetId = state.channels.some(
        (channel) => channel.id === state.activeChannelId,
      )
        ? state.activeChannelId
        : LOCAL_CHANNEL_ID;
      return appendEntry(
        { ...state, nextEntryId: state.nextEntryId + 1 },
        targetId,
        entry,
        { countUnread: false },
      );
    }
    case "open-private": {
      const channelId = privateChannelId(action.counterpart);
      const withChannel = ensurePrivateChannel(
        state,
        channelId,
        action.counterpart,
      );
      return chatReducer(withChannel, { type: "select", channelId });
    }
  }
}

function appendEntry(
  state: ChatState,
  channelId: string,
  entry: ChatEntry,
  options: { countUnread: boolean } = { countUnread: true },
): ChatState {
  return {
    ...state,
    channels: state.channels.map((channel) => {
      if (channel.id !== channelId) return channel;
      const isActive = state.activeChannelId === channelId;
      return {
        ...channel,
        unreadCount:
          isActive || !options.countUnread
            ? channel.unreadCount
            : channel.unreadCount + 1,
        entries: [...channel.entries, entry].slice(-CHANNEL_HISTORY_LIMIT),
      };
    }),
  };
}

function ensurePrivateChannel(
  state: ChatState,
  channelId: string,
  counterpart: string,
): ChatState {
  if (state.channels.some((channel) => channel.id === channelId)) return state;
  const privates = state.channels.filter((channel) =>
    channel.id.startsWith("private:"),
  );
  let channels = state.channels;
  if (privates.length >= MAX_PRIVATE_CHANNELS) {
    const removable = privates.find(
      (channel) => channel.id !== state.activeChannelId,
    );
    if (removable) {
      channels = channels.filter((channel) => channel.id !== removable.id);
    }
  }
  return {
    ...state,
    channels: [
      ...channels,
      {
        id: channelId,
        kind: "whisper",
        counterpart,
        unreadCount: 0,
        entries: [],
      },
    ],
  };
}
