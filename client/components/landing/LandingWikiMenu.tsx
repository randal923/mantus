"use client";

import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LandingMenuLink } from "./LandingMenuLink";

const WIKI_LINKS = [{ key: "items", href: "/wiki/items" }] as const;

/** Collapsible Wiki group in the landing sidebar; opens on /wiki pages. */
export function LandingWikiMenu() {
  const { t } = useAppTranslation();
  // Typed `string`, but Storybook's next/navigation mock returns null.
  const pathname = usePathname() as string | null;
  const [open, setOpen] = useState(() => pathname?.startsWith("/wiki") ?? false);
  const listId = useId();

  return (
    <section className="border-b border-ui-stone-light/15 last:border-b-0">
      <h2
        className={`bg-black/35 font-display text-xs font-bold tracking-widest text-ui-text-bright uppercase ${
          open ? "border-b border-ui-stone-light/15" : ""
        }`}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:bg-white/5"
        >
          {t("landing.menu.wiki.title")}
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
