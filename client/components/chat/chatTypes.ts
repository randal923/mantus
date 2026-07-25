export type ChatChannelKind =
  | "world"
  | "whisper"
  | "guild"
  | "party"
  /** A server-registered public channel (Help, Trade, Game Chat). */
  | "public"
  | "system";

export type ChatMessageTone =
  | "default"
  | "muted"
  | "notice"
  | "combat"
  | "loot"
  | "monster";

export interface ChatMessage {
  id: string;
  body: string;
  sender?: string;
  time?: string;
  tone?: ChatMessageTone;
  isOwn?: boolean;
}

export interface ChatChannel {
  id: string;
  label: string;
  kind: ChatChannelKind;
  description?: string;
  canSend: boolean;
  closable?: boolean;
  unreadCount?: number;
  messages: ReadonlyArray<ChatMessage>;
}
