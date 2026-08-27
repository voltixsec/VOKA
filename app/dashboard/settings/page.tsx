"use client";

import Link from "next/link";
import { useLanguage } from "../../../components/i18n/LanguageProvider";

export default function SettingsPage() {
  const { isArabic } = useLanguage();
  const t = (ar: string, en: string) => isArabic ? ar : en;
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 lg:p-10" dir={isArabic ? "rtl" : "ltr"}>
      <div><p className="text-sm font-semibold text-sky-400">{t("مساحة العمل", "Workspace")}</p><h1 className="mt-2 text-3xl font-bold">{t("الإعدادات", "Settings")}</h1></div>
      <div className="grid gap-5 md:grid-cols-2">
        <Link href="/dashboard/settings/company" className="rounded-3xl border border-slate-800 bg-slate-900 p-6 hover:border-sky-600"><h2 className="text-xl font-bold">{t("هوية الشركة ومستنداتها", "Company identity & documents")}</h2><p className="mt-2 text-sm text-slate-400">{t("الهوية والسمات وأصول المستندات وإعدادات التسليم.", "Identity, themes, document assets and delivery settings.")}</p></Link>
        <Link href="/dashboard/settings/signatories" className="rounded-3xl border border-slate-800 bg-slate-900 p-6 hover:border-sky-600"><h2 className="text-xl font-bold">{t("المفوّضون بالتوقيع", "Authorized signatories")}</h2><p className="mt-2 text-sm text-slate-400">{t("هوية الاعتماد والتوقيع وأنواع المستندات المسموحة.", "Approval identity, signature and allowed document types.")}</p></Link>
      </div>
    </main>
  );
}
