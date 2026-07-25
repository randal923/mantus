/**
 * Per-account authorization for admin actions (Feature 96).
 *
 * Roles are a ladder, but the gate is capability-based rather than
 * "level >= n": every command names the capability it needs, so widening one
 * role never silently widens another. The role itself always comes from the
 * session's own authenticated account — never from a client message body
 * (charter rule 9).
 */
export const ACCOUNT_ROLES = ["player", "tutor", "gamemaster", "admin"] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export type AdminCapability =
  /** Silence a character for a bounded time. */
  | "moderate.mute"
  /** Attach a durable note to a character. */
  | "moderate.note"
  /** Disconnect a live session. */
  | "moderate.kick"
  /** Flip accounts.banned_until and disconnect every session of the account. */
  | "moderate.ban"
  /** Hold a character out of the world until it is renamed. */
  | "moderate.namelock"
  /** Relocate a character within the world. */
  | "world.teleport"
  /** Read privileged state about a character or position. */
  | "world.inspect";

const CAPABILITIES_BY_ROLE: Readonly<
  Record<AccountRole, readonly AdminCapability[]>
> = {
  player: [],
  // Tutors calm chat and record what they saw. Deliberately no kick/ban: a
  // tutor cannot remove anyone from the game.
  tutor: ["moderate.mute", "moderate.note", "world.inspect"],
  gamemaster: [
    "moderate.mute",
    "moderate.note",
    "moderate.kick",
    "moderate.ban",
    "moderate.namelock",
    "world.teleport",
    "world.inspect",
  ],
  admin: [
    "moderate.mute",
    "moderate.note",
    "moderate.kick",
    "moderate.ban",
    "moderate.namelock",
    "world.teleport",
    "world.inspect",
  ],
};

const CAPABILITY_SETS = new Map<AccountRole, ReadonlySet<AdminCapability>>(
  ACCOUNT_ROLES.map((role) => [role, new Set(CAPABILITIES_BY_ROLE[role])]),
);

export function isAccountRole(value: unknown): value is AccountRole {
  return (
    typeof value === "string" &&
    (ACCOUNT_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Fail-closed: an unknown role grants nothing, so a database row written by a
 * newer server (or by hand) cannot authorize anything this build does not
 * understand.
 */
export function hasCapability(
  role: AccountRole | undefined,
  capability: AdminCapability,
): boolean {
  if (role === undefined) return false;
  return CAPABILITY_SETS.get(role)?.has(capability) ?? false;
}

export function capabilitiesFor(
  role: AccountRole,
): readonly AdminCapability[] {
  return CAPABILITIES_BY_ROLE[role] ?? [];
}
