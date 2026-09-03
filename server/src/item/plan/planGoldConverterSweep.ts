import { randomUUID } from "node:crypto";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "@tibia/protocol";
import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import { chargesOf } from "../chargesOf";
import { GOLD_CONVERTER_TYPE_IDS } from "../goldConverterTypeIds";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { ItemLocation } from "../ItemLocation";
import type { CarriedPlan } from "./CarriedPlan";
import { planBackpackPlacement } from "./planBackpackPlacement";

const FULL_STACK = 100;
const REASON = "gold-converter" as const;

export interface GoldConverterSweep {
  readonly plan: CarriedPlan;
  /** Gold coins consumed and platinum coins minted from them. */
  readonly goldSpent: number;
  readonly platinumMinted: number;
  /** Platinum coins consumed and crystal coins minted from them. */
  readonly platinumSpent: number;
  readonly crystalMinted: number;
  readonly chargesSpent: number;
  readonly converterDestroyed: boolean;
}

/**
 * One gold-converter use sweeps every coin the character carries, counted by
 * total rather than by stack: each 100 gold become 1 platinum, then each 100
 * platinum (minted ones included) become 1 crystal, one charge per
 * conversion and as many as the charges allow. Stacks are consolidated with
 * the least churn — a shrinking coin type empties its last stacks first, a
 * growing one tops up its stacks in order before opening a new one in the
 * first free backpack slot (else a slot a spent stack vacated). The whole
 * sweep is one carried plan: memory mutation in-tick, one persist
 * transaction behind it. Null means nothing converted: not a converter,
 * stale revision, no charges, or fewer than 100 gold and platinum.
 */
