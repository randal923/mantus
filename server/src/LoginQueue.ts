import type { AccountTier } from "@tibia/protocol";
import type { Session } from "./Session";

/**
 * Waiting list for authenticated connections that arrived while the world was
 * full (Canary's WaitingList, adapted to held sockets). Premium sessions form
 * one FIFO lane that drains entirely before the free lane; arrival order is
 * kept within each lane, so a session's position can only improve. All calls
 * happen inside the tick.
 */
export class LoginQueue {
  private readonly premium: Session[] = [];
  private readonly free: Session[] = [];

  get size(): number {
    return this.premium.length + this.free.length;
  }

  contains(session: Session): boolean {
    return this.premium.includes(session) || this.free.includes(session);
  }

  enqueue(session: Session, tier: AccountTier): void {
    if (tier === "premium") this.premium.push(session);
    else this.free.push(session);
  }

  remove(session: Session): boolean {
    const lane = this.premium.includes(session) ? this.premium : this.free;
    const index = lane.indexOf(session);
    if (index === -1) return false;
    lane.splice(index, 1);
    return true;
  }

  /**
   * Substitute `next` into `old`'s spot when `old` sits in the given tier's
   * lane — a reconnecting account keeps its place. False when `old` is not
   * queued there (e.g. its premium lapsed since it queued).
   */
  replace(old: Session, next: Session, tier: AccountTier): boolean {
    const lane = tier === "premium" ? this.premium : this.free;
    const index = lane.indexOf(old);
    if (index === -1) return false;
    lane[index] = next;
    return true;
  }

  /** The session that owns the next free seat, or undefined when empty. */
  next(): Session | undefined {
    return this.premium.shift() ?? this.free.shift();
  }

  /** 1-based place in line; 0 when the session is not queued. */
  positionOf(session: Session): number {
    const premiumIndex = this.premium.indexOf(session);
    if (premiumIndex !== -1) return premiumIndex + 1;
    const freeIndex = this.free.indexOf(session);
    if (freeIndex !== -1) return this.premium.length + freeIndex + 1;
    return 0;
  }

  *entries(): Iterable<Session> {
    yield* this.premium;
    yield* this.free;
  }
}
