import { randomUUID } from "node:crypto";
import {
  COIN_ORDER_LIMITS,
  STORE_LIMITS,
  type CoinOrder,
  type CoinOrderCancelMessage,
  type CoinOrderCreateMessage,
  type CoinOrderFailedReason,
  type CoinOrderOpenMessage,
} from "@tibia/protocol";
import { ResolvedOutcomes } from "../ResolvedOutcomes";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import {
  PIX_COIN_PACKAGES,
  PIX_COIN_PACKAGES_BY_ID,
} from "./PIX_COIN_PACKAGES";
import type { PixOrderRecord, PixOrderStore } from "./PixOrderStore";
import type { PixProvider } from "./PixProvider";

type CoinOrderIntent =
  | CoinOrderOpenMessage
  | CoinOrderCreateMessage
  | CoinOrderCancelMessage;

const ORDER_TTL_MS = 60 * 60_000;
const DEFAULT_RECONCILE_INTERVAL_MS = 60_000;
const DEFAULT_MIN_RECONCILE_AGE_MS = 2 * 60_000;
const RECONCILE_BATCH = 50;

export class PixOrderService {
  private readonly outcomes = new ResolvedOutcomes();
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownByAccount = new Map<string, number>();
  private reconcileTimer: NodeJS.Timeout | null = null;
  private reconciling = false;

  constructor(
    private readonly registry: SessionRegistry,
    private readonly store: PixOrderStore,
    private readonly provider: PixProvider,
    private readonly options?: {
      readonly payerEmailFallback?: string;
      readonly reconcileIntervalMs?: number;
      readonly minReconcileAgeMs?: number;
    },
  ) {}

  startReconciliation(): void {
    if (this.reconcileTimer) return;
    const interval =
      this.options?.reconcileIntervalMs ?? DEFAULT_RECONCILE_INTERVAL_MS;
    this.reconcileTimer = setInterval(() => {
      this.track(
        this.reconcile().catch((cause: unknown) => {
          this.warn("reconciliation sweep", cause);
        }),
      );
    }, interval);
    this.reconcileTimer.unref();
  }

  applyResolvedOutcomes(): void {
    this.outcomes.applyAll();
  }

  async stop(): Promise<void> {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    await Promise.allSettled([...this.pendingOperations]);
  }

  handle(session: Session, intent: CoinOrderIntent, now: number): void {
    const accountId = session.account?.id;
    if (!accountId) {
      this.fail(session, "unavailable");
      return;
    }
    if (intent.type !== "coin-order-open") {
      const last = this.cooldownByAccount.get(accountId) ?? 0;
      if (now - last < COIN_ORDER_LIMITS.actionCooldownMs) {
        this.fail(session, "rate-limited");
        return;
      }
      this.cooldownByAccount.set(accountId, now);
    }
    if (intent.type === "coin-order-open") {
      this.open(session, accountId);
      return;
    }
    if (intent.type === "coin-order-create") {
      this.create(session, accountId, intent.packageId);
      return;
    }
    this.cancel(session, accountId, intent.orderId);
  }

  notify(providerPaymentId: string): void {
    this.track(
      this.processPayment(providerPaymentId).catch((cause: unknown) => {
        this.warn(`webhook for payment ${providerPaymentId}`, cause);
      }),
    );
  }

  private open(session: Session, accountId: string): void {
    this.track(
      this.store
        .openOrderFor(accountId)
        .then((order) => {
          this.answer(session, accountId, (live) => {
            this.sendState(live, order);
          });
        })
        .catch((cause: unknown) => {
          this.warn(`open for account ${accountId}`, cause);
          this.answer(session, accountId, (live) => {
            this.fail(live, "unavailable");
          });
        }),
    );
  }

  private create(session: Session, accountId: string, packageId: string): void {
    const pack = PIX_COIN_PACKAGES_BY_ID.get(packageId);
    if (!pack) {
      this.fail(session, "package-not-found");
      return;
    }
    const characterId = session.playerId ?? null;
    const payerEmail =
      session.account?.email ??
      this.options?.payerEmailFallback ??
      "comprador@mantus.app";
    this.track(
      (async () => {
        const created = await this.store.createOrder({
          orderId: randomUUID(),
          accountId,
          characterId,
          packageId: pack.id,
          coins: pack.coins,
          amountCentavos: pack.amountCentavos,
          expiresAt: new Date(Date.now() + ORDER_TTL_MS),
        });
        const order = created.order;
        if (
          created.status === "pending-order-exists" &&
          order.providerPaymentId !== null
        ) {
          this.answer(session, accountId, (live) => {
            this.fail(live, "pending-order-exists");
            this.sendState(live, order);
          });
          return;
        }
        const charge = await this.provider.createCharge({
          orderId: order.id,
          amountCentavos: order.amountCentavos,
          description: `Mantus Coins x${order.coins}`,
          payerEmail,
          expiresAt: order.expiresAt,
        });
        const attached = await this.store.attachCharge({
          orderId: order.id,
          providerPaymentId: charge.providerPaymentId,
          brcode: charge.brcode,
        });
        this.answer(session, accountId, (live) => {
          if (attached) this.sendState(live, attached);
          else this.fail(live, "failed");
        });
      })().catch((cause: unknown) => {
        this.warn(`create for account ${accountId}`, cause);
        this.answer(session, accountId, (live) => {
          this.fail(live, "unavailable");
        });
      }),
    );
  }

