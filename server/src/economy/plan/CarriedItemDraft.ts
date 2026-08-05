import { randomUUID } from "node:crypto";
import type {
  CarriedCreationReason,
  CarriedDestructionReason,
  CarriedPersistAudit,
  CarriedPersistPlan,
  CarriedPersistRowOp,
} from "../../item/CarriedPersistPlan";
import type { Item } from "../../item/Item";
import type { ItemCatalog } from "../../item/ItemCatalog";
import type { ItemMutation } from "../../item/ItemMutation";
import { itemRarityOf } from "../../rarity/itemRarityOf";
import {
  backpackContainers,
  type BackpackContainerView,
} from "../../item/plan/backpackContainers";

const MAX_CARRIED_ITEMS = 500;

/**
 * Builds one carried-item mutation and its matching row ops in memory, as the
 * economy planners compose it: coins leave, change and goods arrive.
 *
 * The draft is the in-memory twin of `PgCoinOperations` — same fill order, same
 * per-row audits, same 500-row ceiling — so a memory-first purchase places
 * exactly the rows the DB-first transaction used to. Every mutating method
 * returns false when it cannot be satisfied in full; a planner that sees false
 * abandons the whole draft rather than committing a partial one.
 */
export class CarriedItemDraft {
  private readonly byId: Map<string, Item>;
  private readonly rowOps: CarriedPersistRowOp[] = [];
  private readonly audits: CarriedPersistAudit[] = [];
  private readonly changed = new Map<string, Item>();
  private readonly removed = new Set<string>();
  private containers: ReadonlyArray<BackpackContainerView> | null | undefined;

  constructor(
    private readonly catalog: ItemCatalog,
    private readonly characterId: string,
    items: ReadonlyArray<Item>,
    private readonly capacityMax: number,
  ) {
    this.byId = new Map(items.map((item) => [item.id, item]));
  }

  /** Current carried rows, reflecting every change staged so far. */
  items(): ReadonlyArray<Item> {
    return [...this.byId.values()];
  }

  /** Hundredths of an ounce carried right now. */
  usedWeight(): number {
    let total = 0;
    for (const item of this.byId.values()) {
      total += this.weightOf(item.typeId) * item.count;
    }
    return total;
  }

  /** Hundredths of an ounce the character can carry in total. */
  capacityBudget(): number {
    return this.capacityMax * 100;
  }

  /** Units of a type held outside equipment, ignoring parent containers. */
  countOf(
    typeId: number,
    attributes?: Readonly<Record<string, unknown>>,
  ): number {
    let total = 0;
    for (const item of this.sellableRows(typeId, attributes)) {
      total += item.count;
    }
    return total;
  }

  /**
   * Removes `count` units of a type, lowest row id first so the choice of rows
   * is deterministic. Rows holding other items are never touched — destroying
   * a container would orphan its contents.
   */
  destroy(
    typeId: number,
    count: number,
    reason: CarriedDestructionReason,
    attributes?: Readonly<Record<string, unknown>>,
  ): boolean {
    let remaining = count;
    for (const row of this.sellableRows(typeId, attributes)) {
      if (remaining === 0) break;
      const taken = Math.min(row.count, remaining);
      remaining -= taken;
      if (taken === row.count) {
        this.rowOps.push({
          kind: "delete",
          itemId: row.id,
          expectedVersion: row.version,
        });
        this.byId.delete(row.id);
        this.changed.delete(row.id);
        this.removed.add(row.id);
        this.releaseSlot(row);
      } else {
        const next: Item = {
          ...row,
          count: row.count - taken,
          version: row.version + 1,
        };
        this.rowOps.push({
          kind: "write",
          expectedVersion: row.version,
          item: next,
        });
        this.byId.set(next.id, next);
        this.changed.set(next.id, next);
      }
      this.audits.push({
        kind: "destruction",
        itemId: row.id,
        typeId,
        count: taken,
        reason,
      });
    }
    return remaining === 0;
  }

  /**
   * Adds `count` units of a stackable type: tops up existing stacks in fill
   * order, then opens new stacks in free backpack slots. Returns how many units
   * did not fit, so a sale can bank the remainder instead of failing.
   */
  grantStackable(
    typeId: number,
    count: number,
    reason: CarriedCreationReason,
    attributes: Readonly<Record<string, unknown>> = {},
  ): number {
    const maxCount = this.catalog.require(typeId).maxCount;
    let remaining = count;
    for (const row of this.stackTargets(typeId, attributes)) {
      if (remaining === 0) return 0;
      const added = Math.min(maxCount - row.count, remaining);
      if (added <= 0) continue;
      const next: Item = {
        ...row,
        count: row.count + added,
        version: row.version + 1,
      };
      this.rowOps.push({
        kind: "write",
        expectedVersion: row.version,
        item: next,
      });
      this.byId.set(next.id, next);
      this.changed.set(next.id, next);
      this.audits.push({
        kind: "creation",
        itemId: next.id,
        typeId,
        count: added,
        reason,
      });
      remaining -= added;
    }
    while (remaining > 0) {
      const stack = Math.min(maxCount, remaining);
      if (!this.createRow(typeId, stack, reason, attributes)) return remaining;
      remaining -= stack;
    }
    return 0;
  }

