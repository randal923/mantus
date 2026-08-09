export const insertPortableSellerSaleAuditQuery = `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'portable-seller-sale', $1,
           jsonb_build_object(
             'itemCount', $2::integer, 'stackCount', $3::integer,
             'totalProceeds', $4::bigint, 'balanceAfter', $5::bigint
           )
         )`;
