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
    <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 p-4">
      <LoginPanel
        onSignIn={signIn}
        onSignUp={signUp}
        onGoogle={signInWithGoogle}
        busy={busy}
        error={error}
        notice={notice}
      />
    </div>
  );
}
