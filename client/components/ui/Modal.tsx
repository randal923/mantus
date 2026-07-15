"use client";

import { useEffect, type ReactNode } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { CloseButton } from "./CloseButton";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional action row rendered below a divider at the bottom of the panel. */
  footer?: ReactNode;
}

/** Centered dialog on a dimmed backdrop, styled like the game panels. */
export function Modal({ title, onClose, children, footer }: ModalProps) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="ui-panel-frame relative isolate flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col gap-5 overflow-hidden p-6 font-tibia text-ui-text"
      >
        <div
          aria-hidden
          className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.045] mix-blend-soft-light"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-0 -z-10 h-24 bg-radial from-ui-accent/12 to-transparent blur-xl"
        />
        <header className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate font-display text-xl tracking-[0.1em] text-ui-text-bright uppercase [text-shadow:0_2px_10px_rgba(0,0,0,0.9)]">
            {title}
          </h2>
          <CloseButton label={t("modal.close")} onClick={onClose} />
        </header>
        <div aria-hidden className="ui-divider" />

        <div className="min-h-0 overflow-y-auto pr-1 text-sm leading-6 text-ui-text/85">
          {children}
        </div>

        {footer && (
          <>
            <div aria-hidden className="ui-divider" />
            <footer className="flex justify-end gap-3">{footer}</footer>
          </>
        )}
      </section>
    </div>
  );
}
