import { PROTOCOL_LIMITS } from "@tibia/protocol";
import type { Session } from "./Session";

export class SessionRegistry {
  private readonly sessions = new Map<string, Session>();
  private readonly sessionsByPlayerId = new Map<string, Session>();
  private readonly sessionsByAccountId = new Map<string, Session>();
  private readonly sessionsAwaitingAuth = new Set<Session>();
  private readonly sessionsForTick = new Set<Session>();
  private readonly connectionsPerIp = new Map<string, number>();

  constructor(
    private readonly maxConnectionsPerIp: number = PROTOCOL_LIMITS.maxConnectionsPerIp,
  ) {}

  get size(): number {
    return this.sessions.size;
  }

  canAccept(remoteAddress: string, maxSessions: number): boolean {
    if (this.sessions.size >= maxSessions) return false;
    const perIp = this.connectionsPerIp.get(remoteAddress) ?? 0;
    return perIp < this.maxConnectionsPerIp;
  }

  add(session: Session): void {
    this.sessions.set(session.id, session);
    this.sessionsAwaitingAuth.add(session);
    const count = this.connectionsPerIp.get(session.remoteAddress) ?? 0;
    this.connectionsPerIp.set(session.remoteAddress, count + 1);
  }

  remove(session: Session): void {
    if (!this.sessions.delete(session.id)) return;
    this.sessionsAwaitingAuth.delete(session);
    this.sessionsForTick.delete(session);
    const accountId = session.account?.id;
    if (
      accountId &&
      this.sessionsByAccountId.get(accountId) === session
    ) {
      this.sessionsByAccountId.delete(accountId);
    }
    const { playerId } = session;
    if (playerId && this.sessionsByPlayerId.get(playerId) === session) {
      this.sessionsByPlayerId.delete(playerId);
    }
    const count = this.connectionsPerIp.get(session.remoteAddress) ?? 1;
    if (count <= 1) this.connectionsPerIp.delete(session.remoteAddress);
    else this.connectionsPerIp.set(session.remoteAddress, count - 1);
  }

  /** Call after session.playerId is assigned during character selection. */
  bindPlayer(session: Session): void {
    if (session.playerId) this.sessionsByPlayerId.set(session.playerId, session);
  }

  bindAccount(session: Session, accountId: string): void {
    this.sessionsAwaitingAuth.delete(session);
    this.sessionsByAccountId.set(accountId, session);
  }

  unbindPlayer(playerId: string, session: Session): void {
    if (this.sessionsByPlayerId.get(playerId) === session) {
      this.sessionsByPlayerId.delete(playerId);
    }
  }

  sessionFor(playerId: string): Session | undefined {
    return this.sessionsByPlayerId.get(playerId);
  }

  sessionForAccount(accountId: string): Session | undefined {
    return this.sessionsByAccountId.get(accountId);
  }

  markForTick(session: Session): void {
    if (this.contains(session)) this.sessionsForTick.add(session);
  }

  finishTick(session: Session): void {
    if (
      !this.contains(session) ||
      (!session.hasPendingIntents && !session.needsMovementTick)
    ) {
      this.sessionsForTick.delete(session);
    }
  }

  contains(session: Session): boolean {
    return this.sessions.get(session.id) === session;
  }

  all(): Iterable<Session> {
    return this.sessions.values();
  }

  awaitingAuth(): Iterable<Session> {
    return this.sessionsAwaitingAuth.values();
  }

  tickable(): Iterable<Session> {
    return this.sessionsForTick.values();
  }
}
