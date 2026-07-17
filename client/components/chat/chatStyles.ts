import type { ChatChannelKind, ChatMessageTone } from "./chatTypes";

export const CHAT_CHANNEL_MARK: Record<ChatChannelKind, string> = {
  world: "◆",
  whisper: "@",
  guild: "⚔",
  system: "•",
};

export const CHAT_CHANNEL_DOT_CLASS: Record<ChatChannelKind, string> = {
  world: "bg-sky-400 text-sky-400",
  whisper: "bg-violet-400 text-violet-400",
  guild: "bg-emerald-400 text-emerald-400",
  system: "bg-ui-gold text-ui-gold",
};

export const CHAT_CHANNEL_TEXT_CLASS: Record<ChatChannelKind, string> = {
  world: "text-sky-400",
  whisper: "text-violet-400",
  guild: "text-emerald-400",
  system: "text-ui-gold",
};

export const CHAT_ACTIVE_TAB_CLASS: Record<ChatChannelKind, string> = {
  world: "border-sky-400/70 bg-sky-950/35 text-sky-100",
  whisper: "border-violet-400/70 bg-violet-950/35 text-violet-100",
  guild: "border-emerald-400/70 bg-emerald-950/35 text-emerald-100",
  system: "border-ui-gold/70 bg-ui-gold/10 text-ui-text-bright",
};

export const CHAT_MESSAGE_CLASS: Record<ChatMessageTone, string> = {
  default: "text-ui-text",
  muted: "text-ui-muted",
  notice: "text-ui-gold",
  combat: "text-red-300",
  loot: "text-amber-300",
};
