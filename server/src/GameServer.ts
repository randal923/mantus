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
import type { ServerConfig } from "./config";
import { LanguageHandler } from "./LanguageHandler";
import { MovementHandler } from "./MovementHandler";
import { resolveMapData } from "./resolveMapData";
import { Session } from "./Session";
import { SessionRegistry } from "./SessionRegistry";
import { TickLoop } from "./TickLoop";
import type { TokenVerifier } from "./TokenVerifier";
import { Visibility } from "./Visibility";
import { World } from "./World";

export interface GameServerDeps {
  verifier: TokenVerifier;
  accounts: AccountStore;
  characters: CharacterStore;
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
  private readonly loop: TickLoop;
  private readonly disconnected: Session[] = [];
  private heartbeat: NodeJS.Timeout | undefined;
  private stopPromise: Promise<void> | null = null;

  constructor(
    private readonly config: ServerConfig,
    deps: GameServerDeps,
  ) {
    this.world = new World(resolveMapData(config.map), config.tickMs);
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
    this.characters = new CharacterHandler(
      characterService,
      this.world,
      this.registry,
      this.visibility,
      this.persistence,
    );
    this.language = new LanguageHandler(this.registry, deps.accounts);
    this.movement = new MovementHandler(
      this.world,
      this.visibility,
      this.persistence,
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
    this.language.applyResolvedOutcomes();
    for (const session of this.registry.all()) {
      this.auth.enforceDeadline(session, now);
      for (const intent of session.drainIntents()) {
        this.handleIntent(session, intent, now);
      }
      this.movement.continueMovement(session, now);
    }
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
        this.persistence.untrack(player, now);
        this.world.removePlayer(playerId);
        this.visibility.announceLeave(session, player);
      }
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
      case "set-viewport": {
        if (!session.setViewRange(intent.range) || !session.playerId) return;
        const player = this.world.getPlayer(session.playerId);
        if (player) this.visibility.onViewerRangeChanged(session, player);
        return;
      }
      case "use-map":
        this.movement.handleUseMap(session, intent, now);
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
