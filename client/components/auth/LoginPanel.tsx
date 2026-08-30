"use client";

import { useState, type FormEvent } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { MantusLogo } from "../ui/MantusLogo";
import { GoogleIcon } from "./GoogleIcon";

interface LoginPanelProps {
  onSignIn: (email: string, password: string) => void;
  onSignUp: (email: string, password: string) => void;
  onGoogle: () => void;
  embedded?: boolean;
  busy?: boolean;
  error?: string | null;
  notice?: string | null;
}

const LABEL_CLASS =
  "font-display text-[0.6875rem] tracking-[0.22em] text-[#6e6a66] uppercase";

const INPUT_CLASS =
  "w-full rounded-md border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-ui-text outline-none placeholder:text-[#5a5754] focus:border-white/25";

export function LoginPanel({
  onSignIn,
  onSignUp,
  onGoogle,
  embedded = false,
  busy = false,
  error,
  notice,
}: LoginPanelProps) {
  const { t } = useAppTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSignIn(email, password);
  };

  return (
    <section
      aria-label={t("auth.signInLabel")}
      className={`${embedded ? "px-1 py-1 sm:px-2" : "portal-box portal-box-warm px-7 py-8 sm:px-9"} flex w-full flex-col gap-5 font-tibia text-ui-text`}
    >
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="contents">
          <MantusLogo className="mb-2" />
        </h1>
        <p className={LABEL_CLASS}>{t("auth.welcomeBack")}</p>
        <p className="text-sm text-[#97928c]">{t("auth.enterWorld")}</p>
      </header>
      <div aria-hidden className="h-px bg-white/5" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 has-disabled:pointer-events-none has-disabled:opacity-45">
          <span className={LABEL_CLASS}>{t("auth.email")}</span>
          <input
            type="email"
            autoComplete="email"
            required
            disabled={busy}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-2 has-disabled:pointer-events-none has-disabled:opacity-45">
          <span className={LABEL_CLASS}>{t("auth.password")}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            disabled={busy}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        {error && (
          <p
            role="alert"
            className="border-l-2 border-[#7e1f1f] bg-[#7e1f1f]/10 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="border-l-2 border-ui-success bg-ui-success/10 px-3 py-2 text-sm text-green-200">
            {notice}
          </p>
        )}
        <div className="mt-1 grid grid-cols-2 gap-3">
          <Button
            type="submit"
            variant="primary"
            className="portal-cta"
            disabled={busy}
          >
            {busy && (
              <span
                aria-hidden
                className="size-3 rotate-45 border border-current border-t-transparent motion-safe:animate-spin"
              />
            )}
            {busy ? t("auth.entering") : t("auth.signIn")}
          </Button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSignUp(email, password)}
            className="portal-btn-ghost px-4 py-2.5 disabled:pointer-events-none disabled:opacity-40"
          >
            {t("auth.createAccount")}
          </button>
        </div>
      </form>

      <div
        aria-hidden
        className={`flex items-center gap-3 ${LABEL_CLASS}`}
      >
        <span className="h-px flex-1 bg-linear-to-r from-transparent to-white/15" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-linear-to-l from-transparent to-white/15" />
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={onGoogle}
        className="portal-btn-ghost w-full py-3 disabled:pointer-events-none disabled:opacity-40"
      >
        <GoogleIcon />
        {t("auth.continueWithGoogle")}
      </button>
    </section>
  );
}
