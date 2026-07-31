"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  IMBUEMENT_RULES,
  type ImbuementWindowStateMessage,
  type InventoryItem,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { ImbuementApplyPanel } from "./ImbuementApplyPanel";
import { ImbuementClearPanel } from "./ImbuementClearPanel";
import { ImbuementIcon } from "./ImbuementIcon";
import { ImbuementItemPanel } from "./ImbuementItemPanel";
import { ImbuementItemPicker } from "./ImbuementItemPicker";
import { ImbuementListPanel } from "./ImbuementListPanel";
import { ImbuementRailButton } from "./ImbuementRailButton";

interface ImbuementModalProps {
  window: ImbuementWindowStateMessage | null;
  itemName?: string;
  itemSpriteId?: number;
  /** Carried items with imbuement slots, for the "Pick Item" chooser. */
  imbuableItems: ReadonlyArray<InventoryItem>;
  /** Resolves an astral source's sprite; supplied by the caller's catalog. */
  spriteIdOf: (itemTypeId: number) => number | undefined;
  pending: boolean;
  error: string | null;
  onPickItem: (itemId: string) => void;
  onSelectMode: (mode: "item" | "scroll") => void;
  onApply: (slot: number, imbuementId: number) => void;
  onClear: (slot: number) => void;
  onForgeScroll: (imbuementId: number) => void;
  onClose: () => void;
}

/**
 * The imbuement shrine, laid out like Tibia's imbuing window: a mode rail on
 * the left, and a column of three panels — the item and its slots, the tier
 * and imbuement choice, then the action for the selected slot.
 *
 * Every price, material count and eligibility verdict on screen is a server
 * projection; the buttons only send intents.
 */
export function ImbuementModal({
  window: windowState,
  itemName,
  itemSpriteId,
  imbuableItems,
  spriteIdOf,
  pending,
  error,
  onPickItem,
  onSelectMode,
  onApply,
  onClear,
  onForgeScroll,
  onClose,
}: ImbuementModalProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const [picking, setPicking] = useState(false);
  const [slotChoice, setSlotChoice] = useState<number | null>(null);
  const [tierChoice, setTierChoice] = useState<number | null>(null);
  const [imbuementChoice, setImbuementChoice] = useState<number | null>(null);

  const mode = windowState?.mode ?? "item";
  const slots = useMemo(() => windowState?.slots ?? [], [windowState]);
  const options = useMemo(() => windowState?.options ?? [], [windowState]);
  const selectedSlot =
    slotChoice !== null && slots.some((slot) => slot.slot === slotChoice)
      ? slotChoice
      : (slots.find((slot) => slot.imbuementId === null)?.slot ??
        slots[0]?.slot ??
        null);
  const activeSlot = slots.find((slot) => slot.slot === selectedSlot) ?? null;
  const tier =
    tierChoice ?? options.find((option) => option.canApply)?.baseId ?? 1;
  const selectedOption =
    options.find(
      (option) =>
        option.imbuementId === imbuementChoice && option.baseId === tier,
    ) ?? null;
  // Scroll mode has no item, so there is never a slot to clear.
  const clearing =
    mode === "item" && activeSlot !== null && activeSlot.imbuementId !== null;

  const actionPanel =
    clearing && activeSlot ? (
      <ImbuementClearPanel
        slot={activeSlot}
        clearCostGold={windowState?.removeCostGold ?? 0}
        pending={pending}
        onClear={() => onClear(activeSlot.slot)}
      />
    ) : selectedOption ? (
      <ImbuementApplyPanel
        option={selectedOption}
        spriteIdOf={spriteIdOf}
        pending={pending}
        mode={mode}
        onApply={() => {
          if (mode === "scroll") {
            onForgeScroll(selectedOption.imbuementId);
            return;
          }
          if (selectedSlot === null) return;
          onApply(selectedSlot, selectedOption.imbuementId);
        }}
      />
    ) : null;

  return (
    <Modal
      title={t("imbuement.title")}
      size="extra-wide"
      onClose={onClose}
      footer={
        // Modal footers are justify-end; grow so the action panel spans it.
        <div className="flex w-full flex-col gap-3">
          {actionPanel}
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-base tabular-nums text-ui-gold">
              <Image
                src="/assets/cyclopedia/currency/gold.png"
                alt=""
                width={18}
                height={18}
                className="[image-rendering:pixelated]"
              />
              {(windowState?.bankBalance ?? 0).toLocaleString(language)}
            </span>
            <Button onClick={onClose}>{t("imbuement.close")}</Button>
          </div>
        </div>
      }
    >
      {!windowState ? (
        <p className="py-10 text-center text-base text-ui-muted">
          {t("imbuement.loading")}
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex shrink-0 flex-row gap-2 sm:w-28 sm:flex-col">
            <ImbuementRailButton
              label={t("imbuement.pickItem")}
              active={mode === "item"}
              icon={
                itemSpriteId === undefined ? (
                  <ImbuementIcon iconId={0} size={32} />
                ) : (
                  <SpriteIcon spriteId={itemSpriteId} scale={1} />
                )
              }
              onClick={() => {
                onSelectMode("item");
                setPicking(true);
              }}
            />
            <ImbuementRailButton
              label={t("imbuement.blankScroll")}
              active={mode === "scroll"}
              badge={windowState.blankScrollCount}
              disabled={windowState.blankScrollCount === 0}
              icon={<ImbuementIcon iconId={0} size={32} />}
              onClick={() => {
                setPicking(false);
                setImbuementChoice(null);
                onSelectMode("scroll");
              }}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {error && (
              <p
                role="alert"
                className="rounded-md border border-ui-accent/25 bg-ui-accent/10 px-3 py-2 text-base text-ui-accent-light"
              >
                {error}
              </p>
            )}
            {picking && mode === "item" ? (
              <ImbuementItemPicker
                items={imbuableItems}
                onPick={(itemId) => {
                  setPicking(false);
                  setSlotChoice(null);
                  setImbuementChoice(null);
                  onPickItem(itemId);
                }}
                onCancel={() => setPicking(false)}
              />
            ) : (
              <>
                {mode === "item" && (
                  <ImbuementItemPanel
                    window={windowState}
                    itemName={itemName}
                    itemSpriteId={itemSpriteId}
                    selectedSlot={selectedSlot}
                    onSelectSlot={(slot) => {
                      setSlotChoice(slot);
                      setImbuementChoice(null);
                    }}
                    onPickItem={() => setPicking(true)}
                  />
                )}
                {!clearing && (
                  <ImbuementListPanel
                    options={options}
                    tier={tier}
                    onSelectTier={(baseId) => {
                      setTierChoice(baseId);
                      setImbuementChoice(null);
                    }}
                    selectedImbuementId={imbuementChoice}
                    onSelectImbuement={setImbuementChoice}
                    durationSeconds={IMBUEMENT_RULES.durationSeconds}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
