"use client";

import type {
  ContainerState,
  InventoryItem,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { CloseButton } from "../ui/CloseButton";
import { ItemSlot } from "./ItemSlot";

interface ContainerInventorySectionProps {
  state: ContainerState;
  draggedItem: InventoryItem | null;
  onActivate(item: InventoryItem): void;
  onContextAction?(item: InventoryItem): void;
  onDragStart(item: InventoryItem): void;
  onDragEnd(): void;
  onDrop(item: InventoryItem, destination: InventoryItem): void;
  onClose(containerId: string): void;
}

export function ContainerInventorySection({
  state,
  draggedItem,
  onActivate,
  onContextAction,
  onDragStart,
  onDragEnd,
  onDrop,
  onClose,
}: ContainerInventorySectionProps) {
  const { t } = useAppTranslation();
  const bySlot = new Map(state.items.map((entry) => [entry.slot, entry.item]));

  return (
    <section
      aria-label={state.container.name}
      onDragOver={(event) => {
        if (!draggedItem) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (!draggedItem) return;
        onDrop(draggedItem, state.container);
      }}
      className="rounded-xl border border-ui-gold/15 bg-black/20 p-2.5"
    >
      <header className="mb-2 flex items-center gap-2 border-b border-ui-gold/10 pb-2">
        <h4 className="min-w-0 flex-1 truncate font-display text-xs tracking-wider text-ui-gold uppercase">
          {state.container.name}
        </h4>
        <span className="text-xs text-ui-muted">
          {state.items.length} / {state.capacity}
        </span>
        <CloseButton
          label={t("inventory.closeContainer", {
            name: state.container.name,
          })}
          onClick={() => onClose(state.container.id)}
        />
      </header>
      <div className="grid grid-cols-4 justify-items-center gap-2">
        {Array.from({ length: state.capacity }, (_, slot) => {
          const item = bySlot.get(slot);
          return (
            <ItemSlot
              key={item?.id ?? `empty-${state.container.id}-${slot}`}
              item={item}
              onActivate={item ? () => onActivate(item) : undefined}
              onContextAction={
                item && onContextAction
                  ? () => onContextAction(item)
                  : undefined
              }
              onDragStart={item ? () => onDragStart(item) : undefined}
              onDragEnd={onDragEnd}
            />
          );
        })}
      </div>
    </section>
  );
}
