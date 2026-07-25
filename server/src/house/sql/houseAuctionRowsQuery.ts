export const houseAuctionRowsQuery = `
  SELECT a.house_id, a.bidder_character_id, a.bid, a.ends_at,
         c.display_name AS bidder_name
  FROM house_auctions a
  JOIN characters c ON c.id = a.bidder_character_id
  ORDER BY a.house_id`;
