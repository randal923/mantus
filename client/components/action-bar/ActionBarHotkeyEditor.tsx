"use client";

import { useState } from "react";
import type { ActionBarHotkey } from "@tibia/protocol";
import { actionBarHotkeyFromEvent } from "../../lib/hotkeys/actionBarHotkeyFromEvent";
import { formatActionBarHotkey } from "../../lib/hotkeys/formatActionBarHotkey";
import { Button } from "../ui/Button";

interface ActionBarHotkeyEditorProps {
  readonly hotkey: ActionBarHotkey | null;
  readonly onChange: (hotkey: ActionBarHotkey | null) => void;
}

export function ActionBarHotkeyEditor({
  hotkey,
  onChange,
}: ActionBarHotkeyEditorProps) {
  const [capturing, setCapturing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  return (
    <section className="rounded-lg border border-ui-stone-light/15 bg-ui-panel-deep/55 p-4">
      <h3 className="font-display text-base tracking-wide text-ui-text-bright">
        Action Button Hotkey
      </h3>
      <p className="mt-1 text-sm text-ui-muted">
        Click the field, then press a key or modifier combination. Movement and
        chat keys stay reserved.
      </p>
      <button
        type="button"
        onClick={() => {
          setBlocked(false);
          setCapturing(true);
        }}
        onKeyDown={(event) => {
          if (!capturing) return;
          event.preventDefault();
          event.stopPropagation();
          const next = actionBarHotkeyFromEvent(event);
          if (!next) {
            setBlocked(true);
            return;
          }
          onChange(next);
          setBlocked(false);
          setCapturing(false);
        }}
        className={`mt-4 flex h-12 w-full items-center justify-center rounded border bg-black/35 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
          capturing
            ? "border-ui-gold text-ui-gold"
            : "border-ui-stone-light/25 text-ui-text"
        }`}
      >
        {capturing
          ? "Press a hotkey…"
          : formatActionBarHotkey(hotkey) || "No hotkey assigned"}
      </button>
      {blocked && (
        <p className="mt-2 text-sm text-red-300">
          That key is reserved. Add a modifier or choose another key.
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button size="sm" disabled={!hotkey} onClick={() => onChange(null)}>
          Clear Hotkey
        </Button>
      </div>
    </section>
  );
}
