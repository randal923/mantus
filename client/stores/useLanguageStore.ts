"use client";

import type { Language } from "@tibia/protocol";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { i18n } from "../i18n/i18n";

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: "en",
      setLanguage: (language) => {
        set({ language });
        void i18n
          .changeLanguage(language)
          .then(() => {
            if (typeof document === "undefined") return;
            document.documentElement.lang = language;
            document.title = i18n.t("metadata.title");
            document
              .querySelector('meta[name="description"]')
              ?.setAttribute("content", i18n.t("metadata.description"));
          })
          .catch((cause: unknown) => {
            console.error("language change failed", cause);
          });
      },
    }),
    {
      name: "mantus-language",
      onRehydrateStorage: () => (state) => {
        if (state) state.setLanguage(state.language);
      },
    },
  ),
);
