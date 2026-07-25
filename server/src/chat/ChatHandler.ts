import type {
  ChannelCloseMessage,
  ChannelListGetMessage,
  ChannelOpenMessage,
  ChannelSpeakMessage,
  ChatChannelId,
  ChatTypingMessage,
  CreatureSpeechMode,
  IgnoreAddMessage,
  IgnoreRemoveMessage,
  PrivateChatMessage,
  SpeakMessage,
} from "@tibia/protocol";
import type { SpokenSpellOutcome } from "../combat/SpokenSpellOutcome";
import type { GmCommandHandler } from "../gm/GmCommandHandler";
import type { ModerationCommandHandler } from "../moderation/ModerationCommandHandler";
import type { ChatModerationHooks } from "../moderation/ChatModerationHooks";
import type { Player } from "../Player";
import type { NpcHandler } from "../npc/NpcHandler";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { ChatChannelRegistry } from "./ChatChannelRegistry";
import {
  DEFAULT_CHAT_FLOOD_LIMITS,
  type ChatFloodLimits,
} from "./ChatFloodLimits";
import { ChatFloodMetrics } from "./ChatFloodMetrics";
import { ChatRateLimiter } from "./ChatRateLimiter";
import { IgnoreList } from "./IgnoreList";
import { TalkactionRegistry } from "./TalkactionRegistry";

type ChatIntent =
  | SpeakMessage
  | PrivateChatMessage
  | ChatTypingMessage
  | ChannelListGetMessage
  | ChannelOpenMessage
  | ChannelCloseMessage
  | ChannelSpeakMessage
  | IgnoreAddMessage
  | IgnoreRemoveMessage;

/** One typing hint per second per session; purely ephemeral. */
const TYPING_INTERVAL_MS = 1_000;

/** Whisper text is audible only from adjacent tiles; farther viewers hear this. */
const WHISPER_MUFFLED_TEXT = "pspsps";
const WHISPER_AUDIBLE_DISTANCE = 1;
/** Canary: yells reach double the (viewport + 1) box, floor-aware. */
const YELL_RANGE = { x: 18, y: 14 };
const YELL_EXHAUST_MS = 30_000;
/** Canary: level 1 characters may not yell. */
const YELL_MINIMUM_LEVEL = 2;

/**
 * Routes player speech. The speaker is always the session's own character
 * (charter rule 9); every limit here is enforced at execution time inside
 * the tick, regardless of what the client UI showed (charter rules 4, 8).
 * Message bodies are never logged.
 */
