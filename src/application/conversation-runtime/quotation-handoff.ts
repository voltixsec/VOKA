import type { CreateQuotationDto } from "@/src/application/quotation";
import { isQuotationScopeType, type QuotationScopeType } from "@/src/domain/quotation";
import type { CommercialSolutionHandoff, ConfirmedFact } from "./types";

export type CommercialBlockingField = {
  key: "customer.name" | "customer.selection";
  candidates?: Array<{ id: string; name: string }>;
};

export type HandoffCustomerResolution =
  | { status: "RESOLVED"; id: string; name: string }
  | { status: "AMBIGUOUS"; candidates: Array<{ id: string; name: string }> };

export type QuotationDraftDefaults = {
  currencyCode: string;
  termsAr: string | null;
  termsEn: string | null;
};

export type PersistedQuotationDraft = { id: string; status: string; localizationPending: boolean };

export interface CommercialHandoffQuotationPort {
  findByNumber(companyId: string, quotationNumber: string): Promise<PersistedQuotationDraft | null>;
  resolveCustomer(companyId: string, confirmedName: string, locale: "ar" | "en"): Promise<HandoffCustomerResolution>;
  loadDefaults(companyId: string, scopeType: QuotationScopeType | null): Promise<QuotationDraftDefaults>;
  createDraft(input: CreateQuotationDto): Promise<{ success: true; draft: PersistedQuotationDraft } | { success: false; code: string; message: string }>;
}

export type CommercialHandoffQuotationResult =
  | { status: "CREATED" | "EXISTING"; quotationId: string; navigationTarget: string; localizationPending: boolean }
  | { status: "NEEDS_COMMERCIAL_INFO"; blockingFields: CommercialBlockingField[] }
  | { status: "INVALID_HANDOFF" | "CREATE_FAILED"; code: string; message: string };

function fact(handoff: CommercialSolutionHandoff, key: string): ConfirmedFact | null {
  const value = handoff.confirmedFacts[key];
  return value && ["USER_EXPLICIT", "USER_CORRECTION", "VERIFIED_DOCUMENT", "VERIFIED_DATABASE", "TRUSTED_PROFILE", "DETERMINISTIC_DERIVATION"].includes(value.provenance) ? value : null;
}

