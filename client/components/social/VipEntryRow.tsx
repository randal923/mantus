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

/** One private friend entry with server-projected presence and character data. */
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
    <li className="rounded-xl border border-ui-gold/10 bg-black/25 p-3 text-sm shadow-sm shadow-black/30">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`flex size-12 shrink-0 items-center justify-center rounded-full border border-ui-gold/25 bg-ui-panel-deep/80 font-display text-lg shadow-inner shadow-black/50 ${ICON_COLORS[entry.icon] ?? ICON_COLORS[0]}`}
        >
          ◆
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-label={entry.online ? t("vip.online") : t("vip.offline")}
              className={`size-2 shrink-0 rounded-full ${
                entry.online
                  ? "bg-emerald-400 shadow-[0_0_7px_currentColor] text-emerald-400"
                  : "bg-ui-stone-light/35"
              }`}
            />
            <p
              className={`truncate font-display font-semibold ${
                entry.online ? "text-ui-text-bright" : "text-ui-muted"
              }`}
              title={entry.description || entry.name}
            >
              {entry.name}
            </p>
            {entry.notifyLogin && (
              <span aria-label={t("vip.notifyLogin")} className="text-ui-gold">
                ♪
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs tracking-wide text-ui-muted">
            {t("vip.levelVocation", {
              level: entry.level,
              vocation: t(`vocations.${entry.vocation}.name`),
            })}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("vip.edit", { name: entry.name })}
          onClick={() => setEditing((open) => !open)}
          className="flex size-8 items-center justify-center rounded-lg border border-transparent text-ui-muted outline-none transition-[color,border-color,background-color] hover:border-ui-gold/20 hover:bg-white/5 hover:text-ui-text-bright focus-visible:ring-2 focus-visible:ring-ui-gold/60"
        >
          <span aria-hidden>✎</span>
        </button>
        <button
          type="button"
          aria-label={t("vip.remove", { name: entry.name })}
          onClick={() => onRemove(entry.characterId)}
          className="flex size-8 items-center justify-center rounded-lg border border-transparent text-ui-muted outline-none transition-[color,border-color,background-color] hover:border-red-400/20 hover:bg-red-950/25 hover:text-red-400 focus-visible:ring-2 focus-visible:ring-red-400/60"
        >
          <span aria-hidden>✕</span>
        </button>
      </div>
      {entry.description && !editing && (
        <p className="mt-2 truncate pl-15 text-xs text-ui-muted">
          {entry.description}
        </p>
      )}
      {editing && (
        <form
          className="mt-3 space-y-2 rounded-lg border border-ui-stone-light/15 bg-black/25 p-3"
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
            <span className="text-xs tracking-wide text-ui-muted uppercase">
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
          <label className="flex items-center justify-between gap-2 text-sm text-ui-text">
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
