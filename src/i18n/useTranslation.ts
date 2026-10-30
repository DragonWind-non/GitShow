import { useGitStore } from '../store/gitStore';
import { translations, type Language, type TranslationKey } from './translations';

export function getTranslation(key: TranslationKey, lang?: Language): string {
  const currentLang = lang || useGitStore.getState().language || 'en';
  const langDict = translations[currentLang];
  if (langDict && key in langDict) {
    return langDict[key];
  }
  if (translations.en && key in translations.en) {
    return translations.en[key];
  }
  return String(key);
}

export function useTranslation() {
  const language = useGitStore((state) => state.language);
  const setLanguage = useGitStore((state) => state.setLanguage);

  const t = (key: TranslationKey): string => {
    return getTranslation(key, language);
  };

  return { t, language, setLanguage };
}