function textFact(handoff: CommercialSolutionHandoff, key: string) {
  const value = fact(handoff, key)?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stableFingerprint(handoff: CommercialSolutionHandoff) {
  const facts = Object.keys(handoff.confirmedFacts).sort().flatMap((key) => {
    const current = fact(handoff, key);
    return current ? [[key, current.value, current.provenance]] : [];
  });
  const lines = handoff.commercialLines.flatMap((line) => ["VERIFIED_PROFILE", "VERIFIED_DATABASE"].includes(line.authority) ? [[line.catalogItemId, line.quantity, line.unitPrice, line.authority]] : []);
  const input = JSON.stringify({ facts, lines });
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function commercialHandoffQuotationNumber(handoff: CommercialSolutionHandoff) {
  const runtime = handoff.runtimeId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).toUpperCase() || "RUNTIME";
  return `AI-${runtime}-${stableFingerprint(handoff).toUpperCase()}`;
}

function localizedNotes(handoff: CommercialSolutionHandoff, locale: "ar" | "en") {
  const labels: Record<string, [string, string]> = {
    "system.identity": ["النظام", "System"], "system.jurisdiction": ["الدولة", "Jurisdiction"], "system.quantity": ["الكمية", "Quantity"], "system.numberOfStops": ["الطوابق / الوقفات", "Floors / stops"], "system.vehicleClass": ["نوع المركبة", "Vehicle class"], "system.capacity": ["الحمولة", "Capacity"], "commercial.payment": ["الدفع", "Payment"], "commercial.delivery": ["التسليم", "Delivery"], "commercial.warranty": ["الضمان", "Warranty"], "commercial.validity": ["الصلاحية", "Validity"],
  };
  const confirmed = Object.entries(labels).flatMap(([key, label]) => {
    const current = fact(handoff, key);
    return current ? [`${locale === "ar" ? label[0] : label[1]}: ${String(current.value)}`] : [];
  });
  const evidence = handoff.toolEvidence.flatMap((observation) => observation.evidence.map((item) => `${item.title} — ${item.url}`));
  if (evidence.length) confirmed.push(locale === "ar" ? "مصادر مرجعية غير معتمدة تجاريًا:" : "Reference evidence — not commercial authority:", ...evidence);
  return confirmed.join("\n") || null;
}

export function adaptCommercialHandoffToQuotationDraft(input: {
  companyId: string;
  handoff: CommercialSolutionHandoff;
  customer: Extract<HandoffCustomerResolution, { status: "RESOLVED" }>;
  defaults: QuotationDraftDefaults;
  locale: "ar" | "en";
}): CreateQuotationDto | null {
  const system = textFact(input.handoff, "system.identity");
  if (!system) return null;
  const scopeValue = textFact(input.handoff, "scope.type");
  const scopeType = isQuotationScopeType(scopeValue) ? scopeValue : null;
  const projectName = textFact(input.handoff, "project.name");
  const attentionName = textFact(input.handoff, "attention.name");
  const lines = input.handoff.commercialLines.flatMap((line, index) => line.catalogItemId.trim() && ["VERIFIED_PROFILE", "VERIFIED_DATABASE"].includes(line.authority) && Number.isFinite(line.quantity) && line.quantity > 0 && Number.isFinite(line.unitPrice) && line.unitPrice >= 0 ? [{ catalogItemId: line.catalogItemId.trim(), taxRateId: null, position: index + 1, type: line.type, itemName: line.itemName, itemNameAr: line.itemNameAr, itemNameEn: line.itemNameEn, description: line.description, unitName: line.unitName, quantity: line.quantity, unitPrice: line.unitPrice, taxPercentage: 0 }] : []);
  return {
    companyId: input.companyId,
    customerId: input.customer.id,
    quotationNumber: commercialHandoffQuotationNumber(input.handoff),
    currencyCode: input.defaults.currencyCode,
    customer: { name: input.customer.name },
    lines,
    scopeType,
    projectName,
    attentionName,
    ...(input.locale === "ar" ? { subjectAr: `عرض سعر — ${system}`, briefAr: `مسودة عرض مبنية على الحل المؤكد لنظام ${system}.`, notesAr: localizedNotes(input.handoff, "ar"), termsAndConditionsAr: input.defaults.termsAr } : { subjectEn: `Quotation — ${system}`, briefEn: `Draft quotation based on the confirmed ${system} solution.`, notesEn: localizedNotes(input.handoff, "en"), termsAndConditionsEn: input.defaults.termsEn }),
    localizationSourceLocale: input.locale,
  };
}

export class CreateQuotationFromCommercialHandoff {
  constructor(private readonly port: CommercialHandoffQuotationPort) {}

  async execute(input: { companyId: string; handoff: CommercialSolutionHandoff; locale: "ar" | "en" }): Promise<CommercialHandoffQuotationResult> {
    const system = textFact(input.handoff, "system.identity");
    if (!system) return { status: "INVALID_HANDOFF", code: "CONFIRMED_SYSTEM_REQUIRED", message: "A confirmed system is required." };
    const customerName = textFact(input.handoff, "customer.name");
    if (!customerName) return { status: "NEEDS_COMMERCIAL_INFO", blockingFields: [{ key: "customer.name" }] };
    const quotationNumber = commercialHandoffQuotationNumber(input.handoff);
    const existing = await this.port.findByNumber(input.companyId, quotationNumber);
    if (existing) return { status: "EXISTING", quotationId: existing.id, navigationTarget: `/dashboard/quotations/${existing.id}/edit`, localizationPending: existing.localizationPending };
    const customer = await this.port.resolveCustomer(input.companyId, customerName, input.locale);
    if (customer.status === "AMBIGUOUS") return { status: "NEEDS_COMMERCIAL_INFO", blockingFields: [{ key: "customer.selection", candidates: customer.candidates }] };
    const scopeValue = textFact(input.handoff, "scope.type");
    const defaults = await this.port.loadDefaults(input.companyId, isQuotationScopeType(scopeValue) ? scopeValue : null);
    const dto = adaptCommercialHandoffToQuotationDraft({ ...input, customer, defaults });
    if (!dto) return { status: "INVALID_HANDOFF", code: "CONFIRMED_SYSTEM_REQUIRED", message: "A confirmed system is required." };
    try {
      const created = await this.port.createDraft(dto);
      if (created.success) return { status: "CREATED", quotationId: created.draft.id, navigationTarget: `/dashboard/quotations/${created.draft.id}/edit`, localizationPending: created.draft.localizationPending };
      if (created.code === "QUOTATION_ALREADY_EXISTS") {
        const duplicate = await this.port.findByNumber(input.companyId, quotationNumber);
        if (duplicate) return { status: "EXISTING", quotationId: duplicate.id, navigationTarget: `/dashboard/quotations/${duplicate.id}/edit`, localizationPending: duplicate.localizationPending };
      }
      return { status: "CREATE_FAILED", code: created.code, message: created.message };
    } catch {
      const duplicate = await this.port.findByNumber(input.companyId, quotationNumber);
      if (duplicate) return { status: "EXISTING", quotationId: duplicate.id, navigationTarget: `/dashboard/quotations/${duplicate.id}/edit`, localizationPending: duplicate.localizationPending };
      throw new Error("QUOTATION_HANDOFF_CREATE_FAILED");
    }
  }
}
