import { randomUUID } from "node:crypto";
import type { BestiaryHooks } from "../bestiary/BestiaryHooks";
import type { BoostedHooks } from "../boosted/BoostedHooks";
import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import type { MonsterEventHooks } from "../creature/MonsterEventHooks";
import type { GuildHooks } from "../guild/GuildHooks";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { PartyHooks } from "../party/PartyHooks";
import { Player } from "../Player";
import type { PreyHooks } from "../prey/PreyHooks";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import { type StageRow, getStageRate } from "../progression/stageRates";
import type { PvpHooks } from "../pvp/PvpHooks";
import type { RewardHooks } from "../reward/RewardHooks";
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
    private readonly monsterEventHooks?: MonsterEventHooks,
    private readonly staminaSystem = false,
    private readonly experienceStages: ReadonlyArray<StageRow> = [],
    private readonly preyHooks?: PreyHooks,
    private readonly boostedHooks?: BoostedHooks,
    private readonly animusHooks?: {
      multiplierFor(recipientId: string, monster: Monster): number;
    },
    private readonly deathHistoryHooks?: {
      record(characterId: string, level: number, cause: string): void;
    },
    private readonly rewardHooks?: RewardHooks,
    private readonly dailyHooks?: {
      xpBoostPercent(recipientId: string, nowMs: number): number;
    },
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
      // Forge-state monsters multiply base exp before ratio/shares, exactly
      // like Canary's getLostExperience (monster.cpp:872-875).
      const experience = Math.floor(
        target.type.experience *
          target.forgeExperienceMultiplier *
          this.experienceRateFor(killerId),
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
            this.awardHuntExperience(
              share.playerId,
              share.amount,
              deathEventId,
              now,
              target,
              true,
            );
          }
        } else {
          this.awardHuntExperience(
            killerId,
            experience,
            deathEventId,
            now,
            target,
            false,
          );
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
      this.monsterEventHooks?.onMonsterDeath(
        target,
        [...damagers],
        target.topDamagerId() ?? killerId,
        now,
      );
      if (target.type.flags.rewardBoss) {
        // Reward bags are rolled and granted per participant, keyed by this
        // death event so a crash replay cannot grant twice (Feature 84).
        this.rewardHooks?.onRewardBossDeath(target, deathEventId, now);
      }
      const corpseId = createMonsterCorpse(
        this.world,
        this.items,
        this.formula,
        target,
        killerId,
        deathEventId,
        now,
        this.lootRate,
        this.preyHooks,
        this.boostedHooks,
      );
      // Auto-loot sweeps the corpse for the killer in this same tick, before
      // any other intent can touch it. Reach, ownership and the blacklist are
      // all re-checked inside; a killer who is offline, dead or out of range
      // simply gets nothing.
      const killerSession = killerId ? this.registry.sessionFor(killerId) : null;
      if (corpseId && killerId && killerSession) {
        this.items.autoLoot(killerSession, killerId, corpseId, now);
      }
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
    // The Cyclopedia recent-deaths row, written before penalties change the
    // level (Canary formats "Died at level {} by {}").
    const slayer = sourceId ? this.world.getCreature(sourceId) : undefined;
    this.deathHistoryHooks?.record(
      target.id,
      target.level,
      slayer
        ? `Died at level ${target.level} by ${slayer.name}.`
        : `Died at level ${target.level}.`,
    );
    const session = this.registry.sessionFor(target.id);
    target.conditions.clear();
    // Measured before death cleanup, from the damage this life actually took:
    // a ganged victim loses proportionally less (Canary's unfair fight).
    const penalty = target.applyDeathPenalty(deathEventId, {
      unfairFightReduction:
        this.pvpHooks?.unfairFightReduction(target, now) ?? 100,
    });
    target.restoreAfterDeath();
    // Black-skulled players respawn crippled (40 hp / 0 mana).
    this.pvpHooks?.applyRespawnState(target);
    target.invulnerableUntil = now + PLAYER_DEATH_INVULNERABILITY_MS;
    target.nextAttackAt = target.invulnerableUntil;
    target.avatarStage = 0;
    target.avatarUntil = 0;
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
    for (const loss of penalty.lostSkillLevels) {
      session?.send({
        type: "combat-log",
        kind: "experience",
        text: `You lost ${loss.levels} ${loss.skill} level${
          loss.levels === 1 ? "" : "s"
        }.`,
      });
    }
    if (penalty.lostMagicLevels > 0) {
      session?.send({
        type: "combat-log",
        kind: "experience",
        text: `You lost ${penalty.lostMagicLevels} magic level${
          penalty.lostMagicLevels === 1 ? "" : "s"
        }.`,
      });
    }
    if (session) this.feedback.sendFightState(session, now);
  }

  /** Experience rate for a kill, using the killer's stage band when enabled. */
  private experienceRateFor(killerId: string | null): number {
    if (this.experienceStages.length === 0) return this.experienceRate;
    const killerLevel = killerId
      ? this.world.getPlayer(killerId)?.level
      : undefined;
    if (killerLevel === undefined) return this.experienceRate;
    return getStageRate(this.experienceStages, killerLevel, this.experienceRate);
  }

  /**
   * Credits one recipient with hunting experience. Stamina (green +50% /
   * orange -50% / 0 = none) scales the award and each kill decays the
   * recipient's stamina; a qualifying kill (base exp ≥ level) also arms soul
   * regeneration. The idempotent `deathEventId` keeps a shared party kill from
   * double-awarding any member.
   */
  private awardHuntExperience(
    recipientId: string,
    baseAmount: number,
    eventId: string,
    now: number,
    target: Creature,
    partyShare: boolean,
  ): void {
    const recipient = this.world.getPlayer(recipientId);
    if (!recipient) {
      this.progression.awardExperience(recipientId, eventId, baseAmount, now);
      return;
    }
    if (baseAmount >= recipient.level) recipient.armSoulRegeneration(now);
    // Prey hunting time drains before the bonus is read (Canary
    // onGainExperience order: useStamina at player.lua:555, prey percent at
    // :568-574) — a bonus expiring on this very kill does not boost it.
    this.preyHooks?.onHuntExperienceGained(recipientId, now);
    let amount = baseAmount;
    if (target instanceof Monster) {
      // Boosted-creature doubling composes before the prey percentage,
      // matching Canary's onGainExperience order (player.lua:563-574).
      if (this.boostedHooks?.isBoostedCreature(target)) {
        amount *= 2;
      }
      const preyPercent = this.preyHooks?.experienceBonusPercent(
        recipientId,
        target,
      );
      if (preyPercent && preyPercent > 0) {
        amount = Math.ceil((amount * (100 + preyPercent)) / 100);
      }
    }
    // Daily-reward XP boost: an additive multiplier after boosted/prey and
    // before stamina and the base rate, Canary player.lua:548-601 (mantus
    // has no low-level bonus term).
    const xpBoostPercent = this.dailyHooks?.xpBoostPercent(recipientId, now) ?? 0;
    if (xpBoostPercent > 0) {
      amount = Math.floor(amount * (1 + xpBoostPercent / 100));
    }
    if (this.staminaSystem) {
      amount = Math.floor(
        amount * recipient.staminaExperienceMultiplier(now),
      );
      recipient.decayHuntStamina(now);
    }
    // Animus mastery composes last, after every other multiplier, exactly
    // like Canary player.cpp:3588-3603.
    if (target instanceof Monster && this.animusHooks) {
      const multiplier = this.animusHooks.multiplierFor(recipientId, target);
      if (multiplier > 1) amount = Math.floor(amount * multiplier);
    }
    if (amount < 1) return;
    if (!this.progression.awardExperience(recipientId, eventId, amount, now)) {
      return;
    }
    const suffix = partyShare ? " (party share)" : "";
    this.registry.sessionFor(recipientId)?.send({
      type: "combat-log",
      kind: "experience",
      text: `You gained ${amount} experience${suffix}.`,
    });
    this.visibility.sendExperienceText(recipientId, target, amount);
  }
}
