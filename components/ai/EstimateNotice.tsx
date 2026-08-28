import { ESTIMATE_NOTICE_AR, ESTIMATE_NOTICE_EN } from "@/src/application/ai-sales-assistant/estimate-notice";
export function EstimateNotice({ isArabic }: { isArabic: boolean }) {
  return <aside role="note" className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-3 text-sm text-amber-200">{isArabic ? ESTIMATE_NOTICE_AR : ESTIMATE_NOTICE_EN}</aside>;
}
