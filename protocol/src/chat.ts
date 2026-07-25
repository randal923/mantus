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
 * Everything a creature can be heard saying. `monster-say` is the
 * server-authored effect line (Canary's `TALKTYPE_MONSTER_SAY`, e.g. the
 * `Aaaah...` a potion drinker lets out); `magic` is the words of a spell the
 * server actually cast (Canary's emote-spell talk type). Players cannot
 * request either — the speak intent stays restricted to
 * {@link chatSpeechModeSchema}, and the server decides which mode a line
 * carries.
 */
export const CREATURE_SPEECH_MODES = [
  ...CHAT_SPEECH_MODES,
  "monster-say",
  "magic",
] as const;
export const creatureSpeechModeSchema = z.enum(CREATURE_SPEECH_MODES);

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
  mode: creatureSpeechModeSchema,
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

/**
 * Public chat channels. Ids are references the server resolves against its own
 * registry — never authority over who receives a line. Guild and party chat
 * are deliberately absent: they ship as their own intents with their own
 * membership checks.
 */
export const CHAT_CHANNEL_IDS = ["help", "game-chat", "trade"] as const;
export const chatChannelIdSchema = z.enum(CHAT_CHANNEL_IDS);

/** Asks for the channels this character may open. Fixed size, no payload. */
export const channelListGetMessageSchema = z
  .object({ type: z.literal("channel-list-get") })
  .strict();

/** Opens a channel for this session; membership is re-checked on every line. */
export const channelOpenMessageSchema = z
  .object({
    type: z.literal("channel-open"),
    channelId: chatChannelIdSchema,
  })
  .strict();

export const channelCloseMessageSchema = z
  .object({
    type: z.literal("channel-close"),
    channelId: chatChannelIdSchema,
  })
  .strict();

/**
 * One line into a public channel. The speaker is always the session's own
 * character; the channel id only selects a registered channel. Rate
 * expectation: a few per second at most, on the shared chat flood budget.
 */
export const channelSpeakMessageSchema = z
  .object({
    type: z.literal("channel-speak"),
    channelId: chatChannelIdSchema,
    text: chatTextSchema,
  })
  .strict();

/** Adds a character name to this session's ignore list. */
export const ignoreAddMessageSchema = z
  .object({
    type: z.literal("ignore-add"),
    name: z
      .string()
      .min(PROTOCOL_LIMITS.minCharacterNameLength)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
  })
  .strict();

export const ignoreRemoveMessageSchema = z
  .object({
    type: z.literal("ignore-remove"),
    name: z
      .string()
      .min(PROTOCOL_LIMITS.minCharacterNameLength)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
  })
  .strict();

/** The channels this character may open, with their current open state. */
export const channelListMessageSchema = z.object({
  type: z.literal("channel-list"),
  channels: z
    .array(
      z
        .object({
          id: chatChannelIdSchema,
          label: z.string().min(1).max(40),
          open: z.boolean(),
        })
        .strict(),
    )
    .max(CHAT_CHANNEL_IDS.length),
});

/** One delivered channel line; fans out only to current subscribers. */
export const channelMessageSchema = z.object({
  type: z.literal("channel-message"),
  channelId: chatChannelIdSchema,
  speakerId: z.string().min(1).max(192),
  speakerName: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
  text: chatTextSchema,
});

export const channelClosedMessageSchema = z.object({
  type: z.literal("channel-closed"),
  channelId: chatChannelIdSchema,
});

/** This session's ignore list, echoed after every accepted change. */
export const ignoreListMessageSchema = z.object({
  type: z.literal("ignore-list"),
  names: z
    .array(z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength))
    .max(100),
});

/**
 * A server-authored line addressed to one player: the result of a talkaction,
 * or a system notice. Never carries anyone else's private state.
 */
export const serverNoticeMessageSchema = z.object({
  type: z.literal("server-notice"),
  category: z.enum(["talkaction", "system", "broadcast"]),
  text: z.string().min(1).max(400),
});

export const chatRejectedReasonSchema = z.enum([
  "muted",
  "yell-exhausted",
  "level-too-low",
  "recipient-offline",
  "channel-not-open",
  "ignore-list-full",
]);

/** Why the last chat intent was dropped; carries no third-party details. */
export const chatRejectedMessageSchema = z.object({
  type: z.literal("chat-rejected"),
  reason: chatRejectedReasonSchema,
  retryAfterMs: z.number().int().min(0).max(3_600_000).optional(),
});

export type ChatSpeechMode = z.infer<typeof chatSpeechModeSchema>;
export type CreatureSpeechMode = z.infer<typeof creatureSpeechModeSchema>;
export type SpeakMessage = z.infer<typeof speakMessageSchema>;
export type PrivateChatMessage = z.infer<typeof privateChatMessageSchema>;
export type CreatureSpokeMessage = z.infer<typeof creatureSpokeMessageSchema>;
export type PrivateChatDeliveredMessage = z.infer<
  typeof privateChatDeliveredMessageSchema
>;
export type ChatChannelId = z.infer<typeof chatChannelIdSchema>;
export type ChannelListGetMessage = z.infer<
  typeof channelListGetMessageSchema
>;
export type ChannelOpenMessage = z.infer<typeof channelOpenMessageSchema>;
export type ChannelCloseMessage = z.infer<typeof channelCloseMessageSchema>;
export type ChannelSpeakMessage = z.infer<typeof channelSpeakMessageSchema>;
export type IgnoreAddMessage = z.infer<typeof ignoreAddMessageSchema>;
export type IgnoreRemoveMessage = z.infer<typeof ignoreRemoveMessageSchema>;
export type ChannelListMessage = z.infer<typeof channelListMessageSchema>;
export type ChannelMessage = z.infer<typeof channelMessageSchema>;
export type ChannelClosedMessage = z.infer<typeof channelClosedMessageSchema>;
export type IgnoreListMessage = z.infer<typeof ignoreListMessageSchema>;
export type ServerNoticeMessage = z.infer<typeof serverNoticeMessageSchema>;
export type ChatRejectedReason = z.infer<typeof chatRejectedReasonSchema>;
export type ChatRejectedMessage = z.infer<typeof chatRejectedMessageSchema>;
