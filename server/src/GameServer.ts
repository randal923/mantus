import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  PROTOCOL_LIMITS,
  type ClientMessage,
  type Direction,
  type JoinMessage,
  type MoveMessage,
  type ServerMessage,
} from "@tibia/protocol";
import { canSee } from "./canSee";
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
      this.continueMovement(session, now);
    }
  }

  private processDisconnects(): void {
    for (const session of this.disconnected.splice(0)) {
      const { playerId } = session;
      if (playerId && this.world.getPlayer(playerId)) {
        this.world.removePlayer(playerId);
        for (const other of this.registry.all()) {
          if (other.id === session.id) continue;
          if (!other.knownPlayerIds.delete(playerId)) continue;
          other.send({ type: "player-left", playerId });
        }
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
      case "stop-move":
        session.movementDirection = null;
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
    session.knownPlayerIds.add(player.id);

    const visiblePlayers = [player.toState()];
    for (const other of this.registry.all()) {
      if (other.id === session.id || !other.playerId) continue;
      const otherPlayer = this.world.getPlayer(other.playerId);
      if (!otherPlayer) continue;
      if (!canSee(player, otherPlayer, this.config.viewRange)) continue;
      session.knownPlayerIds.add(otherPlayer.id);
      visiblePlayers.push(otherPlayer.toState());
      other.knownPlayerIds.add(player.id);
      other.send({ type: "player-joined", player: player.toState() });
    }
    session.send({
      type: "welcome",
      playerId: player.id,
      map: this.world.toMapState(),
      players: visiblePlayers,
    });
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
    session.movementDirection = intent.direction;
    this.applyMove(session, player, intent.direction, now);
  }

  private continueMovement(session: Session, now: number): void {
    if (!session.playerId || !session.movementDirection) return;
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    this.applyMove(session, player, session.movementDirection, now);
  }

  private applyMove(
    session: Session,
    player: Player,
    direction: Direction,
    now: number,
  ): void {
    const result = this.world.tryMove(player, direction, now);
    if (result.moved) this.onPlayerStepped(session, player);
    else if (result.turned) this.broadcastPose(player);
  }

  private onPlayerStepped(mover: Session, player: Player): void {
    for (const session of this.registry.all()) {
      if (!session.playerId) continue;
      if (session.id === mover.id) {
        session.send(this.movedMessage(player));
        this.reconcileMoverView(session, player);
        continue;
      }
      const viewer = this.world.getPlayer(session.playerId);
      if (viewer) this.updateViewOfMover(session, viewer, player);
    }
  }

  private updateViewOfMover(
    viewerSession: Session,
    viewer: Player,
    moved: Player,
  ): void {
    const visible = canSee(viewer, moved, this.config.viewRange);
    const known = viewerSession.knownPlayerIds.has(moved.id);
    if (visible && known) {
      viewerSession.send(this.movedMessage(moved));
      return;
    }
    if (visible) {
      viewerSession.knownPlayerIds.add(moved.id);
      viewerSession.send({ type: "player-joined", player: moved.toState() });
      return;
    }
    if (known) {
      viewerSession.knownPlayerIds.delete(moved.id);
      viewerSession.send({ type: "player-left", playerId: moved.id });
    }
  }

  private reconcileMoverView(mover: Session, player: Player): void {
    for (const other of this.world.allPlayers()) {
      if (other.id === player.id) continue;
      const visible = canSee(player, other, this.config.viewRange);
      const known = mover.knownPlayerIds.has(other.id);
      if (visible && !known) {
        mover.knownPlayerIds.add(other.id);
        mover.send({ type: "player-joined", player: other.toState() });
      } else if (!visible && known) {
        mover.knownPlayerIds.delete(other.id);
        mover.send({ type: "player-left", playerId: other.id });
      }
    }
  }

  private broadcastPose(player: Player): void {
    for (const session of this.registry.all()) {
      if (!session.knownPlayerIds.has(player.id)) continue;
      session.send(this.movedMessage(player));
    }
  }

  private movedMessage(player: Player): ServerMessage {
    return {
      type: "player-moved",
      playerId: player.id,
      x: player.x,
      y: player.y,
      direction: player.direction,
    };
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
