"use client";

import { useEffect } from "react";
import { getBrowserLanguage } from "../lib/i18n/getBrowserLanguage";
import { LANGUAGE_STORAGE_KEY } from "../stores/languageStorageKey";
import { useLanguageStore } from "../stores/useLanguageStore";

/**
 * Applies the visitor's language after hydration: the persisted choice when
 * one exists, otherwise the browser language. Deferring this to an effect
 * keeps the first client render identical to the server-rendered HTML. The
 * account setting pushed on login still wins — it arrives later, via auth-ok.
 */
export function useLanguageInitialization() {
  useEffect(() => {
    if (window.localStorage.getItem(LANGUAGE_STORAGE_KEY) !== null) {
      void useLanguageStore.persist.rehydrate();
      return;
    }
    useLanguageStore
      .getState()
      .setLanguage(getBrowserLanguage(navigator.language));
  }, []);
}
