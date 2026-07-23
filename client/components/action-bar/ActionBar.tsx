"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { isEditableTarget } from "../../lib/hotkeys/isEditableTarget";
import { resolveActionBarSlot } from "../../lib/hotkeys/resolveActionBarSlot";

interface ActionBarItem {
  readonly id: string;
  readonly icon: ReactNode;
  readonly title: string;
  readonly ariaLabel: string;
  readonly badge?: string | number;
  readonly badgeTone?: "count" | "mana";
  readonly cooldownReadyAt?: number;
  readonly cooldownTotalMs?: number;
  readonly disabled?: boolean;
  readonly unavailable?: boolean;
}

interface ActionBarSlot {
  readonly shortcut: string;
  readonly shortcutLabel: string;
  readonly emptyTitle: string;
  readonly emptyAriaLabel: string;
  readonly item: ActionBarItem | null;
}

interface ActionBarProps {
  readonly ariaLabel: string;
  readonly slots: ReadonlyArray<ActionBarSlot>;
  readonly hotkeyModifier?: "shift";
  readonly hotkeysEnabled?: boolean;
  readonly onActivate?: (itemId: string, slotIndex: number) => void;
  readonly onConfigure?: (slotIndex: number) => void;
}

export function ActionBar({
  ariaLabel,
  slots,
  hotkeyModifier,
  hotkeysEnabled = true,
  onActivate,
  onConfigure,
}: ActionBarProps) {
  const buttonRefs = useRef(new Map<number, HTMLButtonElement>());
  const [now, setNow] = useState(() => Date.now());
  const hasCooldown = slots.some(
    (slot) => (slot.item?.cooldownReadyAt ?? 0) > now,
  );

  useEffect(() => {
    if (!hasCooldown) return;
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [hasCooldown]);

  useEffect(() => {
    if (!hotkeysEnabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const index = resolveActionBarSlot(event, hotkeyModifier);
      if (index === null) return;
      const button = buttonRefs.current.get(index);
      if (!button || button.disabled) return;
      event.preventDefault();
      button.click();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkeyModifier, hotkeysEnabled]);

  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      onContextMenu={(event) => {
        if (!onConfigure) return;
        event.preventDefault();
        onConfigure(0);
      }}
      className="pointer-events-auto relative isolate flex gap-1 rounded-sm border border-black/80 bg-black/75 p-1 shadow-[inset_0_2px_8px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.04)]"
    >
      {slots.map((slot, index) => {
        const item = slot.item;
        if (!item) {
          return (
            <button
              key={index}
              type="button"
              title={slot.emptyTitle}
              aria-label={slot.emptyAriaLabel}
              disabled={!onConfigure}
              onClick={() => onConfigure?.(index)}
              onContextMenu={(event) => {
                if (!onConfigure) return;
                event.preventDefault();
                event.stopPropagation();
                onConfigure(index);
              }}
              className="ui-action-slot group relative flex size-12 shrink-0 items-center justify-center rounded-sm border border-ui-stone-light/20 bg-ui-panel-deep text-ui-muted outline-none transition-[border-color,color] duration-150 hover:border-ui-gold/55 hover:text-ui-gold focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:pointer-events-none disabled:opacity-50 sm:size-14"
            >
              {onConfigure && (
                <span aria-hidden className="text-lg leading-none opacity-45 group-hover:opacity-90">
                  +
                </span>
              )}
              <kbd className="absolute top-0.5 left-1 text-xs font-bold text-ui-muted">
                {slot.shortcutLabel}
              </kbd>
            </button>
          );
        }
        const cooldownTotalMs = Math.max(0, item.cooldownTotalMs ?? 0);
        const cooldownRemainingMs = Math.min(
          Math.max(0, (item.cooldownReadyAt ?? 0) - now),
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
            title={item.title}
            aria-label={item.ariaLabel}
            aria-keyshortcuts={slot.shortcut}
            disabled={item.disabled}
            onClick={() => onActivate?.(item.id, index)}
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
            className={`ui-action-slot group relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-ui-stone-light/25 bg-ui-panel-deep text-ui-text outline-none transition-[border-color,filter,transform] duration-150 hover:-translate-y-px hover:border-ui-gold/55 hover:brightness-110 active:translate-y-px focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:pointer-events-none disabled:opacity-35 sm:size-14 ${item.unavailable ? "opacity-35" : ""}`}
          >
            {item.icon}
            <kbd className="absolute top-0.5 left-1 z-20 text-xs font-bold text-ui-muted">
              {slot.shortcutLabel}
            </kbd>
            {item.badge !== undefined && (
              <span
                className={`absolute right-1 bottom-0.5 z-20 font-semibold tabular-nums ${
                  item.badgeTone === "mana"
                    ? "text-xs text-ui-mana-light"
                    : "text-xs text-ui-text-bright"
                }`}
              >
                {item.badge}
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
