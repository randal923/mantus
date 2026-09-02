"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  MAX_CONTAINER_CAPACITY,
  type ContainerState,
  type InventorySlotEntry,
  type ItemContainerDestination,
} from "@tibia/protocol";
import type { Equipment, InventoryItem } from "./inventoryTypes";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { CapacityBar } from "./CapacityBar";
import { EquipmentPaperdoll } from "./EquipmentPaperdoll";
import { ItemSlot } from "./ItemSlot";
import type { ItemDragSource } from "./ItemDragSource";
import { BOUND_ITEM_TYPE_IDS } from "../../lib/inventory/boundItemTypeIds";

export interface InventoryContainerDropTarget {
  drop(): void;
}

const COLUMNS = 4;

interface InventoryContainerViewProps {
  equipment: Equipment;
  /** Backpack contents; display only — all mutations go through server intents. */
  items: InventorySlotEntry[];
  capacityUsed: number;
  capacityMax: number;
  /** Backpack size in slots; empty slots render as open squares. */
  slotCount: number;
  containers: ContainerState[];
  /**
   * Published drop target for the panel-level drag handlers. Kept current via
   * effect so the panel can accept drops anywhere without subscribing to the
   * container-path state that lives here.
   */
  dropTargetRef: RefObject<InventoryContainerDropTarget | null>;
  onStack?: (containerId: string) => void;
  onSort?: (containerId: string) => void;
  onEquip?: (item: InventoryItem) => void;
  onUnequip?: (item: InventoryItem, slot: keyof Equipment) => void;
  onUseRune?: (item: InventoryItem) => void;
  onUsePotion?: (item: InventoryItem) => void;
  onUseItemWith?: (item: InventoryItem) => void;
  onOpenContainer?: (item: InventoryItem) => void;
  /** Opens a container dressing a gear slot (the quiver) in its own window. */
  onOpenEquippedContainer?: (item: InventoryItem) => void;
  onCloseContainer?: (containerId: string) => void;
  onUseItem?: (item: InventoryItem) => void;
  onDragStart?: (source: ItemDragSource) => void;
  onDragEnd?: () => void;
  onDropInContainer?: (
    destination: InventoryItem,
    slot: number,
    placement?: ItemContainerDestination["placement"],
  ) => void;
  onDropInEquipment?: (slot: keyof Equipment) => void;
}

