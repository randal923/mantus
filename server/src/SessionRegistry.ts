import { PROTOCOL_LIMITS } from "@tibia/protocol";
import type { Session } from "./Session";

export class SessionRegistry {
  private readonly sessions = new Map<string, Session>();
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
    const count = this.connectionsPerIp.get(session.remoteAddress) ?? 1;
    if (count <= 1) this.connectionsPerIp.delete(session.remoteAddress);
    else this.connectionsPerIp.set(session.remoteAddress, count - 1);
  }

  all(): Iterable<Session> {
    return this.sessions.values();
  }
}
