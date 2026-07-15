import { PROTOCOL_LIMITS } from "@tibia/protocol";
import type { Session } from "./Session";

export class SessionRegistry {
  private readonly sessions = new Map<string, Session>();
  private readonly sessionsByPlayerId = new Map<string, Session>();
  private readonly connectionsPerIp = new Map<string, number>();

  canAccept(remoteAddress: string, maxSessions: number): boolean {
    if (this.sessions.size >= maxSessions) return false;
    const perIp = this.connectionsPerIp.get(remoteAddress) ?? 0;
    return perIp < PROTOCOL_LIMITS.maxConnectionsPerIp;
  }

  add(session: Session): void {
    this.sessions.set(session.id, session);
    const count = this.connectionsPerIp.get(session.remoteAddress) ?? 0;
    this.connectionsPerIp.set(session.remoteAddress, count + 1);
  }

  remove(session: Session): void {
    if (!this.sessions.delete(session.id)) return;
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

  unbindPlayer(playerId: string, session: Session): void {
    if (this.sessionsByPlayerId.get(playerId) === session) {
      this.sessionsByPlayerId.delete(playerId);
    }
  }

  sessionFor(playerId: string): Session | undefined {
    return this.sessionsByPlayerId.get(playerId);
  }

  contains(session: Session): boolean {
    return this.sessions.get(session.id) === session;
  }

  all(): Iterable<Session> {
    return this.sessions.values();
  }
}
