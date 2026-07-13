/**
 * Transport limits shared by client and server. The server enforces them
 * (security charter rule 10); the client respects them to stay connected.
 */
export const PROTOCOL_LIMITS = {
  maxMessageBytes: 1024,
  maxMessagesPerSecond: 30,
  maxConnectionsPerIp: 5,
  maxNameLength: 20,
} as const;
