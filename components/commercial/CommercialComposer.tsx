"use client";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";

export type CommercialComposerMode = "QUOTATION" | "SALES_ORDER" | "CONTRACT" | "INVOICE";

export function CommercialComposer({ mode, isArabic, title, description, children, summary }: { mode: CommercialComposerMode; isArabic: boolean; title: string; description: string; children: ReactNode; summary?: ReactNode }) {
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]" dir={isArabic ? "rtl" : "ltr"} data-commercial-composer={mode}>
    <div className="space-y-6"><Card className="overflow-hidden border-sky-400/20 bg-gradient-to-br from-sky-400/[0.08] via-slate-950 to-indigo-500/[0.06]"><div className="flex items-start justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">{isArabic ? "مستند تجاري" : "Commercial document"}</p><h2 className="mt-2 text-2xl font-semibold">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p></div><span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs text-sky-200">{mode}</span></div></Card>{children}</div>
    <aside className="xl:sticky xl:top-24 xl:self-start">{summary}</aside>
  </div>;
}

export function ComposerSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) { return <Card><div className="mb-5 border-b border-white/10 pb-4"><h3 className="font-semibold text-white">{title}</h3>{description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}</div>{children}</Card>; }
