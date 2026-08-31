import { NewRequestCTA } from "./NewRequestCTA";

export function ChatHeader({ isArabic, hasConversation, onNewRequest }: { isArabic: boolean; hasConversation: boolean; onNewRequest: () => void }) {
  return <header className="flex min-w-0 items-start justify-between gap-4 border-b border-white/[0.055] pb-5">
    <div className="min-w-0">
      <div className="flex items-center gap-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.7)]" aria-hidden="true" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300">{isArabic ? "مساعد فوكا التجاري" : "VOKA Sales Assistant"}</p>
      </div>
      <h1 className="mt-2 text-balance text-2xl font-semibold tracking-[-0.025em] text-white sm:text-[2rem]">
        {hasConversation ? (isArabic ? "نكمل من حيث توقفنا" : "Continue where you left off") : (isArabic ? "ما الذي تريد إنجازه؟" : "What would you like to accomplish?")}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{isArabic ? "تحدث بطريقتك. أفهم الحل وأرتب التفاصيل، وأنت دائمًا صاحب قرار الاعتماد." : "Talk naturally. I’ll understand the solution and organize the details; you always stay in control of approval."}</p>
    </div>
    {hasConversation ? <NewRequestCTA isArabic={isArabic} onClick={onNewRequest} /> : null}
  </header>;
}
