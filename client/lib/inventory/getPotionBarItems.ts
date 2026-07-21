import type { InventoryItem, InventoryState } from "@tibia/protocol";

export interface PotionBarItem {
  readonly item: InventoryItem;
  readonly count: number;
}

export function getPotionBarItems(
  inventory: InventoryState | null,
): ReadonlyArray<PotionBarItem> {
  if (!inventory) return [];
  const carried = [
    ...Object.values(inventory.equipment).flatMap((item) =>
      item ? [item] : [],
    ),
    ...inventory.items.map((entry) => entry.item),
    ...(inventory.containers ?? []).flatMap((container) =>
      container.items.map((entry) => entry.item),
    ),
  ];
  const grouped = new Map<number, PotionBarItem>();
  for (const item of carried) {
    if (item.useKind !== "potion") continue;
    const current = grouped.get(item.typeId);
    grouped.set(item.typeId, {
      item: current?.item ?? item,
      count: (current?.count ?? 0) + item.count,
    });
  }
  return [...grouped.values()].sort(
    (left, right) => left.item.typeId - right.item.typeId,
  );
}
