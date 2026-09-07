"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export const operatorPages = [
  { label: "Overview", labelAr: "نظرة عامة", href: "/dashboard/universal-library" },
  { label: "Batches", labelAr: "الدفعات", href: "/dashboard/universal-library/batches" },
  { label: "Hierarchy", labelAr: "التسلسل الهرمي", href: "/dashboard/universal-library/systems" },
  { label: "Staging", labelAr: "البيانات المرحلية", href: "/dashboard/universal-library/products" },
  { label: "Review", labelAr: "المراجعة", href: "/dashboard/universal-library/review" },
  { label: "Published", labelAr: "المنشور", href: "/dashboard/universal-library/published" },
  { label: "Population", labelAr: "البحث والاكتشاف", href: "/dashboard/universal-library/population" },
] as const;

export default function UniversalLibraryOperatorNav() {
  const pathname = usePathname();
  const { isArabic } = useLanguage();
  return (
    <nav aria-label={isArabic ? "إدارة المكتبة العالمية" : "Universal Library operator navigation"} dir={isArabic ? "rtl" : "ltr"} className="mb-6 flex gap-2 overflow-x-auto rounded-xl border border-white/10 bg-slate-900 p-3">
      {operatorPages.map((page) => {
        const active = pathname === page.href || (page.href !== operatorPages[0].href && pathname.startsWith(`${page.href}/`));
        return <Link key={page.href} href={page.href} aria-current={active ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm ${active ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-white/10"}`}>{isArabic ? page.labelAr : page.label}</Link>;
      })}
    </nav>
  );
}
