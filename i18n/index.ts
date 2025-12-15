import { pt, Translations } from './translations/pt';
import { es } from './translations/es';
import { en } from './translations/en';
import { fr } from './translations/fr';

export type LanguageCode = 'pt' | 'es' | 'en' | 'fr';

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  pt: 'Português',
  es: 'Español',
  en: 'English',
  fr: 'Français',
};

export const LANGUAGE_FLAGS: Record<LanguageCode, string> = {
  pt: '🇧🇷',
  es: '🇪🇸',
  en: '🇬🇧',
  fr: '🇫🇷',
};

const translations: Record<LanguageCode, Translations> = {
  pt,
  es,
  en,
  fr,
};

export function getTranslations(lang: LanguageCode): Translations {
  return translations[lang] || translations.pt;
}

export function interpolate(text: string, params: Record<string, string | number>): string {
  return text.replace(/{(\w+)}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

export { pt, es, en, fr };
export type { Translations };
