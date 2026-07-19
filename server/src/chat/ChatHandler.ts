import type {
  ChatSpeechMode,
  PrivateChatMessage,
  SpeakMessage,
} from "@tibia/protocol";
import type { GmCommandHandler } from "../gm/GmCommandHandler";
import type { ChatModerationHooks } from "../moderation/ChatModerationHooks";
import type { Player } from "../Player";
import type { NpcHandler } from "../npc/NpcHandler";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { ChatRateLimiter } from "./ChatRateLimiter";

type ChatIntent = SpeakMessage | PrivateChatMessage;

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
  private readonly rateLimiter = new ChatRateLimiter();
  /** Keyed by character id for the server's lifetime so relogging cannot reset it. */
  private readonly nextYellAt = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly visibility: Visibility,
    private readonly npcs?: NpcHandler,
    private readonly gm?: GmCommandHandler,
    private readonly moderation?: ChatModerationHooks,
  ) {}

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
    if (intent.mode === "yell") {
      this.yell(session, speaker, text, now);
      return;
    }
    this.broadcastLocal(speaker, intent.mode, text);
    this.npcs?.handleSpeech(speaker, text, now);
  }

  /** Say and whisper reach normal view range; whisper muffles beyond 1 tile. */
  private broadcastLocal(
    speaker: Player,
    mode: Exclude<ChatSpeechMode, "yell">,
    text: string,
  ): void {
    for (const session of this.visibility.viewerSessionsFor(
      speaker.position,
      0,
    )) {
      if (!session.knownCreatureIds.has(speaker.id)) continue;
      const heardText =
        mode === "whisper" && !this.hearsWhisper(session, speaker)
          ? WHISPER_MUFFLED_TEXT
          : text;
      session.send(this.spokenMessage(speaker, mode, heardText));
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
    for (const listener of this.world.playersWhoCanSee(
      speaker.position,
      YELL_RANGE,
    )) {
      this.registry.sessionFor(listener.id)?.send(message);
    }
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
    recipientSession.send({
      type: "private-chat-delivered",
      direction: "incoming",
      counterpart: sender.name,
      text,
    });
    session.send({
      type: "private-chat-delivered",
      direction: "outgoing",
      counterpart: recipient.name,
      text,
    });
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
    mode: ChatSpeechMode,
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
