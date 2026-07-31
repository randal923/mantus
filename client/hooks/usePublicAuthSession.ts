"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "../lib/auth/getSupabaseClient";

export function usePublicAuthSession() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;

    try {
      const supabase = getSupabaseClient();
      void supabase.auth
        .getSession()
        .then(({ data }) => {
          if (active) setSignedIn(Boolean(data.session));
        })
        .catch(() => {
          if (active) setSignedIn(false);
        });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (active) setSignedIn(Boolean(session));
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      return;
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return signedIn;
}
