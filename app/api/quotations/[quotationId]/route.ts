import { after } from "next/server";

import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";

import {
  GetQuotationUseCase,
  UpdateQuotationUseCase,
  type UpdateQuotationDto,
} from "@/src/application/quotation";
import { analyzeQuotationLocalization } from "@/src/application/quotation/services/QuotationLocalizationAnalyzer";
import { createQuotationLocalizationSourceSignature } from "@/src/application/quotation/services/QuotationLocalizationSourceSignature";
import {
  isQuotationScopeType,
} from "@/src/domain/quotation";
import { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";
import { PrismaQuotationReferenceValidator } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator";

import {
  localizeQuotationDraft,
} from "@/src/infrastructure/translation/quotation/localizeQuotationDraft";

import { serializeQuotation } from "../serialize-quotation";

export const runtime = "nodejs";

const quotationRepository =
  new PrismaQuotationRepository();

const getQuotation =
  new GetQuotationUseCase(quotationRepository);
const quotationReferenceValidator =
  new PrismaQuotationReferenceValidator();

const updateQuotation =
  new UpdateQuotationUseCase(
    quotationRepository,
    quotationReferenceValidator,
  );


function getQuotationId(request: Request): string {
  const segments = new URL(request.url).pathname
    .split("/")
    .filter(Boolean);
  const quotationId = segments.at(-1);

  if (
    !quotationId ||
    quotationId === "quotations"
  ) {
    throw ApiError.badRequest(
      "QUOTATION_ID_REQUIRED",
      "quotationId is required.",
    );
  }

  return decodeURIComponent(quotationId);
}

function getRequestedLocale(
  request: Request,
): "ar" | "en" | undefined {
  const locale =
    new URL(request.url)
      .searchParams
      .get("locale");

  return locale === "ar" ||
    locale === "en"
    ? locale
    : undefined;
}

export const GET = withCompanyAuth(
  [
    "OWNER",
    "ADMIN",
    "SALES",
    "VIEWER",
  ],
  async (request, _auth, company) => {
    const result = await getQuotation.execute({
      companyId: company.companyId,
      quotationId: getQuotationId(request),
    });

    if (!result.success) {
      throw ApiError.notFound(
        result.error.code,
        result.error.message,
      );
    }

    return apiSuccess(
      serializeQuotation(
        result.data,
        getRequestedLocale(request),
      ),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  },
);
type UpdateQuotationBody = {
  lines?: unknown;
  discount?: unknown;
  notes?: unknown;
  termsAndConditions?: unknown;
  termsAndConditionsAr?: unknown;
  termsAndConditionsEn?: unknown;
  subjectAr?: unknown;
  subjectEn?: unknown;
  briefAr?: unknown;
  briefEn?: unknown;
  projectName?: unknown;
  attentionName?: unknown;
  scopeType?: unknown;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function localizedText(value: unknown): string | null | undefined {
  return typeof value === "string" ? value : value === null ? null : undefined;
}

function buildLocalizationCompletionPatch(localized: UnknownRecord) {
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
        if (!line || typeof line.id !== "string" || !line.id.trim()) {
          return [];
        }

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

function parseOptionalString(
  value: unknown,
  fieldName: string,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw ApiError.badRequest(
      "INVALID_STRING",
      `${fieldName} must be a string or null.`,
      {
        field: fieldName,
      },
    );
  }

  return value.trim() || null;
}

function parseScopeType(
  value: unknown,
): UpdateQuotationDto["scopeType"] {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (!isQuotationScopeType(value)) {
    throw ApiError.badRequest(
      "INVALID_QUOTATION_SCOPE_TYPE",
      "scopeType is invalid.",
      {
        field: "scopeType",
      },
    );
  }

  return value;
}


type LocalizationErrorCode =
  | "TRANSLATION_TIMEOUT"
  | "TRANSLATION_PROVIDER_ERROR"
  | "TRANSLATION_INVALID_RESPONSE"
  | "TRANSLATION_UNEXPECTED_ERROR";

const localizationErrorCodes: Set<string> = new Set([
  "TRANSLATION_TIMEOUT",
  "TRANSLATION_PROVIDER_ERROR",
  "TRANSLATION_INVALID_RESPONSE",
  "TRANSLATION_UNEXPECTED_ERROR",
]);

function classifyLocalizationError(
  error: unknown,
): LocalizationErrorCode {
  if (
    typeof error === "object" &&
    error !== null
  ) {
    const candidateCode =
      (error as { code?: unknown }).code;

    if (
      typeof candidateCode === "string" &&
      localizationErrorCodes.has(candidateCode)
    ) {
      return candidateCode as LocalizationErrorCode;
    }

    const message =
      (error as { message?: unknown }).message;

    if (typeof message === "string") {
      const normalized =
        message.toLowerCase();

      if (normalized.includes("timeout")) {
        return "TRANSLATION_TIMEOUT";
      }

      if (
        normalized.includes("provider") ||
        normalized.includes("api")
      ) {
        return "TRANSLATION_PROVIDER_ERROR";
      }

      if (
        normalized.includes("invalid response") ||
        normalized.includes("missing translation") ||
        normalized.includes("translation missing")
      ) {
        return "TRANSLATION_INVALID_RESPONSE";
      }
    }
  }

  return "TRANSLATION_UNEXPECTED_ERROR";
}

export const PATCH = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, _auth, company) => {
    const quotationId = getQuotationId(request);
    const rawBody =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const body =
      rawBody as UpdateQuotationBody;

    if (
      !Array.isArray(body.lines) ||
      body.lines.length === 0
    ) {
      throw ApiError.badRequest(
        "QUOTATION_LINES_REQUIRED",
        "At least one quotation line is required.",
        {
          field: "lines",
        },
      );
    }

    const localizedDto = {
      ...(body as unknown as Record<
        string,
        unknown
      >),
      companyId: company.companyId,
      quotationId,
    } as unknown as UpdateQuotationDto;

    const result =
      await updateQuotation.execute(
        localizedDto,
      );

    if (!result.success) {
      if (
        result.error.code ===
        "QUOTATION_NOT_FOUND"
      ) {
        throw ApiError.notFound(
          result.error.code,
          result.error.message,
        );
      }

      throw ApiError.badRequest(
        result.error.code,
        result.error.message,
      );
    }

    const updated = await getQuotation.execute({
      companyId: company.companyId,
      quotationId,
    });

    if (!updated.success) {
      throw ApiError.notFound(
        updated.error.code,
        updated.error.message,
      );
    }

    const localizationSourceLocale =
      rawBody.localizationSourceLocale === "ar" ||
      rawBody.localizationSourceLocale === "en"
        ? rawBody.localizationSourceLocale
        : undefined;

    console.log(
      "[VOKA:LOCALIZATION][SCHEDULED]",
      {
        quotationId,

        sourceLocale:
          localizationSourceLocale ??
          "auto",
      },
    );

    after(async () => {
      const startedAt =
        performance.now();

      let claim: Awaited<ReturnType<
        typeof quotationRepository.claimLocalization
      >> = null;

      try {
        claim = await quotationRepository.claimLocalization({
          companyId: company.companyId,
          quotationId,
          leaseDurationMs: 12 * 60 * 1000,
        });

        if (!claim) {
          console.log("[VOKA:LOCALIZATION][SKIPPED_NO_CLAIM]", {
            quotationId,
          });
          return;
        }

        const current =
          await getQuotation.execute({
            companyId: company.companyId,
            quotationId,
          });

        if (!current.success) {
          console.warn(
            "[VOKA:LOCALIZATION][SKIPPED_NOT_FOUND]",
            { quotationId },
          );
          return;
        }

        const currentSnapshot = serializeQuotation(
          current.data,
        ) as unknown as UnknownRecord;
        const currentAnalysis = analyzeQuotationLocalization(
          currentSnapshot,
          current.data.localizationSourceLocale ?? undefined,
        );
        const currentSignature =
          createQuotationLocalizationSourceSignature(currentAnalysis);

        if (currentSignature !== claim.sourceSignature) {
          console.log(
            "[VOKA:LOCALIZATION][SKIPPED_STALE]",
            { quotationId },
          );
          return;
        }

        const localized = await localizeQuotationDraft({
          ...currentSnapshot,
          localizationSourceLocale: currentAnalysis.sourceLocale,
        });
        const completion = buildLocalizationCompletionPatch(localized);
        const completed = await quotationRepository.completeLocalization({
          companyId: company.companyId,
          quotationId,
          expectedSourceSignature: claim.sourceSignature,
          expectedClaimToken: claim.claimToken,
          header: completion.header,
          lines: completion.lines,
          completedAt: new Date(),
        });

        if (!completed) {
          console.log("[VOKA:LOCALIZATION][SKIPPED_STALE]", {
            quotationId,
          });
          return;
        }

        console.log(
          "[VOKA:LOCALIZATION][COMPLETED]",
          {
            quotationId,

            elapsedMs:
              Math.round(
                performance.now() -
                startedAt,
              ),
          },
        );
      }
      catch (error) {
        if (!claim) {
          console.error("[VOKA:LOCALIZATION][FAILED_CLAIM]", {
            quotationId,
          });
          return;
        }

        const failed = await quotationRepository.failLocalization({
          companyId: company.companyId,
          quotationId,
          expectedSourceSignature: claim.sourceSignature,
          expectedClaimToken: claim.claimToken,
          errorCode: classifyLocalizationError(error),
        });

        if (!failed) {
          console.log("[VOKA:LOCALIZATION][SKIPPED_STALE]", {
            quotationId,
          });
        }
      }
    });



    return apiSuccess(
      serializeQuotation(updated.data),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  },
);
