import type { CreateQuotationDto } from "@/src/application/quotation";
import { isQuotationScopeType, type QuotationScopeType } from "@/src/domain/quotation";
import type { CommercialSolutionHandoff, ConfirmedFact } from "./types";
import { normalizeCommercialText, type CommercialDefaultsProfile } from "./commercial-defaults";
import { applyApprovedProductSelection } from "./solution-graph";
import { projectCommercialBomLine } from "./commercial-projection";
import { resolveExpiry } from "@/src/application/ai-sales-assistant/services/commercial-field-values";
import { quotationScopeLabel } from "./scope-labels";

export type CommercialBlockingField = {
  key: "customer.name" | "customer.selection" | "system.jurisdiction";
  candidates?: Array<{ id: string; name: string }>;
};

export type HandoffCustomerResolution =
  | { status: "RESOLVED"; id: string; name: string }
  | { status: "AMBIGUOUS"; proposedName: string; candidates: Array<{ id: string; name: string }> }
  | { status: "PENDING"; proposedName?: string };

export type QuotationDraftDefaults = CommercialDefaultsProfile;

export type PersistedQuotationDraft = { id: string; status: string; localizationPending: boolean };

export interface CommercialHandoffQuotationPort {
  findByHandoff(companyId: string, handoffId: string): Promise<PersistedQuotationDraft | null>;
  resolveCustomer(companyId: string, confirmedName: string, locale: "ar" | "en"): Promise<HandoffCustomerResolution>;
  loadDefaults(companyId: string, scopeType: QuotationScopeType | null, locale?: "ar" | "en"): Promise<QuotationDraftDefaults>;
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

function localizedNotes(handoff: CommercialSolutionHandoff, locale: "ar" | "en") {
  const labels: Record<string, [string, string]> = {
    "project.siteRequirement": ["متطلبات الموقع", "Site requirement"], "commercial.exclusions": ["الاستثناءات", "Exclusions"],
  };
  const meaningful = Object.entries(labels).flatMap(([key, label]) => {
    const current = fact(handoff, key);
    const value = current ? normalizeCommercialText(String(current.value)) : null;
    return value ? [`${locale === "ar" ? label[0] : label[1]}: ${value}`] : [];
  });
  const workspace = handoff.workspace?.siteAndResponsibilities;
  const structured = workspace ? [
    [locale === "ar" ? "متطلبات الموقع" : "Site requirements", workspace.siteRequirements],
    [locale === "ar" ? "مسؤوليات المورد" : "Supplier responsibilities", workspace.supplierResponsibilities],
    [locale === "ar" ? "مسؤوليات العميل" : "Customer responsibilities", workspace.customerResponsibilities],
    [locale === "ar" ? "الاستثناءات" : "Exclusions", workspace.exclusions],
    [locale === "ar" ? "ملاحظات" : "Notes", workspace.notes],
  ].flatMap(([label, values]) => (values as string[]).flatMap((raw) => {
    const value = normalizeCommercialText(raw);
    return value ? [label + ": " + value] : [];
  })) : [];
  return normalizeCommercialText([...new Set([...meaningful, ...structured])].join("\n"));
}

function localizedSubject(system: string, scopeType: QuotationScopeType | null, locale: "ar" | "en") {
  const scope = quotationScopeLabel(scopeType, locale);
  return locale === "ar" ? `عرض سعر — ${scope ? `${scope} ` : ""}${system}` : `Quotation — ${scope ? `${scope} ` : ""}${system}`;
}

function localizedBrief(system: string, scopeType: QuotationScopeType | null, locale: "ar" | "en") {
  if (locale === "ar") {
    if (scopeType === "SUPPLY_ONLY") return `توريد مكونات ${system} وفقاً للمواصفات والكميات المعتمدة، شاملاً الأجهزة والملحقات المحددة في عرض السعر.`;
    if (scopeType === "INSTALLATION_ONLY") return `تنفيذ أعمال تركيب ${system} وفقاً للنطاق والمواصفات والكميات المعتمدة للمشروع.`;
    if (scopeType === "SUPPLY_AND_INSTALLATION") return `توريد وتركيب ${system} وفقاً للمواصفات والكميات المعتمدة للمشروع، شاملاً المكونات والملحقات والأعمال المحددة في عرض السعر.`;
    if (scopeType === "MAINTENANCE") return `تنفيذ أعمال صيانة ${system} وفقاً للنطاق والمتطلبات المعتمدة للمشروع.`;
    if (scopeType === "SERVICE" || scopeType === "CONSULTATION") return `تقديم خدمات ${system} وفقاً للنطاق والمتطلبات المعتمدة للمشروع.`;
    return `تقديم ${system} وفقاً للنطاق والمواصفات والكميات المعتمدة في عرض السعر.`;
  }
  if (scopeType === "SUPPLY_ONLY") return `Supply of ${system} components in accordance with the approved specifications and quantities, including the equipment and accessories listed in this quotation.`;
  if (scopeType === "INSTALLATION_ONLY") return `Installation of ${system} in accordance with the approved project scope, specifications, and quantities.`;
  if (scopeType === "SUPPLY_AND_INSTALLATION") return `Supply and installation of ${system} in accordance with the approved project specifications and quantities, including the components, accessories, and works listed in this quotation.`;
  if (scopeType === "MAINTENANCE") return `Maintenance of ${system} in accordance with the approved project scope and requirements.`;
  if (scopeType === "SERVICE" || scopeType === "CONSULTATION") return `Professional services for ${system} in accordance with the approved project scope and requirements.`;
  return `${system} in accordance with the approved scope, specifications, and quantities stated in this quotation.`;
}

export function adaptCommercialHandoffToQuotationDraft(input: {
  companyId: string;
  handoff: CommercialSolutionHandoff;
  customer: Extract<HandoffCustomerResolution, { status: "RESOLVED" }> | { status: "PROPOSED"; name: string } | null;
  defaults: QuotationDraftDefaults;
  locale: "ar" | "en";
}): CreateQuotationDto | null {
  const system = normalizeCommercialText(textFact(input.handoff, "system.identity"));
  if (!system) return null;
  const scopeValue = textFact(input.handoff, "scope.type");
  const scopeType = isQuotationScopeType(scopeValue) ? scopeValue : null;
  const projectName = normalizeCommercialText(textFact(input.handoff, "project.name"));
  const attentionName = normalizeCommercialText(textFact(input.handoff, "attention.name"));
  const commercialValues = {
    payment: input.defaults.payment,
    delivery: input.defaults.delivery,
    warranty: input.defaults.warranty,
    validity: input.defaults.validity,
  };
  // Company legal text is copied verbatim, never composed from conversation clauses.
  const terms = input.locale === "ar" ? input.defaults.termsAr : input.defaults.termsEn;
  const expiry = commercialValues.validity ? resolveExpiry(commercialValues.validity, input.handoff.createdAt.slice(0, 10)) : null;
  // Older signed handoffs may contain a stale flattened copy. Project the latest
  // governed lines by stable identity, with approved selection facts reapplied.
  const governed = input.handoff.workspace?.commercialSolution.bom;
  const sourceLines: CommercialSolutionHandoff["commercialLines"] = governed ? governed.map((original) => {
    const line = projectCommercialBomLine(applyApprovedProductSelection(original, input.handoff.confirmedFacts));
    return { ...line, catalogItemId: line.catalogItemId ?? null, authority: line.provenance === "VERIFIED_CATALOG" ? "VERIFIED_DATABASE" : line.provenance === "RESEARCHED" ? "RESEARCHED" : "DETERMINISTIC_DERIVATION" };
  }) : input.handoff.commercialLines;
  const lines = sourceLines.map((line, index) => {
    const catalogVerified = ["VERIFIED_PROFILE", "VERIFIED_DATABASE"].includes(line.authority);
    const governedSelection = Boolean(line.brand || line.model);
    return { catalogItemId: catalogVerified ? line.catalogItemId?.trim() || null : null, taxRateId: null, position: index + 1, type: line.type, itemName: normalizeCommercialText(line.itemName) ?? line.itemName, itemNameAr: normalizeCommercialText(line.itemNameAr), itemNameEn: normalizeCommercialText(line.itemNameEn), description: normalizeCommercialText(line.description), unitName: line.unitName, quantity: line.quantity, unitPrice: catalogVerified ? line.unitPrice : null, quantityStatus: line.quantityState ?? (line.quantity === null ? "PENDING" as const : "CONFIRMED" as const), pricingStatus: catalogVerified && line.unitPrice !== null ? "CONFIRMED" as const : "PENDING" as const, productSelectionStatus: line.productSelectionStatus ?? ((catalogVerified && line.catalogItemId) || governedSelection ? "SELECTED" as const : "PENDING" as const), engineeringStatus: line.engineeringStatus, commercialPricingStatus: line.pricingStatus ?? (catalogVerified && line.unitPrice !== null ? "CONFIRMED" as const : line.marketPrice ? "MARKET_REFERENCE_AVAILABLE" as const : "PENDING" as const), commercialAttributes: line.commercialAttributes, brandName: governedSelection ? line.brand ?? null : null, modelNumber: governedSelection ? line.model ?? null : null, provenance: line.authority, engineeringComponentKeys: line.componentKeys ?? [], marketPrice: line.marketPrice ?? null, taxPercentage: 0 };
  });
  return {
    companyId: input.companyId,
    customerId: input.customer?.status === "RESOLVED" ? input.customer.id : null,
    familyId: input.handoff.runtimeId,
    currencyCode: input.defaults.currencyCode,
    customer: input.customer ? { name: input.customer.name } : null,
    lines,
    scopeType,
    projectName,
    attentionName,
    expiryDate: expiry ? new Date(`${expiry}T23:59:59.999Z`) : null,
    termsAndConditions: terms,
    termsAndConditionsAr: input.defaults.termsAr,
    termsAndConditionsEn: input.defaults.termsEn,
    ...(input.locale === "ar" ? { subjectAr: localizedSubject(system, scopeType, "ar"), briefAr: localizedBrief(system, scopeType, "ar"), notesAr: localizedNotes(input.handoff, "ar") } : { subjectEn: localizedSubject(system, scopeType, "en"), briefEn: localizedBrief(system, scopeType, "en"), notesEn: localizedNotes(input.handoff, "en") }),
    localizationSourceLocale: input.locale,
  };
}

export class CreateQuotationFromCommercialHandoff {
  constructor(private readonly port: CommercialHandoffQuotationPort) {}

