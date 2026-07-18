export const insertProgressionEventQuery = `INSERT INTO progression_events (
             character_id, event_id, event_type
           ) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`;