export function planGoldConverterSweep(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly items: ReadonlyArray<Item>;
  readonly converterId: string;
  readonly converterVersion: number;
}): GoldConverterSweep | null {
  const { catalog, items } = input;
  const converter = items.find(
    (item) =>
      item.id === input.converterId && item.version === input.converterVersion,
  );
  if (!converter || !GOLD_CONVERTER_TYPE_IDS.has(converter.typeId)) return null;
  const charges = chargesOf(converter, catalog.require(converter.typeId).charges);
  if (charges < 1) return null;

  const totalOf = (typeId: number) =>
    items
      .filter((item) => item.typeId === typeId)
      .reduce((sum, item) => sum + item.count, 0);
  const gold = totalOf(GOLD_COIN_TYPE_ID);
  const platinum = totalOf(PLATINUM_COIN_TYPE_ID);
  const platinumMinted = Math.min(Math.floor(gold / FULL_STACK), charges);
  const crystalMinted = Math.min(
    Math.floor((platinum + platinumMinted) / FULL_STACK),
    charges - platinumMinted,
  );
  const chargesSpent = platinumMinted + crystalMinted;
  if (chargesSpent === 0) return null;

  // Working copy of the carried rows: after-states by id, removals, inserts.
  const after = new Map<string, Item>();
  const removed = new Set<string>();
  const inserted: Item[] = [];
  const vacated: ItemLocation[] = [];
  const current = () =>
    items
      .filter((item) => !removed.has(item.id))
      .map((item) => after.get(item.id) ?? item)
      .concat(inserted);

  const take = (typeId: number, amount: number): void => {
    let remaining = amount;
    const stacks = items.filter((item) => item.typeId === typeId).reverse();
    for (const stack of stacks) {
      if (remaining === 0) break;
      const live = after.get(stack.id) ?? stack;
      if (remaining >= live.count) {
        removed.add(stack.id);
        after.delete(stack.id);
        vacated.push(stack.location);
        remaining -= live.count;
      } else {
        after.set(stack.id, {
          ...live,
          count: live.count - remaining,
          version: stack.version + 1,
        });
        remaining = 0;
      }
    }
  };
  const give = (typeId: number, amount: number): boolean => {
    let remaining = amount;
    for (const stack of items.filter((item) => item.typeId === typeId)) {
      if (remaining === 0) break;
      const live = after.get(stack.id) ?? stack;
      const room = FULL_STACK - live.count;
      if (room <= 0) continue;
      const added = Math.min(room, remaining);
      after.set(stack.id, {
        ...live,
        count: live.count + added,
        version: stack.version + 1,
      });
      remaining -= added;
    }
    while (remaining > 0) {
      const count = Math.min(FULL_STACK, remaining);
      const fresh: Item = {
        id: randomUUID(),
        typeId,
        count,
        attributes: {},
        version: 1,
        location: { kind: "container", containerId: "", slot: 0 },
      };
      const placement = planBackpackPlacement({
        catalog,
        carried: current(),
        item: fresh,
        subtree: [fresh],
      });
      const location = placement?.mergeTarget
        ? null
        : (placement?.location ?? vacated.shift() ?? null);
      if (!location) return false;
      inserted.push({ ...fresh, location });
      remaining -= count;
    }
    return true;
  };

  take(GOLD_COIN_TYPE_ID, platinumMinted * FULL_STACK);
  const platinumNet = platinumMinted - crystalMinted * FULL_STACK;
  if (platinumNet < 0) take(PLATINUM_COIN_TYPE_ID, -platinumNet);
  else if (platinumNet > 0 && !give(PLATINUM_COIN_TYPE_ID, platinumNet)) {
    return null;
  }
  if (crystalMinted > 0 && !give(CRYSTAL_COIN_TYPE_ID, crystalMinted)) {
    return null;
  }

  const chargesLeft = charges - chargesSpent;
  const converterAfter: Item | null =
    chargesLeft === 0
      ? null
      : {
          ...converter,
          attributes: { ...converter.attributes, charges: chargesLeft },
          version: converter.version + 1,
        };

  const rowOps: CarriedPersistRowOp[] = [];
  const audits: CarriedPersistAudit[] = [];
  for (const id of removed) {
    const before = items.find((item) => item.id === id)!;
    rowOps.push({ kind: "delete", itemId: id, expectedVersion: before.version });
    audits.push({
      kind: "destruction",
      itemId: id,
      typeId: before.typeId,
      count: before.count,
      reason: REASON,
    });
  }
  for (const [id, item] of after) {
    const before = items.find((candidate) => candidate.id === id)!;
    rowOps.push({ kind: "write", expectedVersion: before.version, item });
    const delta = item.count - before.count;
    audits.push(
      delta < 0
        ? { kind: "destruction", itemId: id, typeId: item.typeId, count: -delta, reason: REASON }
        : { kind: "creation", itemId: id, typeId: item.typeId, count: delta, reason: REASON },
    );
  }
  if (converterAfter) {
    rowOps.push({ kind: "write", expectedVersion: converter.version, item: converterAfter });
  } else {
    rowOps.push({ kind: "delete", itemId: converter.id, expectedVersion: converter.version });
    audits.push({
      kind: "destruction",
      itemId: converter.id,
      typeId: converter.typeId,
      count: 1,
      reason: REASON,
    });
  }
  for (const item of inserted) {
    rowOps.push({ kind: "insert", item });
    audits.push({
      kind: "creation",
      itemId: item.id,
      typeId: item.typeId,
      count: item.count,
      reason: REASON,
    });
  }

  return {
    plan: {
      mutation: {
        before: converter,
        after: [
          ...(converterAfter ? [converterAfter] : []),
          ...after.values(),
          ...inserted,
        ],
        removedItemIds: [...removed, ...(converterAfter ? [] : [converter.id])],
      },
      persist: { characterId: input.characterId, rowOps, audits },
    },
    goldSpent: platinumMinted * FULL_STACK,
    platinumMinted,
    platinumSpent: crystalMinted * FULL_STACK,
    crystalMinted,
    chargesSpent,
    converterDestroyed: converterAfter === null,
  };
}