export function InventoryContainerView({
  equipment,
  items,
  capacityUsed,
  capacityMax,
  slotCount,
  containers,
  dropTargetRef,
  onStack,
  onSort,
  onEquip,
  onUnequip,
  onUseRune,
  onUsePotion,
  onUseItemWith,
  onOpenContainer,
  onOpenEquippedContainer,
  onCloseContainer,
  onUseItem,
  onDragStart,
  onDragEnd,
  onDropInContainer,
  onDropInEquipment,
}: InventoryContainerViewProps) {
  const { t } = useAppTranslation();
  const [containerPath, setContainerPath] = useState<InventoryItem[]>([]);
  const requestedContainer = containerPath[containerPath.length - 1];
  const viewedContainer = containers.find(
    (container) => container.container.id === requestedContainer?.id,
  );
  const visibleContainer = requestedContainer
    ? (viewedContainer?.container ?? requestedContainer)
    : equipment.backpack;
  const dropContainer = requestedContainer
    ? viewedContainer?.container
    : equipment.backpack;
  const visibleItems = requestedContainer
    ? (viewedContainer?.items ?? [])
    : items;
  const visibleSlotCount = requestedContainer
    ? (viewedContainer?.capacity ?? requestedContainer.containerCapacity ?? 0)
    : slotCount;
  const bySlot = new Map(
    visibleItems.map((entry) => [entry.slot, entry.item]),
  );
  // The bound-items root is view-only: its direct children never drag out and
  // nothing drops in. The server enforces both; hiding the affordances here
  // keeps the window honest. Containers *inside* it (the loot pouch) are
  // ordinary windows.
  const boundRootInView =
    equipment.bound !== undefined &&
    requestedContainer?.id === equipment.bound.id;
  // Slot-unlimited containers (the bound trunk, the item pouch) render the
  // rows the contents need plus one fully open row — never the full 500-slot
  // grid. The trailing open row is what makes them read as infinite; in the
  // bound root its slots take no drops but still draw open.
  const unlimited = visibleSlotCount >= MAX_CONTAINER_CAPACITY;
  const usedSlots = visibleItems.reduce(
    (highest, entry) => Math.max(highest, entry.slot + 1),
    0,
  );
  const gridSlotCount = unlimited
    ? Math.min(
        visibleSlotCount,
        (Math.ceil(usedSlots / COLUMNS) + 1) * COLUMNS,
      )
    : visibleSlotCount;
  const dropInVisibleContainer = () => {
    if (!dropContainer || !onDropInContainer || boundRootInView) return;
    onDropInContainer(dropContainer, 0, "front");
  };
  useEffect(() => {
    dropTargetRef.current =
      dropContainer && onDropInContainer && !boundRootInView
        ? { drop: dropInVisibleContainer }
        : null;
  });
  useEffect(
    () => () => {
      dropTargetRef.current = null;
    },
    [dropTargetRef],
  );
  const dropInEquippedBackpack = () => {
    if (!equipment.backpack || !onDropInContainer) return;
    onDropInContainer(equipment.backpack, 0, "front");
  };
  const openContainer = (item: InventoryItem) => {
    if (!onOpenContainer) return;
    setContainerPath((current) => [...current, item]);
    onOpenContainer(item);
  };
  const openEquippedBackpack = () => {
    setContainerPath([]);
    for (let index = containerPath.length - 1; index >= 0; index -= 1) {
      onCloseContainer?.(containerPath[index]!.id);
    }
  };
  const openBoundContainer = () => {
    const bound = equipment.bound;
    if (!bound || requestedContainer?.id === bound.id) return;
    openContainer(bound);
  };
  const goBack = () => {
    if (!requestedContainer) return;
    setContainerPath((current) => current.slice(0, -1));
    onCloseContainer?.(requestedContainer.id);
  };
  const activateItem = (item: InventoryItem) => {
    if (item.useKind === "rune" && onUseRune) {
      onUseRune(item);
      return;
    }
    if (item.useKind === "potion" && onUsePotion) {
      onUsePotion(item);
      return;
    }
    if (item.useKind === "useWith" && onUseItemWith) {
      onUseItemWith(item);
      return;
    }
    if (item.useKind === "container" && onOpenContainer) {
      openContainer(item);
      return;
    }
    if (
      (item.useKind === "read" ||
        item.useKind === "rotate" ||
        item.useKind === "food" ||
        item.useKind === "activate") &&
      onUseItem
    ) {
      onUseItem(item);
      return;
    }
    if (
      item.equipmentSlot &&
      item.equipmentSlot !== "backpack" &&
      onEquip
    ) {
      onEquip(item);
    }
  };

  return (
    <>
      <EquipmentPaperdoll
        equipment={equipment}
        onUnequip={onUnequip}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDrop={onDropInEquipment}
        onDropInBackpack={dropInEquippedBackpack}
        onOpenBackpack={openEquippedBackpack}
        onOpenContainer={onOpenEquippedContainer}
        onOpenBound={openBoundContainer}
        boundOpen={boundRootInView}
      />

      {/* Keyed to the visible container, not the confirmed drop target: the
          confirmed container is briefly absent after every open, and letting
          this row unmount for that frame shifts the capacity bar around. */}
      {(onStack || onSort) && visibleContainer && (
        <div className="flex justify-end gap-2">
          {onStack && (
            <Button size="sm" onClick={() => onStack(visibleContainer.id)}>
              {t("inventory.stack")}
            </Button>
          )}
          {onSort && (
            <Button size="sm" onClick={() => onSort(visibleContainer.id)}>
              {t("inventory.sort")}
            </Button>
          )}
        </div>
      )}

      <CapacityBar used={capacityUsed} max={capacityMax} />

      <div className="flex items-center gap-2 border-b border-ui-gold/15 pb-2">
        {requestedContainer && (
          <Button size="sm" onClick={goBack}>
            ‹ {t("common.back")}
          </Button>
        )}
        <h3 className="min-w-0 flex-1 truncate font-display text-xs tracking-[0.18em] text-ui-gold uppercase">
          {visibleContainer?.name ?? t("inventory.backpack")}
        </h3>
        <span className="text-xs text-ui-muted">
          {visibleItems.length} / {unlimited ? "∞" : visibleSlotCount}
        </span>
      </div>

      <div className="ui-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-black/60 bg-black/20 p-2.5 shadow-inner shadow-black/45">
        <div className="grid grid-cols-4 justify-items-center gap-2">
          {Array.from({ length: gridSlotCount }, (_, slot) => {
            const item = bySlot.get(slot);
            return (
              <ItemSlot
                key={item?.id ?? `empty-${slot}`}
                item={item}
                drawOpen={boundRootInView}
                onActivate={item ? () => activateItem(item) : undefined}
                onDragStart={
                  item &&
                  dropContainer &&
                  onDragStart &&
                  // In the bound root only the bound item types (pouch,
                  // seller) are pinned; store deliveries drag out freely.
                  !(boundRootInView && BOUND_ITEM_TYPE_IDS.has(item.typeId))
                    ? () =>
                        onDragStart({
                          kind: "owned",
                          item,
                          location: {
                            kind: "container",
                            containerId: dropContainer.id,
                            slot,
                          },
                        })
                    : undefined
                }
                onDragEnd={onDragEnd}
                onDrop={
                  dropContainer && onDropInContainer && !boundRootInView
                    ? item?.useKind === "container"
                      ? () => onDropInContainer(item, 0, "front")
                      : dropInVisibleContainer
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
