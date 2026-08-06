import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import { canMergeItems } from "./canMergeItems";
import { containerChildren } from "./containerChildren";

export interface ContainerMergeStep {
  readonly source: Item;
  readonly targetSlot: number;
  readonly count: number;
}

/**
 * Picks the next merge that consolidates partial stacks inside one container:
 * the earliest slot that can still absorb some of a later same-type stack.
 * Every step either fills its target to the type's cap or removes the source
 * item, so a sweep that repeats until null terminates.
 */
export function findContainerMergeStep(
  catalog: ItemCatalog,
  items: ReadonlyArray<Item>,
  containerId: string,
): ContainerMergeStep | null {
  const children = containerChildren(items, containerId);
  for (let targetIndex = 0; targetIndex < children.length; targetIndex += 1) {
    const target = children[targetIndex]!;
    const type = catalog.require(target.typeId);
    if (!type.stackable || target.seedKey || target.count >= type.maxCount) {
      continue;
    }
    for (
      let sourceIndex = targetIndex + 1;
      sourceIndex < children.length;
      sourceIndex += 1
    ) {
      const source = children[sourceIndex]!;
      if (source.typeId !== target.typeId) continue;
      const count = Math.min(source.count, type.maxCount - target.count);
      if (count < 1 || !canMergeItems(catalog, source, target, count)) continue;
      return { source, targetSlot: target.location.slot, count };
    }
  }
  return null;
}
