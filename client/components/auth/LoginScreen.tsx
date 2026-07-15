"use client";

import { useState } from "react";
import { getSupabaseClient } from "../../lib/auth/getSupabaseClient";
import { LoginPanel } from "./LoginPanel";

export function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const begin = () => {
    setBusy(true);
    setError(null);
    setNotice(null);
  };

  const signIn = async (email: string, password: string) => {
    begin();
    try {
      const result = await getSupabaseClient().auth.signInWithPassword({
        email,
        password,
      });
      setError(result.error?.message ?? null);
    } catch {
      setError("Connection failed");
    } finally {
      setBusy(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    begin();
    try {
      const result = await getSupabaseClient().auth.signUp({ email, password });
      setError(result.error?.message ?? null);
      if (!result.error && !result.data.session) {
        setNotice("Check your email to confirm your account.");
      }
    } catch {
      setError("Connection failed");
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
      setError(result.error?.message ?? null);
    } catch {
      setError("Connection failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ui-backdrop fixed inset-0 isolate flex items-center justify-center overflow-hidden p-4">
      <div aria-hidden className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.035]" />
      <div aria-hidden className="absolute inset-x-[12%] top-10 h-px bg-linear-to-r from-transparent via-ui-gold/25 to-transparent" />
      <div aria-hidden className="absolute inset-x-[20%] bottom-10 h-px bg-linear-to-r from-transparent via-ui-accent/30 to-transparent" />
      <div className="relative w-full max-w-md">
        <LoginPanel
          onSignIn={signIn}
          onSignUp={signUp}
          onGoogle={signInWithGoogle}
          busy={busy}
          error={error}
          notice={notice}
        />
      </div>
    </div>
  );
}
