"use client";

import { useState } from "react";
import { getSupabaseClient } from "../lib/auth/getSupabaseClient";
import { getAuthErrorTranslationKey } from "../lib/auth/getAuthErrorTranslationKey";

export function useLogin(onSignedIn?: () => void) {
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<
    | ReturnType<typeof getAuthErrorTranslationKey>
    | "auth.errors.connectionFailed"
    | null
  >(null);
  const [showConfirmationNotice, setShowConfirmationNotice] = useState(false);

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
      if (!result.error && result.data.session) onSignedIn?.();
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
      if (!result.error && result.data.session) {
        onSignedIn?.();
      } else if (!result.error) {
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

  return {
    busy,
    errorKey,
    showConfirmationNotice,
    signIn,
    signUp,
    signInWithGoogle,
  };
}
