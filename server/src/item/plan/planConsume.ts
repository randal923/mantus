import type { CarriedPlan } from "./CarriedPlan";
import type { Item } from "../Item";

export function planConsume(input: {
  readonly characterId: string;
  readonly items: ReadonlyArray<Item>;
  readonly itemId: string;
  readonly expectedVersion: number;
  readonly count: number;
  readonly reason: "food";
}): CarriedPlan | null {
  const item = input.items.find((candidate) => candidate.id === input.itemId);
  if (
    !item ||
    item.version !== input.expectedVersion ||
    !Number.isInteger(input.count) ||
    input.count < 1 ||
    input.count > item.count
  ) {
    return null;
  }
  const after =
    input.count === item.count
      ? []
      : [
          {
            ...item,
            count: item.count - input.count,
            version: item.version + 1,
          },
        ];
  return {
    mutation: {
      before: item,
      after,
      ...(after.length === 0 ? { removedItemIds: [item.id] } : {}),
    },
    persist: {
      characterId: input.characterId,
      rowOps:
        after.length === 0
          ? [
              {
                kind: "delete",
                itemId: item.id,
                expectedVersion: item.version,
              },
            ]
          : [
              {
                kind: "write",
                expectedVersion: item.version,
                item: after[0]!,
              },
            ],
      audits: [
        {
          kind: "destruction",
          itemId: item.id,
          typeId: item.typeId,
          count: input.count,
          reason: input.reason,
        },
      ],
    },
  };
}
