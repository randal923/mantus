import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { PROTOCOL_LIMITS, type ClientMessage } from "@tibia/protocol";
import type { AccountStore } from "./AccountStore";
import { AuthHandler } from "./AuthHandler";
import { CharacterHandler } from "./CharacterHandler";
import { CharacterPersistence } from "./character/CharacterPersistence";
import { CharacterService } from "./character/CharacterService";
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
import { LanguageHandler } from "./LanguageHandler";
import { DecayManager } from "./item/DecayManager";
import { ItemIntentHandler } from "./item/ItemIntentHandler";
import type { ItemCatalog } from "./item/ItemCatalog";
import type { ItemStore } from "./item/ItemStore";
import type { WorldItemDeltas } from "./item/WorldItemDeltas";
import { MovementHandler } from "./MovementHandler";
import { NpcHandler } from "./npc/NpcHandler";
import type { NpcTravelStore } from "./npc/NpcTravelStore";
import { TravelService } from "./npc/TravelService";
import { resolveMapData } from "./resolveMapData";
import { ProgressionSystem } from "./progression/ProgressionSystem";
import { Session } from "./Session";
import { SessionRegistry } from "./SessionRegistry";
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
  bank?: BankStore;
  shop?: ShopStore;
  depot?: DepotStore;
  worldItemDeltas?: WorldItemDeltas;
}

export class GameServer {
  private readonly wss: WebSocketServer;
  private readonly world: World;
  private readonly registry = new SessionRegistry();
  private readonly visibility: Visibility;
  private readonly auth: AuthHandler;
  private readonly characters: CharacterHandler;
  private readonly persistence: CharacterPersistence;
  private readonly language: LanguageHandler;
  private readonly movement: MovementHandler;
  private readonly chat: ChatHandler;
  private readonly combat: CombatIntentHandler;
  private readonly combatSystem: Combat;
  private readonly progression: ProgressionSystem;
  private readonly spells = new SpellRegistry();
  private readonly items: ItemIntentHandler;
  private readonly travel: TravelService;
  private readonly bank: BankService;
  private readonly shops: ShopService;
  private readonly depot: DepotService;
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
    this.world = new World(
      resolveMapData(config.map, deps.itemCatalog),
      config.tickMs,
      deps.worldItemDeltas,
      (itemId) => deps.itemCatalog.get(itemId)?.weight,
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
      Date.now(),
    );
    this.depot = new DepotService(
      this.world,
      this.items,
      deps.itemCatalog,
      deps.depot,
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
    );
    this.language = new LanguageHandler(this.registry, deps.accounts);
    this.travel = new TravelService(
      this.world,
      this.visibility,
      this.persistence,
      this.items,
      deps.npcTravel,
    );
    const creatureContent =
      config.creatures && config.map.source === "data"
        ? loadCreatureContent(config.creatures.contentName, config.map.name)
        : null;
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
    );
    this.movement = new MovementHandler(
      this.world,
      this.visibility,
      this.persistence,
    );
    this.progression = new ProgressionSystem(
      this.world,
      this.registry,
      this.persistence,
      this.items,
    );
    let spawns: SpawnManager | null = null;
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
    );
    this.combat = new CombatIntentHandler(this.combatSystem);
    spawns =
      creatureContent && config.creatures
        ? new SpawnManager(
            this.world,
            this.visibility,
            creatureContent,
            config.creatures,
            this.combatSystem,
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
        )
      : undefined;
    this.chat = new ChatHandler(
      this.world,
      this.registry,
      this.visibility,
      this.npcs,
      gm,
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
    const now = Date.now();
    this.processDisconnects(now);
    this.auth.applyResolvedOutcomes();
    this.characters.applyResolvedOutcomes();
    this.items.applyResolvedOutcomes(now);
    this.travel.applyResolvedOutcomes(now);
    this.bank.applyResolvedOutcomes(now);
    this.shops.applyResolvedOutcomes(now);
    this.depot.applyResolvedOutcomes();
    this.language.applyResolvedOutcomes();
    for (const session of this.registry.all()) {
      this.auth.enforceDeadline(session, now);
      for (const intent of session.drainIntents()) {
        this.handleIntent(session, intent, now);
      }
      this.movement.continueMovement(session, now);
    }
    this.combatSystem.tick(now);
    this.spawns?.tick(now);
    this.npcs.tick(now);
    this.items.tickDecay(now);
    this.depot.tick(now);
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
        this.persistence.untrack(player, now);
        this.items.detach(playerId);
        this.depot.detachCharacter(playerId);
        this.world.removePlayer(playerId);
        this.visibility.announceLeave(session, player);
      }
      this.depot.detach(session);
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
        this.movement.handleUseMap(session, intent, now);
        return;
      case "attack-target":
      case "cancel-attack":
      case "set-fight-mode":
      case "cast-spell":
      case "use-rune":
        this.combat.handle(session, intent, now);
        return;
      case "equip-item":
      case "unequip-item":
      case "pickup-item":
      case "drop-item":
      case "move-map-item":
      case "open-container":
      case "close-container":
      case "use-item":
      case "use-item-with":
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
      case "set-language":
        this.language.handle(session, intent);
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
    this.travel.applyResolvedOutcomes(Date.now());
    await this.bank.stop();
    this.bank.applyResolvedOutcomes(Date.now());
    await this.shops.stop();
    this.shops.applyResolvedOutcomes(Date.now());
    await this.depot.stop();
    this.depot.applyResolvedOutcomes();
    await this.items.stopPersists();
    this.items.applyResolvedOutcomes(Date.now());
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
