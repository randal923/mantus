export const insertShopPurchaseAuditQuery = `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'shop-purchase', $1,
           jsonb_build_object(
             'npcTypeId', $2::text, 'shopId', $3::text,
             'offerId', $4::text, 'itemTypeId', $5::integer,
             'amount', $6::integer, 'totalCost', $7::bigint,
             'bankSpent', $8::bigint, 'subtype', $9::integer,
             'stockRemaining', $10::integer,
             'currencyItemTypeId', $11::integer
           )
         )`;
