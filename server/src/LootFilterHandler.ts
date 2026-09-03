import {
  LOOT_FILTER_MAX_CARRIED_TYPES,
  type LootFilter,
  type LootFilterItem,
  type LootFilterRule,
  type UpdateLootFilterMessage,
} from "@tibia/protocol";
import { isRarityEligible } from "./rarity/isRarityEligible";
import { itemDisplayRarityOf } from "./item/itemDisplayRarityOf";
import type { ItemType } from "./item/ItemType";
import { toItemTooltip } from "./item/toItemTooltip";
import type { CharacterStore } from "./character/CharacterStore";
import type { ItemIntentHandler } from "./item/ItemIntentHandler";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { World } from "./World";
import { ResolvedOutcomes } from "./ResolvedOutcomes";

/** Minimum gap between loot-filter item listings for one session. */
const ITEMS_COOLDOWN_MS = 1_000;

/**
 * Owns the auto-loot pick-up list and the carried-item-type listing its
 * window shows. The filter only ever says what the player *wants*, so an id
 * the catalog does not know is dropped rather than rejected — a stale entry
 * must not make the whole setting unsaveable, and dropping one can only ever
 * make the sweep take less.
 */
export class LootFilterHandler {
  private readonly outcomes = new ResolvedOutcomes();

  constructor(
    private readonly registry: SessionRegistry,
    private readonly world: World,
    private readonly items: ItemIntentHandler,
    private readonly characters: CharacterStore,
  ) {}

  handleUpdate(session: Session, intent: UpdateLootFilterMessage): void {
    const playerId = session.playerId;
    if (!playerId || !this.world.getPlayer(playerId)) {
      session.sendError("join-required");
      return;
    }
    const filter = this.sanitize(intent.filter);
    if (!filter) {
      session.sendError("loot-filter-invalid");
      return;
    }
    // Applied in memory immediately so the very next corpse honours the edit;
    // the durable write trails behind and rolls the session back if it fails.
    const previous = session.lootFilter;
    session.lootFilter = filter;
    if (session.lootFilterUpdatePending) {
      // A durable write is still in flight. The newest edit wins once it
      // settles — refusing it would leave the sweep on a list the player no
      // longer sees (two cells ticked inside one slow round-trip).
      session.lootFilterDeferred = filter;
      return;
    }
    session.lootFilterUpdatePending = true;
    void this.persist(session, playerId, filter, previous);
  }

  /**
   * Answers with what the loot-filter window draws: what the character is
   * actually holding, summed across all of its containers and split by the
   * grade each stack rolled, plus one ungraded entry per type it carries or
   * lists. All of it is the player's own data — nothing about anyone else is
   * derivable from it.
   */
  handleItemsGet(session: Session, now: number): void {
    const playerId = session.playerId;
    if (!playerId || !this.world.getPlayer(playerId)) {
      session.sendError("join-required");
      return;
    }
    if (now < session.lootFilterItemsReadyAt) return;
    session.lootFilterItemsReadyAt = now + ITEMS_COOLDOWN_MS;
    const byGrade = new Map<string, LootFilterItem>();
    const byType = new Map<number, LootFilterItem>();
    for (const item of this.items.inventorySnapshot(playerId)?.items ?? []) {
      const type = this.items.itemType(item.typeId);
      if (!type || !type.pickupable) continue;
      const base = byType.get(type.id) ?? this.toListing(type);
      byType.set(type.id, base);
      const rarity = itemDisplayRarityOf(type, item);
      const key = `${type.id}:${rarity ?? ""}`;
      const current = byGrade.get(key);
      byGrade.set(key, {
        ...base,
        count: (current?.count ?? 0) + item.count,
        // The type's tooltip at this stack's grade — not this one instance's,
        // whose rolled affixes belong to it alone and say nothing about the
        // next drop of the same grade the sweep will judge.
        tooltip: rarity ? { ...base.tooltip, rarity } : base.tooltip,
      });
    }
    for (const rule of session.lootFilter.pickupRules) {
      if (byType.has(rule.typeId)) continue;
      const type = this.items.itemType(rule.typeId);
      if (type) byType.set(type.id, this.toListing(type));
    }
    const byName = (left: LootFilterItem, right: LootFilterItem) =>
      left.name.localeCompare(right.name) ||
      (left.tooltip.rarity ?? "").localeCompare(right.tooltip.rarity ?? "");
    session.send({
      type: "loot-filter-items",
      carried: [...byGrade.values()]
        .sort(byName)
        .slice(0, LOOT_FILTER_MAX_CARRIED_TYPES),
      types: [...byType.values()].sort(byName),
    });
  }

  private toListing(type: ItemType): LootFilterItem {
    return {
      typeId: type.id,
      name: type.name,
      spriteId: type.spriteId,
      tooltip: toItemTooltip(type),
    };
  }

  applyResolvedOutcomes(): void {
    this.outcomes.applyAll();
  }

  private sanitize(filter: LootFilter): LootFilter | null {
    const pickupRules: LootFilterRule[] = [];
    const seen = new Set<number>();
    for (const rule of filter.pickupRules) {
      if (seen.has(rule.typeId)) continue;
      const type = this.items.itemType(rule.typeId);
      if (!type) continue;
      seen.add(rule.typeId);
      // Grades only mean something on gear that can roll one. Keeping a list
      // on anything else would silently narrow the sweep to nothing, since
      // such a drop never carries a grade to match.
      const rarities =
        rule.rarities && isRarityEligible(type)
          ? [...new Set(rule.rarities)]
          : undefined;
      pickupRules.push({
        typeId: type.id,
        ...(rarities ? { rarities } : {}),
      });
    }
    return { enabled: filter.enabled, pickupRules };
  }

  /**
   * Writes `filter` durably. `durable` is the last filter known to be on
   * disk: the rollback target while nothing newer is waiting. Settling
   * happens on the tick (outcomes), where a deferred edit — already live in
   * memory — starts the next write of the chain; only a committed write is
   * echoed, and only when nothing newer is queued behind it, so the client
   * never flashes back to a list it has already replaced.
   */
  private async persist(
    session: Session,
    characterId: string,
    filter: LootFilter,
    durable: LootFilter,
  ): Promise<void> {
    let committed = false;
    try {
      await this.characters.updateLootFilter(characterId, filter);
      committed = true;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `loot filter update failed for character ${characterId}: ${reason}`,
      );
    }
    this.outcomes.push(() => {
      const next = session.lootFilterDeferred;
      const stillDurable = committed ? filter : durable;
      if (next) {
        session.lootFilterDeferred = null;
        void this.persist(session, characterId, next, stillDurable);
        return;
      }
      session.lootFilterUpdatePending = false;
      if (
        !this.registry.contains(session) ||
        session.playerId !== characterId
      ) {
        return;
      }
      if (committed) {
        session.send({ type: "loot-filter-updated", filter });
        return;
      }
      // The optimistic in-memory copy is rolled back so the live sweep and
      // the durable row agree again.
      session.lootFilter = stillDurable;
      session.send({ type: "loot-filter-updated", filter: stillDurable });
      session.sendError("loot-filter-update-failed");
    });
  }
}
