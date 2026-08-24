import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { CreateQuotationRevisionUseCase } from "@/src/application/quotation";
import { PrismaQuotationRevisionRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRevisionRepository";
import { serializeQuotation } from "../../serialize-quotation";

export const runtime = "nodejs";

const repository = new PrismaQuotationRevisionRepository();
const createRevision = new CreateQuotationRevisionUseCase(repository);

function quotationIdFrom(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const revisionsIndex = segments.lastIndexOf("revisions");
  const id = revisionsIndex > 0 ? segments[revisionsIndex - 1] : undefined;
  if (!id || id === "quotations") {
    throw ApiError.badRequest("QUOTATION_ID_REQUIRED", "quotationId is required.");
  }
  return decodeURIComponent(id);
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request, _auth, company) => {
    const history = await repository.findFamilyHistory(
      company.companyId,
      quotationIdFrom(request),
    );
    if (!history) throw ApiError.notFound("QUOTATION_NOT_FOUND", "Quotation not found.");
    return apiSuccess(history.map((quotation) => serializeQuotation(quotation)), {
      headers: { "Cache-Control": "no-store" },
    });
  },
);

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, _auth, company) => {
    const result = await createRevision.execute({
      companyId: company.companyId,
      quotationId: quotationIdFrom(request),
    });
    if (!result.success) {
      if (result.error.code === "QUOTATION_NOT_FOUND") {
        throw ApiError.notFound(result.error.code, result.error.message);
      }
      throw ApiError.conflict(result.error.code, result.error.message);
    }
    return apiSuccess(serializeQuotation(result.data), { status: 201 });
  },
);
