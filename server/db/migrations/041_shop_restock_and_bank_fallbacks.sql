-- Shop/travel bank fallbacks and the shop restock schedule (todo 12,
-- Features 42/46).
--
-- Two new bank_ledger entry types:
--   * 'shop-sale'  — sale proceeds that did not fit in the seller's backpack
--                    are credited to the bank in the sale's own transaction,
--                    matching Canary instead of failing the sale.
--   * 'npc-travel' — a travel fare short on carried coins falls back to the
--                    bank balance, mirroring Canary's removeMoneyBank.
--
-- Restock lives on shop_stock itself rather than in a lease table: the row's
-- own restock_at IS the lease. Restocking is a single conditional UPDATE
-- guarded by `restock_at <= now()`, so it is idempotent across restarts and
-- safe for two servers to run concurrently — the loser sees the advanced
-- deadline and updates nothing.

-- Also repairs `audit_log`: migration 040 rewrote the whole event-type check
-- and silently dropped 'store-purchase' (added by 033), so every Mantus Store
-- purchase failed its audit insert — and therefore its whole transaction —
-- against a fully migrated database.
alter table audit_log
  drop constraint audit_log_event_type_check,
  add constraint audit_log_event_type_check check (
    event_type in (
      'item-created',
      'item-destroyed',
      'item-transferred',
      'item-split',
      'item-merged',
      'item-transformed',
      'item-written',
      'world-item-seeded',
      'npc-travel',
      'bank-deposit',
      'bank-withdraw',
      'bank-transfer',
      'shop-purchase',
      'shop-sale',
      'market-offer-created',
      'market-offer-accepted',
      'market-offer-cancelled',
      'market-offer-expired',
      'pvp-skull-sanction',
      'house-purchase',
      'house-transfer',
      'house-rent',
      'house-eviction',
      'gem-reveal',
      'gem-destroy',
      'gem-switch-domain',
      'gem-grade-improve',
      'vocation-promotion',
      'spell-purchase',
      'store-purchase'
    )
  );

alter table bank_ledger
  drop constraint bank_ledger_entry_type_check,
  add constraint bank_ledger_entry_type_check check (
    entry_type in (
      'deposit',
      'withdraw',
      'transfer-in',
      'transfer-out',
      'shop-purchase',
      'shop-sale',
      'npc-travel',
      'market-fee',
      'market-escrow',
      'market-refund',
      'market-sale',
      'market-purchase',
      'house-purchase',
      'house-rent',
      'house-transfer-in',
      'house-transfer-out',
      'gem-atelier',
      'vocation-promotion',
      'spell-purchase'
    )
  );

alter table shop_stock
  add column restock_interval_seconds integer
    check (restock_interval_seconds between 60 and 2592000),
  add column restock_at timestamptz;

-- A row either restocks on a schedule or never does; half a schedule would
-- leave the sweep unable to decide when the next boundary is.
alter table shop_stock
  add constraint shop_stock_restock_complete check (
    (restock_interval_seconds is null) = (restock_at is null)
  );

create index shop_stock_restock_at_idx
  on shop_stock(restock_at)
  where restock_at is not null;
