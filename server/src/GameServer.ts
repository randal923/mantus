import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { PROTOCOL_LIMITS, type ClientMessage } from "@tibia/protocol";
import type { AccountStore } from "./AccountStore";
import { AuthHandler } from "./AuthHandler";
import { CharacterHandler } from "./CharacterHandler";
import { CharacterPersistence } from "./character/CharacterPersistence";
import { CharacterService } from "./character/CharacterService";
import { MonsterEventService } from "./creature/MonsterEventService";
import type { CharacterStore } from "./character/CharacterStore";
import { ChatHandler } from "./chat/ChatHandler";
import { Combat } from "./combat/Combat";
import { CombatIntentHandler } from "./combat/CombatIntentHandler";
import { SpellRegistry } from "./combat/SpellRegistry";
import type { ServerConfig } from "./config";
import { BankService } from "./economy/BankService";
import { DepotService } from "./depot/DepotService";
import type { DepotStore } from "./depot/DepotStore";
import type { BankStore } from "./economy/BankStore";
import { ShopService } from "./economy/ShopService";
import type { ShopStore } from "./economy/ShopStore";
import { GmCommandHandler } from "./gm/GmCommandHandler";
import { GuildService } from "./guild/GuildService";
import type { GuildStore } from "./guild/GuildStore";
import { HouseService } from "./house/HouseService";
import type { HouseStore } from "./house/HouseStore";
import { loadHouseContent } from "./house/loadHouseContent";
import { loadDoorLevelRequirements } from "./action/loadDoorLevelRequirements";
import { ToolUseHandler } from "./action/ToolUseHandler";
import { WorldActionRegistry } from "./action/WorldActionRegistry";
import { MarketService } from "./market/MarketService";
import type { MarketStore } from "./market/MarketStore";
import { ModerationService } from "./moderation/ModerationService";
import type { ModerationStore } from "./moderation/ModerationStore";
import { PartyHandler } from "./party/PartyHandler";
import { PVP_POLICY } from "./pvp/PvpPolicy";
import type { PvpStore } from "./pvp/PvpStore";
import { PvpTracker } from "./pvp/PvpTracker";
import { TradeService } from "./trade/TradeService";
import type { TradeStore } from "./trade/TradeStore";
import { LanguageHandler } from "./LanguageHandler";
import { UiSettingsHandler } from "./UiSettingsHandler";
import { ActionBarHandler } from "./ActionBarHandler";
import { DecayManager } from "./item/DecayManager";
import { ItemIntentHandler } from "./item/ItemIntentHandler";
import type { ItemCatalog } from "./item/ItemCatalog";
import type { ItemStore } from "./item/ItemStore";
import type { WorldItemDeltas } from "./item/WorldItemDeltas";
import { MovementHandler } from "./MovementHandler";
import { monotonicNow } from "./monotonicNow";
import { NpcHandler } from "./npc/NpcHandler";
import type { NpcTravelStore } from "./npc/NpcTravelStore";
import type { PromotionStore } from "./npc/PromotionStore";
import { PromotionService } from "./npc/PromotionService";
import { TravelService } from "./npc/TravelService";
import { resolveMapData } from "./resolveMapData";
import { ProgressionSystem } from "./progression/ProgressionSystem";
import { Session } from "./Session";
import { SessionRegistry } from "./SessionRegistry";
import { BestiaryService } from "./bestiary/BestiaryService";
import type { BestiaryStore } from "./bestiary/BestiaryStore";
import { BestiaryTracker } from "./bestiary/BestiaryTracker";
import { loadBestiaryCatalog } from "./bestiary/loadBestiaryCatalog";
import { GemAtelierService } from "./wheel/GemAtelierService";
import { GemDropHooks } from "./wheel/GemDropHooks";
import type { GemStore } from "./wheel/GemStore";
import { GemTracker } from "./wheel/GemTracker";
import { WheelService } from "./wheel/WheelService";
import type { WheelStore } from "./wheel/WheelStore";
import { WheelTracker } from "./wheel/WheelTracker";
import { HighscoreService } from "./social/HighscoreService";
import type { HighscoreStore } from "./social/HighscoreStore";
import { VipService } from "./social/VipService";
import type { VipStore } from "./social/VipStore";
import { MantusStoreService } from "./store/MantusStoreService";
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
  bank?: BankStore;
  shop?: ShopStore;
  depot?: DepotStore;
  market?: MarketStore;
  trade?: TradeStore;
  guild?: GuildStore;
  pvp?: PvpStore;
  house?: HouseStore;
  vip?: VipStore;
  highscores?: HighscoreStore;
  bestiary?: BestiaryStore;
  wheel?: WheelStore;
  gems?: GemStore;
  moderation?: ModerationStore;
  store?: MantusStoreStore;
  worldItemDeltas?: WorldItemDeltas;
}

