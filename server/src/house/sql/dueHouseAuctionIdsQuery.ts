export const dueHouseAuctionIdsQuery = `
  SELECT house_id FROM house_auctions
  WHERE ends_at <= $1
  ORDER BY ends_at ASC
  LIMIT $2`;
