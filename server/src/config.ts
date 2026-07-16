import type { Position, ViewRange } from "@tibia/protocol";
import type { MapAction } from "./MapAction";
import type { MapItem } from "./MapItem";
import type { MapTransition } from "./MapTransition";

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
      floors?: ReadonlyArray<number>;
      groundSpeed?: number;
      groundSpeeds?: ReadonlyArray<readonly [number, number, number, number]>;
      transitions?: ReadonlyArray<MapTransition>;
      actions?: ReadonlyArray<MapAction>;
      items?: ReadonlyArray<{
        position: Position;
        item: MapItem;
      }>;
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
  maxSessions: number;
  maxPendingIntents: number;
  maxProtocolViolations: number;
  combatSeed: number;
  starterTownId: number;
  characterSaveIntervalMs: number;
  maxCharacterSaveRetries: number;
  characterSaveRetryDelayMs: number;
  /** Fallback used until an authenticated client reports its bounded viewport. */
  defaultViewRange: ViewRange;
  map: MapConfig;
  creatures?: {
    contentName: string;
    activationRange: { x: number; y: number };
    retryMs: number;
    maxSpawnChecksPerTick: number;
    maxSpawnAttemptsPerTick: number;
    maxAiScansPerTick: number;
    maxAiWorkPerTick: number;
    ai: {
      thinkIntervalMs: number;
      acquisitionRange: number;
      loseRange: number;
      maxPathNodes: number;
      wanderChance: number;
      seed: number;
    };
  };
}

export const serverConfig: ServerConfig = {
  port: Number(process.env.SERVER_PORT ?? 4000),
  tickMs: 25,
  heartbeatMs: 30_000,
  authTimeoutMs: 10_000,
  trustProxyHeader: process.env.TRUST_PROXY === "1",
  maxSessions: 100,
  maxPendingIntents: 16,
  maxProtocolViolations: 5,
  combatSeed: 0x434f4d42,
  starterTownId: 1,
  characterSaveIntervalMs: 30_000,
  maxCharacterSaveRetries: 3,
  characterSaveRetryDelayMs: 100,
  defaultViewRange: { x: 9, y: 7 },
  map: {
    source: "data",
    name: mapName,
    spawnTown: process.env.SPAWN_TOWN ?? "Thais",
  },
  creatures:
    process.env.CREATURES_ENABLED === "0" || mapName !== "otservbr"
      ? undefined
      : {
          contentName: "world",
          activationRange: { x: 32, y: 32 },
          retryMs: 1000,
          maxSpawnChecksPerTick: 512,
          maxSpawnAttemptsPerTick: 8,
          maxAiScansPerTick: 512,
          maxAiWorkPerTick: 512,
          ai: {
            thinkIntervalMs: 250,
            acquisitionRange: 8,
            loseRange: 12,
            maxPathNodes: 96,
            wanderChance: 0.2,
            seed: 0x4d414e54,
          },
        },
};
