import {
  BESTIARY_LIMITS,
  DAMAGE_TYPES,
  type BestiaryActionFailedReason,
  type BestiaryLootEntry,
  type BestiaryMonsterGetMessage,
  type BestiaryMonsterStateMessage,
  type BestiaryResistance,
  type BosstiaryBossGetMessage,
  type BosstiaryBossStateMessage,
  type DamageType,
  type WikiItemSource,
  type WikiItemSourcesGetMessage,
} from "@tibia/protocol";
import type { MonsterLoot, MonsterType } from "../creature/MonsterType";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { World } from "../World";
import type { BestiaryCatalog } from "./BestiaryCatalog";
import type { BestiaryTracker } from "./BestiaryTracker";
import { getBestiaryStage } from "./getBestiaryStage";
import { getBossMilestones } from "./getBossMilestones";
import { getLootRarity } from "./getLootRarity";

const RESISTANCE_ELEMENTS: ReadonlyArray<DamageType> = DAMAGE_TYPES.filter(
  (type) => type !== "life-drain" && type !== "mana-drain" && type !== "drown",
);

/**
 * Serves bestiary/bosstiary reads from the in-memory catalog and the
 * requesting character's own kill counters. Catalog details are public;
 * kill counters only determine charm and boss-point completion.
 */
