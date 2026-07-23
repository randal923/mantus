"use client";

import { useState } from "react";
import type { ActionBarAction } from "@tibia/protocol";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Input } from "../ui/Input";

interface ActionBarTextEditorProps {
  readonly selected: ActionBarAction | null;
  readonly onSelect: (action: ActionBarAction) => void;
}

export function ActionBarTextEditor({
  selected,
  onSelect,
}: ActionBarTextEditorProps) {
  const [text, setText] = useState(
    selected?.kind === "text" ? selected.text : "",
  );
  const [sendAutomatically, setSendAutomatically] = useState(
    selected?.kind === "text" ? selected.sendAutomatically : true,
  );
  return (
    <section className="rounded-lg border border-ui-stone-light/15 bg-ui-panel-deep/55 p-4">
      <h3 className="font-display text-base tracking-wide text-ui-text-bright">
        Assign Text
      </h3>
      <p className="mt-1 text-sm text-ui-muted">
        Store a short phrase, command, or spell words on this button.
      </p>
      <div className="mt-4">
        <Input
          label="Text"
          name="action-bar-text"
          maxLength={96}
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
        />
      </div>
      <Checkbox
        checked={sendAutomatically}
        onChange={(event) =>
          setSendAutomatically(event.currentTarget.checked)
        }
        label="Send automatically when activated"
        className="mt-4 flex rounded border border-ui-stone-light/15 bg-black/20 px-3 py-2.5 text-sm text-ui-text"
      />
      <div className="mt-4 flex justify-end">
        <Button
          disabled={text.trim().length === 0}
          onClick={() =>
            onSelect({
              kind: "text",
              text: text.trim(),
              sendAutomatically,
            })
          }
        >
          Assign Text
        </Button>
      </div>
    </section>
  );
}
