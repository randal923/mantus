import { randomUUID } from "node:crypto";
import { STORE_LIMITS } from "@tibia/protocol";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { MantusStoreStore } from "./MantusStoreStore";
import { ResolvedOutcomes } from "../ResolvedOutcomes";

/**
 * Operator-side coin grants and refunds. The account credited is always the
 * *operator's own* — resolved from their live session, never named in the
 * message — so this surface cannot be pointed at somebody else's account by
 * anything a client sends (charter rule 9). Every operation is audited and
 * keyed, so a retried command is a no-op rather than a second credit.
 */
export class StoreOperatorService {
  private readonly outcomes = new ResolvedOutcomes();
  private readonly pendingOperations = new Set<Promise<void>>();

  constructor(
    private readonly registry: SessionRegistry,
    private readonly store?: MantusStoreStore,
  ) {}

  applyResolvedOutcomes(): void {
    this.outcomes.applyAll();
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  grant(
    session: Session,
    characterId: string,
    amount: number,
    reply: (session: Session, ok: boolean, text: string) => void,
  ): void {
    const store = this.store;
    const accountId = session.account?.id;
    if (!store || !accountId) {
      reply(session, false, "The store is unavailable.");
      return;
    }
    if (
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > STORE_LIMITS.maxBalance
    ) {
      reply(session, false, "Usage: /coins <amount>");
      return;
    }
    this.track(
      store
        .grant({
          accountId,
          amount,
          grantKey: randomUUID(),
          operatorCharacterId: characterId,
        })
        .then((result) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            if (result.status !== "committed") {
              reply(session, false, `Grant rejected: ${result.status}.`);
              return;
            }
            // Applied relatively: memory-first purchases queued behind this
            // grant are not in its balance, so adopting the absolute number
            // would resurrect coins the tick already spent.
            const balance = (session.account?.mantusCoins ?? 0) + amount;
            if (session.account) {
              session.account = { ...session.account, mantusCoins: balance };
            }
            reply(session, true, `Granted. Balance: ${balance} coins.`);
          });
        }),
      session,
      characterId,
      reply,
      "Grant failed.",
    );
  }

  refund(
    session: Session,
    characterId: string,
    ledgerEntryId: string,
    reply: (session: Session, ok: boolean, text: string) => void,
  ): void {
    const store = this.store;
    if (!store) {
      reply(session, false, "The store is unavailable.");
      return;
    }
    if (!/^[0-9]{1,18}$/.test(ledgerEntryId)) {
      reply(session, false, "Usage: /storerefund <ledgerEntryId>");
      return;
    }
    this.track(
      store
        .refund({ ledgerEntryId, operatorCharacterId: characterId })
        .then((result) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            if (result.status !== "committed") {
              reply(session, false, `Refund rejected: ${result.status}.`);
              return;
            }
            // Relative for the same reason as the grant above.
            const own = session.account;
            const balance = (own?.mantusCoins ?? 0) + result.refunded;
            if (own) {
              session.account = { ...own, mantusCoins: balance };
            }
            reply(session, true, `Refunded. Balance: ${balance} coins.`);
          });
        }),
      session,
      characterId,
      reply,
      "Refund failed.",
    );
  }

  private track(
    operation: Promise<void>,
    session: Session,
    characterId: string,
    reply: (session: Session, ok: boolean, text: string) => void,
    failureText: string,
  ): void {
    const settled = operation.catch((cause: unknown) => {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`store operator command failed: ${reason}`);
      this.outcomes.push(() => {
        if (this.registry.sessionFor(characterId) !== session) return;
        reply(session, false, failureText);
      });
    });
    this.pendingOperations.add(settled);
    void settled.finally(() => this.pendingOperations.delete(settled));
  }
}
