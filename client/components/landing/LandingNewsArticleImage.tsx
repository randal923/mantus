"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { LandingNewsArticleImageData } from "./landingNewsArticles";

/**
 * The article's art as a thumbnail that opens a full-size lightbox, so a
 * gameplay screenshot can actually be read.
 */
export function LandingNewsArticleImage({
  image,
  alt,
}: {
  image: LandingNewsArticleImageData;
  alt: string;
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("landing.news.expandImage")}
        aria-label={t("landing.news.expandImage")}
        className="group relative block aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-md border border-white/10 focus-visible:border-white/40 focus-visible:outline-none"
      >
        <Image
          src={image.src}
          alt={alt}
          fill
          sizes="(min-width: 640px) 208px, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm sm:p-8"
        >
          <Image
            src={image.src}
            alt={alt}
            width={image.width}
            height={image.height}
            sizes="100vw"
            className="h-auto max-h-[88vh] w-auto max-w-full rounded-md border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.8)]"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("landing.news.closeImage")}
            className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full border border-white/20 bg-black/60 text-lg text-[#e8e3db] transition-colors hover:border-white/40 hover:text-white"
          >
            ✕
          </button>
        </div>
      ) : null}
    </>
  );
}
