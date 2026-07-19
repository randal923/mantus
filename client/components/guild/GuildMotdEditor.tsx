"use client";

import { useState } from "react";
import { GUILD_LIMITS } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface GuildMotdEditorProps {
  motd: string;
  canEdit: boolean;
  pending: boolean;
  onSetMotd: (motd: string) => void;
}

/** The message of the day, editable inline by the leader. */
export function GuildMotdEditor({
  motd,
  canEdit,
  pending,
  onSetMotd,
}: GuildMotdEditorProps) {
  const { t } = useAppTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(motd);

  if (editing) {
    return (
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSetMotd(draft.trim());
          setEditing(false);
        }}
      >
        <Input
          aria-label={t("guild.motd")}
          value={draft}
          maxLength={GUILD_LIMITS.maxMotdLength}
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button size="sm" type="submit" disabled={pending}>
          {t("guild.save")}
        </Button>
        <Button size="sm" onClick={() => setEditing(false)}>
          {t("guild.cancel")}
        </Button>
      </form>
    );
  }

  return (
    <p className="flex items-center gap-2 text-sm text-ui-text/85">
      <span className="min-w-0 flex-1 truncate italic">
        {motd.length > 0 ? motd : t("guild.noMotd")}
      </span>
      {canEdit && (
        <Button
          size="sm"
          onClick={() => {
            setDraft(motd);
            setEditing(true);
          }}
        >
          {t("guild.editMotd")}
        </Button>
      )}
    </p>
  );
}
