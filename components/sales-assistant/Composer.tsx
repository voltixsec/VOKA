import type { ChangeEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { AssistantIcon } from "./AssistantIcon";

type Props = {
  isArabic: boolean;
  value: string;
  inputRef: RefObject<HTMLTextAreaElement>;
  attachment: File | null;
  primaryActionLabel: string;
  hasText: boolean;
  isListening: boolean;
  disabled: boolean;
  voiceUnavailable: boolean;
  interimTranscript?: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPrimaryAction: () => void;
  onAttachment: (file: File | null) => void;
  onRemoveAttachment: () => void;
  controls?: ReactNode;
  status?: ReactNode;
  elevated?: boolean;
};

export function Composer({ isArabic, value, inputRef, attachment, primaryActionLabel, hasText, isListening, disabled, voiceUnavailable, interimTranscript, onChange, onKeyDown, onPrimaryAction, onAttachment, onRemoveAttachment, controls, status, elevated = false }: Props) {
  return <div className={`relative z-20 min-w-0 ${elevated ? "sticky bottom-3" : ""}`}>
    <div aria-hidden="true" className="pointer-events-none absolute -inset-x-8 -inset-y-6 -z-10 rounded-[3rem] bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,.12),rgba(99,102,241,.07)_38%,transparent_72%)] blur-2xl transition-opacity duration-500 motion-reduce:transition-none" />
    <div data-testid="commercial-composer-input" className="group relative overflow-hidden rounded-[1.75rem] border border-white/[0.11] bg-slate-900/90 p-2 shadow-[0_28px_90px_-34px_rgba(14,165,233,.35),0_18px_60px_-36px_rgba(99,102,241,.45),inset_0_1px_0_rgba(255,255,255,.055)] backdrop-blur-2xl transition duration-300 focus-within:border-sky-300/40 focus-within:shadow-[0_30px_100px_-32px_rgba(14,165,233,.48),0_20px_70px_-34px_rgba(99,102,241,.5),inset_0_1px_0_rgba(255,255,255,.08)] motion-reduce:transition-none sm:p-3">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/45 to-transparent" />
      {attachment ? <div className="mb-2 flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-xs"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-300/10 text-sky-200"><AssistantIcon name="attach" className="h-4 w-4" /></span><span className="truncate text-slate-300">{attachment.name}</span><button type="button" onClick={onRemoveAttachment} className="ms-auto shrink-0 rounded-lg px-2 py-1 text-rose-300 outline-none hover:bg-rose-400/10 focus-visible:ring-2 focus-visible:ring-sky-400">{isArabic ? "إزالة" : "Remove"}</button></div> : null}
      <textarea ref={inputRef} id="sales-prompt-input" value={value} onChange={onChange} onKeyDown={onKeyDown} rows={1} placeholder={isArabic ? "اكتب طلبك، اسأل، أو غيّر أي تفصيلة…" : "Message VOKA, ask a question, or change any detail…"} className="block max-h-44 min-h-[4.25rem] w-full resize-none overflow-y-auto bg-transparent px-3 py-3 text-[15px] leading-7 text-white outline-none [scrollbar-width:none] placeholder:text-slate-500 [&::-webkit-scrollbar]:hidden sm:px-4 sm:text-base" />
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <label htmlFor="commercial-attachment" className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-transparent text-slate-400 outline-none transition hover:border-white/[0.07] hover:bg-white/[0.055] hover:text-white focus-within:ring-2 focus-within:ring-sky-400 motion-reduce:transition-none"><AssistantIcon name="attach" /><span className="sr-only">{isArabic ? "إرفاق ملف تجاري" : "Attach commercial file"}</span></label>
        <input id="commercial-attachment" aria-label={isArabic ? "إرفاق ملف تجاري" : "Attach commercial file"} type="file" accept="application/pdf,.pdf" onChange={(event) => onAttachment(event.target.files?.[0] ?? null)} className="sr-only" />
        <span className="hidden text-[11px] text-slate-600 sm:inline">{isArabic ? "اضغط إدخال للإرسال · العالي مع إدخال لسطر جديد" : "Enter to send · Shift+Enter for a new line"}</span>
        <button type="button" data-testid="primary-voice-action" title={voiceUnavailable ? (isArabic ? "الإدخال الصوتي غير مدعوم" : "Voice input is not supported") : undefined} aria-label={primaryActionLabel} disabled={disabled} onClick={onPrimaryAction} className="ms-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-sky-300 to-cyan-200 px-4 py-2 text-xs font-bold text-slate-950 shadow-[0_10px_30px_-14px_rgba(56,189,248,.8)] outline-none transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-wait disabled:opacity-50 motion-reduce:transition-none">
          <AssistantIcon name={hasText || isListening ? "send" : "mic"} className="h-4 w-4" /><span>{primaryActionLabel}</span>
        </button>
      </div>
      {interimTranscript ? <div className="mt-2 flex items-center gap-2 rounded-xl border border-sky-300/10 bg-sky-950/50 p-2.5 text-xs text-sky-200"><span className="h-2 w-2 animate-ping rounded-full bg-sky-400 motion-reduce:animate-none" /><span className="font-medium">{isArabic ? "جاري الاستماع:" : "Listening:"}</span><span className="italic text-slate-300">{interimTranscript}</span></div> : null}
    </div>
    {controls ? <div data-testid="commercial-composer-controls" className="mt-3">{controls}</div> : null}
    {status ? <div className="mt-2">{status}</div> : null}
  </div>;
}
