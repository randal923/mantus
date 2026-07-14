"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import GameWindow from "../GameWindow";
import { getSupabaseClient } from "../../lib/auth/getSupabaseClient";
import { LoginScreen } from "./LoginScreen";

export function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [configError] = useState<string | null>(() => {
    try {
      getSupabaseClient();
      return null;
    } catch (cause) {
      return cause instanceof Error ? cause.message : String(cause);
    }
  });

  useEffect(() => {
    if (configError) return;
    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      // keep the object stable across token refreshes so the game socket
      // (already authenticated) isn't torn down every hour
      setSession((previous) =>
        previous && next && previous.user.id === next.user.id ? previous : next,
      ),
    );
    return () => data.subscription.unsubscribe();
  }, [configError]);

  if (configError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 p-4 text-center font-tibia text-sm text-ui-text">
        {configError}
      </div>
    );
  }
  if (!ready) return null;
  if (!session) return <LoginScreen />;
  return <GameWindow accessToken={session.access_token} />;
}
