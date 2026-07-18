import { characterColumns } from "./characterColumns";

export const insertCharacterQuery = `INSERT INTO characters (
           id, account_id, display_name, normalized_name, vocation, level,
           experience, magic_level, mana_spent, health, mana, soul,
           progression_definition_version,
           position_x, position_y, position_z, direction, outfit_look_type,
           outfit_head, outfit_body, outfit_legs, outfit_feet, outfit_addons,
           town_id, created_at, updated_at, last_login_at, version
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
           $27, $28
         )
         RETURNING ${characterColumns}`;
