import { MonsterBrain } from "../ai/MonsterBrain";
import { NpcBrain } from "../ai/NpcBrain";
import type { Combat } from "../combat/Combat";
import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import { Npc } from "../creature/Npc";
import type { Visibility } from "../Visibility";
import type { MoveResult, World } from "../World";
import type { Player } from "../Player";
import { positionKey } from "../positionKey";
import type { CreatureContent } from "./CreatureContent";
import type { SpawnSlotDefinition } from "./SpawnDefinition";

const SPAWN_SECTOR_SIZE = 32;
/** Synthetic summon owner for GM-spawned monsters; never a real creature id. */
const GM_SPAWN_OWNER_ID = "gm:spawns";

interface SlotState {
  definition: SpawnSlotDefinition;
  creatureId: string | null;
  dormantCreature: Creature | null;
  generation: number;
  nextSpawnAt: number;
}

interface Brain {
  tick(
    world: World,
    now: number,
    availableWork: number,
  ): { work: number; movement: MoveResult | null };
}

/** Tick-owned lifecycle for ordinary ephemeral creature spawn slots. */
export class SpawnManager {
  private readonly slots = new Map<string, SlotState>();
  private readonly sectorSlots = new Map<string, SlotState[]>();
  private readonly sectorCursors = new Map<string, number>();
  private readonly creatureToSlot = new Map<string, SlotState>();
  private readonly brains = new Map<string, Brain>();
  private readonly aiOrder: string[] = [];
  private readonly aiIndices = new Map<string, number>();
  private readonly summonOwnerByCreature = new Map<string, string>();
  private readonly summonsByOwner = new Map<string, Set<string>>();
  private spawnSectorCursor = 0;
  private aiCursor = 0;
  private summonGeneration = 0;

  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly content: CreatureContent,
    private readonly config: {
      activationRange: { x: number; y: number };
      retryMs: number;
      maxSpawnChecksPerTick: number;
      maxSpawnAttemptsPerTick: number;
      maxAiScansPerTick: number;
      maxAiWorkPerTick: number;
      ai: {
        thinkIntervalMs: number;
        acquisitionRange: number;
        loseRange: number;
        maxPathNodes: number;
        wanderChance: number;
        seed: number;
      };
    },
    private readonly combat?: Combat,
  ) {
    for (const definition of content.slots) {
      if (
        definition.radius > Math.min(
          config.activationRange.x,
          config.activationRange.y,
        )
      ) {
        throw new Error(
          `spawn slot ${definition.id} radius exceeds its activation range`,
        );
      }
      if (this.slots.has(definition.id)) {
        throw new Error(`duplicate spawn slot ${definition.id}`);
      }
      const slot = {
        definition,
        creatureId: null,
        dormantCreature: null,
        generation: 0,
        nextSpawnAt: 0,
      } satisfies SlotState;
      this.slots.set(definition.id, slot);
      if (!definition.enabled) continue;
      const sectorKey = this.sectorKey(definition.home);
      const sector = this.sectorSlots.get(sectorKey) ?? [];
      sector.push(slot);
      this.sectorSlots.set(sectorKey, sector);
    }
  }

  tick(now: number): {
    spawnChecks: number;
    spawnAttempts: number;
    aiScans: number;
    aiWork: number;
  } {
    const players = [...this.world.allPlayers()];
    const spawn = this.tickSpawns(now, players);
    const ai = this.tickBrains(now, players);
    return { ...spawn, ...ai };
  }

  private tickSpawns(
    now: number,
    players: ReadonlyArray<Player>,
  ): { spawnChecks: number; spawnAttempts: number } {
    const sectors = this.activeSectors(players);
    if (sectors.length === 0) {
      return { spawnChecks: 0, spawnAttempts: 0 };
    }
    const remaining = sectors.map((sector) => sector.slots.length);
    const maxChecks = Math.min(
      this.config.maxSpawnChecksPerTick,
      remaining.reduce((total, count) => total + count, 0),
    );
    let sectorIndex = this.spawnSectorCursor % sectors.length;
    let spawnChecks = 0;
    let spawnAttempts = 0;
    while (
      spawnChecks < maxChecks &&
      spawnAttempts < this.config.maxSpawnAttemptsPerTick
    ) {
      let skippedSectors = 0;
      while (remaining[sectorIndex] === 0 && skippedSectors < sectors.length) {
        sectorIndex = (sectorIndex + 1) % sectors.length;
        skippedSectors++;
      }
      if (skippedSectors === sectors.length) break;
      const sector = sectors[sectorIndex];
      if (!sector) break;
      const cursor = this.sectorCursors.get(sector.key) ?? 0;
      const slot = sector.slots[cursor % sector.slots.length];
      this.sectorCursors.set(sector.key, (cursor + 1) % sector.slots.length);
      remaining[sectorIndex] = (remaining[sectorIndex] ?? 0) - 1;
      sectorIndex = (sectorIndex + 1) % sectors.length;
      spawnChecks++;
      if (!slot) continue;
      if (
        slot.creatureId ||
        now < slot.nextSpawnAt
      ) {
        continue;
      }
      const activationPosition = slot.dormantCreature?.position ??
        slot.definition.home;
      if (!this.hasPlayerNear(activationPosition, players)) continue;
      spawnAttempts++;
      this.trySpawn(slot, now);
    }
    this.spawnSectorCursor = sectorIndex;
    return { spawnChecks, spawnAttempts };
  }

  /**
   * Dev-only ad-hoc spawn (GM "/spawn"). Registered under a synthetic summon
   * owner (never a real creature id, so the recursive owned-summon cleanup
   * can't loop) so death and removal reuse the summon lifecycle.
   */
  spawnMonsterNear(
    typeId: string,
    near: { x: number; y: number; z: number },
    now: number,
  ): "spawned" | "unknown-type" | "no-space" {
    const type = this.content.monsterTypes.get(typeId);
    if (!type) return "unknown-type";
    const position = this.world.findUnoccupiedPosition(near, 3);
    if (!position) return "no-space";
    const monster = new Monster({
      id: `monster-gm:${typeId}:${this.summonGeneration++}`,
      type,
      position,
      direction: "south",
      home: position,
      spawnRadius: 3,
    });
    this.world.addCreature(monster);
    this.summonOwnerByCreature.set(monster.id, GM_SPAWN_OWNER_ID);
    const owned = this.summonsByOwner.get(GM_SPAWN_OWNER_ID) ?? new Set<string>();
    owned.add(monster.id);
    this.summonsByOwner.set(GM_SPAWN_OWNER_ID, owned);
    this.addBrain(monster, now);
    this.visibility.announceCreatureSpawn(monster);
    return "spawned";
  }

  removeCreature(creatureId: string, now: number): boolean {
    const slot = this.creatureToSlot.get(creatureId);
    if (!slot) return this.removeSummon(creatureId);
    return this.detachCreature(
      creatureId,
      now + slot.definition.respawnMs,
      false,
    );
  }

  private detachCreature(
    creatureId: string,
    nextSpawnAt: number,
    preserveCreature: boolean,
  ): boolean {
    const slot = this.creatureToSlot.get(creatureId);
    if (!slot || slot.creatureId !== creatureId) return false;
    const creature = this.world.getCreature(creatureId);
    this.removeOwnedSummons(creatureId);
    if (creature) {
      this.world.removeCreature(creatureId);
      this.visibility.announceCreatureLeave(creature);
    }
    slot.creatureId = null;
    slot.dormantCreature = preserveCreature ? creature ?? null : null;
    slot.nextSpawnAt = nextSpawnAt;
    this.creatureToSlot.delete(creatureId);
    this.removeBrain(creatureId);
    return true;
  }

  activeCreatureId(slotId: string): string | null {
    return this.slots.get(slotId)?.creatureId ?? null;
  }

  nextSpawnDeadline(slotId: string): number | null {
    return this.slots.get(slotId)?.nextSpawnAt ?? null;
  }

  private trySpawn(slot: SlotState, now: number): void {
    const { definition } = slot;
    const position = slot.dormantCreature?.position ?? definition.home;
    if (
      !this.world.getTile(position) ||
      !this.world.isPathable(position) ||
      this.world.isOccupied(position)
    ) {
      slot.nextSpawnAt = now + this.config.retryMs;
      return;
    }
    const creature = slot.dormantCreature ?? this.createCreature(
      slot,
      `${definition.kind}-instance:${definition.id}:${slot.generation}`,
    );
    this.world.addCreature(creature);
    if (!slot.dormantCreature) slot.generation++;
    slot.dormantCreature = null;
    slot.creatureId = creature.id;
    this.creatureToSlot.set(creature.id, slot);
    this.addBrain(creature, now);
    this.visibility.announceCreatureSpawn(creature);
  }

  private createCreature(slot: SlotState, id: string): Creature {
    const { definition } = slot;
    if (definition.kind === "monster") {
      const type = this.content.monsterTypes.get(definition.typeId);
      if (!type) throw new Error(`missing monster type ${definition.typeId}`);
      return new Monster({
        id,
        type,
        position: definition.home,
        direction: definition.direction,
        home: definition.home,
        spawnRadius: definition.radius,
      });
    }
    const type = this.content.npcTypes.get(definition.typeId);
    if (!type) throw new Error(`missing NPC type ${definition.typeId}`);
    return new Npc({
      id,
      type,
      position: definition.home,
      direction: definition.direction,
      home: definition.home,
      spawnRadius: Math.min(definition.radius, type.walkRadius),
    });
  }

  private tickBrains(
    now: number,
    players: ReadonlyArray<Player>,
  ): { aiScans: number; aiWork: number } {
    let work = 0;
    let scanned = 0;
    while (
      scanned < Math.min(this.aiOrder.length, this.config.maxAiScansPerTick) &&
      work < this.config.maxAiWorkPerTick
    ) {
      if (this.aiCursor >= this.aiOrder.length) this.aiCursor = 0;
      const creatureId = this.aiOrder[this.aiCursor];
      this.aiCursor++;
      scanned++;
      if (!creatureId) continue;
      const brain = this.brains.get(creatureId);
      const creature = this.world.getCreature(creatureId);
      if (!brain || !creature) continue;
      if (!this.hasPlayerNear(creature.position, players)) {
        this.detachCreature(creatureId, now, true);
        continue;
      }
      const result = brain.tick(
        this.world,
        now,
        this.config.maxAiWorkPerTick - work,
      );
      work += result.work;
      if (result.movement?.moved) {
        this.visibility.onCreatureStepped(
          creature,
          result.movement.from,
          result.movement.durationMs,
        );
      } else if (result.movement?.turned) {
        this.visibility.broadcastPose(creature);
      }
    }
    return { aiScans: scanned, aiWork: work };
  }

  private activeSectors(players: ReadonlyArray<Player>): Array<{
    key: string;
    slots: SlotState[];
  }> {
    const active = new Map<string, SlotState[]>();
    for (const player of players) {
      const minX = Math.floor(
        (player.position.x - this.config.activationRange.x) / SPAWN_SECTOR_SIZE,
      );
      const maxX = Math.floor(
        (player.position.x + this.config.activationRange.x) / SPAWN_SECTOR_SIZE,
      );
      const minY = Math.floor(
        (player.position.y - this.config.activationRange.y) / SPAWN_SECTOR_SIZE,
      );
      const maxY = Math.floor(
        (player.position.y + this.config.activationRange.y) / SPAWN_SECTOR_SIZE,
      );
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const key = positionKey({ x, y, z: player.position.z });
          const slots = this.sectorSlots.get(key);
          if (slots) active.set(key, slots);
        }
      }
    }
    return [...active].map(([key, slots]) => ({ key, slots }));
  }

  private hasPlayerNear(
    position: { x: number; y: number; z: number },
    players: ReadonlyArray<Player>,
  ): boolean {
    return players.some((player) =>
      player.position.z === position.z &&
      Math.abs(player.position.x - position.x) <= this.config.activationRange.x &&
      Math.abs(player.position.y - position.y) <= this.config.activationRange.y
    );
  }

  private sectorKey(position: { x: number; y: number; z: number }): string {
    return positionKey({
      x: Math.floor(position.x / SPAWN_SECTOR_SIZE),
      y: Math.floor(position.y / SPAWN_SECTOR_SIZE),
      z: position.z,
    });
  }

  private removeBrain(creatureId: string): void {
    this.brains.delete(creatureId);
    const index = this.aiIndices.get(creatureId);
    if (index === undefined) return;
    const lastIndex = this.aiOrder.length - 1;
    const lastId = this.aiOrder[lastIndex];
    this.aiOrder.pop();
    this.aiIndices.delete(creatureId);
    if (index < lastIndex && lastId) {
      this.aiOrder[index] = lastId;
      this.aiIndices.set(lastId, index);
    }
    if (index < this.aiCursor) this.aiCursor--;
    if (this.aiCursor >= this.aiOrder.length) this.aiCursor = 0;
  }

  private addBrain(creature: Creature, now: number): void {
    const brain: Brain =
      creature instanceof Monster
        ? new MonsterBrain(
            creature,
            now,
            this.config.ai.seed,
            this.config.ai,
            this.combat
              ? {
                  combat: this.combat,
                  summon: (owner, typeId, maxCount, summonAt) =>
                    this.summon(owner, typeId, maxCount, summonAt),
                }
              : undefined,
          )
        : new NpcBrain(creature as Npc, now, this.config.ai.seed);
    this.brains.set(creature.id, brain);
    this.aiIndices.set(creature.id, this.aiOrder.length);
    this.aiOrder.push(creature.id);
  }

  private summon(
    owner: Monster,
    typeId: string,
    maxCount: number,
    now: number,
  ): boolean {
    if (this.world.getCreature(owner.id) !== owner) return false;
    const type = this.content.monsterTypes.get(typeId);
    if (!type || !type.flags.summonable) return false;
    const owned = this.summonsByOwner.get(owner.id) ?? new Set<string>();
    for (const summonId of [...owned]) {
      if (!this.world.getCreature(summonId)) owned.delete(summonId);
    }
    if (owned.size >= maxCount) return false;
    const positions = [
      { x: owner.position.x, y: owner.position.y - 1, z: owner.position.z },
      { x: owner.position.x + 1, y: owner.position.y, z: owner.position.z },
      { x: owner.position.x, y: owner.position.y + 1, z: owner.position.z },
      { x: owner.position.x - 1, y: owner.position.y, z: owner.position.z },
    ];
    const position = positions.find(
      (candidate) =>
        Math.max(
          Math.abs(candidate.x - owner.home.x),
          Math.abs(candidate.y - owner.home.y),
        ) <= owner.spawnRadius &&
        this.world.isPathable(candidate) &&
        !this.world.isOccupied(candidate),
    );
    if (!position) return false;
    const summon = new Monster({
      id: `monster-summon:${owner.id}:${this.summonGeneration++}`,
      type,
      position,
      direction: owner.direction,
      home: owner.home,
      spawnRadius: owner.spawnRadius,
    });
    this.world.addCreature(summon);
    this.summonOwnerByCreature.set(summon.id, owner.id);
    owned.add(summon.id);
    this.summonsByOwner.set(owner.id, owned);
    this.addBrain(summon, now);
    this.visibility.announceCreatureSpawn(summon);
    return true;
  }

  private removeSummon(creatureId: string): boolean {
    const ownerId = this.summonOwnerByCreature.get(creatureId);
    if (!ownerId) return false;
    this.removeOwnedSummons(creatureId);
    const creature = this.world.removeCreature(creatureId);
    if (creature) this.visibility.announceCreatureLeave(creature);
    this.summonOwnerByCreature.delete(creatureId);
    const owned = this.summonsByOwner.get(ownerId);
    owned?.delete(creatureId);
    if (owned?.size === 0) this.summonsByOwner.delete(ownerId);
    this.removeBrain(creatureId);
    return true;
  }

  private removeOwnedSummons(ownerId: string): void {
    const owned = this.summonsByOwner.get(ownerId);
    if (!owned) return;
    for (const summonId of [...owned]) this.removeSummon(summonId);
    this.summonsByOwner.delete(ownerId);
  }
}
