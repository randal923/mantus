-- Mantus Store parity (todo 12, Feature 43): item products delivered to the
-- inbox, operator coin grants, and refunds.
--
-- `request_key` is the idempotency anchor for every coin-moving store
-- operation. A retried purchase, grant or refund inserts nothing and returns
-- the first outcome, so a client retry or an operator running the same command
-- twice can never double-credit or double-charge.
--
-- `refunded_entry_id` self-references the purchase a refund reverses, and its
-- unique index makes "one refund per purchase" a database invariant rather
-- than an application check.

alter table mantus_coin_ledger
  add column request_key varchar(128),
  add column refunded_entry_id bigint references mantus_coin_ledger(id)
    on delete restrict,
  add column operator_character_id uuid references characters(id)
    on delete set null;

create unique index mantus_coin_ledger_request_key_idx
  on mantus_coin_ledger(request_key)
  where request_key is not null;

create unique index mantus_coin_ledger_refunded_entry_idx
  on mantus_coin_ledger(refunded_entry_id)
  where refunded_entry_id is not null;

alter table mantus_coin_ledger
  add constraint mantus_coin_ledger_refund_shape check (
    (entry_type = 'refund') or refunded_entry_id is null
  );

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
      'store-purchase',
      'store-grant',
      'store-refund'
    )
  );
