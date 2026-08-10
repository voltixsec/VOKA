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

function localizationSignature(
  input: Record<string, unknown>,
): string {
  const lines =
    Array.isArray(input.lines)
      ? input.lines.map((rawLine) => {
          const line =
            rawLine &&
            typeof rawLine === "object" &&
            !Array.isArray(rawLine)
              ? rawLine as Record<string, unknown>
              : {};

          return {
            id:
              line.id ?? null,

            position:
              line.position ?? null,

            itemName:
              line.itemName ?? null,

            itemNameAr:
              line.itemNameAr ?? null,

            itemNameEn:
              line.itemNameEn ?? null,

            description:
              line.description ?? null,

            descriptionAr:
              line.descriptionAr ?? null,

            descriptionEn:
              line.descriptionEn ?? null,

            unitName:
              line.unitName ?? null,

            unitNameAr:
              line.unitNameAr ?? null,

            unitNameEn:
              line.unitNameEn ?? null,
          };
        })
      : [];

  return JSON.stringify({
    projectName:
      input.projectName ?? null,

    projectNameAr:
      input.projectNameAr ?? null,

    projectNameEn:
      input.projectNameEn ?? null,

    attentionName:
      input.attentionName ?? null,

    attentionNameAr:
      input.attentionNameAr ?? null,

    attentionNameEn:
      input.attentionNameEn ?? null,

    subjectAr:
      input.subjectAr ?? null,

    subjectEn:
      input.subjectEn ?? null,

    briefAr:
      input.briefAr ?? null,

    briefEn:
      input.briefEn ?? null,

    notes:
      input.notes ?? null,

    notesAr:
      input.notesAr ?? null,

    notesEn:
      input.notesEn ?? null,

    termsAndConditions:
      input.termsAndConditions ?? null,

    termsAndConditionsAr:
      input.termsAndConditionsAr ?? null,

    termsAndConditionsEn:
      input.termsAndConditionsEn ?? null,

    lines,
  });
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

    const savedSnapshot =
      serializeQuotation(
        updated.data,
      ) as unknown as Record<
        string,
        unknown
      >;

    const savedSignature =
      localizationSignature(
        savedSnapshot,
      );

    const localizationSourceLocale =
      rawBody.localizationSourceLocale === "ar" ||
      rawBody.localizationSourceLocale === "en"
        ? rawBody.localizationSourceLocale
        : undefined;

    const localizationInput = {
      ...savedSnapshot,

      ...(localizationSourceLocale
        ? {
            localizationSourceLocale,
          }
        : {}),
    };

    const wasPending =
      updated.data.localizationStatus ===
      "PENDING";

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

      try {
        const localizedBody =
          (await localizeQuotationDraft(
            localizationInput,
          )) as UpdateQuotationBody;

        /*
         * Qwen may take a long time.
         * Re-read after inference so stale AI output can never
         * overwrite a newer user Save.
         */
        const latest =
          await getQuotation.execute({
            companyId:
              company.companyId,

            quotationId,
          });

        if (!latest.success) {
          console.warn(
            "[VOKA:LOCALIZATION][SKIPPED_NOT_FOUND]",
            {
              quotationId,
            },
          );

          return;
        }

        const latestSnapshot =
          serializeQuotation(
            latest.data,
          ) as unknown as Record<
            string,
            unknown
          >;

        if (
          localizationSignature(
            latestSnapshot,
          ) !== savedSignature
        ) {
          console.log(
            "[VOKA:LOCALIZATION][SKIPPED_STALE]",
            {
              quotationId,
            },
          );

          return;
        }

        const localizationDto = {
          ...(localizedBody as unknown as Record<
            string,
            unknown
          >),

          companyId:
            company.companyId,

          quotationId,
        } as unknown as UpdateQuotationDto;

        const localizationResult =
          await updateQuotation.execute(
            localizationDto,
          );

        if (!localizationResult.success) {
          console.error(
            "[VOKA:LOCALIZATION][FAILED_UPDATE]",
            {
              quotationId,

              error:
                localizationResult.error,
            },
          );

          return;
        }

        if (wasPending) {
          const persisted =
            await getQuotation.execute({
              companyId:
                company.companyId,

              quotationId,
            });

          if (!persisted.success) {
            console.warn(
              "[VOKA:LOCALIZATION][COMPLETED_NOT_FOUND]",
              {
                quotationId,
              },
            );
          } else {
            const completedQuotation =
              persisted.data;
            completedQuotation.markLocalizationCompleted(
              new Date(),
            );

            try {
              await quotationRepository.update(
                company.companyId,
                completedQuotation,
              );
            } catch (updateError) {
              console.error(
                "[VOKA:LOCALIZATION][FAILED_PERSIST_COMPLETION]",
                {
                  quotationId,
                  error: updateError,
                },
              );
            }
          }
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
        /*
         * AI failure is background-only.
         * It must never turn a successful Save into HTTP 500.
         */
        const latest =
          await getQuotation.execute({
            companyId: company.companyId,
            quotationId,
          });

        if (!latest.success) {
          console.warn(
            "[VOKA:LOCALIZATION][SKIPPED_NOT_FOUND]",
            {
              quotationId,
            },
          );

          return;
        }

        const latestSnapshot =
          serializeQuotation(
            latest.data,
          ) as unknown as Record<
            string,
            unknown
          >;

        if (
          localizationSignature(
            latestSnapshot,
          ) !== savedSignature
        ) {
          console.log(
            "[VOKA:LOCALIZATION][SKIPPED_STALE]",
            {
              quotationId,
            },
          );

          return;
        }

        if (!wasPending) {
          console.log(
            "[VOKA:LOCALIZATION][SKIPPED_NO_PENDING]",
            {
              quotationId,
            },
          );

          return;
        }

        const quotation = latest.data;
        quotation.markLocalizationFailed(
          classifyLocalizationError(
            error,
          ),
        );

        try {
          await quotationRepository.update(
            company.companyId,
            quotation,
          );
        } catch (updateError) {
          console.error(
            "[VOKA:LOCALIZATION][FAILED_PERSIST]",
            {
              quotationId,
              error: updateError,
            },
          );
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
