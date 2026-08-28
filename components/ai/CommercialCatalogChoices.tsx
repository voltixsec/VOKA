import type { ResolvedLineItem } from "@/src/application/ai-sales-assistant/dto/AISalesAssistantDto";
import { unitLabel } from "@/lib/i18n/unit-labels";
import { commercialLineName } from "./EngineeringQuantityDetails";

export function CommercialCatalogChoices({ line, isArabic, disabled, onSelect }: {
  line: ResolvedLineItem; isArabic: boolean; disabled: boolean;
  onSelect: (candidate: { id: string; name: string }) => void;
}) {
  return <div className="space-y-1 text-xs">
    <p>{isArabic ? "بدائل للمراجعة: " : "Alternatives for review: "}{commercialLineName(line, isArabic)}</p>
    <div className="flex flex-wrap gap-2">{line.catalogCandidates.map((candidate) => <button key={candidate.id} type="button" disabled={disabled} onClick={() => onSelect({ id: candidate.id, name: candidate.name })} className="rounded-xl border border-sky-400/30 px-3 py-2 text-xs">
      {(isArabic ? candidate.nameAr : candidate.nameEn) || candidate.name}
      {candidate.quantity != null && <> · <bdi>{candidate.quantity} {unitLabel(candidate.unitName, isArabic)}</bdi></>}
    </button>)}</div>
  </div>;
}
