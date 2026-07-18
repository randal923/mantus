import { depotItemColumns } from "../../depot/sql/depotItemColumns";

export const lockEscrowRowsForOfferQuery = `SELECT ${depotItemColumns}
       FROM items
       WHERE id IN (
         SELECT item_id FROM market_escrow_items WHERE offer_id = $1
       )
       ORDER BY id
       FOR UPDATE`;
