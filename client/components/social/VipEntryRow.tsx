"use client";

import { useState } from "react";
import { VIP_LIMITS, type VipEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface VipEntryRowProps {
  entry: VipEntry;
  onEdit: (
    targetCharacterId: string,
    edits: { description?: string; icon?: number; notifyLogin?: boolean },
  ) => void;
  onRemove: (targetCharacterId: string) => void;
}

const ICON_COLORS = [
  "text-ui-muted",
  "text-red-400",
  "text-orange-400",
  "text-amber-300",
  "text-lime-400",
  "text-emerald-400",
  "text-cyan-400",
  "text-sky-400",
  "text-violet-400",
  "text-fuchsia-400",
  "text-rose-400",
] as const;

/** One VIP list entry with an inline edit form for its private metadata. */
export function VipEntryRow({ entry, onEdit, onRemove }: VipEntryRowProps) {
  const { t } = useAppTranslation();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(entry.description);
  const [icon, setIcon] = useState(entry.icon);
  const [notifyLogin, setNotifyLogin] = useState(entry.notifyLogin);

  const saveEdits = () => {
    onEdit(entry.characterId, { description, icon, notifyLogin });
    setEditing(false);
  };

  return (
    <li className="px-1 text-xs">
      <div className="flex items-center gap-2">
        <span
          aria-label={entry.online ? t("vip.online") : t("vip.offline")}
          className={`size-2 shrink-0 rounded-full ${
            entry.online
              ? "bg-green-500 shadow-[0_0_6px_currentColor] text-green-500"
              : "bg-ui-stone-light/40"
          }`}
        />
        <span
          aria-hidden
          className={`font-display text-[10px] ${ICON_COLORS[entry.icon] ?? ICON_COLORS[0]}`}
        >
          ◆
        </span>
        <span
          className={`min-w-0 flex-1 truncate ${
            entry.online ? "text-ui-text-bright" : "text-ui-muted"
          }`}
          title={entry.description || entry.name}
        >
          {entry.name}
        </span>
        {entry.notifyLogin && (
          <span aria-label={t("vip.notifyLogin")} className="text-ui-gold">
            ♪
          </span>
        )}
        <button
          type="button"
          aria-label={t("vip.edit", { name: entry.name })}
          onClick={() => setEditing((open) => !open)}
          className="text-ui-muted transition-colors hover:text-ui-text-bright"
        >
          ✎
        </button>
        <button
          type="button"
          aria-label={t("vip.remove", { name: entry.name })}
          onClick={() => onRemove(entry.characterId)}
          className="text-ui-muted transition-colors hover:text-red-400"
        >
          ✕
        </button>
      </div>
      {entry.description && !editing && (
        <p className="truncate pl-4 text-[10px] text-ui-muted">
          {entry.description}
        </p>
      )}
      {editing && (
        <form
          className="mt-1 space-y-1.5 rounded-sm border border-ui-stone-light/15 bg-black/25 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveEdits();
          }}
        >
          <Input
            aria-label={t("vip.description")}
            placeholder={t("vip.description")}
            value={description}
            maxLength={VIP_LIMITS.maxDescriptionLength}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] tracking-wide text-ui-muted uppercase">
              {t("vip.icon")}
            </span>
            <div className="flex gap-1">
              {ICON_COLORS.map((color, iconId) => (
                <button
                  key={color}
                  type="button"
                  aria-label={t("vip.iconOption", { icon: iconId })}
                  aria-pressed={icon === iconId}
                  onClick={() => setIcon(iconId)}
                  className={`${color} ${
                    icon === iconId
                      ? "opacity-100 outline outline-1 outline-ui-gold/60"
                      : "opacity-45 hover:opacity-80"
                  }`}
                >
                  ◆
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-2 text-xs text-ui-text">
            <span>{t("vip.notifyLogin")}</span>
            <input
              type="checkbox"
              checked={notifyLogin}
              onChange={(event) => setNotifyLogin(event.target.checked)}
            />
          </label>
          <Button size="sm" type="submit" className="w-full">
            {t("vip.save")}
          </Button>
        </form>
      )}
    </li>
  );
}
