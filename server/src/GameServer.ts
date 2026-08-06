import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
} from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  PROTOCOL_LIMITS,
  type CharacterSex,
  type ClientMessage,
  type PodiumRaceEntry,
} from "@tibia/protocol";
import type { AccountStore } from "./AccountStore";
import { AuthHandler } from "./AuthHandler";
import { CharacterHandler } from "./CharacterHandler";
import { CharacterPersistence } from "./character/CharacterPersistence";
import { CharacterWriteLane } from "./character/CharacterWriteLane";
import { MapCleanupService } from "./world/MapCleanupService";
import { LoginLoadQueue } from "./character/LoginLoadQueue";
import { CharacterService } from "./character/CharacterService";
import { MonsterEventService } from "./creature/MonsterEventService";
import type { CharacterStore } from "./character/CharacterStore";
import { ChatHandler } from "./chat/ChatHandler";
import { Combat } from "./combat/Combat";
import { CombatFormula } from "./combat/CombatFormula";
import { CombatIntentHandler } from "./combat/CombatIntentHandler";
import { projectFightState } from "./combat/projectFightState";
import { SpellRegistry } from "./combat/SpellRegistry";
import type { ServerConfig } from "./config";
import { BankService } from "./economy/BankService";
import { DepotService } from "./depot/DepotService";
import type { DepotStore } from "./depot/DepotStore";
import type { BankStore } from "./economy/BankStore";
import { CurrencyConservationRunner } from "./economy/CurrencyConservationRunner";
import type { CurrencyReconciler } from "./economy/CurrencyReconciler";
import { ShopRestockRunner } from "./economy/ShopRestockRunner";
import { ShopStockCache } from "./economy/ShopStockCache";
import { ShopService } from "./economy/ShopService";
import type { EconomyPersistStore } from "./economy/EconomyPersistStore";
import type { ShopStore } from "./economy/ShopStore";
import { AdminCommandHandler } from "./admin/AdminCommandHandler";
import { GmCommandHandler } from "./gm/GmCommandHandler";
import { GuildService } from "./guild/GuildService";
import type { GuildStore } from "./guild/GuildStore";
import { HouseService } from "./house/HouseService";
import type { HouseStore } from "./house/HouseStore";
import { loadHouseContent } from "./house/loadHouseContent";
import { ClockHandler } from "./action/ClockHandler";
import { loadChestDefinitions } from "./action/loadChestDefinitions";
import { loadDoorLevelRequirements } from "./action/loadDoorLevelRequirements";
import { PressurePlateRegistry } from "./action/PressurePlateRegistry";
import { ExerciseTrainingHandler } from "./action/ExerciseTrainingHandler";
import { RopePullHandler } from "./action/RopePullHandler";
import { ToolUseHandler } from "./action/ToolUseHandler";
import { WorldActionRegistry } from "./action/WorldActionRegistry";
import { WorldActionRng } from "./action/WorldActionRng";
import { ChestService } from "./chest/ChestService";
import type { ChestStore } from "./chest/ChestStore";
import { RewardChestService } from "./reward/RewardChestService";
import type { RewardStore } from "./reward/RewardStore";
import { DailyRewardService } from "./daily/DailyRewardService";
import type { DailyRewardStore } from "./daily/DailyRewardStore";
import { QuestService } from "./quest/QuestService";
import { loadQuestCatalog } from "./quest/loadQuestCatalog";
import { loadQuestStorageAliases } from "./quest/loadQuestStorageAliases";
import { loadWorldEventContent } from "./event/loadWorldEventContent";
import { WorldEventManager } from "./event/WorldEventManager";
import type { WorldEventStore } from "./event/WorldEventStore";
import { LookHandler } from "./look/LookHandler";
import { MarketService } from "./market/MarketService";
import type { MarketStore } from "./market/MarketStore";
import { ModerationCommandHandler } from "./moderation/ModerationCommandHandler";
import { ModerationService } from "./moderation/ModerationService";
import type { ModerationStore } from "./moderation/ModerationStore";
import { ItemValuation } from "./party/ItemValuation";
import { PartyHandler } from "./party/PartyHandler";
import { PVP_POLICY } from "./pvp/PvpPolicy";
import type { PvpStore } from "./pvp/PvpStore";
import { PvpTracker } from "./pvp/PvpTracker";
import { TradeService } from "./trade/TradeService";
import type { TradeStore } from "./trade/TradeStore";
import { LanguageHandler } from "./LanguageHandler";
import { UiSettingsHandler } from "./UiSettingsHandler";
import { ActionBarHandler } from "./ActionBarHandler";
import { ActionBotHandler } from "./ActionBotHandler";
import { LootFilterHandler } from "./LootFilterHandler";
import { HuntingBot } from "./huntingBot/HuntingBot";
import { HuntingBotHandler } from "./huntingBot/HuntingBotHandler";
import { DecayManager } from "./item/DecayManager";
import { ItemIntentHandler } from "./item/ItemIntentHandler";
import type { ItemCatalog } from "./item/ItemCatalog";
import type { ItemStore } from "./item/ItemStore";
import type { WorldItemDeltas } from "./item/WorldItemDeltas";
import { PersistResyncRunner } from "./item/PersistResyncRunner";
import { LingeringPlayers, type CarriedCombatLocks } from "./LingeringPlayers";
import type { Player } from "./Player";
import { MovementHandler } from "./MovementHandler";
import { monotonicNow } from "./monotonicNow";
import { NpcHandler } from "./npc/NpcHandler";
import type { NpcTravelStore } from "./npc/NpcTravelStore";
import type { PromotionStore } from "./npc/PromotionStore";
import { PromotionService } from "./npc/PromotionService";
import { SpellTeacherService } from "./npc/SpellTeacherService";
import type { SpellTeacherStore } from "./npc/SpellTeacherStore";
import { TravelService } from "./npc/TravelService";
import { resolveMapData } from "./resolveMapData";
import { ProgressionSystem } from "./progression/ProgressionSystem";
import { publicStageRates } from "./progression/publicStageRates";
import { PublicApi } from "./PublicApi";
import { Session } from "./Session";
import { SessionRegistry } from "./SessionRegistry";
import { BestiaryService } from "./bestiary/BestiaryService";
import type { BestiaryStore } from "./bestiary/BestiaryStore";
import { BestiaryTracker } from "./bestiary/BestiaryTracker";
import { loadBestiaryCatalog } from "./bestiary/loadBestiaryCatalog";
import { GemAtelierService } from "./wheel/GemAtelierService";
import { GemDropHooks } from "./wheel/GemDropHooks";
import type { CooldownStore } from "./combat/CooldownStore";
import { CooldownTracker } from "./combat/CooldownTracker";
import { persistableCooldowns } from "./combat/persistableCooldowns";
import type { GemStore } from "./wheel/GemStore";
import { GemTracker } from "./wheel/GemTracker";
import { WheelService } from "./wheel/WheelService";
import type { WheelStore } from "./wheel/WheelStore";
import { WheelTracker } from "./wheel/WheelTracker";
import { HighscoreService } from "./social/HighscoreService";
import type { HighscoreStore } from "./social/HighscoreStore";
import { MarkerService } from "./minimap/MarkerService";
import { OutfitService } from "./outfit/OutfitService";
import { getBossMilestones } from "./bestiary/getBossMilestones";
import type { PodiumHooks } from "./podium/PodiumHooks";
import { PodiumService } from "./podium/PodiumService";
import type { OutfitStore } from "./outfit/OutfitStore";
import type { MarkerStore } from "./minimap/MarkerStore";
import { BoostedService } from "./boosted/BoostedService";
import type { BoostedStore } from "./boosted/BoostedStore";
import { ForgeMonsterManager } from "./forge/ForgeMonsterManager";
import { ForgeService } from "./forge/ForgeService";
import type { ForgeStore } from "./forge/ForgeStore";
import { ImbuementService } from "./imbuement/ImbuementService";
import type { ImbuementStore } from "./imbuement/ImbuementStore";
import { loadImbuementCatalog } from "./imbuement/loadImbuementCatalog";
import { AnimusService } from "./proficiency/AnimusService";
import { loadProficiencyCatalog } from "./proficiency/loadProficiencyCatalog";
import { ProficiencyService } from "./proficiency/ProficiencyService";
import type { ProficiencyStore } from "./proficiency/ProficiencyStore";
import { CyclopediaService } from "./cyclopedia/CyclopediaService";
import type { CyclopediaStore } from "./cyclopedia/CyclopediaStore";
import { BossSlotService } from "./bestiary/BossSlotService";
import type { BossSlotStore } from "./bestiary/BossSlotStore";
import { TrackerService } from "./bestiary/TrackerService";
import type { TrackerStore } from "./bestiary/TrackerStore";
import { PreyService } from "./prey/PreyService";
import type { PreyStore } from "./prey/PreyStore";
import { HuntingTaskService } from "./huntingTasks/HuntingTaskService";
import type { HuntingTaskStore } from "./huntingTasks/HuntingTaskStore";
import { ProfileService } from "./profile/ProfileService";
import type { ProfileStore } from "./profile/ProfileStore";
import { FriendService } from "./social/FriendService";
import type { FriendStore } from "./social/FriendStore";
import { VipService } from "./social/VipService";
import type { VipStore } from "./social/VipStore";
import { MantusStoreService } from "./store/MantusStoreService";
import { StoreOperatorService } from "./store/StoreOperatorService";
import type { MantusStoreStore } from "./store/MantusStoreStore";
import { loadCreatureContent } from "./spawn/loadCreatureContent";
import { SpawnManager } from "./spawn/SpawnManager";
import { TickLoop } from "./TickLoop";
import type { TokenVerifier } from "./TokenVerifier";
import { Visibility } from "./Visibility";
import { World } from "./World";

