"use client";

import { useState } from "react";
import {
  ACTION_BAR_SLOT_COUNT,
  type ActionBar,
  type SpellCatalogEntry,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { getSpellIconArtwork } from "../../lib/combat/getSpellIconArtwork";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { SpellIcon } from "./SpellIcon";

interface ActionBarModalProps {
  spells: ReadonlyArray<SpellCatalogEntry>;
  actionBar: ActionBar;
  initialSlot: number;
  onChange: (next: ActionBar) => void;
  onClose: () => void;
}

export function ActionBarModal({
  spells,
  actionBar,
  initialSlot,
  onChange,
  onClose,
}: ActionBarModalProps) {
  const { t } = useAppTranslation();
  const [selectedSlot, setSelectedSlot] = useState(() =>
    Math.min(Math.max(initialSlot, 0), ACTION_BAR_SLOT_COUNT - 1),
  );
  const slots = Array.from(
    { length: ACTION_BAR_SLOT_COUNT },
    (_, index) => actionBar[index] ?? null,
  );
  const combatSpells = spells.filter((spell) => spell.origin === "spell");

  const assignSelected = (spellId: string | null) => {
    const next = [...slots];
    next[selectedSlot] = spellId;
    onChange(next);
    if (spellId !== null && selectedSlot < ACTION_BAR_SLOT_COUNT - 1) {
      setSelectedSlot(selectedSlot + 1);
    }
  };

  return (
    <Modal title={t("spells.actionBar.title")} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-ui-gold/15 bg-black/25 px-3 py-2.5">
          <p className="text-xs leading-5 text-ui-muted">
            {t("spells.actionBar.description")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-1 flex-wrap gap-1.5">
            {slots.map((spellId, index) => {
              const spell = spellId
                ? combatSpells.find((candidate) => candidate.id === spellId)
                : undefined;
              const iconArtwork = spell ? getSpellIconArtwork(spell.id) : null;
              const selected = index === selectedSlot;
              return (
                <button
                  key={index}
                  type="button"
                  title={
                    spell
                      ? `${spell.name} (${index + 1})`
                      : t("spells.actionBar.emptySlot", {
                          shortcut: String(index + 1),
                        })
                  }
                  aria-pressed={selected}
                  onClick={() => setSelectedSlot(index)}
                  className={`relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                    selected
                      ? "border-ui-gold/80 shadow-[0_0_8px_rgba(0,0,0,0.6)] ring-1 ring-ui-gold/50"
                      : "border-ui-stone-light/25 hover:border-ui-gold/45"
                  } ${spell ? "ui-button ui-button-secondary" : "border-dashed bg-black/25"}`}
                >
                  {iconArtwork && <SpellIcon {...iconArtwork} />}
                  <kbd className="absolute top-0.5 left-1 z-20 text-xs font-bold text-ui-muted">
                    {index + 1}
                  </kbd>
                </button>
              );
            })}
          </div>
          <Button
            size="sm"
            disabled={slots[selectedSlot] === null}
            onClick={() => assignSelected(null)}
          >
            {t("spells.actionBar.clear")}
          </Button>
        </div>

        <ul className="flex flex-col gap-2">
          {combatSpells.map((spell) => {
            const iconArtwork = getSpellIconArtwork(spell.id);
            const assignedSlots = slots.flatMap((spellId, index) =>
              spellId === spell.id ? [index + 1] : [],
            );
            const inSelectedSlot = slots[selectedSlot] === spell.id;

            return (
              <li key={spell.id}>
                <button
                  type="button"
                  aria-label={t("spells.actionBar.assign", {
                    name: spell.name,
                    slot: selectedSlot + 1,
                  })}
                  onClick={() => assignSelected(inSelectedSlot ? null : spell.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left shadow-inner shadow-black/35 outline-none transition-[border-color,filter] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                    inSelectedSlot
                      ? "border-ui-gold/60 bg-ui-panel-deep/80"
                      : "border-ui-stone-light/15 bg-ui-panel-deep/55 hover:border-ui-gold/40"
                  }`}
                >
                  <div className="flex size-12 shrink-0 items-center justify-center">
                    {iconArtwork && <SpellIcon {...iconArtwork} />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-sm font-medium tracking-wide text-ui-text-bright">
                      {spell.name}
                    </h3>
                    <p className="truncate text-xs italic text-ui-muted">
                      {spell.words ?? "—"}
                    </p>
                  </div>

                  {assignedSlots.length > 0 && (
                    <div className="flex shrink-0 gap-1">
                      {assignedSlots.map((slot) => (
                        <kbd
                          key={slot}
                          className="rounded border border-ui-gold/40 bg-black/40 px-1.5 py-0.5 text-xs font-bold text-ui-gold"
                        >
                          {slot}
                        </kbd>
                      ))}
                    </div>
                  )}

                  <dl className="grid shrink-0 grid-cols-2 gap-x-3 text-right text-[10px] leading-4">
                    <div>
                      <dt className="tracking-wider text-ui-muted uppercase">
                        {t("spells.list.level")}
                      </dt>
                      <dd className="text-xs font-semibold tabular-nums text-ui-text">
                        {spell.requiredLevel}
                      </dd>
                    </div>
                    <div>
                      <dt className="tracking-wider text-ui-muted uppercase">
                        {t("spells.list.mana")}
                      </dt>
                      <dd className="text-xs font-semibold tabular-nums text-ui-mana-light">
                        {spell.manaCost}
                      </dd>
                    </div>
                  </dl>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
