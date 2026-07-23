"use client";

import { useState } from "react";
import type {
  ActionBarAction,
  ActionBarItemMode,
  InventoryItem,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { createItemAction } from "../../lib/action-bar/createItemAction";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Input } from "../ui/Input";

interface ActionBarItemPickerProps {
  readonly items: ReadonlyArray<InventoryItem>;
  readonly spells: ReadonlyArray<SpellCatalogEntry>;
  readonly selected: ActionBarAction | null;
  readonly onSelect: (action: ActionBarAction) => void;
}

const ITEM_MODES: ReadonlyArray<{
  readonly value: ActionBarItemMode;
  readonly label: string;
}> = [
  { value: "use-on-self", label: "Use on yourself" },
  { value: "use-on-target", label: "Use on attack target" },
  { value: "use-at-cursor", label: "Use at cursor" },
  { value: "use-with-crosshair", label: "Use with crosshair" },
  { value: "equip", label: "Equip / unequip" },
  { value: "use", label: "Use" },
];

function availableModes(
  item: InventoryItem,
  spells: ReadonlyArray<SpellCatalogEntry>,
): ReadonlySet<ActionBarItemMode> {
  if (item.useKind === "rune") {
    const rune = spells.find(
      (spell) =>
        spell.origin === "rune" &&
        spell.runeItemTypeId === item.typeId,
    );
    if (rune?.targetKind === "self") return new Set(["use-on-self"]);
    if (rune?.targetKind === "position") {
      return new Set(["use-at-cursor", "use-with-crosshair"]);
    }
    return new Set([
      "use-on-target",
      "use-at-cursor",
      "use-with-crosshair",
    ]);
  }
  if (item.useKind === "potion" || item.useKind === "useWith") {
    return new Set([
      "use-on-self",
      "use-on-target",
      "use-at-cursor",
      "use-with-crosshair",
    ]);
  }
  if (item.equipmentSlot) return new Set(["equip", "use"]);
  return new Set(["use"]);
}

export function ActionBarItemPicker({
  items,
  spells,
  selected,
  onSelect,
}: ActionBarItemPickerProps) {
  const [search, setSearch] = useState("");
  const byType = new Map<number, { item: InventoryItem; count: number }>();
  for (const item of items) {
    const current = byType.get(item.typeId);
    byType.set(item.typeId, {
      item: current?.item ?? item,
      count: (current?.count ?? 0) + item.count,
    });
  }
  const query = search.trim().toLowerCase();
  const visible = [...byType.values()]
    .filter(({ item }) => item.name.toLowerCase().includes(query))
    .sort((left, right) => left.item.name.localeCompare(right.item.name));
  const selectedItem =
    selected?.kind === "item"
      ? byType.get(selected.itemTypeId)?.item
      : undefined;
  const modes = selectedItem
    ? availableModes(selectedItem, spells)
    : new Set<ActionBarItemMode>();

  return (
    <section className="flex flex-col gap-3">
      {selected?.kind === "item" && selectedItem && (
        <fieldset className="grid grid-cols-2 gap-2 rounded-lg border border-ui-gold/20 bg-black/20 p-3 sm:grid-cols-3">
          <legend className="px-1 text-xs font-medium text-ui-text-bright">
            Object action
          </legend>
          {ITEM_MODES.filter(({ value }) => modes.has(value)).map((mode) => (
            <label
              key={mode.value}
              className="flex cursor-pointer items-center gap-2 rounded border border-ui-stone-light/15 px-2 py-2 text-sm text-ui-text hover:border-ui-gold/40"
            >
              <input
                type="radio"
                name="action-bar-item-mode"
                checked={selected.mode === mode.value}
                onChange={() => onSelect({ ...selected, mode: mode.value })}
              />
              {mode.label}
            </label>
          ))}
        </fieldset>
      )}
      <Input
        label="Search carried objects"
        name="action-bar-item-search"
        type="search"
        autoComplete="off"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />
      <ul className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {visible.map(({ item, count }) => {
          const active =
            selected?.kind === "item" &&
            selected.itemTypeId === item.typeId;
          return (
            <li key={item.typeId}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(createItemAction(item, spells))}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                  active
                    ? "border-ui-gold/70 bg-ui-gold/10"
                    : "border-ui-stone-light/15 bg-ui-panel-deep/55 hover:border-ui-gold/40"
                }`}
              >
                <span className="flex size-16 shrink-0 items-center justify-center">
                  <SpriteIcon spriteId={item.spriteId} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-ui-text-bright">
                  {item.name}
                </span>
                <span className="text-xs font-semibold tabular-nums text-ui-muted">
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 && (
        <p className="rounded-lg border border-ui-stone-light/15 bg-black/20 px-4 py-8 text-center text-sm text-ui-muted">
          No matching carried objects.
        </p>
      )}
    </section>
  );
}
