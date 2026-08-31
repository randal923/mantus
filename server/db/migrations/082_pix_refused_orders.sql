-- A provider payment that is approved but does not match its order (amount,
-- currency or external reference) must never be credited. Instead of leaving
-- such an order `pending` — retried and re-alerted by every reconciliation
-- sweep until it expired, then silently dropped — it now parks in a terminal
-- `refused` state with one audit row, so the money trail survives for the
-- operator who resolves it. `pix-credit-parked` records a balance-cap park.

alter table pix_orders
  drop constraint pix_orders_status_check,
  add constraint pix_orders_status_check check (
    status in (
      'pending', 'paid', 'credited', 'cancelled', 'expired', 'refunded',
      'refused'
    )
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
      'pix-credit-parked'
    )
  );
