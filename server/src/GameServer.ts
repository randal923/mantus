import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  PROTOCOL_LIMITS,
  type ClientMessage,
  type JoinMessage,
  type MoveMessage,
} from "@tibia/protocol";
import type { ServerConfig } from "./config";
import { Player } from "./Player";
import { Session } from "./Session";
import { SessionRegistry } from "./SessionRegistry";
import { TickLoop } from "./TickLoop";
import { World } from "./World";

export class GameServer {
  private readonly wss: WebSocketServer;
  private readonly world: World;
  private readonly registry = new SessionRegistry();
  private readonly loop: TickLoop;
  private readonly disconnected: Session[] = [];
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(private readonly config: ServerConfig) {
    this.world = new World(
      config.map.width,
      config.map.height,
      config.map.blocked,
      config.stepCooldownMs,
    );
    this.wss = new WebSocketServer({
      port: config.port,
      maxPayload: PROTOCOL_LIMITS.maxMessageBytes,
    });
    this.loop = new TickLoop(config.tickMs, () => this.tick());
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
    console.log(`game server listening on ws://localhost:${this.config.port}`);
  }

  stop(): void {
    this.loop.stop();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.wss.close();
  }

  private onConnection(socket: WebSocket, request: IncomingMessage): void {
    const remoteAddress = request.socket.remoteAddress ?? "unknown";
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

  private tick(): void {
    const now = Date.now();
    this.processDisconnects();
    for (const session of this.registry.all()) {
      for (const intent of session.drainIntents()) {
        this.handleIntent(session, intent, now);
      }
    }
  }

  private processDisconnects(): void {
    for (const session of this.disconnected.splice(0)) {
      if (session.playerId && this.world.getPlayer(session.playerId)) {
        this.world.removePlayer(session.playerId);
        this.registry.broadcast({
          type: "player-left",
          playerId: session.playerId,
        });
      }
      this.registry.remove(session);
    }
  }

  private handleIntent(
    session: Session,
    intent: ClientMessage,
    now: number,
  ): void {
    switch (intent.type) {
      case "join":
        this.handleJoin(session, intent);
        return;
      case "move":
        this.handleMove(session, intent, now);
        return;
    }
  }

  private handleJoin(session: Session, intent: JoinMessage): void {
    if (session.playerId) {
      session.sendError("already-joined");
      return;
    }
    const spawn = this.world.findSpawn();
    if (!spawn) {
      session.sendError("world-full");
      session.terminate();
      return;
    }
    const player = new Player(
      randomUUID(),
      intent.name.trim(),
      spawn.x,
      spawn.y,
      "south",
    );
    this.world.addPlayer(player);
    session.playerId = player.id;
    session.send({
      type: "welcome",
      playerId: player.id,
      map: this.world.toMapState(),
      players: this.world.playerStates(),
    });
    this.registry.broadcast(
      { type: "player-joined", player: player.toState() },
      session.id,
    );
  }

  private handleMove(
    session: Session,
    intent: MoveMessage,
    now: number,
  ): void {
    if (!session.playerId) {
      session.sendError("join-required");
      return;
    }
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    const result = this.world.tryMove(player, intent.direction, now);
    if (!result.moved && !result.turned) return;
    this.registry.broadcast({
      type: "player-moved",
      playerId: player.id,
      x: player.x,
      y: player.y,
      direction: player.direction,
    });
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
