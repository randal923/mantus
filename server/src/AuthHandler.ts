import type { AuthMessage } from "@tibia/protocol";
import type { Account, AccountStore } from "./AccountStore";
import type { LoginQueue } from "./LoginQueue";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { TokenVerifier } from "./TokenVerifier";
import { hasCapability } from "./auth/AccountRole";
import { getAccountStatus } from "./getAccountStatus";
import { monotonicNow } from "./monotonicNow";
import { ResolvedOutcomes } from "./ResolvedOutcomes";

export class AuthHandler {
  /** Outcomes of async token checks, applied at the top of the next tick. */
  private readonly outcomes = new ResolvedOutcomes();
  /** Set whenever the queue mutates; positions are re-pushed once per tick. */
  private queueDirty = false;
  /** Last position/total pushed per queued session, to skip no-op sends. */
  private sentPositions = new Map<Session, number>();
  private sentTotal = 0;

  constructor(
    private readonly registry: SessionRegistry,
    private readonly verifier: TokenVerifier,
    private readonly accounts: AccountStore,
    private readonly authTimeoutMs: number,
    private readonly queue: LoginQueue,
    private readonly maxSessions: number,
    private readonly maxLoginQueueSize: number,
  ) {}

  handle(session: Session, intent: AuthMessage): void {
    if (session.account || session.authPending) {
      session.sendError("already-authenticated");
      return;
    }
    session.authPending = true;
    void this.resolve(session, intent.token, intent.language);
  }

  applyResolvedOutcomes(): void {
    this.outcomes.applyAll();
  }

  enforceDeadline(session: Session, now: number): void {
    if (session.account) return;
    if (now - session.connectedAt < this.authTimeoutMs) return;
    session.sendError("auth-timeout");
    session.terminate();
  }

  /** Called from processDisconnects; a closed socket must leave the queue. */
  detach(session: Session): void {
    if (this.queue.remove(session)) this.queueDirty = true;
    session.loginQueued = false;
  }

  /**
   * Once per tick, after disconnects and auth outcomes: seats freed this tick
   * go to the head of the queue (premium lane first), then every queued
   * session whose place changed is told its new position.
   */
  tickQueue(): void {
    while (this.queue.size > 0 && this.seatedCount() < this.maxSessions) {
      const next = this.queue.next();
      if (!next) break;
      this.queueDirty = true;
      next.loginQueued = false;
      if (!this.registry.contains(next) || !next.account) continue;
      this.sendAuthOk(next, next.account);
    }
    if (!this.queueDirty) return;
    this.queueDirty = false;
    this.pushPositions();
  }

  /**
   * Token verification and the account upsert are async; nothing here touches
   * game state. The outcome is queued and applied inside the tick.
   */
  private async resolve(
    session: Session,
    token: string,
    language: AuthMessage["language"],
  ): Promise<void> {
    try {
      const user = await this.verifier.verify(token);
      const account = await this.accounts.findOrCreateBySupabaseId(
        user.supabaseUserId,
        user.email,
        language,
      );
      this.outcomes.push(() => this.apply(session, account));
    } catch (cause) {
      // reason only — the token itself is never logged (charter rule 9)
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`auth failed for ${session.remoteAddress}: ${reason}`);
      this.outcomes.push(() => {
        session.authPending = false;
        session.sendError("auth-failed");
        session.terminate();
      });
    }
  }

  private apply(session: Session, account: Account): void {
    session.authPending = false;
    // the socket may have closed while the token was being verified; a stale
    // outcome must not kick the account's live session
    if (!this.registry.contains(session)) return;
    if (account.bannedUntil && account.bannedUntil.getTime() > monotonicNow()) {
      session.sendError("account-banned");
      session.terminate();
      return;
    }
    const status = getAccountStatus(account, monotonicNow());
    // one live session per account: the newest login wins (charter §login)
    const other = this.registry.sessionForAccount(account.id);
    let inheritsSeat = false;
    if (other && other.id !== session.id) {
      other.sendError("logged-in-elsewhere");
      other.terminate();
      if (other.loginQueued) {
        // a queued account that reconnects keeps its place in line
        session.loginQueued = this.queue.replace(other, session, status.accountTier);
        if (!session.loginQueued) this.queue.remove(other);
        this.queueDirty = true;
      } else {
        // the account already held a seat; the relogin swaps into it instead
        // of joining the queue (the old socket frees it next tick)
        inheritsSeat = true;
      }
    }
    session.account = account;
    this.registry.bindAccount(session, account.id);
    session.fightMode = { ...account.fightMode };
    if (session.loginQueued) return;
    // seats drain through the queue in order: a fresh login never overtakes
    // it, even when a seat happens to be free this tick (charter rule 8)
    const mustWait =
      !inheritsSeat &&
      !hasCapability(account.role, "login.bypass") &&
      (this.queue.size > 0 || this.seatedCount() > this.maxSessions);
    if (mustWait) {
      if (this.queue.size >= this.maxLoginQueueSize) {
        session.sendError("server-full");
        session.terminate();
        return;
      }
      session.loginQueued = true;
      this.queue.enqueue(session, status.accountTier);
      this.queueDirty = true;
      return;
    }
    this.sendAuthOk(session, account);
  }

  private sendAuthOk(session: Session, account: Account): void {
    const status = getAccountStatus(account, monotonicNow());
    session.send({
      type: "auth-ok",
      language: account.language,
      ...status,
    });
  }

  /** Sessions holding (or pending auth toward) a world seat. */
  private seatedCount(): number {
    return this.registry.size - this.queue.size;
  }

  private pushPositions(): void {
    const total = this.queue.size;
    const previous = this.sentPositions;
    const previousTotal = this.sentTotal;
    this.sentPositions = new Map();
    this.sentTotal = total;
    let position = 0;
    for (const session of this.queue.entries()) {
      position += 1;
      this.sentPositions.set(session, position);
      if (previous.get(session) === position && previousTotal === total) {
        continue;
      }
      session.send({ type: "queue-position", position, total });
    }
  }
}
