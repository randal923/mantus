/**
 * A parsed Canary house access list. Text lists are player-authored, so the
 * parsed form is deliberately inert data: sets of names, guild references,
 * and pre-compiled wildcard patterns. Guild entries are stored as *names*,
 * never as a membership snapshot — membership is resolved live at every
 * check, so leaving a guild takes effect on the next step or door use.
 */
export interface HouseAccessList {
  /** A bare `*` line grants everyone. */
  readonly everyone: boolean;
  /** Exact lowercase character names. */
  readonly names: ReadonlySet<string>;
  /** Lowercase guild names granted in full (`@guild`). */
  readonly guilds: ReadonlySet<string>;
  /** Lowercase `rank@guild` pairs. */
  readonly guildRanks: ReadonlyArray<{
    readonly guild: string;
    readonly rank: string;
  }>;
  /**
   * Wildcard patterns in list order. The first pattern that matches decides,
   * so a `!`-prefixed deny placed above a broad allow wins (Canary order).
   */
  readonly patterns: ReadonlyArray<{
    readonly regex: RegExp;
    readonly allow: boolean;
  }>;
}

/** The live identity an access list is evaluated against. */
export interface HouseAccessSubject {
  readonly name: string;
  /** Live guild id; a guildhall grants its own guild's members access. */
  readonly guildId?: string | null;
  readonly guildName: string | null;
  readonly guildRankName: string | null;
}

export const EMPTY_HOUSE_ACCESS_LIST: HouseAccessList = {
  everyone: false,
  names: new Set(),
  guilds: new Set(),
  guildRanks: [],
  patterns: [],
};
