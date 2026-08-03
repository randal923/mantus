import {
  PROFICIENCY_RULES,
  type ProficiencyActionFailedReason,
  type ProficiencySelectMessage,
  type ProficiencySelection,
  type ProficiencyWeaponState,
} from "@tibia/protocol";
import type { BestiaryCatalog } from "../bestiary/BestiaryCatalog";
import type { Monster } from "../creature/Monster";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { ItemType } from "../item/ItemType";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { LoginLoadQueue } from "../character/LoginLoadQueue";
import type { ProficiencyCatalog } from "./ProficiencyCatalog";
import {
  EMPTY_PROFICIENCY_EFFECTS,
  proficiencyPerkEffects,
  type ProficiencyPerkEffects,
} from "./ProficiencyPerkEffects";
import type { ProficiencyRecord, ProficiencyStore } from "./ProficiencyStore";
import { ResolvedOutcomes } from "../ResolvedOutcomes";

interface WeaponProgress {
  experience: number;
  mastered: boolean;
  selections: ProficiencySelection[];
}

/**
 * Weapon proficiency (Feature 82), transcribed from pinned Canary
 * weapon_proficiency.cpp. Experience accrues only from server-side monster
 * deaths — the killer's wielded weapon gains the bosstiary-rarity or
 * bestiary-star experience scaled by the 0.33 multiplier — and perk
 * selections are validated against that earned progress at execution time
 * inside the tick. Progress persists write-behind with a monotonic upsert,
 * so a lost trailing write can under-count but never mint experience.
 */
export class ProficiencyService {
  private readonly outcomes = new ResolvedOutcomes<[number]>();
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly progressByCharacter = new Map<
    string,
    Map<number, WeaponProgress>
  >();

  constructor(
    private readonly registry: SessionRegistry,
    private readonly items: ItemIntentHandler,
    private readonly itemCatalog: ItemCatalog,
    private readonly bestiary: BestiaryCatalog,
    private readonly catalog?: ProficiencyCatalog,
    private readonly store?: ProficiencyStore,
    private readonly loginLoads: LoginLoadQueue = new LoginLoadQueue(),
  ) {}

  applyResolvedOutcomes(now: number): void {
    this.outcomes.applyAll(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
  }

  detachCharacter(characterId: string): void {
    this.progressByCharacter.delete(characterId);
  }

  attachCharacter(session: Session, characterId: string): void {
    const store = this.store;
    if (!store || !this.catalog) {
      this.progressByCharacter.set(characterId, new Map());
      return;
    }
    const loaded = this.loginLoads.run(characterId, () =>
      store.load(characterId),
    );
    this.track(
      loaded.then(
        (records) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            const byId = new Map<number, WeaponProgress>();
            for (const record of records) {
              if (!this.catalog?.profiles.has(record.proficiencyId)) continue;
              byId.set(record.proficiencyId, {
                experience: record.experience,
                mastered: record.mastered,
                selections: this.sanitizeSelections(record),
              });
            }
            this.progressByCharacter.set(characterId, byId);
            session.send(this.projectState(characterId));
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(`proficiency load failed for ${characterId}: ${reason}`);
        },
      ),
    );
  }

