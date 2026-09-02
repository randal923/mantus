"use client";

import { useRef } from "react";
import type {
  ContainerState,
  InventorySlotEntry,
  ItemContainerDestination,
  OwnCharacterState,
} from "@tibia/protocol";
import type { Equipment, InventoryItem } from "./inventoryTypes";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { CloseButton } from "../ui/CloseButton";
import { SpriteIcon } from "./SpriteIcon";
import { InventoryCharacterStats } from "./InventoryCharacterStats";
import {
  InventoryContainerView,
  type InventoryContainerDropTarget,
} from "./InventoryContainerView";
import type { ItemDragSource } from "./ItemDragSource";

interface InventoryPanelProps {
  characterName: string;
  character?: OwnCharacterState;
  characterStatsOpen?: boolean;
  equipment: Equipment;
  /** Backpack contents; display only — all mutations go through server intents. */
  items: InventorySlotEntry[];
  capacityUsed: number;
  capacityMax: number;
  /** Backpack size in slots; empty slots render as open squares. */
  slotCount?: number;
  containers?: ContainerState[];
  onClose?: () => void;
  onToggleCharacterStats?: () => void;
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

export function InventoryPanel({
  characterName,
  character,
  characterStatsOpen = false,
  equipment,
  items,
  capacityUsed,
  capacityMax,
  slotCount = 0,
  containers = [],
  onClose,
  onToggleCharacterStats,
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
}: InventoryPanelProps) {
  const { t } = useAppTranslation();
  // The container view publishes its drop target here so drops anywhere on
  // the panel land in the visible container without this component
  // subscribing to (and re-rendering on) the container-path state.
  const dropTargetRef = useRef<InventoryContainerDropTarget | null>(null);

  return (
    <section
      aria-label={t("inventory.label", { name: characterName })}
      onDragOver={(event) => {
        if (!dropTargetRef.current) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!dropTargetRef.current) return;
        event.preventDefault();
        dropTargetRef.current.drop();
      }}
      onPointerUp={(event) => {
        if (event.button !== 0 || event.defaultPrevented) return;
        dropTargetRef.current?.drop();
      }}
      className="relative flex h-full w-full justify-end font-tibia text-ui-text select-none"
    >
      <div className="relative flex h-full max-w-full">
        {character && (
          <div
            aria-hidden={!characterStatsOpen}
            className={`relative h-full overflow-hidden transition-[width] duration-300 ease-in-out motion-reduce:transition-none ${
              characterStatsOpen ? "w-96" : "w-0"
            }`}
          >
            <div className="absolute inset-y-0 left-0 w-96">
              <InventoryCharacterStats
                character={character}
                capacityUsed={capacityUsed}
              />
            </div>
          </div>
        )}

        {character && onToggleCharacterStats && (
          <div className="absolute top-4 left-0 z-20 -translate-x-1/2">
            <button
              type="button"
              title={
                characterStatsOpen
                  ? t("inventory.closeCharacterStats")
                  : t("inventory.openCharacterStats")
              }
              aria-label={
                characterStatsOpen
                  ? t("inventory.closeCharacterStats")
                  : t("inventory.openCharacterStats")
              }
              aria-expanded={characterStatsOpen}
              aria-controls="character-stats-panel"
              onClick={onToggleCharacterStats}
              className="ui-button ui-button-secondary flex size-9 items-center justify-center rounded-full border border-ui-gold/35 font-display text-xl text-ui-gold shadow-lg shadow-black/60 outline-none transition-[color,filter] hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ui-gold/60"
            >
              <span
                aria-hidden
                className={`inline-block transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
                  characterStatsOpen ? "rotate-180" : ""
                }`}
              >
                ‹
              </span>
            </button>
          </div>
        )}

        <div
          className={`ui-panel-frame relative isolate flex h-full w-96 shrink-0 flex-col gap-4 overflow-hidden p-4 transition-[border-radius] duration-300 ease-in-out motion-reduce:transition-none ${
            characterStatsOpen ? "rounded-l-none" : ""
          }`}
        >
          <div
            aria-hidden
            className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.045] mix-blend-soft-light"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 -z-10 h-28 bg-radial from-ui-accent/12 to-transparent blur-xl"
          />
          <header className="flex items-center gap-3">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-ui-gold/30 bg-black/40 shadow-inner shadow-black/45">
              <SpriteIcon
                spriteId={equipment.helmet?.spriteId ?? 7837}
                scale={1.4}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs tracking-[0.2em] text-ui-gold uppercase">
                {characterName}
              </div>
              <h2 className="font-display text-2xl tracking-[0.12em] text-ui-text-bright uppercase [text-shadow:0_2px_10px_rgba(0,0,0,0.9)]">
                {t("inventory.title")}
              </h2>
            </div>
            {onClose && (
              <CloseButton
                label={t("inventory.close")}
                onClick={onClose}
                className="self-start"
              />
            )}
          </header>
          <div aria-hidden className="ui-divider" />

          <InventoryContainerView
            equipment={equipment}
            items={items}
            capacityUsed={capacityUsed}
            capacityMax={capacityMax}
            slotCount={slotCount}
            containers={containers}
            dropTargetRef={dropTargetRef}
            onStack={onStack}
            onSort={onSort}
            onEquip={onEquip}
            onUnequip={onUnequip}
            onUseRune={onUseRune}
            onUsePotion={onUsePotion}
            onUseItemWith={onUseItemWith}
            onOpenContainer={onOpenContainer}
            onOpenEquippedContainer={onOpenEquippedContainer}
            onCloseContainer={onCloseContainer}
            onUseItem={onUseItem}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropInContainer={onDropInContainer}
            onDropInEquipment={onDropInEquipment}
          />
        </div>
      </div>
    </section>
  );
}
