"use client";

import { useEffect, useRef, useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { isEditableTarget } from "../../lib/hotkeys/isEditableTarget";
import { getSpellIconArtwork } from "../../lib/combat/getSpellIconArtwork";
import { SpellIcon } from "./SpellIcon";

interface SpellBarSpell {
  id: string;
  name: string;
  manaCost?: number;
  cooldownReadyAt?: number;
  cooldownTotalMs?: number;
  disabled?: boolean;
}

interface SpellBarSlot {
  shortcut: string;
  spell: SpellBarSpell | null;
}

interface SpellBarProps {
  slots: ReadonlyArray<SpellBarSlot>;
  onCast?: (spellId: string) => void;
  /** Opens the assignment modal; empty slots on click, any slot on right-click. */
  onConfigure?: (slotIndex: number) => void;
  hotkeysEnabled?: boolean;
}

export function SpellBar({
  slots,
  onCast,
  onConfigure,
  hotkeysEnabled = true,
}: SpellBarProps) {
  const { t } = useAppTranslation();
  const buttonRefs = useRef(new Map<number, HTMLButtonElement>());
  const [now, setNow] = useState(0);
  const hasCooldown = slots.some(
    (slot) => (slot.spell?.cooldownReadyAt ?? 0) > now,
  );

  useEffect(() => {
    if (!hasCooldown) return;
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [hasCooldown]);

  useEffect(() => {
    if (!hotkeysEnabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      if (isEditableTarget(event.target)) return;
      const index = slots.findIndex(
        ({ shortcut, spell }) =>
          spell !== null && shortcut.toLowerCase() === event.key.toLowerCase(),
      );
      if (index === -1) return;
      const button = buttonRefs.current.get(index);
      if (!button || button.disabled) return;
      event.preventDefault();
      button.click();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkeysEnabled, slots]);

  return (
    <div
      role="toolbar"
      aria-label={t("spells.bar")}
      onContextMenu={(event) => {
        if (!onConfigure) return;
        event.preventDefault();
        onConfigure(0);
      }}
      className="ui-panel-frame pointer-events-auto relative isolate flex max-w-[calc(100vw-2rem)] gap-1.5 overflow-x-auto p-2"
    >
      {slots.map((slot, index) => {
        const spell = slot.spell;
        if (!spell) {
          return (
            <button
              key={index}
              type="button"
              title={t("spells.actionBar.emptySlotHint")}
              aria-label={t("spells.actionBar.emptySlot", {
                shortcut: slot.shortcut,
              })}
              onClick={() => onConfigure?.(index)}
              className="group relative flex size-12 shrink-0 items-center justify-center rounded-md border border-dashed border-ui-stone-light/25 text-ui-muted outline-none transition-[border-color,color] duration-150 hover:border-ui-gold/55 hover:text-ui-gold focus-visible:ring-2 focus-visible:ring-ui-gold/60 sm:size-14"
            >
              <span aria-hidden className="text-lg leading-none opacity-45 group-hover:opacity-90">
                +
              </span>
              <kbd className="absolute top-0.5 left-1 text-[9px] font-bold text-ui-muted">
                {slot.shortcut}
              </kbd>
            </button>
          );
        }
        const iconArtwork = getSpellIconArtwork(spell.id);
        const cooldownTotalMs = Math.max(0, spell.cooldownTotalMs ?? 0);
        const cooldownRemainingMs = Math.min(
          Math.max(0, (spell.cooldownReadyAt ?? 0) - now),
          cooldownTotalMs,
        );
        const cooldownPercent =
          cooldownTotalMs > 0
            ? (cooldownRemainingMs / cooldownTotalMs) * 100
            : 0;

        return (
          <button
            key={index}
            type="button"
            title={`${spell.name} (${slot.shortcut})`}
            aria-label={t("spells.shortcut", {
              name: spell.name,
              shortcut: slot.shortcut,
            })}
            aria-keyshortcuts={slot.shortcut}
            disabled={spell.disabled}
            onClick={() => onCast?.(spell.id)}
            onContextMenu={(event) => {
              if (!onConfigure) return;
              event.preventDefault();
              event.stopPropagation();
              onConfigure(index);
            }}
            ref={(button) => {
              if (button) {
                buttonRefs.current.set(index, button);
                return;
              }
              buttonRefs.current.delete(index);
            }}
            className="ui-button ui-button-secondary group relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ui-stone-light/25 text-ui-text outline-none transition-[border-color,filter,transform] duration-150 hover:-translate-y-px hover:border-ui-gold/55 hover:brightness-110 active:translate-y-px focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:pointer-events-none disabled:opacity-35 sm:size-14"
          >
            {iconArtwork && <SpellIcon {...iconArtwork} />}
            <kbd className="absolute top-0.5 left-1 z-20 text-[9px] font-bold text-ui-muted">
              {slot.shortcut}
            </kbd>
            {spell.manaCost !== undefined && (
              <span className="absolute right-1 bottom-0.5 z-20 text-[9px] font-semibold tabular-nums text-ui-mana-light">
                {spell.manaCost}
              </span>
            )}
            {cooldownPercent > 0 && (
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 z-10 flex items-start justify-center bg-black/75 pt-1 text-xs font-bold tabular-nums text-white backdrop-grayscale"
                style={{ height: `${cooldownPercent}%` }}
              >
                {Math.ceil(cooldownRemainingMs / 1_000)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