export class GameServer {
  private readonly wss: WebSocketServer;
  private readonly world: World;
  private readonly registry: SessionRegistry;
  private readonly visibility: Visibility;
  private readonly auth: AuthHandler;
  private readonly characters: CharacterHandler;
  private readonly persistence: CharacterPersistence;
  private readonly language: LanguageHandler;
  private readonly uiSettings: UiSettingsHandler;
  private readonly actionBar: ActionBarHandler;
  private readonly movement: MovementHandler;
  private readonly worldActions: WorldActionRegistry;
  private readonly toolUse: ToolUseHandler;
  private readonly chat: ChatHandler;
  private readonly combat: CombatIntentHandler;
  private readonly combatSystem: Combat;
  private readonly monsterEvents: MonsterEventService;
  private readonly progression: ProgressionSystem;
  private readonly spells = new SpellRegistry();
  private readonly items: ItemIntentHandler;
  private readonly travel: TravelService;
  private readonly promotion: PromotionService;
  private readonly bank: BankService;
  private readonly shops: ShopService;
  private readonly depot: DepotService;
  private readonly market: MarketService;
  private readonly trade: TradeService;
  private readonly parties: PartyHandler;
  private readonly guilds: GuildService;
  private readonly pvp: PvpTracker;
  private readonly houses: HouseService;
  private readonly vips: VipService;
  private readonly highscores: HighscoreService;
  private readonly bestiary: BestiaryService;
  private readonly bestiaryTracker: BestiaryTracker;
  private readonly wheel: WheelService;
  private readonly wheelTracker: WheelTracker;
  private readonly gems: GemAtelierService;
  private readonly gemTracker: GemTracker;
  private readonly gemDrops: GemDropHooks;
  private readonly moderation: ModerationService;
  private readonly store: MantusStoreService;
  private readonly npcs: NpcHandler;
  private readonly spawns: SpawnManager | null;
  private readonly loop: TickLoop;
  private readonly disconnected: Session[] = [];
  private heartbeat: NodeJS.Timeout | undefined;
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
    this.persistence = new CharacterPersistence(
      deps.characters,
      config.characterSaveIntervalMs,
      config.maxCharacterSaveRetries,
      config.characterSaveRetryDelayMs,
    );
    this.items = new ItemIntentHandler(
      deps.items,
      deps.itemCatalog,
      this.world,
      this.visibility,
      new DecayManager(deps.itemCatalog),
    );
    this.items.scheduleWorldDecay(
      deps.worldItemDeltas?.items ?? [],
      monotonicNow(),
    );
    this.depot = new DepotService(
      this.world,
      this.items,
      deps.itemCatalog,
      deps.depot,
    );
    this.market = new MarketService(
      this.items,
      deps.itemCatalog,
      this.depot,
      deps.market,
    );
    this.trade = new TradeService(
      this.world,
      this.registry,
      this.items,
      deps.items,
      deps.itemCatalog,
      deps.trade,
    );
    this.moderation = new ModerationService(this.registry, deps.moderation);
    this.store = new MantusStoreService(
      this.world,
      this.registry,
      deps.store,
    );
    this.vips = new VipService(this.world, this.registry, deps.vip);
    this.highscores = new HighscoreService(this.world, deps.highscores);
    const creatureContent =
      config.creatures && config.map.source === "data"
        ? loadCreatureContent(config.creatures.contentName, config.map.name)
        : null;
    const bestiaryCatalog = loadBestiaryCatalog(
      creatureContent?.monsterTypes ?? new Map(),
    );
    this.bestiaryTracker = new BestiaryTracker(
      bestiaryCatalog,
      this.registry,
      deps.bestiary,
    );
    this.bestiary = new BestiaryService(
      this.world,
      bestiaryCatalog,
      this.bestiaryTracker,
      this.items,
    );
    this.wheelTracker = new WheelTracker(deps.wheel);
    this.gemTracker = new GemTracker(deps.gems);
    this.wheel = new WheelService(
      this.world,
      this.wheelTracker,
      this.persistence,
      this.gemTracker,
    );
    this.gems = new GemAtelierService(
      this.world,
      this.gemTracker,
      this.wheelTracker,
      this.persistence,
      deps.gems,
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
      this.moderation,
      this.bestiaryTracker,
      this.wheelTracker,
      this.gemTracker,
    );
    this.language = new LanguageHandler(this.registry, deps.accounts);
    this.uiSettings = new UiSettingsHandler(this.registry, deps.accounts);
    this.actionBar = new ActionBarHandler(
      this.registry,
      this.world,
      this.spells,
      deps.characters,
    );
    this.progression = new ProgressionSystem(
      this.world,
      this.registry,
      this.persistence,
      this.items,
      config.rates,
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
    this.bank = new BankService(this.world, this.items, deps.bank);
    this.shops = new ShopService(
      this.world,
      this.items,
      creatureContent?.shopCatalogs ?? new Map(),
      deps.shop,
    );
    this.npcs = new NpcHandler(
      this.world,
      this.registry,
      this.visibility,
      this.travel,
      this.bank,
      this.shops,
      this.promotion,
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
    this.movement = new MovementHandler(
      this.world,
      this.visibility,
      this.persistence,
      (session, player, from, now) =>
        this.worldActions.closeDoorBehind(session, player, from, now),
    );
    this.worldActions = new WorldActionRegistry(
      this.world,
      deps.itemCatalog,
      this.items,
      loadDoorLevelRequirements(this.world.mapName),
      (characterId, position) =>
        this.houses.canUseHouseTile(characterId, position),
    );
    this.toolUse = new ToolUseHandler(
      this.world,
      deps.itemCatalog,
      this.items,
      this.movement,
    );
    this.parties = new PartyHandler(
      this.world,
      this.registry,
      this.visibility,
      this.moderation,
    );
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
        },
      },
      this.monsterEvents,
    );
    this.combat = new CombatIntentHandler(
      this.combatSystem,
      deps.accounts,
      this.registry,
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
    const gm = config.dev.commands
      ? new GmCommandHandler(
          this.world,
          this.visibility,
          this.persistence,
          this.progression,
          this.items,
          spawns,
          this.moderation,
        )
      : undefined;
    this.chat = new ChatHandler(
      this.world,
      this.registry,
      this.visibility,
      this.npcs,
      gm,
      this.moderation,
    );
    this.wss = new WebSocketServer({
      port: config.port,
      maxPayload: PROTOCOL_LIMITS.maxMessageBytes,
    });
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

  start(): void {
    this.wss.on("connection", (socket, request) =>
      this.onConnection(socket, request),
    );
    this.loop.start();
    this.heartbeat = setInterval(
      () => this.pingSessions(),
      this.config.heartbeatMs,
    );
    console.log(`game server listening on ws://localhost:${this.port}`);
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
    this.processDisconnects(now);
    this.auth.applyResolvedOutcomes();
    this.characters.applyResolvedOutcomes();
    this.items.applyResolvedOutcomes(now);
    this.travel.applyResolvedOutcomes(now);
    this.promotion.applyResolvedOutcomes(now);
    this.bank.applyResolvedOutcomes(now);
    this.shops.applyResolvedOutcomes(now);
    this.depot.applyResolvedOutcomes();
    this.market.applyResolvedOutcomes(now);
    this.trade.applyResolvedOutcomes(now);
    this.guilds.applyResolvedOutcomes(now);
    this.houses.applyResolvedOutcomes(now);
    this.vips.applyResolvedOutcomes(now);
    this.highscores.applyResolvedOutcomes(now);
    this.moderation.applyResolvedOutcomes(now);
    this.store.applyResolvedOutcomes(now);
    this.gems.applyResolvedOutcomes(now);
    this.language.applyResolvedOutcomes();
    this.uiSettings.applyResolvedOutcomes();
    this.actionBar.applyResolvedOutcomes();
    this.combat.applyResolvedOutcomes();
    for (const session of this.registry.all()) {
      this.auth.enforceDeadline(session, now);
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
      this.movement.continueMovement(session, now);
    }
    this.combatSystem.tick(now);
    this.monsterEvents.tick(now);
    this.spawns?.tick(now);
    this.npcs.tick(now);
    this.items.tickDecay(now);
    this.items.tickWorldContainers();
    this.depot.tick(now);
    this.market.tick(now);
    this.trade.tick(now);
    this.parties.tick(now);
    this.guilds.tick(now);
    this.houses.tick(now);
    this.pvp.tick(now);
    this.progression.tick(now);
    this.persistence.tick(now);
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
        this.npcs.removePlayer(playerId);
        this.parties.detachCharacter(playerId, now);
        this.trade.detachCharacter(playerId, now);
        this.guilds.detachCharacter(playerId);
        this.houses.detachCharacter(playerId);
        this.vips.detachCharacter(playerId);
        this.moderation.detachCharacter(playerId);
        this.pvp.detachCharacter(playerId);
        this.bestiaryTracker.detachCharacter(playerId);
        this.wheelTracker.detachCharacter(playerId);
        this.gemTracker.detachCharacter(playerId);
        this.persistence.untrack(player, now);
        this.items.detach(playerId);
        this.depot.detachCharacter(playerId);
        this.world.removePlayer(playerId);
        this.visibility.announceLeave(session, player);
      }
      this.depot.detach(session);
      this.market.detach(session);
      this.trade.detach(session);
      this.parties.detach(session);
      this.guilds.detach(session);
      this.houses.detach(session);
      this.vips.detach(session);
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
        if (this.depot.handleMapUse(session, intent.position)) return;
        if (this.items.handleMapOpen(session, intent.position)) return;
        if (this.worldActions.handleUseMap(session, intent.position, now)) {
          return;
        }
        this.movement.handleUseMap(session, intent, now);
        return;
      case "attack-target":
      case "cancel-attack":
      case "set-fight-mode":
      case "cast-spell":
      case "use-rune":
      case "use-potion":
        this.combat.handle(session, intent, now);
        return;
      case "use-item-with":
        if (this.toolUse.handle(session, intent, now)) return;
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
      case "close-world-container":
      case "use-item":
      case "split-stack":
      case "rotate-item":
      case "move-item":
      case "write-item":
        this.items.handle(session, intent, now);
        return;
      case "speak":
      case "private-chat":
        this.chat.handle(session, intent, now);
        return;
      case "npc-dialogue-choice":
        this.npcs.handleChoice(session, intent, now);
        return;
      case "bank-deposit":
      case "bank-withdraw":
      case "bank-transfer":
        this.bank.handle(session, intent);
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
        this.guilds.handle(session, intent, now);
        return;
      case "house-open":
      case "house-buy":
      case "house-abandon":
      case "house-transfer-offer":
      case "house-transfer-respond":
      case "house-transfer-cancel":
      case "house-set-access":
      case "house-kick":
      case "house-browse":
        this.houses.handle(session, intent, now);
        return;
      case "vip-add":
      case "vip-remove":
      case "vip-edit":
        this.vips.handle(session, intent, now);
        return;
      case "store-open":
      case "store-purchase":
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
      case "update-potion-action-bar":
      case "update-auto-potion-settings":
        this.actionBar.handle(session, intent);
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
    await this.bank.stop();
    this.bank.applyResolvedOutcomes(monotonicNow());
    await this.shops.stop();
    this.shops.applyResolvedOutcomes(monotonicNow());
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
    await this.highscores.stop();
    this.highscores.applyResolvedOutcomes(monotonicNow());
    await this.moderation.stop();
    this.moderation.applyResolvedOutcomes(monotonicNow());
    await this.store.stop();
    this.store.applyResolvedOutcomes(monotonicNow());
    await this.pvp.stop();
    await this.bestiaryTracker.stop();
    await this.wheelTracker.stop();
    await this.gems.stop();
    this.gems.applyResolvedOutcomes(monotonicNow());
    await this.gemTracker.stop();
    await this.depot.stop();
    this.depot.applyResolvedOutcomes();
    await this.items.stopPersists();
    this.items.applyResolvedOutcomes(monotonicNow());
    await this.persistence.stop();
    if (this.persistence.unsavedPlayerCount > 0) {
      console.error(
        `game server stopped with ${this.persistence.unsavedPlayerCount} unsaved player(s)`,
      );
    }
    for (const session of this.registry.all()) session.terminate();
    await new Promise<void>((resolve, reject) => {
      this.wss.close((cause) => {
        if (cause) {
          reject(cause);
          return;
        }
        resolve();
      });
    });
  }
}
