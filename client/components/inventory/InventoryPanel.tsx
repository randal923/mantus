"use client";

import type { Equipment, InventoryItem } from "./inventoryTypes";
import { Button } from "../ui/Button";
import { CapacityBar } from "./CapacityBar";
import { EquipmentPaperdoll } from "./EquipmentPaperdoll";
import { ItemSlot } from "./ItemSlot";
import { SpriteIcon } from "./SpriteIcon";

const GOLD_COIN_SPRITE = 350;
const PLATINUM_COIN_SPRITE = 342;

interface InventoryPanelProps {
  characterName: string;
  equipment: Equipment;
  /** Backpack contents; display only — all mutations go through server intents. */
  items: InventoryItem[];
  gold: number;
  platinum: number;
  capacityUsed: number;
  capacityMax: number;
  /** Backpack size in slots; empty slots render as open squares. */
  slotCount?: number;
  /** Estimated market value of carried items, shown in the footer. */
  totalValue?: number;
  onClose?: () => void;
  onStack?: () => void;
  onSort?: () => void;
}

export function InventoryPanel({
  characterName,
  equipment,
  items,
  gold,
  platinum,
  capacityUsed,
  capacityMax,
  slotCount = 24,
  totalValue,
  onClose,
  onStack,
  onSort,
}: InventoryPanelProps) {
  const emptySlots = Math.max(0, slotCount - items.length);

  return (
    <section
      aria-label={`${characterName}'s inventory`}
      className="relative isolate flex h-full w-88 flex-col gap-3 overflow-hidden rounded-sm border border-[#3a5054] bg-radial-[at_50%_8%] from-ui-panel-light via-ui-panel via-55% to-ui-panel-deep p-4 font-tibia shadow-[0_4px_20px_rgba(0,0,0,0.7),inset_0_0_0_1px_rgba(0,0,0,0.7)] select-none"
    >
      <div
        aria-hidden
        className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-50 mix-blend-overlay"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-linear-to-b from-[#2c5b5c]/60 to-transparent"
      />
      <header className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-[#3a5054] bg-neutral-950 shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          <SpriteIcon
            spriteId={equipment.helmet?.spriteId ?? 428}
            scale={1.5}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-ui-text/60">
            {characterName}&rsquo;s
          </div>
          <h2 className="font-display text-3xl leading-7 tracking-wide text-ui-text [font-variant:small-caps] [text-shadow:0_2px_4px_rgba(0,0,0,0.8)]">
            Inventory
          </h2>
        </div>
        {onClose && (
          <button
            aria-label="Close inventory"
            onClick={onClose}
            className="flex size-8 items-center justify-center self-start rounded-sm border border-[#1b2126] bg-linear-to-b from-[#c65a54] via-[#9c3434] via-40% to-[#611c1c] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_3px_rgba(0,0,0,0.5)] hover:brightness-115 active:bg-linear-to-t"
          >
            ✕
          </button>
        )}
      </header>
      <div
        aria-hidden
        className="h-px bg-linear-to-r from-transparent via-ui-accent/50 to-transparent"
      />

      <EquipmentPaperdoll equipment={equipment} />

      <div className="flex items-center">
        <div className="flex flex-1 flex-col text-sm font-bold text-ui-text">
          <div className="flex items-center">
            <SpriteIcon spriteId={GOLD_COIN_SPRITE} scale={1.4} />
            {gold.toLocaleString()}
          </div>
          <div className="flex items-center">
            <SpriteIcon spriteId={PLATINUM_COIN_SPRITE} scale={1.4} />
            {platinum.toLocaleString()}
          </div>
        </div>
        {(onStack || onSort) && (
          <div className="flex flex-col">
            {onStack && <Button onClick={onStack}>Stack</Button>}
            {onSort && <Button onClick={onSort}>Sort</Button>}
          </div>
        )}
      </div>

      <CapacityBar used={capacityUsed} max={capacityMax} />

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-linear-to-b from-black/20 to-black/5 p-2 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)] scrollbar-thin">
        <div className="grid grid-cols-4 justify-items-center gap-2">
          {items.map((item) => (
            <ItemSlot key={item.id} item={item} />
          ))}
          {Array.from({ length: emptySlots }, (_, i) => (
            <ItemSlot key={`empty-${i}`} />
          ))}
        </div>
      </div>
    </section>
  );
}
