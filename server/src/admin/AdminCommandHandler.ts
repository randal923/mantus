import type { GmResponseMessage } from "@tibia/protocol";
import { hasCapability, type AdminCapability } from "../auth/AccountRole";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { ModerationStore } from "../moderation/ModerationStore";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";

const MAX_REASON = 200;

/**
 * The capability each command needs. `world.inspect` is read-only and is the
 * one a tutor holds; relocating anybody needs `world.teleport`.
 */
const REQUIRED_CAPABILITY: Readonly<Record<string, AdminCapability>> = {
  goto: "world.teleport",
  bring: "world.teleport",
  inspect: "world.inspect",
};

/**
 * Production admin surface beyond moderation (Feature 96): teleport and
 * read-only inspection, authorized per command against the session's own
 * account role and audited into the same `moderation_actions` trail the
 * moderation actions use.
 *
 * Unlike `GmCommandHandler` — which only exists under DEV_COMMANDS=1 and acts
 * on the operator's own character — these commands take a named target, so
 * every one of them writes an audit row naming actor, target, and before/after
 * state. Mutation happens synchronously inside the tick through the same
 * `relocateCreature` + `Visibility` primitives ordinary movement uses; the
 * audit row is written behind the tick, exactly like `ModerationService`.
 */
export class AdminCommandHandler {
  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
    private readonly registry: SessionRegistry,
    private readonly store: ModerationStore | null,
  ) {}

  /** Returns true when the text was an admin command and was consumed. */
  tryHandle(
    session: Session,
    player: Player,
    text: string,
    now: number,
  ): boolean {
    if (!text.startsWith("/")) return false;
    const parts = text.slice(1).trim().split(/\s+/);
    const command = (parts[0] ?? "").toLowerCase();
    const capability = REQUIRED_CAPABILITY[command];
    if (!capability) return false;
    // Silence, not a refusal: an unauthorized player must not learn the
    // command exists, so the line falls through to ordinary speech.
    if (!hasCapability(session.account?.role, capability)) return false;
    const args = parts.slice(1);
    switch (command) {
      case "goto":
        return this.goto(session, player, args, now);
      case "bring":
        return this.bring(session, player, args, now);
      case "inspect":
        return this.inspect(session, player, args);
      default:
        return false;
    }
  }

  /** `/goto <x> <y> [z]` or `/goto <name>` — moves the operator. */
  private goto(
    session: Session,
    player: Player,
    args: string[],
    now: number,
  ): boolean {
    if (args.length === 0) {
      this.reply(session, false, "Usage: /goto <x> <y> [z] | /goto <name>");
      return true;
    }
    const byName = Number.isNaN(Number(args[0]));
    if (byName) {
      const targetName = args.join(" ").trim();
      const target = this.findOnline(targetName);
      if (!target) {
        this.reply(session, false, "No such character is online.");
        return true;
      }
      this.relocate(session, player, target.player.position, now, {
        actorCharacterId: player.id,
        targetName: player.name,
        detail: { mode: "to-character", toward: target.player.name },
      });
      return true;
    }
    const [xRaw, yRaw, zRaw] = args;
    const x = Number(xRaw);
    const y = Number(yRaw);
    const z = zRaw === undefined ? player.position.z : Number(zRaw);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      this.reply(session, false, "Usage: /goto <x> <y> [z] | /goto <name>");
      return true;
    }
    this.relocate(session, player, { x, y, z }, now, {
      actorCharacterId: player.id,
      targetName: player.name,
      detail: { mode: "to-position" },
    });
    return true;
  }

  /** `/bring <name>` — moves a named online character to the operator. */
  private bring(
    session: Session,
    player: Player,
    args: string[],
    now: number,
  ): boolean {
    const targetName = args.join(" ").trim();
    if (targetName.length === 0) {
      this.reply(session, false, "Usage: /bring <name>");
      return true;
    }
    const target = this.findOnline(targetName);
    if (!target) {
      this.reply(session, false, "No such character is online.");
      return true;
    }
    if (target.player.id === player.id) {
      this.reply(session, false, "You are already here.");
      return true;
    }
    // The operator is the actor even though the target is the one that moves;
    // the audit must answer "who moved whom", not "who ended up elsewhere".
    this.relocate(target.session, target.player, player.position, now, {
      actorCharacterId: player.id,
      targetName: target.player.name,
      detail: { mode: "bring", by: player.name },
    });
    this.reply(session, true, `Brought ${target.player.name}.`);
    return true;
  }

  /** `/inspect <name>` — read-only privileged view of an online character. */
  private inspect(session: Session, player: Player, args: string[]): boolean {
    const targetName = args.join(" ").trim();
    if (targetName.length === 0) {
      this.reply(session, false, "Usage: /inspect <name>");
      return true;
    }
    const target = this.findOnline(targetName);
    if (!target) {
      this.reply(session, false, "No such character is online.");
      return true;
    }
    const { position } = target.player;
    this.reply(
      session,
      true,
      `${target.player.name}: level ${target.player.level}, ` +
        `hp ${target.player.health}/${target.player.maxHealth}, ` +
        `at ${position.x},${position.y},${position.z}.`,
    );
    // Reading privileged state is itself an audited act: it is how staff
    // access to a player's data stays reviewable.
    this.audit(player.id, "inspect", target.player.name, {
      position: { ...position },
    });
    return true;
  }

  private relocate(
    session: Session,
    player: Player,
    destination: { x: number; y: number; z: number },
    now: number,
    audit: {
      /** Always the operator, never the character being relocated. */
      actorCharacterId: string;
      targetName: string;
      detail: Readonly<Record<string, unknown>>;
    },
  ): void {
    const resolved = this.world.findUnoccupiedPosition(destination, 2);
    if (!resolved) {
      this.reply(
        session,
        false,
        `No walkable tile near ${destination.x},${destination.y},${destination.z}.`,
      );
      return;
    }
    const before = { ...player.position };
    session.movementDirection = null;
    session.bufferedMovementDirection = null;
    session.autoWalkDirections = [];
    if (session.attackTargetId) {
      session.attackTargetId = null;
      session.send({ type: "attack-target-changed", creatureId: null });
    }
    const from = this.world.relocateCreature(player, resolved);
    this.visibility.onPlayerTeleported(session, player, from);
    this.persistence.saveNow(player, now);
    this.reply(
      session,
      true,
      `Now at ${resolved.x},${resolved.y},${resolved.z}.`,
    );
    this.audit(audit.actorCharacterId, "teleport", audit.targetName, {
      ...audit.detail,
      from: before,
      to: { ...resolved },
    });
  }

  private findOnline(
    name: string,
  ): { session: Session; player: Player } | undefined {
    const wanted = name.toLowerCase();
    for (const other of this.registry.all()) {
      const candidate = other.playerId
        ? this.world.getPlayer(other.playerId)
        : undefined;
      if (candidate && candidate.name.toLowerCase() === wanted) {
        return { session: other, player: candidate };
      }
    }
    return undefined;
  }

  private audit(
    actorCharacterId: string,
    action: "teleport" | "inspect",
    targetName: string,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    const store = this.store;
    if (!store) return;
    void store
      .recordAdminAction({
        actorCharacterId,
        action,
        targetName,
        reason: "",
        detail,
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`admin action audit failed (${action}): ${reason}`);
      });
  }

  private reply(session: Session, ok: boolean, text: string): void {
    const message: GmResponseMessage = { type: "gm-response", ok, text };
    session.send(message);
  }
}
