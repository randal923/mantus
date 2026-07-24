import { monitorEventLoopDelay } from "node:perf_hooks";
import type { TokenVerifier } from "../TokenVerifier";
import type { ServerConfig } from "../config";
import { GameServer } from "../GameServer";
import { MemoryItemStore } from "../item/MemoryItemStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { deriveCharacterStats } from "../progression/deriveCharacterStats";
import { PROGRESSION_DEFINITION_VERSION } from "../progression/progressionDefinitionVersion";
import { InMemoryAccountStore } from "../test/InMemoryAccountStore";
import { InMemoryCharacterStore } from "../test/InMemoryCharacterStore";
import { makeCharacter } from "../test/makeCharacter";

const port = Number(process.env.LOAD_TEST_PORT ?? 4_125);
if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
  throw new Error("LOAD_TEST_PORT must be a valid port");
}

const characterId = "00000000-0000-4000-8000-000000000001";
const position = { x: 32_369, y: 32_260, z: 7 };
const level = 300;
const stats = deriveCharacterStats({
  vocation: "Sorcerer",
  definitionVersion: PROGRESSION_DEFINITION_VERSION,
  level,
});
const characters = new InMemoryCharacterStore();
characters.seed({
  ...makeCharacter(characterId, "Monster Probe"),
  accountId: "acc-monster-load",
  vocation: "Sorcerer",
  level,
  experience: BigInt(getExperienceForLevel(level)),
  magicLevel: 30,
  health: stats.maxHealth,
  mana: stats.maxMana,
  positionX: position.x,
  positionY: position.y,
  positionZ: position.z,
});

const verifier: TokenVerifier = {
  async verify(token) {
    if (token !== "monster-load") throw new Error("invalid load-test token");
    return { supabaseUserId: "monster-load", email: null };
  },
};

const config: ServerConfig = {
  port,
  dev: { auth: false, commands: true },
  tickMs: 25,
  heartbeatMs: 30_000,
  authTimeoutMs: 10_000,
  trustProxyHeader: false,
  maxSessions: 8,
  maxPendingIntents: 16,
  maxProtocolViolations: 5,
  combatSeed: 1_129_270_594,
  rates: { experience: 1, skill: 1, magic: 1, loot: 1, spawn: 1 },
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
    maxAiWorkPerTick: 512,
    ai: {
      thinkIntervalMs: 250,
      acquisitionRange: 8,
      loseRange: 12,
      despawnRadius: 50,
      maxPathNodes: 96,
      wanderChance: 0.2,
      seed: 1_296_125_524,
    },
  },
};

const itemCatalog = await loadItemCatalog();
const items = new MemoryItemStore(itemCatalog);
items.seed({
  id: "00000000-0000-4000-8000-000000000002",
  typeId: 2_854,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "equipment", characterId, slot: "backpack" },
});
items.seed({
  id: "00000000-0000-4000-8000-000000000003",
  typeId: 3_191,
  count: 100,
  attributes: {},
  version: 1,
  location: {
    kind: "container",
    containerId: "00000000-0000-4000-8000-000000000002",
    slot: 0,
  },
});

const server = new GameServer(config, {
  verifier,
  accounts: new InMemoryAccountStore(),
  characters,
  items,
  itemCatalog,
});
server.start();

const eventLoop = monitorEventLoopDelay({ resolution: 10 });
eventLoop.enable();
const metrics = setInterval(() => {
  const memory = process.memoryUsage();
  console.log(
    `LOAD_SERVER_METRICS ${JSON.stringify({
      at: Date.now(),
      sessions: server.sessionCount,
      players: server.onlinePlayerCount,
      monsters: server.monsterCount,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      eventLoopP99Ms: eventLoop.percentile(99) / 1_000_000,
      eventLoopMaxMs: eventLoop.max / 1_000_000,
    })}`,
  );
  eventLoop.reset();
}, 1_000);
metrics.unref();

console.log(`MONSTER_LOAD_SERVER_READY ws://127.0.0.1:${server.port}`);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  clearInterval(metrics);
  eventLoop.disable();
  void server.stop().finally(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
