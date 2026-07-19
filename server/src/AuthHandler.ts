import type { AuthMessage } from "@tibia/protocol";
import type { Account, AccountStore } from "./AccountStore";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { TokenVerifier } from "./TokenVerifier";
import { getAccountStatus } from "./getAccountStatus";

export class AuthHandler {
  /** Outcomes of async token checks, applied at the top of the next tick. */
  private readonly outcomes: Array<() => void> = [];

  constructor(
    private readonly registry: SessionRegistry,
    private readonly verifier: TokenVerifier,
    private readonly accounts: AccountStore,
    private readonly authTimeoutMs: number,
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
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  enforceDeadline(session: Session, now: number): void {
    if (session.account || session.authPending) return;
    if (now - session.connectedAt < this.authTimeoutMs) return;
    session.sendError("auth-timeout");
    session.terminate();
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
    const status = getAccountStatus(account, Date.now());
    session.send({
      type: "auth-ok",
      language: account.language,
      ...status,
    });
  }
}
