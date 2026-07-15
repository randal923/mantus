import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import ptBr from "../locales/pt-BR.json";

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      "pt-BR": { translation: ptBr },
    },
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en", "pt-BR"],
    interpolation: { escapeValue: false },
    initAsync: false,
  });
}

export const i18n = i18next;