  /** Kill accrual: the killer's wielded weapon only (monster.cpp:3291). */
  onMonsterKilled(monster: Monster, killedAt: number): void {
    void killedAt;
    const catalog = this.catalog;
    if (!catalog) return;
    const killerId = monster.topDamagerId();
    if (!killerId) return;
    const progress = this.progressByCharacter.get(killerId);
    if (!progress) return;
    const weapon = this.items
      .combatEquipment(killerId)
      .find(
        (entry) =>
          entry.item.location.kind === "equipment" &&
          entry.item.location.slot === "weapon",
      );
    const proficiencyId = weapon?.type.proficiencyId;
    if (!proficiencyId || !catalog.profiles.has(proficiencyId)) return;
    const raceId = this.bestiary.raceIdByMonsterTypeId.get(monster.type.id);
    if (raceId === undefined) return;
    const boss = this.bestiary.bossesByRaceId.get(raceId);
    const entry = this.bestiary.entriesByRaceId.get(raceId);
    // Boss and bestiary experience both fire when applicable
    // (monster.cpp:3291-3301); each is scaled by the gain multiplier.
    let gained = 0;
    if (boss) {
      gained += Math.round(
        PROFICIENCY_RULES.bossExperience[boss.category] *
          PROFICIENCY_RULES.gainMultiplier,
      );
    }
    if (entry) {
      const stars = Math.min(5, Math.max(0, entry.stars));
      gained += Math.round(
        (PROFICIENCY_RULES.starExperience[stars] ?? 0) *
          PROFICIENCY_RULES.gainMultiplier,
      );
    }
    if (gained <= 0) return;
    const state = progress.get(proficiencyId) ?? {
      experience: 0,
      mastered: false,
      selections: [],
    };
    const before = this.unlockedLevels(proficiencyId, state.experience);
    const maxExperience = this.maxExperience(proficiencyId);
    state.experience = Math.min(maxExperience, state.experience + gained);
    if (state.experience >= maxExperience) state.mastered = true;
    progress.set(proficiencyId, state);
    this.persist(killerId, proficiencyId, state);
    const after = this.unlockedLevels(proficiencyId, state.experience);
    const session = this.registry.sessionFor(killerId);
    if (session) {
      session.send(this.projectState(killerId));
      if (after > before) {
        session.send({
          type: "combat-log",
          kind: "experience",
          text: `Your weapon proficiency advanced to level ${after}.`,
        });
      }
    }
  }

  handleGet(session: Session, now: number): void {
    const characterId = session.playerId;
    if (!characterId || !this.guard(session, now)) return;
    if (!this.progressByCharacter.has(characterId)) return;
    session.send(this.projectState(characterId));
  }

  handleSelect(
    session: Session,
    intent: ProficiencySelectMessage,
    now: number,
  ): void {
    const characterId = session.playerId;
    const catalog = this.catalog;
    if (!characterId || !this.guard(session, now)) return;
    if (!catalog) return;
    const progress = this.progressByCharacter.get(characterId);
    const profile = catalog.profiles.get(intent.proficiencyId);
    if (!progress || !profile) {
      return this.fail(session, "unknown-weapon");
    }
    const state = progress.get(intent.proficiencyId) ?? {
      experience: 0,
      mastered: false,
      selections: [],
    };
    const unlocked = this.unlockedLevels(
      intent.proficiencyId,
      state.experience,
    );
    const seen = new Set<number>();
    for (const selection of intent.selections) {
      if (seen.has(selection.level)) {
        return this.fail(session, "duplicate-level");
      }
      seen.add(selection.level);
      // Execution-time re-check against earned progress (charter rule 4;
      // Canary weapon_proficiency.cpp:585-640).
      if (selection.level >= unlocked) {
        return this.fail(session, "level-locked");
      }
      const perkCount =
        profile.levels[selection.level]?.perks.length ?? 0;
      if (selection.index >= perkCount) {
        return this.fail(session, "invalid-perk");
      }
    }
    state.selections = [...intent.selections].sort(
      (left, right) => left.level - right.level,
    );
    progress.set(intent.proficiencyId, state);
    this.persist(characterId, intent.proficiencyId, state);
    session.send(this.projectState(characterId));
  }

  /** Selected-perk effects for the wielded weapon, read at execution time. */
  effectsFor(characterId: string): ProficiencyPerkEffects {
    const catalog = this.catalog;
    if (!catalog) return EMPTY_PROFICIENCY_EFFECTS;
    const progress = this.progressByCharacter.get(characterId);
    if (!progress) return EMPTY_PROFICIENCY_EFFECTS;
    const weapon = this.items
      .combatEquipment(characterId)
      .find(
        (entry) =>
          entry.item.location.kind === "equipment" &&
          entry.item.location.slot === "weapon",
      );
    const proficiencyId = weapon?.type.proficiencyId;
    if (!proficiencyId) return EMPTY_PROFICIENCY_EFFECTS;
    const profile = catalog.profiles.get(proficiencyId);
    const state = progress.get(proficiencyId);
    if (!profile || !state || state.selections.length === 0) {
      return EMPTY_PROFICIENCY_EFFECTS;
    }
    const unlocked = this.unlockedLevels(proficiencyId, state.experience);
    const perks = state.selections.flatMap((selection) => {
      if (selection.level >= unlocked) return [];
      const perk = profile.levels[selection.level]?.perks[selection.index];
      return perk ? [perk] : [];
    });
    return proficiencyPerkEffects(perks);
  }

