export const insertHouseAuctionQuery = `
  INSERT INTO house_auctions (house_id, bidder_character_id, bid, ends_at)
  VALUES ($1, $2, $3, $4)`;
