import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { loadTranslationResources, getAvailableLanguages } from "./utils/translationLoader";

export async function initializeI18n() {
  const resources = await loadTranslationResources();
  const supportedLanguages = await getAvailableLanguages();

  await i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: false,
      supportedLngs: supportedLanguages,
      interpolation: { escapeValue: false },
      returnEmptyString: false,
      returnNull: false,
      returnObjects: false,
      detection: {
        order: ['localStorage', 'navigator', 'htmlTag'],
        lookupLocalStorage: 'i18nextLng',
        caches: ['localStorage'],
      },
      parseMissingKeyHandler: (key) => {
        console.warn(`Missing translation key: ${key}`);
        return `{${key}}`;
      },
      keySeparator: '.',
      nsSeparator: false,
    });

  return i18n;
}

initializeI18n().catch(console.error);

export default i18n;
