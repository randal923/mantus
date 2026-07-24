import { randomUUID } from "node:crypto";
import {
  MAX_CHARACTER_LEVEL,
  MAX_MAGIC_LEVEL,
  MAX_SKILL_LEVEL,
  MIN_SKILL_LEVEL,
  SKILLS,
  type GmResponseMessage,
  type Skill,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { ModerationService } from "../moderation/ModerationService";
import type { Player } from "../Player";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { getManaForNextMagicLevel } from "../progression/getManaForNextMagicLevel";
import { getSkillTriesForNextLevel } from "../progression/getSkillTriesForNextLevel";
import { getVocation } from "../progression/getVocation";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import type { Session } from "../Session";
import type { SpawnManager } from "../spawn/SpawnManager";
import type { Visibility } from "../Visibility";
import type { World } from "../World";

const MAX_CREATE_COUNT = 100;
const MAX_SPAWN_COUNT = 1_000;
const MAX_MUTE_MINUTES = 43_200;
const MAX_BAN_DAYS = 3_650;
const MAX_MODERATION_TEXT = 200;

/**
 * Dev-only GM chat commands ("/i rope", "/goto x y z", ...). Constructed only
 * when the server runs with DEV_COMMANDS=1; a production server never
 * instantiates this class, so the commands cannot exist there. Every command
 * still executes inside the tick through the same server-authoritative
 * primitives regular gameplay uses (conjure transaction, spawn manager,
 * relocate + visibility), so charter rules on atomicity and audit hold.
 */
export class GmCommandHandler {
  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
    private readonly progression: ProgressionSystem,
    private readonly items: ItemIntentHandler,
    private readonly spawns: SpawnManager | null,
    private readonly moderation: ModerationService | null,
  ) {}

  /** Returns true when the text was a slash command and has been consumed. */
  tryHandle(
    session: Session,
    player: Player,
    text: string,
    now: number,
  ): boolean {
    if (!text.startsWith("/")) return false;
    const parts = text.slice(1).split(/\s+/).filter((part) => part.length > 0);
    const command = parts[0]?.toLowerCase() ?? "";
    const args = parts.slice(1);
    switch (command) {
      case "i":
      case "item":
        this.createItem(session, player, args, now);
        break;
      case "spawn":
        this.spawnMonster(session, player, args, now);
        break;
      case "despawn":
        this.despawnMonsters(session);
        break;
      case "goto":
        this.teleport(session, player, args, now);
        break;
      case "level":
        this.setLevel(session, player, args, now);
        break;
      case "heal":
        this.heal(session, player, now);
        break;
      case "magic":
        this.setMagicLevel(session, player, args, now);
        break;
      case "skill":
        this.setSkill(session, player, args, now);
        break;
      case "soul":
        this.restoreSoul(session, player, now);
        break;
      case "hp":
        this.setCurrentHealth(session, player, args, now);
        break;
      case "where":
      case "pos":
        this.reply(session, true, this.describePosition(player));
        break;
      case "mute":
        this.mute(session, player, args);
        break;
      case "unmute":
        this.moderationByName(session, player, args, "unmute");
        break;
      case "kick":
        this.moderationByName(session, player, args, "kick");
        break;
      case "ban":
        this.ban(session, player, args);
        break;
      case "unban":
        this.moderationByName(session, player, args, "unban");
        break;
      case "note":
        this.note(session, player, args);
        break;
      default:
        this.reply(
          session,
          false,
          "Commands: /i <item> [count], /spawn <monster> [count], /despawn, /goto <x> <y> [z], /level <n>, /magic <n>, /skill <name> <n>, /soul, /hp <n>, /heal, /where, /mute, /unmute, /kick, /ban, /unban, /note",
        );
    }
    return true;
  }

  private mute(session: Session, player: Player, args: string[]): void {
    const moderation = this.requireModeration(session);
    if (!moderation) return;
    const [name, minutesRaw, ...reasonParts] = args;
    const minutes = Number(minutesRaw);
    if (
      !name ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > MAX_MUTE_MINUTES
    ) {
      this.reply(session, false, "Usage: /mute <name> <minutes> [reason]");
      return;
    }
    const reason = reasonParts.join(" ").slice(0, MAX_MODERATION_TEXT);
    moderation.gmMute(session, player.id, name, minutes, reason);
  }

  private moderationByName(
    session: Session,
    player: Player,
    args: string[],
    kind: "unmute" | "kick" | "unban",
  ): void {
    const moderation = this.requireModeration(session);
    if (!moderation) return;
    const name = args.join(" ").trim();
    if (name.length === 0) {
      this.reply(session, false, `Usage: /${kind} <name>`);
      return;
    }
    if (kind === "unmute") moderation.gmUnmute(session, player.id, name);
    else if (kind === "kick") moderation.gmKick(session, player.id, name);
    else moderation.gmUnban(session, player.id, name);
  }

  private ban(session: Session, player: Player, args: string[]): void {
    const moderation = this.requireModeration(session);
    if (!moderation) return;
    const [name, daysRaw, ...reasonParts] = args;
    const days = Number(daysRaw);
    if (!name || !Number.isInteger(days) || days < 1 || days > MAX_BAN_DAYS) {
      this.reply(session, false, "Usage: /ban <name> <days> [reason]");
      return;
    }
    const reason = reasonParts.join(" ").slice(0, MAX_MODERATION_TEXT);
    moderation.gmBan(session, player.id, name, days, reason);
  }

  private note(session: Session, player: Player, args: string[]): void {
    const moderation = this.requireModeration(session);
    if (!moderation) return;
    const [name, ...textParts] = args;
    const text = textParts.join(" ").trim().slice(0, MAX_MODERATION_TEXT);
    if (!name || text.length === 0) {
      this.reply(session, false, "Usage: /note <name> <text>");
      return;
    }
    moderation.gmNote(session, player.id, name, text);
  }

  private requireModeration(session: Session): ModerationService | null {
    if (this.moderation) return this.moderation;
    this.reply(session, false, "Moderation is not available on this server.");
    return null;
  }

  private createItem(
    session: Session,
    player: Player,
    args: string[],
    now: number,
  ): void {
    if (args.length === 0) {
      this.reply(session, false, "Usage: /i <item name or id> [count]");
      return;
    }
    let count = 1;
    const nameParts = [...args];
    const last = nameParts[nameParts.length - 1];
    if (nameParts.length > 1 && last && /^\d+$/.test(last)) {
      count = Number(last);
      nameParts.pop();
    }
    const query = nameParts.join(" ");
    const type = /^\d+$/.test(query)
      ? this.items.itemType(Number(query))
      : this.items.itemTypeByName(query);
    if (!type) {
      const matches = this.items
        .itemTypesByName(query)
        .slice(0, 5)
        .map((candidate) => `${candidate.name} (${candidate.id})`);
      this.reply(
        session,
        false,
        matches.length > 0
          ? `No exact match for "${query}". Close: ${matches.join(", ")}`
          : `Unknown item "${query}".`,
      );
      return;
    }
    if (!type.pickupable) {
      this.reply(session, false, `${type.name} is not a carriable item.`);
      return;
    }
    const clamped = Math.max(1, Math.min(count, type.maxCount, MAX_CREATE_COUNT));
    const expectedMana = player.mana;
    const expectedSoul = player.progression.soul;
    const expectedVersion = this.persistence.beginExternalMutation(player, now);
    const started = this.items.conjureForCombat(
      session,
      expectedVersion,
      expectedMana,
      expectedSoul,
      0,
      0,
      0,
      type.id,
      clamped,
      (version, characterVersion, committedAt) => {
        this.persistence.completeExternalMutation(
          player,
          version,
          characterVersion,
        );
        this.progression.syncPlayer(player, committedAt, true);
        this.reply(session, true, `Created ${clamped}x ${type.name}.`);
      },
      (failedAt) => {
        this.persistence.cancelExternalMutation(player);
        this.persistence.saveNow(player, failedAt);
        this.reply(session, false, `Could not create ${type.name}.`);
      },
    );
    if (!started) this.persistence.cancelExternalMutation(player);
  }

  private spawnMonster(
    session: Session,
    player: Player,
    args: string[],
    now: number,
  ): void {
    if (!this.spawns) {
      this.reply(session, false, "Creature spawning is disabled on this server.");
      return;
    }
    const typeParts = [...args];
    const countText = typeParts.at(-1);
    const hasCount = typeParts.length > 1 && Boolean(countText?.match(/^\d+$/));
    const count = hasCount ? Number(typeParts.pop()) : 1;
    const typeId = typeParts.join(" ").trim().toLowerCase().replace(/\s+/g, " ");
    if (typeId.length === 0) {
      this.reply(session, false, "Usage: /spawn <monster type> [count]");
      return;
    }
    if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SPAWN_COUNT) {
      this.reply(
        session,
        false,
        `Monster count must be from 1 to ${MAX_SPAWN_COUNT}.`,
      );
      return;
    }
    if (count > 1) {
      const result = this.spawns.spawnMonstersNear(
        typeId,
        player.position,
        count,
        now,
      );
      if (result === "unknown-type") {
        this.reply(session, false, `Unknown monster type "${typeId}".`);
        return;
      }
      this.reply(
        session,
        result === count,
        `Spawned ${result}/${count} ${typeId}.`,
      );
      return;
    }
    const result = this.spawns.spawnMonsterNear(typeId, player.position, now);
    if (result === "unknown-type") {
      this.reply(session, false, `Unknown monster type "${typeId}".`);
      return;
    }
    if (result === "no-space") {
      this.reply(session, false, "No free tile nearby to spawn on.");
      return;
    }
    this.reply(session, true, `Spawned ${typeId}.`);
  }

  private despawnMonsters(session: Session): void {
    if (!this.spawns) {
      this.reply(session, false, "Creature spawning is disabled on this server.");
      return;
    }
    const removed = this.spawns.removeGmMonsters();
    this.reply(session, true, `Despawned ${removed} GM monster(s).`);
  }

  private teleport(
    session: Session,
    player: Player,
    args: string[],
    now: number,
  ): void {
    const [xRaw, yRaw, zRaw] = args;
    const x = Number(xRaw);
    const y = Number(yRaw);
    const z = zRaw === undefined ? player.position.z : Number(zRaw);
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(z)
    ) {
      this.reply(session, false, "Usage: /goto <x> <y> [z]");
      return;
    }
    const destination = this.world.findUnoccupiedPosition({ x, y, z }, 2);
    if (!destination) {
      this.reply(session, false, `No walkable tile near ${x},${y},${z}.`);
      return;
    }
    session.movementDirection = null;
    session.bufferedMovementDirection = null;
    session.autoWalkDirections = [];
    if (session.attackTargetId) {
      session.attackTargetId = null;
      session.send({ type: "attack-target-changed", creatureId: null });
    }
    const from = this.world.relocateCreature(player, destination);
    this.visibility.onPlayerTeleported(session, player, from);
    this.persistence.saveNow(player, now);
    this.reply(session, true, this.describePosition(player));
  }

  private setLevel(
    session: Session,
    player: Player,
    args: string[],
    now: number,
  ): void {
    const level = Number(args[0]);
    if (
      !Number.isInteger(level) ||
      level < 2 ||
      level > MAX_CHARACTER_LEVEL
    ) {
      this.reply(session, false, `Usage: /level <2..${MAX_CHARACTER_LEVEL}>`);
      return;
    }
    const gap = getExperienceForLevel(level) - player.experience;
    if (gap <= 0) {
      this.reply(
        session,
        false,
        `Already level ${player.level}; /level can only raise it.`,
      );
      return;
    }
    // Progression awards are capped at 1e9 apiece; high levels need several.
    for (let remaining = gap; remaining > 0; remaining -= 1_000_000_000) {
      this.progression.awardExperience(
        player.id,
        `gm:level:${randomUUID()}`,
        Math.min(remaining, 1_000_000_000),
        now,
      );
    }
    this.reply(session, true, `Level set to ${player.level}.`);
  }

  private setMagicLevel(
    session: Session,
    player: Player,
    args: string[],
    now: number,
  ): void {
    const target = Number(args[0]);
    if (
      !Number.isInteger(target) ||
      target < 1 ||
      target > MAX_MAGIC_LEVEL
    ) {
      this.reply(session, false, `Usage: /magic <1..${MAX_MAGIC_LEVEL}>`);
      return;
    }
    if (player.progression.magicLevel >= target) {
      this.reply(
        session,
        false,
        `Already magic level ${player.progression.magicLevel}; /magic can only raise it.`,
      );
      return;
    }
    const vocation = getVocation(
      player.vocation,
      player.progression.definitionVersion,
    );
    // One cumulative award (chunked at the 1e9 cap): awardMagicProgress rolls
    // over intermediate levels itself, and a single persisted award avoids
    // hammering the character row with one save per level.
    let total = 0;
    for (
      let level = player.progression.magicLevel;
      level < target;
      level++
    ) {
      total += getManaForNextMagicLevel(vocation, level);
    }
    for (let remaining = total; remaining > 0; remaining -= 1_000_000_000) {
      this.progression.awardMagicProgress(
        player.id,
        `gm:magic:${randomUUID()}`,
        Math.min(remaining, 1_000_000_000),
        now,
      );
    }
    this.reply(
      session,
      true,
      `Magic level set to ${player.progression.magicLevel}.`,
    );
  }

  private setSkill(
    session: Session,
    player: Player,
    args: string[],
    now: number,
  ): void {
    const skill = args[0] as Skill;
    const target = Number(args[1]);
    if (
      !SKILLS.includes(skill) ||
      !Number.isInteger(target) ||
      target < MIN_SKILL_LEVEL ||
      target > MAX_SKILL_LEVEL
    ) {
      this.reply(
        session,
        false,
        `Usage: /skill <${SKILLS.join("|")}> <${MIN_SKILL_LEVEL}..${MAX_SKILL_LEVEL}>`,
      );
      return;
    }
    const currentLevel = (): number =>
      player.progression.skills.find((entry) => entry.skill === skill)
        ?.level ?? MIN_SKILL_LEVEL;
    if (currentLevel() >= target) {
      this.reply(
        session,
        false,
        `Already ${skill} ${currentLevel()}; /skill can only raise it.`,
      );
      return;
    }
    const vocation = getVocation(
      player.vocation,
      player.progression.definitionVersion,
    );
    // Single cumulative award; addSkillTries rolls over levels internally.
    let total = 0;
    for (let level = currentLevel(); level < target; level++) {
      total += getSkillTriesForNextLevel(vocation, skill, level);
    }
    for (let remaining = total; remaining > 0; remaining -= 1_000_000_000) {
      this.progression.awardSkillTries(
        player.id,
        `gm:skill:${randomUUID()}`,
        skill,
        Math.min(remaining, 1_000_000_000),
        now,
      );
    }
    this.reply(session, true, `Skill ${skill} set to ${currentLevel()}.`);
  }

  private restoreSoul(session: Session, player: Player, now: number): void {
    player.progression.restoreSoul(player.progression.maxSoul);
    this.progression.syncPlayer(player, now, true);
    this.reply(
      session,
      true,
      `Soul restored to ${player.progression.soul}.`,
    );
  }

  private setCurrentHealth(
    session: Session,
    player: Player,
    args: string[],
    now: number,
  ): void {
    const target = Number(args[0]);
    if (!Number.isInteger(target) || target < 1 || target > player.maxHealth) {
      this.reply(session, false, `Usage: /hp <1..${player.maxHealth}>`);
      return;
    }
    player.setHealth(target);
    this.visibility.broadcastHealth(player);
    this.progression.syncPlayer(player, now, true);
    this.reply(session, true, `Health set to ${player.health}.`);
  }

  private heal(session: Session, player: Player, now: number): void {
    player.setHealth(player.maxHealth);
    player.restoreMana(player.maxMana);
    this.visibility.broadcastHealth(player);
    this.progression.syncPlayer(player, now, true);
    this.reply(session, true, "Healed to full health and mana.");
  }

  private describePosition(player: Player): string {
    const { x, y, z } = player.position;
    return `Position: ${x}, ${y}, ${z}.`;
  }

  private reply(session: Session, ok: boolean, text: string): void {
    const message: GmResponseMessage = { type: "gm-response", ok, text };
    session.send(message);
  }
}
