"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { operatorPages } from "@/components/universal-library/UniversalLibraryOperatorNav";

export default function UniversalLibraryOverviewPage() {
  const { isArabic } = useLanguage();
  return <section dir={isArabic ? "rtl" : "ltr"} className="space-y-6">
    <h1 className="text-3xl font-bold">{isArabic ? "المكتبة العالمية — إدارة المنصة" : "Universal Library — Platform control"}</h1>
    <p className="text-slate-300">{isArabic ? "البحث والاكتشاف / استيراد دفعة ← البيانات المرحلية ← المراجعة ← النشر ← المكتبة العالمية المنشورة" : "Population / Batch Import → Staging → Review → Publish → Published Universal Library"}</p>
    <p className="text-sm text-slate-400">{isArabic ? "البيانات المرحلية ليست منشورة. النشر يتطلب قرار مراجعة صريحًا. إضافة الأصناف إلى الشركة تتم من كتالوج الشركة." : "Staged records are not published. Publication requires an explicit review decision. Tenant adoption belongs in Company Catalog."}</p>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{operatorPages.slice(1).map(page => <Link key={page.href} href={page.href} className="rounded-xl border border-white/10 bg-slate-900 p-6 text-lg hover:border-indigo-400">{isArabic ? page.labelAr : page.label}</Link>)}</div>
  </section>;
}
