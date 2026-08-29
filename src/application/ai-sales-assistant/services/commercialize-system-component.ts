import type { SystemComponent, SystemCalculationResult } from "../../../domain/smart-system";
import type { ExtractedLineItem, SalesAssistantSourceLocale } from "../dto/AISalesAssistantDto";

/** Boundary adapter only: engineering templates/calculations remain unchanged. */
export function commercializeSystemComponent(component: SystemComponent, locale: SalesAssistantSourceLocale, system?: SystemCalculationResult): ExtractedLineItem {
  const line: ExtractedLineItem = {
    commercialRequirement: !system || system.systemType === "CCTV" ? {
      category: component.componentKey, preferredType: component.itemType,
      quantity: component.quantity, unit: component.unit, specification: { ...component.specification },
      source: { requirement: component, inputs: system?.inputs ?? [], ruleVersion: system?.templateVersion ?? null },
      matchStatus: "COMMERCIAL_ITEM_TEMPORARY", reviewRequired: true,
    } : undefined,
    text: locale === "ar" ? component.nameAr : component.nameEn,
    itemNameAr: component.nameAr, itemNameEn: component.nameEn,
    description: null, quantity: component.quantity, requestedUnitText: component.unit,
    requestedPrice: null, typeIntent: component.itemType,
    provenance: component.provenance, formulaExplanation: component.formulaExplanation,
    formulaExplanationAr: component.formulaExplanationAr, componentKey: component.componentKey,
  };
  if (component.componentKey === "SURVEILLANCE_STORAGE_CAPACITY") {
    // TB is a requirement, not an HDD count. Without a confirmed drive capacity,
    // bay layout/RAID policy or compatible SKU, do not invent a disk design.
    const ar = "حزمة توريد وحدات تخزين المراقبة";
    const en = "Surveillance storage supply package";
    return { ...line, text: locale === "ar" ? ar : en, itemNameAr: ar, itemNameEn: en,
      commercialRequirement: { ...line.commercialRequirement!, quantity: 1, unit: "Package" },
      quantity: 1, requestedUnitText: "Package", typeIntent: "CUSTOM", provenance: "SUGGESTED",
      commercializationPending: true,
      formulaExplanation: "One provisional storage supply package, not one disk. Drive capacity, disk quantity, recorder bays and price require human design/commercial review. Required TB remains in the internal engineering snapshot.",
      formulaExplanationAr: "حزمة توريد تخزين مبدئية واحدة، وليست قرصاً واحداً. تحتاج سعة الأقراص وعددها وفتحات التسجيل والسعر إلى مراجعة التصميم والتسعير بشرياً. تبقى السعة المطلوبة في السجل الهندسي الداخلي.",
    };
  }
  if (component.componentKey === "CAT6_CABLING") {
    const meters = component.specification?.metersPerRoll ?? 305;
    const ar = `بكرة كابل شبكة CAT6 بطول ${meters} متر`;
    const en = `CAT6 network cable ${meters}m roll`;
    return { ...line, text: locale === "ar" ? ar : en, itemNameAr: ar, itemNameEn: en };
  }
  if (component.componentKey === "INSTALLATION_COMMISSIONING") {
    const ar = "خدمة تركيب وبرمجة واختبار نظام المراقبة";
    const en = "CCTV installation, configuration and commissioning service";
    return { ...line, text: locale === "ar" ? ar : en, itemNameAr: ar, itemNameEn: en,
      commercialRequirement: { ...line.commercialRequirement!, quantity: 1, unit: "Package", specification: { ...line.commercialRequirement!.specification, requiredPoints: component.quantity } },
      quantity: 1, requestedUnitText: "Package", typeIntent: "CUSTOM", provenance: "SUGGESTED", commercializationPending: true,
      formulaExplanation: "One temporary installation service package. Per-point quantity is used only when a trusted catalog service explicitly uses a point unit.",
      formulaExplanationAr: "حزمة خدمة تركيب مؤقتة واحدة. لا تستخدم كمية النقاط إلا إذا كانت خدمة موثوقة في الكتالوج مسعرة صراحةً بوحدة النقطة.",
    };
  }
  return line;
}
