"use client";

import { useState } from "react";
import type { FriendStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface FriendRequestsSectionProps {
  friends: FriendStateMessage | null;
  pending: boolean;
  onRequest: (name: string) => void;
  onRespond: (fromCharacterId: string, accept: boolean) => void;
  onRemove: (targetCharacterId: string) => void;
  onSetFinderVisible: (visible: boolean) => void;
}

/**
 * Reciprocal friendships and their pending requests. Presence is shown only
 * for accepted friends — the server deliberately reports pending requests as
 * offline, and this renders exactly what it sends.
 */
export function FriendRequestsSection({
  friends,
  pending,
  onRequest,
  onRespond,
  onRemove,
  onSetFinderVisible,
}: FriendRequestsSectionProps) {
  const { t } = useAppTranslation();
  const [name, setName] = useState("");
  if (!friends) return null;

  return (
    <section className="flex flex-col gap-2 border-t border-white/5 pt-3">
      <h3 className="font-button text-sm uppercase tracking-wide text-ui-muted">
        {t("vip.friendsSection.title")}
      </h3>
      {friends.incoming.length > 0 && (
        <ul className="flex flex-col gap-1">
          {friends.incoming.map((entry) => (
            <li key={entry.characterId} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate text-ui-text-bright">
                {t("vip.friendsSection.incoming", { name: entry.name })}
              </span>
              <Button
                size="sm"
                variant="primary"
                disabled={pending}
                onClick={() => onRespond(entry.characterId, true)}
              >
                {t("vip.friendsSection.accept")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => onRespond(entry.characterId, false)}
              >
                {t("vip.friendsSection.decline")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ul className="flex flex-col gap-1">
        {friends.friends.map((entry) => (
          <li key={entry.characterId} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`size-2 rounded-full ${
                entry.online ? "bg-emerald-400" : "bg-white/25"
              }`}
            />
            <span className="flex-1 truncate text-ui-text-bright">
              {entry.name}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => onRemove(entry.characterId)}
            >
              {t("vip.friendsSection.remove")}
            </Button>
          </li>
        ))}
      </ul>
      {friends.outgoing.length > 0 && (
        <p className="text-xs text-ui-muted">
          {t("vip.friendsSection.outgoing", {
            names: friends.outgoing.map((entry) => entry.name).join(", "),
          })}
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          value={name}
          placeholder={t("vip.friendsSection.placeholder")}
          aria-label={t("vip.friendsSection.placeholder")}
          onChange={(event) => setName(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-ui-gold/20 bg-black/30 px-2 py-1 text-sm text-ui-text-bright"
        />
        <Button
          size="sm"
          variant="primary"
          disabled={pending || name.trim().length === 0}
          onClick={() => {
            onRequest(name.trim());
            setName("");
          }}
        >
          {t("vip.friendsSection.request")}
        </Button>
      </div>
      <label className="flex items-center gap-2 text-xs text-ui-muted">
        <input
          type="checkbox"
          checked={friends.finderVisible}
          onChange={(event) => onSetFinderVisible(event.target.checked)}
        />
        {t("vip.friendsSection.finderVisible")}
      </label>
    </section>
  );
}
