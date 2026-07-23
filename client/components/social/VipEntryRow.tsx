"use client";

import { useState } from "react";
import { VIP_LIMITS, type VipEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface VipEntryRowProps {
  entry: VipEntry;
  onChat: (name: string) => void;
  onEdit: (
    targetCharacterId: string,
    edits: { description?: string; icon?: number; notifyLogin?: boolean },
  ) => void;
  onRemove: (targetCharacterId: string) => void;
}

const ICON_COLORS = [
  { foreground: "text-ui-muted", swatch: "bg-ui-muted" },
  { foreground: "text-red-400", swatch: "bg-red-400" },
  { foreground: "text-orange-400", swatch: "bg-orange-400" },
  { foreground: "text-amber-300", swatch: "bg-amber-300" },
  { foreground: "text-lime-400", swatch: "bg-lime-400" },
  { foreground: "text-emerald-400", swatch: "bg-emerald-400" },
  { foreground: "text-cyan-400", swatch: "bg-cyan-400" },
  { foreground: "text-sky-400", swatch: "bg-sky-400" },
  { foreground: "text-violet-400", swatch: "bg-violet-400" },
  { foreground: "text-fuchsia-400", swatch: "bg-fuchsia-400" },
  { foreground: "text-rose-400", swatch: "bg-rose-400" },
] as const;

/** One private friend entry with server-projected presence and character data. */
export function VipEntryRow({
  entry,
  onChat,
  onEdit,
  onRemove,
}: VipEntryRowProps) {
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
          className={`flex size-12 shrink-0 items-center justify-center rounded-md border border-ui-gold/25 bg-ui-panel-deep/80 shadow-inner shadow-black/50 ${
            (ICON_COLORS[entry.icon] ?? ICON_COLORS[0]).foreground
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5.5 20a6.5 6.5 0 0 1 13 0M4 4.5h3M17 4.5h3" />
          </svg>
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
              <span
                aria-label={t("vip.notifyLogin")}
                className="text-ui-gold"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M10 21h4" />
                </svg>
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
          aria-label={t("vip.chat", { name: entry.name })}
          onClick={() => onChat(entry.name)}
          className="flex size-8 items-center justify-center rounded-sm border border-ui-stone-light/20 bg-black/15 text-ui-muted outline-none transition-[color,border-color,background-color] hover:border-ui-gold/45 hover:bg-white/5 hover:text-ui-gold focus-visible:ring-2 focus-visible:ring-ui-gold/60"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 5.5h14v10H9l-4 3z" />
            <path d="M8.5 9h7M8.5 12h4.5" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={t("vip.edit", { name: entry.name })}
          onClick={() => setEditing((open) => !open)}
          className="flex size-8 items-center justify-center rounded-sm border border-ui-stone-light/20 bg-black/15 text-ui-muted outline-none transition-[color,border-color,background-color] hover:border-ui-gold/45 hover:bg-white/5 hover:text-ui-text-bright focus-visible:ring-2 focus-visible:ring-ui-gold/60"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2z" />
            <path d="m14.5 7.1 2.8 2.8M4 20h5" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={t("vip.remove", { name: entry.name })}
          onClick={() => onRemove(entry.characterId)}
          className="flex size-8 items-center justify-center rounded-sm border border-ui-stone-light/20 bg-black/15 text-ui-muted outline-none transition-[color,border-color,background-color] hover:border-red-400/45 hover:bg-red-950/25 hover:text-red-400 focus-visible:ring-2 focus-visible:ring-red-400/60"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 7h16M9 7V4.5h6V7M7 7l1 13h8l1-13" />
            <path d="M10 11v5M14 11v5" />
          </svg>
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
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs tracking-wide text-ui-muted uppercase">
              {t("vip.icon")}
            </span>
            <div className="grid grid-cols-6 gap-1.5">
              {ICON_COLORS.map(({ foreground, swatch }, iconId) => (
                <button
                  key={foreground}
                  type="button"
                  aria-label={t("vip.iconOption", { icon: iconId })}
                  aria-pressed={icon === iconId}
                  onClick={() => setIcon(iconId)}
                  className={`flex size-8 items-center justify-center rounded-sm border bg-black/25 outline-none transition-[border-color,filter,transform] hover:-translate-y-px hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                    icon === iconId
                      ? "border-ui-gold"
                      : "border-ui-stone-light/20"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`size-4 ${swatch}`}
                  />
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
