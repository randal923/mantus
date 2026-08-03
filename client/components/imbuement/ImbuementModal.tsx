"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  IMBUEMENT_RULES,
  type ImbuementWindowStateMessage,
} from "@tibia/protocol";
import { useWikiItems } from "../../hooks/useWikiItems";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { ImbuableItem } from "../../lib/imbuement/collectImbuableItems";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { ImbuementApplyPanel } from "./ImbuementApplyPanel";
import { ImbuementClearPanel } from "./ImbuementClearPanel";
import { ImbuementItemPanel } from "./ImbuementItemPanel";
import { ImbuementListPanel } from "./ImbuementListPanel";
import { ImbuementShrineDialog } from "./ImbuementShrineDialog";

interface ImbuementModalProps {
  window: ImbuementWindowStateMessage | null;
  /** Carried items with imbuement slots, shown directly in the item panel. */
  imbuableItems: ReadonlyArray<ImbuableItem>;
  /** Resolves an astral source's sprite; supplied by the caller's catalog. */
  spriteIdOf: (itemTypeId: number) => number | undefined;
  pending: boolean;
  error: string | null;
  onPickItem: (itemId: string) => void;
  onApply: (slot: number, imbuementId: number) => void;
  onClear: (slot: number) => void;
  onClose: () => void;
}

/**
 * Server-projected imbuement shrine workspace. Its controls only send intents;
 * prices, material counts, slot state, and eligibility all come from the server.
 */
export function ImbuementModal({
  window: windowState,
  imbuableItems,
  spriteIdOf,
  pending,
  error,
  onPickItem,
  onApply,
  onClear,
  onClose,
}: ImbuementModalProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const wikiItems = useWikiItems();
  const [slotChoice, setSlotChoice] = useState<number | null>(null);
  const [tierChoice, setTierChoice] = useState<number | null>(null);
  const [imbuementChoice, setImbuementChoice] = useState<number | null>(null);

  const slots = useMemo(() => windowState?.slots ?? [], [windowState]);
  const options = useMemo(() => windowState?.options ?? [], [windowState]);
  const wikiSpriteIds = useMemo(
    () => new Map(wikiItems.items.map((item) => [item.id, item.spriteId])),
    [wikiItems.items],
  );
  const selectedSlot =
    slotChoice !== null && slots.some((slot) => slot.slot === slotChoice)
      ? slotChoice
      : (slots.find((slot) => slot.imbuementId === null)?.slot ??
        slots[0]?.slot ??
        null);
  const activeSlot = slots.find((slot) => slot.slot === selectedSlot) ?? null;
  const tier =
    tierChoice !== null &&
    options.some((option) => option.baseId === tierChoice)
      ? tierChoice
      : (options.find((option) => option.canApply)?.baseId ??
        options.find((option) => option.blockedReason !== "wrong-category")
          ?.baseId ??
        options[0]?.baseId ??
        1);
  const selectedOption =
    options.find(
      (option) =>
        option.imbuementId === imbuementChoice &&
        option.baseId === tier,
    ) ?? null;
  const clearing = activeSlot !== null && activeSlot.imbuementId !== null;

  return (
    <ImbuementShrineDialog
      title={t("imbuement.title")}
      onClose={onClose}
      footer={
        <div className="ml-auto flex shrink-0 items-center gap-3">
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
      }
    >
      {!windowState ? (
        <p className="py-10 text-center text-base text-ui-muted">
          {t("imbuement.loading")}
        </p>
      ) : (
        <div className="flex min-h-full min-w-0 flex-col gap-2.5">
          {error && (
            <p
              role="alert"
              className="border border-ui-accent/25 bg-ui-accent/10 px-3 py-2 text-base text-ui-accent-light"
            >
              {error}
            </p>
          )}

          <ImbuementItemPanel
            window={windowState}
            items={imbuableItems}
            selectedSlot={selectedSlot}
            onSelectItem={(itemId) => {
              setSlotChoice(null);
              setTierChoice(null);
              setImbuementChoice(null);
              onPickItem(itemId);
            }}
            onSelectSlot={(slot) => {
              setSlotChoice(slot);
              setTierChoice(null);
              setImbuementChoice(null);
            }}
          />

          {clearing && activeSlot ? (
            <ImbuementClearPanel
              slot={activeSlot}
              clearCostGold={windowState.removeCostGold}
              pending={pending}
              onClear={() => onClear(activeSlot.slot)}
            />
          ) : (
            <>
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
              <ImbuementApplyPanel
                option={selectedOption}
                spriteIdOf={(itemTypeId) =>
                  wikiSpriteIds.get(itemTypeId) ?? spriteIdOf(itemTypeId)
                }
                pending={pending}
                onApply={() => {
                  if (!selectedOption) return;
                  if (selectedSlot === null) return;
                  onApply(selectedSlot, selectedOption.imbuementId);
                }}
              />
            </>
          )}
        </div>
      )}
    </ImbuementShrineDialog>
  );
}
