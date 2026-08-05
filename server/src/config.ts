import type { Position, ViewRange } from "@tibia/protocol";
import type { ChatFloodLimits } from "./chat/ChatFloodLimits";
import type { MapAction } from "./MapAction";
import type { MapItem } from "./MapItem";
import type { MapTransition } from "./MapTransition";
import type { StageTables } from "./progression/stageRates";
import type { RarityConfig } from "./rarity/RarityConfig";
import type { MapCleanupConfig } from "./world/MapCleanupService";

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
  /** Flood control the server enforces; the client's chat box only displays it. */
  chat: ChatFloodLimits;
  /** How long moderation metadata is kept before the retention prune drops it. */
  moderationRetentionDays: number;
  combatSeed: number;
  rates: {
    experience: number;
    skill: number;
    magic: number;
    loot: number;
    spawn: number;
    soulRegen: number;
    offlineTraining: number;
    exerciseTraining: number;
    /** Kill credit per death toward bestiary/bosstiary completion. */
    bestiaryKills: number;
    bosstiaryKills: number;
  };
  /** Rarity drop chances plus the affix tuning tables; disabled = zero chances. */
  rarity: RarityConfig;
  progression: {
    staminaSystem: boolean;
    /**
     * Level-banded rate tables from `progression.stages` in config.yml. Empty
     * tables mean stages are off and the flat `rates.*` multipliers apply.
     */
    stages: StageTables;
  };
  starterTownId: number;
  characterSaveIntervalMs: number;
  maxCharacterSaveRetries: number;
  characterSaveRetryDelayMs: number;
  /** Fallback used until an authenticated client reports its bounded viewport. */
  defaultViewRange: ViewRange;
  map: MapConfig;
  /** Absent when the periodic ground-item sweep is switched off. */
  mapCleanup?: MapCleanupConfig;
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
