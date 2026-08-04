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
import { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";
import { PrismaQuotationReferenceValidator } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator";

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
      serializeQuotation(result.data),
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
};

export const PATCH = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, _auth, company) => {
    const quotationId = getQuotationId(request);
    const body =
      (await request.json()) as UpdateQuotationBody;

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

    const result = await updateQuotation.execute({
      companyId: company.companyId,
      quotationId,
      lines:
        body.lines as UpdateQuotationDto["lines"],
      discount:
        body.discount as UpdateQuotationDto["discount"],
      notes:
        typeof body.notes === "string"
          ? body.notes
          : null,
      termsAndConditions:
        typeof body.termsAndConditions === "string"
          ? body.termsAndConditions
          : null,
    });

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
