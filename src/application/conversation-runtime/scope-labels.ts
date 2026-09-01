import type { QuotationScopeType } from "@/src/domain/quotation";

const labels: Record<QuotationScopeType, { ar: string; en: string }> = {
  SUPPLY_ONLY: { ar: "توريد فقط", en: "Supply Only" },
  SUPPLY_AND_INSTALLATION: { ar: "توريد وتركيب", en: "Supply and Installation" },
  INSTALLATION_ONLY: { ar: "تركيب فقط", en: "Installation Only" },
  SERVICE: { ar: "خدمة", en: "Service" },
  MAINTENANCE: { ar: "صيانة", en: "Maintenance" },
  CONSULTATION: { ar: "استشارة", en: "Consultation" },
  CUSTOM: { ar: "نطاق مخصص", en: "Custom Scope" },
};

export function quotationScopeLabel(value: string | null, locale: "ar" | "en") {
  if (!value) return null;
  return labels[value as QuotationScopeType]?.[locale] ?? (locale === "ar" ? "نطاق آخر" : "Other Scope");
}
