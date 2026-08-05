import {
  CYCLOPEDIA_LIMITS,
  tierBonusPercent,
  type CyclopediaActionFailedReason,
  type CyclopediaCharacterGetMessage,
  type CyclopediaItemCount,
  type DamageType,
} from "@tibia/protocol";
import type { DepotService } from "../depot/DepotService";
import { itemTierOf } from "../forge/itemTierOf";
import type { Item } from "../item/Item";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { playerMitigation } from "../combat/playerMitigation";
import { playerSpecials } from "../combat/playerSpecials";
import { playerTierBonuses } from "../combat/playerTierBonuses";
import { playerCombatSkill } from "../combat/playerCombatSkill";
import { playerDefense } from "../combat/playerDefense";
import { combineSkillBoosts } from "../combat/combineSkillBoosts";
import { skillForWeapon } from "../combat/skillForWeapon";
import type { ProficiencyHooks } from "../proficiency/ProficiencyHooks";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { CyclopediaStore } from "./CyclopediaStore";
import { ResolvedOutcomes } from "../ResolvedOutcomes";

const ABSORB_ELEMENTS: ReadonlyArray<DamageType> = [
  "physical",
  "fire",
  "earth",
  "energy",
  "ice",
  "holy",
  "death",
];

/**
 * Cyclopedia character views (Feature 83). Every view is a bounded
 * projection of the requesting character's own state (Canary's ownership
 * gate, game.cpp:9787-9793): combat stats read live equipment and bonuses
 * at request time, deaths/PvP kills come from fixed windowed queries, and
 * the item summary aggregates the character's own memory-authoritative
 * caches — never another character's, never raw rows.
 */
export class CyclopediaService {
  private readonly outcomes = new ResolvedOutcomes<[number]>();
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  /** One page query in flight per session; a second request is dropped. */
  private readonly pendingBySession = new Set<string>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly items: ItemIntentHandler,
    private readonly depot: DepotService,
    private readonly proficiencyHooks?: ProficiencyHooks,
    private readonly store?: CyclopediaStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    this.outcomes.applyAll(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
    this.pendingBySession.delete(session.id);
  }

  /** Write-behind death row for the recent-deaths view. */
  recordDeath(characterId: string, level: number, cause: string): void {
    const store = this.store;
    if (!store) return;
    const bounded = cause.slice(0, CYCLOPEDIA_LIMITS.maxCauseLength);
    this.track(
      store.recordDeath(characterId, level, bounded).catch((cause_: unknown) => {
        const reason = cause_ instanceof Error ? cause_.message : "unknown";
        console.warn(`death history write failed for ${characterId}: ${reason}`);
      }),
    );
  }

