"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ActionBarAction } from "@tibia/protocol";
import type { ActionBarEditorRequest } from "./ActionBarEditorRequest";

interface ActionBarContextMenuProps {
  readonly action: ActionBarAction | null;
  readonly hotkey: string | null;
  readonly locked: boolean;
  readonly position: { readonly x: number; readonly y: number };
  readonly onConfigure: (section: ActionBarEditorRequest["section"]) => void;
  readonly onClearAction: () => void;
  readonly onClearHotkey: () => void;
  readonly onLockChange: (locked: boolean) => void;
  readonly onClose: () => void;
}

export function ActionBarContextMenu({
  action,
  hotkey,
  locked,
  position,
  onConfigure,
  onClearAction,
  onClearHotkey,
  onLockChange,
  onClose,
}: ActionBarContextMenuProps) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const optionClass =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ui-text outline-none transition-colors hover:bg-ui-gold/15 hover:text-ui-text-bright focus-visible:bg-ui-gold/15";
  return createPortal(
    <div
      role="menu"
      aria-label="Action button options"
      onPointerDown={(event) => event.stopPropagation()}
      className="ui-panel-frame fixed z-[120] min-w-52 overflow-hidden py-1 font-tibia shadow-2xl shadow-black/80"
      style={{
        left: Math.min(position.x, window.innerWidth - 224),
        top: Math.min(position.y, window.innerHeight - 360),
      }}
    >
      <button
        type="button"
        role="menuitem"
        className={optionClass}
        onClick={() => onConfigure("spell")}
      >
        {action?.kind === "spell" ? "Edit Spell" : "Assign Spell"}
      </button>
      <button
        type="button"
        role="menuitem"
        className={optionClass}
        onClick={() => onConfigure("item")}
      >
        {action?.kind === "item" ? "Edit Object" : "Assign Object"}
      </button>
      <button
        type="button"
        role="menuitem"
        className={optionClass}
        onClick={() => onConfigure("text")}
      >
        {action?.kind === "text" ? "Edit Text" : "Assign Text"}
      </button>
      <button
        type="button"
        role="menuitem"
        className={optionClass}
        onClick={() => onConfigure("hotkey")}
      >
        {hotkey ? "Edit Hotkey" : "Assign Hotkey"}
      </button>
      {hotkey && (
        <button
          type="button"
          role="menuitem"
          className={optionClass}
          onClick={onClearHotkey}
        >
          Clear Hotkey
        </button>
      )}
      {action && (
        <button
          type="button"
          role="menuitem"
          className={optionClass}
          onClick={() => onConfigure("bot")}
        >
          Configure Automation
        </button>
      )}
      <div className="my-1 border-t border-ui-stone-light/15" />
      {action && (
        <button
          type="button"
          role="menuitem"
          className={`${optionClass} text-red-300`}
          onClick={onClearAction}
        >
          Clear Action
        </button>
      )}
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={locked}
        className={optionClass}
        onClick={() => onLockChange(!locked)}
      >
        {locked ? "Unlock Action Bar" : "Lock Action Bar"}
      </button>
    </div>,
    document.body,
  );
}
