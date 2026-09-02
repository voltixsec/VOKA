import { describe, expect, it } from "vitest";
import { adaptCommercialHandoffToQuotationDraft, type CommercialSolutionHandoff, type ConfirmedFact } from "../index";
import { gypsumScenario, now } from "./fixtures/gypsum";
import { Quotation, LocalizationStatus } from "@/src/domain/quotation";
import { serializeQuotation } from "@/app/api/quotations/serialize-quotation";
import { analyzeQuotationLocalization } from "@/src/application/quotation/services/QuotationLocalizationAnalyzer";
import { invalidateQuotationTargetFields } from "@/src/application/quotation/services/invalidateQuotationTargetFields";

const defaults = { currencyCode: "KWD", termsAr: "1. شروط الشركة\n\n  2. بند محفوظ", termsEn: "1. Company terms\n\n  2. Verbatim clause", payment: null, delivery: null, warranty: null, validity: null };
const confirmed = (key: string, value: string): ConfirmedFact => ({ key, value, provenance: "USER_EXPLICIT", evidence: value, updatedAt: now });
const adapt = (handoff: CommercialSolutionHandoff, locale: "ar" | "en" = "en") => adaptCommercialHandoffToQuotationDraft({ companyId: "tenant-1", handoff, locale, customer: { status: "PROPOSED", name: "National Telecom" }, defaults })!;

async function fixture() {
  const { final } = await gypsumScenario();
  return { runtimeId: final.runtimeId, confirmedFacts: final.confirmedFacts, commercialLines: [], toolEvidence: [], createdAt: now, workspace: final.workspace } satisfies CommercialSolutionHandoff;
}

