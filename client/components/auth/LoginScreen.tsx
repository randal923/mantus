"use client";

import { useEffect, useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { getSupabaseClient } from "../../lib/auth/getSupabaseClient";
import { getAuthErrorTranslationKey } from "../../lib/auth/getAuthErrorTranslationKey";
import { getBrowserLanguage } from "../../lib/i18n/getBrowserLanguage";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { LanguageButtons } from "./LanguageButtons";
import { LoginPanel } from "./LoginPanel";

export function LoginScreen() {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<
    | ReturnType<typeof getAuthErrorTranslationKey>
    | "auth.errors.connectionFailed"
    | null
  >(null);
  const [showConfirmationNotice, setShowConfirmationNotice] = useState(false);

  useEffect(() => {
    setLanguage(getBrowserLanguage(navigator.language));
  }, [setLanguage]);

  const begin = () => {
    setBusy(true);
    setErrorKey(null);
    setShowConfirmationNotice(false);
  };

  const signIn = async (email: string, password: string) => {
    begin();
    try {
      const result = await getSupabaseClient().auth.signInWithPassword({
        email,
        password,
      });
      setErrorKey(
        result.error ? getAuthErrorTranslationKey(result.error.code) : null,
      );
    } catch {
      setErrorKey("auth.errors.connectionFailed");
    } finally {
      setBusy(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    begin();
    try {
      const result = await getSupabaseClient().auth.signUp({ email, password });
      setErrorKey(
        result.error ? getAuthErrorTranslationKey(result.error.code) : null,
      );
      if (!result.error && !result.data.session) {
        setShowConfirmationNotice(true);
      }
    } catch {
      setErrorKey("auth.errors.connectionFailed");
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    begin();
    try {
      const result = await getSupabaseClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      setErrorKey(
        result.error ? getAuthErrorTranslationKey(result.error.code) : null,
      );
    } catch {
      setErrorKey("auth.errors.connectionFailed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ui-backdrop fixed inset-0 isolate flex items-center justify-center overflow-hidden p-4">
      <div aria-hidden className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.035]" />
      <div aria-hidden className="absolute inset-x-[12%] top-10 h-px bg-linear-to-r from-transparent via-ui-gold/25 to-transparent" />
      <div aria-hidden className="absolute inset-x-[20%] bottom-10 h-px bg-linear-to-r from-transparent via-ui-accent/30 to-transparent" />
      <div className="relative flex w-full max-w-md flex-col gap-4">
        <LoginPanel
          onSignIn={signIn}
          onSignUp={signUp}
          onGoogle={signInWithGoogle}
          busy={busy}
          error={errorKey ? t(errorKey) : null}
          notice={
            showConfirmationNotice ? t("auth.confirmationNotice") : null
          }
        />
        <LanguageButtons
          language={language}
          onChange={setLanguage}
          disabled={busy}
        />
      </div>
    </div>
  );
}
