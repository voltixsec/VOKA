import { describe, expect, it } from 'vitest';

import { normalizeLocale, resolveCatalogText } from '../catalog-localization';

describe('catalog localization resolution', () => {
  const canonical = { name: 'Dome 4MP PoE', description: 'NVR compatible' };
  const localizations = [
    { locale: 'ar', name: 'كاميرا Dome 4MP PoE', description: 'متوافقة مع NVR', source: 'HUMAN' as const },
  ];

  it('prefers the maintained requested locale and preserves technical tokens', () => {
    expect(resolveCatalogText(canonical, localizations, 'AR')).toEqual({
      name: 'كاميرا Dome 4MP PoE',
      description: 'متوافقة مع NVR',
      requestedLocale: 'ar',
      resolvedLocale: 'ar',
      isFallback: false,
    });
  });

  it('uses an explicit deterministic canonical fallback without claiming translation', () => {
    expect(resolveCatalogText(canonical, localizations, 'fr-KW')).toEqual({
      name: 'Dome 4MP PoE',
      description: 'NVR compatible',
      requestedLocale: 'fr-kw',
      resolvedLocale: null,
      isFallback: true,
    });
  });

  it('normalizes valid extensible locales and rejects unsafe locale tokens', () => {
    expect(normalizeLocale('pt_BR')).toBe('pt-br');
    expect(normalizeLocale('../ar')).toBe('en');
  });
});
