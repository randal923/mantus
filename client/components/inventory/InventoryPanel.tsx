"use client";

import type { Equipment, InventoryItem } from "./inventoryTypes";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { CloseButton } from "../ui/CloseButton";
import { CapacityBar } from "./CapacityBar";
import { EquipmentPaperdoll } from "./EquipmentPaperdoll";
import { ItemSlot } from "./ItemSlot";
import { SpriteIcon } from "./SpriteIcon";

const GOLD_COIN_SPRITE = 7384;
const PLATINUM_COIN_SPRITE = 7409;

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
  onClose,
  onStack,
  onSort,
}: InventoryPanelProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const emptySlots = Math.max(0, slotCount - items.length);

  return (
    <section
      aria-label={t("inventory.label", { name: characterName })}
      className="ui-panel-frame relative isolate flex h-full w-full max-w-96 flex-col gap-4 overflow-hidden p-4 font-tibia text-ui-text select-none"
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

      <EquipmentPaperdoll equipment={equipment} />

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
          {items.length} / {slotCount}
        </span>
      </div>

      <div className="ui-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-black/60 bg-black/20 p-2.5 shadow-inner shadow-black/45">
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
