"use client";

import type {
  ContainerState,
  InventorySlotEntry,
  ItemContainerDestination,
  OwnCharacterState,
} from "@tibia/protocol";
import type { Equipment, InventoryItem } from "./inventoryTypes";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { CloseButton } from "../ui/CloseButton";
import { CapacityBar } from "./CapacityBar";
import { EquipmentPaperdoll } from "./EquipmentPaperdoll";
import { ItemSlot } from "./ItemSlot";
import { SpriteIcon } from "./SpriteIcon";
import { InventoryCharacterStats } from "./InventoryCharacterStats";
import { ContainerInventorySection } from "./ContainerInventorySection";
import type { ItemDragSource } from "./ItemDragSource";

const GOLD_COIN_SPRITE = 7384;
const PLATINUM_COIN_SPRITE = 7409;

interface InventoryPanelProps {
  characterName: string;
  character?: OwnCharacterState;
  characterStatsOpen?: boolean;
  equipment: Equipment;
  /** Backpack contents; display only — all mutations go through server intents. */
  items: InventorySlotEntry[];
  gold: number;
  platinum: number;
  capacityUsed: number;
  capacityMax: number;
  /** Backpack size in slots; empty slots render as open squares. */
  slotCount?: number;
  containers?: ContainerState[];
  onClose?: () => void;
  onToggleCharacterStats?: () => void;
  onStack?: () => void;
  onSort?: () => void;
  onEquip?: (item: InventoryItem) => void;
  onUnequip?: (item: InventoryItem, slot: keyof Equipment) => void;
  onUseRune?: (item: InventoryItem) => void;
  onUsePotion?: (item: InventoryItem) => void;
  onUseItemWith?: (item: InventoryItem) => void;
  onOpenContainer?: (item: InventoryItem) => void;
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
  gold,
  platinum,
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
  onCloseContainer,
  onUseItem,
  onDragStart,
  onDragEnd,
  onDropInContainer,
  onDropInEquipment,
}: InventoryPanelProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const bySlot = new Map(items.map((entry) => [entry.slot, entry.item]));
  const visibleSlotCount = slotCount;
  const dropInBackpack = () => {
    if (!equipment.backpack || !onDropInContainer) return;
    onDropInContainer(equipment.backpack, 0, "front");
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
      onOpenContainer(item);
      return;
    }
    if (
      (item.useKind === "read" ||
        item.useKind === "rotate" ||
        item.useKind === "food") &&
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
    <section
      aria-label={t("inventory.label", { name: characterName })}
      onDragOver={(event) => {
        if (!equipment.backpack || !onDropInContainer) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!equipment.backpack || !onDropInContainer) return;
        event.preventDefault();
        dropInBackpack();
      }}
      onPointerUp={(event) => {
        if (event.button !== 0) return;
        dropInBackpack();
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
              <div className="truncate text-[10px] tracking-[0.2em] text-ui-gold uppercase">
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

          <EquipmentPaperdoll
            equipment={equipment}
            onUnequip={onUnequip}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDrop={onDropInEquipment}
          />

          <div className="flex items-center gap-3 rounded-xl border border-ui-gold/10 bg-black/20 p-2.5">
            <div className="grid flex-1 grid-cols-2 gap-2 text-xs text-ui-text">
              <div className="flex items-center gap-1.5 border-r border-ui-gold/10">
                <SpriteIcon spriteId={GOLD_COIN_SPRITE} scale={1.4} />
                <span>
                  <span className="block text-[10px] tracking-wider text-ui-muted uppercase">
                    {t("inventory.gold")}
                  </span>
                  {gold.toLocaleString(language)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <SpriteIcon spriteId={PLATINUM_COIN_SPRITE} scale={1.4} />
                <span>
                  <span className="block text-[10px] tracking-wider text-ui-muted uppercase">
                    {t("inventory.platinum")}
                  </span>
                  {platinum.toLocaleString(language)}
                </span>
              </div>
            </div>
            {(onStack || onSort) && (
              <div className="flex flex-col gap-1.5">
                {onStack && (
                  <Button size="sm" onClick={onStack}>
                    {t("inventory.stack")}
                  </Button>
                )}
                {onSort && (
                  <Button size="sm" onClick={onSort}>
                    {t("inventory.sort")}
                  </Button>
                )}
              </div>
            )}
          </div>

          <CapacityBar used={capacityUsed} max={capacityMax} />

          <div className="flex items-center justify-between border-b border-ui-gold/15 pb-2">
            <h3 className="font-display text-xs tracking-[0.18em] text-ui-gold uppercase">
              {t("inventory.backpack")}
            </h3>
            <span className="text-xs text-ui-muted">
              {items.length} / {visibleSlotCount}
            </span>
          </div>

          <div className="ui-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-black/60 bg-black/20 p-2.5 shadow-inner shadow-black/45">
            <div className="grid grid-cols-4 justify-items-center gap-2">
              {Array.from({ length: visibleSlotCount }, (_, slot) => {
                const item = bySlot.get(slot);
                return (
                  <ItemSlot
                    key={item?.id ?? `empty-${slot}`}
                    item={item}
                    onActivate={item ? () => activateItem(item) : undefined}
                    onDragStart={
                      item && onDragStart
                        ? () =>
                            onDragStart({
                              kind: "owned",
                              item,
                              location: {
                                kind: "container",
                                containerId: equipment.backpack!.id,
                                slot,
                              },
                            })
                        : undefined
                    }
                    onDragEnd={onDragEnd}
                    onDrop={
                      equipment.backpack && onDropInContainer
                        ? dropInBackpack
                        : undefined
                    }
                  />
                );
              })}
            </div>
            {onCloseContainer &&
              containers.map((container) => (
                <ContainerInventorySection
                  key={container.container.id}
                  state={container}
                  onActivate={activateItem}
                  onDragStart={onDragStart ?? (() => undefined)}
                  onDragEnd={onDragEnd ?? (() => undefined)}
                  onDrop={(destination, slot) =>
                    onDropInContainer?.(destination, slot)
                  }
                  onClose={onCloseContainer}
                />
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}
