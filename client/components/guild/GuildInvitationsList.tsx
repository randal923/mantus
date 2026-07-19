"use client";

import type { GuildInvitationEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface GuildInvitationsListProps {
  invitations: ReadonlyArray<GuildInvitationEntry>;
  pending: boolean;
  onRespond: (guildId: string, accept: boolean) => void;
}

/** The character's own pending guild invitations (accept/decline). */
export function GuildInvitationsList({
  invitations,
  pending,
  onRespond,
}: GuildInvitationsListProps) {
  const { t } = useAppTranslation();

  return (
    <section aria-label={t("guild.invitationsTitle")} className="flex flex-col gap-3">
      <h3 className="font-display text-sm tracking-widest text-ui-gold uppercase">
        {t("guild.invitationsTitle")}
      </h3>
      {invitations.length === 0 ? (
        <p className="text-xs text-ui-muted">{t("guild.noInvitations")}</p>
      ) : (
        <ul className="flex max-w-md flex-col gap-2">
          {invitations.map((invitation) => (
            <li
              key={invitation.guildId}
              className="flex items-center justify-between gap-3 rounded-md border border-ui-stone-light/15 bg-black/25 px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm">
                <span className="text-ui-text-bright">
                  {invitation.guildName}
                </span>{" "}
                <span className="text-ui-muted">
                  {t("guild.invitedBy", { name: invitation.inviterName })}
                </span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={pending}
                  onClick={() => onRespond(invitation.guildId, true)}
                >
                  {t("guild.accept")}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() => onRespond(invitation.guildId, false)}
                >
                  {t("guild.decline")}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
