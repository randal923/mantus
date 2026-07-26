import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import { GameServer } from "./GameServer";
import { PgCharacterStore } from "./character/PgCharacterStore";
import { PgAccountStore } from "./PgAccountStore";
import { DevTokenVerifier } from "./DevTokenVerifier";
import { SupabaseTokenVerifier } from "./SupabaseTokenVerifier";
import { loadItemCatalog } from "./item/loadItemCatalog";
import { PgItemStore } from "./item/PgItemStore";
import { CurrencyReconciler } from "./economy/CurrencyReconciler";
import { PgBankStore } from "./economy/PgBankStore";
import { PgShopStore } from "./economy/PgShopStore";
import { PgNpcTravelStore } from "./npc/PgNpcTravelStore";
import { PgPromotionStore } from "./npc/PgPromotionStore";
import { PgSpellTeacherStore } from "./npc/PgSpellTeacherStore";
import { PgDepotStore } from "./depot/PgDepotStore";
import { PgMarketStore } from "./market/PgMarketStore";
import { PgTradeStore } from "./trade/PgTradeStore";
import { PgGuildStore } from "./guild/PgGuildStore";
import { PgHouseStore } from "./house/PgHouseStore";
import { PgModerationStore } from "./moderation/PgModerationStore";
import { PgPvpStore } from "./pvp/PgPvpStore";
import { PgBestiaryStore } from "./bestiary/PgBestiaryStore";
import { PgGemStore } from "./wheel/PgGemStore";
import { PgWheelStore } from "./wheel/PgWheelStore";
import { PgHighscoreStore } from "./social/PgHighscoreStore";
import { PgMarkerStore } from "./minimap/PgMarkerStore";
import { PgOutfitStore } from "./outfit/PgOutfitStore";
import { PgProfileStore } from "./profile/PgProfileStore";
import { PgPreyStore } from "./prey/PgPreyStore";
import { PgBoostedStore } from "./boosted/PgBoostedStore";
import { PgBossSlotStore } from "./bestiary/PgBossSlotStore";
import { PgTrackerStore } from "./bestiary/PgTrackerStore";
import { PgForgeStore } from "./forge/PgForgeStore";
import { PgImbuementStore } from "./imbuement/PgImbuementStore";
import { PgProficiencyStore } from "./proficiency/PgProficiencyStore";
import { PgCyclopediaStore } from "./cyclopedia/PgCyclopediaStore";
import { PgHuntingTaskStore } from "./huntingTasks/PgHuntingTaskStore";
import { PgFriendStore } from "./social/PgFriendStore";
import { PgVipStore } from "./social/PgVipStore";
import { PgChestStore } from "./chest/PgChestStore";
import { PgRewardStore } from "./reward/PgRewardStore";
import { PgDailyRewardStore } from "./daily/PgDailyRewardStore";
import { PgWorldEventStore } from "./event/PgWorldEventStore";
import { PgMantusStore } from "./store/PgMantusStore";
import { WorldItemSeeder } from "./item/WorldItemSeeder";
import { loadServerConfig } from "./loadServerConfig";

const serverConfig = await loadServerConfig();

const supabaseUrl = process.env.SUPABASE_URL;
const databaseUrl = process.env.DATABASE_URL;
// Supabase's session pooler refuses clients beyond its pool_size (15 by
// default), so stay below that with headroom for migrations/tools.
const postgresPoolMax = Number(process.env.PG_POOL_MAX ?? 10);

if (!databaseUrl || (!supabaseUrl && !serverConfig.dev.auth)) {
  console.error(
    "Missing required env: set SUPABASE_URL and DATABASE_URL in the root .env " +
      "(see .env.example). SUPABASE_JWT_SECRET is only needed for legacy " +
      "HS256 projects.",
  );
  process.exit(1);
}
if (
  !Number.isSafeInteger(postgresPoolMax) ||
  postgresPoolMax < 1 ||
  postgresPoolMax > 50
) {
  console.error("PG_POOL_MAX must be an integer from 1 to 50.");
  process.exit(1);
}

const verifier = serverConfig.dev.auth
  ? new DevTokenVerifier()
  : new SupabaseTokenVerifier({
      supabaseUrl: supabaseUrl!,
      jwtSecret: process.env.SUPABASE_JWT_SECRET,
    });
