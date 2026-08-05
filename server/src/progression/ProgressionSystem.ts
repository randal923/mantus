import type { Skill } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { playerEquipmentBonuses } from "./playerEquipmentBonuses";
import { projectOwnProgression } from "./projectOwnProgression";
import { NO_STAGES, type StageTables, getStageRate } from "./stageRates";

export class ProgressionSystem {
  private nextTickAt = 0;
  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly persistence: CharacterPersistence,
    private readonly items: ItemIntentHandler,
    private readonly rates: Readonly<{
      experience: number;
      skill: number;
      magic: number;
    }> = {
      experience: 1,
      skill: 1,
      magic: 1,
    },
    private readonly stages: StageTables = NO_STAGES,
  ) {}

  awardExperience(
    playerId: string,
    eventId: string,
    amount: number,
    now: number,
  ): boolean {
    const player = this.world.getPlayer(playerId);
    if (!player) return false;
    return this.persistAward(
      player,
      player.awardExperience(eventId, amount),
      now,
      true,
    );
  }

  awardMagicProgress(
    playerId: string,
    eventId: string,
    manaSpent: number,
    now: number,
  ): boolean {
    const player = this.world.getPlayer(playerId);
    if (!player) return false;
    const progress = this.scaledProgress(manaSpent, this.magicRate(player));
    if (progress < 1) {
      this.syncPlayer(player, now, true);
      return true;
    }
    const levelBefore = player.progression.magicLevel;
    const result = player.awardMagicProgress(eventId, progress);
    if (!result.processed) {
      // Mana was already spent by the spell/weapon path. Even if a stale
      // server-authored progression id is replayed, that resource change
      // must still reach the character row before another atomic action.
      this.persistence.saveNow(player, now);
      return false;
    }
    return this.persistAward(
      player,
      result,
      now,
      player.progression.magicLevel !== levelBefore,
    );
  }

  awardSkillTries(
    playerId: string,
    eventId: string,
    skill: Skill,
    tries: number,
    now: number,
  ): boolean {
    const player = this.world.getPlayer(playerId);
    if (!player) return false;
    const progress = this.scaledProgress(
      tries,
      this.skillRate(player, skill),
    );
    if (progress < 1) return false;
    const levelBefore = this.skillLevel(player, skill);
    const result = player.awardSkillTries(eventId, skill, progress);
    return this.persistAward(
      player,
      result,
      now,
      this.skillLevel(player, skill) !== levelBefore,
    );
  }

  startTraining(
    playerId: string,
    options: {
      id: string;
      skill: Skill;
      intervalMs: number;
      tries: number;
    },
    now: number,
  ): boolean {
    const player = this.world.getPlayer(playerId);
    if (!player) return false;
    const tries = this.scaledProgress(
      options.tries,
      this.skillRate(player, options.skill),
    );
    if (tries < 1) return false;
    return player.progression.startTraining({ ...options, tries, now });
  }

  stopTraining(playerId: string, scheduleId: string): boolean {
    return (
      this.world
        .getPlayer(playerId)
        ?.progression.stopTraining(scheduleId) ?? false
    );
  }

  syncPlayer(player: Player, now: number, immediate = false): void {
    if (immediate) this.persistence.saveNow(player, now);
    else this.persistence.markDirty(player);
    this.sendProgression(player, now);
  }

  notifyCommittedPlayer(player: Player, now: number): void {
    this.sendProgression(player, now);
  }

  tick(now: number): void {
    if (now < this.nextTickAt) return;
    this.nextTickAt = now + 100;
    for (const player of this.world.allPlayers()) {
      if (this.persistence.isExternalMutationPending(player)) continue;
      const equipmentChanged = this.syncEquipmentStats(player);
      const inProtectionZone = this.world.isProtectionZone(player.position);
      const ticked = player.tickProgression(now, inProtectionZone);
      if (ticked) this.persistence.markDirty(player);
      if (ticked || equipmentChanged) this.sendProgression(player, now);
    }
  }

  /**
   * Push equipment-derived bonuses into the progression stats: the item
   * `speed` attribute (boots of haste and friends) plus imbuement
   * Swiftness/Featherweight, and the display-only skill/magic-level deltas the
   * character panel breaks down. Equipment and imbuement effects are both
   * memoized per inventory cache, so the per-tick call is a lookup unless
   * equipment actually changed; derived stats are never persisted, so no
   * dirty mark.
   */
  private syncEquipmentStats(player: Player): boolean {
    const effects = this.items.imbuementEffects(player.id);
    const affixes = this.items.affixEffects(player.id);
    const equipment = this.items.combatEquipment(player.id);
    const bonuses = playerEquipmentBonuses(equipment, effects, affixes);
    const statsChanged = player.progression.setEquipmentModifier({
      speed: bonuses.speed,
      capacityPercentOfBase: effects.capacityPercent,
      maxHealth: affixes.maxHealth,
      maxMana: affixes.maxMana,
    });
    const attackSpeedChanged = player.progression.setEquipmentAttackSpeedPercent(
      affixes.attackSpeedPercent,
    );
    // progression.maxHealth is not player.maxHealth: the creature carries its
    // own max (the health bar's clamp), refreshed the way setWheelBonuses does.
    if (statsChanged) player.setMaxHealth(player.progression.maxHealth);
    const skillsChanged = player.progression.setEquipmentSkillBonuses({
      skills: bonuses.skills,
      magicLevel: bonuses.magicLevel,
    });
    if (!statsChanged) return skillsChanged || attackSpeedChanged;
    const inventory = this.items.updateCapacity(player.id, player.capacity);
    if (inventory) {
      this.registry.sessionFor(player.id)?.send({
        type: "inventory-updated",
        inventory,
      });
    }
    return true;
  }

  /**
   * Try awards land on every swing, blocked hit, and spell cast, so they ride
   * the dirty flag onto the interval save; `immediate` (experience and
   * level-ups) still saves in place. Ordering stays safe either way: atomic
   * actions flush dirty state in `beginExternalMutation`, and logout/death
   * flush explicitly.
   */
  private persistAward(
    player: Player,
    result: { processed: boolean; changed: boolean },
    now: number,
    immediate: boolean,
  ): boolean {
    if (!result.processed) return false;
    if (immediate) this.persistence.saveNow(player, now);
    else this.persistence.markDirty(player);
    if (result.changed) {
      this.sendProgression(player, now);
      const inventory = this.items.updateCapacity(player.id, player.capacity);
      if (inventory) {
        this.registry.sessionFor(player.id)?.send({
          type: "inventory-updated",
          inventory,
        });
      }
    }
    return true;
  }

  private sendProgression(player: Player, now: number): void {
    this.registry.sessionFor(player.id)?.send({
      type: "progression-updated",
      playerId: player.id,
      progression: projectOwnProgression(player, now, {
        baseRate: this.rates.experience,
        stages: this.stages.experience,
      }),
    });
  }

  private skillRate(player: Player, skill: Skill): number {
    return getStageRate(
      this.stages.skill,
      this.skillLevel(player, skill),
      this.rates.skill,
    );
  }

  private skillLevel(player: Player, skill: Skill): number {
    return (
      player.progression.skills.find((state) => state.skill === skill)
        ?.level ?? 0
    );
  }

  private magicRate(player: Player): number {
    return getStageRate(
      this.stages.magic,
      player.progression.magicLevel,
      this.rates.magic,
    );
  }

  private scaledProgress(amount: number, rate: number): number {
    if (!Number.isSafeInteger(amount) || amount < 1) {
      throw new Error("progression award is out of range");
    }
    const progress = Math.floor(amount * rate);
    if (!Number.isSafeInteger(progress) || progress < 0) {
      throw new Error("scaled progression award is out of range");
    }
    return progress;
  }
}
