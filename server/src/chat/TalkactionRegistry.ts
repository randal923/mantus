import type { Player } from "../Player";

export interface TalkactionContext {
  readonly player: Player;
  /** Milliseconds the server has been running, measured by the caller. */
  readonly uptimeMs: number;
  readonly onlinePlayerCount: number;
  readonly experienceRate: number;
  readonly lootRate: number;
}

export interface TalkactionDefinition {
  /** The exact spoken word, including its `!` prefix. */
  readonly word: string;
  readonly description: string;
  /**
   * Runs as a typed server action — never Lua — and returns the line the
   * caller is told. It may only report state the caller is already entitled
   * to: their own character, or server-wide facts (charter rule 6).
   */
  readonly run: (context: TalkactionContext) => string;
}

function formatDuration(totalMs: number): string {
  const totalMinutes = Math.floor(totalMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

const DEFINITIONS: ReadonlyArray<TalkactionDefinition> = [
  {
    word: "!uptime",
    description: "How long this server has been running.",
    run: (context) => `Server uptime: ${formatDuration(context.uptimeMs)}.`,
  },
  {
    word: "!online",
    description: "How many characters are in the world (a count, no names).",
    run: (context) =>
      `There ${context.onlinePlayerCount === 1 ? "is" : "are"} ${
        context.onlinePlayerCount
      } character${context.onlinePlayerCount === 1 ? "" : "s"} online.`,
  },
  {
    word: "!serverinfo",
    description: "The world's configured experience and loot rates.",
    run: (context) =>
      `Experience rate: ${context.experienceRate}x. Loot rate: ${context.lootRate}x.`,
  },
  {
    word: "!exp",
    description: "The caller's own level and experience.",
    run: (context) =>
      `You are level ${context.player.level} with ${context.player.experience} experience.`,
  },
];

/**
 * Player talkactions as typed server actions. Canary registers these in Lua;
 * here each one is a reviewed function with a fixed word, so the chat pipeline
 * can consume the line before it is ever broadcast.
 */
export class TalkactionRegistry {
  private readonly byWord = new Map(
    DEFINITIONS.map(
      (definition) => [definition.word.toLowerCase(), definition] as const,
    ),
  );

  all(): ReadonlyArray<TalkactionDefinition> {
    return DEFINITIONS;
  }

  /** Matches a whole spoken line; talkactions here take no arguments. */
  match(text: string): TalkactionDefinition | undefined {
    return this.byWord.get(text.trim().toLowerCase());
  }
}
