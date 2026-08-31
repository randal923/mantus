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
import { normalizeCharacterName } from "../character/normalizeCharacterName";
import { ResolvedOutcomes } from "../ResolvedOutcomes";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { logPix } from "./logPix";
import {
  PIX_COIN_PACKAGES,
  PIX_COIN_PACKAGES_BY_ID,
} from "./PIX_COIN_PACKAGES";
import type {
  PixOrderRecord,
  PixOrderStore,
  PixRefundResult,
} from "./PixOrderStore";
import type { PixProvider } from "./PixProvider";

type CoinOrderIntent =
  CoinOrderOpenMessage | CoinOrderCreateMessage | CoinOrderCancelMessage;

const ORDER_TTL_MS = 60 * 60_000;
const DEFAULT_RECONCILE_INTERVAL_MS = 60_000;
const DEFAULT_MIN_RECONCILE_AGE_MS = 60_000;
const RECONCILE_BATCH = 50;
const PROVIDER_CHECK_COOLDOWN_MS = 10_000;
/** Per-account throttle maps are swept once they grow past this many entries. */
const THROTTLE_MAP_SWEEP_SIZE = 10_000;
/**
 * Orders one account may open per rolling hour, any status. A create→cancel
 * loop at the 1 s action cooldown would otherwise mint 3600 provider charges
 * an hour from one account.
 */
export const MAX_ORDERS_PER_ACCOUNT_PER_HOUR = 10;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OperatorReply = (session: Session, ok: boolean, text: string) => void;

