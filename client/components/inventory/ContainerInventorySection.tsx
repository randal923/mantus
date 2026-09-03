"use client";

import {
  MAX_CONTAINER_CAPACITY,
  type ContainerState,
  type InventoryItem,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { CloseButton } from "../ui/CloseButton";
import { ItemSlot } from "./ItemSlot";
import type { ItemDragSource } from "./ItemDragSource";

const COLUMNS = 4;

interface ContainerInventorySectionProps {
  state: ContainerState;
  /** "loot" marks a world container (corpse): drags loot instead of moving. */
  dragSourceKind?: "owned" | "loot";
  /** Render only the rows the contents need, for windows that take no drops. */
  fitContents?: boolean;
  onActivate(item: InventoryItem): void;
  /** Set while a use-with awaits its target: a left click on an item picks it. */
  onSelect?: (item: InventoryItem) => void;
  onDragStart(source: ItemDragSource): void;
  onDragEnd(): void;
  onDrop(destination: InventoryItem, slot: number): void;
  onClose(containerId: string): void;
}

export function ContainerInventorySection({
  state,
  dragSourceKind = "owned",
  fitContents = false,
  onActivate,
  onSelect,
  onDragStart,
  onDragEnd,
  onDrop,
  onClose,
}: ContainerInventorySectionProps) {
  const { t } = useAppTranslation();
  const bySlot = new Map(state.items.map((entry) => [entry.slot, entry.item]));
  const usedSlots = state.items.reduce(
    (highest, entry) => Math.max(highest, entry.slot + 1),
    0,
  );
  const rows = Math.max(Math.ceil(usedSlots / COLUMNS), 1);
  // Slot-unlimited containers (the item pouch) render only the rows the
  // contents need plus one spare row of drop targets, never the full grid.
  const unlimited = state.capacity >= MAX_CONTAINER_CAPACITY;
  const slotCount = fitContents
    ? Math.min(state.capacity, rows * COLUMNS)
    : unlimited
      ? Math.min(state.capacity, Math.ceil((usedSlots + 1) / COLUMNS) * COLUMNS)
      : state.capacity;

  return (
    <section
      aria-label={state.container.name}
      className="rounded-xl border border-ui-gold/15 bg-black/20 p-2.5"
    >
      <header className="mb-2 flex items-center gap-2 border-b border-ui-gold/10 pb-2">
        <h4 className="min-w-0 flex-1 truncate font-display text-xs tracking-wider text-ui-gold uppercase">
          {state.container.name}
        </h4>
        <span className="text-xs text-ui-muted">
          {state.items.length} / {unlimited ? "∞" : state.capacity}
        </span>
        <CloseButton
          label={t("inventory.closeContainer", {
            name: state.container.name,
          })}
          onClick={() => onClose(state.container.id)}
        />
      </header>
      <div className="grid grid-cols-4 justify-items-center gap-2">
        {Array.from({ length: slotCount }, (_, slot) => {
          const item = bySlot.get(slot);
          return (
            <ItemSlot
              key={item?.id ?? `empty-${state.container.id}-${slot}`}
              item={item}
              onActivate={item ? () => onActivate(item) : undefined}
              onSelect={item && onSelect ? () => onSelect(item) : undefined}
              onDragStart={
                item
                  ? () =>
                      onDragStart(
                        dragSourceKind === "loot"
                          ? {
                              kind: "loot",
                              item,
                              containerId: state.container.id,
                            }
                          : {
                              kind: "owned",
                              item,
                              location: {
                                kind: "container",
                                containerId: state.container.id,
                                slot,
                              },
                            },
                      )
                  : undefined
              }
              onDragEnd={onDragEnd}
              onDrop={() => onDrop(state.container, slot)}
            />
          );
        })}
      </div>
    </section>
  );
}
