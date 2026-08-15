"use client";

import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';
import { useMemo, useState } from 'react';

import { Input } from '../../../components/ui';

function flag(code: string) {
  return code.replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
}

export function CountryWhatsAppInput(props: {
  value: string;
  countryCode?: string | null;
  isArabic: boolean;
  onChange: (value: string, valid: boolean) => void;
}) {
  const parsedInitial = parsePhoneNumberFromString(props.value);
  const initialCountry = parsedInitial?.country ??
    (getCountries().includes(props.countryCode as CountryCode) ? props.countryCode as CountryCode : 'KW');
  const [country, setCountry] = useState<CountryCode>(initialCountry);
  const [national, setNational] = useState(parsedInitial?.nationalNumber ?? '');
  const [search, setSearch] = useState('');
  const names = useMemo(
    () => new Intl.DisplayNames([props.isArabic ? 'ar' : 'en'], { type: 'region' }),
    [props.isArabic],
  );
  const countries = useMemo(() => getCountries().map((code) => ({
    code,
    name: names.of(code) ?? code,
    dial: `+${getCountryCallingCode(code)}`,
  })).filter((item) => {
    const query = search.trim().toLowerCase();
    return !query || `${item.name} ${item.code} ${item.dial}`.toLowerCase().includes(query);
  }).sort((a, b) => a.name.localeCompare(b.name)), [names, search]);

  function emit(nextNational: string, nextCountry = country) {
    setNational(nextNational);
    if (!nextNational.trim()) {
      props.onChange('', true);
      return;
    }
    const parsed = parsePhoneNumberFromString(nextNational, nextCountry);
    props.onChange(parsed?.isValid() ? parsed.number : '', Boolean(parsed?.isValid()));
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-300">
        {props.isArabic ? 'رقم واتساب' : 'WhatsApp number'}
      </legend>
      <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr]">
        <div className="space-y-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={props.isArabic ? 'ابحث عن دولة' : 'Search countries'}
            aria-label={props.isArabic ? 'بحث الدول' : 'Search countries'}
          />
          <select
            aria-label={props.isArabic ? 'دولة رقم واتساب' : 'WhatsApp country'}
            value={country}
            onChange={(event) => {
              const next = event.target.value as CountryCode;
              setCountry(next);
              emit(national, next);
            }}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-sky-400/50 focus:ring-4 focus:ring-sky-400/10"
          >
            {countries.some((item) => item.code === country) || (
              <option value={country}>{flag(country)} {names.of(country)} +{getCountryCallingCode(country)}</option>
            )}
            {countries.map((item) => (
              <option key={item.code} value={item.code}>
                {flag(item.code)} {item.name} ({item.dial})
              </option>
            ))}
          </select>
        </div>
        <Input
          type="tel"
          dir="ltr"
          value={national}
          onChange={(event) => emit(event.target.value)}
          label={props.isArabic ? 'الرقم المحلي' : 'National number'}
          placeholder={props.isArabic ? 'أدخل الرقم بدون كود الدولة' : 'Enter without country code'}
          error={national && !props.value
            ? (props.isArabic ? 'أدخل رقماً صحيحاً لهذه الدولة' : 'Enter a valid number for this country')
            : undefined}
          aria-describedby={national && !props.value ? 'whatsapp-error' : undefined}
        />
      </div>
      <p className="text-xs text-slate-500" aria-live="polite">
        {props.value
          ? `${props.isArabic ? 'سيُحفظ بصيغة دولية:' : 'Will be saved as:'} ${props.value}`
          : (props.isArabic ? 'لن نعتبر الهاتف أو الجوال واتساب تلقائياً.' : 'Phone and mobile are never assumed to be WhatsApp.')}
      </p>
    </fieldset>
  );
}
