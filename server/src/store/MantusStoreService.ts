import {
  STORE_LIMITS,
  type StoreActionFailedReason,
  type StoreOpenMessage,
  type StorePurchaseMessage,
} from "@tibia/protocol";
import { getAccountStatus } from "../getAccountStatus";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { MANTUS_STORE_CATEGORIES } from "./MANTUS_STORE_CATEGORIES";
import type { MantusStoreStore } from "./MantusStoreStore";

type StoreIntent = StoreOpenMessage | StorePurchaseMessage;

export class MantusStoreService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly store?: MantusStoreStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
    session.storeOperationPending = false;
  }

  handle(session: Session, intent: StoreIntent, now: number): void {
    const account = session.account;
    const characterId = session.playerId;
    if (!account || !characterId || !this.world.getPlayer(characterId)) {
      session.sendError("join-required");
      return;
    }
    if (intent.type === "store-open") {
      session.send({
        type: "store-state",
        balance: account.mantusCoins,
        categories: MANTUS_STORE_CATEGORIES,
      });
      return;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt || session.storeOperationPending) {
      this.fail(session, "rate-limited");
      return;
    }
    const offer = MANTUS_STORE_CATEGORIES.flatMap(
      (category) => category.offers,
    ).find((candidate) => candidate.id === intent.offerId);
    if (!offer) {
      this.fail(session, "offer-not-found");
      return;
    }
    const store = this.store;
    if (!store) {
      this.fail(session, "unavailable");
      return;
    }
    this.cooldownBySession.set(
      session.id,
      now + STORE_LIMITS.actionCooldownMs,
    );
    session.storeOperationPending = true;
    const operation = store
      .purchase({
        accountId: account.id,
        characterId,
        offer,
      })
      .then((result) => {
        this.outcomes.push((committedAt) => {
          session.storeOperationPending = false;
          if (
            this.registry.sessionFor(characterId) !== session ||
            !session.account
          ) {
            return;
          }
          if (result.status !== "committed") {
            this.fail(session, result.status);
            return;
          }
          session.account = {
            ...session.account,
            mantusCoins: result.balance,
            premiumUntil: result.premiumUntil,
          };
          this.world
            .getPlayer(characterId)
            ?.setPremiumUntil(result.premiumUntil);
          const status = getAccountStatus(session.account, committedAt);
          session.send({
            type: "store-purchase-completed",
            offerId: offer.id,
            balance: result.balance,
            accountTier: "premium",
            premiumDaysRemaining: status.premiumDaysRemaining,
          });
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`store purchase failed for account ${account.id}: ${reason}`);
        this.outcomes.push(() => {
          session.storeOperationPending = false;
          if (this.registry.sessionFor(characterId) === session) {
            this.fail(session, "failed");
          }
        });
      });
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private fail(session: Session, reason: StoreActionFailedReason): void {
    session.send({ type: "store-action-failed", reason });
  }
}
