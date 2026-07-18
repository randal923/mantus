export const insertBankWithdrawAuditQuery = `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'bank-withdraw', $1,
           jsonb_build_object('amount', $2::bigint, 'balanceAfter', $3::bigint)
         )`;
