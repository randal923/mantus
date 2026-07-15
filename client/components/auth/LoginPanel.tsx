"use client";

import { useState, type FormEvent } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { MantusLogo } from "../ui/MantusLogo";
import { GoogleIcon } from "./GoogleIcon";

interface LoginPanelProps {
  onSignIn: (email: string, password: string) => void;
  onSignUp: (email: string, password: string) => void;
  onGoogle: () => void;
  busy?: boolean;
  error?: string | null;
  notice?: string | null;
}

export function LoginPanel({
  onSignIn,
  onSignUp,
  onGoogle,
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
      className="ui-panel-frame relative isolate flex w-full flex-col gap-5 overflow-hidden px-7 py-8 font-tibia text-ui-text sm:px-9"
    >
      <div
        aria-hidden
        className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.045] mix-blend-soft-light"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-12 top-0 -z-10 h-32 bg-radial from-ui-accent/15 to-transparent blur-2xl"
      />
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="contents">
          <MantusLogo className="mb-2" />
        </h1>
        <p className="text-[10px] tracking-[0.34em] text-ui-gold uppercase">
          {t("auth.welcomeBack")}
        </p>
        <p className="text-sm text-ui-muted">{t("auth.enterWorld")}</p>
      </header>
      <div aria-hidden className="ui-divider" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label={t("auth.email")}
          type="email"
          autoComplete="email"
          required
          disabled={busy}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label={t("auth.password")}
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          disabled={busy}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && (
          <p role="alert" className="border-l-2 border-ui-accent bg-ui-accent/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        {notice && (
          <p className="border-l-2 border-ui-success bg-ui-success/10 px-3 py-2 text-sm text-green-200">
            {notice}
          </p>
        )}
        <div className="mt-1 grid grid-cols-2 gap-3">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy && (
              <span
                aria-hidden
                className="size-3 rotate-45 border border-current border-t-transparent motion-safe:animate-spin"
              />
            )}
            {busy ? t("auth.entering") : t("auth.signIn")}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => onSignUp(email, password)}
          >
            {t("auth.createAccount")}
          </Button>
        </div>
      </form>

      <div
        aria-hidden
        className="flex items-center gap-3 text-[10px] tracking-[0.22em] text-ui-muted uppercase"
      >
        <span className="h-px flex-1 bg-linear-to-r from-transparent to-ui-gold/35" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-linear-to-l from-transparent to-ui-gold/35" />
      </div>

      <Button
        type="button"
        disabled={busy}
        onClick={onGoogle}
        className="w-full"
      >
        <GoogleIcon />
        {t("auth.continueWithGoogle")}
      </Button>
    </section>
  );
}
