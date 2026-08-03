"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CharacterMenuEntry } from "./CharacterMenuEntry";
import { CharacterMenuIcon } from "./CharacterMenuIcon";

interface CharacterMenuButtonProps {
  readonly label: string;
  readonly entries: ReadonlyArray<CharacterMenuEntry>;
}

const TRIGGER_CLASS =
  "ui-button inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-ui-muted outline-none transition-[color,border-color,filter,transform] duration-150 hover:-translate-y-px hover:text-ui-text hover:brightness-110 active:translate-y-px focus-visible:ring-2 focus-visible:ring-ui-gold/60";

const ITEM_CLASS =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-ui-gold/15 hover:text-ui-text-bright focus-visible:bg-ui-gold/15 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

/**
 * The character button in the top bar and the menu it drops down. The panels
 * behind it are toggles, so each row reports its own open state rather than
 * closing the menu into an unknown one.
 */
export function CharacterMenuButton({
  label,
  entries,
}: CharacterMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onBlur = () => setOpen(false);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
    };
  }, [open]);

  const anyActive = entries.some((entry) => entry.active);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={`${TRIGGER_CLASS} ${
          open || anyActive
            ? "ui-button-primary border-ui-accent-light/50 text-ui-text-bright"
            : "ui-button-secondary border-ui-stone-light/15 hover:border-ui-gold/40"
        }`}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4 sm:size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="ui-panel-frame absolute top-full right-0 z-50 mt-2 w-56 overflow-hidden py-1 font-tibia shadow-2xl shadow-black/80"
        >
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={entry.active}
              disabled={!entry.onSelect}
              onClick={() => {
                entry.onSelect?.();
                setOpen(false);
              }}
              className={`${ITEM_CLASS} ${
                entry.active ? "text-ui-gold" : "text-ui-text"
              }`}
            >
              <CharacterMenuIcon id={entry.id} />
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              {entry.hotkey && (
                <span
                  aria-hidden
                  className="shrink-0 rounded-sm border border-ui-stone-light/20 px-1 text-xs tracking-wide text-ui-muted"
                >
                  {entry.hotkey}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
