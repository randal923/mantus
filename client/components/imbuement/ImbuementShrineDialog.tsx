"use client";

import { useEffect, type ReactNode } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { CloseButton } from "../ui/CloseButton";

interface ImbuementShrineDialogProps {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}

/** Large shrine-specific dialog frame matching the in-game imbuing workspace. */
export function ImbuementShrineDialog({
  title,
  children,
  footer,
  onClose,
}: ImbuementShrineDialogProps) {
  const { t } = useAppTranslation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-xs sm:p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="ui-panel-frame relative isolate flex h-[900px] max-h-[calc(100dvh-1rem)] w-full max-w-6xl min-w-0 flex-col overflow-hidden rounded-sm border-ui-gold/40 font-tibia text-ui-text sm:max-h-[calc(100dvh-2rem)]"
      >
        <div
          aria-hidden
          className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.045] mix-blend-soft-light"
        />
        <header className="relative shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
            <CloseButton
              label={t("modal.close")}
              onClick={onClose}
              className="size-10 rounded-full border-ui-gold/60 bg-ui-panel-deep/95 text-ui-gold"
            />
          </div>
          <div className="pr-14">
            <h2 className="font-display text-2xl font-bold tracking-wide text-ui-text-bright uppercase [text-shadow:0_2px_10px_rgba(0,0,0,0.9)] sm:text-3xl">
              {title}
            </h2>
          </div>
        </header>

        <div className="ui-scrollbar min-h-0 min-w-0 flex-1 overscroll-contain overflow-y-auto px-3 pb-3 sm:px-6 sm:pb-4">
          {children}
        </div>

        <div aria-hidden className="ui-divider shrink-0" />
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-3 py-2 sm:px-6">
          {footer}
        </footer>
      </section>
    </div>
  );
}
