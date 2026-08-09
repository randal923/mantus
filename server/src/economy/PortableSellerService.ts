import {
  PORTABLE_SELLER_AUTO_INTERVAL_MS,
  PORTABLE_SELLER_MANUAL_COOLDOWN_MS,
  PORTABLE_SELLER_TYPE_ID,
  type UseItemMessage,
} from "@tibia/protocol";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { EconomyPersistStore } from "./EconomyPersistStore";
import { planPortableSellerSale } from "./plan/planPortableSellerSale";

/** Retry delay when a sweep lands while another item operation is in flight. */
const BUSY_RETRY_MS = 5_000;

/**
 * The Portable Seller: while a character carries one, every ten minutes the
 * loot pouch's contents are vendored at catalog NPC values and the proceeds
 * credited to the bank; using the item triggers the same sweep with a
 * one-minute cooldown. All timing lives here, server-side (charter rule 8);
 * the sale itself is planned in memory inside the tick and persisted as one
 * transaction on the item lane, exactly like an NPC sale.
 */
export class PortableSellerService {
  private readonly nextAutoSellAt = new Map<string, number>();
  private readonly manualReadyAt = new Map<string, number>();
  private readonly saleSeq = new Map<string, number>();

  constructor(
    private readonly registry: SessionRegistry,
    private readonly items: ItemIntentHandler,
    private readonly catalog: ItemCatalog,
    private readonly persist?: EconomyPersistStore,
  ) {}

  tick(now: number): void {
    for (const session of this.registry.all()) {
      const characterId = session.playerId;
      if (!characterId) continue;
      const next = this.nextAutoSellAt.get(characterId);
      if (next === undefined) {
        this.nextAutoSellAt.set(
          characterId,
          now + PORTABLE_SELLER_AUTO_INTERVAL_MS,
        );
        continue;
      }
      if (now < next) continue;
      if (session.itemOperationPending || session.travelOperationPending) {
        this.nextAutoSellAt.set(characterId, now + BUSY_RETRY_MS);
        continue;
      }
      this.nextAutoSellAt.set(
        characterId,
        now + PORTABLE_SELLER_AUTO_INTERVAL_MS,
      );
      this.sweep(session, characterId, now);
    }
  }

  /** True when the intent was consumed as a Portable Seller trigger. */
  handleUseItem(session: Session, intent: UseItemMessage, now: number): boolean {
    const characterId = session.playerId;
    if (!characterId) return false;
    const item = this.items
      .inventorySnapshot(characterId)
      ?.items.find((candidate) => candidate.id === intent.itemId);
    if (!item || item.version !== intent.revision) return false;
    if (item.typeId !== PORTABLE_SELLER_TYPE_ID) return false;
    const readyAt = this.manualReadyAt.get(characterId) ?? 0;
    if (now < readyAt) {
      session.send({
        type: "portable-seller-cooldown",
        remainingMs: Math.min(
          readyAt - now,
          PORTABLE_SELLER_MANUAL_COOLDOWN_MS,
        ),
      });
      return true;
    }
    if (session.itemOperationPending || session.travelOperationPending) {
      session.sendError("item-action-failed");
      return true;
    }
    const sold = this.sweep(session, characterId, now);
    if (sold) {
      this.manualReadyAt.set(
        characterId,
        now + PORTABLE_SELLER_MANUAL_COOLDOWN_MS,
      );
    } else {
      session.sendError("portable-seller-empty");
    }
    return true;
  }

  detachCharacter(characterId: string): void {
    this.nextAutoSellAt.delete(characterId);
    this.manualReadyAt.delete(characterId);
    this.saleSeq.delete(characterId);
  }

  /** Runs one sale sweep; true when something sold. */
  private sweep(session: Session, characterId: string, now: number): boolean {
    const snapshot = this.items.inventorySnapshot(characterId);
    if (!snapshot) return false;
    const seller = snapshot.items.find(
      (candidate) => candidate.typeId === PORTABLE_SELLER_TYPE_ID,
    );
    if (!seller) return false;
    const planned = planPortableSellerSale({
      characterId,
      catalog: this.catalog,
      items: snapshot.items,
      bankBalance: snapshot.bankBalance,
    });
    if (!planned) return false;
    this.items.applyCommittedMutation(session, characterId, planned.mutation, now);
    this.items.setBankBalance(characterId, planned.bankBalanceAfter);
    session.send({ type: "bank-updated", balance: planned.bankBalanceAfter });
    const persist = this.persist;
    if (persist) {
      this.items.enqueuePersist(session, characterId, () =>
        persist.persist(planned.persist),
      );
    }
    const saleId = (this.saleSeq.get(characterId) ?? 0) + 1;
    this.saleSeq.set(characterId, saleId);
    session.send({
      type: "portable-seller-triggered",
      saleId,
      itemId: seller.id,
      soldCount: planned.soldCount,
      proceeds: planned.proceeds,
      bankBalance: planned.bankBalanceAfter,
    });
    return true;
  }
}
