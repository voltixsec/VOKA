import {
  BilingualTranslationService,
  QuotationTermsTranslationService,
} from "@/src/application/translation";

import {
  createTranslationPort,
} from "@/src/infrastructure/translation/createTranslationPort";
import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";

import {
  prisma,
} from "@/lib/prisma";

const SCOPE_TYPES = [
  "SUPPLY_ONLY",
  "SUPPLY_AND_INSTALLATION",
  "INSTALLATION_ONLY",
  "SERVICE",
  "MAINTENANCE",
  "CONSULTATION",
  "CUSTOM",
] as const;

type ScopeType =
  (typeof SCOPE_TYPES)[number];

type UpdateTermsBody = {
  scopeType?: unknown;
  termsAr?: unknown;
  termsEn?: unknown;
};

function parseScopeType(
  value: unknown,
): ScopeType {
  if (
    typeof value !== "string" ||
    !SCOPE_TYPES.includes(
      value as ScopeType,
    )
  ) {
    throw ApiError.badRequest(
      "INVALID_SCOPE_TYPE",
      "scopeType is invalid.",
    );
  }

  return value as ScopeType;
}

function parseOptionalString(
  value: unknown,
  field: string,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw ApiError.badRequest(
      "INVALID_FIELD",
      field + " must be a string or null.",
      {
        field,
      },
    );
  }

  return value.trim() || null;
}

export const GET =
  withCompanyAuth(
    [
      "OWNER",
      "ADMIN",
      "SALES",
      "VIEWER",
    ],
    async (
      _request,
      _auth,
      company,
    ) => {
      const templates =
        await prisma
          .companyQuotationTermsTemplate
          .findMany({
            where: {
              companyId:
                company.companyId,
            },

            orderBy: {
              scopeType:
                "asc",
            },
          });

      return apiSuccess(
        {
          templates:
            templates.map(
              (template) => ({
                id:
                  template.id,

                scopeType:
                  template.scopeType,

                termsAr:
                  template.termsAr,

                termsEn:
                  template.termsEn,

                updatedAt:
                  template.updatedAt,
              }),
            ),
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store",
          },
        },
      );
    },
  );

export const PUT =
  withCompanyAuth(
    [
      "OWNER",
      "ADMIN",
    ],
    async (
      request,
      _auth,
      company,
    ) => {
      const body =
        (await request.json()) as
          UpdateTermsBody;

      const scopeType =
        parseScopeType(
          body.scopeType,
        );

      const termsAr =
        parseOptionalString(
          body.termsAr,
          "termsAr",
        );

      const termsEn =
        parseOptionalString(
          body.termsEn,
          "termsEn",
        );

      if (
        termsAr === undefined &&
        termsEn === undefined
      ) {
        throw ApiError.badRequest(
          "TERMS_REQUIRED",
          "At least one terms field must be provided.",
        );
      }

      const sourceLocale =
        termsAr !== undefined &&
        termsEn === undefined
          ? "ar"
          : termsEn !== undefined &&
              termsAr === undefined
            ? "en"
            : null;

      let template =
        await prisma
          .companyQuotationTermsTemplate
          .upsert({
            where: {
              companyId_scopeType: {
                companyId:
                  company.companyId,

                scopeType,
              },
            },

            create: {
              companyId:
                company.companyId,

              scopeType,

              termsAr:
                termsAr ?? null,

              termsEn:
                termsEn ?? null,
            },

            update: {
              ...(termsAr !== undefined
                ? {
                    termsAr,
                  }
                : sourceLocale === "en"
                  ? {
                      termsAr: null,
                    }
                  : {}),

              ...(termsEn !== undefined
                ? {
                    termsEn,
                  }
                : sourceLocale === "ar"
                  ? {
                      termsEn: null,
                    }
                  : {}),
            },
          });

      if (sourceLocale) {
        const sourceTerms =
          sourceLocale === "ar"
            ? termsAr ?? null
            : termsEn ?? null;

        const translationPort =
          createTranslationPort();

        if (
          sourceTerms &&
          translationPort
        ) {
          try {
            const bilingual =
              new BilingualTranslationService(
                translationPort,
              );

            const termsTranslator =
              new QuotationTermsTranslationService(
                bilingual,
              );

            const translated =
              await termsTranslator.translate({
                sourceLocale,
                terms: sourceTerms,
              });

            template =
              await prisma
                .companyQuotationTermsTemplate
                .update({
                  where: {
                    id: template.id,
                  },

                  data:
                    sourceLocale === "ar"
                      ? {
                          termsEn:
                            translated.termsEn,
                        }
                      : {
                          termsAr:
                            translated.termsAr,
                        },
                });
          } catch {
            // Source terms are already saved.
            // Translation failure must not cause data loss.
          }
        }
      }
      return apiSuccess({
        template: {
          id:
            template.id,

          scopeType:
            template.scopeType,

          termsAr:
            template.termsAr,

          termsEn:
            template.termsEn,

          updatedAt:
            template.updatedAt,
        },
      });
    },
  );
