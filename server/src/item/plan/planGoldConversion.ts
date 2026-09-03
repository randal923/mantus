import { randomUUID } from "node:crypto";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "@tibia/protocol";
import { carriedWeight } from "../../depot/carriedWeight";
import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import { chargesOf } from "../chargesOf";
import { GOLD_CONVERTER_TYPE_IDS } from "../goldConverterTypeIds";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { CarriedPlan } from "./CarriedPlan";
import { planBackpackPlacement } from "./planBackpackPlacement";

const FULL_STACK = 100;
const REASON = "gold-converter" as const;

/**
 * Canary gold_converter.lua's coin table: a full stack of a coin steps up to
 * one of the next (`changeTo`); any other stack of a higher coin breaks one
 * of them down into a full stack of the lower (`changeBack`).
 */
const CONVERSIONS: ReadonlyMap<
  number,
  { readonly changeTo?: number; readonly changeBack?: number }
> = new Map([
  [GOLD_COIN_TYPE_ID, { changeTo: PLATINUM_COIN_TYPE_ID }],
  [
    PLATINUM_COIN_TYPE_ID,
    { changeBack: GOLD_COIN_TYPE_ID, changeTo: CRYSTAL_COIN_TYPE_ID },
  ],
  [CRYSTAL_COIN_TYPE_ID, { changeBack: PLATINUM_COIN_TYPE_ID }],
]);

/**
 * One gold-converter use on a carried coin stack, as a single carried plan:
 * the stack loses its units, the converted coins appear (topping up a partial
 * stack first, else in the first free backpack slot, else in the slot the
 * spent stack vacated) and the converter burns one charge — its last one
 * destroys it, as Canary's `item:remove()` does. Every reference is resolved
 * against the live cache at the claimed revision, so a replayed or racing
 * intent finds a stale version and plans nothing (charter rules 2, 4).
 * Null rejects the use: wrong items, an empty converter, a stack no rule
 * applies to, or a break-down the character cannot carry.
 */
export function planGoldConversion(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly items: ReadonlyArray<Item>;
  readonly capacityMax: number;
  readonly converterId: string;
  readonly converterVersion: number;
  readonly targetId: string;
  readonly targetVersion: number;
}): CarriedPlan | null {
  const { catalog, items } = input;
  const converter = items.find(
    (item) =>
      item.id === input.converterId && item.version === input.converterVersion,
  );
  if (!converter || !GOLD_CONVERTER_TYPE_IDS.has(converter.typeId)) return null;
  const target = items.find(
    (item) =>
      item.id === input.targetId && item.version === input.targetVersion,
  );
  if (!target || target.id === converter.id) return null;
  const coin = CONVERSIONS.get(target.typeId);
  if (!coin) return null;
  const charges = chargesOf(converter, catalog.require(converter.typeId).charges);
  if (charges < 1) return null;

  let spent: number;
  let createdTypeId: number;
  let createdCount: number;
  if (coin.changeTo !== undefined && target.count === FULL_STACK) {
    spent = FULL_STACK;
    createdTypeId = coin.changeTo;
    createdCount = 1;
  } else if (coin.changeBack !== undefined) {
    spent = 1;
    createdTypeId = coin.changeBack;
    createdCount = FULL_STACK;
  } else {
    return null;
  }

  const targetAfter: Item | null =
    target.count === spent
      ? null
      : { ...target, count: target.count - spent, version: target.version + 1 };
  const chargesLeft = charges - 1;
  const converterAfter: Item | null =
    chargesLeft === 0
      ? null
      : {
          ...converter,
          attributes: { ...converter.attributes, charges: chargesLeft },
          version: converter.version + 1,
        };

  // The coins land where a picked-up item would, judged against the
  // inventory as it stands once the spent stack and converter are gone.
  const remaining = items
    .filter((item) => item.id !== target.id && item.id !== converter.id)
    .concat(targetAfter ? [targetAfter] : [], converterAfter ? [converterAfter] : []);
  const created: Item = {
    id: randomUUID(),
    typeId: createdTypeId,
    count: createdCount,
    attributes: {},
    version: 1,
    location: target.location,
  };
  const placement = planBackpackPlacement({
    catalog,
    carried: remaining,
    item: created,
    subtree: [created],
  });
  // Without room the coins may still take the slot a whole spent stack left
  // behind; a break-down that leaves the stack in place has nowhere to go.
  if (!placement && targetAfter) return null;
  const mergeTarget = placement?.mergeTarget;
  const createdAfter: Item = mergeTarget
    ? {
        ...mergeTarget,
        count: mergeTarget.count + createdCount,
        version: mergeTarget.version + 1,
      }
    : placement
      ? { ...created, location: placement.location }
      : { ...created, location: target.location };
  const after = remaining
    .filter((item) => item.id !== createdAfter.id)
    .concat([createdAfter]);
  if (carriedWeight(catalog, after) > input.capacityMax * 100) return null;

  const rowOps: CarriedPersistRowOp[] = [
    targetAfter
      ? { kind: "write", expectedVersion: target.version, item: targetAfter }
      : { kind: "delete", itemId: target.id, expectedVersion: target.version },
    converterAfter
      ? {
          kind: "write",
          expectedVersion: converter.version,
          item: converterAfter,
        }
      : {
          kind: "delete",
          itemId: converter.id,
          expectedVersion: converter.version,
        },
    mergeTarget
      ? { kind: "write", expectedVersion: mergeTarget.version, item: createdAfter }
      : { kind: "insert", item: createdAfter },
  ];
  const audits: CarriedPersistAudit[] = [
    {
      kind: "destruction",
      itemId: target.id,
      typeId: target.typeId,
      count: spent,
      reason: REASON,
    },
    {
      kind: "creation",
      itemId: createdAfter.id,
      typeId: createdTypeId,
      count: createdCount,
      reason: REASON,
    },
    ...(converterAfter
      ? []
      : [
          {
            kind: "destruction" as const,
            itemId: converter.id,
            typeId: converter.typeId,
            count: 1,
            reason: REASON,
          },
        ]),
  ];
  return {
    mutation: {
      before: converter,
      after: [
        ...(converterAfter ? [converterAfter] : []),
        ...(targetAfter ? [targetAfter] : []),
        createdAfter,
      ],
      removedItemIds: [
        ...(targetAfter ? [] : [target.id]),
        ...(converterAfter ? [] : [converter.id]),
      ],
    },
    persist: { characterId: input.characterId, rowOps, audits },
  };
}
