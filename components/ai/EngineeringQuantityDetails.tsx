import type { ResolvedLineItem } from "@/src/application/ai-sales-assistant/dto/AISalesAssistantDto";

export type EngineeringReviewLine = Pick<ResolvedLineItem,
  "itemName" | "quantity" | "unitName" | "quantitySource" | "provenance" | "formulaExplanation"
> & { requestedUnitText?: string | null };

/** Displays original server provenance; never recomputes or invents an explanation. */
export function EngineeringQuantityDetails({ lines, isArabic }: { lines: EngineeringReviewLine[]; isArabic: boolean }) {
  const engineering = lines.filter((line) => line.quantitySource === "RULE_CALCULATED" || line.quantitySource === "AI_ESTIMATED" || line.provenance === "CALCULATED" || line.provenance === "SUGGESTED");
  if (!engineering.length) return null;
  return <details className="rounded-xl border border-white/10 p-3 text-xs text-slate-300">
    <summary className="cursor-pointer font-semibold text-sky-200">{isArabic ? "كميات المسودة الأصلية وافتراضاتها الهندسية" : "Original draft engineering quantities and assumptions"}</summary>
    <ul className="mt-3 space-y-3">
      {engineering.map((line, index) => {
        const estimated = line.quantitySource === "AI_ESTIMATED" || line.provenance === "SUGGESTED";
        return <li key={index}>
          <p className="font-semibold text-slate-100">{line.itemName} · <bdi>{line.quantity ?? "?"} {line.requestedUnitText ?? line.unitName ?? ""}</bdi></p>
          {line.requestedUnitText && line.unitName && line.requestedUnitText !== line.unitName && <p className="text-amber-200">{isArabic ? "وحدة البند التجاري مختلفة؛ أكد توافقها قبل الاعتماد: " : "Commercial unit differs; confirm compatibility before approval: "}{line.unitName}</p>}
          <p className={estimated ? "text-amber-200" : "text-sky-200"}>{estimated ? (isArabic ? "كمية تقديرية — تحتاج مراجعة" : "Estimated quantity — review required") : (isArabic ? "محسوب بقاعدة — راجع الافتراضات" : "Rule-calculated — review assumptions")}</p>
          <p dir="auto" className="mt-1 whitespace-pre-wrap">{line.formulaExplanation || (isArabic ? "لم تُرفق تفاصيل الحساب أو الافتراض؛ يلزم التأكيد البشري." : "Calculation/assumption details were not supplied; human confirmation is required.")}</p>
        </li>;
      })}
    </ul>
  </details>;
}
