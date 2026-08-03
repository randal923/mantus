import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PROTOCOL_LIMITS, PUBLIC_WEBSITE_LIMITS } from "@tibia/protocol";
import { parse } from "yaml";
import { z } from "zod";
import type { ServerConfig } from "./config";
import { NO_STAGES } from "./progression/stageRates";

const DEFAULT_CONFIG_PATH = fileURLToPath(
  new URL("../../config.yml", import.meta.url),
);
const UINT32_MAX = 0xffff_ffff;
const MAX_RATE = 1_000;
/** Matches the bound the public server-info stage rows carry. */
const MAX_STAGE_LEVEL = 100_000;

const stringSchema = z.string().min(1).max(100);
const trimmedStringSchema = stringSchema
  .refine(
    (value) => value.trim() === value,
    "must not have surrounding whitespace",
  );
const nameSchema = stringSchema
  .regex(
    /^[a-z0-9-]+$/,
    "may contain only lowercase letters, numbers, and hyphens",
  )
  .refine(
    (value) => value.trim() === value,
    "must not have surrounding whitespace",
  );
const positiveIntegerSchema = z.number().int().safe().min(1);
const nonnegativeIntegerSchema = z.number().int().safe().min(0);
const portSchema = z.number().int().safe().min(0).max(65_535);
const uint32Schema = z.number().int().safe().min(0).max(UINT32_MAX);
const booleanOverrideSchema = z
  .string()
  .regex(/^[01]$/, "must be 0 or 1")
  .transform((value) => value === "1");
const rateSchema = z
  .number()
  .min(0, `must be a number from 0 to ${MAX_RATE}`)
  .max(MAX_RATE, `must be a number from 0 to ${MAX_RATE}`);
const positiveRateSchema = z
  .number()
  .positive(`must be greater than 0 and at most ${MAX_RATE}`)
  .max(MAX_RATE, `must be greater than 0 and at most ${MAX_RATE}`);
const stageLevelSchema = z.number().int().safe().min(0).max(MAX_STAGE_LEVEL);

function stageBandIssue(
  row: { minLevel: number; maxLevel?: number },
  index: number,
  total: number,
  previousMax: number,
): string | undefined {
  if (row.maxLevel === undefined && index !== total - 1) {
    return "may omit maxLevel only in the last band";
  }
  if (row.maxLevel !== undefined && row.maxLevel < row.minLevel) {
    return "maxLevel must be at least minLevel";
  }
  if (row.minLevel <= previousMax) {
    return "bands must ascend and must not overlap";
  }
  return undefined;
}

/**
 * One stage table: ascending, non-overlapping level bands, capped at the row
 * count the public server-info payload can carry. Only the final band may omit
 * maxLevel (the unbounded tail); a level outside every band falls back to the
 * flat rate, so an empty table means "no stages".
 */
const stageTableSchema = z
  .array(
    z
      .object({
        minLevel: stageLevelSchema,
        maxLevel: stageLevelSchema.optional(),
        multiplier: rateSchema,
      })
      .strict(),
  )
  .max(PUBLIC_WEBSITE_LIMITS.stageRows)
  .superRefine((rows, context) => {
    let previousMax = -1;
    for (const [index, row] of rows.entries()) {
      const issue = stageBandIssue(row, index, rows.length, previousMax);
      if (issue) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: issue,
        });
        return;
      }
      previousMax = row.maxLevel ?? Number.MAX_SAFE_INTEGER;
    }
  });

