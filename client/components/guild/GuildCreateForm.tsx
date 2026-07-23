"use client";

import { useState } from "react";
import { GUILD_LIMITS } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface GuildCreateFormProps {
  pending: boolean;
  onCreate: (name: string) => void;
}

/** Founding form shown while the character is guildless. */
export function GuildCreateForm({ pending, onCreate }: GuildCreateFormProps) {
  const { t } = useAppTranslation();
  const [name, setName] = useState("");

  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (trimmed.length < GUILD_LIMITS.minNameLength) return;
        onCreate(trimmed);
        setName("");
      }}
    >
      <h3 className="font-display text-sm tracking-widest text-ui-gold uppercase">
        {t("guild.createTitle")}
      </h3>
      <p className="text-sm text-ui-muted">{t("guild.createHint")}</p>
      <div className="flex items-end gap-2">
        <Input
          aria-label={t("guild.namePlaceholder")}
          placeholder={t("guild.namePlaceholder")}
          value={name}
          maxLength={GUILD_LIMITS.maxNameLength}
          onChange={(event) => setName(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button variant="primary" type="submit" disabled={pending}>
          {t("guild.create")}
        </Button>
      </div>
    </form>
  );
}
