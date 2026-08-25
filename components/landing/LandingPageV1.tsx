"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { DEFAULT_LOCALE, getDirection, type Locale } from "../../lib/i18n";

const COPY = {
  en: {
    eyebrow: "Voice-first commercial operations", headline: "Speak. Understand. Quote.",
    lead: "Turn a customer request into a clear, editable quotation—then manage approval, orders, invoices, and payments in one governed workspace.",
    signIn: "Sign in", explore: "See how it works", request: "Customer request", draft: "Draft for review",
    example: "I need a quotation to supply and install 8 cameras for a villa.",
    proof: ["Human approval before every commercial commitment", "Arabic and English documents", "Deterministic quantities and server-authoritative totals"],
    flowTitle: "From request to receivable", flowLead: "VOKA keeps commercial work simple without hiding control or inventing facts.",
    steps: [["Speak or type", "Capture the customer request naturally in Arabic or English."], ["Review the draft", "Resolve customers and catalog items, then verify quantities, prices, tax, and terms."], ["Run the lifecycle", "Approve, deliver, convert, invoice, and record settlement with a complete history."]],
    capabilitiesTitle: "One commercial workspace",
    capabilities: [["Smart quotations", "Editable bilingual drafts with explicit provenance and approval controls."], ["System builder", "Versioned deterministic rules for CCTV, gypsum, and access-control scopes."], ["Sales lifecycle", "Quotation revisions, Sales Orders, Contracts, Invoices, and Payments."], ["Trusted catalog", "Tenant catalog plus governed universal retrieval—without loading a global library into the browser."]],
    finalTitle: "Less administration. More commercial clarity.", finalLead: "Enter your secure workspace and continue from the customer request to collection.", nav: "Main navigation",
  },
  ar: {
    eyebrow: "تشغيل تجاري يبدأ بالصوت", headline: "تكلّم. نفهم. نُعِدّ عرض السعر.",
    lead: "حوّل طلب العميل إلى عرض سعر واضح وقابل للتعديل، ثم أدر الاعتماد والأوامر والفواتير والتحصيل داخل مساحة عمل واحدة منضبطة.",
    signIn: "تسجيل الدخول", explore: "اعرف كيف تعمل فوكا", request: "طلب العميل", draft: "مسودة للمراجعة",
    example: "أحتاج عرض سعر لتوريد وتركيب 8 كاميرات لفيلا.",
    proof: ["اعتماد بشري قبل أي التزام تجاري", "مستندات عربية وإنجليزية", "كميات حتمية وإجماليات يحسبها الخادم"],
    flowTitle: "من طلب العميل إلى التحصيل", flowLead: "تجعل فوكا العمل التجاري بسيطًا من دون إخفاء التحكم أو اختلاق المعلومات.",
    steps: [["تكلّم أو اكتب", "سجّل طلب العميل بطبيعته بالعربية أو الإنجليزية."], ["راجع المسودة", "ثبّت العميل والأصناف، ثم راجع الكميات والأسعار والضريبة والشروط."], ["أكمل الدورة التجارية", "اعتمد وأرسل وحوّل إلى أمر بيع، ثم أصدر الفاتورة وسجّل التحصيل بتاريخ كامل."]],
    capabilitiesTitle: "مساحة واحدة للعمل التجاري",
    capabilities: [["عروض أسعار ذكية", "مسودات ثنائية اللغة قابلة للتعديل، مع مصدر واضح وضوابط اعتماد."], ["بناء الأنظمة", "قواعد هندسية حتمية ومُرقّمة لأنظمة الكاميرات والجبس والتحكم بالدخول."], ["دورة المبيعات", "مراجعات عروض الأسعار وأوامر البيع والعقود والفواتير والمدفوعات."], ["كتالوج موثوق", "كتالوج الشركة مع بحث عالمي محكوم، من دون تحميل المكتبة كاملة في المتصفح."]],
    finalTitle: "إدارة أقل. وضوح تجاري أكبر.", finalLead: "ادخل مساحة العمل الآمنة وأكمل الرحلة من طلب العميل حتى التحصيل.", nav: "التنقل الرئيسي",
  },
} as const;

