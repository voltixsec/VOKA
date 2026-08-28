import type { CatalogItem } from "@/features/catalog/domain/entities/CatalogItem";
import type { CatalogItemRepository } from "@/features/catalog/domain/repositories/CatalogItemRepository";
import type { UnitRepository } from "@/features/catalog/domain/repositories/UnitRepository";
import type { ExtractedLineItem, CatalogCandidateOption, SalesAssistantSourceLocale } from "../dto/AISalesAssistantDto";

const searches: Record<string, string[]> = {
  CCTV_CAMERAS: ["camera", "كامير"], NVR_RECORDER: ["NVR", "تسجيل"],
  SURVEILLANCE_STORAGE_CAPACITY: ["HDD", "قرص", "هارد", "تخزين"],
  POE_SWITCH: ["PoE"], RACK_CABINET: ["cabinet", "rack", "كابين"],
  CAT6_CABLING: ["CAT6"], CONNECTORS_AND_ACCESSORIES: ["RJ45"],
  INSTALLATION_COMMISSIONING: ["installation", "تركيب"],
};
export const hasCommercialCatalogPolicy = (line: ExtractedLineItem) => Boolean(line.commercialRequirement && searches[line.componentKey ?? ""]);

function normalized(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));
}
function unitKind(value: string) {
  const text = normalized(value.trim());
  if (["unit", "pcs", "piece", "pieces", "each", "وحدة", "قطعة"].includes(text)) return "unit";
  return text;
}
/** Capacity must be stated as one unambiguous product specification, not inferred from a SKU. */
function capacity(text: string, suffix: string): number | null {
  const values = [...text.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*[-–]?\\s*(?:${suffix})(?![a-z])`, "gi"))].map((match) => Number(match[1]));
  const unique = [...new Set(values)];
  return unique.length === 1 && unique[0] > 0 ? unique[0] : null;
}

type Choice = { item: CatalogItem; line: ExtractedLineItem; option: CatalogCandidateOption; exact: boolean; waste: number };
function commercialChoice(extracted: ExtractedLineItem, item: CatalogItem, unit: string, locale: SalesAssistantSourceLocale): Choice | null {
  const requirement = extracted.commercialRequirement!;
  if (item.type !== requirement.preferredType) return null;
  const name = normalized([item.name, item.nameAr, item.nameEn].filter(Boolean).join(" "));
  const spec = requirement.specification;
  let quantity = requirement.quantity;
  let formula = extracted.formulaExplanation;
  let formulaAr = extracted.formulaExplanationAr;
  let waste = 0;
  let expectedUnit = requirement.unit;
  const selectedSpecification: Record<string, number> = {};
  switch (extracted.componentKey) {
    case "SURVEILLANCE_STORAGE_CAPACITY": {
      // An NVR's maximum supported TB is not a supplied disk or verified usable array.
      if (!/\bhdd\b|hard\s*(?:disk|drive)|قرص|هارد/.test(name) || /\bnvr\b|\bdvr\b|\barray\b|\bmax(?:imum)?\b|up to|حتى|أقصى/.test(name)) return null;
      const tb = capacity(name, "tb|تيرابايت|تيرا");
      const required = Number(spec.requiredUsableTb);
      if (!tb || !Number.isFinite(required) || required <= 0 || /\d\s*[-–/]\s*\d/.test(name)) return null;
      quantity = Math.ceil(required / tb);
      selectedSpecification.catalogDiskCapacityTb = tb;
      waste = quantity * tb - required;
      expectedUnit = "Unit";
      formula = `Preliminary capacity allocation: ceil(${required} TB / ${tb} TB per catalog HDD) = ${quantity} disks. Nominal capacity only, with no RAID/reserve allowance. Usable capacity, recorder bays, drive compatibility and retention assumptions require human engineering review; this is not a verified disk design.`;
      formulaAr = `توزيع سعة مبدئي: تقريب لأعلى (${required} تيرابايت ÷ ${tb} تيرابايت لكل قرص من الكتالوج) = ${quantity} قرصاً. سعة اسمية فقط دون احتياطي أو توزيع حماية. تحتاج السعة الفعلية وفتحات التسجيل وتوافق الأقراص وافتراضات الاحتفاظ إلى مراجعة هندسية بشرية؛ ليس تصميماً مؤكداً للأقراص.`;
      break;
    }
    case "NVR_RECORDER": {
      const channels = capacity(name, "channels?|ch|قناة|قنوات");
      if (!/\bnvr\b/.test(name) || !channels || !Number.isInteger(channels) || !Number(spec.requiredChannels)) return null;
      quantity = Math.ceil(Number(spec.requiredChannels) / channels);
      selectedSpecification.catalogChannelsPerRecorder = channels;
      waste = quantity * channels - Number(spec.requiredChannels);
      formula = `ceil(${spec.requiredChannels} camera channels / ${channels} channels per catalog NVR) = ${quantity} recorders. Bandwidth, disk bays and site layout require review.`;
      formulaAr = `تقريب لأعلى (${spec.requiredChannels} قناة كاميرا ÷ ${channels} قناة لكل جهاز NVR من الكتالوج) = ${quantity} جهاز تسجيل. يلزم مراجعة معدل نقل البيانات وفتحات الأقراص وتوزيع الموقع.`;
      break;
    }
    case "POE_SWITCH": {
      const ports = capacity(name, "ports?|منفذ|منافذ");
      const reserved = Number(spec.reservedPorts);
      if (!/\bpoe\b/.test(name) || !ports || !Number.isInteger(ports) || !Number.isFinite(reserved) || ports <= reserved || !Number(spec.requiredPorts)) return null;
      quantity = Math.ceil(Number(spec.requiredPorts) / (ports - reserved));
      selectedSpecification.catalogPortsPerSwitch = ports;
      waste = quantity * (ports - reserved) - Number(spec.requiredPorts);
      formula = `ceil(${spec.requiredPorts} camera ports / (${ports} catalog ports - ${reserved} reserved uplink ports)) = ${quantity} switches. One port per camera; PoE power budget and topology require review.`;
      formulaAr = `تقريب لأعلى (${spec.requiredPorts} منفذ كاميرا ÷ (${ports} منفذ من الكتالوج − ${reserved} منفذ ربط محجوز)) = ${quantity} موزع. منفذ لكل كاميرا؛ يلزم مراجعة ميزانية طاقة PoE وتصميم الشبكة.`;
      break;
    }
    case "CAT6_CABLING":
      if (!/\bcat6\b/.test(name) || capacity(name, "m|met(?:er|re)s?|متر") !== 305) return null;
      break;
    case "CCTV_CAMERAS": if (!/\bip\b/.test(name) || !/camera|كامير/.test(name)) return null; break;
    case "RACK_CABINET": if (!/cabinet|rack|كابين/.test(name)) return null; break;
    case "CONNECTORS_AND_ACCESSORIES": if (!/\brj45\b/.test(name)) return null; break;
    case "INSTALLATION_COMMISSIONING": if (!/installation|تركيب/.test(name)) return null; break;
    default: return null;
  }
  // No implicit pack conversion, TB-as-disk, metre-as-roll, or Point-as-Lot conversion.
  if (unitKind(unit) !== unitKind(expectedUnit)) return null;
  const line: ExtractedLineItem = { ...extracted, quantity, requestedUnitText: unit,
    commercializationPending: false, typeIntent: item.type as "PRODUCT" | "SERVICE",
    provenance: extracted.componentKey === "SURVEILLANCE_STORAGE_CAPACITY" ? "CALCULATED" : extracted.provenance,
    formulaExplanation: formula, formulaExplanationAr: formulaAr,
    commercialRequirement: { ...requirement, quantity, unit, specification: { ...spec, ...selectedSpecification }, matchStatus: "COMMERCIAL_MATCH_CONFIRMED" },
  };
  return { item, line, waste,
    exact: [item.code, item.name, item.nameAr, item.nameEn, item.sku].some((value) => value && normalized(value.trim()) === normalized(extracted.text.trim())),
    option: { id: item.id.toString(), code: item.code, name: (locale === "ar" ? item.nameAr : item.nameEn) || item.name,
      nameAr: item.nameAr, nameEn: item.nameEn, type: item.type as "PRODUCT" | "SERVICE", quantity, unitName: unit },
  };
}

/** Bounded bilingual tenant search. A truncated result can never establish uniqueness. */
export async function resolveCommercialCatalog(
  companyId: string, extracted: ExtractedLineItem, locale: SalesAssistantSourceLocale,
  catalog: Pick<CatalogItemRepository, "findAll">, units: Pick<UnitRepository, "findById">,
  selectedId?: string,
) {
  const terms = [...new Set([extracted.text, ...searches[extracted.componentKey!]])];
  const batches = await Promise.all(terms.map((search) => catalog.findAll({ companyId, search, type: extracted.commercialRequirement!.preferredType, isActive: true, take: 51 })));
  const searchTruncated = batches.some((batch) => batch.length >= 51);
  const items = [...new Map(batches.flat().filter((item) => item.companyId === companyId && item.isActive).map((item) => [item.id.toString(), item])).values()];
  const unitCache = new Map<string, ReturnType<UnitRepository["findById"]>>();
  const choices = (await Promise.all(items.map(async (item) => {
    if (!item.unitId) return null;
    if (!unitCache.has(item.unitId)) unitCache.set(item.unitId, units.findById(item.unitId, companyId));
    const unit = await unitCache.get(item.unitId);
    return unit?.isActive ? commercialChoice(extracted, item, unit.symbol, locale) : null;
  }))).filter((choice): choice is Choice => choice !== null)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.waste - b.waste || a.option.code.localeCompare(b.option.code) || a.option.id.localeCompare(b.option.id));
  const exact = choices.filter((choice) => choice.exact);
  // A persisted human choice wins on reanalysis, but is revalidated against tenant/unit/spec evidence.
  const selected = selectedId ? choices.find((choice) => choice.option.id === selectedId) : undefined;
  const matched = selected ?? (!selectedId && !searchTruncated ? (exact.length === 1 ? exact[0] : choices.length === 1 ? choices[0] : undefined) : undefined);
  if (matched) matched.line.commercialRequirement = { ...matched.line.commercialRequirement!, searchTruncated,
    matchBasis: selected ? "USER_SELECTED" : matched.exact ? "EXACT" : "COMPATIBLE" };
  return { matched, candidates: choices.slice(0, 5).map((choice) => choice.option), searchTruncated };
}
