import { GAME_RULES } from "@tibia/protocol";

export interface ServerConfig {
  port: number;
  tickMs: number;
  heartbeatMs: number;
  /** Unauthenticated sockets are dropped after this long. */
  authTimeoutMs: number;
  /**
   * Take the client IP from the Fly-Client-IP header. Only enable behind a
   * proxy that sets it (fly.io); trusting it on direct connections would let
   * clients spoof around the per-IP connection limit.
   */
  trustProxyHeader: boolean;
  stepCooldownMs: number;
  maxSessions: number;
  maxPendingIntents: number;
  maxProtocolViolations: number;
  viewRange: { x: number; y: number };
  map: {
    width: number;
    height: number;
    blocked: ReadonlyArray<readonly [number, number]>;
  };
}

export const serverConfig: ServerConfig = {
  port: Number(process.env.SERVER_PORT ?? 4000),
  tickMs: 25,
  heartbeatMs: 30_000,
  authTimeoutMs: 10_000,
  trustProxyHeader: process.env.TRUST_PROXY === "1",
  /** Server-enforced walk speed; the client animates at the same shared value. */
  stepCooldownMs: GAME_RULES.stepCooldownMs,
  maxSessions: 100,
  maxPendingIntents: 16,
  maxProtocolViolations: 5,
  viewRange: { x: 9, y: 7 },
  map: {
    width: 48,
    height: 32,
    blocked: [
      [6, 4],
      [7, 4],
      [6, 5],
      [17, 10],
      [18, 10],
      [17, 11],
      [11, 8],
      [26, 6],
      [27, 6],
      [33, 14],
      [34, 15],
      [9, 20],
      [10, 21],
      [22, 24],
      [23, 24],
      [38, 8],
      [40, 22],
      [41, 23],
      [30, 27],
      [14, 28],
      [44, 12],
      [5, 13],
      [36, 29],
      [19, 3],
      [43, 3],
    ],
  },
};