export interface GameServerDeps {
  verifier: TokenVerifier;
  accounts: AccountStore;
  characters: CharacterStore;
  items: ItemStore;
  itemCatalog: ItemCatalog;
  npcTravel?: NpcTravelStore;
  promotion?: PromotionStore;
  spellTeacher?: SpellTeacherStore;
  bank?: BankStore;
  shop?: ShopStore;
  /** Commits memory-first shop and bank operations in one transaction. */
  economyPersist?: EconomyPersistStore;
  depot?: DepotStore;
  market?: MarketStore;
  trade?: TradeStore;
  guild?: GuildStore;
  pvp?: PvpStore;
  house?: HouseStore;
  vip?: VipStore;
  friends?: FriendStore;
  profiles?: ProfileStore;
  prey?: PreyStore;
  huntingTasks?: HuntingTaskStore;
  boosted?: BoostedStore;
  trackers?: TrackerStore;
  bossSlots?: BossSlotStore;
  forge?: ForgeStore;
  imbuements?: ImbuementStore;
  proficiency?: ProficiencyStore;
  cyclopedia?: CyclopediaStore;
  markers?: MarkerStore;
  outfits?: OutfitStore;
  highscores?: HighscoreStore;
  bestiary?: BestiaryStore;
  wheel?: WheelStore;
  gems?: GemStore;
  cooldowns?: CooldownStore;
  moderation?: ModerationStore;
  store?: MantusStoreStore;
  chests?: ChestStore;
  rewards?: RewardStore;
  daily?: DailyRewardStore;
  worldEvents?: WorldEventStore;
  /** Read-only money-supply sweep; absent in tests and memory-only runs. */
  currencyReconciler?: CurrencyReconciler;
  worldItemDeltas?: WorldItemDeltas;
}

export class GameServer {
  private readonly httpServer: HttpServer;
  private readonly wss: WebSocketServer;
  private readonly world: World;
  private readonly registry: SessionRegistry;
  /**
   * Shared by every service that reads per-character state at world entry, so
   * a login's ~15 store reads chain onto one pooled connection instead of
   * checking out one each in the same tick.
   */
  private readonly loginLoads = new LoginLoadQueue();
  private readonly visibility: Visibility;
  private readonly auth: AuthHandler;
  private readonly characters: CharacterHandler;
  private readonly persistence: CharacterPersistence;
  /** Unset when the periodic ground-item sweep is switched off in config. */
  private readonly mapCleanup: MapCleanupService | null;
  private readonly language: LanguageHandler;
  private readonly uiSettings: UiSettingsHandler;
  private readonly actionBar: ActionBarHandler;
  private readonly actionBot: ActionBotHandler;
  private readonly lootFilter: LootFilterHandler;
  private readonly huntingBot: HuntingBot;
  private readonly huntingBotHandler: HuntingBotHandler;
  private readonly movement: MovementHandler;
  private readonly worldActions: WorldActionRegistry;
  private readonly look: LookHandler;
  private readonly pressurePlates: PressurePlateRegistry;
  private readonly clocks: ClockHandler;
  private readonly chests: ChestService;
  private readonly rewards: RewardChestService;
  private readonly daily: DailyRewardService;
  private readonly quests: QuestService;
  private readonly worldEvents: WorldEventManager;
  private readonly toolUse: ToolUseHandler;
  private readonly exerciseTraining: ExerciseTrainingHandler;
  private readonly chat: ChatHandler;
  private readonly combat: CombatIntentHandler;
  private readonly combatSystem: Combat;
  private readonly monsterEvents: MonsterEventService;
  private readonly progression: ProgressionSystem;
  private readonly spells = new SpellRegistry();
  private readonly items: ItemIntentHandler;
  private readonly travel: TravelService;
  private readonly promotion: PromotionService;
  private readonly spellTeacher: SpellTeacherService;
  private readonly bank: BankService;
  private readonly shops: ShopService;
  private readonly shopStock = new ShopStockCache();
  private readonly shopRestock: ShopRestockRunner;
  private readonly currencyConservation: CurrencyConservationRunner;
  private readonly depot: DepotService;
  private readonly persistResync: PersistResyncRunner;
  private readonly market: MarketService;
  private readonly trade: TradeService;
  private readonly parties: PartyHandler;
  private readonly guilds: GuildService;
  private readonly pvp: PvpTracker;
  private readonly houses: HouseService;
  private readonly vips: VipService;
  private readonly friends: FriendService;
  private readonly profiles: ProfileService;
  private readonly prey: PreyService;
  private readonly huntingTasks: HuntingTaskService;
  private readonly boosted: BoostedService;
  private readonly trackers: TrackerService;
  private readonly bossSlots: BossSlotService;
  private readonly forge: ForgeService;
  private readonly forgeMonsters: ForgeMonsterManager | null;
  private readonly imbuements: ImbuementService;
  private readonly proficiency: ProficiencyService;
  private readonly animus: AnimusService;
  private readonly cyclopedia: CyclopediaService;
  private readonly markers: MarkerService;
  private readonly outfits: OutfitService;
  private readonly podium: PodiumService;
  private readonly highscores: HighscoreService;
  private readonly bestiary: BestiaryService;
  private readonly bestiaryTracker: BestiaryTracker;
  private readonly wheel: WheelService;
  private readonly wheelTracker: WheelTracker;
  private readonly cooldownTracker: CooldownTracker;
  private readonly gems: GemAtelierService;
  private readonly gemTracker: GemTracker;
  private readonly gemDrops: GemDropHooks;
  private readonly moderation: ModerationService;
  private readonly store: MantusStoreService;
  private readonly storeOperator: StoreOperatorService;
  private readonly npcs: NpcHandler;
  private readonly spawns: SpawnManager | null;
  private readonly loop: TickLoop;
  private readonly disconnected: Session[] = [];
  private readonly lingering = new LingeringPlayers();
  private heartbeat: NodeJS.Timeout | undefined;
  private readonly startedAt = monotonicNow();
  private stopPromise: Promise<void> | null = null;

