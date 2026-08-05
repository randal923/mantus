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
 * Memory-backed game server for the item-animation browser e2e: no Postgres,
 * one pre-seeded character standing in the Thais temple with animated items
 * equipped (exercise sword) and in the backpack (supreme health potions).
 */
const port = Number(process.env.ANIMATION_PROBE_PORT ?? 4_126);
if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
  throw new Error("ANIMATION_PROBE_PORT must be a valid port");
}

const characterId = "00000000-0000-4000-8000-00000000a11a";
/** Thais temple: a protection zone ringed by animated wall torches. */
const position = { x: 32_369, y: 32_241, z: 7 };
const level = 100;
const stats = deriveCharacterStats({
  vocation: "Knight",
  definitionVersion: PROGRESSION_DEFINITION_VERSION,
  level,
});
const characters = new InMemoryCharacterStore();
characters.seed({
  ...makeCharacter(characterId, "Anim Probe"),
  accountId: "acc-anim-probe",
  vocation: "Knight",
  level,
  experience: BigInt(getExperienceForLevel(level)),
  health: stats.maxHealth,
  mana: stats.maxMana,
  positionX: position.x,
  positionY: position.y,
  positionZ: position.z,
});

const verifier: TokenVerifier = {
  async verify(token) {
    if (token !== "anim-probe") throw new Error("invalid probe token");
    return { supabaseUserId: "anim-probe", email: null };
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
  maxPendingIntents: 16,
  maxProtocolViolations: 5,
  chat: DEFAULT_CHAT_FLOOD_LIMITS,
  moderationRetentionDays: 365,
  combatSeed: 813_205_401,
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
      seed: 605_513_882,
    },
  },
};

const itemCatalog = await loadItemCatalog();
const items = new MemoryItemStore(itemCatalog);
// An animated 5-phase item in the paperdoll's weapon slot.
items.seed({
  id: "00000000-0000-4000-8000-00000000a11b",
  typeId: 28_552,
  count: 1,
  attributes: { charges: 500 },
  version: 1,
  location: { kind: "equipment", characterId, slot: "weapon" },
});
const backpackId = "00000000-0000-4000-8000-00000000a11c";
items.seed({
  id: backpackId,
  typeId: 2_854,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "equipment", characterId, slot: "backpack" },
});
// A 12-phase supreme health potion inside the backpack.
items.seed({
  id: "00000000-0000-4000-8000-00000000a11d",
  typeId: 23_375,
  count: 3,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: backpackId, slot: 0 },
});

const server = new GameServer(config, {
  verifier,
  accounts: new InMemoryAccountStore(),
  characters,
  items,
  itemCatalog,
});
server.start();

console.log(`ANIMATION_PROBE_SERVER_READY ws://127.0.0.1:${server.port}`);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  void server.stop().finally(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
