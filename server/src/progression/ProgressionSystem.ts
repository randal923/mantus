import type { Skill } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { projectOwnProgression } from "./projectOwnProgression";
import { MAGIC_STAGES, SKILL_STAGES, getStageRate } from "./stageRates";

export class ProgressionSystem {
  private nextTickAt = 0;
  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly persistence: CharacterPersistence,
    private readonly items: ItemIntentHandler,
    private readonly rates: Readonly<{ skill: number; magic: number }> = {
      skill: 1,
      magic: 1,
    },
    private readonly useStages = false,
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
    const result = player.awardMagicProgress(eventId, progress);
    if (!result.processed) {
      // Mana was already spent by the spell/weapon path. Even if a stale
      // server-authored progression id is replayed, that resource change
      // must still reach the character row before another atomic action.
      this.persistence.saveNow(player, now);
      return false;
    }
    return this.persistAward(player, result, now);
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
    return this.persistAward(
      player,
      player.awardSkillTries(eventId, skill, progress),
      now,
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
      const inProtectionZone = this.world.isProtectionZone(player.position);
      if (!player.tickProgression(now, inProtectionZone)) continue;
      this.persistence.markDirty(player);
      this.sendProgression(player, now);
    }
  }

  private persistAward(
    player: Player,
    result: { processed: boolean; changed: boolean },
    now: number,
  ): boolean {
    if (!result.processed) return false;
    this.persistence.saveNow(player, now);
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
      progression: projectOwnProgression(player, now),
    });
  }

  private skillRate(player: Player, skill: Skill): number {
    if (!this.useStages) return this.rates.skill;
    const level =
      player.progression.skills.find((state) => state.skill === skill)?.level ??
      0;
    return getStageRate(SKILL_STAGES, level, this.rates.skill);
  }

  private magicRate(player: Player): number {
    if (!this.useStages) return this.rates.magic;
    return getStageRate(
      MAGIC_STAGES,
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
