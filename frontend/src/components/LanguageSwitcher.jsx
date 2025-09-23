import { useTranslation } from "react-i18next";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const languages = i18n.options.supportedLngs?.filter((lng) => lng !== "cimode") || ["cs", "en"];

  return (
    <select
      aria-label="Select language"
      value={i18n.language}
      onChange={(event) => i18n.changeLanguage(event.target.value)}
    >
      {languages.map((lang) => (
        <option key={lang} value={lang}>
          {lang.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
