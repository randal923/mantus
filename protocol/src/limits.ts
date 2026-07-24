/**
 * Transport limits shared by client and server. The server enforces them
 * (security charter rule 10); the client respects them to stay connected.
 */
export const PROTOCOL_LIMITS = {
  maxMessageBytes: 16_384,
  maxMessagesPerSecond: 30,
  maxServerMessagesPerBatch: 128,
  maxSocketBufferedBytes: 1_048_576,
  maxConnectionsPerIp: 5,
  minCharacterNameLength: 3,
  maxCharacterNameLength: 20,
  maxTokenLength: 3072,
  maxViewRangeX: 32,
  maxViewRangeY: 24,
  maxAutoWalkSteps: 128,
  /** UTF-16 length cap for one chat line (Tibia caps speech at 255). */
  maxChatTextLength: 255,
} as const;
