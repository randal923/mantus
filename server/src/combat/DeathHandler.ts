import { randomUUID } from "node:crypto";
import type { BestiaryHooks } from "../bestiary/BestiaryHooks";
import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import type { GuildHooks } from "../guild/GuildHooks";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { PartyHooks } from "../party/PartyHooks";
import { Player } from "../Player";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import type { PvpHooks } from "../pvp/PvpHooks";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { CombatFeedback } from "./CombatFeedback";
import type { CombatFormula } from "./CombatFormula";
import { createMonsterCorpse } from "./createMonsterCorpse";

const PLAYER_DEATH_INVULNERABILITY_MS = 2_000;

export class DeathHandler {
  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly registry: SessionRegistry,
    private readonly progression: ProgressionSystem,
    private readonly items: ItemIntentHandler,
    private readonly formula: CombatFormula,
    private readonly feedback: CombatFeedback,
    private readonly onMonsterDeath: (monster: Monster, now: number) => boolean,
    private readonly partyHooks?: PartyHooks,
    private readonly guildHooks?: GuildHooks,
    private readonly pvpHooks?: PvpHooks,
    private readonly experienceRate = 1,
    private readonly lootRate = 1,
    private readonly bestiaryHooks?: BestiaryHooks,
  ) {}

  handleDeath(
    target: Creature,
    sourceId: string | null,
    now: number,
  ): void {
    if (!target.claimDeath()) return;
    // Unique per life/death transition: monster ids repeat across respawns
    // and server restarts, so they cannot key persisted progression events.
    const deathEventId = `death:${randomUUID()}`;
    if (target instanceof Monster) {
      const killerId =
        (sourceId && this.world.getPlayer(sourceId)?.id) ??
        target.topDamagerId();
      const experience = Math.floor(
        target.type.experience * this.experienceRate,
      );
      if (killerId && experience > 0) {
        // Party shares are recomputed at this instant — members who left or
        // lost eligibility since dealing damage get nothing (charter rule 4).
        const shares =
          this.partyHooks?.getExperienceShares(
            killerId,
            experience,
            now,
          ) ?? null;
        if (shares) {
          for (const share of shares) {
            // awardExperience is idempotent per player and eventId, so the
            // shared deathEventId cannot double-award any member.
            if (
              !this.progression.awardExperience(
                share.playerId,
                deathEventId,
                share.amount,
                now,
              )
            ) {
              continue;
            }
            this.registry.sessionFor(share.playerId)?.send({
              type: "combat-log",
              kind: "experience",
              text: `You gained ${share.amount} experience (party share).`,
            });
            this.visibility.sendExperienceText(
              share.playerId,
              target,
              share.amount,
            );
          }
        } else {
          if (
            this.progression.awardExperience(
              killerId,
              deathEventId,
              experience,
              now,
            )
          ) {
            this.registry.sessionFor(killerId)?.send({
              type: "combat-log",
              kind: "experience",
              text: `You gained ${experience} experience.`,
            });
            this.visibility.sendExperienceText(killerId, target, experience);
          }
        }
      }
      // Bestiary credit follows Canary: every damage participant counts,
      // not just the last hit; only players still online are credited.
      const damagers = new Set(
        target.damagerIds().filter((id) => this.world.getPlayer(id)),
      );
      if (killerId && this.world.getPlayer(killerId)) damagers.add(killerId);
      if (damagers.size > 0) {
        this.bestiaryHooks?.onMonsterKilled([...damagers], target, now);
      }
      createMonsterCorpse(
        this.world,
        this.items,
        this.formula,
        target,
        killerId,
        deathEventId,
        now,
        this.lootRate,
      );
      if (!this.onMonsterDeath(target, now)) {
        this.world.removeCreature(target.id);
        this.visibility.announceCreatureLeave(target);
      }
      return;
    }
    if (!(target instanceof Player)) return;
    // War kill accounting: only counts when both guilds share a mutual
    // active war; the insert plus the frag-limit check are one transaction.
    const killer = sourceId ? this.world.getPlayer(sourceId) : undefined;
    if (killer && killer.id !== target.id) {
      this.guildHooks?.recordWarKill(killer.id, target.id, now);
    }
    // Frag charging reads the victim's skull, aggression set, and live
    // relations at this instant — before death cleanup wipes them. The
    // deathEventId keys the exactly-once guard (memory and durable row).
    this.pvpHooks?.handlePlayerDeath(target, sourceId, deathEventId, now);
    const session = this.registry.sessionFor(target.id);
    target.conditions.clear();
    const penalty = target.applyDeathPenalty(deathEventId);
    target.restoreAfterDeath();
    // Black-skulled players respawn crippled (40 hp / 0 mana).
    this.pvpHooks?.applyRespawnState(target);
    target.invulnerableUntil = now + PLAYER_DEATH_INVULNERABILITY_MS;
    target.nextAttackAt = target.invulnerableUntil;
    const spawn = this.world.findSpawn(this.world.templePosition);
    if (spawn) {
      const from = this.world.relocateCreature(target, spawn);
      if (session) {
        session.movementDirection = null;
        session.bufferedMovementDirection = null;
        session.attackTargetId = null;
        session.combatCooldowns.clear();
        this.visibility.onPlayerStepped(session, target, from, 0);
      }
    }
    for (const other of this.registry.all()) {
      if (other.attackTargetId !== target.id) continue;
      other.attackTargetId = null;
      other.send({ type: "attack-target-changed", creatureId: null });
      this.feedback.sendFightState(other, now);
    }
    this.progression.syncPlayer(target, now, true);
    const inventory = this.items.updateCapacity(target.id, target.capacity);
    if (inventory && session) {
      session.send({ type: "inventory-updated", inventory });
    }
    this.visibility.broadcastHealth(target);
    this.visibility.onCreatureStateChanged(target);
    session?.send({
      type: "combat-log",
      kind: "death",
      text: "You died and returned to the temple.",
    });
    if (penalty.lostExperience > 0) {
      session?.send({
        type: "combat-log",
        kind: "experience",
        text: `You lost ${penalty.lostExperience} experience.`,
      });
    }
    if (session) this.feedback.sendFightState(session, now);
  }
}
