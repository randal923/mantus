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
    <section>
      <h2 className="portal-box-header p-0 font-display text-sm font-bold tracking-widest uppercase">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((current) => !current)}
          className="relative z-[2] flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left uppercase transition-colors hover:brightness-110"
        >
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="size-1.5 rotate-45 border border-ui-stone-light/60 bg-ui-stone-light/15"
            />
            <span className="portal-box-title">{t("landing.menu.wiki.title")}</span>
          </span>
          <svg
            aria-hidden
            viewBox="0 0 12 12"
            className={`size-3 shrink-0 text-ui-muted transition-transform ${
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