export function LandingPageV1() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => { const stored = window.localStorage.getItem("voka-locale"); if (stored === "ar" || stored === "en") setLocale(stored); }, []);
  useEffect(() => { window.localStorage.setItem("voka-locale", locale); document.documentElement.lang = locale; document.documentElement.dir = getDirection(locale); }, [locale]);
  const c = COPY[locale];
  return <main dir={getDirection(locale)} className="min-h-screen overflow-hidden bg-slate-950 text-slate-100">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-10 lg:px-14"><Link href="/" aria-label="VOKA home" className="text-2xl font-bold tracking-[0.16em]">VOKA</Link><nav aria-label={c.nav} className="flex items-center gap-3"><LanguageSwitcher locale={locale} onChange={setLocale} /><Link href="/login" className="rounded-full border border-sky-400/60 px-5 py-2.5 text-sm font-semibold text-sky-100 hover:bg-sky-400/10">{c.signIn}</Link></nav></header>
    <section className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-14 sm:px-10 lg:grid-cols-[1.12fr_.88fr] lg:items-center lg:px-14 lg:pt-24"><div className="absolute -top-32 end-0 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" /><div className="relative"><p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">{c.eyebrow}</p><h1 className="mt-6 max-w-4xl text-5xl font-bold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">{c.headline}</h1><p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">{c.lead}</p><div className="mt-9 flex flex-wrap gap-4"><Link href="/login" className="rounded-full bg-sky-400 px-7 py-3.5 font-bold text-slate-950 hover:bg-sky-300">{c.signIn}</Link><a href="#workflow" className="rounded-full border border-slate-700 px-7 py-3.5 font-semibold hover:border-slate-500">{c.explore}</a></div></div><aside className="relative rounded-[2rem] border border-white/10 bg-slate-900/75 p-6 shadow-2xl shadow-sky-950/30 sm:p-8"><div className="rounded-2xl border border-sky-400/20 bg-slate-950 p-5"><p className="text-sm text-sky-300">{c.request}</p><p className="mt-3 text-lg leading-8">{c.example}</p></div><div className="my-5 flex items-center gap-3 text-sm text-slate-400"><span className="h-px flex-1 bg-slate-700" /><span>{c.draft}</span><span className="h-px flex-1 bg-slate-700" /></div><div className="grid gap-3">{c.proof.map((item) => <div key={item} className="flex items-start gap-3 rounded-xl bg-white/[0.04] p-4 text-sm leading-6"><span aria-hidden="true" className="mt-1 text-emerald-400">✓</span><span>{item}</span></div>)}</div></aside></section>
    <section id="workflow" className="border-y border-white/10 bg-slate-900/35"><div className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-14"><div className="max-w-3xl"><h2 className="text-3xl font-bold sm:text-4xl">{c.flowTitle}</h2><p className="mt-4 text-lg leading-8 text-slate-400">{c.flowLead}</p></div><ol className="mt-10 grid gap-5 lg:grid-cols-3">{c.steps.map(([title, description], index) => <li key={title} className="rounded-3xl border border-white/10 bg-slate-950 p-6"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-400 font-bold text-slate-950">{index + 1}</span><h3 className="mt-5 text-xl font-bold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{description}</p></li>)}</ol></div></section>
    <section className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-14"><h2 className="text-3xl font-bold sm:text-4xl">{c.capabilitiesTitle}</h2><div className="mt-10 grid gap-5 md:grid-cols-2">{c.capabilities.map(([title, description]) => <article key={title} className="rounded-3xl border border-white/10 p-6"><h3 className="text-xl font-bold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{description}</p></article>)}</div></section>
    <section className="px-6 pb-20 sm:px-10 lg:px-14"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 rounded-[2rem] bg-sky-400 p-8 text-slate-950 sm:p-10 lg:flex-row lg:items-center"><div><h2 className="text-3xl font-bold">{c.finalTitle}</h2><p className="mt-3 max-w-2xl text-lg leading-8 text-slate-800">{c.finalLead}</p></div><Link href="/login" className="shrink-0 rounded-full bg-slate-950 px-7 py-3.5 font-bold text-white hover:bg-slate-800">{c.signIn}</Link></div></section>
    <footer className="border-t border-white/10 px-6 py-8 text-sm text-slate-500 sm:px-10 lg:px-14"><div className="mx-auto flex max-w-7xl justify-between gap-5"><span>VOKA</span><span>© 2026</span></div></footer>
  </main>;
}
