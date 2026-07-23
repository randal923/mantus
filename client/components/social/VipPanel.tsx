"use client";

import { useState } from "react";
import { PROTOCOL_LIMITS, type VipEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { CloseButton } from "../ui/CloseButton";
import { Input } from "../ui/Input";
import { VipEntryRow } from "./VipEntryRow";

interface VipPanelProps {
  entries: ReadonlyArray<VipEntry>;
  error: string | null;
  onAdd: (name: string) => void;
  onEdit: (
    targetCharacterId: string,
    edits: { description?: string; icon?: number; notifyLogin?: boolean },
  ) => void;
  onRemove: (targetCharacterId: string) => void;
  onClose: () => void;
}

/**
 * Renders the own private VIP list (server projection). Presence flags
 * come exclusively from the server for characters on this list.
 */
export function VipPanel({
  entries,
  error,
  onAdd,
  onEdit,
  onRemove,
  onClose,
}: VipPanelProps) {
  const { t } = useAppTranslation();
  const [addName, setAddName] = useState("");
  const sorted = [...entries].sort(
    (left, right) =>
      Number(right.online) - Number(left.online) ||
      left.name.localeCompare(right.name),
  );

  const submitAdd = () => {
    const name = addName.trim();
    if (name.length === 0) return;
    onAdd(name);
    setAddName("");
  };

  return (
    <section
      aria-label={t("vip.title")}
      className="ui-panel-frame pointer-events-auto w-64 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-wide text-ui-text-bright uppercase">
          {t("vip.title")}
        </h2>
        <CloseButton label={t("modal.close")} onClick={onClose} />
      </div>
      {sorted.length === 0 ? (
        <p className="px-1 text-sm text-ui-muted">{t("vip.empty")}</p>
      ) : (
        <ul
          aria-label={t("vip.entriesLabel")}
          className="ui-scrollbar max-h-72 space-y-1 overflow-y-auto"
        >
          {sorted.map((entry) => (
            <VipEntryRow
              key={entry.characterId}
              entry={entry}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
      <form
        className="mt-2 flex items-end gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submitAdd();
        }}
      >
        <Input
          aria-label={t("vip.addPlaceholder")}
          placeholder={t("vip.addPlaceholder")}
          value={addName}
          maxLength={PROTOCOL_LIMITS.maxCharacterNameLength}
          onChange={(event) => setAddName(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button size="sm" type="submit">
          {t("vip.add")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 px-1 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
