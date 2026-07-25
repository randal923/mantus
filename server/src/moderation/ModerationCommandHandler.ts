import type { Player } from "../Player";
import type { Session } from "../Session";
import type { ModerationService } from "./ModerationService";

const MAX_MUTE_MINUTES = 43_200;
const MAX_BAN_DAYS = 3_650;
const MAX_MODERATION_TEXT = 200;

const COMMANDS = new Set([
  "mute",
  "unmute",
  "kick",
  "ban",
  "unban",
  "note",
  "namelock",
]);

/**
 * The production moderation surface: the same audited `ModerationService`
 * actions the dev GM handler exposes, reachable on a real server but only to
 * a session whose *account* carries the staff flag. Authorization is read
 * from the session's own account at execution time — never from anything the
 * message body names (charter rule 9) — and a non-staff session gets no reply
 * at all, so the command set is not discoverable by probing.
 *
 * This is what an admin console routes to when Feature 96 lands; it adds no
 * game logic of its own.
 */
export class ModerationCommandHandler {
  constructor(private readonly moderation: ModerationService) {}

  /** Returns true when the text was a moderation command and was consumed. */
  tryHandle(session: Session, player: Player, text: string): boolean {
    if (!text.startsWith("/")) return false;
    const [rawCommand, ...args] = text.slice(1).trim().split(/\s+/);
    const command = (rawCommand ?? "").toLowerCase();
    if (!COMMANDS.has(command)) return false;
    // Silence, not a refusal: a non-staff player must not learn the command
    // exists, so the line falls through to ordinary speech.
    if (!session.account?.isStaff) return false;
    switch (command) {
      case "mute":
        return this.mute(session, player, args);
      case "unmute":
      case "kick":
      case "unban":
        return this.byName(session, player, args, command);
      case "ban":
        return this.ban(session, player, args);
      case "note":
        return this.note(session, player, args);
      case "namelock":
        return this.namelock(session, player, args);
      default:
        return false;
    }
  }

  private mute(session: Session, player: Player, args: string[]): boolean {
    const [name, minutesRaw, ...reasonParts] = args;
    const minutes = Number(minutesRaw);
    if (
      !name ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > MAX_MUTE_MINUTES
    ) {
      this.reply(session, "Usage: /mute <name> <minutes> [reason]");
      return true;
    }
    this.moderation.gmMute(
      session,
      player.id,
      name,
      minutes,
      reasonParts.join(" ").slice(0, MAX_MODERATION_TEXT),
    );
    return true;
  }

  private byName(
    session: Session,
    player: Player,
    args: string[],
    kind: "unmute" | "kick" | "unban",
  ): boolean {
    const name = args.join(" ").trim();
    if (name.length === 0) {
      this.reply(session, `Usage: /${kind} <name>`);
      return true;
    }
    if (kind === "unmute") this.moderation.gmUnmute(session, player.id, name);
    else if (kind === "kick") this.moderation.gmKick(session, player.id, name);
    else this.moderation.gmUnban(session, player.id, name);
    return true;
  }

  private ban(session: Session, player: Player, args: string[]): boolean {
    const [name, daysRaw, ...reasonParts] = args;
    const days = Number(daysRaw);
    if (
      !name ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > MAX_BAN_DAYS
    ) {
      this.reply(session, "Usage: /ban <name> <days> [reason]");
      return true;
    }
    this.moderation.gmBan(
      session,
      player.id,
      name,
      days,
      reasonParts.join(" ").slice(0, MAX_MODERATION_TEXT),
    );
    return true;
  }

  private note(session: Session, player: Player, args: string[]): boolean {
    const [name, ...textParts] = args;
    const note = textParts.join(" ").slice(0, MAX_MODERATION_TEXT);
    if (!name || note.length === 0) {
      this.reply(session, "Usage: /note <name> <text>");
      return true;
    }
    this.moderation.gmNote(session, player.id, name, note);
    return true;
  }

  private namelock(session: Session, player: Player, args: string[]): boolean {
    const [name, ...reasonParts] = args;
    if (!name) {
      this.reply(session, "Usage: /namelock <name> [reason]");
      return true;
    }
    this.moderation.gmNamelock(
      session,
      player.id,
      name,
      reasonParts.join(" ").slice(0, MAX_MODERATION_TEXT),
    );
    return true;
  }

  private reply(session: Session, text: string): void {
    session.send({ type: "server-notice", category: "talkaction", text });
  }
}