export class BestiaryService {
  private readonly cooldownBySession = new Map<string, number>();
  private readonly itemSourcesCooldownBySession = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly catalog: BestiaryCatalog,
    private readonly tracker: BestiaryTracker,
    private readonly items: ItemIntentHandler,
  ) {}

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
    this.itemSourcesCooldownBySession.delete(session.id);
  }

  handleCreatures(session: Session, now: number): void {
    const characterId = this.guard(session, now);
    if (!characterId) return;
    const kills = this.tracker.killsFor(characterId);
    let charmPoints = 0;
    const entries = [...this.catalog.entriesByRaceId.values()]
      .sort(
        (a, b) =>
          a.className.localeCompare(b.className) ||
          a.monsterType.name.localeCompare(b.monsterType.name),
      )
      .slice(0, BESTIARY_LIMITS.maxEntries)
      .map((entry) => {
        const count = kills.get(entry.raceId) ?? 0;
        const stage = getBestiaryStage(entry, count);
        if (stage === 4) charmPoints += entry.charmPoints;
        return {
          raceId: entry.raceId,
          name: entry.monsterType.name,
          className: entry.className,
          outfit: entry.monsterType.outfit,
          stage,
          kills: count,
        };
      });
    session.send({ type: "bestiary-creatures-state", entries, charmPoints });
  }

  handleMonster(
    session: Session,
    intent: BestiaryMonsterGetMessage,
    now: number,
  ): void {
    const characterId = this.guard(session, now);
    if (!characterId) return;
    const entry = this.catalog.entriesByRaceId.get(intent.raceId);
    if (!entry) {
      this.fail(session, "unknown-race");
      return;
    }
    const kills = this.tracker.killsFor(characterId).get(entry.raceId) ?? 0;
    const stage = getBestiaryStage(entry, kills);
    const type = entry.monsterType;
    const message: BestiaryMonsterStateMessage = {
      type: "bestiary-monster-state",
      raceId: entry.raceId,
      name: type.name,
      className: entry.className,
      outfit: type.outfit,
      stage,
      kills,
      firstUnlock: entry.firstUnlock,
      secondUnlock: entry.secondUnlock,
      toKill: entry.toKill,
      stars: entry.stars,
      occurrence: entry.occurrence,
      charmPoints: entry.charmPoints,
      loot: this.projectLoot(entry.monsterType.loot),
      stats: this.projectStats(type),
      resistances: this.projectResistances(type.elements),
      locations: entry.locations,
    };
    session.send(message);
  }

  handleBosstiary(session: Session, now: number): void {
    const characterId = this.guard(session, now);
    if (!characterId) return;
    const kills = this.tracker.killsFor(characterId);
    let bossPoints = 0;
    const entries = [...this.catalog.bossesByRaceId.values()]
      .sort((a, b) => a.monsterType.name.localeCompare(b.monsterType.name))
      .slice(0, BESTIARY_LIMITS.maxBossEntries)
      .map((boss) => {
        const count = kills.get(boss.raceId) ?? 0;
        bossPoints += getBossMilestones(boss.category, count).points;
        return {
          raceId: boss.raceId,
          name: boss.monsterType.name,
          outfit: boss.monsterType.outfit,
          category: boss.category,
          kills: count,
        };
      });
    session.send({ type: "bosstiary-state", entries, bossPoints });
  }

  handleBoss(
    session: Session,
    intent: BosstiaryBossGetMessage,
    now: number,
  ): void {
    const characterId = this.guard(session, now);
    if (!characterId) return;
    const entry = this.catalog.bossesByRaceId.get(intent.raceId);
    if (!entry) {
      this.fail(session, "unknown-race");
      return;
    }
    const type = entry.monsterType;
    const message: BosstiaryBossStateMessage = {
      type: "bosstiary-boss-state",
      raceId: entry.raceId,
      name: type.name,
      outfit: type.outfit,
      category: entry.category,
      kills: this.tracker.killsFor(characterId).get(entry.raceId) ?? 0,
      loot: this.projectLoot(type.loot),
      stats: this.projectStats(type),
      resistances: this.projectResistances(type.elements),
    };
    session.send(message);
  }

  handleItemSources(
    session: Session,
    intent: WikiItemSourcesGetMessage,
    now: number,
  ): void {
    const characterId = session.playerId;
    if (!characterId || !this.world.getPlayer(characterId)) {
      session.sendError("join-required");
      return;
    }
    const readyAt = this.itemSourcesCooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) {
      this.fail(session, "rate-limited");
      return;
    }
    this.itemSourcesCooldownBySession.set(
      session.id,
      now + BESTIARY_LIMITS.actionCooldownMs,
    );
    if (!this.items.itemType(intent.itemTypeId)) {
      session.send({
        type: "wiki-item-sources-state",
        itemTypeId: intent.itemTypeId,
        sources: [],
      });
      return;
    }
    const sources: WikiItemSource[] = [];
    for (const entry of this.catalog.entriesByRaceId.values()) {
      if (!this.dropsItem(entry.monsterType.loot, intent.itemTypeId)) continue;
      sources.push({
        scope: "bestiary",
        raceId: entry.raceId,
        name: entry.monsterType.name,
        outfit: entry.monsterType.outfit,
      });
    }
    for (const entry of this.catalog.bossesByRaceId.values()) {
      if (!this.dropsItem(entry.monsterType.loot, intent.itemTypeId)) continue;
      sources.push({
        scope: "bosstiary",
        raceId: entry.raceId,
        name: entry.monsterType.name,
        outfit: entry.monsterType.outfit,
      });
    }
    session.send({
      type: "wiki-item-sources-state",
      itemTypeId: intent.itemTypeId,
      sources: sources
        .sort(
          (left, right) =>
            left.name.localeCompare(right.name) || left.raceId - right.raceId,
        )
        .slice(0, BESTIARY_LIMITS.maxItemSources),
    });
  }

  private projectLoot(loot: ReadonlyArray<MonsterLoot>): BestiaryLootEntry[] {
    const entries: BestiaryLootEntry[] = [];
    for (const drop of loot) {
      if (entries.length >= BESTIARY_LIMITS.maxLootEntries) break;
      const rarity = getLootRarity(drop.chance);
      const itemType =
        drop.itemTypeId !== undefined
          ? this.items.itemType(drop.itemTypeId)
          : drop.itemName
            ? this.items.itemTypeByName(drop.itemName)
            : undefined;
      if (!itemType) continue;
      entries.push({
        itemTypeId: itemType.id,
        spriteId: itemType.spriteId,
        name: itemType.name,
        rarity,
      });
    }
    return entries.sort((a, b) => a.rarity - b.rarity);
  }

  private projectStats(type: MonsterType): BosstiaryBossStateMessage["stats"] {
    const defenses = type.defenses.find((ability) => ability.kind === "stats");
    return {
      maxHealth: type.maxHealth,
      experience: type.experience,
      speed: type.speed,
      armor: Math.min(1000, defenses?.armor ?? 0),
      mitigation: defenses?.mitigation ?? 0,
    };
  }

  private dropsItem(
    loot: ReadonlyArray<MonsterLoot>,
    itemTypeId: number,
  ): boolean {
    return loot.some((drop) => {
      const itemType =
        drop.itemTypeId !== undefined
          ? this.items.itemType(drop.itemTypeId)
          : drop.itemName
            ? this.items.itemTypeByName(drop.itemName)
            : undefined;
      return itemType?.id === itemTypeId;
    });
  }

  private projectResistances(
    elements: Readonly<Partial<Record<DamageType, number>>>,
  ): BestiaryResistance[] {
    return RESISTANCE_ELEMENTS.map((element) => ({
      element,
      percent: Math.min(1000, Math.max(0, 100 - (elements[element] ?? 0))),
    }));
  }

  private guard(session: Session, now: number): string | null {
    const characterId = session.playerId;
    if (!characterId || !this.world.getPlayer(characterId)) {
      session.sendError("join-required");
      return null;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) {
      this.fail(session, "rate-limited");
      return null;
    }
    this.cooldownBySession.set(session.id, now + BESTIARY_LIMITS.actionCooldownMs);
    return characterId;
  }

  private fail(session: Session, reason: BestiaryActionFailedReason): void {
    session.send({ type: "bestiary-action-failed", reason });
  }
}
