export const insertBankTransferAuditQuery = `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'bank-transfer', $1,
           jsonb_build_object(
             'amount', $2::bigint,
             'toCharacterId', $3::uuid,
             'balanceAfter', $4::bigint
           )
         )`;
