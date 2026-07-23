export type Locale = 'en' | 'ar';

export const DEFAULT_LOCALE: Locale = 'en';

export const RTL_LOCALES: Locale[] = ['ar'];

export function isRtl(locale: Locale) {
  return RTL_LOCALES.includes(locale);
}

export function getDirection(locale: Locale) {
  return isRtl(locale) ? 'rtl' : 'ltr';
}
