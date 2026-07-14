"use client";

import { useEffect, type ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional action row rendered below a divider at the bottom of the panel. */
  footer?: ReactNode;
}

/** Centered dialog on a dimmed backdrop, styled like the game panels. */
export function Modal({ title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="relative isolate flex w-full max-w-md flex-col gap-3 overflow-hidden rounded-sm border border-[#3a5054] bg-radial-[at_50%_8%] from-ui-panel-light via-ui-panel via-55% to-ui-panel-deep p-4 font-tibia text-ui-text shadow-[0_4px_20px_rgba(0,0,0,0.7),inset_0_0_0_1px_rgba(0,0,0,0.7)]"
      >
        <div
          aria-hidden
          className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-50 mix-blend-overlay"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-linear-to-b from-[#2c5b5c]/60 to-transparent"
        />
        <header className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate font-display text-2xl leading-7 tracking-wide [font-variant:small-caps] [text-shadow:0_2px_4px_rgba(0,0,0,0.8)]">
            {title}
          </h2>
          <button
            aria-label="Close dialog"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-sm border border-[#1b2126] bg-linear-to-b from-[#c65a54] via-[#9c3434] via-40% to-[#611c1c] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_3px_rgba(0,0,0,0.5)] hover:brightness-115 active:bg-linear-to-t"
          >
            ✕
          </button>
        </header>
        <div aria-hidden className="h-px bg-linear-to-r from-transparent via-ui-accent/50 to-transparent" />

        <div className="text-sm">{children}</div>

        {footer && (
          <>
            <div aria-hidden className="h-px bg-linear-to-r from-transparent via-ui-accent/50 to-transparent" />
            <footer className="flex justify-end gap-2">{footer}</footer>
          </>
        )}
      </section>
    </div>
  );
}
