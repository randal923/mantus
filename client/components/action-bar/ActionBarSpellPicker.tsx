"use client";

import { useState } from "react";
import type {
  ActionBarAction,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { getSpellIconArtwork } from "../../lib/combat/getSpellIconArtwork";
import { Input } from "../ui/Input";
import { SpellIcon } from "../spells/SpellIcon";

interface ActionBarSpellPickerProps {
  readonly spells: ReadonlyArray<SpellCatalogEntry>;
  readonly selected: ActionBarAction | null;
  readonly onSelect: (action: ActionBarAction) => void;
}

export function ActionBarSpellPicker({
  spells,
  selected,
  onSelect,
}: ActionBarSpellPickerProps) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visible = spells.filter(
    (spell) =>
      spell.origin === "spell" &&
      (spell.name.toLowerCase().includes(query) ||
        spell.words?.toLowerCase().includes(query)),
  );
  return (
    <section className="flex flex-col gap-3">
      <Input
        label="Search spells"
        name="action-bar-spell-search"
        type="search"
        autoComplete="off"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />
      <ul className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {visible.map((spell) => {
          const artwork = getSpellIconArtwork(spell.id);
          const active =
            selected?.kind === "spell" && selected.spellId === spell.id;
          return (
            <li key={spell.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onSelect({
                    kind: "spell",
                    spellId: spell.id,
                    targetMode:
                      spell.targetKind === "self"
                        ? "self"
                        : spell.targetKind === "direction"
                          ? "direction"
                          : spell.targetKind === "position"
                            ? "crosshair"
                            : "attack-target",
                  })
                }
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                  active
                    ? "border-ui-gold/70 bg-ui-gold/10"
                    : "border-ui-stone-light/15 bg-ui-panel-deep/55 hover:border-ui-gold/40"
                }`}
              >
                <span className="flex size-11 shrink-0 items-center justify-center">
                  {artwork && <SpellIcon {...artwork} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ui-text-bright">
                    {spell.name}
                  </span>
                  <span className="block truncate text-sm italic text-ui-muted">
                    {spell.words}
                  </span>
                </span>
                <span className="text-xs font-semibold text-ui-mana-light">
                  {spell.manaCost} MP
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
