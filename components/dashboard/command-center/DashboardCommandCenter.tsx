"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { VoiceOrb } from "@/components/voice";

type Summary = { customers: number; catalogItems: number; quotations: number; salesOrders: number; contracts: number; invoices: number; outstandingInvoices: number; payments: number };
const EMPTY: Summary = { customers: 0, catalogItems: 0, quotations: 0, salesOrders: 0, contracts: 0, invoices: 0, outstandingInvoices: 0, payments: 0 };

const modules = [
  { key: "customers", href: "/dashboard/customers", en: "Customers", ar: "العملاء", detailEn: "Active customer records", detailAr: "سجلات العملاء الحالية" },
  { key: "catalogItems", href: "/dashboard/products", en: "Products & Services", ar: "المنتجات والخدمات", detailEn: "Active catalog items", detailAr: "أصناف الكتالوج النشطة" },
  { key: "quotations", href: "/dashboard/quotations", en: "Quotations", ar: "عروض الأسعار", detailEn: "All current quotation revisions", detailAr: "جميع الإصدارات الحالية لعروض الأسعار" },
  { key: "salesOrders", href: "/dashboard/sales-orders", en: "Sales Orders", ar: "أوامر البيع", detailEn: "All sales order records", detailAr: "جميع سجلات أوامر البيع" },
  { key: "contracts", href: "/dashboard/contracts", en: "Contracts", ar: "العقود", detailEn: "Contract records", detailAr: "سجلات العقود" },
  { key: "invoices", href: "/dashboard/invoices", en: "Invoices", ar: "الفواتير", detailEn: "All invoice records", detailAr: "جميع سجلات الفواتير" },
  { key: "payments", href: "/dashboard/payments", en: "Payments", ar: "المدفوعات", detailEn: "Recorded payment transactions", detailAr: "عمليات الدفع المسجلة" },
] as const;

export function DashboardCommandCenter() {
  const { isArabic } = useLanguage();
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/dashboard/summary", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { window.location.href = "/login?returnTo=%2Fdashboard"; return null; }
      if (!response.ok) throw new Error("summary failed"); return response.json();
    }).then((payload) => { if (active && payload) setSummary(payload.data); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const t = (ar: string, en: string) => isArabic ? ar : en;
  return <section className="space-y-8" dir={isArabic ? "rtl" : "ltr"}>
    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">{t("مركز القيادة", "Command center")}</p><h1 className="mt-3 text-3xl font-bold">{t("أعمالك التجارية في مكان واحد", "Your commercial operation at a glance")}</h1><p className="mt-2 max-w-3xl text-slate-400">{t("بيانات حقيقية من مساحة شركتك، وروابط مباشرة إلى كل وحدة تشغيلية.", "Live tenant data and direct routes into every operational workspace.")}</p></div><div className="flex flex-wrap gap-3"><Link href="/dashboard/sales-assistant" className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold hover:bg-sky-500">{t("ابدأ بالصوت", "Start with voice")}</Link><Link href="/dashboard/quotations/new" className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold hover:border-slate-500">{t("عرض سعر جديد", "New quotation")}</Link><Link href="/dashboard/invoices/new" className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold hover:border-slate-500">{t("فاتورة جديدة", "New invoice")}</Link></div></div>
    {error ? <div role="alert" className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-amber-200">{t("تعذر تحميل الملخص الآن. الوحدات التشغيلية ما زالت متاحة.", "The summary is temporarily unavailable. Operational workspaces remain available.")}</div> : null}
    <div className="relative overflow-hidden rounded-3xl border border-sky-400/20 bg-gradient-to-r from-sky-500/[0.10] via-slate-900 to-indigo-500/[0.08] p-6"><div className="absolute -end-16 -top-20 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl" aria-hidden="true" /><div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center"><div className="flex items-center gap-3"><Link href="/dashboard/sales-assistant?attach=1" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-sky-200" aria-label={t("أرفق ملفًا أولًا", "Attach a file first")}>📎</Link><div><p className="text-lg font-semibold">{t("قل أو اكتب ما تريد إنشاءه", "Tell VOKA what you want to create")}</p><p className="mt-1 max-w-2xl text-sm text-slate-400">{t("أرفق سياقًا عند الحاجة، ثم يتعرف VOKA على العملية ويعرضها للمراجعة قبل الحفظ.", "Attach context when needed; VOKA identifies the operation and presents it for review before saving.")}</p></div><VoiceOrb size="compact" label={t("افتح الإدخال الصوتي التجاري", "Open commercial voice entry")} title={t("تحدث إلى VOKA", "Speak to VOKA")} onClick={() => document.getElementById("commercial-assistant-link")?.click()} /></div><Link id="commercial-assistant-link" href="/dashboard/sales-assistant" className="shrink-0 rounded-xl bg-sky-500 px-4 py-3 text-center text-sm font-semibold text-slate-950 hover:bg-sky-300">{t("فتح المساعد التجاري", "Open commercial assistant")}</Link></div><div className="relative mt-5 flex flex-wrap gap-2">{[["عرض سعر", "Quotation"], ["فاتورة", "Invoice"], ["عقد", "Contract"], ["أمر بيع", "Sales Order"], ["دفعة", "Payment"], ["تحليل مخطط", "Drawing Takeoff"]].map(([ar, en]) => <span key={en} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{t(ar, en)}</span>)}</div></div>
    <div aria-busy={loading} className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{modules.map((module) => <Link key={module.key} href={module.href} className="group rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-sky-500/60"><p className="text-sm font-semibold text-slate-300">{isArabic ? module.ar : module.en}</p><p className="mt-4 text-4xl font-bold text-white">{loading ? <span aria-label={t("جارٍ التحميل", "Loading")}>—</span> : summary[module.key]}</p><p className="mt-3 text-sm leading-6 text-slate-500">{isArabic ? module.detailAr : module.detailEn}</p><span className="mt-5 inline-block text-sm font-semibold text-sky-300 group-hover:text-sky-200">{t("فتح الوحدة ←", "Open workspace →")}</span></Link>)}</div>
    <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-7"><p className="text-sm font-semibold text-sky-300">{t("الدورة التجارية", "Commercial lifecycle")}</p><div className="mt-5 flex flex-wrap items-center gap-3 text-sm">{[["عميل", "Customer"], ["عرض سعر", "Quotation"], ["أمر بيع أو عقد", "Sales Order or Contract"], ["فاتورة", "Invoice"], ["تحصيل", "Payment"]].map(([ar, en], index) => <div key={en} className="contents">{index ? <span className="text-slate-600" aria-hidden="true">{isArabic ? "←" : "→"}</span> : null}<span className="rounded-xl bg-white/5 px-4 py-3">{t(ar, en)}</span></div>)}</div></div>
  </section>;
}