describe("quotation Draft-only correction", () => {
  it("does not resurrect removed governed lines from a stale flattened handoff", async () => {
    const handoff: CommercialSolutionHandoff = await fixture();
    handoff.workspace!.commercialSolution.bom = [];
    handoff.commercialLines = [{ itemName: "Deleted generic board", catalogItemId: null, quantity: 1, unitPrice: null, type: "PRODUCT", authority: "DETERMINISTIC_DERIVATION" }];
    expect(adapt(handoff).lines).toEqual([]);
  });

  it("retains canonical Draft units even when localization is marked completed", async () => {
    const dto = adapt(await fixture());
    const quotation = new Quotation({ ...dto, number: "QT-202609-0042", localizationStatus: LocalizationStatus.COMPLETED });
    for (const locale of ["ar", "en"] as const) {
      expect(serializeQuotation(quotation, locale).lines.map((line) => line.unitName)).toEqual(dto.lines.map((line) => line.unitName));
    }
    expect(quotation.lines.map((line) => line.unitName)).toEqual(dto.lines.map((line) => line.unitName));
  });

  it("never requests AI legal prose for a scope template missing a configured language", () => {
    const snapshot = { scopeType: "SUPPLY_AND_INSTALLATION", termsAndConditionsEn: defaults.termsEn, termsAndConditionsAr: null, lines: [{ itemNameEn: "Joint compound", itemNameAr: null }] };
    const analysis = analyzeQuotationLocalization(snapshot, "en");
    expect(analysis.items.map((item) => item.key)).not.toContain("terms");
    expect(analysis.items).toContainEqual({ key: "line_0_item_name", text: "Joint compound" });
    expect(snapshot.termsAndConditionsAr).toBeNull();
  });

  it("preserves the other configured template language when only one company language changed", async () => {
    const quotation = new Quotation({ ...adapt(await fixture()), number: "QT-202609-0042" });
    const update = invalidateQuotationTargetFields(quotation, { companyId: "tenant-1", quotationId: "q1", lines: [...quotation.lines], scopeType: "SUPPLY_AND_INSTALLATION", termsAndConditionsAr: "شروط الشركة المحدثة", termsAndConditionsEn: defaults.termsEn });
    expect(update).toMatchObject({ termsAndConditionsAr: "شروط الشركة المحدثة", termsAndConditionsEn: defaults.termsEn });
  });

  it.each(["ar", "en"] as const)("uses current governed selected identity, not a stale flattened generic name (%s)", async (locale) => {
    const handoff: CommercialSolutionHandoff = await fixture();
    handoff.confirmedFacts["project.name"] = confirmed("project.name", "Hilton Salmiya");
    handoff.confirmedFacts["attention.name"] = confirmed("attention.name", "Eng. Ahmed");
    const prefix = "product.selection.GYPSUM_BOARDS.";
    for (const [key, value] of Object.entries({ name: "USG Knauf Sheetrock Standard 12.5mm", nameEn: "USG Knauf Sheetrock Standard 12.5mm", nameAr: "لوح جبس USG Knauf Sheetrock Standard 12.5mm", brand: "USG Knauf", model: "Sheetrock Standard 12.5mm" })) handoff.confirmedFacts[prefix + key] = confirmed(prefix + key, value);
    handoff.confirmedFacts["product.selection.JOINT_COMPOUND.nameAr"] = confirmed("product.selection.JOINT_COMPOUND.nameAr", "معجون فواصل Sheetrock All Purpose");
    handoff.commercialLines = [{ itemName: "Regular Gypsum Boards, Regular Boards", itemNameAr: "Regular Gypsum Boards, Regular Boards", itemNameEn: "Regular Gypsum Boards, Regular Boards", catalogItemId: null, type: "PRODUCT", quantity: 999, unitName: "Sheet", unitPrice: null, authority: "DETERMINISTIC_DERIVATION", componentKeys: ["GYPSUM_BOARDS"] }];
    const before = structuredClone(handoff);
    const dto = adapt(handoff, locale);
    // The creation use case marks missing header translations pending.
    const quotation = new Quotation({ ...dto, number: "QT-202609-0042", localizationStatus: LocalizationStatus.PENDING });
    const json = serializeQuotation(quotation, locale);
    const board = json.lines.find((line) => line.engineeringComponentKeys.includes("GYPSUM_BOARDS"))!;
    const compound = json.lines.find((line) => line.engineeringComponentKeys.includes("JOINT_COMPOUND"))!;
    const originalBoard = handoff.workspace!.commercialSolution.bom.find((line) => line.id === "GYPSUM_BOARDS")!;
    expect(board).toMatchObject({ itemName: locale === "ar" ? "لوح جبس USG Knauf Sheetrock Standard 12.5mm" : "USG Knauf Sheetrock Standard 12.5mm", brandName: "USG Knauf", modelNumber: "Sheetrock Standard 12.5mm", quantity: originalBoard.quantity, unitName: originalBoard.unitName, unitPrice: null, pricingStatus: "PENDING" });
    expect(compound.itemName).toBe(locale === "ar" ? "معجون فواصل Sheetrock All Purpose" : "Sheetrock All Purpose Joint Compound");
    expect(json.lines).toHaveLength(handoff.workspace!.commercialSolution.bom.length);
    expect(JSON.stringify(json.lines)).not.toContain("Regular Gypsum Boards");
    expect(json).toMatchObject({ quotationNumber: "QT-202609-0042", customer: { name: "National Telecom" }, projectName: "Hilton Salmiya", attentionName: "Eng. Ahmed", scopeType: "SUPPLY_AND_INSTALLATION" });
    expect(handoff).toEqual(before);
  });

  it("copies both configured legal templates verbatim without stale conversation or prior system terms", async () => {
    const handoff = await fixture();
    handoff.confirmedFacts["commercial.payment"] = confirmed("commercial.payment", "Legacy payment");
    handoff.workspace!.terms.companyTermsEn = "Stale system legal text";
    const dto = adapt(handoff);
    expect(dto.termsAndConditionsAr).toBe(defaults.termsAr);
    expect(dto.termsAndConditionsEn).toBe(defaults.termsEn);
    expect(dto.termsAndConditions).toBe(defaults.termsEn);
    expect(new Quotation({ ...dto, number: "QT-202609-0042" }).termsAndConditionsEn).toBe(defaults.termsEn);
  });

  it("keeps Notes empty for product exploration and generic conversation notes", async () => {
    const handoff: CommercialSolutionHandoff = await fixture();
    handoff.confirmedFacts["commercial.notes"] = confirmed("commercial.notes", "Compare NVR and storage prices; possibly use a different model");
    handoff.toolEvidence = [{ kind: "RESEARCH", status: "COMPLETED", summary: "Product model comparisons and pricing", evidence: [], createdAt: now }];
    expect(adapt(handoff).notesEn).toBeNull();
    expect(adapt(handoff, "ar").notesAr).toBeNull();
  });

  it("copies only governed project conditions into Notes", async () => {
    const handoff = await fixture();
    handoff.workspace!.siteAndResponsibilities = { siteRequirements: ["Clear installation access"], supplierResponsibilities: ["Installation and testing"], customerResponsibilities: ["Provide power and network"], exclusions: ["Civil works"], notes: ["Night access by appointment"] };
    handoff.confirmedFacts["commercial.notes"] = confirmed("commercial.notes", "Product model comparison");
    const notes = adapt(handoff).notesEn!;
    for (const value of ["Clear installation access", "Installation and testing", "Provide power and network", "Civil works", "Night access by appointment"]) expect(notes).toContain(value);
    expect(notes).not.toContain("Product model comparison");
  });
});
