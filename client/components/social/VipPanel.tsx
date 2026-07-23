"use client";

import { useState } from "react";
import type { VipEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { CloseButton } from "../ui/CloseButton";
import { AddFriendModal } from "./AddFriendModal";
import { VipEntryRow } from "./VipEntryRow";

interface VipPanelProps {
  entries: ReadonlyArray<VipEntry>;
  pending: boolean;
  error: string | null;
  hasParty: boolean;
  onOpenParty: () => void;
  onAdd: (name: string) => void;
  onChat: (name: string) => void;
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
  pending,
  error,
  hasParty,
  onOpenParty,
  onAdd,
  onChat,
  onEdit,
  onRemove,
  onClose,
}: VipPanelProps) {
  const { t } = useAppTranslation();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const sorted = [...entries].sort(
    (left, right) =>
      Number(right.online) - Number(left.online) ||
      left.name.localeCompare(right.name),
  );

  return (
    <section
      aria-label={t("vip.title")}
      className="ui-panel-frame pointer-events-auto flex h-full w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden p-4"
    >
      <header className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 font-display text-2xl font-bold tracking-[0.12em] text-ui-text-bright uppercase">
          {t("vip.title")}
        </h2>
        <button
          type="button"
          aria-label={t("vip.addFriend")}
          onClick={() => setAddModalOpen(true)}
          className="ui-button ui-button-secondary flex size-10 items-center justify-center rounded-md border border-ui-gold/30 text-ui-gold outline-none transition-[filter,border-color] hover:border-ui-gold/55 hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ui-gold/60"
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
            <circle cx="9" cy="8" r="3.25" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0M18 7v6M15 10h6" />
          </svg>
        </button>
        <CloseButton label={t("modal.close")} onClick={onClose} />
      </header>
      <div aria-hidden className="ui-divider my-4" />

      <section className="rounded-xl border border-ui-gold/15 bg-black/20 p-3">
        <p className="font-display text-sm tracking-[0.15em] text-ui-gold uppercase">
          {t("vip.party")}
        </p>
        <button
          type="button"
          onClick={onOpenParty}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-ui-gold/30 bg-ui-stone-dark/35 px-4 py-3 font-display text-sm font-bold tracking-[0.12em] text-ui-text-bright uppercase shadow-inner shadow-black/35 outline-none transition-[border-color,background-color,filter] hover:border-ui-gold/50 hover:bg-ui-stone-dark/55 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ui-gold/60"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-5 text-ui-gold"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="8" r="3" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M2.5 20a5.5 5.5 0 0 1 11 0M13 19.5a4.5 4.5 0 0 1 8.5 0" />
          </svg>
          {hasParty ? t("vip.viewParty") : t("vip.createParty")}
        </button>
      </section>

      <div className="mt-5 flex items-center gap-3">
        <h3 className="min-w-0 flex-1 font-display text-lg tracking-wide text-ui-gold">
          {t("vip.friends")}
        </h3>
        <span className="flex min-w-10 items-center justify-center rounded-full border border-ui-gold/25 bg-ui-gold-deep/40 px-3 py-1 text-sm font-bold tabular-nums text-ui-text-bright">
          {sorted.length}
        </span>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-400/20 bg-red-950/20 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      {sorted.length === 0 ? (
        <div className="mt-4 flex min-h-40 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-ui-gold/15 bg-black/15 px-6 text-center">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-10 text-ui-gold/55"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="8" r="3.25" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0M18 7v6M15 10h6" />
          </svg>
          <p className="mt-3 text-sm leading-6 text-ui-muted">
            {t("vip.empty")}
          </p>
        </div>
      ) : (
        <ul
          aria-label={t("vip.entriesLabel")}
          className="ui-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
        >
          {sorted.map((entry) => (
            <VipEntryRow
              key={entry.characterId}
              entry={entry}
              onChat={onChat}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}

      {addModalOpen && (
        <AddFriendModal
          pending={pending}
          onAdd={onAdd}
          onClose={() => setAddModalOpen(false)}
        />
      )}
    </section>
  );
}
