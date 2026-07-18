export const countCharactersQuery =
  "SELECT count(*) FROM characters WHERE account_id = $1";
