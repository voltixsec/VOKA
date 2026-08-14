import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";
import { ConvertApprovedQuotationToSalesOrderUseCase } from "@/src/application/sales-order";
import { PrismaSalesOrderRepository } from "@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository";
import { serializeSalesOrder } from "../../../sales-orders/serialize-sales-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const convertQuotation = new ConvertApprovedQuotationToSalesOrderUseCase(
  new PrismaSalesOrderRepository(),
);

function getQuotationId(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const value = segments.at(-2);
  if (!value) {
    throw ApiError.badRequest(
      "QUOTATION_ID_REQUIRED",
      "quotationId is required.",
    );
  }
  return decodeURIComponent(value);
}

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request, auth, company) => {
    const result = await convertQuotation.execute({
      companyId: company.companyId,
      quotationId: getQuotationId(request),
      createdByUserId: auth.user.id,
      createdByName: auth.user.name?.trim() || auth.user.email,
      createdByRole: company.role,
    });

    if (!result.success) {
      if (result.error.code === "QUOTATION_NOT_FOUND") {
        throw ApiError.notFound(result.error.code, result.error.message);
      }
      throw ApiError.conflict(result.error.code, result.error.message);
    }

    const salesOrderId = result.data.salesOrder.id;
    if (!salesOrderId) {
      throw ApiError.internal(
        "The persisted Sales Order did not return a valid identifier.",
      );
    }

    return apiSuccess(
      {
        created: result.data.created,
        salesOrderId,
        salesOrder: serializeSalesOrder(result.data.salesOrder),
      },
      {
        status: result.data.created ? 201 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  },
);
