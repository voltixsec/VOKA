import type {
  IQuotationRepository,
  QuotationLocalizationErrorCode,
} from "../../../application/quotation/repositories/IQuotationRepository";
import { analyzeQuotationLocalization } from "../../../application/quotation/services/QuotationLocalizationAnalyzer";
import { createQuotationLocalizationSourceSignature } from "../../../application/quotation/services/QuotationLocalizationSourceSignature";
import type { Quotation } from "../../../domain/quotation/entities/Quotation";
import { localizeQuotationDraft } from "./localizeQuotationDraft";

type UnknownRecord = Record<string, unknown>;

export type QuotationLocalizationJobResult =
  | "COMPLETED"
  | "NO_CLAIM"
  | "NOT_FOUND"
  | "STALE"
  | "FAILED"
  | "CLAIM_FAILED";

export type QuotationLocalizationJobParams = {
  companyId: string;
  quotationId: string;
};

const LEASE_DURATION_MS = 12 * 60 * 1000;

function buildLocalizationSnapshot(quotation: Quotation): UnknownRecord {
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

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function localizedText(value: unknown): string | null | undefined {
  return typeof value === "string" ? value : value === null ? null : undefined;
}

function buildCompletionPatch(localized: UnknownRecord) {
  const customer = asRecord(localized.customer);
  const header = {
    customerNameAr: localizedText(customer?.nameAr),
    customerNameEn: localizedText(customer?.nameEn),
    projectNameAr: localizedText(localized.projectNameAr),
    projectNameEn: localizedText(localized.projectNameEn),
    attentionNameAr: localizedText(localized.attentionNameAr),
    attentionNameEn: localizedText(localized.attentionNameEn),
    subjectAr: localizedText(localized.subjectAr),
    subjectEn: localizedText(localized.subjectEn),
    briefAr: localizedText(localized.briefAr),
    briefEn: localizedText(localized.briefEn),
    notesAr: localizedText(localized.notesAr),
    notesEn: localizedText(localized.notesEn),
    termsAndConditionsAr: localizedText(localized.termsAndConditionsAr),
    termsAndConditionsEn: localizedText(localized.termsAndConditionsEn),
  };

  const lines = Array.isArray(localized.lines)
    ? localized.lines.flatMap((value) => {
        const line = asRecord(value);
        if (!line || typeof line.id !== "string" || !line.id.trim()) return [];
        return [{
          id: line.id,
          itemNameAr: localizedText(line.itemNameAr),
          itemNameEn: localizedText(line.itemNameEn),
          descriptionAr: localizedText(line.descriptionAr),
          descriptionEn: localizedText(line.descriptionEn),
          unitNameAr: localizedText(line.unitNameAr),
          unitNameEn: localizedText(line.unitNameEn),
        }];
      })
    : [];

  return { header, lines };
}

function validateCompletionPatch(
  analysis: { sourceLocale: "ar" | "en"; bindings: Array<{ key: string; arKey: string; enKey: string }> },
  completion: ReturnType<typeof buildCompletionPatch>,
): void {
  for (const binding of analysis.bindings) {
    const key = binding.key;

    if (key === "customer_name") {
      const val = analysis.sourceLocale === "ar" ? completion.header.customerNameEn : completion.header.customerNameAr;
      if (typeof val !== "string" || !val.trim()) {
        throw new Error(`Quotation localization missing translation for "${key}".`);
      }
    } else if (key === "project_name") {
      const val = analysis.sourceLocale === "ar" ? completion.header.projectNameEn : completion.header.projectNameAr;
      if (typeof val !== "string" || !val.trim()) {
        throw new Error(`Quotation localization missing translation for "${key}".`);
      }
    } else if (key === "attention_name") {
      const val = analysis.sourceLocale === "ar" ? completion.header.attentionNameEn : completion.header.attentionNameAr;
      if (typeof val !== "string" || !val.trim()) {
        throw new Error(`Quotation localization missing translation for "${key}".`);
      }
    } else if (key === "subject") {
      const val = analysis.sourceLocale === "ar" ? completion.header.subjectEn : completion.header.subjectAr;
      if (typeof val !== "string" || !val.trim()) {
        throw new Error(`Quotation localization missing translation for "${key}".`);
      }
    } else if (key === "brief") {
      const val = analysis.sourceLocale === "ar" ? completion.header.briefEn : completion.header.briefAr;
      if (typeof val !== "string" || !val.trim()) {
        throw new Error(`Quotation localization missing translation for "${key}".`);
      }
    } else if (key === "notes") {
      const val = analysis.sourceLocale === "ar" ? completion.header.notesEn : completion.header.notesAr;
      if (typeof val !== "string" || !val.trim()) {
        throw new Error(`Quotation localization missing translation for "${key}".`);
      }
    } else if (key === "terms") {
      const val = analysis.sourceLocale === "ar" ? completion.header.termsAndConditionsEn : completion.header.termsAndConditionsAr;
      if (typeof val !== "string" || !val.trim()) {
        throw new Error(`Quotation localization missing translation for "${key}".`);
      }
    } else if (key.startsWith("line_")) {
      const match = /^line_(\d+)_(item_name|description|unit_name)$/.exec(key);
      if (match) {
        const lineIndex = parseInt(match[1], 10);
        const field = match[2];
        const line = completion.lines[lineIndex];
        if (!line) {
          throw new Error(`Quotation localization missing translation for "${key}".`);
        }
        let val: string | null | undefined;
        if (field === "item_name") {
          val = analysis.sourceLocale === "ar" ? line.itemNameEn : line.itemNameAr;
        } else if (field === "description") {
          val = analysis.sourceLocale === "ar" ? line.descriptionEn : line.descriptionAr;
        } else if (field === "unit_name") {
          val = analysis.sourceLocale === "ar" ? line.unitNameEn : line.unitNameAr;
        }
        if (typeof val !== "string" || !val.trim()) {
          throw new Error(`Quotation localization missing translation for "${key}".`);
        }
      }
    }
  }
}

function classifyLocalizationError(error: unknown): QuotationLocalizationErrorCode {
  const allowed = new Set<QuotationLocalizationErrorCode>([
    "TRANSLATION_TIMEOUT",
    "TRANSLATION_PROVIDER_ERROR",
    "TRANSLATION_INVALID_RESPONSE",
    "TRANSLATION_UNEXPECTED_ERROR",
  ]);
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && allowed.has(code as QuotationLocalizationErrorCode)) {
      return code as QuotationLocalizationErrorCode;
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      const normalized = message.toLowerCase();
      if (normalized.includes("timeout")) return "TRANSLATION_TIMEOUT";
      if (normalized.includes("provider") || normalized.includes("api")) {
        return "TRANSLATION_PROVIDER_ERROR";
      }
      if (normalized.includes("invalid response") || normalized.includes("missing translation") || normalized.includes("translation missing")) {
        return "TRANSLATION_INVALID_RESPONSE";
      }
    }
  }
  return "TRANSLATION_UNEXPECTED_ERROR";
}