  async execute(input: { companyId: string; handoff: CommercialSolutionHandoff; locale: "ar" | "en" }): Promise<CommercialHandoffQuotationResult> {
    const system = textFact(input.handoff, "system.identity");
    if (!system) return { status: "INVALID_HANDOFF", code: "CONFIRMED_SYSTEM_REQUIRED", message: "A confirmed system is required." };
    const customerName = textFact(input.handoff, "customer.name");
    const existing = await this.port.findByHandoff(input.companyId, input.handoff.runtimeId);
    if (existing) return { status: "EXISTING", quotationId: existing.id, navigationTarget: `/dashboard/quotations/${existing.id}/edit`, localizationPending: existing.localizationPending };
    // A handoff creates a reviewable DRAFT. Customer matching is best effort;
    // an absent customer must not turn a safe draft handoff into a dead end.
    const resolution = customerName ? await this.port.resolveCustomer(input.companyId, customerName, input.locale) : { status: "PENDING" as const };
    const customer = resolution.status === "RESOLVED"
      ? resolution
      : customerName
        ? { status: "PROPOSED" as const, name: customerName }
        : null;
    const scopeValue = textFact(input.handoff, "scope.type");
    const defaults = await this.port.loadDefaults(input.companyId, isQuotationScopeType(scopeValue) ? scopeValue : null, input.locale);
    const dto = adaptCommercialHandoffToQuotationDraft({ ...input, customer, defaults });
    if (!dto) return { status: "INVALID_HANDOFF", code: "CONFIRMED_SYSTEM_REQUIRED", message: "A confirmed system is required." };
    try {
      const created = await this.port.createDraft(dto);
      if (created.success) return { status: "CREATED", quotationId: created.draft.id, navigationTarget: `/dashboard/quotations/${created.draft.id}/edit`, localizationPending: created.draft.localizationPending };
      if (created.code === "QUOTATION_ALREADY_EXISTS") {
        const duplicate = await this.port.findByHandoff(input.companyId, input.handoff.runtimeId);
        if (duplicate) return { status: "EXISTING", quotationId: duplicate.id, navigationTarget: `/dashboard/quotations/${duplicate.id}/edit`, localizationPending: duplicate.localizationPending };
        const retried = await this.port.createDraft(dto);
        if (retried.success) return { status: "CREATED", quotationId: retried.draft.id, navigationTarget: `/dashboard/quotations/${retried.draft.id}/edit`, localizationPending: retried.draft.localizationPending };
      }
      return { status: "CREATE_FAILED", code: created.code, message: created.message };
    } catch {
      const duplicate = await this.port.findByHandoff(input.companyId, input.handoff.runtimeId);
      if (duplicate) return { status: "EXISTING", quotationId: duplicate.id, navigationTarget: `/dashboard/quotations/${duplicate.id}/edit`, localizationPending: duplicate.localizationPending };
      throw new Error("QUOTATION_HANDOFF_CREATE_FAILED");
    }
  }
}
