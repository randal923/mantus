"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { PublicSiteLayout } from "./PublicSiteLayout";

export function CharacterSearchPage() {
  const { t } = useAppTranslation();
  const router = useRouter();
  const [name, setName] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = name.trim().replace(/\s+/g, " ");
    if (!normalized) return;
    router.push(`/characters/${encodeURIComponent(normalized)}`);
  };

  return (
    <PublicSiteLayout>
      <section className="ui-panel-frame relative overflow-hidden p-6 sm:p-8">
        <h2 className="font-display text-lg font-bold tracking-wide text-ui-text-bright uppercase">
          {t("characterLookup.formTitle")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ui-muted">
          {t("characterLookup.formDescription")}
        </p>
        <form
          onSubmit={submit}
          className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end"
        >
          <Input
            label={t("characterLookup.name")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={3}
            maxLength={20}
            autoComplete="off"
            placeholder={t("characterLookup.placeholder")}
            className="flex-1"
          />
          <Button
            type="submit"
            variant="primary"
            className="h-11 justify-center px-8"
          >
            {t("characterLookup.search")}
          </Button>
        </form>
      </section>
    </PublicSiteLayout>
  );
}
