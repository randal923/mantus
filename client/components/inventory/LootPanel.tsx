"use client";

import type { ContainerState, InventoryItem } from "@tibia/protocol";
import { Button } from "../ui/Button";
import { ContainerInventorySection } from "./ContainerInventorySection";
import type { ItemDragSource } from "./ItemDragSource";

interface LootPanelProps {
  state: ContainerState;
  onLootItem(item: InventoryItem): void;
  onOpenContainer(item: InventoryItem): void;
  onQuickLoot(containerId: string): void;
  onDragStart(source: ItemDragSource): void;
  onDragEnd(): void;
  onClose(containerId: string): void;
}

/**
 * Floating window for one open world container (corpse or chest). Items drag
 * out as loot, a contained bag opens in place, and "Loot all" asks the server
 * to sweep the window — what is eligible, what fits, and every reach and
 * ownership rule stay on the server.
 */
export function LootPanel({
  state,
  onLootItem,
  onOpenContainer,
  onQuickLoot,
  onDragStart,
  onDragEnd,
  onClose,
}: LootPanelProps) {
  return (
    <div className="ui-panel-frame w-64 p-2 font-tibia text-ui-text select-none">
      <ContainerInventorySection
        state={state}
        dragSourceKind="loot"
        onActivate={(item) =>
          item.containerCapacity ? onOpenContainer(item) : onLootItem(item)
        }
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDrop={() => undefined}
        onClose={onClose}
      />
      <Button
        size="sm"
        className="mt-2 w-full"
        disabled={state.items.length === 0}
        onClick={() => onQuickLoot(state.container.id)}
      >
        Loot all
      </Button>
    </div>
  );
}
