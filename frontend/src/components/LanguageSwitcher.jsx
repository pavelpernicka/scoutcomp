import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";

export default function LanguageSwitcher({ isMobile = false }) {
  const { i18n } = useTranslation();
  const languages = i18n.options.supportedLngs?.filter((lng) => lng !== "cimode") || ["cs", "en"];
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const languageNames = {
    cs: "Čeština",
    en: "English"
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLanguageChange = (lang) => {
    i18n.changeLanguage(lang);
    setShowDropdown(false);
  };

  return (
    <div className={`dropdown ${isMobile ? 'w-100' : ''}`} ref={dropdownRef}>
      <button
        className={`btn btn-outline-light d-flex align-items-center px-3 py-2 ${isMobile ? 'w-100 justify-content-between' : ''}`}
        type="button"
        onClick={() => setShowDropdown(!showDropdown)}
        style={{ borderRadius: '20px' }}
        aria-label="Select language"
      >
        <div className="d-flex align-items-center">
          <i className="fas fa-globe me-2"></i>
          <span className="fw-bold">{i18n.language.toUpperCase()}</span>
        </div>
        <i className="fas fa-chevron-down ms-2"></i>
      </button>
      <ul className={`dropdown-menu ${isMobile ? 'w-100' : ''} shadow-lg border-0 mt-2 ${showDropdown ? 'show' : ''}`} style={{ position: isMobile ? 'static' : 'absolute' }}>
        {languages.map((lang) => (
          <li key={lang}>
            <button
              className={`dropdown-item d-flex align-items-center ${i18n.language === lang ? 'active' : ''}`}
              onClick={() => handleLanguageChange(lang)}
            >
              <i className="fas fa-language me-2"></i>
              {languageNames[lang] || lang.toUpperCase()}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}