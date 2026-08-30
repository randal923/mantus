"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PublicSiteLayout } from "./PublicSiteLayout";

export function CharacterSearchPage() {
  const { t } = useAppTranslation();
  const router = useRouter();
  const inputId = useId();
  const [name, setName] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = name.trim().replace(/\s+/g, " ");
    if (!normalized) return;
    router.push(`/characters/${encodeURIComponent(normalized)}`);
  };

  return (
    <PublicSiteLayout>
      <section className="portal-box p-6 sm:p-8">
        <h2 className="font-display text-2xl font-semibold tracking-wide text-[#f2ece2]">
          {t("characterLookup.formTitle")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#8a8681]">
          {t("characterLookup.formDescription")}
        </p>
        <form
          onSubmit={submit}
          className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end"
        >
          <label className="flex flex-1 flex-col gap-2.5">
            <span
              id={inputId}
              className="font-display text-[0.6875rem] tracking-[0.22em] text-[#6e6a66] uppercase"
            >
              {t("characterLookup.name")}
            </span>
            <input
              aria-labelledby={inputId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={3}
              maxLength={20}
              autoComplete="off"
              placeholder={t("characterLookup.placeholder")}
              className="h-11 w-full rounded-md border border-white/10 bg-[#0a0a0a] px-3.5 text-sm text-ui-text outline-none placeholder:text-[#5a5754] focus:border-white/25"
            />
          </label>
          <button type="submit" className="portal-btn-ghost h-11 px-8">
            {t("characterLookup.search")}
          </button>
        </form>
      </section>
    </PublicSiteLayout>
  );
}
