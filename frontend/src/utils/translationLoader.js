
export async function getAvailableLanguages() {
  try {
    const translationModules = import.meta.glob('../translations/*.json');
    const languages = [];

    for (const path in translationModules) {
      const match = path.match(/\/([^/]+)\.json$/);
      if (match) {
        languages.push(match[1]);
      }
    }

    return languages.sort();
  } catch (error) {
    console.error('Error detecting available languages:', error);
    return ['en'];
  }
}

export async function loadTranslationResources() {
  try {
    const translationModules = import.meta.glob('../translations/*.json');
    const resources = {};

    for (const path in translationModules) {
      const match = path.match(/\/([^/]+)\.json$/);
      if (match) {
        const languageCode = match[1];
        const module = await translationModules[path]();

        resources[languageCode] = {
          translation: module.default || module
        };
      }
    }

    return resources;
  } catch (error) {
    console.error('Error loading translation resources:', error);
    return {
      cs: { translation: {} },
      en: { translation: {} }
    };
  }
}

export function getLanguageDisplayName(languageCode) {
  const languageNames = {
    cs: 'Čeština',
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
    it: 'Italiano',
    pl: 'Polski',
    sk: 'Slovenčina',
    hu: 'Magyar',
    ru: 'Русский'
  };

  return languageNames[languageCode] || languageCode.toUpperCase();
}

export function getLanguageFlag(languageCode) { // flags as emoji, TODO: use better font/svgs
  const flags = {
    cs: '🇨🇿',
    en: '🇺🇸',
    de: '🇩🇪',
    fr: '🇫🇷',
    es: '🇪🇸',
    it: '🇮🇹',
    pl: '🇵🇱',
    sk: '🇸🇰',
    hu: '🇭🇺',
    ru: '🇷🇺'
  };

  return flags[languageCode] || '🌐';
}
