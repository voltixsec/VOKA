import type { FieldAnswer, WorkingCommercialDraft } from "@/src/application/commercial-conversation";

export function ActiveFieldQuestion({ draft, isArabic, disabled, onAnswer }: { draft: WorkingCommercialDraft; isArabic: boolean; disabled: boolean; onAnswer: (answer: FieldAnswer) => void }) {
  const question = draft.activeQuestion;
  if (!question) return null;
  return <div className="space-y-2 rounded-xl border-2 border-rose-400/50 bg-rose-500/10 p-3" data-testid="active-field-question" aria-live="polite">
    <p className="text-sm font-bold text-white">{isArabic ? question.ar : question.en}</p>
    <p className="text-xs text-slate-300">{isArabic ? "اكتب أو سجّل إجابتك ثم استخدم زر الإجراء الرئيسي." : "Type or record your answer, then use the primary action."}</p>
    {question.options?.map((option) => <button key={option.value} type="button" disabled={disabled} className="me-2 rounded-lg border border-sky-400/40 px-3 py-2 text-xs" onClick={() => onAnswer({ field: question.field, value: isArabic ? option.ar : option.en })}>{isArabic ? option.ar : option.en}</button>)}
    {question.allowNotApplicable && <button type="button" disabled={disabled} className="rounded-lg border border-sky-400/40 px-3 py-2 text-xs" onClick={() => onAnswer({ field: question.field, value: isArabic ? "لا ينطبق" : "Not applicable", action: "NOT_APPLICABLE" })}>{isArabic ? "لا ينطبق" : "Not applicable"}</button>}
    {question.allowDefer && <button type="button" disabled={disabled} className="rounded-lg border border-amber-300/50 px-3 py-2 text-xs" onClick={() => onAnswer({ field: question.field, value: "DEFERRED", action: "DEFER" })}>{isArabic ? question.deferLabelAr : question.deferLabelEn}</button>}
    {question.nonDeferrableNotice && <p className="text-xs text-amber-200" role="status">{isArabic ? question.nonDeferrableNotice.ar : question.nonDeferrableNotice.en}</p>}
    {draft.missingRequired.length > 1 && <details className="text-xs text-slate-300"><summary>{isArabic ? "المعلومات المتبقية" : "Remaining information"}</summary><p className="mt-1">{draft.missingRequired.slice(1).map((field) => isArabic ? field.labelAr : field.labelEn).join(isArabic ? "، " : ", ")}</p></details>}
  </div>;
}
