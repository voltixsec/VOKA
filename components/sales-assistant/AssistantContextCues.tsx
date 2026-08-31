import { projectRuntimeSummary, type ConversationRuntimeState } from "@/src/application/conversation-runtime";

export type ActivityStage = "UNDERSTANDING" | "RESEARCHING" | "VERIFYING" | "PREPARING";

export function ActivityIndicator({ stage, isArabic }: { stage: ActivityStage; isArabic: boolean }) {
  const copy: Record<ActivityStage, [string, string]> = {
    UNDERSTANDING: ["جاري فهم الطلب…", "Understanding your request…"],
    RESEARCHING: ["أراجع المصادر الفنية…", "Reviewing technical sources…"],
    VERIFYING: ["أتحقق من المعلومات…", "Checking the information…"],
    PREPARING: ["أجهز الرد…", "Preparing the response…"],
  };
  return <div role="status" aria-live="polite" data-testid="assistant-activity" data-activity-stage={stage} className="flex items-center gap-3 rounded-2xl border border-white/[0.055] bg-white/[0.022] px-4 py-3 text-sm text-slate-300">
    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300"><span className="h-2 w-2 animate-pulse rounded-full bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,.8)] motion-reduce:animate-none" /></span>
    <span>{isArabic ? copy[stage][0] : copy[stage][1]}</span>
    <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map((item) => <span key={item} className="h-1 w-1 animate-bounce rounded-full bg-slate-500 motion-reduce:animate-none" style={{ animationDelay: `${item * 120}ms` }} />)}</span>
  </div>;
}

export function AssistantContextCues({ state, isArabic }: { state: ConversationRuntimeState; isArabic: boolean }) {
  const result = projectRuntimeSummary(state);
  const facts = result.summary.slice(0, 5);
  return <>
    {facts.length ? <div className="mt-3 flex flex-wrap gap-1.5" aria-label={isArabic ? "المعلومات المؤكدة" : "Confirmed facts"}>{facts.map((fact) => <span data-testid="committed-fact-chip" key={fact.key} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.055] bg-white/[0.035] px-2.5 py-1 text-xs text-slate-300"><span className="text-emerald-300">✓</span>{fact.value}</span>)}</div> : null}
    {result.evidence.length ? <details className="mt-3 w-fit text-xs" data-testid="assistant-sources"><summary className="cursor-pointer list-none rounded-lg py-1 text-slate-400 outline-none hover:text-sky-200 focus-visible:ring-2 focus-visible:ring-sky-400">{isArabic ? "المصادر" : "Sources"} <span className="text-slate-600">({result.evidence.length})</span></summary><div className="mt-2 min-w-[16rem] max-w-xl space-y-2 rounded-xl border border-white/[0.07] bg-slate-950/80 p-3 shadow-2xl">{result.evidence.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="block rounded-lg p-1 text-slate-300 outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-sky-400"><span className="block font-medium text-sky-200">{item.title}</span><span className="mt-0.5 block text-slate-500">{item.publisher}</span></a>)}</div></details> : null}
  </>;
}
