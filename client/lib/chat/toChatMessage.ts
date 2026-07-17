import type { TFunction } from "i18next";
import type { ChatMessage } from "../../components/chat/chatTypes";
import type { ChatEntry } from "./chatReducer";

/** Localizes one stored chat entry for the ChatPanel; text stays text. */
export function toChatMessage(entry: ChatEntry, t: TFunction): ChatMessage {
  if (entry.kind === "notice") {
    return {
      id: `entry:${entry.id}`,
      body: t(`chat.rejected.${entry.reason}`, {
        seconds: Math.ceil((entry.retryAfterMs ?? 0) / 1000),
      }),
      time: entry.time,
      tone: "notice",
    };
  }
  return {
    id: `entry:${entry.id}`,
    body: entry.body,
    time: entry.time,
    tone: "default",
    ...(entry.sender ? { sender: entry.sender } : {}),
    ...(entry.isOwn ? { isOwn: true } : {}),
  };
}
