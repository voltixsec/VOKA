import type { RuntimeSummaryView } from "@/src/application/conversation-runtime";
import { AssistantIcon } from "./AssistantIcon";

export function ContextSummaryCard({ result, isArabic }: { result: RuntimeSummaryView; isArabic: boolean }) {
  const commercial = result.commercial;
  const value = (fact: (typeof result.summary)[number]) => fact.value;
  const hasSummary = result.summary.length > 0;
  if (!hasSummary && !commercial.draftReady) return null;

  return <section className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-900/45 shadow-[0_24px_70px_-48px_rgba(14,165,233,.4)] backdrop-blur-xl" data-testid="commercial-conversation" data-live-result="true" aria-label={isArabic ? "ملخص الطلب" : "Request summary"}>
    <div className="border-b border-white/[0.055] px-4 py-3.5"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-300/10 text-sky-200"><AssistantIcon name="sparkles" className="h-4 w-4" /></span><div><h2 className="text-xs font-semibold text-slate-200">{isArabic ? "ملخص الطلب" : "Request summary"}</h2><p className="mt-0.5 text-[10px] text-slate-500">{isArabic ? "يتحدث مع المحادثة" : "Synced with the conversation"}</p></div></div></div>
    <div className="space-y-4 p-4">
      {hasSummary ? <dl className="space-y-2.5 text-sm" data-testid="compact-request-summary">{result.summary.map((fact) => <div key={fact.key} className="flex min-w-0 items-baseline justify-between gap-3"><dt className="shrink-0 text-xs text-slate-500">{isArabic ? fact.labelAr : fact.labelEn}</dt><dd className="min-w-0 text-end text-sm font-medium text-slate-200">{value(fact)}</dd></div>)}</dl> : null}
      {result.stillNeeded.length ? <div className="rounded-xl border border-white/[0.055] bg-white/[0.025] px-3 py-2.5 text-xs leading-5 text-slate-400" data-testid="compact-still-needed"><span className="font-semibold text-slate-300">{isArabic ? "متبقي: " : "Still needed: "}</span>{result.stillNeeded.map((field) => isArabic ? field.labelAr : field.labelEn).join(isArabic ? "، " : ", ")}</div> : null}
      {commercial.draftReady ? <div className="rounded-xl border border-sky-300/10 bg-sky-300/[0.035] p-3 text-xs leading-5 text-emerald-200" data-testid="compact-commercial-result">{isArabic ? "الحل مؤكد وجاهز لتسليمه إلى إعداد العرض." : "The confirmed solution is ready for quotation handoff."}</div> : null}
      {result.evidence.length ? <details className="group border-t border-white/[0.055] pt-3 text-xs text-slate-300" data-testid="live-result-details"><summary className="flex cursor-pointer list-none items-center justify-between text-slate-400 outline-none hover:text-sky-200 focus-visible:ring-2 focus-visible:ring-sky-400"><span>{isArabic ? "عرض التفاصيل" : "View details"}</span><AssistantIcon name="chevron" className={`h-3.5 w-3.5 transition group-open:rotate-90 ${isArabic ? "rotate-180 group-open:rotate-90" : ""}`} /></summary><div className="mt-3 space-y-2">{result.evidence.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="block text-sky-200 hover:text-sky-100">{item.title}<span className="block text-slate-500">{item.publisher}</span></a>)}</div></details> : null}
    </div>
  </section>;
}
