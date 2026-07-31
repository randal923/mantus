"use client";

import { useLogin } from "../../hooks/useLogin";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { LanguageButtons } from "./LanguageButtons";
import { LoginPanel } from "./LoginPanel";

export function LoginScreen() {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const login = useLogin();

  return (
    <div className="ui-backdrop fixed inset-0 isolate flex items-center justify-center overflow-hidden p-4">
      <div aria-hidden className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.035]" />
      <div aria-hidden className="absolute inset-x-[12%] top-10 h-px bg-linear-to-r from-transparent via-ui-gold/25 to-transparent" />
      <div aria-hidden className="absolute inset-x-[20%] bottom-10 h-px bg-linear-to-r from-transparent via-ui-accent/30 to-transparent" />
      <div className="relative flex w-full max-w-md flex-col gap-4">
        <LoginPanel
          onSignIn={login.signIn}
          onSignUp={login.signUp}
          onGoogle={login.signInWithGoogle}
          busy={login.busy}
          error={login.errorKey ? t(login.errorKey) : null}
          notice={
            login.showConfirmationNotice ? t("auth.confirmationNotice") : null
          }
        />
        <LanguageButtons
          language={language}
          onChange={setLanguage}
          disabled={login.busy}
        />
      </div>
    </div>
  );
}