  private cancel(session: Session, accountId: string, orderId: string): void {
    const characterId = session.playerId ?? null;
    this.track(
      (async () => {
        const order = await this.store.openOrderFor(accountId);
        if (!order || order.id !== orderId) {
          this.answer(session, accountId, (live) => {
            this.fail(live, "order-not-found");
            this.sendState(live, order);
          });
          return;
        }
        if (order.providerPaymentId !== null) {
          const cancelled = await this.provider.cancelPayment(
            order.providerPaymentId,
          );
          if (!cancelled) {
            this.answer(session, accountId, (live) => {
              this.fail(live, "cancel-failed");
            });
            this.notify(order.providerPaymentId);
            return;
          }
        }
        const result = await this.store.cancelOrder({
          orderId,
          accountId,
          characterId,
        });
        this.answer(session, accountId, (live) => {
          if (result === "cancelled") this.sendState(live, null);
          else this.fail(live, "order-not-found");
        });
      })().catch((cause: unknown) => {
        this.warn(`cancel for account ${accountId}`, cause);
        this.answer(session, accountId, (live) => {
          this.fail(live, "unavailable");
        });
      }),
    );
  }

  private async processPayment(providerPaymentId: string): Promise<void> {
    const payment = await this.provider.getPayment(providerPaymentId);
    if (payment.status === "approved") {
      const result = await this.store.settleApproved({
        providerPaymentId,
        amountCentavos: payment.amountCentavos,
        snapshot: payment.snapshot,
      });
      if (result.status === "credited") {
        this.pushCredit(result.accountId, result.orderId, result.coins);
        return;
      }
      if (result.status === "amount-mismatch") {
        console.error(
          `PIX ALERT: payment ${providerPaymentId} amount mismatch on ` +
            `order ${result.orderId} — not credited, needs an operator`,
        );
        return;
      }
      if (result.status === "balance-limit") {
        console.error(
          `PIX ALERT: payment ${providerPaymentId} parked (balance cap) on ` +
            `order ${result.orderId} — reconciliation will retry`,
        );
        return;
      }
      if (result.status === "not-found") {
        console.warn(
          `pix payment ${providerPaymentId} approved but matches no order`,
        );
      }
      return;
    }
    if (payment.status === "refunded") {
      const result = await this.store.markRefunded({
        providerPaymentId,
        snapshot: payment.snapshot,
      });
      if (result.status === "refunded") {
        console.warn(
          `pix refund on order ${result.orderId}: clawed back ` +
            `${result.coinsDebited} coins`,
        );
        this.pushDebit(result.accountId, result.coinsDebited);
      }
      return;
    }
    if (payment.status === "cancelled") {
      const cancelled =
        await this.store.markProviderCancelled(providerPaymentId);
      if (cancelled) {
        this.pushOutcome(cancelled.accountId, (live) => {
          this.sendState(live, null);
        });
      }
    }
  }

  private async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const expired = await this.store.expireStale(new Date());
      for (const order of expired) {
        if (order.providerPaymentId !== null) {
          try {
            await this.provider.cancelPayment(order.providerPaymentId);
          } catch (cause) {
            this.warn(`expire-cancel for order ${order.id}`, cause);
          }
        }
        this.pushOutcome(order.accountId, (live) => {
          this.sendState(live, null);
        });
      }
      const minAge =
        this.options?.minReconcileAgeMs ?? DEFAULT_MIN_RECONCILE_AGE_MS;
      const open = await this.store.openForReconciliation(
        new Date(Date.now() - minAge),
        RECONCILE_BATCH,
      );
      for (const order of open) {
        if (order.providerPaymentId === null) continue;
        try {
          await this.processPayment(order.providerPaymentId);
        } catch (cause) {
          this.warn(`reconcile for order ${order.id}`, cause);
        }
      }
    } finally {
      this.reconciling = false;
    }
  }

  private pushCredit(accountId: string, orderId: string, coins: number): void {
    this.pushOutcome(accountId, (live) => {
      const account = live.account;
      if (!account) return;
      const balance = Math.min(
        account.mantusCoins + coins,
        STORE_LIMITS.maxBalance,
      );
      live.account = { ...account, mantusCoins: balance };
      live.send({ type: "coin-order-completed", orderId, coins, balance });
    });
  }

  private pushDebit(accountId: string, coins: number): void {
    if (coins < 1) return;
    this.pushOutcome(accountId, (live) => {
      const account = live.account;
      if (!account) return;
      const balance = Math.max(account.mantusCoins - coins, 0);
      live.account = { ...account, mantusCoins: balance };
    });
  }

  private pushOutcome(
    accountId: string,
    outcome: (live: Session) => void,
  ): void {
    this.outcomes.push(() => {
      const live = this.registry.sessionForAccount(accountId);
      if (live) outcome(live);
    });
  }

  private answer(
    session: Session,
    accountId: string,
    outcome: (live: Session) => void,
  ): void {
    this.outcomes.push(() => {
      if (this.registry.sessionForAccount(accountId) !== session) return;
      outcome(session);
    });
  }

  private sendState(session: Session, order: PixOrderRecord | null): void {
    session.send({
      type: "coin-order-state",
      packages: [...PIX_COIN_PACKAGES],
      order: order ? coinOrderOf(order) : null,
    });
  }

  private fail(session: Session, reason: CoinOrderFailedReason): void {
    session.send({ type: "coin-order-failed", reason });
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(context: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`pix order operation failed (${context}): ${reason}`);
  }
}

function coinOrderOf(order: PixOrderRecord): CoinOrder | null {
  if (order.brcode === null || order.status !== "pending") return null;
  return {
    id: order.id,
    packageId: order.packageId,
    coins: order.coins,
    amountCentavos: order.amountCentavos,
    brcode: order.brcode,
    expiresAt: order.expiresAt.toISOString(),
  };
}
