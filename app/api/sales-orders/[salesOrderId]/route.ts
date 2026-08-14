import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from "@/lib/api";
import { GetSalesOrderUseCase } from "@/src/application/sales-order";
import { PrismaSalesOrderRepository } from "@/src/infrastructure/persistence/prisma/sales-order/PrismaSalesOrderRepository";
import { serializeSalesOrder } from "../serialize-sales-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getSalesOrder = new GetSalesOrderUseCase(
  new PrismaSalesOrderRepository(),
);

function getSalesOrderId(request: Request): string {
  const value = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
  if (!value || value === "sales-orders") {
    throw ApiError.badRequest(
      "SALES_ORDER_ID_REQUIRED",
      "salesOrderId is required.",
    );
  }
  return decodeURIComponent(value);
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request, _auth, company) => {
    const result = await getSalesOrder.execute({
      companyId: company.companyId,
      salesOrderId: getSalesOrderId(request),
    });

    if (!result.success) {
      throw ApiError.notFound(result.error.code, result.error.message);
    }

    const requestedLocale = new URL(request.url).searchParams.get("locale");
    const locale = requestedLocale === "ar" || requestedLocale === "en"
      ? requestedLocale
      : undefined;

    return apiSuccess(serializeSalesOrder(result.data, locale), {
      headers: { "Cache-Control": "no-store" },
    });
  },
);
