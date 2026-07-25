"use client";

import type { ActionBarAction, SpellCatalogEntry } from "@tibia/protocol";
import { Input } from "../ui/Input";

interface ActionBarSpellParameterProps {
  readonly spell: SpellCatalogEntry;
  readonly action: Extract<ActionBarAction, { kind: "spell" }>;
  readonly onChange: (action: ActionBarAction) => void;
}

const DIRECTIONS = ["up", "down"] as const;

/**
 * Binds the word parameter of a spell that takes one ("exani hur up",
 * "exura sio Friend"), so the slot can cast it. The value is only a
 * reference: the server resolves and validates it at cast time.
 */
export function ActionBarSpellParameter({
  spell,
  action,
  onChange,
}: ActionBarSpellParameterProps) {
  if (spell.parameterKind === "none") return null;
  const update = (parameter: string) => {
    const trimmed = parameter.trim();
    const { parameter: _previous, ...rest } = action;
    onChange(trimmed.length > 0 ? { ...rest, parameter: trimmed } : rest);
  };
  if (spell.parameterKind === "direction") {
    return (
      <fieldset className="flex items-center gap-2">
        <legend className="mb-1 text-sm font-medium text-ui-text-bright">
          Float direction
        </legend>
        {DIRECTIONS.map((direction) => (
          <button
            key={direction}
            type="button"
            aria-pressed={action.parameter === direction}
            onClick={() => update(direction)}
            className={`rounded px-3 py-2 text-sm font-medium capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
              action.parameter === direction
                ? "bg-ui-gold/15 text-ui-gold"
                : "text-ui-muted hover:bg-white/5 hover:text-ui-text"
            }`}
          >
            {direction}
          </button>
        ))}
      </fieldset>
    );
  }
  return (
    <Input
      label={
        spell.parameterKind === "monster-name"
          ? "Creature name (optional)"
          : "Player name (optional)"
      }
      name="action-bar-spell-parameter"
      autoComplete="off"
      maxLength={64}
      value={action.parameter ?? ""}
      onChange={(event) => update(event.currentTarget.value)}
    />
  );
}
