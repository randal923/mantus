import { CHAT_CHANNEL_IDS, type ChatChannelId } from "@tibia/protocol";
import type { Player } from "../Player";

export interface ChatChannelDefinition {
  readonly id: ChatChannelId;
  readonly label: string;
  /**
   * Execution-time membership rule. Re-run for every line, never cached at
   * subscribe time (charter rule 4) — a player who drops below the level a
   * channel needs stops receiving it on the very next line.
   */
  readonly canJoin: (player: Player) => boolean;
  /** False for read-only channels (broadcast-style). */
  readonly canSpeak: boolean;
}

/** Canary's Help channel refuses the newest accounts, as ours does. */
const HELP_MINIMUM_LEVEL = 2;

const DEFINITIONS: ReadonlyArray<ChatChannelDefinition> = [
  {
    id: "game-chat",
    label: "Game Chat",
    canJoin: () => true,
    canSpeak: true,
  },
  {
    id: "trade",
    label: "Trade",
    canJoin: () => true,
    canSpeak: true,
  },
  {
    id: "help",
    label: "Help",
    canJoin: (player) => player.level >= HELP_MINIMUM_LEVEL,
    canSpeak: true,
  },
];

/**
 * The server's public chat channels as typed data. A channel id from a client
 * is only ever a lookup key here; who receives a line is decided by this
 * registry plus the subscription state the server itself keeps.
 */
export class ChatChannelRegistry {
  private readonly byId = new Map(
    DEFINITIONS.map((definition) => [definition.id, definition] as const),
  );

  get(channelId: ChatChannelId): ChatChannelDefinition | undefined {
    return this.byId.get(channelId);
  }

  all(): ReadonlyArray<ChatChannelDefinition> {
    return DEFINITIONS;
  }

  /** The channels this player may open right now. */
  joinable(player: Player): ReadonlyArray<ChatChannelDefinition> {
    return DEFINITIONS.filter((definition) => definition.canJoin(player));
  }
}

/** Every registered id is backed by a definition — the parity test pins this. */
export const REGISTERED_CHANNEL_IDS: ReadonlyArray<ChatChannelId> = [
  ...CHAT_CHANNEL_IDS,
];
