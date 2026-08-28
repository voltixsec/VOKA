import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantService } from "../../ai-sales-assistant";
import { customerMatchScore } from "@/features/customers/domain/customer-discovery";
import { CompleteCommercialConversation } from "../CompleteCommercialConversation";
import { commercialPhase } from "../field-completion";
import { companyToday, readCommercialClauses, resolveExpiry } from "../../ai-sales-assistant/services/commercial-field-values";
import type { WorkingCommercialDraft, ConversationReplySource } from "../types";

const prompt = "اعمل عرض سعر توريد وتركيب 130 كاميرا مراقبة للوطنية";
const defaultTerms = "صلاحية العرض: 30 يوم\nشروط الدفع: 50% مقدم\nالتسليم: 14 يوم\nالضمان: سنة";
function setup(options: { names?: string[]; terms?: string | null; paymentDays?: number } = {}) {
  const customers = (options.names ?? ["الوطنية"]).map((name, i) => ({ id: `c${i}`, name, code: `C${i}`, status: "ACTIVE", paymentTermDays: options.paymentDays }));
  const findAll = vi.fn().mockImplementation(async ({ search }) => customers.filter((customer) => customerMatchScore(customer, search)));
  const catalog = vi.fn().mockResolvedValue([]);
  const extractIntent = vi.fn().mockResolvedValue({ customerMention: "الوطنية", lines: [] });
  const service = new AISalesAssistantService({
    companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: "KWD", timezone: "Asia/Kuwait" }) },
    customers: { findAll }, catalogItems: { findAll: catalog },
    units: { findById: vi.fn(), findBySymbol: vi.fn() },
    quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
    pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn() },
    terms: { find: vi.fn().mockResolvedValue(options.terms === undefined ? defaultTerms : options.terms) },
  } as any, { extractIntent });
  const generate = vi.spyOn(service, "generateDraftProposal");
  const useCase = new CompleteCommercialConversation(service);
  const run = (reply: string, draft?: WorkingCommercialDraft, source: ConversationReplySource = "TEXT", extra = {}) => useCase.execute({ companyId: "tenant", reply, draft, replySource: source, locale: "ar", documentMode: "QUOTATION", ...extra });
  return { run, useCase, generate, findAll, catalog, extractIntent };
}

