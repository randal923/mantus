export const insertShopSaleAuditQuery = `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'shop-sale', $1,
           jsonb_build_object(
             'npcTypeId', $2::text, 'shopId', $3::text,
             'offerId', $4::text, 'itemTypeId', $5::integer,
             'amount', $6::integer, 'totalProceeds', $7::bigint,
             'subtype', $8::integer,
             'currencyItemTypeId', $9::integer
           )
         )`;
