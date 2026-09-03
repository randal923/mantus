"use client";

import type { ContainerState, InventoryItem } from "@tibia/protocol";
import { ContainerInventorySection } from "./ContainerInventorySection";
import type { ItemDragSource } from "./ItemDragSource";

interface CarriedContainerPanelProps {
  state: ContainerState;
  onActivate(item: InventoryItem): void;
  onSelect?: (item: InventoryItem) => void;
  onDragStart(source: ItemDragSource): void;
  onDragEnd(): void;
  onDrop(destination: InventoryItem, slot: number): void;
  onClose(containerId: string): void;
}

/**
 * Floating window for one open carried container that lives outside the
 * backpack tree — the quiver dressing the shield hand. Docks beside the
 * inventory like a loot window; drags move items like any owned container.
 */
export function CarriedContainerPanel({
  state,
  onActivate,
  onSelect,
  onDragStart,
  onDragEnd,
  onDrop,
  onClose,
}: CarriedContainerPanelProps) {
  return (
    <div className="ui-panel-frame w-80 p-2 font-tibia text-ui-text select-none">
      <ContainerInventorySection
        state={state}
        onActivate={onActivate}
        onSelect={onSelect}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
        onClose={onClose}
      />
    </div>
  );
}
