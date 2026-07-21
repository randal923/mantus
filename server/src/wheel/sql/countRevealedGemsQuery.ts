export const countRevealedGemsQuery =
  "SELECT count(*)::int AS count FROM character_gems WHERE character_id = $1";
