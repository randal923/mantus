import type { Position, ViewRange } from "@tibia/protocol";
import type { MapAction } from "./MapAction";
import type { MapItem } from "./MapItem";
import type { MapTransition } from "./MapTransition";

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
      towns?: ReadonlyArray<{ id: number; name: string }>;
    };

export interface ServerConfig {
  port: number;
  /**
   * Development-only switches, both default-off. `auth` swaps Supabase token
   * verification for DevTokenVerifier; `commands` enables in-game GM chat
   * commands. Neither may ever be enabled on a production deployment.
   */
  dev: {
    auth: boolean;
    commands: boolean;
  };
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
  rates: {
    experience: number;
    skill: number;
    magic: number;
    loot: number;
    spawn: number;
  };
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
      despawnRadius: number;
      maxPathNodes: number;
      wanderChance: number;
      seed: number;
    };
  };
}
