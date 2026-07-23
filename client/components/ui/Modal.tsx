"use client";

import { useEffect, type ReactNode } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import { ModalTabButton } from "./ModalTabButton";

export interface ModalPagination {
  currentPage: number;
  totalPages: number;
  disabled?: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export interface ModalTab {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface ModalTabs {
  /** Accessible name for the tablist. */
  label: string;
  items: ModalTab[];
  selected: string;
  onSelect: (id: string) => void;
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Controlled tab bar rendered above the content; children render the selected panel. */
  tabs?: ModalTabs;
  pagination?: ModalPagination;
  /** Optional action row rendered below a divider at the bottom of the panel. */
  footer?: ReactNode;
  size?: "default" | "wide" | "extra-wide";
}

/** Centered dialog on a dimmed backdrop, styled like the game panels. */
export function Modal({
  title,
  onClose,
  children,
  tabs,
  pagination,
  footer,
  size = "default",
}: ModalProps) {
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
        className={`ui-panel-frame relative isolate flex max-h-[calc(100dvh-1rem)] min-w-0 w-full flex-col gap-3 overflow-hidden p-3 font-tibia text-ui-text sm:max-h-4/5 sm:gap-5 sm:p-6 ${
          size === "extra-wide"
            ? "max-w-7xl"
            : size === "wide"
              ? "max-w-5xl"
              : "max-w-md"
        }`}
      >
        <div
          aria-hidden
          className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.045] mix-blend-soft-light"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-0 -z-10 h-24 bg-radial from-ui-accent/12 to-transparent blur-xl"
        />
        <header className="flex shrink-0 items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate font-display text-base tracking-[0.1em] text-ui-text-bright uppercase [text-shadow:0_2px_10px_rgba(0,0,0,0.9)] sm:text-xl">
            {title}
          </h2>
          <CloseButton label={t("modal.close")} onClick={onClose} />
        </header>
        <div aria-hidden className="ui-divider" />

        {tabs && (
          <>
            <div
              role="tablist"
              aria-label={tabs.label}
              className="ui-scrollbar flex shrink-0 gap-2 overflow-x-auto pb-1"
            >
              {tabs.items.map((tab) => (
                <ModalTabButton
                  key={tab.id}
                  label={tab.label}
                  icon={tab.icon}
                  selected={tabs.selected === tab.id}
                  onClick={() => tabs.onSelect(tab.id)}
                />
              ))}
            </div>
            <div aria-hidden className="ui-divider" />
          </>
        )}

        <div
          role={tabs ? "tabpanel" : undefined}
          className="ui-scrollbar min-h-0 min-w-0 flex-1 overscroll-contain overflow-y-auto pr-1 text-sm leading-6 text-ui-text/85"
        >
          {children}
        </div>

        {pagination && (
          <>
            <div aria-hidden className="ui-divider" />
            <nav
              aria-label={t("modal.pagination.label")}
              className="flex shrink-0 items-center justify-between"
            >
              <Button
                size="sm"
                disabled={pagination.disabled || pagination.currentPage <= 1}
                onClick={pagination.onPrevious}
              >
                {t("modal.pagination.previous")}
              </Button>
              <span className="text-sm text-ui-muted">
                {t("modal.pagination.pageOf", {
                  page: pagination.currentPage,
                  total: pagination.totalPages,
                })}
              </span>
              <Button
                size="sm"
                disabled={
                  pagination.disabled ||
                  pagination.currentPage >= pagination.totalPages
                }
                onClick={pagination.onNext}
              >
                {t("modal.pagination.next")}
              </Button>
            </nav>
          </>
        )}

        {footer && (
          <>
            <div aria-hidden className="ui-divider" />
            <footer className="flex shrink-0 flex-wrap justify-end gap-3">
              {footer}
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
