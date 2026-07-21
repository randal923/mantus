import type { Skill } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { projectOwnProgression } from "./projectOwnProgression";

export class ProgressionSystem {
  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly persistence: CharacterPersistence,
    private readonly items: ItemIntentHandler,
    private readonly rates: Readonly<{ skill: number; magic: number }> = {
      skill: 1,
      magic: 1,
    },
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
    const progress = this.scaledProgress(manaSpent, this.rates.magic);
    if (progress < 1) {
      this.syncPlayer(player, now, true);
      return true;
    }
    return this.persistAward(
      player,
      player.awardMagicProgress(eventId, progress),
      now,
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
    const progress = this.scaledProgress(tries, this.rates.skill);
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
    const tries = this.scaledProgress(options.tries, this.rates.skill);
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
    for (const player of this.world.allPlayers()) {
      if (this.persistence.isExternalMutationPending(player)) continue;
      if (!player.tickProgression(now)) continue;
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
