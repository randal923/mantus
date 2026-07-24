import { monitorEventLoopDelay } from "node:perf_hooks";
import type { TokenVerifier } from "../TokenVerifier";
import type { ServerConfig } from "../config";
import { GameServer } from "../GameServer";
import { ItemCatalog } from "../item/ItemCatalog";
import { MemoryItemStore } from "../item/MemoryItemStore";
import { InMemoryAccountStore } from "../test/InMemoryAccountStore";
import { InMemoryCharacterStore } from "../test/InMemoryCharacterStore";
import { makeCharacter } from "../test/makeCharacter";

const targetPlayers = Number(process.env.LOAD_TEST_PLAYERS ?? 2_000);
if (
  !Number.isSafeInteger(targetPlayers) ||
  targetPlayers < 1 ||
  targetPlayers > 10_000
) {
  throw new Error("LOAD_TEST_PLAYERS must be an integer from 1 to 10000");
}

const port = Number(process.env.LOAD_TEST_PORT ?? 4_125);
if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
  throw new Error("LOAD_TEST_PORT must be a valid port");
}

const characters = new InMemoryCharacterStore();
for (let index = 0; index < targetPlayers; index++) {
  const suffix = String(index).padStart(4, "0");
  const characterId =
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const group = Math.floor(index / 20);
  const member = index % 20;
  const baseX = 20 + (group % 10) * 40;
  const baseY = 20 + Math.floor(group / 10) * 40;
  characters.seed({
    ...makeCharacter(characterId, `Load ${suffix}`),
    accountId: `acc-load:load-${suffix}`,
    positionX: baseX + (member % 5),
    positionY: baseY + Math.floor(member / 5),
  });
}

const verifier: TokenVerifier = {
  async verify(token) {
    if (!/^load-\d{4,5}$/.test(token)) {
      throw new Error("invalid load-test token");
    }
    return { supabaseUserId: `load:${token}`, email: null };
  },
};

const config: ServerConfig = {
  port,
  dev: { auth: false, commands: false },
  tickMs: 25,
  heartbeatMs: 30_000,
  authTimeoutMs: 30_000,
  trustProxyHeader: true,
  maxSessions: targetPlayers,
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
    source: "grid",
    name: "player-load-grid",
    width: 440,
    height: Math.max(440, Math.ceil(targetPlayers / 200) * 40 + 40),
    blocked: [],
    groundSpeed: 150,
  },
};

const server = new GameServer(config, {
  verifier,
  accounts: new InMemoryAccountStore(),
  characters,
  items: new MemoryItemStore(),
  itemCatalog: new ItemCatalog([]),
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
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      eventLoopP99Ms: eventLoop.percentile(99) / 1_000_000,
      eventLoopMaxMs: eventLoop.max / 1_000_000,
    })}`,
  );
  eventLoop.reset();
}, 1_000);
metrics.unref();

console.log(`PLAYER_LOAD_SERVER_READY ws://127.0.0.1:${server.port}`);

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