export class PixOrderService {
  private readonly outcomes = new ResolvedOutcomes();
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownByAccount = new Map<string, number>();
  private readonly providerCheckByAccount = new Map<string, number>();
  /**
   * One provider round trip per payment id at a time. A webhook burst (or a
   * replayed notification) for the same payment collapses onto the in-flight
   * settle instead of fanning out into N provider fetches and N serializable
   * transactions racing for the same row.
   */
  private readonly inFlightByPayment = new Map<string, Promise<void>>();
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
          this.warn("reconcile-sweep", cause);
        }),
      );
    }, interval);
    this.reconcileTimer.unref();
    logPix("info", "reconciliation-started", { intervalMs: interval });
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
      logPix("warn", "intent-unauthenticated", { intent: intent.type });
      this.fail(session, "unavailable");
      return;
    }
    if (intent.type !== "coin-order-open") {
      const last = this.cooldownByAccount.get(accountId) ?? 0;
      if (now - last < COIN_ORDER_LIMITS.actionCooldownMs) {
        logPix("warn", "intent-rate-limited", {
          intent: intent.type,
          accountId,
        });
        this.fail(session, "rate-limited");
        return;
      }
      this.remember(this.cooldownByAccount, accountId, now);
    }
    if (intent.type === "coin-order-open") {
      this.open(session, accountId, now);
      return;
    }
    if (intent.type === "coin-order-create") {
      this.create(session, accountId, intent.packageId);
      return;
    }
    this.cancel(session, accountId, intent.orderId);
  }

  notify(providerPaymentId: string): void {
    const inFlight = this.inFlightByPayment.get(providerPaymentId);
    if (inFlight) {
      logPix("info", "payment-check-coalesced", {
        paymentId: providerPaymentId,
      });
      return;
    }
    const operation = this.processPayment(providerPaymentId)
      .catch((cause: unknown) => {
        this.warn("payment-check", cause, { paymentId: providerPaymentId });
      })
      .finally(() => {
        this.inFlightByPayment.delete(providerPaymentId);
      });
    this.inFlightByPayment.set(providerPaymentId, operation);
    this.track(operation);
  }

  private open(session: Session, accountId: string, now: number): void {
    this.track(
      this.store
        .openOrderFor(accountId)
        .then((order) => {
          this.answer(session, accountId, (live) => {
            this.sendState(live, order);
          });
          if (!order || order.providerPaymentId === null) return;
          const lastCheck = this.providerCheckByAccount.get(accountId) ?? 0;
          if (now - lastCheck < PROVIDER_CHECK_COOLDOWN_MS) return;
          this.remember(this.providerCheckByAccount, accountId, now);
          logPix("info", "open-recheck", {
            accountId,
            orderId: order.id,
            paymentId: order.providerPaymentId,
          });
          this.notify(order.providerPaymentId);
        })
        .catch((cause: unknown) => {
          this.warn("open", cause, { accountId });
          this.answer(session, accountId, (live) => {
            this.fail(live, "unavailable");
          });
        }),
    );
  }

  private create(session: Session, accountId: string, packageId: string): void {
    const pack = PIX_COIN_PACKAGES_BY_ID.get(packageId);
    if (!pack) {
      logPix("warn", "create-unknown-package", { accountId, packageId });
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
          maxPerHour: MAX_ORDERS_PER_ACCOUNT_PER_HOUR,
        });
        if (created.status === "too-many-orders") {
          logPix("warn", "create-refused-hourly-cap", {
            accountId,
            packageId,
            recentOrders: created.recentCount,
          });
          this.answer(session, accountId, (live) => {
            this.fail(live, "rate-limited");
          });
          return;
        }
        const order = created.order;
        if (
          created.status === "pending-order-exists" &&
          order.providerPaymentId !== null
        ) {
          logPix("info", "create-refused-open-order", {
            accountId,
            orderId: order.id,
            packageId,
          });
          this.answer(session, accountId, (live) => {
            this.fail(live, "pending-order-exists");
            this.sendState(live, order);
          });
          return;
        }
        logPix(
          "info",
          created.status === "created" ? "order-created" : "order-resumed",
          {
            accountId,
            characterId,
            orderId: order.id,
            packageId: order.packageId,
            coins: order.coins,
            amountCentavos: order.amountCentavos,
          },
        );
        const charge = await this.provider.createCharge({
          orderId: order.id,
          amountCentavos: order.amountCentavos,
          description: `Mantus Coins x${order.coins}`,
          payerEmail,
          expiresAt: order.expiresAt,
        });
        if (charge.brcode.length > COIN_ORDER_LIMITS.maxBrcodeLength) {
          // A code the wire schema would drop is a code the player can never
          // pay; close the charge instead of stranding a payable ghost.
          logPix("error", "charge-brcode-oversized", {
            accountId,
            orderId: order.id,
            paymentId: charge.providerPaymentId,
            length: charge.brcode.length,
          });
          const closed = await this.provider.cancelPayment(
            charge.providerPaymentId,
          );
          logPix(closed ? "info" : "error", "charge-orphan-cancel", {
            orderId: order.id,
            paymentId: charge.providerPaymentId,
            cancelled: closed,
          });
          this.answer(session, accountId, (live) => {
            this.fail(live, "failed");
          });
          return;
        }
        const attached = await this.store.attachCharge({
          orderId: order.id,
          providerPaymentId: charge.providerPaymentId,
          brcode: charge.brcode,
        });
        if (attached && attached.status !== "pending") {
          // The payment landed (webhook + adoption) before this attach: the
          // credit outcome is already queued by the settle path, so the
          // client only needs to learn there is no open order any more.
          logPix("info", "charge-attached-late", {
            accountId,
            orderId: order.id,
            paymentId: charge.providerPaymentId,
            orderStatus: attached.status,
          });
          this.answer(session, accountId, (live) => {
            this.sendState(live, null);
          });
          return;
        }
        if (!attached) {
          // The order left `pending` (cancel/expiry) while the charge was
          // being created: the charge is an orphan nobody can be shown, so
          // close it at the provider rather than leave a payable ghost.
          logPix("warn", "charge-orphaned", {
            accountId,
            orderId: order.id,
            paymentId: charge.providerPaymentId,
          });
          const closed = await this.provider.cancelPayment(
            charge.providerPaymentId,
          );
          logPix(closed ? "info" : "error", "charge-orphan-cancel", {
            orderId: order.id,
            paymentId: charge.providerPaymentId,
            cancelled: closed,
          });
          this.answer(session, accountId, (live) => {
            this.fail(live, "failed");
          });
          return;
        }
        logPix("info", "charge-attached", {
          accountId,
          orderId: order.id,
          paymentId: charge.providerPaymentId,
          amountCentavos: order.amountCentavos,
          expiresAt: order.expiresAt.toISOString(),
        });
        this.answer(session, accountId, (live) => {
          this.sendState(live, attached);
        });
      })().catch((cause: unknown) => {
        this.warn("create", cause, { accountId, packageId });
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
          logPix("warn", "cancel-not-open-order", {
            accountId,
            requestedOrderId: orderId,
            openOrderId: order?.id ?? null,
          });
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
            // The provider refuses to cancel a paid charge: this is the
            // cancel-vs-pay race, so re-check the payment instead of dropping
            // an order that may already be money.
            logPix("warn", "cancel-refused-by-provider", {
              accountId,
              orderId: order.id,
              paymentId: order.providerPaymentId,
            });
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
        logPix(result === "cancelled" ? "info" : "warn", "order-cancelled", {
          accountId,
          characterId,
          orderId,
          paymentId: order.providerPaymentId,
          result,
        });
        this.answer(session, accountId, (live) => {
          if (result === "cancelled") this.sendState(live, null);
          else this.fail(live, "order-not-found");
        });
      })().catch((cause: unknown) => {
        this.warn("cancel", cause, { accountId, orderId });
        this.answer(session, accountId, (live) => {
          this.fail(live, "unavailable");
        });
      }),
    );
  }

  private async processPayment(providerPaymentId: string): Promise<void> {
    const payment = await this.provider.getPayment(providerPaymentId);
    logPix("info", "payment-fetched", {
      paymentId: providerPaymentId,
      status: payment.status,
      amountCentavos: payment.amountCentavos,
      currency: payment.currency,
      reference: payment.externalReference,
    });
    if (payment.status === "approved") {
      let result = await this.store.settleApproved({
        providerPaymentId,
        amountCentavos: payment.amountCentavos,
        currency: payment.currency,
        externalReference: payment.externalReference,
        snapshot: payment.snapshot,
      });
      if (result.status === "not-found") {
        const adopted = await this.adoptByReference(
          providerPaymentId,
          payment.externalReference,
        );
        if (adopted) {
          result = await this.store.settleApproved({
            providerPaymentId,
            amountCentavos: payment.amountCentavos,
            currency: payment.currency,
            externalReference: payment.externalReference,
            snapshot: payment.snapshot,
          });
        }
      }
      if (result.status === "credited") {
        logPix("info", "credited", {
          paymentId: providerPaymentId,
          orderId: result.orderId,
          accountId: result.accountId,
          characterId: result.characterId,
          coins: result.coins,
          balance: result.balance,
        });
        this.pushCredit(result.accountId, result.orderId, result.coins);
      }
      if (
        (result.status === "credited" || result.status === "already-settled") &&
        payment.refundedCentavos !== null &&
        payment.refundedCentavos > 0
      ) {
        await this.applyRefund(
          providerPaymentId,
          payment,
          payment.refundedCentavos,
        );
        return;
      }
      if (result.status === "credited") return;
      if (result.status === "refused") {
        logPix("error", "settle-refused", {
          paymentId: providerPaymentId,
          orderId: result.orderId,
          reason: result.reason,
          amountCentavos: payment.amountCentavos,
          currency: payment.currency,
          reference: payment.externalReference,
          action: "not credited; operator must resolve",
        });
        return;
      }
      if (result.status === "balance-limit") {
        logPix("error", "credit-parked", {
          paymentId: providerPaymentId,
          orderId: result.orderId,
          reason: "balance-cap",
          action: "reconciliation retries",
        });
        return;
      }
      if (result.status === "already-settled") {
        logPix("info", "settle-replayed", {
          paymentId: providerPaymentId,
          orderId: result.orderId,
        });
        return;
      }
      logPix("warn", "approved-payment-unmatched", {
        paymentId: providerPaymentId,
        amountCentavos: payment.amountCentavos,
        reference: payment.externalReference,
      });
      return;
    }
    if (payment.status === "refunded") {
      await this.applyRefund(providerPaymentId, payment, null);
      return;
    }
    if (payment.status === "cancelled") {
      const cancelled =
        await this.store.markProviderCancelled(providerPaymentId);
      if (cancelled) {
        logPix("info", "cancelled-by-provider", {
          paymentId: providerPaymentId,
          orderId: cancelled.id,
          accountId: cancelled.accountId,
        });
        this.pushOutcome(cancelled.accountId, (live) => {
          this.sendState(live, null);
        });
      }
      return;
    }
    if (payment.status === "unknown") {
      logPix("warn", "payment-status-unknown", {
        paymentId: providerPaymentId,
        reported: String(payment.snapshot.status ?? ""),
      });
    }
  }

  /**
   * A payment that matches no order by id but whose external reference names
   * one of ours: the create flow was cut between the provider accepting the
   * charge and `attachCharge` committing (restart, DB blip, or a payer faster
   * than the commit). Adoption pins the id so the ordinary settle path — with
   * every amount/currency/reference check — decides what happens next.
   */
  private async adoptByReference(
    providerPaymentId: string,
    externalReference: string | null,
  ): Promise<boolean> {
    if (externalReference === null || !UUID_PATTERN.test(externalReference)) {
      return false;
    }
    const adopted = await this.store.adoptPayment({
      orderId: externalReference,
      providerPaymentId,
    });
    logPix(adopted ? "warn" : "info", "payment-adopt", {
      paymentId: providerPaymentId,
      orderId: externalReference,
      adopted: adopted !== null,
      orderStatus: adopted?.status ?? null,
    });
    return adopted !== null;
  }

  private async applyRefund(
    providerPaymentId: string,
    payment: {
      readonly externalReference: string | null;
      readonly snapshot: Record<string, unknown>;
    },
    refundedCentavos: number | null,
    operatorCharacterId?: string,
  ): Promise<PixRefundResult> {
    const result = await this.store.markRefunded({
      providerPaymentId,
      externalReference: payment.externalReference,
      refundedCentavos,
      snapshot: payment.snapshot,
      ...(operatorCharacterId ? { operatorCharacterId } : {}),
    });
    if (result.status === "refunded") {
      logPix("warn", result.complete ? "refunded" : "refunded-partially", {
        paymentId: providerPaymentId,
        orderId: result.orderId,
        accountId: result.accountId,
        refundedCentavos,
        coinsDebited: result.coinsDebited,
        balance: result.balance,
        operatorCharacterId,
      });
      this.pushDebit(result.accountId, result.coinsDebited);
      return result;
    }
    if (result.status === "refused") {
      logPix("error", "refund-refused", {
        paymentId: providerPaymentId,
        orderId: result.orderId,
        reason: result.reason,
        reference: payment.externalReference,
      });
      return result;
    }
    logPix("info", "refund-ignored", {
      paymentId: providerPaymentId,
      result: result.status,
      orderId: result.status === "already-refunded" ? result.orderId : null,
    });
    return result;
  }

  /** `/pixorders <name>` or `/pixorder <orderId>`: read-only, audited. */
  inspect(
    session: Session,
    operatorCharacterId: string,
    subject: string,
    reply: OperatorReply,
  ): void {
    const accountId = session.account?.id;
    if (!accountId) return;
    this.track(
      (async () => {
        const orders = await this.lookupOrders(subject);
        await this.store.recordOperatorInspect({
          operatorCharacterId,
          subject,
        });
        logPix("info", "operator-inspect", {
          operatorCharacterId,
          subject: subject.slice(0, 64),
          found: orders?.length ?? 0,
        });
        this.answer(session, accountId, (live) => {
          if (orders === null) {
            reply(live, false, "No such character or order.");
            return;
          }
          if (orders.length === 0) {
            reply(live, true, "No Pix orders.");
            return;
          }
          for (const order of orders) reply(live, true, describeOrder(order));
        });
      })().catch((cause: unknown) => {
        this.warn("operator-inspect", cause, { operatorCharacterId });
        this.answer(session, accountId, (live) => {
          reply(live, false, "Lookup failed.");
        });
      }),
    );
  }

  /** `/pixcredit <orderId>`: force-credits a refused order. */
  credit(
    session: Session,
    operatorCharacterId: string,
    orderId: string,
    reply: OperatorReply,
  ): void {
    const accountId = session.account?.id;
    if (!accountId) return;
    if (!UUID_PATTERN.test(orderId)) {
      reply(session, false, "Usage: /pixcredit <orderId>");
      return;
    }
    this.track(
      (async () => {
        const result = await this.store.operatorCredit({
          orderId,
          operatorCharacterId,
        });
        logPix(
          result.status === "credited" ? "warn" : "info",
          "operator-credit",
          {
            operatorCharacterId,
            orderId,
            result: result.status,
            coins: result.status === "credited" ? result.coins : null,
          },
        );
        if (result.status === "credited") {
          this.pushCredit(result.accountId, result.orderId, result.coins);
        }
        this.answer(session, accountId, (live) => {
          if (result.status === "credited") {
            reply(
              live,
              true,
              `Credited ${result.coins} coins; balance ${result.balance}.`,
            );
          } else if (result.status === "not-refused") {
            reply(
              live,
              false,
              `Order is ${result.orderStatus}, only refused orders can be credited.`,
            );
          } else {
            reply(live, false, `Credit rejected: ${result.status}.`);
          }
        });
      })().catch((cause: unknown) => {
        this.warn("operator-credit", cause, { operatorCharacterId, orderId });
        this.answer(session, accountId, (live) => {
          reply(live, false, "Credit failed.");
        });
      }),
    );
  }

  /** `/pixrefund <orderId>`: refunds the payer at the provider, claws back coins. */
  refund(
    session: Session,
    operatorCharacterId: string,
    orderId: string,
    reply: OperatorReply,
  ): void {
    const accountId = session.account?.id;
    if (!accountId) return;
    if (!UUID_PATTERN.test(orderId)) {
      reply(session, false, "Usage: /pixrefund <orderId>");
      return;
    }
    this.track(
      (async () => {
        const order = await this.store.orderById(orderId);
        if (!order || order.providerPaymentId === null) {
          this.answer(session, accountId, (live) => {
            reply(live, false, "No such paid order.");
          });
          return;
        }
        if (order.status === "refunded") {
          this.answer(session, accountId, (live) => {
            reply(live, false, "Order is already refunded.");
          });
          return;
        }
        if (
          order.status !== "credited" &&
          order.status !== "paid" &&
          order.status !== "refused"
        ) {
          this.answer(session, accountId, (live) => {
            reply(live, false, `Order is ${order.status}; nothing to refund.`);
          });
          return;
        }
        const paymentId = order.providerPaymentId;
        const refunded = await this.provider.refundPayment(
          paymentId,
          `pix-operator-refund:${order.id}`,
        );
        logPix(refunded ? "warn" : "error", "operator-refund", {
          operatorCharacterId,
          orderId,
          paymentId,
          providerAccepted: refunded,
        });
        if (!refunded) {
          this.answer(session, accountId, (live) => {
            reply(live, false, "The provider refused the refund.");
          });
          return;
        }
        const result = await this.applyRefund(
          paymentId,
          { externalReference: null, snapshot: { source: "operator-refund" } },
          null,
          operatorCharacterId,
        );
        this.answer(session, accountId, (live) => {
          if (result.status === "refunded") {
            reply(
              live,
              true,
              `Refunded at the provider; clawed back ${result.coinsDebited} coins.`,
            );
          } else {
            reply(
              live,
              false,
              `Refunded at the provider; local clawback: ${result.status}.`,
            );
          }
        });
      })().catch((cause: unknown) => {
        this.warn("operator-refund", cause, { operatorCharacterId, orderId });
        this.answer(session, accountId, (live) => {
          reply(live, false, "Refund failed.");
        });
      }),
    );
  }

  private async lookupOrders(
    subject: string,
  ): Promise<ReadonlyArray<PixOrderRecord> | null> {
    if (UUID_PATTERN.test(subject)) {
      const order = await this.store.orderById(subject);
      return order ? [order] : null;
    }
    const name = normalizeCharacterName(subject);
    if (!name) return null;
    const accountId = await this.store.accountIdByCharacterName(
      name.normalizedName,
    );
    if (!accountId) return null;
    return this.store.recentOrdersForAccount(accountId, 5);
  }

  private async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const expired = await this.store.expireStale(new Date());
      for (const order of expired) {
        logPix("info", "order-expired", {
          orderId: order.id,
          accountId: order.accountId,
          paymentId: order.providerPaymentId,
        });
        if (order.providerPaymentId !== null) {
          let cancelled = false;
          try {
            cancelled = await this.provider.cancelPayment(
              order.providerPaymentId,
            );
          } catch (cause) {
            this.warn("expire-cancel", cause, { orderId: order.id });
          }
          if (!cancelled) {
            // A refused cancel means the charge is (or is becoming) paid:
            // settle it now rather than lose it — `expired` orders are not
            // in the reconciliation set, so this is the last look.
            logPix("warn", "expire-cancel-refused", {
              orderId: order.id,
              paymentId: order.providerPaymentId,
            });
            this.notify(order.providerPaymentId);
          }
        }
        this.pushOutcome(order.accountId, (live) => {
          this.sendState(live, null);
        });
      }
      const minAge =
        this.options?.minReconcileAgeMs ?? DEFAULT_MIN_RECONCILE_AGE_MS;
      const open = await this.store.claimForReconciliation(
        new Date(Date.now() - minAge),
        RECONCILE_BATCH,
      );
      let checked = 0;
      for (const order of open) {
        if (order.providerPaymentId === null) continue;
        checked += 1;
        try {
          await this.processPayment(order.providerPaymentId);
        } catch (cause) {
          this.warn("reconcile", cause, {
            orderId: order.id,
            paymentId: order.providerPaymentId,
          });
        }
      }
      if (expired.length > 0 || checked > 0) {
        logPix("info", "reconcile-sweep", {
          expired: expired.length,
          checked,
          listed: open.length,
        });
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

  private remember(map: Map<string, number>, key: string, now: number): void {
    map.set(key, now);
    if (map.size <= THROTTLE_MAP_SWEEP_SIZE) return;
    const stale = now - PROVIDER_CHECK_COOLDOWN_MS;
    for (const [entry, at] of map) {
      if (at < stale) map.delete(entry);
    }
  }

  private warn(
    context: string,
    cause: unknown,
    fields: Record<string, string | number | null> = {},
  ): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    logPix("warn", "operation-failed", { op: context, ...fields, reason });
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

function describeOrder(order: PixOrderRecord): string {
  const reais = (order.amountCentavos / 100).toFixed(2);
  const when = order.createdAt.toISOString().slice(0, 16).replace("T", " ");
  const refunded =
    order.refundedCentavos > 0
      ? ` refunded=${(order.refundedCentavos / 100).toFixed(2)}`
      : "";
  return (
    `${order.id} ${order.status} ${order.coins}c R$${reais} ${when}Z ` +
    `pay=${order.providerPaymentId ?? "none"}${refunded}`
  );
}
