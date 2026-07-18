"use client";

import type { ContainerState, InventoryItem } from "@tibia/protocol";
import { ContainerInventorySection } from "./ContainerInventorySection";
import type { ItemDragSource } from "./ItemDragSource";

interface LootPanelProps {
  state: ContainerState;
  onLootItem(item: InventoryItem): void;
  onDragStart(source: ItemDragSource): void;
  onDragEnd(): void;
  onClose(containerId: string): void;
}

/** Floating window for an open world container (corpse); items drag out as loot. */
export function LootPanel({
  state,
  onLootItem,
  onDragStart,
  onDragEnd,
  onClose,
}: LootPanelProps) {
  return (
    <div className="ui-panel-frame w-64 p-2 font-tibia text-ui-text select-none">
      <ContainerInventorySection
        state={state}
        dragSourceKind="loot"
        onActivate={onLootItem}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDrop={() => undefined}
        onClose={onClose}
      />
    </div>
  );
}
