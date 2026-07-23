"use client";

import { useState } from "react";
import type {
  ActionBar,
  ActionBarAction,
  ActionBarHotkey,
  ActionBotSettings,
  InventoryState,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { getInventoryItems } from "../../lib/inventory/getInventoryItems";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import type { ActionBarEditorRequest } from "./ActionBarEditorRequest";
import { ActionBarHotkeyEditor } from "./ActionBarHotkeyEditor";
import { ActionBarItemPicker } from "./ActionBarItemPicker";
import { ActionBarSlotStrip } from "./ActionBarSlotStrip";
import { ActionBarSpellPicker } from "./ActionBarSpellPicker";
import { ActionBarTextEditor } from "./ActionBarTextEditor";
import { ActionBotSettingsPanel } from "./ActionBotSettingsPanel";

interface ActionBarModalProps {
  readonly spells: ReadonlyArray<SpellCatalogEntry>;
  readonly inventory: InventoryState | null;
  readonly actionBar: ActionBar;
  readonly botSettings: ActionBotSettings;
  readonly request: ActionBarEditorRequest;
  readonly onActionBarChange: (actionBar: ActionBar) => void;
  readonly onBotSettingsChange: (settings: ActionBotSettings) => void;
  readonly onClose: () => void;
}

const SECTIONS: ReadonlyArray<{
  readonly id: ActionBarEditorRequest["section"];
  readonly label: string;
}> = [
  { id: "spell", label: "Spells" },
  { id: "item", label: "Objects" },
  { id: "text", label: "Text" },
  { id: "hotkey", label: "Hotkey" },
  { id: "bot", label: "Action Bot" },
];

export function ActionBarModal({
  spells,
  inventory,
  actionBar,
  botSettings,
  request,
  onActionBarChange,
  onBotSettingsChange,
  onClose,
}: ActionBarModalProps) {
  const { t } = useAppTranslation();
  const [selectedSlot, setSelectedSlot] = useState(request.slotIndex);
  const [section, setSection] = useState(request.section);
  const items = getInventoryItems(inventory);
  const selected = actionBar[selectedSlot]!;
  const updateAction = (action: ActionBarAction | null) => {
    const next = [...actionBar];
    next[selectedSlot] = { ...selected, action };
    onActionBarChange(next);
  };
  const updateHotkey = (hotkey: ActionBarHotkey | null) => {
    const next = actionBar.map((slot, index) => ({
      ...slot,
      hotkey:
        hotkey && slot.hotkey === hotkey && index !== selectedSlot
          ? null
          : slot.hotkey,
    }));
    next[selectedSlot] = { ...next[selectedSlot]!, hotkey };
    onActionBarChange(next);
  };

  return (
    <Modal title="Action Bar" size="wide" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-ui-gold/15 bg-black/25 px-3 py-2.5">
          <p className="text-sm leading-6 text-ui-muted">
            Assign spells, runes, potions, equipment, usable objects, or text.
            Drag carried objects directly onto the bar and right-click any
            button for Tibia-style options.
          </p>
        </div>
        <ActionBarSlotStrip
          actionBar={actionBar}
          selectedSlot={selectedSlot}
          spells={spells}
          items={items}
          onSelect={setSelectedSlot}
        />
        <div className="flex items-center gap-2 border-b border-ui-stone-light/15 pb-2">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {SECTIONS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={section === candidate.id}
                onClick={() => setSection(candidate.id)}
                className={`shrink-0 rounded px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                  section === candidate.id
                    ? "bg-ui-gold/15 text-ui-gold"
                    : "text-ui-muted hover:bg-white/5 hover:text-ui-text"
                }`}
              >
                {candidate.id === "bot"
                  ? t("actionBot.title")
                  : candidate.label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            disabled={!selected.action}
            onClick={() => updateAction(null)}
          >
            Clear Action
          </Button>
        </div>
        {section === "spell" && (
          <ActionBarSpellPicker
            spells={spells}
            selected={selected.action}
            onSelect={updateAction}
          />
        )}
        {section === "item" && (
          <ActionBarItemPicker
            items={items}
            spells={spells}
            selected={selected.action}
            onSelect={updateAction}
          />
        )}
        {section === "text" && (
          <ActionBarTextEditor
            key={`${selectedSlot}:${selected.action?.kind === "text" ? selected.action.text : ""}`}
            selected={selected.action}
            onSelect={updateAction}
          />
        )}
        {section === "hotkey" && (
          <ActionBarHotkeyEditor
            hotkey={selected.hotkey}
            onChange={updateHotkey}
          />
        )}
        {section === "bot" && (
          <ActionBotSettingsPanel
            settings={botSettings}
            actionBar={actionBar}
            initialSlot={selectedSlot}
            spells={spells}
            items={items}
            onChange={onBotSettingsChange}
          />
        )}
      </div>
    </Modal>
  );
}
