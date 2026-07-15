import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { PROTOCOL_LIMITS, type ClientMessage } from "@tibia/protocol";
import type { AccountStore } from "./AccountStore";
import { AuthHandler } from "./AuthHandler";
import type { ServerConfig } from "./config";
import { JoinHandler } from "./JoinHandler";
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
}

export class GameServer {
  private readonly wss: WebSocketServer;
  private readonly world: World;
  private readonly registry = new SessionRegistry();
  private readonly visibility: Visibility;
  private readonly auth: AuthHandler;
  private readonly join: JoinHandler;
  private readonly movement: MovementHandler;
  private readonly loop: TickLoop;
  private readonly disconnected: Session[] = [];
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: ServerConfig,
    deps: GameServerDeps,
  ) {
    this.world = new World(resolveMapData(config.map), config.stepCooldownMs);
    this.visibility = new Visibility(
      this.world,
      this.registry,
      config.viewRange,
    );
    this.auth = new AuthHandler(
      this.registry,
      deps.verifier,
      deps.accounts,
      config.authTimeoutMs,
    );
    this.join = new JoinHandler(this.world, this.registry, this.visibility);
    this.movement = new MovementHandler(this.world, this.visibility);
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

  stop(): void {
    this.loop.stop();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.wss.close();
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
    this.processDisconnects();
    this.auth.applyResolvedOutcomes();
    for (const session of this.registry.all()) {
      this.auth.enforceDeadline(session, now);
      for (const intent of session.drainIntents()) {
        this.handleIntent(session, intent, now);
      }
      this.movement.continueMovement(session, now);
    }
  }

  private processDisconnects(): void {
    for (const session of this.disconnected.splice(0)) {
      const { playerId } = session;
      const player = playerId ? this.world.getPlayer(playerId) : undefined;
      if (playerId && player) {
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
      case "join":
        this.join.handle(session, intent);
        return;
      case "move":
        this.movement.handle(session, intent, now);
        return;
      case "stop-move":
        this.movement.stop(session);
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
}
