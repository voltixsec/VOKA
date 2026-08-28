import type { ResolvedLineItem, SalesAssistantDraftProposal } from "@/src/application/ai-sales-assistant/dto/AISalesAssistantDto";
import { commercialUnitLabel, unitLabel } from '@/lib/i18n/unit-labels';

export type EngineeringReviewLine = Pick<ResolvedLineItem,
  "itemName" | "quantity" | "unitName" | "quantitySource" | "provenance" | "formulaExplanation"
> & Partial<Pick<ResolvedLineItem, "itemNameAr" | "itemNameEn" | "unitNameAr" | "unitNameEn" | "formulaExplanationAr" | "commercialRequirement">> & { requestedUnitText?: string | null };

export function commercialLineName(line: { itemName: string; itemNameAr?: string | null; itemNameEn?: string | null }, isArabic: boolean) {
  // Names supplied by a customer or tenant are data, not interface labels.
  return (isArabic ? line.itemNameAr : line.itemNameEn) || line.itemName;
}

/** Internal review projection only. Never use these rows to hydrate a quotation. */
export function engineeringReviewLines(proposal: SalesAssistantDraftProposal): EngineeringReviewLine[] {
  if (!proposal.smartSystem?.requirements) return proposal.lines;
  return [...proposal.smartSystem.requirements.map((requirement) => ({
    itemName: requirement.name, itemNameAr: requirement.nameAr, itemNameEn: requirement.nameEn,
    quantity: requirement.quantity, unitName: requirement.unit, provenance: requirement.provenance,
    formulaExplanation: requirement.formulaExplanation, formulaExplanationAr: requirement.formulaExplanationAr,
  })), ...proposal.lines.filter((line) => line.commercialRequirement || line.commercializationPending)];
}

/** Displays original server provenance; never recomputes or invents an explanation. */
export function EngineeringQuantityDetails({ lines, isArabic }: { lines: EngineeringReviewLine[]; isArabic: boolean }) {
  const engineering = lines.filter((line) => line.commercialRequirement || line.quantitySource === "RULE_CALCULATED" || line.quantitySource === "AI_ESTIMATED" || line.provenance === "CALCULATED" || line.provenance === "SUGGESTED");
  if (!engineering.length) return null;
  return <details className="rounded-xl border border-white/10 p-3 text-xs text-slate-300">
    <summary className="cursor-pointer font-semibold text-sky-200">{isArabic ? "كميات المسودة الأصلية وافتراضاتها الهندسية" : "Original draft engineering quantities and assumptions"}</summary>
    <ul className="mt-3 space-y-3">
      {engineering.map((line, index) => {
        const estimated = line.quantitySource === "AI_ESTIMATED" || line.provenance === "SUGGESTED";
        const legacyExplanation = line.formulaExplanation ?? "";
        // Old/provider drafts may only contain one language. Do not silently leak
        // that language or manufacture a translated engineering assumption.
        const explanation = isArabic
          ? line.formulaExplanationAr || (/[\u0600-\u06ff]/.test(legacyExplanation) ? legacyExplanation : "")
          : (/[\u0600-\u06ff]/.test(legacyExplanation) ? "" : legacyExplanation);
        const commercialUnit = commercialUnitLabel(line, isArabic);
        return <li key={index}>
          <p className="font-semibold text-slate-100">{commercialLineName(line, isArabic)} · <bdi>{line.quantity ?? "?"} {line.requestedUnitText ? unitLabel(line.requestedUnitText, isArabic) : commercialUnit}</bdi></p>
          {line.requestedUnitText && line.unitName && line.requestedUnitText !== line.unitName && <p className="text-amber-200">{isArabic ? "وحدة البند التجاري مختلفة؛ أكد توافقها قبل الاعتماد: " : "Commercial unit differs; confirm compatibility before approval: "}{commercialUnit}</p>}
          <p className={estimated ? "text-amber-200" : "text-sky-200"}>{estimated ? (isArabic ? "كمية تقديرية — تحتاج مراجعة" : "Estimated quantity — review required") : line.provenance === "USER_PROVIDED" ? (isArabic ? "كمية أدخلها المستخدم — تحتاج مراجعة" : "User-provided quantity — review required") : (isArabic ? "محسوب بقاعدة — راجع الافتراضات" : "Rule-calculated — review assumptions")}</p>
          <p className="mt-1 whitespace-pre-wrap">{explanation || (isArabic ? "تفاصيل الحساب أو الافتراض غير متاحة بالعربية؛ يلزم التأكيد البشري." : "Calculation/assumption details are unavailable in English; human confirmation is required.")}</p>
          {line.commercialRequirement && <p className="mt-1 text-amber-200">{line.commercialRequirement.matchStatus === "COMMERCIAL_MATCH_CONFIRMED"
            ? (isArabic ? "مطابقة تجارية من الكتالوج — ليست اعتماداً للتصميم" : "Commercial catalog match — not design approval")
            : line.commercialRequirement.matchStatus === "COMMERCIAL_MATCH_AMBIGUOUS"
              ? (isArabic ? "بدائل تجارية — يلزم اختيار ومراجعة بشرية" : "Commercial alternatives — human selection and review required")
              : (isArabic ? "بند تجاري مؤقت — يلزم التأكيد والتسعير" : "Temporary commercial item — confirmation and pricing required")}
            {line.commercialRequirement.source.ruleVersion && ` · ${isArabic ? "إصدار القاعدة" : "Rule version"}: ${line.commercialRequirement.source.ruleVersion}`}
            {line.commercialRequirement.searchTruncated && (isArabic ? " · نتائج الكتالوج محدودة؛ لا تثبت وجود خيار وحيد" : " · Catalog results are bounded; uniqueness is not established")}
          </p>}
        </li>;
      })}
    </ul>
  </details>;
}
