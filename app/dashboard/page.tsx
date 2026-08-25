"use client";

import { useLanguage } from "@/components/i18n/LanguageProvider";

const dashboardCards = [
  {
    title: 'Customers',
    titleAr: 'العملاء',
    value: '—',
    description: 'Total customer records',
    descriptionAr: 'إجمالي سجلات العملاء',
  },
  {
    title: 'Open Quotations',
    titleAr: 'عروض الأسعار المفتوحة',
    value: '—',
    description: 'Waiting for customer action',
    descriptionAr: 'بانتظار إجراء العميل',
  },
  {
    title: 'Approved Deals',
    titleAr: 'الصفقات المعتمدة',
    value: '—',
    description: 'Ready for contract or invoice',
    descriptionAr: 'جاهزة للعقد أو الفاتورة',
  },
];

function LegacyDashboardPage() {
  const { isArabic } = useLanguage();
  const t = (ar: string, en: string) => isArabic ? ar : en;

  return (
    <section className="space-y-8" dir={isArabic ? "rtl" : "ltr"}>
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-300">
          {t("نظرة عامة", "Overview")}
        </p>

        <h2 className="mt-3 text-3xl font-semibold text-white">
          {t("لوحة التحكم", "Dashboard")}
        </h2>

        <p className="mt-2 max-w-2xl text-slate-400">
          {t(
            "أدر العملاء والمنتجات وعروض الأسعار والعقود والفواتير من مساحة عمل واحدة.",
            "Manage customers, products, quotations, contracts, and invoices from one workspace.",
          )}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {dashboardCards.map((card) => (
          <article
            key={card.title}
            className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-soft"
          >
            <p className="text-sm text-slate-400">
              {isArabic ? card.titleAr : card.title}
            </p>

            <p className="mt-4 text-4xl font-semibold text-white">
              {card.value}
            </p>

            <p className="mt-3 text-sm text-slate-500">
              {isArabic ? card.descriptionAr : card.description}
            </p>
          </article>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-8">
        <p className="text-sm font-medium text-sky-300">
          {t("مسار مبيعات VOKA", "VOKA Sales Flow")}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-xl bg-white/5 px-4 py-3">
            {t("عميل", "Customer")}
          </span>

          <span className="text-slate-600">→</span>

          <span className="rounded-xl bg-white/5 px-4 py-3">
            {t("عرض سعر", "Quotation")}
          </span>

          <span className="text-slate-600">→</span>

          <span className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-emerald-200">
            {t("عقد", "Contract")}
          </span>

          <span className="text-slate-500">{t("أو", "or")}</span>

          <span className="rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3 text-sky-200">
            {t("فاتورة", "Invoice")}
          </span>
        </div>
      </div>
    </section>
  );
}

export { DashboardCommandCenter as default } from "@/components/dashboard/command-center/DashboardCommandCenter";
