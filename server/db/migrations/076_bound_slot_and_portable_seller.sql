-- The character-bound items slot: a per-character container (Canary's
-- store-inbox slot) rooted at equipment_slot 'bound'. Its direct children are
-- character-bound (the loot pouch, the Portable Seller) and never leave it.
-- The Portable Seller vendors the loot pouch's contents; each sweep destroys
-- the sold rows and credits the bank in one transaction, audited as
-- 'portable-seller-sale' (charter rules 2 and 11).

alter table items
  drop constraint items_equipment_slot_check,
  add constraint items_equipment_slot_check check (
    equipment_slot in (
      'helmet', 'amulet', 'backpack', 'armor', 'weapon', 'shield',
      'legs', 'boots', 'ring', 'ammo', 'bound'
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
      'portable-seller-sale'
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
      'house-bid-escrow',
      'house-bid-refund',
      'gem-atelier',
      'vocation-promotion',
      'spell-purchase',
      'guild-deposit',
      'guild-withdraw',
      'prey-reroll',
      'hunting-task-reroll',
      'hunting-task-cancel',
      'boss-slot-remove',
      'forge',
      'imbuement',
      'portable-seller-sale'
    )
  );
