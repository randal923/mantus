export const insertSkullSanctionAuditQuery = `INSERT INTO audit_log (
           event_type, character_id, details
         ) VALUES ('pvp-skull-sanction', $1, $2::jsonb)`;
