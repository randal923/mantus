"use client";

import { useState } from "react";
import type { HouseState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface HouseAccessSectionProps {
  house: HouseState;
  pending: boolean;
  onSetAccess: (
    kind: "guest" | "subowner",
    targetName: string,
    grant: boolean,
  ) => void;
  onKick: (characterId: string) => void;
}

/**
 * Guest and subowner list management for the owner (subowners see and edit
 * guests only, mirroring the server rule that is re-checked at execution).
 */
export function HouseAccessSection({
  house,
  pending,
  onSetAccess,
  onKick,
}: HouseAccessSectionProps) {
  const { t } = useAppTranslation();
  const [guestName, setGuestName] = useState("");
  const [subownerName, setSubownerName] = useState("");
  const isOwner = house.myAccess === "owner";
  const lists: Array<{
    kind: "guest" | "subowner";
    entries: HouseState["guests"];
    draft: string;
    setDraft: (value: string) => void;
    canEdit: boolean;
  }> = [
    {
      kind: "guest",
      entries: house.guests,
      draft: guestName,
      setDraft: setGuestName,
      canEdit: true,
    },
    {
      kind: "subowner",
      entries: house.subowners,
      draft: subownerName,
      setDraft: setSubownerName,
      canEdit: isOwner,
    },
  ];
  return (
    <section className="flex flex-col gap-4">
      {lists.map(({ kind, entries, draft, setDraft, canEdit }) => (
        <div key={kind} className="flex flex-col gap-2">
          <h3 className="font-display text-[10px] font-bold tracking-widest text-ui-gold uppercase">
            {t(`house.accessLists.${kind}`)}
          </h3>
          {(entries ?? []).length === 0 ? (
            <p className="text-xs text-ui-muted">{t("house.noEntries")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {(entries ?? []).map((entry) => (
                <li
                  key={entry.characterId}
                  className="flex items-center justify-between gap-2 rounded-md bg-black/20 px-2 py-1"
                >
                  <span className="text-sm text-ui-text-bright">
                    {entry.name}
                  </span>
                  <span className="flex gap-1">
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => onKick(entry.characterId)}
                    >
                      {t("house.kick")}
                    </Button>
                    {canEdit && (
                      <Button
                        variant="danger"
                        disabled={pending}
                        onClick={() => onSetAccess(kind, entry.name, false)}
                      >
                        {t("house.remove")}
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = draft.trim();
                if (!trimmed) return;
                onSetAccess(kind, trimmed, true);
                setDraft("");
              }}
            >
              <Input
                aria-label={t(`house.addPlaceholder.${kind}`)}
                value={draft}
                placeholder={t(`house.addPlaceholder.${kind}`)}
                maxLength={20}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button type="submit" variant="primary" disabled={pending}>
                {t("house.add")}
              </Button>
            </form>
          )}
        </div>
      ))}
    </section>
  );
}
