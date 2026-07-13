export const serverConfig = {
  port: Number(process.env.SERVER_PORT ?? 4000),
  tickMs: 50,
  heartbeatMs: 30_000,
  /** Server-enforced walk speed; the client's pacing is just politeness. */
  stepCooldownMs: 180,
  maxSessions: 100,
  maxPendingIntents: 16,
  maxProtocolViolations: 5,
  map: {
    width: 24,
    height: 16,
    blocked: [
      [6, 4],
      [7, 4],
      [6, 5],
      [17, 10],
      [18, 10],
      [17, 11],
      [11, 8],
    ] as ReadonlyArray<readonly [number, number]>,
  },
} as const;

export type ServerConfig = typeof serverConfig;