if (serverConfig.dev.auth || serverConfig.dev.commands) {
  console.warn(
    `DEV MODE: dev auth ${serverConfig.dev.auth ? "ON" : "off"}, ` +
      `GM commands ${serverConfig.dev.commands ? "ON" : "off"} — ` +
      "never enable these in production",
  );
}
const pool = new Pool({
  connectionString: databaseUrl,
  max: postgresPoolMax,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});
// idle pooled connections dropped by the pooler must not crash the process
pool.on("error", (cause) => {
  console.error(`postgres pool error: ${cause.message}`);
});
const accounts = new PgAccountStore(pool);
const characters = new PgCharacterStore(pool);
const itemCatalog = await loadItemCatalog();
const items = new PgItemStore(pool, itemCatalog, serverConfig.map.name);
const npcTravel = new PgNpcTravelStore(pool, itemCatalog);
const promotion = new PgPromotionStore(pool, itemCatalog);
const spellTeacher = new PgSpellTeacherStore(pool, itemCatalog);
const bank = new PgBankStore(pool, itemCatalog);
const shop = new PgShopStore(pool, itemCatalog);
const depot = new PgDepotStore(pool, itemCatalog);
const market = new PgMarketStore(pool, itemCatalog);
const trade = new PgTradeStore(pool, itemCatalog);
const guild = new PgGuildStore(pool);
const pvp = new PgPvpStore(pool);
const house = new PgHouseStore(pool, itemCatalog);
const vip = new PgVipStore(pool);
const friends = new PgFriendStore(pool);
const profiles = new PgProfileStore(pool);
const prey = new PgPreyStore(pool);
const huntingTasks = new PgHuntingTaskStore(pool);
const boosted = new PgBoostedStore(pool);
const trackers = new PgTrackerStore(pool);
const bossSlots = new PgBossSlotStore(pool);
const forge = new PgForgeStore(pool, itemCatalog);
const imbuements = new PgImbuementStore(pool, itemCatalog);
const proficiency = new PgProficiencyStore(pool);
const cyclopedia = new PgCyclopediaStore(pool);
const markers = new PgMarkerStore(pool);
const outfits = new PgOutfitStore(pool);
const highscores = new PgHighscoreStore(pool);
const bestiary = new PgBestiaryStore(pool);
const wheel = new PgWheelStore(pool);
const gems = new PgGemStore(pool);
const moderation = new PgModerationStore(pool);
const store = new PgMantusStore(pool, itemCatalog);
const chests = new PgChestStore(pool, itemCatalog);
const rewards = new PgRewardStore(pool, itemCatalog);
const daily = new PgDailyRewardStore(pool, itemCatalog);
const worldEvents = new PgWorldEventStore(pool);
const worldItemDeltas =
  serverConfig.map.source === "data"
    ? await new WorldItemSeeder(
        items,
        fileURLToPath(new URL("../data", import.meta.url)),
        serverConfig.map.name,
      ).prepare()
    : undefined;

const server = new GameServer(serverConfig, {
  verifier,
  accounts,
  characters,
  items,
  itemCatalog,
  npcTravel,
  promotion,
  spellTeacher,
  bank,
  shop,
  depot,
  market,
  trade,
  guild,
  pvp,
  house,
  vip,
  friends,
  profiles,
  prey,
  huntingTasks,
  boosted,
  trackers,
  bossSlots,
  forge,
  imbuements,
  proficiency,
  cyclopedia,
  markers,
  outfits,
  highscores,
  bestiary,
  wheel,
  gems,
  moderation,
  store,
  chests,
  rewards,
  daily,
  worldEvents,
  currencyReconciler: new CurrencyReconciler(pool),
  worldItemDeltas,
});
server.start();

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await server.stop();
  await pool.end();
  process.exitCode = server.unsavedPlayerCount > 0 ? 1 : 0;
};
const requestShutdown = () => {
  void shutdown().catch((cause: unknown) => {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.error(`game server shutdown failed: ${reason}`);
    process.exitCode = 1;
  });
};
process.on("SIGINT", requestShutdown);
process.on("SIGTERM", requestShutdown);
