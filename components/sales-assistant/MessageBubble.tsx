import type { ReactNode } from "react";
import { AssistantIcon } from "./AssistantIcon";

type Props = {
  role: "USER" | "ASSISTANT";
  text: string;
  isArabic: boolean;
  pending?: boolean;
  copied?: boolean;
  onCopy?: () => void;
  children?: ReactNode;
};

export function MessageBubble({ role, text, isArabic, pending, copied, onCopy, children }: Props) {
  if (role === "USER") return <article className="flex justify-end" data-testid={pending ? "pending-user-message" : undefined}>
    <div className={`max-w-[88%] rounded-[1.45rem] rounded-ee-md border px-4 py-3 text-[15px] leading-6 text-slate-50 shadow-[0_18px_45px_-28px_rgba(56,189,248,.8)] sm:max-w-[72%] ${pending ? "border-sky-300/15 bg-sky-400/15 text-sky-50" : "border-sky-300/20 bg-gradient-to-br from-sky-400/20 to-blue-500/10"}`}>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  </article>;

  return <article className="group flex justify-start">
    <div className="w-full min-w-0 max-w-3xl rounded-[1.65rem] border border-white/[0.065] bg-gradient-to-br from-white/[0.045] to-white/[0.018] px-4 py-4 shadow-[0_22px_60px_-42px_rgba(14,165,233,.45)] sm:px-5 sm:py-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-300/15 bg-gradient-to-br from-sky-300/15 to-violet-400/10 text-[11px] font-bold tracking-wide text-sky-200 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">V</span>
        <div><p className="text-xs font-semibold tracking-wide text-slate-200">VOKA</p><p className="text-[10px] text-slate-500">{isArabic ? "مساعد المبيعات الهندسي" : "Sales engineering assistant"}</p></div>
      </div>
      <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-100 sm:text-base sm:leading-8">{plainConversationText(text)}</p>
      {children}
      {onCopy ? <div className="mt-3 flex min-h-7 items-center gap-1 opacity-100 transition motion-reduce:transition-none sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <button type="button" onClick={onCopy} aria-label={isArabic ? "نسخ الرد" : "Copy response"} className="rounded-lg p-1.5 text-slate-500 outline-none hover:bg-white/[0.06] hover:text-slate-300 focus-visible:ring-2 focus-visible:ring-sky-400"><AssistantIcon name="copy" className="h-3.5 w-3.5" /></button>
        {copied ? <span role="status" className="text-[11px] text-emerald-300">{isArabic ? "تم النسخ" : "Copied"}</span> : null}
      </div> : null}
    </div>
  </article>;
}

export function plainConversationText(text: string) {
  return text
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*\|(.+)\|\s*$/gm, (_row, cells: string) => cells.split("|").map((cell) => cell.trim()).filter(Boolean).join(" · "))
    .replace(/\s+\|\s+/g, " · ")
    .replace(/^\s*:?-{3,}:?(?:\s*·\s*:?-{3,}:?)+\s*$/gm, "")
    .trim();
}
