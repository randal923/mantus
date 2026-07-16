"use client";

import { useEffect, useRef, useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { isEditableTarget } from "../../lib/hotkeys/isEditableTarget";
import { EffectArtwork } from "./EffectArtwork";
import { SPELL_ARTWORK_BY_EFFECT } from "./spellArtwork";

interface SpellBarSpell {
  id: string;
  name: string;
  effectId: number;
  glyph: string;
  shortcut: string;
  manaCost?: number;
  cooldownReadyAt?: number;
  cooldownTotalMs?: number;
  disabled?: boolean;
}

interface SpellBarProps {
  spells: ReadonlyArray<SpellBarSpell>;
  onCast?: (spellId: string) => void;
  hotkeysEnabled?: boolean;
}

export function SpellBar({
  spells,
  onCast,
  hotkeysEnabled = true,
}: SpellBarProps) {
  const { t } = useAppTranslation();
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [now, setNow] = useState(0);
  const hasCooldown = spells.some(
    (spell) => (spell.cooldownReadyAt ?? 0) > now,
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
      const spell = spells.find(
        ({ shortcut }) => shortcut.toLowerCase() === event.key.toLowerCase(),
      );
      if (!spell) return;
      const button = buttonRefs.current.get(spell.id);
      if (!button || button.disabled) return;
      event.preventDefault();
      button.click();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkeysEnabled, spells]);

  return (
    <div
      role="toolbar"
      aria-label={t("spells.bar")}
      className="ui-panel-frame pointer-events-auto relative isolate flex max-w-[calc(100vw-2rem)] gap-1.5 overflow-x-auto p-2"
    >
      {spells.map((spell) => {
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
            key={spell.id}
            type="button"
            title={`${spell.name} (${spell.shortcut})`}
            aria-label={t("spells.shortcut", {
              name: spell.name,
              shortcut: spell.shortcut,
            })}
            aria-keyshortcuts={spell.shortcut}
            disabled={spell.disabled}
            onClick={() => onCast?.(spell.id)}
            ref={(button) => {
              if (button) {
                buttonRefs.current.set(spell.id, button);
                return;
              }
              buttonRefs.current.delete(spell.id);
            }}
            className="ui-button ui-button-secondary group relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ui-stone-light/25 text-ui-text outline-none transition-[border-color,filter,transform] duration-150 hover:-translate-y-px hover:border-ui-gold/55 hover:brightness-110 active:translate-y-px focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:pointer-events-none disabled:opacity-35 sm:size-14"
          >
            <span className="font-display text-xl font-bold text-ui-text-bright [text-shadow:0_2px_6px_rgba(0,0,0,0.9)] sm:text-2xl">
              {SPELL_ARTWORK_BY_EFFECT[spell.effectId] ? (
                <EffectArtwork
                  {...SPELL_ARTWORK_BY_EFFECT[spell.effectId]}
                  size={32}
                />
              ) : (
                spell.glyph
              )}
            </span>
            <kbd className="absolute top-0.5 left-1 z-20 text-[9px] font-bold text-ui-muted">
              {spell.shortcut}
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
