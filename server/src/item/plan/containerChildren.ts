import type { Item } from "../Item";

export type ContainerChildItem = Item & {
  readonly location: Extract<Item["location"], { kind: "container" }>;
};

/** Items directly inside one carried container, in slot order. */
export function containerChildren(
  items: ReadonlyArray<Item>,
  containerId: string,
): ContainerChildItem[] {
  return items
    .filter(
      (item): item is ContainerChildItem =>
        item.location.kind === "container" &&
        item.location.containerId === containerId,
    )
    .sort((a, b) => a.location.slot - b.location.slot);
}
