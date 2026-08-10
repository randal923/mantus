import type { TokenVerifier } from "../TokenVerifier";
import type { ServerConfig } from "../config";
import { NO_STAGES } from "../progression/stageRates";
import { DISABLED_RARITY_CONFIG } from "../rarity/RarityConfig";
import { GameServer } from "../GameServer";
import { MemoryItemStore } from "../item/MemoryItemStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { deriveCharacterStats } from "../progression/deriveCharacterStats";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { PROGRESSION_DEFINITION_VERSION } from "../progression/progressionDefinitionVersion";
import { InMemoryAccountStore } from "../test/InMemoryAccountStore";
import { InMemoryCharacterStore } from "../test/InMemoryCharacterStore";
import { makeCharacter } from "../test/makeCharacter";
import { DEFAULT_CHAT_FLOOD_LIMITS } from "../chat/ChatFloodLimits";

/**
 * Memory-backed game server for the world-lighting browser e2e: no Postgres,
 * one character on open ground far from any map light source (so a forced
 * night visibly darkens the scene), plus a GM helper character on a second
 * account — same-account logins kick each other, and the e2e drives /light
 * through the helper while the browser client stays connected.
 */
const port = Number(process.env.LIGHTING_PROBE_PORT ?? 4_127);
if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
  throw new Error("LIGHTING_PROBE_PORT must be a valid port");
}

/** Walkable field south of Thais, 35+ tiles from any light-emitting item. */
const darkSpot = { x: 32_387, y: 32_296, z: 7 };
/** Thais temple: a protection zone, safe for the idle GM helper. */
const templePosition = { x: 32_369, y: 32_241, z: 7 };

const level = 100;
const stats = deriveCharacterStats({
  vocation: "Knight",
  definitionVersion: PROGRESSION_DEFINITION_VERSION,
  level,
});
const characters = new InMemoryCharacterStore();
const lightProbeId = "00000000-0000-4000-8000-00000000119a";
characters.seed({
  ...makeCharacter(lightProbeId, "Light Probe"),
  accountId: "acc-light-probe",
  vocation: "Knight",
  level,
  experience: BigInt(getExperienceForLevel(level)),
  health: stats.maxHealth,
  mana: stats.maxMana,
  positionX: darkSpot.x,
  positionY: darkSpot.y,
  positionZ: darkSpot.z,
});
characters.seed({
  ...makeCharacter("00000000-0000-4000-8000-00000000119b", "Gm Helper"),
  accountId: "acc-light-probe-gm",
  vocation: "Knight",
  level,
  experience: BigInt(getExperienceForLevel(level)),
  health: stats.maxHealth,
  mana: stats.maxMana,
  positionX: templePosition.x,
  positionY: templePosition.y,
  positionZ: templePosition.z,
});

const verifier: TokenVerifier = {
  async verify(token) {
    if (token === "light-probe") {
      return { supabaseUserId: "light-probe", email: null };
    }
    if (token === "light-probe-gm") {
      return { supabaseUserId: "light-probe-gm", email: null };
    }
    throw new Error("invalid probe token");
  },
};

const config: ServerConfig = {
  port,
  dev: { auth: false, commands: true },
  tickMs: 50,
  heartbeatMs: 30_000,
  authTimeoutMs: 10_000,
  trustProxyHeader: false,
  maxSessions: 4,
  maxLoginQueueSize: 50,
  maxPendingIntents: 16,
  maxProtocolViolations: 5,
  chat: DEFAULT_CHAT_FLOOD_LIMITS,
  moderationRetentionDays: 365,
  combatSeed: 813_205_402,
  rates: {
    experience: 1,
    skill: 1,
    magic: 1,
    loot: 1,
    spawn: 1,
    soulRegen: 1,
    offlineTraining: 1,
    exerciseTraining: 1,
    bestiaryKills: 1,
    bosstiaryKills: 1,
  },
  rarity: DISABLED_RARITY_CONFIG,
  progression: { staminaSystem: true, stages: NO_STAGES },
  starterTownId: 1,
  characterSaveIntervalMs: 30_000,
  maxCharacterSaveRetries: 3,
  characterSaveRetryDelayMs: 1,
  defaultViewRange: { x: 9, y: 7 },
  map: {
    source: "data",
    name: "otservbr",
    spawnTown: "Thais",
  },
  creatures: {
    contentName: "world",
    activationRange: { x: 32, y: 32 },
    retryMs: 1_000,
    maxSpawnChecksPerTick: 512,
    maxSpawnAttemptsPerTick: 8,
    maxAiScansPerTick: 512,
    maxAiWorkPerTick: 2048,
    ai: {
      thinkIntervalMs: 250,
      acquisitionRange: 8,
      loseRange: 12,
      despawnRadius: 50,
      maxPathNodes: 640,
      wanderChance: 0.2,
      seed: 605_513_883,
    },
  },
};

const itemCatalog = await loadItemCatalog();
const items = new MemoryItemStore(itemCatalog);

const accounts = new InMemoryAccountStore();
const server = new GameServer(config, {
  verifier,
  accounts,
  characters,
  items,
  itemCatalog,
});
server.start();

console.log(`LIGHTING_PROBE_SERVER_READY ws://127.0.0.1:${server.port}`);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  void server.stop().finally(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