  constructor(
    private readonly config: ServerConfig,
    deps: GameServerDeps,
  ) {
    // Dev-auth servers (playtests, local harnesses) drive many headless
    // clients from one host; production keeps the strict per-IP cap.
    this.registry = new SessionRegistry(config.dev.auth ? 64 : undefined);
    this.world = new World(
      resolveMapData(config.map, deps.itemCatalog),
      config.tickMs,
      deps.worldItemDeltas,
      (itemId) => deps.itemCatalog.get(itemId)?.weight,
      (itemId) => {
        const door = deps.itemCatalog.get(itemId)?.door;
        return door ? door.role === "open" : undefined;
      },
      (itemId) => {
        const type = deps.itemCatalog.get(itemId);
        if (type?.kind !== "magicfield") return undefined;
        if (type.name.includes("energy field")) return "energy";
        if (type.name.includes("fire field")) return "fire";
        if (type.name.includes("poison field")) return "poison";
        return undefined;
      },
    );
    this.visibility = new Visibility(
      this.world,
      this.registry,
    );
    this.auth = new AuthHandler(
      this.registry,
      deps.verifier,
      deps.accounts,
      config.authTimeoutMs,
    );
    const characterService = new CharacterService(deps.characters, {
      ...this.world.templePosition,
      townId: config.starterTownId,
    });
    // One lane per character shared by the two writers of their `characters`
    // row, so a snapshot save never aborts an item persist mid-transaction.
    const characterWriteLane = new CharacterWriteLane();
    this.persistence = new CharacterPersistence(
      deps.characters,
      config.characterSaveIntervalMs,
      config.maxCharacterSaveRetries,
      config.characterSaveRetryDelayMs,
      characterWriteLane,
    );
    this.items = new ItemIntentHandler(
      deps.items,
      deps.itemCatalog,
      this.world,
      this.visibility,
      new DecayManager(deps.itemCatalog),
      (characterId) => this.registry.sessionFor(characterId),
    );
    this.items.setCharacterWriteLane(characterWriteLane);
    this.mapCleanup = config.mapCleanup
      ? new MapCleanupService(
          this.world,
          deps.itemCatalog,
          this.items,
          this.registry,
          config.mapCleanup,
          monotonicNow(),
        )
      : null;
    this.items.scheduleWorldDecay(
      deps.worldItemDeltas?.items ?? [],
      deps.worldItemDeltas?.agesMs ?? new Map(),
      monotonicNow(),
    );
    this.depot = new DepotService(
      this.world,
      this.items,
      deps.itemCatalog,
      deps.depot,
    );
    this.persistResync = new PersistResyncRunner(
      this.items,
      this.depot,
      this.registry,
    );
    this.items.setPersistResync((session, characterId) =>
      this.persistResync.start(session, characterId),
    );
    this.market = new MarketService(
      this.items,
      deps.itemCatalog,
      this.depot,
      deps.market,
      this.registry,
    );
    this.trade = new TradeService(
      this.world,
      this.registry,
      this.items,
      deps.items,
      deps.itemCatalog,
      deps.trade,
      this.depot,
    );
    this.moderation = new ModerationService(
      this.registry,
      deps.moderation,
      config.moderationRetentionDays,
      this.loginLoads,
    );
    this.storeOperator = new StoreOperatorService(this.registry, deps.store);
    this.vips = new VipService(
      this.world,
      this.registry,
      deps.vip,
      this.loginLoads,
    );
    this.friends = new FriendService(
      this.world,
      this.registry,
      deps.friends,
      this.loginLoads,
    );
    this.markers = new MarkerService(
      this.world,
      this.registry,
      deps.markers,
      this.loginLoads,
    );
    this.outfits = new OutfitService(
      this.world,
      this.registry,
      this.visibility,
      this.persistence,
      deps.outfits,
      this.loginLoads,
    );
    this.profiles = new ProfileService(
      this.world,
      this.registry,
      (characterId) => this.guilds.guildIdentityOf(characterId)?.guildName ?? null,
      deps.profiles,
      this.loginLoads,
    );
    this.highscores = new HighscoreService(this.world, deps.highscores);
    const creatureContent =
      config.creatures && config.map.source === "data"
        ? loadCreatureContent(config.creatures.contentName, config.map.name)
        : null;
    const bestiaryCatalog = loadBestiaryCatalog(
      creatureContent?.monsterTypes ?? new Map(),
    );
    this.boosted = new BoostedService(
      this.registry,
      bestiaryCatalog,
      new WorldActionRng(config.combatSeed ^ 0x1c8d_44e3),
      deps.boosted,
    );
    this.bestiaryTracker = new BestiaryTracker(
      bestiaryCatalog,
      this.registry,
      deps.bestiary,
      this.boosted,
      config.rates,
    );
    this.trackers = new TrackerService(
      this.registry,
      bestiaryCatalog,
      this.bestiaryTracker,
      deps.trackers,
      this.loginLoads,
    );
    this.bossSlots = new BossSlotService(
      this.registry,
      bestiaryCatalog,
      this.bestiaryTracker,
      this.boosted,
      deps.bossSlots,
      this.loginLoads,
    );
    // A rotating boosted boss leaves every character's slots, online or not
    // (the store cleared offline rows inside the rotation already).
    this.boosted.onRotated = (record) => {
      if (record.bossRaceId !== null) {
        this.bossSlots.onBoostedBossRotated(record.bossRaceId);
      }
    };
    this.forge = new ForgeService(
      this.world,
      this.registry,
      this.items,
      deps.itemCatalog,
      new WorldActionRng(config.combatSeed ^ 0x6b43_9d17),
      deps.forge,
      this.loginLoads,
    );
    let imbuementCatalog: ReturnType<typeof loadImbuementCatalog> | undefined;
    try {
      imbuementCatalog = loadImbuementCatalog();
      this.items.setImbuementCatalog(imbuementCatalog);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`imbuement catalog unavailable: ${reason}`);
    }
    this.imbuements = new ImbuementService(
      this.world,
      this.registry,
      this.items,
      deps.itemCatalog,
      this.depot,
      imbuementCatalog,
      deps.imbuements,
    );
    let proficiencyCatalog: ReturnType<typeof loadProficiencyCatalog> | undefined;
    try {
      proficiencyCatalog = loadProficiencyCatalog();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`proficiency catalog unavailable: ${reason}`);
    }
    this.proficiency = new ProficiencyService(
      this.registry,
      this.items,
      deps.itemCatalog,
      bestiaryCatalog,
      proficiencyCatalog,
      deps.proficiency,
      this.loginLoads,
    );
    this.animus = new AnimusService(
      this.registry,
      bestiaryCatalog,
      deps.proficiency,
      this.loginLoads,
    );
    this.cyclopedia = new CyclopediaService(
      this.world,
      this.registry,
      this.items,
      this.depot,
      {
        effectsFor: (characterId) => this.proficiency.effectsFor(characterId),
        isBoss: (monster) => {
          const raceId = bestiaryCatalog.raceIdByMonsterTypeId.get(
            monster.type.id,
          );
          return (
            raceId !== undefined && bestiaryCatalog.bossesByRaceId.has(raceId)
          );
        },
      },
      deps.cyclopedia,
    );
    this.bestiary = new BestiaryService(
      this.world,
      bestiaryCatalog,
      this.bestiaryTracker,
      this.items,
    );
    this.prey = new PreyService(
      this.world,
      this.registry,
      bestiaryCatalog,
      new WorldActionRng(config.combatSeed ^ 0x51ab_3c7d),
      deps.prey,
      this.loginLoads,
    );
    this.daily = new DailyRewardService(
      this.world,
      this.registry,
      this.items,
      deps.itemCatalog,
      {
        applyWildcardBalance: (characterId, balance) =>
          this.prey.applyWildcardBalance(characterId, balance),
      },
      deps.daily,
      this.loginLoads,
      {
        // `this.progression` is constructed later; the closure resolves it
        // lazily, and the hook only fires from applied outcomes inside ticks.
        notifyCommitted: (player, nowMs) =>
          this.progression.notifyCommittedPlayer(player, nowMs),
      },
    );
    this.huntingTasks = new HuntingTaskService(
      this.world,
      this.registry,
      bestiaryCatalog,
      new WorldActionRng(config.combatSeed ^ 0x77e1_9b25),
      (characterId) => this.bestiaryTracker.killsFor(characterId),
      deps.huntingTasks,
      this.loginLoads,
    );
    // Built after the systems it refreshes: a committed purchase reaches the
    // live world only through these hooks, and each one is refresh-only —
    // the purchase transaction already wrote the durable truth.
    this.store = new MantusStoreService(
      this.world,
      this.registry,
      deps.itemCatalog,
      deps.store,
      {
        entitlementsFor: (characterId) =>
          this.outfits.entitlementsFor(characterId),
        refreshOutfits: (characterId) => this.outfits.refresh(characterId),
        wildcardsOf: (characterId) => this.prey.wildcardsOf(characterId),
        applyWildcardBalance: (characterId, balance) =>
          this.prey.applyWildcardBalance(characterId, balance),
        preySlotsUnlocked: (characterId) =>
          this.prey.allSlotsUnlocked(characterId),
        huntingSlotsUnlocked: (characterId) =>
          this.huntingTasks.allSlotsUnlocked(characterId),
        applyPreySlotUnlock: (characterId, slot) =>
          this.prey.applyStoreSlotUnlock(characterId, slot),
        applyHuntingSlotUnlock: (characterId, slot) =>
          this.huntingTasks.applyStoreSlotUnlock(characterId, slot),
        xpBoostUntilMs: (characterId) => this.daily.xpBoostUntilMs(characterId),
        applyXpBoost: (characterId, untilMs, nowMs) =>
          this.daily.applyXpBoost(characterId, untilMs, nowMs),
        injectDelivery: (characterId, item) =>
          this.depot.injectDelivery(characterId, item),
        applySexChange: (characterId, sex, lookType) =>
          this.applyStoreSexChange(characterId, sex, lookType),
        canTempleTeleport: (characterId) =>
          this.canTempleTeleport(characterId),
        templeTeleport: (characterId) => this.templeTeleport(characterId),
      },
    );
    this.wheelTracker = new WheelTracker(deps.wheel);
    this.gemTracker = new GemTracker(deps.gems);
    this.cooldownTracker = new CooldownTracker(deps.cooldowns);
    this.wheel = new WheelService(
      this.world,
      this.wheelTracker,
      this.persistence,
      this.gemTracker,
      this.items,
    );
    this.gems = new GemAtelierService(
      this.world,
      this.gemTracker,
      this.wheelTracker,
      this.persistence,
      deps.gems,
      undefined,
      this.items,
    );
    this.gemDrops = new GemDropHooks(
      bestiaryCatalog,
      this.registry,
      this.gemTracker,
      this.gems,
    );
    this.guilds = new GuildService(
      this.world,
      this.registry,
      this.visibility,
      deps.guild,
      this.moderation,
      this.items,
    );
    // Relations are read through closures at combat execution time, so the
    // party/guild services (constructed below) are always consulted live.
    this.pvp = new PvpTracker(
      PVP_POLICY,
      this.world,
      this.registry,
      this.visibility,
      this.persistence,
      {
        sameParty: (a, b) => this.parties.sameParty(a, b),
        sameGuild: (a, b) => this.guilds.sameGuild(a, b),
        atWar: (a, b) => this.guilds.areAtWar(a, b),
      },
      deps.pvp,
    );
    this.visibility.setCreatureStateDecorator((viewer, creature, state) =>
      this.pvp.decorateCreatureState(viewer, creature, state),
    );
    this.characters = new CharacterHandler(
      characterService,
      this.world,
      this.registry,
      this.visibility,
      this.persistence,
      this.items,
      this.depot,
      this.spells,
      this.trade,
      this.guilds,
      this.pvp,
      this.vips,
      this.friends,
      this.profiles,
      this.prey,
      this.daily,
      this.huntingTasks,
      this.boosted,
      this.trackers,
      this.bossSlots,
      this.forge,
      this.proficiency,
      this.animus,
      this.markers,
      this.outfits,
      this.moderation,
      this.bestiaryTracker,
      this.wheelTracker,
      this.gemTracker,
      this.cooldownTracker,
      (characterId, now) => this.reclaimLingeringPlayer(characterId, now),
    );
    this.language = new LanguageHandler(this.registry, deps.accounts);
    this.uiSettings = new UiSettingsHandler(this.registry, deps.accounts);
    this.actionBar = new ActionBarHandler(
      this.registry,
      this.world,
      this.spells,
      this.items,
      deps.characters,
    );
    this.actionBot = new ActionBotHandler(
      this.registry,
      this.world,
      this.spells,
      this.items,
      deps.characters,
    );
    this.lootFilter = new LootFilterHandler(
      this.registry,
      this.world,
      this.items,
      deps.characters,
    );
    this.progression = new ProgressionSystem(
      this.world,
      this.registry,
      this.persistence,
      this.items,
      config.rates,
      config.progression.stages,
    );
    this.travel = new TravelService(
      this.world,
      this.visibility,
      this.persistence,
      this.items,
      deps.npcTravel,
    );
    this.promotion = new PromotionService(
      this.world,
      this.persistence,
      this.items,
      this.progression,
      this.spells,
      deps.promotion,
    );
    this.spellTeacher = new SpellTeacherService(
      this.world,
      this.persistence,
      this.items,
      deps.spellTeacher,
    );
    this.bank = new BankService(
      this.world,
      this.items,
      deps.itemCatalog,
      deps.economyPersist,
      deps.bank,
      this.registry,
    );
    // Money joins the items in the per-character cache, so every path that
    // loads an inventory (login and the persist resync) also rebuilds the
    // balance from committed DB state.
    if (deps.bank) {
      const bankStore = deps.bank;
      this.items.setBankBalanceReader((characterId) =>
        bankStore.balance(characterId),
      );
    }
    this.shops = new ShopService(
      this.world,
      this.items,
      creatureContent?.shopCatalogs ?? new Map(),
      deps.itemCatalog,
      this.shopStock,
      deps.economyPersist,
    );
    this.shopRestock = new ShopRestockRunner(
      creatureContent?.shopCatalogs ?? new Map(),
      this.shopStock,
      deps.shop,
    );
    this.currencyConservation = new CurrencyConservationRunner(
      deps.currencyReconciler,
    );
    this.quests = new QuestService(
      this.persistence,
      loadQuestStorageAliases(),
      loadQuestCatalog(),
    );
    this.npcs = new NpcHandler(
      this.world,
      this.registry,
      this.visibility,
      this.travel,
      this.bank,
      this.shops,
      this.promotion,
      this.spellTeacher,
      this.quests,
    );
    this.houses = new HouseService(
      this.world,
      this.registry,
      this.visibility,
      this.persistence,
      this.depot,
      loadHouseContent(this.world.mapName),
      deps.house,
    );
    // Every walk step, door use, and house-tile item move re-checks current
    // owner/access state through these closures at execution time.
    this.world.setHousePolicy((player, position) =>
      this.houses.canUseHouseTile(player.id, position),
    );
    this.items.setHousePolicy((characterId, position) =>
      this.houses.canUseHouseTile(characterId, position),
    );
    // `@guild` / `rank@guild` access-list entries resolve against live
    // membership at every check, never a snapshot from when the list was
    // written.
    this.houses.setGuildIdentityLookup((characterId) =>
      this.guilds.guildIdentityOf(characterId),
    );
    // Eviction sweeps read the item rows on the house tiles, so they must run
    // behind every queued memory-first world-item persist; otherwise an item
    // whose tile write is still in flight is missed and left behind.
    this.houses.setOrderedWrite((operation) =>
      this.items.runOrderedInternalOperation(operation),
    );
    // Achievement grants fire from committed outcomes only; the store's key
    // makes a repeat harmless, so a retried outcome cannot double-award.
    this.houses.setAchievementHook((characterId, achievementId) =>
      this.profiles.grant(characterId, achievementId),
    );
    this.guilds.setAchievementHook((characterId, achievementId) =>
      this.profiles.grant(characterId, achievementId),
    );
    this.movement = new MovementHandler(
      this.world,
      this.visibility,
      this.persistence,
      (session, player, from, now) => {
        this.worldActions.closeDoorBehind(session, player, from, now);
        this.pressurePlates.onStepOut(session, player, from, now);
        this.pressurePlates.onStepIn(session, player, from, now);
        // A step that crosses a protection-zone boundary refreshes the
        // client's fight-state so its PZ status icon appears/clears in step
        // with the move. Server-authoritative and own-tile-only (charter 6).
        if (
          this.world.isProtectionZone(from) !==
          this.world.isProtectionZone(player.position)
        ) {
          session.send({
            type: "fight-state",
            fightState: projectFightState(session, this.world, now),
          });
        }
      },
    );
    // Server-computed paths honour the same house authorization every step
    // check uses, so a route can never lead through a locked house.
    this.movement.setHousePolicy((player, position) =>
      this.houses.canUseHouseTile(player.id, position),
    );
    this.huntingBot = new HuntingBot(this.world, this.movement);
    this.huntingBotHandler = new HuntingBotHandler(
      this.registry,
      this.world,
      deps.characters,
      this.huntingBot,
    );
    this.chests = new ChestService(
      this.items,
      deps.itemCatalog,
      new WorldActionRng(config.combatSeed),
      deps.chests,
      this.quests,
    );
    const podiumHooks: PodiumHooks = {
      outfits: (characterId) =>
        this.outfits.entitlementsFor(characterId).outfits,
      mounts: (characterId) =>
        this.outfits.entitlementsFor(characterId).mounts,
      // Canary getBosstiaryFinished(player, 2): bosses at level 2+.
      bossRaces: (characterId) => {
        const kills = this.bestiaryTracker.killsFor(characterId);
        const races: PodiumRaceEntry[] = [];
        for (const [raceId, boss] of bestiaryCatalog.bossesByRaceId) {
          const milestones = getBossMilestones(
            boss.category,
            kills.get(raceId) ?? 0,
          );
          if (milestones.reached < 2) continue;
          races.push({
            raceId,
            name: boss.monsterType.name,
            outfit: boss.monsterType.outfit,
          });
        }
        return races;
      },
      // Canary getBestiaryFinished: fully completed bestiary races.
      bestiaryRaces: (characterId) => {
        const kills = this.bestiaryTracker.killsFor(characterId);
        const races: PodiumRaceEntry[] = [];
        for (const [raceId, entry] of bestiaryCatalog.entriesByRaceId) {
          if ((kills.get(raceId) ?? 0) < entry.toKill) continue;
          races.push({
            raceId,
            name: entry.monsterType.name,
            outfit: entry.monsterType.outfit,
          });
        }
        return races;
      },
    };
    this.podium = new PodiumService(
      this.world,
      this.items,
      deps.itemCatalog,
      podiumHooks,
      // Podium edits follow furniture rules: guest+ access on the tile.
      (characterId, position) =>
        this.houses.canUseHouseTile(characterId, position),
    );
    this.worldActions = new WorldActionRegistry(
      this.world,
      deps.itemCatalog,
      this.items,
      loadDoorLevelRequirements(this.world.mapName),
      // World actions on a house tile use the door-aware check: a door with
      // its own access list is narrower than the house it stands in.
      (characterId, position) =>
        this.houses.canUseHouseDoor(characterId, position),
      loadChestDefinitions(this.world.mapName),
      (session, player, chest) => this.chests.loot(session, player, chest),
      Date.now,
      (session, player, position, item) =>
        this.podium.open(session, player, position, item),
      (session, player, position, now) =>
        this.daily.openShrine(session, player, position, now),
      // Opens with no item picked; the player chooses one in the window.
      (session, now) =>
        this.imbuements.handleWindowGet(
          session,
          { type: "imbuement-window-get", itemId: null, mode: "item" },
          now,
        ),
      (characterId, position) =>
        this.houses.canDecorateHouseTile(characterId, position),
    );
    // Look descriptions are composed from live state through these closures,
    // so a promotion, party join, or house sale shows up on the next look.
    this.look = new LookHandler(this.world, deps.itemCatalog, {
      house: (position) => this.houses.lookStateFor(position),
      party: (playerId) => this.parties.lookStateFor(playerId),
      guild: (characterId) => {
        const identity = this.guilds.guildIdentityOf(characterId);
        return identity
          ? { rankName: identity.rankName, guildName: identity.guildName }
          : null;
      },
    });
    this.clocks = new ClockHandler(this.items);
    this.pressurePlates = new PressurePlateRegistry(
      this.world,
      deps.itemCatalog,
      this.items,
      (session, player, to, now) =>
        this.movement.teleportPlayer(session, player, to, now),
      (creature, damage, now) =>
        this.combatSystem.applyTileTrapDamage(creature, damage, now),
    );
    this.toolUse = new ToolUseHandler(
      this.world,
      deps.itemCatalog,
      this.items,
      this.movement,
      this.visibility,
      this.persistence,
      this.progression,
      new RopePullHandler(
        this.world,
        deps.itemCatalog,
        this.items,
        this.registry,
        this.visibility,
        this.persistence,
      ),
      new WorldActionRng(config.combatSeed ^ 0x5f37_5a86),
      (typeName, position, now) => {
        spawns?.spawnEventMonsterNear(typeName, position, now);
      },
    );
    this.exerciseTraining = new ExerciseTrainingHandler(
      this.world,
      deps.itemCatalog,
      this.items,
      this.registry,
      this.visibility,
      this.progression,
      config.rates.exerciseTraining,
    );
    this.parties = new PartyHandler(
      this.world,
      this.registry,
      this.visibility,
      this.moderation,
      new ItemValuation(
        deps.itemCatalog,
        creatureContent?.shopCatalogs ?? new Map(),
      ),
      // Read at query time, so flipping the switch hides an advert on the
      // very next listing rather than on the next relogin (Feature 65).
      (characterId) => this.friends.isFinderVisible(characterId),
    );
    // The analyzer's loot and supply totals come only from mutations the item
    // handler itself applied (charter rule 1).
    this.items.setAnalyzerHooks({
      onLooted: (characterId, typeId, count) =>
        this.parties.recordLoot(characterId, typeId, count),
      onSupplyConsumed: (characterId, typeId, count) =>
        this.parties.recordSupply(characterId, typeId, count),
    });
    let spawns: SpawnManager | null = null;
    this.monsterEvents = new MonsterEventService(
      this.world,
      this.persistence,
      this.visibility,
      this.registry,
      this.items,
      config.combatSeed,
      (typeId, position, spawnAt) => {
        return spawns?.spawnEventMonsterNear(typeId, position, spawnAt) ?? null;
      },
      (creatureId, removeAt) => {
        spawns?.removeCreature(creatureId, removeAt);
      },
      (creatureId, typeId, transformAt) =>
        spawns?.transformMonster(creatureId, typeId, transformAt) ?? false,
      this.parties,
    );
    this.rewards = new RewardChestService(
      this.world,
      this.registry,
      this.items,
      deps.itemCatalog,
      {
        slotLootBonusPercent: (characterId, raceId) =>
          this.bossSlots.lootBonusPercentFor(characterId, raceId),
        boostedBossRaceId: () => this.boosted.boostedBossRaceId(),
        raceIdOf: (monster) =>
          bestiaryCatalog.raceIdByMonsterTypeId.get(monster.type.id),
      },
      config.combatSeed,
      config.rates.loot,
      deps.rewards,
      config.rarity,
    );
    this.combatSystem = new Combat(
      this.world,
      this.visibility,
      this.registry,
      this.persistence,
      this.progression,
      this.items,
      config.combatSeed,
      (monster, now) => spawns?.removeCreature(monster.id, now) ?? false,
      this.spells,
      this.parties,
      this.guilds,
      this.pvp,
      config.rates.experience,
      config.rates.loot,
      {
        onMonsterKilled: (damagerIds, monster, killedAt) => {
          this.bestiaryTracker.onMonsterKilled(damagerIds, monster, killedAt);
          this.gemDrops.onMonsterKilled(damagerIds, monster, killedAt);
          this.huntingTasks.onMonsterKilled(damagerIds, monster, killedAt);
          if (monster.forgeStack > 0) {
            // Forge-state kills credit dust to every damager (clamped to
            // each cap in SQL) and start the replenish delay.
            this.forge.creditDusts(damagerIds, monster.forgeStack);
            this.forgeMonsters?.onForgeMonsterDied(monster, killedAt);
          }
          this.proficiency.onMonsterKilled(monster, killedAt);
        },
      },
      this.monsterEvents,
      (session, intent, now) => this.toolUse.handle(session, intent, now),
      {
        magicRope: (session, now) =>
          this.movement.handleMagicRopeSpell(session, now),
        levitate: (session, parameter, now) =>
          this.movement.handleLevitateSpell(session, parameter, now),
      },
      config.progression.staminaSystem,
      config.progression.stages.experience,
      this.prey,
      this.boosted,
      this.animus,
      {
        effectsFor: (characterId) => this.proficiency.effectsFor(characterId),
        isBoss: (monster) => {
          const raceId = bestiaryCatalog.raceIdByMonsterTypeId.get(
            monster.type.id,
          );
          return raceId !== undefined &&
            bestiaryCatalog.bossesByRaceId.has(raceId);
        },
      },
      {
        record: (characterId, level, cause) =>
          this.cyclopedia.recordDeath(characterId, level, cause),
      },
      this.rewards,
      {
        xpBoostPercent: (recipientId, nowMs) =>
          this.daily.xpBoostPercent(recipientId, nowMs),
      },
      config.rarity,
    );
    this.combat = new CombatIntentHandler(
      this.combatSystem,
      deps.accounts,
      this.registry,
      this.world,
      deps.characters,
    );
    spawns =
      creatureContent && config.creatures
        ? new SpawnManager(
            this.world,
            this.visibility,
            creatureContent,
            config.creatures,
            this.combatSystem,
            config.rates.spawn,
          )
        : null;
    this.spawns = spawns;
    if (spawns) this.combatSystem.attachTargeting(spawns);
    spawns?.setRespawnDivisorHook((monsterTypeId) =>
      this.boosted.respawnDelayDivisor(monsterTypeId),
    );
    this.forgeMonsters = spawns
      ? new ForgeMonsterManager(
          this.world,
          this.visibility,
          bestiaryCatalog,
          new WorldActionRng(config.combatSeed ^ 0x3d91_c2af),
          (monster) => spawns.isSummon(monster),
        )
      : null;
    const monsterTypeIdByName = new Map(
      [...(creatureContent?.monsterTypes ?? new Map())].map(([id, type]) => [
        type.name.toLowerCase(),
        id,
      ]),
    );
    this.worldEvents = new WorldEventManager(
      this.world,
      this.registry,
      loadWorldEventContent(this.world.mapName),
      new WorldActionRng(config.combatSeed ^ 0x2545_f491),
      (typeName, position, at) => {
        const typeId = monsterTypeIdByName.get(typeName.toLowerCase());
        if (!typeId) return false;
        return spawns?.spawnEventMonsterNear(typeId, position, at) !== null;
      },
      deps.worldEvents,
    );
    const gm = config.dev.commands
      ? new GmCommandHandler(
          this.world,
          this.visibility,
          this.persistence,
          this.progression,
          this.items,
          spawns,
          this.moderation,
          this.storeOperator,
          this.worldEvents,
          config.rarity,
          new CombatFormula(config.combatSeed ^ 0x5a7e_11d3),
        )
      : undefined;
    this.chat = new ChatHandler(
      this.world,
      this.registry,
      this.visibility,
      this.npcs,
      gm,
      new ModerationCommandHandler(this.moderation),
      new AdminCommandHandler(
        this.world,
        this.visibility,
        this.persistence,
        this.registry,
        deps.moderation ?? null,
      ),
      this.moderation,
      (session, text, now) =>
        this.combatSystem.castSpellByWords(session, text, now),
      undefined,
      config.chat,
    );
    const publicApi = new PublicApi({
      worldName: "Mantus",
      onlinePlayers: () =>
        [...this.world.allPlayers()]
          .filter(
            (player) =>
              this.registry.sessionFor(player.id)?.playerId === player.id,
          )
          .map((player) => ({
            name: player.name,
            level: player.level,
            vocation: player.vocation,
            guildName: player.guildName,
          })),
      isOnline: (characterId) =>
        this.registry.sessionFor(characterId)?.playerId === characterId &&
        this.world.getPlayer(characterId) !== undefined,
      residenceFor: (townId) => this.world.townName(townId),
      boosted: () => this.boosted.publicSelection(),
      highscores: deps.highscores,
      profiles: deps.profiles,
      cyclopedia: deps.cyclopedia,
      guilds: deps.guild,
      serverInfo: {
        maxPlayers: config.maxSessions,
        pvpType: "open-pvp",
        rates: config.rates,
        stages: publicStageRates(config.progression.stages),
        systems: {
          stamina: config.progression.staminaSystem,
          experienceStages: config.progression.stages.experience.length > 0,
          market: true,
          houses: true,
          guildWars: true,
          dailyRewards: true,
        },
        startedAt: new Date(this.startedAt).toISOString(),
      },
    });
    this.httpServer = createServer((request, response) => {
      void publicApi.handle(request, response);
    });
    this.httpServer.maxHeadersCount = 50;
    this.httpServer.maxConnections = config.maxSessions;
    this.httpServer.requestTimeout = 5_000;
    this.httpServer.headersTimeout = 5_000;
    this.httpServer.keepAliveTimeout = 5_000;
    this.httpServer.maxRequestsPerSocket = 100;
    this.wss = new WebSocketServer({
      server: this.httpServer,
      maxPayload: PROTOCOL_LIMITS.maxMessageBytes,
    });
    this.httpServer.listen(config.port);
    this.loop = new TickLoop(config.tickMs, () => this.tick());
  }

  get port(): number {
    const address = this.wss.address();
    return typeof address === "object" && address
      ? address.port
      : this.config.port;
  }

  get unsavedPlayerCount(): number {
    return this.persistence.unsavedPlayerCount;
  }

  get sessionCount(): number {
    return this.registry.size;
  }

  get onlinePlayerCount(): number {
    return this.world.playerCount;
  }

  get monsterCount(): number {
    return this.world.monsterCount;
  }

  start(): void {
    this.wss.on("connection", (socket, request) =>
      this.onConnection(socket, request),
    );
    // Off-tick and idempotent: reconciles finite shop stock with the catalog
    // before the first purchase can reserve any of it.
    void this.shopRestock.seed().catch((cause: unknown) => {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`shop restock seeding failed: ${reason}`);
    });
    void this.worldEvents.start().catch((cause: unknown) => {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`world event registration failed: ${reason}`);
    });
    this.loop.start();
    this.heartbeat = setInterval(
      () => this.pingSessions(),
      this.config.heartbeatMs,
    );
    console.log(
      `game server listening on ws://localhost:${this.port} and ` +
        `http://localhost:${this.port}/api/public/*`,
    );
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.loop.stop();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.stopPromise = this.finishStop();
    return this.stopPromise;
  }

  private onConnection(socket: WebSocket, request: IncomingMessage): void {
    const remoteAddress = this.clientAddress(request);
    if (!this.registry.canAccept(remoteAddress, this.config.maxSessions)) {
      socket.close();
      return;
    }
    const session = new Session(randomUUID(), remoteAddress, socket, {
      maxPendingIntents: this.config.maxPendingIntents,
      maxProtocolViolations: this.config.maxProtocolViolations,
      initialViewRange: this.config.defaultViewRange,
    }, (queued) => {
      this.registry.markForTick(queued);
      // A queued intent wakes the loop instead of waiting out the interval;
      // all validation and mutation still happen inside the tick itself.
      this.loop.requestTick();
    });
    this.registry.add(session);
    // queue the leave; world state only changes inside the tick (charter rule 5)
    socket.on("close", () => this.disconnected.push(session));
  }

  private clientAddress(request: IncomingMessage): string {
    if (this.config.trustProxyHeader) {
      const header = request.headers["fly-client-ip"];
      const ip = Array.isArray(header) ? header[0] : header;
      if (ip) return ip;
    }
    return request.socket.remoteAddress ?? "unknown";
  }

  private tick(): void {
    const now = monotonicNow();
    for (const session of this.registry.all()) session.beginBatch();
    try {
      this.processDisconnects(now);
      this.expireLingeringPlayers(now);
      this.auth.applyResolvedOutcomes();
      this.characters.applyResolvedOutcomes();
      this.items.applyResolvedOutcomes(now);
      this.chests.applyResolvedOutcomes(now);
      this.rewards.applyResolvedOutcomes(now);
      this.daily.applyResolvedOutcomes(now);
      this.travel.applyResolvedOutcomes(now);
      this.promotion.applyResolvedOutcomes(now);
      this.spellTeacher.applyResolvedOutcomes(now);
      this.bank.applyResolvedOutcomes(now);
      this.depot.applyResolvedOutcomes();
      this.persistResync.applyResolvedOutcomes();
      this.market.applyResolvedOutcomes(now);
      this.trade.applyResolvedOutcomes(now);
      this.guilds.applyResolvedOutcomes(now);
      this.houses.applyResolvedOutcomes(now);
      this.vips.applyResolvedOutcomes(now);
      this.friends.applyResolvedOutcomes(now);
      this.profiles.applyResolvedOutcomes(now);
      this.prey.applyResolvedOutcomes(now);
      this.huntingTasks.applyResolvedOutcomes(now);
      this.boosted.applyResolvedOutcomes(now);
      this.trackers.applyResolvedOutcomes(now);
      this.bossSlots.applyResolvedOutcomes(now);
      this.forge.applyResolvedOutcomes(now);
      this.imbuements.applyResolvedOutcomes(now);
      this.proficiency.applyResolvedOutcomes(now);
      this.animus.applyResolvedOutcomes(now);
      this.cyclopedia.applyResolvedOutcomes(now);
      this.markers.applyResolvedOutcomes();
      this.outfits.applyResolvedOutcomes();
      this.profiles.tick(now);
      this.highscores.applyResolvedOutcomes(now);
      this.moderation.applyResolvedOutcomes(now);
      this.moderation.tick(now);
      this.store.applyResolvedOutcomes(now);
      this.storeOperator.applyResolvedOutcomes();
      this.gems.applyResolvedOutcomes(now);
      this.language.applyResolvedOutcomes();
      this.uiSettings.applyResolvedOutcomes();
      this.actionBar.applyResolvedOutcomes();
      this.actionBot.applyResolvedOutcomes();
      this.lootFilter.applyResolvedOutcomes();
      this.huntingBotHandler.applyResolvedOutcomes(now);
      this.combat.applyResolvedOutcomes();
      for (const session of this.registry.awaitingAuth()) {
        this.auth.enforceDeadline(session, now);
      }
      for (const session of this.registry.tickable()) {
        for (const intent of session.drainIntents()) {
          try {
            this.handleIntent(session, intent, now);
          } catch (cause) {
            // One malformed or state-conflicting intent must never take the
            // whole server down; drop the offending connection instead.
            console.error(
              `intent ${intent.type} from session ${session.id} failed:`,
              cause,
            );
            session.terminate();
          }
        }
        this.huntingBot.tick(session, now);
        this.movement.continueMovement(session, now);
        this.registry.finishTick(session);
      }
      this.combatSystem.tick(now);
      this.monsterEvents.tick(now);
      this.spawns?.tick(now);
      this.worldEvents.tick(now);
      this.boosted.tick(now);
      this.forgeMonsters?.tick(now);
      this.imbuements.tick(now);
      this.npcs.tick(now);
      this.items.tickDecay(now);
      this.items.tickWorldContainers();
      this.mapCleanup?.tick(now);
      this.depot.tick(now);
      this.shopRestock.tick(now);
      this.currencyConservation.tick(now);
      this.market.tick(now);
      this.trade.tick(now);
      this.parties.tick(now);
      this.guilds.tick(now);
      this.houses.tick(now);
      this.pvp.tick(now);
      this.exerciseTraining.tick(now);
      this.progression.tick(now);
      this.persistence.tick(now);
    } finally {
      for (const session of this.registry.all()) session.flushBatch();
    }
  }

  private processDisconnects(now: number): void {
    for (const session of this.disconnected.splice(0)) {
      const { playerId } = session;
      const player = playerId ? this.world.getPlayer(playerId) : undefined;
      if (
        playerId &&
        player &&
        this.registry.sessionFor(playerId) === session
      ) {
        // The cooldowns become durable the moment the session goes away —
        // the next login re-reads them, so relogging cannot shed an
        // avatar's two-hour cooldown (charter rule 8).
        this.cooldownTracker.flush(
          playerId,
          persistableCooldowns(session.combatCooldowns, now),
        );
        // Canary keeps an in-fight character in the world until the combat
        // lock expires, so logging out cannot dodge the frag or the skull.
        // Only the session-scoped systems detach; the entity keeps ticking.
        if (
          player.health > 0 &&
          player.conditions.remainingMs("combat-lock", now) > 0
        ) {
          this.lingering.add(player);
          this.npcs.removePlayer(playerId);
          this.trade.detachCharacter(playerId, now);
          this.chat.detach(playerId);
          this.depot.detachCharacter(playerId);
        } else {
          this.leaveWorld(session, playerId, player, now);
        }
      }
      this.depot.detach(session);
      this.market.detach(session);
      this.trade.detach(session);
      this.parties.detach(session);
      this.guilds.detach(session);
      this.houses.detach(session);
      this.vips.detach(session);
      this.friends.detach(session);
      this.profiles.detach(session);
      this.prey.detach(session);
      this.huntingTasks.detach(session);
      this.trackers.detach(session);
      this.bossSlots.detach(session);
      this.forge.detach(session);
      this.imbuements.detach(session);
      this.proficiency.detach(session);
      this.cyclopedia.detach(session);
      this.markers.detach(session);
      this.outfits.detach(session);
      this.highscores.detach(session);
      this.bestiary.detach(session);
      this.wheel.detach(session);
      this.gems.detach(session);
      this.moderation.detach(session);
      this.store.detach(session);
      this.items.detachSession(session);
      this.registry.remove(session);
    }
  }

  /**
   * A reconnecting character reclaims its lingering entity: the entity leaves
   * the world (flushing its damage) and its remaining combat locks are handed
   * back so the fresh player re-enters still locked. There is never a moment
   * with two entities for one character (one session per character).
   */
  private reclaimLingeringPlayer(
    characterId: string,
    now: number,
  ): CarriedCombatLocks | null {
    const carried = this.lingering.retire(characterId, now);
    if (!carried) return null;
    const player = this.world.getPlayer(characterId);
    if (player) {
      this.leaveWorld(undefined, characterId, player, now);
      this.visibility.announceCreatureLeave(player);
    }
    return carried;
  }

  /** The full leave path: every system detaches and the entity is removed. */
  private leaveWorld(
    session: Session | undefined,
    playerId: string,
    player: Player,
    now: number,
  ): void {
    this.npcs.removePlayer(playerId);
    this.exerciseTraining.stop(playerId);
    // Player summons are owned creatures: they leave with their owner so
    // an offline player can never keep monsters alive in the world.
    this.spawns?.releaseSummonsOf(playerId);
    this.parties.detachCharacter(playerId, now);
    this.trade.detachCharacter(playerId, now);
    this.rewards.detachCharacter(playerId);
    this.guilds.detachCharacter(playerId);
    this.houses.detachCharacter(playerId);
    this.vips.detachCharacter(playerId);
    this.friends.detachCharacter(playerId);
    this.profiles.detachCharacter(playerId);
    this.prey.detachCharacter(playerId);
    this.daily.detachCharacter(playerId);
    this.huntingTasks.detachCharacter(playerId);
    this.trackers.detachCharacter(playerId);
    this.bossSlots.detachCharacter(playerId);
    this.forge.detachCharacter(playerId);
    this.imbuements.detachCharacter(playerId, now);
    this.proficiency.detachCharacter(playerId);
    this.animus.detachCharacter(playerId);
    this.outfits.detachCharacter(playerId);
    this.moderation.detachCharacter(playerId);
    this.pvp.detachCharacter(playerId);
    this.bestiaryTracker.detachCharacter(playerId);
    this.wheelTracker.detachCharacter(playerId);
    this.gemTracker.detachCharacter(playerId);
    this.persistence.untrack(player, now);
    this.items.detach(playerId);
    this.chat.detach(playerId);
    this.depot.detachCharacter(playerId);
    this.world.removePlayer(playerId);
    if (session) this.visibility.announceLeave(session, player);
  }

  /**
   * Closes every linger window whose combat lock has expired (or whose
   * character died or already left). Runs inside the tick, never from a
   * socket callback (charter rule 5).
   */
  private expireLingeringPlayers(now: number): void {
    if (this.lingering.size === 0) return;
    for (const player of this.lingering.due(now, (characterId) =>
      this.world.getPlayer(characterId) !== undefined,
    )) {
      if (!this.world.getPlayer(player.id)) continue;
      this.leaveWorld(undefined, player.id, player, now);
      this.visibility.announceCreatureLeave(player);
    }
  }

  private handleIntent(
    session: Session,
    intent: ClientMessage,
    now: number,
  ): void {
    if (intent.type === "auth") {
      this.auth.handle(session, intent);
      return;
    }
    // re-checked at execution time, not enqueue time (charter rule 4)
    if (!session.account) {
      session.sendError("auth-required");
      return;
    }
    switch (intent.type) {
      case "ping":
        // Echoed from the tick loop on purpose: the round trip then includes
        // the intent queue, which is the latency every real action pays.
        session.send({ type: "pong", nonce: intent.nonce });
        return;
      case "list-characters":
        this.characters.handleList(session, intent);
        return;
      case "create-character":
        this.characters.handleCreate(session, intent);
        return;
      case "select-character":
        this.characters.handleSelect(session, intent);
        return;
      case "move":
        this.movement.handle(session, intent, now);
        return;
      case "turn":
        this.movement.handleTurn(session, intent);
        return;
      case "stop-move":
        this.movement.stop(session);
        return;
      case "auto-walk":
        this.movement.handleAutoWalk(session, intent, now);
        return;
      case "set-viewport": {
        if (!session.setViewRange(intent.range) || !session.playerId) return;
        const player = this.world.getPlayer(session.playerId);
        if (player) this.visibility.onViewerRangeChanged(session, player);
        return;
      }
      case "use-map":
        // The instant-use branches (depot, world container, world action) are
        // gated by the 200 ms use exhaust; the walk-to fallback (ladders,
        // stairs, holes) stays governed by the step cooldown, so a walk-click
        // is never blocked by a recent use.
        if (!session.useExhausted(now)) {
          // A quest chest's unique-id registration outranks the generic
          // container-open path in Canary, so it is offered the use first.
          if (this.worldActions.handleChestUse(session, intent.position, now)) {
            session.armUseExhaust(now);
            return;
          }
          if (this.depot.handleMapUse(session, intent.position)) {
            session.armUseExhaust(now);
            return;
          }
          // The reward chest is a normal-looking container on the map, so it
          // must be claimed before the generic world-container open path.
          if (this.rewards.handleMapUse(session, intent.position, now)) {
            session.armUseExhaust(now);
            return;
          }
          if (this.items.handleMapOpen(session, intent.position)) {
            session.armUseExhaust(now);
            return;
          }
          if (this.worldActions.handleUseMap(session, intent.position, now)) {
            session.armUseExhaust(now);
            return;
          }
        }
        this.movement.handleUseMap(session, intent, now);
        return;
      case "look":
        this.look.handle(session, intent);
        return;
      case "attack-target":
      case "cancel-attack":
      case "follow-creature":
      case "cancel-follow":
      case "reset-combat-analyzer":
      case "set-aim-at-target-spells":
      case "set-fight-mode":
      case "cast-spell":
      case "use-rune":
      case "use-potion":
      case "activate-action-bar":
        this.combat.handle(session, intent, now);
        return;
      case "use-item-with":
        if (session.useExhausted(now)) {
          session.sendError("item-exhausted");
          return;
        }
        session.armUseExhaust(now);
        if (this.exerciseTraining.handle(session, intent, now)) return;
        if (this.toolUse.handle(session, intent, now)) return;
        this.items.handle(session, intent, now);
        return;
      case "use-item":
        // Generic item use (food, tools, readables, world-action items) is
        // exhaust-gated; container open/move/equip flows are not "uses".
        if (session.useExhausted(now)) {
          session.sendError("item-exhausted");
          return;
        }
        session.armUseExhaust(now);
        // Canary registers the watch action by item id, ahead of the generic
        // item-use path; it only reads the world clock.
        if (this.clocks.handleUseItem(session, intent)) return;
        this.items.handle(session, intent, now);
        return;
      case "equip-item":
      case "unequip-item":
      case "pickup-item":
      case "drop-item":
      case "move-map-item":
      case "open-container":
      case "close-container":
      case "loot-item":
      case "open-world-container":
      case "quick-loot":
      case "stack-container":
      case "sort-container":
      case "close-world-container":
      case "split-stack":
      case "rotate-item":
      case "move-item":
      case "write-item":
        this.items.handle(session, intent, now);
        return;
      case "write-map-item":
        if (session.useExhausted(now)) {
          session.sendError("item-exhausted");
          return;
        }
        session.armUseExhaust(now);
        this.worldActions.handleWriteMap(session, intent, now);
        return;
      case "speak":
      case "private-chat":
      case "chat-typing":
      case "channel-list-get":
      case "channel-open":
      case "channel-close":
      case "channel-speak":
      case "ignore-add":
      case "ignore-remove":
        this.chat.handle(session, intent, now);
        return;
      case "npc-dialogue-greet":
        this.npcs.handleGreeting(session, intent, now);
        return;
      case "npc-dialogue-choice":
        this.npcs.handleChoice(session, intent, now);
        return;
      case "bank-deposit":
      case "bank-withdraw":
      case "bank-transfer":
        this.bank.handle(session, intent, now);
        return;
      case "shop-buy":
      case "shop-sell":
        this.shops.handle(session, intent, now);
        return;
      case "depot-deposit":
      case "depot-withdraw":
      case "depot-browse":
      case "stash-deposit":
      case "stash-withdraw":
      case "close-depot":
      case "send-mail":
      case "close-mailbox":
        this.depot.handle(session, intent);
        return;
      case "market-open":
      case "market-browse":
      case "market-create-offer":
      case "market-accept-offer":
      case "market-cancel-offer":
      case "market-own-offers":
      case "market-own-history":
        this.market.handle(session, intent, now);
        return;
      case "trade-request":
      case "trade-accept":
      case "trade-cancel":
        this.trade.handle(session, intent, now);
        return;
      case "party-invite":
      case "party-respond-invite":
      case "party-revoke-invite":
      case "party-leave":
      case "party-kick":
      case "party-pass-leadership":
      case "party-set-shared-exp":
      case "party-reset-analyzer":
      case "party-set-analyzer-price-mode":
      case "party-finder-advertise":
      case "party-finder-list":
      case "party-chat":
        this.parties.handle(session, intent, now);
        return;
      case "guild-create":
      case "guild-invite":
      case "guild-respond-invite":
      case "guild-revoke-invite":
      case "guild-kick":
      case "guild-leave":
      case "guild-promote":
      case "guild-demote":
      case "guild-pass-leadership":
      case "guild-disband":
      case "guild-set-motd":
      case "guild-set-nick":
      case "guild-set-rank-name":
      case "guild-open":
      case "guild-chat":
      case "guild-declare-war":
      case "guild-respond-war":
      case "guild-end-war":
      case "guild-deposit":
      case "guild-withdraw":
        this.guilds.handle(session, intent, now);
        return;
      case "house-open":
      case "house-buy":
      case "house-bid":
      case "house-abandon":
      case "house-transfer-offer":
      case "house-transfer-respond":
      case "house-transfer-cancel":
      case "house-set-access":
      case "house-set-list":
      case "house-kick":
      case "house-browse":
        this.houses.handle(session, intent, now);
        return;
      case "vip-add":
      case "vip-remove":
      case "vip-edit":
      case "vip-group-create":
      case "vip-group-delete":
      case "vip-assign-group":
        this.vips.handle(session, intent, now);
        return;
      case "friend-request":
      case "friend-respond":
      case "friend-remove":
      case "social-set-settings":
        this.friends.handle(session, intent, now);
        return;
      case "character-profile-get":
      case "profile-select-title":
      case "bug-report":
        this.profiles.handle(session, intent, now);
        return;
      case "prey-action":
        this.prey.handle(session, intent, now);
        return;
      case "hunting-task-action":
        this.huntingTasks.handle(session, intent, now);
        return;
      case "walk-to":
        this.movement.handleWalkTo(session, intent, now);
        return;
      case "minimap-marker-set":
      case "minimap-marker-delete":
        this.markers.handle(session, intent, now);
        return;
      case "outfit-get":
      case "outfit-select":
        this.outfits.handle(session, intent, now);
        return;
      case "podium-set":
        this.podium.handleSet(session, intent, now);
        return;
      case "reward-collect":
        this.rewards.handleCollect(session, intent, now);
        return;
      case "daily-claim":
        this.daily.handleClaim(session, intent, now);
        return;
      case "daily-history-get":
        this.daily.handleHistoryGet(session, now);
        return;
      case "daily-state-get":
        this.daily.handleStateGet(session, now);
        return;
      case "quest-log-get": {
        const questPlayer = session.playerId
          ? this.world.getPlayer(session.playerId)
          : undefined;
        if (questPlayer) this.quests.handleLogGet(session, questPlayer, now);
        return;
      }
      case "quest-line-get": {
        const questPlayer = session.playerId
          ? this.world.getPlayer(session.playerId)
          : undefined;
        if (questPlayer) {
          this.quests.handleLineGet(session, questPlayer, intent, now);
        }
        return;
      }
      case "store-open":
      case "store-category":
      case "store-description":
      case "store-purchase":
      case "store-history":
        this.store.handle(session, intent, now);
        return;
      case "highscores-get":
        this.highscores.handle(session, intent, now);
        return;
      case "bestiary-creatures-get":
        this.bestiary.handleCreatures(session, now);
        return;
      case "bestiary-monster-get":
        this.bestiary.handleMonster(session, intent, now);
        return;
      case "bosstiary-get":
        this.bestiary.handleBosstiary(session, now);
        return;
      case "bosstiary-boss-get":
        this.bestiary.handleBoss(session, intent, now);
        return;
      case "wiki-item-sources-get":
        this.bestiary.handleItemSources(session, intent, now);
        return;
      case "tracker-set":
        this.trackers.handle(session, intent, now);
        return;
      case "boss-slots-get":
        this.bossSlots.handleGet(session, now);
        return;
      case "boss-slot-set":
        this.bossSlots.handleSet(session, intent, now);
        return;
      case "forge-get":
        this.forge.handleGet(session, now);
        return;
      case "forge-fusion":
        this.forge.handleFusion(session, intent, now);
        return;
      case "forge-transfer":
        this.forge.handleTransfer(session, intent, now);
        return;
      case "forge-conversion":
        this.forge.handleConversion(session, intent, now);
        return;
      case "forge-history-get":
        this.forge.handleHistory(session, intent, now);
        return;
      case "imbuement-window-get":
        this.imbuements.handleWindowGet(session, intent, now);
        return;
      case "imbuement-apply":
        this.imbuements.handleApply(session, intent, now);
        return;
      case "imbuement-clear":
        this.imbuements.handleClear(session, intent, now);
        return;
      case "imbuement-scroll-create":
        this.imbuements.handleScrollCreate(session, intent, now);
        return;
      case "imbuement-scroll-apply":
        this.imbuements.handleScrollApply(session, intent, now);
        return;
      case "proficiency-get":
        this.proficiency.handleGet(session, now);
        return;
      case "proficiency-select":
        this.proficiency.handleSelect(session, intent, now);
        return;
      case "cyclopedia-character-get":
        this.cyclopedia.handle(session, intent, now);
        return;
      case "wheel-get":
        this.wheel.handleGet(session, now);
        return;
      case "wheel-save":
        this.wheel.handleSave(session, intent, now);
        return;
      case "wheel-gems-get":
        this.gems.handleGet(session, now);
        return;
      case "wheel-gem-action":
        this.gems.handleAction(session, intent, now);
        return;
      case "report-player":
        this.moderation.handleReport(session, intent, now);
        return;
      case "set-language":
        this.language.handle(session, intent);
        return;
      case "update-ui-settings":
        this.uiSettings.handle(session, intent);
        return;
      case "update-action-bar":
        this.actionBar.handle(session, intent);
        return;
      case "update-action-bot":
        this.actionBot.handle(session, intent);
        return;
      case "update-loot-filter":
        this.lootFilter.handleUpdate(session, intent);
        return;
      case "loot-filter-items-get":
        this.lootFilter.handleItemsGet(session, now);
        return;
      case "update-hunting-bot-route":
      case "set-hunting-bot-enabled":
        this.huntingBotHandler.handle(session, intent, now);
        return;
    }
  }

  private pingSessions(): void {
    for (const session of this.registry.all()) {
      if (!session.isAlive) {
        session.terminate();
        continue;
      }
      session.ping();
    }
  }

  private async finishStop(): Promise<void> {
    await this.travel.stop();
    this.travel.applyResolvedOutcomes(monotonicNow());
    await this.promotion.stop();
    this.promotion.applyResolvedOutcomes(monotonicNow());
    await this.spellTeacher.stop();
    this.spellTeacher.applyResolvedOutcomes(monotonicNow());
    await this.bank.stop();
    this.bank.applyResolvedOutcomes(monotonicNow());
    // The shop writes nothing of its own: its transactions ride the shared item
    // persist lane, drained by `items.stopPersists()` below.
    await this.shopRestock.stop();
    await this.currencyConservation.stop();
    await this.market.stop();
    this.market.applyResolvedOutcomes(monotonicNow());
    await this.trade.stop();
    this.trade.applyResolvedOutcomes(monotonicNow());
    await this.guilds.stop();
    this.guilds.applyResolvedOutcomes(monotonicNow());
    await this.houses.stop();
    this.houses.applyResolvedOutcomes(monotonicNow());
    await this.vips.stop();
    this.vips.applyResolvedOutcomes(monotonicNow());
    await this.friends.stop();
    this.friends.applyResolvedOutcomes(monotonicNow());
    await this.profiles.stop();
    this.profiles.applyResolvedOutcomes(monotonicNow());
    await this.prey.stop();
    this.prey.applyResolvedOutcomes(monotonicNow());
    await this.huntingTasks.stop();
    this.huntingTasks.applyResolvedOutcomes(monotonicNow());
    await this.boosted.stop();
    this.boosted.applyResolvedOutcomes(monotonicNow());
    await this.trackers.stop();
    this.trackers.applyResolvedOutcomes(monotonicNow());
    await this.bossSlots.stop();
    this.bossSlots.applyResolvedOutcomes(monotonicNow());
    await this.forge.stop();
    this.forge.applyResolvedOutcomes(monotonicNow());
    await this.imbuements.stop();
    this.imbuements.applyResolvedOutcomes(monotonicNow());
    await this.proficiency.stop();
    this.proficiency.applyResolvedOutcomes(monotonicNow());
    await this.animus.stop();
    this.animus.applyResolvedOutcomes(monotonicNow());
    await this.cyclopedia.stop();
    this.cyclopedia.applyResolvedOutcomes(monotonicNow());
    await this.markers.stop();
    this.markers.applyResolvedOutcomes();
    await this.outfits.stop();
    this.outfits.applyResolvedOutcomes();
    await this.highscores.stop();
    this.highscores.applyResolvedOutcomes(monotonicNow());
    await this.moderation.stop();
    this.moderation.applyResolvedOutcomes(monotonicNow());
    await this.store.stop();
    this.store.applyResolvedOutcomes(monotonicNow());
    await this.storeOperator.stop();
    this.storeOperator.applyResolvedOutcomes();
    await this.chests.stop();
    this.chests.applyResolvedOutcomes(monotonicNow());
    await this.rewards.stop();
    this.rewards.applyResolvedOutcomes(monotonicNow());
    await this.daily.stop();
    this.daily.applyResolvedOutcomes(monotonicNow());
    await this.worldEvents.stop();
    await this.pvp.stop();
    await this.bestiaryTracker.stop();
    await this.wheelTracker.stop();
    await this.gems.stop();
    this.gems.applyResolvedOutcomes(monotonicNow());
    // Sessions never pass through processDisconnects at shutdown, so their
    // cooldowns are swept here before the sockets are terminated.
    for (const session of this.registry.all()) {
      const { playerId } = session;
      if (!playerId) continue;
      this.cooldownTracker.flush(
        playerId,
        persistableCooldowns(session.combatCooldowns, monotonicNow()),
      );
    }
    await this.cooldownTracker.stop();
    await this.depot.stop();
    this.depot.applyResolvedOutcomes();
    await this.items.stopPersists();
    this.items.applyResolvedOutcomes(monotonicNow());
    await this.persistResync.stop();
    this.persistResync.applyResolvedOutcomes();
    await this.persistence.stop();
    if (this.persistence.unsavedPlayerCount > 0) {
      console.error(
        `game server stopped with ${this.persistence.unsavedPlayerCount} unsaved player(s)`,
      );
    }
    for (const session of this.registry.all()) session.terminate();
    const httpClosed = new Promise<void>((resolve, reject) => {
      this.httpServer.close((cause) => {
        if (cause) {
          reject(cause);
          return;
        }
        resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.wss.close((cause) => {
        if (cause) {
          reject(cause);
          return;
        }
        resolve();
      });
    });
    await httpClosed;
  }

  /**
   * Adopts a sex change the store already committed. The worn look type moved
   * with it in the same transaction, so the live creature only has to catch
   * up — and the new outfit reaches other players' views through the normal
   * creature-state push, never as an unentitled one (charter rule 6).
   */
  private applyStoreSexChange(
    characterId: string,
    sex: CharacterSex,
    lookType: number,
  ): void {
    const player = this.world.getPlayer(characterId);
    if (!player) return;
    player.setSex(sex);
    player.outfit = { ...player.outfit, lookType, addons: 0 };
    this.visibility.onCreatureStateChanged(player);
    this.persistence.markDirty(player);
  }

  /**
   * Canary's temple-teleport rule: allowed inside a protection zone, refused
   * outside one while the pz-lock from a fight is running. Read from live
   * state at execution time, never from anything the client sent.
   */
  private canTempleTeleport(characterId: string): boolean {
    const player = this.world.getPlayer(characterId);
    if (!player) return false;
    if (this.world.isProtectionZone(player.position)) return true;
    return !player.conditions.has("pz-lock");
  }

  private templeTeleport(characterId: string): void {
    const player = this.world.getPlayer(characterId);
    const session = this.registry.sessionFor(characterId);
    if (!player || !session) return;
    const destination = this.world.findUnoccupiedPosition(
      this.world.templePosition,
      2,
    );
    if (!destination) return;
    session.movementDirection = null;
    session.bufferedMovementDirection = null;
    session.autoWalkDirections = [];
    if (session.attackTargetId) {
      session.attackTargetId = null;
      session.send({ type: "attack-target-changed", creatureId: null });
    }
    const from = this.world.relocateCreature(player, destination);
    this.visibility.onPlayerTeleported(session, player, from);
    this.persistence.markDirty(player);
  }
}