  /** Canary weapon_proficiency.cpp:664-680 — XP table per weapon family. */
  experienceTableFor(type: ItemType): ReadonlyArray<number> {
    if (type.ammoType === "bolt") {
      return PROFICIENCY_RULES.experienceTables.crossbow;
    }
    const knightWeapon =
      type.weaponType === "sword" ||
      type.weaponType === "axe" ||
      type.weaponType === "club";
    const knightGated = (type.requirements?.vocations ?? []).some((name) =>
      name.toLowerCase().includes("knight"),
    );
    return knightWeapon && knightGated
      ? PROFICIENCY_RULES.experienceTables.knight
      : PROFICIENCY_RULES.experienceTables.standard;
  }

  private unlockedLevels(proficiencyId: number, experience: number): number {
    const profile = this.catalog?.profiles.get(proficiencyId);
    if (!profile) return 0;
    const table = this.tableOf(proficiencyId);
    const maxLevel = Math.min(profile.levels.length, table.length);
    let unlocked = 0;
    for (let level = 0; level < maxLevel; level += 1) {
      const threshold = table[level];
      if (threshold === undefined || experience < threshold) break;
      unlocked += 1;
    }
    return unlocked;
  }

  private maxExperience(proficiencyId: number): number {
    const profile = this.catalog?.profiles.get(proficiencyId);
    const table = this.tableOf(proficiencyId);
    const masteryTiers = Math.min(
      table.length,
      (profile?.levels.length ?? 0) + PROFICIENCY_RULES.masteryExperienceOffset,
    );
    return table[masteryTiers - 1] ?? table[table.length - 1] ?? 0;
  }

  private tableOf(proficiencyId: number): ReadonlyArray<number> {
    // The family follows the first catalog item mapped to this profile.
    const type = this.itemCatalog.findByProficiencyId(proficiencyId);
    return type
      ? this.experienceTableFor(type)
      : PROFICIENCY_RULES.experienceTables.standard;
  }

  private projectState(characterId: string) {
    const progress = this.progressByCharacter.get(characterId);
    const weapons: ProficiencyWeaponState[] = [];
    for (const [proficiencyId, state] of progress ?? []) {
      const unlocked = this.unlockedLevels(proficiencyId, state.experience);
      const table = this.tableOf(proficiencyId);
      const next = state.mastered
        ? null
        : table.find((threshold) => threshold > state.experience) ?? null;
      weapons.push({
        proficiencyId,
        experience: state.experience,
        mastered: state.mastered,
        unlockedLevels: unlocked,
        nextLevelExperience: next,
        selections: state.selections,
      });
      if (weapons.length >= PROFICIENCY_RULES.maxTrackedWeapons) break;
    }
    weapons.sort((left, right) => left.proficiencyId - right.proficiencyId);
    return { type: "proficiency-state" as const, weapons };
  }

  private sanitizeSelections(
    record: ProficiencyRecord,
  ): ProficiencySelection[] {
    const profile = this.catalog?.profiles.get(record.proficiencyId);
    if (!profile) return [];
    const seen = new Set<number>();
    const selections: ProficiencySelection[] = [];
    for (const selection of record.selections) {
      if (seen.has(selection.level)) continue;
      const perkCount = profile.levels[selection.level]?.perks.length ?? 0;
      if (selection.index >= perkCount) continue;
      seen.add(selection.level);
      selections.push(selection);
    }
    return selections;
  }

  private persist(
    characterId: string,
    proficiencyId: number,
    state: WeaponProgress,
  ): void {
    const store = this.store;
    if (!store) return;
    this.track(
      store
        .save(characterId, {
          proficiencyId,
          experience: state.experience,
          mastered: state.mastered,
          selections: state.selections,
        })
        .catch((cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(
            `proficiency persist failed for ${characterId}: ${reason}`,
          );
        }),
    );
  }

  private guard(session: Session, now: number): boolean {
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) return false;
    this.cooldownBySession.set(
      session.id,
      now + PROFICIENCY_RULES.actionCooldownMs,
    );
    return true;
  }

  private fail(session: Session, reason: ProficiencyActionFailedReason): void {
    session.send({ type: "proficiency-action-failed", reason });
  }

  private track(operation: Promise<unknown>): void {
    const tracked = operation.then(
      () => undefined,
      () => undefined,
    );
    this.pendingOperations.add(tracked);
    void tracked.finally(() => this.pendingOperations.delete(tracked));
  }
}
