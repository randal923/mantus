import { GAME_RULES } from "@tibia/protocol";

const mapName = process.env.MAP_NAME ?? "otservbr";
if (!/^[a-z0-9-]+$/.test(mapName)) {
  throw new Error("MAP_NAME may contain only lowercase letters, numbers, and hyphens");
}

export type MapConfig =
  | {
      /** Converted map loaded from server/data/<name>.map.bin (see map/README.md). */
      source: "data";
      name: string;
      spawnTown?: string;
    }
  | {
      /** Inline grid, used by tests. */
      source: "grid";
      name: string;
      width: number;
      height: number;
      blocked: ReadonlyArray<readonly [number, number]>;
    };

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
  starterTownId: number;
  characterSaveIntervalMs: number;
  maxCharacterSaveRetries: number;
  characterSaveRetryDelayMs: number;
  viewRange: { x: number; y: number };
  map: MapConfig;
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
  starterTownId: 1,
  characterSaveIntervalMs: 30_000,
  maxCharacterSaveRetries: 3,
  characterSaveRetryDelayMs: 100,
  viewRange: { x: 9, y: 7 },
  map: {
    source: "data",
    name: mapName,
    spawnTown: process.env.SPAWN_TOWN ?? "Thais",
  },
};
