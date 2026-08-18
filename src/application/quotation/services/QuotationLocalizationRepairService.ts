import { analyzeQuotationLocalization } from "./QuotationLocalizationAnalyzer";
import { createQuotationLocalizationSourceSignature } from "./QuotationLocalizationSourceSignature";
import type { Quotation } from "../../../domain/quotation/entities/Quotation";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import type { IQuotationLocalizationRunnerPort } from "../ports/IQuotationLocalizationRunnerPort";

type UnknownRecord = Record<string, unknown>;

function buildSnapshot(quotation: Quotation): UnknownRecord {
  return {
    customer: quotation.customer.toJSON(),
    projectName: quotation.projectName,
    projectNameAr: quotation.projectNameAr,
    projectNameEn: quotation.projectNameEn,
    attentionName: quotation.attentionName,
    attentionNameAr: quotation.attentionNameAr,
    attentionNameEn: quotation.attentionNameEn,
    subjectAr: quotation.subjectAr,
    subjectEn: quotation.subjectEn,
    briefAr: quotation.briefAr,
    briefEn: quotation.briefEn,
    notes: quotation.notes,
    notesAr: quotation.notesAr,
    notesEn: quotation.notesEn,
    termsAndConditions: quotation.termsAndConditions,
    termsAndConditionsAr: quotation.termsAndConditionsAr,
    termsAndConditionsEn: quotation.termsAndConditionsEn,
    lines: quotation.lines.map((line) => ({
      id: line.id,
      itemName: line.itemName,
      itemNameAr: line.itemNameAr,
      itemNameEn: line.itemNameEn,
      description: line.description,
      descriptionAr: line.descriptionAr,
      descriptionEn: line.descriptionEn,
      unitName: line.unitName,
      unitNameAr: line.unitNameAr,
      unitNameEn: line.unitNameEn,
    })),
  };
}

export type RepairCheckResult = {
  isBrokenCompleted: boolean;
  missingItemsCount: number;
  sourceLocale: "ar" | "en";
};

export function checkQuotationLocalizationIncompleteness(
  quotation: Quotation,
): RepairCheckResult {
  const snapshot = buildSnapshot(quotation);
  const analysis = analyzeQuotationLocalization(
    snapshot,
    quotation.localizationSourceLocale ?? undefined,
  );

  const isBrokenCompleted =
    quotation.localizationStatus === "COMPLETED" && analysis.items.length > 0;

  return {
    isBrokenCompleted,
    missingItemsCount: analysis.items.length,
    sourceLocale: analysis.sourceLocale,
  };
}

export type RepairAttemptResult =
  | { repaired: false; reason: "NOT_DRAFT" | "NOT_BROKEN" | "APPROVED_IMMUTABLE" }
  | { repaired: true; jobResult: string };

export class QuotationLocalizationRepairService {
  constructor(
    private readonly repository: IQuotationRepository,
    private readonly runnerPort: IQuotationLocalizationRunnerPort,
  ) {}

  async repairDraftQuotation(
    quotation: Quotation,
  ): Promise<RepairAttemptResult> {
    if (quotation.status === "APPROVED") {
      return { repaired: false, reason: "APPROVED_IMMUTABLE" };
    }

    if (quotation.status !== "DRAFT") {
      return { repaired: false, reason: "NOT_DRAFT" };
    }

    const check = checkQuotationLocalizationIncompleteness(quotation);
    if (!check.isBrokenCompleted) {
      return { repaired: false, reason: "NOT_BROKEN" };
    }

    if (!quotation.companyId || !quotation.id) {
      throw new Error("Cannot repair quotation without companyId and id.");
    }

    // Prepare quotation for claimability through standard lifecycle
    const snapshot = buildSnapshot(quotation);
    const analysis = analyzeQuotationLocalization(
      snapshot,
      quotation.localizationSourceLocale ?? undefined,
    );

    const now = new Date();
    quotation.startLocalizationGeneration(
      analysis.sourceLocale,
      createQuotationLocalizationSourceSignature(analysis),
      now,
    );

    // Save transition to repository (status becomes PENDING with sourceSignature set)
    await this.repository.update(quotation.companyId, quotation);

    // Execute standard claim + job runner path
    const jobResult = await this.runnerPort.run({
      companyId: quotation.companyId,
      quotationId: quotation.id,
    });

    return {
      repaired: true,
      jobResult,
    };
  }
}
