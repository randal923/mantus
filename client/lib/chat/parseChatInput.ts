import type { ChatSpeechMode } from "@tibia/protocol";
import { sanitizeChatText } from "./sanitizeChatText";

const MODE_PREFIXES: Readonly<Record<string, ChatSpeechMode>> = {
  "#s": "say",
  "#w": "whisper",
  "#y": "yell",
};

/**
 * Maps one composer line to a speech mode using Tibia-style prefixes
 * (#s say, #w whisper, #y yell). Purely client-side sugar; the server
 * enforces every mode rule regardless of what was parsed here.
 */
export function parseChatInput(raw: string): {
  mode: ChatSpeechMode;
  text: string;
} {
  const cleaned = sanitizeChatText(raw);
  const prefix = cleaned.slice(0, 2).toLowerCase();
  const mode = MODE_PREFIXES[prefix];
  if (mode && (cleaned.length === 2 || cleaned[2] === " ")) {
    return { mode, text: cleaned.slice(2).trim() };
  }
  return { mode: "say", text: cleaned };
}
