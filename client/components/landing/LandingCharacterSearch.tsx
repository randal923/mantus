"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";

/** Compact "find a character" box in the landing sidebar. */
export function LandingCharacterSearch() {
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
    <form onSubmit={submit} className="portal-box p-[1.125rem]">
      <label
        htmlFor={inputId}
        className="mb-3 block font-display text-[0.6875rem] tracking-[0.22em] text-[#6e6a66] uppercase"
      >
        {t("characterLookup.formTitle")}
      </label>
      <input
        id={inputId}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("characterLookup.placeholder")}
        minLength={3}
        maxLength={20}
        autoComplete="off"
        className="w-full rounded-md border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-ui-text outline-none placeholder:text-[#5a5754] focus:border-white/25"
      />
      <button type="submit" className="portal-btn-ghost mt-2.5 w-full py-2.5">
        {t("characterLookup.search")}
      </button>
    </form>
  );
}
