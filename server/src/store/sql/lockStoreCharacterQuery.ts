/**
 * Locks the buyer's own character row and reads everything the delivery legs
 * re-check at execution time. The sex and worn look type matter to outfit and
 * sex-change purchases; locking here also serialises a purchase against a
 * concurrent rename or outfit change (charter rules 3 and 4).
 */
export const lockStoreCharacterQuery = `SELECT id, display_name, sex,
         outfit_look_type, outfit_addons, town_id
       FROM characters
       WHERE id = $1
       FOR UPDATE`;
