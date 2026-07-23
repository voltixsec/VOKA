import ar from '../locales/ar.json';
import en from '../locales/en.json';
import { type Locale } from '../lib/i18n';
import type { Translations } from '../types/translation';

const translations: Record<Locale, Translations> = {
  en,
  ar
};

export function getTranslations(locale: Locale = 'en') {
  return translations[locale] ?? translations.en;
}
