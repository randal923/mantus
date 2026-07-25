export const updateHouseAuctionBidQuery = `
  UPDATE house_auctions
  SET bidder_character_id = $2,
      bid = $3,
      bid_count = bid_count + 1,
      updated_at = now()
  WHERE house_id = $1`;
