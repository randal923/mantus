"use client";

import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ReadonlyArray<ContextMenuItem>;
  onClose: () => void;
}

const MENU_WIDTH = 176;
const ITEM_HEIGHT = 34;

/** Cursor-anchored action menu (Tibia's Ctrl+click "thing menu"). */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  useEffect(() => {
    menuRef.current?.querySelector("button")?.focus();
  }, []);

  const left = Math.max(0, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(
    0,
    Math.min(y, window.innerHeight - items.length * ITEM_HEIGHT - 16),
  );

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        className="ui-panel-frame absolute w-44 py-1 font-tibia text-sm select-none"
        style={{ left, top }}
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((item) => (
          <button
            key={item.id}
            role="menuitem"
            type="button"
            className="block w-full px-3 py-1.5 text-left text-ui-text transition-colors hover:bg-white/10 hover:text-ui-text-bright focus:bg-white/10 focus:text-ui-text-bright focus:outline-none"
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