describe("field-aware canonical completion", () => {
  it("targets existing access-control fields and leaves engineering validation/formulas to the template", async () => {
    const { run } = setup();
    let draft = await run("توريد وتركيب نظام تحكم في الدخول");
    expect(draft.activeQuestion?.field).toBe("doorCount");
    draft = await run("999", draft);
    expect(draft.activeQuestion?.field).toBe("doorCount");
    expect(draft.canonicalProposal?.smartSystem?.status).toBe("INVALID_INPUT");
    draft = await run("٤", draft, "VOICE");
    expect(draft.activeQuestion?.field).toBe("accessDirection");
    expect(draft.activeQuestion?.options?.map((option) => option.ar)).toEqual(["دخول فقط", "دخول وخروج"]);
    draft = await run("دخول فقط", draft, "CHIP");
    expect(draft.systemAnswers?.accessDirection).toBe("ENTRY_ONLY");
    expect(draft.activeQuestion?.field).toBe("cableMetersPerDoor");
    draft = await run("٣٠", draft, "VOICE");
    expect(draft.canonicalProposal?.smartSystem?.status).toBe("COMPLETE");
    expect(draft.canonicalProposal?.lines.find((line) => line.componentKey === "ACCESS_CABLE")?.quantity).toBe(120);
    expect(draft.activeQuestion?.field).toBe("projectName");
    expect(draft.executed).toBe(false);
  });

  it("targets area on the existing gypsum system without interpreting it as a new commercial request", async () => {
    const { run } = setup();
    const first = await run("عايز سيستم جبس بورد");
    expect(first.activeQuestion?.field).toBe("areaM2");
    const second = await run("٢٠٠٠", first, "VOICE");
    expect(second.systemAnswers?.areaM2).toBe(2000);
    expect(second.canonicalProposal?.smartSystem?.status).toBe("COMPLETE");
    expect(second.id).toBe(first.id);
    expect(second.missingRequired.some((field) => field.key === "systemInput")).toBe(false);
  });

  it("retains non-system line intent and explicit price while re-resolving against the tenant", async () => {
    const { run, extractIntent, catalog } = setup();
    extractIntent.mockResolvedValueOnce({ customerMention: "الوطنية", scopeType: "SUPPLY_ONLY", currencyCode: "SAR", subject: "NVR supply", lines: [{ text: "NVR", quantity: 2, requestedPrice: 120, typeIntent: "PRODUCT" }] }).mockResolvedValue({ customerMention: null, scopeType: null, currencyCode: "KWD", subject: "DVR supply", lines: [{ text: "DVR", quantity: 99 }] });
    const first = await run("NVR", undefined, "TEXT", { buildMode: "CATALOG_ONLY" });
    const next = await run("مصنع الشويخ الجديد", first, "VOICE", { buildMode: "CATALOG_ONLY" });
    expect(next.canonicalProposal?.lines[0]).toMatchObject({ itemName: "NVR", quantity: 2, requestedPrice: 120 });
    expect(next.canonicalProposal?.smartSystem).toBeNull();
    expect(next.canonicalProposal?.proposal).toMatchObject({ currencyCode: "SAR", subject: "عرض سعر – توريد NVR", scopeType: "SUPPLY_ONLY" });
    expect(next.fields.customerId).toBe(first.fields.customerId);
    expect(catalog.mock.calls.every(([filter]) => filter.companyId === "tenant")).toBe(true);
  });

  it("quantity answers target the existing line instead of creating a new request", async () => {
    const { run, extractIntent } = setup();
    extractIntent.mockResolvedValue({ customerMention: "الوطنية", scopeType: "SUPPLY_ONLY", lines: [{ text: "NVR", quantity: null }] });
    const first = await run("NVR", undefined, "TEXT", { buildMode: "CATALOG_ONLY" });
    expect(first.activeQuestion?.field).toBe("quantity:0");
    const next = await run("٣", first, "VOICE", { buildMode: "CATALOG_ONLY" });
    expect(next.canonicalProposal?.lines[0].quantity).toBe(3);
    expect(next.activeQuestion?.field).toBe("projectName");
  });

  it.each(["TEXT", "VOICE", "CHIP"] as const)("writes a bare %s answer to projectName, then attentionName, without reinterpreting either", async (source) => {
    const { run, generate, catalog } = setup();
    const first = await run(prompt, undefined, "VOICE", { attachment: { name: "scope.pdf", type: "application/pdf", size: 12 } });
    expect(first.activeQuestion?.field).toBe("projectName");
    expect(first.activeQuestion?.ar).toBe("ما اسم المشروع؟");
    expect(first.canonicalProposal?.smartSystem?.status).toBe("COMPLETE");
    expect(first.canonicalProposal?.smartSystem?.requirements?.find((item) => item.componentKey === "SURVEILLANCE_STORAGE_CAPACITY")).toMatchObject({ quantity: 337, unit: "TB" });
    expect(first.canonicalProposal?.lines.find((item) => item.componentKey === "SURVEILLANCE_STORAGE_CAPACITY")).toMatchObject({ quantity: 1, requestedUnitText: "Package", catalogItemId: null, commercializationPending: true });
    const second = await run("مصنع الشويخ الجديد", first, source);
    expect(second.canonicalProposal?.proposal.projectName).toBe("مصنع الشويخ الجديد");
    expect(second.activeQuestion?.field).toBe("attentionName");
    expect(second.answers?.projectName).toBe("مصنع الشويخ الجديد");
    expect(second.turns.at(-1)).toMatchObject({ source, target: "projectName", text: "مصنع الشويخ الجديد" });
    expect(generate.mock.calls.at(-1)?.[0].prompt).toBe(prompt);
    const ready = await run("المهندس محمد خالد", second, "VOICE");
    expect(ready.canonicalProposal?.proposal).toMatchObject({ projectName: "مصنع الشويخ الجديد", attentionName: "المهندس محمد خالد" });
    expect(ready).toMatchObject({ id: first.id, status: "READY_FOR_REVIEW", phase: "DRAFT_READY_FOR_REVIEW", activeQuestion: null, missingRequired: [], requiresHumanReview: true, executed: false });
    expect(ready.attachment).toEqual(first.attachment);
    expect(ready.canonicalProposal?.lines).toEqual(first.canonicalProposal?.lines);
    expect(ready.canonicalProposal?.lines.some((line) => /required.*capacity|سعة.*مطلوبة|estimated cable/i.test(line.itemName))).toBe(false);
    expect(ready.canonicalProposal?.lines.find((line) => line.componentKey === "CCTV_CAMERAS")?.quantity).toBe(130);
    const again = await run(prompt, ready, "TEXT", { reanalyze: true });
    expect(again.activeQuestion).toBeNull();
    expect(again.canonicalProposal?.proposal.attentionName).toBe("المهندس محمد خالد");
    expect(again.turns).toHaveLength(4);
    expect(catalog).toHaveBeenCalled();
  });

  it("customer ambiguity chip targets customer, then project; selected ID survives reanalysis", async () => {
    const { run, findAll } = setup({ names: ["الوطنية للسكر", "الوطنية للغاز"] });
    const first = await run(prompt);
    expect(first.activeQuestion?.field).toBe("customerMention");
    expect(first.customerResolution.candidates).toHaveLength(2);
    const second = await run("الوطنية للغاز", first, "CHIP", { selection: { customer: { id: "c1", name: "الوطنية للغاز" } } });
    expect(second.fields.customerId).toBe("c1");
    expect(second.activeQuestion?.field).toBe("projectName");
    const third = await run("مصنع الشويخ الجديد", second, "VOICE");
    expect(third.fields.customerId).toBe("c1");
    expect(third.answers?.customerMention).toBe("الوطنية للغاز");
    expect(findAll.mock.calls.every(([filter]) => filter.companyId === "tenant")).toBe(true);
  });

  it("proposed unregistered customer continues to review, without creation or fake ID", async () => {
    const { run } = setup({ names: [] });
    const first = await run(prompt);
    expect(first).toMatchObject({ customerState: "CUSTOMER_PROPOSED_UNREGISTERED", proposedCustomerName: "الوطنية" });
    expect(first.activeQuestion?.field).toBe("projectName");
    const second = await run("مصنع الشويخ الجديد", first);
    const ready = await run("المهندس محمد خالد", second);
    expect(ready.status).toBe("READY_FOR_REVIEW");
    expect(ready.fields.customerId).toBeNull();
    expect(ready.executed).toBe(false);
  });

  it("asks validity only when absent, persists a date and advances through material terms", async () => {
    const { run } = setup({ terms: null });
    let draft = await run(prompt);
    draft = await run("مصنع الشويخ الجديد", draft);
    draft = await run("المهندس محمد خالد", draft);
    expect(draft.activeQuestion?.field).toBe("expiryDate");
    const invalid = await run("نعم", draft);
    expect(invalid.activeQuestion?.field).toBe("expiryDate");
    draft = await run("٣٠ يوم", invalid);
    expect(draft.answers?.expiryDate).toBe(resolveExpiry("30 days", companyToday("Asia/Kuwait")));
    expect(draft.activeQuestion?.field).toBe("paymentTerms");
    draft = await run("50% مقدم والباقي عند التسليم", draft);
    expect(draft.activeQuestion?.field).toBe("delivery");
    draft = await run("أسبوعين", draft);
    expect(draft.activeQuestion?.field).toBe("warranty");
    expect(draft.status).not.toBe("READY_FOR_REVIEW");
    draft = await run("سنة", draft);
    expect(draft.status).toBe("READY_FOR_REVIEW");
    expect(draft.canonicalProposal?.termsAndConditions).toContain("أسبوعين");
    expect(draft.canonicalProposal?.termsAndConditions).toContain("سنة");
    expect(draft.missingRequired).toEqual([]);
  });

  it("customer payment default precedes company; explicit user terms precede both", async () => {
    const { run } = setup({ paymentDays: 45 });
    const first = await run(prompt);
    expect(first.canonicalProposal?.commercialTerms?.paymentTerms).toContain("45");
    expect(first.canonicalProposal?.fieldProvenance?.paymentTerms).toBe("CUSTOMER_DEFAULT");
    expect(first.missingRequired.some((field) => field.key === "paymentTerms" || field.key === "expiryDate")).toBe(false);
    const edited = await run("نقداً", first, "TEXT", { answer: { field: "paymentTerms", value: "نقداً" } });
    expect(edited.canonicalProposal?.commercialTerms?.paymentTerms).toBe("نقداً");
    expect(edited.canonicalProposal?.termsAndConditions).not.toContain("45");
    expect(edited.canonicalProposal?.termsAndConditions).not.toContain("50%");
  });

  it("explicit N/A resolves nullable fields, but never required customer/payment/system inputs", async () => {
    const { run } = setup();
    let draft = await run(prompt);
    draft = await run("لا ينطبق", draft, "CHIP", { answer: { field: "projectName", value: "لا ينطبق", action: "NOT_APPLICABLE" } });
    expect(draft.activeQuestion?.field).toBe("attentionName");
    draft = await run("لا ينطبق", draft, "CHIP", { answer: { field: "attentionName", value: "لا ينطبق", action: "NOT_APPLICABLE" } });
    expect(draft.status).toBe("READY_FOR_REVIEW");
    expect(draft.canonicalProposal?.proposal.projectName).toBeNull();
    const again = await run(prompt, draft, "TEXT", { reanalyze: true });
    expect(again.status).toBe("READY_FOR_REVIEW");
    await expect(run("لا ينطبق", draft, "CHIP", { answer: { field: "paymentTerms", value: "لا ينطبق", action: "NOT_APPLICABLE" } })).rejects.toThrow("CONVERSATION_ANSWER_INVALID");
  });

  it("commercial phases remain exclusive and independent of transcript readiness", async () => {
    const { run } = setup();
    const draft = await run(prompt);
    expect(commercialPhase(null, false, false)).toBe("COMPOSING");
    expect(commercialPhase(null, true, false)).toBe("ANALYZING");
    expect(commercialPhase(draft, true, true)).toBe("RECALCULATING");
    expect(commercialPhase(draft, false, true)).toBe("COMPOSING");
    expect(commercialPhase(draft, false, false)).toBe("FIELD_ANSWER_PENDING");
    expect(draft.status).toBe("NEEDS_CLARIFICATION");
  });

  it("keeps invoice fields distinct from quotation/contract professional fields", async () => {
    const { run } = setup();
    const invoice = await run(prompt, undefined, "TEXT", { documentMode: "INVOICE" });
    expect(invoice.missingRequired.map((field) => field.key)).not.toContain("projectName");
    expect(invoice.missingRequired.map((field) => field.key)).not.toContain("expiryDate");
    const contract = await run(prompt, undefined, "TEXT", { documentMode: "CONTRACT" });
    expect(contract.activeQuestion?.field).toBe("projectName");
    expect(contract.missingRequired.map((field) => field.key)).not.toContain("expiryDate");
  });
});

describe("explicit validity clauses", () => {
  it("recognizes Arabic/English labelled company clauses and no invented validity", () => {
    expect(readCommercialClauses(defaultTerms, "2026-08-28").expiryDate).toBe("2026-09-27");
    expect(readCommercialClauses("Validity: 30 days\nPayment: cash", "2026-08-28")).toMatchObject({ expiryDate: "2026-09-27", paymentTerms: "Payment: cash" });
    expect(readCommercialClauses("General conditions apply", "2026-08-28").expiryDate).toBeNull();
    expect(resolveExpiry("2026-02-30", "2026-01-01")).toBeNull();
    expect(resolveExpiry("yes", "2026-08-28")).toBeNull();
  });
});
