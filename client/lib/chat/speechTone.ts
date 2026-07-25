import type { ChatMessageTone } from "../../components/chat/chatTypes";
import type { ChatEntry } from "./chatReducer";

type SpeechEntry = Extract<ChatEntry, { kind: "speech" }>;

/** Colors one speech line: server-authored effect lines read as monster say. */
export function speechTone(entry: SpeechEntry): ChatMessageTone {
  if (entry.mode === "monster-say") return "monster";
  return entry.highlighted ? "loot" : "default";
}