  handle(
    session: Session,
    intent: CyclopediaCharacterGetMessage,
    now: number,
  ): void {
    const characterId = session.playerId;
    if (!characterId) return;
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) return this.fail(session, "rate-limited");
    this.cooldownBySession.set(
      session.id,
      now + CYCLOPEDIA_LIMITS.actionCooldownMs,
    );
    switch (intent.view) {
      case "combat":
        return this.sendCombat(session, characterId, now);
      case "item-summary":
        return this.sendItemSummary(session, characterId);
      case "deaths":
      case "pvp-kills":
        return this.sendHistoryPage(
          session,
          characterId,
          intent.view,
          Math.min(intent.page ?? 0, CYCLOPEDIA_LIMITS.maxPage),
        );
      default:
        return this.fail(session, "invalid-request");
    }
  }

  private sendCombat(session: Session, characterId: string, now: number): void {
    const player = this.world.getPlayer(characterId);
    if (!player) return;
    const equipment = this.items.combatEquipment(characterId);
    const specials = playerSpecials(equipment, player);
    const imbuements = this.items.imbuementEffects(characterId);
    const affixes = this.items.affixEffects(characterId);
    const proficiency = this.proficiencyHooks?.effectsFor(characterId);
    const tier = playerTierBonuses(equipment);
    const weapon = equipment.find(
      (entry) =>
        entry.item.location.kind === "equipment" &&
        entry.item.location.slot === "weapon",
    );
    const attackSkill = skillForWeapon(weapon?.type.weaponType);
    const absorbs = ABSORB_ELEMENTS.flatMap((element) => {
      const equipmentPercent = equipment.reduce(
        (total, entry) =>
          total +
          (entry.type.absorbPercent?.[
            element as keyof NonNullable<typeof entry.type.absorbPercent>
          ] ?? 0),
        0,
      );
      // Imbuement reductions stack multiplicatively downstream; the view
      // shows their combined nominal percent alongside equipment absorbs.
      const imbuementPercent = (imbuements.absorb[element] ?? []).reduce(
        (total, percent) => total + percent,
        0,
      );
      const percent = Math.min(
        100,
        equipmentPercent + imbuementPercent + (affixes.resistances[element] ?? 0),
      );
      return percent !== 0 ? [{ element, percent }] : [];
    });
    session.send({
      type: "cyclopedia-combat-state",
      criticalChancePercent: round2(
        specials.criticalChance +
          imbuements.criticalChancePercent +
          affixes.criticalChancePercent +
          (proficiency?.criticalChancePercent ?? 0),
      ),
      criticalDamagePercent: round2(
        specials.criticalDamagePercent +
          imbuements.criticalDamagePercent +
          affixes.criticalDamagePercent +
          (proficiency?.criticalDamagePercent ?? 0),
      ),
      lifeLeechPercent: round2(
        specials.lifeLeechPercent +
          player.wheelBonuses.lifeLeechPercent +
          imbuements.lifeLeechPercent +
          affixes.lifeLeechPercent +
          (proficiency?.lifeLeechPercent ?? 0),
      ),
      manaLeechPercent: round2(
        specials.manaLeechPercent +
          player.wheelBonuses.manaLeechPercent +
          imbuements.manaLeechPercent +
          affixes.manaLeechPercent +
          (proficiency?.manaLeechPercent ?? 0),
      ),
      attackSkill: playerCombatSkill(
        player,
        equipment,
        attackSkill,
        (imbuements.skills[attackSkill] ?? 0) +
          (affixes.skills[attackSkill] ?? 0) +
          (proficiency?.skills[attackSkill] ?? 0),
      ),
      attackValue: Math.max(
        0,
        Math.round(
          (weapon ? (weapon.type.attack ?? 0) : 7) +
            affixes.attack +
            (proficiency?.attackDamage ?? 0),
        ),
      ),
      defenseValue:
        playerDefense(
          player,
          equipment,
          session.fightMode.attack,
          now,
          combineSkillBoosts(imbuements.skills, affixes.skills),
        ) + affixes.defense,
      armorValue: equipment.reduce(
        (total, entry) => total + (entry.type.armor ?? 0),
        0,
      ),
      mitigationPercent: round2(
        playerMitigation(
          player,
          equipment,
          session.fightMode.attack,
          (imbuements.skills.shielding ?? 0) +
            (affixes.skills.shielding ?? 0),
        ),
      ),
      onslaughtPercent: round2(tier.fatalChancePercent),
      rusePercent: round2(tier.dodgeChancePercent),
      momentumPercent: round2(tier.momentumChancePercent),
      absorbs,
    });
  }

  private sendItemSummary(session: Session, characterId: string): void {
    const carried = this.items.inventorySnapshot(characterId);
    const depotCache = this.depot.cacheFor(characterId);
    const summarize = (items: ReadonlyArray<Item>): CyclopediaItemCount[] => {
      const byKey = new Map<string, CyclopediaItemCount>();
      for (const item of items) {
        const tier = itemTierOf(item);
        const key = `${item.typeId}:${tier}`;
        const existing = byKey.get(key);
        if (existing) {
          byKey.set(key, { ...existing, count: existing.count + item.count });
        } else {
          byKey.set(key, { itemTypeId: item.typeId, tier, count: item.count });
        }
      }
      return [...byKey.values()]
        .sort(
          (left, right) =>
            left.itemTypeId - right.itemTypeId || left.tier - right.tier,
        )
        .slice(0, CYCLOPEDIA_LIMITS.maxItemSummaryEntries);
    };
    const depotItems: Item[] = [];
    const inboxItems: Item[] = [];
    for (const item of depotCache?.items ?? []) {
      if (item.location.kind === "inbox") inboxItems.push(item);
      else depotItems.push(item);
    }
    const stash: CyclopediaItemCount[] = [...(depotCache?.stash ?? [])]
      .map(([itemTypeId, count]) => ({ itemTypeId, tier: 0, count }))
      .filter((entry) => entry.count > 0)
      .sort((left, right) => left.itemTypeId - right.itemTypeId)
      .slice(0, CYCLOPEDIA_LIMITS.maxItemSummaryEntries);
    session.send({
      type: "cyclopedia-item-summary-state",
      carried: summarize(carried?.items ?? []),
      depot: summarize(depotItems),
      inbox: summarize(inboxItems),
      stash,
    });
  }

  private sendHistoryPage(
    session: Session,
    characterId: string,
    view: "deaths" | "pvp-kills",
    page: number,
  ): void {
    const store = this.store;
    if (!store) return this.fail(session, "unavailable");
    if (this.pendingBySession.has(session.id)) return;
    this.pendingBySession.add(session.id);
    const query =
      view === "deaths"
        ? store
            .deathsPage(
              characterId,
              page,
              CYCLOPEDIA_LIMITS.pageSize,
              CYCLOPEDIA_LIMITS.deathsWindowDays,
            )
            .then((result) => ({ view, result }) as const)
        : store
            .pvpKillsPage(
              characterId,
              page,
              CYCLOPEDIA_LIMITS.pageSize,
              CYCLOPEDIA_LIMITS.pvpKillsWindowDays,
            )
            .then((result) => ({ view, result }) as const);
    this.track(
      query.then(
        (outcome) => {
          this.outcomes.push(() => {
            this.pendingBySession.delete(session.id);
            // Only the requesting character's own session ever sees the page.
            if (session.playerId !== characterId) return;
            const totalPages = Math.ceil(
              outcome.result.totalEntries / CYCLOPEDIA_LIMITS.pageSize,
            );
            if (outcome.view === "deaths") {
              session.send({
                type: "cyclopedia-deaths-state",
                page,
                totalPages,
                entries: outcome.result.entries.map((entry) => ({
                  at: entry.at,
                  level: entry.level,
                  cause: entry.cause,
                })),
              });
              return;
            }
            session.send({
              type: "cyclopedia-pvp-kills-state",
              page,
              totalPages,
              entries: outcome.result.entries.map((entry) => ({
                at: entry.at,
                description: `Killed ${entry.victimName}.`,
                status: entry.unjustified ? "unjustified" : "justified",
              })),
            });
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(
            `cyclopedia ${view} query failed for ${characterId}: ${reason}`,
          );
          this.outcomes.push(() => {
            this.pendingBySession.delete(session.id);
            if (session.playerId === characterId) {
              this.fail(session, "unavailable");
            }
          });
        },
      ),
    );
  }

  private fail(session: Session, reason: CyclopediaActionFailedReason): void {
    session.send({ type: "cyclopedia-action-failed", reason });
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
