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
  starterTownId: number;
  characterSaveIntervalMs: number;
  maxCharacterSaveRetries: number;
  characterSaveRetryDelayMs: number;
  /** Fallback used until an authenticated client reports its bounded viewport. */
  defaultViewRange: ViewRange;
  map: MapConfig;
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
};
