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
import { PrismaQuotationCustomerContactRepository } from "@/src/infrastructure/persistence/prisma/quotation-delivery/PrismaQuotationCustomerContactRepository";

import { QuotationLocalizationJobRunner } from "@/src/infrastructure/translation/quotation/QuotationLocalizationJobRunner";

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
const localizationJobRunner =
  new QuotationLocalizationJobRunner(quotationRepository);
const customerContacts = new PrismaQuotationCustomerContactRepository();


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

    const serialized = serializeQuotation(
        result.data,
        getRequestedLocale(request),
      );
    const liveContact = await customerContacts.find(
      company.companyId,
      result.data.customerId,
    );
    const snapshot = result.data.customer.toJSON();

    return apiSuccess(
      {
        ...serialized,
        customerProfile: liveContact ? {
          id: liveContact.customerId,
          email: liveContact.email,
          whatsapp: liveContact.whatsapp,
        } : null,
        deliveryContacts: {
          email: liveContact?.email
            ? { value: liveContact.email, source: "CUSTOMER", differsFromSnapshot: Boolean(snapshot.email && snapshot.email !== liveContact.email) }
            : snapshot.email
              ? { value: snapshot.email, source: "SNAPSHOT", differsFromSnapshot: false }
              : { value: null, source: "MISSING", differsFromSnapshot: false },
          whatsapp: liveContact?.whatsapp
            ? { value: liveContact.whatsapp, source: "CUSTOMER", differsFromSnapshot: Boolean(snapshot.phone && snapshot.phone !== liveContact.whatsapp) }
            : snapshot.phone
              ? { value: snapshot.phone, source: "SNAPSHOT", differsFromSnapshot: false }
              : { value: null, source: "MISSING", differsFromSnapshot: false },
        },
      },
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
  expiryDate?: unknown;
  taxRateRefreshLineIds?: unknown;
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

function parseOptionalDate(
  value: unknown,
  field: string,
): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw ApiError.badRequest(
      "INVALID_DATE",
      `${field} must be a valid ISO date string.`,
      { field },
    );
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw ApiError.badRequest(
      "INVALID_DATE",
      `${field} must be a valid ISO date string.`,
      { field },
    );
  }

  return date;
}

function parseTaxRateRefreshLineIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !id.trim())) {
    throw ApiError.badRequest(
      "INVALID_TAX_RATE_REFRESH_LINES",
      "taxRateRefreshLineIds must contain valid quotation line IDs.",
      { field: "taxRateRefreshLineIds" },
    );
  }
  return [...new Set(value.map((id) => (id as string).trim()))];
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

    const expiryDate = parseOptionalDate(
      body.expiryDate,
      "expiryDate",
    );
    const taxRateRefreshLineIds = parseTaxRateRefreshLineIds(
      body.taxRateRefreshLineIds,
    );

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
      expiryDate,
      taxRateRefreshLineIds,
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

    after(() => localizationJobRunner.run({
      companyId: company.companyId,
      quotationId,
    }));



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
