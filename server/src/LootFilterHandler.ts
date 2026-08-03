import {
  LOOT_FILTER_MAX_CARRIED_TYPES,
  type LootFilter,
  type LootFilterItem,
  type UpdateLootFilterMessage,
} from "@tibia/protocol";
import type { CharacterStore } from "./character/CharacterStore";
import type { ItemIntentHandler } from "./item/ItemIntentHandler";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { World } from "./World";
import { ResolvedOutcomes } from "./ResolvedOutcomes";

/** Minimum gap between loot-filter item listings for one session. */
const ITEMS_COOLDOWN_MS = 1_000;

/**
 * Owns the auto-loot blacklist and the carried-item-type listing its window
 * shows. The filter only ever says what *not* to take, so an id the catalog
 * does not know is dropped rather than rejected — a stale blacklist entry
 * must not make the whole setting unsaveable.
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
    if (session.lootFilterUpdatePending) {
      session.sendError("loot-filter-update-pending");
      return;
    }
    const filter = this.sanitize(intent.filter);
    if (!filter) {
      session.sendError("loot-filter-invalid");
      return;
    }
    session.lootFilterUpdatePending = true;
    // Applied in memory immediately so the very next corpse honours the edit;
    // the durable write trails behind and rolls the session back if it fails.
    const previous = session.lootFilter;
    session.lootFilter = filter;
    void this.persist(session, playerId, filter, previous);
  }

  /**
   * Answers with what the loot-filter window draws: every distinct item type
   * the character carries, summed across all of its containers, plus the
   * blacklisted types it no longer holds so they stay removable. Both are the
   * player's own data — nothing about anyone else is derivable from it.
   */
  handleItemsGet(session: Session, now: number): void {
    const playerId = session.playerId;
    if (!playerId || !this.world.getPlayer(playerId)) {
      session.sendError("join-required");
      return;
    }
    if (now < session.lootFilterItemsReadyAt) return;
    session.lootFilterItemsReadyAt = now + ITEMS_COOLDOWN_MS;
    const byType = new Map<number, LootFilterItem>();
    for (const item of this.items.inventorySnapshot(playerId)?.items ?? []) {
      const type = this.items.itemType(item.typeId);
      if (!type || !type.pickupable) continue;
      const current = byType.get(item.typeId);
      byType.set(item.typeId, {
        typeId: type.id,
        name: type.name,
        spriteId: type.spriteId,
        count: (current?.count ?? 0) + item.count,
      });
    }
    const carried = [...byType.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, LOOT_FILTER_MAX_CARRIED_TYPES);
    const ignored = session.lootFilter.ignoredItemTypeIds.flatMap<LootFilterItem>(
      (typeId) => {
        if (byType.has(typeId)) return [];
        const type = this.items.itemType(typeId);
        if (!type) return [];
        return [{ typeId: type.id, name: type.name, spriteId: type.spriteId }];
      },
    );
    session.send({ type: "loot-filter-items", carried, ignored });
  }

  applyResolvedOutcomes(): void {
    this.outcomes.applyAll();
  }

  private sanitize(filter: LootFilter): LootFilter | null {
    const ignoredItemTypeIds: number[] = [];
    const seen = new Set<number>();
    for (const typeId of filter.ignoredItemTypeIds) {
      if (seen.has(typeId)) continue;
      if (!this.items.itemType(typeId)) continue;
      seen.add(typeId);
      ignoredItemTypeIds.push(typeId);
    }
    return { enabled: filter.enabled, ignoredItemTypeIds };
  }

  private async persist(
    session: Session,
    characterId: string,
    filter: LootFilter,
    previous: LootFilter,
  ): Promise<void> {
    try {
      await this.characters.updateLootFilter(characterId, filter);
      this.outcomes.push(() => {
        session.lootFilterUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        session.send({ type: "loot-filter-updated", filter });
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `loot filter update failed for character ${characterId}: ${reason}`,
      );
      this.outcomes.push(() => {
        session.lootFilterUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        // The optimistic in-memory copy is rolled back so the live sweep and
        // the durable row agree again.
        session.lootFilter = previous;
        session.send({ type: "loot-filter-updated", filter: previous });
        session.sendError("loot-filter-update-failed");
      });
    }
  }
}