  /** Adds `count` separate rows of a non-stackable type in free slots. */
  grantSingles(
    typeId: number,
    count: number,
    reason: CarriedCreationReason,
    attributes: Readonly<Record<string, unknown>> = {},
  ): boolean {
    for (let index = 0; index < count; index++) {
      if (!this.createRow(typeId, 1, reason, attributes)) return false;
    }
    return true;
  }

  /** The finished memory diff and the DB write to flush behind it. */
  build(): { mutation: ItemMutation; persist: CarriedPersistPlan } {
    return {
      mutation: {
        after: [...this.changed.values()],
        ...(this.removed.size === 0
          ? {}
          : { removedItemIds: [...this.removed] }),
      },
      persist: {
        characterId: this.characterId,
        rowOps: this.rowOps,
        audits: this.audits,
      },
    };
  }

  private createRow(
    typeId: number,
    count: number,
    reason: CarriedCreationReason,
    attributes: Readonly<Record<string, unknown>>,
  ): boolean {
    if (this.byId.size >= MAX_CARRIED_ITEMS) return false;
    const destination = this.takeFreeSlot();
    if (!destination) return false;
    const item: Item = {
      id: randomUUID(),
      typeId,
      count,
      attributes: { ...attributes },
      version: 1,
      location: {
        kind: "container",
        containerId: destination.containerId,
        slot: destination.slot,
      },
    };
    this.rowOps.push({ kind: "insert", item });
    this.byId.set(item.id, item);
    this.changed.set(item.id, item);
    this.audits.push({
      kind: "creation",
      itemId: item.id,
      typeId,
      count,
      reason,
    });
    return true;
  }

  /**
   * Claims the first free slot in backpack fill order. The container view is
   * built on first use so destroys staged beforehand have already freed their
   * slots, matching the DB-first order of paying before receiving.
   */
  private takeFreeSlot(): { containerId: string; slot: number } | null {
    const containers = this.containerViews();
    if (!containers) return null;
    for (const container of containers) {
      for (let slot = 0; slot < container.capacity; slot++) {
        if (container.occupiedSlots.has(slot)) continue;
        container.occupiedSlots.add(slot);
        return { containerId: container.containerId, slot };
      }
    }
    return null;
  }

  private containerViews(): ReadonlyArray<BackpackContainerView> | null {
    if (this.containers === undefined) {
      this.containers = backpackContainers(this.catalog, this.items());
    }
    return this.containers;
  }

  /** Frees a deleted row's slot so a later grant in this draft can reuse it. */
  private releaseSlot(row: Item): void {
    if (!this.containers || row.location.kind !== "container") return;
    const container = this.containers.find(
      (candidate) =>
        candidate.containerId ===
        (row.location.kind === "container" ? row.location.containerId : ""),
    );
    container?.occupiedSlots.delete(row.location.slot);
  }

  /** Stacks of a type that a grant may top up, in backpack fill order. */
  private stackTargets(
    typeId: number,
    attributes: Readonly<Record<string, unknown>>,
  ): ReadonlyArray<Item> {
    const wanted = JSON.stringify(attributes);
    return this.items()
      .filter(
        (item) =>
          item.typeId === typeId &&
          item.location.kind === "container" &&
          !item.seedKey &&
          JSON.stringify(item.attributes) === wanted,
      )
      .sort((left, right) => slotOf(left) - slotOf(right));
  }

  /**
   * Rows a destroy may consume: never equipped, never a parent of another
   * item, and matching the requested attributes when one is given.
   */
  private sellableRows(
    typeId: number,
    attributes?: Readonly<Record<string, unknown>>,
  ): ReadonlyArray<Item> {
    const parentIds = new Set(
      this.items().flatMap((item) =>
        item.location.kind === "container" || item.location.kind === "corpse"
          ? [item.location.containerId]
          : [],
      ),
    );
    const wanted =
      attributes === undefined ? undefined : JSON.stringify(attributes);
    return this.items()
      .filter(
        (item) =>
          item.typeId === typeId &&
          item.location.kind !== "equipment" &&
          !parentIds.has(item.id) &&
          (wanted === undefined
            ? // A bulk sale must never silently vendor a rarity-graded item
              // at the base price; those leave only via market or trade.
              itemRarityOf(item) === undefined
            : JSON.stringify(item.attributes) === wanted),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private weightOf(typeId: number): number {
    return this.catalog.require(typeId).weight;
  }
}

function slotOf(item: Item): number {
  return item.location.kind === "container" ? item.location.slot : 0;
}
