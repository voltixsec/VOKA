import type { Locale } from '../../lib/i18n';

type LanguageSwitcherProps = {
  locale: Locale;
  onChange: (locale: Locale) => void;
};

export function LanguageSwitcher({
  locale,
  onChange,
}: LanguageSwitcherProps) {
  return (
    <div
      className="inline-flex rounded-full border border-slate-700 bg-slate-900/80 p-1"
      role="group"
      aria-label="Language selector"
    >
      <button
        type="button"
        onClick={() => onChange('en')}
        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
          locale === 'en'
            ? 'bg-white text-slate-950'
            : 'text-slate-300 hover:text-white'
        }`}
        aria-pressed={locale === 'en'}
      >
        English
      </button>

      <button
        type="button"
        onClick={() => onChange('ar')}
        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
          locale === 'ar'
            ? 'bg-white text-slate-950'
            : 'text-slate-300 hover:text-white'
        }`}
        aria-pressed={locale === 'ar'}
      >
        العربية
      </button>
    </div>
  );
}