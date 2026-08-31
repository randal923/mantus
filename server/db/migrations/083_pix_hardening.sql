-- Reconciliation fairness, partial refunds, payment adoption and the
-- operator resolution surface for Pix orders.
--
-- `last_checked_at`: the sweep claims its batch ordered by this column
-- (never-checked first), so a pile of abandoned pending orders can no longer
-- starve newer ones for the whole hour they stay open.
-- `refunded_centavos`: cumulative amount the provider reports refunded, so a
-- partial refund (provider status stays `approved`) claws back the matching
-- share of coins exactly once per reported level.

alter table pix_orders
  add column last_checked_at timestamptz,
  add column refunded_centavos bigint not null default 0
    check (refunded_centavos >= 0);

create index pix_orders_reconcile_idx
  on pix_orders(last_checked_at nulls first, created_at)
  where status in ('pending', 'paid') and provider_payment_id is not null;

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
      'house-auction-bid',
      'house-auction-settled',
      'gem-reveal',
      'gem-destroy',
      'gem-switch-domain',
      'gem-grade-improve',
      'vocation-promotion',
      'spell-purchase',
      'store-purchase',
      'store-grant',
      'store-refund',
      'chest-loot',
      'world-event-started',
      'world-event-operator',
      'guild-deposit',
      'guild-withdraw',
      'guild-war-stake',
      'guild-war-payout',
      'prey-list-reroll',
      'prey-bonus-reroll',
      'prey-wildcard-list',
      'prey-option-charge',
      'prey-wildcard-grant',
      'hunting-task-reroll',
      'hunting-task-star-reroll',
      'hunting-task-wildcard-list',
      'hunting-task-cancel',
      'hunting-task-claim',
      'boss-slot-remove',
      'forge-fusion',
      'forge-transfer',
      'forge-conversion',
      'imbuement-apply',
      'imbuement-clear',
      'boss-reward',
      'reward-expired',
      'reward-collect',
      'daily-reward-claim',
      'quest-reward',
      'imbuement-scroll-create',
      'imbuement-scroll-apply',
      'bless-purchase',
      'portable-seller-sale',
      'pix-order-created',
      'pix-coin-credit',
      'pix-order-cancelled',
      'pix-order-expired',
      'pix-refund',
      'pix-settle-refused',
      'pix-credit-parked',
      'pix-payment-adopted',
      'pix-operator-credit',
      'pix-operator-refund',
      'pix-operator-inspect'
    )
  );
