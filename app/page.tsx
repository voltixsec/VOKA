'use client';

import { useEffect, useMemo, useState } from 'react';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { getTranslations } from '../services/translation';
import { DEFAULT_LOCALE, getDirection, type Locale } from '../lib/i18n';
import type { Translations } from '../types/translation';

export default function Home() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const storedLocale = window.localStorage.getItem('voka-locale') as Locale | null;
    if (storedLocale === 'en' || storedLocale === 'ar') {
      setLocale(storedLocale);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('voka-locale', locale);
  }, [locale]);

  const t = useMemo<Translations>(() => getTranslations(locale), [locale]);

  return (
    <main dir={getDirection(locale)} className="relative overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-slate-900 via-slate-950 to-transparent opacity-80" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-72 bg-[radial-gradient(circle_at_top_right,_rgba(96,165,250,0.18),_transparent_40%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-72 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.14),_transparent_30%)]" />

      <section className="relative mx-auto max-w-7xl px-6 py-10 sm:px-10 lg:px-14">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-slate-700/70 bg-white/5 px-4 py-2 text-sm text-slate-200 shadow-soft">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              {t.badge}
            </div>
            <div className="mt-8 flex flex-col gap-6 lg:max-w-2xl">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-4">
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{t.tagline}</p>
                  <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">{t.headline}</h1>
                  <p className="max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">{t.description}</p>
                </div>
                <LanguageSwitcher locale={locale} onChange={setLocale} />
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center rounded-full bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  {t.cta.startFree}
                </a>
                <a
                  href="#demo"
                  className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/70 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-slate-500 hover:bg-slate-900"
                >
                  {t.cta.bookDemo}
                </a>
              </div>
            </div>
          </div>

          <div className="relative isolate overflow-hidden rounded-4xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.18),_transparent_35%)]" />
            <div className="relative space-y-6 text-slate-100">
              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-soft">
                <p className="text-sm uppercase tracking-[0.24em] text-sky-300/80">{t.hero.liveDemoTitle}</p>
                <h2 className="mt-3 text-2xl font-semibold">{t.hero.liveDemoHeadline}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">{t.hero.liveDemoDescription}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{t.hero.statusLabel}</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{t.hero.statusValue}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{t.hero.timeSavedLabel}</p>
                  <p className="mt-3 text-2xl font-semibold text-white"><span className="text-sky-300">{t.hero.timeSavedValue}</span></p>
                </div>
              </div>
            </div>
          </div>
        </header>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 sm:px-10 lg:px-14">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6 rounded-4xl border border-white/10 bg-slate-900/70 p-8 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{t.features.titleLabel}</p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">{t.features.title}</h2>
            <p className="max-w-2xl text-base leading-7 text-slate-300">{t.features.description}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {t.features.featureCards.map((feature) => (
                <article key={feature.title} className="rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-soft">
                  <p className="text-sm uppercase tracking-[0.28em] text-slate-500">{feature.accent}</p>
                  <h3 className="mt-4 text-xl font-semibold text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="space-y-6 rounded-4xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-950/70 to-slate-900/90 p-8 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
            <div className="rounded-3xl bg-slate-950/90 p-6 ring-1 ring-white/10">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{t.features.whyLabel}</p>
              <h3 className="mt-4 text-2xl font-semibold text-white">{t.features.whyTitle}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{t.features.whyDescription}</p>
            </div>
            <div className="grid gap-4">
              {t.features.whyFeatures.map((item) => (
                <div key={item.title} className="rounded-3xl border border-white/10 bg-slate-900/90 p-5">
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-14">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="space-y-6">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{t.work.titleLabel}</p>
            <h2 className="text-4xl font-semibold text-white sm:text-5xl">{t.work.title}</h2>
            <p className="max-w-xl text-base leading-7 text-slate-300">{t.work.description}</p>
          </div>
          <div className="grid gap-4">
            {t.work.steps.map((step, index) => (
              <div key={step.title} className="rounded-4xl border border-white/10 bg-slate-900/85 p-8 shadow-soft">
                <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-slate-800 text-xl font-semibold text-sky-300">{index + 1}</div>
                <h3 className="mt-5 text-xl font-semibold text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 sm:px-10 lg:px-14" id="pricing">
        <div className="rounded-4xl border border-white/10 bg-slate-900/70 p-10 shadow-2xl shadow-slate-950/15 backdrop-blur-xl">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl space-y-4">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{t.pricing.titleLabel}</p>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">{t.pricing.title}</h2>
              <p className="text-base leading-7 text-slate-300">{t.pricing.description}</p>
            </div>
            <div className="rounded-3xl bg-slate-950/90 px-6 py-4 text-center ring-1 ring-white/10">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-500">{t.pricing.placeholderLabel}</p>
              <p className="mt-3 text-3xl font-semibold text-white">{t.pricing.placeholderTitle}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-14">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-5">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{t.faq.titleLabel}</p>
            <h2 className="text-4xl font-semibold text-white sm:text-5xl">{t.faq.title}</h2>
            <p className="max-w-xl text-base leading-7 text-slate-300">{t.faq.description}</p>
          </div>
          <div className="space-y-4">
            {t.faq.items.map((faq) => (
              <div key={faq.question} className="rounded-4xl border border-white/10 bg-slate-950/90 p-6 shadow-soft">
                <h3 className="text-lg font-semibold text-white">{faq.question}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-slate-950/60 px-6 py-10 text-slate-500 sm:px-10 lg:px-14">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xl font-semibold text-white">{t.brand}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">{t.footer.description}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-500">
            <a href="#pricing" className="transition hover:text-white">{t.footer.links.pricing}</a>
            <a href="#demo" className="transition hover:text-white">{t.footer.links.demo}</a>
            <a href="#" className="transition hover:text-white">{t.footer.links.contact}</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
