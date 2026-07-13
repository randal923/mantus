"use client";

import type { Equipment, InventoryItem } from "./inventoryTypes";
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

const PILL_BUTTON_CLASS =
  "rounded-full border-2 border-ui-gold bg-linear-to-b from-[#4d5878] to-[#272e47] px-5 py-0.5 text-sm font-bold text-ui-gold shadow-[0_2px_3px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.25)] hover:brightness-125 active:translate-y-px";

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
      className="flex h-full w-88 flex-col gap-3 rounded-xl border-4 border-[#332c24] bg-radial-[at_50%_8%] from-ui-parchment-light via-ui-parchment via-55% to-ui-parchment-deep p-4 font-serif shadow-[0_4px_16px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.4)] select-none"
    >
      <header className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full border-4 border-[#4b463f] bg-neutral-900 shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          <SpriteIcon spriteId={equipment.helmet?.spriteId ?? 428} scale={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-ui-ink/70">{characterName}&rsquo;s</div>
          <h2 className="text-3xl leading-7 font-bold text-ui-ink">Inventory</h2>
        </div>
        {onClose && (
          <button
            aria-label="Close inventory"
            onClick={onClose}
            className="flex size-8 items-center justify-center self-start rounded-full border-2 border-white/80 bg-radial-[at_35%_30%] from-[#d5564a] to-[#8c1f1f] font-bold text-white shadow-[0_2px_3px_rgba(0,0,0,0.4)] hover:brightness-115"
          >
            ✕
          </button>
        )}
      </header>

      <EquipmentPaperdoll equipment={equipment} />

      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col gap-1 text-sm font-bold text-ui-ink">
          <div className="flex items-center gap-2">
            <SpriteIcon spriteId={GOLD_COIN_SPRITE} scale={1} />
            {gold.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <SpriteIcon spriteId={PLATINUM_COIN_SPRITE} scale={1} />
            {platinum.toLocaleString()}
          </div>
        </div>
        {(onStack || onSort) && (
          <div className="flex flex-col gap-1.5">
            {onStack && (
              <button onClick={onStack} className={PILL_BUTTON_CLASS}>
                Stack
              </button>
            )}
            {onSort && (
              <button onClick={onSort} className={PILL_BUTTON_CLASS}>
                Sort
              </button>
            )}
          </div>
        )}
      </div>

      <CapacityBar used={capacityUsed} max={capacityMax} />

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-linear-to-b from-black/20 to-black/5 p-2 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)] [scrollbar-width:thin]">
        <div className="grid grid-cols-4 justify-items-center gap-2">
          {items.map((item) => (
            <ItemSlot key={item.id} item={item} />
          ))}
          {Array.from({ length: emptySlots }, (_, i) => (
            <ItemSlot key={`empty-${i}`} />
          ))}
        </div>
      </div>

      {totalValue !== undefined && (
        <footer className="flex items-center gap-1.5 text-sm font-bold text-ui-ink">
          <SpriteIcon spriteId={GOLD_COIN_SPRITE} scale={1} />
          {totalValue.toLocaleString()}
        </footer>
      )}
    </section>
  );
}
