"use client";

import Link from "next/link";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { MantusLogo } from "../ui/MantusLogo";
import { PublicAuthAction } from "./PublicAuthAction";

export function PublicSiteHeader() {
  const { t } = useAppTranslation();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#080808]/85 backdrop-blur-md">
      <div className="mx-auto flex min-h-[4.5rem] w-full max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
        <Link
          href="/"
          aria-label={t("brand.name")}
          className="shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ui-gold/60"
        >
          <MantusLogo size="md" />
        </Link>
        <PublicAuthAction size="sm" />
      </div>
    </header>
  );
}
