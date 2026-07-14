import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  PROTOCOL_LIMITS,
  type AuthMessage,
  type ClientMessage,
  type Direction,
  type JoinMessage,
  type MoveMessage,
  type ServerMessage,
} from "@tibia/protocol";
import type { Account, AccountStore } from "./AccountStore";
import { canSee } from "./canSee";
import type { ServerConfig } from "./config";
import { Player } from "./Player";
import { Session } from "./Session";
import { SessionRegistry } from "./SessionRegistry";
import { TickLoop } from "./TickLoop";
import type { TokenVerifier } from "./TokenVerifier";
import { World } from "./World";

export interface GameServerDeps {
  verifier: TokenVerifier;
  accounts: AccountStore;
}

export class GameServer {
  private readonly wss: WebSocketServer;
  private readonly world: World;
  private readonly registry = new SessionRegistry();
  private readonly loop: TickLoop;
  private readonly disconnected: Session[] = [];
  /** Outcomes of async token checks, applied at the top of the next tick. */
  private readonly authOutcomes: Array<() => void> = [];
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: ServerConfig,
    private readonly deps: GameServerDeps,
  ) {
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
    for (const outcome of this.authOutcomes.splice(0)) outcome();
    for (const session of this.registry.all()) {
      this.enforceAuthDeadline(session, now);
      for (const intent of session.drainIntents()) {
        this.handleIntent(session, intent, now);
      }
      this.continueMovement(session, now);
    }
  }

  private enforceAuthDeadline(session: Session, now: number): void {
    if (session.account || session.authPending) return;
    if (now - session.connectedAt < this.config.authTimeoutMs) return;
    session.sendError("auth-timeout");
    session.terminate();
  }

  private processDisconnects(): void {
    for (const session of this.disconnected.splice(0)) {
      const { playerId } = session;
      const player = playerId ? this.world.getPlayer(playerId) : undefined;
      if (playerId && player) {
        this.world.removePlayer(playerId);
        // every session that knows a player is within view range of them
        for (const near of this.nearbySessions(player.x, player.y, 0)) {
          if (near.id === session.id) continue;
          if (!near.knownPlayerIds.delete(playerId)) continue;
          near.send({ type: "player-left", playerId });
        }
      }
      this.registry.remove(session);
    }
  }

  /** Sessions of players within viewRange (+margin tiles) of a position. */
  private *nearbySessions(
    x: number,
    y: number,
    margin: number,
  ): Iterable<Session> {
    const range = {
      x: this.config.viewRange.x + margin,
      y: this.config.viewRange.y + margin,
    };
    for (const player of this.world.playersNear(x, y, range)) {
      const session = this.registry.sessionFor(player.id);
      if (session) yield session;
    }
  }

  private handleIntent(
    session: Session,
    intent: ClientMessage,
    now: number,
  ): void {
    if (intent.type === "auth") {
      this.handleAuth(session, intent);
      return;
    }
    // re-checked at execution time, not enqueue time (charter rule 4)
    if (!session.account) {
      session.sendError("auth-required");
      return;
    }
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

  private handleAuth(session: Session, intent: AuthMessage): void {
    if (session.account || session.authPending) {
      session.sendError("already-authenticated");
      return;
    }
    session.authPending = true;
    void this.resolveAuth(session, intent.token);
  }

  /**
   * Token verification and the account upsert are async; nothing here touches
   * game state. The outcome is queued and applied inside the tick.
   */
  private async resolveAuth(session: Session, token: string): Promise<void> {
    try {
      const user = await this.deps.verifier.verify(token);
      const account = await this.deps.accounts.findOrCreateBySupabaseId(
        user.supabaseUserId,
        user.email,
      );
      this.authOutcomes.push(() => this.applyAuth(session, account));
    } catch (cause) {
      // reason only — the token itself is never logged (charter rule 9)
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`auth failed for ${session.remoteAddress}: ${reason}`);
      this.authOutcomes.push(() => {
        session.authPending = false;
        session.sendError("auth-failed");
        session.terminate();
      });
    }
  }

  private applyAuth(session: Session, account: Account): void {
    session.authPending = false;
    // the socket may have closed while the token was being verified; a stale
    // outcome must not kick the account's live session
    if (!this.registry.contains(session)) return;
    if (account.bannedUntil && account.bannedUntil.getTime() > Date.now()) {
      session.sendError("account-banned");
      session.terminate();
      return;
    }
    // one live session per account: the newest login wins (charter §login)
    for (const other of this.registry.all()) {
      if (other.id === session.id || other.account?.id !== account.id) continue;
      other.sendError("logged-in-elsewhere");
      other.terminate();
    }
    session.account = account;
    session.send({ type: "auth-ok" });
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
    this.registry.bindPlayer(session);
    session.knownPlayerIds.add(player.id);

    const visiblePlayers = [player.toState()];
    for (const other of this.nearbySessions(player.x, player.y, 0)) {
      if (other.id === session.id || !other.playerId) continue;
      const otherPlayer = this.world.getPlayer(other.playerId);
      if (!otherPlayer) continue;
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
    mover.send(this.movedMessage(player));
    this.reconcileMoverView(mover, player);
    // margin 1 covers viewers the one-tile step just left behind; larger
    // jumps (teleports, when they exist) must reconcile visibility themselves
    for (const session of this.nearbySessions(player.x, player.y, 1)) {
      if (session.id === mover.id || !session.playerId) continue;
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
    // known players no longer visible → left view (known ⊆ near old position)
    for (const knownId of [...mover.knownPlayerIds]) {
      if (knownId === player.id) continue;
      const other = this.world.getPlayer(knownId);
      if (other && canSee(player, other, this.config.viewRange)) continue;
      mover.knownPlayerIds.delete(knownId);
      mover.send({ type: "player-left", playerId: knownId });
    }
    // nearby players not yet known → entered view
    for (const other of this.world.playersNear(
      player.x,
      player.y,
      this.config.viewRange,
    )) {
      if (other.id === player.id || mover.knownPlayerIds.has(other.id)) {
        continue;
      }
      mover.knownPlayerIds.add(other.id);
      mover.send({ type: "player-joined", player: other.toState() });
    }
  }

  private broadcastPose(player: Player): void {
    const message = this.movedMessage(player);
    for (const session of this.nearbySessions(player.x, player.y, 0)) {
      if (!session.knownPlayerIds.has(player.id)) continue;
      session.send(message);
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
