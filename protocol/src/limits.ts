/**
 * Transport limits shared by client and server. The server enforces them
 * (security charter rule 10); the client respects them to stay connected.
 */
export const PROTOCOL_LIMITS = {
  maxMessageBytes: 4096,
  maxMessagesPerSecond: 30,
  maxConnectionsPerIp: 5,
  minCharacterNameLength: 3,
  maxCharacterNameLength: 20,
  maxTokenLength: 3072,
  maxViewRangeX: 32,
  maxViewRangeY: 24,
} as const;
