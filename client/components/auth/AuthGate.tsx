"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import GameWindow from "../GameWindow";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { getSupabaseClient } from "../../lib/auth/getSupabaseClient";
import { LoginScreen } from "./LoginScreen";

export function AuthGate() {
  const { t } = useAppTranslation();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [configError] = useState(() => {
    try {
      getSupabaseClient();
      return false;
    } catch {
      return true;
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
      <div className="ui-backdrop fixed inset-0 flex items-center justify-center p-4 text-center font-tibia text-sm text-ui-text">
        <div className="ui-panel-frame relative max-w-md px-6 py-5 text-ui-accent-light">
          {t("configuration.supabase")}
        </div>
      </div>
    );
  }
  if (!ready) return null;
  if (!session) return <LoginScreen />;
  return (
    <GameWindow
      accessToken={session.access_token}
      onLogout={async () => {
        const { error } = await getSupabaseClient().auth.signOut();
        if (error) throw error;
      }}
    />
  );
}
