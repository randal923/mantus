"use client";

import { useId, useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LandingMenuLink } from "./LandingMenuLink";

const WIKI_LINKS = [
  { key: "items", href: "/wiki/items" },
  { key: "pvp", href: "/wiki/pvp" },
] as const;

/** Collapsible Wiki group in the landing sidebar; open by default. */
export function LandingWikiMenu() {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(true);
  const listId = useId();

  return (
    <section className="border-t border-white/5">
      <h2 className={`m-0 ${open ? "border-b border-white/5" : ""}`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-2 px-[1.125rem] py-3 text-left font-display text-[0.6875rem] font-normal tracking-[0.22em] text-[#6e6a66] uppercase transition-colors hover:text-[#c9c4bd]"
        >
          {t("landing.menu.wiki.title")}
          <svg
            aria-hidden
            viewBox="0 0 12 12"
            className={`size-3 shrink-0 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </button>
      </h2>
      {open && (
        <ul id={listId} className="py-1.5">
          {WIKI_LINKS.map((link) => (
            <li key={link.key}>
              <LandingMenuLink
                href={link.href}
                label={t(`landing.menu.wiki.${link.key}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
