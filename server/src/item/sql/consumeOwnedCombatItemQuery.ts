export const consumeOwnedCombatItemQuery = `
  SELECT before_item, after_item, removed_item_id
  FROM consume_owned_combat_item($1, $2, $3, $4, $5)`;
