-- Timed house auctions (todo 15, Feature 61).
--
-- Canary sells unowned houses through timed auctions rather than first-come
-- purchase. A bid opens the auction: the first accepted bid inserts the row
-- and stamps `ends_at`; later bids replace the bidder in place.
--
-- The row is the escrow record. Gold leaves the bidder's bank in the same
-- transaction that accepts the bid, so `bid` is always fully backed and an
-- outbid refund is a single credit inside the transaction that replaces the
-- bidder. Gold is conserved on every path: escrow -> refund (outbid, winner
-- no longer eligible, house bought directly meanwhile) or escrow -> consumed
-- by the winning purchase.
--
-- The row is also the lease for the close. The settle transaction deletes it
-- and inserts the `houses` row together, so a crash/replay of the scan finds
-- no auction row and does nothing (exactly-once close). `on delete restrict`
-- on the bidder keeps a character delete from silently dropping escrowed gold.

create table house_auctions (
  house_id integer primary key check (house_id between 1 and 1000000),
  bidder_character_id uuid not null references characters(id) on delete restrict,
  bid bigint not null check (bid > 0),
  bid_count integer not null default 1 check (bid_count >= 1),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index house_auctions_ends_at_idx on house_auctions(ends_at);
create index house_auctions_bidder_idx on house_auctions(bidder_character_id);

alter table house_auctions enable row level security;

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
      'guild-withdraw'
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
      'guild-war-payout'
    )
  );
