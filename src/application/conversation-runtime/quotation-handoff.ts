import type { CreateQuotationDto } from "@/src/application/quotation";
import { isQuotationScopeType, type QuotationScopeType } from "@/src/domain/quotation";
import type { CommercialSolutionHandoff, ConfirmedFact } from "./types";

export type CommercialBlockingField = {
  key: "customer.name" | "customer.selection" | "system.jurisdiction";
  candidates?: Array<{ id: string; name: string }>;
};

export type HandoffCustomerResolution =
  | { status: "RESOLVED"; id: string; name: string }
  | { status: "AMBIGUOUS"; candidates: Array<{ id: string; name: string }> }
  | { status: "PENDING" };

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
  return value && ["USER_EXPLICIT", "USER_APPROVED", "USER_CORRECTION", "VERIFIED_DOCUMENT", "VERIFIED_DATABASE", "TRUSTED_PROFILE", "DETERMINISTIC_DERIVATION"].includes(value.provenance) ? value : null;
}

function textFact(handoff: CommercialSolutionHandoff, key: string) {
  const value = fact(handoff, key)?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function commercialHandoffQuotationNumber(handoff: CommercialSolutionHandoff) {
  const created = new Date(handoff.createdAt);
  if (!Number.isFinite(created.getTime())) throw new Error("COMMERCIAL_HANDOFF_CREATED_AT_INVALID");
  const compact = created.toISOString().replace(/[-:TZ.]/g, "");
  return `QT-${compact.slice(0, 8)}-${compact.slice(8, 17)}`;
}

function localizedNotes(handoff: CommercialSolutionHandoff, locale: "ar" | "en") {
  const labels: Record<string, [string, string]> = {
    "project.siteRequirement": ["متطلبات الموقع", "Site requirement"], "commercial.exclusions": ["الاستثناءات", "Exclusions"], "commercial.notes": ["ملاحظات", "Notes"],
  };
  const meaningful = Object.entries(labels).flatMap(([key, label]) => {
    const current = fact(handoff, key);
    return current ? [`${locale === "ar" ? label[0] : label[1]}: ${String(current.value)}`] : [];
  });
  const workspace = handoff.workspace?.siteAndResponsibilities;
  const structured = workspace ? [
    [locale === "ar" ? "E*7D('* 'DEHB9" : "Site requirements", workspace.siteRequirements],
    [locale === "ar" ? "E3$HDJ'* 'DEH1/" : "Supplier responsibilities", workspace.supplierResponsibilities],
    [locale === "ar" ? "E3$HDJ'* 'D9EJD" : "Customer responsibilities", workspace.customerResponsibilities],
    [locale === "ar" ? "'D'3*+F'!'*" : "Exclusions", workspace.exclusions],
    [locale === "ar" ? "ED'-8'*" : "Notes", workspace.notes],
  ].flatMap(([label, values]) => (values as string[]).map((value) => label + ": " + value)) : [];
  return [...meaningful, ...structured].join("\n") || null;
}

function localizedSubject(system: string, scopeType: QuotationScopeType | null, locale: "ar" | "en") {
  const scope = scopeType === "SUPPLY_AND_INSTALLATION" ? (locale === "ar" ? "توريد وتركيب" : "Supply and installation")
    : scopeType === "SUPPLY_ONLY" ? (locale === "ar" ? "توريد" : "Supply")
      : scopeType === "INSTALLATION_ONLY" ? (locale === "ar" ? "تركيب" : "Installation") : null;
  return locale === "ar" ? `عرض سعر — ${scope ? `${scope} ` : ""}${system}` : `Quotation — ${scope ? `${scope} ` : ""}${system}`;
}

export function adaptCommercialHandoffToQuotationDraft(input: {
  companyId: string;
  handoff: CommercialSolutionHandoff;
  customer: Extract<HandoffCustomerResolution, { status: "RESOLVED" }> | null;
  defaults: QuotationDraftDefaults;
  locale: "ar" | "en";
}): CreateQuotationDto | null {
  const system = textFact(input.handoff, "system.identity");
  if (!system) return null;
  const scopeValue = textFact(input.handoff, "scope.type");
  const scopeType = isQuotationScopeType(scopeValue) ? scopeValue : null;
  const projectName = textFact(input.handoff, "project.name");
  const attentionName = textFact(input.handoff, "attention.name");
  const lines = input.handoff.commercialLines.map((line, index) => {
    const catalogVerified = ["VERIFIED_PROFILE", "VERIFIED_DATABASE"].includes(line.authority);
    const approvedResearchSelection = line.authority === "RESEARCHED" && Boolean(line.brand || line.model);
    return { catalogItemId: catalogVerified ? line.catalogItemId?.trim() || null : null, taxRateId: null, position: index + 1, type: line.type, itemName: line.itemName, itemNameAr: line.itemNameAr, itemNameEn: line.itemNameEn, description: line.description, unitName: line.unitName, quantity: line.quantity, unitPrice: catalogVerified ? line.unitPrice : null, quantityStatus: line.quantityState ?? (line.quantity === null ? "PENDING" as const : "CONFIRMED" as const), pricingStatus: catalogVerified && line.unitPrice !== null ? "CONFIRMED" as const : "PENDING" as const, productSelectionStatus: (catalogVerified && line.catalogItemId) || approvedResearchSelection ? "SELECTED" as const : "PENDING" as const, brandName: catalogVerified || approvedResearchSelection ? line.brand ?? null : null, modelNumber: catalogVerified || approvedResearchSelection ? line.model ?? null : null, provenance: line.authority, engineeringComponentKeys: line.componentKeys ?? [], taxPercentage: 0 };
  });
  return {
    companyId: input.companyId,
    customerId: input.customer?.id ?? null,
    quotationNumber: commercialHandoffQuotationNumber(input.handoff),
    currencyCode: input.defaults.currencyCode,
    customer: input.customer ? { name: input.customer.name } : null,
    lines,
    scopeType,
    projectName,
    attentionName,
    ...(input.locale === "ar" ? { subjectAr: localizedSubject(system, scopeType, "ar"), briefAr: `مسودة عرض مبنية على النطاق المؤكد: ${system}.`, notesAr: localizedNotes(input.handoff, "ar"), termsAndConditionsAr: input.defaults.termsAr } : { subjectEn: localizedSubject(system, scopeType, "en"), briefEn: `Draft quotation based on the confirmed scope: ${system}.`, notesEn: localizedNotes(input.handoff, "en"), termsAndConditionsEn: input.defaults.termsEn }),
    localizationSourceLocale: input.locale,
  };
}

export class CreateQuotationFromCommercialHandoff {
  constructor(private readonly port: CommercialHandoffQuotationPort) {}

  async execute(input: { companyId: string; handoff: CommercialSolutionHandoff; locale: "ar" | "en" }): Promise<CommercialHandoffQuotationResult> {
    const system = textFact(input.handoff, "system.identity");
    if (!system) return { status: "INVALID_HANDOFF", code: "CONFIRMED_SYSTEM_REQUIRED", message: "A confirmed system is required." };
    const customerName = textFact(input.handoff, "customer.name");
    const quotationNumber = commercialHandoffQuotationNumber(input.handoff);
    const existing = await this.port.findByNumber(input.companyId, quotationNumber);
    if (existing) return { status: "EXISTING", quotationId: existing.id, navigationTarget: `/dashboard/quotations/${existing.id}/edit`, localizationPending: existing.localizationPending };
    const resolution = customerName ? await this.port.resolveCustomer(input.companyId, customerName, input.locale) : { status: "PENDING" as const };
    if (resolution.status === "AMBIGUOUS") return { status: "NEEDS_COMMERCIAL_INFO", blockingFields: [{ key: "customer.selection", candidates: resolution.candidates }] };
    const customer = resolution.status === "RESOLVED" ? resolution : null;
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
