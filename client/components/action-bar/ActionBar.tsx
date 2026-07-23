"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { ActionBarAction } from "@tibia/protocol";
import { isEditableTarget } from "../../lib/hotkeys/isEditableTarget";
import { matchesActionBarHotkey } from "../../lib/hotkeys/matchesActionBarHotkey";
import { ActionBarContextMenu } from "./ActionBarContextMenu";
import type { ActionBarEditorRequest } from "./ActionBarEditorRequest";

interface ActionBarItem {
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

export interface ActionBarViewSlot {
  readonly action: ActionBarAction | null;
  readonly hotkey: string | null;
  readonly hotkeyLabel: string;
  readonly emptyTitle: string;
  readonly emptyAriaLabel: string;
  readonly item: ActionBarItem | null;
}

interface ActionBarProps {
  readonly ariaLabel: string;
  readonly slots: ReadonlyArray<ActionBarViewSlot>;
  readonly hotkeysEnabled?: boolean;
  readonly onActivate: (slotIndex: number) => void;
  readonly onConfigure: (
    slotIndex: number,
    section: ActionBarEditorRequest["section"],
  ) => void;
  readonly onChangeHotkey: (slotIndex: number, hotkey: null) => void;
  readonly onClearAction: (slotIndex: number) => void;
  readonly onMoveAction: (fromIndex: number, toIndex: number) => void;
  readonly onDropItem: (slotIndex: number, itemId: string) => void;
}

export function ActionBar({
  ariaLabel,
  slots,
  hotkeysEnabled = true,
  onActivate,
  onConfigure,
  onChangeHotkey,
  onClearAction,
  onMoveAction,
  onDropItem,
}: ActionBarProps) {
  const buttonRefs = useRef(new Map<number, HTMLButtonElement>());
  const [now, setNow] = useState(() => Date.now());
  const [locked, setLocked] = useState(false);
  const [menu, setMenu] = useState<{
    readonly slotIndex: number;
    readonly position: { readonly x: number; readonly y: number };
  } | null>(null);
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
      if (event.repeat || isEditableTarget(event.target)) return;
      const index = slots.findIndex((slot) =>
        matchesActionBarHotkey(event, slot.hotkey),
      );
      if (index < 0 || !slots[index]?.action) return;
      const button = buttonRefs.current.get(index);
      if (!button || button.disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      button.click();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [hotkeysEnabled, slots]);

  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className="pointer-events-auto relative isolate grid grid-cols-9 gap-1 rounded-sm border border-black/80 bg-black/75 p-1 shadow-[inset_0_2px_8px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.04)]"
    >
      {slots.map((slot, index) => {
        const item = slot.item;
        const cooldownTotalMs = Math.max(0, item?.cooldownTotalMs ?? 0);
        const cooldownRemainingMs = Math.min(
          Math.max(0, (item?.cooldownReadyAt ?? 0) - now),
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
            title={item?.title ?? slot.emptyTitle}
            aria-label={item?.ariaLabel ?? slot.emptyAriaLabel}
            aria-keyshortcuts={slot.hotkey ?? undefined}
            disabled={item?.disabled}
            draggable={Boolean(slot.action && !locked)}
            onClick={() =>
              slot.action
                ? onActivate(index)
                : onConfigure(index, "spell")
            }
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenu({
                slotIndex: index,
                position: { x: event.clientX, y: event.clientY },
              });
            }}
            onDragStart={(event) => {
              if (!slot.action || locked) {
                event.preventDefault();
                return;
              }
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(
                "application/x-tibia-action-slot",
                String(index),
              );
            }}
            onDragOver={(event) => {
              if (locked) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              if (locked) return;
              event.preventDefault();
              const serializedSourceIndex = event.dataTransfer.getData(
                "application/x-tibia-action-slot",
              );
              if (serializedSourceIndex) {
                const sourceIndex = Number(serializedSourceIndex);
                if (Number.isInteger(sourceIndex) && sourceIndex >= 0) {
                  onMoveAction(sourceIndex, index);
                  return;
                }
              }
              const itemId = event.dataTransfer.getData("text/plain");
              if (itemId) onDropItem(index, itemId);
            }}
            ref={(button) => {
              if (button) {
                buttonRefs.current.set(index, button);
                return;
              }
              buttonRefs.current.delete(index);
            }}
            className={`ui-action-slot group relative flex size-16 shrink-0 items-end justify-center overflow-hidden rounded-sm border bg-ui-panel-deep pb-1 text-ui-text outline-none transition-[border-color,filter,transform] duration-150 hover:-translate-y-px hover:border-ui-gold/55 hover:brightness-110 active:translate-y-px focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:pointer-events-none disabled:opacity-35 ${
              slot.action
                ? "border-ui-stone-light/25"
                : "border-ui-stone-light/15"
            } ${item?.unavailable ? "opacity-40" : ""}`}
          >
            {item?.icon}
            {!slot.action && !locked && (
              <span
                aria-hidden
                className="text-lg leading-none opacity-35 group-hover:opacity-80"
              >
                +
              </span>
            )}
            {slot.hotkeyLabel && (
              <kbd className="absolute top-0.5 left-1 z-20 max-w-[calc(100%-0.5rem)] truncate text-xs font-bold text-ui-muted">
                {slot.hotkeyLabel}
              </kbd>
            )}
            {item?.badge !== undefined && (
              <span
                className={`absolute right-1 bottom-0.5 z-20 text-xs font-semibold tabular-nums ${
                  item.badgeTone === "mana"
                    ? "text-ui-mana-light"
                    : "text-ui-text-bright"
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
      {menu && slots[menu.slotIndex] && (
        <ActionBarContextMenu
          action={slots[menu.slotIndex].action}
          hotkey={slots[menu.slotIndex].hotkey}
          locked={locked}
          position={menu.position}
          onConfigure={(section) => {
            onConfigure(menu.slotIndex, section);
            setMenu(null);
          }}
          onClearAction={() => {
            onClearAction(menu.slotIndex);
            setMenu(null);
          }}
          onClearHotkey={() => {
            onChangeHotkey(menu.slotIndex, null);
            setMenu(null);
          }}
          onLockChange={(next) => {
            setLocked(next);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
