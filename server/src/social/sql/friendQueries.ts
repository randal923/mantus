/**
 * Friend and request reads/writes. All parameterized, all bounded, and all
 * scoped to the requesting character — a friend list is private to its owner
 * (charter rules 6 and 7).
 */

export const friendRowsQuery = `
  SELECT f.friend_character_id AS character_id, c.display_name
  FROM character_friends f
  JOIN characters c ON c.id = f.friend_character_id
  WHERE f.character_id = $1
  ORDER BY c.normalized_name
  LIMIT $2`;

export const incomingRequestRowsQuery = `
  SELECT r.from_character_id AS character_id, c.display_name
  FROM character_friend_requests r
  JOIN characters c ON c.id = r.from_character_id
  WHERE r.to_character_id = $1
  ORDER BY c.normalized_name
  LIMIT $2`;

export const outgoingRequestRowsQuery = `
  SELECT r.to_character_id AS character_id, c.display_name
  FROM character_friend_requests r
  JOIN characters c ON c.id = r.to_character_id
  WHERE r.from_character_id = $1
  ORDER BY c.normalized_name
  LIMIT $2`;

export const countFriendsQuery = `
  SELECT count(*)::int AS total FROM character_friends WHERE character_id = $1`;

export const countOutgoingRequestsQuery = `
  SELECT count(*)::int AS total FROM character_friend_requests
  WHERE from_character_id = $1`;

export const countIncomingRequestsQuery = `
  SELECT count(*)::int AS total FROM character_friend_requests
  WHERE to_character_id = $1`;

export const friendshipExistsQuery = `
  SELECT 1 FROM character_friends
  WHERE character_id = $1 AND friend_character_id = $2`;

export const requestExistsForUpdateQuery = `
  SELECT 1 FROM character_friend_requests
  WHERE from_character_id = $1 AND to_character_id = $2
  FOR UPDATE`;

export const insertFriendRequestQuery = `
  INSERT INTO character_friend_requests (from_character_id, to_character_id)
  VALUES ($1, $2)`;

export const deleteFriendRequestQuery = `
  DELETE FROM character_friend_requests
  WHERE from_character_id = $1 AND to_character_id = $2`;

/** Writes both halves together: a friendship is never one-directional. */
export const insertFriendshipQuery = `
  INSERT INTO character_friends (character_id, friend_character_id)
  VALUES ($1, $2), ($2, $1)
  ON CONFLICT DO NOTHING`;

export const deleteFriendshipQuery = `
  DELETE FROM character_friends
  WHERE (character_id = $1 AND friend_character_id = $2)
     OR (character_id = $2 AND friend_character_id = $1)`;

export const socialSettingsQuery = `
  SELECT finder_visible FROM character_social_settings WHERE character_id = $1`;

export const upsertSocialSettingsQuery = `
  INSERT INTO character_social_settings (character_id, finder_visible)
  VALUES ($1, $2)
  ON CONFLICT (character_id)
  DO UPDATE SET finder_visible = EXCLUDED.finder_visible, updated_at = now()`;

export const characterNameQuery = `
  SELECT display_name FROM characters WHERE id = $1`;