export class QuotationLocalizationJobRunner {
  constructor(
    private readonly repository: IQuotationRepository,
    private readonly localize: (input: UnknownRecord) => Promise<UnknownRecord> = localizeQuotationDraft,
  ) {}

  async run(params: QuotationLocalizationJobParams): Promise<QuotationLocalizationJobResult> {
    let claim: Awaited<ReturnType<IQuotationRepository["claimLocalization"]>>;
    try {
      claim = await this.repository.claimLocalization({
        ...params,
        leaseDurationMs: LEASE_DURATION_MS,
      });
    } catch {
      return "CLAIM_FAILED";
    }

    if (!claim) return "NO_CLAIM";

    try {
      const quotation = await this.repository.findById(
        params.companyId,
        params.quotationId,
      );
      if (!quotation) return "NOT_FOUND";

      const snapshot = buildLocalizationSnapshot(quotation);
      const analysis = analyzeQuotationLocalization(
        snapshot,
        quotation.localizationSourceLocale ?? undefined,
      );
      if (createQuotationLocalizationSourceSignature(analysis) !== claim.sourceSignature) {
        return "STALE";
      }

      const localized = await this.localize({
        ...snapshot,
        localizationSourceLocale: analysis.sourceLocale,
      });
      const completion = buildCompletionPatch(localized);
      validateCompletionPatch(analysis, completion);
      const completed = await this.repository.completeLocalization({
        ...params,
        expectedSourceSignature: claim.sourceSignature,
        expectedClaimToken: claim.claimToken,
        header: completion.header,
        lines: completion.lines,
        completedAt: new Date(),
      });
      return completed ? "COMPLETED" : "STALE";
    } catch (error) {
      const failed = await this.repository.failLocalization({
        ...params,
        expectedSourceSignature: claim.sourceSignature,
        expectedClaimToken: claim.claimToken,
        errorCode: classifyLocalizationError(error),
      });
      return failed ? "FAILED" : "STALE";
    }
  }
}
