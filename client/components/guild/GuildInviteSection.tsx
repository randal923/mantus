"use client";

import { useState } from "react";
import type { GuildInviteEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface GuildInviteSectionProps {
  invites: ReadonlyArray<GuildInviteEntry>;
  pending: boolean;
  onInvite: (targetName: string) => void;
  onRevokeInvite: (characterId: string) => void;
}

/** Vice+/leader view: pending invitations plus the invite-by-name form. */
export function GuildInviteSection({
  invites,
  pending,
  onInvite,
  onRevokeInvite,
}: GuildInviteSectionProps) {
  const { t } = useAppTranslation();
  const [targetName, setTargetName] = useState("");

  return (
    <section aria-label={t("guild.invitesTitle")} className="flex flex-col gap-3">
      <h3 className="font-display text-sm tracking-widest text-ui-gold uppercase">
        {t("guild.invitesTitle")}
      </h3>
      <form
        className="flex max-w-md items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const name = targetName.trim();
          if (name.length === 0) return;
          onInvite(name);
          setTargetName("");
        }}
      >
        <Input
          aria-label={t("guild.invitePlaceholder")}
          placeholder={t("guild.invitePlaceholder")}
          value={targetName}
          maxLength={20}
          onChange={(event) => setTargetName(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button variant="primary" type="submit" disabled={pending}>
          {t("guild.invite")}
        </Button>
      </form>
      {invites.length === 0 ? (
        <p className="text-xs text-ui-muted">{t("guild.noPendingInvites")}</p>
      ) : (
        <ul className="flex max-w-md flex-col gap-1.5">
          {invites.map((invite) => (
            <li
              key={invite.characterId}
              className="flex items-center justify-between gap-3 rounded-md border border-ui-stone-light/10 bg-black/20 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-ui-text-bright">
                {invite.name}
              </span>
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() => onRevokeInvite(invite.characterId)}
              >
                {t("guild.revoke")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
