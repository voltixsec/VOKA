import { AssistantIcon } from "./AssistantIcon";

export function NewRequestCTA({ isArabic, onClick }: { isArabic: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border border-sky-300/20 bg-gradient-to-b from-sky-300/[0.12] to-violet-400/[0.06] px-4 py-2.5 text-sm font-semibold text-sky-100 shadow-[0_12px_32px_-20px_rgba(56,189,248,.65)] outline-none transition duration-200 hover:border-sky-300/35 hover:from-sky-300/[0.18] hover:text-white focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 motion-reduce:transition-none">
    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-300/15 text-sky-200 transition group-hover:bg-sky-300/20 motion-reduce:transition-none"><AssistantIcon name="plus" className="h-4 w-4" /></span>
    <span>{isArabic ? "طلب جديد" : "New Request"}</span>
  </button>;
}
