export const houseAuctionRowForUpdateQuery = `
  SELECT house_id, bidder_character_id, bid, bid_count, ends_at
  FROM house_auctions
  WHERE house_id = $1
  FOR UPDATE`;