export class ChatHandler {
  /** Flood counters an operator can read; never holds message content. */
  readonly floodMetrics = new ChatFloodMetrics();
  private readonly rateLimiter: ChatRateLimiter;
  /** Keyed by character id for the server's lifetime so relogging cannot reset it. */
  private readonly nextYellAt = new Map<string, number>();
  private readonly channels = new ChatChannelRegistry();
  private readonly talkactions = new TalkactionRegistry();
  private readonly ignores = new IgnoreList();
  /** Per-session typing-hint cooldown; ephemeral, like the hint itself. */
  private readonly typingReadyAt = new Map<string, number>();
  /** Open channels per character id; membership is still re-checked per line. */
  private readonly subscriptions = new Map<string, Set<ChatChannelId>>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly visibility: Visibility,
    private readonly npcs?: NpcHandler,
    private readonly gm?: GmCommandHandler,
    private readonly moderationCommands?: ModerationCommandHandler,
    private readonly moderation?: ChatModerationHooks,
    private readonly castSpellWords?: (
      session: Session,
      text: string,
      now: number,
    ) => SpokenSpellOutcome,
    private readonly serverInfo?: () => {
      uptimeMs: number;
      onlinePlayerCount: number;
      experienceRate: number;
      lootRate: number;
    },
    floodLimits: ChatFloodLimits = DEFAULT_CHAT_FLOOD_LIMITS,
  ) {
    this.rateLimiter = new ChatRateLimiter(floodLimits, this.floodMetrics);
  }

  /** Drops a leaving character's open channels; the ignore list outlives them. */
  detach(characterId: string): void {
    this.subscriptions.delete(characterId);
  }

  handle(session: Session, intent: ChatIntent, now: number): void {
    if (!session.playerId) {
      session.sendError("join-required");
      return;
    }
    const speaker = this.world.getPlayer(session.playerId);
    if (!speaker) {
      session.sendError("join-required");
      return;
    }
    // Channel membership and ignore lists are session bookkeeping, not
    // speech: they carry no text and never touch the flood budget.
    if (intent.type === "channel-list-get") {
      this.sendChannelList(session, speaker);
      session.send({
        type: "ignore-list",
        names: [...this.ignores.names(speaker.id)],
      });
      return;
    }
    if (intent.type === "channel-open" || intent.type === "channel-close") {
      this.setChannelOpen(
        session,
        speaker,
        intent.channelId,
        intent.type === "channel-open",
      );
      return;
    }
    if (intent.type === "ignore-add" || intent.type === "ignore-remove") {
      this.updateIgnoreList(session, speaker, intent);
      return;
    }
    if (intent.type === "chat-typing") {
      this.forwardTyping(session, speaker, intent.to, now);
      return;
    }
    const text = intent.text.trim();
    if (text.length === 0) return;
    // Dev-only GM commands are consumed before the chat pipeline so they are
    // never broadcast; on production servers `gm` is never constructed.
    if (
      intent.type === "speak" &&
      this.gm?.tryHandle(session, speaker, text, now)
    ) {
      return;
    }
    // The production moderation surface: same audited actions, authorized
    // from the session's own staff flag rather than a dev switch.
    if (
      intent.type === "speak" &&
      this.moderationCommands?.tryHandle(session, speaker, text)
    ) {
      return;
    }
    // GM mutes and cross-channel spam mutes are enforced at execution time,
    // before the flood buffer, so muted players consume no buffer.
    const moderationMuteMs =
      this.moderation?.muteRemainingMs(speaker.id, now) ?? 0;
    if (moderationMuteMs > 0) {
      session.send({
        type: "chat-rejected",
        reason: "muted",
        retryAfterMs: moderationMuteMs,
      });
      return;
    }
    // Muted players consume no buffer; probing offline names still does,
    // so the rate limit also caps online-status scanning.
    const mutedForMs = this.rateLimiter.consume(speaker.id, now);
    if (mutedForMs > 0) {
      // Report the flood mute so it applies across every chat kind.
      this.moderation?.noteAutoMute(speaker.id, now + mutedForMs);
      session.send({
        type: "chat-rejected",
        reason: "muted",
        retryAfterMs: mutedForMs,
      });
      return;
    }
    if (intent.type === "private-chat") {
      this.deliverPrivate(session, speaker, intent.to, text);
      return;
    }
    if (intent.type === "channel-speak") {
      this.deliverChannel(session, speaker, intent.channelId, text);
      return;
    }
    // Player talkactions are typed server actions consumed before the line is
    // ever broadcast, exactly as Canary's talkaction pass runs before speech.
    const talkaction = this.talkactions.match(text);
    if (talkaction) {
      const info = this.serverInfo?.() ?? {
        uptimeMs: 0,
        onlinePlayerCount: this.world.playerCount,
        experienceRate: 1,
        lootRate: 1,
      };
      session.send({
        type: "server-notice",
        category: "talkaction",
        text: talkaction.run({ player: speaker, ...info }),
      });
      return;
    }
    // Saying a spell's words casts it, Tibia-style, and Canary runs the spell
    // before the line is spoken: it applies to say, whisper, and yell alike,
    // and a cast never spends the yell exhaust. The words are spoken either
    // way; the cast pipeline re-validates everything itself.
    const outcome = this.castSpellWords?.(session, text, now) ?? "no-match";
    if (outcome === "cast") {
      // Spoken from wherever the caster ended up: a floor-moving spell has
      // already teleported them, exactly as Canary orders it.
      this.broadcastLocal(speaker, "magic", text);
      this.npcs?.handleSpeech(speaker, text, now);
      return;
    }
    if (intent.mode === "yell") {
      this.yell(session, speaker, text, now);
      return;
    }
    this.broadcastLocal(speaker, intent.mode, text);
    this.npcs?.handleSpeech(speaker, text, now);
  }

  /**
   * Opens or closes one registered channel for this session. Opening only
   * records the subscription; whether a line is actually delivered is decided
   * again, per line, from live state.
   */
  private setChannelOpen(
    session: Session,
    speaker: Player,
    channelId: ChatChannelId,
    open: boolean,
  ): void {
    const definition = this.channels.get(channelId);
    if (!definition || (open && !definition.canJoin(speaker))) {
      session.send({ type: "chat-rejected", reason: "channel-not-open" });
      return;
    }
    const subscribed =
      this.subscriptions.get(speaker.id) ?? new Set<ChatChannelId>();
    if (open) subscribed.add(channelId);
    else subscribed.delete(channelId);
    this.subscriptions.set(speaker.id, subscribed);
    if (!open) session.send({ type: "channel-closed", channelId });
    this.sendChannelList(session, speaker);
  }

  /** The channel list this character may open, with their open state. */
  sendChannelList(session: Session, speaker: Player): void {
    const subscribed = this.subscriptions.get(speaker.id);
    session.send({
      type: "channel-list",
      channels: this.channels.joinable(speaker).map((definition) => ({
        id: definition.id,
        label: definition.label,
        open: subscribed?.has(definition.id) ?? false,
      })),
    });
  }

  /**
   * Fans one line out to a channel's current subscribers. Membership is
   * re-evaluated here, at execution time, for the speaker and for every
   * recipient — a player who lost access since subscribing neither speaks nor
   * hears (charter rule 4). Ignored speakers are dropped silently.
   */
  private deliverChannel(
    session: Session,
    speaker: Player,
    channelId: ChatChannelId,
    text: string,
  ): void {
    const definition = this.channels.get(channelId);
    if (
      !definition ||
      !definition.canSpeak ||
      !definition.canJoin(speaker) ||
      !this.subscriptions.get(speaker.id)?.has(channelId)
    ) {
      session.send({ type: "chat-rejected", reason: "channel-not-open" });
      return;
    }
    const message = {
      type: "channel-message" as const,
      channelId,
      speakerId: speaker.id,
      speakerName: speaker.name,
      text,
    };
    for (const [characterId, subscribed] of this.subscriptions) {
      if (!subscribed.has(channelId)) continue;
      const listener = this.world.getPlayer(characterId);
      if (!listener || !definition.canJoin(listener)) continue;
      if (
        characterId !== speaker.id &&
        this.ignores.ignores(characterId, speaker.name)
      ) {
        continue;
      }
      this.registry.sessionFor(characterId)?.send(message);
    }
  }

  private updateIgnoreList(
    session: Session,
    speaker: Player,
    intent: IgnoreAddMessage | IgnoreRemoveMessage,
  ): void {
    if (intent.type === "ignore-remove") {
      this.ignores.remove(speaker.id, intent.name);
    } else if (!this.ignores.add(speaker.id, intent.name)) {
      session.send({ type: "chat-rejected", reason: "ignore-list-full" });
      return;
    }
    session.send({
      type: "ignore-list",
      names: [...this.ignores.names(speaker.id)],
    });
  }

  /**
   * Say, whisper, and cast spell words reach normal view range; whisper
   * muffles beyond 1 tile.
   */
  private broadcastLocal(
    speaker: Player,
    mode: Exclude<CreatureSpeechMode, "yell">,
    text: string,
  ): void {
    const audible = JSON.stringify(this.spokenMessage(speaker, mode, text));
    const muffled =
      mode === "whisper"
        ? JSON.stringify(
            this.spokenMessage(speaker, mode, WHISPER_MUFFLED_TEXT),
          )
        : audible;
    for (const session of this.visibility.viewerSessionsFor(
      speaker.position,
      0,
    )) {
      if (!session.knownCreatureIds.has(speaker.id)) continue;
      if (this.ignoredBy(session, speaker)) continue;
      session.sendSerialized(
        mode === "whisper" && !this.hearsWhisper(session, speaker)
          ? muffled
          : audible,
      );
    }
  }

  private yell(
    session: Session,
    speaker: Player,
    text: string,
    now: number,
  ): void {
    if (speaker.level < YELL_MINIMUM_LEVEL) {
      session.send({ type: "chat-rejected", reason: "level-too-low" });
      return;
    }
    const readyAt = this.nextYellAt.get(speaker.id) ?? 0;
    if (now < readyAt) {
      session.send({
        type: "chat-rejected",
        reason: "yell-exhausted",
        retryAfterMs: readyAt - now,
      });
      return;
    }
    this.nextYellAt.set(speaker.id, now + YELL_EXHAUST_MS);
    const message = this.spokenMessage(speaker, "yell", text.toUpperCase());
    const serialized = JSON.stringify(message);
    for (const listener of this.world.playersWhoCanSee(
      speaker.position,
      YELL_RANGE,
    )) {
      if (
        listener.id !== speaker.id &&
        this.ignores.ignores(listener.id, speaker.name)
      ) {
        continue;
      }
      this.registry.sessionFor(listener.id)?.sendSerialized(serialized);
    }
  }

  /**
   * Forwards an ephemeral typing hint to one partner. Nothing is stored and
   * the sender gets no echo, so it reveals nothing the private message that
   * follows would not; an ignored sender is silently dropped, exactly as
   * their message would be (charter rule 6). Rate-limited per session so it
   * cannot be used as a cheap presence probe.
   */
  private forwardTyping(
    session: Session,
    sender: Player,
    recipientName: string,
    now: number,
  ): void {
    const readyAt = this.typingReadyAt.get(session.id) ?? 0;
    if (now < readyAt) return;
    this.typingReadyAt.set(session.id, now + TYPING_INTERVAL_MS);
    const recipient = this.findOnlinePlayerByName(recipientName);
    if (!recipient || recipient.id === sender.id) return;
    if (this.ignores.ignores(recipient.id, sender.name)) return;
    const recipientSession = this.registry.sessionFor(recipient.id);
    if (recipientSession?.playerId !== recipient.id) return;
    recipientSession.send({
      type: "chat-typing-state",
      counterpart: sender.name,
    });
  }

  private deliverPrivate(
    session: Session,
    sender: Player,
    recipientName: string,
    text: string,
  ): void {
    const recipient = this.findOnlinePlayerByName(recipientName);
    const recipientSession = recipient
      ? this.registry.sessionFor(recipient.id)
      : undefined;
    // The sender learns online/offline and nothing else — no position,
    // no session details (charter rule 6).
    if (!recipient || !recipientSession) {
      session.send({ type: "chat-rejected", reason: "recipient-offline" });
      return;
    }
    if (recipient.id === sender.id) {
      session.send({
        type: "private-chat-delivered",
        direction: "outgoing",
        counterpart: sender.name,
        text,
      });
      return;
    }
    // An ignored sender sees the ordinary outgoing echo and nothing else:
    // silence is the only signal, and it is indistinguishable from a
    // recipient who simply did not reply (charter rule 6).
    if (!this.ignores.ignores(recipient.id, sender.name)) {
      recipientSession.send({
        type: "private-chat-delivered",
        direction: "incoming",
        counterpart: sender.name,
        text,
      });
    }
    session.send({
      type: "private-chat-delivered",
      direction: "outgoing",
      counterpart: recipient.name,
      text,
    });
  }

  /** True when the viewing session's character ignores this speaker. */
  private ignoredBy(listener: Session, speaker: Player): boolean {
    const listenerId = listener.playerId;
    if (!listenerId || listenerId === speaker.id) return false;
    return this.ignores.ignores(listenerId, speaker.name);
  }

  private hearsWhisper(listener: Session, speaker: Player): boolean {
    if (!listener.playerId) return false;
    const viewer = this.world.getPlayer(listener.playerId);
    if (!viewer) return false;
    return (
      viewer.position.z === speaker.position.z &&
      Math.max(
        Math.abs(viewer.position.x - speaker.position.x),
        Math.abs(viewer.position.y - speaker.position.y),
      ) <= WHISPER_AUDIBLE_DISTANCE
    );
  }

  private findOnlinePlayerByName(name: string): Player | undefined {
    const wanted = name.trim().toLowerCase();
    if (wanted.length === 0) return undefined;
    for (const player of this.world.allPlayers()) {
      if (player.name.toLowerCase() === wanted) return player;
    }
    return undefined;
  }

  private spokenMessage(
    speaker: Player,
    mode: CreatureSpeechMode,
    text: string,
  ) {
    return {
      type: "creature-spoke" as const,
      creatureId: speaker.id,
      name: speaker.name,
      mode,
      position: { ...speaker.position },
      text,
    };
  }
}
