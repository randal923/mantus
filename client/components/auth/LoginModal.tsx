"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useLogin } from "../../hooks/useLogin";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LoginPanel } from "./LoginPanel";

interface LoginModalProps {
  readonly onClose: () => void;
}

export function LoginModal({ onClose }: LoginModalProps) {
  const { t } = useAppTranslation();
  const login = useLogin(onClose);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-xs sm:p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("publicSite.logIn")}
        onClick={(event) => event.stopPropagation()}
        className="portal-box portal-box-warm flex max-h-full w-full max-w-md flex-col overflow-hidden font-tibia text-ui-text"
      >
        <header className="portal-box-header justify-between">
          <span className="portal-box-title">{t("publicSite.logIn")}</span>
          <button
            type="button"
            aria-label={t("modal.close")}
            title={t("modal.close")}
            onClick={onClose}
            className="portal-btn-ghost -my-1 -mr-1 size-8"
          >
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </header>
        <div className="ui-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          <LoginPanel
            embedded
            onSignIn={login.signIn}
            onSignUp={login.signUp}
            onGoogle={login.signInWithGoogle}
            busy={login.busy}
            error={login.errorKey ? t(login.errorKey) : null}
            notice={
              login.showConfirmationNotice ? t("auth.confirmationNotice") : null
            }
          />
        </div>
      </section>
    </div>,
    document.body,
  );
}
