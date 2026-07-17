import { z } from "zod";
import { PROTOCOL_LIMITS } from "./limits";
import { positionSchema } from "./position";

/**
 * Local speech modes. Ranges and outcomes are server-owned:
 * say reaches the standard view range, whisper reaches adjacent tiles
 * (farther viewers receive a redacted "pspsps"), yell reaches an extended
 * range and is uppercased by the server, behind a yell exhaust.
 */
export const CHAT_SPEECH_MODES = ["say", "whisper", "yell"] as const;
export const chatSpeechModeSchema = z.enum(CHAT_SPEECH_MODES);

/**
 * One line of player-authored chat. Control characters (including
 * newlines) are rejected outright; rendering layers must still treat the
 * value as plain text, never markup.
 */
export const chatTextSchema = z
  .string()
  .min(1)
  .max(PROTOCOL_LIMITS.maxChatTextLength)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\u0000-\u001F\u007F-\u009F]+$/u);

/**
 * Local speech intent. The speaker is always the session's own character;
 * there is deliberately no sender field to forge. Rate expectation: a few
 * per second at most, enforced server-side by the chat flood rules.
 */
export const speakMessageSchema = z
  .object({
    type: z.literal("speak"),
    mode: chatSpeechModeSchema,
    text: chatTextSchema,
  })
  .strict();

/**
 * Private message to one online character, addressed by display name.
 * The name is a reference the server resolves; it is never authority and
 * the sender learns nothing beyond online/offline from the outcome.
 */
export const privateChatMessageSchema = z
  .object({
    type: z.literal("private-chat"),
    to: z
      .string()
      .min(PROTOCOL_LIMITS.minCharacterNameLength)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
    text: chatTextSchema,
  })
  .strict();

/** Local speech from a creature the receiving client can already see. */
export const creatureSpokeMessageSchema = z.object({
  type: z.literal("creature-spoke"),
  creatureId: z.string().min(1).max(192),
  name: z.string().min(1).max(100),
  mode: chatSpeechModeSchema,
  position: positionSchema,
  text: chatTextSchema,
});

/**
 * One leg of a delivered private message. `counterpart` is the other
 * party's display name; the sender receives the outgoing echo only after
 * the server accepted the message.
 */
export const privateChatDeliveredMessageSchema = z.object({
  type: z.literal("private-chat-delivered"),
  direction: z.enum(["incoming", "outgoing"]),
  counterpart: z
    .string()
    .min(1)
    .max(PROTOCOL_LIMITS.maxCharacterNameLength),
  text: chatTextSchema,
});

export const chatRejectedReasonSchema = z.enum([
  "muted",
  "yell-exhausted",
  "level-too-low",
  "recipient-offline",
]);

/** Why the last chat intent was dropped; carries no third-party details. */
export const chatRejectedMessageSchema = z.object({
  type: z.literal("chat-rejected"),
  reason: chatRejectedReasonSchema,
  retryAfterMs: z.number().int().min(0).max(3_600_000).optional(),
});

export type ChatSpeechMode = z.infer<typeof chatSpeechModeSchema>;
export type SpeakMessage = z.infer<typeof speakMessageSchema>;
export type PrivateChatMessage = z.infer<typeof privateChatMessageSchema>;
export type CreatureSpokeMessage = z.infer<typeof creatureSpokeMessageSchema>;
export type PrivateChatDeliveredMessage = z.infer<
  typeof privateChatDeliveredMessageSchema
>;
export type ChatRejectedReason = z.infer<typeof chatRejectedReasonSchema>;
export type ChatRejectedMessage = z.infer<typeof chatRejectedMessageSchema>;