const serverConfigFileSchema = z
  .object({
    server: z
      .object({
        port: portSchema,
        tickMs: positiveIntegerSchema,
        heartbeatMs: positiveIntegerSchema,
        authTimeoutMs: positiveIntegerSchema,
      })
      .strict(),
    development: z
      .object({
        auth: z.boolean(),
        commands: z.boolean(),
      })
      .strict(),
    network: z
      .object({
        trustProxyHeader: z.boolean(),
        maxSessions: positiveIntegerSchema,
        maxPendingIntents: positiveIntegerSchema,
        maxProtocolViolations: positiveIntegerSchema,
        defaultViewRange: z
          .object({
            x: positiveIntegerSchema.max(PROTOCOL_LIMITS.maxViewRangeX),
            y: positiveIntegerSchema.max(PROTOCOL_LIMITS.maxViewRangeY),
          })
          .strict(),
      })
      .strict(),
    chat: z
      .object({
        bufferCapacity: positiveIntegerSchema.max(64),
        bufferDrainMs: positiveIntegerSchema.max(60_000),
        muteBaseMs: positiveIntegerSchema.max(60 * 60_000),
        escalationDecayMs: positiveIntegerSchema.max(24 * 60 * 60_000),
      })
      .strict(),
    moderation: z
      .object({ retentionDays: positiveIntegerSchema.max(3_650) })
      .strict(),
    combat: z.object({ seed: uint32Schema }).strict(),
    rates: z
      .object({
        experience: rateSchema,
        skill: rateSchema,
        magic: rateSchema,
        loot: rateSchema,
        spawn: positiveRateSchema,
        soulRegen: rateSchema,
        offlineTraining: rateSchema,
        exerciseTraining: rateSchema,
        bestiaryKills: positiveIntegerSchema.max(MAX_RATE),
        bosstiaryKills: positiveIntegerSchema.max(MAX_RATE),
      })
      .strict(),
    progression: z
      .object({
        staminaSystem: z.boolean(),
        stages: z
          .object({
            enabled: z.boolean(),
            experience: stageTableSchema,
            skill: stageTableSchema,
            magic: stageTableSchema,
          })
          .strict(),
      })
      .strict(),
    characters: z
      .object({
        starterTownId: positiveIntegerSchema,
        saveIntervalMs: positiveIntegerSchema,
        maxSaveRetries: nonnegativeIntegerSchema,
        saveRetryDelayMs: nonnegativeIntegerSchema,
      })
      .strict(),
    map: z
      .object({
        name: nameSchema,
        spawnTown: trimmedStringSchema,
      })
      .strict(),
    mapCleanup: z
      .object({
        enabled: z.boolean(),
        intervalMs: positiveIntegerSchema,
        warningMinutes: nonnegativeIntegerSchema.max(60),
        cleanProtectionZones: z.boolean(),
      })
      .strict(),
    creatures: z
      .object({
        enabled: z.boolean(),
        contentName: nameSchema,
        activationRange: z
          .object({
            x: positiveIntegerSchema,
            y: positiveIntegerSchema,
          })
          .strict(),
        retryMs: positiveIntegerSchema,
        maxSpawnChecksPerTick: positiveIntegerSchema,
        maxSpawnAttemptsPerTick: positiveIntegerSchema,
        maxAiScansPerTick: positiveIntegerSchema,
        maxAiWorkPerTick: positiveIntegerSchema,
        ai: z
          .object({
            thinkIntervalMs: positiveIntegerSchema,
            acquisitionRange: positiveIntegerSchema,
            loseRange: positiveIntegerSchema,
            despawnRadius: positiveIntegerSchema,
            maxPathNodes: positiveIntegerSchema,
            wanderChance: z.number().min(0).max(1),
            seed: uint32Schema,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const environmentOverridesSchema = z
  .object({
    SERVER_PORT: z
      .string()
      .regex(/^\d+$/, "must be an integer")
      .transform(Number)
      .pipe(portSchema)
      .optional(),
    DEV_AUTH: booleanOverrideSchema.optional(),
    DEV_COMMANDS: booleanOverrideSchema.optional(),
    TRUST_PROXY: booleanOverrideSchema.optional(),
    MAP_NAME: nameSchema.optional(),
    SPAWN_TOWN: trimmedStringSchema.optional(),
    CREATURES_ENABLED: booleanOverrideSchema.optional(),
  })
  .passthrough();

export async function loadServerConfig(
  configPath = process.env.CONFIG_PATH ?? DEFAULT_CONFIG_PATH,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ServerConfig> {
  let source: string;
  try {
    source = await readFile(configPath, "utf8");
  } catch (cause) {
    throw new Error(`Could not read server config at ${configPath}`, { cause });
  }

  let value: unknown;
  try {
    value = parse(source, { maxAliasCount: 0, uniqueKeys: true }) as unknown;
  } catch (cause) {
    throw new Error(`Could not parse server config at ${configPath}`, { cause });
  }

  let config: z.infer<typeof serverConfigFileSchema>;
  try {
    config = serverConfigFileSchema.parse(value);
  } catch (cause) {
    throw configValidationError(cause);
  }

  let overrides: z.infer<typeof environmentOverridesSchema>;
  try {
    overrides = environmentOverridesSchema.parse(environment);
  } catch (cause) {
    throw environmentValidationError(cause);
  }

  const mapName = overrides.MAP_NAME ?? config.map.name;
  const creaturesEnabled =
    overrides.CREATURES_ENABLED ?? config.creatures.enabled;
  const { enabled: _, ...creatureConfig } = config.creatures;

  return {
    port: overrides.SERVER_PORT ?? config.server.port,
    dev: {
      auth: overrides.DEV_AUTH ?? config.development.auth,
      commands: overrides.DEV_COMMANDS ?? config.development.commands,
    },
    tickMs: config.server.tickMs,
    heartbeatMs: config.server.heartbeatMs,
    authTimeoutMs: config.server.authTimeoutMs,
    trustProxyHeader:
      overrides.TRUST_PROXY ?? config.network.trustProxyHeader,
    maxSessions: config.network.maxSessions,
    maxPendingIntents: config.network.maxPendingIntents,
    maxProtocolViolations: config.network.maxProtocolViolations,
    chat: config.chat,
    moderationRetentionDays: config.moderation.retentionDays,
    combatSeed: config.combat.seed,
    rates: config.rates,
    progression: {
      staminaSystem: config.progression.staminaSystem,
      // Switching stages off drops the tables here rather than carrying a
      // second flag: every lookup then misses and falls back to `rates.*`.
      stages: config.progression.stages.enabled
        ? {
            experience: config.progression.stages.experience,
            skill: config.progression.stages.skill,
            magic: config.progression.stages.magic,
          }
        : NO_STAGES,
    },
    starterTownId: config.characters.starterTownId,
    characterSaveIntervalMs: config.characters.saveIntervalMs,
    maxCharacterSaveRetries: config.characters.maxSaveRetries,
    characterSaveRetryDelayMs: config.characters.saveRetryDelayMs,
    defaultViewRange: config.network.defaultViewRange,
    map: {
      source: "data",
      name: mapName,
      spawnTown: overrides.SPAWN_TOWN ?? config.map.spawnTown,
    },
    ...(config.mapCleanup.enabled
      ? {
          mapCleanup: {
            intervalMs: config.mapCleanup.intervalMs,
            warningMinutes: config.mapCleanup.warningMinutes,
            cleanProtectionZones: config.mapCleanup.cleanProtectionZones,
          },
        }
      : {}),
    creatures:
      creaturesEnabled && mapName === "otservbr" ? creatureConfig : undefined,
  };
}

function configValidationError(cause: unknown): Error {
  if (!(cause instanceof z.ZodError)) {
    return new Error("Server config validation failed", { cause });
  }
  const issue = cause.issues[0];
  if (!issue) return new Error("Server config validation failed", { cause });
  if (issue.code === "unrecognized_keys") {
    const path = ["config", ...issue.path, issue.keys[0]].join(".");
    return new Error(`${path} is unknown`, { cause });
  }
  const path = ["config", ...issue.path].join(".");
  return new Error(`${path} ${issue.message}`, { cause });
}

function environmentValidationError(cause: unknown): Error {
  if (!(cause instanceof z.ZodError)) {
    return new Error("Server environment validation failed", { cause });
  }
  const issue = cause.issues[0];
  if (!issue) {
    return new Error("Server environment validation failed", { cause });
  }
  return new Error(`${issue.path.join(".")} ${issue.message}`, { cause });
}
