"use client";

import {
  ACTION_BAR_SLOT_COUNT,
  type InventoryState,
  type PotionActionBar,
  type PotionTargetMode,
} from "@tibia/protocol";
import { useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { getPotionBarItems } from "../../lib/inventory/getPotionBarItems";
import { getEffectivePotionActionBar } from "../../lib/inventory/getEffectivePotionActionBar";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface PotionActionBarModalProps {
  readonly inventory: InventoryState | null;
  readonly potionActionBar: PotionActionBar;
  readonly initialSlot: number;
  readonly onChange: (next: PotionActionBar) => void;
  readonly onClose: () => void;
}

const TARGET_MODES: ReadonlyArray<PotionTargetMode> = [
  "self",
  "attack-target",
  "cursor",
  "crosshair",
];

export function PotionActionBarModal({
  inventory,
  potionActionBar,
  initialSlot,
  onChange,
  onClose,
}: PotionActionBarModalProps) {
  const { t } = useAppTranslation();
  const potions = getPotionBarItems(inventory);
  const [selectedSlot, setSelectedSlot] = useState(() =>
    Math.min(Math.max(initialSlot, 0), ACTION_BAR_SLOT_COUNT - 1),
  );
  const slots = getEffectivePotionActionBar(potionActionBar, potions);
  const selectedMode = slots[selectedSlot]?.targetMode ?? "crosshair";

  const updateSlot = (
    itemTypeId: number | null,
    targetMode = selectedMode,
  ) => {
    const next = [...slots];
    next[selectedSlot] = itemTypeId === null
      ? null
      : { itemTypeId, targetMode };
    onChange(next);
  };

  return (
    <Modal title={t("potions.actionBar.title")} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="rounded-lg border border-ui-gold/15 bg-black/25 px-3 py-2.5 text-xs leading-5 text-ui-muted">
          {t("potions.actionBar.description")}
        </p>

        <div className="flex items-center gap-3">
          <div className="flex flex-1 flex-wrap gap-1.5">
            {slots.map((slot, index) => {
              const potion = slot
                ? potions.find(
                    (candidate) => candidate.item.typeId === slot.itemTypeId,
                  )
                : undefined;
              return (
                <button
                  key={index}
                  type="button"
                  title={t("potions.actionBar.slot", { slot: index + 1 })}
                  aria-pressed={index === selectedSlot}
                  onClick={() => setSelectedSlot(index)}
                  className={`relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                    index === selectedSlot
                      ? "border-ui-gold/80 ring-1 ring-ui-gold/50"
                      : "border-ui-stone-light/25 hover:border-ui-gold/45"
                  } ${slot ? "ui-button ui-button-secondary" : "border-dashed bg-black/25"}`}
                >
                  {potion && <SpriteIcon spriteId={potion.item.spriteId} />}
                  <kbd className="absolute top-0.5 left-1 z-20 text-xs font-bold text-ui-muted">
                    ⇧{index + 1}
                  </kbd>
                </button>
              );
            })}
          </div>
          <Button
            size="sm"
            disabled={slots[selectedSlot] === null}
            onClick={() => updateSlot(null)}
          >
            {t("spells.actionBar.clear")}
          </Button>
        </div>

        <fieldset className="grid grid-cols-2 gap-2 rounded-lg border border-ui-stone-light/15 bg-ui-panel-deep/55 p-3">
          <legend className="px-1 text-xs font-medium text-ui-text-bright">
            {t("potions.actionBar.targetMode")}
          </legend>
          {TARGET_MODES.map((mode) => (
            <label
              key={mode}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-ui-stone-light/15 px-3 py-2 text-sm text-ui-text hover:border-ui-gold/40"
            >
              <input
                type="radio"
                name="potion-target-mode"
                checked={selectedMode === mode}
                onChange={() => {
                  const slot = slots[selectedSlot];
                  if (slot) updateSlot(slot.itemTypeId, mode);
                }}
              />
              {t(`potions.actionBar.mode.${mode}`)}
            </label>
          ))}
        </fieldset>

        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {potions.map(({ item, count }) => {
            const selected = slots[selectedSlot]?.itemTypeId === item.typeId;
            return (
              <li key={item.typeId}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => updateSlot(item.typeId)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left outline-none transition-[border-color,filter] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                    selected
                      ? "border-ui-gold/60 bg-ui-panel-deep/80"
                      : "border-ui-stone-light/15 bg-ui-panel-deep/55 hover:border-ui-gold/40"
                  }`}
                >
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden">
                    <SpriteIcon spriteId={item.spriteId} />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ui-text-bright">
                    {item.name}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-ui-text">
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {potions.length === 0 && (
          <p className="text-sm text-ui-muted">
            {t("potions.actionBar.noPotions")}
          </p>
        )}
      </div>
    </Modal>
  );
}
