export const selectRecipientIdQuery =
  "SELECT id FROM characters WHERE normalized_name = lower($1)";
